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
  comparisonIds = [],
  startPresentationChanged,
  startGate = null,
  interventionGate = null,
  terminalAtStart = false,
  scenarioChanges = null,
  scenario = { id: 'fixture-scenario', seed: 'fixture-seed' },
  interventionDispatches = null,
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
  const modelEnvelope = contracts.createProvenanceEnvelope({
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
  let interventions = [];
  let settledReceipt = null;
  const phases = [];
  const phaseSnapshots = [];
  const dispatchedValues = [];
  const reflectedControlValues = [];
  const errors = [];
  let renderCount = 0;
  let settlementCount = 0;
  const runtime = {
    async dispatchAction(_pluginId, actionId, context) {
      if (actionId === 'counterfactual.compare') {
        dispatchedValues.push({ comparisonId: context.values.comparisonId });
        return {
          status: 'settled',
          comparisonId: context.values.comparisonId,
          comparisonBranches: {
            baseline: { served: 4 },
            intervention: { served: 7 },
          },
        };
      }
      if (actionId.includes('.intervene.')) {
        interventionDispatches?.push(actionId);
        if (interventionGate) await interventionGate.promise;
        interventions.push({ actionId, day, values: structuredClone(context.values) });
        return {
          status: day === 2 ? 'settled' : 'running',
          currentStep: day,
          totalSteps: 2,
          simulationTimeMs: day * 1000,
          interventionCount: interventions.length,
        };
      }
      dispatchedValues.push(structuredClone(context.values));
      if (context.values.phase === 'start') {
        if (startGate) await startGate.promise;
        day = 0;
        interventions = [];
        return {
          status: terminalAtStart ? 'settled' : 'running',
          currentStep: terminalAtStart ? 1 : day,
          totalSteps: terminalAtStart ? 1 : 2,
          simulationTimeMs: 0,
          interventionCount: 0,
          ...(startPresentationChanged === undefined ? {} : { presentationChanged: startPresentationChanged }),
        };
      }
      if (stepGate) await stepGate.promise;
      day += 1;
      return {
        status: day === 2 ? 'settled' : 'running',
        currentStep: day + stepOffset,
        totalSteps: 2 + stepOffset,
        simulationTimeMs: day * 1000,
        interventionCount: interventions.length,
      };
    },
    async setScenario(nextScenario) {
      scenarioChanges?.push(structuredClone(nextScenario));
      day = 0;
    },
    async settle() {
      settlementCount += 1;
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
    ...(comparisonIds.length ? {
      activePluginIds: ['fixture'],
      platformV4() {
        return {
          contributions: [{
            pluginId: 'fixture',
            controls: { comparisons: comparisonIds.map((id) => ({ id })) },
            provenanceRecords: [{
              schema: 'simulatte.provenanceRecord.v4',
              id: 'fixture:model',
              kind: 'model',
              datasetId: 'fixture:dataset',
              contentHash: 'a'.repeat(64),
              parentIds: [],
              metadata: {},
              envelope: modelEnvelope,
            }],
          }],
        };
      },
    } : {}),
  };
  const controller = playbackApi.createController({
    runtime,
    ownerPluginId: 'fixture',
    scenario,
    clock,
    getControlValues: () => (
      typeof controlValues === 'function' ? controlValues() : controlValues
    ),
    setControlValues: (_pluginId, values) => reflectedControlValues.push(structuredClone(values)),
    render() { renderCount += 1; },
    onPhase: (phase, snapshot) => {
      phases.push(phase);
      phaseSnapshots.push(snapshot);
    },
    onSettled: (receipt) => { settledReceipt = receipt; },
    onError: (error) => errors.push(error),
  });
  return {
    clock,
    controller,
    dispatchedValues,
    errors,
    phases,
    phaseSnapshots,
    reflectedControlValues,
    renderCount: () => renderCount,
    settlementCount: () => settlementCount,
    settledReceipt: () => settledReceipt,
  };
}

test('plugin playback advances on the shared clock and settles terminal obligations', async () => {
  const lane = fixture();
  await lane.controller.start();
  assert.equal(lane.controller.snapshot().phase, 'running');
  await lane.controller.step();
  assert.equal(lane.controller.snapshot().currentStep, 1);
  await lane.controller.step();
  assert.equal(lane.controller.snapshot().phase, 'completed');
  assert.deepEqual(lane.phases, ['running', 'running', 'paused', 'paused', 'paused', 'completed']);
  assert.equal(lane.phaseSnapshots[1].totalSteps, 2);
  assert.equal(lane.phaseSnapshots[3].currentStep, 1);
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

test('plugin playback restores an immediately settled run without dispatching a step', async () => {
  const original = fixture({ terminalAtStart: true });
  await original.controller.start();
  const receipt = structuredClone(original.settledReceipt());
  const restored = fixture({ terminalAtStart: true });

  await restored.controller.restore(receipt);

  assert.equal(restored.controller.snapshot().phase, 'completed');
  assert.equal(restored.dispatchedValues.length, 1);
  assert.deepEqual(restored.settledReceipt().actionResult, receipt.actionResult);
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
  assert.equal(changed.controller.snapshot().phase, 'failed');
  assert.equal(changed.errors.at(-1).code, 'plugin_playback_restore_diverged');
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

test('plugin playback snapshots scenario and terminal evidence before publishing a receipt', async () => {
  const scenario = { id: 'fixture-scenario', seed: 'original-seed' };
  const lane = fixture({ scenario });
  await lane.controller.start();
  await lane.controller.step();
  await lane.controller.step();
  const receipt = lane.settledReceipt();
  scenario.seed = 'mutated-after-settlement';

  assert.equal(receipt.scenario.seed, 'original-seed');
  assert.equal(Object.isFrozen(receipt), true);
  assert.equal(Object.isFrozen(receipt.actionResult), true);
  assert.equal(Object.isFrozen(receipt.settlements[0].obligationResults[0]), true);
});

test('plugin playback captures controls when Step starts a ready run', async () => {
  const parameterValues = { durationDays: 4, enabled: true };
  const lane = fixture({ controlValues: parameterValues });
  await lane.controller.step();
  assert.deepEqual(lane.dispatchedValues[0], { ...parameterValues, phase: 'start' });
  assert.equal(lane.controller.snapshot().phase, 'paused');
});

test('plugin playback applies changed controls immediately and returns to a configured ready state', async () => {
  const lane = fixture({ controlValues: { peopleCount: 256, hubCount: 4 } });
  await lane.controller.start();
  await lane.controller.step();
  const result = await lane.controller.applyControls({ peopleCount: 512, hubCount: 8 });

  assert.equal(result.phase, 'ready');
  assert.equal(result.currentStep, 0);
  assert.equal(result.actionStatus, 'running');
  assert.deepEqual(lane.dispatchedValues.at(-1), {
    peopleCount: 512,
    hubCount: 8,
    phase: 'start',
  });
  assert.deepEqual(lane.reflectedControlValues.at(-1), {
    peopleCount: 512,
    hubCount: 8,
  });
  assert.equal(lane.clock.snapshot().currentMs, 0);
});

test('plugin playback starts a configured preview without dispatching start twice', async () => {
  const lane = fixture();
  await lane.controller.applyControls({ peopleCount: 512, hubCount: 8 });
  assert.equal(lane.dispatchedValues.length, 1);

  await lane.controller.start();

  assert.equal(lane.dispatchedValues.length, 1);
  assert.equal(lane.controller.snapshot().phase, 'running');
});

test('plugin playback Start does not reset a paused simulation', async () => {
  const lane = fixture();
  await lane.controller.start();
  await lane.controller.step();
  const before = lane.dispatchedValues.length;

  await lane.controller.start();

  assert.equal(lane.controller.snapshot().phase, 'paused');
  assert.equal(lane.controller.snapshot().currentStep, 1);
  assert.equal(lane.dispatchedValues.length, before);
});

test('plugin playback drops an in-flight start after disposal', async () => {
  let releaseStart;
  const startGate = { promise: new Promise((resolve) => { releaseStart = resolve; }) };
  const lane = fixture({ startGate });
  const starting = lane.controller.start();
  await Promise.resolve();
  lane.controller.dispose();
  releaseStart();
  await starting;

  assert.equal(lane.renderCount(), 0);
  assert.equal(lane.clock.snapshot().state, 'paused');
});

test('plugin playback closes its public API after disposal', async () => {
  const lane = fixture();
  lane.controller.dispose();

  await assert.rejects(lane.controller.start(), (error) => error.code === 'plugin_playback_disposed');
  await assert.rejects(lane.controller.seek(0), (error) => error.code === 'plugin_playback_disposed');
  assert.throws(() => lane.controller.pause(), (error) => error.code === 'plugin_playback_disposed');
  assert.deepEqual(lane.dispatchedValues, []);
});

test('plugin playback drops queued reconstruction after disposal', async () => {
  let releaseStart;
  const startGate = { promise: new Promise((resolve) => { releaseStart = resolve; }) };
  const lane = fixture({ startGate });
  const applying = lane.controller.applyControls({ peopleCount: 512 });
  await Promise.resolve();
  const seeking = lane.controller.seek(0);
  lane.controller.dispose();
  releaseStart();

  await applying;
  await assert.rejects(seeking, (error) => error.code === 'plugin_playback_disposed');
  assert.equal(lane.dispatchedValues.length, 0);
});

test('plugin playback discards an intervention superseded by a control rebuild', async () => {
  let releaseIntervention;
  const interventionGate = {
    promise: new Promise((resolve) => { releaseIntervention = resolve; }),
  };
  const lane = fixture({ interventionGate });
  await lane.controller.start();
  const intervening = lane.controller.intervene('fixture.intervene.release-reserve', { reason: 'shortage' });
  await Promise.resolve();
  const applying = lane.controller.applyControls({ peopleCount: 512 });
  releaseIntervention();
  await Promise.all([intervening, applying]);

  assert.equal(lane.controller.snapshot().phase, 'ready');
  assert.equal(lane.controller.snapshot().currentStep, 0);
});

test('plugin playback skips a redundant ready-state render when start preserves the presentation', async () => {
  const lane = fixture({ startPresentationChanged: false });
  await lane.controller.start();
  assert.equal(lane.renderCount(), 0);
  await lane.controller.seek(2);
  assert.equal(lane.renderCount(), 1);
});

test('plugin playback preserves the completed run parameters across replay', async () => {
  const mutable = { value: { durationDays: 2, enabled: true } };
  const lane = fixture({ controlValues: () => mutable.value });
  await lane.controller.start();
  await lane.controller.step();
  await lane.controller.step();
  mutable.value = { durationDays: 9, enabled: false };
  await lane.controller.replay();
  assert.deepEqual(lane.dispatchedValues.at(-1), {
    durationDays: 2,
    enabled: true,
    phase: 'start',
  });
});

test('plugin playback receipts and deterministically restores a mid-run intervention', async () => {
  const original = fixture();
  await original.controller.start();
  await original.controller.step();
  await original.controller.intervene('fixture.intervene.release-reserve', { reason: 'shortage' });
  await original.controller.step();
  const receipt = structuredClone(original.settledReceipt());
  assert.deepEqual(receipt.interventions, [{
    actionId: 'fixture.intervene.release-reserve',
    values: { reason: 'shortage' },
    afterStep: 1,
  }]);
  assert.equal(receipt.actionResult.interventionCount, 1);

  const restored = fixture();
  await restored.controller.restore(receipt);
  assert.deepEqual(restored.settledReceipt().actionResult, receipt.actionResult);
  assert.deepEqual(restored.settledReceipt().interventions, receipt.interventions);
});

test('plugin playback executes and receipts every declared comparison', async () => {
  const lane = fixture({ comparisonIds: ['comparison-a', 'comparison-b'] });
  await lane.controller.start();
  await lane.controller.step();
  await lane.controller.step();
  assert.deepEqual(lane.errors, []);
  assert.deepEqual(
    lane.settledReceipt().comparisonExecutionReceipts.map((row) => row.id),
    ['comparison-a', 'comparison-b']
  );
  assert.deepEqual(
    lane.dispatchedValues.slice(-2),
    [{ comparisonId: 'comparison-a' }, { comparisonId: 'comparison-b' }]
  );
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

test('plugin playback commits a terminal preview only once under concurrent steps', async () => {
  const lane = fixture();
  await lane.controller.start();
  await lane.controller.seek(99);

  await Promise.all([lane.controller.step(), lane.controller.step()]);

  assert.equal(lane.controller.snapshot().phase, 'completed');
  assert.equal(lane.settlementCount(), 1);
});

test('plugin playback serializes overlapping intervention actions', async () => {
  let releaseIntervention;
  const interventionGate = { promise: new Promise((resolve) => { releaseIntervention = resolve; }) };
  const interventionDispatches = [];
  const lane = fixture({ interventionGate, interventionDispatches });
  await lane.controller.start();
  const first = lane.controller.intervene('fixture.intervene.first', { sequence: 1 });
  const second = lane.controller.intervene('fixture.intervene.second', { sequence: 2 });
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(interventionDispatches, ['fixture.intervene.first']);
  releaseIntervention();
  await Promise.all([first, second]);
  assert.deepEqual(interventionDispatches, ['fixture.intervene.first', 'fixture.intervene.second']);
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

test('plugin playback restore drains old queued actions before resetting its scenario', async () => {
  const original = fixture();
  await original.controller.start();
  await original.controller.step();
  await original.controller.step();
  const receipt = structuredClone(original.settledReceipt());

  let releaseStep;
  const stepGate = { promise: new Promise((resolve) => { releaseStep = resolve; }) };
  const scenarioChanges = [];
  const lane = fixture({ stepGate, scenarioChanges });
  await lane.controller.start();
  lane.clock.step(1);
  await Promise.resolve();
  const restoring = lane.controller.restore(receipt);
  await Promise.resolve();
  assert.deepEqual(scenarioChanges, []);

  releaseStep();
  await restoring;
  assert.deepEqual(scenarioChanges, [{ id: 'fixture-scenario', seed: 'fixture-seed' }]);
  assert.equal(lane.controller.snapshot().phase, 'completed');
});

test('plugin playback restore rejects a newly introduced comparison proof', async () => {
  const original = fixture();
  await original.controller.start();
  await original.controller.step();
  await original.controller.step();
  const receipt = structuredClone(original.settledReceipt());
  const changed = fixture({ comparisonIds: ['new-comparison'] });

  await assert.rejects(
    changed.controller.restore(receipt),
    (error) => error.code === 'plugin_playback_restore_comparison_diverged'
  );
  assert.equal(changed.controller.snapshot().phase, 'failed');
});
