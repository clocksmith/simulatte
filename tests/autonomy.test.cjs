const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');
const publicDir = path.join(root, 'public');
const autonomyDir = publicDir;
const autonomySourceDirs = ['app', 'contracts', 'mission', 'runtime', 'verifier', 'world'].map((name) => path.join(publicDir, name));
const dataDir = path.join(publicDir, 'data', 'autonomy');
const contracts = require('../public/contracts/contract-validator.js');
const receipts = require('../public/runtime/canonical-receipts.js');
const missionApi = require('../public/mission/mission-compiler.js');
const worldApi = require('../public/world/world-model.js');
const routePlanner = require('../public/world/route-planner.js');
const controllerApi = require('../public/runtime/autonomy-controller.js');
const dataLoader = require('../public/runtime/data-loader.js');
const featureRetrieval = require('../public/runtime/feature-retrieval.js');
const occurrenceApi = require('../public/runtime/occurrence-engine.js');
const regionApi = require('../public/world/region-pack-merger.js');
const cameraApi = require('../public/app/camera-controller.js');
const SYNTHETIC_MISSION = 'Deliver the parcel by bike from Canal Depot to East Market. Prefer protected lanes and yield to pedestrians.';
const UNION_SQUARE_LOOP = 'run in circles around union squatre park parimeter until youve ran 5000 feet';

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
}

function hashFile(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function assets() {
  const manifest = readJson('public/data/autonomy/autonomy-manifest.json');
  return {
    manifest: { ...manifest, defaultMissionText: SYNTHETIC_MISSION },
    world: readJson('public/data/autonomy/worlds/nyc-training-corridor-v1.json'),
    featureCatalog: readJson('public/data/autonomy/feature-cards-v1.json'),
    embodiment: readJson('public/data/autonomy/embodiments/delivery-bike-v1.json'),
    policy: readJson('public/data/autonomy/policies/bet-selector-v1.json'),
    occurrenceCatalog: null,
    rerankerEvidence: null,
  };
}

function governedAssets() {
  const manifest = readJson('public/data/autonomy/autonomy-manifest.json');
  const embodiments = manifest.embodiments.map((reference) => readJson(`public/data/autonomy/${reference.path.replace(/^\.\//, '')}`));
  return {
    manifest,
    world: readJson(`public/data/autonomy/${manifest.world.path.replace(/^\.\//, '')}`),
    featureCatalog: readJson('public/data/autonomy/feature-cards-v1.json'),
    embodiments,
    embodiment: embodiments.find((row) => row.id === manifest.defaultEmbodimentId),
    pedestrian: embodiments.find((row) => row.id === 'pedestrian-v1'),
    policy: readJson('public/data/autonomy/policies/bet-selector-v1.json'),
    occurrenceCatalog: readJson(`public/data/autonomy/${manifest.occurrenceCatalog.path.replace(/^\.\//, '')}`),
    rerankerEvidence: readJson(`public/data/autonomy/${manifest.rerankerEvidence.path.replace(/^\.\//, '')}`),
    regionRegistry: readJson(`public/data/autonomy/${manifest.regionRegistry.path.replace(/^\.\//, '')}`),
  };
}

function governedRegionPacks(rows = governedAssets()) {
  return rows.regionRegistry.packs.map((reference) => readJson(`public/data/autonomy/regions/${reference.path.replace(/^\.\//, '')}`));
}

function compileDefaultMission(rows = assets()) {
  return missionApi.compileMission(rows.manifest.defaultMissionText, rows.world, rows.embodiment);
}

function makeController(rows = assets(), mission = compileDefaultMission(rows), overrides = {}) {
  const embodiment = rows.embodiments?.find((row) => row.id === mission.embodimentId) || rows.embodiment;
  return controllerApi.createAutonomyController({
    world: rows.world,
    featureCatalog: rows.featureCatalog,
    occurrenceCatalog: rows.occurrenceCatalog,
    embodiment,
    policy: rows.policy,
    mission,
    ...overrides,
  });
}

function tickPayloads(receipt) {
  return receipt.trace.map((entry) => entry.payload).filter((row) => row.schema === 'simulatte.autonomyTickReceipt.v2');
}

function selectedBet(tick) {
  return tick.bets.find((row) => row.bet.id === tick.selectedBetId);
}

function jsFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return jsFiles(file);
    return entry.isFile() && entry.name.endsWith('.js') ? [file] : [];
  });
}

