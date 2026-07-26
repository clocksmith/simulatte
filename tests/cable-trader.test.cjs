const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const network = require('../public/shared/plugins/cable-trader/network-simulation.js');
const ensembleRunner = require('../public/shared/plugins/cable-trader/ensemble-runner.js');
const plugin = require('../public/shared/plugins/cable-trader/index.js');
const contracts = require('../public/simulatte/platform/contracts/plugin-contracts.js');
const v4Contracts = require('../public/simulatte/platform/contracts/plugin-v4-contracts.js');
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
  assert.equal(first.summary.modeledRequests, 4096);
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

test('local-only baseline replays the optimized branch inputs without cross-hub transfers', () => {
  const optimized = network.simulateNetwork(config, completeRoutes());
  const localOnly = network.simulateNetwork(config, completeRoutes(), {
    allocationPolicy: 'local-only',
    exogenous: optimized.exogenous,
  });
  assert.deepEqual(localOnly.exogenous, optimized.exogenous);
  assert.equal(localOnly.seed, optimized.seed);
  assert.equal(localOnly.scenarioId, optimized.scenarioId);
  assert.equal(localOnly.durationDays, optimized.durationDays);
  assert.equal(localOnly.allocationPolicy, 'local-only');
  assert.equal(optimized.allocationPolicy, 'optimized');
  assert.equal(
    localOnly.flows.some((flow) => flow.sourceHubId !== flow.destinationHubId),
    false,
  );
  assert.ok(localOnly.summary.fulfilledNeeds < optimized.summary.fulfilledNeeds);
  assert.ok(localOnly.summary.endingInventory > optimized.summary.endingInventory);
  assert.equal(localOnly.summary.optimalityProven, true);
  assert.equal(localOnly.solver.algorithm, 'exact_local_inventory_only');
});

test('Cable Trader profile queries the predefined network instead of creating one-off cable requests', () => {
  const profile = JSON.parse(fs.readFileSync(path.join(root, 'public/data/application-profiles/cable-trader-pickup-v1.json'), 'utf8'));
  assert.equal(profile.plugins[0].configId, 'cable-trader-network-v4');
  assert.equal(profile.interaction.mode, 'playback');
  assert.equal(profile.interaction.shuffleLabel, 'Shuffle seed');
  assert.ok(profile.seeds.length >= 4);
  assert.ok(profile.seeds.every((row) => !/\bI need\b|\bGet me\b|\bBorrow\b/i.test(row.missionText)));
  const results = profile.seeds.slice(0, 2).map((row) => network.simulateNetwork({ ...config, simulation: { ...config.simulation, seed: row.seed } }, completeRoutes()));
  assert.notEqual(results[0].id, results[1].id);
  assert.ok(results.every((row) => row.summary.fulfillmentPercent === 100 && row.summary.optimalityPercent === 100));
});

function stubSdk(random = null) {
  let reducer = null;
  let state = null;
  const emittedEvents = [];
  const emittedReceipts = [];
  return {
    ...(random ? { random } : {}),
    worldQuery: { model() { return { segment() { return { lengthM: 1000 }; } }; } },
    routing: {
      plan({ originNodeId, destinationNodeId }) { return { segmentIds: [`segment-${originNodeId}-${destinationNodeId}`] }; },
      policy() { return {}; },
    },
    state: {
      register(nextReducer, initialState) { reducer = nextReducer; state = structuredClone(initialState); },
      read() { return state; },
    },
    events: {
      propose(event) {
        emittedEvents.push(structuredClone(event));
        state = reducer(state, event);
        return event;
      },
    },
    receipts: { append(receipt) { emittedReceipts.push(structuredClone(receipt)); return receipt; } },
    emittedEvents,
    emittedReceipts,
  };
}

test('Cable Trader scenario replay is independent of the host activation seed', async () => {
  const hostRandom = (value) => ({
    stream() {
      return {
        float: () => value,
        int: () => Math.floor(value * 1000),
      };
    },
  });
  const scenario = { id: 'campus-return-wave', seed: 'cable-city-campus-return-731' };
  const first = await plugin.activate({ sdk: stubSdk(hostRandom(0.1)), config, scenario });
  const restored = await plugin.activate({ sdk: stubSdk(hostRandom(0.9)), config, scenario });
  assert.deepEqual(first.contributeV4().state, restored.contributeV4().state);
  assert.deepEqual(first.settle(), restored.settle());
});

