const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const pluginDirectory = path.join(root, 'public/shared/plugins/cable-trader');
const circulation = require('../public/shared/plugins/cable-trader/circulation-simulation.js');
const presentation = require('../public/shared/plugins/cable-trader/circulation-presentation.js');
const plugin = require('../public/shared/plugins/cable-trader/index.js');
const contracts = require('../public/simulatte/platform/contracts/plugin-contracts.js');
const v4Contracts = require('../public/simulatte/platform/contracts/plugin-v4-contracts.js');
const provenanceRegistry = require('../public/simulatte/platform/runtime/provenance-registry.js');
const config = readJson(path.join(pluginDirectory, 'default-config.json'));

function completeRoutes() {
  return config.hubs.flatMap((hub, hubIndex) => config.locations.flatMap((location, locationIndex) => (
    ['from-hub', 'to-hub'].map((direction, directionIndex) => ({
      id: `route-${hub.id}-${location.id}-${direction}`,
      hubId: hub.id,
      locationId: location.id,
      direction,
      distanceM: 500 + hubIndex * 100 + locationIndex * 20 + directionIndex,
      segmentIds: [`segment-${hub.id}-${location.id}-${direction}`],
    }))
  )));
}

function scenarioConfig(overrides = {}) {
  return {
    ...config,
    simulation: {
      ...config.simulation,
      scenarioId: 'everyday-exchange',
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
        return { segment() { return { lengthM: 900 }; } };
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

test('Cable Trader creates a deterministic 365-day exchange with thousands of stable people', () => {
  const first = circulation.simulateCirculation(scenarioConfig(), completeRoutes());
  const replay = circulation.simulateCirculation(scenarioConfig(), completeRoutes());
  assert.deepEqual(first, replay);
  assert.equal(first.schema, 'simulatte.plugin.cableTraderCirculation.v1');
  assert.equal(first.people.length, 6000);
  assert.equal(new Set(first.people.map((row) => row.id)).size, 6000);
  assert.equal(first.durationDays, 365);
  assert.equal(first.snapshots.length, 366);
  assert.equal(first.events.length, 365);
  assert.equal(first.activeHubIds.length, 4);
  assert.equal(first.activeLocationIds.length, 12);
});

test('real supply and demand boards balance every cable across hubs and the pseudo-year', () => {
  const simulation = circulation.simulateCirculation(scenarioConfig(), completeRoutes());
  assert.equal(simulation.balance.pass, true);
  assert.equal(
    simulation.balance.startingInventory + simulation.balance.supplied,
    simulation.balance.fulfilled + simulation.balance.endingInventory
  );
  assert.ok(simulation.summary.totalSupply > 10000);
  assert.ok(simulation.summary.totalDemand > 10000);
  assert.ok(simulation.summary.cablesReused > 10000);
  simulation.snapshots.forEach((snapshot) => {
    assert.equal(snapshot.global.supply, snapshot.hubBoards.reduce((sum, row) => sum + row.supply, 0));
    assert.equal(snapshot.global.demand, snapshot.hubBoards.reduce((sum, row) => sum + row.demand, 0));
    assert.equal(snapshot.global.inventory, snapshot.hubBoards.reduce((sum, row) => sum + row.inventory, 0));
    assert.equal(snapshot.global.waiting, snapshot.hubBoards.reduce((sum, row) => sum + row.waiting, 0));
  });
});

test('every traveling person carries a named cable on an explicit pickup or drop-off route', () => {
  const simulation = circulation.simulateCirculation(scenarioConfig(), completeRoutes());
  const journeys = simulation.snapshots.flatMap((row) => row.journeys);
  const people = new Set(simulation.people.map((row) => row.id));
  const cables = new Set(simulation.selectedCableTypeIds);
  assert.ok(journeys.length > 20000);
  assert.ok(journeys.some((row) => row.action === 'pickup'));
  assert.ok(journeys.some((row) => row.action === 'dropoff'));
  assert.ok(journeys.every((row) => (
    people.has(row.personId)
    && cables.has(row.cableTypeId)
    && ['pickup', 'dropoff'].includes(row.action)
    && row.routeId
  )));
});

test('people, hubs, locations, and cable set are causal controls', () => {
  const baseline = circulation.simulateCirculation(scenarioConfig(), completeRoutes());
  const cases = [
    { peopleCount: 9000 },
    { hubCount: 6 },
    { locationCount: 16 },
    { selectedCableTypeIds: ['usb-a-to-c', 'hdmi', 'ethernet'] },
  ];
  cases.forEach((values) => {
    const candidate = circulation.simulateCirculation(scenarioConfig(values), completeRoutes());
    assert.notEqual(candidate.configurationHash, baseline.configurationHash, JSON.stringify(values));
    assert.notDeepEqual(candidate.summary, baseline.summary, JSON.stringify(values));
  });
});

test('presentation exposes global and per-hub boards plus bounded live people', () => {
  const simulation = circulation.simulateCirculation(scenarioConfig(), completeRoutes());
  const playback = { status: 'running', day: 180 };
  const views = presentation.createViews({ config, simulation, playback });
  const board = views.find((row) => row.slot === 'inspector');
  assert.equal(board.title, 'Live cable exchange board');
  assert.ok(board.rows.some((row) => row.label === 'Global supply today'));
  assert.ok(board.rows.some((row) => row.label === 'Global demand today'));
  assert.ok(config.hubs.slice(0, 4).every((hub) => board.rows.some((row) => row.label === hub.label)));
  const visual = presentation.createPresentation({
    config,
    simulation,
    playback,
    routes: completeRoutes(),
  });
  contracts.validatePresentationContribution('cable-trader', visual);
  assert.equal(visual.actors.length, 24);
  assert.ok(visual.actors.every((row) => row.kind === 'bicycle' && /Person .* (pick up|drop off)/.test(row.label)));
  assert.equal(visual.markers.filter((row) => row.id.startsWith('hub:')).length, 4);
  assert.equal(visual.markers.filter((row) => row.id.startsWith('location:')).length, 12);
});

test('plugin playback advances live boards and settles the complete year', async () => {
  const sdk = stubSdk();
  const instance = await plugin.activate({
    sdk,
    config,
    scenario: { id: 'everyday-exchange', seed: 'playback-proof' },
  });
  let action = await instance.handleAction('scenario.run', { values: { phase: 'start' } });
  assert.deepEqual(
    { status: action.status, currentStep: action.currentStep, totalSteps: action.totalSteps },
    { status: 'running', currentStep: 0, totalSteps: 365 }
  );
  action = await instance.handleAction('scenario.run', { values: { phase: 'step' } });
  assert.equal(action.currentStep, 1);
  assert.ok(instance.present().actors.length > 0);
  while (action.status === 'running') {
    action = await instance.handleAction('scenario.run', { values: { phase: 'step' } });
  }
  assert.ok(instance.settle().obligationResults.every((row) => row.status === 'settled'));
  assert.ok(sdk.emittedReceipts.some((row) => (
    row.schema === 'simulatte.plugin.cableTraderPlaybackReceipt.v2'
    && row.completedDays === 365
    && row.balance.pass
  )));
});

test('four focused controls rebuild state and remain visible in v4', async () => {
  const instance = await plugin.activate({
    sdk: stubSdk(),
    config,
    scenario: { id: 'everyday-exchange', seed: 'control-proof' },
  });
  const before = instance.contributeV4();
  const values = {
    phase: 'start',
    peopleCount: 10000,
    hubCount: 6,
    locationCount: 16,
    selectedCableTypeIds: ['usb-a-to-c', 'usb-c-to-c', 'hdmi', 'ethernet'],
  };
  await instance.handleAction('scenario.run', {
    scenario: { id: 'everyday-exchange', seed: 'control-proof' },
    values,
  });
  const after = instance.contributeV4();
  assert.notEqual(after.state.id, before.state.id);
  assert.deepEqual(
    after.controls.controls.map((row) => row.id),
    ['peopleCount', 'hubCount', 'locationCount', 'selectedCableTypeIds']
  );
  Object.entries(values).forEach(([id, value]) => {
    if (id !== 'phase') assert.deepEqual(after.controls.controls.find((row) => row.id === id).value, value);
  });
  assert.equal(after.controls.comparisons.length, 0);
});

test('v4 contribution validates hubs, locations, cable journeys, and supply-demand measures', async () => {
  const instance = await plugin.activate({
    sdk: stubSdk(),
    config,
    scenario: { id: 'everyday-exchange', seed: 'semantic-proof' },
  });
  await instance.handleAction('scenario.run', { values: { phase: 'start' } });
  await instance.handleAction('scenario.run', { values: { phase: 'step' } });
  const contribution = instance.contributeV4();
  assert.doesNotThrow(() => v4Contracts.validateContribution(contribution));
  assert.ok(contribution.presentation.layers.some((row) => row.id.startsWith('hub:')));
  assert.ok(contribution.presentation.layers.some((row) => row.id.startsWith('location:')));
  assert.ok(contribution.presentation.layers.some((row) => row.id.startsWith('actor:')));
  assert.ok(contribution.state.measures.some((row) => row.kind === 'cable-supply'));
  assert.ok(contribution.state.measures.some((row) => row.kind === 'cable-demand'));
  assert.ok(contribution.inspections.some((row) => row.label === 'Global supply and demand'));
  const provenance = provenanceRegistry.createContributionProvenanceReceipt(contribution);
  assert.doesNotThrow(() => provenanceRegistry.createPlatformProvenanceReceipt([provenance]));
});

test('profile describes a continuous community exchange rather than a crisis', () => {
  const profile = readJson(path.join(root, 'public/data/application-profiles/cable-trader-pickup-v1.json'));
  assert.equal(profile.plugins[0].configId, config.id);
  assert.equal(profile.interaction.startLabel, 'Start cable exchange');
  assert.equal(profile.interaction.shuffleLabel, 'Change pseudo-year');
  assert.deepEqual(profile.experience.supportedViews, ['overview', 'follow', 'top']);
  assert.equal(profile.experience.comparisonMode, 'none');
  assert.ok(profile.experience.stages.some((row) => /365 modeled days/i.test(row.narrative)));
  assert.doesNotMatch(JSON.stringify(profile), /\bcrisis\b/i);
});

test('authored cable catalog and public claims preserve the modeled boundary', () => {
  const catalogPath = path.join(root, 'public/data/cable-trader/cable-circulation-catalog-v1.json');
  const catalog = readJson(catalogPath);
  assert.doesNotThrow(() => plugin.datasetValidators[catalog.schema](catalog));
  assert.ok(catalog.modeledFields.includes('cableSupply'));
  assert.match(catalog.claimBoundary, /not observed/i);
  const manifest = readJson(path.join(pluginDirectory, 'plugin.json'));
  const reference = manifest.datasets.find((row) => row.id === catalog.id).reference;
  const hash = crypto.createHash('sha256').update(fs.readFileSync(catalogPath)).digest('hex');
  assert.equal(reference.sha256, hash);
  assert.equal(
    plugin.validatePublicClaim('Cable supply and demand are modeled, not observed operations.'),
    'Cable supply and demand are modeled, not observed operations.'
  );
  assert.throws(
    () => plugin.validatePublicClaim('The map shows actual current community demand.'),
    /cable_public_claim_observed_operations_invalid/
  );
});

test('manifest integrity-locks every owned Cable Trader resource', () => {
  const manifest = readJson(path.join(pluginDirectory, 'plugin.json'));
  const resources = [{ path: manifest.entry.path, integrity: manifest.entry.integrity }, ...manifest.resources];
  resources.forEach((resource) => {
    const actual = `sha384-${crypto.createHash('sha384')
      .update(fs.readFileSync(path.resolve(pluginDirectory, resource.path)))
      .digest('hex')}`;
    assert.equal(resource.integrity, actual, resource.path);
  });
});

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
