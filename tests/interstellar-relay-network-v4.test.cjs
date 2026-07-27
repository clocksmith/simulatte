const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const plugin = require('../public/shared/plugins/interstellar-relay-network/index.js');
const stellar = require('../public/shared/plugins/interstellar-relay-network/stellar-state.js');
const lightTime = require('../public/shared/plugins/interstellar-relay-network/light-time.js');
const optical = require('../public/shared/plugins/interstellar-relay-network/optical-link-budget.js');
const v4 = require('../public/shared/plugins/interstellar-relay-network/v4-contribution.js');
const contracts = require('../public/simulatte/platform/contracts/plugin-contracts.js');
const schedulerApi = require('../public/simulatte/platform/plugin-host/plugin-scheduler.js');
const canonicalReceipts = require('../public/simulatte/runtime/canonical-receipts.js');

const root = path.resolve(__dirname, '..');
const pluginDirectory = path.join(root, 'public/shared/plugins/interstellar-relay-network');
const dataDirectory = path.join(root, 'public/data/interstellar-relay-network');
const OMISSION_IDS = [
  'infrastructure-not-observed',
];
const LEGACY_MODEL_OMISSION_IDS = [
  'acquisition-not-modeled',
  'continuous-contact-assumed',
  'detector-background-noise-incomplete',
  'infrastructure-not-observed',
  'maintenance-not-modeled',
  'plasma-not-modeled',
  'retries-not-modeled',
];

function readJson(filename) {
  return JSON.parse(fs.readFileSync(filename, 'utf8'));
}

function fixture() {
  const manifest = readJson(path.join(pluginDirectory, 'plugin.json'));
  const values = new Map(manifest.datasets.map((declaration) => [
    declaration.id,
    readJson(path.resolve(pluginDirectory, declaration.reference.path)),
  ]));
  const receipts = [];
  let reducer = null;
  let state = null;
  const sdk = {
    datasets: {
      require(id) {
        if (!values.has(id)) throw new Error(`fixture dataset missing: ${id}`);
        return values.get(id);
      },
      receipt(id) {
        const row = manifest.datasets.find((declaration) => declaration.id === id);
        return row ? { id, sha256: row.reference.sha256 } : null;
      },
    },
    state: {
      register(nextReducer, initialState) {
        reducer = nextReducer;
        state = initialState;
      },
      read() {
        return state;
      },
    },
    events: {
      propose(event) {
        assert.equal(event.pluginId, 'interstellar-relay-network');
        state = reducer(state, event);
        return event;
      },
    },
    receipts: {
      append(receipt) {
        receipts.push(receipt);
        return receipt;
      },
      sha256Hex: canonicalReceipts.sha256Hex,
    },
    scheduler: schedulerApi.createSchedulerPort({}).forPlugin('interstellar-relay-network'),
  };
  return { manifest, sdk, receipts, state: () => state };
}

async function activateDefault(seedId = null) {
  const profile = readJson(path.join(root, 'public/data/application-profiles/interstellar-relay-network-v1.json'));
  const config = readJson(path.join(pluginDirectory, 'default-config.json'));
  const firstSeed = profile.seeds.find((row) => row.id === (seedId || profile.defaultSeedId));
  const host = fixture();
  const instance = await plugin.activate({
    sdk: host.sdk,
    config,
    profile,
    scenario: firstSeed,
  });
  return { ...host, instance, profile, config };
}

test('every starting preset compiles finite links and reaches an honest terminal outcome', async () => {
  const profile = readJson(path.join(root, 'public/data/application-profiles/interstellar-relay-network-v1.json'));
  contracts.validateProfile(profile);
  for (const seed of profile.seeds) {
    const host = await activateDefault(seed.id);
    const result = host.instance.capabilities['simulation.interstellar-relay.v4']().result;
    assert.equal(result.scenarioId, seed.scenarioId);
    assert.ok(result.linkBudgets.every((row) => row.achievableDataRateGbps > 0), seed.id);
    assert.ok(result.schedule.trace.length >= 4, seed.id);
    assert.equal(result.schedule.snapshots.at(-1).status, 'settled', seed.id);
    assert.equal(result.schedule.deliveryStatus, 'delivered', seed.id);
    assert.ok(Number.isFinite(result.metrics.oneWayLatencyYears), seed.id);
    assert.equal(host.instance.contributeV4().schema, 'simulatte.pluginContribution.v4', seed.id);
  }
});

