(function attachSimulatteSolverCompiler(root, factory) {
  const registryApi = typeof module === 'object' && module.exports
    ? require('./simulatte-solver-registry.js')
    : root.SimulatteSolverRegistry;
  const api = factory(registryApi || {});
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.SimulatteSolverCompiler = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createSolverCompilerApi(registryApi = {}) {
  const SOLVER_GRAPH_SCHEMA = 'simulatte.solverGraph.v1';
  const SCHEDULE = Object.freeze([
    'controls',
    'sources',
    'fields',
    'couplings',
    'constraints',
    'collisions',
    'derivedReadouts',
    'events',
  ]);

  function compileSolverGraph(physicsIR = {}, validationReceipt = null) {
    const registry = registryApi.createSolverRegistry ? registryApi.createSolverRegistry() : fallbackRegistry();
    const fields = Array.isArray(physicsIR.stateFields) ? physicsIR.stateFields : [];
    const channels = {};
    const channelMetadata = {};
    for (const field of fields) {
      channels[field.id] = cloneValue(field.initial);
      channelMetadata[field.id] = {
        name: field.name,
        units: field.units,
        type: field.type,
        domainId: field.domainId,
        entityId: field.entityId,
        bounds: field.bounds || null,
      };
    }
    const steps = [];
    const warnings = [];
    for (const operator of physicsIR.operators || []) {
      const solver = registry.operatorFor ? registry.operatorFor(operator.type) : null;
      if (!solver) {
        warnings.push({ operatorId: operator.id, reason: `missing solver for ${operator.type}` });
        continue;
      }
      steps.push({
        operatorId: operator.id,
        operatorType: operator.type,
        solverId: solver.id,
        stage: operator.stage || stageForOperator(operator.type),
        reads: operator.reads || operator.inputs || [],
        writes: operator.writes || operator.outputs || [],
        inputs: operator.inputs || operator.reads || [],
        outputs: operator.outputs || operator.writes || [],
        params: { ...(operator.params || {}) },
        stableDt: solver.stableDt || 0.05,
      });
    }
    steps.sort((a, b) => scheduleIndex(a.stage) - scheduleIndex(b.stage));
    return {
      schema: SOLVER_GRAPH_SCHEMA,
      sourceIR: physicsIR.schema || '',
      channels,
      channelMetadata,
      steps,
      schedule: SCHEDULE.slice(),
      readouts: physicsIR.readouts || [],
      receipt: validationReceipt || physicsIR.receipt || null,
      warnings,
      provenance: {
        compiler: 'simulatte.solver-compiler.v1',
        registry: registry.schema || registryApi.SOLVER_REGISTRY_SCHEMA || '',
      },
    };
  }

  function createSolverState(solverGraph = {}) {
    return {
      kind: 'solver-state',
      t: 0,
      channels: cloneChannels(solverGraph.channels || {}),
      events: [],
      readouts: readoutValuesForChannels(solverGraph.readouts || [], solverGraph.channels || {}),
      summary: deriveChannelSummary(solverGraph.channels || {}, solverGraph.channelMetadata || {}),
    };
  }

  function stepSolverState(inputState = {}, solverGraph = {}, dtInput = 0.016, registryOverride = null) {
    const registry = registryOverride || (
      registryApi.createSolverRegistry ? registryApi.createSolverRegistry() : fallbackRegistry()
    );
    const dt = clamp(Number(dtInput || 0.016), 0.001, 0.05);
    const channels = cloneChannels(inputState.channels || solverGraph.channels || {});
    const events = [];
    channels.__t = Number(inputState.t || 0);
    for (const stage of solverGraph.schedule || SCHEDULE) {
      for (const step of solverGraph.steps || []) {
        if ((step.stage || 'events') !== stage) continue;
        const subDt = Math.min(dt, Number(step.stableDt || dt) || dt);
        registry.stepOperator({
          channels,
          step,
          dt: subDt,
          events,
          metadata: solverGraph.channelMetadata || {},
        });
      }
    }
    delete channels.__t;
    const t = Number(inputState.t || 0) + dt;
    const summary = deriveChannelSummary(channels, solverGraph.channelMetadata || {});
    return {
      kind: 'solver-state',
      t,
      channels,
      events,
      readouts: readoutValuesForChannels(solverGraph.readouts || [], channels),
      summary,
    };
  }

  function deriveChannelSummary(channels = {}, metadata = {}) {
    let heat = 0;
    let motion = 0;
    let field = 0;
    let matter = 0;
    let damage = 0;
    let count = 0;
    for (const [id, value] of Object.entries(channels)) {
      if (id === '__t') continue;
      const meta = metadata[id] || {};
      const scalarValue = valueMagnitude(value);
      count += 1;
      if (/temperature|heat/i.test(meta.name || id)) heat = Math.max(heat, scalarValue);
      if (/velocity|angle|torque|flow/i.test(meta.name || id)) motion += scalarValue;
      if (/phase|amplitude|pressure|backlog|throughput/i.test(meta.name || id)) field += scalarValue;
      if (/liquidFraction|density|reactionProgress|nutrient/i.test(meta.name || id)) matter += scalarValue;
      if (/damage|stress/i.test(meta.name || id)) damage = Math.max(damage, scalarValue);
    }
    const normalizer = Math.max(1, count);
    const energy = heat * 0.6 + motion * 0.18 + field * 0.12 + matter * 0.1;
    return {
      energy,
      motion: motion / normalizer,
      field: field / normalizer,
      matter: matter / normalizer,
      heat,
      damage,
      stability: clamp(1 - damage * 0.7 - Math.max(0, heat - 1.1) * 0.2, 0, 1),
    };
  }

  function readoutValuesForChannels(readouts, channels) {
    const values = {};
    for (const readout of readouts || []) {
      const label = readout.label || readout.channel || 'readout';
      values[label] = valueMagnitude(channels[readout.channel]);
    }
    return values;
  }

  function channelValue(solverState, id, fallback = 0) {
    if (!solverState || !solverState.channels || !(id in solverState.channels)) return fallback;
    return solverState.channels[id];
  }

  function channelScalar(solverState, id, fallback = 0) {
    return valueMagnitude(channelValue(solverState, id, fallback));
  }

  function cloneChannels(channels) {
    const out = {};
    for (const [key, value] of Object.entries(channels || {})) {
      out[key] = cloneValue(value);
    }
    return out;
  }

  function cloneValue(value) {
    if (Array.isArray(value)) return value.slice();
    if (value && typeof value === 'object') return { ...value };
    return value;
  }

  function valueMagnitude(value) {
    if (value && typeof value === 'object') {
      const x = Number(value.x || 0);
      const y = Number(value.y || 0);
      return Number.isFinite(x + y) ? Math.hypot(x, y) : 0;
    }
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  function stageForOperator(type) {
    if (type === 'heat_source') return 'sources';
    if (['advection', 'diffusion', 'wave_field', 'reaction_diffusion', 'growth_decay', 'network_flow'].includes(type)) {
      return 'fields';
    }
    if (['heat_transfer', 'rotational_torque', 'phase_transition', 'pressure_flow_lite'].includes(type)) {
      return 'couplings';
    }
    if (['rigid_collision', 'fracture_threshold'].includes(type)) return 'collisions';
    if (type === 'derive_readout') return 'derivedReadouts';
    return 'events';
  }

  function scheduleIndex(stage) {
    const index = SCHEDULE.indexOf(stage);
    return index === -1 ? SCHEDULE.length : index;
  }

  function fallbackRegistry() {
    return {
      schema: 'simulatte.solverRegistry.empty',
      operatorFor: () => null,
      stepOperator: () => {},
    };
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  return {
    SOLVER_GRAPH_SCHEMA,
    SCHEDULE,
    compileSolverGraph,
    createSolverState,
    stepSolverState,
    deriveChannelSummary,
    channelValue,
    channelScalar,
  };
});
