const assert = require('node:assert/strict');
const test = require('node:test');

const controllerApi = require('../public/simulatte/app/tier-run-controller.js');
const contracts = require('../public/simulatte/platform/contracts/plugin-v4-contracts.js');

function modelRecord() {
  const envelope = contracts.createProvenanceEnvelope({
    subjectId: 'fixture:model',
    subjectKind: 'model',
    axes: {
      origin: 'modeled',
      temporalStatus: 'forecast',
      uncertainty: { kind: 'missing', value: { reason: 'fixture model' } },
    },
    datasetIds: ['fixture:dataset'],
    artifactSha256: 'a'.repeat(64),
    parentIds: [],
    modelReceiptId: 'fixture:model',
    scenarioEpoch: 'scenario:fixture',
    contentVersion: 'fixture-v1',
    license: { required: false, identifier: null },
  });
  return {
    schema: 'simulatte.provenanceRecord.v4',
    id: 'fixture:model',
    kind: 'model',
    datasetId: 'fixture:dataset',
    contentHash: 'a'.repeat(64),
    parentIds: [],
    metadata: {},
    envelope,
  };
}

function memoryStorage() {
  const rows = new Map();
  return {
    getItem: (key) => rows.get(key) || null,
    setItem: (key, value) => rows.set(key, value),
    removeItem: (key) => rows.delete(key),
    rows,
  };
}

function fakeRuntime({
  progressive = true,
  totalSteps = 2,
  dispatchedValues = [],
  terminalStatus = 'settled',
  comparisonIds = ['fixture-comparison'],
  comparisonDispatches = [],
  comparisonGate = null,
  settlementCalls = [],
} = {}) {
  let step = 0;
  const contribution = {
    pluginId: 'fixture',
    controls: {
      comparisons: comparisonIds.map((id) => ({ id })),
    },
    provenanceRecords: [modelRecord()],
  };
  return {
    activePluginIds: ['fixture'],
    async dispatchAction(_pluginId, actionId, context) {
      if (actionId === 'counterfactual.compare') {
        if (comparisonGate) await comparisonGate.promise;
        comparisonDispatches.push(context.values.comparisonId);
        return {
          status: 'settled',
          comparisonId: context.values.comparisonId,
          comparisonBranches: {
            baseline: { served: 4 },
            intervention: { served: 7 },
          },
        };
      }
      dispatchedValues.push(structuredClone(context.values));
      if (!progressive) return {
        status: terminalStatus,
        result: 'terminal',
        currentStep: 1,
        totalSteps: 1,
      };
      if (context.values.phase === 'start') {
        step = 0;
        return { status: 'running', step, currentStep: 0, totalSteps };
      }
      step += 1;
      return {
        status: step === totalSteps ? terminalStatus : 'running',
        step,
        currentStep: step,
        totalSteps,
      };
    },
    platformV4() {
      return { contributions: [contribution] };
    },
    async settle() {
      settlementCalls.push('settle');
      return [{ pluginId: 'fixture', obligationResults: [], losses: [] }];
    },
  };
}

function create(runtime, storage, states, receipts, controlValues = {}, options = {}) {
  const scenario = { id: 'fixture-scenario', seed: 'fixture-seed' };
  return controllerApi.createController({
    getRuntime: () => runtime,
    ownerPluginId: 'fixture',
    scenario,
    profileId: 'fixture-profile',
    comparisonRequired: options.comparisonRequired ?? true,
    stepDelayMs: options.stepDelayMs,
    getControlValues: () => controlValues,
    setControlValues: options.setControlValues || (() => {}),
    render() {},
    resetRuntime: options.resetRuntime || (async () => {}),
    buildReceipt({ actionResult, settlement, parameterValues }) {
      return {
        schema: 'simulatte.tierRunReceipt.v1',
        profileId: 'fixture-profile',
        scenario,
        parameterValues,
        actionResult,
        settlement,
      };
    },
    onState: (state) => states.push(`${state.state}:${state.stepCount}`),
    onReceipt: (receipt) => receipts.push(receipt),
    storage,
    setTimer: options.setTimer || (() => 1),
    clearTimer() {},
    yieldControl: options.yieldControl,
  });
}