test('autonomy manifest pins and validates every governed asset', () => {
  const rows = governedAssets();
  contracts.validateManifest(rows.manifest);
  assert.equal(rows.manifest.runtime.entryPath, '/');
  contracts.validateFeatureCatalog(rows.featureCatalog);
  contracts.validateWorld(rows.world, rows.featureCatalog);
  rows.embodiments.forEach((row) => contracts.validateEmbodiment(row));
  contracts.validatePolicy(rows.policy);
  contracts.validateOccurrenceCatalog(rows.occurrenceCatalog, rows.world);
  contracts.validateRerankerEvidence(rows.rerankerEvidence, rows.featureCatalog);
  contracts.validateRegionRegistry(rows.regionRegistry);
  const regionPacks = governedRegionPacks(rows);
  regionPacks.forEach((pack) => contracts.validateRegionPack(pack, rows.regionRegistry));
  const composition = regionApi.mergeRegionPacks(rows.regionRegistry, regionPacks);
  assert.equal(crypto.createHash('sha256').update(dataLoader.artifactText(composition.world)).digest('hex'), rows.manifest.world.sha256);
  assert.equal(crypto.createHash('sha256').update(dataLoader.artifactText(composition.featureCatalog)).digest('hex'), rows.manifest.featureCatalog.sha256);
  assert.equal(composition.receipt.seamNodeIds.length, 27);
  for (const key of ['world', 'policy', 'featureCatalog', 'occurrenceCatalog', 'rerankerEvidence', 'regionRegistry']) {
    const reference = rows.manifest[key];
    const file = path.resolve(dataDir, reference.path);
    assert.equal(hashFile(file), reference.sha256, `${key} raw bytes should match the manifest`);
    assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).id, reference.id);
  }
  rows.manifest.embodiments.forEach((reference) => {
    const file = path.resolve(dataDir, reference.path);
    assert.equal(hashFile(file), reference.sha256, `${reference.id} raw bytes should match the manifest`);
    assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).id, reference.id);
  });
  assert.equal(rows.world.provenance.sourceKind, 'compiled_open_data_snapshot');
  assert.match(rows.world.provenance.claimBoundary, /frozen sources/i);
  assert.equal(rows.world.renderGeometry.schema, 'simulatte.autonomyRenderGeometry.v1');
  assert.ok(rows.world.renderGeometry.buildings.length > 1500);
  assert.ok(rows.world.renderGeometry.streets.length > 2000);
  assert.equal(rows.world.renderGeometry.parks.length, 1);
  assert.equal(rows.world.circuits.length, 1);
  assert.equal(rows.world.circuits[0].source.propertyId, 'M089');
  assert.equal(rows.world.circuits[0].source.memberCount, 2);
  assert.equal(rows.world.circuits[0].source.selectionMethod, 'largest_projected_exterior_ring_area_v1');
  assert.match(rows.world.circuits[0].source.geometryWgs84Sha256, /^[a-f0-9]{64}$/);
  assert.ok(rows.world.circuits[0].lengthM > 640 && rows.world.circuits[0].lengthM < 660);
  assert.match(rows.world.provenance.sources.bike.rawSha256, /^[a-f0-9]{64}$/);
  assert.equal(rows.world.scenario.liveConditionsUsed, false);
});

test('region composition fails closed on missing packs and conflicting seam rows', () => {
  const rows = governedAssets();
  const packs = governedRegionPacks(rows);
  assert.throws(
    () => regionApi.mergeRegionPacks(rows.regionRegistry, packs.slice(0, -1)),
    (error) => error.code === 'region_pack_set_mismatch'
  );
  assert.throws(
    () => regionApi.mergeRegionPacks(rows.regionRegistry, [...packs, structuredClone(packs[0])]),
    (error) => error.code === 'region_pack_set_mismatch'
  );

  const conflicting = structuredClone(packs);
  const seamNodeId = rows.regionRegistry.composition.seamNodeIds[0];
  const memberships = conflicting.filter((pack) => pack.nodes.some((node) => node.id === seamNodeId));
  assert.ok(memberships.length > 1);
  memberships[1].nodes.find((node) => node.id === seamNodeId).position.x += 0.001;
  assert.throws(
    () => regionApi.mergeRegionPacks(rows.regionRegistry, conflicting),
    (error) => error.code === 'region_row_conflict' && error.evidence.rowId === seamNodeId
  );

  const missingSeam = structuredClone(packs);
  const seamOwner = missingSeam.find((pack) => pack.seams.some((row) => row.nodeId === seamNodeId));
  seamOwner.seams = seamOwner.seams.filter((row) => row.nodeId !== seamNodeId);
  assert.throws(
    () => regionApi.mergeRegionPacks(rows.regionRegistry, missingSeam),
    (error) => error.code === 'region_pack_seam_set_mismatch'
  );

  const wrongPeer = structuredClone(packs);
  const peerOwner = wrongPeer.find((pack) => pack.seams.some((row) => row.nodeId === seamNodeId));
  peerOwner.seams.find((row) => row.nodeId === seamNodeId).peerPackIds = [];
  assert.throws(
    () => regionApi.mergeRegionPacks(rows.regionRegistry, wrongPeer),
    (error) => error.code === 'region_pack_seam_peer_mismatch'
  );
});

