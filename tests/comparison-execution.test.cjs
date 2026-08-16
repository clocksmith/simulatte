const assert = require('node:assert/strict');
const test = require('node:test');

const comparisonModule = require(
  '../public/simulatte/platform/core/simulation/comparison-execution.js'
);
const pluginContracts = require('../public/simulatte/platform/contracts/plugin-v4-contracts.js');
const pluginBuilder = require('../public/shared/core/simulation/plugin-v4-builder.js');

const DATASET_HASH = 'a'.repeat(64);
const MODEL_HASH = 'b'.repeat(64);
const INPUT_HASH = 'c'.repeat(64);
const TRUTH_HASH = 'd'.repeat(64);
const CONFIGURATION_HASHES = Object.freeze({
  baseline: 'e'.repeat(64),
  intervention: 'f'.repeat(64),
});
const EVIDENCE_ID = 'model:test';
const STARTING_IDENTITY = Object.freeze({
  schema: 'simulatte.comparisonStartingIdentity.v4',
  scenarioId: 'scenario:test',
  seed: 'seed:test',
  inputHash: INPUT_HASH,
  datasetHashes: [{ id: 'dataset:test', sha256: DATASET_HASH }],
  modelHashes: [{ id: 'model:test', sha256: MODEL_HASH }],
  hiddenTruth: { id: 'truth:test', sha256: TRUTH_HASH },
});
const EVIDENCE_CATALOG = Object.freeze([pluginBuilder.modelRecord({
  id: EVIDENCE_ID,
  datasetId: 'dataset:test',
  contentHash: MODEL_HASH,
  parentIds: [],
  metadata: { algorithm: 'deterministic-test-engine' },
})]);
const PROVENANCE = pluginContracts.createProvenance({
  origin: 'simulated',
  temporalStatus: 'forecast',
  uncertainty: { kind: 'distribution', value: { seed: 'seed:test' } },
  evidenceRefs: [{
    id: EVIDENCE_ID,
    datasetId: 'dataset:test',
    contentHash: MODEL_HASH,
    modelReceiptId: EVIDENCE_ID,
  }],
});

function createFixture({
  synchronizationPolicy = 'lockstep',
  times = {
    baseline: [10, 20],
    intervention: [10, 20],
  },
  identityForRole = () => STARTING_IDENTITY,
  metricIdForRole = () => 'served',
  observationForRole = (role, index) => ({ role, visibleIndex: index }),
  transitionEvidenceForRole = () => [EVIDENCE_ID],
  observableInput = { publicDemand: 4 },
  setTimer,
  clearTimer,
  restoreReceipt = null,
} = {}) {
  const policyContexts = {};
  const simulationContexts = {};
  const createBranch = (role, multiplier) => ({
    id: `branch:${role}`,
    configuration: { multiplier },
    configurationHash: CONFIGURATION_HASHES[role],
    createPolicy(context) {
      policyContexts[role] = context;
      return {
        decide(observation) {
          return {
            add: observation.visibleIndex + context.configuration.multiplier,
          };
        },
      };
    },
    createSimulation(context) {
      simulationContexts[role] = context;
      let index = 0;
      let score = 0;
      let previousEventId = null;
      return {
        startingIdentity() {
          return identityForRole(role);
        },
        observe() {
          return observationForRole(role, index);
        },
        nextEventTimeMs() {
          return times[role][index];
        },
        advance(request) {
          const simulationTimeMs = times[role][index];
          score += request.action.add;
          const eventId = `${role}:event:${index}`;
          const event = {
            schema: 'simulatte.pluginEvent.v4',
            id: eventId,
            pluginId: `test-${role}`,
            sequence: index,
            simulationTimeMs,
            kind: `test.${role}.advanced`,
            causationIds: previousEventId === null ? [] : [previousEventId],
            correlationId: `comparison:${role}`,
            payload: { score },
            provenance: PROVENANCE,
          };
          previousEventId = eventId;
          index += 1;
          return {
            schema: 'simulatte.comparisonBranchTransition.v4',
            simulationTimeMs,
            status: index === times[role].length ? 'terminal' : 'running',
            events: [event],
            metrics: [metric(metricIdForRole(role), score)],
            evidenceIds: transitionEvidenceForRole(role),
            observation: observationForRole(role, index),
          };
        },
        settle() {
          return {
            schema: 'simulatte.comparisonBranchSettlement.v4',
            status: 'settled',
            metrics: [metric(metricIdForRole(role), score)],
            evidenceIds: [EVIDENCE_ID],
          };
        },
        cancel() {},
      };
    },
  });
  const options = {
    id: 'comparison:test',
    synchronizationPolicy,
    startingIdentity: STARTING_IDENTITY,
    observableInput,
    hiddenTruth: {
      id: 'truth:test',
      sha256: TRUTH_HASH,
      value: { latentOutcomes: [3, 5, 8] },
    },
    branches: {
      baseline: createBranch('baseline', 1),
      intervention: createBranch('intervention', 2),
    },
    evidenceCatalog: EVIDENCE_CATALOG,
    requiredEvidenceIds: [EVIDENCE_ID],
    restoreReceipt,
  };
  if (setTimer) options.setTimer = setTimer;
  if (clearTimer) options.clearTimer = clearTimer;
  const execution = comparisonModule.createComparisonExecution(options);
  return { execution, policyContexts, simulationContexts };
}

