const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const contracts = require('../public/simulatte/platform/contracts/plugin-v4-contracts.js');
const adapters = require('../public/simulatte/platform/contracts/plugin-v4-adapters.js');
const provenanceRegistry = require('../public/simulatte/platform/runtime/provenance-registry.js');
const timelineModule = require('../public/simulatte/platform/runtime/simulation-timeline.js');
const clockModule = require('../public/simulatte/platform/runtime/simulation-clock.js');
const compositorModule = require('../public/simulatte/platform/render/semantic-compositor.js');
const viewDirectorModule = require('../public/simulatte/platform/view/view-director.js');
const safetyV4 = require('../public/shared/plugins/safety-explorer/v4-contribution.js');
const foodV4 = require('../public/shared/plugins/food-recall-us/v4-contribution.js');
const orbitalV4 = require('../public/shared/plugins/orbital-transfer-planner/v4-contribution.js');
const runtimeManifest = require('../public/simulatte/app/world-runtime-script-manifest.js');

const HASH = 'a'.repeat(64);

function provenanceRecord({
  id,
  kind,
  datasetId,
  rowId,
  contentHash = HASH,
  parentIds = [],
  origin,
  temporalStatus,
  uncertainty,
  license = { required: false, identifier: null },
  metadata = {},
}) {
  return {
    schema: 'simulatte.provenanceRecord.v4',
    id,
    kind,
    datasetId,
    ...(rowId === undefined ? {} : { rowId }),
    contentHash,
    parentIds,
    metadata,
    envelope: contracts.createProvenanceEnvelope({
      subjectId: id,
      subjectKind: kind,
      axes: { origin, temporalStatus, uncertainty },
      datasetIds: [datasetId],
      rowIds: rowId === undefined ? [] : [rowId],
      artifactSha256: contentHash,
      parentIds,
      transformationChain: kind === 'transformation' ? [id] : [],
      modelReceiptId: kind === 'model' ? id : null,
      retrievalEpoch: temporalStatus === 'historical' ? '2026-07-25' : null,
      scenarioEpoch: temporalStatus === 'historical' ? null : 'scenario:test',
      contentVersion: 'test-v1',
      license,
    }),
  };
}
const OBSERVED = contracts.createProvenance({
  origin: 'observed',
  temporalStatus: 'historical',
  uncertainty: { kind: 'confidence', value: { level: 0.95 } },
  evidenceRefs: [{
    id: 'row:1',
    datasetId: 'dataset:roads',
    rowId: '1',
    contentHash: HASH,
  }],
});
const SIMULATED = contracts.createProvenance({
  origin: 'simulated',
  temporalStatus: 'forecast',
  uncertainty: { kind: 'distribution', value: { family: 'poisson', lambda: 4 } },
  evidenceRefs: [{
    id: 'model:flow',
    datasetId: 'dataset:roads',
    contentHash: HASH,
    modelReceiptId: 'model:flow',
  }],
});

function event(id, sequence, simulationTimeMs, causationIds = []) {
  return {
    schema: 'simulatte.pluginEvent.v4',
    id,
    pluginId: 'test-plugin',
    sequence,
    simulationTimeMs,
    kind: `test.${id}`,
    causationIds,
    correlationId: 'run:1',
    payload: { value: sequence },
    provenance: SIMULATED,
  };
}

