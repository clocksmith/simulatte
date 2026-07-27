const assert = require('node:assert/strict');
const test = require('node:test');

const playbackApi = require('../public/simulatte/app/plugin-playback.js');
const contracts = require('../public/simulatte/platform/contracts/plugin-v4-contracts.js');
const clockApi = require('../public/simulatte/platform/runtime/simulation-clock.js');
const timelineApi = require('../public/simulatte/platform/runtime/simulation-timeline.js');

function fixture({
  incompleteSettlement = false,
  stepOffset = 0,
  controlValues = {},
  eventTimes = [1000, 2000],
  stepGate = null,
} = {}) {
  const provenance = contracts.createProvenance({
    origin: 'simulated',
    temporalStatus: 'forecast',
    uncertainty: { kind: 'missing', value: { reason: 'fixture' } },
    evidenceRefs: [{
      id: 'fixture:model',
      datasetId: 'fixture:dataset',
      contentHash: 'a'.repeat(64),
      modelReceiptId: 'fixture:model-receipt',
    }],
  });
  const timeline = timelineApi.createTimeline({
    id: 'fixture-timeline',
    events: eventTimes.map((simulationTimeMs, index) => ({
      schema: 'simulatte.pluginEvent.v4',
      id: `event-${index}`,
      pluginId: 'fixture',
      sequence: index,
      simulationTimeMs,
      kind: 'fixture.day',
      causationIds: index === 0 ? [] : [`event-${index - 1}`],
      correlationId: 'fixture-run',
      payload: { index },
      provenance,
    })),
  });
  const clock = clockApi.createClock({
    timeline,
    setTimer: () => 1,
    clearTimer: () => {},
  });
  let day = 0;
  let settledReceipt = null;
  const phases = [];
  const dispatchedValues = [];
  const runtime = {
    async dispatchAction(_pluginId, _actionId, context) {
      dispatchedValues.push(structuredClone(context.values));
      if (context.values.phase === 'start') {
        day = 0;
        return { status: 'running', currentStep: day, totalSteps: 2, simulationTimeMs: 0 };
      }
      if (stepGate) await stepGate.promise;
      day += 1;
      return {
        status: day === 2 ? 'settled' : 'running',
        currentStep: day + stepOffset,
        totalSteps: 2 + stepOffset,
        simulationTimeMs: day * 1000,
      };
    },
    async setScenario() { day = 0; },
    async settle() {
      return [{
        pluginId: 'fixture',
        obligationResults: [{
          obligationId: 'fixture-complete',
          status: incompleteSettlement ? 'unmet' : 'settled',
          evidence: { day },
        }],
      }];
    },
    runtimeReceipt() { return { schema: 'fixture.runtimeReceipt.v1', day }; },
  };
  const controller = playbackApi.createController({
    runtime,
    ownerPluginId: 'fixture',
    scenario: { id: 'fixture-scenario', seed: 'fixture-seed' },
    clock,
    getControlValues: () => controlValues,
    render() {},
    onPhase: (phase) => phases.push(phase),
    onSettled: (receipt) => { settledReceipt = receipt; },
    onError: () => {},
  });
  return { clock, controller, dispatchedValues, phases, settledReceipt: () => settledReceipt };
}

test('plugin playback advances on the shared clock and settles terminal obligations', async () => {
  const lane = fixture();
  await lane.controller.start();
  assert.equal(lane.controller.snapshot().phase, 'running');
  await lane.controller.step();
  assert.equal(lane.controller.snapshot().currentStep, 1);
  await lane.controller.step();
  assert.equal(lane.controller.snapshot().phase, 'completed');
  assert.deepEqual(lane.phases, ['running', 'paused', 'paused', 'completed']);
  assert.equal(lane.settledReceipt().settlements[0].obligationResults[0].status, 'settled');
});

test('plugin playback fails closed when terminal obligations remain unmet', async () => {
  const lane = fixture({ incompleteSettlement: true });
  await lane.controller.start();
  await lane.controller.step();
  await lane.controller.step();
  assert.equal(lane.controller.snapshot().phase, 'failed');
  assert.equal(lane.settledReceipt(), null);
});

