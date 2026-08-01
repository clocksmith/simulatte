const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');

const contracts = require('../public/simulatte/platform/contracts/plugin-contracts.js');
const simulationApi = require('../public/shared/plugins/sun-walker/sun-route-simulation.js');
const presentationApi = require('../public/shared/plugins/sun-walker/presentation.js');
const v4Api = require('../public/shared/plugins/sun-walker/v4-contribution.js');
const plugin = require('../public/shared/plugins/sun-walker/index.js');
const compositor = require('../public/simulatte/platform/render/semantic-compositor.js');

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

function createContribution(simulation, step) {
  const rows = fixture();
  return v4Api.createContribution({
    simulation,
    step,
    world: rows.world,
    buildingReceipt: { id: 'world.buildings.v1', sha256: 'a'.repeat(64) },
    governanceReceipt: {
      id: 'sun-walker.model-governance.v1',
      sha256: crypto.createHash('sha256').update(fs.readFileSync(governancePath)).digest('hex'),
    },
    environmentReceipt: {
      id: 'sun-walker.environment.v1',
      sha256: crypto.createHash('sha256').update(fs.readFileSync(environmentPath)).digest('hex'),
    },
  });
}

function rowValue(rows, label) {
  return rows.find((row) => row.label === label)?.value;
}

test('Sun Walker uses a route overview and follows the one registered walker without POV jumps', () => {
  const result = simulate();
  const presentation = presentationApi.semanticPresentation(result, 1);
  assert.ok(presentation.viewIntents.some((intent) => intent.mode === 'overview'));
  assert.ok(presentation.viewIntents.some((intent) => (
    intent.mode === 'follow'
    && intent.targets.some((target) => target.entityId === 'sun-walker-actor')
  )));
  assert.ok(presentation.viewIntents.every((intent) => intent.mode !== 'pov'));
  assert.equal(v4Api.walkerNavigationMode(0), 'overview');
  assert.equal(v4Api.walkerNavigationMode(1), 'follow');
});

test('Walker actor position advances while camera target identity remains stable', () => {
  const result = simulate();
  const first = createContribution(result, 1);
  const second = createContribution(result, 2);
  const firstActor = first.presentation.layers.find((layer) => layer.id === 'sun-walker-actor');
  const secondActor = second.presentation.layers.find((layer) => layer.id === 'sun-walker-actor');

  assert.equal(firstActor.kind, 'actor');
  assert.equal(secondActor.kind, 'actor');
  assert.notDeepEqual(firstActor.geometry.coordinates, secondActor.geometry.coordinates);
  [first, second].forEach((contribution) => {
    assert.equal(contribution.presentation.viewIntents[0].mode, 'follow');
    assert.deepEqual(contribution.presentation.viewIntents[0].targetIds, ['sun-walker-actor']);
  });
});

test('Walked-segment colors and inspector metrics agree with completed samples', () => {
  const result = simulate();
  for (let step = 1; step < result.timeline.snapshots.length - 1; step += 1) {
    const snapshot = result.timeline.snapshots[step];
    const selected = result.candidates.find((row) => row.id === result.selectedCandidateId);
    const activeSample = selected.samples[snapshot.state.completedSamples - 1];
    const contribution = createContribution(result, step);
    const actor = contribution.presentation.layers.find((layer) => layer.id === 'sun-walker-actor');
    const segment = contribution.presentation.layers.find(
      (layer) => layer.id === `sun-walked-segment-${activeSample.segmentId}`
    );
    const measures = Object.fromEntries(contribution.state.measures.map((row) => [row.kind, row.value]));
    const rows = plugin.inspectorRows(result, step);

    assert.deepEqual(actor.geometry.coordinates[0], [activeSample.point.x, activeSample.point.y, 0]);
    assert.equal(segment.quantity.kind, `exposure.${activeSample.state}`);
    assert.equal(compositor.colorForLayer(segment), {
      direct: '#ffd75f',
      shade: '#4fb9c6',
      unknown: '#9aa3b8',
      night: '#69738b',
    }[activeSample.state]);
    assert.equal(measures['direct-sun'], snapshot.state.directSunSeconds);
    assert.equal(measures.shade, snapshot.state.shadeSeconds);
    assert.equal(measures.unknown, snapshot.state.unknownSeconds);
    assert.equal(
      rowValue(rows, 'Current exposure'),
      `${activeSample.state} · ${activeSample.timestamp}`
    );
    assert.equal(
      rowValue(rows, 'Direct sun'),
      `${Math.round(snapshot.state.directSunSeconds)} of ${Math.round(selected.metrics.travelSeconds)} s`
    );
    assert.equal(rowValue(rows, 'Modeled shade so far'), `${Math.round(snapshot.state.shadeSeconds)} s`);
    assert.equal(rowValue(rows, 'Unknown so far'), `${Math.round(snapshot.state.unknownSeconds)} s`);
  }
});

test('Departure time and detour controls causally alter exposure and route choice', () => {
  const daylight = simulate({ departureAt: '2026-07-19T17:00:00Z' });
  const night = simulate({ departureAt: '2026-07-19T04:00:00Z' });
  const daylightFast = daylight.candidates.find((row) => row.id === daylight.fastestCandidateId);
  const nightFast = night.candidates.find((row) => row.id === night.fastestCandidateId);
  assert.notEqual(
    daylightFast.metrics.directSunSeconds,
    nightFast.metrics.directSunSeconds
  );

  const detourAllowed = simulate({
    config: {
      ...config,
      directSunWeight: 100,
      maximumAddedTimeSeconds: 600,
      maximumAddedRatio: 1,
    },
  });
  const detourBlocked = simulate({
    config: {
      ...config,
      directSunWeight: 100,
      maximumAddedTimeSeconds: 0,
      maximumAddedRatio: 0,
    },
  });
  assert.notEqual(detourAllowed.selectedCandidateId, detourBlocked.selectedCandidateId);
  assert.notEqual(
    detourAllowed.comparison.metrics.travelSeconds.intervention,
    detourBlocked.comparison.metrics.travelSeconds.intervention
  );
  assert.equal(detourBlocked.selectedCandidateId, detourBlocked.fastestCandidateId);
});
