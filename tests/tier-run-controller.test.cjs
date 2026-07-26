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
  };
}

function fakeRuntime({ progressive = true, dispatchedValues = [] } = {}) {
  let step = 0;
  const contribution = {
    pluginId: 'fixture',
    controls: {
      comparisons: [{ id: 'fixture-comparison' }],
    },
    provenanceRecords: [modelRecord()],
  };
  return {
    activePluginIds: ['fixture'],
    async dispatchAction(_pluginId, actionId, context) {
      if (actionId === 'counterfactual.compare') {
        return {
          status: 'settled',
          comparisonId: 'fixture-comparison',
          comparisonBranches: {
            baseline: { served: 4 },
            intervention: { served: 7 },
          },
        };
      }
      dispatchedValues.push(structuredClone(context.values));
      if (!progressive) return { status: 'settled', result: 'terminal' };
      if (context.values.phase === 'start') {
        step = 0;
        return { status: 'running', step };
      }
      step += 1;
      return { status: step === 2 ? 'settled' : 'running', step };
    },
    platformV4() {
      return { contributions: [contribution] };
    },
    async settle() {
      return [{ pluginId: 'fixture', obligationResults: [], losses: [] }];
    },
  };
}

function create(runtime, storage, states, receipts, controlValues = {}) {
  const scenario = { id: 'fixture-scenario', seed: 'fixture-seed' };
  return controllerApi.createController({
    getRuntime: () => runtime,
    ownerPluginId: 'fixture',
    scenario,
    profileId: 'fixture-profile',
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
  assert.equal(controllerApi.readStoredReceipt(storage, 'fixture-profile').scenario.seed, 'fixture-seed');
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
