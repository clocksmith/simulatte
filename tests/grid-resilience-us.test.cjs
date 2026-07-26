const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join, resolve } = require('node:path');
const test = require('node:test');

const ROOT = join(__dirname, '..');
const PLUGIN_DIRECTORY = join(ROOT, 'public/shared/plugins/grid-resilience-us');
const model = require(join(PLUGIN_DIRECTORY, 'dispatch-model.js'));
const comparison = require(join(PLUGIN_DIRECTORY, 'comparison-driver.js'));
const plugin = require(join(PLUGIN_DIRECTORY, 'index.js'));
const config = json(join(PLUGIN_DIRECTORY, 'default-config.json'));
const manifest = json(join(PLUGIN_DIRECTORY, 'plugin.json'));
const dataReceipts = manifest.datasets.map((row) => ({
  datasetId: row.id,
  schemaId: row.reference.schemaId,
  sha256: row.reference.sha256,
}));
const datasets = loadDatasets();
const scenario = Object.freeze({
  id: 'heat-demand-peak',
  scenarioId: 'heat-demand-peak',
  disturbanceScenarioId: 'heat-demand-peak',
  seed: 'grid-heat-001',
  dispatchPolicyId: config.dispatchPolicyId,
  reservePolicyId: config.reservePolicyId,
  storagePolicyId: config.storagePolicyId,
  restorationPolicyId: config.restorationPolicyId,
  demandResponseMaximumFraction: config.demandResponseMaximumFraction,
  emissionsPriceUsdPerTon: config.emissionsPriceUsdPerTon,
  sheddingPriorities: config.sheddingPriorities,
  restorationCrewCount: config.restorationCrewCount,
  ensembleSize: 2,
});

test('governed Grid inputs validate and separate observed rows from modeled topology', () => {
  for (const declaration of manifest.datasets) {
    const value = datasetsById()[declaration.id];
    const validate = plugin.datasetValidators[declaration.reference.schemaId];
    assert.equal(typeof validate, 'function');
    assert.equal(validate(value), value);
  }
  assert.equal(datasets.eiaDemand.rows.length, 96);
  assert.ok(datasets.eiaGeneration.rows.length > 700);
  assert.ok(datasets.eiaDemand.rows.every((row) => row.truth.origin === 'observed' && row.rowHash));
  assert.ok(datasets.noaaWeather.observations.every((row) => row.truth.origin === 'observed' && row.rowId));
  assert.match(datasets.topology.claimBoundary, /not physical transmission lines/i);
  assert.ok(datasets.topology.interfaces.every((row) => row.truth.origin === 'modeled'));
});

test('dispatch replays deterministically and independently verifies balance, storage, and interfaces', () => {
  const first = model.runScenario({ datasets, config, scenario });
  const second = model.runScenario({ datasets, config, scenario });
  assert.deepEqual(first, second);
  assert.equal(first.scenarioIdentity, second.scenarioIdentity);
  assert.equal(first.snapshots.length, 25);
  assert.equal(first.settlement.status, 'settled');
  first.snapshots.slice(1).forEach((snapshot) => {
    assert.equal(snapshot.verification.valid, true);
    assert.ok(snapshot.verification.maximumBalanceResidualMw <= 1e-5);
    snapshot.interfaces.forEach((row) => {
      const limit = row.transferMw >= 0 ? row.forwardLimitMw : row.reverseLimitMw;
      assert.ok(Math.abs(row.transferMw) <= limit + 1e-6);
    });
  });
});

test('controls materially alter dispatch, storage, emissions, and restoration outcomes', () => {
  const baseline = model.runScenario({
    datasets,
    config,
    scenario,
    policyOverrides: {
      dispatchPolicyId: 'economic-order',
      reservePolicyId: 'fixed-reserve',
      storagePolicyId: 'immediate-support',
      restorationPolicyId: 'nearest-first',
    },
  });
  const intervention = model.runScenario({
    datasets,
    config,
    scenario,
    policyOverrides: {
      dispatchPolicyId: 'resilience-weighted',
      reservePolicyId: 'adaptive-reserve',
      storagePolicyId: 'reserve-preserving',
      restorationPolicyId: 'dependency-aware',
    },
  });
  assert.equal(baseline.configurationIdentity.seed, intervention.configurationIdentity.seed);
  assert.notDeepEqual(baseline.metrics, intervention.metrics);
  const noResponse = model.runScenario({
    datasets,
    config,
    scenario: { ...scenario, demandResponseMaximumFraction: 0 },
  });
  assert.notEqual(noResponse.metrics.modeledUnservedEnergyMwh, intervention.metrics.modeledUnservedEnergyMwh);
});

