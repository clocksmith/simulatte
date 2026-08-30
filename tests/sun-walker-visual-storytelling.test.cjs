const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');

const contracts = require('../public/simulatte/platform/contracts/plugin-contracts.js');
const simulationApi = require('../public/shared/plugins/sun-walker/sun-route-simulation.js');
const presentationApi = require('../public/shared/plugins/sun-walker/presentation.js');
const exposureSummaryApi = require('../public/shared/plugins/sun-walker/exposure-summary.js');
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
  assert.equal(
    presentationApi.semanticPresentation(result, 1).id,
    presentationApi.semanticPresentation(result, 2).id,
  );
  assert.equal(
    presentationApi.semanticPresentation(result, 1).viewIntents.at(-1).id,
    presentationApi.semanticPresentation(result, 2).viewIntents.at(-1).id,
  );
  [first, second].forEach((contribution) => {
    assert.equal(contribution.presentation.viewIntents[0].mode, 'follow');
    assert.deepEqual(contribution.presentation.viewIntents[0].targetIds, ['sun-walker-actor']);
  });
  assert.equal(
    first.presentation.viewIntents[0].reasonEventId,
    second.presentation.viewIntents[0].reasonEventId,
  );
});

test('Building shadow geometry follows the active sun sample during playback', () => {
  const result = simulate();
  const first = createContribution(result, 1);
  const second = createContribution(result, 2);
  const shadows = (contribution) => contribution.presentation.layers
    .filter((layer) => layer.quantity.kind === 'occlusion.shadow-length');
  const firstShadows = shadows(first);
  const secondShadows = shadows(second);
  assert.ok(firstShadows.length > 0);
  assert.equal(secondShadows.length, firstShadows.length);
  assert.deepEqual(firstShadows.map((layer) => layer.id), secondShadows.map((layer) => layer.id));
  assert.ok(firstShadows.every((layer) => layer.aggregationKey === layer.id));
  assert.notDeepEqual(
    firstShadows.map((layer) => layer.geometry.coordinates),
    secondShadows.map((layer) => layer.geometry.coordinates),
    'the projected shadow must move as the simulated sun moves',
  );
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
    const exposureStatus = exposureSummaryApi.summarize(snapshot.state, activeSample);
    const inspectionRows = contribution.inspections[0].fields;

    assert.deepEqual(actor.geometry.coordinates[0], [activeSample.point.x, activeSample.point.y, 0]);
    assert.match(actor.label, /UTC$/);
    assert.equal(segment.quantity.kind, `exposure.${activeSample.state}`);
    assert.equal(compositor.colorForLayer(segment), {
      direct: '#ffd75f',
      shade: '#4fb9c6',
      unknown: '#9aa3b8',
      night: '#69738b',
    }[activeSample.state]);
    assert.equal(compositor.styleForLayer(segment).widthPx, 7);
    assert.equal(measures['direct-sun'], snapshot.state.directSunSeconds);
    assert.equal(measures.shade, snapshot.state.shadeSeconds);
    assert.equal(measures.unknown, snapshot.state.unknownSeconds);
    assert.equal(
      rowValue(rows, 'Current exposure'),
      exposureStatus.current.label
    );
    assert.equal(rowValue(rows, 'Current geometric sun'), exposureStatus.current.geometricLabel);
    assert.equal(rowValue(rows, 'Current adjusted direct beam'), `${exposureStatus.current.adjustedDirectBeamPercent}%`);
    assert.equal(rowValue(rows, 'Walked exposure'), exposureStatus.split);
    assert.equal(rowValue(rows, 'Walked geometric sun'), exposureStatus.geometricSplit);
    assert.match(rowValue(rows, 'Exposure shade'), new RegExp(`^${exposureStatus.percentages.shade}%`));
    assert.match(rowValue(rows, 'Exposure sun'), new RegExp(`^${exposureStatus.percentages.direct}%`));
    assert.equal(rowValue(rows, 'Shadow display'), exposureStatus.shadowDisplay);
    assert.equal(rowValue(rows, 'Calculation'), exposureStatus.shadowCalculation);
    assert.equal(rowValue(inspectionRows, 'Current exposure'), exposureStatus.current.label);
    assert.equal(rowValue(inspectionRows, 'Current geometric sun'), exposureStatus.current.geometricLabel);
    assert.equal(rowValue(inspectionRows, 'Current adjusted direct beam'), exposureStatus.current.adjustedDirectBeamPercent / 100);
    assert.equal(rowValue(inspectionRows, 'Walked exposure'), exposureStatus.split);
    assert.equal(rowValue(inspectionRows, 'Walked geometric sun'), exposureStatus.geometricSplit);
    assert.equal(rowValue(inspectionRows, 'Exposure shade percent'), exposureStatus.percentages.shade / 100);
    assert.equal(rowValue(inspectionRows, 'Exposure sun percent'), exposureStatus.percentages.direct / 100);
    assert.equal(rowValue(inspectionRows, 'Geometric shade percent'), exposureStatus.geometricPercentages.shade / 100);
    assert.equal(rowValue(inspectionRows, 'Geometric direct sun percent'), exposureStatus.geometricPercentages.direct / 100);
  }
});

test('Sun Walker labels UTC inputs and separates geometric sun from adjusted exposure', () => {
  const result = simulate();
  const departure = result.controls.find((row) => row.id === 'departureAt');
  const sample = result.candidates.find((row) => row.id === result.selectedCandidateId).samples[0];
  const status = exposureSummaryApi.currentExposure(sample);

  assert.equal(departure.description, 'Departure time (UTC)');
  assert.ok(['direct', 'shade', 'unknown', 'night'].includes(sample.geometricState));
  assert.equal(status.geometricState, sample.geometricState);
  assert.equal(status.adjustedDirectBeamPercent, Math.round(sample.directBeamFactor * 100));
  assert.notEqual(status.geometricLabel, status.label);
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
