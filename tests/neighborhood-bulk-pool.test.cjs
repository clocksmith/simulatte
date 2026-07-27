const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { join, resolve } = require('node:path');
const test = require('node:test');

const ROOT = join(__dirname, '..');
const PLUGIN_DIRECTORY = join(ROOT, 'public/shared/plugins/neighborhood-bulk-pool');
const catalogApi = require(join(PLUGIN_DIRECTORY, 'catalog-index.js'));
const solver = require(join(PLUGIN_DIRECTORY, 'pool-solver.js'));
const plugin = require(join(PLUGIN_DIRECTORY, 'index.js'));
const config = json(join(PLUGIN_DIRECTORY, 'default-config.json'));
const manifest = json(join(PLUGIN_DIRECTORY, 'plugin.json'));
const profile = json(join(ROOT, 'public/data/application-profiles/neighborhood-bulk-pool-v1.json'));
const dataReceipts = manifest.datasets.map((row) => ({
  datasetId: row.id,
  schemaId: row.reference.schemaId,
  sha256: row.reference.sha256,
}));
const datasets = loadDatasets();
const scenario = Object.freeze(parametersFor('weekend-baseline'));

test('governed inputs validate while keeping residents, routes, and inventory claims separate', () => {
  for (const declaration of manifest.datasets) {
    const value = datasetsById()[declaration.id];
    const validate = plugin.datasetValidators[declaration.reference.schemaId];
    assert.equal(typeof validate, 'function');
    assert.equal(validate(value), value);
  }
  assert.equal(datasets.warehouses.warehouses.length, 4);
  assert.ok(datasets.warehouses.warehouses.every((row) => row.sourceUrl.includes('costco.com/w/')));
  assert.ok(datasets.demand.participants.every((row) => (
    !Object.hasOwn(row, 'address') && !Object.hasOwn(row, 'coordinates')
  )));
  assert.equal(datasets.catalog.coverage.declaredComplete, false);
  assert.equal(datasets.catalog.coverage.status, 'modeled-warehouse-scale');
  const materialized = catalogApi.materializeCatalogSnapshot(datasets.catalog);
  assert.equal(materialized.items.length, 2048);
  assert.ok(materialized.categories.length >= 14);
  assert.equal(datasets.routes.coverageAreas.length, 3);
  assert.match(datasets.catalog.claimBoundary, /deliberately incomplete/i);
  assert.match(datasets.routes.claimBoundary, /not.*street/i);
});

test('catalog index searches a 25,000-row snapshot without changing the browser contract', () => {
  const template = datasets.catalog.items[0];
  const itemCount = 25000;
  const items = Array.from({ length: itemCount }, (_, index) => ({
    ...template,
    id: `scale-item-${index}`,
    itemNumber: `SCALE-${index}`,
    name: index === itemCount - 1 ? 'Needle pantry share target' : `Scale catalog item ${index}`,
    offers: template.offers.map((row) => ({ ...row })),
  }));
  const snapshot = {
    ...datasets.catalog,
    id: 'catalog-scale-test',
    coverage: {
      ...datasets.catalog.coverage,
      catalogRows: itemCount,
      declaredComplete: true,
      status: 'test-generated-complete',
    },
    items,
  };
  const index = catalogApi.createCatalogIndex(snapshot);
  const results = index.search('needle pantry target', {
    warehouseIds: ['costco-318-brooklyn'],
    categoryIds: ['produce'],
    limit: 5,
  });
  assert.equal(index.itemCount, itemCount);
  assert.equal(index.offerCount, itemCount * 4);
  assert.equal(results.length, 1);
  assert.equal(results[0].itemId, `scale-item-${itemCount - 1}`);
  assert.deepEqual(results[0].offers.map((row) => row.warehouseId), ['costco-318-brooklyn']);
});

