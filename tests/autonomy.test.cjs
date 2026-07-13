const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');
const publicDir = path.join(root, 'public');
const autonomyDir = path.join(publicDir, 'autonomy');
const dataDir = path.join(publicDir, 'data', 'autonomy');
const contracts = require('../public/autonomy/contracts/contract-validator.js');
const receipts = require('../public/autonomy/runtime/canonical-receipts.js');
const missionApi = require('../public/autonomy/mission/mission-compiler.js');
const worldApi = require('../public/autonomy/world/world-model.js');
const routePlanner = require('../public/autonomy/world/route-planner.js');
const controllerApi = require('../public/autonomy/runtime/autonomy-controller.js');
const dataLoader = require('../public/autonomy/runtime/data-loader.js');
const featureRetrieval = require('../public/autonomy/runtime/feature-retrieval.js');
const occurrenceApi = require('../public/autonomy/runtime/occurrence-engine.js');
const SYNTHETIC_MISSION = 'Deliver the parcel by bike from Canal Depot to East Market. Prefer protected lanes and yield to pedestrians.';

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
  return {
    manifest,
    world: readJson(`public/data/autonomy/${manifest.world.path.replace(/^\.\//, '')}`),
    featureCatalog: readJson('public/data/autonomy/feature-cards-v1.json'),
    embodiment: readJson('public/data/autonomy/embodiments/delivery-bike-v1.json'),
    policy: readJson('public/data/autonomy/policies/bet-selector-v1.json'),
    occurrenceCatalog: readJson(`public/data/autonomy/${manifest.occurrenceCatalog.path.replace(/^\.\//, '')}`),
    rerankerEvidence: readJson(`public/data/autonomy/${manifest.rerankerEvidence.path.replace(/^\.\//, '')}`),
  };
}

function compileDefaultMission(rows = assets()) {
  return missionApi.compileMission(rows.manifest.defaultMissionText, rows.world, rows.embodiment);
}

function makeController(rows = assets(), mission = compileDefaultMission(rows), overrides = {}) {
  return controllerApi.createAutonomyController({
    world: rows.world,
    featureCatalog: rows.featureCatalog,
    occurrenceCatalog: rows.occurrenceCatalog,
    embodiment: rows.embodiment,
    policy: rows.policy,
    mission,
    ...overrides,
  });
}

function tickPayloads(receipt) {
  return receipt.trace.map((entry) => entry.payload).filter((row) => row.schema === 'simulatte.autonomyTickReceipt.v1');
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
  contracts.validateFeatureCatalog(rows.featureCatalog);
  contracts.validateWorld(rows.world, rows.featureCatalog);
  contracts.validateEmbodiment(rows.embodiment);
  contracts.validatePolicy(rows.policy);
  contracts.validateOccurrenceCatalog(rows.occurrenceCatalog, rows.world);
  contracts.validateRerankerEvidence(rows.rerankerEvidence, rows.featureCatalog);
  for (const key of ['world', 'embodiment', 'policy', 'featureCatalog', 'occurrenceCatalog', 'rerankerEvidence']) {
    const reference = rows.manifest[key];
    const file = path.resolve(dataDir, reference.path);
    assert.equal(hashFile(file), reference.sha256, `${key} raw bytes should match the manifest`);
    assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).id, reference.id);
  }
  assert.equal(rows.world.provenance.sourceKind, 'compiled_open_data_snapshot');
  assert.match(rows.world.provenance.claimBoundary, /frozen sources/i);
  assert.equal(rows.world.renderGeometry.schema, 'simulatte.autonomyRenderGeometry.v1');
  assert.ok(rows.world.renderGeometry.buildings.length > 1500);
  assert.ok(rows.world.renderGeometry.streets.length > 2000);
  assert.match(rows.world.provenance.sources.bike.rawSha256, /^[a-f0-9]{64}$/);
  assert.equal(rows.world.scenario.liveConditionsUsed, false);
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
  assert.equal(loaded.world.id, 'villages-williamsburg-delivery-bike-v1');
  assert.equal(loaded.receipt.assets.policy.sha256, loaded.manifest.policy.sha256);

  const tampered = async (url) => {
    const file = fileForUrl(url);
    const text = fs.readFileSync(file, 'utf8');
    return { ok: true, status: 200, text: async () => url.includes('bet-selector-v1.json') ? `${text}\n` : text };
  };
  await assert.rejects(
    () => dataLoader.loadAutonomyData('http://localhost/data/autonomy/autonomy-manifest.json', tampered),
    (error) => error.code === 'asset_hash_mismatch'
  );
});

test('autonomy browser surface loads every declared module and stays independent of compiler phases', () => {
  const html = fs.readFileSync(path.join(autonomyDir, 'index.html'), 'utf8');
  const mainHtml = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
  const scripts = Array.from(html.matchAll(/<script defer src="([^"]+)"><\/script>/g)).map((match) => match[1]);
  assert.ok(scripts.length >= 15);
  scripts.forEach((source) => assert.ok(fs.existsSync(path.resolve(autonomyDir, source)), `${source} should exist`));
  assert.match(html, /id="autonomy-canvas"/);
  assert.match(html, /Start mission/);
  assert.match(mainHtml, /class="prompt-dock-autonomy" href="\.\/autonomy\/"/);
  assert.doesNotMatch(html, /phase-0[1-8]/);
  for (const file of jsFiles(autonomyDir)) {
    assert.ok(fs.readFileSync(file, 'utf8').split(/\r?\n/).length <= 999, `${path.relative(root, file)} should remain below 1,000 lines`);
  }
});

test('autonomy schemas are restrictive and SAME-R declares one intervention', async () => {
  for (const name of ['mission', 'observation', 'occurrence-receipt', 'action-bet', 'settlement', 'journey-receipt']) {
    const schema = readJson(`public/autonomy/contracts/${name}.schema.json`);
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
  assert.equal(contract.matchedOperationDetails.runtimeSourcePaths.length, 16);
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
  assert.equal(sourceIdentity.files.length, 16);
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
  assert.equal(audit.parseUrl('https://simulatte.world/autonomy/'), 'https://simulatte.world/autonomy/');
  assert.throws(() => audit.parseViewport('wide'), /expected WIDTHxHEIGHT/);
  assert.throws(() => audit.parseViewport('319x844'), /at least 320x480/);
  assert.throws(() => audit.parseUrl('file:///tmp/autonomy'), /expected HTTP or HTTPS/);
});
