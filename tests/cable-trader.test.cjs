const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const pluginDirectory = path.join(root, 'public/shared/plugins/cable-trader');
const network = require('../public/shared/plugins/cable-trader/network-simulation.js');
const comparisonDriver = require('../public/shared/plugins/cable-trader/comparison-driver.js');
const ensembleRunner = require('../public/shared/plugins/cable-trader/ensemble-runner.js');
const plugin = require('../public/shared/plugins/cable-trader/index.js');
const contracts = require('../public/simulatte/platform/contracts/plugin-contracts.js');
const v4Contracts = require('../public/simulatte/platform/contracts/plugin-v4-contracts.js');
const config = readJson(path.join(pluginDirectory, 'default-config.json'));

function completeRoutes() {
  return config.hubs.flatMap((source, sourceIndex) => config.demandSites.map((destination, destinationIndex) => ({
    id: `route-${source.id}-${destination.id}`,
    sourceHubId: source.id,
    destinationSiteId: destination.id,
    distanceM: 700 + sourceIndex * 850 + destinationIndex * 420,
    costUnits: 1 + sourceIndex + destinationIndex,
    segmentIds: [`segment-${source.id}-${destination.id}`],
  })));
}

function scenarioConfig(overrides = {}) {
  return {
    ...config,
    simulation: {
      ...config.simulation,
      scenarioId: 'backbone-shortage',
      ...overrides,
    },
  };
}

function stubSdk() {
  let reducer = null;
  let state = null;
  const emittedEvents = [];
  const emittedReceipts = [];
  return {
    worldQuery: {
      model() {
        return { segment() { return { lengthM: 1400 }; } };
      },
    },
    routing: {
      plan({ originNodeId, destinationNodeId }) {
        return { segmentIds: [`segment-${originNodeId}-${destinationNodeId}`] };
      },
      policy() { return {}; },
    },
    state: {
      register(nextReducer, initialState) {
        reducer = nextReducer;
        state = structuredClone(initialState);
      },
      read() { return state; },
    },
    events: {
      propose(event) {
        emittedEvents.push(structuredClone(event));
        state = reducer(state, event);
        return event;
      },
    },
    receipts: {
      append(receipt) {
        emittedReceipts.push(structuredClone(receipt));
        return receipt;
      },
    },
    emittedEvents,
    emittedReceipts,
  };
}

test('exact transport utility reroutes an early choice to reach the global minimum', () => {
  const result = network.minimumCostTransport([1, 1], [1, 1], [[1, 2], [2, 100]]);
  assert.equal(result.delivered, 2);
  assert.equal(result.cost, 4);
  assert.equal(result.optimalityProven, true);
  assert.deepEqual(result.flows.map((row) => [row.source, row.destination, row.quantity]), [
    [0, 1, 1],
    [1, 0, 1],
  ]);
});

test('Cable Trader deterministically preserves individual reel, project, and transfer identities', () => {
  const first = network.simulateNetwork(scenarioConfig(), completeRoutes());
  const replay = network.simulateNetwork(scenarioConfig(), completeRoutes());
  assert.deepEqual(first, replay);
  assert.equal(first.schema, 'simulatte.plugin.cableTraderSimulation.v2');
  assert.equal(first.durationDays, 14);
  assert.equal(first.snapshots.length, 15);
  assert.equal(first.events.length, 14);
  assert.ok(first.reels.every((row) => row.id.startsWith('reel:') && row.originalMeters > 0));
  assert.ok(first.projects.every((row) => row.siteId && row.requiredCableFamilyId && row.requestedMeters > 0));
  assert.ok(first.transfers.every((row) => (
    row.reelId
    && row.projectId
    && row.quantityMeters > 0
    && row.arrivalDay > row.dispatchDay
    && row.reason
    && Array.isArray(row.rejectedAlternatives)
  )));
  assert.equal(first.conservation.pass, true);
  assert.equal(
    first.conservation.startingMeters,
    first.conservation.remainingMeters
      + first.conservation.damagedMeters
      + first.conservation.unusableRemnantMeters
      + first.conservation.dispatchedMeters
  );
});

test('dispatch decrements the exact reel before arrival and arrival advances the exact project', () => {
  const simulation = network.simulateNetwork(scenarioConfig(), completeRoutes());
  const transfer = simulation.transfers[0];
  const before = simulation.snapshots[transfer.dispatchDay - 1];
  const dispatched = simulation.snapshots[transfer.dispatchDay];
  const arrived = simulation.snapshots[transfer.arrivalDay];
  const beforeReel = before.reelInventory.find((row) => row.id === transfer.reelId);
  const afterReel = dispatched.reelInventory.find((row) => row.id === transfer.reelId);
  const beforeProject = before.projectStats.find((row) => row.id === transfer.projectId);
  const dispatchedProject = dispatched.projectStats.find((row) => row.id === transfer.projectId);
  const arrivedProject = arrived.projectStats.find((row) => row.id === transfer.projectId);
  assert.ok(afterReel.remainingMeters < beforeReel.remainingMeters);
  assert.equal(dispatchedProject.deliveredMeters, beforeProject.deliveredMeters);
  assert.ok(dispatchedProject.inFlightMeters > beforeProject.inFlightMeters);
  assert.ok(arrivedProject.deliveredMeters > dispatchedProject.deliveredMeters);
});