test('region pack validation binds every pack to its exact registry identity', () => {
  const rows = governedAssets();
  const source = governedRegionPacks(rows)[0];
  const mutations = [
    ['contentVersion', (pack) => { pack.contentVersion = 'wrong-version'; }],
    ['cityId', (pack) => { pack.cityId = 'wrong-city'; }],
    ['worldId', (pack) => { pack.worldId = 'wrong-world'; }],
    ['boundsWgs84', (pack) => { pack.boundsWgs84.east += 0.001; }],
    ['neighborIds', (pack) => { pack.neighborIds = []; }],
    ['counts', (pack) => { pack.counts.nodes += 1; }],
    ['provenance.worldSha256', (pack) => { pack.provenance.worldSha256 = '0'.repeat(64); }],
    ['provenance.featureCatalogSha256', (pack) => { pack.provenance.featureCatalogSha256 = '0'.repeat(64); }],
  ];
  mutations.forEach(([pathName, mutate]) => {
    const pack = structuredClone(source);
    mutate(pack);
    assert.throws(
      () => contracts.validateRegionPack(pack, rows.regionRegistry),
      (error) => error instanceof contracts.AutonomyContractError && error.path.includes(pathName.split('.')[0]),
      pathName
    );
  });

  const undeclared = structuredClone(source);
  undeclared.id = 'undeclared-region-v1';
  assert.throws(
    () => contracts.validateRegionPack(undeclared, rows.regionRegistry),
    (error) => error instanceof contracts.AutonomyContractError && error.path === '$.id'
  );
});

test('the governed journey crosses all three independently owned region packs', () => {
  const rows = governedAssets();
  const mission = compileDefaultMission(rows);
  const route = routePlanner.planRoute({
    worldModel: worldApi.createWorldModel(rows.world),
    originNodeId: mission.originNodeId,
    destinationNodeId: mission.destinationNodeId,
    mode: rows.embodiment.mode,
    tick: 0,
    mission,
    policy: rows.policy,
  });
  const ownerBySegmentId = new Map(governedRegionPacks(rows)
    .flatMap((pack) => pack.segments.map((segment) => [segment.id, pack.id])));
  assert.deepEqual([...new Set(route.segmentIds.map((id) => ownerBySegmentId.get(id)))], [
    'manhattan-villages-v1',
    'east-river-crossing-v1',
    'north-brooklyn-v1',
  ]);
  assert.ok(route.segmentIds.every((id) => ownerBySegmentId.has(id)));
});

test('camera targets expose every composed region and pan between modes without snapping', () => {
  const rows = governedAssets();
  const packs = governedRegionPacks(rows);
  const model = worldApi.createWorldModel(rows.world);
  const targets = cameraApi.createCameraTargets(rows.world, model, rows.regionRegistry, packs);
  assert.equal(targets.filter((row) => row.kind === 'region').length, 3);
  assert.equal(targets.filter((row) => row.kind === 'place').length, rows.regionRegistry.placeIndex.length);
  assert.ok(targets.every((row) => row.target.every(Number.isFinite) && Number.isFinite(row.distance)));

  const state = cameraApi.createCameraState(rows.world, model, rows.regionRegistry, packs);
  const segmentId = rows.world.scenario.defaultRoute.segmentIds[0];
  const snapshot = {
    route: { segmentIds: rows.world.scenario.defaultRoute.segmentIds },
    state: { position: model.node(rows.world.scenario.defaultRoute.nodeIds[0]).position, currentSegmentId: segmentId },
  };
  const initial = cameraApi.advanceCamera(state, snapshot, model, 1.6, 1000);
  cameraApi.setCameraMode(state, 'top', 1000);
  const transitionStart = cameraApi.advanceCamera(state, snapshot, model, 1.6, 1000);
  const transitionMiddle = cameraApi.advanceCamera(state, snapshot, model, 1.6, 1425);
  const transitionEnd = cameraApi.advanceCamera(state, snapshot, model, 1.6, 1850);
  assert.deepEqual(transitionStart.eye, initial.eye);
  assert.notDeepEqual(transitionMiddle.eye, initial.eye);
  assert.equal(transitionMiddle.transitionState, 'active');
  assert.equal(transitionEnd.transitionState, 'settled');

  const beforePan = [...state.orbitTarget];
  assert.equal(cameraApi.panCamera(state, 18, -7, 800), true);
  assert.notDeepEqual(state.orbitTarget, beforePan);
  assert.equal(state.focusId, 'custom');
  const beforeZoom = state.distance;
  assert.equal(cameraApi.zoomCamera(state, -120), true);
  assert.ok(state.distance < beforeZoom);
  cameraApi.setCameraMode(state, 'follow', 1900);
  cameraApi.advanceCamera(state, snapshot, model, 1.6, 2800);
  const beforeFollowZoom = state.followDistance;
  assert.equal(cameraApi.zoomCamera(state, -240), true);
  assert.ok(state.followDistance < beforeFollowZoom);
  const nearFollowPose = cameraApi.advanceCamera(state, snapshot, model, 1.6, 2900);
  assert.equal(nearFollowPose.followDistance, state.followDistance);
});

