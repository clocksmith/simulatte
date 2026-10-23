(function (root, factory) {
  const node = typeof module === 'object' && module.exports;
  const api = factory(node ? require('./engine-core.js') : root.SimulatteSystemDiagramEngineCore);
  if (node) module.exports = api; else root.SimulatteSystemDiagramEngine = api;
})(globalThis, function (core) {
  'use strict';
  if (!core) throw Error('System Diagram engine core is required');
  function initialize(compiled, deps) { const state = core.initial(compiled, deps); core.attach(compiled, state, deps).initialize(); return state; }
  function advance(compiled, state, toTime, deps) { const engine = core.attach(compiled, state, deps); engine.advance(toTime); engine.reconcile(); return state; }
  function applyControl(compiled, state, control, deps) { const engine = core.attach(compiled, state, deps); engine.control(control); engine.reconcile(); return state; }
  function requests(state) {
    const grouped = new Map(), attempts = new Map(), effects = new Map(), calls = new Map(), calleeAttempts = new Set();
    for (const c of Object.values(state.calls)) if (c.status !== 'finished') { if (!calls.has(c.jobId)) calls.set(c.jobId, []); calls.get(c.jobId).push(c.id); }
    for (const job of Object.values(state.jobs)) if (job.status !== 'finished') {
      if (!grouped.has(job.msg.trace)) grouped.set(job.msg.trace, []); grouped.get(job.msg.trace).push(job);
      if (job.caller) calleeAttempts.add(job.caller.attemptId);
    }
    const transit = new Map();
    for (const a of Object.values(state.attempts)) { attempts.set(a.requestId, (attempts.get(a.requestId) || 0) + 1);
      if (a.status === 'in-flight' && !calleeAttempts.has(a.id)) { if (!transit.has(a.requestId)) transit.set(a.requestId, []); transit.get(a.requestId).push({ kind: 'network-or-timeout', nodeId: a.nodeId, attemptId: a.id, edgeId: a.edgeId, eventId: a.cause }); }
    }
    for (const e of state.effects) effects.set(e.requestId, (effects.get(e.requestId) || 0) + 1);
    return Object.values(state.requests).map(r => { const jobs = grouped.get(r.id) || [], blocked = jobs.map(job => ({ kind: job.status, nodeId: job.nodeId, jobId: job.id, attemptId: job.caller?.attemptId || null, calls: calls.get(job.id) || [], eventId: job.lastEvent }));
      blocked.push(...(transit.get(r.id) || []));
      return { ...core.clone(r), blocker: blocked[0] || null, blockers: blocked, attempts: attempts.get(r.id) || 0,
        effects: effects.get(r.id) || 0, backgroundPending: r.status === 'in-flight' ? 0 : jobs.length,
        deadlineMissed: r.deadline !== null && (r.completedAt === null ? state.t : r.completedAt) > r.deadline,
        retainedMiB: jobs.reduce((sum, j) => sum + (state.nodes[j.nodeId].held[j.id] || 0), 0) };
    });
  }
  function observe(compiled, state, deps) {
    const engine = core.attach(compiled, state, deps), t = state.t, h = deps.config.engine.histogram, rows = Object.values(state.requests), window5 = rows.filter(r => r.arrival >= t - 5), completed = rows.filter(r => r.status === 'completed');
    const last5 = rows.filter(r => r.completedAt !== null && r.completedAt >= t - 5), last10 = completed.filter(r => r.completedAt >= t - 10), windowHist = core.histogram(h);
    for (const r of last10) core.sample(windowHist, r.latencyMs, h);
    const nodeViews = {}, edgeViews = {};
    for (const n of compiled.nodes) {
      const ns = state.nodes[n.id], fault = engine.fault(n.id), p = engine.params(n.id), station = deps.kernels.get(n.kernel).station;
      const capacity = station ? p[station.concurrency] : 0, extra = engine.invoke(n.id, 'observe') || {}, activeMs = ns.busyIntegral + ns.active.length * (t - ns.lastBusyT);
      const latency = core.percentiles(ns.latency, h), health = fault.down ? 'down' : extra.health || (fault.slowFactor > 1 || fault.errorRate > 0 || fault.blackhole || fault.dropReplies ? 'degraded' : ns.active.length ? 'busy' : 'ok');
      nodeViews[n.id] = { health, faults: [...new Set(Object.values(ns.faults).map(f => f.type))], queue: ns.queue.length + Number(extra.detail?.Queued || 0), queueCapacity: station ? p[station.queueCapacity] : p.capacity || 0,
        busy: ns.active.length, capacity, utilization: ns.capacityIntegral + ns.lastCapacity * (t - ns.lastBusyT) > 0 ? activeMs / (ns.capacityIntegral + ns.lastCapacity * (t - ns.lastBusyT)) : 0, arrivals: ns.arrivals, served: ns.served, errors: ns.errors, rejected: ns.rejected,
        throughput: t ? ns.served / t : 0, latency: { p50: latency.p50, p95: latency.p95 }, heldMiB: ns.memoryMiB, peakMemoryMiB: ns.peakMemoryMiB,
        detail: { ...ns.counters, ...extra.detail, 'Held MiB': ns.memoryMiB, 'Peak MiB': ns.peakMemoryMiB, ...(p.memoryLimitMiB !== undefined ? { 'Memory limit MiB': p.memoryLimitMiB } : {}) } };
    }
    for (const e of compiled.edges) { const es = state.edges[e.id]; edgeViews[e.id] = { rate: t ? es.delivered / t : 0, errorRate: es.sent ? es.errors / es.sent : 0, inTransit: es.inTransit, faults: [...new Set(Object.values(es.faults).map(f => f.type))] }; }
    const global = { ...core.clone(state.global), inFlight: rows.filter(r => r.status === 'in-flight').length, activeJobs: state.activeJobs, inTransit: state.activeTransits,
      throughput: last5.filter(r => r.status === 'completed').length / Math.min(5, t || 5), errorRate: last5.length ? last5.filter(r => r.status !== 'completed').length / last5.length : 0,
      latency: core.percentiles(state.latency, h), latencyWindow: core.percentiles(windowHist, h), deadlineMisses: rows.filter(r => r.deadline !== null && (r.completedAt === null ? t : r.completedAt) > r.deadline).length };
    const bucket = deps.config.engine.seriesBucketSec, start = Math.max(0, Math.floor((t - deps.config.engine.seriesWindowSec) / bucket) * bucket), count = Math.floor((t - start) / bucket) + 1;
    const series = { bucketSec: bucket, startSec: start, offered: Array(count).fill(0), completed: Array(count).fill(0), failed: Array(count).fill(0), p95: Array(count).fill(0) }, histograms = Array.from({ length: count }, () => core.histogram(h));
    for (const r of rows) { let i = Math.floor((r.arrival - start) / bucket); if (i >= 0 && i < count) series.offered[i]++;
      if (r.completedAt !== null) { i = Math.floor((r.completedAt - start) / bucket); if (i >= 0 && i < count) { series[r.status === 'completed' ? 'completed' : 'failed'][i]++; if (r.status === 'completed') core.sample(histograms[i], r.latencyMs, h); } }
    }
    histograms.forEach((hist, i) => { series.p95[i] = core.percentiles(hist, h).p95; });
    void window5;
    return { t, horizonSec: compiled.horizonSec, done: Boolean(state.error || t >= compiled.horizonSec), error: state.error, global, series, nodes: nodeViews, edges: edgeViews,
      transit: core.clone(state.transit.filter(row => row.t0 <= t && row.t1 >= t)), log: core.clone(state.log), requests: requests(state), attempts: core.clone(Object.values(state.attempts)), effects: core.clone(state.effects) };
  }
  function metrics(compiled, state, deps) { const view = observe(compiled, state, deps); return { t: view.t, error: view.error, global: view.global, nodes: view.nodes, edges: view.edges }; }
  function inspect(compiled, state, requestId, deps) {
    const r = requests(state).find(r => r.id === requestId); if (!r) return null;
    const selected = new Set(state.history.filter(e => e.requestId === requestId).map(e => e.id)), byId = new Map(state.history.map(e => [e.id, e]));
    function causes(id) { for (const cause of byId.get(id)?.causes || []) if (!selected.has(cause)) { selected.add(cause); causes(cause); } } [...selected].forEach(causes);
    return core.clone({ request: r, blocker: r.blocker, blockers: r.blockers, attempts: Object.values(state.attempts).filter(a => a.requestId === requestId), effects: state.effects.filter(e => e.requestId === requestId),
      jobs: Object.values(state.jobs).filter(j => j.msg.trace === requestId), history: state.history.filter(e => selected.has(e.id)) });
  }
  return Object.freeze({ initialize, advance, applyControl, observe, metrics, inspect });
});