function presentation() {
  return {
    schema: 'simulatte.pluginPresentation.v4',
    pluginId: 'test-plugin',
    coordinateSystem: 'screen-px',
    epoch: null,
    layers: [
      {
        id: 'route:1',
        kind: 'path',
        label: 'Observed route',
        geometry: {
          kind: 'polyline',
          coordinateSystem: 'screen-px',
          coordinates: [[10, 10], [100, 100]],
        },
        quantity: { kind: 'flow', value: 1000000, unit: 'units/day', domain: [0, 1000000] },
        role: 'primary',
        importance: 1,
        aggregationKey: null,
        temporal: null,
        provenance: OBSERVED,
      },
      ...[0, 1, 2].map((index) => ({
        id: `site:${index}`,
        kind: 'point',
        label: `Site ${index}`,
        geometry: {
          kind: 'point',
          coordinateSystem: 'screen-px',
          coordinates: [[20 + index, 20 + index]],
        },
        quantity: { kind: 'volume', value: index + 1, unit: 'units', domain: [0, 10] },
        role: 'context',
        importance: 0.4,
        aggregationKey: 'sites',
        temporal: null,
        provenance: SIMULATED,
      })),
    ],
    viewIntents: [{
      schema: 'simulatte.viewIntent.v4',
      id: 'overview',
      mode: 'overview',
      targetIds: ['route:1'],
      reasonEventId: null,
      priority: 20,
      transition: 'ease',
    }],
  };
}

test('v4 truth axes preserve origin, time, and uncertainty independently', () => {
  assert.equal(contracts.validateProvenance(SIMULATED), SIMULATED);
  assert.equal(SIMULATED.axes.origin, 'simulated');
  assert.equal(SIMULATED.axes.temporalStatus, 'forecast');
  assert.equal(SIMULATED.axes.uncertainty.kind, 'distribution');
  assert.throws(
    () => contracts.validateTruthAxes({ origin: 'uncertain', temporalStatus: 'forecast', uncertainty: null }),
    { code: 'plugin_v4_origin_invalid' }
  );
});

test('provenance registry exposes source records through render-object bindings', () => {
  const registry = provenanceRegistry.createProvenanceRegistry();
  registry.register(provenanceRecord({
    id: 'row:1',
    kind: 'row',
    datasetId: 'dataset:roads',
    rowId: '1',
    origin: 'observed',
    temporalStatus: 'historical',
    uncertainty: { kind: 'confidence', value: { level: 0.95 } },
    license: { required: true, identifier: 'test-open-data-license' },
    metadata: { source: 'transport authority' },
  }));
  const resolved = registry.bind('route:1', OBSERVED.evidenceRefs);
  assert.equal(resolved[0].rowId, '1');
  assert.equal(registry.receipt().bindingCount, 1);
  assert.equal(Object.isFrozen(resolved[0]), true);
});

test('v1-v3 adapter removes final visual styling authority from plugins', () => {
  const normalized = adapters.normalizePresentation('legacy', {
    schema: 'simulatte.pluginPresentation.v3',
    coordinateSystem: 'city-local-m',
    markers: [],
    paths: [{
      id: 'path:1',
      label: 'Legacy path',
      nodeIds: ['a', 'b'],
      width: 99,
      color: '#f00',
      opacity: 1,
    }],
    actors: [],
    areas: [],
    cameraTargets: [],
  });
  assert.equal(normalized.layers[0].kind, 'path');
  assert.equal(normalized.layers[0].quantity.kind, 'flow');
  assert.equal(Object.hasOwn(normalized.layers[0], 'color'), false);
  assert.equal(Object.hasOwn(normalized.layers[0], 'width'), false);
});

test('v4 contribution closes every rendered and simulated claim over provenance records', () => {
  const value = {
    schema: 'simulatte.pluginContribution.v4',
    pluginId: 'test-plugin',
    presentation: presentation(),
    events: [event('start', 0, 0)],
    controls: { schema: 'simulatte.pluginControls.v4', controls: [], comparisons: [] },
    state: null,
    inspections: [],
    provenanceRecords: [
      provenanceRecord({
        id: 'row:1',
        kind: 'row',
        datasetId: 'dataset:roads',
        rowId: '1',
        origin: 'observed',
        temporalStatus: 'historical',
        uncertainty: { kind: 'confidence', value: { level: 0.95 } },
        license: { required: true, identifier: 'test-open-data-license' },
        metadata: {},
      }),
      provenanceRecord({
        id: 'model:flow',
        kind: 'model',
        datasetId: 'dataset:roads',
        contentHash: HASH,
        parentIds: ['row:1'],
        origin: 'modeled',
        temporalStatus: 'forecast',
        uncertainty: { kind: 'distribution', value: { family: 'poisson', lambda: 4 } },
        metadata: { algorithm: 'flow-model-v1' },
      }),
    ],
  };
  assert.equal(contracts.validateContribution(value), value);
  assert.throws(
    () => contracts.validateContribution({ ...value, provenanceRecords: value.provenanceRecords.slice(0, 1) }),
    { code: 'plugin_v4_contribution_evidence_missing' }
  );
});