test('tier controller honors a profile-owned day cadence', async () => {
  const delays = [];
  const controller = create(fakeRuntime(), memoryStorage(), [], [], {}, {
    stepDelayMs: 2500,
    setTimer: (_callback, delay) => {
      delays.push(delay);
      return delays.length;
    },
  });
  await controller.start();
  assert.deepEqual(delays, [2500]);
});

test('tier controller settles a profile that explicitly has no comparison mode', async () => {
  const comparisonDispatches = [];
  const controller = create(fakeRuntime({
    progressive: false,
    comparisonIds: [],
    comparisonDispatches,
  }), memoryStorage(), [], [], {}, { comparisonRequired: false });
  await controller.start();
  assert.equal(controller.snapshot().state, 'settled');
  assert.deepEqual(comparisonDispatches, []);
  assert.equal(controller.receipt().actionResult.comparison, null);
  assert.equal(controller.receipt().actionResult.comparisonExecutionReceipt, null);
  assert.deepEqual(controller.receipt().actionResult.comparisonExecutionReceipts, []);
});

test('tier controller pauses, steps, executes both comparison branches, settles, and persists', async () => {
  const storage = memoryStorage();
  const states = [];
  const receipts = [];
  const controller = create(fakeRuntime(), storage, states, receipts);
  await controller.start();
  assert.equal(controller.snapshot().state, 'running');
  controller.pause();
  await controller.step();
  assert.equal(controller.snapshot().state, 'paused');
  assert.equal(states.includes('paused:1'), true);
  await controller.step();
  assert.equal(controller.snapshot().state, 'settled');
  const receipt = controller.receipt();
  assert.equal(receipt.actionResult.comparisonExecutionReceipt.state, 'settled');
  assert.equal(receipt.actionResult.comparisonExecutionReceipt.history.length, 1);
  assert.equal(receipts.length, 1);
  const stored = controllerApi.readStoredReceipt(storage, 'fixture-profile');
  assert.equal(stored.schema, 'simulatte.tierRunRestoreEnvelope.v1');
  assert.equal(stored.scenario.seed, 'fixture-seed');
  assert.equal(stored.terminal.status, 'settled');
  assert.equal(states.some((state) => state.startsWith('paused:')), true);
});

test('tier controller reconstructs a matching terminal receipt after reload', async () => {
  const storage = memoryStorage();
  const first = create(fakeRuntime({ progressive: false }), storage, [], []);
  await first.start();
  const restoredReceipts = [];
  const restored = create(fakeRuntime({ progressive: false }), storage, [], restoredReceipts);
  assert.equal(await restored.restore(), true);
  assert.equal(restored.snapshot().state, 'settled');
  assert.equal(restoredReceipts.length, 1);
});

test('tier controller rejects a reload whose terminal comparison identity diverges', async () => {
  const storage = memoryStorage();
  const first = create(fakeRuntime({ progressive: false }), storage, [], []);
  await first.start();
  const key = controllerApi.storageKey('fixture-profile');
  const stored = JSON.parse(storage.rows.get(key));
  stored.terminal.comparisonIds = ['tampered-comparison'];
  storage.rows.set(key, JSON.stringify(stored));
  const restored = create(fakeRuntime({ progressive: false }), storage, [], []);

  await assert.rejects(restored.restore(), (error) => error.code === 'tier_run_restore_diverged');
  assert.equal(restored.snapshot().state, 'failed');
  assert.equal(controllerApi.readStoredReceipt(storage, 'fixture-profile'), null);
});

