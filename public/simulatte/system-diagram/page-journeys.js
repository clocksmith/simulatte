(function (root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('./diagram.js') : root.SimulatteSystemDiagramDocument);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SimulatteSystemDiagramJourneys = api;
})(globalThis, function (documents) {
  'use strict';
  const SOURCE_KERNELS = Object.freeze(['source', 'cron', 'crawler', 'eventSource']);
  const clone = value => JSON.parse(JSON.stringify(value));
  function stable(value) {
    if (Array.isArray(value)) return value.map(stable);
    if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
    return value;
  }
  function identity(value) {
    let h = 2166136261;
    for (const ch of JSON.stringify(stable(value))) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
    return `fnv1a32:${(h >>> 0).toString(16).padStart(8, '0')}`;
  }
  function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
  function demand(diagram, library, config) {
    const sources = diagram.nodes.map(node => ({ node, resolved: documents.resolveNodeParams(node, diagram, library, config) }))
      .filter(row => SOURCE_KERNELS.includes(row.resolved.klass.kernel))
      .map(({ node, resolved }) => ({ id: node.id, kernel: resolved.klass.kernel, params: resolved.values })).sort((a, b) => a.id.localeCompare(b.id));
    if (!sources.length) throw Error('Paired comparison requires an authored source, scheduler, crawler or event source.');
    return { seed: diagram.seed, horizonSec: diagram.run.horizonSec, sources, faults: clone(diagram.faults) };
  }
  function pairInputs(baseline, repaired, library, config) {
    const a = documents.validate(baseline, library, config), b = documents.validate(repaired, library, config);
    const left = demand(a, library, config), right = demand(b, library, config);
    if (JSON.stringify(stable(left)) !== JSON.stringify(stable(right))) throw Error('Paired comparison requires identical seed, source definitions, horizon and scheduled faults. Change repair policies or downstream architecture while keeping demand and fault timing fixed.');
    return { baseline: a, repaired: b, demand: left, demandHash: identity(left) };
  }
  function arrivals(view, sourceIds) {
    return (view.requests || []).filter(request => sourceIds.includes(request.sourceId)).map(request => {
      if (request.input === undefined) throw Error('Source workload input records are required to prove identical payloads. No paired workload claim is available.');
      return { id: request.id, sourceId: request.sourceId, arrival: request.arrival, payloadType: request.payloadType, deadline: request.deadline, input: clone(request.input) };
    })
      .sort((a, b) => a.arrival - b.arrival || a.sourceId.localeCompare(b.sourceId) || a.id.localeCompare(b.id));
  }
  async function compare({ baseline, repaired, library, config, kernels, profileId, createRunner, controls = [], untilSec }) {
    const pair = pairInputs(baseline, repaired, library, config), until = untilSec === undefined ? pair.demand.horizonSec : untilSec;
    if (!Number.isFinite(until) || until < 0 || until > pair.demand.horizonSec) throw Error('Comparison horizon is outside the authored run.');
    const commonControls = clone(controls);
    if (!Array.isArray(commonControls) || commonControls.some((c, i) => !Number.isFinite(c.atSec) || c.atSec < 0 || c.atSec > pair.demand.horizonSec || i && c.atSec < commonControls[i - 1].atSec)) throw Error('Comparison controls require ordered logical times within the authored horizon.');
    const rows = [], sourceIds = pair.demand.sources.map(source => source.id);
    for (const [label, diagram] of [['Baseline', pair.baseline], ['Repair', pair.repaired]]) {
      const runner = await createRunner({ diagram, library, config, kernels, profileId });
      try {
        for (const control of commonControls) {
          if (control.atSec > until) continue;
          runner.advanceTo(control.atSec);
          const body = clone(control); delete body.atSec; delete body.id; runner.inject(body);
        }
        runner.advanceTo(until);
        const view = clone(runner.view());
        if (view.error) throw Error(`${label} comparison stopped: ${view.error}`);
        const proof = await runner.verify();
        if (proof.status !== 'match') throw Error(`${label} comparison replay diverged.`);
        rows.push({ label, diagramHash: identity(diagram), worldSpecHash: runner.program().contentHash, metricsHash: proof.metricsHash, replay: clone(runner.exportReplay()),
          time: view.t, metrics: view.global, arrivals: arrivals(view, sourceIds), requests: view.requests || [], nodes: view.nodes, assumptions: config.claimBoundary, error: view.error || null });
      } finally { await runner.dispose(); }
    }
    if (JSON.stringify(rows[0].arrivals) !== JSON.stringify(rows[1].arrivals)) throw Error('Actual source request IDs, arrival times or payloads differ. This workload is response-coupled or shares random draws with changed behavior; no paired comparison is claimed.');
    return freeze({ schema: 'simulatte.systemDiagramComparison.v1', demandHash: pair.demandHash, arrivalHash: identity(rows[0].arrivals),
      seed: pair.demand.seed, untilSec: until, faults: clone(pair.demand.faults), controls: commonControls, baseline: rows[0], repair: rows[1],
      boundary: 'Independent sequential synthetic runs with identical authored demand, scheduled faults, recorded controls and verified actual source arrivals. Differences are model predictions, not production proof.' });
  }
  const METRICS = Object.freeze([['offered', 'Requests offered'], ['completed', 'Completed'], ['failed', 'Failed'], ['retries', 'Retries'], ['duplicateEffects', 'Duplicate effects'],
    ['unknownEffects', 'Unknown commit outcomes'], ['deadlineMisses', 'Deadline misses'], ['wastedWork', 'Wasted work'], ['peakMemoryMiB', 'Peak memory, MiB']]);
  // Rows for a side-by-side readout; every value comes from the two verified comparison runs.
  function summarize(comparison) {
    const a = comparison.baseline.metrics, b = comparison.repair.metrics, p95 = m => Number.isFinite(m.latency?.p95) ? m.latency.p95 : null;
    const rows = METRICS.filter(([key]) => Number.isFinite(a[key]) || Number.isFinite(b[key])).map(([key, label]) => ({ key, label, baseline: a[key] ?? null, repair: b[key] ?? null }));
    rows.splice(3, 0, { key: 'latency.p95', label: 'p95 latency, ms', baseline: p95(a), repair: p95(b) });
    for (const reason of [...new Set([...Object.keys(a.failedBy || {}), ...Object.keys(b.failedBy || {})])].sort()) rows.push({ key: `failedBy.${reason}`, label: `Failed: ${reason}`, baseline: a.failedBy?.[reason] || 0, repair: b.failedBy?.[reason] || 0 });
    return rows;
  }
  async function withSuspendedRun({ current, action, createReplacement, onSuspend = () => {}, onRestore = () => {} }) {
    const checkpoint = current ? await current.checkpoint() : null;
    onSuspend();
    await current?.dispose();
    try { return await action(); }
    finally {
      if (checkpoint) {
        const replacement = await createReplacement();
        try { await replacement.restore(checkpoint); onRestore(replacement); }
        catch (error) { await replacement.dispose(); throw error; }
      }
    }
  }
  return Object.freeze({ SOURCE_KERNELS, identity, demand, pairInputs, arrivals, compare, summarize, withSuspendedRun });
});