test('mission compiler grounds known labels to source intervals and fails closed', () => {
  const rows = assets();
  const mission = compileDefaultMission(rows);
  assert.equal(mission.originNodeId, 'node-canal-depot');
  assert.equal(mission.destinationNodeId, 'node-east-market');
  assert.equal(mission.constraints.lanePreference, 'protected');
  assert.equal(mission.constraints.mustYieldToPedestrians, true);
  assert.ok(mission.parser.evidence.every((row) => mission.sourceText.slice(row.start, row.end) === row.value));
  assert.throws(
    () => missionApi.compileMission('Deliver the parcel by bike from Unknown Pier to East Market.', rows.world, rows.embodiment),
    (error) => error.code === 'origin_not_grounded'
  );
  assert.throws(
    () => missionApi.compileMission('Walk from Canal Depot to East Market.', rows.world, rows.embodiment),
    (error) => error.code === 'task_not_grounded'
  );
});

test('loop mission corrects the exact prompt, converts feet, and grounds the pinned park boundary', () => {
  const rows = governedAssets();
  const mission = missionApi.compileMission(UNION_SQUARE_LOOP, rows.world, rows.embodiments);
  const circuit = rows.world.circuits[0];
  assert.equal(mission.schema, 'simulatte.autonomyMission.v2');
  assert.equal(mission.task.type, 'loop_distance');
  assert.equal(mission.embodimentId, 'pedestrian-v1');
  assert.equal(mission.task.targetDistanceM, 1524);
  assert.deepEqual(mission.task.requestedDistance, { value: 5000, unit: 'foot', metersPerUnit: 0.3048, convertedMeters: 1524 });
  assert.equal(mission.grounding.circuitId, circuit.id);
  assert.deepEqual(mission.grounding.segmentIds, circuit.segmentIds);
  assert.equal(mission.grounding.fullLapsBeforeFinalPartial, 2);
  assert.equal(mission.grounding.finalPartialDistanceM, Number((1524 % circuit.lengthM).toFixed(6)));
  assert.equal(mission.grounding.source.geometryWgs84Sha256, circuit.source.geometryWgs84Sha256);
  assert.equal(mission.parser.evidence.find((row) => row.field === 'circuit').value, 'union squatre park');
  assert.equal(mission.parser.evidence.find((row) => row.field === 'circuit').editDistance, 1);
  assert.equal(mission.parser.evidence.find((row) => row.field === 'boundaryKind').value, 'parimeter');
  assert.ok(mission.parser.evidence.every((row) => mission.sourceText.slice(row.start, row.end) === row.value));
  assert.throws(
    () => missionApi.compileMission('run around imaginary park perimeter for 5000 feet', rows.world, rows.embodiments),
    (error) => error.code === 'circuit_not_grounded'
  );
});

test('one embodiment contract configures pedestrian, bicycle, scooter, and car kinds', () => {
  const rows = assets();
  for (const kind of ['scooter', 'car']) {
    const embodiment = {
      ...structuredClone(rows.embodiment),
      id: `${kind}-contract-fixture-v1`,
      contentVersion: `${kind}-contract-fixture-v1`,
      label: `${kind} contract fixture`,
      mode: kind,
      kind,
      renderProfile: kind,
    };
    contracts.validateEmbodiment(embodiment);
    const mission = missionApi.compileMission(
      `Deliver the parcel by ${kind} from Canal Depot to East Market.`,
      rows.world,
      [embodiment]
    );
    assert.equal(mission.embodimentId, embodiment.id);
    assert.throws(
      () => routePlanner.planRoute({
        worldModel: worldApi.createWorldModel(rows.world),
        originNodeId: mission.originNodeId,
        destinationNodeId: mission.destinationNodeId,
        mode: embodiment.mode,
        tick: 0,
        mission,
        policy: rows.policy,
      }),
      (error) => error.code === 'route_not_found',
      `${kind} must not borrow bicycle graph eligibility`
    );
  }
});

test('declared circuit route and runtime receipt settle exactly at 5000 feet', async () => {
  const rows = governedAssets();
  const mission = missionApi.compileMission(UNION_SQUARE_LOOP, rows.world, rows.embodiments);
  const worldModel = worldApi.createWorldModel(rows.world);
  const route = routePlanner.planCircuitRoute({
    worldModel,
    circuitId: mission.task.circuitId,
    currentNodeId: mission.originNodeId,
    mode: rows.pedestrian.mode,
    tick: 0,
    mission,
    policy: rows.policy,
  });
  assert.equal(route.algorithm, 'declared_closed_circuit_v1');
  assert.deepEqual(route.segmentIds, mission.grounding.segmentIds);
  const controller = makeController(rows, mission);
  await controller.run();
  const receipt = await controller.journeyReceipt();
  const lapEvents = receipt.events.filter((row) => row.kind === 'lap_completed');
  assert.equal(receipt.terminalState, 'completed');
  assert.equal(receipt.finalState.distanceTraveledM, 1524);
  assert.equal(receipt.finalState.completedLaps, 2);
  assert.equal(receipt.settlement.completionReason, 'distance_target_reached');
  assert.equal(receipt.settlement.distanceErrorM, 0);
  assert.equal(receipt.settlement.exactDistanceSettlement, true);
  assert.ok(mission.grounding.segmentIds.includes(receipt.settlement.finalSegmentId));
  assert.ok(receipt.settlement.finalSegmentProgressM > 0);
  assert.equal(receipt.settlement.boundaryGeometrySha256, mission.grounding.source.geometryWgs84Sha256);
  assert.equal(receipt.verification.pass, true);
  assert.equal(lapEvents.length, 2);
  assert.ok(lapEvents.every((row) => row.evidence.lapDistanceM === mission.grounding.circuitLengthM));
  assert.ok(lapEvents.every((row) => row.evidence.boundaryGeometrySha256 === mission.grounding.source.geometryWgs84Sha256));
  assert.ok(lapEvents.every((row) => JSON.stringify(row.evidence.segmentIds) === JSON.stringify(mission.grounding.segmentIds)));
  assert.ok(receipt.events.some((row) => row.kind === 'mission_completed' && row.evidence.distanceTraveledM === 1524));
  assert.equal(receipt.verification.requiredFailureIds.length, 0);
});

