const assert = require('node:assert/strict');
const test = require('node:test');

const contracts = require('../public/shared/contracts/multiscale-contracts.js');
const coordinatorApi = require('../public/shared/core/simulation/multirate-coordinator.js');

function port({ id, moduleId, direction, intervalSeconds, minimum = null, maximum = null }) {
  return {
    schema: contracts.SCHEMAS.port,
    id,
    moduleInstanceId: moduleId,
    direction,
    kind: 'sampled-state',
    quantity: 'test.quantity',
    dataSchemaId: 'test.scalar/v1',
    shape: [],
    unit: 'unit',
    dimension: 'test',
    coordinateFrameId: null,
    cadence: { kind: 'fixed', intervalSeconds },
    timestampSemantics: 'sample-time',
    latencySeconds: 0,
    interpolationPolicy: 'hold',
    aggregationPolicy: 'last',
    uncertainty: { kind: 'none', unit: null, confidenceLevel: null },
    provenanceRequired: false,
    determinismClass: 'exact',
    authority: 'test-authority',
    validRange: { minimum, maximum },
    missingDataBehavior: 'reject',
    backpressurePolicy: 'block',
  };
}

function moduleRecord({ id, intervalSeconds, inputPortId = null, outputPortId = null, multiplier = 1, eventClock = false, calls = [] }) {
  return {
    id,
    implementationId: `${id}.implementation/v1`,
    implementationHash: `sha256:${id}`,
    clock: eventClock ? { kind: 'event', intervalSeconds: null } : { kind: 'fixed', intervalSeconds },
    lifecycle: {
      initialize({ logicalTime }) {
        calls.push(`${id}:initialize`);
        return { value: 0, logicalTime };
      },
      advance({ state, toTime, inputs, controls }) {
        calls.push(`${id}:advance:${toTime}`);
        const input = inputPortId ? inputs[inputPortId].value : state.value + 1;
        const adjustment = controls.reduce((sum, row) => sum + Number(row.payload?.adjustment || 0), 0);
        return { state: { value: input * multiplier + adjustment, logicalTime: toTime }, events: [], diagnostics: [] };
      },
      emit({ state, logicalTime }) {
        calls.push(`${id}:emit:${logicalTime}`);
        return outputPortId ? [{ portId: outputPortId, value: state.value, timestamp: logicalTime, provenance: null }] : [];
      },
      checkpoint({ state }) {
        calls.push(`${id}:checkpoint`);
        return { state };
      },
      restore({ checkpoint }) {
        calls.push(`${id}:restore`);
        return checkpoint.state;
      },
      aggregate({ state }) {
        calls.push(`${id}:aggregate`);
        return { ...state, representation: 'aggregate' };
      },
      refine({ state }) {
        calls.push(`${id}:refine`);
        return { ...state, representation: 'detailed' };
      },
      dispose() {
        calls.push(`${id}:dispose`);
      },
    },
  };
}

function fixture({ reverse = false, sourceMaximum = null } = {}) {
  const calls = [];
  const sourceOutput = port({ id: 'source.output', moduleId: 'source', direction: 'output', intervalSeconds: 1, maximum: sourceMaximum });
  const sinkInput = port({ id: 'sink.input', moduleId: 'sink', direction: 'input', intervalSeconds: 2 });
  const sinkOutput = port({ id: 'sink.output', moduleId: 'sink', direction: 'output', intervalSeconds: 2 });
  const source = moduleRecord({ id: 'source', intervalSeconds: 1, outputPortId: sourceOutput.id, calls });
  const sink = moduleRecord({ id: 'sink', intervalSeconds: 2, inputPortId: sinkInput.id, outputPortId: sinkOutput.id, multiplier: 10, calls });
  return {
    calls,
    configuration: {
      id: 'test-coordinator',
      worldSpecContentHash: 'sha256:test-world',
      modules: reverse ? [sink, source] : [source, sink],
      ports: reverse ? [sinkOutput, sinkInput, sourceOutput] : [sourceOutput, sinkInput, sinkOutput],
      couplingPlan: {
        schema: contracts.SCHEMAS.coupling,
        id: 'test-coupling',
        edges: [{
          id: 'source-to-sink',
          sourcePortId: sourceOutput.id,
          destinationPortId: sinkInput.id,
          adapterId: null,
          communicationCadence: { kind: 'fixed', intervalSeconds: 1 },
          delaySeconds: 0,
          initializationRule: 'declared initial value',
          samplingPolicy: 'hold',
          errorPolicy: 'stop',
          convergencePolicyId: null,
          proofObligationIds: [],
        }],
        coupledSolvers: [],
      },
      initialPortValues: { 'sink.input': 0 },
    },
  };
}