test('tier controller drops malformed persisted restore envelopes', () => {
  const storage = memoryStorage();
  storage.rows.set(controllerApi.storageKey('fixture-profile'), JSON.stringify({
    schema: controllerApi.RESTORE_ENVELOPE_SCHEMA,
    profileId: 'fixture-profile',
    scenario: { id: 'fixture-scenario', seed: 'fixture-seed' },
    parameterValues: {},
    terminal: { receiptSchema: 'simulatte.tierRunReceipt.v1', status: 'settled', comparisonId: null, comparisonIds: [false] },
  }));

  assert.equal(controllerApi.readStoredReceipt(storage, 'fixture-profile'), null);
  assert.equal(storage.rows.has(controllerApi.storageKey('fixture-profile')), false);
});

test('tier controller compares, settles, and restores a terminal simulation failure', async () => {
  const storage = memoryStorage();
  const receipts = [];
  const first = create(fakeRuntime({ terminalStatus: 'failed' }), storage, [], receipts);
  await first.start();
  first.pause();
  await first.step();
  await first.step();
  assert.equal(first.snapshot().state, 'settled');
  assert.equal(receipts[0].actionResult.status, 'settled');
  assert.equal(receipts[0].actionResult.scenario.status, 'failed');
  assert.equal(receipts[0].actionResult.comparisonExecutionReceipt.state, 'settled');
  const restored = create(fakeRuntime({ terminalStatus: 'failed' }), storage, [], []);
  assert.equal(await restored.restore(), true);
  assert.equal(restored.snapshot().state, 'settled');
});

test('tier controller applies experiment parameters to start and step phases and persists them', async () => {
  const dispatchedValues = [];
  const storage = memoryStorage();
  const parameters = { cargoTeu: 1200, speedPolicy: 'slow' };
  const controller = create(fakeRuntime({ dispatchedValues }), storage, [], [], parameters);
  await controller.start();
  controller.pause();
  await controller.step();
  await controller.step();
  assert.deepEqual(dispatchedValues, [
    { ...parameters, phase: 'start' },
    { ...parameters, phase: 'step' },
    { ...parameters, phase: 'step' },
  ]);
  assert.deepEqual(controller.receipt().parameterValues, parameters);
});

test('tier controller preserves the settled run parameters across runtime-reset replay', async () => {
  const dispatchedValues = [];
  const controls = { cargoTeu: 1200, speedPolicy: 'slow' };
  const controller = create(fakeRuntime({ progressive: false, dispatchedValues }), memoryStorage(), [], [], controls);
  await controller.start();
  controls.cargoTeu = 400;
  controls.speedPolicy = 'fast';
  await controller.replay();
  assert.deepEqual(dispatchedValues, [
    { cargoTeu: 1200, speedPolicy: 'slow', phase: 'start' },
    { cargoTeu: 1200, speedPolicy: 'slow', phase: 'start' },
  ]);
});

test('tier controller drops a stale terminal restart while newer controls rebuild the runtime', async () => {
  let releaseReset;
  const resetGate = { promise: new Promise((resolve) => { releaseReset = resolve; }) };
  let resetCount = 0;
  const dispatchedValues = [];
  const controller = create(
    fakeRuntime({ progressive: false, dispatchedValues }),
    memoryStorage(),
    [],
    [],
    {},
    {
      resetRuntime: async () => {
        resetCount += 1;
        if (resetCount === 1) await resetGate.promise;
      },
    }
  );
  await controller.start();

  const staleStart = controller.start();
  await Promise.resolve();
  await controller.applyControls({ cargoTeu: 400 });
  releaseReset();
  await staleStart;

  assert.deepEqual(dispatchedValues, [
    { phase: 'start' },
    { cargoTeu: 400, phase: 'start' },
  ]);
  assert.equal(controller.snapshot().state, 'idle');
});

test('tier controller drops a stale replay while newer controls rebuild the runtime', async () => {
  let releaseReset;
  const resetGate = { promise: new Promise((resolve) => { releaseReset = resolve; }) };
  let resetCount = 0;
  const dispatchedValues = [];
  const controller = create(
    fakeRuntime({ progressive: false, dispatchedValues }),
    memoryStorage(),
    [],
    [],
    { cargoTeu: 1200 },
    {
      resetRuntime: async () => {
        resetCount += 1;
        if (resetCount === 1) await resetGate.promise;
      },
    }
  );
  await controller.start();

  const replaying = controller.replay();
  await Promise.resolve();
  await controller.applyControls({ cargoTeu: 400 });
  releaseReset();
  await replaying;

  assert.deepEqual(dispatchedValues, [
    { cargoTeu: 1200, phase: 'start' },
    { cargoTeu: 400, phase: 'start' },
  ]);
  assert.equal(controller.snapshot().state, 'idle');
});

