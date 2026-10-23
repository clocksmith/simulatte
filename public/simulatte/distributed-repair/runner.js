(function (root, factory) {
  const node = typeof module === 'object' && module.exports;
  const api = factory(node ? require('./model.js') : root.SimulatteDistributedRepair,
    node ? require('../../shared/core/simulation/multirate-coordinator.js') : root.SimulatteMultirateCoordinator,
    node ? require('./architecture.js') : root.SimulatteRepairArchitecture,
    node ? require('../../shared/contracts/world-spec.js') : root.SimulatteWorldSpec);
  if (node) module.exports = api; else root.SimulatteDistributedRepairRunner = api;
})(globalThis, function (model, coordinator, architecture, worldSpec) {
  'use strict';
  const HORIZON = 40;
  function program(policy, seed, graph, config, profileId = null) {
    architecture.validate(graph); model.validateConfig(config);
    return worldSpec.finalizeWorldSpec({ id: profileId ? `world:${profileId}` : 'world:distributed-repair', templateId: profileId || 'distributed-repair/v1', name: profileId ? 'System Diagram Simulator' : 'Distributed repair',
      kind: 'distributed-task-experiment', description: config.claimBoundary, modules: ['distributed-repair'], objects: structuredClone(graph.nodes), controls: [],
      params: { architecture: structuredClone(graph), config: structuredClone(config), policy, seed, ...(profileId ? { profileId } : {}) },
      source: { schema: 'simulatte.worldSpecSource.v1', prompt: '', compilerConfig: { lane: 'declared-task-architecture/v1', model: model.MODEL } },
      authorship: { schema: 'simulatte.worldSpecAuthoring.v2', revision: 0, sources: [{ id: 'source:architecture', authority: 'userOverride', label: 'Accepted task architecture' }], fieldProvenance: [{ path: '/params/architecture', authority: 'userOverride', sourceId: 'source:architecture' }], patches: [], reconciliations: [] },
      determinism: { schema: 'simulatte.worldSpecDeterminism.v1', requiredClasses: ['simulation-reproducible', 'replay-identified'], seed, simulationTolerance: 1e-9, pixelPolicy: null },
      dependencies: { schema: 'simulatte.worldSpecDependencies.v1', governedPacks: [], plugins: [], assets: [{ id: 'distributed-repair-config', contentHash: worldSpec.contentHash(config) }] },
      safety: { schema: 'simulatte.worldSpecSafety.v1', rules: [], status: 'not-declared' },
      unsupportedRequirements: [{ id: 'production-fidelity', reason: config.claimBoundary }], unresolvedAmbiguities: [] });
  }
  async function create(policy = 'baseline', seed = 42, graph, config = typeof module === 'object' && module.exports ? require('../../data/distributed-repair/config.json') : null, profileId = null) {
    model.validateConfig(config);
    graph = structuredClone(architecture.validate(graph || architecture.initial()));
    const spec = program(policy, seed, graph, config, profileId);
    const engine = coordinator.createCoordinator({ id: 'repair-experiment', worldSpecContentHash: spec.contentHash,
      modules: [model.moduleRecord(policy, seed, graph, config)], ports: [], couplingPlan: { schema: 'simulatte.couplingPlan.v1', id: 'repair-coupling', edges: [], coupledSolvers: [] } });
    await engine.initialize();
    await engine.runUntil(0);
    let state = null, time = 0, saved = null;
    async function capture() { state = (await engine.checkpoint()).states['distributed-repair']; return snapshot(); }
    function snapshot() { const observed = state ? model.observe(state, time) : null; return { time, state: observed, metrics: observed ? model.metrics(observed) : null }; }
    async function runUntil(target) { if (target < time || target > HORIZON) throw Error('Invalid experiment time'); await engine.runUntil(target); time = target; return capture(); }
    async function checkpoint() { saved = { time, engine: await engine.checkpoint() }; return structuredClone(saved); }
    async function restore(value = saved) { if (!value) throw Error('No checkpoint saved'); await engine.restore(value.engine); time = value.time; return capture(); }
    await capture();
    return Object.freeze({ program: () => structuredClone(spec), snapshot, runUntil, checkpoint, restore, inspect: id => model.inspect(model.observe(state, time), id),
      verify: () => engine.replay(), repair: async () => { engine.enqueueControl({ id: `repair-${engine.getLedger().length}`, logicalTime: time, authority: 'user', targetModuleIds: ['distributed-repair'], payload: { kind: 'repair' } }); return runUntil(time); },
      dispose: () => engine.dispose() });
  }
  return Object.freeze({ create, program, HORIZON });
});