test('A star plans protected preference and revises around an active closure', () => {
  const rows = assets();
  const worldModel = worldApi.createWorldModel(rows.world);
  const protectedMission = compileDefaultMission(rows);
  const protectedRoute = routePlanner.planRoute({
    worldModel,
    originNodeId: protectedMission.originNodeId,
    destinationNodeId: protectedMission.destinationNodeId,
    mode: rows.embodiment.mode,
    tick: 0,
    mission: protectedMission,
    policy: rows.policy,
  });
  assert.ok(protectedRoute.segmentIds.includes('segment-west-greenway'));
  assert.ok(!protectedRoute.segmentIds.includes('segment-west-center'));

  const anyMission = missionApi.compileMission(
    'Deliver the parcel by bike from Canal Depot to East Market and yield to pedestrians.',
    rows.world,
    rows.embodiment
  );
  const beforeClosure = routePlanner.planRoute({
    worldModel,
    originNodeId: 'node-west',
    destinationNodeId: anyMission.destinationNodeId,
    mode: rows.embodiment.mode,
    tick: 0,
    mission: anyMission,
    policy: rows.policy,
  });
  const duringClosure = routePlanner.planRoute({
    worldModel,
    originNodeId: 'node-west',
    destinationNodeId: anyMission.destinationNodeId,
    mode: rows.embodiment.mode,
    tick: 12,
    mission: anyMission,
    policy: rows.policy,
  });
  assert.equal(beforeClosure.segmentIds[0], 'segment-west-center');
  assert.equal(duringClosure.segmentIds[0], 'segment-west-greenway');
});

test('continuous action loop waits at red, yields to a pedestrian, and completes delivery', async () => {
  const controller = makeController();
  await controller.run();
  const receipt = await controller.journeyReceipt();
  const ticks = tickPayloads(receipt);
  const signalTicks = ticks.filter((tick) => tick.bets.some((row) => row.gate.blockingCheckIds.includes('signal_compliance')));
  const pedestrianTicks = ticks.filter((tick) => tick.bets.some((row) => row.gate.blockingCheckIds.includes('pedestrian_clearance')));
  assert.equal(receipt.terminalState, 'completed');
  assert.equal(receipt.verification.pass, true);
  assert.equal(receipt.verification.integrityPass, true);
  assert.ok(signalTicks.length >= 1);
  assert.ok(signalTicks.some((tick) => selectedBet(tick).bet.action.maneuver === 'wait'));
  assert.ok(pedestrianTicks.length >= 1);
  assert.ok(pedestrianTicks.some((tick) => selectedBet(tick).bet.action.maneuver === 'yield'));
  assert.equal(receipt.verification.violations.length, 0);
  assert.ok(receipt.verification.metrics.minimumPedestrianClearanceM >= 5);
  assert.ok(ticks.every((tick) => tick.settlement.verdict === 'won'));
});

test('closure invalidates the planned path and emits one route-revision decision', async () => {
  const rows = assets();
  const mission = missionApi.compileMission(
    'Deliver the parcel by bike from Canal Depot to East Market and yield to pedestrians.',
    rows.world,
    rows.embodiment
  );
  const controller = makeController(rows, mission);
  await controller.run();
  const receipt = await controller.journeyReceipt();
  const revisions = tickPayloads(receipt).filter((tick) => tick.route.reason === 'blocked_segment');
  assert.equal(receipt.verification.pass, true);
  assert.equal(revisions.length, 1);
  assert.equal(selectedBet(revisions[0]).bet.action.maneuver, 'reroute');
  assert.equal(selectedBet(revisions[0]).bet.action.targetSegmentId, 'segment-west-greenway');
});

test('identical missions produce identical trace hashes', async () => {
  const first = makeController();
  const second = makeController();
  await first.run();
  await second.run();
  const firstReceipt = await first.journeyReceipt();
  const secondReceipt = await second.journeyReceipt();
  assert.equal(firstReceipt.integrity.terminalHash, secondReceipt.integrity.terminalHash);
  assert.deepEqual(firstReceipt.verification.metrics, secondReceipt.verification.metrics);
});

