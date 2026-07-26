const assert = require('node:assert/strict');
const test = require('node:test');

const playbackApi = require('../public/simulatte/app/plugin-playback.js');
const contracts = require('../public/simulatte/platform/contracts/plugin-v4-contracts.js');
const clockApi = require('../public/simulatte/platform/runtime/simulation-clock.js');
const timelineApi = require('../public/simulatte/platform/runtime/simulation-timeline.js');

function fixture({ incompleteSettlement = false } = {}) {
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
    events: [1, 2].map((day, index) => ({
      schema: 'simulatte.pluginEvent.v4',
      id: `day-${day}`,
      pluginId: 'fixture',
      sequence: index,
      simulationTimeMs: day * 1000,
      kind: 'fixture.day',
      causationIds: day === 1 ? [] : [`day-${day - 1}`],
      correlationId: 'fixture-run',
      payload: { day },
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
  const runtime = {
    async dispatchAction(_pluginId, _actionId, context) {
      if (context.values.phase === 'start') {
        day = 0;
        return { status: 'running', currentStep: day, totalSteps: 2 };
      }
      day += 1;
      return { status: day === 2 ? 'settled' : 'running', currentStep: day, totalSteps: 2 };
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
    render() {},
    onPhase: (phase) => phases.push(phase),
    onSettled: (receipt) => { settledReceipt = receipt; },
    onError: () => {},
  });
  return { controller, phases, settledReceipt: () => settledReceipt };
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