test('tier controller discards a stale terminal settlement after controls rebuild the runtime', async () => {
  let releaseComparison;
  const comparisonGate = { promise: new Promise((resolve) => { releaseComparison = resolve; }) };
  const receipts = [];
  const controller = create(
    fakeRuntime({ comparisonGate }),
    memoryStorage(),
    [],
    receipts,
  );
  await controller.start();
  controller.pause();
  await controller.step();

  const terminalStep = controller.step();
  await Promise.resolve();
  await controller.applyControls({ cargoTeu: 400 });
  releaseComparison();
  await terminalStep;

  assert.equal(controller.snapshot().state, 'idle');
  assert.equal(controller.receipt(), null);
  assert.deepEqual(receipts, []);
});

test('tier controller does not let a stale reset reflect over newer configured controls', async () => {
  let releaseReset;
  const resetGate = { promise: new Promise((resolve) => { releaseReset = resolve; }) };
  let resetCount = 0;
  const dispatchedValues = [];
  const controller = create(
    fakeRuntime({ dispatchedValues }),
    memoryStorage(),
    [],
    [],
    {},
    {
      resetRuntime: async () => {
        resetCount += 1;
        if (resetCount === 1) await resetGate.promise;
      },
    }
  );

  const resetting = controller.reset();
  await Promise.resolve();
  await controller.applyControls({ cargoTeu: 400 });
  releaseReset();
  await resetting;

  assert.deepEqual(dispatchedValues, [{ cargoTeu: 400, phase: 'start' }]);
  assert.equal(controller.snapshot().state, 'idle');
  assert.equal(controller.snapshot().currentStep, 0);
});

test('tier controller applies changed controls immediately and leaves the configured run ready', async () => {
  const dispatchedValues = [];
  const reflected = [];
  const storage = memoryStorage();
  const controller = create(
    fakeRuntime({ dispatchedValues }),
    storage,
    [],
    [],
    {},
    { setControlValues: (_pluginId, values) => reflected.push(structuredClone(values)) }
  );

  const result = await controller.applyControls({ cargoTeu: 400, speedPolicy: 'fast' });

  assert.equal(result.state, 'idle');
  assert.equal(result.currentStep, 0);
  assert.deepEqual(dispatchedValues, [{
    cargoTeu: 400,
    speedPolicy: 'fast',
    phase: 'start',
  }]);
  assert.deepEqual(reflected.at(-1), { cargoTeu: 400, speedPolicy: 'fast' });
  assert.equal(controllerApi.readStoredReceipt(storage, 'fixture-profile'), null);
});

test('tier controller starts a configured preview without dispatching start twice', async () => {
  const dispatchedValues = [];
  const controller = create(fakeRuntime({ dispatchedValues }), memoryStorage(), [], []);
  await controller.applyControls({ cargoTeu: 400, speedPolicy: 'fast' });
  assert.equal(dispatchedValues.length, 1);

  await controller.start();

  assert.equal(dispatchedValues.length, 1);
  assert.equal(controller.snapshot().state, 'running');
});

test('tier controller executes every declared comparison independently', async () => {
  const comparisonDispatches = [];
  const controller = create(fakeRuntime({
    progressive: false,
    comparisonIds: ['first-comparison', 'second-comparison'],
    comparisonDispatches,
  }), memoryStorage(), [], []);
  await controller.start();
  assert.deepEqual(comparisonDispatches, ['first-comparison', 'second-comparison']);
  assert.deepEqual(
    controller.receipt().actionResult.comparisonExecutionReceipts.map((row) => row.id),
    ['first-comparison', 'second-comparison']
  );
  assert.equal(
    controller.receipt().actionResult.comparisonExecutionReceipt,
    controller.receipt().actionResult.comparisonExecutionReceipts[0]
  );
});