test('Cable Trader presents at most 64 sampled modeled demand events', async () => {
  const instance = await plugin.activate({ sdk: stubSdk(), config, scenario: { id: 'actor-budget-regression', seed: 'actor-budget-regression' } });
  assert.equal(instance.present().actors.length, 0, 'a month that has not played must not show final actors');
  const action = instance.handleAction('scenario.run', {});
  assert.equal(action.status, 'settled');
  const presentation = instance.present();
  assert.equal(config.simulation.renderedRequestCount, 64, 'governed config must request no more than the host actor budget');
  assert.equal(presentation.actors.length, 64, 'presentation must contain exactly the configured sample');
  assert.ok(presentation.actors.every((row) => /^Modeled request /.test(row.label)));
  assert.equal(JSON.stringify(instance.view()).includes('participant'), false);
  assert.doesNotThrow(() => contracts.validatePresentationContribution('cable-trader', presentation));
});

test('Cable Trader config schema matches the presentation actor budget', () => {
  const schema = JSON.parse(fs.readFileSync(path.join(root, 'public/shared/plugins/cable-trader/config.schema.json'), 'utf8'));
  assert.equal(schema.properties.simulation.properties.renderedRequestCount.maximum, 64);
  assert.equal(schema.properties.simulation.properties.selectedCableFamilyIds.minItems, 1);
  assert.equal(schema.properties.simulation.properties.ensembleSeeds.minItems, 2);
});

