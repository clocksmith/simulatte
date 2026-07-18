const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');
const publicDir = path.join(root, 'public');
const autonomyDir = publicDir;
const autonomySourceDirs = ['app', 'contracts', 'mission', 'runtime', 'verifier', 'world'].map((name) => path.join(publicDir, name));
const dataDir = path.join(publicDir, 'data', 'autonomy');
const contracts = require('../public/contracts/contract-validator.js');
const cooperativeContracts = require('../public/contracts/cooperative-contracts.js');
const receipts = require('../public/runtime/canonical-receipts.js');
const missionApi = require('../public/mission/mission-compiler.js');
const capabilityApi = require('../public/mission/capability-matrix.js');
const worldApi = require('../public/world/world-model.js');
const routePlanner = require('../public/world/route-planner.js');
const controllerApi = require('../public/runtime/autonomy-controller.js');
const counterfactualApi = require('../public/runtime/counterfactual-runner.js');
const dataLoader = require('../public/runtime/data-loader.js');
const journeyLedgerApi = require('../public/runtime/journey-ledger.js');
const neuralPlaceCore = require('../public/runtime/neural-place-resolution-core.js');
const runtimeLog = require('../public/runtime/runtime-log.js');
const featureRetrieval = require('../public/runtime/feature-retrieval.js');
const occurrenceApi = require('../public/runtime/occurrence-engine.js');
const cooperativeApi = require('../public/runtime/cooperative-engine.js');
const regionApi = require('../public/world/region-pack-merger.js');
const ambientActorApi = require('../public/world/ambient-actors.js');
const cameraApi = require('../public/app/camera-controller.js');
const appApi = require('../public/app/main.js');
const gpuMath = require('../public/app/webgpu-math.js');
const rendererApi = require('../public/app/webgpu-renderer.js');
const actorGeometry = require('../public/app/webgpu-actor-geometry.js');
const gpuGeometry = require('../public/app/webgpu-geometry.js');
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
  const referenced = (key) => JSON.parse(fs.readFileSync(path.resolve(dataDir, manifest[key].path), 'utf8'));
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
    accessibilityIndex: readJson(`public/data/autonomy/${manifest.accessibilityIndex.path.replace(/^\.\//, '')}`),
    routeAmenityIndex: readJson(`public/data/autonomy/${manifest.routeAmenityIndex.path.replace(/^\.\//, '')}`),
    safetyHistoryIndex: readJson(`public/data/autonomy/${manifest.safetyHistoryIndex.path.replace(/^\.\//, '')}`),
    curriculum: readJson(`public/data/autonomy/${manifest.curriculum.path.replace(/^\.\//, '')}`),
    worldSnapshotRegistry: readJson(`public/data/autonomy/${manifest.worldSnapshotRegistry.path.replace(/^\.\//, '')}`),
    placeEmbeddingIndex: referenced('placeEmbeddingIndex'),
    placeResolutionEvidence: referenced('placeResolutionEvidence'),
    modelRuntimeLock: referenced('modelRuntimeLock'),
    policyArenaEvidence: referenced('policyArenaEvidence'),
    cooperativeScenario: referenced('cooperativeScenario'),
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
    accessibilityIndex: rows.accessibilityIndex,
    routeAmenityIndex: rows.routeAmenityIndex,
    safetyHistoryIndex: rows.safetyHistoryIndex,
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
  assert.equal(composition.receipt.seamNodeIds.length, 98);
  contracts.validateAccessibilityIndex(rows.accessibilityIndex, rows.world, rows.manifest.world.sha256);
  contracts.validateRouteAmenityIndex(rows.routeAmenityIndex, rows.world, rows.manifest.world.sha256);
  contracts.validateSafetyHistoryIndex(rows.safetyHistoryIndex, rows.world, rows.manifest.world.sha256);
  contracts.validateCurriculum(rows.curriculum, rows.world);
  contracts.validateWorldSnapshotRegistry(rows.worldSnapshotRegistry, rows.world);
  contracts.validatePlaceEmbeddingIndex(rows.placeEmbeddingIndex, rows.modelRuntimeLock, rows.world, rows.manifest.world.sha256);
  contracts.validatePlaceResolutionEvidence(rows.placeResolutionEvidence, rows.placeEmbeddingIndex, rows.modelRuntimeLock);
  contracts.validateModelRuntimeLock(rows.modelRuntimeLock);
  contracts.validatePolicyArenaEvidence(rows.policyArenaEvidence);
  cooperativeContracts.validateScenario(rows.cooperativeScenario);
  for (const key of ['world', 'policy', 'featureCatalog', 'occurrenceCatalog', 'rerankerEvidence', 'regionRegistry', 'accessibilityIndex', 'routeAmenityIndex', 'safetyHistoryIndex', 'curriculum', 'worldSnapshotRegistry', 'placeEmbeddingIndex', 'placeResolutionEvidence', 'modelRuntimeLock', 'policyArenaEvidence', 'cooperativeScenario']) {
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
  assert.equal(rows.world.renderGeometry.parks.length, 9);
  assert.deepEqual([...new Set(rows.world.renderGeometry.parks.map((row) => row.source.propertyId))], [
    'B058',
    'M088',
    'M089',
    'M098',
  ]);
  assert.ok(rows.world.renderGeometry.parks.every((row) => row.source.selectionMethod === 'all_exterior_members_v1'));
  assert.ok(rows.world.renderGeometry.parks.every((row) => /does not authorize traversal/i.test(row.source.claimBoundary)));
  assert.equal(rows.world.circuits.length, 4);
  assert.deepEqual(rows.world.circuits.map((row) => row.source.propertyId).sort(), ['B058', 'M088', 'M089', 'M098']);
  const unionCircuit = rows.world.circuits.find((row) => row.source.propertyId === 'M089');
  assert.equal(unionCircuit.source.memberCount, 2);
  assert.equal(unionCircuit.source.selectionMethod, 'largest_projected_exterior_ring_area_v1');
  assert.match(unionCircuit.source.geometryWgs84Sha256, /^[a-f0-9]{64}$/);
  assert.ok(unionCircuit.lengthM > 640 && unionCircuit.lengthM < 660);
  assert.match(rows.world.provenance.sources.bike.rawSha256, /^[a-f0-9]{64}$/);
  assert.equal(rows.world.scenario.liveConditionsUsed, false);
});

