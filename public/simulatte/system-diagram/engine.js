(function (root, factory) {
  const node = typeof module === 'object' && module.exports;
  const api = factory(node ? require('./engine-core.js') : root.SimulatteSystemDiagramEngineCore,
    node ? require('./class-library.js') : root.SimulatteSystemDiagramLibrary,
    node ? require('./engine-observability.js') : root.SimulatteSystemDiagramObservability);
  if (node) module.exports = api; else root.SimulatteSystemDiagramEngine = api;
})(globalThis, function (core, libraryApi, observability) {
  'use strict';
  // Pure initialize/advance/applyControl/observe/metrics over the JSON state owned by engine-core.
  const COMPILED_SCHEMA = 'simulatte.systemDiagramCompiled.v1';
  const CONTROL_KINDS = Object.freeze(['fault', 'repair', 'redrive', 'setParams']);
  const TARGET_KINDS = Object.freeze(['node', 'edge', 'group']);
  const FAILURE_DOMAINS = Object.freeze(['zone', 'region']);
  const HEALTH = Object.freeze(['ok', 'busy', 'degraded', 'down', 'open', 'electing']);
  const PERCENTILES = Object.freeze({ p50: 0.5, p95: 0.95, p99: 0.99 });
  const { fail, isRecord } = core;

  function checkDeps(deps) {
    if (!isRecord(deps)) fail('deps', '{ library, config, kernels }', deps);
    if (!isRecord(deps.library) || !deps.library.kernels || !Array.isArray(deps.library.errorCodes)) fail('deps.library', 'built class library', deps.library);
    const e = deps.config && deps.config.engine;
    if (!isRecord(e) || !isRecord(e.histogram)) fail('deps.config.engine', 'engine configuration with histogram', e);
    for (const key of ['authoritativeCadenceSec', 'maxInFlight', 'maxHops', 'seriesBucketSec', 'seriesWindowSec', 'logCapacity', 'transitRenderLimit']) {
      if (!Number.isFinite(e[key]) || e[key] <= 0) fail(`deps.config.engine.${key}`, 'positive number', e[key]);
    }
    if (!(e.histogram.minMs > 0) || !(e.histogram.maxMs > e.histogram.minMs) || !Number.isInteger(e.histogram.bins) || e.histogram.bins < 1) fail('deps.config.engine.histogram', '0 < minMs < maxMs and integer bins >= 1', e.histogram);
    if (!deps.kernels || typeof deps.kernels.get !== 'function' || typeof deps.kernels.has !== 'function') fail('deps.kernels', 'SimulatteSystemDiagramKernels registry', deps.kernels);
  }
  function checkCompiled(compiled) {
    if (!isRecord(compiled) || compiled.schema !== COMPILED_SCHEMA) fail('compiled.schema', COMPILED_SCHEMA, compiled && compiled.schema);
  }
  function checkState(state) {
    if (!isRecord(state) || state.schema !== core.STATE_SCHEMA) fail('state.schema', core.STATE_SCHEMA, state && state.schema);
  }

  function checkBypass(spec, bypass) {
    const path = `kernel ${spec.id}.bypass`;
    if (!isRecord(bypass) || Object.keys(bypass).sort().join() !== 'param,port') fail(path, '{ port, param }', bypass);
    if (!spec.ports.some(port => port.id === bypass.port && port.direction === 'out')) fail(`${path}.port`, `out port of kernel ${spec.id}`, bypass.port);
    if (!spec.params[bypass.param] || spec.params[bypass.param].type !== 'boolean') fail(`${path}.param`, `boolean parameter of kernel ${spec.id}`, bypass.param);
  }
  // Stateless kernel contracts can inspect resolved peers before any run state changes.
  // Live parameter changes are checked against all accepted overrides together.
  function checkTopology(compiled, deps, overrides = null) {
    const projected = overrides ? { ...compiled,
      nodes: compiled.nodes.map(n => ({ ...n, params: { ...n.params, ...overrides[n.id] } })),
      edges: compiled.edges.map(e => ({ ...e, params: { ...e.params, ...overrides[e.id] } })),
    } : compiled;
    for (const node of projected.nodes) deps.kernels.get(node.kernel).validateTopology?.(node, projected);
  }
  function initialize(compiled, deps) {
    checkDeps(deps); checkCompiled(compiled);
    checkTopology(compiled, deps);
    const state = core.createState(compiled, deps), R = core.runtime(compiled, state, deps);
    for (const node of compiled.nodes) {
      const kernel = core.kernelOf(R, node.id);
      for (const key of kernel.immutableParams || []) if (!Object.hasOwn(deps.library.kernels[node.kernel].params, key)) fail(`kernel ${node.kernel}.immutableParams`, 'declared parameter', key);
      if (kernel.station) core.createStation(R, node.id);
      if (kernel.bypass !== undefined) checkBypass(deps.library.kernels[node.kernel], kernel.bypass);
    }
    for (const group of compiled.groups.filter(g => g.kind === 'resource')) for (const id of group.nodeIds) { const kernel = core.kernelOf(R, id); if (!kernel.station && !kernel.resourceSlots) fail(`resource group ${group.id}`, 'members with station or explicit resource slot ownership', id); }
    compiled.faults.forEach((fault, i) => {
      core.schedule(R, fault.atSec, { k: 'flt', i, on: true });
      if (fault.untilSec !== null) core.schedule(R, fault.untilSec, { k: 'flt', i, on: false });
    });
    for (const node of compiled.nodes) {
      const k = core.callHook(R, node.id, 'init');
      state.kernel[node.id] = k === undefined ? {} : k;
    }
    for (const node of compiled.nodes) core.callHook(R, node.id, 'start');
    return state;
  }

  function advance(compiled, state, toTime, deps) {
    checkState(state);
    if (!Number.isFinite(toTime) || toTime < state.t) fail('advance toTime', `finite time >= state.t ${state.t}`, toTime);
    if (toTime > compiled.horizonSec) fail('advance toTime', `time <= horizon ${compiled.horizonSec}`, toTime);
    core.processUntil(core.runtime(compiled, state, deps), toTime);
    state.t = toTime;
    return state;
  }

  function targetExists(compiled, target, kinds, path) {
    if (!isRecord(target) || !kinds.includes(target.kind) || typeof target.id !== 'string') fail(`${path}.target`, `{ kind: ${kinds.join('|')}, id }`, target);
    const list = target.kind === 'node' ? compiled.nodes : target.kind === 'edge' ? compiled.edges : compiled.groups;
    const row = list.find(item => item.id === target.id);
    if (!row) fail(`${path}.target.id`, `existing ${target.kind}`, target.id);
    return row;
  }
  function checkParams(path, params, specs) {
    if (!isRecord(params) || !Object.keys(params).length) fail(path, 'non-empty object of parameter values', params);
    const out = {};
    for (const [key, value] of Object.entries(params)) {
      if (!specs[key]) fail(`${path}.${key}`, 'declared parameter', key);
      out[key] = libraryApi.checkParamValue(core.CONTRACT, `${path}.${key}`, specs[key], value);
    }
    return out;
  }
  // Validates without touching state and returns the canonical control the engine applies.
  function normalizeControl(compiled, control, deps) {
    const path = 'control';
    if (!isRecord(control) || !CONTROL_KINDS.includes(control.kind)) fail(`${path}.kind`, CONTROL_KINDS.join('|'), control && control.kind);
    const allowed = { fault: ['kind', 'target', 'type', 'params'], repair: ['kind', 'target'], redrive: ['kind', 'target'], setParams: ['kind', 'target', 'params'] }[control.kind];
    for (const key of Object.keys(control)) if (!allowed.includes(key)) fail(`${path}.${key}`, `field of a ${control.kind} control (${allowed.join(', ')})`, key);
    const library = deps.library;
    if (control.kind === 'fault') {
      const row = targetExists(compiled, control.target, TARGET_KINDS, path);
      const type = library.faultTypes.find(f => f.id === control.type);
      if (!type || !type.targets.includes(control.target.kind)) fail(`${path}.type`, `fault type for a ${control.target.kind}`, control.type);
      if (control.target.kind === 'node' && !library.kernels[row.kernel].faults.includes(control.type)) fail(`${path}.type`, `fault supported by kernel ${row.kernel}`, control.type);
      if (control.target.kind === 'group' && !FAILURE_DOMAINS.includes(row.kind)) fail(`${path}.target.id`, 'zone or region group', row.kind);
      const given = control.params === undefined ? {} : control.params;
      if (!isRecord(given)) fail(`${path}.params`, 'object', given);
      const params = {};
      for (const [key, spec] of Object.entries(type.params)) params[key] = spec.default;
      for (const [key, value] of Object.entries(given)) {
        if (!type.params[key]) fail(`${path}.params.${key}`, `parameter of fault ${type.id}`, key);
        params[key] = libraryApi.checkParamValue(core.CONTRACT, `${path}.params.${key}`, type.params[key], value);
      }
      return { kind: 'fault', target: { kind: control.target.kind, id: control.target.id }, type: control.type, params };
    }
    if (control.kind === 'repair') { targetExists(compiled, control.target, TARGET_KINDS, path); return { kind: 'repair', target: { kind: control.target.kind, id: control.target.id } }; }
    if (control.kind === 'redrive') { targetExists(compiled, control.target, ['node'], path); return { kind: 'redrive', target: { kind: 'node', id: control.target.id } }; }
    const row = targetExists(compiled, control.target, ['node', 'edge'], path);
    const specs = control.target.kind === 'node' ? library.kernels[row.kernel].params : library.edgeParams;
    return { kind: 'setParams', target: { kind: control.target.kind, id: control.target.id }, params: checkParams(`${path}.params`, control.params, specs) };
  }

  function applyControl(compiled, state, control, deps) {
    checkState(state);
    const c = normalizeControl(compiled, control, deps), R = core.runtime(compiled, state, deps);
    const label = `${c.target.kind} ${c.target.id}`;
    if (c.kind === 'fault') {
      core.injectFault(R, { id: `live-${++state.ids.f}`, type: c.type, params: c.params, target: c.target, origin: 'live' });
    } else if (c.kind === 'repair') {
      const cleared = core.repairTarget(R, c.target);
      if (!cleared) core.log(R, 'repair', `repair on ${label}: no active faults`, refOf(c.target));
    } else if (c.kind === 'redrive') {
      const handled = core.callHook(R, c.target.id, 'onControl', c);
      core.log(R, 'control', handled ? `redrive on ${label}` : `redrive on ${label}: not handled by kernel ${core.kernelOf(R, c.target.id).id}`, refOf(c.target));
    } else {
      if (c.target.kind === 'node') for (const key of core.kernelOf(R, c.target.id).immutableParams || []) {
        if (Object.hasOwn(c.params, key) && c.params[key] !== core.nodeParams(R, c.target.id)[key]) fail(`control.params.${key}`, 'accepted-run immutable parameter; edit the draft and restart explicitly', c.params[key]);
      }
      checkTopology(compiled, deps, { ...state.ov, [c.target.id]: { ...state.ov[c.target.id], ...c.params } });
      state.ov[c.target.id] = { ...(state.ov[c.target.id] || {}), ...c.params };
      core.invalidateParams(R, c.target.id); if (c.target.kind === 'edge') core.updateNetwork(R, c.target.id); else observability.memoryChanged(R, c.target.id, core.nodeParams(R, c.target.id));
      if (c.target.kind === 'node') {
        const station = core.kernelOf(R, c.target.id).station;
        if (station && (Object.hasOwn(c.params, station.concurrency) || Object.hasOwn(c.params, station.queueCapacity))) core.resize(R, c.target.id);
        core.callHook(R, c.target.id, 'onParams', Object.keys(c.params));
      }
      core.log(R, 'control', `set ${Object.entries(c.params).map(([k, v]) => `${k}=${v}`).join(', ')} on ${label}`, refOf(c.target));
    }
    core.processUntil(R, state.t);
    return state;
  }
  function refOf(target) { return target.kind === 'node' ? { nodeId: target.id } : target.kind === 'edge' ? { edgeId: target.id } : {}; }

  function latencySummary(R, hist, keys) {
    const out = {};
    for (const key of keys) out[key] = key === 'mean' ? (hist.n ? hist.sum / hist.n : null) : core.percentile(R, hist, PERCENTILES[key]);
    return out;
  }
  // Series arrays stop at the last bucket an event touched; the view pads up to state.t.
  function seriesView(R) {
    const s = R.s, ser = s.series, size = core.seriesSize(R), bucketSec = R.eng.seriesBucketSec;
    const now = core.seriesIndex(R, s.t), last = ser.b0 + ser.offered.length - 1;
    const pad = Math.max(0, now - last);
    const grow = (rows, fill) => rows.concat(new Array(Math.min(pad, size)).fill(fill));
    const p95 = ser.p95.slice();
    const live = ser.lw.find(row => row.i === last);
    p95[p95.length - 1] = live ? core.percentile(R, live, 0.95) : null;
    let offered = grow(ser.offered, 0), completed = grow(ser.completed, 0), failed = grow(ser.failed, 0), p95s = grow(p95, null);
    let start = pad >= size ? now - size + 1 : ser.b0;
    const extra = offered.length - size;
    if (extra > 0) { offered = offered.slice(extra); completed = completed.slice(extra); failed = failed.slice(extra); p95s = p95s.slice(extra); start += extra; }
    return { bucketSec, startSec: start * bucketSec, offered, completed, failed, p95: p95s };
  }
  function windowCounts(R, field) {
    const s = R.s, ser = s.series, bucketSec = R.eng.seriesBucketSec;
    const now = core.seriesIndex(R, s.t), from = core.windowStart(s.t, bucketSec);
    let sum = 0;
    ser[field].forEach((n, i) => { const idx = ser.b0 + i; if (idx >= from && idx <= now) sum += n; });
    return sum;
  }

  function nodeView(R, node) {
    const s = R.s, ns = s.nodes[node.id], st = s.st[node.id], f = core.nodeFault(R, node.id);
    const kernel = core.kernelOf(R, node.id);
    const observed = kernel.observe ? core.callHook(R, node.id, 'observe') : null;
    if (observed !== null && observed !== undefined && !isRecord(observed)) fail(`node ${node.id} observe`, '{ health?, detail }', observed);
    const detail = {};
    for (const [key, value] of Object.entries(ns.counts)) detail[key] = value;
    for (const [key, hist] of Object.entries(ns.hists)) detail[`${key} p95 ms`] = core.percentile(R, hist, 0.95);
    for (const [key, label] of [['lostReplies', 'lost replies'], ['swallowed', 'swallowed'], ['hopLimited', 'hop limited'], ['staleJobs', 'stale job ops'], ['effectEvictions', 'idempotency evictions'], ['bypassed', 'bypassed']]) if (ns[key]) detail[label] = ns[key];
    if (observed && isRecord(observed.detail)) Object.assign(detail, observed.detail);
    let records;
    if (observed && observed.records !== undefined) {
      if (!isRecord(observed.records)) fail(`node ${node.id} observe.records`, 'named arrays of record objects', observed.records);
      let count = 0;
      for (const [name, rows] of Object.entries(observed.records)) {
        if (!Array.isArray(rows)) fail(`node ${node.id} observe.records.${name}`, 'array of record objects', rows);
        count += rows.length;
        if (count > R.eng.maxRecords) fail(`node ${node.id} observe.records`, `at most ${R.eng.maxRecords} records`, count);
        for (let i = 0; i < rows.length; i += 1) if (!Object.hasOwn(rows, i) || !isRecord(rows[i])) fail(`node ${node.id} observe.records.${name}[${i}]`, 'record object', rows[i]);
      }
      records = JSON.parse(JSON.stringify(observed.records));
    }
    const pick = (key, value) => (observed && Number.isFinite(observed[key]) ? observed[key] : value);
    const queue = pick('queue', st ? core.queueLength(st) : 0), busy = pick('busy', st ? st.busy.length : ns.live), capacity = pick('capacity', st ? st.cap : 0);
    let health = observed && observed.health !== undefined ? observed.health : null;
    if (health !== null && !HEALTH.includes(health)) fail(`node ${node.id} observe.health`, HEALTH.join('|'), health);
    if (f.down) health = 'down';
    else if (health === null) health = f.blackhole || f.dropReplies || f.slowFactor > 1 || f.errorRate > 0 ? 'degraded' : queue > 0 || (capacity > 0 && busy >= capacity) ? 'busy' : 'ok';
    const faults = core.faultTypesOn(R, 'node', node.id);
    const memoryPolicy = s.observability.memoryPolicy[node.id] || {}, heldMiB = s.observability.nodeMemory[node.id] || 0, peakMemoryMiB = s.observability.nodePeak[node.id] || 0; Object.assign(detail, { 'Held MiB': heldMiB, 'Peak MiB': peakMemoryMiB, 'Memory slowdown': memoryPolicy.factor || 1, 'GC paused': memoryPolicy.gcUntil !== null && memoryPolicy.gcUntil !== undefined && s.t < memoryPolicy.gcUntil, 'GC cycles': memoryPolicy.gcs || 0, 'OOM admissions': memoryPolicy.ooms || 0 });
    return {
      health, faults, heldMiB, peakMemoryMiB, queue, queueCapacity: pick('queueCapacity', st ? core.nodeParams(R, node.id)[kernel.station.queueCapacity] : 0), busy, capacity,
      utilization: st ? core.utilization(R, node.id) : 0,
      arrivals: ns.arrivals, served: ns.served, errors: ns.errors, rejected: ns.rejected,
      throughput: core.windowSum(ns.win, s.t, 0) / core.windowSpan(s.t),
      latency: latencySummary(R, ns.lat, ['p50', 'p95']), detail, ...(records ? { records } : {}),
    };
  }

  function observe(compiled, state, deps) {
    checkState(state);
    const R = core.runtime(compiled, state, deps, true), s = state, g = s.g;
    const completedWindow = windowCounts(R, 'completed'), failedWindow = windowCounts(R, 'failed');
    const latencyWindow = core.newHist(), fromBucket = core.seriesIndex(R, s.t) - core.latencyBuckets(R) + 1;
    for (const row of s.series.lw) if (row.i >= fromBucket) core.histMerge(latencyWindow, row);
    const networkRows = core.networkView(s), transitCount = new Map(); for (const row of networkRows) transitCount.set(row.edgeId, (transitCount.get(row.edgeId) || 0) + 1);
    const nodes = {}, edges = {};
    for (const node of compiled.nodes) nodes[node.id] = nodeView(R, node);
    for (const edge of compiled.edges) {
      const es = s.edges[edge.id], sent = core.windowSum(es.win, s.t, 0), errs = core.windowSum(es.win, s.t, 1);
      edges[edge.id] = { rate: sent / core.windowSpan(s.t), errorRate: sent ? Math.min(1, errs / sent) : 0, inTransit: transitCount.get(edge.id) || 0, faults: core.faultTypesOn(R, 'edge', edge.id) };
    }
    const failedBy = {}, observed = observability.view(s);
    for (const key of Object.keys(g.failedBy).sort()) failedBy[key] = g.failedBy[key];
    return {
      t: s.t, horizonSec: compiled.horizonSec, done: s.t >= compiled.horizonSec || s.error !== null, error: s.error,
      global: {
        unknownEffects: observed.unknownEffects, backgroundDeadlineMisses: observed.backgroundDeadlineMisses, memoryMiB: observed.memoryMiB, peakMemoryMiB: observed.peakMemoryMiB, offered: g.offered, completed: g.completed, failed: g.failed, failedBy, inFlight: g.offered - g.completed - g.failed,
        attempts: g.attempts, retries: g.retries, effects: g.effects, duplicateEffects: g.duplicateEffects, wastedWork: g.wastedWork, cost: g.cost,
        deadlineMisses: g.deadlineMisses,
        throughput: completedWindow / core.windowSpan(s.t, R.eng.seriesBucketSec), errorRate: completedWindow + failedWindow ? failedWindow / (completedWindow + failedWindow) : 0,
        latency: latencySummary(R, g.lat, ['p50', 'p95', 'p99', 'mean']),
        latencyWindow: latencySummary(R, latencyWindow, ['p50', 'p95', 'p99']),
      },
      series: seriesView(R),
      nodes, edges,
      transit: networkRows.slice(0, R.eng.transitRenderLimit),
      log: s.log.map(row => ({ ...row })), requests: observed.requests, attempts: observed.attempts, effects: observed.effects,
    };
  }

  function metrics(compiled, state, deps) {
    checkState(state);
    const R = core.runtime(compiled, state, deps, true), g = state.g, nodes = {}, edges = {}, failedBy = {};
    for (const key of Object.keys(g.failedBy).sort()) failedBy[key] = g.failedBy[key];
    for (const node of compiled.nodes) { const ns = state.nodes[node.id]; nodes[node.id] = { arrivals: ns.arrivals, served: ns.served, errors: ns.errors, rejected: ns.rejected, lostReplies: ns.lostReplies }; }
    for (const edge of compiled.edges) { const es = state.edges[edge.id]; edges[edge.id] = { sent: es.sent, replies: es.replies, lost: es.lost, dropped: es.dropped, errors: es.errors }; }
    return {
      t: state.t, error: state.error, offered: g.offered, completed: g.completed, failed: g.failed, failedBy, inFlight: g.offered - g.completed - g.failed,
      attempts: g.attempts, retries: g.retries, effects: g.effects, duplicateEffects: g.duplicateEffects, wastedWork: g.wastedWork, cost: g.cost, deadlineMisses: g.deadlineMisses,
      latency: latencySummary(R, g.lat, ['p50', 'p95', 'p99', 'mean']), nodes, edges,
    };
  }

  function inspect(compiled, state, requestId, deps) { checkState(state); return observability.inspectState(state, requestId); }
  return Object.freeze({ inspect, COMPILED_SCHEMA, CONTROL_KINDS, initialize, advance, applyControl, normalizeControl, observe, metrics });
});
