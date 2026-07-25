const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const engine = require('../public/shared/plugins/maritime-trade-global/maritime-engine.js');
const plugin = require('../public/shared/plugins/maritime-trade-global/index.js');
const presentation = require('../public/shared/plugins/maritime-trade-global/presentation.js');
const contracts = require('../public/simulatte/platform/contracts/plugin-contracts.js');
const randomApi = require('../public/simulatte/platform/plugin-host/plugin-random.js');
const schedulerApi = require('../public/simulatte/platform/plugin-host/plugin-scheduler.js');

const ROOT = path.resolve(__dirname, '..');
const PLUGIN_DIRECTORY = path.join(ROOT, 'public/shared/plugins/maritime-trade-global');
const DATA_DIRECTORY = path.join(ROOT, 'public/data/maritime-trade-global');
const manifest = loadJson(path.join(PLUGIN_DIRECTORY, 'plugin.json'));
const config = loadJson(path.join(PLUGIN_DIRECTORY, 'default-config.json'));
const profile = loadJson(path.join(ROOT, 'public/data/application-profiles/maritime-trade-global-v1.json'));

const DATA_FILES = Object.freeze({
  'global-port-registry-wpi-v1': 'port-registry-wpi-v1.json',
  'global-maritime-corridors-v1': 'maritime-corridors-v1.json',
  'global-canal-service-models-v1': 'canal-service-models-v1.json',
  'container-port-performance-v1': 'container-port-performance-v1.json',
  'ibtracs-v04r01-scenario-tracks-v1': 'ibtracs-scenario-tracks-v1.json',
  'maritime-vessel-archetypes-v1': 'vessel-archetypes-v1.json',
  'maritime-emissions-model-v1': 'emissions-model-v1.json',
  'maritime.voyage.scenarios.v1': 'voyage-scenarios-v1.json',
  'maritime.provenance.registry.v1': 'provenance-registry-v1.json',
});

test('five maritime scenarios route through the governed corridor matching their public intent', () => {
  const cases = [
    ['asia-europe-mainline', 'port:cnsha', 'port:nlrtm', ['canal:suez'], 10500],
    ['transpacific-eastbound', 'port:cnsha', 'port:uslax', [], 5700],
    ['suez-closure-cape-reroute', 'port:cnsha', 'port:nlrtm', [], 14700],
    ['north-atlantic-cyclone', 'port:nlrtm', 'port:usnyc', [], 3400],
    ['transpacific-panama-restriction', 'port:uslgb', 'port:usnyc', ['canal:panama'], 5200],
  ];
  cases.forEach(([scenarioId, originPort, destinationPort, canalIds, distanceNm]) => {
    const result = simulate(scenarioId);
    assert.equal(result.route.originPort, originPort);
    assert.equal(result.route.destinationPort, destinationPort);
    assert.deepEqual(result.route.canalIds, canalIds);
    assert.equal(result.route.distanceNm, distanceNm);
    assert.equal(result.route.algorithm, 'bidirectional_governed_corridor_dijkstra_v2');
    assert.match(result.claimBoundary, /not AIS/);
  });
});

test('same seed reproduces queue ensemble, voyage events, snapshots, and terminal metrics', () => {
  const first = simulate('suez-closure-cape-reroute', 'replay-seed');
  const second = simulate('suez-closure-cape-reroute', 'replay-seed');
  assert.deepEqual(first.route, second.route);
  assert.deepEqual(first.queueEnsemble, second.queueEnsemble);
  assert.deepEqual(first.eventTrace, second.eventTrace);
  assert.deepEqual(first.snapshots, second.snapshots);
  assert.deepEqual(first.metrics, second.metrics);
  assert.deepEqual(first.randomReceipts, second.randomReceipts);
});

test('event log is chronological, causal, progressive, and container conserving', () => {
  const result = simulate('asia-europe-mainline');
  const eventIndex = new Map(result.eventTrace.map((row, index) => [row.id, index]));
  assert.equal(result.snapshots.length, result.eventTrace.length + 1);
  assert.equal(result.snapshots[0].status, 'configured');
  assert.equal(result.snapshots.at(-1).status, 'settled');
  assert.equal(result.snapshots.at(-1).progressFraction, 1);
  result.eventTrace.forEach((event, index) => {
    if (index) assert.ok(event.timestamp >= result.eventTrace[index - 1].timestamp);
    event.causalParentIds.forEach((parentId) => assert.ok(eventIndex.get(parentId) < index));
    const { cursor: beforeCursor, ...expectedBefore } = result.snapshots[index];
    assert.equal(beforeCursor, index);
    assert.deepEqual(event.before, expectedBefore);
    assertTruth(event.before.truth);
    assert.ok(event.before.evidenceRefs.length > 0);
    const { cursor, ...expectedAfter } = result.snapshots[index + 1];
    assert.equal(cursor, index + 1);
    assert.deepEqual(event.after, expectedAfter);
    assertTruth(event.after.truth);
    assert.ok(event.after.evidenceRefs.length > 0);
    assertTruth(event.truth);
    assert.ok(event.evidenceRefs.length > 0);
  });
  assert.equal(result.ledger.totalContainers, config.containerCount);
  assert.equal(result.ledger.containers.filter((row) => row.status === 'delivered').length, config.containerCount);
  assert.ok(result.ledger.containers.every((row) => row.lineage.length === 4));
});

