(function (root, factory) {
  const node = typeof module === 'object' && module.exports;
  const api = factory(
    node ? require('./engine.js') : root.SimulatteSystemDiagramEngine,
    node ? require('./diagram.js') : root.SimulatteSystemDiagramDocument,
    node ? require('../../shared/core/simulation/multirate-coordinator.js') : root.SimulatteMultirateCoordinator,
    node ? require('../../shared/contracts/world-spec.js') : root.SimulatteWorldSpec);
  if (node) module.exports = api; else root.SimulatteSystemDiagramRunner = api;
})(globalThis, function (engine, documentApi, coordinatorApi, worldSpec) {
  'use strict';
  // Binds the pure engine to one fixed-clock coordinator module. The display state runs the same
  // engine synchronously as an exact preview; controls enter the coordinator at their display time.
  const MODULE_ID = 'system-diagram';
  const REPLAY_SCHEMA = 'simulatte.systemDiagramReplay.v1';
  const CHECKPOINT_SCHEMA = 'simulatte.systemDiagramRunnerCheckpoint.v1';
  const IMPLEMENTATION_HASH = 'system-diagram-engine-v1';
  const CONTROL_ID_DIGITS = 6;
  const REPLAY_KEYS = Object.freeze(['schema', 'diagram', 'seed', 'controls', 'untilSec', 'metricsHash', 'worldSpecHash']);
  const hash = value => coordinatorApi.contentHash(value);
  const clone = value => JSON.parse(JSON.stringify(value));
  const wallMs = () => (globalThis.performance && typeof globalThis.performance.now === 'function' ? globalThis.performance.now() : Date.now());

  class RunnerError extends Error {
    constructor(path, expected, received) {
      super(`system-diagram-runner ${path}: expected ${expected}, received ${typeof received === 'string' ? received : JSON.stringify(received)}`);
      this.name = 'SimulatteSystemDiagramRunnerError';
      this.contract = 'system-diagram-runner'; this.path = path; this.expected = expected; this.received = received;
    }
  }
  const fail = (path, expected, received) => { throw new RunnerError(path, expected, received); };

  function libraryIdentity(library) {
    return { version: library.version, packIds: library.packIds, kernels: library.kernels, classes: library.classes, edgeParams: library.edgeParams, faultTypes: library.faultTypes, errorCodes: library.errorCodes };
  }
  function program(diagram, compiled, library, config, profileId = null) {
    const configHash = hash(config), libraryHash = hash(libraryIdentity(library));
    return worldSpec.finalizeWorldSpec({
      id: profileId ? `world:${profileId}` : `world:system-diagram:${compiled.diagramId}`, templateId: profileId || config.model,
      name: compiled.name, kind: 'system-diagram-simulation', description: config.claimBoundary, modules: [MODULE_ID],
      objects: compiled.nodes.map(n => ({ id: n.id, classId: n.classId, kernel: n.kernel })), controls: [],
      params: { diagram: clone(diagram), seed: compiled.seed, libraryVersion: library.version, libraryHash, configHash, compiledHash: hash(compiled), ...(profileId ? { profileId } : {}) },
      source: { schema: 'simulatte.worldSpecSource.v1', prompt: '', compilerConfig: { lane: 'system-diagram-document/v1', model: config.model } },
      authorship: { schema: 'simulatte.worldSpecAuthoring.v2', revision: 0, sources: [{ id: 'source:diagram', authority: 'userOverride', label: 'System diagram document' }], fieldProvenance: [{ path: '/params/diagram', authority: 'userOverride', sourceId: 'source:diagram' }], patches: [], reconciliations: [] },
      determinism: { schema: 'simulatte.worldSpecDeterminism.v1', requiredClasses: ['simulation-reproducible', 'replay-identified'], seed: compiled.seed, simulationTolerance: 0, pixelPolicy: null },
      dependencies: { schema: 'simulatte.worldSpecDependencies.v1', governedPacks: [], plugins: [], assets: [{ id: 'system-diagram-config', contentHash: configHash }, { id: 'system-diagram-class-library', contentHash: libraryHash }] },
      safety: { schema: 'simulatte.worldSpecSafety.v1', rules: [], status: 'not-declared' },
      unsupportedRequirements: [{ id: 'production-fidelity', reason: config.claimBoundary }], unresolvedAmbiguities: [],
    });
  }
  function controlBody(row) { const body = { ...row }; delete body.id; delete body.atSec; return body; }
  // Independent of the coordinator: a fresh engine run with each control applied at its recorded time.
  function rerun(compiled, deps, controls, untilSec) {
    const state = engine.initialize(compiled, deps);
    for (const row of controls) {
      if (!Number.isFinite(row.atSec) || row.atSec < state.t || row.atSec > untilSec) fail('controls[].atSec', `chronological time in [${state.t}, ${untilSec}]`, row.atSec);
      engine.advance(compiled, state, row.atSec, deps);
      engine.applyControl(compiled, state, controlBody(row), deps);
    }
    return engine.advance(compiled, state, untilSec, deps);
  }
  function checkDeps(deps) {
    if (!deps || !deps.library || !deps.config || !deps.kernels) fail('deps', '{ diagram, library, config, kernels }', Object.keys(deps || {}));
  }

  async function create({ diagram, library, config, kernels, profileId = null } = {}) {
    const deps = { library, config, kernels };
    checkDeps(deps);
    const validated = documentApi.validate(diagram, library, config);
    const compiled = documentApi.compile(validated, library, config);
    const spec = program(validated, compiled, library, config, profileId);
    const cadence = config.engine.authoritativeCadenceSec, horizon = compiled.horizonSec;
    let capturing = true, authoritative = null, display = engine.initialize(compiled, deps), time = 0, recorded = [], unsent = [], chain = Promise.resolve(), disposed = false;
    const module = {
      id: MODULE_ID, implementationId: config.model, implementationHash: IMPLEMENTATION_HASH, clock: { kind: 'fixed', intervalSeconds: cadence },
      lifecycle: {
        initialize: () => engine.initialize(compiled, deps),
        // The coordinator deep-freezes the state it passes in; the engine mutates its own copy.
        advance: ({ state: frozen, toTime, controls = [] }) => {
          const state = clone(frozen);
          engine.advance(compiled, state, Math.min(toTime, horizon), deps);
          for (const control of controls) engine.applyControl(compiled, state, control.payload, deps);
          if (capturing) authoritative = state;
          return { state, events: [], diagnostics: [] };
        },
        emit: () => [],
        checkpoint: ({ state }) => state,
        restore: ({ checkpoint }) => checkpoint,
        aggregate: () => fail('lifecycle.aggregate', 'no lossy aggregation for system diagrams', 'aggregate'),
        refine: () => fail('lifecycle.refine', 'no refinement for system diagrams', 'refine'),
        dispose() {},
      },
    };
    const coordinator = coordinatorApi.createCoordinator({ id: MODULE_ID, worldSpecContentHash: spec.contentHash, modules: [module], ports: [], couplingPlan: { schema: 'simulatte.couplingPlan.v1', id: 'system-diagram-coupling', edges: [], coupledSolvers: [] } });
    await coordinator.initialize();
    if (coordinator.snapshot().moduleStateHashes[MODULE_ID] !== hash(display)) fail('initialize', 'identical display and coordinator initial state', 'different hashes (a kernel reads state outside ctx)');
    engine.advance(compiled, display, 0, deps);

    const assertLive = () => { if (disposed) fail('runner', 'a runner that has not been disposed', 'disposed'); };
    // Coordinator work is serialized; controls injected meanwhile are enqueued before the next run.
    function exclusive(work) {
      const next = chain.then(async () => { assertLive(); for (const control of unsent.splice(0)) coordinator.enqueueControl(control); return work(); });
      chain = next.catch(() => {});
      return next;
    }
    async function authoritativeAt(target) {
      await coordinator.runUntil(target);
      const snap = coordinator.snapshot(), expected = snap.moduleStateHashes[MODULE_ID];
      const base = authoritative && hash(authoritative) === expected ? authoritative : (await coordinator.checkpoint()).states[MODULE_ID];
      const state = clone(base);
      if (hash(state) !== expected) fail('sync', `coordinator state hash ${expected}`, hash(state));
      return { state: engine.advance(compiled, state, target, deps), logicalTime: snap.logicalTime };
    }
    async function syncNow() {
      const target = time;
      const { state, logicalTime } = await authoritativeAt(target);
      const authHash = hash(state), displayHash = hash(display);
      if (authHash !== displayHash) fail('sync', `display state hash ${displayHash} at t=${target} to equal the authoritative coordinator state`, `${authHash} (coordinator round ${logicalTime})`);
      return { status: 'match', time: target, coordinatorTime: logicalTime, stateHash: displayHash };
    }

    function advanceTo(t) {
      assertLive();
      if (!Number.isFinite(t)) fail('advanceTo', 'finite time', t);
      const target = Math.min(t, horizon);
      if (target < time) fail('advanceTo', `time >= ${time}`, t);
      engine.advance(compiled, display, target, deps);
      time = target;
      return time;
    }
    function inject(control) {
      assertLive();
      if (recorded.length >= config.bounds.maxControls) fail('inject', `at most ${config.bounds.maxControls} controls (config.bounds.maxControls)`, recorded.length + 1);
      const body = engine.normalizeControl(compiled, control, deps);
      const id = `control-${String(recorded.length + 1).padStart(CONTROL_ID_DIGITS, '0')}`;
      engine.applyControl(compiled, display, body, deps);
      const row = { id, atSec: time, ...body };
      recorded.push(row);
      unsent.push({ id, logicalTime: time, authority: 'user', targetModuleIds: [MODULE_ID], payload: body });
      return clone(row);
    }
    function pump(budgetMs) {
      if (!Number.isFinite(budgetMs) || budgetMs < 0) fail('pump', 'budget in ms >= 0', budgetMs);
      return exclusive(async () => {
        const started = wallMs();
        let at = coordinator.snapshot().logicalTime;
        while (at + cadence <= time && wallMs() - started < budgetMs) {
          await coordinator.runUntil(at + cadence);
          const next = coordinator.snapshot().logicalTime;
          if (next === at) break;
          at = next;
        }
        return { time: at, behindSec: time - at };
      });
    }
    function checkpoint() {
      return exclusive(async () => {
        await coordinator.runUntil(time);
        return { schema: CHECKPOINT_SCHEMA, worldSpecHash: spec.contentHash, time, display: clone(display), controls: clone(recorded), coordinator: await coordinator.checkpoint() };
      });
    }
    function restore(cp) {
      if (!cp || cp.schema !== CHECKPOINT_SCHEMA || cp.worldSpecHash !== spec.contentHash || !Number.isFinite(cp.time) || cp.time < 0 || cp.time > horizon || !Array.isArray(cp.controls) || cp.controls.length > config.bounds.maxControls) fail('restore', 'bounded checkpoint bound to the accepted WorldSpec', cp && cp.schema);
      return exclusive(async () => {
        const expected = rerun(compiled, deps, cp.controls, cp.time);
        if (hash(expected) !== hash(cp.display) || cp.display.t !== cp.time || cp.coordinator?.worldSpecContentHash !== spec.contentHash) fail('restore.display', 'exact seeded causal state and matching program', 'forged or mismatched checkpoint');
        const at = cp.coordinator.logicalTime; if (!Number.isFinite(at) || at < 0 || at > cp.time) fail('restore.coordinator', 'logical time within the checkpoint', at);
        const authorControls = cp.controls.filter(c => c.atSec <= at), author = cp.coordinator.ledger?.length ? rerun(compiled, deps, authorControls, at) : engine.initialize(compiled, deps);
        if (hash(author) !== hash(cp.coordinator.states?.[MODULE_ID])) fail('restore.coordinator', 'exact authoritative causal state', 'forged or mismatched state');
        await coordinator.restore(cp.coordinator);
        display = clone(expected); time = cp.time; recorded = clone(cp.controls); authoritative = null; unsent = [];
        return time;
      });
    }
    function verify() {
      return exclusive(async () => {
        const synced = await syncNow();
        capturing = false;
        let ledger;
        try { ledger = await coordinator.replay(); } finally { capturing = true; }
        const metricsHash = hash(engine.metrics(compiled, display, deps));
        const fresh = rerun(compiled, deps, recorded, time), rerunHash = hash(engine.metrics(compiled, fresh, deps));
        return { status: ledger.status === 'match' && rerunHash === metricsHash && hash(fresh) === hash(display) ? 'match' : 'diverged', rounds: ledger.rounds === undefined ? null : ledger.rounds, metricsHash, ledger: ledger.status, rerunMetricsHash: rerunHash, time: synced.time };
      });
    }
    function exportReplay() {
      return { schema: REPLAY_SCHEMA, diagram: clone(validated), seed: compiled.seed, controls: recorded.map(row => { const out = clone(row); delete out.id; return out; }), untilSec: time, metricsHash: hash(engine.metrics(compiled, display, deps)), worldSpecHash: spec.contentHash };
    }
    return Object.freeze({
      compiled, seed: compiled.seed, horizon,
      time: () => time, advanceTo, view: () => ({ ...engine.observe(compiled, display, deps), worldSpecHash: spec.contentHash }), inspect: id => engine.inspect(compiled, display, id, deps), metrics: () => engine.metrics(compiled, display, deps),
      inject, controls: () => clone(recorded), sync: () => exclusive(syncNow), pump, checkpoint, restore, verify,
      program: () => clone(spec), exportReplay,
      dispose: () => exclusive(async () => { disposed = true; await coordinator.dispose(); }),
    });
  }

  function replay(doc, deps) {
    checkDeps(deps);
    if (!doc || doc.schema !== REPLAY_SCHEMA) fail('replay.schema', REPLAY_SCHEMA, doc && doc.schema);
    for (const key of Object.keys(doc)) if (!REPLAY_KEYS.includes(key)) fail(`replay.${key}`, REPLAY_KEYS.join('|'), key);
    if (!Array.isArray(doc.controls)) fail('replay.controls', 'array of recorded controls', doc.controls);
    const engineDeps = { library: deps.library, config: deps.config, kernels: deps.kernels };
    const validated = documentApi.validate(doc.diagram, deps.library, deps.config);
    const compiled = documentApi.compile(validated, deps.library, deps.config);
    if (doc.seed !== compiled.seed) fail('replay.seed', `diagram seed ${compiled.seed}`, doc.seed);
    if (!Number.isFinite(doc.untilSec) || doc.untilSec < 0 || doc.untilSec > compiled.horizonSec) fail('replay.untilSec', `time in [0, ${compiled.horizonSec}]`, doc.untilSec);
    const state = rerun(compiled, engineDeps, doc.controls, doc.untilSec);
    const metricsHash = hash(engine.metrics(compiled, state, engineDeps));
    const worldSpecHash = program(validated, compiled, deps.library, deps.config, deps.profileId || null).contentHash;
    return { status: metricsHash === doc.metricsHash && worldSpecHash === doc.worldSpecHash ? 'match' : 'diverged', metricsHash, expectedMetricsHash: doc.metricsHash, worldSpecMatch: worldSpecHash === doc.worldSpecHash, untilSec: doc.untilSec };
  }

  return Object.freeze({ MODULE_ID, REPLAY_SCHEMA, CHECKPOINT_SCHEMA, RunnerError, create, replay, program, rerun });
});