test('cheapest, fastest, and fairness-first execute the same crisis with policy-visible outcomes', () => {
  const cheapest = network.simulateNetwork(scenarioConfig(), completeRoutes(), { allocationPolicy: 'cheapest' });
  const fastest = network.simulateNetwork(scenarioConfig(), completeRoutes(), {
    allocationPolicy: 'fastest',
    exogenous: cheapest.exogenous,
  });
  const fairness = network.simulateNetwork(scenarioConfig(), completeRoutes(), {
    allocationPolicy: 'fairness-first',
    exogenous: cheapest.exogenous,
  });
  assert.deepEqual(fastest.exogenous, cheapest.exogenous);
  assert.deepEqual(fairness.exogenous, cheapest.exogenous);
  assert.deepEqual(
    new Set([cheapest.allocationPolicy, fastest.allocationPolicy, fairness.allocationPolicy]),
    new Set(['cheapest', 'fastest', 'fairness-first'])
  );
  const outcomes = [cheapest, fastest, fairness].map((row) => JSON.stringify({
    delivered: row.summary.deliveredMeters,
    completed: row.summary.completedProjects,
    cost: row.summary.totalCost,
    transfers: row.transfers.map((transfer) => [
      transfer.sourceHubId,
      transfer.projectId,
      transfer.quantityMeters,
    ]),
  }));
  assert.ok(new Set(outcomes).size >= 2, 'policy choices must materially alter allocation or outcomes');
});

test('every public control changes scenario identity and at least one causal output', () => {
  const baseline = network.simulateNetwork(scenarioConfig(), completeRoutes());
  const cases = [
    { demandPriority: 'deadline-first' },
    { allowSubstitutes: false },
    { reservePolicy: 'none' },
    { transferCapacityMetersPerDay: 250 },
    { allocationObjective: 'fastest' },
    { fairnessWeight: 0.5, allocationObjective: 'fairness-first' },
    { disruptionScenario: 'damaged-stock' },
    { initialInventoryPerHubType: 3 },
  ];
  for (const values of cases) {
    const candidate = network.simulateNetwork(scenarioConfig(values), completeRoutes(), {
      allocationPolicy: values.allocationObjective || config.simulation.allocationObjective,
    });
    assert.notEqual(candidate.configurationHash, baseline.configurationHash, JSON.stringify(values));
    assert.notDeepEqual({
      summary: candidate.summary,
      transfers: candidate.transfers,
      events: candidate.events,
    }, {
      summary: baseline.summary,
      transfers: baseline.transfers,
      events: baseline.events,
    }, JSON.stringify(values));
  }
});

test('staged disruptions and compatibility failures remain explicit evidence', () => {
  const damaged = network.simulateNetwork(
    scenarioConfig({ disruptionScenario: 'damaged-stock', allowSubstitutes: false }),
    completeRoutes()
  );
  assert.ok(damaged.events.some((row) => row.storyEvents.some((event) => event.kind === 'damaged-stock')));
  assert.ok(damaged.summary.damagedMeters > 0);
  assert.ok(damaged.snapshots.some((snapshot) => snapshot.projectStats.some((project) => (
    project.blockers.some((row) => /incompatible/.test(row))
  ))));
  assert.equal(damaged.conservation.pass, true);
});

test('mid-run interventions preserve history and causally alter the remaining restoration', async () => {
  const baseline = network.simulateNetwork(scenarioConfig(), completeRoutes());
  const intervenedConfig = scenarioConfig({
    interventions: [
      { id: 'user-route-closure-day-4', kind: 'route-closure', day: 4 },
      { id: 'user-release-reserve-day-6', kind: 'release-reserve', day: 6 },
    ],
  });
  const intervened = network.simulateNetwork(intervenedConfig, completeRoutes());
  assert.deepEqual(intervened.snapshots.slice(0, 4), baseline.snapshots.slice(0, 4));
  assert.notEqual(intervened.configurationHash, baseline.configurationHash);
  assert.ok(intervened.events[3].storyEvents.some((row) => row.kind === 'road-closure'));
  assert.ok(intervened.events[5].storyEvents.some((row) => row.kind === 'reserve-released'));
  assert.notDeepEqual(intervened.transfers, baseline.transfers);

  const sdk = stubSdk();
  const instance = await plugin.activate({
    sdk,
    config,
    scenario: { id: 'backbone-shortage', seed: 'live-intervention' },
  });
  await instance.handleAction('scenario.run', { values: { phase: 'start' } });
  await instance.handleAction('scenario.run', { values: { phase: 'step' } });
  const action = await instance.handleAction('cable-trader.intervene.release-reserve', { values: {} });
  assert.equal(action.status, 'running');
  assert.equal(action.currentStep, 1);
  assert.equal(action.intervention.kind, 'release-reserve');
  assert.equal(action.interventions.length, 1);
  assert.match(instance.view().find((row) => row.slot === 'map').rows
    .find((row) => row.label === 'User interventions').value, /^1$/);
});

