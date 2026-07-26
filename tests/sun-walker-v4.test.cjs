const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');

const contracts = require('../public/simulatte/platform/contracts/plugin-contracts.js');
const exposure = require('../public/shared/plugins/sun-walker/sun-exposure.js');
const environmentApi = require('../public/shared/plugins/sun-walker/environment.js');
const simulationApi = require('../public/shared/plugins/sun-walker/sun-route-simulation.js');
const presentationApi = require('../public/shared/plugins/sun-walker/presentation.js');
const compatibilityApi = require('../public/shared/plugins/sun-walker/compatibility-adapter.js');
const plugin = require('../public/shared/plugins/sun-walker/index.js');

const pluginRoot = require.resolve('../public/shared/plugins/sun-walker/plugin.json').replace(/plugin\.json$/, '');
const governancePath = require.resolve('../public/data/sun-walker/sun-walker-model-governance-v1.json');
const environmentPath = require.resolve('../public/data/sun-walker/sun-walker-environment-v1.json');
const governance = JSON.parse(fs.readFileSync(governancePath, 'utf8'));
const environment = JSON.parse(fs.readFileSync(environmentPath, 'utf8'));
const config = JSON.parse(fs.readFileSync(`${pluginRoot}default-config.json`, 'utf8'));

function fixture() {
  const segments = new Map([
    ['fast-1', {
      id: 'fast-1',
      geometry: [{ x: 0, y: 500 }, { x: 100, y: 500 }],
      lengthM: 100,
      speedLimitMps: 1.4,
    }],
    ['shade-1', {
      id: 'shade-1',
      geometry: [{ x: 0, y: 0 }, { x: 112, y: 0 }],
      lengthM: 112,
      speedLimitMps: 1.4,
    }],
  ]);
  const building = {
    id: 'building-test-1',
    heightM: 35,
    centroid: { x: 50, y: 0 },
    footprint: [
      { x: -200, y: -200 },
      { x: 300, y: -200 },
      { x: 300, y: 200 },
      { x: -200, y: 200 },
      { x: -200, y: -200 },
    ],
  };
  const world = {
    id: 'sun-test-world-v1',
    coordinateSystem: { originWgs84: { latitude: 40.73, longitude: -73.99 } },
    nodes: [],
    renderGeometry: { buildings: [building] },
    provenance: {
      retrievedAt: '2026-07-01T00:00:00Z',
      license: 'test fixture',
      sources: { buildings: { id: 'test-buildings-v1', sha256: 'a'.repeat(64) } },
    },
  };
  const worldModel = { segment: (id) => segments.get(id) || null };
  return {
    world,
    worldModel,
    routes: [
      { segmentIds: ['fast-1'] },
      { segmentIds: ['shade-1'] },
    ],
  };
}

function simulate(overrides = {}) {
  const rows = fixture();
  return simulationApi.simulate({
    ...rows,
    departureAt: '2026-07-19T17:00:00Z',
    config: { ...config, directSunWeight: 4 },
    seed: 'sun-test-seed',
    buildingReceipt: {
      id: rows.world.id,
      sha256: 'a'.repeat(64),
      source: 'verified_test_fixture',
    },
    governance,
    governanceReceipt: {
      id: governance.id,
      sha256: crypto.createHash('sha256').update(fs.readFileSync(governancePath)).digest('hex'),
    },
    environment,
    environmentReceipt: {
      id: environment.id,
      sha256: crypto.createHash('sha256').update(fs.readFileSync(environmentPath)).digest('hex'),
    },
    ...overrides,
  });
}

test('Sun Walker manifest identity-locks every owned resource and governed model data', () => {
  const manifest = JSON.parse(fs.readFileSync(`${pluginRoot}plugin.json`, 'utf8'));
  contracts.validateManifest(manifest);
  plugin.datasetValidators['simulatte.sunWalkerModelGovernance.v1'](governance);
  plugin.datasetValidators['simulatte.sunWalkerEnvironment.v1'](environment);
  const declaration = manifest.datasets.find((row) => row.id === governance.id);
  const environmentDeclaration = manifest.datasets.find((row) => row.id === environment.id);
  assert.equal(declaration.required, true);
  assert.equal(declaration.reference.sha256, crypto.createHash('sha256').update(fs.readFileSync(governancePath)).digest('hex'));
  assert.equal(environmentDeclaration.required, true);
  assert.equal(environmentDeclaration.reference.sha256, crypto.createHash('sha256').update(fs.readFileSync(environmentPath)).digest('hex'));
  const resources = new Map(manifest.resources.map((row) => [row.path, row.integrity]));
  for (const [relativePath, integrity] of resources) {
    const actual = crypto.createHash('sha384').update(fs.readFileSync(`${pluginRoot}${relativePath.slice(2)}`)).digest('hex');
    assert.equal(integrity, `sha384-${actual}`, relativePath);
  }
  const entryHash = crypto.createHash('sha384').update(fs.readFileSync(`${pluginRoot}index.js`)).digest('hex');
  assert.equal(manifest.entry.integrity, `sha384-${entryHash}`);
});