test('governed compiler admits authorized full feeds and rejects unbound source bytes', async () => {
  const compiler = await import('../tools/neighborhood-bulk-pool/compile-catalog.mjs');
  const feed = {
    schema: 'simulatte.neighborhoodBulkCatalogFeed.v1',
    snapshotId: 'authorized-four-warehouse-snapshot-test',
    contentVersion: '2026-07-26T12:00:00Z',
    declaredComplete: true,
    categories: datasets.catalog.categories,
    items: datasets.catalog.items.slice(0, 2).map((item) => ({
      ...item,
      offers: item.offers.map((offer) => ({
        ...offer,
        availability: 'observed-in-stock',
        observedAt: '2026-07-26T12:00:00Z',
      })),
    })),
  };
  const sourceBytes = Buffer.from(JSON.stringify(feed));
  const receiptBytes = Buffer.from(JSON.stringify({
    schema: 'simulatte.neighborhoodBulkCatalogSourceReceipt.v1',
    sourceId: 'authorized-feed-test',
    sourceKind: 'authorized-warehouse-feed',
    authority: 'Test fixture authority',
    retrievedAt: '2026-07-26T12:00:00Z',
    sourceSha256: createHash('sha256').update(sourceBytes).digest('hex'),
    authorizationReference: 'test-contract-only',
  }));
  const catalog = compiler.compileCatalog({
    sourceBytes,
    receiptBytes,
    warehouseRegistry: datasets.warehouses,
  });
  const catalogBytes = Buffer.from(compiler.canonicalJson(catalog));
  const compileReceipt = compiler.buildCompileReceipt({
    catalogBytes,
    sourceBytes,
    receiptBytes,
    catalog,
  });
  assert.equal(catalog.coverage.declaredComplete, true);
  assert.equal(catalog.coverage.status, 'authorized-snapshot');
  assert.equal(catalog.items[0].truth.origin, 'observed');
  assert.equal(compileReceipt.catalogRows, 2);
  assert.equal(
    compileReceipt.outputSha256,
    createHash('sha256').update(catalogBytes).digest('hex')
  );
  assert.throws(() => compiler.compileCatalog({
    sourceBytes: Buffer.from(`${sourceBytes} `),
    receiptBytes,
    warehouseRegistry: datasets.warehouses,
  }), /bulk_catalog_source_receipt_invalid/);
});

test('all policies replay deterministically and independently conserve demand, packages, and capacity', () => {
  const first = solver.runScenario({ datasets, config, scenario });
  const second = solver.runScenario({ datasets, config, scenario });
  assert.deepEqual(first, second);
  assert.equal(first.snapshots.at(-1).status, 'settled');
  assert.equal(first.catalogReceipt.declaredComplete, false);
  for (const policyId of solver.POLICY_IDS) {
    const result = first.policyResults[policyId];
    assert.equal(result.conservation.demandConserved, true, policyId);
    assert.equal(result.conservation.packageConserved, true, policyId);
    assert.equal(result.conservation.capacityConserved, true, policyId);
    assert.equal(result.conservation.refrigerationViolations, 0, policyId);
    assert.equal(
      result.conservation.requestedUnits,
      result.conservation.fulfilledUnits + result.conservation.unservedUnits,
      policyId
    );
    assert.equal(
      result.conservation.purchasedUnits,
      result.conservation.fulfilledUnits + result.conservation.wasteUnits,
      policyId
    );
  }
  assert.notDeepEqual(
    first.policyResults.independent.metrics,
    first.policyResults['existing-trip'].metrics
  );
});

test('unknown warehouse availability fails closed unless the explicit control admits it', () => {
  const rejected = solver.runScenario({
    datasets,
    config,
    scenario: parametersFor('inventory-gap', { allowUnknownAvailability: false }),
  });
  const admitted = solver.runScenario({
    datasets,
    config,
    scenario: parametersFor('inventory-gap', { allowUnknownAvailability: true }),
  });
  assert.equal(rejected.metrics.unknownAvailabilityPoolCount, 0);
  assert.ok(rejected.policyResults[rejected.activePolicyId].rejectedRequests.some(
    (row) => row.requestId === 'request-19'
  ));
  assert.ok(admitted.metrics.unknownAvailabilityPoolCount > 0);
  assert.ok(admitted.unsupported.some((row) => row.kind === 'inventory-availability'));
});