test('both synchronized comparison definitions execute and settle', async () => {
  const simulation = network.simulateNetwork(scenarioConfig(), completeRoutes());
  for (const comparisonId of ['cheapest-vs-fastest', 'cheapest-vs-fairness']) {
    const run = await comparisonDriver.runComparison({
      config: scenarioConfig(),
      transferRoutes: completeRoutes(),
      interventionSimulation: simulation,
      comparisonId,
    });
    assert.equal(run.comparisonId, comparisonId);
    assert.equal(run.settlement.status, 'settled');
    assert.equal(run.comparisonExecutionReceipt.id, comparisonId);
    assert.deepEqual(
      run.comparisonExecutionReceipt.startingIdentity.hiddenTruth.sha256,
      run.comparisonExecutionReceipt.startingIdentity.hiddenTruth.sha256
    );
    assert.notEqual(
      run.branchSummaries.baseline.policyId,
      run.branchSummaries.intervention.policyId
    );
  }
});

test('declared ensemble preserves individual timelines and reports scenario variance', async () => {
  const first = await ensembleRunner.runEnsemble({ config: scenarioConfig(), transferRoutes: completeRoutes() });
  const replay = await ensembleRunner.runEnsemble({ config: scenarioConfig(), transferRoutes: completeRoutes() });
  assert.deepEqual(first, replay);
  assert.equal(first.members.length, config.simulation.ensembleSeeds.length);
  assert.ok(first.members.every((row) => row.branches.baseline.daily.length === 14));
  assert.equal(first.receipt.uncertainty.value.label, 'scenario_variance');
});

test('plugin playback exposes real intermediate transfers, project progress, and aligned receipts', async () => {
  const sdk = stubSdk();
  const instance = await plugin.activate({
    sdk,
    config,
    scenario: { id: 'backbone-shortage', seed: 'cable-city-logistics-2026-07' },
  });
  let action = await instance.handleAction('scenario.run', { values: { phase: 'start' } });
  assert.deepEqual(
    { status: action.status, currentStep: action.currentStep, totalSteps: action.totalSteps },
    { status: 'running', currentStep: 0, totalSteps: 14 }
  );
  let observedTransfer = false;
  let observedProgress = false;
  while (action.status === 'running') {
    action = await instance.handleAction('scenario.run', { values: { phase: 'step' } });
    const presentation = instance.present();
    contracts.validatePresentationContribution('cable-trader', presentation);
    observedTransfer ||= presentation.actors.length > 0;
    observedProgress ||= instance.contributeV4().state.measures.some((row) => (
      row.kind === 'delivered-cable' && row.value > 0
    ));
  }
  assert.equal(observedTransfer, true);
  assert.equal(observedProgress, true);
  const settlement = instance.settle();
  assert.ok(settlement.obligationResults.every((row) => row.status === 'settled'));
  assert.ok(sdk.emittedReceipts.some((row) => (
    row.schema === 'simulatte.plugin.cableTraderPlaybackReceipt.v1'
    && row.conservation.pass
    && row.transferReceipts.every((transfer) => transfer.reason && transfer.downstreamConsequence)
  )));
});

test('typed controls rebuild the complete simulation and remain visible in v4 state', async () => {
  const instance = await plugin.activate({
    sdk: stubSdk(),
    config,
    scenario: { id: 'backbone-shortage', seed: 'parameter-rebuild' },
  });
  const before = instance.contributeV4();
  const values = {
    phase: 'start',
    selectedCableFamilyIds: ['cat6-copper', 'cat6a-copper'],
    demandPriority: 'deadline-first',
    allowSubstitutes: false,
    reservePolicy: 'none',
    transferCapacityMetersPerDay: 350,
    allocationObjective: 'fastest',
    fairnessWeight: 1.5,
    disruptionScenario: 'surprise-demand',
    initialInventoryPerHubType: 3,
  };
  const started = await instance.handleAction('scenario.run', {
    scenario: { id: 'backbone-shortage', seed: 'parameter-rebuild' },
    values,
  });
  const after = instance.contributeV4();
  assert.equal(started.totalSteps, 14);
  assert.notEqual(after.state.id, before.state.id);
  for (const [id, value] of Object.entries(values)) {
    if (id === 'phase') continue;
    assert.deepEqual(after.controls.controls.find((row) => row.id === id).value, value);
  }
});

