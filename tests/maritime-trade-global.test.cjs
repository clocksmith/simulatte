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
  'maritime.calibration.artifacts.v1': 'calibration-artifacts-v1.json',
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
    assert.ok(result.route.renderCoordinates.length > result.route.waypoints.length);
    assert.ok(result.route.legs.every((leg) => leg.coordinates.length >= 2));
    assert.match(result.claimBoundary, /not AIS/);
  });
});

test('governed corridor display geometry follows declared ocean guides and handles the date line', () => {
  const pacific = simulate('transpacific-eastbound').route;
  assert.ok(pacific.renderCoordinates.some((point) => point[0] >= 179));
  assert.ok(pacific.renderCoordinates.some((point) => point[0] <= -179));
  assert.ok(pacific.renderCoordinates.length >= 8);
  const suez = simulate('asia-europe-mainline').route;
  assert.ok(suez.renderCoordinates.some((point) => point[0] >= 32 && point[0] <= 33 && point[1] >= 29));
  assert.ok(suez.renderCoordinates.length >= 12);
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
  const sailingPositions = result.eventTrace
    .filter((row) => row.kind === 'maritime.voyage-progressed')
    .map((row) => row.after.position.join(','));
  assert.ok(sailingPositions.length >= result.route.legs.length * 3);
  assert.ok(new Set(sailingPositions).size > result.route.legs.length);
});

test('cargo capacity is enforced by the engine and advertised by the active vessel control', () => {
  const selected = simulate('asia-europe-mainline');
  assert.equal(selected.controls.find((row) => row.id === 'cargoTeu').maximum, selected.vessel.teu);
  assert.throws(() => engine.runScenario({
    datasets: datasets(),
    scenario: {
      scenarioId: 'asia-europe-mainline',
      seed: 'over-capacity',
      vesselClassId: 'feeder-2k',
      cargoTeu: 2100,
    },
    config,
    random: randomApi.createRandomPort({ rootSeed: 'maritime-capacity', scenarioId: 'capacity' })
      .forPlugin('maritime-trade-global'),
    scheduler: schedulerApi.createSchedulerPort({}).forPlugin('maritime-trade-global'),
    routeObjective: profile.routeObjective,
  }), /maritime_cargo_exceeds_vessel_capacity/);
});

test('route selection exposes dimensioned transit, fuel, and emissions costs', () => {
  const route = simulate('asia-europe-mainline').route;
  assert.ok(route.objectiveValues.totalTransitDays > 0);
  assert.ok(route.objectiveValues.fuelTons > 0);
  assert.ok(route.objectiveValues.co2Tons > route.objectiveValues.fuelTons);
  assert.ok(route.legs.every((row) => row.routeSelectionFuelTons > 0 && row.effectiveSpeedKnots > 0));
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
  assert.equal(queue.uncertaintyClass, 'stochastic_simulation');
  assert.equal(queue.calibration.status, 'not_empirically_calibrated');
  assert.equal(queue.selectedReplicate.parameters.discipline, 'first_come_first_served');
});

test('emissions parameter sensitivity is separate from queue stochastic uncertainty', () => {
  const result = simulate('asia-europe-mainline');
  const sensitivity = result.emissions.parameterSensitivity;
  assert.equal(result.queueEnsemble.truth.uncertainty.kind, 'distribution');
  assert.equal(result.queueEnsemble.uncertaintyClass, 'stochastic_simulation');
  assert.equal(result.emissions.truth.uncertainty.kind, 'missing');
  assert.equal(sensitivity.kind, 'parameter_sensitivity');
  assert.equal(sensitivity.probability, null);
  assert.equal(sensitivity.confidenceLevel, null);
  assert.equal(sensitivity.samplingDistribution, null);
  assert.ok(sensitivity.minimumCo2Tons < sensitivity.baselineCo2Tons);
  assert.ok(sensitivity.baselineCo2Tons < sensitivity.maximumCo2Tons);
  const queueModel = result.modelReceipts.find((row) => row.id === 'model:fcfs-multi-server-queue-v2');
  const emissionsModel = result.modelReceipts.find((row) => row.id === 'model:maritime-emissions-v2');
  assert.equal(queueModel.uncertaintyClass, 'stochastic_simulation');
  assert.equal(queueModel.calibration.status, 'not_empirically_calibrated');
  assert.equal(emissionsModel.uncertaintyClass, 'not_probabilistically_calibrated');
  assert.equal(emissionsModel.parameterSensitivity.id, sensitivity.id);
  const semantic = presentation.createSemanticPresentation(datasets().ports, result, result.snapshots.at(-1));
  const queueLayer = semantic.layers.find((row) => row.semanticType === 'queue_distribution');
  const sensitivityLayer = semantic.layers.find((row) => row.semanticType === 'parameter_sensitivity');
  assert.equal(queueLayer.objects[0].truth.uncertainty.kind, 'distribution');
  assert.equal(sensitivityLayer.objects[0].truth.uncertainty.kind, 'missing');
  assert.equal(sensitivityLayer.objects[0].quantities.probability, null);
});

