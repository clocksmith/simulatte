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
const v4Api = require('../public/shared/plugins/sun-walker/v4-contribution.js');

const pluginRoot = require.resolve('../public/shared/plugins/sun-walker/plugin.json').replace(/plugin\.json$/, '');
const governancePath = require.resolve('../public/data/sun-walker/sun-walker-model-governance-v1.json');
const environmentPath = require.resolve('../public/data/sun-walker/sun-walker-environment-v1.json');
const governance = JSON.parse(fs.readFileSync(governancePath, 'utf8'));
const environment = JSON.parse(fs.readFileSync(environmentPath, 'utf8'));
const config = JSON.parse(fs.readFileSync(`${pluginRoot}default-config.json`, 'utf8'));

test('linear weather selection preserves nearest-time, date fallback, and deterministic ties', () => {
  const weather = { rows: [
    ['z', '2025-07-19T23:30:00Z'], ['b', '2025-07-19T00:30:00Z'],
    ['a', '2024-07-19T00:30:00Z'], ['c', '2025-07-20T12:00:00Z'],
  ].map(([id, observedAt]) => ({ id, observedAt, sourceRowId: id, skyCode: 'CLR' })),
  factors: { CLR: 1 }, interpolation: 'nearest' };
  const original = JSON.stringify(weather);
  const distance = (a, b) => Math.min(Math.abs(a - b), 1440 - Math.abs(a - b));
  for (const day of ['07-19', '07-20', '12-31']) {
    for (let minutes = 0; minutes < 1440; minutes += 15) {
      const timestamp = `2026-${day}T${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}:00Z`;
      const sameDay = weather.rows.filter(row => row.observedAt.slice(5, 10) === day);
      const expected = (sameDay.length ? sameDay : weather.rows).slice().sort((left, right) => {
        const minute = row => { const date = new Date(row.observedAt); return date.getUTCHours() * 60 + date.getUTCMinutes(); };
        return distance(minutes, minute(left)) - distance(minutes, minute(right)) || left.id.localeCompare(right.id);
      })[0];
      const actual = environmentApi.weatherAt(timestamp, weather);
      assert.equal(actual.observationId, expected.id);
      assert.equal(actual.sourceRowId, expected.sourceRowId);
      assert.equal(actual.analogFor, timestamp);
    }
  }
  assert.equal(JSON.stringify(weather), original);
  assert.throws(() => environmentApi.weatherAt('not-a-time', weather), /weather_timestamp_invalid/);
});

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