test('multirate coordinator is independent of module and port registration order', async () => {
  const left = coordinatorApi.createCoordinator(fixture().configuration);
  const right = coordinatorApi.createCoordinator(fixture({ reverse: true }).configuration);
  await left.runUntil(4);
  await right.runUntil(4);
  assert.deepEqual(left.getLedger(), right.getLedger());
  assert.deepEqual(left.snapshot().moduleStateHashes, right.snapshot().moduleStateHashes);
});

test('multirate coordinator latches prior committed input before same-time output', async () => {
  const coordinator = coordinatorApi.createCoordinator(fixture().configuration);
  await coordinator.runUntil(2);
  const ledger = coordinator.getLedger();
  assert.deepEqual(ledger.map((row) => [row.logicalTime, row.activatedModuleIds]), [
    [1, ['source']],
    [2, ['sink', 'source']],
  ]);
  const checkpoint = await coordinator.checkpoint('latched-checkpoint');
  assert.equal(checkpoint.states.source.value, 2);
  assert.equal(checkpoint.states.sink.value, 10);
});

test('published output observations are read-only, hashed, and restored with checkpoints', async () => {
  const source = fixture();
  const coordinator = coordinatorApi.createCoordinator(source.configuration);
  await coordinator.runUntil(2);
  const observed = coordinator.observePorts();
  assert.equal(observed.schema, coordinatorApi.PORT_OBSERVATION_SCHEMA);
  assert.equal(observed.logicalTime, 2);
  assert.equal(observed.records['source.output'].value, 2);
  assert.equal(observed.records['sink.output'].value, 10);
  assert.match(observed.contentHash, /^fnv1a32:[0-9a-f]{8}$/);
  assert.throws(
    () => coordinator.observePorts(['sink.input']),
    (error) => error.code === 'multirate_observation_port_not_output'
  );

  const checkpoint = await coordinator.checkpoint('published-output-checkpoint');
  assert.deepEqual(checkpoint.outputBuffers, observed.records);
  const restored = coordinatorApi.createCoordinator(source.configuration);
  await restored.restore(checkpoint);
  assert.deepEqual(restored.observePorts(), observed);
});

test('multirate coordinator rejects invalid output before publication and retains the failure', async () => {
  const coordinator = coordinatorApi.createCoordinator(fixture({ sourceMaximum: 0 }).configuration);
  await assert.rejects(coordinator.runUntil(1), (error) => error.code === 'multirate_port_range_invalid');
  const [entry] = coordinator.getLedger();
  assert.equal(entry.status, 'rejected');
  assert.equal(entry.failures[0].code, 'multirate_port_range_invalid');
  assert.equal(coordinator.snapshot().logicalTime, 0);
});

test('checkpoint restore and branching reproduce retained state without sharing future execution', async () => {
  const source = fixture();
  const coordinator = coordinatorApi.createCoordinator(source.configuration);
  await coordinator.runUntil(2);
  const checkpoint = await coordinator.checkpoint('branch-point');
  await coordinator.runUntil(4);

  const restored = coordinatorApi.createCoordinator(source.configuration);
  await restored.restore(checkpoint);
  await restored.runUntil(4);
  assert.deepEqual(restored.snapshot().moduleStateHashes, coordinator.snapshot().moduleStateHashes);

  const branch = await restored.branch({ id: 'candidate-branch', checkpoint });
  branch.enqueueControl({
    id: 'candidate-adjustment',
    logicalTime: 3,
    authority: 'test-authority',
    targetModuleIds: ['source'],
    payload: { adjustment: 4 },
  });
  await branch.runUntil(4);
  assert.notDeepEqual(branch.snapshot().moduleStateHashes, restored.snapshot().moduleStateHashes);
  assert.equal(branch.snapshot().parentCheckpointId, 'branch-point');
});

