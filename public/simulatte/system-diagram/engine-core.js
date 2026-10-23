(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SimulatteSystemDiagramEngineCore = api;
})(globalThis, function () {
  'use strict';
  const clone = value => structuredClone(value);
  const EPSILON = 1e-12, ZIPF_CACHE_LIMIT = 8;
  const zipfCache = new Map();
  function zipfDraw(count, exponent, u) {
    if (!Number.isInteger(count) || count < 1 || count > 1000000 || !Number.isFinite(exponent) || exponent < 0 || exponent > 3) throw Error('Zipf arguments exceed declared source bounds');
    if (exponent === 0) return Math.min(count - 1, Math.floor(u * count));
    const key = `${count}:${exponent}`; let cdf = zipfCache.get(key);
    if (!cdf) { cdf = new Float64Array(count); let sum = 0; for (let i = 0; i < count; i++) { sum += Math.pow(i + 1, -exponent); cdf[i] = sum; } if (zipfCache.size >= ZIPF_CACHE_LIMIT) zipfCache.delete(zipfCache.keys().next().value); zipfCache.set(key, cdf); }
    const target = u * cdf[count - 1]; let low = 0, high = count - 1; while (low < high) { const mid = (low + high) >>> 1; if (target < cdf[mid]) high = mid; else low = mid + 1; } return low;
  }
  function hash(text) { let h = 2166136261; for (const c of String(text)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
  const before = (a, b) => a.t < b.t || (a.t === b.t && a.seq < b.seq);
  function push(heap, event) { heap.push(event); let i = heap.length - 1; while (i) { const p = (i - 1) >> 1; if (!before(heap[i], heap[p])) break; [heap[i], heap[p]] = [heap[p], heap[i]]; i = p; } }
  function pop(heap) { const out = heap[0], tail = heap.pop(); if (heap.length) { heap[0] = tail; let i = 0; for (;;) { let next = i; const l = i * 2 + 1, r = l + 1; if (l < heap.length && before(heap[l], heap[next])) next = l; if (r < heap.length && before(heap[r], heap[next])) next = r; if (next === i) break; [heap[next], heap[i]] = [heap[i], heap[next]]; i = next; } } return out; }
  function histogram(config) { return { bins: Array(config.bins).fill(0), count: 0, sum: 0 }; }
  function sample(hist, ms, config) { const value = Math.max(0, ms), logRange = Math.log(config.maxMs / config.minMs); const i = value <= config.minMs ? 0 : Math.min(config.bins - 1, Math.floor(Math.log(value / config.minMs) / logRange * config.bins)); hist.bins[i]++; hist.count++; hist.sum += value; }
  function percentiles(hist, config) { function p(f) { if (!hist.count) return 0; const target = Math.ceil(hist.count * f); let n = 0; for (let i = 0; i < hist.bins.length; i++) { n += hist.bins[i]; if (n >= target) return config.minMs * Math.pow(config.maxMs / config.minMs, (i + 0.5) / config.bins); } return config.maxMs; } return { p50: p(0.5), p95: p(0.95), p99: p(0.99), mean: hist.count ? hist.sum / hist.count : 0 }; }
  function initial(compiled, deps) {
    for (const n of compiled.nodes) { const kernel = deps.kernels.get(n.kernel); kernel.validateParams?.(n.params); }
    for (const key of ['maxEventsPerAdvance', 'maxSameTimeEvents', 'maxRecords']) if (!Number.isInteger(deps.config.engine[key]) || deps.config.engine[key] < 1) throw Error(`Missing declared engine bound ${key}`);
    const s = { schema: 'simulatte.systemDiagramState.v1', t: 0, seq: 0, recordSeq: 0, messageSeq: 0, jobSeq: 0, callSeq: 0, attemptSeq: 0, effectSeq: 0,
      events: [], history: [], log: [], nodes: {}, edges: {}, jobs: {}, calls: {}, attempts: {}, requests: {}, effects: [], effectKeys: {}, controls: [], transit: [], live: { nodes: {}, edges: {} },
      global: { offered: 0, completed: 0, failed: 0, failedBy: {}, attempts: 0, retries: 0, effects: 0, duplicateEffects: 0, wastedWork: 0, cost: 0, memoryMiB: 0, peakMemoryMiB: 0 },
      latency: histogram(deps.config.engine.histogram), error: null, activeJobs: 0, activeTransits: 0 };
    for (const n of compiled.nodes) s.nodes[n.id] = { k: null, rng: hash(`${compiled.seed}:${n.id}`) || 1, messageSeq: 0, faults: {}, queue: [], active: [], held: {}, memoryMiB: 0, peakMemoryMiB: 0,
      arrivals: 0, served: 0, errors: 0, rejected: 0, busyIntegral: 0, capacityIntegral: 0, lastCapacity: deps.kernels.get(n.kernel).station ? n.params[deps.kernels.get(n.kernel).station.concurrency] : 0, lastBusyT: 0, counters: {}, latencies: {}, latency: histogram(deps.config.engine.histogram) };
    for (const e of compiled.edges) s.edges[e.id] = { faults: {}, reqAvailable: 0, resAvailable: 0, sent: 0, errors: 0, delivered: 0, inTransit: 0 };
    return s;
  }
  function attach(compiled, s, deps) {
    const nodes = new Map(compiled.nodes.map(n => [n.id, n])), edges = new Map(compiled.edges.map(e => [e.id, e]));
    let currentJob = null, currentCause = null;
    function stop(message) { if (!s.error) { s.error = message; s.log.push({ seq: ++s.recordSeq, t: s.t, kind: 'run-stopped', message }); if (s.log.length > deps.config.engine.logCapacity) s.log.shift(); } }
    function event(t, kind, data = {}) { if (s.error) return null; if (!Number.isFinite(t) || t < s.t - EPSILON) throw Error(`Invalid ${kind} event time`); const e = { t: Math.max(s.t, t), seq: ++s.seq, kind, ...clone(data) }; push(s.events, e); return e.seq; }
    function record(kind, nodeId, message, job = currentJob, extras = {}) {
      if (s.history.length >= deps.config.engine.maxRecords) { stop(`History record bound ${deps.config.engine.maxRecords} reached; unfinished work is retained`); return null; }
      const row = { id: `event-${++s.recordSeq}`, seq: s.recordSeq, t: s.t, kind, nodeId, message: String(message || ''), requestId: job?.msg.trace || null, attemptId: job?.caller?.attemptId || null,
        jobId: job?.id || null, causes: [job?.lastEvent, currentCause].filter((v, i, a) => v && a.indexOf(v) === i), ...extras };
      s.history.push(row); s.log.push(row); if (s.log.length > deps.config.engine.logCapacity) s.log.shift(); if (job) job.lastEvent = row.id; return row.id;
    }
    function random(id) { const ns = s.nodes[id]; let x = ns.rng; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; ns.rng = x >>> 0; return (ns.rng + 0.5) / 4294967296; }
    function fault(id) { const out = { down: false, slowFactor: 1, errorRate: 0, blackhole: false, dropReplies: false }; for (const f of Object.values(s.nodes[id].faults)) {
      if (f.type === 'crash' || f.type === 'outage') out.down = true; if (f.type === 'slow') out.slowFactor *= f.params.factor;
      if (f.type === 'errors') out.errorRate = Math.max(out.errorRate, f.params.rate); if (f.type === 'blackhole') out.blackhole = true; if (f.type === 'dropReplies') out.dropReplies = true;
    } return out; }
    function params(id) { return { ...nodes.get(id).params, ...s.live.nodes[id] }; }
    function edgeParams(id) { return { ...edges.get(id).params, ...s.live.edges[id] }; }
    function invoke(id, hook, ...args) { if (s.error) return undefined; const k = deps.kernels.get(nodes.get(id).kernel), fn = k[hook]; if (!fn) return undefined; const old = currentJob; if (args[0]?.msg) currentJob = args[0]; try { return fn(context(id), ...args); } finally { currentJob = old; } }
    function groupAvailable(id) { const n = nodes.get(id), g = compiled.groups.find(g => g.id === n.groupId && g.kind === 'resource'); return !g || g.nodeIds.reduce((sum, member) => sum + s.nodes[member].active.length, 0) < g.capacity; }
    function jobMemory(job) { return job.msg.kb / 1024 + (params(job.nodeId).memoryPerRequestMiB || 0); }
    function hold(job, extraMiB) { const ns = s.nodes[job.nodeId]; if (Object.hasOwn(ns.held, job.id)) return true; const amount = extraMiB === undefined ? jobMemory(job) : job.msg.kb / 1024 + extraMiB, p = params(job.nodeId);
      if (!Number.isFinite(amount) || amount < 0) throw Error('Invalid memory allocation');
      if (p.memoryLimitMiB !== undefined && ns.memoryMiB + amount > p.memoryLimitMiB + EPSILON) { ns.rejected++; record('memory-rejected', job.nodeId, `${amount} MiB exceeds ${p.memoryLimitMiB} MiB admission limit`, job); reply(job, { ok: false, err: 'rejected' }); return false; }
      ns.held[job.id] = amount; ns.memoryMiB += amount; ns.peakMemoryMiB = Math.max(ns.peakMemoryMiB, ns.memoryMiB); s.global.memoryMiB += amount; job.memoryMiB = amount; s.global.peakMemoryMiB = Math.max(s.global.peakMemoryMiB, s.global.memoryMiB); return true;
    }
    function busyTouch(id) { const ns = s.nodes[id]; ns.busyIntegral += ns.active.length * (s.t - ns.lastBusyT); ns.capacityIntegral += ns.lastCapacity * (s.t - ns.lastBusyT); ns.lastBusyT = s.t; }
    function release(job) { const ns = s.nodes[job.nodeId]; busyTouch(job.nodeId); ns.active = ns.active.filter(id => id !== job.id); ns.queue = ns.queue.filter(id => id !== job.id);
      if (Object.hasOwn(ns.held, job.id)) { ns.memoryMiB -= ns.held[job.id]; s.global.memoryMiB -= ns.held[job.id]; delete ns.held[job.id]; if (Math.abs(ns.memoryMiB) < EPSILON) ns.memoryMiB = 0; if (Math.abs(s.global.memoryMiB) < EPSILON) s.global.memoryMiB = 0; }
      job.held = false; job.memoryMiB = 0; if (job.status !== 'finished') job.status = 'waiting'; drain();
    }
    function newJob(nodeId, msg, caller = null) {
      if (s.activeJobs + s.activeTransits >= deps.config.engine.maxInFlight) { stop(`In-flight bound ${deps.config.engine.maxInFlight} reached; unfinished requests are retained`); return null; }
      const job = { id: `job-${++s.jobSeq}`, nodeId, msg: clone(msg), caller: caller ? clone(caller) : null, status: 'new', held: false, generation: 0, born: s.t, data: {}, lastEvent: caller?.cause || null,
        remainingMs: 0, lastServiceT: s.t, slowFactor: 1, memoryMiB: 0 };
      s.jobs[job.id] = job; s.activeJobs++; return job;
    }
    function serviceMs(id, mean, dist, cv) { const u = () => random(id); let value = mean;
      if (dist === 'exponential') value = -mean * Math.log(u());
      else if (dist === 'lognormal') { const sigma = Math.sqrt(Math.log(1 + cv * cv)), z = Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u()); value = mean * Math.exp(sigma * z - sigma * sigma / 2); }
      else if (dist !== 'constant') throw Error(`Unknown service distribution ${dist}`);
      return value * fault(id).slowFactor;
    }
    function admit(job, duration) {
      if (!job || job.status === 'finished') return false; const id = job.nodeId, ns = s.nodes[id], p = params(id), station = deps.kernels.get(nodes.get(id).kernel).station;
      if (!station) throw Error(`Kernel ${nodes.get(id).kernel} cannot admit station work`);
      if (!hold(job)) return false;
      const capacity = p[station.concurrency], waiting = p[station.queueCapacity];
      if (ns.active.length >= capacity || !groupAvailable(id)) { if (ns.queue.length >= waiting) { ns.rejected++; record('queue-rejected', id, `Waiting queue capacity ${waiting}`, job); reply(job, { ok: false, err: 'rejected' }); return false; } }
      const ms = duration === undefined ? serviceMs(id, p.serviceMs + (p.perKbMs || 0) * job.msg.kb, p.serviceDist, p.serviceCv) : duration;
      if (!Number.isFinite(ms) || ms < 0) throw Error(`Invalid service time at ${id}`);
      job.remainingMs = ms / fault(id).slowFactor; job.slowFactor = fault(id).slowFactor; job.status = 'queued'; ns.queue.push(job.id); record('queued', id, 'FCFS station admission', job); drain(); return true;
    }
    let draining = false;
    function drain() { if (draining || s.error) return; draining = true; try { for (const n of compiled.nodes) { const ns = s.nodes[n.id], station = deps.kernels.get(n.kernel).station; if (!station || fault(n.id).down) continue;
      const p = params(n.id); while (ns.queue.length && ns.active.length < p[station.concurrency] && groupAvailable(n.id)) {
        const job = s.jobs[ns.queue.shift()]; if (!job || job.status === 'finished') continue; busyTouch(n.id); ns.active.push(job.id); job.status = 'serving'; job.held = true; job.lastServiceT = s.t; job.slowFactor = fault(n.id).slowFactor; job.generation++;
        record('service-started', n.id, `${job.remainingMs * job.slowFactor} ms`, job); event(s.t + job.remainingMs * job.slowFactor / 1000, 'served', { jobId: job.id, generation: job.generation });
      }
    } } finally { draining = false; } }
    function finish(job) { if (job.status === 'finished') return; job.status = 'finished'; job.generation++; release(job); s.activeJobs--; }
    function network(edgeId, direction, msg, payload) {
      const e = edges.get(edgeId), es = s.edges[edgeId], p = edgeParams(edgeId); const nodeId = direction === 'req' ? e.from : e.to;
      const fs = Object.values(es.faults), partition = fs.some(f => f.type === 'partition'), degrade = fs.filter(f => f.type === 'degrade');
      const addLatency = degrade.reduce((sum, f) => sum + f.params.addLatencyMs, 0), loss = Math.max(p.lossRate, ...degrade.map(f => f.params.lossRate), 0);
      const key = direction === 'req' ? 'reqAvailable' : 'resAvailable', t0 = s.t, start = Math.max(s.t, es[key]), sent = start + msg.kb * 8 / (p.bandwidthMbps * 1000); es[key] = sent;
      const t1 = sent + (p.latencyMs + addLatency + random(nodeId) * p.jitterMs) / 1000; const lost = partition || random(nodeId) < loss;
      const transit = { id: `transit-${s.seq + 1}`, edgeId, kind: direction, t0, t1, ptype: msg.ptype, ok: !lost, msgId: msg.id };
      s.transit.push(transit); if (s.transit.length > deps.config.engine.transitRenderLimit) s.transit.shift(); es.sent++; es.inTransit++; s.activeTransits++;
      event(t1, 'network', { edgeId, direction, msg: clone(msg), lost, payload: clone(payload) });
      if (s.activeJobs + s.activeTransits > deps.config.engine.maxInFlight) stop(`In-flight bound ${deps.config.engine.maxInFlight} reached; pending transfers remain visible`);
    }
    function attempt(call) {
      if (call.status === 'finished' || s.error) return; const e = edges.get(call.edgeId); call.tries++;
      const id = `attempt-${++s.attemptSeq}`, msg = derive(call.nodeId, call.msg, { attempt: call.tries, hops: call.msg.hops + 1 });
      if (msg.fields.idempotencyKeys === false) msg.idem = `${msg.trace}:${id}`;
      const a = { id, callId: call.id, requestId: msg.trace, nodeId: e.to, callerNodeId: call.nodeId, edgeId: e.id, startedAt: s.t, finishedAt: null, status: 'in-flight', err: null, msg: clone(msg), cause: call.cause };
      s.attempts[id] = a; call.currentAttempt = id; call.attemptIds.push(id); s.global.attempts++; if (call.tries > 1) s.global.retries++;
      record('call-attempt', call.nodeId, `${e.id} try ${call.tries}`, s.jobs[call.jobId], { attemptId: id, edgeId: e.id });
      if (msg.hops > deps.config.engine.maxHops) { completeAttempt(call, a, { ok: false, err: 'hop-limit', msg }); return; }
      network(e.id, 'req', msg, { callId: call.id, attemptId: id });
      event(s.t + call.options.timeoutMs / 1000, 'timeout', { callId: call.id, attemptId: id });
    }
    function completeAttempt(call, a, result) {
      if (a.status !== 'in-flight') { s.global.wastedWork++; record('late-reply', call.nodeId, `Ignored reply for ${a.id}`, s.jobs[call.jobId], { attemptId: a.id }); return; }
      a.status = result.ok ? 'completed' : 'failed'; a.err = result.err || null; a.finishedAt = s.t;
      record(result.ok ? 'call-completed' : 'call-failed', call.nodeId, result.err || 'Reply received', s.jobs[call.jobId], { attemptId: a.id, edgeId: call.edgeId });
      if (!result.ok && call.tries <= call.options.retries) { const raw = call.options.backoffMs * Math.pow(call.options.multiplier, call.tries - 1), delay = (call.options.jitter ? random(call.nodeId) : 1) * raw / 1000;
        record('retry-scheduled', call.nodeId, `${call.id} at ${(s.t + delay).toFixed(6)}`, s.jobs[call.jobId]); event(s.t + delay, 'retry', { callId: call.id }); return; }
      if (!result.ok) call.failedResult = clone(result);
      if (call.copy + 1 < call.copies) { call.copy++; call.tries = 0; event(s.t, 'retry', { callId: call.id }); return; }
      const final = call.failedResult || result; call.status = 'finished'; call.result = { ok: final.ok, err: final.err || null, msg: clone(final.msg || a.msg), latencyMs: (s.t - call.startedAt) * 1000, attempts: call.attemptIds.length };
      const parent = s.jobs[call.jobId]; if (!call.options.async && parent && parent.status !== 'finished') invoke(call.nodeId, 'onResult', parent, call.options.slot, clone(call.result));
    }
    function derive(nodeId, msg, patch = {}) { return { ...clone(msg), ...clone(patch), id: `message-${++s.messageSeq}`, fields: { ...clone(msg.fields || {}), ...clone(patch.fields || {}) } }; }
    function call(job, edgeId, patch = {}, options = {}) {
      const e = edges.get(edgeId); if (!e || e.from !== job.nodeId) throw Error(`Call edge ${edgeId} is not an output of ${job.nodeId}`);
      const ep = edgeParams(edgeId), p = params(job.nodeId), msg = derive(job.nodeId, job.msg, patch); if (ep.op !== 'inherit') msg.op = ep.op;
      const opts = { timeoutMs: options.timeoutMs ?? p.callTimeoutMs ?? p.timeoutMs, retries: options.retries ?? 0, backoffMs: options.backoffMs ?? 0, multiplier: options.multiplier ?? 1, jitter: options.jitter ?? false, slot: options.slot ?? edgeId, async: Boolean(options.async || ep.mode === 'async') };
      if (!Number.isFinite(opts.timeoutMs) || opts.timeoutMs <= 0) throw Error(`Missing call timeout at ${job.nodeId}`);
      const c = { id: `call-${++s.callSeq}`, nodeId: job.nodeId, jobId: job.id, edgeId, msg, options: opts, tries: 0, attemptIds: [], status: 'pending', startedAt: s.t, currentAttempt: null, cause: job.lastEvent, copies: ep.callsPerRequest, copy: 0, failedResult: null };
      s.calls[c.id] = c; if (random(job.nodeId) > ep.probability) event(s.t, 'call-skipped', { callId: c.id }); else attempt(c); return c.id;
    }
    function reply(job, result) {
      if (!job || job.status === 'finished') return; const f = fault(job.nodeId), msg = derive(job.nodeId, job.msg, { kb: result.kb ?? job.msg.kb, ptype: result.ptype ?? job.msg.ptype, tokens: result.tokens ?? job.msg.tokens, fields: result.fields || {} });
      record(result.ok ? 'job-completed' : 'job-failed', job.nodeId, result.err || 'Work replied', job);
      const caller = job.caller; if (!caller && s.requests[job.msg.trace]?.sourceId === job.nodeId) context(job.nodeId).endRequest(job.msg, result); finish(job);
      if (caller) { const c = s.calls[caller.callId], a = s.attempts[caller.attemptId]; if (c && a && !f.dropReplies && !f.blackhole) network(c.edgeId, 'res', msg, { callId: c.id, attemptId: a.id, result: { ok: Boolean(result.ok), err: result.err || null, msg } });
        else if (c) record('reply-lost', job.nodeId, 'Reply dropped after processing; committed effects remain', job, { attemptId: a?.id || null }); }
    }
    function rescale(id, oldFault, oldParams) {
      const ns = s.nodes[id], p = params(id), f = fault(id), ratio = oldParams.serviceMs && p.serviceMs !== oldParams.serviceMs ? p.serviceMs / oldParams.serviceMs : 1;
      for (const jid of [...ns.active]) { const job = s.jobs[jid]; if (job.status !== 'serving') continue; const consumed = (s.t - job.lastServiceT) * 1000 / job.slowFactor;
        job.remainingMs = Math.max(0, job.remainingMs - consumed) * ratio; job.lastServiceT = s.t; job.slowFactor = f.slowFactor; job.generation++;
        event(s.t + job.remainingMs * f.slowFactor / 1000, 'served', { jobId: jid, generation: job.generation });
      }
      for (const jid of ns.queue) s.jobs[jid].remainingMs *= ratio;
      void oldFault; drain();
    }
    function applyFault(target, type, values, key, active) {
      if (target.kind === 'group') { const g = compiled.groups.find(g => g.id === target.id); if (!g || !['zone', 'region'].includes(g.kind)) throw Error('Fault outage requires a zone or region failure domain'); for (const id of g.nodeIds) applyFault({ kind: 'node', id }, 'outage', values, key, active); return; }
      if (target.kind === 'edge') { const es = s.edges[target.id]; if (!es) throw Error('Unknown fault edge'); if (active) es.faults[key] = { type, params: clone(values) }; else delete es.faults[key]; record(active ? 'edge-fault' : 'edge-recovered', null, `${target.id}: ${type}`, null, { edgeId: target.id }); return; }
      const id = target.id; if (!s.nodes[id]) throw Error('Unknown fault node'); const old = fault(id), oldP = params(id); if (active) s.nodes[id].faults[key] = { type, params: clone(values) }; else delete s.nodes[id].faults[key]; const next = fault(id);
      const cause = record(active ? 'node-fault' : 'node-recovered', id, type, null); const previousCause = currentCause; currentCause = cause;
      if (next.down && !old.down) for (const job of Object.values(s.jobs).filter(j => j.nodeId === id && j.status !== 'finished')) reply(job, { ok: false, err: 'down' });
      rescale(id, old, oldP); invoke(id, 'onFault', { type, params: clone(values), key }, active); currentCause = previousCause;
    }
    function context(id) {
      const n = nodes.get(id), ns = s.nodes[id], p = params(id);
      return { t: s.t, nodeId: id, node: n, p, k: ns.k, fault: fault(id), rand: () => random(id), exp: mean => -mean * Math.log(random(id)),
        lognormal: (mean, cv) => serviceMs(id, mean, 'lognormal', cv) / fault(id).slowFactor,
        poisson: mean => { if (mean > 100) return Math.max(0, Math.round(mean + Math.sqrt(mean) * Math.sqrt(-2 * Math.log(random(id))) * Math.cos(2 * Math.PI * random(id)))); let k = 0, product = 1; do { k++; product *= random(id); } while (product > Math.exp(-mean)); return k - 1; },
        zipf: (count, exponent) => zipfDraw(count, exponent, random(id)),
        serviceMs: (mean, dist, cv = 0) => serviceMs(id, mean, dist, cv), admit, hold, release, reply, call,
        send: (edgeId, msg) => { const e = edges.get(edgeId); if (!e || e.from !== id) throw Error('One-way edge is not an output'); const ep = edgeParams(edgeId), child = derive(id, msg, { hops: msg.hops + 1, ...(ep.op === 'inherit' ? {} : { op: ep.op }) }); if (child.hops > deps.config.engine.maxHops) { record('hop-limit', id, edgeId, null, { requestId: child.trace, edgeId }); return; } network(edgeId, 'req', child, { callId: null, attemptId: null }); },
        edge: edgeId => { const e = edges.get(edgeId); return e ? { ...e, params: edgeParams(edgeId) } : null; }, edges: portId => [...(n.out[portId] || [])], edgeUsable: edgeId => !Object.values(s.edges[edgeId]?.faults || {}).some(f => f.type === 'partition'),
        newJob: msg => newJob(id, msg), getJob: jobId => s.jobs[jobId] || null, jobs: () => Object.values(s.jobs).filter(j => j.nodeId === id && j.status !== 'finished'),
        message: fields => { const trace = fields.trace || `request-${id}-${++ns.messageSeq}`; return { id: `message-${++s.messageSeq}`, trace, attempt: 0, delivery: 0, ptype: 'http', kb: 0, tokens: 0, key: '', op: 'read', born: s.t, deadline: null, idem: trace, hops: 0, ...clone(fields), fields: clone(fields.fields || {}) }; },
        derive: (msg, patch) => derive(id, msg, patch),
        beginRequest: msg => { if (s.requests[msg.trace]) throw Error(`Logical request ${msg.trace} already exists`); s.requests[msg.trace] = { id: msg.trace, sourceId: id, arrival: s.t, deadline: msg.deadline, status: 'in-flight', completedAt: null, err: null, payloadType: msg.ptype, latencyMs: null }; s.global.offered++; record('request-arrived', id, msg.ptype, null, { requestId: msg.trace }); },
        endRequest: (msg, result) => { const r = s.requests[msg.trace]; if (!r || r.status !== 'in-flight') return; r.status = result.ok ? 'completed' : result.err === 'rejected' ? 'rejected' : result.err === 'timeout' ? 'timed-out' : result.err === 'dead-letter' ? 'dead-letter' : 'failed'; r.err = result.err || null; r.completedAt = s.t; r.latencyMs = (s.t - r.arrival) * 1000; if (result.ok) { s.global.completed++; sample(s.latency, r.latencyMs, deps.config.engine.histogram); } else { s.global.failed++; s.global.failedBy[r.err] = (s.global.failedBy[r.err] || 0) + 1; } record(`request-${r.status}`, id, r.err || 'Reply received', null, { requestId: msg.trace }); },
        effect: (key, options) => { const scoped = `${id}:${key}`, previous = s.effectKeys[scoped], duplicate = previous !== undefined && (options.windowSec === 0 || s.t - previous <= options.windowSec); if (duplicate) s.global.duplicateEffects++; const suppressed = duplicate && options.idempotent;
          if (!suppressed) { s.effectKeys[scoped] = s.t; const effect = { id: `effect-${++s.effectSeq}`, nodeId: id, key: String(key), requestId: currentJob?.msg.trace || null, attemptId: currentJob?.caller?.attemptId || null, t: s.t }; s.effects.push(effect); s.global.effects++; }
          record(suppressed ? 'effect-suppressed' : 'effect-committed', id, String(key)); return { duplicate, suppressed }; },
        wake: (delay, payload) => { if (!Number.isFinite(delay) || delay < 0) throw Error('Wake delay must be nonnegative'); return event(s.t + delay, 'wake', { nodeId: id, payload: clone(payload) }); },
        count: (key, amount = 1) => { ns.counters[key] = (ns.counters[key] || 0) + amount; }, latency: (key, ms) => { if (!ns.latencies[key]) ns.latencies[key] = histogram(deps.config.engine.histogram); sample(ns.latencies[key], ms, deps.config.engine.histogram); },
        log: (kind, message, job) => record(kind, id, message, job || currentJob), cost: amount => { if (!Number.isFinite(amount) || amount < 0) throw Error('Synthetic cost must be nonnegative'); s.global.cost += amount; }
      };
    }
    function dispatch(e) {
      if (e.kind === 'wake') invoke(e.nodeId, 'onWake', e.payload);
      else if (e.kind === 'call-skipped') { const c = s.calls[e.callId], job = s.jobs[c.jobId]; c.status = 'finished'; c.result = { ok: true, err: null, msg: clone(c.msg), latencyMs: 0, attempts: 0 }; record('optional-call-skipped', c.nodeId, c.edgeId, job); if (!c.options.async && job.status !== 'finished') invoke(c.nodeId, 'onResult', job, c.options.slot, clone(c.result)); }
      else if (e.kind === 'served') { const job = s.jobs[e.jobId]; if (!job || job.status !== 'serving' || job.generation !== e.generation) return; job.remainingMs = 0; job.status = 'served'; record('service-finished', job.nodeId, 'Service work completed', job); const ns = s.nodes[job.nodeId], p = params(job.nodeId); ns.served++; sample(ns.latency, (s.t - job.born) * 1000, deps.config.engine.histogram);
        if (random(job.nodeId) < Math.max(p.errorRate || 0, fault(job.nodeId).errorRate)) { ns.errors++; reply(job, { ok: false, err: 'error' }); } else invoke(job.nodeId, 'onServed', job);
      } else if (e.kind === 'network') {
        const es = s.edges[e.edgeId]; es.inTransit--; s.activeTransits--; if (e.lost || Object.values(es.faults).some(f => f.type === 'partition')) { es.errors++; record('network-dropped', null, e.edgeId, null, { edgeId: e.edgeId, requestId: e.msg.trace }); return; } es.delivered++;
        if (e.direction === 'res') { const c = s.calls[e.payload.callId], a = s.attempts[e.payload.attemptId]; if (c && a) completeAttempt(c, a, e.payload.result); return; }
        const edge = edges.get(e.edgeId), ns = s.nodes[edge.to], f = fault(edge.to); ns.arrivals++; const caller = e.payload.callId ? { ...e.payload, cause: s.calls[e.payload.callId]?.cause } : null;
        const job = newJob(edge.to, e.msg, caller); if (!job) return; record('request-delivered', edge.to, e.edgeId, job, { edgeId: e.edgeId });
        const port = deps.library.kernels[nodes.get(edge.to).kernel].ports.find(p => p.id === edge.toPort);
        if (!port.accepts.includes('any') && !port.accepts.includes(e.msg.ptype)) { reply(job, { ok: false, err: 'invalid' }); return; }
        if (f.down) { reply(job, { ok: false, err: 'down' }); return; } if (f.blackhole) { job.status = 'blackholed'; hold(job); record('request-blackholed', edge.to, 'Arrival retained until repair or crash', job); return; }
        if (deps.kernels.get(nodes.get(edge.to).kernel).onRequest) invoke(edge.to, 'onRequest', job); else admit(job);
      } else if (e.kind === 'timeout') { const c = s.calls[e.callId], a = s.attempts[e.attemptId]; if (c && a && a.status === 'in-flight') completeAttempt(c, a, { ok: false, err: 'timeout', msg: a.msg }); }
      else if (e.kind === 'retry') { const c = s.calls[e.callId]; if (c && c.status !== 'finished') attempt(c); }
      else if (e.kind === 'fault') applyFault(e.target, e.type, e.params, e.key, e.active);
      else throw Error(`Unknown simulation event ${e.kind}`);
    }
    function advance(toTime) {
      if (!Number.isFinite(toTime) || toTime < s.t - EPSILON || toTime > compiled.horizonSec + EPSILON) throw Error('Invalid simulation advance time');
      let count = 0, same = 0, previous = null;
      while (!s.error && s.events.length && s.events[0].t <= toTime) {
        if (++count > deps.config.engine.maxEventsPerAdvance) { stop(`Advance event bound ${deps.config.engine.maxEventsPerAdvance} reached`); break; }
        const e = pop(s.events); same = e.t === previous ? same + 1 : 1; previous = e.t;
        if (same > deps.config.engine.maxSameTimeEvents) { push(s.events, e); stop(`Zero-time event bound ${deps.config.engine.maxSameTimeEvents} reached`); break; }
        s.t = e.t; dispatch(e);
      }
      if (!s.error) s.t = toTime; return s;
    }
    function control(c) {
      const target = c.target;
      if (!target || !['node', 'edge', 'group'].includes(target.kind)) throw Error('Control target must be node, edge or group');
      if (c.kind === 'fault') {
        const f = deps.library.faultTypes.find(f => f.id === c.type && f.targets.includes(target.kind)); if (!f) throw Error('Unsupported fault target/type');
        const values = {}; for (const [key, spec] of Object.entries(f.params)) values[key] = spec.default;
        for (const [key, value] of Object.entries(c.params || {})) { if (!f.params[key]) throw Error(`Unknown fault parameter ${key}`); validateValue(f.params[key], value, key); values[key] = value; }
        if (target.kind === 'node' && !deps.library.kernels[nodes.get(target.id)?.kernel]?.faults.includes(c.type)) throw Error('Kernel does not support this fault');
        applyFault(target, c.type, values, `control-${s.controls.length + 1}`, true);
      } else if (c.kind === 'repair') {
        if (target.kind === 'group') { const group = compiled.groups.find(g => g.id === target.id); if (!group) throw Error('Unknown group'); for (const nodeId of group.nodeIds) control({ kind: 'repair', target: { kind: 'node', id: nodeId } }); }
        else { const store = target.kind === 'node' ? s.nodes[target.id] : s.edges[target.id]; if (!store) throw Error('Unknown repair target'); for (const [key, f] of Object.entries(store.faults)) applyFault(target, f.type, f.params, key, false);
          if (target.kind === 'node') for (const job of Object.values(s.jobs).filter(j => j.nodeId === target.id && j.status === 'blackholed')) { job.status = 'new'; if (deps.kernels.get(nodes.get(target.id).kernel).onRequest) invoke(target.id, 'onRequest', job); else admit(job); }
        }
      } else if (c.kind === 'setParams') {
        if (!['node', 'edge'].includes(target.kind)) throw Error('setParams target must be node or edge'); const specs = target.kind === 'node' ? deps.library.kernels[nodes.get(target.id)?.kernel]?.params : deps.library.edgeParams;
        if (!specs || (target.kind === 'edge' && !edges.has(target.id))) throw Error('Unknown parameter target'); for (const [key, value] of Object.entries(c.params || {})) { if (!specs[key]) throw Error(`Unknown live parameter ${key}`); validateValue(specs[key], value, key); }
        const old = target.kind === 'node' ? params(target.id) : null; if (old) { deps.kernels.get(nodes.get(target.id).kernel).validateParams?.({ ...old, ...c.params }); busyTouch(target.id); } s.live[`${target.kind}s`][target.id] = { ...s.live[`${target.kind}s`][target.id], ...clone(c.params) }; if (old) { const station = deps.kernels.get(nodes.get(target.id).kernel).station; if (station) s.nodes[target.id].lastCapacity = params(target.id)[station.concurrency]; rescale(target.id, fault(target.id), old); invoke(target.id, 'onControl', c); }
      } else if (c.kind === 'redrive') { if (target.kind !== 'node' || !nodes.has(target.id) || invoke(target.id, 'onControl', c) !== true) throw Error('Target does not support redrive'); }
      else throw Error(`Unknown control ${c.kind}`);
      s.controls.push({ ...clone(c), atSec: s.t }); record('control-applied', target.kind === 'node' ? target.id : null, c.kind, null); advance(s.t); return s;
    }
    function initialize() { for (const n of compiled.nodes) s.nodes[n.id].k = clone(invoke(n.id, 'init') || {}); for (const f of compiled.faults) { event(f.atSec, 'fault', { target: f.target, type: f.type, params: f.params, key: f.id, active: true }); if (f.untilSec !== null) event(f.untilSec, 'fault', { target: f.target, type: f.type, params: f.params, key: f.id, active: false }); } for (const n of compiled.nodes) invoke(n.id, 'start'); return s; }
    function reconcile() { let total = 0, active = 0; for (const [id, ns] of Object.entries(s.nodes)) { const held = Object.values(ns.held).reduce((sum, v) => sum + v, 0); if (Math.abs(held - ns.memoryMiB) > 1e-6) throw Error(`Memory ownership mismatch at ${id}`); total += held; for (const jid of [...ns.active, ...ns.queue]) if (!s.jobs[jid] || s.jobs[jid].status === 'finished') throw Error(`Station ownership mismatch at ${id}`); } for (const j of Object.values(s.jobs)) if (j.status !== 'finished') active++; if (active !== s.activeJobs || Math.abs(total - s.global.memoryMiB) > 1e-6) throw Error('Global resource ownership mismatch'); return true; }
    return { initialize, advance, control, context, invoke, fault, params, edgeParams, record, event, reconcile, stop };
  }
  function validateValue(spec, value, key) { if (spec.type === 'boolean' ? typeof value !== 'boolean' : spec.type === 'enum' ? !spec.options.includes(value) : !Number.isFinite(value) || (spec.type === 'integer' && !Number.isInteger(value)) || value < spec.min || value > spec.max) throw Error(`Invalid ${key} live parameter`); }
  return Object.freeze({ initial, attach, histogram, sample, percentiles, hash, clone });
});