test('plugin supports progressive start/step and current-core terminal compatibility', async () => {
  const progressiveHost = hostFor('asia-europe-mainline');
  const progressive = await plugin.activate({
    sdk: progressiveHost.sdk,
    config,
    profile,
    scenario: { scenarioId: 'asia-europe-mainline', seed: 'progressive-seed' },
  });
  const started = progressive.handleAction('scenario.run', {
    values: {
      phase: 'start',
      vesselClassId: 'feeder-2k',
      speedPolicy: 'slow',
      cargoTeu: 900,
      ensembleReplicates: 8,
    },
  });
  assert.equal(started.status, 'running');
  const configured = progressive.capabilities['simulation.maritime-trade.v1']({}).result;
  assert.deepEqual(configured.parameters, {
    ...configured.parameters,
    vesselClassId: 'feeder-2k',
    speedPolicy: 'slow',
    cargoTeu: 900,
    ensembleReplicates: 8,
  });
  assert.equal(configured.metrics.cargoTeu.value, 900);
  const controls = progressive.contributeV4().controls.controls;
  assert.ok(controls.some((row) => row.id === 'vesselClassId' && row.value === 'feeder-2k'));
  assert.ok(controls.some((row) => row.id === 'speedPolicy' && row.value === 'slow'));
  let step = started;
  while (step.status === 'running') step = progressive.handleAction('scenario.run', { values: { phase: 'step' } });
  assert.equal(step.status, 'settled');
  assert.ok(progressive.settle().obligationResults.every((row) => row.status === 'settled'));
  const settledContribution = progressive.contributeV4();
  const queueField = settledContribution.presentation.layers.find((row) => row.id.startsWith('queue-pressure:'));
  assert.equal(queueField.kind, 'field');
  assert.equal(queueField.quantity.kind, 'queue-wait');
  assert.equal(queueField.geometry.coordinates.length, 24);
  const queueReceipt = progressiveHost.receipts.find((row) => row.schema === 'simulatte.plugin.maritimeQueueReceipt.v2');
  const sensitivityReceipt = progressiveHost.receipts.find((row) => row.schema === 'simulatte.plugin.maritimeEmissionsSensitivityReceipt.v1');
  assert.equal(queueReceipt.truth.uncertainty.kind, 'distribution');
  assert.equal(queueReceipt.uncertaintyClass, 'stochastic_simulation');
  assert.equal(sensitivityReceipt.kind, 'parameter_sensitivity');
  assert.equal(sensitivityReceipt.probability, null);
  assert.equal(sensitivityReceipt.truth.uncertainty.kind, 'missing');
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

test('plugin reuses an exact prepared scenario and recomputes changed execution controls', async () => {
  let scenarioRunCount = 0;
  const host = hostFor('asia-europe-mainline', {
    onSchedulerCreate: () => { scenarioRunCount += 1; },
  });
  const instance = await plugin.activate({
    sdk: host.sdk,
    config,
    profile,
    scenario: { scenarioId: 'asia-europe-mainline', seed: 'reuse-seed' },
  });
  assert.equal(scenarioRunCount, 1);

  instance.setScenario({ scenarioId: 'asia-europe-mainline', seed: 'reuse-seed' });
  instance.handleAction('scenario.run', { values: { phase: 'start' } });
  assert.equal(scenarioRunCount, 1);

  instance.handleAction('scenario.run', {
    values: { phase: 'start', cargoTeu: config.cargoTeu + 100 },
  });
  assert.equal(scenarioRunCount, 2);
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
  assert.equal(capability.comparison.queueStochastic.kind, 'distribution');
  assert.equal(capability.comparison.emissionsParameterSensitivity.kind, 'parameter_sensitivity');
  assert.equal(capability.comparison.emissionsParameterSensitivity.probability, null);
});

test('calibration and source metadata preserve exact claim boundaries', () => {
  const calibration = data('maritime.calibration.artifacts.v1');
  const provenance = data('maritime.provenance.registry.v1');
  assert.equal(calibration.queueCalibration.status, 'not_empirically_calibrated');
  assert.deepEqual(calibration.queueCalibration.calibrationEvidence, []);
  assert.equal(calibration.queueCalibration.inputRowIdentity, 'row.portId');
  assert.equal(calibration.emissionsSensitivity.interpretation.kind, 'parameter_sensitivity');
  assert.equal(calibration.emissionsSensitivity.interpretation.probability, null);
  assert.equal(calibration.emissionsSensitivity.interpretation.confidenceLevel, null);
  provenance.sources.forEach((source) => {
    assert.match(source.retrievedAt, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(source.sourceIdentitySha256, /^[a-f0-9]{64}$/);
    assert.ok(source.sourceRowIdentity);
    assert.ok(source.licenseStatus);
    assert.ok(Object.hasOwn(source, 'sourceContentSha256'));
  });
  const calibrationRecord = provenance.datasets.find((row) => row.id === calibration.id);
  assert.equal(calibrationRecord.rowIdentity, 'queueCalibration.id and emissionsSensitivity.id');
  assert.equal(calibrationRecord.sha256, manifest.datasets.find((row) => row.id === calibration.id).reference.sha256);
  provenance.datasets.forEach((record) => {
    assert.equal(record.sha256, sha256(path.join(DATA_DIRECTORY, record.path)), record.id);
  });
});

test('plugin manifest and maritime data manifest identity-lock their actual files', () => {
  contracts.validateManifest(manifest);
  const obsoleteCompatibilityResources = new Set([
    './emissions.js',
    './ports.js',
    './routing.js',
    './vessels.js',
  ]);
  assert.equal(
    manifest.resources.some((row) => obsoleteCompatibilityResources.has(row.path)),
    false
  );
  obsoleteCompatibilityResources.forEach((resourcePath) => {
    assert.equal(fs.existsSync(path.join(PLUGIN_DIRECTORY, resourcePath)), false, resourcePath);
  });
  const activeSource = [
    fs.readFileSync(path.join(PLUGIN_DIRECTORY, manifest.entry.path), 'utf8'),
    ...manifest.resources
      .filter((row) => row.path.endsWith('.js'))
      .map((row) => fs.readFileSync(path.join(PLUGIN_DIRECTORY, row.path), 'utf8')),
  ].join('\n');
  assert.doesNotMatch(
    activeSource,
    /MaritimeTrade(?:Emissions|Ports|Routing|Vessels)|require\(['"]\.\/(?:emissions|ports|routing|vessels)\.js['"]\)/
  );
  assert.equal(manifest.entry.integrity, sri384(path.join(PLUGIN_DIRECTORY, manifest.entry.path)));
  manifest.resources.forEach((row) => {
    assert.equal(row.integrity, sri384(path.join(PLUGIN_DIRECTORY, row.path)), row.path);
  });
  const dataManifest = loadJson(path.join(DATA_DIRECTORY, 'dataset-manifest.json'));
  const generatedById = new Map(dataManifest.datasets.map((row) => [row.datasetId, row]));
  manifest.datasets.forEach((declaration) => {
    const filePath = path.resolve(PLUGIN_DIRECTORY, declaration.reference.path);
    const dataset = loadJson(filePath);
    assert.equal(dataset.id, declaration.id, `${declaration.id} canonical identity`);
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
    calibration: data('maritime.calibration.artifacts.v1'),
    scenarioCatalog: data('maritime.voyage.scenarios.v1'),
    provenance: data('maritime.provenance.registry.v1'),
    dataReceipts: manifest.datasets.map((row) => ({
      datasetId: row.id,
      schemaId: row.reference.schemaId,
      sha256: row.reference.sha256,
    })),
  };
}

function hostFor(scenarioId, { onSchedulerCreate = null } = {}) {
  let state = null;
  let reducer = null;
  const receipts = [];
  const random = randomApi.createRandomPort({ rootSeed: 'maritime-plugin-test', scenarioId })
    .forPlugin('maritime-trade-global');
  const schedulerPort = schedulerApi.createSchedulerPort({}).forPlugin('maritime-trade-global');
  const scheduler = {
    create(options) {
      onSchedulerCreate?.(options);
      return schedulerPort.create(options);
    },
  };
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