test('plugin playback restores a settled run deterministically from its receipt', async () => {
  const original = fixture();
  await original.controller.start();
  await original.controller.step();
  await original.controller.step();
  const receipt = structuredClone(original.settledReceipt());

  const restored = fixture();
  await restored.controller.restore(receipt);
  assert.equal(restored.controller.snapshot().phase, 'completed');
  assert.deepEqual(restored.settledReceipt().actionResult, receipt.actionResult);
  assert.deepEqual(restored.settledReceipt().settlements, receipt.settlements);
});

test('plugin playback refuses a reload whose deterministic reconstruction diverges', async () => {
  const original = fixture();
  await original.controller.start();
  await original.controller.step();
  await original.controller.step();
  const receipt = structuredClone(original.settledReceipt());

  const changed = fixture({ stepOffset: 1 });
  await assert.rejects(
    changed.controller.restore(receipt),
    (error) => error.code === 'plugin_playback_restore_diverged'
  );
});

test('plugin playback receipt storage is profile-scoped and recoverable', () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  const receipt = { schema: 'simulatte.pluginPlaybackRunReceipt.v1', ownerPluginId: 'fixture' };
  playbackApi.saveStoredReceipt(storage, 'profile-a', receipt);
  assert.deepEqual(playbackApi.loadStoredReceipt(storage, 'profile-a'), receipt);
  assert.equal(playbackApi.loadStoredReceipt(storage, 'profile-b'), null);
  playbackApi.clearStoredReceipt(storage, 'profile-a');
  assert.equal(playbackApi.loadStoredReceipt(storage, 'profile-a'), null);
  assert.equal(playbackApi.browserStorage({ sessionStorage: storage }), storage);
});

test('plugin playback sends typed experiment parameters on every phase and receipts them', async () => {
  const parameterValues = { durationDays: 2, enabled: true, families: ['usb-c-to-c'] };
  const lane = fixture({ controlValues: parameterValues });
  await lane.controller.start();
  await lane.controller.step();
  await lane.controller.step();
  assert.deepEqual(lane.dispatchedValues.slice(0, 3), [
    { ...parameterValues, phase: 'start' },
    { ...parameterValues, phase: 'step' },
    { ...parameterValues, phase: 'step' },
  ]);
  assert.deepEqual(lane.settledReceipt().parameterValues, parameterValues);
});

test('plugin playback seek clamps stale targets and requires an explicit terminal commit', async () => {
  const lane = fixture();
  await lane.controller.start();
  const preview = await lane.controller.seek(99);
  assert.equal(preview.phase, 'paused');
  assert.equal(preview.terminalPreview, true);
  assert.equal(preview.currentStep, 2);
  assert.equal(lane.settledReceipt(), null);
  await lane.controller.resume();
  assert.equal(lane.controller.snapshot().phase, 'completed');
  assert.ok(lane.settledReceipt());
});

test('plugin playback seek aligns the clock by simulation time rather than event index', async () => {
  const lane = fixture({ eventTimes: [100, 900, 2000] });
  await lane.controller.start();
  await lane.controller.seek(1);
  assert.equal(lane.controller.snapshot().currentStep, 1);
  assert.equal(lane.clock.snapshot().currentMs, 1000);
  assert.equal(lane.clock.snapshot().cursor, 2);
});

test('plugin playback seek drains an in-flight clock step before reconstructing', async () => {
  let release;
  const stepGate = {
    promise: new Promise((resolve) => { release = resolve; }),
  };
  const lane = fixture({ stepGate });
  await lane.controller.start();
  lane.clock.step(1);
  await Promise.resolve();
  const seeking = lane.controller.seek(0);
  release();
  const reconstructed = await seeking;
  assert.equal(reconstructed.phase, 'paused');
  assert.equal(reconstructed.currentStep, 0);
  assert.equal(reconstructed.actionStatus, 'running');
  assert.equal(lane.clock.snapshot().currentMs, 0);
});