test('feature retrieval recalls referenced cards, reranks typed evidence, and excludes an absent closure', async () => {
  const rows = assets();
  const controller = makeController(rows);
  await controller.step();
  const journey = await controller.journeyReceipt();
  const retrieval = tickPayloads(journey)[0].observation.featureRetrieval;
  assert.equal(retrieval.schema, 'simulatte.autonomyFeatureRetrieval.v1');
  assert.ok(retrieval.queryRows.some((row) => row.id === 'route-segment'));
  const routeQuery = retrieval.queryRows.find((row) => row.id === 'route-segment');
  assert.ok(routeQuery.referencedCardIds.every((id) => retrieval.selectedCardIds.includes(id)));
  assert.ok(retrieval.selectedCardIds.includes('scenario.delivery-arrival'));
  assert.ok(!retrieval.retrievedRows.some((row) => row.cardId === 'behavior.blocked-segment-replan'));
  assert.ok(!retrieval.retrievedRows.some((row) => row.cardId.startsWith('network.')));
  assert.ok(retrieval.counts.indexCandidateCount < retrieval.counts.catalogCount);
  const direct = featureRetrieval.retrieveAndRerankFeatures({
    featureCatalog: rows.featureCatalog,
    mission: compileDefaultMission(rows),
    state: controller.snapshot().state,
    route: controller.snapshot().route,
    worldModel: controller.worldModel,
  });
  assert.deepEqual(direct, featureRetrieval.retrieveAndRerankFeatures({
    featureCatalog: rows.featureCatalog,
    mission: compileDefaultMission(rows),
    state: controller.snapshot().state,
    route: controller.snapshot().route,
    worldModel: controller.worldModel,
  }));
});

test('occurrence plugins apply time and event effects with target validation', () => {
  const rows = governedAssets();
  contracts.validateOccurrenceCatalog(rows.occurrenceCatalog, rows.world);
  const engine = occurrenceApi.createOccurrenceEngine(rows.occurrenceCatalog);
  const initial = engine.evaluate({
    tick: 0,
    events: [occurrenceApi.eventRow({ tick: 0, kind: 'mission_started', sourceId: 'test-mission' })],
  });
  assert.equal(initial.effects.signalStates[0].state, 'red');
  assert.equal(initial.effects.activeActorIds.length, 0);
  const triggerNodeId = rows.world.scenario.eventActorTriggerNodeId;
  const triggered = engine.evaluate({
    tick: 500,
    events: [occurrenceApi.eventRow({ tick: 500, kind: 'node_reached', sourceId: triggerNodeId })],
  });
  assert.ok(triggered.activePatternIds.includes('pedestrian-crossing-node-event'));
  assert.ok(triggered.effects.activeActorIds.includes('assumed-pedestrian-route-2'));
  const invalid = structuredClone(rows.occurrenceCatalog);
  invalid.patterns.find((row) => row.effect.type === 'actor_active').effect.targetId = 'missing-actor';
  assert.throws(() => contracts.validateOccurrenceCatalog(invalid, rows.world), /known world actor ID/);
});

test('public missions stay diagnostic and reranker weights retain measured evidence', () => {
  const corpus = readJson('tools/samer/autonomy/public-navigation-missions-v1.json');
  const evidence = readJson('public/data/autonomy/evidence/feature-reranker-public-diagnostic-v1.json');
  assert.equal(corpus.missions.length, 20);
  assert.equal(corpus.population, 'public_diagnostic');
  assert.equal(corpus.promotionEligible, false);
  assert.equal(crypto.createHash('sha256').update(JSON.stringify(corpus.missions)).digest('hex'), corpus.construction.rowsSha256);
  assert.equal(evidence.population.promotionEligible, false);
  assert.equal(evidence.accepted, true);
  assert.ok(evidence.challenger.meanReciprocalRank > evidence.control.meanReciprocalRank);
  assert.ok(evidence.challenger.recallAt5 >= evidence.control.recallAt5);
});

test('governed Villages to Williamsburg journey completes with real geometry and assumed occurrences separated', async () => {
  const rows = governedAssets();
  const controller = makeController(rows);
  await controller.run();
  const receipt = await controller.journeyReceipt();
  assert.equal(receipt.terminalState, 'completed');
  assert.equal(receipt.verification.pass, true);
  assert.equal(receipt.verification.requiredFailureIds.length, 0);
  assert.ok(receipt.verification.metrics.distanceTraveledM > 6000);
  assert.ok(tickPayloads(receipt).some((tick) => selectedBet(tick).bet.action.maneuver === 'wait'));
  assert.ok(tickPayloads(receipt).some((tick) => selectedBet(tick).bet.action.maneuver === 'yield'));
  assert.ok(receipt.events.some((row) => row.kind === 'node_reached' && row.sourceId === rows.world.scenario.eventActorTriggerNodeId));
  assert.ok(tickPayloads(receipt).some((tick) => tick.observation.occurrenceReceipt.activePatternIds.includes('pedestrian-crossing-node-event')));
});

