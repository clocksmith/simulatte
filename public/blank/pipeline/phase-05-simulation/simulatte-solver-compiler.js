(function attachSimulatteSolverCompiler(root, factory) {
  const registryApi = typeof module === 'object' && module.exports
    ? require('./simulatte-solver-registry.js')
    : root.SimulatteSolverRegistry;
  const operatorStage = typeof module === 'object' && module.exports
    ? require('./simulatte-operator-stage.js')
    : root.SimulatteOperatorStage;
  const api = factory(registryApi || {}, operatorStage || {});
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.SimulatteSolverCompiler = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createSolverCompilerApi(registryApi = {}, operatorStage = {}) {
  const SOLVER_GRAPH_SCHEMA = 'simulatte.solverGraph.v1';
  const ENERGY_LEDGER_SCHEMA = 'simulatte.energyLedger.v1';
  const CHECKPOINT_SCHEMA = 'simulatte.checkpoint.v1';
  const { stageForOperator } = operatorStage;
  if (typeof stageForOperator !== 'function') throw new Error('Operator stage contract unavailable');
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
        receipt: operator.receipt ? { ...operator.receipt } : null,
        stableDt: solver.integrator && solver.integrator.stableDt || solver.stableDt || 0.05,
        integrator: cloneValue(solver.integrator),
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
      energyFlows: cloneValue(physicsIR.energyFlows || []),
      energyAccounting: cloneValue(physicsIR.energyAccounting || null),
      gridBoundaries: cloneValue(physicsIR.gridBoundaries || []),
      receipt: validationReceipt || physicsIR.receipt || null,
      warnings,
      provenance: {
        compiler: 'simulatte.solver-compiler.v1',
        registry: registry.schema || registryApi.SOLVER_REGISTRY_SCHEMA || '',
      },
    };
  }

  function createSolverState(solverGraph = {}) {
    const state = {
      kind: 'solver-state',
      t: 0,
      frame: 0,
      channels: cloneChannels(solverGraph.channels || {}),
      events: [],
      readouts: readoutValuesForChannels(solverGraph.readouts || [], solverGraph.channels || {}),
      summary: deriveChannelSummary(solverGraph.channels || {}, solverGraph.channelMetadata || {}),
      integratorState: {
        schema: 'simulatte.integratorState.v1',
        totalSubsteps: 0,
        lastSubstepCount: 0,
        lastDt: 0,
      },
    };
    state.energyLedger = createEnergyLedger(null, state, solverGraph, 0);
    return state;
  }

  function stepSolverState(inputState = {}, solverGraph = {}, dtInput = 0.016, registryOverride = null) {
    const registry = registryOverride || (
      registryApi.createSolverRegistry ? registryApi.createSolverRegistry() : fallbackRegistry()
    );
    const dt = clamp(Number(dtInput || 0.016), 0.001, 1);
    const channels = cloneChannels(inputState.channels || solverGraph.channels || {});
    const events = [];
    const maxSubDt = stableDtForSolverGraph(solverGraph);
    const substepCount = Math.max(1, Math.ceil(dt / maxSubDt));
    const subDt = dt / substepCount;
    for (let substep = 0; substep < substepCount; substep += 1) {
      channels.__t = Number(inputState.t || 0) + substep * subDt;
      for (const stage of solverGraph.schedule || SCHEDULE) {
        for (const step of solverGraph.steps || []) {
          if ((step.stage || 'events') !== stage) continue;
          registry.stepOperator({
            channels,
            step,
            dt: subDt,
            events,
            metadata: solverGraph.channelMetadata || {},
          });
        }
      }
      applyGridBoundaries(channels, solverGraph.gridBoundaries || [], subDt, events);
    }
    delete channels.__t;
    const t = Number(inputState.t || 0) + dt;
    const summary = deriveChannelSummary(channels, solverGraph.channelMetadata || {});
    const state = {
      kind: 'solver-state',
      t,
      frame: Number(inputState.frame || 0) + 1,
      channels,
      events,
      readouts: readoutValuesForChannels(solverGraph.readouts || [], channels),
      summary,
      integratorState: {
        schema: 'simulatte.integratorState.v1',
        totalSubsteps: Number(inputState.integratorState && inputState.integratorState.totalSubsteps || 0) + substepCount,
        lastSubstepCount: substepCount,
        lastDt: dt,
        maxSubDt,
      },
    };
    state.energyLedger = createEnergyLedger(inputState, state, solverGraph, dt);
    return state;
  }

  function stableDtForSolverGraph(solverGraph = {}) {
    const limits = (solverGraph.steps || []).map((step) => {
      const integrator = step.integrator || {};
      const stableDt = Number(integrator.stableDt || step.stableDt || 0.05);
      const cfl = Number(integrator.cfl || 0.9);
      return stableDt / Math.max(1, cfl);
    }).filter((value) => Number.isFinite(value) && value > 0);
    return limits.length ? Math.min(...limits) : 0.05;
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
    if (ArrayBuffer.isView(value)) return new value.constructor(value);
    if (Array.isArray(value)) return value.map(cloneValue);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([key, row]) => [key, cloneValue(row)]));
    }
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

  function createEnergyLedger(previousState, nextState, solverGraph = {}, dt = 0) {
    const previous = energyComponents(
      previousState && previousState.channels || nextState && nextState.channels || {},
      solverGraph.channelMetadata || {}
    );
    const current = energyComponents(nextState && nextState.channels || {}, solverGraph.channelMetadata || {});
    const flows = previousState
      ? energyFlowTotals(solverGraph.energyFlows || [], nextState && nextState.channels || {}, dt)
      : { input: 0, output: 0, dissipated: 0 };
    const previousLedger = previousState && previousState.energyLedger || null;
    const initialEnergy = previousLedger ? Number(previousLedger.initialEnergy || 0) : previous.total;
    const cumulativeInput = Number(previousLedger && previousLedger.cumulativeInput || 0) + flows.input;
    const cumulativeOutput = Number(previousLedger && previousLedger.cumulativeOutput || 0) + flows.output;
    const cumulativeDissipated = Number(previousLedger && previousLedger.cumulativeDissipated || 0) + flows.dissipated;
    const expectedStep = previous.total + flows.input - flows.output - flows.dissipated;
    const expectedCumulative = initialEnergy + cumulativeInput - cumulativeOutput - cumulativeDissipated;
    const reference = Math.max(Math.abs(initialEnergy), Math.abs(current.total), 1e-9);
    const dEStep = previousState ? Math.abs(current.total - expectedStep) / reference : 0;
    const dECumulative = previousState ? Math.abs(current.total - expectedCumulative) / reference : 0;
    const symplectic = (solverGraph.steps || []).length > 0 &&
      (solverGraph.steps || []).every((step) => step.integrator && step.integrator.symplectic === true);
    const thresholds = symplectic
      ? { warn: 2e-2, fail: 1e-1 }
      : { warn: 5e-2, fail: 2e-1 };
    const accountingComplete = Boolean(
      solverGraph.energyAccounting && solverGraph.energyAccounting.complete === true
    );
    return {
      schema: ENERGY_LEDGER_SCHEMA,
      frame: Number(nextState && nextState.frame || 0),
      simTime: Number(nextState && nextState.t || 0),
      perDomain: current.perDomain,
      E: current.total,
      initialEnergy,
      W_in: flows.input,
      W_out: flows.output,
      dissipated: flows.dissipated,
      cumulativeInput,
      cumulativeOutput,
      cumulativeDissipated,
      dE_step: dEStep,
      dE_cum: dECumulative,
      band: accountingComplete ? discrepancyBand(dECumulative, thresholds) : 'unmeasured',
      accountingComplete,
      thresholds,
    };
  }

  function energyComponents(channels = {}, metadata = {}) {
    const domains = new Map();
    for (const [id, value] of Object.entries(channels)) {
      if (id === '__t') continue;
      const meta = metadata[id] || {};
      const domainId = String(meta.domainId || meta.entityId || 'world');
      const row = domains.get(domainId) || {
        domainId,
        kinetic: 0,
        potential: 0,
        thermal: 0,
        field: 0,
        total: 0,
      };
      const name = String(meta.name || id).toLowerCase();
      const magnitude = valueMagnitude(value);
      const mass = channelMass(channels, id);
      if (/angularvelocity|angular_velocity|velocity|flowvelocity|flow_velocity/.test(name)) {
        row.kinetic += 0.5 * mass * magnitude * magnitude;
      } else if (/position/.test(name) && value && typeof value === 'object') {
        row.potential += mass * 9.81 * Math.max(0, Number(value.y || 0));
      } else if (/temperature|heat|enthalpy/.test(name)) {
        row.thermal += Math.abs(magnitude);
      } else if (/amplitude|pressure|electric|magnetic|charge|stress|energy/.test(name)) {
        row.field += 0.5 * magnitude * magnitude;
      }
      domains.set(domainId, row);
    }
    const perDomain = [...domains.values()].map((row) => ({
      ...row,
      total: row.kinetic + row.potential + row.thermal + row.field,
    }));
    return {
      perDomain,
      total: perDomain.reduce((sum, row) => sum + row.total, 0),
    };
  }

  function channelMass(channels, id) {
    const suffix = String(id).includes(':') ? String(id).slice(String(id).indexOf(':')) : '';
    const candidate = channels[`mass${suffix}`];
    const mass = valueMagnitude(candidate);
    return mass > 0 ? mass : 1;
  }

  function energyFlowTotals(flows = [], channels = {}, dt = 0) {
    const totals = { input: 0, output: 0, dissipated: 0 };
    for (const row of flows) {
      const kind = String(row.kind || row.type || '').toLowerCase();
      const amount = energyFlowAmount(row, channels, dt);
      if (kind === 'input' || kind === 'source' || kind === 'work_in') totals.input += amount;
      else if (kind === 'output' || kind === 'sink' || kind === 'work_out') totals.output += amount;
      else if (kind === 'dissipation' || kind === 'dissipated' || kind === 'loss') totals.dissipated += amount;
    }
    return totals;
  }

  function energyFlowAmount(row = {}, channels = {}, dt = 0) {
    if (Number.isFinite(Number(row.amount))) return Math.max(0, Number(row.amount));
    if (Number.isFinite(Number(row.power))) return Math.max(0, Number(row.power) * dt);
    if (row.channel) {
      const scale = Number.isFinite(Number(row.scale)) ? Number(row.scale) : 1;
      return Math.max(0, valueMagnitude(channels[row.channel]) * scale * dt);
    }
    return 0;
  }

  function discrepancyBand(value, thresholds) {
    if (value >= thresholds.fail) return 'fail';
    if (value >= thresholds.warn) return 'warn';
    return 'accept';
  }

  function createSolverCheckpoint(options = {}) {
    const spec = options.spec || {};
    const solverGraph = options.solverGraph || spec.solverGraph || {};
    const state = options.state || createSolverState(solverGraph);
    const descriptor = {
      schema: CHECKPOINT_SCHEMA,
      specHash: canonicalHash(checkpointSpecIdentity(spec, solverGraph)),
      frame: Number(options.frame === undefined ? state.frame || 0 : options.frame),
      simTime: Number(state.t || 0),
      rngSeed: Number(options.rngSeed || 0),
      integratorState: encodeCheckpointValue(state.integratorState || {}),
      channels: encodeCheckpointValue(state.channels || {}),
      readouts: encodeCheckpointValue({
        ...(state.readouts || {}),
        energyLedger: state.energyLedger || null,
      }),
    };
    descriptor.contentHash = checkpointContentHash(descriptor);
    return descriptor;
  }

  function restoreSolverCheckpoint(checkpoint = {}, options = {}) {
    validateCheckpoint(checkpoint);
    const spec = options.spec || {};
    const solverGraph = options.solverGraph || spec.solverGraph || {};
    const expectedSpecHash = canonicalHash(checkpointSpecIdentity(spec, solverGraph));
    if (checkpoint.specHash !== expectedSpecHash) {
      throw new Error(`Checkpoint specHash mismatch: expected ${expectedSpecHash}, received ${checkpoint.specHash}`);
    }
    const channels = decodeCheckpointValue(checkpoint.channels || {});
    const restoredReadouts = decodeCheckpointValue(checkpoint.readouts || {});
    const energyLedger = restoredReadouts.energyLedger || null;
    delete restoredReadouts.energyLedger;
    return {
      kind: 'solver-state',
      t: Number(checkpoint.simTime || 0),
      frame: Number(checkpoint.frame || 0),
      channels,
      events: [],
      readouts: restoredReadouts,
      summary: deriveChannelSummary(channels, solverGraph.channelMetadata || {}),
      integratorState: decodeCheckpointValue(checkpoint.integratorState || {}),
      energyLedger,
      rngSeed: Number(checkpoint.rngSeed || 0),
    };
  }

  function serializeSolverCheckpoint(checkpoint = {}) {
    validateCheckpoint(checkpoint);
    return JSON.stringify(checkpoint);
  }

  function deserializeSolverCheckpoint(serialized = '') {
    const checkpoint = JSON.parse(String(serialized || ''));
    validateCheckpoint(checkpoint);
    return checkpoint;
  }

  function validateCheckpoint(checkpoint = {}) {
    if (checkpoint.schema !== CHECKPOINT_SCHEMA) throw new Error('Unsupported checkpoint schema');
    if (!/^fnv1a32:[a-f0-9]{8}$/.test(String(checkpoint.specHash || ''))) {
      throw new Error('Checkpoint specHash is invalid');
    }
    const expected = checkpointContentHash(checkpoint);
    if (checkpoint.contentHash !== expected) {
      throw new Error(`Checkpoint contentHash mismatch: expected ${expected}, received ${checkpoint.contentHash || '(missing)'}`);
    }
    return true;
  }

  function checkpointSpecIdentity(spec = {}, solverGraph = {}) {
    return {
      schema: spec.schema || '',
      id: spec.id || '',
      templateId: spec.templateId || '',
      modules: spec.modules || [],
      objects: spec.objects || [],
      params: spec.params || {},
      solverGraph: {
        schema: solverGraph.schema || '',
        sourceIR: solverGraph.sourceIR || '',
        channels: solverGraph.channels || {},
        channelMetadata: solverGraph.channelMetadata || {},
        steps: solverGraph.steps || [],
        schedule: solverGraph.schedule || [],
        gridBoundaries: solverGraph.gridBoundaries || [],
      },
    };
  }

  function checkpointContentHash(checkpoint) {
    return canonicalHash({
      frame: checkpoint.frame,
      simTime: checkpoint.simTime,
      rngSeed: checkpoint.rngSeed,
      integratorState: checkpoint.integratorState,
      channels: checkpoint.channels,
      readouts: checkpoint.readouts,
    });
  }

  function canonicalHash(value) {
    const source = JSON.stringify(canonicalValue(value));
    let hash = 2166136261;
    for (let index = 0; index < source.length; index += 1) {
      hash ^= source.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, '0')}`;
  }

  function canonicalValue(value) {
    if (ArrayBuffer.isView(value)) return encodeCheckpointValue(value);
    if (Array.isArray(value)) return value.map(canonicalValue);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.keys(value).sort().flatMap((key) => {
        const row = value[key];
        return row === undefined || typeof row === 'function' ? [] : [[key, canonicalValue(row)]];
      }));
    }
    if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('Checkpoint values must be finite');
    return value;
  }

  function encodeCheckpointValue(value) {
    if (ArrayBuffer.isView(value)) {
      return { typedArray: value.constructor.name, values: Array.from(value) };
    }
    if (Array.isArray(value)) return value.map(encodeCheckpointValue);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([key, row]) => [key, encodeCheckpointValue(row)]));
    }
    if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('Checkpoint values must be finite');
    return value;
  }

  function decodeCheckpointValue(value) {
    if (Array.isArray(value)) return value.map(decodeCheckpointValue);
    if (value && typeof value === 'object' && value.typedArray) {
      const constructors = { Float32Array, Float64Array, Int32Array, Uint32Array, Int16Array, Uint16Array, Int8Array, Uint8Array };
      const Constructor = constructors[value.typedArray];
      if (!Constructor || !Array.isArray(value.values)) throw new Error(`Unsupported checkpoint typed array: ${value.typedArray}`);
      return new Constructor(value.values);
    }
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([key, row]) => [key, decodeCheckpointValue(row)]));
    }
    return value;
  }

  function applyGridBoundaries(channels, boundaries, dt, events) {
    for (const descriptor of boundaries || []) {
      const channelA = descriptor.channelA || descriptor.channel || '';
      const channelB = descriptor.channelB || '';
      if (!channelA || !channels[channelA]) continue;
      const result = applyGridBoundaryFlux({
        ...descriptor,
        fieldA: channels[channelA],
        fieldB: channelB ? channels[channelB] : null,
        dt,
      });
      channels[channelA] = result.fieldA;
      if (channelB && result.fieldB) channels[channelB] = result.fieldB;
      events.push({ type: 'gridBoundaryFlux', ...result.receipt, channelA, channelB });
    }
  }

  function applyGridBoundaryFlux(options = {}) {
    const kind = String(options.kind || options.boundaryKind || 'reflective');
    const widthA = positiveInteger(options.widthA || options.width, 'widthA');
    const heightA = positiveInteger(options.heightA || options.height, 'heightA');
    const fieldA = cloneGrid(options.fieldA, widthA * heightA, 'fieldA');
    const widthB = options.fieldB ? positiveInteger(options.widthB || options.width || widthA, 'widthB') : 0;
    const heightB = options.fieldB ? positiveInteger(options.heightB || options.height || heightA, 'heightB') : 0;
    const fieldB = options.fieldB ? cloneGrid(options.fieldB, widthB * heightB, 'fieldB') : null;
    const dt = Number(options.dt || 0);
    const dx = Number(options.dx || 1);
    const cfl = Number(options.cfl || 0.9);
    const velocity = faceVelocity(options.velocity);
    if (!(dt >= 0) || !(dx > 0) || !(cfl > 0)) throw new Error('Grid boundary dt, dx, and cfl must be valid');
    const cflValue = Math.abs(velocity.face) * dt / dx;
    if (cflValue > cfl + 1e-12) {
      throw new Error(`Grid boundary CFL exceeded: ${cflValue} > ${cfl}`);
    }
    const range = Array.isArray(options.physicalRange) ? options.physicalRange : [-Infinity, Infinity];
    const receipt = {
      schema: 'simulatte.gridBoundaryFluxReceipt.v1',
      kind,
      cfl: cflValue,
      netTransfer: 0,
      clampAdjustment: 0,
      conserved: true,
    };
    if (kind === 'reflective') return { fieldA, fieldB, receipt };
    if (kind === 'coupled') {
      if (!fieldB) throw new Error('Coupled grid boundary requires fieldB');
      transferCoupledFace(fieldA, widthA, heightA, fieldB, widthB, heightB, velocity, dt, dx, range, receipt);
    } else if (kind === 'periodic') {
      transferPeriodicFace(fieldA, widthA, heightA, velocity, dt, dx, range, receipt);
    } else if (kind === 'absorbing') {
      transferAbsorbingFace(fieldA, widthA, heightA, velocity, dt, dx, range, receipt);
    } else {
      throw new Error(`Unsupported grid boundary kind: ${kind}`);
    }
    receipt.conserved = kind !== 'absorbing' && Math.abs(receipt.clampAdjustment) <= 1e-9;
    return { fieldA, fieldB, receipt };
  }

  function transferCoupledFace(fieldA, widthA, heightA, fieldB, widthB, heightB, velocity, dt, dx, range, receipt) {
    const cellHeightA = 1 / heightA;
    const cellHeightB = 1 / heightB;
    const sourceA = cloneGrid(fieldA, fieldA.length, 'fieldA');
    const sourceB = cloneGrid(fieldB, fieldB.length, 'fieldB');
    const deltaA = new Float64Array(heightA);
    const deltaB = new Float64Array(heightB);
    for (let rowA = 0; rowA < heightA; rowA += 1) {
      const startA = rowA * cellHeightA;
      const endA = startA + cellHeightA;
      for (let rowB = 0; rowB < heightB; rowB += 1) {
        const startB = rowB * cellHeightB;
        const overlap = Math.min(endA, startB + cellHeightB) - Math.max(startA, startB);
        if (overlap <= 0) continue;
        const indexA = rowA * widthA + widthA - 1;
        const indexB = rowB * widthB;
        const flux = upwindFlux(sourceA[indexA], sourceB[indexB], velocity);
        const transfer = flux * dt / dx * overlap;
        deltaA[rowA] -= transfer / cellHeightA;
        deltaB[rowB] += transfer / cellHeightB;
        receipt.netTransfer += transfer;
      }
    }
    for (let row = 0; row < heightA; row += 1) {
      const index = row * widthA + widthA - 1;
      fieldA[index] = clampWithReceipt(sourceA[index] + deltaA[row], range, receipt, cellHeightA);
    }
    for (let row = 0; row < heightB; row += 1) {
      const index = row * widthB;
      fieldB[index] = clampWithReceipt(sourceB[index] + deltaB[row], range, receipt, cellHeightB);
    }
  }

  function transferPeriodicFace(field, width, height, velocity, dt, dx, range, receipt) {
    for (let row = 0; row < height; row += 1) {
      const left = row * width;
      const right = left + width - 1;
      const transfer = upwindFlux(field[right], field[left], velocity) * dt / dx;
      field[right] = clampWithReceipt(field[right] - transfer, range, receipt, 1);
      field[left] = clampWithReceipt(field[left] + transfer, range, receipt, 1);
      receipt.netTransfer += transfer;
    }
  }

  function transferAbsorbingFace(field, width, height, velocity, dt, dx, range, receipt) {
    for (let row = 0; row < height; row += 1) {
      const index = row * width + width - 1;
      const transfer = Math.max(0, upwindFlux(field[index], 0, velocity) * dt / dx);
      field[index] = clampWithReceipt(field[index] - transfer, range, receipt, 1);
      receipt.netTransfer += transfer;
    }
    receipt.conserved = false;
  }

  function upwindFlux(phiA, phiB, velocity) {
    return 0.5 * (velocity.a * phiA + velocity.b * phiB) -
      0.5 * Math.abs(velocity.face) * (phiB - phiA);
  }

  function faceVelocity(value) {
    if (value && typeof value === 'object') {
      const a = Number(value.a ?? value.face ?? 0);
      const b = Number(value.b ?? value.face ?? a);
      const face = Number(value.face ?? (a + b) * 0.5);
      if (![a, b, face].every(Number.isFinite)) throw new Error('Grid boundary velocity must be finite');
      return { a, b, face };
    }
    const velocity = Number(value || 0);
    if (!Number.isFinite(velocity)) throw new Error('Grid boundary velocity must be finite');
    return { a: velocity, b: velocity, face: velocity };
  }

  function clampWithReceipt(value, range, receipt, cellMeasure) {
    const clamped = clamp(value, Number(range[0]), Number(range[1]));
    receipt.clampAdjustment += (clamped - value) * cellMeasure;
    return clamped;
  }

  function cloneGrid(value, expectedLength, label) {
    if (!Array.isArray(value) && !ArrayBuffer.isView(value)) throw new Error(`${label} must be an array or typed array`);
    if (value.length !== expectedLength) throw new Error(`${label} length does not match its grid shape`);
    return ArrayBuffer.isView(value) ? new value.constructor(value) : value.slice();
  }

  function positiveInteger(value, label) {
    const number = Number(value);
    if (!Number.isInteger(number) || number <= 0) throw new Error(`${label} must be a positive integer`);
    return number;
  }

  function buildGridGhostLayer(field, width, height, options = {}) {
    const ghostWidth = positiveInteger(options.ghostWidth || 1, 'ghostWidth');
    const source = cloneGrid(field, width * height, 'field');
    const outWidth = width + ghostWidth * 2;
    const outHeight = height + ghostWidth * 2;
    const Output = ArrayBuffer.isView(source) ? source.constructor : Array;
    const output = Output === Array ? new Array(outWidth * outHeight) : new Output(outWidth * outHeight);
    for (let y = -ghostWidth; y < height + ghostWidth; y += 1) {
      for (let x = -ghostWidth; x < width + ghostWidth; x += 1) {
        output[(y + ghostWidth) * outWidth + x + ghostWidth] = gridBoundarySample(source, width, height, x, y, options);
      }
    }
    return { field: output, width: outWidth, height: outHeight, ghostWidth, kind: options.kind || 'reflective' };
  }

  function gridBoundarySample(field, width, height, x, y, options) {
    if (x >= 0 && x < width && y >= 0 && y < height) return field[y * width + x];
    const kind = String(options.kind || 'reflective');
    if (kind === 'absorbing') return 0;
    if (kind === 'periodic') {
      const wrappedX = ((x % width) + width) % width;
      const wrappedY = ((y % height) + height) % height;
      return field[wrappedY * width + wrappedX];
    }
    if (kind === 'reflective') {
      const reflectedX = clamp(x, 0, width - 1);
      const reflectedY = clamp(y, 0, height - 1);
      return field[reflectedY * width + reflectedX];
    }
    if (kind === 'coupled') return coupledGhostSample(x, y, width, height, options);
    throw new Error(`Unsupported ghost boundary kind: ${kind}`);
  }

  function coupledGhostSample(x, y, width, height, options) {
    const neighborWidth = positiveInteger(options.neighborWidth, 'neighborWidth');
    const neighborHeight = positiveInteger(options.neighborHeight, 'neighborHeight');
    const neighbor = cloneGrid(options.neighbor, neighborWidth * neighborHeight, 'neighbor');
    const normalizedY = clamp((y + 0.5) / height, 0, 1);
    const neighborY = clamp(Math.floor(normalizedY * neighborHeight), 0, neighborHeight - 1);
    const neighborX = x < 0 ? neighborWidth - 1 : 0;
    return neighbor[neighborY * neighborWidth + neighborX];
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
    ENERGY_LEDGER_SCHEMA,
    CHECKPOINT_SCHEMA,
    SCHEDULE,
    compileSolverGraph,
    createSolverState,
    stepSolverState,
    stableDtForSolverGraph,
    createEnergyLedger,
    createSolverCheckpoint,
    restoreSolverCheckpoint,
    serializeSolverCheckpoint,
    deserializeSolverCheckpoint,
    validateCheckpoint,
    applyGridBoundaryFlux,
    buildGridGhostLayer,
    deriveChannelSummary,
    channelValue,
    channelScalar,
  };
});