test('authorized controls are ordered canonically and cancellation preserves completed rounds', async () => {
  const coordinator = coordinatorApi.createCoordinator(fixture().configuration);
  coordinator.enqueueControl({ id: 'b', logicalTime: 1.5, authority: 'test-authority', targetModuleIds: ['source'], payload: { adjustment: 2 } });
  coordinator.enqueueControl({ id: 'a', logicalTime: 1.5, authority: 'test-authority', targetModuleIds: ['source'], payload: { adjustment: 3 } });
  await coordinator.runUntil(1.5);
  assert.deepEqual(coordinator.getLedger().at(-1).controlIds, ['a', 'b']);
  coordinator.cancel('operator stop');
  await coordinator.runUntil(4);
  assert.equal(coordinator.snapshot().logicalTime, 1.5);
  assert.equal(coordinator.snapshot().cancellationReason, 'operator stop');
});

test('replay reports exact match and earliest divergence', async () => {
  const coordinator = coordinatorApi.createCoordinator(fixture().configuration);
  await coordinator.runUntil(4);
  assert.deepEqual(await coordinator.replay(), { status: 'match', rounds: 4, terminalTime: 4 });
  const changed = coordinator.getLedger().map((row) => ({ ...row }));
  changed[1].contentHash = 'fnv1a32:00000000';
  const result = await coordinator.replay(changed);
  assert.equal(result.status, 'diverged');
  assert.equal(result.roundIndex, 1);
});

test('aggregate, refine, and dispose invoke declared lifecycle operations', async () => {
  const value = fixture();
  const coordinator = coordinatorApi.createCoordinator(value.configuration);
  await coordinator.initialize();
  await coordinator.aggregate(['source'], { reason: 'budget' });
  await coordinator.refine(['source'], { reason: 'inspection' });
  await coordinator.dispose();
  assert.ok(value.calls.includes('source:aggregate'));
  assert.ok(value.calls.includes('source:refine'));
  assert.ok(value.calls.includes('source:dispose'));
  await assert.rejects(coordinator.runUntil(1), (error) => error.code === 'multirate_disposed');
});

test('declared zero-delay coupled cycles execute only through their named serial solver', async () => {
  const calls = [];
  const leftInput = port({ id: 'left.input', moduleId: 'left', direction: 'input', intervalSeconds: 1 });
  const leftOutput = port({ id: 'left.output', moduleId: 'left', direction: 'output', intervalSeconds: 1 });
  const rightInput = port({ id: 'right.input', moduleId: 'right', direction: 'input', intervalSeconds: 1 });
  const rightOutput = port({ id: 'right.output', moduleId: 'right', direction: 'output', intervalSeconds: 1 });
  const modules = [
    moduleRecord({ id: 'left', intervalSeconds: 1, inputPortId: leftInput.id, outputPortId: leftOutput.id, calls }),
    moduleRecord({ id: 'right', intervalSeconds: 1, inputPortId: rightInput.id, outputPortId: rightOutput.id, calls }),
  ];
  const edge = (id, sourcePortId, destinationPortId) => ({
    id,
    sourcePortId,
    destinationPortId,
    adapterId: null,
    communicationCadence: { kind: 'fixed', intervalSeconds: 1 },
    delaySeconds: 0,
    initializationRule: 'declared initial value',
    samplingPolicy: 'hold',
    errorPolicy: 'stop',
    convergencePolicyId: 'pair-solver',
    proofObligationIds: [],
  });
  const coordinator = coordinatorApi.createCoordinator({
    id: 'coupled-coordinator',
    worldSpecContentHash: 'sha256:coupled-world',
    modules,
    ports: [leftInput, leftOutput, rightInput, rightOutput],
    couplingPlan: {
      schema: contracts.SCHEMAS.coupling,
      id: 'coupled-plan',
      edges: [edge('left-right', leftOutput.id, rightInput.id), edge('right-left', rightOutput.id, leftInput.id)],
      coupledSolvers: [{ id: 'pair-solver', edgeIds: ['left-right', 'right-left'], algorithm: 'fixed-point', tolerance: 0, maximumIterations: 1 }],
    },
    initialPortValues: { 'left.input': 0, 'right.input': 0 },
    coupledSolverHandlers: {
      'pair-solver'({ toTime, states }) {
        calls.push(`solver:${toTime}`);
        return {
          left: { state: { value: states.left.value + 1, logicalTime: toTime }, outputs: [{ portId: leftOutput.id, value: 1, timestamp: toTime }], events: [], diagnostics: [] },
          right: { state: { value: states.right.value + 1, logicalTime: toTime }, outputs: [{ portId: rightOutput.id, value: 1, timestamp: toTime }], events: [], diagnostics: [] },
        };
      },
    },
  });
  await coordinator.runUntil(1);
  assert.ok(calls.includes('solver:1'));
  assert.equal(calls.some((row) => row.includes(':advance:')), false);
});