test('autonomy data manager separates fetch plans, historical backfills, verification, and activation', async () => {
  const manager = await import(pathToFileURL(path.join(root, 'tools/autonomy/manage-autonomy-data.mjs')).href);
  const catalog = manager.loadCatalog(path.join(root, 'tools/autonomy/source-catalog-v1.json'));
  const snapshotPlan = manager.buildDataPlan(catalog, {
    command: 'plan',
    groups: ['pedestrian-topology'],
    sources: [],
    snapshotDate: '2026-07-13',
    bounds: null,
  });
  assert.equal(snapshotPlan.mode, 'snapshot_refresh');
  assert.deepEqual(snapshotPlan.sourceIds, [
    'nyc-pedestrian-ramps',
    'nyc-planimetric-curbs',
    'nyc-planimetric-sidewalks',
    'nyc-raised-crosswalks',
  ]);
  assert.equal(snapshotPlan.requests.length, 4);
  assert.ok(snapshotPlan.requests.every((row) => row.dataClass === 'map_fact'));
  assert.ok(snapshotPlan.requests.every((row) => row.entryGate.length > 20));
  assert.match(snapshotPlan.planSha256, /^[a-f0-9]{64}$/);

  const backfillPlan = manager.buildDataPlan(catalog, {
    command: 'backfill',
    groups: ['mobility-history'],
    sources: [],
    snapshotDate: '2026-07-13',
    bounds: null,
    from: '2026-01-01',
    to: '2026-03-01',
  });
  assert.equal(backfillPlan.mode, 'historical_backfill');
  assert.equal(backfillPlan.requests.length, 4);
  assert.deepEqual([...new Set(backfillPlan.requests.map((row) => row.period))], ['2026-01', '2026-02']);
  assert.ok(backfillPlan.requests.every((row) => row.dataClass === 'observed_history'));
  assert.match(backfillPlan.requests.find((row) => row.sourceId === 'nyc-bicycle-pedestrian-counts').url, /timestamp >= '2026-01-01/);
  assert.throws(
    () => manager.buildDataPlan(catalog, {
      command: 'plan', groups: ['mobility-history'], sources: [], snapshotDate: '2026-07-13', bounds: null,
    }),
    /require backfill/
  );

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'simulatte-autonomy-data-'));
  const testPlan = {
    schema: 'simulatte.autonomyDataFetchPlan.v1',
    planSha256: '1'.repeat(64),
    requests: [{
      id: 'fixture:one', sourceId: 'fixture', output: 'fixture.json', url: 'https://example.test/fixture.json',
    }],
  };
  const fetched = await manager.fetchDataPlan(testPlan, {
    outDir: directory,
    command: ['fixture'],
    fetchImpl: async () => new Response('{"status":"ok"}\n', {
      status: 200,
      headers: { 'content-type': 'application/json', etag: 'fixture-v1' },
    }),
  });
  assert.equal(fetched.receipt.activation, 'staged_not_active');
  assert.equal(manager.verifyFetchReceipt(fetched.receiptPath).status, 'verified');
  fs.appendFileSync(path.join(directory, 'fixture.json'), 'tamper');
  assert.throws(() => manager.verifyFetchReceipt(fetched.receiptPath), /Byte count drift/);
  fs.rmSync(directory, { recursive: true, force: true });
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

test('follow minimap uses a finite north-up orthographic camera centered on the agent', () => {
  const snapshot = { state: { position: { x: 2105.25, y: -486.5 } } };
  const camera = rendererApi.cameraForMinimap(snapshot, { width: 320, height: 240 });
  assert.deepEqual(camera.eye, [2105.25, 1800, 486.5]);
  assert.ok([...camera.viewProjection].every(Number.isFinite));
  const center = gpuMath.transformPoint(camera.viewProjection, [2105.25, 0, 486.5]);
  assert.ok(Math.abs(center[0]) < 1e-5);
  assert.ok(Math.abs(center[1]) < 1e-5);
  assert.equal(rendererApi.MINIMAP_RADIUS_M, 420);
});

test('mission shuffle cycles deterministic governed examples that all compile', () => {
  const rows = governedAssets();
  assert.ok(rows.manifest.missionExamples.length >= 4);
  assert.ok(rows.manifest.missionExamples.includes(rows.manifest.defaultMissionText));
  rows.manifest.missionExamples.forEach((sourceText) => {
    if (cooperativeApi.recognizesCooperativeRequest(sourceText)) {
      cooperativeContracts.validateScenario(rows.cooperativeScenario);
      return;
    }
    const mission = missionApi.compileMission(sourceText, rows.world, rows.embodiments);
    assert.ok(['delivery', 'point_to_point', 'loop'].includes(mission.task.type), sourceText);
  });
  const visited = [];
  let current = rows.manifest.defaultMissionText;
  for (let index = 0; index < rows.manifest.missionExamples.length; index += 1) {
    const next = appApi.nextMissionExample(rows.manifest.missionExamples, current);
    assert.notEqual(next, current);
    visited.push(next);
    current = next;
  }
  assert.equal(new Set(visited).size, rows.manifest.missionExamples.length);
  assert.equal(appApi.nextMissionExample(rows.manifest.missionExamples, rows.manifest.defaultMissionText), visited[0]);
});

test('one actor mesh contract renders realistic pedestrian, bicycle, scooter, and car geometry', () => {
  const minimumBounds = {
    pedestrian: [0.65, 1.8, 0.55],
    bicycle: [2.8, 2.2, 0.5],
    scooter: [1.2, 1.7, 0.55],
    car: [4.2, 1.4, 2],
  };
  assert.equal(gpuGeometry.FLOATS_PER_VERTEX, actorGeometry.FLOATS_PER_VERTEX);
  assert.deepEqual(actorGeometry.SUPPORTED_ACTOR_KINDS, ['pedestrian', 'bicycle', 'scooter', 'car']);

  actorGeometry.SUPPORTED_ACTOR_KINDS.forEach((kind) => {
    const writer = gpuGeometry.createWriter();
    const receipt = actorGeometry.addActor(writer, {
      kind,
      point: { x: 0, y: 0 },
      heading: 0,
      motionPhase: 1.2,
    });
    const vertices = writer.finish();
    const minimum = [Infinity, Infinity, Infinity];
    const maximum = [-Infinity, -Infinity, -Infinity];
    for (let offset = 0; offset < vertices.length; offset += gpuGeometry.FLOATS_PER_VERTEX) {
      for (let axis = 0; axis < 3; axis += 1) {
        minimum[axis] = Math.min(minimum[axis], vertices[offset + axis]);
        maximum[axis] = Math.max(maximum[axis], vertices[offset + axis]);
      }
      assert.ok(vertices[offset + 11] >= 0 && vertices[offset + 11] <= 1, `${kind} metallic lane`);
      assert.ok(vertices[offset + 12] >= 0 && vertices[offset + 12] <= 1, `${kind} roughness lane`);
    }
    const bounds = maximum.map((value, axis) => value - minimum[axis]);
    assert.ok(vertices.every(Number.isFinite), `${kind} mesh must contain only finite values`);
    assert.equal(receipt.schema, 'simulatte.autonomyActorMesh.v1');
    assert.equal(receipt.kind, kind);
    assert.equal(receipt.materialModel, 'metallic_roughness_vertex_v1');
    assert.equal(receipt.vertexCount, vertices.length / gpuGeometry.FLOATS_PER_VERTEX);
    assert.ok(receipt.vertexCount > 1000, `${kind} should not regress to a placeholder primitive`);
    minimumBounds[kind].forEach((value, axis) => assert.ok(bounds[axis] >= value, `${kind} axis ${axis} extent`));
  });

  assert.throws(
    () => actorGeometry.addActor(gpuGeometry.createWriter(), { kind: 'hoverboard', point: { x: 0, y: 0 } }),
    /actor_kind_unsupported/
  );
});

test('world actors expose path heading and reject unregistered render kinds', () => {
  const motion = worldApi.samplePolyline([{ x: 0, y: 0 }, { x: 0, y: 10 }], 0.25);
  assert.deepEqual(motion.position, { x: 0, y: 2.5 });
  assert.equal(motion.heading, Math.PI / 2);

  const rows = assets();
  const invalidType = structuredClone(rows.world);
  invalidType.actors[0].type = 'hoverboard';
  assert.throws(
    () => contracts.validateWorld(invalidType, rows.featureCatalog),
    (error) => error instanceof contracts.AutonomyContractError && error.path.endsWith('.type')
  );
  const invalidRadius = structuredClone(rows.world);
  invalidRadius.actors[0].radiusM = 0;
  assert.throws(
    () => contracts.validateWorld(invalidRadius, rows.featureCatalog),
    (error) => error instanceof contracts.AutonomyContractError && error.path.endsWith('.radiusM')
  );
});

test('ambient traffic animates every actor kind through one deterministic observation contract', () => {
  const rows = governedAssets();
  const first = ambientActorApi.compileAmbientActors(rows.world);
  const second = ambientActorApi.compileAmbientActors(rows.world);
  assert.deepEqual(first, second);
  assert.deepEqual(first.counts, { pedestrian: 4, bicycle: 3, scooter: 2, car: 4 });
  assert.equal(first.actors.length, 13);
  assert.deepEqual([...new Set(first.actors.map((row) => row.type))].sort(), ['bicycle', 'car', 'pedestrian', 'scooter']);
  assert.ok(first.actors.every((row) => row.interactionRole === 'visible_ambient'));
  assert.ok(first.actors.every((row) => row.provenance.kind === 'simulation_assumption' && row.provenance.isLiveCondition === false));
  assert.ok(first.actors.every((row) => ['loop', 'ping_pong'].includes(row.motion.kind) && row.motion.speedMps > 0));

  const model = worldApi.createWorldModel(rows.world);
  assert.equal(model.ambientCompilation.schema, 'simulatte.autonomyAmbientActorCompilation.v1');
  const atZero = new Map(model.activeActors(0).filter((row) => row.id.startsWith('ambient-')).map((row) => [row.id, row]));
  const atOne = new Map(model.activeActors(1).filter((row) => row.id.startsWith('ambient-')).map((row) => [row.id, row]));
  assert.equal(atZero.size, 13);
  assert.ok([...atZero].every(([id, row]) => worldApi.distance(row.position, atOne.get(id).position) > 0));
  assert.ok([...atOne.values()].every((row) => Number.isFinite(row.heading)));
  assert.match(model.ambientCompilation.claimBoundary, /not observed traffic/i);
});

test('controller rebuilds reuse validated immutable world topology without changing behavior', () => {
  const rows = governedAssets();
  const mission = missionApi.compileMission(rows.manifest.defaultMissionText, rows.world, rows.embodiments);
  const firstMatrix = capabilityApi.buildCapabilityMatrix(rows.world, rows.embodiments);
  const secondMatrix = capabilityApi.buildCapabilityMatrix(rows.world, rows.embodiments);
  assert.strictEqual(secondMatrix, firstMatrix);

  const originalValidateWorld = contracts.validateWorld;
  let worldValidationCount = 0;
  contracts.validateWorld = (...args) => {
    worldValidationCount += 1;
    return originalValidateWorld(...args);
  };
  try {
    const first = makeController(rows, mission);
    const second = makeController(rows, mission);
    assert.equal(worldValidationCount, 1);
    assert.strictEqual(second.worldModel.nodesById, first.worldModel.nodesById);
    assert.strictEqual(second.worldModel.segmentsById, first.worldModel.segmentsById);
    assert.strictEqual(second.worldModel.ambientCompilation, first.worldModel.ambientCompilation);
    assert.deepEqual(second.snapshot(), first.snapshot());
  } finally {
    contracts.validateWorld = originalValidateWorld;
  }
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
    (error) => error.code === 'capability_not_available'
  );
});

