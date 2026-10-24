(function (root, factory) {
  const node = typeof module === 'object' && module.exports;
  const api = factory(node ? require('./engine-observability.js') : root.SimulatteSystemDiagramObservability, node ? require('./engine-network.js') : root.SimulatteSystemDiagramNetwork);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SimulatteSystemDiagramEngineCore = api;
})(globalThis, function (observability, network) {
  'use strict';
  // Event heap, RNG streams, network, stations, calls, faults, metrics and the kernel ctx.
  // State is plain JSON: records reference each other by id, never by object identity,
  // so a JSON clone of the state runs exactly like the original.
  const STATE_SCHEMA = 'simulatte.systemDiagramState.v1';
  const CONTRACT = 'system-diagram-engine';
  const MS_PER_SEC = 1000;
  const KBIT_PER_KB = 8;
  const KBIT_PER_MBIT = 1000;
  const UINT32 = 4294967296;
  const RATE_WINDOW_SEC = 5;
  const LATENCY_WINDOW_SEC = 10;
  const WINDOW_BUCKET_SEC = 1;
  const WINDOW_BUCKETS = Math.ceil(RATE_WINDOW_SEC / WINDOW_BUCKET_SEC) + 1;
  const HEAP_COMPACT_MIN = 128;
  const UTILIZATION_TAU_SEC = 2;
  const LOG_THROTTLE_SEC = 1;
  const MAX_EFFECT_KEYS = 4096;
  const QUEUE_COMPACT_MIN = 64;
  const POISSON_NORMAL_MIN = 30;
  const ZERO_SEED = 0x9e3779b9;
  const NON_RETRIABLE = Object.freeze(['invalid', 'hop-limit']);
  const REFUSALS = Object.freeze(['rejected', 'rate-limited']);
  const SERVICE_DISTS = Object.freeze(['constant', 'exponential', 'lognormal']);
  const MESSAGE_KEYS = Object.freeze(['id', 'trace', 'attempt', 'delivery', 'ptype', 'kb', 'tokens', 'key', 'op', 'born', 'deadline', 'idem', 'hops', 'fields']);
  const PATCH_KEYS = new Set(MESSAGE_KEYS.filter(key => key !== 'id' && key !== 'trace'));
  const REPLY_KEYS = new Set(['ok', 'err', 'kb', 'ptype', 'tokens', 'fields']);
  const CALL_KEYS = new Set(['timeoutMs', 'retries', 'backoffMs', 'multiplier', 'jitter', 'slot', 'async', 'idemPerAttempt', 'retryOf', 'retry']);
  class EngineError extends Error {
    constructor(path, expected, received) {
      super(`${CONTRACT} ${path}: expected ${expected}, received ${describe(received)}`);
      this.name = 'SimulatteSystemDiagramEngineError';
      this.contract = CONTRACT; this.path = path; this.expected = expected; this.received = received;
    }
  }
  function describe(value) {
    if (value === undefined) return 'undefined';
    try { const text = JSON.stringify(value); return text.length > 80 ? `${text.slice(0, 77)}...` : text; } catch { return String(value); }
  }
  const fail = (path, expected, received) => { throw new EngineError(path, expected, received); };
  const isRecord = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  // ---- Event heap ordered by (time, sequence) ----
  function before(a, b) { return a.t < b.t || (a.t === b.t && a.s < b.s); }
  function heapPush(heap, ev) {
    heap.push(ev);
    let i = heap.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!before(heap[i], heap[parent])) break;
      const tmp = heap[i]; heap[i] = heap[parent]; heap[parent] = tmp; i = parent;
    }
  }
  function heapPop(heap) {
    const top = heap[0], last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < heap.length && before(heap[l], heap[m])) m = l;
        if (r < heap.length && before(heap[r], heap[m])) m = r;
        if (m === i) break;
        const tmp = heap[i]; heap[i] = heap[m]; heap[m] = tmp; i = m;
      }
    }
    return top;
  }
  function schedule(R, t, ev) {
    if (!Number.isFinite(t) || t < R.s.t) fail(`event ${ev.k}`, `finite time >= ${R.s.t}`, t);
    ev.t = t; ev.s = ++R.s.seq;
    heapPush(R.s.heap, ev);
  }
  // ---- Seeded xorshift32 streams, one per node or edge id ----
  function seedFor(seed, id) {
    const text = `${seed}:${id}`;
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return (h >>> 0) || ZERO_SEED;
  }
  function rand(R, id) {
    let x = R.s.rng[id]; if (x === undefined) x = seedFor(R.c.seed, id);
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5; x >>>= 0;
    R.s.rng[id] = x;
    return x / UINT32;
  }
  function normal(R, id) { return Math.sqrt(-2 * Math.log(rand(R, id))) * Math.cos(2 * Math.PI * rand(R, id)); }
  function expDraw(R, id, mean) { return mean > 0 ? -mean * Math.log(rand(R, id)) : 0; }
  function lognormalDraw(R, id, mean, cv) {
    if (!(mean > 0)) return 0;
    if (!(cv > 0)) return mean;
    const s2 = Math.log(1 + cv * cv);
    return Math.exp(Math.log(mean) - s2 / 2 + Math.sqrt(s2) * normal(R, id));
  }
  function poissonDraw(R, id, mean) {
    if (!(mean > 0)) return 0;
    if (mean >= POISSON_NORMAL_MIN) return Math.max(0, Math.round(mean + Math.sqrt(mean) * normal(R, id)));
    const limit = Math.exp(-mean);
    let k = 0, p = 1;
    do { k++; p *= rand(R, id); } while (p > limit);
    return k - 1;
  }
  // Rejection-inversion sampling (Hormann and Derflinger) returns a rank in [1, n] in O(1).
  function zipfDraw(R, id, n, s) {
    if (!(n > 1)) return 1;
    if (!(s > 0)) return 1 + Math.floor(rand(R, id) * n);
    const helper1 = x => (Math.abs(x) > 1e-8 ? Math.log1p(x) / x : 1 - x / 2 + x * x / 3);
    const helper2 = x => (Math.abs(x) > 1e-8 ? Math.expm1(x) / x : 1 + x / 2 + x * x / 6);
    const h = x => Math.exp(-s * Math.log(x));
    const hIntegral = x => { const lx = Math.log(x); return helper2((1 - s) * lx) * lx; };
    const hInverse = x => { let t = x * (1 - s); if (t < -1) t = -1; return Math.exp(helper1(t) * x); };
    const x1 = hIntegral(1.5) - 1, xn = hIntegral(n + 0.5), sv = 2 - hInverse(hIntegral(2.5) - h(2));
    for (;;) {
      const u = xn + rand(R, id) * (x1 - xn), x = hInverse(u);
      let k = Math.floor(x + 0.5);
      if (k < 1) k = 1; else if (k > n) k = n;
      if (k - x <= sv || u >= hIntegral(k + 0.5) - h(k)) return k;
    }
  }
  function sampleService(R, id, meanMs, dist, cv) {
    if (!Number.isFinite(meanMs) || meanMs < 0) fail(`node ${id} serviceMs mean`, 'finite ms >= 0', meanMs);
    if (!SERVICE_DISTS.includes(dist)) fail(`node ${id} serviceMs dist`, SERVICE_DISTS.join('|'), dist);
    if (dist === 'constant') return meanMs;
    if (dist === 'exponential') return expDraw(R, id, meanMs);
    return lognormalDraw(R, id, meanMs, cv);
  }
  // ---- Runtime: per-call indices over a frozen compiled graph and a mutable state ----
  const STATIC = new WeakMap();
  function staticIndex(compiled) {
    let x = STATIC.get(compiled);
    if (x) return x;
    const groupOf = new Map();
    for (const group of compiled.groups) for (const id of group.nodeIds) groupOf.set(id, group.id);
    x = { nodes: new Map(compiled.nodes.map(n => [n.id, n])), edges: new Map(compiled.edges.map(e => [e.id, e])), groups: new Map(compiled.groups.map(g => [g.id, g])), groupOf };
    STATIC.set(compiled, x);
    return x;
  }
  function runtime(compiled, state, deps, readonly = false) {
    const h = deps.config.engine.histogram;
    return {
      resourceOps: { schedule: (t, ev) => schedule(runtime(compiled, state, deps), t, ev), params: id => ({ ...compiled.nodes.find(n => n.id === id).params, ...state.ov[id] }), down: id => nodeFault(runtime(compiled, state, deps), id).down },
      c: compiled, s: state, deps, x: staticIndex(compiled), eng: deps.config.engine, readonly,
      hist: { min: h.minMs, bins: h.bins, lr: Math.log(h.maxMs / h.minMs) / h.bins },
      errorCodes: new Set(deps.library.errorCodes),
      kernels: new Map(), effects: new Map(), params: new Map(), edgeParams: new Map(), edgeViews: new Map(), ctxs: new Map(), faultIndex: null, nodeFaults: new Map(),
    };
  }
  function kernelOf(R, id) {
    let kernel = R.kernels.get(id);
    if (kernel) return kernel;
    const node = R.x.nodes.get(id);
    if (!node) fail('node', 'compiled node id', id);
    if (!R.deps.kernels.has(node.kernel)) fail(`node ${id}.kernel`, 'a kernel registered through SimulatteSystemDiagramKernels.register (unregistered kernels fail closed)', node.kernel);
    kernel = R.deps.kernels.get(node.kernel);
    R.kernels.set(id, kernel);
    return kernel;
  }
  function nodeParams(R, id) {
    let p = R.params.get(id);
    if (p) return p;
    const base = R.x.nodes.get(id).params, ov = R.s.ov[id];
    p = ov ? Object.freeze({ ...base, ...ov }) : base;
    R.params.set(id, p);
    return p;
  }
  function edgeParams(R, id) {
    let p = R.edgeParams.get(id);
    if (p) return p;
    const base = R.x.edges.get(id).params, ov = R.s.ov[id];
    p = ov ? Object.freeze({ ...base, ...ov }) : base;
    R.edgeParams.set(id, p);
    return p;
  }
  function edgeView(R, id) {
    let view = R.edgeViews.get(id);
    if (view) return view;
    const edge = R.x.edges.get(id);
    if (!edge) fail('edge', 'compiled edge id', id);
    view = Object.freeze({ id, from: edge.from, fromPort: edge.fromPort, to: edge.to, toPort: edge.toPort, params: edgeParams(R, id) });
    R.edgeViews.set(id, view);
    return view;
  }
  function edgesOf(R, id, portId) {
    const ids = R.x.nodes.get(id).out[portId];
    if (!ids) fail(`node ${id} ctx.edges`, `an out port of kernel ${R.x.nodes.get(id).kernel}`, portId);
    const views = ids.map(edgeId => edgeView(R, edgeId));
    if (views.some(view => R.s.ov[view.id] && Object.hasOwn(R.s.ov[view.id], 'order'))) views.sort((a, b) => a.params.order - b.params.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return views;
  }
  function invalidateParams(R, id) { R.params.delete(id); R.edgeParams.delete(id); R.edgeViews.delete(id); }
  // ---- Faults ----
  function faultIndex(R) {
    if (R.faultIndex) return R.faultIndex;
    const nodes = new Map(), edges = new Map();
    const add = (map, id, row) => { const list = map.get(id); if (list) list.push(row); else map.set(id, [row]); };
    for (const fault of R.s.faults) {
      if (fault.target.kind === 'node') add(nodes, fault.target.id, fault);
      else if (fault.target.kind === 'edge') add(edges, fault.target.id, fault);
      else if (fault.type === 'outage') for (const id of R.x.groups.get(fault.target.id).nodeIds) add(nodes, id, fault);
    }
    R.faultIndex = { nodes, edges };
    return R.faultIndex;
  }
  function invalidateFaults(R) { R.faultIndex = null; R.nodeFaults.clear(); }
  function nodeFault(R, id) {
    let f = R.nodeFaults.get(id);
    if (f) return f;
    const rows = faultIndex(R).nodes.get(id) || [];
    let down = false, slowFactor = 1, errorRate = 0, blackhole = false, dropReplies = false;
    for (const row of rows) {
      if (row.type === 'crash' || row.type === 'outage') down = true;
      else if (row.type === 'slow') slowFactor *= row.params.factor;
      else if (row.type === 'errors') errorRate = Math.max(errorRate, row.params.rate);
      else if (row.type === 'blackhole') blackhole = true;
      else if (row.type === 'dropReplies') dropReplies = true;
    }
    f = Object.freeze({ down, slowFactor, errorRate, blackhole, dropReplies });
    R.nodeFaults.set(id, f);
    return f;
  }
  function edgeFault(R, id) {
    const rows = faultIndex(R).edges.get(id);
    let partition = false, addLatencyMs = 0, keep = 1;
    if (rows) for (const row of rows) {
      if (row.type === 'partition') partition = true;
      else if (row.type === 'degrade') { addLatencyMs += row.params.addLatencyMs; keep *= 1 - row.params.lossRate; }
    }
    return { partition, addLatencyMs, lossRate: 1 - keep };
  }
  function faultTypesOn(R, kind, id) {
    const index = faultIndex(R);
    const rows = (kind === 'node' ? index.nodes : index.edges).get(id) || [];
    return [...new Set(rows.map(row => row.type))];
  }
  function affectedNodes(R, target) {
    if (target.kind === 'node') return [target.id];
    if (target.kind === 'group') return [...R.x.groups.get(target.id).nodeIds];
    return [];
  }
  // Group outages reach kernels as crashes of each member so kernels need one crash path.
  function faultFor(fault, nodeId) {
    if (fault.target.kind !== 'group') return { id: fault.id, type: fault.type, params: { ...fault.params }, target: { ...fault.target } };
    return { id: fault.id, type: 'crash', params: {}, target: { kind: 'node', id: nodeId }, via: { kind: 'group', id: fault.target.id, type: fault.type } };
  }
  function injectFault(R, fault) {
    const nodes = affectedNodes(R, fault.target);
    const prior = nodes.map(id => nodeFault(R, id));
    R.s.faults.push(fault); observability.fault(R, fault, true);
    invalidateFaults(R); if (fault.target.kind === 'edge') network.update(R, fault.target.id, networkOps(R));
    log(R, 'fault', `${fault.type} on ${fault.target.kind} ${fault.target.id}`, refFor(fault.target));
    nodes.forEach((id, i) => {
      const now = nodeFault(R, id);
      if (!prior[i].down && now.down) crashNode(R, id);
      else if (prior[i].slowFactor !== now.slowFactor) restation(R, id);
    });
    for (const id of nodes) callHook(R, id, 'onFault', faultFor(fault, id), true);
  }
  function clearFault(R, faultId, reason) {
    const index = R.s.faults.findIndex(row => row.id === faultId);
    if (index < 0) return false;
    const fault = R.s.faults[index], nodes = affectedNodes(R, fault.target);
    const prior = nodes.map(id => nodeFault(R, id));
    R.s.faults.splice(index, 1); observability.fault(R, fault, false);
    invalidateFaults(R); if (fault.target.kind === 'edge') network.update(R, fault.target.id, networkOps(R));
    log(R, 'repair', `${fault.type} on ${fault.target.kind} ${fault.target.id} cleared (${reason})`, refFor(fault.target));
    nodes.forEach((id, i) => {
      const now = nodeFault(R, id);
      if (prior[i].down && !now.down) unpark(R, id);
      else if (!now.down && prior[i].slowFactor !== now.slowFactor) restation(R, id);
    });
    for (const id of nodes) callHook(R, id, 'onFault', faultFor(fault, id), false);
    return true;
  }
  function repairTarget(R, target) {
    const ids = R.s.faults.filter(row => row.target.kind === target.kind && row.target.id === target.id).map(row => row.id);
    for (const id of ids) clearFault(R, id, 'repair');
    return ids.length;
  }
  function refFor(target) { return target.kind === 'node' ? { nodeId: target.id } : target.kind === 'edge' ? { edgeId: target.id } : {}; }
  // Crash refuses arrivals and resets in-flight work: every job replies 'down', calls and open requests end.
  function crashNode(R, id) {
    const s = R.s; observability.clearSlots(R, id); if (observability.group(R, id)?.kind === 'resource') schedule(R, s.t, { k: 'rsrc', n: id });
    for (const jobId of Object.keys(s.jobs)) {
      const rec = s.jobs[jobId];
      if (rec.nodeId !== id) continue;
      if (rec.from) sendReply(R, id, rec.from, rec.msg, { ok: false, err: 'down', kb: 0 }, true);
      finishJob(R, rec, false, 'down');
    }
    const st = s.st[id];
    if (st) { touch(R, id); st.busy = []; st.q = []; st.qh = 0; }
    for (const callId of Object.keys(s.calls)) if (s.calls[callId].nodeId === id) delete s.calls[callId];
    for (const trace of Object.keys(s.open)) if (s.open[trace].nodeId === id) endOpen(R, trace, false, 'down'); observability.crashMemory(R, id);
  }
  function unpark(R, id) {
    const keep = [], due = [];
    for (const row of R.s.parked) (row.n === id ? due : keep).push(row);
    R.s.parked = keep;
    for (const row of due) schedule(R, R.s.t, { k: 'wake', n: id, p: row.p });
  }
  // ---- Logging, windows, histograms and series ----
  function log(R, kind, message, ref = {}, throttle = false) {
    const s = R.s;
    if (throttle) {
      const key = `${ref.nodeId || ref.edgeId || ''}|${kind}`, last = s.throttle[key];
      if (last !== undefined && s.t - last < LOG_THROTTLE_SEC) return;
      s.throttle[key] = s.t;
    }
    const row = { seq: ++s.logSeq, t: s.t, kind, message: String(message) };
    if (ref.nodeId) row.nodeId = ref.nodeId;
    if (ref.edgeId) row.edgeId = ref.edgeId;
    s.log.push(row);
    if (s.log.length > R.eng.logCapacity) s.log.shift();
  }
  function newWindow(slots) { return { b: 0, c: Array.from({ length: slots }, () => new Array(WINDOW_BUCKETS).fill(0)) }; }
  function bumpWindow(win, t, slot, n) {
    const i = Math.floor(t / WINDOW_BUCKET_SEC);
    if (i > win.b) {
      const gap = Math.min(i - win.b, WINDOW_BUCKETS);
      for (let d = 1; d <= gap; d++) for (const row of win.c) row[(win.b + d) % WINDOW_BUCKETS] = 0;
      win.b = i;
    }
    win.c[slot][i % WINDOW_BUCKETS] += n;
  }
  // A window covers whole buckets from the one containing t - RATE_WINDOW_SEC up to t; rates divide by that span.
  function windowStart(t, bucketSec) { return Math.max(0, Math.floor((t - RATE_WINDOW_SEC) / bucketSec)); }
  function windowSpan(t, bucketSec = WINDOW_BUCKET_SEC) { return Math.max(bucketSec, t - windowStart(t, bucketSec) * bucketSec); }
  function windowSum(win, t, slot) {
    const i = Math.floor(t / WINDOW_BUCKET_SEC);
    let sum = 0;
    for (let j = Math.max(windowStart(t, WINDOW_BUCKET_SEC), win.b - WINDOW_BUCKETS + 1); j <= Math.min(i, win.b); j++) sum += win.c[slot][j % WINDOW_BUCKETS];
    return sum;
  }
  function newHist() { return { n: 0, sum: 0, b: {} }; }
  function binOf(R, ms) { return ms <= R.hist.min ? 0 : Math.min(R.hist.bins - 1, Math.floor(Math.log(ms / R.hist.min) / R.hist.lr)); }
  function binValue(R, i) { return R.hist.min * Math.exp((i + 0.5) * R.hist.lr); }
  function histAdd(R, h, ms) { const i = binOf(R, ms); h.b[i] = (h.b[i] || 0) + 1; h.n++; h.sum += ms; }
  function histMerge(into, h) { for (const key in h.b) into.b[key] = (into.b[key] || 0) + h.b[key]; into.n += h.n; into.sum += h.sum; return into; }
  // Integer-like keys enumerate in ascending order, so the walk is ordered after any JSON clone.
  function percentile(R, h, q) {
    if (!h.n) return null;
    const rank = Math.max(1, Math.ceil(q * h.n));
    let acc = 0;
    for (const key in h.b) { acc += h.b[key]; if (acc >= rank) return binValue(R, Number(key)); }
    return binValue(R, R.hist.bins - 1);
  }
  function seriesSize(R) { return Math.ceil(R.eng.seriesWindowSec / R.eng.seriesBucketSec); }
  function latencyBuckets(R) { return Math.ceil(LATENCY_WINDOW_SEC / R.eng.seriesBucketSec); }
  function seriesIndex(R, t) { return Math.floor(t / R.eng.seriesBucketSec); }
  function rollSeries(R, i) {
    const ser = R.s.series, size = seriesSize(R);
    const last = ser.b0 + ser.offered.length - 1;
    if (i > last) {
      const lw = ser.lw.find(row => row.i === last);
      ser.p95[last - ser.b0] = lw ? percentile(R, lw, 0.95) : null;
      if (i - last >= size) { ser.b0 = i; ser.offered = [0]; ser.completed = [0]; ser.failed = [0]; ser.p95 = [null]; }
      else {
        for (let j = last + 1; j <= i; j++) { ser.offered.push(0); ser.completed.push(0); ser.failed.push(0); ser.p95.push(null); }
        const extra = ser.offered.length - size;
        if (extra > 0) { ser.offered.splice(0, extra); ser.completed.splice(0, extra); ser.failed.splice(0, extra); ser.p95.splice(0, extra); ser.b0 += extra; }
      }
      const keepFrom = i - latencyBuckets(R) + 1;
      ser.lw = ser.lw.filter(row => row.i >= keepFrom);
    }
    return i - ser.b0;
  }
  function seriesBump(R, field, n) { const at = rollSeries(R, seriesIndex(R, R.s.t)); R.s.series[field][at] += n; }
  function seriesLatency(R, ms) {
    const i = seriesIndex(R, R.s.t), ser = R.s.series;
    rollSeries(R, i);
    let row = ser.lw[ser.lw.length - 1];
    if (!row || row.i !== i) { row = { i, n: 0, sum: 0, b: {} }; ser.lw.push(row); }
    histAdd(R, row, ms);
  }
  // ---- Messages, jobs and logical requests ----
  function applyPatch(m, patch, path) {
    if (!isRecord(patch)) fail(path, 'message patch object', patch);
    for (const key in patch) {
      if (!PATCH_KEYS.has(key)) fail(`${path}.${key}`, `message field ${[...PATCH_KEYS].join('|')}`, key);
      if (patch[key] === undefined) continue;
      if (key === 'fields') { if (!isRecord(patch.fields)) fail(`${path}.fields`, 'object', patch.fields); Object.assign(m.fields, patch.fields); }
      else m[key] = patch[key];
    }
    return m;
  }
  function makeMessage(R, fields) {
    if (!isRecord(fields) || typeof fields.ptype !== 'string' || !fields.ptype) fail('ctx.message', 'fields with a payload type ptype', fields);
    const s = R.s, trace = `r${++s.ids.r}`;
    const m = { id: `m${++s.ids.m}`, trace, attempt: 1, delivery: 0, ptype: fields.ptype, kb: 0, tokens: 0, key: null, op: 'read', born: s.t, deadline: null, idem: trace, hops: 0, fields: {} };
    return applyPatch(m, fields, 'ctx.message');
  }
  // Explicit field copy keeps message objects monomorphic on the hot path.
  function copyMessage(R, msg) {
    const fields = {};
    if (isRecord(msg.fields)) for (const key in msg.fields) fields[key] = msg.fields[key];
    return { id: `m${++R.s.ids.m}`, trace: msg.trace, attempt: msg.attempt, delivery: msg.delivery, ptype: msg.ptype, kb: msg.kb, tokens: msg.tokens, key: msg.key, op: msg.op, born: msg.born, deadline: msg.deadline, idem: msg.idem, hops: msg.hops, fields };
  }
  function derive(R, msg, patch) {
    if (!isRecord(msg) || typeof msg.trace !== 'string') fail('ctx.derive', 'message with a trace', msg);
    const m = copyMessage(R, msg);
    return patch ? applyPatch(m, patch, 'message patch') : m;
  }
  function jobView(rec) { return { id: rec.id, nodeId: rec.nodeId, msg: rec.msg, from: rec.from, arrivedAt: rec.arrivedAt }; }
  function newJob(R, nodeId, msg, from) {
    const s = R.s;
    const rec = { id: `j${++s.ids.j}`, nodeId, msg, from, arrivedAt: s.t, phase: 'new', work: 0, svc: null, gen: 0 };
    s.jobs[rec.id] = rec; s.live.jobs++; s.nodes[nodeId].live++; observability.jobCreated(R, rec, nodeParams(R, nodeId));
    return rec;
  }
  function finishJob(R, rec, ok, err) {
    const s = R.s, ns = s.nodes[rec.nodeId];
    if (ok) { ns.served++; histAdd(R, ns.lat, (s.t - rec.arrivedAt) * MS_PER_SEC); bumpWindow(ns.win, s.t, 0, 1); }
    else if (REFUSALS.includes(err)) ns.rejected++;
    else ns.errors++;
    observability.jobFinished(R, rec, ok, err); delete s.jobs[rec.id]; s.live.jobs--; ns.live--;
  }
  function beginOpen(R, nodeId, msg) {
    const s = R.s;
    if (!isRecord(msg) || typeof msg.trace !== 'string') fail(`node ${nodeId} ctx.beginRequest`, 'message with a trace', msg);
    if (s.open[msg.trace]) fail(`node ${nodeId} ctx.beginRequest`, 'a request that has not begun', msg.trace);
    s.open[msg.trace] = { nodeId, t0: s.t, deadline: Number.isFinite(msg.deadline) ? msg.deadline : null };
    s.g.offered++; observability.begin(R, nodeId, msg);
    seriesBump(R, 'offered', 1);
  }
  function endOpen(R, trace, ok, err) {
    const s = R.s, open = s.open[trace];
    if (!open) return false;
    observability.end(R, trace, ok, err); delete s.open[trace];
    if (ok) {
      const ms = (s.t - open.t0) * MS_PER_SEC;
      s.g.completed++; histAdd(R, s.g.lat, ms); seriesLatency(R, ms); seriesBump(R, 'completed', 1);
      if (open.deadline !== null && s.t > open.deadline) s.g.deadlineMisses++;
    } else {
      s.g.failed++; s.g.failedBy[err] = (s.g.failedBy[err] || 0) + 1; seriesBump(R, 'failed', 1);
    }
    return true;
  }
  function errorCode(R, path, err) {
    const code = err === undefined || err === null ? 'error' : err;
    if (!R.errorCodes.has(code)) fail(path, `library error code ${[...R.errorCodes].join('|')}`, err);
    return code;
  }
  // ---- Network: per-direction FIFO serialization, latency plus jitter, then loss ----
  function networkOps(R) { return { schedule: (t, ev) => schedule(R, t, ev), params: id => edgeParams(R, id), fault: id => edgeFault(R, id), rand: id => rand(R, id), error: es => bumpWindow(es.win, R.s.t, 1, 1) }; }
  function transmit(R, edgeId, dir, ev, kb) { return network.transmit(R, edgeId, dir, ev, kb, networkOps(R)); }
  function sendRequest(R, edgeId, msg, callId, attempt) {
    const s = R.s, es = s.edges[edgeId];
    es.sent++; bumpWindow(es.win, s.t, 0, 1); observability.attempt(R, callId ? s.calls[callId] : null, msg, edgeId, attempt, callId === null);
    if (!transmit(R, edgeId, 'f', { k: 'arr', n: R.x.edges.get(edgeId).to, c: callId, a: attempt, m: msg }, msg.kb)) { es.errors++; bumpWindow(es.win, s.t, 1, 1); }
  }
  function sendReply(R, nodeId, from, reqMsg, res, bypassFaults) {
    const s = R.s, f = nodeFault(R, nodeId);
    if (!bypassFaults && (f.blackhole || f.dropReplies)) { s.nodes[nodeId].lostReplies++; observability.note(R, 'reply-lost', { nodeId, message: reqMsg, detail: 'Processing finished but acknowledgement was lost' }); return; }
    const patch = {};
    for (const key of ['ptype', 'kb', 'tokens', 'fields']) if (res[key] !== undefined) patch[key] = res[key];
    const m = derive(R, reqMsg, patch), es = s.edges[from.edgeId];
    es.replies++;
    const sent = transmit(R, from.edgeId, 'b', { k: 'rep', n: from.nodeId, c: from.callId, a: from.attempt, ok: res.ok, err: res.ok ? null : res.err, m }, m.kb);
    if (!res.ok || !sent) { es.errors++; bumpWindow(es.win, s.t, 1, 1); }
  }
  function hopLimited(R, nodeId, edgeId, hops) {
    if (hops <= R.eng.maxHops) return false;
    R.s.nodes[nodeId].hopLimited++;
    log(R, 'hop-limit', `message exceeded ${R.eng.maxHops} hops on edge ${edgeId}`, { nodeId, edgeId }, true);
    return true;
  }
  function outEdge(R, nodeId, edgeId, path) {
    const edge = R.x.edges.get(edgeId);
    if (!edge || edge.from !== nodeId) fail(`node ${nodeId} ${path}`, `an out edge of node ${nodeId}`, edgeId);
    return edge;
  }
  function sendOneWay(R, nodeId, edgeId, msg) {
    outEdge(R, nodeId, edgeId, 'ctx.send');
    const m = derive(R, msg, null);
    m.hops = (Number.isInteger(msg.hops) ? msg.hops : 0) + 1;
    if (hopLimited(R, nodeId, edgeId, m.hops)) return false;
    sendRequest(R, edgeId, m, null, 1);
    return true;
  }
  // ---- Calls: attempts, timeouts, retries with backoff, late replies as wasted work ----
  function callNumber(nodeId, opts, key, min, fallback) {
    const value = opts[key] === undefined ? fallback : opts[key];
    if (!Number.isFinite(value) || value < min) fail(`node ${nodeId} ctx.call options.${key}`, `finite number >= ${min}`, value);
    return value;
  }
  // Kernel-level retries (retry policies, load balancers) declare prior attempts so they count as retries.
  function priorAttempts(nodeId, opts) {
    if (opts.retryOf !== undefined) return Math.floor(callNumber(nodeId, opts, 'retryOf', 0, 0));
    return opts.retry === true ? 1 : 0;
  }
  function checkCallOptions(nodeId, opts) {
    if (!isRecord(opts)) fail(`node ${nodeId} ctx.call options`, 'object', opts);
    for (const key in opts) if (!CALL_KEYS.has(key)) fail(`node ${nodeId} ctx.call options.${key}`, [...CALL_KEYS].join('|'), key);
  }
  function startCall(R, nodeId, rec, edgeId, patch, opts) {
    const s = R.s;
    outEdge(R, nodeId, edgeId, 'ctx.call');
    checkCallOptions(nodeId, opts);
    const ep = edgeParams(R, edgeId);
    const msg = rec ? derive(R, rec.msg, patch || {}) : derive(R, patch, null);
    if (ep.op !== 'inherit') msg.op = ep.op;
    msg.hops = (rec ? rec.msg.hops : msg.hops) + 1;
    if (!Number.isInteger(msg.hops)) fail(`node ${nodeId} ctx.call`, 'message with integer hops', msg.hops);
    const retryOf = priorAttempts(nodeId, opts);
    if (opts.async || ep.mode === 'async') {
      if (hopLimited(R, nodeId, edgeId, msg.hops)) return null;
      s.g.attempts++;
      if (retryOf > 0) { s.g.retries++; msg.attempt = retryOf + 1; }
      sendRequest(R, edgeId, msg, null, 1);
      return null;
    }
    if (!Number.isFinite(opts.timeoutMs) || opts.timeoutMs <= 0) fail(`node ${nodeId} ctx.call options.timeoutMs`, 'positive timeout for a sync call', opts.timeoutMs);
    const call = {
      id: `c${++s.ids.c}`, nodeId, jobId: rec ? rec.id : null, edgeId, slot: opts.slot === undefined ? null : opts.slot, msg, attempt: 0, timeoutMs: opts.timeoutMs,
      retries: Math.floor(callNumber(nodeId, opts, 'retries', 0, 0)), backoffMs: callNumber(nodeId, opts, 'backoffMs', 0, 0), multiplier: callNumber(nodeId, opts, 'multiplier', 1, 1),
      jitter: Boolean(opts.jitter), idemPerAttempt: Boolean(opts.idemPerAttempt), retryOf, bypass: false, t0: s.t, waiting: false,
    };
    s.calls[call.id] = call;
    if (hopLimited(R, nodeId, edgeId, msg.hops)) { call.attempt = 1; schedule(R, s.t, { k: 'fail', c: call.id, a: 1, err: 'hop-limit' }); }
    else sendAttempt(R, call);
    return call.id;
  }
  // Settled calls leave their timeout events behind; rebuild the heap once they dominate it.
  function staleTimer(R) {
    const s = R.s;
    if (++s.stale < HEAP_COMPACT_MIN || s.stale * 2 < s.heap.length) return;
    const keep = s.heap.filter(ev => ev.k !== 'tmo' || (s.calls[ev.c] && s.calls[ev.c].attempt === ev.a && !s.calls[ev.c].waiting));
    keep.sort((a, b) => a.t - b.t || a.s - b.s);
    s.heap = keep; s.stale = 0;
  }
  function sendAttempt(R, call) {
    const s = R.s;
    call.attempt++; call.waiting = false;
    const m = copyMessage(R, call.msg);
    m.attempt = call.retryOf + call.attempt;
    if (call.idemPerAttempt) m.idem = `${m.trace}:${m.attempt}`;
    s.g.attempts++;
    if (m.attempt > 1) s.g.retries++;
    sendRequest(R, call.edgeId, m, call.id, call.attempt);
    schedule(R, s.t + call.timeoutMs / MS_PER_SEC, { k: 'tmo', c: call.id, a: call.attempt });
  }
  function attemptFailed(R, call, err, msg) {
    observability.attemptEnded(R, call.id, call.attempt, false, err, msg || call.msg);
    if (call.attempt <= call.retries && !NON_RETRIABLE.includes(err)) {
      let delayMs = call.backoffMs * call.multiplier ** (call.attempt - 1);
      if (call.jitter && delayMs > 0) delayMs = rand(R, `${call.nodeId}:retry`) * delayMs;
      call.waiting = true;
      staleTimer(R);
      schedule(R, R.s.t + delayMs / MS_PER_SEC, { k: 'rty', c: call.id });
      return;
    }
    finishCall(R, call, false, err, msg);
  }
  function finishCall(R, call, ok, err, msg) {
    const s = R.s; observability.attemptEnded(R, call.id, call.attempt, ok, err, msg || call.msg);
    delete s.calls[call.id];
    staleTimer(R);
    let job = null;
    if (call.jobId !== null) {
      const rec = s.jobs[call.jobId];
      if (!rec) return;
      if (call.bypass) { relayResult(R, rec, ok, err, msg); return; }
      job = jobView(rec);
    }
    if (!kernelOf(R, call.nodeId).onResult) fail(`node ${call.nodeId} kernel ${R.x.nodes.get(call.nodeId).kernel}`, 'an onResult hook for its sync ctx.call', 'missing onResult');
    callHook(R, call.nodeId, 'onResult', job, call.slot, { ok, err: ok ? null : err, msg: msg || null, latencyMs: (s.t - call.t0) * MS_PER_SEC, attempts: call.attempt });
  }
  // ---- Down bypass: a crashed node whose kernel declares bypass forwards arrivals and relays replies ----
  function bypassEdge(R, nodeId, f) {
    const spec = kernelOf(R, nodeId).bypass;
    if (!spec || !f.down || f.blackhole || nodeParams(R, nodeId)[spec.param] !== true) return null;
    const edges = R.x.nodes.get(nodeId).out[spec.port];
    return edges && edges.length ? edges[0] : null;
  }
  function bypass(R, nodeId, edgeId, ev, from) {
    const s = R.s, caller = from ? s.calls[from.callId] : null;
    s.nodes[nodeId].bypassed++;
    if (!from) { sendOneWay(R, nodeId, edgeId, ev.m); return; }
    const rec = newJob(R, nodeId, ev.m, from);
    rec.phase = 'free';
    if (!caller) { doReply(R, rec, { ok: false, err: 'down', kb: 0 }); return; }
    const callId = startCall(R, nodeId, rec, edgeId, {}, { timeoutMs: caller.timeoutMs });
    if (callId === null) doReply(R, rec, { ok: true, kb: 0 });
    else s.calls[callId].bypass = true;
  }
  function relayResult(R, rec, ok, err, msg) {
    if (!ok) { doReply(R, rec, { ok: false, err }); return; }
    doReply(R, rec, { ok: true, kb: msg ? msg.kb : 0, ptype: msg ? msg.ptype : undefined, tokens: msg ? msg.tokens : undefined, fields: msg ? msg.fields : undefined });
  }
  // ---- Stations: FCFS queue, workers, utilization and generation-fenced completions ----
  function stationSpec(R, id) { return kernelOf(R, id).station || null; }
  function stationCapacity(R, id) { return nodeParams(R, id)[stationSpec(R, id).concurrency]; }
  function stationQueueCapacity(R, id) { return nodeParams(R, id)[stationSpec(R, id).queueCapacity]; }
  function queueLength(st) { return st.q.length - st.qh; }
  function touch(R, id) {
    const st = R.s.st[id], dt = R.s.t - st.lt;
    if (dt > 0) {
      const active = Math.min(st.busy.length, st.cap), a = Math.exp(-dt / UTILIZATION_TAU_SEC);
      st.u = st.u * a + (active / st.cap) * (1 - a);
      st.area += active * dt;
      st.lt = R.s.t;
    }
  }
  function utilization(R, id) {
    const st = R.s.st[id], dt = R.s.t - st.lt;
    return dt > 0 ? st.u * Math.exp(-dt / UTILIZATION_TAU_SEC) + (Math.min(st.busy.length, st.cap) / st.cap) * (1 - Math.exp(-dt / UTILIZATION_TAU_SEC)) : st.u;
  }
  // Workers share speed when live capacity drops below the jobs already holding workers.
  function serviceRate(R, id) {
    const st = R.s.st[id];
    return (st.busy.length > st.cap ? st.cap / st.busy.length : 1) / (nodeFault(R, id).slowFactor * observability.memoryFactor(R, id));
  }
  function startService(R, id, rec) {
    const s = R.s, st = s.st[id];
    touch(R, id);
    st.busy.push(rec.id);
    rec.phase = 'service'; rec.gen++;
    const r = serviceRate(R, id);
    rec.svc = { w: rec.work, r, ts: s.t, g: rec.gen };
    if (r > 0) schedule(R, s.t + rec.work / r / MS_PER_SEC, { k: 'done', n: id, j: rec.id, g: rec.gen });
  }
  function restation(R, id) {
    const s = R.s, st = s.st[id];
    if (!st) return;
    const r = serviceRate(R, id);
    for (const jobId of st.busy) {
      const rec = s.jobs[jobId];
      if (!rec || !rec.svc || rec.svc.r === r) continue;
      rec.svc.w = Math.max(0, rec.svc.w - (s.t - rec.svc.ts) * MS_PER_SEC * rec.svc.r);
      rec.svc.ts = s.t; rec.svc.r = r; rec.gen++; rec.svc.g = rec.gen;
      if (r > 0) schedule(R, s.t + rec.svc.w / r / MS_PER_SEC, { k: 'done', n: id, j: rec.id, g: rec.gen });
    }
  }
  function fill(R, id) {
    const s = R.s, st = s.st[id];
    while (st.busy.length < st.cap && st.qh < st.q.length && observability.available(R, id)) {
      const rec = s.jobs[st.q[st.qh++]];
      if (rec) startService(R, id, rec);
    }
    if (st.qh >= QUEUE_COMPACT_MIN && st.qh * 2 >= st.q.length) { st.q = st.q.slice(st.qh); st.qh = 0; }
  }
  function resize(R, id) {
    const st = R.s.st[id];
    if (!st) return;
    touch(R, id);
    st.cap = stationCapacity(R, id);
    fill(R, id);
    restation(R, id);
  }
  function defaultServiceMs(R, id, msg) {
    const p = nodeParams(R, id);
    if (!Number.isFinite(p.serviceMs)) fail(`node ${id} ctx.admit`, 'a serviceMs argument or a serviceMs parameter', undefined);
    const mean = p.serviceMs + (Number.isFinite(p.perKbMs) && Number.isFinite(msg.kb) ? p.perKbMs * msg.kb : 0);
    return sampleService(R, id, mean, p.serviceDist, p.serviceCv) * nodeFault(R, id).slowFactor;
  }
  function admit(R, id, rec, ms) {
    const s = R.s, st = s.st[id];
    if (!st) fail(`node ${id} ctx.admit`, 'a kernel that declares a station', kernelOf(R, id).id);
    if (rec.phase === 'queued' || rec.phase === 'service') fail(`node ${id} ctx.admit`, 'a job that is not already queued or in service', rec.phase);
    if (rec.phase === 'held') releaseWorker(R, rec);
    const wall = ms === undefined ? defaultServiceMs(R, id, rec.msg) : ms;
    if (!Number.isFinite(wall) || wall < 0) fail(`node ${id} ctx.admit serviceMs`, 'finite ms >= 0', ms);
    rec.work = wall / nodeFault(R, id).slowFactor;
    if (st.busy.length < st.cap && queueLength(st) === 0 && observability.available(R, id)) startService(R, id, rec);
    else if (queueLength(st) < stationQueueCapacity(R, id)) { st.q.push(rec.id); rec.phase = 'queued'; }
    else { log(R, 'rejected', `station full at ${id}`, { nodeId: id }, true); doReply(R, rec, { ok: false, err: 'rejected' }); return false; }
    return true;
  }
  function releaseWorker(R, rec) {
    const st = R.s.st[rec.nodeId];
    if (st && rec.phase === 'queued') {
      const at = st.q.indexOf(rec.id, st.qh);
      if (at >= 0) st.q.splice(at, 1);
    } else if (st && (rec.phase === 'service' || rec.phase === 'held')) {
      touch(R, rec.nodeId);
      const over = st.busy.length > st.cap, at = st.busy.indexOf(rec.id);
      if (at >= 0) st.busy.splice(at, 1);
      rec.svc = null;
      fill(R, rec.nodeId);
      if (over) restation(R, rec.nodeId);
    }
    rec.phase = 'free'; const group = observability.group(R, rec.nodeId); if (group?.kind === 'resource') schedule(R, R.s.t, { k: 'rsrc', n: rec.nodeId });
  }
  function doReply(R, rec, res) {
    if (!isRecord(res) || typeof res.ok !== 'boolean') fail(`node ${rec.nodeId} ctx.reply`, '{ ok: boolean, err?, kb?, ptype?, tokens?, fields? }', res);
    for (const key in res) if (!REPLY_KEYS.has(key)) fail(`node ${rec.nodeId} ctx.reply.${key}`, [...REPLY_KEYS].join('|'), key);
    const err = res.ok ? null : errorCode(R, `node ${rec.nodeId} ctx.reply.err`, res.err);
    releaseWorker(R, rec);
    if (rec.from) {
      const kb = res.kb !== undefined ? res.kb : Number.isFinite(nodeParams(R, rec.nodeId).responseKb) ? nodeParams(R, rec.nodeId).responseKb : 0;
      sendReply(R, rec.nodeId, rec.from, rec.msg, { ...res, kb, err }, false);
    }
    finishJob(R, rec, res.ok, err);
  }
  // ---- Effects: write commits keyed by idempotency key with a bounded expiring memory ----
  // State holds the memory as one string of "key<TAB>commitMs(base 36)<LF>" entries, oldest first, so the
  // coordinator clones and hashes a single primitive; the runtime parses it once into a lookup index.
  function effectMemory(R, nodeId, ef) {
    let mem = R.effects.get(nodeId);
    if (mem) return mem;
    mem = { keys: [], times: [], index: new Map() };
    for (const line of ef.log.split('\n')) {
      if (!line) continue;
      const tab = line.lastIndexOf('\t');
      mem.index.set(line.slice(0, tab), ef.base + mem.keys.length);
      mem.keys.push(line.slice(0, tab)); mem.times.push(parseInt(line.slice(tab + 1), 36));
    }
    R.effects.set(nodeId, mem);
    return mem;
  }
  function dropOldestEffects(ef, mem, count) {
    let cut = 0;
    for (let i = 0; i < count; i++) cut = ef.log.indexOf('\n', cut) + 1;
    ef.log = ef.log.slice(cut);
    mem.keys.splice(0, count); mem.times.splice(0, count);
    ef.base += count;
  }
  function commitEffect(R, nodeId, key, opts) {
    const s = R.s;
    if (typeof key !== 'string' || !key || key.includes('\t') || key.includes('\n')) fail(`node ${nodeId} ctx.effect key`, 'non-empty idempotency key string without tab or newline', key);
    if (!isRecord(opts)) fail(`node ${nodeId} ctx.effect options`, '{ idempotent, windowSec }', opts);
    const windowSec = opts.windowSec;
    if (windowSec !== undefined && (!Number.isFinite(windowSec) || windowSec < 0)) fail(`node ${nodeId} ctx.effect windowSec`, 'finite seconds >= 0 or undefined', windowSec);
    const ef = s.effects[nodeId] || (s.effects[nodeId] = { base: 0, log: '' });
    const mem = effectMemory(R, nodeId, ef), nowMs = Math.round(s.t * MS_PER_SEC);
    if (windowSec !== undefined) {
      let expired = 0;
      while (expired < mem.times.length && mem.times[expired] < nowMs - windowSec * MS_PER_SEC) expired++;
      if (expired) dropOldestEffects(ef, mem, expired);
    }
    const at = mem.index.get(key), seen = at !== undefined && at >= ef.base;
    if (seen && opts.idempotent) return { duplicate: true, suppressed: true };
    s.g.effects++;
    if (seen) { s.g.duplicateEffects++; return { duplicate: true, suppressed: false }; }
    mem.index.set(key, ef.base + mem.keys.length);
    mem.keys.push(key); mem.times.push(nowMs);
    ef.log += `${key}\t${nowMs.toString(36)}\n`;
    if (mem.keys.length > MAX_EFFECT_KEYS) {
      dropOldestEffects(ef, mem, 1);
      s.nodes[nodeId].effectEvictions++;
      log(R, 'effect-memory', `idempotency memory at ${MAX_EFFECT_KEYS} keys evicted a key inside its window; older duplicates are no longer detected`, { nodeId }, true);
    }
    return { duplicate: false, suppressed: false };
  }
  // ---- Kernel ctx ----
  function callHook(R, nodeId, name, a, b, c) {
    const kernel = kernelOf(R, nodeId), fn = kernel[name];
    if (!fn) return undefined;
    const previousJob = R.currentJob, previousTrace = R.currentTrace; R.currentJob = a?.id ? R.s.jobs[a.id] : a?.job ? R.s.jobs[a.job] : null; R.currentTrace = R.currentJob?.msg.trace || previousTrace || R.s.kernel[nodeId]?.msgs?.[b]?.m.trace || null;
    try { const result = fn(ctxOf(R, nodeId), a, b, c); if (!R.readonly && name !== 'observe') observability.syncKernel(R, nodeId, nodeParams(R, nodeId)); return result; } catch (error) {
      if (error && error.systemDiagramHook) throw error;
      const wrapped = new Error(`${CONTRACT} node ${nodeId} kernel ${kernel.id}.${name} at t=${R.s.t}: ${error && error.message ? error.message : String(error)}`, { cause: error });
      wrapped.systemDiagramHook = true;
      throw wrapped;
    } finally { R.currentJob = previousJob; R.currentTrace = previousTrace; }
  }
  function ctxOf(R, id) {
    let ctx = R.ctxs.get(id);
    if (!ctx) { ctx = makeCtx(R, id); R.ctxs.set(id, ctx); }
    return ctx;
  }
  function makeCtx(R, id) {
    const node = R.x.nodes.get(id);
    const guard = name => { if (R.readonly) fail(`node ${id} ctx.${name}`, 'a read-only member during observe', name); };
    const live = (job, name) => {
      if (!isRecord(job) || typeof job.id !== 'string') fail(`node ${id} ctx.${name}`, 'a job from a kernel hook or ctx.newJob', job);
      const rec = R.s.jobs[job.id];
      if (rec && rec.nodeId !== id) fail(`node ${id} ctx.${name}`, `a job owned by node ${id}`, rec.nodeId);
      if (!rec) R.s.nodes[id].staleJobs++;
      return rec || null;
    };
    const num = (name, value, min) => { if (!Number.isFinite(value) || value < min) fail(`node ${id} ctx.${name}`, `finite number >= ${min}`, value); return value; };
    return Object.freeze({
      nodeId: id, node, horizonSec: R.c.horizonSec,
      get t() { return R.s.t; },
      get p() { return nodeParams(R, id); },
      get k() { return R.s.kernel[id]; },
      set k(value) { guard('k'); R.s.kernel[id] = value; },
      get fault() { return nodeFault(R, id); },
      rand() { guard('rand'); return rand(R, id); },
      exp(mean) { guard('exp'); return expDraw(R, id, mean); },
      lognormal(mean, cv) { guard('lognormal'); return lognormalDraw(R, id, mean, cv); },
      poisson(mean) { guard('poisson'); return poissonDraw(R, id, mean); },
      zipf(n, s) { guard('zipf'); return zipfDraw(R, id, n, s); },
      serviceMs(meanMs, dist, cv) { guard('serviceMs'); return sampleService(R, id, meanMs, dist, cv) * nodeFault(R, id).slowFactor; },
      admit(job, serviceMs) { guard('admit'); const rec = live(job, 'admit'); return rec ? admit(R, id, rec, serviceMs) : false; },
      release(job) { guard('release'); const rec = live(job, 'release'); if (rec) releaseWorker(R, rec); return Boolean(rec); },
      reply(job, res) { guard('reply'); const rec = live(job, 'reply'); if (rec) doReply(R, rec, res); return Boolean(rec); },
      call(job, edgeId, msgPatch, opts) {
        guard('call');
        const rec = job === null ? null : live(job, 'call');
        if (job !== null && !rec) return null;
        return startCall(R, id, rec, edgeId, msgPatch, opts === undefined ? {} : opts);
      },
      send(edgeId, msg) { guard('send'); return sendOneWay(R, id, edgeId, msg); },
      edges(portId) { return edgesOf(R, id, portId); },
      edge(edgeId) { return edgeView(R, edgeId); },
      edgeUsable(edgeId) { return !edgeFault(R, edgeId).partition; },
      newJob(msg) { guard('newJob'); const rec = newJob(R, id, derive(R, msg, null), null); if (rec.memoryRejected) { endOpen(R, rec.msg.trace, false, 'rejected'); finishJob(R, rec, false, 'rejected'); } return jobView(rec); },
      retain(key, msg, details) { guard('retain'); return observability.retain(R, id, key, msg, details); },
      releaseRetained(key) { guard('releaseRetained'); return observability.releaseRetained(R, id, key); },
      memoryFactor() { return observability.memoryFactor(R, id); },
      resizeMemory(job, residentMiB) { guard('resizeMemory'); const rec = live(job, 'resizeMemory'); return rec ? observability.resizeMemory(R, rec, residentMiB) : false; },
      resourceAvailable() { return observability.available(R, id); },
      acquireResource(key) { guard('acquireResource'); return observability.acquire(R, id, String(key)); },
      releaseResource(key) { guard('releaseResource'); observability.releaseSlot(R, id, String(key)); schedule(R, R.s.t, { k: 'rsrc', n: id }); },
      job(jobId) { const rec = R.s.jobs[jobId]; return rec && rec.nodeId === id ? jobView(rec) : null; },
      station() { const st = R.s.st[id]; return st ? { queue: queueLength(st), busy: st.busy.length, capacity: st.cap } : null; },
      message(fields) { guard('message'); return makeMessage(R, fields); },
      derive(msg, patch) { guard('derive'); return derive(R, msg, patch || null); },
      beginRequest(msg) { guard('beginRequest'); beginOpen(R, id, msg); },
      endRequest(msg, res) {
        guard('endRequest');
        if (!isRecord(res) || typeof res.ok !== 'boolean') fail(`node ${id} ctx.endRequest`, '{ ok: boolean, err? }', res);
        return endOpen(R, msg.trace, res.ok, res.ok ? null : errorCode(R, `node ${id} ctx.endRequest.err`, res.err));
      },
      effect(key, opts) { guard('effect'); const result = commitEffect(R, id, key, opts === undefined ? {} : opts); observability.effect(R, id, key, result); return result; },
      wake(delaySec, payload) { guard('wake'); schedule(R, R.s.t + num('wake delaySec', delaySec, 0), { k: 'wake', n: id, p: payload === undefined ? null : payload }); },
      count(key, n = 1) { guard('count'); const counts = R.s.nodes[id].counts; counts[key] = (counts[key] || 0) + num('count n', n, -Infinity); },
      latency(key, ms) { guard('latency'); const hists = R.s.nodes[id].hists; histAdd(R, hists[key] || (hists[key] = newHist()), num('latency ms', ms, 0)); },
      log(kind, message) { guard('log'); log(R, String(kind), message, { nodeId: id }, true); },
      cost(usd) { guard('cost'); R.s.g.cost += num('cost usd', usd, 0); },
    });
  }
  // ---- Event processing ----
  function arrive(R, ev) {
    const s = R.s;
    s.live.transit--;
    if (edgeFault(R, ev.e).partition) { s.edges[ev.e].dropped++; return; }
    const nodeId = ev.n, f = nodeFault(R, nodeId), ns = s.nodes[nodeId];
    const from = ev.c ? { edgeId: ev.e, callId: ev.c, attempt: ev.a, nodeId: R.x.edges.get(ev.e).from } : null;
    ns.arrivals++;
    const relay = f.down ? bypassEdge(R, nodeId, f) : null;
    if (relay) { bypass(R, nodeId, relay, ev, from); return; }
    if (f.down) { if (from) sendReply(R, nodeId, from, ev.m, { ok: false, err: 'down', kb: 0 }, true); ns.errors++; return; }
    if (f.blackhole) { ns.swallowed++; return; }
    const rec = newJob(R, nodeId, ev.m, from), kernel = kernelOf(R, nodeId); if (rec.memoryRejected) { doReply(R, rec, { ok: false, err: 'rejected', kb: 0 }); return; }
    if (kernel.onRequest) callHook(R, nodeId, 'onRequest', jobView(rec));
    else if (kernel.station) admit(R, nodeId, rec, undefined);
    else fail(`node ${nodeId} kernel ${kernel.id}`, 'an onRequest hook or a station', 'neither');
  }
  function replyArrive(R, ev) {
    const s = R.s;
    s.live.transit--;
    if (edgeFault(R, ev.e).partition) { s.edges[ev.e].dropped++; return; }
    const f = nodeFault(R, ev.n), call = s.calls[ev.c];
    if ((f.down && !(call && call.bypass)) || f.blackhole || !call || call.attempt !== ev.a || call.waiting) { s.g.wastedWork++; return; }
    if (ev.ok) finishCall(R, call, true, null, ev.m);
    else attemptFailed(R, call, ev.err, ev.m);
  }
  function served(R, ev) {
    const rec = R.s.jobs[ev.j];
    if (!rec || !rec.svc || rec.svc.g !== ev.g) return;
    rec.svc = null; rec.phase = 'held'; observability.note(R, 'service-finished', { nodeId: ev.n, job: rec });
    const f = nodeFault(R, ev.n);
    if (f.errorRate > 0 && rand(R, ev.n) < f.errorRate) { doReply(R, rec, { ok: false, err: 'error' }); return; }
    if (kernelOf(R, ev.n).onServed) callHook(R, ev.n, 'onServed', jobView(rec));
    else doReply(R, rec, { ok: true });
  }
  function dispatch(R, ev) {
    const s = R.s;
    switch (ev.k) {
      case 'net': network.process(R, ev, networkOps(R)); break;
      case 'mem': { const p = nodeParams(R, ev.n); if (ev.action === 'oom') { const fault = { id: `oom-${++s.ids.f}`, type: 'crash', params: {}, target: { kind: 'node', id: ev.n }, origin: 'memory' }; injectFault(R, fault); if (p.memoryOomRecoveryMs > 0) schedule(R, s.t + p.memoryOomRecoveryMs / 1000, { k: 'mem', n: ev.n, action: 'recover', f: fault.id }); } else if (ev.action === 'recover') clearFault(R, ev.f, 'OOM recovery policy'); else observability.memoryEvent(R, ev); restation(R, ev.n); callHook(R, ev.n, 'onResources'); break; }
      case 'rsrc': { const group = observability.group(R, ev.n); for (const id of group?.nodeIds || []) if (!nodeFault(R, id).down) { if (s.st[id]) fill(R, id); callHook(R, id, 'onResources'); } break; }
      case 'arr': arrive(R, ev); break;
      case 'rep': replyArrive(R, ev); break;
      case 'done': served(R, ev); break;
      case 'tmo': { const call = s.calls[ev.c]; if (call && call.attempt === ev.a && !call.waiting) attemptFailed(R, call, 'timeout', null); break; }
      case 'fail': { const call = s.calls[ev.c]; if (call && call.attempt === ev.a) attemptFailed(R, call, ev.err, null); break; }
      case 'rty': { const call = s.calls[ev.c]; if (call && call.waiting) sendAttempt(R, call); break; }
      case 'wake': if (nodeFault(R, ev.n).down) s.parked.push({ n: ev.n, p: ev.p }); else callHook(R, ev.n, 'onWake', ev.p); break;
      case 'flt': {
        const row = R.c.faults[ev.i];
        if (ev.on) injectFault(R, { id: row.id, type: row.type, params: { ...row.params }, target: { ...row.target }, origin: 'scheduled' });
        else clearFault(R, row.id, 'scheduled');
        break;
      }
      default: fail('event kind', 'arr|rep|done|tmo|fail|rty|wake|flt', ev.k);
    }
  }
  function checkBound(R) {
    const s = R.s, inFlight = s.live.jobs + s.live.transit;
    if (inFlight <= R.eng.maxInFlight || s.error) return;
    s.error = `maxInFlight bound: expected at most ${R.eng.maxInFlight} simultaneous messages and jobs (config.engine.maxInFlight), received ${inFlight} at t=${s.t.toFixed(3)} s; the run stopped instead of dropping work`;
    log(R, 'error', s.error);
  }
  function processUntil(R, toTime) {
    const s = R.s; let processed = 0, sameTime = 0, previousTime = null;
    while (!s.error && s.heap.length && s.heap[0].t <= toTime) {
      if (++processed > R.eng.maxEventsPerAdvance || (s.heap[0].t === previousTime && sameTime >= R.eng.maxSameTimeEvents)) { s.error = `Event budget exceeded at t=${s.t}; unfinished work and pending events are retained`; log(R, 'error', s.error); break; }
      const ev = heapPop(s.heap); sameTime = ev.t === previousTime ? sameTime + 1 : 1; previousTime = ev.t;
      s.t = ev.t;
      dispatch(R, ev);
      checkBound(R);
    }
  }
  function createState(compiled, deps) {
    const nodes = {}, edges = {}, rng = {}, st = {};
    for (const node of compiled.nodes) {
      rng[node.id] = seedFor(compiled.seed, node.id);
      nodes[node.id] = { arrivals: 0, served: 0, errors: 0, rejected: 0, lostReplies: 0, swallowed: 0, hopLimited: 0, staleJobs: 0, effectEvictions: 0, bypassed: 0, live: 0, lat: newHist(), win: newWindow(1), counts: {}, hists: {} };
    }
    for (const edge of compiled.edges) {
      rng[edge.id] = seedFor(compiled.seed, edge.id);
      edges[edge.id] = { f: 0, b: 0, sent: 0, replies: 0, lost: 0, dropped: 0, errors: 0, win: newWindow(2) };
    }
    return network.initialize(observability.initialize({
      schema: STATE_SCHEMA, t: 0, seq: 0, stale: 0, ids: { m: 0, j: 0, c: 0, r: 0, f: 0 }, heap: [], rng, kernel: {}, ov: {}, st,
      jobs: {}, calls: {}, open: {}, faults: [], parked: [], nodes, edges, effects: {},
      g: { offered: 0, completed: 0, failed: 0, failedBy: {}, attempts: 0, retries: 0, effects: 0, duplicateEffects: 0, wastedWork: 0, cost: 0, deadlineMisses: 0, lat: newHist() },
      series: { b0: 0, offered: [0], completed: [0], failed: [0], p95: [null], lw: [] },
      log: [], logSeq: 0, throttle: {}, live: { jobs: 0, transit: 0 }, error: null,
    }));
  }
  function createStation(R, id) {
    const cap = stationCapacity(R, id), qcap = stationQueueCapacity(R, id), spec = stationSpec(R, id);
    if (!Number.isInteger(cap) || cap < 1) fail(`node ${id} station ${spec.concurrency}`, 'integer concurrency >= 1', cap);
    if (!Number.isInteger(qcap) || qcap < 0) fail(`node ${id} station ${spec.queueCapacity}`, 'integer queue capacity >= 0', qcap);
    R.s.st[id] = { q: [], qh: 0, busy: [], cap, u: 0, area: 0, lt: R.s.t };
  }
  return Object.freeze({
    STATE_SCHEMA, CONTRACT, EngineError, RATE_WINDOW_SEC, LATENCY_WINDOW_SEC, MAX_EFFECT_KEYS, NON_RETRIABLE,
    createState, createStation, runtime, kernelOf, nodeParams, edgeParams, invalidateParams, nodeFault, edgeFault, faultTypesOn,
    networkView: network.view, networkReconcile: network.reconcile, updateNetwork: (R, id) => network.update(R, id, networkOps(R)),
    injectFault, clearFault, repairTarget, invalidateFaults, resize, callHook, ctxOf, processUntil, schedule, log,
    windowSum, windowSpan, windowStart, percentile, histMerge, newHist, binValue, utilization, queueLength, seriesIndex, latencyBuckets, seriesSize, isRecord, fail,
  });
});