test('timeline orders causal events, branches from replay state, and rejects missing causes', () => {
  const timeline = timelineModule.createTimeline({
    id: 'main',
    events: [event('end', 1, 20, ['start']), event('start', 0, 0)],
  });
  assert.deepEqual(timeline.all().map((row) => row.id), ['start', 'end']);
  const branch = timeline.branch({
    id: 'variant',
    atMs: 0,
    events: [event('variant-end', 2, 30, ['start'])],
  });
  assert.deepEqual(branch.all().map((row) => row.id), ['start', 'variant-end']);
  assert.equal(branch.receipt().parent.id, 'main');
  assert.throws(
    () => timelineModule.createTimeline({ id: 'bad', events: [event('bad', 0, 1, ['missing'])] }),
    { code: 'timeline_cause_missing' }
  );
});

test('shared clock owns rate, playback, seeking, replay, and event delivery', () => {
  const callbacks = [];
  const timeline = timelineModule.createTimeline({
    id: 'main',
    events: [event('start', 0, 0), event('end', 1, 20, ['start'])],
  });
  const clock = clockModule.createClock({
    timeline,
    playbackRate: 2,
    setTimer: (callback, delay) => {
      callbacks.push({ callback, delay });
      return callbacks.length;
    },
    clearTimer: () => {},
    wallIntervalMs: 40,
  });
  const delivered = [];
  clock.subscribe((message) => {
    if (message.type === 'event') delivered.push(message.event.id);
  });
  clock.play();
  assert.equal(callbacks[0].delay, 20);
  callbacks.shift().callback();
  callbacks.shift().callback();
  assert.deepEqual(delivered, ['start', 'end']);
  clock.replay();
  callbacks.shift().callback();
  assert.deepEqual(delivered, ['start', 'end', 'start']);
  clock.pause();
  clock.setPlaybackRate(4);
  assert.equal(clock.snapshot().playbackRate, 4);
});

test('semantic compositor bounds widths and clusters dense points without losing provenance', () => {
  const compositor = compositorModule.createCompositor();
  const composition = compositor.compose(presentation(), {
    viewport: { width: 400, height: 300 },
  });
  const route = composition.primitives.find((row) => row.id === 'route:1');
  const cluster = composition.primitives.find((row) => row.kind === 'point-cluster');
  assert.equal(route.style.widthPx <= 4, true);
  assert.equal(route.style.color, compositorModule.ORIGIN_COLORS.observed);
  assert.deepEqual(cluster.memberIds, ['site:0', 'site:1', 'site:2']);
  assert.equal(cluster.provenance.evidenceRefs[0].id, 'model:flow');
  assert.equal(composition.receipt.policies.boundedDensity, true);
});

test('View Director arbitrates intents while manual navigation remains authoritative', () => {
  const director = viewDirectorModule.createViewDirector();
  presentation().viewIntents.forEach((intent) => director.submit(intent));
  director.submit({
    schema: 'simulatte.viewIntent.v4',
    id: 'event-focus',
    mode: 'follow',
    targetIds: ['site:1'],
    reasonEventId: 'start',
    priority: 80,
    transition: 'ease',
  });
  assert.equal(director.snapshot().decision.intentId, 'event-focus');
  director.setManualOverride({ mode: 'free', targetIds: [] });
  assert.equal(director.snapshot().decision.source, 'manual');
  director.resolveEvent('start');
  assert.equal(director.snapshot().decision.source, 'manual');
  director.releaseManualOverride();
  assert.equal(director.snapshot().decision.intentId, 'overview');
});