test('Cable Trader clamps an over-budget rendered sample down to the host cap', async () => {
  const overBudget = { ...config, simulation: { ...config.simulation, renderedRequestCount: 2048 } };
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

test('Cable Trader start parameters rebuild the simulated month and its receipts', async () => {
  const instance = await plugin.activate({
    sdk: stubSdk(),
    config,
    scenario: { id: 'july-baseline', seed: 'parameter-seed' },
  });
  const before = instance.contributeV4();
  const selectedCableFamilyIds = ['usb-c-to-c', 'hdmi'];
  const started = await instance.handleAction('scenario.run', {
    scenario: { id: 'july-baseline', seed: 'parameter-seed' },
    values: {
      phase: 'start',
      selectedCableFamilyIds,
      durationDays: 5,
      initialInventoryPerHubType: 3,
    },
  });
  const after = instance.contributeV4();
  assert.equal(started.totalSteps, 5);
  assert.deepEqual(started.selectedCableFamilyIds, selectedCableFamilyIds);
  assert.notEqual(after.state.id, before.state.id);
  assert.equal(after.controls.controls.find((row) => row.id === 'durationDays').value, 5);
  assert.equal(after.controls.controls.find((row) => row.id === 'initialInventoryPerHubType').value, 3);
  assert.deepEqual(after.controls.controls.find((row) => row.id === 'selectedCableFamilyIds').value, selectedCableFamilyIds);
  assert.equal(after.state.measures.find((row) => row.kind === 'ending-inventory').value, 24);
});

test('Cable Trader scenario selection emits a compact causal event', async () => {
  const sdk = stubSdk();
  const instance = await plugin.activate({ sdk, config, scenario: { id: 'july-baseline', seed: 'initial-seed' } });
  const initialStateId = instance.contributeV4().state.id;
  await instance.setScenario({ id: 'display-cable-surge', seed: 'surge-seed' });
  const event = sdk.emittedEvents.at(-1);
  assert.deepEqual(event.scenario, {
    id: 'display-cable-surge',
    seed: 'surge-seed',
    selectedCableFamilyIds: config.simulation.selectedCableFamilyIds,
  });
  assert.equal('simulation' in event, false);
  assert.notEqual(instance.contributeV4().state.id, initialStateId);
  assert.ok(sdk.emittedReceipts.some((row) => (
    row.schema === 'simulatte.plugin.cableTraderNetworkReceipt.v1'
    && row.baseSeed === 'surge-seed'
    && row.selectedCableFamilyIds.length === config.cableTypes.length
  )));
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

test('Cable Trader executes and receipts local-only versus optimized branches', async () => {
  const sdk = stubSdk();
  const instance = await plugin.activate({
    sdk,
    config,
    scenario: { id: 'july-baseline', seed: 'comparison-seed' },
  });
  const receipt = instance.comparisonReceipt();
  assert.equal(receipt.schema, 'simulatte.comparisonExecutionReceipt.v4');
  assert.equal(receipt.state, 'settled');
  assert.equal(receipt.synchronizationPolicy, 'lockstep');
  assert.match(receipt.startingIdentity.scenarioId, /^july-baseline:families:/);
  assert.match(receipt.startingIdentity.seed, /^comparison-seed:families:/);
  assert.equal(receipt.history.length, config.simulation.durationDays);
  assert.notEqual(
    receipt.branchDefinitions.baseline.configurationHash,
    receipt.branchDefinitions.intervention.configurationHash,
  );
  assert.match(
    receipt.startingIdentity.seed,
    new RegExp(`families:${config.simulation.selectedCableFamilyIds.join(',')}$`),
  );
  assert.ok(receipt.history.every((operation) => {
    const baseline = operation.branches.baseline.transition;
    const intervention = operation.branches.intervention.transition;
    return baseline.simulationTimeMs === intervention.simulationTimeMs
      && baseline.events[0].payload.allocationPolicy === 'local-only'
      && intervention.events[0].payload.allocationPolicy === 'optimized';
  }));
  const fulfilled = receipt.settlement.metricDeltas.find(
    (metric) => metric.id === 'fulfilled-demand-events'
  );
  const transfers = receipt.settlement.metricDeltas.find(
    (metric) => metric.id === 'cross-hub-transfers'
  );
  assert.ok(fulfilled.delta > 0);
  assert.ok(transfers.delta > 0);
  assert.equal(receipt.settlement.branches.baseline.status, 'settled');
  assert.equal(receipt.settlement.branches.intervention.status, 'settled');
  assert.equal(
    sdk.emittedReceipts.some((row) => row.schema === 'simulatte.comparisonExecutionReceipt.v4'),
    true,
  );
  assert.equal(JSON.stringify(receipt).includes('needCounts'), false);
  assert.equal(JSON.stringify(receipt).includes('journeyPenalties'), false);

  const rerun = await instance.handleAction('comparison.run');
  assert.equal(rerun.status, 'settled');
  assert.equal(rerun.comparisonExecutionReceipt.state, 'settled');
  const genericComparison = await instance.handleAction('counterfactual.compare');
  assert.equal(genericComparison.status, 'settled');
  assert.deepEqual(Object.keys(genericComparison.comparisonBranches), ['baseline', 'intervention']);
  assert.ok(genericComparison.comparisonBranches.baseline.fulfilledNeeds
    < genericComparison.comparisonBranches.intervention.fulfilledNeeds);
});

test('cable-family selection binds scenario identity and recomputes the complete simulation', () => {
  const selectedCableFamilyIds = ['displayport', 'hdmi'];
  const selectedConfig = {
    ...config,
    simulation: { ...config.simulation, selectedCableFamilyIds },
  };
  const reversedConfig = {
    ...config,
    simulation: { ...config.simulation, selectedCableFamilyIds: [...selectedCableFamilyIds].reverse() },
  };
  const allFamilies = network.simulateNetwork(config, completeRoutes());
  const selected = network.simulateNetwork(selectedConfig, completeRoutes());
  const reordered = network.simulateNetwork(reversedConfig, completeRoutes());

  assert.deepEqual(selected, reordered, 'selection order must normalize to governed config order');
  assert.notEqual(selected.scenarioId, allFamilies.scenarioId);
  assert.notEqual(selected.seed, allFamilies.seed);
  assert.notEqual(selected.configurationHash, allFamilies.configurationHash);
  assert.deepEqual(selected.selectedCableFamilyIds, ['hdmi', 'displayport']);
  assert.deepEqual(selected.typeStats.map((row) => row.id), ['hdmi', 'displayport']);
  assert.ok(Object.keys(selected.endingInventory).every((key) => /:(?:hdmi|displayport)$/.test(key)));
  assert.equal(selected.summary.startingInventory, config.hubs.length * 2 * config.simulation.initialInventoryPerHubType);
  assert.equal(selected.summary.allocations, config.simulation.durationDays * 2);
  assert.ok(selected.events.every((event) => (
    event.measures.configurationHash === selected.configurationHash
    && event.measures.scenarioId === selected.scenarioId
    && event.affectedEntityIds.filter((id) => id.startsWith('cable-type:')).length === 2
  )));
  assert.ok(selected.snapshots.every((snapshot) => (
    snapshot.configurationHash === selected.configurationHash
    && snapshot.selectedCableFamilyIds.length === 2
  )));
  assert.throws(
    () => network.simulateNetwork({
      ...config,
      simulation: { ...config.simulation, selectedCableFamilyIds: [] },
    }, completeRoutes()),
    /at least one cable family/,
  );
  assert.throws(
    () => network.simulateNetwork({
      ...config,
      simulation: { ...config.simulation, selectedCableFamilyIds: ['not-a-family'] },
    }, completeRoutes()),
    /unknown cable family/,
  );
});

test('browser-facing multiselect action recomputes comparison, receipts, and visual evidence', async () => {
  const sdk = stubSdk();
  const instance = await plugin.activate({
    sdk,
    config,
    scenario: { id: 'display-cable-surge', seed: 'browser-selection' },
  });
  const initialHash = instance.comparisonReceipt().startingIdentity.datasetHashes
    .find((row) => row.id === config.id).sha256;
  const result = await instance.handleAction('cable-families.set', {
    values: { selectedCableFamilyIds: ['displayport', 'hdmi'] },
  });
  assert.equal(result.status, 'settled');
  assert.deepEqual(result.selectedCableFamilyIds, ['hdmi', 'displayport']);
  assert.notEqual(result.configurationHash, initialHash);

  const contribution = instance.contributeV4();
  const control = contribution.controls.controls.find((row) => row.id === 'selectedCableFamilyIds');
  assert.equal(control.kind, 'multiselect');
  assert.deepEqual(control.value, ['hdmi', 'displayport']);
  assert.doesNotThrow(() => v4Contracts.validateControls(contribution.controls));
  const emptySelection = structuredClone(contribution.controls);
  emptySelection.controls[0].value = [];
  assert.throws(() => v4Contracts.validateControls(emptySelection), /multiselect requires at least one value/);
  const unknownSelection = structuredClone(contribution.controls);
  unknownSelection.controls[0].value = ['unknown-family'];
  assert.throws(() => v4Contracts.validateControls(unknownSelection), /not declared by its options/);
  assert.deepEqual(
    contribution.inspections.filter((row) => row.id.startsWith('inventory:'))
      .flatMap((row) => row.fields.map((field) => field.id))
      .filter((id, index, rows) => rows.indexOf(id) === index),
    ['hdmi', 'displayport'],
  );
  const standards = contribution.inspections.find((row) => row.id === 'connector-standards-evidence');
  assert.deepEqual(standards.fields.map((row) => [row.id, row.value]), [
    ['hdmi', 'standards context available'],
    ['displayport', 'scenario-only identity'],
  ]);

  instance.handleAction('scenario.run');
  const presentation = instance.present();
  assert.ok(presentation.actors.every((row) => row.id.startsWith('modeled-cable-request-')));
  assert.equal(JSON.stringify(presentation).includes('participant'), false);
  const comparisonReceipt = instance.comparisonReceipt();
  assert.equal(
    comparisonReceipt.startingIdentity.datasetHashes.find((row) => row.id === config.id).sha256,
    result.configurationHash,
  );
  assert.match(comparisonReceipt.startingIdentity.seed, /families:hdmi,displayport$/);
  const selectedReceipts = sdk.emittedReceipts.filter((row) => (
    row.schema === 'simulatte.plugin.cableTraderNetworkReceipt.v1'
    || row.schema === 'simulatte.plugin.cableTraderPlaybackReceipt.v1'
    || row.schema === 'simulatte.plugin.cableTraderEnsembleReceipt.v1'
  )).filter((row) => (
    row.selectedCableFamilyIds?.length === 2
  ));
  assert.ok(selectedReceipts.some((row) => (
    row.schema === 'simulatte.plugin.cableTraderNetworkReceipt.v1'
    && row.configurationHash === result.configurationHash
  )));
  assert.ok(selectedReceipts.some((row) => (
    row.schema === 'simulatte.plugin.cableTraderPlaybackReceipt.v1'
    && row.configurationHash === result.configurationHash
  )));
  assert.ok(selectedReceipts.some((row) => (
    row.schema === 'simulatte.plugin.cableTraderEnsembleReceipt.v1'
    && row.configurationHashes.length === config.simulation.ensembleSeeds.length
    && row.configurationHashes.every((hash) => /^[a-f0-9]{64}$/.test(hash))
  )));
});

test('declared ensemble seeds preserve timelines and report deterministic scenario variance', async () => {
  const selectedConfig = {
    ...config,
    simulation: {
      ...config.simulation,
      selectedCableFamilyIds: ['usb-c-to-c', 'hdmi'],
    },
  };
  const first = await ensembleRunner.runEnsemble({ config: selectedConfig, transferRoutes: completeRoutes() });
  const second = await ensembleRunner.runEnsemble({ config: selectedConfig, transferRoutes: completeRoutes() });
  assert.deepEqual(first, second);
  assert.equal(first.members.length, selectedConfig.simulation.ensembleSeeds.length);
  assert.ok(first.members.every((member) => (
    member.branches.baseline.daily.length === selectedConfig.simulation.durationDays
    && member.branches.intervention.daily.length === selectedConfig.simulation.durationDays
    && member.branches.baseline.eventIds.length === selectedConfig.simulation.durationDays
    && member.branches.intervention.eventIds.length === selectedConfig.simulation.durationDays
  )));
  assert.equal(first.distributions.label, 'scenario_variance');
  assert.equal(first.distributions.calibrationStatus, 'uncalibrated_arrival_and_return_processes');
  for (const metricId of [
    'fulfillmentPercent',
    'unservedDemandEvents',
    'transferBurden',
    'inventoryDepletion',
    'hubInventoryImbalance',
  ]) {
    assert.equal(
      first.distributions.branches.intervention[metricId].values.length,
      selectedConfig.simulation.ensembleSeeds.length,
    );
    assert.ok(Number.isFinite(first.distributions.interventionMinusBaseline[metricId].mean));
  }
  assert.deepEqual(first.receipt.selectedCableFamilyIds, ['usb-c-to-c', 'hdmi']);
  assert.match(first.receipt.claimBoundary, /scenario variance/i);
  assert.match(first.receipt.claimBoundary, /not calibrated/i);
  assert.equal(JSON.stringify(first.receipt).includes('needCounts'), false);
});

test('Cable Trader public claims fail when observed operations are implied', () => {
  assert.equal(
    plugin.validatePublicClaim('Modeled demand events vary across declared scenario seeds.'),
    'Modeled demand events vary across declared scenario seeds.',
  );
  assert.doesNotThrow(() => plugin.validatePublicClaim('This is not observed hub demand.'));
  for (const claim of [
    'The map reports current hub inventory.',
    'The model uses observed demand.',
    'These are actual compatibility outcomes.',
    'The comparison tracks live transport costs.',
    'Hub inventory is observed.',
  ]) {
    assert.throws(() => plugin.validatePublicClaim(claim), /observed_operations_invalid/);
  }
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
  assert.equal(
    plugin.datasetValidators['simulatte.cableCompatibilityPriors.v1'](dataset),
    dataset,
  );
  assert.match(dataset.claimBoundary, /no observed hub demand/i);
  assert.ok(dataset.rows.every((row) => row.origin && row.temporalStatus && row.uncertainty));
});

test('Cable Trader manifest integrity-locks comparison and ensemble drivers', () => {
  const pluginDirectory = path.join(root, 'public/shared/plugins/cable-trader');
  const manifest = JSON.parse(fs.readFileSync(path.join(pluginDirectory, 'plugin.json'), 'utf8'));
  for (const filename of ['comparison-driver.js', 'ensemble-runner.js']) {
    const resource = manifest.resources.find((row) => row.path === `./${filename}`);
    const integrity = `sha384-${crypto.createHash('sha384')
      .update(fs.readFileSync(path.join(pluginDirectory, filename)))
      .digest('hex')}`;
    assert.equal(resource.integrity, integrity);
  }
  assert.ok(manifest.receiptSchemas.includes('simulatte.comparisonExecutionReceipt.v4'));
  assert.ok(manifest.receiptSchemas.includes('simulatte.plugin.cableTraderEnsembleReceipt.v1'));
});
