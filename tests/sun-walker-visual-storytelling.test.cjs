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

test('manual follow target survives the transition from route preparation to walking',()=>{
  const simulation=simulate(),rows=fixture();
  const compiler=require('../public/simulatte/app/plugin-presentation.js');
  const registry=require('../public/simulatte/platform/runtime/provenance-registry.js');
  const worldModel={...rows.worldModel,world:rows.world,node:()=>null};
  for(const step of [0,1,simulation.timeline.snapshots.length-1]) {
    const contribution=createContribution(simulation,step);
    const compiled=compiler.compile([{pluginId:'sun-walker',presentation:contribution.presentation}],worldModel,
      {provenanceReceipts:[registry.createContributionProvenanceReceipt(contribution)]});
    const follow=compiled.cameraTargets.find(target=>target.id==='plugin:sun-walker:sun-walker-actor:follow');
    assert.equal(follow?.subjectKind,'pedestrian');
    assert.equal(follow?.sourceId,'sun-walker-actor');
  }
});

test('the walker remains visible and followable when shadow evidence exceeds the layer budget',()=>{
  const contribution=createContribution(simulate(),1),rows=fixture();
  const shadow=contribution.presentation.layers.find(layer=>layer.quantity.kind==='occlusion.shadow-length');
  assert.ok(shadow);
  const dense={...contribution,presentation:{...contribution.presentation,layers:[
    ...contribution.presentation.layers,
    ...Array.from({length:400},(_,index)=>({...shadow,id:`dense-shadow-${index}`,aggregationKey:`dense-shadow-${index}`})),
  ]}};
  const registry=require('../public/simulatte/platform/runtime/provenance-registry.js');
  const compiler=require('../public/simulatte/app/plugin-presentation.js');
  const compiled=compiler.compile([{pluginId:'sun-walker',presentation:dense.presentation}],
    {...rows.worldModel,world:rows.world,node:()=>null},
    {provenanceReceipts:[registry.createContributionProvenanceReceipt(dense)]});
  assert.equal(compiled.actors.length,1);
  assert.ok(compiled.cameraTargets.some(target=>target.id==='plugin:sun-walker:sun-walker-actor:follow'));
  assert.ok(compiled.areas.length<400,'Shadow evidence still respects the compositor budget');
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
      (layer) => layer.id === `sun-walked-segment-${activeSample.id}`
    );
    const measures = Object.fromEntries(contribution.state.measures.map((row) => [row.kind, row.value]));
    const rows = plugin.inspectorRows(result, step);
    const exposureStatus = exposureSummaryApi.summarize(snapshot.state, snapshot.state.currentObservation);
    const inspectionRows = contribution.inspections[0].fields;

    assert.deepEqual(actor.geometry.coordinates[0], [snapshot.state.currentObservation.point.x, snapshot.state.currentObservation.point.y, 0]);
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
    const summary=require('../public/simulatte/app/experience-presentation.js').summarize({
      profile:require('../public/data/application-profiles/sun-walker-v1.json'), contributions:[contribution],runState:'running'});
    assert.equal(summary.stats['Sun so far'],exposureStatus.percentages.direct+'% / '+exposureStatus.seconds.direct.toFixed(1)+' s');
    assert.equal(summary.stats['Shade so far'],exposureStatus.percentages.shade+'% / '+exposureStatus.seconds.shade.toFixed(1)+' s');
    assert.equal(Object.keys(summary.stats).length,3);
    assert.equal(measures['unknown-share'],exposureStatus.percentages.unknown/100);
    assert.equal(measures['night-share'],exposureStatus.percentages.night/100);
    assert.equal(contribution.objects.find(row=>row.id==='sun-walker-actor').label,'Walker');
    assert.ok(contribution.objects.filter(row=>row.id.startsWith('sun-walked-segment-')).every(row=>row.inSelector===false));

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

  assert.equal(departure.description, 'Walk: Departure time (UTC)');
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

test('exposure readouts disclose completed intervals and never fabricate a denominator at departure',()=>{
 const result=simulate(),initial=createContribution(result,0);
 const format=require('../public/simulatte/app/experience-presentation.js').formatMeasure;
 for(const kind of ['direct-sun-share','shade-share']){
  const measure=initial.state.measures.find(row=>row.kind===kind);
  assert.equal(measure.measurement.validity,'not-sampled');assert.equal(format(measure),'Not sampled');
 }
 const mixed=exposureSummaryApi.summarize({directSunSeconds:10,shadeSeconds:20,unknownSeconds:10,nightSeconds:10,
  geometricDirectSunSeconds:20,geometricShadeSeconds:10,geometricUnknownSeconds:10,geometricNightSeconds:10});
 assert.equal(mixed.elapsedSeconds,50);
 assert.deepEqual(mixed.percentages,{shade:40,direct:20,unknown:20,night:20});
 assert.equal(mixed.geometricPercentages.shade,20,'Canopy-adjusted exposure does not overwrite building geometry');
 const final=createContribution(result,result.timeline.snapshots.length-1);
 const seconds=final.state.measures.find(row=>row.kind==='direct-sun').value;
 const descriptor=final.state.measures.find(row=>row.kind==='direct-sun-share').measurement;
 assert.equal(descriptor.timeBasis,'accumulated');assert.match(descriptor.definition,new RegExp(seconds.toFixed(1)+' seconds'));
 assert.match(descriptor.definition,/unknown and night remain in the denominator/);
 assert.match(descriptor.definition,/No UV dose or thermal-comfort/);
});

test('exposure intervals, playback clock and endpoint arrival agree', () => {
  const result = simulate({config:{...config,sidewalkOffsetM:0,walkingSpeedMps:1,sampleSpacingM:30,treeCanopyParticipation:false,weatherParticipation:false}});
  const selected=result.candidates.find(row=>row.id===result.selectedCandidateId);
  for(const snapshot of result.timeline.snapshots){
    const event=result.timeline.events[snapshot.step];
    const elapsed=(Date.parse(event.timestamp)-Date.parse(result.departureAt))/1000;
    const measured=exposureSummaryApi.summarize(snapshot.state).elapsedSeconds;
    assert.ok(Math.abs(elapsed-measured)<.002,`${elapsed} s elapsed but ${measured} s credited`);
    assert.ok(Math.abs(snapshot.state.progress-elapsed/selected.metrics.travelSeconds)<1e-5);
  }
  for(const [step,point] of [[0,selected.segments[0].geometry[0]],[result.timeline.snapshots.length-1,selected.segments.at(-1).geometry.at(-1)]]){
    const actor=createContribution(result,step).presentation.layers.find(row=>row.id==='sun-walker-actor');
    assert.deepEqual(actor.geometry.coordinates[0],[point.x,point.y,0]);
  }
});

test('projected shadows preserve sunny concavities and courtyards', () => {
  const shadows=require('../public/shared/plugins/sun-walker/shadow-geometry.js');
  const exposure=require('../public/shared/plugins/sun-walker/sun-exposure.js');
  const ring=rows=>rows.map(([x,y])=>({x,y}));
  const buildings=[{id:'L',heightM:1,footprint:ring([[0,0],[10,0],[10,2],[2,2],[2,10],[0,10]])},
    {id:'court',heightM:1,footprint:ring([[20,0],[30,0],[30,10],[20,10]]),interiorRings:[ring([[22,2],[28,2],[28,8],[22,8]])]}];
  const sun={azimuthDegrees:0,elevationDegrees:45};
  const projected=shadows.projectedEvidenceShadows({renderGeometry:{buildings}},['L','court'],sun);
  // Use the independent ray classifier on the displayed polygons at zenith.
  const displayed=projected.map(row=>({footprint:row.points,heightM:1}));
  for(const point of [{x:5,y:5},{x:25,y:5},{x:5,y:-.5},{x:21,y:5},{x:1,y:8}]){
    assert.equal(exposure.pointSunState(point,displayed,{azimuthDegrees:0,elevationDegrees:90}),
      exposure.pointSunState(point,buildings,sun),JSON.stringify(point));
  }
});

test('open-sky and night reference walks conserve duration at multiple sample spacings',()=>{
 for(const departureAt of ['2026-07-19T17:00:00Z','2026-07-19T04:00:00Z'])for(const sampleSpacingM of [30,10,2]){
  const rows=fixture();rows.world.renderGeometry.buildings=[];
  const result=simulate({...rows,departureAt,config:{...config,sampleSpacingM,sidewalkOffsetM:0,walkingSpeedMps:1,treeCanopyParticipation:false,weatherParticipation:false}});
  const route=result.candidates.find(row=>row.id===result.selectedCandidateId);
  assert.equal(route.metrics.travelSeconds,100);
  assert.equal(Date.parse(route.arrivalAt)-Date.parse(departureAt),100000);
  assert.equal(route.metrics[departureAt.includes('17:00')?'directSunSeconds':'nightSeconds'],100);
  for(const snapshot of result.timeline.snapshots){
   const current=snapshot.state.currentObservation;
   assert.equal(current.timestamp,result.timeline.events[snapshot.step].timestamp);
   assert.equal(current.geometricState,departureAt.includes('17:00')?'direct':'night');
  }
 }
});

test('distinct route alternatives have separate visible lanes even where paths overlap',()=>{
 const result=simulate(),contribution=createContribution(result,0);
 const routes=contribution.presentation.layers.filter(row=>['route.shade-selected','route.fastest-baseline'].includes(row.quantity.kind));
 assert.equal(routes.length,2);
 const styles=routes.map(row=>compositor.styleForLayer(row));
 assert.notEqual(styles[0].color,styles[1].color);
 assert.notEqual(styles[0].laneOffsetPx,styles[1].laneOffsetPx);
});

test('shortest-route baseline survives a crowded shadow annotation layer budget',()=>{
 const result=simulate(),contribution=createContribution(result,0);
 const shadow=contribution.presentation.layers.find(row=>row.quantity?.kind==='occlusion.shadow-length');
 assert.ok(shadow);
 const crowded={...contribution.presentation,layers:[...contribution.presentation.layers,
  ...Array.from({length:400},(_,i)=>({...shadow,id:'crowded-shadow-'+i}))]};
 const composed=compositor.createCompositor().compose(crowded);
 assert.ok(composed.primitives.some(row=>row.id==='shade-selected-route'));
 assert.ok(composed.primitives.some(row=>row.id==='fastest-route'),'Both routes must survive the annotation budget');
 assert.ok(composed.receipt.suppressedLayerIds.length>0,'The fixture must actually exhaust the layer budget');
});