test('arrival-time route simulation is deterministic, causal, progressive, and truth classified', () => {
  const first = simulate();
  const second = simulate();
  assert.deepEqual(first, second);
  assert.equal(first.status, 'ready');
  assert.equal(first.candidates.length, 2);
  assert.ok(first.timeline.events.length > 3);
  assert.equal(first.timeline.snapshots.length, first.timeline.events.length);
  assert.equal(first.timeline.events[0].kind, 'sun-walker.walk-initialized');
  assert.equal(first.timeline.events.at(-1).kind, 'sun-walker.walk-completed');
  assert.equal(first.timeline.snapshots.at(-1).state.status, 'settled');
  assert.equal(first.timeline.snapshots.at(-1).state.progress, 1);
  first.timeline.events.forEach((event, index) => {
    assert.equal(event.sequence, index);
    assert.equal(event.truth.origin, 'simulated');
    assert.equal(event.truth.temporalStatus, 'forecast');
    if (index) assert.deepEqual(event.causalParents, [first.timeline.events[index - 1].id]);
    if (index) assert.ok(Date.parse(event.timestamp) >= Date.parse(first.timeline.events[index - 1].timestamp));
  });
  const selected = first.candidates.find((row) => row.id === first.selectedCandidateId);
  assert.equal(selected.route.segmentIds[0], 'shade-1');
  assert.ok(selected.metrics.shadeSeconds > 0);
  assert.equal(selected.metrics.buildingShadeSeconds, selected.metrics.shadeSeconds);
  assert.equal(selected.metrics.canopyShadeSeconds, 0);
  assert.ok(selected.samples.every((row) => row.solarPosition.azimuthDegrees >= 0 && row.solarPosition.azimuthDegrees < 360));
  assert.ok(selected.samples.every((row, index) => index === 0 || Date.parse(row.timestamp) > Date.parse(selected.samples[index - 1].timestamp)));
  assert.equal(first.dataReceipt.datasets[0].truth.origin, 'observed');
  assert.equal(first.modelReceipt.truth.origin, 'modeled');
  assert.equal(first.modelReceipt.parameters.weatherParticipation, true);
  assert.equal(first.modelReceipt.uncertainty.value.treeCanopy, 'historical tree identity observed; crown geometry and current presence modeled');
  assert.equal(first.dataReceipt.datasets[2].sourceReceipts.length, 2);
  assert.ok(first.candidates.every((row) => Number.isFinite(row.metrics.directBeamEquivalentSeconds)));
});

test('semantic layers carry quantities and evidence without permanent styling authority', () => {
  const simulation = simulate();
  const semantic = presentationApi.semanticPresentation(simulation, simulation.timeline.snapshots.length - 1);
  assert.equal(semantic.schema, 'simulatte.presentationLayerSet.v4');
  assert.deepEqual(semantic.layers.map((row) => row.semanticLayerType), [
    'route.exposure',
    'route.comparison-baseline',
    'exposure.sample-progress',
    'building.shadow-evidence',
    'tree.canopy-evidence',
    'weather.historical-analog',
  ]);
  assert.ok(semantic.layers.every((row) => row.evidenceRefs.length > 0));
  assert.ok(semantic.viewIntents.some((row) => row.mode === 'compare'));
  assert.ok(semantic.viewIntents.some((row) => row.mode === 'free'));
  const serialized = JSON.stringify(semantic);
  assert.doesNotMatch(serialized, /"tone"|"color"|"widthM"|"lineWidth"|"labelDensity"|"lodThreshold"/);
  assert.ok(semantic.controls.some((row) => row.id === 'walkingSpeedMps' && row.isEnabled));
  assert.ok(semantic.controls.some((row) => row.id === 'weatherParticipation' && row.isEnabled));
});