test('typed controls rebuild the run, step without recomputation, and replay exactly', async () => {
  const harness = createSdkHarness();
  const instance = await plugin.activate({ sdk: harness.sdk, config, profile, scenario });
  const values = {
    scenarioId: 'weekend-baseline',
    poolingPolicyId: 'existing-trip',
    selectedWarehouseIds: config.selectedWarehouseIds,
    selectedCategoryIds: ['produce'],
    compensationModes: config.compensationModes,
    maximumDetourKm: 5,
    maximumStops: 5,
    minimumSavingsUsd: 0,
    freshnessLimitMinutes: 90,
    allowUnknownAvailability: false,
  };
  const started = await instance.handleAction('scenario.run', {
    scenario: { id: 'weekend-baseline', scenarioId: 'weekend-baseline', seed: 'bulk-replay-1' },
    values: { ...values, phase: 'start' },
  });
  assert.equal(started.status, 'running');
  assert.deepEqual(started.acceptedParameters.selectedCategoryIds, ['produce']);
  const produceRequestedUnits = started.metrics.requestedUnits;
  const receiptCount = harness.receipts.length;
  const stepped = await instance.handleAction('scenario.run', {
    values: { ...values, phase: 'step' },
  });
  assert.equal(stepped.currentStep, 1);
  assert.equal(stepped.scenarioIdentity, started.scenarioIdentity);
  assert.equal(harness.receipts.length, receiptCount);
  const replayed = await instance.handleAction('scenario.run', {
    scenario: { id: 'weekend-baseline', scenarioId: 'weekend-baseline', seed: 'bulk-replay-1' },
    values: { ...values, phase: 'start' },
  });
  assert.deepEqual(replayed, started);
  const expanded = await instance.handleAction('scenario.run', {
    scenario: { id: 'weekend-baseline', scenarioId: 'weekend-baseline', seed: 'bulk-replay-1' },
    values: { ...values, selectedCategoryIds: config.selectedCategoryIds, phase: 'start' },
  });
  assert.ok(expanded.metrics.requestedUnits > produceRequestedUnits);
  assert.throws(() => instance.handleAction('scenario.run', {
    scenario,
    values: { ...values, poolingPolicyId: 'decorative-policy', phase: 'start' },
  }), /bulk_pool_control_invalid/);
});

test('all declared comparisons share exogenous inputs and execute their intended policy pair', async () => {
  const harness = createSdkHarness();
  const instance = await plugin.activate({ sdk: harness.sdk, config, profile, scenario });
  await instance.handleAction('scenario.run', {
    scenario,
    values: { ...scenario, phase: 'start' },
  });
  const expectedPairs = {
    'independent-vs-pool': ['independent', scenario.poolingPolicyId],
    'bulk-only-vs-existing-trip': ['bulk-only', 'existing-trip'],
    'existing-trip-vs-hub': ['existing-trip', 'neighborhood-hub'],
  };
  for (const [comparisonId, [baselinePolicyId, interventionPolicyId]] of Object.entries(expectedPairs)) {
    const comparison = await instance.handleAction('counterfactual.compare', {
      values: { comparisonId },
    });
    assert.equal(comparison.status, 'settled');
    assert.equal(comparison.comparisonId, comparisonId);
    assert.deepEqual(
      Object.keys(comparison.comparisonBranches.baseline).sort(),
      Object.keys(comparison.comparisonBranches.intervention).sort()
    );
    assert.ok(Object.values(comparison.comparisonBranches.baseline).every(Number.isFinite));
    assert.ok(harness.receipts.some((row) => (
      row.schema === 'simulatte.plugin.neighborhoodBulkComparisonReceipt.v1'
      && row.comparisonId === comparisonId
      && row.baselinePolicyId === baselinePolicyId
      && row.interventionPolicyId === interventionPolicyId
    )));
  }
  assert.ok(harness.receipts.some((row) => (
    row.schema === 'simulatte.plugin.neighborhoodBulkComparisonReceipt.v1'
    && row.sharedConfiguration.seed === scenario.seed
  )));
});

test('v4 contribution renders semantic WGS84 evidence and every accepted control', async () => {
  const harness = createSdkHarness();
  const instance = await plugin.activate({ sdk: harness.sdk, config, profile, scenario });
  const contribution = instance.contributeV4();
  assert.equal(contribution.schema, 'simulatte.pluginContribution.v4');
  assert.equal(contribution.presentation.coordinateSystem, 'wgs84');
  assert.deepEqual(contribution.controls.controls.map((row) => row.id).sort(), [
    'allowUnknownAvailability',
    'compensationModes',
    'freshnessLimitMinutes',
    'maximumDetourKm',
    'maximumStops',
    'minimumSavingsUsd',
    'poolingPolicyId',
    'selectedCategoryIds',
    'selectedWarehouseIds',
  ].sort());
  assert.equal(
    contribution.presentation.layers.filter((row) => row.id.startsWith('warehouse:')).length,
    4
  );
  assert.ok(contribution.presentation.layers.some((row) => row.quantity?.kind === 'catalog-offer-rows'));
  assert.ok(contribution.provenanceRecords.length >= manifest.datasets.length + 4);
  assert.ok(contribution.inspections.some((row) => JSON.stringify(row).includes('modeled-warehouse-scale')));
  const models = Object.fromEntries(
    contribution.provenanceRecords.filter((row) => row.kind === 'model').map((row) => [row.id, row])
  );
  const catalogHash = createHash('sha256')
    .update(readFileSync(join(PLUGIN_DIRECTORY, 'catalog-index.js')))
    .digest('hex');
  const solverHash = createHash('sha256')
    .update(readFileSync(join(PLUGIN_DIRECTORY, 'pool-solver.js')))
    .digest('hex');
  assert.equal(models['neighborhood-bulk-pool:model:catalog-index'].contentHash, catalogHash);
  for (const id of ['pool-solver', 'route-screen', 'settlement']) {
    assert.equal(models[`neighborhood-bulk-pool:model:${id}`].contentHash, solverHash);
  }
});