test('Safety v4 exposes observed rows separately from the derived route estimate', () => {
  const index = require('../public/data/simulatte/safety-history-index-v1.json');
  const segmentRows = index.segmentRows.slice(0, 2);
  const contribution = safetyV4.createContribution({
    index,
    datasetReceipt: { sha256: HASH },
    audit: {
      schema: 'simulatte.plugin.safetyExplorerRouteAudit.v1',
      crashCount: segmentRows.reduce((sum, row) => sum + row.crashCount, 0),
      injuryCount: segmentRows.reduce((sum, row) => sum + row.injuryCount, 0),
      fatalityCount: segmentRows.reduce((sum, row) => sum + row.fatalityCount, 0),
      historicalObservationScore: segmentRows.reduce((sum, row) => sum + row.historicalObservationScore, 0),
      physicalSegmentsWithHistory: segmentRows.length,
      segmentIds: segmentRows.map((row) => row.segmentId),
      indexId: index.id,
      claimBoundary: index.claimBoundary,
    },
  });
  assert.equal(contribution.presentation.layers[0].provenance.axes.origin, 'derived');
  assert.equal(contribution.inspections[0].fields[0].provenance.axes.origin, 'observed');
  assert.equal(contribution.provenanceRecords.filter((row) => row.kind === 'row').length, 2);
});

test('Food v4 carries simulated lineage, source rows, controls, and uncertainty together', () => {
  const facilities = require('../public/data/food-recall-us/facilities-synthetic-v1.json').facilities.slice(0, 3);
  const corridors = require('../public/data/food-recall-us/freight-corridors-v1.json').corridors
    .filter((row) => facilities.some((facility) => facility.id === row.fromFacilityId)
      && facilities.some((facility) => facility.id === row.toFacilityId))
    .slice(0, 2);
  const zones = require('../public/data/food-recall-us/consumer-zones-v1.json').zones.slice(0, 2);
  const scenario = require('../public/shared/plugins/food-recall-us/default-config.json').scenarios[0];
  const lotId = `tlc:${facilities[0].id}:seed:origin:1`;
  const run = {
    engineVersion: 'test-engine',
    seed: 'test-seed',
    lineage: [
      { cte: 'harvesting', facilityId: facilities[0].id, tlcId: lotId, parents: [] },
      { cte: 'shipping', facilityId: facilities[0].id, tlcId: lotId, parents: [] },
    ],
    lots: [{ tlcId: lotId, contaminated: true }],
    trueIllnesses: 12,
    observedCases: 3,
    detectionDay: 4,
    trueSourceRank: 1,
    recall: { casesAverted: 5 },
  };
  const ids = [
    'us.food.facilities.synthetic.v1',
    'us.food.freight-corridors.v1',
    'us.food.commodity-profiles.v1',
    'us.food.hazard-model-registry.v1',
    'us.food.consumer-zones.v1',
  ];
  const contribution = foodV4.createContribution({
    run,
    scenario,
    facilities,
    corridors,
    consumerZones: zones,
    datasetReceipts: ids.map((id) => ({ id, sha256: HASH })),
    activeIntervention: null,
  });
  assert.equal(contribution.events[1].causationIds[0], contribution.events[0].id);
  assert.equal(contribution.controls.comparisons[0].synchronizedClock, true);
  assert.equal(contribution.presentation.layers.some((row) => row.role === 'event'), true);
  assert.equal(contribution.state.provenance.axes.uncertainty.kind, 'distribution');
});

