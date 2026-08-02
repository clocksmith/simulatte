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
const compositorModule = require('../public/simulatte/platform/render/semantic-compositor.js');
const config = readJson(path.join(pluginDirectory, 'default-config.json'));
const worldModel = fixtureWorldModel();

function fixtureWorldModel() {
  const columns = 12;
  const rows = 8;
  const nodes = Array.from({ length: columns * rows }, (unused, index) => ({
    id: `bike-node-${String(index + 1).padStart(3, '0')}`,
    label: `Street ${index + 1}`,
    position: { x: (index % columns) * 100, y: Math.floor(index / columns) * 100 },
  }));
  const segments = nodes.flatMap((node, index) => {
    const next = nodes[(index + 1) % nodes.length];
    return [
      {
        id: `segment-${node.id}-${next.id}`,
        fromNodeId: node.id,
        toNodeId: next.id,
        allowedModes: ['delivery_bike'],
        lengthM: 100,
      },
      {
        id: `segment-${next.id}-${node.id}`,
        fromNodeId: next.id,
        toNodeId: node.id,
        allowedModes: ['delivery_bike'],
        lengthM: 100,
      },
    ];
  });
  const nodeById = new Map(nodes.map((row) => [row.id, row]));
  const segmentById = new Map(segments.map((row) => [row.id, row]));
  return {
    world: { id: 'fixture-city', nodes, segments },
    node(id) { return nodeById.get(id); },
    segment(id) { return segmentById.get(id) || { lengthM: 100 }; },
  };
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

function simulationFor(overrides = {}) {
  const selectedConfig = scenarioConfig(overrides);
  const network = circulation.createNetwork(selectedConfig, worldModel);
  return {
    selectedConfig,
    network,
    simulation: circulation.simulateCirculation(selectedConfig, network),
  };
}

function routesFor(simulation, day) {
  return simulation.snapshots[day].visibleJourneys.map((journey, index) => ({
    id: journey.routeId,
    hubId: journey.hubId,
    residenceId: journey.residenceId,
    direction: journey.action === 'dropoff' ? 'to-hub' : 'from-hub',
    distanceM: 500 + index,
    segmentIds: [`segment-route-${index}`],
  }));
}

function stubSdk() {
  let reducer = null;
  let state = null;
  const emittedEvents = [];
  const emittedReceipts = [];
  const routeSegmentId = worldModel.world.segments[0].id;
  return {
    worldQuery: {
      model() { return worldModel; },
    },
    routing: {
      plan() { return { segmentIds: [routeSegmentId] }; },
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

test('Cable Trader gives every modeled person one unique residence with a controllable hub network', () => {
  const { network, simulation } = simulationFor();
  assert.equal(simulation.people.length, 256);
  assert.equal(network.residences.length, 256);
  assert.equal(network.hubs.length, 4);
  assert.equal(new Set(network.residences.map((row) => row.id)).size, 256);
  assert.equal(
    new Set(network.residences.map((row) => `${row.position.x}:${row.position.y}`)).size,
    256
  );
  assert.equal(new Set(simulation.people.map((row) => row.homeResidenceId)).size, 256);
  assert.ok(simulation.people.every((person) => (
    network.residences.find((row) => row.id === person.homeResidenceId)?.preferredHubId
      === person.preferredHubId
  )));
});

test('Cable Trader creates a deterministic continuous 365-day exchange', () => {
  const first = simulationFor().simulation;
  const replay = simulationFor().simulation;
  assert.deepEqual(first, replay);
  assert.equal(first.schema, 'simulatte.plugin.cableTraderCirculation.v1');
  assert.equal(first.durationDays, 365);
  assert.equal(first.snapshots.length, 366);
  assert.equal(first.events.length, 365);
  assert.equal(first.activeHubIds.length, 4);
  assert.equal(first.activeResidenceIds.length, 256);
});

test('real supply and demand boards balance every cable across hubs and the pseudo-year', () => {
  const { simulation } = simulationFor();
  assert.equal(simulation.balance.pass, true);
  assert.equal(
    simulation.balance.startingInventory + simulation.balance.supplied,
    simulation.balance.fulfilled + simulation.balance.endingInventory
  );
  assert.ok(simulation.summary.totalSupply > 1000);
  assert.ok(simulation.summary.totalDemand > 1000);
  assert.ok(simulation.summary.cablesReused > 1000);
  simulation.snapshots.forEach((snapshot) => {
    assert.equal(snapshot.global.supply, snapshot.hubBoards.reduce((sum, row) => sum + row.supply, 0));
    assert.equal(snapshot.global.demand, snapshot.hubBoards.reduce((sum, row) => sum + row.demand, 0));
    assert.equal(snapshot.global.inventory, snapshot.hubBoards.reduce((sum, row) => sum + row.inventory, 0));
    assert.equal(snapshot.global.waiting, snapshot.hubBoards.reduce((sum, row) => sum + row.waiting, 0));
  });
});

test('every traveler moves between their own residence and preferred hub with a named cable', () => {
  const { simulation } = simulationFor();
  const journeys = simulation.snapshots.flatMap((row) => row.journeys);
  const people = new Map(simulation.people.map((row) => [row.id, row]));
  const cables = new Set(simulation.selectedCableTypeIds);
  assert.ok(journeys.length > 4000);
  assert.ok(journeys.some((row) => row.action === 'pickup'));
  assert.ok(journeys.some((row) => row.action === 'dropoff'));
  assert.ok(journeys.every((journey) => {
    const person = people.get(journey.personId);
    return person
      && journey.residenceId === person.homeResidenceId
      && journey.hubId === person.preferredHubId
      && cables.has(journey.cableTypeId)
      && ['pickup', 'dropoff'].includes(journey.action)
      && journey.routeId;
  }));
});

test('people/residences, hubs, and cable set are causal controls', () => {
  const baseline = simulationFor().simulation;
  const cases = [
    { peopleCount: 9000 },
    { hubCount: 32 },
    { selectedCableTypeIds: ['usb-a-to-c', 'hdmi', 'ethernet'] },
  ];
  cases.forEach((values) => {
    const candidate = simulationFor(values).simulation;
    assert.notEqual(candidate.configurationHash, baseline.configurationHash, JSON.stringify(values));
    assert.notDeepEqual(candidate.summary, baseline.summary, JSON.stringify(values));
  });
});

test('presentation keeps the map concise with tiny residences and bounded cable travelers', () => {
  const { selectedConfig, simulation } = simulationFor();
  const playback = { status: 'running', day: 180 };
  const views = presentation.createViews({ config: selectedConfig, simulation, playback });
  const board = views.find((row) => row.slot === 'inspector');
  const map = views.find((row) => row.slot === 'map');
  assert.equal(board.title, 'Live cable exchange board');
  assert.ok(board.rows.some((row) => row.label === 'Global supply today'));
  assert.ok(board.rows.some((row) => row.label === 'Global demand today'));
  assert.ok(simulation.hubs.every((hub) => board.rows.some((row) => row.label === hub.label)));
  assert.ok(map.rows.length <= 6);
  const visual = presentation.createPresentation({
    config: selectedConfig,
    simulation,
    playback,
    routes: routesFor(simulation, playback.day),
  });
  contracts.validatePresentationContribution('cable-trader', visual);
  assert.ok(visual.actors.length > 0 && visual.actors.length <= config.simulation.renderedTravelerCount);
  assert.equal(visual.markers.length, 128);
  assert.equal(visual.markers.filter((row) => row.id.startsWith('hub:')).length, 4);
  assert.ok(visual.markers.filter((row) => row.id.startsWith('residence:'))
    .every((row) => row.radiusM <= 0.25 && row.heightM <= 0.5));
});

test('plugin playback advances live boards and settles the complete year', async () => {
  const sdk = stubSdk();
  const instance = await plugin.activate({
    sdk,
    config,
    scenario: { id: 'everyday-exchange', seed: 'playback-proof' },
  });
  let action = await instance.handleAction('scenario.run', { values: { phase: 'start' } });
  assert.deepEqual(Object.keys(sdk.state.read()), ['playback']);
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

test('starting with unchanged rendered controls reuses the ready pseudo-year', async () => {
  const sdk = stubSdk();
  const instance = await plugin.activate({
    sdk,
    config,
    scenario: { id: 'everyday-exchange', seed: config.simulation.seed },
  });
  await instance.handleAction('scenario.run', {
    scenario: { id: 'everyday-exchange', seed: config.simulation.seed },
    values: {
      phase: 'start',
      peopleCount: config.simulation.peopleCount,
      hubCount: config.simulation.hubCount,
      selectedCableTypeIds: config.simulation.selectedCableTypeIds,
    },
  });
  assert.equal(
    sdk.emittedEvents.filter((row) => row.kind === 'cable-trader.scenario-selected').length,
    0
  );
  assert.equal(
    sdk.emittedEvents.filter((row) => row.kind === 'cable-trader.playback-started').length,
    1
  );
});

test('three focused controls rebuild people/residences, hubs, and cable set', async () => {
  const instance = await plugin.activate({
    sdk: stubSdk(),
    config,
    scenario: { id: 'everyday-exchange', seed: 'control-proof' },
  });
  const before = instance.contributeV4();
  const values = {
    phase: 'start',
    peopleCount: 10000,
    hubCount: 32,
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
    ['peopleCount', 'hubCount', 'selectedCableTypeIds']
  );
  Object.entries(values).forEach(([id, value]) => {
    if (id !== 'phase') assert.deepEqual(after.controls.controls.find((row) => row.id === id).value, value);
  });
  assert.equal(after.state.measures.find((row) => row.kind === 'unique-residences').value, 10000);
  assert.equal(after.controls.comparisons.length, 0);
});

test('v4 contribution validates thousands of residences, hubs, journeys, and supply-demand measures', async () => {
  const instance = await plugin.activate({
    sdk: stubSdk(),
    config,
    scenario: { id: 'everyday-exchange', seed: 'semantic-proof' },
  });
  await instance.handleAction('scenario.run', { values: { phase: 'start' } });
  await instance.handleAction('scenario.run', { values: { phase: 'step' } });
  const contribution = instance.contributeV4();
  assert.doesNotThrow(() => v4Contracts.validateContribution(contribution));
  const residences = contribution.presentation.layers.find((row) => row.id === 'residences');
  assert.equal(residences.geometry.kind, 'point-cloud');
  assert.equal(residences.geometry.coordinates.length, 256);
  assert.equal(contribution.presentation.layers.filter((row) => row.id.startsWith('hub:')).length, 4);
  assert.ok(contribution.presentation.layers.some((row) => row.id.startsWith('actor:')));
  assert.ok(residences.role === 'context' && residences.importance < 0.75 && residences.aggregationKey === null);
  assert.ok(contribution.presentation.layers.filter((row) => row.id.startsWith('actor:'))
    .every((row) => row.role === 'event' && row.importance >= 0.75));
  const composition = compositorModule.createCompositor().compose(contribution.presentation, {
    viewport: { width: 1200, height: 800 },
    project: (source, geometry, layer) => {
      if (geometry.coordinates?.length) return geometry.coordinates[0].slice(0, 2);
      const index = Number(/\d+/.exec(layer.id)?.[0] || 0);
      return [index % 1200, Math.floor(index / 1200) % 800];
    },
  });
  assert.equal(composition.receipt.visibleLayerCount, contribution.presentation.layers.length);
  assert.equal(composition.receipt.suppressedLayerIds.length, 0);
  assert.ok(composition.receipt.labelCount > 0);
  assert.equal(composition.primitives.filter((row) => row.id === 'residences').length, 1);
  assert.ok(composition.primitives.find((row) => row.id === 'residences').style.radiusPx < 3);
  assert.ok(composition.primitives.filter((row) => row.id.startsWith('actor:'))
    .every((row) => row.style.radiusPx >= 3));
  assert.ok(composition.labels.some((row) => row.id.startsWith('actor:')));
  assert.ok(contribution.state.measures.some((row) => row.kind === 'cable-supply'));
  assert.ok(contribution.state.measures.some((row) => row.kind === 'cable-demand'));
  assert.ok(contribution.inspections.some((row) => row.label === 'Global supply and demand'));
  const provenance = provenanceRegistry.createContributionProvenanceReceipt(contribution);
  assert.doesNotThrow(() => provenanceRegistry.createPlatformProvenanceReceipt([provenance]));
});

test('profile describes a readable continuous exchange with a few seconds per day', () => {
  const profile = readJson(path.join(root, 'public/data/application-profiles/cable-trader-pickup-v1.json'));
  assert.equal(profile.plugins[0].configId, config.id);
  assert.equal(profile.interaction.startLabel, 'Start cable exchange');
  assert.equal(profile.interaction.shuffleLabel, 'Change pseudo-year');
  assert.equal(profile.interaction.stepDelayMs, 2500);
  assert.deepEqual(profile.experience.supportedViews, ['overview', 'follow', 'top']);
  assert.equal(profile.experience.comparisonMode, 'none');
  assert.ok(profile.experience.stages.some((row) => /unique residence/i.test(row.narrative)));
  assert.ok(profile.experience.stages.some((row) => /365 modeled days/i.test(row.narrative)));
  assert.doesNotMatch(JSON.stringify(profile), /\bcrisis\b/i);
});

test('authored cable catalog and public claims preserve the modeled boundary', () => {
  const catalogPath = path.join(root, 'public/data/cable-trader/cable-circulation-catalog-v1.json');
  const catalog = readJson(catalogPath);
  assert.doesNotThrow(() => plugin.datasetValidators[catalog.schema](catalog));
  assert.ok(catalog.modeledFields.includes('cableSupply'));
  assert.ok(catalog.modeledFields.includes('uniqueResidenceCount'));
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