test('receipt verification rejects a changed tick payload', async () => {
  const controller = makeController();
  await controller.run(4);
  const journey = await controller.journeyReceipt();
  const chain = {
    schema: 'simulatte.autonomyReceiptChain.v1',
    algorithm: journey.integrity.algorithm,
    terminalHash: journey.integrity.terminalHash,
    entries: structuredClone(journey.trace),
  };
  assert.equal((await receipts.verifyReceiptChain(chain)).pass, true);
  chain.entries[1].payload.transition.endSpeedMps += 1;
  const result = await receipts.verifyReceiptChain(chain);
  assert.equal(result.pass, false);
  assert.equal(result.reason, 'entry_hash_mismatch');
});

test('agent stops with a failure receipt when every candidate fails safety', async () => {
  const rows = assets();
  rows.policy.safety.minimumPedestrianClearanceM = 33;
  contracts.validatePolicy(rows.policy);
  const controller = makeController(rows);
  await controller.step();
  const snapshot = controller.snapshot();
  const receipt = await controller.journeyReceipt();
  assert.equal(snapshot.state.status, 'failed');
  assert.equal(snapshot.state.terminalReason, 'no_safe_action');
  assert.equal(receipt.trace.length, 1);
  assert.equal(receipt.trace[0].payload.schema, 'simulatte.autonomyFailureReceipt.v1');
  assert.equal(receipt.trace[0].payload.code, 'no_safe_action');
});

