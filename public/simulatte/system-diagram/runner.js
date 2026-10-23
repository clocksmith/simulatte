(function (root, factory) {
  const node = typeof module === 'object' && module.exports;
  const api = factory(node ? require('./diagram.js') : root.SimulatteSystemDiagramDocument,
    node ? require('./engine.js') : root.SimulatteSystemDiagramEngine,
    node ? require('../../shared/core/simulation/multirate-coordinator.js') : root.SimulatteMultirateCoordinator,
    node ? require('../../shared/contracts/world-spec.js') : root.SimulatteWorldSpec);
  if (node) module.exports = api; else root.SimulatteSystemDiagramRunner = api;
})(globalThis, function (documentApi, engine, coordinator, worldSpec) {
  'use strict';
  if (!documentApi || !engine || !coordinator || !worldSpec) throw Error('System Diagram runner requires document, engine, coordinator and WorldSpec contracts');
  const MODULE = 'system-diagram';
  const clone = value => structuredClone(value), hash = value => worldSpec.contentHash(value);
  function program(diagram, library, config, profileId = 'system-diagram-v1') {
    const accepted = documentApi.validate(diagram, library, config), compiled = documentApi.compile(accepted, library, config);
    return worldSpec.finalizeWorldSpec({ id: `world:${profileId}`, templateId: profileId, name: accepted.name || 'System Diagram Simulator', kind: 'executable-system-diagram',
      description: config.claimBoundary, modules: [MODULE], objects: clone(compiled.nodes), controls: [], params: { diagram: accepted, compiledHash: hash(compiled), seed: accepted.seed, profileId, model: config.model, libraryHash: hash(library), configHash: hash(config) },
      source: { schema: 'simulatte.worldSpecSource.v1', prompt: '', compilerConfig: { lane: 'declared-system-diagram/v1', model: config.model } },
      authorship: { schema: 'simulatte.worldSpecAuthoring.v2', revision: 0, sources: [{ id: 'source:system-diagram', authority: 'userOverride', label: 'Accepted diagram, class defaults and instance overrides' }], fieldProvenance: [{ path: '/params/diagram', authority: 'userOverride', sourceId: 'source:system-diagram' }], patches: [], reconciliations: [] },
      determinism: { schema: 'simulatte.worldSpecDeterminism.v1', requiredClasses: ['simulation-reproducible', 'replay-identified'], seed: accepted.seed, simulationTolerance: 1e-9, pixelPolicy: null },
      dependencies: { schema: 'simulatte.worldSpecDependencies.v1', governedPacks: [], plugins: [], assets: [{ id: 'system-diagram-library', contentHash: hash(library) }, { id: 'system-diagram-config', contentHash: hash(config) }] },
      safety: { schema: 'simulatte.worldSpecSafety.v1', rules: [], status: 'not-declared' }, unsupportedRequirements: [{ id: 'production-fidelity', reason: config.claimBoundary }, { id: 'live-execution', reason: 'Synthetic only; no actual infrastructure, scraping, model inference, clinical decisions or financial transactions.' }], unresolvedAmbiguities: [] });
  }
  async function create({ diagram, library, config, kernels, profileId = 'system-diagram-v1' }) {
    const accepted = documentApi.validate(diagram, library, config), compiled = documentApi.compile(accepted, library, config), deps = { library, config, kernels };
    const spec = program(accepted, library, config, profileId), initial = () => engine.initialize(compiled, deps);
    let display = initial(), recorded = [], disposed = false, authoritativeTime = 0, syncSequence = 0, queuedCount = 0, authoritativeHash = null, serial = Promise.resolve();
    engine.advance(compiled, display, 0, deps);
    const module = { id: MODULE, implementationId: config.model, implementationHash: `system-diagram-engine-v1:${hash({ library, config })}`, clock: { kind: 'fixed', intervalSeconds: config.engine.authoritativeCadenceSec },
      lifecycle: { initialize: initial, advance: ({ state, toTime, controls = [] }) => { const next = clone(state); engine.advance(compiled, next, toTime, deps); for (const c of controls) if (c.payload.kind !== '__sync') engine.applyControl(compiled, next, c.payload, deps); return { state: next, events: [], diagnostics: next.error ? [{ kind: 'run-stopped', message: next.error }] : [] }; },
        emit: () => [], checkpoint: ({ state }) => clone(state), restore: ({ checkpoint }) => clone(checkpoint), aggregate: () => { throw Error('System Diagram lossy aggregation is unsupported'); }, refine: () => { throw Error('System Diagram refinement is unsupported'); }, dispose() {} } };
    const authority = coordinator.createCoordinator({ id: 'system-diagram-run', worldSpecContentHash: spec.contentHash, modules: [module], ports: [], couplingPlan: { schema: 'simulatte.couplingPlan.v1', id: 'system-diagram-coupling', edges: [], coupledSolvers: [] } });
    await authority.initialize();
    function usable() { if (disposed) throw Error('System Diagram runner is disposed'); }
    function advanceTo(time) { usable(); if (!Number.isFinite(time)) throw Error('Advance time must be finite'); const target = Math.min(compiled.horizonSec, time); if (target < display.t) throw Error('Reset or restore to run backward'); engine.advance(compiled, display, target, deps); return view(); }
    function view() { usable(); return { ...engine.observe(compiled, display, deps), worldSpecHash: spec.contentHash }; }
    function inject(control) { usable(); if (recorded.length >= config.bounds.maxControls) throw Error('Live control bound reached'); const candidate = clone(display); engine.applyControl(compiled, candidate, control, deps); display = candidate; const row = { ...clone(control), atSec: display.t }; recorded.push(row); return clone(row); }
    function queueControls(until) { while (queuedCount < recorded.length && recorded[queuedCount].atSec <= until) { const c = recorded[queuedCount]; authority.enqueueControl({ id: `live-${String(queuedCount + 1).padStart(8, '0')}`, logicalTime: c.atSec, authority: 'user', targetModuleIds: [MODULE], payload: clone(c) }); queuedCount++; } }
    async function catchUp(target, expected) { usable();
      const covered = recorded.slice(queuedCount).every(c => c.atSec > target);
      if (covered && target === authoritativeTime && expected && authoritativeHash === hash(expected)) return authority.checkpoint();
      queueControls(target); authority.enqueueControl({ id: `sync-${String(++syncSequence).padStart(8, '0')}`, logicalTime: target, authority: 'runtime', targetModuleIds: [MODULE], payload: { kind: '__sync' } }); await authority.runUntil(target); authoritativeTime = target;
      const cp = await authority.checkpoint(); authoritativeHash = hash(cp.states[MODULE]); if (expected && authoritativeHash !== hash(expected)) throw Error('Display preview diverged from authoritative coordinator state'); return cp;
    }
    function sync() { const target = display.t, expected = clone(display); const task = serial.then(() => catchUp(target, expected)); serial = task.then(() => undefined, () => undefined); return task; }
    async function pump(budgetMs) { usable(); if (!Number.isFinite(budgetMs) || budgetMs <= 0) return; const target = Math.min(display.t, authoritativeTime + config.engine.authoritativeCadenceSec), expected = target === display.t ? clone(display) : null; const task = serial.then(() => catchUp(target, expected)); serial = task.then(() => undefined, () => undefined); await task; }
    async function checkpoint() { const cp = await sync(); return { schema: 'simulatte.systemDiagramCheckpoint.v1', worldSpecHash: spec.contentHash, untilSec: display.t, display: clone(display), controls: clone(recorded), coordinator: cp, syncSequence, queuedCount }; }
    function rerun(controls, until) { const next = initial(); for (const row of controls) { if (!Number.isFinite(row.atSec) || row.atSec < next.t || row.atSec > until) throw Error('Invalid replay control timing'); engine.advance(compiled, next, row.atSec, deps); engine.applyControl(compiled, next, row, deps); } engine.advance(compiled, next, until, deps); return next; }
    async function restore(cp) { usable(); await serial; if (!cp || cp.schema !== 'simulatte.systemDiagramCheckpoint.v1' || cp.worldSpecHash !== spec.contentHash || !Array.isArray(cp.controls) || cp.controls.length > config.bounds.maxControls || !Number.isFinite(cp.untilSec) || cp.untilSec < 0 || cp.untilSec > compiled.horizonSec) throw Error('Checkpoint does not match accepted System Diagram program');
      const expected = rerun(cp.controls, cp.untilSec); if (hash(expected) !== hash(cp.display) || hash(expected) !== hash(cp.coordinator?.states?.[MODULE])) throw Error('Checkpoint causal state does not match seeded replay');
      await authority.restore(cp.coordinator); display = clone(expected); recorded = clone(cp.controls); queuedCount = cp.queuedCount; syncSequence = cp.syncSequence; authoritativeTime = cp.untilSec; authoritativeHash = hash(expected); return view(); }
    async function verify() { await sync(); const replay = await authority.replay(), independent = rerun(recorded, display.t), matches = replay.status === 'match' && hash(independent) === hash(display); return { status: matches ? 'match' : 'diverged', rounds: replay.rounds, metricsHash: hash(engine.metrics(compiled, display, deps)) }; }
    function exportReplay() { return { schema: 'simulatte.systemDiagramReplay.v1', diagram: clone(accepted), seed: accepted.seed, controls: clone(recorded), untilSec: display.t, metricsHash: hash(engine.metrics(compiled, display, deps)), worldSpecHash: spec.contentHash }; }
    async function dispose() { if (disposed) return; await serial; await authority.dispose(); disposed = true; }
    return Object.freeze({ compiled, seed: compiled.seed, horizon: compiled.horizonSec, time: () => display.t, advanceTo, view, inject, controls: () => clone(recorded), sync, pump, checkpoint, restore, verify,
      program: () => clone(spec), inspect: id => engine.inspect(compiled, display, id, deps), exportReplay, dispose });
  }
  async function replay(doc, deps) { if (!doc || doc.schema !== 'simulatte.systemDiagramReplay.v1' || doc.seed !== doc.diagram?.seed || !Array.isArray(doc.controls) || doc.controls.length > deps.config.bounds.maxControls) throw Error('Invalid System Diagram replay document'); const run = await create({ ...deps, diagram: doc.diagram });
    try { if (run.program().contentHash !== doc.worldSpecHash) throw Error('Replay program hash does not match'); for (const c of doc.controls) { run.advanceTo(c.atSec); run.inject(c); } run.advanceTo(doc.untilSec); const result = await run.verify(); if (result.metricsHash !== doc.metricsHash) throw Error('Replay metrics diverged'); return { ...result, view: run.view() }; } finally { await run.dispose(); }
  }
  return Object.freeze({ create, program, replay });
});
