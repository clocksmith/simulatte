const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const network = require('../public/shared/plugins/cable-trader/network-simulation.js');
const plugin = require('../public/shared/plugins/cable-trader/index.js');
const contracts = require('../public/simulatte/platform/contracts/plugin-contracts.js');
const config = JSON.parse(fs.readFileSync(path.join(root, 'public/shared/plugins/cable-trader/default-config.json'), 'utf8'));

function completeRoutes() {
  return config.hubs.flatMap((source, sourceIndex) => config.hubs
    .filter((destination) => destination.id !== source.id)
    .map((destination, destinationIndex) => ({
      sourceHubId: source.id,
      destinationHubId: destination.id,
      costUnits: 10 + sourceIndex + destinationIndex,
      segmentIds: [`segment-${source.id}-${destination.id}`],
    })));
}

test('exact transport solver reroutes an early choice to reach the global minimum', () => {
  const result = network.minimumCostTransport([1, 1], [1, 1], [[1, 2], [2, 100]]);
  assert.equal(result.delivered, 2);
  assert.equal(result.cost, 4);
  assert.equal(result.optimalityProven, true);
  assert.deepEqual(result.flows.map((row) => [row.source, row.destination, row.quantity]), [[0, 1, 1], [1, 0, 1]]);
});

test('predefined cable month serves thousands of needs with exact optimal allocations', () => {
  const first = network.simulateNetwork(config, completeRoutes());
  const second = network.simulateNetwork(config, completeRoutes());
  assert.deepEqual(first, second);
  assert.equal(first.summary.needs, 4096);
  assert.equal(first.summary.fulfilledNeeds, 4096);
  assert.equal(first.summary.fulfillmentPercent, 100);
  assert.equal(first.summary.randomEvents, 9152);
  assert.equal(first.summary.participants, 2048);
  assert.equal(first.summary.optimalAllocations, 300);
  assert.equal(first.summary.optimalityPercent, 100);
  assert.equal(first.summary.optimalityProven, true);
  assert.equal(first.daily.length, 30);
  assert.equal(first.snapshots.length, 31);
  assert.equal(first.events.length, 30);
  assert.deepEqual(first.events.map((row) => row.timestamp.value), Array.from({ length: 30 }, (_, index) => index + 1));
  assert.deepEqual(first.events[1].causalParentIds, [first.events[0].id]);
  assert.equal(first.snapshots[0].summary.needs, 0);
  assert.deepEqual(first.snapshots.at(-1).summary, first.summary);
  assert.ok(first.daily.every((day) => day.fulfilled === day.needs && day.optimalityProven));
  assert.ok(first.flows.some((flow) => flow.sourceHubId !== flow.destinationHubId && flow.quantity > 0));
  assert.ok(Object.values(first.endingInventory).every((quantity) => Number.isInteger(quantity) && quantity >= 0));
  assert.equal(first.summary.startingInventory + first.summary.returns - first.summary.needs, first.summary.endingInventory);
});

test('Cable Trader profile queries the predefined network instead of creating one-off cable requests', () => {
  const profile = JSON.parse(fs.readFileSync(path.join(root, 'public/data/application-profiles/cable-trader-pickup-v1.json'), 'utf8'));
  assert.equal(profile.plugins[0].configId, 'cable-trader-network-v3');
  assert.equal(profile.interaction.mode, 'playback');
  assert.equal(profile.interaction.shuffleLabel, 'Shuffle seed');
  assert.ok(profile.seeds.length >= 4);
  assert.ok(profile.seeds.every((row) => !/\bI need\b|\bGet me\b|\bBorrow\b/i.test(row.missionText)));
  const results = profile.seeds.slice(0, 2).map((row) => network.simulateNetwork({ ...config, simulation: { ...config.simulation, seed: row.seed } }, completeRoutes()));
  assert.notEqual(results[0].id, results[1].id);
  assert.ok(results.every((row) => row.summary.fulfillmentPercent === 100 && row.summary.optimalityPercent === 100));
});

function stubSdk() {
  let reducer = null;
  let state = null;
  const emittedReceipts = [];
  return {
    worldQuery: { model() { return { segment() { return { lengthM: 1000 }; } }; } },
    routing: {
      plan({ originNodeId, destinationNodeId }) { return { segmentIds: [`segment-${originNodeId}-${destinationNodeId}`] }; },
      policy() { return {}; },
    },
    state: {
      register(nextReducer, initialState) { reducer = nextReducer; state = structuredClone(initialState); },
      read() { return state; },
    },
    events: { propose(event) { state = reducer(state, event); return event; } },
    receipts: { append(receipt) { emittedReceipts.push(structuredClone(receipt)); return receipt; } },
    emittedReceipts,
  };
}

test('Cable Trader presents at most 64 sampled actors while retaining 2048 simulated participants', async () => {
  const instance = await plugin.activate({ sdk: stubSdk(), config, scenario: { id: 'actor-budget-regression', seed: 'actor-budget-regression' } });
  assert.equal(instance.present().actors.length, 0, 'a month that has not played must not show final actors');
  const action = instance.handleAction('scenario.run', {});
  assert.equal(action.status, 'settled');
  const presentation = instance.present();
  assert.equal(config.simulation.participantCount, 2048, 'simulation population must remain unchanged');
  assert.equal(config.simulation.renderedActorCount, 64, 'governed config must request no more than the host actor budget');
  assert.equal(presentation.actors.length, 64, 'presentation must contain exactly the configured sample');
  assert.doesNotThrow(() => contracts.validatePresentationContribution('cable-trader', presentation));
});

test('Cable Trader config schema matches the presentation actor budget', () => {
  const schema = JSON.parse(fs.readFileSync(path.join(root, 'public/shared/plugins/cable-trader/config.schema.json'), 'utf8'));
  assert.equal(schema.properties.simulation.properties.renderedActorCount.maximum, 64);
});