test('browser loader verifies raw hashes and rejects tampered assets', async () => {
  const fileForUrl = (url) => {
    const pathname = new URL(url).pathname;
    return path.join(publicDir, pathname.replace(/^\//, ''));
  };
  const fetchFiles = async (url) => {
    const file = fileForUrl(url);
    return { ok: fs.existsSync(file), status: fs.existsSync(file) ? 200 : 404, text: async () => fs.readFileSync(file, 'utf8') };
  };
  const loaded = await dataLoader.loadAutonomyData('http://localhost/data/autonomy/autonomy-manifest.json', fetchFiles);
  assert.equal(loaded.world.id, 'nyc-core-autonomy-v1');
  assert.deepEqual(loaded.embodiments.map((row) => row.id), ['delivery-bike-v1', 'pedestrian-v1']);
  assert.equal(loaded.defaultEmbodiment.id, 'delivery-bike-v1');
  assert.equal(loaded.receipt.assets.policy.sha256, loaded.manifest.policy.sha256);
  assert.deepEqual(loaded.regionComposition.packIds, ['manhattan-villages-v1', 'east-river-crossing-v1', 'north-brooklyn-v1']);
  assert.equal(loaded.regionComposition.seamNodeIds.length, 27);
  assert.equal(loaded.regionRegistry.id, loaded.manifest.regionRegistry.id);
  assert.equal(loaded.regionPacks.length, 3);

  const tampered = async (url) => {
    const file = fileForUrl(url);
    const text = fs.readFileSync(file, 'utf8');
    return { ok: true, status: 200, text: async () => url.includes('bet-selector-v1.json') ? `${text}\n` : text };
  };
  await assert.rejects(
    () => dataLoader.loadAutonomyData('http://localhost/data/autonomy/autonomy-manifest.json', tampered),
    (error) => error.code === 'asset_hash_mismatch'
  );

  const tamperedPack = async (url) => {
    const file = fileForUrl(url);
    const text = fs.readFileSync(file, 'utf8');
    return { ok: true, status: 200, text: async () => url.includes('east-river-crossing-v1.json') ? `${text}\n` : text };
  };
  await assert.rejects(
    () => dataLoader.loadAutonomyData('http://localhost/data/autonomy/autonomy-manifest.json', tamperedPack),
    (error) => error.code === 'asset_hash_mismatch' && error.evidence.key === 'regionPack:east-river-crossing-v1'
  );
});

test('autonomy browser surface loads every declared module and stays independent of compiler phases', () => {
  const html = fs.readFileSync(path.join(autonomyDir, 'index.html'), 'utf8');
  const compatibilityHtml = fs.readFileSync(path.join(root, 'public/autonomy/index.html'), 'utf8');
  const compilerHtml = fs.readFileSync(path.join(root, 'public/blank/index.html'), 'utf8');
  const scripts = Array.from(html.matchAll(/<script defer src="([^"]+)"><\/script>/g))
    .map((match) => match[1].replace(/\?v=.*$/, ''));
  assert.ok(scripts.length >= 15);
  assert.ok(scripts.indexOf('./world/region-pack-merger.js') < scripts.indexOf('./runtime/data-loader.js'));
  scripts.forEach((source) => assert.ok(fs.existsSync(path.resolve(autonomyDir, source)), `${source} should exist`));
  assert.match(html, /id="autonomy-canvas"/);
  assert.match(html, /Start mission/);
  assert.match(compatibilityHtml, /location\.replace/);
  assert.match(compatibilityHtml, /rel="canonical" href="\/"/);
  assert.match(html, /class="brand" href="\.\/blank\/"/);
  assert.match(compilerHtml, /class="prompt-dock-autonomy" href="\/"/);
  assert.doesNotMatch(html, /phase-0[1-8]/);
  for (const file of autonomySourceDirs.flatMap(jsFiles)) {
    assert.ok(fs.readFileSync(file, 'utf8').split(/\r?\n/).length <= 999, `${path.relative(root, file)} should remain below 1,000 lines`);
  }
});

test('autonomy schemas are restrictive and SAME-R declares one intervention', async () => {
  for (const name of ['mission', 'observation', 'occurrence-receipt', 'action-bet', 'settlement', 'journey-receipt', 'region-pack', 'region-registry']) {
    const schema = readJson(`public/contracts/${name}.schema.json`);
    assert.equal(schema.additionalProperties, false);
    assert.ok(schema.required.length > 0);
  }
  const contract = readJson('tools/samer/autonomy/autonomy-policy-contract.json');
  const scenarios = readJson('tools/samer/autonomy/public-navigation-scenarios-v1.json');
  assert.equal(contract.causalContract.intervention, 'action_bet_selection_approach');
  assert.equal(contract.causalContract.primaryMetric.type, 'derived_from_deterministic_trace');
  assert.equal(contract.causalContract.population.promotionEligible, false);
  assert.equal(contract.matchedOperationDetails.evaluationOrder, 'scenario_then_lane_then_repetition');
  assert.equal(contract.matchedOperationDetails.modelIdentity, null);
  assert.equal(contract.matchedOperationDetails.adapterIdentity, null);
  assert.equal(contract.matchedOperationDetails.runtimeSourcePaths.length, 17);
  assert.deepEqual(contract.causalContract.blockingGuardrails, [
    'zero_safety_violations',
    'all_required_obligations_pass',
    'receipt_chain_verified',
    'deterministic_repetitions',
    'declared_budget_saturated',
    'scenario_expectations',
  ]);
  assert.equal(contract.saturation.method, 'isSaturated(history, budget)');
  assert.equal(contract.promotion.automaticPromotionAllowed, false);
  assert.equal(contract.promotion.sealedScenarioSetRequired, true);
  assert.equal(scenarios.population, 'public_diagnostic');
  const runner = await import(pathToFileURL(path.join(root, 'tools/samer/autonomy/run-policy-trial.mjs')));
  const sourceIdentity = runner.hashRuntimeSources(contract.matchedOperationDetails.runtimeSourcePaths);
  assert.equal(sourceIdentity.files.length, 17);
  assert.match(sourceIdentity.aggregateSha256, /^[a-f0-9]{64}$/);
  assert.ok(sourceIdentity.files.every((row) => /^[a-f0-9]{64}$/.test(row.sha256)));
  assert.equal(runner.isSaturated([], contract.budget), false);
  assert.equal(runner.isSaturated([{ terminalState: 'completed', tickCount: 4 }], contract.budget), true);
  assert.equal(runner.isSaturated([{ terminalState: 'active', tickCount: contract.budget.maximumTicksPerJourney }], contract.budget), true);
});

test('GeoJSON compiler preserves declared lanes and source provenance', async () => {
  const compiler = await import(pathToFileURL(path.join(root, 'tools/autonomy/compile-geojson-tile.mjs')));
  const collection = {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      properties: {
        id: 'segment-test',
        fromNodeId: 'node-a',
        toNodeId: 'node-b',
        fromLabel: 'A',
        toLabel: 'B',
        laneType: 'protected',
        speedLimitMps: 5,
      },
      geometry: { type: 'LineString', coordinates: [[0, 0], [30, 0]] },
    }],
  };
  const world = compiler.compileGeoJsonTile(collection, {
    sourceId: 'test-source',
    snapshotDate: '2026-07-13',
    worldId: 'test-world',
    coordinates: 'local',
  });
  assert.deepEqual(world.nodes.map((row) => row.id), ['node-a', 'node-b']);
  assert.equal(world.segments[0].laneType, 'protected');
  assert.equal(world.segments[0].lengthM, 30);
  assert.equal(world.provenance.sourceId, 'test-source');
  assert.equal(world.signals.length, 0);
});

test('browser audit validates explicit desktop and mobile viewport contracts', async () => {
  const audit = await import(pathToFileURL(path.join(root, 'tools/autonomy/run-browser-smoke.mjs')));
  assert.deepEqual(audit.parseViewport('1440x1000'), { width: 1440, height: 1000 });
  assert.deepEqual(audit.parseViewport('390x844'), { width: 390, height: 844 });
  assert.equal(audit.parseUrl('https://simulatte.world/'), 'https://simulatte.world/');
  assert.throws(() => audit.parseViewport('wide'), /expected WIDTHxHEIGHT/);
  assert.throws(() => audit.parseViewport('319x844'), /at least 320x480/);
  assert.throws(() => audit.parseUrl('file:///tmp/autonomy'), /expected HTTP or HTTPS/);
});