test('route cards retain both alternatives and use the full journey as the exposure denominator', () => {
  const shade=simulate({config:{...config,directSunWeight:100}});
  const fastest=simulate({config:{...config,directSunWeight:0}});
  assert.equal(fastest.selectedCandidateId,fastest.fastestCandidateId);
  assert.equal(fastest.shadeCandidateId,shade.selectedCandidateId);
  assert.notEqual(fastest.shadeCandidateId,fastest.fastestCandidateId);
  for(const simulation of [shade,fastest,simulate({departureAt:'2026-07-19T04:00:00Z'})]) {
    const contribution=v4Api.createContribution({simulation,step:0,world:fixture().world,
      buildingReceipt:{id:'world.buildings.v1',sha256:'a'.repeat(64)},
      governanceReceipt:{id:governance.id,sha256:crypto.createHash('sha256').update(fs.readFileSync(governancePath)).digest('hex')},
      environmentReceipt:{id:environment.id,sha256:crypto.createHash('sha256').update(fs.readFileSync(environmentPath)).digest('hex')}});
    const fields=Object.fromEntries(contribution.inspections.find(row=>row.id==='sun-route-comparison').fields.map(row=>[row.id,row.value]));
    for(const [prefix,id] of [['shade-choice',simulation.shadeCandidateId],['fastest',simulation.fastestCandidateId]]) {
      const metrics=simulation.candidates.find(row=>row.id===id).metrics;
      assert.equal(fields[`${prefix}-shade-percent`],100*metrics.shadeSeconds/metrics.travelSeconds);
      assert.equal(fields[`${prefix}-sun-percent`],100*metrics.directSunSeconds/metrics.travelSeconds);
      const total=fields[`${prefix}-shade-percent`]+fields[`${prefix}-sun-percent`]+100*(fields[`${prefix}-unknown`]+fields[`${prefix}-night`])/fields[`${prefix}-time`];
      assert.ok(Math.abs(total-100)<0.01);
    }
  }
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
  assert.ok(semantic.viewIntents.some((row) => row.mode === 'overview'));
  assert.ok(semantic.viewIntents.every((row) => !['free', 'pov'].includes(row.mode)));
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
  rows.world.nodes = [{id:'a',label:'Start',landmark:true},{id:'b',label:'Park',landmark:true},{id:'c',label:'Square',landmark:true}];
  rows.world.segments = rows.routes.map(route=>({...rows.worldModel.segment(route.segmentIds[0]),fromNodeId:'a',toNodeId:'b',allowedModes:['pedestrian']}));
  rows.world.segments.push(...['b:c','c:b'].map(id=>({id,fromNodeId:id[0],toNodeId:id[2],allowedModes:['pedestrian'],lengthM:50,geometry:[{x:100,y:0},{x:150,y:0}]})));
  rows.world.signals=[]; rows.world.actors=[]; rows.world.disruptions=[];
  rows.worldModel = {world:rows.world,segment:id=>rows.world.segments.find(row=>row.id===id),outgoing:id=>rows.world.segments.filter(row=>row.fromNodeId===id),blockedSegmentIds:()=>[]};
  let reducer = null;
  let state = null;
  const receipts = [];
  const proposed = [];
  const compute = require('../public/simulatte/platform/plugin-host/plugin-compute.js').createComputePort({
    taskOperations:['sun-walker.prepare/v1'],
    createTaskPool:()=>require('../public/shared/core/simulation/worker-task-pool.js').createWorkerTaskPool({
      WorkerClass:require('node:worker_threads').Worker,
      workerUrl:require('node:path').resolve(__dirname,'../public/simulatte/world/simulation-task-worker.js'),
    }),
  }).forPlugin('sun-walker');
  const sdk = {
    compute,
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
      modeFor: () => 'pedestrian',
      policy: () => ({ routeObjective: { travelSeconds: 1, sunExposureSeconds: 0.4 } }),
      resolveMission: text => ({ originNodeId: text.includes('from Square') ? 'c' : 'a', destinationNodeId: text.includes('to Square') ? 'c' : 'b', embodimentId: 'pedestrian' }),
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
  const readyV4 = instance.contributeV4();
  assert.ok(readyV4.controls.controls.length >= 7);
  assert.ok(readyV4.presentation.layers.some((row) => row.id === 'sun-walker-actor' && row.kind === 'actor'));
  assert.ok(readyV4.presentation.layers.some((row) => row.kind === 'area' && row.quantity.kind === 'occlusion.shadow-length'));
  assert.ok(readyV4.presentation.layers
    .filter((row) => row.quantity.kind === 'occlusion.shadow-length')
    .every((row) => row.role === 'primary'));
  assert.ok(readyV4.presentation.layers.every((row) => row.aggregationKey !== 'sun-exposure-samples'));
  assert.deepEqual(readyV4.presentation.viewIntents.map((row) => ({
    mode: row.mode,
    targetIds: row.targetIds,
  })), [{
    mode: 'overview',
    targetIds: ['shade-selected-route'],
  }]);
  const contribution = instance.contributeRequest({
    sourceText: 'Take the shadier walk',
    mission: { originNodeId: 'a', destinationNodeId: 'b', embodimentId: 'pedestrian' },
  });
  assert.equal(contribution.missionPatch.routeOverride.algorithm, 'sun_walker_arrival_time_graph_v3');
  assert.equal(instance.semanticPresentation().schema, 'simulatte.presentationLayerSet.v4');
  const createdCount = () => proposed.filter(row => row.kind === 'sun-walker.simulation-created').length;
  const beforeStart = createdCount();
  const previewContribution = instance.contributeV4();
  assert.equal(instance.contributeV4(), previewContribution);
  const unchangedValues = Object.fromEntries(instance.controlModel().filter(row => row.id !== 'departureAt').map(row => [row.id, row.defaultValue]));
  const firstStart = instance.handleAction('scenario.run', { values: { ...unchangedValues, phase: 'start', departureAt: '2026-07-19T17:00' } });
  assert.equal(createdCount(), beforeStart, 'Starting the existing preview must not recompute the route');
  assert.equal(firstStart.presentationChanged, false);
  assert.deepEqual(instance.contributeV4(), previewContribution, 'Only an unchanged presentation may skip the host redraw');
  instance.handleAction('scenario.run', { values: { phase: 'step' } });
  assert.notEqual(instance.contributeV4(), previewContribution, 'Advancing the model invalidates the contribution cache');
  const restarted = instance.handleAction('scenario.run', { values: { ...unchangedValues, phase: 'start', departureAt: '2026-07-19T17:00:00Z' } });
  assert.equal(restarted.currentStep, 0);
  assert.equal(restarted.presentationChanged, true);
  assert.equal(restarted.simulationId, firstStart.simulationId);
  assert.equal(createdCount(), beforeStart);
  assert.throws(() => instance.handleAction('scenario.run', { values: { phase: 'start', walkingSpeedMps: 2, departureAt: 'invalid' } }), /sun_control_invalid/);
  assert.equal(instance.controlModel().find(row => row.id === 'walkingSpeedMps').defaultValue, unchangedValues.walkingSpeedMps);
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
  assert.equal(createdCount(), beforeStart + 1, 'Changed controls must rebuild the modeled route');
  assert.ok(instance.comparisonModel().metrics.travelSeconds.intervention < previousTravelSeconds);
  const controlValues = Object.fromEntries(instance.controlModel().map((row) => [row.id, row.defaultValue]));
  assert.equal(controlValues.walkingSpeedMps, 2);
  assert.equal(controlValues.treeCanopyParticipation, false);
  assert.equal(controlValues.weatherParticipation, false);
  assert.equal(instance.eventTimeline().events[0].timestamp.startsWith('2026-07-19T18:00'), true);
  assert.equal(Object.hasOwn(started, 'nextStepDelayMs'), false);
  let result = started;
  while (result.status === 'running') {
    result = instance.handleAction('scenario.run', { values: { phase: 'step' } });
  }
  assert.equal(result.status, 'settled');
  assert.equal(result.simulationTimeMs, instance.contributeV4().state.simulationTimeMs);
  const settlement = instance.settle();
  contracts.validateSettlementContribution('sun-walker', settlement);
  assert.equal(settlement.obligationResults[0].status, 'settled');
  assert.ok(settlement.losses.some((row) => row.kind === 'uncertainty_treeCanopy'));
  assert.ok(receipts.some((row) => row.schema === 'simulatte.plugin.sunWalkerSelectionReceipt.v2'));
  assert.ok(receipts.some((row) => row.schema === 'simulatte.plugin.sunWalkerPlaybackReceipt.v1'));
  assert.ok(proposed.some((row) => row.kind === 'sun-walker.playback-advanced'));
  const views = instance.view();
  assert.equal(views.length, 1);
  assert.deepEqual(views[0].actions, []);
  const simulation = instance.simulationState();
  const directSun = views[0].rows.find((row) => row.label === 'Exposure sun');
  const directSunSeconds = Math.round(simulation.state.directSunSeconds);
  const travelSeconds = instance.comparisonModel().metrics.travelSeconds.intervention;
  assert.equal(
    directSun.value,
    `${Math.round((simulation.state.directSunSeconds / travelSeconds) * 100)}% / ${directSunSeconds} s`
  );
  const acceptedBeforePreview = JSON.stringify(state);
  const prepared = instance.handleAction('sun-walker.preview-route', { values: { directSunWeight: 0 } });
  assert.equal(JSON.stringify(state), acceptedBeforePreview, 'preview cannot move or replace the accepted walk');
  assert.equal(prepared.presentation.layers[0].id, 'sun-preview-route');
  const interaction=require('../public/simulatte/app/object-interaction.js');
  const registry=require('../public/simulatte/platform/runtime/provenance-registry.js');
  const compositor=require('../public/simulatte/platform/render/semantic-compositor.js').createCompositor();
  const combined=interaction.withPreview(instance.contributeV4(),interaction.qualifyPreview(prepared));
  const provenanceReceipt=registry.createContributionProvenanceReceipt(combined);
  const composition=compositor.compose(combined.presentation,{provenanceReceipt,viewport:{width:1440,height:1000}});
  assert.ok(composition.receipt.representedLayerIds.includes(prepared.presentation.layers[0].id));
  assert.equal(composition.primitives.find(row=>row.id===prepared.presentation.layers[0].id).style.color,'#ffbd66');

  const differences = Object.fromEntries(prepared.inspections[0].fields.map(row=>[row.id,row.value]));
  assert.ok(differences['sun-difference']<0, 'Negative direct-sun time saved means the fastest alternative increases exposure');
  assert.ok(differences['time-difference']<0, 'Fastest alternative saves walking time');
  assert.notEqual(prepared.candidateId,state.simulation.selectedCandidateId);
  const shown = instance.contributeV4();
  const selected = state.simulation.candidates.find(row=>row.id===state.simulation.selectedCandidateId);
  assert.equal(shown.presentation.epoch,selected.samples.at(-1).endedAt);
  assert.equal(shown.presentation.sun.azimuthDegrees,selected.samples.at(-1).endObservation.solarPosition.azimuthDegrees);
  for(const object of shown.objects.filter(row=>row.id.startsWith('sun-walked-segment-'))) {
    const fields=shown.inspections.find(row=>row.targetIds.length===1&&row.targetIds[0]===object.id).fields;
    assert.ok(fields.some(row=>row.id==='sample-time'&&Date.parse(row.value)));
    assert.ok(fields.some(row=>row.id==='occluder'));
  }
  const outgoing = rows.worldModel.outgoing;
  rows.worldModel.outgoing = () => { throw new Error('Applying must not search again'); };
  const promoted = instance.handleAction('sun-walker.accept-preview', { values: { previewId: prepared.id } });
  assert.equal(promoted.status, 'running');
  assert.equal(state.simulation.id, prepared.simulationId);
  assert.equal(state.simulation.selectedCandidateId, prepared.candidateId);
  assert.equal(state.simulation.controls.find(row => row.id === 'directSunWeight').defaultValue, 0);
  rows.worldModel.outgoing = outgoing;
  assert.throws(() => instance.handleAction('sun-walker.accept-preview', { values: { previewId: prepared.id } }), /preview_stale/);

  const endpointControls=instance.contributeV4().controls.controls;
  assert.equal(endpointControls.find(row=>row.id==='originPlace').value,'Start');
  assert.deepEqual(endpointControls.find(row=>row.id==='destinationPlace').options.map(row=>row.value),['Park','Square','Start']);
  const beforeEndpoint=createdCount();
  instance.handleAction('scenario.run',{values:{phase:'start',destinationPlace:'Square'}});
  assert.equal(createdCount(),beforeEndpoint+1,'Endpoint change must recompute routes');
  assert.equal(instance.contributeV4().controls.controls.find(row=>row.id==='destinationPlace').value,'Square');
  const accepted=instance.contributeV4();
  assert.throws(()=>instance.handleAction('scenario.run',{values:{phase:'start',originPlace:'Square',walkingSpeedMps:1}}),/route_has_no_extent/);
  assert.throws(()=>instance.handleAction('scenario.run',{values:{phase:'start',destinationPlace:'Unmapped'}}),/route_place_unknown/);
  assert.equal(instance.contributeV4(),accepted,'Invalid endpoints must leave the accepted simulation intact');
  instance.handleAction('scenario.run',{values:{phase:'start',originPlace:'Square',destinationPlace:'Park'}});
  assert.equal(instance.contributeV4().controls.controls.find(row=>row.id==='originPlace').value,'Square');
  const beforePreparation = state.simulation;
  const replacement = await instance.handleAction('sun-walker.prepare-route',{values:{requestId:'endpoint-worker',originPlace:'Start',destinationPlace:'Square',directSunWeight:0}});
  assert.equal(state.simulation,beforePreparation,'Worker preparation must not mutate the accepted walk');
  const workerResult = instance.handleAction('sun-walker.accept-preview',{values:{previewId:replacement.id}});
  assert.equal(workerResult.simulationId,replacement.simulationId);
  assert.equal(instance.contributeV4().controls.controls.find(row=>row.id==='originPlace').value,'Start');
  assert.equal(instance.contributeV4().controls.controls.find(row=>row.id==='destinationPlace').value,'Square');
  const expected = simulationApi.simulate({world:rows.world,worldModel:rows.worldModel,mission:sdk.routing.resolveMission('Walk from Start to Square'),mode:'pedestrian',
    departureAt:state.simulation.departureAt,config:{...config,...state.simulation.modelReceipt.parameters},seed:'lifecycle-seed',
    buildingReceipt:sdk.datasets.receipt('world.buildings.v1'),governance,governanceReceipt:sdk.datasets.receipt(governance.id),environment,environmentReceipt:sdk.datasets.receipt(environment.id)});
  assert.deepEqual(state.simulation,expected,'Real worker results must equal serial domain execution');

});

test('Sun Walker starts and settles in overview while active movement stays in follow', () => {
  assert.equal(v4Api.walkerNavigationMode(0), 'overview');
  assert.equal(v4Api.walkerNavigationMode(1), 'follow');
  assert.equal(v4Api.walkerNavigationMode(24, true), 'overview');
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

test('rectangular building occlusion matches independent shadow-length geometry beyond the footprint diameter', () => {
  const world = { renderGeometry: { buildings: [{ id: 'reference-block', heightM: 20,
    footprint: [{x:0,y:0},{x:10,y:0},{x:10,y:10},{x:0,y:10},{x:0,y:0}] }] } };
  const scene = exposure.compiledBuildings(world);
  for (const elevationDegrees of [15, 30, 45, 60]) {
    const shadowLength = 20 / Math.tan(elevationDegrees * Math.PI / 180);
    for (const fraction of [0.1, 0.5, 0.95, 1.05, 1.5]) {
      const result = exposure.pointSunStateDetailed({x:-shadowLength*fraction,y:5}, scene, {azimuthDegrees:90,elevationDegrees});
      assert.equal(result.state, fraction < 1 ? 'shade' : 'direct', `elevation ${elevationDegrees}, fraction ${fraction}`);
      if (fraction < 1) assert.equal(result.occluderId, 'reference-block');
    }
    assert.equal(exposure.pointSunState({x:-shadowLength*.5,y:12}, scene, {azimuthDegrees:90,elevationDegrees}), 'direct');
  }
});

test('route distance, arrival time, and sampled shade converge to an independent 30 metre shadow interval', () => {
  const originalSolar = exposure.solarPosition;
  exposure.solarPosition = () => ({azimuthDegrees:90,elevationDegrees:45});
  try {
    const world = { ...fixture().world, renderGeometry: { buildings: [{id:'reference-block',heightM:20,
      footprint:[{x:0,y:0},{x:10,y:0},{x:10,y:10},{x:0,y:10},{x:0,y:0}]}] } };
    const segment = {id:'straight',geometry:[{x:-41,y:5},{x:22,y:5}],lengthM:63,speedLimitMps:1};
    const errors = [];
    for (const sampleSpacingM of [24,8,2,.5]) {
      const result = simulate({world,worldModel:{segment:()=>segment},routes:[{segmentIds:['straight']}],
        config:{...config,sampleSpacingM,walkingSpeedMps:1,sidewalkOffsetM:0,weatherParticipation:false,treeCanopyParticipation:false}});
      const candidate = result.candidates[0];
      assert.ok(Math.abs(candidate.metrics.travelSeconds - 63)<.001);
      assert.equal(Date.parse(candidate.arrivalAt)-Date.parse(candidate.departureAt),63000);
      assert.ok(Math.abs(candidate.metrics.directSunSeconds+candidate.metrics.shadeSeconds-63)<.001);
      errors.push(Math.abs(candidate.metrics.shadeSeconds-30));
      candidate.samples.forEach(sample => assert.equal(sample.geometricState, sample.point.x>-20 && sample.point.x<10 ? 'shade':'direct'));
    }
    assert.ok(errors.at(-1)<.001, JSON.stringify(errors));
    assert.ok(errors.at(-1)<errors[0], JSON.stringify(errors));
  } finally { exposure.solarPosition = originalSolar; }
});


test('drawn rectangular shadows match the analytical occlusion interval at the same sun instant', () => {
  const shadows = require('../public/shared/plugins/sun-walker/shadow-geometry.js');
  const world = {renderGeometry:{buildings:[{id:'block',heightM:40,footprint:[{x:0,y:0},{x:10,y:0},{x:10,y:10},{x:0,y:10},{x:0,y:0}]}]}};
  for(const elevationDegrees of [2,15,45,60]){
    const sun={elevationDegrees,azimuthDegrees:90};
    const [shadow]=shadows.projectedEvidenceShadows(world,['block'],sun);
    const expected=40/Math.tan(elevationDegrees*Math.PI/180);
    assert.ok(Math.abs(shadow.lengthM-expected)<1e-8);
    assert.ok(Math.abs(Math.min(...shadow.points.map(p=>p.x))+expected)<1e-8);
    assert.equal(exposure.pointSunState({x:-expected*.99,y:5},exposure.compiledBuildings(world),sun),'shade');
    assert.equal(exposure.pointSunState({x:-expected*1.01,y:5},exposure.compiledBuildings(world),sun),'direct');
  }
  const unknown={renderGeometry:{buildings:[{...world.renderGeometry.buildings[0],heightM:null}]}};
  assert.equal(exposure.pointSunState({x:-1,y:5},exposure.compiledBuildings(unknown),{elevationDegrees:45,azimuthDegrees:90}),'unknown');
  assert.deepEqual(shadows.projectedEvidenceShadows(unknown,['block'],{elevationDegrees:45,azimuthDegrees:90}),[],'Missing heights cannot become rendered evidence');
});


test('unequal polyline edges represent distance and arrival time proportionally', () => {
  const world={...fixture().world,renderGeometry:{buildings:[]}};
  const segment={id:'unequal',geometry:[{x:0,y:0},{x:1,y:0},{x:101,y:0}],lengthM:101};
  const result=simulate({world,worldModel:{segment:()=>segment},routes:[{segmentIds:['unequal']}],config:{...config,sampleSpacingM:25,walkingSpeedMps:1,sidewalkOffsetM:0}});
  const candidate=result.candidates[0];
  assert.equal(candidate.metrics.travelSeconds,101);
  assert.equal(candidate.samples[0].representedSeconds,1);
  assert.equal(Date.parse(candidate.samples[0].timestamp)-Date.parse(candidate.departureAt),500);
  assert.equal(candidate.samples[1].representedSeconds,25);
  assert.equal(Date.parse(candidate.samples[1].timestamp)-Date.parse(candidate.departureAt),13500);
  assert.deepEqual(candidate.samples[0].geometry,[{x:0,y:0},{x:1,y:0}]);
});