test('legacy adapter projects only causal shadow evidence and keeps compatibility styling bounded', () => {
  const simulation = simulate();
  const legacy = compatibilityApi.legacyPresentation({
    simulation,
    step: simulation.timeline.snapshots.length - 1,
    world: fixture().world,
  });
  contracts.validatePresentationContribution('sun-walker', legacy);
  assert.ok(legacy.paths.every((row) => row.widthM <= 3));
  assert.ok(legacy.areas.length <= 64);
  assert.ok(legacy.areas.every((row) => /causal modeled shadow/.test(row.label)));
});

test('plugin lifecycle advances the modeled walk without owning playback delay or camera commands', async () => {
  const rows = fixture();
  let reducer = null;
  let state = null;
  const receipts = [];
  const proposed = [];
  const sdk = {
    worldQuery: { snapshot: () => rows.world, model: () => rows.worldModel },
    datasets: {
      require: (id) => {
        if (id === governance.id) return governance;
        if (id === environment.id) return environment;
        if (id === 'world.buildings.v1') return rows.world;
        throw new Error(`unexpected dataset ${id}`);
      },
      receipt: (id) => {
        if (id === governance.id) {
          return { id, sha256: crypto.createHash('sha256').update(fs.readFileSync(governancePath)).digest('hex') };
        }
        if (id === environment.id) {
          return { id, sha256: crypto.createHash('sha256').update(fs.readFileSync(environmentPath)).digest('hex') };
        }
        return { id: rows.world.id, sha256: 'a'.repeat(64), source: 'verified_test_fixture' };
      },
    },
    routing: {
      alternatives: () => rows.routes,
      policy: () => ({ routeObjective: { travelSeconds: 1, sunExposureSeconds: 0.4 } }),
      resolveMission: () => ({ originNodeId: 'a', destinationNodeId: 'b', embodimentId: 'pedestrian' }),
    },
    clock: { instantForMission: () => '2026-07-19T17:00:00Z' },
    state: {
      register(nextReducer, initialState) { reducer = nextReducer; state = initialState; },
      read() { return state; },
    },
    events: {
      propose(event) {
        proposed.push(event);
        state = reducer(state, event);
      },
    },
    receipts: { append: (receipt) => receipts.push(receipt) },
  };
  const instance = await plugin.activate({
    sdk,
    config: { ...config, directSunWeight: 4 },
    scenario: { seed: 'lifecycle-seed', missionText: 'Take the shadier walk' },
  });
  assert.ok(instance.contributeV4().controls.controls.length >= 7);
  const contribution = instance.contributeRequest({
    sourceText: 'Take the shadier walk',
    mission: { originNodeId: 'a', destinationNodeId: 'b', embodimentId: 'pedestrian' },
  });
  assert.equal(contribution.missionPatch.routeOverride.algorithm, 'sun_walker_arrival_sample_route_v2');
  assert.equal(instance.semanticPresentation().schema, 'simulatte.presentationLayerSet.v4');
  const previousTravelSeconds = instance.comparisonModel().metrics.travelSeconds.intervention;
  const started = instance.handleAction('scenario.run', {
    values: {
      phase: 'start',
      departureAt: '2026-07-19T18:00',
      maximumAddedTimeSeconds: 300,
      maximumAddedRatio: 0.5,
      directSunWeight: 2,
      walkingSpeedMps: 2,
      treeCanopyParticipation: false,
      weatherParticipation: false,
    },
  });
  assert.equal(started.status, 'running');
  assert.ok(instance.comparisonModel().metrics.travelSeconds.intervention < previousTravelSeconds);
  const controlValues = Object.fromEntries(instance.controlModel().map((row) => [row.id, row.defaultValue]));
  assert.equal(controlValues.walkingSpeedMps, 2);
  assert.equal(controlValues.treeCanopyParticipation, false);
  assert.equal(controlValues.weatherParticipation, false);
  assert.equal(instance.eventTimeline().events[0].timestamp.startsWith('2026-07-19T18:00'), true);
  assert.equal(Object.hasOwn(started, 'nextStepDelayMs'), false);
  let result = started;
  while (result.status === 'running') result = instance.handleAction('scenario.run', { values: { phase: 'step' } });
  assert.equal(result.status, 'settled');
  const settlement = instance.settle();
  contracts.validateSettlementContribution('sun-walker', settlement);
  assert.equal(settlement.obligationResults[0].status, 'settled');
  assert.ok(settlement.losses.some((row) => row.kind === 'uncertainty_treeCanopy'));
  assert.ok(receipts.some((row) => row.schema === 'simulatte.plugin.sunWalkerSelectionReceipt.v2'));
  assert.ok(receipts.some((row) => row.schema === 'simulatte.plugin.sunWalkerPlaybackReceipt.v1'));
  assert.ok(proposed.some((row) => row.kind === 'sun-walker.playback-advanced'));
  const views = instance.view();
  assert.deepEqual(views[1].actions, []);
  const simulation = instance.simulationState();
  const directSun = views[1].rows.find((row) => row.label === 'Direct sun');
  assert.equal(
    directSun.value,
    `${Math.round(simulation.state.directSunSeconds)} of ${Math.round(instance.comparisonModel().metrics.travelSeconds.intervention)} s`
  );
});

