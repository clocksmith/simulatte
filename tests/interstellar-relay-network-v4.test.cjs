const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const plugin = require('../public/shared/plugins/interstellar-relay-network/index.js');
const stellar = require('../public/shared/plugins/interstellar-relay-network/stellar-state.js');
const lightTime = require('../public/shared/plugins/interstellar-relay-network/light-time.js');
const optical = require('../public/shared/plugins/interstellar-relay-network/optical-link-budget.js');
const contracts = require('../public/simulatte/platform/contracts/plugin-contracts.js');
const schedulerApi = require('../public/simulatte/platform/plugin-host/plugin-scheduler.js');
const canonicalReceipts = require('../public/simulatte/runtime/canonical-receipts.js');

const root = path.resolve(__dirname, '..');
const pluginDirectory = path.join(root, 'public/shared/plugins/interstellar-relay-network');
const dataDirectory = path.join(root, 'public/data/interstellar-relay-network');

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

test('every public experiment compiles finite links and a terminal causal state', async () => {
  const profile = readJson(path.join(root, 'public/data/application-profiles/interstellar-relay-network-v1.json'));
  contracts.validateProfile(profile);
  for (const seed of profile.seeds) {
    const host = await activateDefault(seed.id);
    const result = host.instance.capabilities['simulation.interstellar-relay.v4']().result;
    assert.equal(result.scenarioId, seed.scenarioId);
    assert.ok(result.linkBudgets.every((row) => row.achievableDataRateGbps > 0), seed.id);
    assert.ok(result.schedule.trace.length >= 4, seed.id);
    assert.equal(result.schedule.snapshots.at(-1).status, 'settled', seed.id);
    assert.ok(Number.isFinite(result.metrics.oneWayLatencyYears), seed.id);
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
  assert.equal(stars.provenance.publisher, 'European Space Agency Gaia Archive');
  assert.match(stars.provenance.license.url, /^https:/);
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
  const start = await host.instance.handleAction('scenario.run', { values: { phase: 'start' } });
  assert.equal(start.status, 'running');
  assert.equal(start.currentStep, 0);
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
  const eventIndex = new Map(events.map((event, index) => [event.id, index]));
  events.forEach((event, index) => {
    assert.equal(event.schema, 'simulatte.simulationEvent.v4');
    assert.deepEqual(event.beforeState, terminal.result.schedule.snapshots[index]);
    assert.deepEqual(event.afterState, terminal.result.schedule.snapshots[index + 1]);
    event.causalParentIds.forEach((parentId) => assert.ok(eventIndex.get(parentId) < index));
    assert.ok(event.evidenceReferences.length);
    assert.equal(event.truth.origin, 'simulated');
  });
  const settlement = host.instance.settle();
  assert.ok(settlement.obligationResults.every((row) => row.status === 'settled'));
  assert.ok(host.receipts.some((row) => row.schema === 'simulatte.plugin.interstellarRunReceipt.v2'));
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
  const entities = semantic.layers.flatMap((layer) => layer.entities);
  entities.forEach((entity) => {
    assert.ok(Object.keys(entity.quantities).length);
    assert.ok(entity.evidenceReferences.length);
    assert.ok(entity.truth.origin);
    assert.equal(entity.tone, undefined);
    assert.equal(entity.width, undefined);
    assert.equal(entity.radius, undefined);
  });
  const compatibility = host.instance.present();
  contracts.validatePresentationContribution('interstellar-relay-network', compatibility);
  assert.ok(compatibility.paths.every((row) => row.width === 1));
  const intents = host.instance.viewIntents();
  assert.equal(intents[0].mode, 'overview');
  assert.equal(intents[0].allowsUserOverride, true);
  const views = host.instance.view();
  views.forEach((view) => contracts.validateUiContribution('interstellar-relay-network', view));
  assert.equal(views[0].fields.length, 5);
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
    ['bottleneckDataRateGbps', 'latencyYears', 'packetSuccessProbability', 'transmissionEnergyJ'],
  );
  assert.ok(host.receipts.some((row) => row.schema === 'simulatte.plugin.interstellarCounterfactualReceipt.v2'));
  host.receipts.forEach((receipt) => {
    assert.ok(host.manifest.receiptSchemas.includes(receipt.schema), `undeclared emitted receipt ${receipt.schema}`);
  });
});

test('plugin manifest locks every browser resource with a matching SHA-384 digest', () => {
  const manifest = readJson(path.join(pluginDirectory, 'plugin.json'));
  const resources = [{ path: manifest.entry.path, integrity: manifest.entry.integrity }, ...manifest.resources];
  resources.forEach((resource) => {
    const actual = `sha384-${crypto.createHash('sha384').update(fs.readFileSync(path.resolve(pluginDirectory, resource.path))).digest('hex')}`;
    assert.equal(actual, resource.integrity, resource.path);
  });
});