test('queued events wake at delivery time, preserve multiplicity and restore across a pending delivery', async () => {
  const output = { ...port({ id: 'source.events', moduleId: 'source', direction: 'output', intervalSeconds: 1 }),
    kind: 'event', cadence: { kind: 'event', intervalSeconds: null }, timestampSemantics: 'event-time', interpolationPolicy: 'none', deliverySemantics: 'queued-event' };
  const input = { ...output, id: 'sink.events', moduleInstanceId: 'sink', direction: 'input' };
  const source = moduleRecord({ id: 'source', eventClock: true }), sink = moduleRecord({ id: 'sink', eventClock: true });
  source.lifecycle.nextEventTime = ({ state }) => state.value < 2 ? state.value : null;
  source.lifecycle.emit = ({ state, logicalTime }) => [2, 3].map(value => ({ portId: output.id, value: value * state.value, timestamp: logicalTime }));
  sink.lifecycle.advance = ({ state, inputs, toTime }) => ({ state: { received: [...(state.received || []), ...inputs[input.id].map(row => row.value)], value: state.value + inputs[input.id].reduce((sum, row) => sum + row.value, 0), logicalTime: toTime }, events: [], diagnostics: [] });
  const config = { id: 'queued-events', worldSpecContentHash: 'queued-world', modules: [sink, source], ports: [input, output], couplingPlan: {
    schema: contracts.SCHEMAS.coupling, id: 'event-plan', coupledSolvers: [], edges: [{ id: 'delivery', sourcePortId: output.id, destinationPortId: input.id,
      adapterId: null, communicationCadence: { kind: 'every-source-event', intervalSeconds: null }, delaySeconds: 0.5,
      initializationRule: 'empty event queue', samplingPolicy: 'exact', errorPolicy: 'stop', convergencePolicyId: null, proofObligationIds: [] }] } };
  const coordinator = coordinatorApi.createCoordinator(config);
  await coordinator.runUntil(0.25); const cp = JSON.parse(JSON.stringify(await coordinator.checkpoint()));
  assert.equal(cp.pendingDeliveries.length, 2);
  await coordinator.runUntil(1.5); const final = await coordinator.checkpoint();
  assert.equal(final.states.sink.value, 15); assert.deepEqual(final.states.sink.received, [2, 3, 4, 6]); assert.equal(final.states.sink.logicalTime, 1.5);
  assert.deepEqual(final.inputBuffers[input.id], []);
  assert.ok(coordinator.getLedger().some(r => r.logicalTime === 0.5));
  const resumed = coordinatorApi.createCoordinator(config); await resumed.restore(cp); await resumed.runUntil(1.5);
  assert.deepEqual(await resumed.checkpoint(), final);
  assert.equal((await coordinator.replay()).status, 'match');
});

