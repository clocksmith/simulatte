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
  dispatchedValues = [],
  terminalStatus = 'settled',
  comparisonIds = ['fixture-comparison'],
  comparisonDispatches = [],
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
        return { status: 'running', step, currentStep: 0, totalSteps: 2 };
      }
      step += 1;
      return {
        status: step === 2 ? terminalStatus : 'running',
        step,
        currentStep: step,
        totalSteps: 2,
      };
    },
    platformV4() {
      return { contributions: [contribution] };
    },
    async settle() {
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
    getControlValues: () => controlValues,
    render() {},
    async resetRuntime() {},
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
    setTimer: () => 1,
    clearTimer() {},
  });
}

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