test('solar reference keeps nighttime distinct from missing geometric evidence', () => {
  const leapDay = exposure.solarPosition('2024-02-29T17:00:00Z', 40.73, -73.99);
  assert.equal(leapDay.equationOfTimeMinutes, -12.894639);
  assert.equal(leapDay.elevationDegrees, 41.365528);
  const night = exposure.solarPosition('2026-07-19T04:00:00Z', 40.73, -73.99);
  const result = exposure.pointSunStateDetailed(
    { x: 0, y: 0 },
    exposure.buildBuildingScene([]),
    night,
    { minimumSolarElevationDegrees: 2 }
  );
  assert.equal(result.state, 'night');
  assert.equal(result.reason, 'sun_below_horizon');
});

test('governed canopy and weather engineering calibration cases reproduce exact outputs', () => {
  const healthy = environmentApi.canopyEnvelope(
    { diameterInches: 10, health: 'Good' },
    environment.canopy.model
  );
  assert.deepEqual(
    healthy,
    environment.validation.calibrationCases
      .find((row) => row.id === 'healthy-10-inch-tree-envelope').expected
  );

  const scene = environmentApi.compile(environment, fixture().world);
  const clear = environmentApi.weatherAt('2026-07-19T17:00:00Z', scene.weather);
  assert.equal(clear.skyCode, 'CLR');
  assert.equal(
    clear.directBeamFactor,
    environment.validation.calibrationCases.find((row) => row.id === 'clear-sky-factor').expected.directBeamFactor
  );
  assert.equal(clear.sourceRowId, '72505394728:2024-07-19T16:51:00:FM-15');
  const shiftedWorld = {
    ...fixture().world,
    coordinateSystem: { originWgs84: { latitude: 40.726, longitude: -73.978 } },
  };
  const shiftedScene = environmentApi.compile(environment, shiftedWorld);
  assert.notDeepEqual(scene.canopy.rows[0].point, shiftedScene.canopy.rows[0].point);
});

test('environment participation is causal and exactly replayable', () => {
  const active = simulate();
  assert.deepEqual(active, simulate());
  const inactive = simulate({
    config: {
      ...config,
      directSunWeight: 4,
      treeCanopyParticipation: false,
      weatherParticipation: false,
    },
  });
  const activeSelected = active.candidates.find((row) => row.id === active.selectedCandidateId);
  const inactiveSelected = inactive.candidates.find((row) => row.id === inactive.selectedCandidateId);
  assert.ok(activeSelected.samples.every((row) => row.environment.weather.sourceRowId));
  assert.ok(inactiveSelected.samples.every((row) => row.environment.weather.participation === false));
  assert.ok(activeSelected.metrics.directBeamEquivalentSeconds <= activeSelected.metrics.directSunSeconds);
  assert.ok(inactiveSelected.metrics.directBeamEquivalentSeconds <= inactiveSelected.metrics.directSunSeconds);
  assert.notEqual(active.modelReceipt.id, inactive.modelReceipt.id);

  const scene = environmentApi.compile(environment, fixture().world);
  const sun = exposure.solarPosition('2026-07-18T02:00:00Z', 40.73, -73.99);
  const cloudy = environmentApi.sample({
    point: { x: 100000, y: 100000 },
    sun,
    timestamp: '2026-07-18T02:00:00Z',
    environment: scene,
    config: { ...config, treeCanopyParticipation: false, weatherParticipation: true },
  });
  const weatherDisabled = environmentApi.sample({
    point: { x: 100000, y: 100000 },
    sun,
    timestamp: '2026-07-18T02:00:00Z',
    environment: scene,
    config: { ...config, treeCanopyParticipation: false, weatherParticipation: false },
  });
  assert.equal(cloudy.weather.skyCode, 'OVC');
  assert.equal(cloudy.directBeamFactor, 0.15);
  assert.equal(weatherDisabled.directBeamFactor, 1);
});