test('loop mission corrects the exact prompt, converts feet, and grounds the pinned park boundary', () => {
  const rows = governedAssets();
  const mission = missionApi.compileMission(UNION_SQUARE_LOOP, rows.world, rows.embodiments);
  const circuit = rows.world.circuits.find((row) => row.id === 'union-square-park-perimeter-v1');
  assert.equal(mission.schema, 'simulatte.autonomyMission.v3');
  assert.equal(mission.task.type, 'loop');
  assert.equal(mission.embodimentId, 'pedestrian-v1');
  assert.equal(mission.task.termination.targetDistanceM, 1524);
  assert.deepEqual(mission.task.termination.requestedDistance, { value: 5000, unit: 'foot', metersPerUnit: 0.3048, convertedMeters: 1524 });
  assert.equal(mission.capability.rowId, 'pedestrian:closed_circuit');
  assert.ok(mission.capability.artifactIds.includes(circuit.id));
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

test('capability matrix keeps embodiment, mission family, and governed artifacts orthogonal', () => {
  const rows = governedAssets();
  const matrix = capabilityApi.buildCapabilityMatrix(rows.world, rows.embodiments);
  assert.equal(matrix.schema, 'simulatte.autonomyCapabilityMatrix.v1');
  assert.equal(matrix.rows.length, 12);
  const row = (id) => matrix.rows.find((candidate) => candidate.id === id);
  assert.equal(row('bicycle:delivery').supported, true);
  assert.equal(row('pedestrian:closed_circuit').supported, true);
  assert.deepEqual(row('pedestrian:closed_circuit').terminationKinds, ['distance', 'laps', 'duration']);
  assert.ok(row('pedestrian:closed_circuit').circuitIds.includes('union-square-park-perimeter-v1'));
  assert.equal(row('pedestrian:point_to_point').supported, true);
  assert.equal(row('bicycle:closed_circuit').supported, false);
  assert.ok(row('bicycle:closed_circuit').blockingReasons.includes('circuit_artifact_not_registered'));
  for (const kind of ['scooter', 'car']) {
    assert.equal(row(`${kind}:delivery`).supported, true);
    assert.equal(row(`${kind}:point_to_point`).supported, true);
    const mission = missionApi.compileMission(`Deliver the parcel by ${kind} from Union Square to North Williamsburg.`, rows.world, rows.embodiments);
    assert.equal(mission.embodimentId, `${kind}-v1`);
  }
});

test('closed-circuit missions settle exact lap-count and elapsed-time goals through one controller', async () => {
  const rows = governedAssets();
  const lapMission = missionApi.compileMission('Run 2 laps around Union Square Park perimeter.', rows.world, rows.embodiments);
  const unionCircuit = rows.world.circuits.find((row) => row.id === 'union-square-park-perimeter-v1');
  assert.deepEqual(lapMission.task.termination, { kind: 'laps', targetLaps: 2, targetDistanceM: Number((unionCircuit.lengthM * 2).toFixed(9)) });
  const lapController = makeController(rows, lapMission);
  await lapController.run();
  const lapReceipt = await lapController.journeyReceipt();
  assert.equal(lapReceipt.terminalState, 'completed');
  assert.equal(lapReceipt.finalState.completedLaps, 2);
  assert.equal(lapReceipt.settlement.completionReason, 'lap_target_reached');
  assert.equal(lapReceipt.settlement.exactTargetSettlement, true);
  assert.equal(lapReceipt.verification.requiredFailureIds.length, 0);

  const durationMission = missionApi.compileMission('Run around Union Square Park perimeter for 12 seconds.', rows.world, rows.embodiments);
  assert.deepEqual(durationMission.task.termination, {
    kind: 'duration',
    targetDurationSeconds: 12,
    requestedDuration: { value: 12, unit: 'second', secondsPerUnit: 1, convertedSeconds: 12 },
  });
  const durationController = makeController(rows, durationMission);
  await durationController.run();
  const durationReceipt = await durationController.journeyReceipt();
  assert.equal(durationReceipt.terminalState, 'completed');
  assert.equal(durationReceipt.finalState.simulatedTimeSeconds, 12);
  assert.equal(durationReceipt.settlement.durationErrorSeconds, 0);
  assert.equal(durationReceipt.settlement.completionReason, 'duration_target_reached');
  assert.equal(durationReceipt.verification.requiredFailureIds.length, 0);
});

test('delivery canonicalizes governed place typos and proves named routed-street avoidance', async () => {
  const rows = governedAssets();
  const extendedTypoMission = missionApi.compileMission(
    'Deliver the parcel by bike from East Village to Youniun Sqare.',
    rows.world,
    rows.embodiments
  );
  const extendedDestination = extendedTypoMission.parser.evidence.find((row) => row.field === 'destination');
  assert.equal(extendedTypoMission.destinationNodeId, rows.world.nodes.find((node) => node.label === 'Union Square').id);
  assert.equal(extendedDestination.method, 'extended_damerau_place');
  assert.equal(extendedTypoMission.parser.kind, 'deterministic_grounded_lexical');
  assert.equal(extendedTypoMission.placeResolution, null);
  const mission = missionApi.compileMission(
    'Deliver the parcel by bike from Union Squre to North Willamsburg. Prefer protected lanes and avoid Kent Avenue.',
    rows.world,
    rows.embodiments
  );
  assert.equal(mission.originNodeId, rows.world.nodes.find((node) => node.label === 'Union Square').id);
  assert.equal(mission.destinationNodeId, rows.world.nodes.find((node) => node.label === 'North Williamsburg').id);
  assert.equal(mission.parser.evidence.find((row) => row.field === 'origin').editDistance, 1);
  assert.equal(mission.parser.evidence.find((row) => row.field === 'destination').editDistance, 1);
  assert.deepEqual(mission.constraints.avoidStreetNames, ['KENT AV']);
  const planned = routePlanner.planRoute({
    worldModel: worldApi.createWorldModel(rows.world),
    originNodeId: mission.originNodeId,
    destinationNodeId: mission.destinationNodeId,
    mode: rows.embodiment.mode,
    tick: 0,
    mission,
    policy: rows.policy,
  });
  assert.ok(planned.excludedStreetSegmentIds.length > 0);
  assert.ok(planned.segmentIds.every((id) => rows.world.segments.find((segment) => segment.id === id).source.street !== 'KENT AV'));
  const controller = makeController(rows, mission);
  await controller.run();
  const receipt = await controller.journeyReceipt();
  const avoidance = receipt.verification.obligations.find((row) => row.kind === 'street_avoidance');
  assert.equal(receipt.terminalState, 'completed');
  assert.equal(avoidance.required, true);
  assert.equal(avoidance.pass, true);
  assert.deepEqual(avoidance.evidence.enteredAvoidedStreetNames, []);
  const bedfordMission = missionApi.compileMission(
    'Deliver the parcel by bike from Union Square to North Williamsburg. Avoid Bedford Avenue.',
    rows.world,
    rows.embodiments
  );
  const bedfordRoute = routePlanner.planRoute({
    worldModel: worldApi.createWorldModel(rows.world),
    originNodeId: bedfordMission.originNodeId,
    destinationNodeId: bedfordMission.destinationNodeId,
    mode: rows.embodiment.mode,
    tick: 0,
    mission: bedfordMission,
    policy: rows.policy,
  });
  assert.deepEqual(bedfordMission.constraints.avoidStreetNames, ['Bedford Avenue']);
  assert.equal(bedfordMission.parser.evidence.find((row) => row.field === 'streetAvoidance').method, 'exact_routed_street');
  assert.deepEqual(bedfordRoute.excludedStreetSegmentIds, []);
  assert.ok(bedfordRoute.segmentIds.every((id) => routePlanner.normalizeStreetName(rows.world.segments.find((segment) => segment.id === id).source.street) !== 'bedford av'));
});

test('one embodiment contract validates all render kinds while missing route artifacts fail closed', () => {
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
    assert.throws(
      () => missionApi.compileMission(
        `Deliver the parcel by ${kind} from Canal Depot to East Market.`,
        rows.world,
        [embodiment]
      ),
      (error) => error.code === 'capability_not_available' && error.evidence.row.blockingReasons.includes('routable_graph_not_registered'),
      `${kind} must not borrow bicycle graph eligibility before compilation`
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
  assert.equal(receipt.settlement.exactTargetSettlement, true);
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
  assert.equal(retrieval.schema, 'simulatte.autonomyFeatureRetrieval.v2');
  assert.deepEqual(retrieval.modelExecution, {
    embedding: { executed: false, modelId: null },
    neuralReranker: { executed: false, modelId: null },
    sharedModelRegistryPath: '/data/simulatte-embedder/model-runtime-lock.json',
    registryScope: 'blank_compiler_only',
    claimBoundary: 'This navigation decision used lexical retrieval and typed deterministic reranking. It did not execute an embedding model or neural reranker.',
  });
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
  const manifest = readJson('public/data/autonomy/autonomy-manifest.json');
  const evidencePath = `public/data/autonomy/${manifest.rerankerEvidence.path.replace(/^\.\//, '')}`;
  const evidence = readJson(evidencePath);
  const corpus = readJson(evidence.identities.corpus.path);
  assert.equal(evidence.id, manifest.rerankerEvidence.id);
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
  assert.equal((await receipts.verifyReceiptChain(chain, { yieldEveryEntries: 1 })).pass, true);
  chain.entries[1].payload.transition.endSpeedMps += 1;
  const result = await receipts.verifyReceiptChain(chain);
  assert.equal(result.pass, false);
  assert.equal(result.reason, 'entry_hash_mismatch');
});

test('pedestrian, bicycle, scooter, and car share one point-to-point planner and controller', async () => {
  const rows = governedAssets();
  const cases = [
    ['Walk from Union Square to Washington Square.', 'pedestrian-v1'],
    ['Bike from Union Square to Washington Square.', 'delivery-bike-v1'],
    ['Ride a scooter from Union Square to Washington Square.', 'scooter-v1'],
    ['Drive from Union Square to Washington Square.', 'car-v1'],
  ];
  for (const [sourceText, embodimentId] of cases) {
    const mission = missionApi.compileMission(sourceText, rows.world, rows.embodiments);
    assert.equal(mission.task.type, 'point_to_point');
    assert.equal(mission.embodimentId, embodimentId);
    const controller = makeController(rows, mission);
    const planning = controller.planning();
    assert.equal(planning.alternatives[0].schema, 'simulatte.autonomyJourneyRoutePlan.v1');
    assert.equal(planning.alternatives[0].legs.length, 1);
    await controller.run();
    const receipt = await controller.journeyReceipt();
    assert.equal(receipt.finalState.status, 'completed', sourceText);
    assert.equal(receipt.verification.pass, true, sourceText);
    assert.equal(receipt.settlement.orderedStops.completedStopNodeIds.length, 1);
  }
});

test('ordered stops, return trips, timing, and gig compensation settle as typed obligations', async () => {
  const rows = governedAssets();
  const sourceText = 'Deliver the parcel by bike from Union Square to East Village, then Tompkins Square, then return to Union Square for $25.';
  const mission = missionApi.compileMission(sourceText, rows.world, rows.embodiments);
  assert.equal(mission.task.stopNodeIds.length, 3);
  assert.equal(mission.task.stopNodeIds.at(-1), mission.originNodeId);
  assert.equal(mission.economics.amountCents, 2500);
  const controller = makeController(rows, mission);
  assert.equal(controller.planning().alternatives[0].legs.length, 3);
  await controller.run();
  const receipt = await controller.journeyReceipt();
  assert.equal(receipt.finalState.status, 'completed');
  assert.deepEqual(receipt.settlement.orderedStops.completedStopNodeIds, mission.task.stopNodeIds);
  assert.equal(receipt.settlement.economics.declaredGrossAmountCents, 2500);
  assert.ok(receipt.settlement.economics.grossHourlyCents > 0);
  assert.equal(receipt.verification.obligations.find((row) => row.kind === 'ordered_stops').pass, true);

  const daylight = missionApi.compileMission(
    'Walk from Tompkins Square to Washington Square starting at 9 pm and arrive by 10 pm, only in daylight.',
    rows.world,
    rows.embodiments
  );
  const refused = makeController(rows, daylight);
  assert.equal(refused.snapshot().state.status, 'failed');
  assert.equal(refused.snapshot().state.terminalReason, 'daylight_departure_outside_window');
  assert.equal(refused.snapshot().state.distanceTraveledM, 0);

  const inWindow = missionApi.compileMission(
    'Walk from Tompkins Square to Washington Square starting at 4 pm and arrive by 5 pm, only in daylight.',
    rows.world,
    rows.embodiments
  );
  const inWindowController = makeController(rows, inWindow);
  await inWindowController.run();
  const inWindowReceipt = await inWindowController.journeyReceipt();
  assert.equal(inWindowReceipt.finalState.status, 'completed');
  assert.equal(inWindowReceipt.verification.obligations.find((row) => row.kind === 'arrival_deadline').pass, true);
  assert.equal(inWindowReceipt.verification.obligations.find((row) => row.kind === 'daylight_window').pass, true);
});

test('amenity and accessibility requests use pinned evidence and fail closed with exact blockers', () => {
  const rows = governedAssets();
  const rackMission = missionApi.compileMission(
    'Bike from Union Square to Washington Square and keep me within 200 meters of a bike rack.',
    rows.world,
    rows.embodiments
  );
  const rackPlanning = makeController(rows, rackMission).planning();
  assert.equal(rackPlanning.amenities.status, 'supported');
  assert.equal(rackPlanning.amenities.requestedMaximumDistanceM, 200);
  assert.ok(rackPlanning.amenities.maximumObservedDistanceM <= 200);
  assert.match(rackPlanning.amenities.identities.sourceReceiptSha256, /^[a-f0-9]{64}$/);
  const impossibleRackMission = missionApi.compileMission(
    'Bike from Union Square to Washington Square and keep me within 1 meter of a bike rack.',
    rows.world,
    rows.embodiments
  );
  assert.throws(
    () => makeController(rows, impossibleRackMission),
    (error) => error.code === 'route_not_found' && error.evidence.excludedAmenitySegmentIds.length > 0
  );

  const wheelchair = missionApi.compileMission('Roll in a wheelchair from Union Square to Washington Square.', rows.world, rows.embodiments);
  const accessibilityController = makeController(rows, wheelchair);
  const audit = accessibilityController.planning().accessibility;
  assert.equal(accessibilityController.snapshot().state.terminalReason, 'accessibility_route_not_supported');
  assert.equal(audit.enforced, true);
  assert.equal(audit.verdict, 'blocked');
  assert.ok(audit.failures.failedRamps.length > 0);
  assert.ok(audit.failures.failedRamps[0].rampId);
  assert.match(audit.identities.sourceReceiptSha256, /^[a-f0-9]{64}$/);
});

test('historical crash weighting produces a matched counterfactual without becoming a safest-route claim', async () => {
  const rows = governedAssets();
  const mission = missionApi.compileMission('Drive from Union Square to North Williamsburg.', rows.world, rows.embodiments);
  const receipt = await counterfactualApi.compareCounterfactual({
    world: rows.world,
    featureCatalog: rows.featureCatalog,
    occurrenceCatalog: rows.occurrenceCatalog,
    accessibilityIndex: rows.accessibilityIndex,
    routeAmenityIndex: rows.routeAmenityIndex,
    safetyHistoryIndex: rows.safetyHistoryIndex,
    embodiment: rows.embodiments.find((row) => row.id === mission.embodimentId),
    policy: rows.policy,
    mission,
    intervention: { id: 'history-weight-test', kind: 'historical_crash_weighting', historicalObservationWeight: 1 },
  });
  assert.equal(receipt.baseline.status, 'completed');
  assert.equal(receipt.challenger.status, 'completed');
  assert.equal(receipt.baseline.safetyHistory.appliedToSelection, false);
  assert.equal(receipt.challenger.safetyHistory.appliedToSelection, true);
  assert.ok(receipt.diff.historicalCrashDelta < 0);
  assert.ok(receipt.diff.routeJaccard < 1);
  assert.match(receipt.claimBoundary, /does not predict live traffic/i);
  assert.match(receipt.challenger.safetyHistory.claimBoundary, /does not prove causality/i);
  assert.match(receipt.integrity.payloadSha256, /^[a-f0-9]{64}$/);
});

test('unloaded dated worlds retain baseline evidence and emit a named refusal', async () => {
  const rows = assets();
  const mission = compileDefaultMission(rows);
  const receipt = await counterfactualApi.compareCounterfactual({
    ...rows,
    mission,
    intervention: { id: 'world-2019-test', kind: 'world_snapshot', snapshotDate: '2019-07-13' },
  });
  assert.equal(receipt.baseline.status, 'completed');
  assert.equal(receipt.challenger.status, 'refused');
  assert.equal(receipt.challenger.terminalReason, 'snapshot_not_loaded');
  assert.ok(receipt.baseline.journeyReceiptSha256);
  assert.equal(receipt.diff.actualDurationDeltaSeconds, null);
});

test('local settlement ledger, receipt import, and curriculum progress verify hashes before reuse', async () => {
  const rows = assets();
  const controller = makeController(rows);
  await controller.run();
  const journey = await controller.journeyReceipt();
  assert.equal((await appApi.validateImportedJourneyReceipt(journey, receipts)).pass, true);
  const tamperedJourney = structuredClone(journey);
  tamperedJourney.trace[0].payload.tick += 1;
  await assert.rejects(() => appApi.validateImportedJourneyReceipt(tamperedJourney, receipts), /failed verification/);

  const rowsByKey = new Map();
  const storage = {
    getItem: (key) => rowsByKey.get(key) || null,
    setItem: (key, value) => rowsByKey.set(key, value),
    removeItem: (key) => rowsByKey.delete(key),
  };
  const ledger = journeyLedgerApi.createJourneyLedger({ storage, now: () => '2026-07-13T12:00:00.000Z' });
  await ledger.append(journey);
  const summary = await ledger.summary();
  assert.equal(summary.trialCount, 1);
  assert.equal(summary.verifiedCount, 1);
  assert.equal(summary.privacy, 'browser_local_only');
  const curriculum = {
    schema: 'simulatte.autonomyCurriculum.v1', id: 'test-curriculum', claimBoundary: 'test only',
    missions: [{ id: 'synthetic', sourceText: journey.mission.sourceText }],
  };
  assert.equal((await ledger.curriculumProgress(curriculum, journey.identities.worldContentVersion)).completedCount, 1);
  const stored = JSON.parse(rowsByKey.get('simulatte.journeyLedger.v1'));
  stored.entries[0].payload.actualDistanceM += 1;
  rowsByKey.set('simulatte.journeyLedger.v1', JSON.stringify(stored));
  const verification = await ledger.verify();
  assert.equal(verification.pass, false);
  assert.equal(verification.reason, 'ledger_hash_mismatch');
  await assert.rejects(() => ledger.read(), /ledger_integrity_failed/);
});

test('neural place matching filters candidates by the active embodiment graph and remains diagnostic', () => {
  const rows = governedAssets();
  const decoded = {
    embeddingDim: 2,
    documents: [
      { placeId: 'bike-place', nodeId: 'bike-node', label: 'Shared Place' },
      { placeId: 'street-place', nodeId: 'street-node', label: 'Shared Place' },
    ],
    vectors: [Float32Array.from([1, 0]), Float32Array.from([0.99, 0.1])],
  };
  const ranking = neuralPlaceCore.rankVector([1, 0], decoded, 5, ['street-node']);
  assert.deepEqual(ranking.map((row) => row.nodeId), ['street-node']);
  assert.equal(rows.modelRuntimeLock.embedding.modelType, 'embedding');
  assert.equal(rows.placeResolutionEvidence.population.promotionEligible, false);
  assert.equal(rows.placeResolutionEvidence.accepted, true);
  assert.ok(rows.placeResolutionEvidence.lanes.challenger.metrics.correct > rows.placeResolutionEvidence.lanes.control.metrics.correct);
  assert.equal(rows.placeResolutionEvidence.lanes.challenger.guardrails.mustRefuseViolations, 0);
  assert.equal(rows.placeResolutionEvidence.lanes.modelCandidate.metrics.correct, rows.placeResolutionEvidence.lanes.challenger.metrics.correct);
  assert.equal(rows.placeResolutionEvidence.modelSelection.status, 'rejected_no_incremental_gain');
  assert.equal(rows.placeResolutionEvidence.modelSelection.incrementalCorrect, 0);
  contracts.validatePolicyArenaEvidence(rows.policyArenaEvidence);
  assert.equal(rows.policyArenaEvidence.diagnosticSelection.status, 'diagnostic_leader_only');
  assert.equal(rows.policyArenaEvidence.promotion.status, 'blocked');
});

test('neural place evaluation binds the vendored Doppler runtime named by its receipt', () => {
  const source = fs.readFileSync(path.join(root, 'tools/autonomy/neural-place-resolver-challenger.mjs'), 'utf8');
  const evidence = readJson('public/data/autonomy/evidence/place-resolution-public-diagnostic-v2.json');
  const lock = readJson('public/data/simulatte-embedder/model-runtime-lock.json');
  const runtimePath = 'public/vendor/doppler/src/index.js';
  assert.match(source, /from '\.\.\/\.\.\/public\/vendor\/doppler\/src\/index\.js'/);
  assert.doesNotMatch(source, /from '\.\.\/\.\.\/\.\.\/doppler\/src\/index\.js'/);
  assert.equal(evidence.identities.modelCandidateAssets.dopplerRuntime.path, runtimePath);
  assert.equal(evidence.identities.modelCandidateAssets.dopplerRuntime.gitSha, lock.doppler.development.gitSha);
  assert.equal(evidence.identities.modelCandidateAssets.dopplerRuntime.sha256, hashFile(path.join(root, runtimePath)));
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
  const requests = [];
  const fetchFiles = async (url, options) => {
    requests.push({ url, options });
    const file = fileForUrl(url);
    return { ok: fs.existsSync(file), status: fs.existsSync(file) ? 200 : 404, text: async () => fs.readFileSync(file, 'utf8') };
  };
  const loaded = await dataLoader.loadAutonomyData('http://localhost/data/autonomy/autonomy-manifest.json', fetchFiles);
  assert.equal(loaded.world.id, 'nyc-core-autonomy-v1');
  assert.deepEqual(loaded.embodiments.map((row) => row.id), ['delivery-bike-v1', 'pedestrian-v1', 'scooter-v1', 'car-v1']);
  assert.equal(loaded.defaultEmbodiment.id, 'delivery-bike-v1');
  assert.equal(loaded.receipt.assets.policy.sha256, loaded.manifest.policy.sha256);
  assert.deepEqual(loaded.regionComposition.packIds, ['manhattan-villages-v1', 'east-river-crossing-v1', 'north-brooklyn-v1']);
  assert.equal(loaded.regionComposition.seamNodeIds.length, 98);
  assert.equal(loaded.regionRegistry.id, loaded.manifest.regionRegistry.id);
  assert.equal(loaded.regionPacks.length, 3);
  assert.ok(requests.length > 8);
  assert.ok(requests.every((row) => row.options?.cache === 'no-cache'));

  const staleManifest = structuredClone(loaded.manifest);
  delete staleManifest.missionExamples;
  let staleManifestWouldHaveBeenServed = false;
  const cacheSensitiveFetch = async (url, options) => {
    const file = fileForUrl(url);
    const isManifest = url.endsWith('/autonomy-manifest.json');
    if (isManifest && options?.cache !== 'no-cache') {
      staleManifestWouldHaveBeenServed = true;
      return { ok: true, status: 200, text: async () => JSON.stringify(staleManifest) };
    }
    return { ok: true, status: 200, text: async () => fs.readFileSync(file, 'utf8') };
  };
  const revalidated = await dataLoader.loadAutonomyData('http://localhost/data/autonomy/autonomy-manifest.json', cacheSensitiveFetch);
  assert.equal(revalidated.manifest.missionExamples.length, loaded.manifest.missionExamples.length);
  assert.equal(staleManifestWouldHaveBeenServed, false);

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
  assert.ok(scripts.indexOf('./runtime/runtime-log.js') < scripts.indexOf('./runtime/data-loader.js'));
  assert.ok(scripts.indexOf('./world/region-pack-merger.js') < scripts.indexOf('./runtime/data-loader.js'));
  scripts.forEach((source) => assert.ok(fs.existsSync(path.resolve(autonomyDir, source)), `${source} should exist`));
  assert.match(html, /id="autonomy-canvas"/);
  assert.match(html, /id="follow-minimap"/);
  assert.match(html, /id="shuffle-button"[^>]*>Shuffle</);
  assert.match(html, /id="start-button"[^>]*>[\s\S]*?Start<\/button>/);
  assert.match(html, /class="blank-link" href="\/blank\/"[^>]*>Blank<\/a>/);
  assert.match(compatibilityHtml, /location\.replace/);
  assert.match(compatibilityHtml, /rel="canonical" href="\/"/);
  assert.match(compilerHtml, /class="prompt-dock-autonomy" href="\/"/);
  assert.doesNotMatch(html, /Every autonomous choice, exposed and settled/);
  assert.doesNotMatch(html, /observe, retrieve, choose, settle/);
  assert.doesNotMatch(html, /Mission compiler/);
  assert.doesNotMatch(html, /Natural language to grounded obligations/);
  assert.doesNotMatch(html, /3 regions \| 2026-07-13/);
  assert.doesNotMatch(html, /phase-0[1-8]/);
  for (const file of autonomySourceDirs.flatMap(jsFiles)) {
    assert.ok(fs.readFileSync(file, 'utf8').split(/\r?\n/).length <= 999, `${path.relative(root, file)} should remain below 1,000 lines`);
  }
});

test('autonomy UI keeps the map primary and moves technical controls behind progressive disclosure', () => {
  const html = fs.readFileSync(path.join(autonomyDir, 'index.html'), 'utf8');
  const blankHtml = fs.readFileSync(path.join(root, 'public/blank/index.html'), 'utf8');
  const css = fs.readFileSync(path.join(autonomyDir, 'styles.css'), 'utf8');
  const design = fs.readFileSync(path.join(autonomyDir, 'design/simulatte.css'), 'utf8');
  assert.match(html, /href="\.\/design\/simulatte\.css"/);
  assert.match(blankHtml, /href="\.\.\/design\/simulatte\.css"/);
  assert.match(html, /class="mission-dock sim-surface"/);
  assert.match(html, /id="decisions-drawer"[^>]*aria-hidden="true"/);
  assert.match(html, /id="runtime-toggle"[^>]*aria-expanded="false"/);
  assert.match(html, /id="runtime-details"[^>]*hidden/);
  assert.match(html, /id="runtime-details"[\s\S]*class="legend"[\s\S]*class="blank-link"/);
  assert.doesNotMatch(html, /id="map-panel-button"|id="map-popover"/);
  assert.match(html, /id="camera-focus-popover"[^>]*hidden/);
  assert.match(html, /id="dock-more-menu"[^>]*hidden/);
  assert.match(html, /id="dock-more-menu"[\s\S]*id="step-button"[\s\S]*id="reset-button"[\s\S]*id="what-if-button"/);
  assert.match(html, /id="advanced-section"[\s\S]*<details class="evidence-section retrieval-evidence">/);
  assert.match(html, /<details class="evidence-section retrieval-evidence">/);
  assert.match(html, /<details class="evidence-section receipt-evidence">/);
  assert.match(html, /class="neural-mode-toggle"[^>]*for="place-resolution-lane"/);
  assert.match(html, /id="place-resolution-lane" type="checkbox" role="switch"/);
  assert.match(html, /id="neural-model-dialog"/);
  assert.doesNotMatch(html, /id="mission-more-menu"/);
  assert.match(blankHtml, /class="neural-mode-toggle"[^>]*for="blank-neural-models"/);
  assert.match(blankHtml, /id="blank-neural-models" type="checkbox" role="switch"/);
  assert.match(blankHtml, /Blank uses Qwen embeddings for open-vocabulary retrieval/);
  assert.doesNotMatch(blankHtml, /data-neural-model="reranker-name"/);
  assert.doesNotMatch(html, /WebGPU world model|Decision engine|Route search|Prediction settlement/);
  assert.match(css, /#autonomy-canvas[\s\S]*width: 100%;[\s\S]*height: 100%/);
  assert.match(css, /@media \(max-width: 820px\)[\s\S]*translateY/);
  assert.match(design, /--sim-spectrum:/);
  assert.match(design, /prefers-reduced-motion/);
});

test('mission input failures become short actionable interface messages', () => {
  assert.equal(appApi.friendlyMissionError({ code: 'destination_not_grounded' }), 'I cannot identify the destination in the loaded regions.');
  assert.equal(appApi.friendlyMissionError({ code: 'termination_not_grounded' }), 'Add a distance, lap count, or duration for this loop.');
  assert.match(appApi.friendlyMissionError({ code: 'from_place_ambiguous' }), /more than one loaded location/);
  assert.doesNotMatch(appApi.friendlyMissionError({ code: 'destination_not_grounded' }), /destination_not_grounded/);
});

test('renderer resolves the camera runtime at use time and rejects incomplete APIs explicitly', () => {
  const complete = Object.fromEntries([
    'createCameraState',
    'updateRouteTarget',
    'advanceCamera',
    'setCameraMode',
    'focusCameraTarget',
    'panCamera',
    'orbitCamera',
    'zoomCamera',
  ].map((name) => [name, () => name]));
  assert.equal(rendererApi.resolveCameraController(complete), complete);
  assert.throws(
    () => rendererApi.resolveCameraController({ createCameraState() {} }),
    (error) => error.code === 'camera_runtime_unavailable' && /updateRouteTarget/.test(error.message)
  );
});

test('autonomy runtime logs bounded structured events and deployment revalidates governed data', () => {
  let time = 100;
  const rows = [];
  const logger = runtimeLog.createRuntimeLogger({
    clock: () => time,
    sink: { info: (label, row) => rows.push({ label, row }) },
  });
  time = 125.5;
  const event = logger.info('test.boundary', { artifactId: 'manifest-v3' });
  assert.equal(event.schema, 'simulatte.autonomyRuntimeEvent.v1');
  assert.equal(event.sequence, 1);
  assert.equal(event.elapsedMs, 25.5);
  assert.deepEqual(event.details, { artifactId: 'manifest-v3' });
  assert.equal(rows[0].label, '[Simulatte] test.boundary');

  const firebase = readJson('firebase.json');
  const autonomyDataHeaders = firebase.hosting.headers.find((row) => row.source === '/data/autonomy/**');
  assert.deepEqual(autonomyDataHeaders.headers, [{ key: 'Cache-Control', value: 'no-cache' }]);
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
  assert.equal(contract.matchedOperationDetails.runtimeSourcePaths.length, 20);
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
  assert.equal(sourceIdentity.files.length, 20);
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

  const failureContext = () => ({
    document: {
      getElementById(id) {
        return id === 'runtime-status' ? { dataset: { kind: 'error' }, textContent: 'Stopped' } : null;
      },
    },
    performance: { now: () => 0 },
    __simulatteAutonomyRuntimeEvents: [{
      event: 'runtime.failed',
      details: { message: 'governed world hash mismatch' },
    }],
  });
  await assert.rejects(vm.runInNewContext(audit.consentFlowExpression(), failureContext()), /runtime\.failed at consent-ready: governed world hash mismatch/);
  await assert.rejects(vm.runInNewContext(audit.browserJourneyExpression(), failureContext()), /runtime\.failed at runtime-ready: governed world hash mismatch/);
});