test('Orbital v4 separates pinned state vectors from forecast transfer modeling', () => {
  const ephemerisData = require('../public/data/orbital-transfer-planner/jpl-horizons-heliocentric-vectors-v1.json');
  const earth = ephemerisData.bodies.earth.vectors[0].positionAu;
  const mars = ephemerisData.bodies.mars.vectors[0].positionAu;
  const contribution = orbitalV4.createContribution({
    ephemerisData,
    profileWeights: { deltaV: 1, timeOfFlight: 0.01 },
    datasetReceipts: [
      { id: 'jpl.horizons.heliocentric-vectors.v1', receipt: { sha256: HASH }, value: ephemerisData },
      { id: 'solar.system.gm-constants-de440.v1', receipt: { sha256: 'b'.repeat(64) }, value: {} },
    ],
    result: {
      scenarioId: 'earth-mars-window',
      targetBodyId: 'mars',
      selected: { id: 'candidate:1', trajectory: [earth, mars] },
      fallback: null,
      metrics: {
        departureEpoch: '2030-09-15T00:00:00Z',
        arrivalEpoch: '2031-04-01T00:00:00Z',
        timeOfFlightDays: 198,
        totalDeltaVKmS: 5.8,
        radiationExposureUnits: 2.4,
        algorithm: 'lambert',
        attemptedCount: 100,
        solutionCount: 12,
      },
      claimBoundary: 'Mission-design comparison, not operational navigation.',
    },
  });
  assert.equal(contribution.presentation.layers.find((row) => row.id === 'body:earth').provenance.axes.origin, 'modeled');
  assert.equal(contribution.presentation.layers.find((row) => row.id === 'transfer-trajectory').provenance.axes.temporalStatus, 'forecast');
  assert.equal(contribution.controls.comparisons[0].baselineScenarioId, 'earth-mars-circular-hohmann');
});

test('the seven shipped experiences each load one native v4 contribution and City is only the substrate', () => {
  const expectedProfiles = [
    'cable-trader-pickup-v1',
    'food-recall-us-v1',
    'interstellar-relay-network-v1',
    'maritime-trade-global-v1',
    'orbital-transfer-planner-v1',
    'safety-explorer-v1',
    'sun-walker-v1',
  ];
  assert.deepEqual(Object.keys(runtimeManifest.profilePlugins).sort(), expectedProfiles);
  assert.equal(Object.hasOwn(runtimeManifest.profilePlugins, 'simulatte-world-v1'), false);

  const profilesDirectory = path.join(__dirname, '../public/data/application-profiles');
  const jsonFiles = fs.readdirSync(profilesDirectory).filter((name) => name.endsWith('.json')).sort();
  const profileFiles = jsonFiles.filter((fileName) => {
    const value = JSON.parse(fs.readFileSync(path.join(profilesDirectory, fileName), 'utf8'));
    return /^simulatte\.applicationProfile\.v\d+$/.test(value.schema);
  });
  assert.deepEqual(profileFiles, expectedProfiles.map((id) => `${id}.json`));
  assert.deepEqual(jsonFiles.filter((fileName) => !profileFiles.includes(fileName)), ['profile-claim-inventory-v1.json']);
  profileFiles.forEach((fileName) => {
    const profile = JSON.parse(fs.readFileSync(path.join(profilesDirectory, fileName), 'utf8'));
    assert.equal(profile.plugins.length, 1, `${profile.id} should declare one experience plugin`);
    const pluginId = profile.plugins[0].id;
    assert.deepEqual(runtimeManifest.profilePlugins[profile.id], [pluginId]);
    const pluginDirectory = path.join(__dirname, `../public/shared/plugins/${pluginId}`);
    const manifest = JSON.parse(fs.readFileSync(path.join(pluginDirectory, 'plugin.json'), 'utf8'));
    assert.equal(
      manifest.resources.some((resource) => resource.path === './v4-contribution.js'),
      true,
      `${pluginId} should integrity-lock its native v4 contribution`,
    );
    assert.match(
      fs.readFileSync(path.join(pluginDirectory, 'index.js'), 'utf8'),
      /\bcontributeV4\b/,
      `${pluginId} should expose contributeV4`,
    );
  });
});