function metric(id, value, unit = 'requests') {
  return { id, value, unit, provenance: PROVENANCE };
}

test('lockstep comparison executes isolated branches and settles compatible metric deltas', () => {
  const { execution, policyContexts, simulationContexts } = createFixture();
  assert.equal(Object.hasOwn(policyContexts.baseline, 'hiddenTruth'), false);
  assert.equal(Object.hasOwn(policyContexts.intervention, 'hiddenTruth'), false);
  assert.equal(policyContexts.baseline.configurationHash, CONFIGURATION_HASHES.baseline);
  assert.equal(simulationContexts.intervention.configurationHash, CONFIGURATION_HASHES.intervention);
  assert.equal(Object.isFrozen(policyContexts.baseline), true);
  assert.equal(Object.isFrozen(simulationContexts.baseline.hiddenTruth), true);
  assert.notEqual(
    simulationContexts.baseline.hiddenTruth,
    simulationContexts.intervention.hiddenTruth
  );

  execution.step(2);
  const beforeSettlement = execution.receipt();
  assert.equal(beforeSettlement.state, 'completed');
  assert.equal(beforeSettlement.branches.baseline.timeline.eventCount, 2);
  assert.equal(beforeSettlement.branches.intervention.timeline.eventCount, 2);
  assert.deepEqual(beforeSettlement.history[0].advancedRoles, ['baseline', 'intervention']);

  const settlement = execution.settle();
  assert.equal(settlement.status, 'settled');
  assert.deepEqual(settlement.metricDeltas, [{
    id: 'served',
    unit: 'requests',
    baselineValue: 3,
    interventionValue: 5,
    delta: 2,
  }]);
  assert.equal(execution.snapshot().state, 'settled');
});

test('comparison clones driver transitions once and retains frozen owned history', () => {
  const { execution } = createFixture();
  const [operation] = execution.step();
  const recorded = execution.receipt().history[0];

  assert.equal(operation, recorded);
  assert.equal(Object.isFrozen(recorded), true);
  assert.equal(Object.isFrozen(recorded.branches.baseline.transition), true);
  assert.equal(Object.isFrozen(recorded.branches.baseline.transition.metrics[0]), true);
  assert.equal(Object.isFrozen(recorded.branches.baseline.transition.events[0]), true);
});

test('playback pauses, resumes, seeks, scrubs, replays, and reloads from receipts', () => {
  const callbacks = [];
  const timers = {
    setTimer(callback, delay) {
      callbacks.push({ callback, delay });
      return callbacks.length;
    },
    clearTimer() {},
  };
  const { execution } = createFixture(timers);
  execution.setPlaybackRate(2);
  execution.play();
  assert.equal(callbacks[0].delay, 25);
  callbacks.shift().callback();
  assert.equal(execution.snapshot().cursor, 1);
  execution.pause();
  execution.resume();
  assert.equal(execution.snapshot().state, 'playing');
  execution.pause();
  execution.step();
  assert.equal(execution.snapshot().state, 'completed');

  execution.seek(10);
  assert.equal(execution.snapshot().cursor, 1);
  execution.scrub(0);
  assert.equal(execution.snapshot().cursor, 0);
  execution.replay({ autoplay: false });
  assert.equal(execution.snapshot().cursor, 0);
  execution.step();
  const receipt = execution.receipt();

  const restored = createFixture({ ...timers, restoreReceipt: receipt }).execution;
  assert.equal(restored.snapshot().cursor, 1);
  assert.equal(restored.snapshot().positionMs, 10);
  restored.step();
  assert.equal(restored.snapshot().state, 'completed');
});