test('tier controller persists a bounded reload envelope instead of terminal evidence', () => {
  const storage = memoryStorage();
  const receipt = {
    schema: 'simulatte.tierRunReceipt.v1',
    profileId: 'fixture-profile',
    scenario: {
      id: 'fixture-scenario',
      seed: 'fixture-seed',
      description: 'x'.repeat(100_000),
    },
    parameterValues: {
      policy: 'intervention',
      selectedIds: ['one', 'two'],
    },
    actionResult: {
      status: 'settled',
      comparisonExecutionReceipt: {
        comparisonId: 'fixture-comparison',
        history: [{ payload: 'x'.repeat(2_000_000) }],
      },
    },
    pluginRuntime: {
      events: [{ payload: 'x'.repeat(2_000_000) }],
    },
  };

  assert.equal(controllerApi.writeStoredReceipt(storage, 'fixture-profile', receipt), true);
  const serialized = storage.rows.get(controllerApi.storageKey('fixture-profile'));
  assert.ok(serialized.length < 1_024);
  const stored = controllerApi.readStoredReceipt(storage, 'fixture-profile');
  assert.deepEqual(stored.scenario, { id: 'fixture-scenario', seed: 'fixture-seed' });
  assert.deepEqual(stored.parameterValues, receipt.parameterValues);
  assert.equal(stored.terminal.comparisonId, 'fixture-comparison');
  assert.equal('pluginRuntime' in stored, false);
  assert.equal('actionResult' in stored, false);
});

test('tier controller seek clamps stale targets and commits terminal preview explicitly', async () => {
  const storage = memoryStorage();
  const receipts = [];
  const controller = create(fakeRuntime(), storage, [], receipts);
  await controller.start();
  const preview = await controller.seek(99);
  assert.equal(preview.state, 'paused');
  assert.equal(preview.terminalPreview, true);
  assert.equal(preview.currentStep, 2);
  assert.equal(preview.hasReceipt, false);
  assert.equal(receipts.length, 0);
  assert.equal(controllerApi.readStoredReceipt(storage, 'fixture-profile'), null);
  await controller.resume();
  assert.equal(controller.snapshot().state, 'settled');
  assert.equal(receipts.length, 1);
});

test('tier controller yields between bounded reconstruction batches', async () => {
  let yieldCount = 0;
  const controller = create(
    fakeRuntime({ totalSteps: 10 }),
    memoryStorage(),
    [],
    [],
    {},
    { yieldControl: async () => { yieldCount += 1; } }
  );
  await controller.start();
  const preview = await controller.seek(99);
  assert.equal(preview.currentStep, 10);
  assert.equal(yieldCount, 2);
});

test('tier controller commits a terminal preview only once under concurrent steps', async () => {
  const settlementCalls = [];
  const receipts = [];
  const controller = create(fakeRuntime({ settlementCalls }), memoryStorage(), [], receipts);
  await controller.start();
  await controller.seek(99);

  await Promise.all([controller.step(), controller.step()]);

  assert.equal(controller.snapshot().state, 'settled');
  assert.deepEqual(settlementCalls, ['settle']);
  assert.equal(receipts.length, 1);
});

test('tier controller closes its public API after disposal', async () => {
  const dispatchedValues = [];
  const controller = create(fakeRuntime({ dispatchedValues }), memoryStorage(), [], []);
  controller.dispose();

  await assert.rejects(controller.start(), (error) => error.code === 'tier_run_disposed');
  await assert.rejects(controller.seek(0), (error) => error.code === 'tier_run_disposed');
  await assert.rejects(controller.applyControls({ cargoTeu: 400 }), (error) => error.code === 'tier_run_disposed');
  assert.throws(() => controller.pause(), (error) => error.code === 'tier_run_disposed');
  assert.deepEqual(dispatchedValues, []);
});