test('governed relay inputs preserve Gaia row identity, hashes, licenses, and independent truth axes', () => {
  const manifest = readJson(path.join(pluginDirectory, 'plugin.json'));
  contracts.validateManifest(manifest);
  for (const declaration of manifest.datasets) {
    const filename = path.resolve(pluginDirectory, declaration.reference.path);
    const actual = crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
    assert.equal(actual, declaration.reference.sha256, declaration.id);
  }
  const stars = readJson(path.join(dataDirectory, 'gaia-dr3-nearby-stars-v2.json'));
  const rawGaia = fs.readFileSync(path.join(dataDirectory, 'gaia-dr3-source-response-v1.csv'));
  assert.equal(stars.provenance.publisher, 'European Space Agency Gaia Archive');
  assert.match(stars.provenance.license.url, /^https:/);
  assert.equal(
    crypto.createHash('sha256').update(rawGaia).digest('hex'),
    stars.provenance.sourceArtifact.sha256,
  );
  const governedManifest = readJson(path.join(dataDirectory, 'governed-dataset-manifest-v2.json'));
  assert.equal(governedManifest.sources[0].sha256, stars.provenance.sourceArtifact.sha256);
  assert.equal(governedManifest.sources[0].retrievalAt, stars.provenance.retrievalAt);
  const observedRows = stars.stars.filter((row) => row.sourceId !== 'gaia-sol');
  assert.equal(observedRows.length, 6);
  observedRows.forEach((row) => {
    assert.match(row.catalogSourceId, /^\d+$/);
    assert.equal(row.sourceRowId, `gaiadr3.gaia_source:${row.catalogSourceId}`);
    assert.equal(row.truth.origin, 'observed');
    assert.equal(row.truth.temporalStatus, 'historical');
    assert.ok(row.truth.uncertainty.kind);
  });
  assert.equal(stars.stars[0].truth.origin, 'scenario');
  for (const filename of [
    'gaia-dr3-nearby-stars-v2.json',
    'relay-hardware-archetypes-v2.json',
    'interstellar-scenario-network-v2.json',
    'interstellar-relay-models-v1.json',
  ]) {
    const dataset = readJson(path.join(dataDirectory, filename));
    assert.match(dataset.contentVersion, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(dataset.provenance.retrievalAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.ok(dataset.provenance.license.id);
  }
});

test('runtime receipts distinguish newly modeled effects from remaining limitations', async () => {
  const host = await activateDefault();
  const result = host.instance.capabilities['simulation.interstellar-relay.v4']().result;
  result.dataReceipts.forEach((receipt) => {
    assert.match(receipt.contentVersion, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(receipt.retrievalAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.ok(receipt.license.id);
    assert.ok(receipt.coverage.kind);
    assert.ok(receipt.sourceRowIds.length);
    assert.ok(receipt.immutableSourceHashes.some((row) => row.kind === 'governed-output'));
  });
  const gaiaReceipt = result.dataReceipts.find((row) => row.datasetId === 'gaia.dr3.nearby-stars.v2');
  assert.ok(gaiaReceipt.immutableSourceHashes.some((row) => (
    row.kind === 'source-artifact'
    && row.sha256 === '354e64413eae69f4a06e10b8cfb096674710d486e510e7f2eee850bb36ef8895'
  )));
  assert.deepEqual(result.omissions.map((row) => row.id).sort(), OMISSION_IDS);
  assert.ok(result.reliabilityScope.conditionalOn.includes('declared-operational-profile'));
  assert.ok(result.operations.modeledEffectIds.includes('acquisition-modeled'));
  assert.ok(result.operations.modeledEffectIds.includes('availability-and-outages-modeled'));
  assert.ok(result.operations.modeledEffectIds.includes('maintenance-modeled'));
  assert.ok(result.operations.modeledEffectIds.includes('retries-modeled'));
  assert.ok(result.operations.modeledEffectIds.includes('dust-and-plasma-attenuation-modeled'));
  const storeForward = result.modelReceipts.find((row) => row.modelId === 'deterministic-store-forward-v2');
  assert.deepEqual(storeForward.omissions.map((row) => row.id).sort(), LEGACY_MODEL_OMISSION_IDS);
  assert.deepEqual(
    [...storeForward.reliabilityScope.conditionalOn, ...storeForward.reliabilityScope.excludes].sort(),
    LEGACY_MODEL_OMISSION_IDS,
  );
  storeForward.omissions.forEach((omission) => {
    assert.ok(LEGACY_MODEL_OMISSION_IDS.includes(omission.id));
    assert.ok(omission.effect);
    assert.ok(omission.affects.length);
  });
});

test('stellar propagation carries source rows, transformations, and missing radial-velocity uncertainty', () => {
  const stars = readJson(path.join(dataDirectory, 'gaia-dr3-nearby-stars-v2.json'));
  const proxima = stellar.convertEquatorialToCartesianPc(stars.stars.find((row) => row.sourceId === 'gaia-proxima'), 2026.5);
  assert.equal(proxima.modelReceipt.modelId, 'linear-space-motion-v2');
  assert.match(proxima.sourceRowIds[0], /^gaiadr3\.gaia_source:/);
  assert.equal(proxima.truth.origin, 'derived');
  assert.equal(proxima.uncertainty.kind, 'interval');
  const wolf = stellar.convertEquatorialToCartesianPc(stars.stars.find((row) => row.sourceId === 'gaia-wolf-359'), 2026.5);
  assert.equal(wolf.hasRadialVelocity, false);
  assert.equal(wolf.uncertainty.kind, 'missing');
  assert.equal(wolf.uncertainty.value.appliedAssumption, 'zero-radial-velocity');
});

test('moving-target light time solves a future intercept instead of freezing the target', () => {
  const source = { positionPc: [0, 0, 0], velocityPcYr: [0, 0, 0] };
  const target = { positionPc: [1, 0, 0], velocityPcYr: [0.001, 0, 0] };
  const frozen = lightTime.computeOneWayLightTime(source.positionPc, target.positionPc);
  const moving = lightTime.computeMovingTargetLightTime(source, target);
  assert.ok(moving.latencyYears > frozen.latencyYears);
  assert.ok(moving.targetPositionAtArrivalPc[0] > moving.targetPositionAtTransmissionPc[0]);
  assert.equal(moving.modelReceipt.modelId, 'finite-light-time-v2');
});

test('moving-target light time back-propagates reference-epoch states to transmission time', () => {
  const source = { epochYear: 2050, positionPc: [0, 0, 0], velocityPcYr: [0, 0, 0] };
  const target = { epochYear: 2050, positionPc: [1, 0, 0], velocityPcYr: [0.01, 0, 0] };
  const moving = lightTime.computeMovingTargetLightTime(source, target, 0, '2040-01-01T00:00:00Z');
  assert.ok(Math.abs(moving.targetPositionAtTransmissionPc[0] - 0.9) < 1e-12);
  assert.equal(moving.modelReceipt.parameters.targetReferenceEpochYear, 2050);
  assert.equal(moving.modelReceipt.parameters.transmissionEpochYear, 2040);
});

test('optical model is inverse-square monotonic and exposes modeled rate uncertainty', () => {
  const hardware = readJson(path.join(dataDirectory, 'relay-hardware-archetypes-v2.json')).archetypes['sol-primary-gateway'];
  const near = optical.computeLinkBudget(1e16, hardware, { packetBits: 8192 });
  const far = optical.computeLinkBudget(2e16, hardware, { packetBits: 8192 });
  assert.ok(near.rxPowerW > far.rxPowerW);
  assert.ok(near.achievableDataRateGbps > far.achievableDataRateGbps);
  assert.equal(near.method, 'diffraction-photon-budget-v2');
  assert.equal(near.truth.origin, 'modeled');
  assert.equal(near.truth.uncertainty.kind, 'interval');
  assert.ok(near.truth.uncertainty.value.achievableDataRateGbps[0] <= near.achievableDataRateGbps);
  assert.ok(near.truth.uncertainty.value.achievableDataRateGbps[1] >= near.achievableDataRateGbps);
});

test('plugin advances one chronological causal event at a time and settles with receipts', async () => {
  const host = await activateDefault();
  const initial = host.instance.capabilities['simulation.interstellar-relay.v4']();
  assert.equal(initial.progressive.status, 'ready');
  assert.equal(initial.progressive.currentEventIndex, -1);
  const terminalIds = Object.keys(readJson(path.join(dataDirectory, 'relay-hardware-archetypes-v2.json')).archetypes);
  const selectedTerminal = terminalIds.find((id) => id !== initial.result.controls.transceiverId) || terminalIds[0];
  const start = await host.instance.handleAction('scenario.run', {
    values: {
      phase: 'start',
      startEpochIso: '2040-01-02T03:04',
      packetBytes: 4096,
      processingDelayHours: 12,
      transceiverId: selectedTerminal,
    },
  });
  assert.equal(start.status, 'running');
  assert.equal(start.currentStep, 0);
  const configured = host.instance.capabilities['simulation.interstellar-relay.v4']().result;
  assert.equal(configured.controls.packetBytes, 4096);
  assert.equal(configured.controls.startEpochIso, '2040-01-02T03:04:00.000Z');
  assert.equal(configured.controls.processingDelayHours, 12);
  assert.equal(configured.controls.transceiverId, selectedTerminal);
  assert.ok(Math.abs(configured.controls.astrometryEpochYear - 2040.003) < 0.002);
  assert.ok(configured.stellarStates.every((row) => (
    Math.abs(row.epochYear - configured.controls.astrometryEpochYear) < 1e-9
  )));
  assert.ok(host.instance.contributeV4().controls.controls.some((row) => row.id === 'transceiverId'));
  let previousStep = 0;
  let progress = start;
  while (progress.status === 'running') {
    progress = await host.instance.handleAction('scenario.run', { values: { phase: 'step' } });
    assert.equal(progress.currentStep, previousStep + 1);
    previousStep = progress.currentStep;
  }
  assert.equal(progress.status, 'settled');
  const terminal = host.instance.capabilities['simulation.interstellar-relay.v4']();
  assert.equal(terminal.progressive.packetLocationId, terminal.result.scenario.targetId);
  assert.equal(terminal.progressive.deliveredHopCount, terminal.result.schedule.hops.length);
  assert.ok(terminal.progressive.evidenceReferences.length);
  assert.ok(terminal.result.metrics.evidenceReferences.some((id) => id.startsWith('gaiadr3.gaia_source:')));
  assert.ok(terminal.result.metrics.evidenceReferences.some((id) => id.startsWith('gaia.dr3.nearby-stars.v2:')));
  const events = terminal.result.schedule.trace;
  assert.ok(events.some((event) => event.kind === 'relay.signal-progressed'));
  const eventIndex = new Map(events.map((event, index) => [event.id, index]));
  events.forEach((event, index) => {
    assert.equal(event.schema, 'simulatte.simulationEvent.v4');
    assert.deepEqual(event.beforeState, terminal.result.schedule.snapshots[index]);
    assert.deepEqual(event.afterState, terminal.result.schedule.snapshots[index + 1]);
    event.causalParentIds.forEach((parentId) => assert.ok(eventIndex.get(parentId) < index));
    assert.ok(event.evidenceReferences.length);
    assert.equal(event.truth.origin, 'simulated');
    assert.deepEqual(event.truth.uncertainty.value.omissionIds.slice().sort(), OMISSION_IDS);
    assert.equal(event.truth.uncertainty.value.continuousContactAssumed, false);
    assert.ok(event.truth.uncertainty.value.modeledEffectIds.includes('retries-modeled'));
  });
  const settlement = host.instance.settle();
  assert.ok(settlement.obligationResults.every((row) => row.status === 'settled'));
  assert.deepEqual(
    settlement.losses.filter((row) => row.omissionId).map((row) => row.omissionId).sort(),
    OMISSION_IDS,
  );
  settlement.obligationResults.forEach((row) => {
    assert.deepEqual(row.evidence.omissionIds.slice().sort(), OMISSION_IDS);
  });
  assert.deepEqual(terminal.result.metrics.omissions.map((row) => row.id).sort(), OMISSION_IDS);
  assert.match(terminal.result.metrics.reliabilityScope.statement, /operational ensemble/i);
  assert.ok(host.receipts.some((row) => row.schema === 'simulatte.plugin.interstellarRunReceipt.v3'));
  const runReceipt = host.receipts.find((row) => row.schema === 'simulatte.plugin.interstellarRunReceipt.v3');
  assert.equal(runReceipt.operations.ensembleSize, terminal.result.operations.ensembleSize);
  assert.equal(runReceipt.operations.samples, undefined);
  assert.equal(runReceipt.representativeOperationalPlan.sampleIndex, terminal.result.operations.representative.sampleIndex);
  assert.ok(Buffer.byteLength(JSON.stringify(runReceipt)) < 50000);
  assert.ok(host.receipts.some((row) => row.schema === 'simulatte.modelReceipt.v1'));
  host.receipts.forEach((receipt) => {
    assert.ok(host.manifest.receiptSchemas.includes(receipt.schema), `undeclared emitted receipt ${receipt.schema}`);
  });
});

test('semantic presentation carries quantities and evidence while v3 compatibility remains valid', async () => {
  const host = await activateDefault();
  const semantic = host.instance.semanticPresentation();
  assert.equal(semantic.schema, 'simulatte.semanticPresentation.v4-draft');
  assert.equal(semantic.renderedEvidenceContract.finalStyleAuthority, 'core');
  assert.equal(semantic.spatialContract.dimensions, 3);
  assert.equal(semantic.spatialContract.scaleSemantics, 'true-distance');
  assert.equal(semantic.spatialContract.depthSemantics, 'signed-icrs-z-parsec-not-render-order');
  const entities = semantic.layers.flatMap((layer) => layer.entities);
  entities.forEach((entity) => {
    assert.ok(Object.keys(entity.quantities).length);
    assert.ok(entity.evidenceReferences.length);
    assert.ok(entity.truth.origin);
    assert.equal(entity.tone, undefined);
    assert.equal(entity.width, undefined);
    assert.equal(entity.radius, undefined);
    if (entity.spatialEvidence.positionPc) {
      assert.equal(entity.spatialEvidence.positionPc.length, 3);
      assert.equal(entity.spatialEvidence.lineOfSightDepthPc, entity.spatialEvidence.positionPc[2]);
      assert.equal(entity.spatialEvidence.radialDistancePc, Math.hypot(...entity.spatialEvidence.positionPc));
    } else {
      assert.ok(entity.spatialEvidence.endpointPositionsPc.every((position) => position.length === 3));
      assert.ok(Number.isFinite(entity.spatialEvidence.euclideanLengthPc));
    }
  });
  const reliabilityEntities = entities.filter((entity) => entity.reliabilityScope);
  reliabilityEntities.forEach((entity) => {
    assert.deepEqual(entity.omissions.map((row) => row.id).sort(), OMISSION_IDS);
    assert.ok(Number.isFinite(entity.quantities.operationalDeliveryProbability));
  });
  const compatibility = host.instance.present();
  contracts.validatePresentationContribution('interstellar-relay-network', compatibility);
  assert.ok(compatibility.paths.some((row) => row.width === 1));
  assert.ok(compatibility.paths.some((row) => row.width === 0.5));
  const intents = host.instance.viewIntents();
  assert.equal(intents[0].mode, 'overview');
  assert.equal(intents[0].allowsUserOverride, true);
  assert.equal(intents[0].spatialContractId, semantic.spatialContract.id);
  assert.equal(intents[0].framing.preserveDepth, true);
  assert.equal(intents[0].framing.preserveTrueDistance, true);
  assert.ok(intents[0].targetEvidenceReferences.length);
  assert.ok(intents[0].targetEvidenceReferences.some((id) => id.startsWith('gaiadr3.gaia_source:')));
  const views = host.instance.view();
  views.forEach((view) => contracts.validateUiContribution('interstellar-relay-network', view));
  assert.ok(views[0].fields.length >= 14);
  assert.doesNotMatch(fs.readFileSync(path.join(pluginDirectory, 'index.js'), 'utf8'), /camera\.focus|document\.|requestAnimationFrame|fetch\(/);
});

test('comparison reuses seed and epoch while reporting latency, rate, energy, and reliability', async () => {
  const host = await activateDefault();
  const result = await host.instance.handleAction('counterfactual.compare');
  assert.equal(result.status, 'settled');
  assert.equal(result.comparison.commonSeed, host.profile.seeds[0].seed);
  assert.equal(result.comparison.baseline.scenarioId, result.comparison.intervention.scenarioId);
  assert.deepEqual(
    Object.keys(result.comparison.differences).sort(),
    [
      'bottleneckDataRateGbps',
      'latencyYears',
      'operationalP90LatencySeconds',
      'packetSuccessProbability',
      'physicalChannelSuccessProbability',
      'transmissionEnergyJ',
    ],
  );
  assert.deepEqual(result.comparison.omissions.map((row) => row.id).sort(), OMISSION_IDS);
  assert.match(result.comparison.reliabilityScope.statement, /operational ensemble/i);
  const definition = host.instance.capabilities['comparison.interstellar-relay.v1']();
  assert.deepEqual(definition.omissionIds.slice().sort(), OMISSION_IDS);
  assert.equal(definition.spatialComparison.dimensions, 3);
  assert.ok(host.receipts.some((row) => row.schema === 'simulatte.plugin.interstellarCounterfactualReceipt.v2'));
  host.receipts.forEach((receipt) => {
    assert.ok(host.manifest.receiptSchemas.includes(receipt.schema), `undeclared emitted receipt ${receipt.schema}`);
  });
});

test('native v4 contribution preserves true 3D evidence, moving packet depth, and omission inspections', async () => {
  const host = await activateDefault();
  await host.instance.handleAction('scenario.run', { values: { phase: 'start' } });
  let state = host.instance.capabilities['simulation.interstellar-relay.v4']();
  while (state.progressive.activeHopIndex === null) {
    await host.instance.handleAction('scenario.run', { values: { phase: 'step' } });
    state = host.instance.capabilities['simulation.interstellar-relay.v4']();
  }
  const activeHop = state.result.schedule.hops[state.progressive.activeHopIndex];
  const midpointProgressive = {
    ...state.progressive,
    elapsedSeconds: (activeHop.transmitOffsetSeconds + activeHop.receiveOffsetSeconds) / 2,
  };
  const contribution = v4.createContribution({ result: state.result, progressive: midpointProgressive });
  assert.equal(contribution.schema, 'simulatte.pluginContribution.v4');
  const spatial = contribution.provenanceRecords.find((row) => row.kind === 'transformation');
  assert.equal(spatial.metadata.dimensions, 3);
  assert.equal(spatial.metadata.distanceSemantics, 'euclidean-3d-parsec');
  assert.equal(spatial.metadata.depthSemantics, 'signed-icrs-z-parsec-not-render-order');
  contribution.presentation.layers.forEach((layer) => {
    assert.ok(layer.geometry.coordinates.every((coordinate) => coordinate.length === 3));
    assert.ok(layer.provenance.evidenceRefs.some((row) => row.transformationId === spatial.id));
  });
  const packetLayer = contribution.presentation.layers.find((row) => row.id === state.result.packet.packetId);
  const from = state.result.stellarStates.find((row) => row.sourceId === activeHop.fromId).positionPc;
  assert.notDeepEqual(packetLayer.geometry.coordinates[0], from);
  assert.equal(contribution.presentation.viewIntents[0].mode, 'follow');
  assert.ok(contribution.presentation.viewIntents[0].targetIds.includes(packetLayer.id));
  const stateMeasures = Object.fromEntries(contribution.state.measures.map((row) => [row.kind, row]));
  assert.equal(stateMeasures['packet-depth'].value, packetLayer.geometry.coordinates[0][2]);
  assert.equal(stateMeasures['packet-distance'].value, Math.hypot(...packetLayer.geometry.coordinates[0]));
  const inspection = contribution.inspections[0];
  const fields = Object.fromEntries(inspection.fields.map((row) => [row.id, row]));
  assert.equal(fields['operational-reliability'], undefined);
  let terminal = await host.instance.handleAction('scenario.run', { values: { phase: 'step' } });
  while (terminal.status === 'running') {
    terminal = await host.instance.handleAction('scenario.run', { values: { phase: 'step' } });
  }
  const settledState = host.instance.capabilities['simulation.interstellar-relay.v4']();
  const settledContribution = v4.createContribution({
    result: settledState.result,
    progressive: settledState.progressive,
  });
  const settledFields = Object.fromEntries(settledContribution.inspections[0].fields.map((row) => [row.id, row]));
  assert.match(settledFields['operational-reliability'].label, /Operational delivery/i);
  assert.match(settledFields['operational-effects'].value, /acquisition-modeled/);
  OMISSION_IDS.forEach((id) => assert.match(fields.omissions.value, new RegExp(id.split('-')[0], 'i')));
  contribution.events.forEach((event) => {
    assert.deepEqual(event.payload.omissionIds.slice().sort(), OMISSION_IDS);
    assert.ok(event.payload.modeledEffectIds.includes('retries-modeled'));
    assert.equal(event.payload.spatialTransformationId, spatial.id);
  });
});

test('users can choose arbitrary endpoints and direct, automatic, or manual routing', async () => {
  const host = await activateDefault();
  await host.instance.handleAction('scenario.run', {
    values: {
      phase: 'start',
      sourceId: 'gaia-barnard',
      targetId: 'gaia-wolf-359',
      routingMode: 'direct',
      requiredRelayIds: ['none'],
      maxHops: 6,
      maxHopDistancePc: 1000,
      packetBytes: 4096,
    },
  });
  let result = host.instance.capabilities['simulation.interstellar-relay.v4']().result;
  assert.deepEqual(result.routeSelection.selectedPath, ['gaia-barnard', 'gaia-wolf-359']);
  assert.equal(result.packet.sourceId, 'gaia-barnard');
  assert.equal(result.packet.destinationId, 'gaia-wolf-359');

  await host.instance.handleAction('scenario.run', {
    values: {
      phase: 'start',
      sourceId: 'gaia-sol',
      targetId: 'gaia-barnard',
      routingMode: 'manual',
      requiredRelayIds: ['gaia-proxima'],
      maxHops: 4,
      maxHopDistancePc: 1000,
      packetBytes: 4096,
    },
  });
  result = host.instance.capabilities['simulation.interstellar-relay.v4']().result;
  assert.deepEqual(result.routeSelection.selectedPath, ['gaia-sol', 'gaia-proxima', 'gaia-barnard']);

  await host.instance.handleAction('scenario.run', {
    values: {
      phase: 'start',
      sourceId: 'gaia-sol',
      targetId: 'gaia-61-cygni-a',
      routingMode: 'automatic',
      requiredRelayIds: ['none'],
      eligibleRelayIds: ['gaia-proxima', 'gaia-barnard', 'gaia-wolf-359'],
      routeObjective: 'balanced',
      maxHops: 4,
      maxHopDistancePc: 1000,
      packetBytes: 4096,
    },
  });
  result = host.instance.capabilities['simulation.interstellar-relay.v4']().result;
  assert.equal(result.routeSelection.sourceId, 'gaia-sol');
  assert.equal(result.routeSelection.targetId, 'gaia-61-cygni-a');
  assert.ok(result.routeSelection.candidateCount > 1);
  assert.ok(result.routeSelection.searchAttempts <= result.routeSelection.searchBound);
  assert.ok(result.routeSelection.candidateCount <= result.routeSelection.pathSearchBound);
  assert.ok(result.routeSelection.pathSearchAttempts <= result.routeSelection.pathSearchBound);
  assert.equal(result.routeSelection.pathSearchTruncated, false);
  const controls = new Map(host.instance.contributeV4().controls.controls.map((row) => [row.id, row]));
  [
    'sourceId',
    'targetId',
    'routingMode',
    'routeObjective',
    'requiredRelayIds',
    'eligibleRelayIds',
    'maxHops',
    'maxHopDistancePc',
  ].forEach((id) => assert.ok(controls.has(id), id));
  assert.equal(controls.get('requiredRelayIds').kind, 'multiselect');
  assert.equal(controls.get('eligibleRelayIds').kind, 'multiselect');
});

test('every visible HYG star is selectable with source-specific uncertainty and receipts', async () => {
  const host = await activateDefault();
  const hyg = readJson(path.join(root, 'public/data/simulatte/cache/space/star-chart.json'));
  const gaia = readJson(path.join(dataDirectory, 'gaia-dr3-nearby-stars-v2.json'));
  let result = host.instance.capabilities['simulation.interstellar-relay.v4']().result;
  assert.equal(result.controlOptions.stars.length, hyg.count - 1 + gaia.stars.length);
  assert.equal(result.controls.eligibleRelayIds.length, gaia.stars.length);
  assert.ok(result.controlOptions.stars.some((row) => row.value === 'hyg:32263' && /Sirius · HYG/.test(row.label)));
  assert.ok(result.controlOptions.stars.some((row) => row.value === 'hyg:90979' && /Vega · HYG/.test(row.label)));

  await host.instance.handleAction('scenario.run', {
    values: {
      phase: 'start',
      sourceId: 'hyg:32263',
      targetId: 'hyg:90979',
      routingMode: 'direct',
      requiredRelayIds: ['none'],
      maxHopDistancePc: 250000,
      channelMode: 'traversable-wormhole',
      wormholeTraversalSeconds: 1,
      wormholeThroatRadiusM: 10,
      packetBytes: 4096,
    },
  });
  result = host.instance.capabilities['simulation.interstellar-relay.v4']().result;
  assert.deepEqual(result.routeSelection.selectedPath, ['hyg:32263', 'hyg:90979']);
  assert.match(result.claimBoundary, /HYG visible-star snapshot/i);
  assert.match(result.claimBoundary, /held static/i);
  const hygStates = result.stellarStates.filter((row) => row.sourceId.startsWith('hyg:'));
  assert.deepEqual(hygStates.map((row) => row.sourceId).sort(), ['hyg:32263', 'hyg:90979']);
  hygStates.forEach((state) => {
    assert.equal(state.uncertainty.kind, 'missing');
    assert.equal(state.uncertainty.value.appliedAssumption, 'static-catalog-position-with-zero-space-motion');
    assert.ok(state.uncertainty.value.fields.includes('covariance'));
  });
  const hygReceipt = result.dataReceipts.find((row) => row.datasetId === 'hyg.visible-stars.v1');
  assert.ok(hygReceipt);
  assert.equal(hygReceipt.sha256, '7ec4d4806499e8d853f32851459409d7cc7e3c2b7bbf7924386c2343c666943b');
  assert.deepEqual([...hygReceipt.sourceRowIds].sort(), ['hyg.v41:32263', 'hyg.v41:90979']);
  assert.equal(hygReceipt.truth.origin, 'derived');
  const contribution = host.instance.contributeV4();
  const hygRows = contribution.provenanceRecords.filter((row) => row.datasetId === 'hyg.visible-stars.v1');
  assert.ok(hygRows.some((row) => row.kind === 'dataset'));
  assert.deepEqual(
    hygRows.filter((row) => row.kind === 'row').map((row) => row.rowId).sort(),
    ['hyg.v41:32263', 'hyg.v41:90979'],
  );
});

test('advanced physics lanes expose distinct causality and constructibility receipts', async () => {
  const common = {
    phase: 'start',
    sourceId: 'gaia-sol',
    targetId: 'gaia-proxima',
    routingMode: 'direct',
    requiredRelayIds: ['none'],
    packetBytes: 4096,
    transceiverId: 'high-power-array',
  };
  const classicalHost = await activateDefault();
  await classicalHost.instance.handleAction('scenario.run', {
    values: { ...common, channelMode: 'classical-optical' },
  });
  const classical = classicalHost.instance.capabilities['simulation.interstellar-relay.v4']().result;

  const quantumHost = await activateDefault();
  await quantumHost.instance.handleAction('scenario.run', {
    values: {
      ...common,
      channelMode: 'quantum-assisted',
      quantumMemoryCoherenceHours: 1e12,
      quantumInitialFidelity: 0.99,
      entanglementPairRateHz: 1e9,
    },
  });
  const quantum = quantumHost.instance.capabilities['simulation.interstellar-relay.v4']().result;
  assert.equal(quantum.channelReceipts[0].latencySeconds, classical.channelReceipts[0].latencySeconds);
  assert.equal(quantum.channelReceipts[0].causalityStatus, 'classical-message-required-no-ftl');
  assert.equal(quantum.channelReceipts[0].constraintReceipt.noSignalingSatisfied, true);
  assert.ok(quantum.channelReceipts[0].effectiveDataRateGbps > classical.channelReceipts[0].effectiveDataRateGbps);
  assert.ok(quantumHost.instance.contributeV4().controls.controls.some(
    (row) => row.id === 'quantumMemoryCoherenceHours',
  ));

  const wormholeHost = await activateDefault();
  await wormholeHost.instance.handleAction('scenario.run', {
    values: {
      ...common,
      channelMode: 'traversable-wormhole',
      wormholeTraversalSeconds: 1,
      wormholeThroatRadiusM: 10,
      speculativeBandwidthGbps: 2,
      speculativeStabilityProbability: 0.8,
    },
  });
  const wormhole = wormholeHost.instance.capabilities['simulation.interstellar-relay.v4']().result;
  const wormholeReceipt = wormhole.channelReceipts[0];
  assert.equal(wormholeReceipt.latencySeconds, 1);
  assert.match(wormholeReceipt.constructibilityStatus, /^unsupported/);
  assert.equal(wormholeReceipt.constraintReceipt.weakEnergyConditionSatisfied, false);
  assert.equal(wormholeReceipt.constraintReceipt.fordRomanQuantumInequalitySatisfied, false);
  assert.equal(wormholeReceipt.truth.origin, 'scenario');
  assert.match(wormhole.claimBoundary, /speculative metric lane/i);
  const wormholeLink = wormholeHost.instance.contributeV4().presentation.layers.find(
    (row) => row.id === 'relay-link:0',
  );
  assert.equal(wormholeLink.provenance.axes.origin, 'scenario');

  const warpHost = await activateDefault();
  await warpHost.instance.handleAction('scenario.run', {
    values: {
      ...common,
      channelMode: 'alcubierre-warp',
      warpEffectiveSpeedC: 10,
      warpBubbleRadiusM: 100,
      speculativeBandwidthGbps: 2,
      speculativeStabilityProbability: 0.8,
    },
  });
  const warp = warpHost.instance.capabilities['simulation.interstellar-relay.v4']().result;
  assert.ok(Math.abs(
    warp.channelReceipts[0].latencySeconds - warp.schedule.hops[0].lightTime.classicalLatencySeconds / 10,
  ) < 1e-6);
  assert.equal(warp.channelReceipts[0].constraintReceipt.originalMetricEnergyConditionSatisfied, false);
  assert.match(warp.channelReceipts[0].constructibilityStatus, /^unsupported/);
});

test('operational profiles deterministically change delays, attenuation, and event traces', async () => {
  const values = {
    phase: 'start',
    sourceId: 'gaia-sol',
    targetId: 'gaia-61-cygni-a',
    routingMode: 'direct',
    requiredRelayIds: ['none'],
    packetBytes: 4096,
    transceiverId: 'high-power-array',
    ensembleSize: 128,
  };
  const nominalHost = await activateDefault();
  await nominalHost.instance.handleAction('scenario.run', {
    values: { ...values, operationsProfileId: 'nominal-autonomous' },
  });
  const nominal = nominalHost.instance.capabilities['simulation.interstellar-relay.v4']().result;
  const repeatedHost = await activateDefault();
  await repeatedHost.instance.handleAction('scenario.run', {
    values: { ...values, operationsProfileId: 'nominal-autonomous' },
  });
  const repeated = repeatedHost.instance.capabilities['simulation.interstellar-relay.v4']().result;
  assert.deepEqual(repeated.operations, nominal.operations);

  const severeHost = await activateDefault();
  await severeHost.instance.handleAction('scenario.run', {
    values: { ...values, operationsProfileId: 'severe-disruption' },
  });
  const severe = severeHost.instance.capabilities['simulation.interstellar-relay.v4']().result;
  assert.ok(severe.operations.latencySeconds.p90 > nominal.operations.latencySeconds.p90);
  assert.ok(severe.metrics.bottleneckDataRateGbps < nominal.metrics.bottleneckDataRateGbps);
  assert.ok(nominal.schedule.trace.some((row) => row.kind === 'relay.acquisition-started'));
  assert.ok(nominal.schedule.trace.some((row) => row.kind === 'relay.queue-wait-started'));
  assert.equal(nominal.metrics.truth.uncertainty.value.continuousContactAssumed, false);
});

test('plugin manifest locks every browser resource with a matching SHA-384 digest', () => {
  const manifest = readJson(path.join(pluginDirectory, 'plugin.json'));
  const resources = [{ path: manifest.entry.path, integrity: manifest.entry.integrity }, ...manifest.resources];
  resources.forEach((resource) => {
    const actual = `sha384-${crypto.createHash('sha384').update(fs.readFileSync(path.resolve(pluginDirectory, resource.path))).digest('hex')}`;
    assert.equal(actual, resource.integrity, resource.path);
  });
});