test('metrics, models, state, events, and semantic objects carry evidence and independent truth axes', () => {
  const result = simulate('north-atlantic-cyclone');
  Object.values(result.metrics).filter((metric) => metric && typeof metric === 'object').forEach((metric) => {
    assertTruth(metric.truth);
    assert.ok(metric.evidenceRefs.length > 0);
  });
  result.modelReceipts.forEach((receipt) => {
    assert.equal(receipt.schema, 'simulatte.modelReceipt.v4');
    assert.ok(receipt.id.startsWith('model:'));
    assert.equal(receipt.seed, 'north-atlantic-cyclone-seed');
    assert.ok(receipt.validation.results.includes('deterministic replay'));
  });
  const semantic = presentation.createSemanticPresentation(datasets().ports, result, result.snapshots[3]);
  assert.equal(semantic.schema, 'simulatte.semanticPresentation.v4');
  assert.ok(semantic.viewIntents.some((row) => row.mode === 'follow'));
  assert.ok(semantic.layers.some((row) => row.semanticType === 'scenario_weather_track'));
  semantic.layers.flatMap((layer) => layer.objects).forEach((object) => {
    assertTruth(object.truth);
    assert.ok(object.evidenceRefs.length > 0);
  });
  const semanticText = JSON.stringify(semantic.layers);
  assert.doesNotMatch(semanticText, /"tone"|"width"|"color"|"lineWidth"/);
  const compatibility = presentation.adaptSemanticToV3(semantic);
  assert.equal(contracts.validatePresentationContribution('maritime-trade-global', compatibility), compatibility);
});

test('queue ensemble exposes a deterministic empirical service distribution', () => {
  const result = simulate('transpacific-panama-restriction');
  const queue = result.queueEnsemble;
  assert.equal(queue.replicateCount, config.ensembleReplicates);
  assert.ok(queue.p05WaitHours <= queue.p50WaitHours);
  assert.ok(queue.p50WaitHours <= queue.p95WaitHours);
  assert.equal(queue.truth.uncertainty.value.family, 'empirical_seeded_ensemble');
  assert.equal(queue.selectedReplicate.parameters.discipline, 'first_come_first_served');
});

test('plugin supports progressive start/step and current-core terminal compatibility', async () => {
  const progressiveHost = hostFor('asia-europe-mainline');
  const progressive = await plugin.activate({
    sdk: progressiveHost.sdk,
    config,
    profile,
    scenario: { scenarioId: 'asia-europe-mainline', seed: 'progressive-seed' },
  });
  const started = progressive.handleAction('scenario.run', { values: { phase: 'start' } });
  assert.equal(started.status, 'running');
  let step = started;
  while (step.status === 'running') step = progressive.handleAction('scenario.run', { values: { phase: 'step' } });
  assert.equal(step.status, 'settled');
  assert.ok(progressive.settle().obligationResults.every((row) => row.status === 'settled'));
  assert.ok(progressive.capabilities['simulation.maritime-trade.v1']({ kind: 'events' }).length > 4);

  const compatibilityHost = hostFor('north-atlantic-cyclone');
  const compatibility = await plugin.activate({
    sdk: compatibilityHost.sdk,
    config,
    profile,
    scenario: { scenarioId: 'north-atlantic-cyclone', seed: 'compatibility-seed' },
  });
  assert.equal(compatibility.handleAction('scenario.run', { values: {} }).status, 'settled');
  assert.ok(compatibility.settle().obligationResults.every((row) => row.status === 'settled'));
  const semantic = compatibility.capabilities['simulation.maritime-trade.v1']({ kind: 'semantic_presentation' });
  assert.equal(semantic.schema, 'simulatte.semanticPresentation.v4');
  assert.ok(semantic.viewIntents.every((row) => row.mayInterruptManualOverride === false));
});