test('module event wakeups retain independent fixed cadence and zero-time work has a strict bound', async () => {
  const mixed = moduleRecord({ id: 'mixed', intervalSeconds: 1 });
  mixed.lifecycle.nextEventTime = ({ state }) => state.value === 0 ? 0.5 : null;
  const configuration = { id: 'mixed-clock', worldSpecContentHash: 'mixed-world', modules: [mixed], ports: [],
    couplingPlan: { schema: contracts.SCHEMAS.coupling, id: 'empty', edges: [], coupledSolvers: [] } };
  const coordinator = coordinatorApi.createCoordinator(configuration); await coordinator.runUntil(2);
  assert.deepEqual(coordinator.getLedger().map(row => row.logicalTime), [0.5, 1, 2]);
  const looping = moduleRecord({ id: 'loop', eventClock: true }); looping.lifecycle.nextEventTime = () => 0;
  const loop = coordinatorApi.createCoordinator({ ...configuration, id: 'loop', modules: [looping], maxRoundsAtSameTime: 3 });
  await assert.rejects(loop.runUntil(1), { code: 'multirate_zero_time_limit' });
  assert.equal(loop.getLedger().length, 3);
});

test('legacy v2 checkpoints restore fixed-cadence callers without inventing missing event state', async () => {
  const value = fixture(), source = coordinatorApi.createCoordinator(value.configuration);
  await source.runUntil(2); const legacy = JSON.parse(JSON.stringify(await source.checkpoint()));
  legacy.schema = 'simulatte.multirate-coordinator-checkpoint/v2'; delete legacy.nextEventTimes; delete legacy.contentHash;
  const canonical = require('../public/shared/contracts/contract-validation-primitives.js').canonicalJson(legacy);
  let hash = 0x811c9dc5; for (const ch of canonical) { hash ^= ch.charCodeAt(0); hash = Math.imul(hash, 0x01000193); }
  legacy.contentHash = `fnv1a32:${(hash >>> 0).toString(16).padStart(8, '0')}`;
  const resumed = coordinatorApi.createCoordinator(value.configuration); await resumed.restore(legacy);
  await source.runUntil(4); await resumed.runUntil(4);
  assert.deepEqual(await resumed.checkpoint(), await source.checkpoint());
  const changed = fixture(); changed.configuration.modules[0].lifecycle.nextEventTime = () => null;
  const incompatible = coordinatorApi.createCoordinator(changed.configuration);
  await assert.rejects(incompatible.restore(legacy), { code: 'multirate_checkpoint_event_state_missing' });
});

test('replay preserves separately committed same-time controls across checkpoint restoration', async () => {
  const worker = moduleRecord({ id: 'worker', intervalSeconds: 1 });
  const configuration = { id: 'same-time-controls', worldSpecContentHash: 'same-time-world', modules: [worker], ports: [], couplingPlan: { schema: contracts.SCHEMAS.coupling, id: 'same-time-plan', edges: [], coupledSolvers: [] } };
  const coordinator = coordinatorApi.createCoordinator(configuration);
  await coordinator.runUntil(1);
  const control = (id, adjustment) => ({ id, logicalTime: 1, authority: 'user', targetModuleIds: ['worker'], payload: { adjustment } });
  coordinator.enqueueControl(control('first', 10)); await coordinator.runUntil(1);
  const checkpoint = JSON.parse(JSON.stringify(await coordinator.checkpoint()));
  coordinator.enqueueControl(control('second', 100)); await coordinator.runUntil(1);
  coordinator.enqueueControl(control('third', 1000)); await coordinator.runUntil(1);
  assert.deepEqual(coordinator.getLedger().map(row => row.controlIds), [[], ['first'], ['second'], ['third']]);
  assert.equal((await coordinator.replay()).status, 'match');
  const restored = coordinatorApi.createCoordinator(configuration); await restored.restore(checkpoint);
  restored.enqueueControl(control('second', 100)); await restored.runUntil(1);
  restored.enqueueControl(control('third', 1000)); await restored.runUntil(1);
  assert.deepEqual(await restored.checkpoint(), await coordinator.checkpoint());
  assert.equal((await restored.replay()).status, 'match');
});