test('v4 presentation uses depots, demand sites, real transfers, explanations, and three policies', async () => {
  const instance = await plugin.activate({
    sdk: stubSdk(),
    config,
    scenario: { id: 'backbone-shortage', seed: 'semantic-evidence' },
  });
  await instance.handleAction('scenario.run', { values: { phase: 'start' } });
  for (let day = 0; day < 5; day += 1) {
    await instance.handleAction('scenario.run', { values: { phase: 'step' } });
  }
  const contribution = instance.contributeV4();
  assert.doesNotThrow(() => v4Contracts.validateContribution(contribution));
  assert.ok(contribution.presentation.layers.some((row) => row.id.startsWith('depot:')));
  assert.ok(contribution.presentation.layers.some((row) => row.id.startsWith('project-site:')));
  assert.ok(contribution.presentation.layers.some((row) => row.id.startsWith('path:transfer-')));
  assert.ok(contribution.inspections.some((row) => row.fields.some((field) => field.id === 'reason')));
  assert.deepEqual(
    contribution.controls.comparisons.map((row) => row.id),
    ['cheapest-vs-fastest', 'cheapest-vs-fairness']
  );
  assert.deepEqual(
    new Set(contribution.controls.comparisons.flatMap((row) => (
      [row.baselineScenarioId.split(':').at(-1), row.variantScenarioId.split(':').at(-1)]
    ))),
    new Set(['cheapest', 'fastest', 'fairness-first'])
  );
  await instance.handleAction('counterfactual.compare', {
    values: { comparisonId: 'cheapest-vs-fairness' },
  });
  for (let day = 5; day < 14; day += 1) {
    await instance.handleAction('scenario.run', { values: { phase: 'step' } });
  }
  const settled = instance.contributeV4();
  assert.deepEqual(
    new Set(settled.presentation.layers
      .filter((row) => row.id.startsWith('comparison:'))
      .map((row) => row.quantity.kind)),
    new Set([
      'allocation-policy.cheapest',
      'allocation-policy.fastest',
      'allocation-policy.fairness-first',
    ])
  );
});

test('profile and documentation describe a restoration story rather than an allocation dashboard', () => {
  const profile = readJson(path.join(root, 'public/data/application-profiles/cable-trader-pickup-v1.json'));
  assert.equal(profile.plugins[0].configId, config.id);
  assert.equal(profile.interaction.startLabel, 'Run restoration');
  assert.deepEqual(profile.experience.supportedViews, ['overview', 'follow', 'top', 'compare']);
  assert.ok(profile.experience.stages.some((row) => /metered cable leaves an identified reel/i.test(row.narrative)));
  assert.equal(profile.seeds.length, 4);
});

test('governed catalog limits observed evidence to cable-family context', () => {
  const catalogPath = path.join(root, 'public/data/cable-trader/cable-logistics-catalog-v1.json');
  const catalog = readJson(catalogPath);
  assert.doesNotThrow(() => plugin.datasetValidators[catalog.schema](catalog));
  assert.ok(catalog.modeledFields.includes('depotInventory'));
  assert.ok(/scenario assumptions/.test(catalog.claimBoundary));
  const manifest = readJson(path.join(pluginDirectory, 'plugin.json'));
  const reference = manifest.datasets.find((row) => row.id === catalog.id).reference;
  const hash = crypto.createHash('sha256').update(fs.readFileSync(catalogPath)).digest('hex');
  assert.equal(reference.sha256, hash);
});

test('public claims fail closed when observed operations are implied', () => {
  assert.equal(
    plugin.validatePublicClaim('The standards catalog supplies family context; inventory and demand are modeled.'),
    'The standards catalog supplies family context; inventory and demand are modeled.'
  );
  assert.throws(
    () => plugin.validatePublicClaim('The map shows actual current depot inventory.'),
    /cable_public_claim_observed_operations_invalid/
  );
});

test('manifest integrity-locks every owned Cable Trader resource', () => {
  const manifest = readJson(path.join(pluginDirectory, 'plugin.json'));
  const resources = [{ path: manifest.entry.path, integrity: manifest.entry.integrity }, ...manifest.resources];
  for (const resource of resources) {
    const actual = `sha384-${crypto.createHash('sha384')
      .update(fs.readFileSync(path.resolve(pluginDirectory, resource.path)))
      .digest('hex')}`;
    assert.equal(resource.integrity, actual, resource.path);
  }
});

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