test('comparison executes lockstep policy-blind branches and settles compatible metrics', async () => {
  const result = await comparison.runComparison({ datasets, config, scenario });
  assert.equal(result.settlement.status, 'settled');
  assert.equal(result.comparisonExecutionReceipt.state, 'settled');
  assert.equal(result.comparisonExecutionReceipt.synchronizationPolicy, 'lockstep');
  assert.equal(result.comparisonExecutionReceipt.startingIdentity.seed, scenario.seed);
  assert.deepEqual(Object.keys(result.branchMetrics.baseline).sort(), Object.keys(result.branchMetrics.intervention).sort());
  assert.doesNotMatch(JSON.stringify(result.comparisonExecutionReceipt), /futureOutcome|oracleValue|hiddenTruthValue/);
});

test('typed Start accepts controls, Step preserves identity, and replay restores exactly', async () => {
  const harness = createSdkHarness();
  const instance = await plugin.activate({ sdk: harness.sdk, config, profile: null, scenario });
  const values = {
    disturbanceScenarioId: 'interface-loss',
    dispatchPolicyId: 'economic-order',
    reservePolicyId: 'fixed-reserve',
    storagePolicyId: 'immediate-support',
    restorationPolicyId: 'service-impact-first',
    demandResponseMaximumFraction: 0.04,
    emissionsPriceUsdPerTon: 80,
    sheddingPriorities: ['east', 'central', 'texas', 'west'],
    restorationCrewCount: 1,
    ensembleSize: 2,
  };
  const started = await instance.handleAction('scenario.run', {
    scenario: { id: 'interface-loss', scenarioId: 'interface-loss', seed: 'grid-replay-1' },
    values: { ...values, phase: 'start' },
  });
  assert.equal(started.status, 'running');
  assert.equal(started.acceptedParameters.emissionsPriceUsdPerTon, 80);
  const receiptCount = harness.receipts.length;
  const stepped = await instance.handleAction('scenario.run', { values: { ...values, phase: 'step' } });
  assert.equal(stepped.currentStep, 1);
  assert.equal(stepped.scenarioIdentity, started.scenarioIdentity);
  assert.equal(harness.receipts.length, receiptCount);
  const replayed = await instance.handleAction('scenario.run', {
    scenario: { id: 'interface-loss', scenarioId: 'interface-loss', seed: 'grid-replay-1' },
    values: { ...values, phase: 'start' },
  });
  assert.deepEqual(replayed, started);
});

test('v4 contribution exposes all experiment controls, semantic quantities, and evidence rows', async () => {
  const harness = createSdkHarness();
  const instance = await plugin.activate({ sdk: harness.sdk, config, profile: null, scenario });
  const contribution = instance.contributeV4();
  assert.equal(contribution.schema, 'simulatte.pluginContribution.v4');
  assert.deepEqual(contribution.controls.controls.map((row) => row.id).sort(), [
    'demandResponseMaximumFraction',
    'dispatchPolicyId',
    'disturbanceScenarioId',
    'emissionsPriceUsdPerTon',
    'ensembleSize',
    'reservePolicyId',
    'restorationCrewCount',
    'restorationPolicyId',
    'sheddingPriorities',
    'storagePolicyId',
  ].sort());
  assert.ok(contribution.presentation.layers.some((row) => row.quantity?.kind === 'modeled-unserved-load'));
  assert.ok(contribution.presentation.layers.some((row) => row.quantity?.kind === 'interface-utilization'));
  assert.ok(contribution.provenanceRecords.length > manifest.datasets.length);
});

function createSdkHarness() {
  let state = null;
  let reducer = null;
  const receipts = [];
  const byId = datasetsById();
  return {
    receipts,
    sdk: {
      datasets: {
        require: (id) => byId[id],
        receipt: (id) => dataReceipts.find((row) => row.datasetId === id) || null,
      },
      events: {
        propose(event) {
          state = reducer(state, event);
          return event;
        },
      },
      receipts: { append(receipt) { receipts.push(receipt); return receipt; } },
      state: {
        read: () => state,
        register(nextReducer, initialState) { reducer = nextReducer; state = initialState; },
      },
    },
  };
}

function loadDatasets() {
  const rows = datasetsById();
  return Object.freeze({
    eiaDemand: rows['grid-eia-balancing-authority-hourly-v1'],
    eiaGeneration: rows['grid-eia-generation-mix-hourly-v1'],
    noaaStations: rows['grid-noaa-weather-stations-v1'],
    noaaWeather: rows['grid-noaa-weather-observations-v1'],
    topology: rows['grid-regional-interface-scenarios-v1'],
    resources: rows['grid-resource-archetypes-v1'],
    storage: rows['grid-storage-archetypes-v1'],
    disturbances: rows['grid-disturbance-scenarios-v1'],
    restoration: rows['grid-restoration-resources-v1'],
    governance: rows['grid-model-governance-v1'],
    provenance: rows['grid-provenance-registry-v1'],
    dataReceipts,
  });
}

function datasetsById() {
  return Object.fromEntries(manifest.datasets.map((row) => [
    row.id,
    json(resolve(PLUGIN_DIRECTORY, row.reference.path)),
  ]));
}

function json(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}