test('Cable Trader clamps an over-budget rendered sample down to the host cap', async () => {
  const overBudget = { ...config, simulation: { ...config.simulation, renderedActorCount: 2048 } };
  const instance = await plugin.activate({ sdk: stubSdk(), config: overBudget, scenario: { id: 'clamp-regression', seed: 'clamp-regression' } });
  instance.handleAction('scenario.run', {});
  const presentation = instance.present();
  assert.equal(presentation.actors.length, 64, 'a stale/hand-built config above the cap must still emit at most 64 actors');
  assert.doesNotThrow(() => contracts.validatePresentationContribution('cable-trader', presentation));
});

test('Cable Trader exposes progressive causal state without owning playback timing', async () => {
  const sdk = stubSdk();
  const instance = await plugin.activate({ sdk, config, scenario: { id: 'july-baseline', seed: 'progressive-seed' } });
  const started = instance.handleAction('scenario.run', { values: { phase: 'start' } });
  assert.deepEqual(
    { status: started.status, currentStep: started.currentStep, totalSteps: started.totalSteps },
    { status: 'running', currentStep: 0, totalSteps: 30 },
  );
  assert.equal('nextStepDelayMs' in started, false);
  const firstDay = instance.handleAction('scenario.run', { values: { phase: 'step' } });
  assert.equal(firstDay.currentStep, 1);
  assert.ok(firstDay.summary.needs > 0);
  assert.equal(instance.contributeV4().state.simulationTimeMs, 86400000);
  assert.equal(instance.contributeV4().events.length, 30);
  let result = firstDay;
  while (result.status === 'running') result = instance.handleAction('scenario.run', { values: { phase: 'step' } });
  assert.equal(result.currentStep, 30);
  const settlement = instance.settle();
  assert.equal(settlement.obligationResults.every((row) => row.status === 'settled'), true);
  assert.doesNotThrow(() => contracts.validateSettlementContribution('cable-trader', settlement));
  assert.ok(sdk.emittedReceipts.some((row) => row.schema === 'simulatte.plugin.cableTraderPlaybackReceipt.v1'));
});

test('Cable Trader seed labels select materially distinct authored scenario modifiers', () => {
  const routes = completeRoutes();
  const byScenario = Object.fromEntries(config.scenarioModifiers.map((modifier) => {
    const simulation = network.simulateNetwork({
      ...config,
      simulation: { ...config.simulation, scenarioId: modifier.id, seed: 'same-random-stream' },
    }, routes);
    return [modifier.id, simulation];
  }));
  const baselineHdmi = byScenario['july-baseline'].typeStats.find((row) => row.id === 'hdmi').needs;
  const surgeHdmi = byScenario['display-cable-surge'].typeStats.find((row) => row.id === 'hdmi').needs;
  assert.ok(surgeHdmi > baselineHdmi);
  const baselineBrooklyn = byScenario['july-baseline'].hubStats
    .filter((row) => ['greenpoint-cable-hub', 'williamsburg-cable-hub'].includes(row.id))
    .reduce((sum, row) => sum + row.needs, 0);
  const rebalancedBrooklyn = byScenario['brooklyn-rebalance'].hubStats
    .filter((row) => ['greenpoint-cable-hub', 'williamsburg-cable-hub'].includes(row.id))
    .reduce((sum, row) => sum + row.needs, 0);
  assert.ok(rebalancedBrooklyn > baselineBrooklyn);
});

test('Cable Trader v4 contribution separates truth axes and semantic quantities', async () => {
  const instance = await plugin.activate({ sdk: stubSdk(), config, scenario: { id: 'july-baseline', seed: 'v4-seed' } });
  instance.handleAction('scenario.run', { values: { phase: 'start' } });
  for (let day = 0; day < 10; day += 1) instance.handleAction('scenario.run', { values: { phase: 'step' } });
  const contribution = instance.contributeV4();
  assert.equal(contribution.schema, 'simulatte.pluginContribution.v4');
  assert.ok(contribution.provenanceRecords.some((row) => row.kind === 'dataset'));
  assert.ok(contribution.provenanceRecords.some((row) => row.kind === 'model'));
  assert.ok(contribution.presentation.layers.some((row) => row.id.startsWith('hub:')));
  assert.ok(contribution.presentation.layers.some((row) => row.id.startsWith('flow:')));
  assert.equal(contribution.presentation.layers.some((row) => 'widthM' in row || 'tone' in row), false);
  assert.ok(contribution.controls.controls.every((row) => row.provenance));
  assert.equal(contribution.controls.comparisons[0].synchronizedClock, true);
  assert.ok(contribution.presentation.viewIntents.every((row) => Number.isInteger(row.priority)));
});

test('Cable Trader compatibility provenance binds the exact governed dataset bytes', () => {
  const contributionApi = require('../public/shared/plugins/cable-trader/v4-contribution.js');
  const datasetPath = path.join(root, 'public/data/cable-trader/cable-compatibility-priors-v1.json');
  const dataset = JSON.parse(fs.readFileSync(datasetPath, 'utf8'));
  const sha256 = crypto.createHash('sha256').update(fs.readFileSync(datasetPath)).digest('hex');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public/shared/plugins/cable-trader/plugin.json'), 'utf8'));
  const declaration = manifest.datasets.find((row) => row.id === dataset.id);
  assert.equal(sha256, contributionApi.DATASET_REFERENCE.sha256);
  assert.equal(declaration.reference.sha256, sha256);
  assert.match(dataset.claimBoundary, /no observed hub demand/i);
  assert.ok(dataset.rows.every((row) => row.origin && row.temporalStatus && row.uncertainty));
});