test('comparison uses a common seed and preserves selected scenario state', async () => {
  const host = hostFor('suez-closure-cape-reroute');
  const instance = await plugin.activate({
    sdk: host.sdk,
    config,
    profile,
    scenario: { scenarioId: 'suez-closure-cape-reroute', seed: 'comparison-seed' },
  });
  const compared = instance.handleAction('counterfactual.compare');
  assert.equal(compared.status, 'settled');
  assert.ok(compared.comparison.transitDaysDelta > 0);
  const capability = instance.capabilities['simulation.maritime-trade.v1']({});
  assert.equal(capability.result.scenarioId, 'suez-closure-cape-reroute');
  assert.equal(capability.comparison.commonSeed, 'comparison-seed');
});

test('plugin manifest and maritime data manifest identity-lock their actual files', () => {
  contracts.validateManifest(manifest);
  assert.equal(manifest.entry.integrity, sri384(path.join(PLUGIN_DIRECTORY, manifest.entry.path)));
  manifest.resources.forEach((row) => {
    assert.equal(row.integrity, sri384(path.join(PLUGIN_DIRECTORY, row.path)), row.path);
  });
  const dataManifest = loadJson(path.join(DATA_DIRECTORY, 'dataset-manifest.json'));
  const generatedById = new Map(dataManifest.datasets.map((row) => [row.datasetId, row]));
  manifest.datasets.forEach((declaration) => {
    const filePath = path.resolve(PLUGIN_DIRECTORY, declaration.reference.path);
    assert.equal(declaration.reference.sha256, sha256(filePath), declaration.id);
    assert.equal(generatedById.get(declaration.id).sha256, declaration.reference.sha256, declaration.id);
  });
});

function simulate(scenarioId, seed = `${scenarioId}-seed`) {
  const random = randomApi.createRandomPort({ rootSeed: 'maritime-focused-test', scenarioId })
    .forPlugin('maritime-trade-global');
  const scheduler = schedulerApi.createSchedulerPort({}).forPlugin('maritime-trade-global');
  return engine.runScenario({
    datasets: datasets(),
    scenario: { scenarioId, seed },
    config,
    random,
    scheduler,
    routeObjective: profile.routeObjective,
  });
}

function datasets() {
  return {
    ports: data('global-port-registry-wpi-v1'),
    corridors: data('global-maritime-corridors-v1'),
    canals: data('global-canal-service-models-v1'),
    portPerformance: data('container-port-performance-v1'),
    cyclones: data('ibtracs-v04r01-scenario-tracks-v1'),
    vessels: data('maritime-vessel-archetypes-v1'),
    emissionsModel: data('maritime-emissions-model-v1'),
    scenarioCatalog: data('maritime.voyage.scenarios.v1'),
    provenance: data('maritime.provenance.registry.v1'),
    dataReceipts: manifest.datasets.map((row) => ({
      datasetId: row.id,
      schemaId: row.reference.schemaId,
      sha256: row.reference.sha256,
    })),
  };
}

function hostFor(scenarioId) {
  let state = null;
  let reducer = null;
  const receipts = [];
  const random = randomApi.createRandomPort({ rootSeed: 'maritime-plugin-test', scenarioId })
    .forPlugin('maritime-trade-global');
  const scheduler = schedulerApi.createSchedulerPort({}).forPlugin('maritime-trade-global');
  return {
    receipts,
    sdk: {
      datasets: {
        require: (datasetId) => data(datasetId),
        receipt: (datasetId) => {
          const declaration = manifest.datasets.find((row) => row.id === datasetId);
          return declaration ? {
            sha256: declaration.reference.sha256,
            schemaId: declaration.reference.schemaId,
          } : null;
        },
      },
      random,
      scheduler,
      state: {
        register(nextReducer, initialState) {
          reducer = nextReducer;
          state = initialState;
        },
        read: () => state,
      },
      events: {
        propose(event) {
          state = reducer(state, event);
          return event;
        },
      },
      receipts: {
        append(receipt) {
          assert.ok(manifest.receiptSchemas.includes(receipt.schema), receipt.schema);
          receipts.push(receipt);
          return receipt;
        },
      },
    },
  };
}

function data(datasetId) {
  return loadJson(path.join(DATA_DIRECTORY, DATA_FILES[datasetId]));
}

function assertTruth(value) {
  assert.ok(['observed', 'derived', 'modeled', 'simulated', 'scenario'].includes(value.origin));
  assert.ok(['historical', 'snapshot', 'forecast', 'live'].includes(value.temporalStatus));
  assert.ok(['interval', 'distribution', 'confidence', 'missing'].includes(value.uncertainty.kind));
  assert.ok(value.uncertainty.value && typeof value.uncertainty.value === 'object');
}

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function sri384(filePath) {
  return `sha384-${crypto.createHash('sha384').update(fs.readFileSync(filePath)).digest('hex')}`;
}