test('event-time comparison advances only branches at the next causal time', () => {
  const { execution } = createFixture({
    synchronizationPolicy: 'event-time',
    times: {
      baseline: [10, 30],
      intervention: [20, 30],
    },
  });
  const operations = execution.step(3);
  assert.deepEqual(operations.map((row) => row.advancedRoles), [
    ['baseline'],
    ['intervention'],
    ['baseline', 'intervention'],
  ]);
  assert.equal(execution.snapshot().state, 'completed');
  assert.equal(execution.settle().status, 'settled');
});

test('policy boundary rejects hidden-truth fields from observations', () => {
  assert.throws(
    () => createFixture({
      observationForRole: () => ({
        visibleIndex: 0,
        groundTruth: { winner: 'intervention' },
      }),
    }),
    { code: 'comparison_hidden_truth_leak' }
  );
  assert.throws(
    () => createFixture({
      observableInput: {
        publicDemand: 4,
        hiddenTruth: { winner: 'intervention' },
      },
    }),
    { code: 'comparison_hidden_truth_leak' }
  );
});

test('lockstep drift fails the execution before it can present a comparison', () => {
  const { execution } = createFixture({
    times: {
      baseline: [10, 20],
      intervention: [11, 20],
    },
  });
  assert.throws(() => execution.step(), { code: 'comparison_branch_clock_drift' });
  assert.equal(execution.snapshot().state, 'failed');
  assert.throws(() => execution.settle(), { code: 'comparison_branch_clock_drift' });
});

test('branch identity mismatch fails before any policy executes', () => {
  assert.throws(
    () => createFixture({
      identityForRole(role) {
        if (role === 'baseline') return STARTING_IDENTITY;
        return { ...STARTING_IDENTITY, seed: 'different-seed' };
      },
    }),
    { code: 'comparison_branch_identity_mismatch' }
  );
});

test('settlement fails closed on nonterminal, incompatible, cancelled, and unclosed runs', () => {
  const nonterminal = createFixture().execution;
  nonterminal.step();
  assert.throws(() => nonterminal.settle(), { code: 'comparison_branch_not_terminal' });

  const incompatible = createFixture({
    metricIdForRole: (role) => role === 'baseline' ? 'served' : 'unserved',
  }).execution;
  incompatible.step(2);
  assert.throws(() => incompatible.settle(), { code: 'comparison_metric_schema_incompatible' });
  assert.equal(incompatible.snapshot().state, 'failed');

  const cancelled = createFixture().execution;
  cancelled.cancel('user-requested');
  assert.equal(cancelled.snapshot().state, 'cancelled');
  assert.throws(() => cancelled.settle(), { code: 'comparison_settlement_cancelled' });
  const restoredCancellation = createFixture({
    restoreReceipt: cancelled.receipt(),
  }).execution.snapshot();
  assert.equal(restoredCancellation.state, 'cancelled');
  assert.equal(restoredCancellation.branches.baseline.status, 'cancelled');
  assert.equal(restoredCancellation.branches.intervention.status, 'cancelled');

  const missingEvidence = createFixture({
    transitionEvidenceForRole: () => ['missing:evidence'],
  }).execution;
  assert.throws(() => missingEvidence.step(), { code: 'comparison_branch_advance_failed' });
  assert.equal(missingEvidence.snapshot().fault.evidence.causeCode, 'comparison_evidence_unknown');
});

test('reload rejects receipts from a different governed starting identity', () => {
  const source = createFixture().execution;
  source.step();
  const receipt = structuredClone(source.receipt());
  receipt.startingIdentity.seed = 'different-seed';
  assert.throws(
    () => createFixture({ restoreReceipt: receipt }),
    { code: 'comparison_restore_identity_mismatch' }
  );

  const malformed = structuredClone(source.receipt());
  malformed.state = 'polished';
  assert.throws(
    () => createFixture({ restoreReceipt: malformed }),
    { code: 'comparison_receipt_state_invalid' }
  );
});