test('trip playback emits one active driver, moving packages, and a bird-eye camera target', async () => {
  const harness = createSdkHarness();
  const instance = await plugin.activate({ sdk: harness.sdk, config, profile, scenario });
  let playback = await instance.handleAction('scenario.run', {
    scenario,
    values: { ...scenario, phase: 'start' },
  });
  let contribution = instance.contributeV4();
  while (playback.status === 'running'
    && !contribution.presentation.layers.some((row) => row.id.startsWith('driver:'))) {
    playback = await instance.handleAction('scenario.run', { values: { phase: 'step' } });
    contribution = instance.contributeV4();
  }
  const drivers = contribution.presentation.layers.filter((row) => row.id.startsWith('driver:'));
  assert.ok(drivers.length > 0);
  assert.ok(drivers.every((row) => (
    row.kind === 'actor'
    && row.quantity.kind === 'actor.car.route-progress'
    && row.geometry.kind === 'polyline'
  )));
  assert.equal(drivers.length, 1);
  const packages = contribution.presentation.layers.filter((row) => row.id.startsWith('package:'));
  assert.ok(packages.length > 0);
  assert.ok(packages.every((row) => (
    row.kind === 'actor'
      && row.quantity.kind === 'actor.package.route-progress'
      && row.geometry.kind === 'polyline'
  )));
  const overview = contribution.presentation.viewIntents.find((row) => row.mode === 'overview');
  assert.ok(overview);
  assert.ok(overview.targetIds.some((id) => id.startsWith('driver:')));
  assert.equal(
    contribution.presentation.layers.some((row) => row.id.startsWith('stop:') && row.kind === 'actor'),
    false
  );
});

function parametersFor(scenarioId, overrides = {}) {
  const row = datasets.demand.scenarios.find((entry) => entry.id === scenarioId);
  return {
    id: scenarioId,
    scenarioId,
    seed: overrides.seed || `bulk-${scenarioId}-001`,
    poolingPolicyId: row.defaults.poolingPolicyId,
    selectedWarehouseIds: [...config.selectedWarehouseIds],
    selectedCategoryIds: [...config.selectedCategoryIds],
    compensationModes: [...config.compensationModes],
    maximumDetourKm: row.defaults.maximumDetourKm,
    maximumStops: row.defaults.maximumStops,
    minimumSavingsUsd: row.defaults.minimumSavingsUsd,
    freshnessLimitMinutes: row.defaults.freshnessLimitMinutes,
    allowUnknownAvailability: config.allowUnknownAvailability,
    ...overrides,
  };
}

function createSdkHarness() {
  let state = null;
  let reducer = null;
  const receipts = [];
  const byId = datasetsById();
  return {
    receipts,
    sdk: {
      datasets: {
        require(id) {
          if (!byId[id]) throw new Error(`missing dataset ${id}`);
          return byId[id];
        },
        receipt(id) {
          return dataReceipts.find((row) => row.datasetId === id) || null;
        },
      },
      events: {
        propose(event) {
          state = reducer(state, event);
          return event;
        },
      },
      receipts: {
        append(receipt) {
          receipts.push(receipt);
          return receipt;
        },
      },
      state: {
        read() {
          return state;
        },
        register(nextReducer, initialState) {
          reducer = nextReducer;
          state = initialState;
        },
      },
    },
  };
}

function loadDatasets() {
  const rows = datasetsById();
  return Object.freeze({
    warehouses: rows['neighborhood-bulk-warehouse-registry-v1'],
    catalog: rows['neighborhood-bulk-catalog-snapshot-bootstrap-v1'],
    routes: rows['neighborhood-bulk-route-corridors-modeled-v1'],
    demand: rows['neighborhood-bulk-demand-and-trips-scenario-v1'],
    governance: rows['neighborhood-bulk-model-governance-v1'],
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
