const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { join, resolve } = require('node:path');
const test = require('node:test');

const ROOT = join(__dirname, '..');
const PLUGIN_DIRECTORY = join(ROOT, 'public/shared/plugins/nyc-real-estate');
const DATA_DIRECTORY = join(ROOT, 'public/data/nyc-real-estate');
const plugin = require(join(PLUGIN_DIRECTORY, 'index.js'));
const model = require(join(PLUGIN_DIRECTORY, 'forecast-model.js'));
const comparisonApi = require(join(PLUGIN_DIRECTORY, 'comparison-driver.js'));
const v4Api = require(join(PLUGIN_DIRECTORY, 'v4-contribution.js'));
const surfaceApi = require(join(PLUGIN_DIRECTORY, 'price-surface.js'));
const config = json(join(PLUGIN_DIRECTORY, 'default-config.json'));
const manifest = json(join(PLUGIN_DIRECTORY, 'plugin.json'));
const profile = json(join(ROOT, 'public/data/application-profiles/nyc-development-atlas-v1.json'));
const index = json(join(DATA_DIRECTORY, 'region-index-v1.json'));
const governance = json(join(DATA_DIRECTORY, 'model-governance-v1.json'));
const surface = json(join(DATA_DIRECTORY, 'city-surface-v1.json'));
const compileReceipt = json(join(DATA_DIRECTORY, 'compile-receipt-v1.json'));
const sourceDirectory = join(
  ROOT,
  'tools/simulatte/data-sources/nyc-real-estate-2026-07-27-v1'
);
const sourceReceipt = json(join(sourceDirectory, 'snapshot-receipt.json'));
const baseParameters = Object.freeze({
  id: 'greenpoint-history-and-growth',
  scenarioId: 'greenpoint-history-and-growth',
  seed: 'nyc-development-test-001',
  regionId: 'BK0101',
  sectorId: 'tax-class-2',
  historicalStartYear: 2010,
  forecastEndYear: 2035,
  policyId: 'zoning-capacity-expansion',
  financingRatePct: 5.5,
  annualDemandGrowthPct: 1.5,
  constructionCostIndex: 100,
  zoningCapacityMultiplier: 1.3,
  affordableHousingSharePct: 30,
});

test('source receipt and 264 compiler outputs bind every governed byte', () => {
  assert.equal(sourceReceipt.files.length, 15);
  for (const row of sourceReceipt.files) {
    const bytes = readFileSync(join(sourceDirectory, row.output));
    assert.equal(bytes.length, row.byteCount, row.output);
    assert.equal(sha256(bytes), row.sha256, row.output);
  }
  assert.equal(index.regions.length, 262);
  assert.equal(index.shards.length, 262);
  assert.equal(compileReceipt.outputs.length, 264);
  assert.deepEqual(compileReceipt.accepted, {
    capacitySites: 22368,
    citySurfaceRegions: 262,
    citySurfaceSaleRows: 5749,
    developmentSeries: 4384,
    historicalSites: 14536,
    regionShards: 262,
    regions: 262,
    saleSeries: 5749,
  });
  for (const output of compileReceipt.outputs) {
    const bytes = readFileSync(join(ROOT, output.path));
    assert.equal(bytes.length, output.byteCount, output.path);
    assert.equal(sha256(bytes), output.sha256, output.path);
  }
});

test('city surface binds every neighborhood polygon and annual sale aggregate', () => {
  assert.equal(surface.schema, 'simulatte.nycRealEstateCitySurface.v1');
  assert.equal(plugin.validateCitySurface(surface), surface);
  assert.equal(surface.regions.length, 262);
  assert.equal(surface.regions.reduce((sum, row) => sum + row.saleSeries.length, 0), 5749);
  assert.ok(surface.regions.every((row) => (
    row.polygon.length >= 4
    && row.polygon[0][0] === row.polygon.at(-1)[0]
    && row.polygon[0][1] === row.polygon.at(-1)[1]
  )));
  assert.match(surface.claimBoundary, /no forecast values/i);
});

test('all region shards are declared, hash-pinned, uncapped, and structurally valid', () => {
  const regionIds = new Set(index.regions.map((row) => row.id));
  for (const reference of index.shards) {
    assert.ok(regionIds.has(reference.regionId));
    const bytes = readFileSync(join(DATA_DIRECTORY, reference.path));
    assert.equal(bytes.length, reference.byteCount, reference.regionId);
    assert.equal(sha256(bytes), reference.sha256, reference.regionId);
    const shard = JSON.parse(bytes);
    assert.equal(plugin.validateRegionShard(shard), shard);
    assert.equal(shard.region.id, reference.regionId);
    assert.equal(shard.coverage.compilerRegionCap, null);
    assert.equal(shard.developmentSites.length, shard.coverage.historicalSites);
    assert.equal(shard.capacitySites.length, shard.coverage.capacityCandidates);
  }
});

test('index and governance validate with explicit truth and sparse coverage boundaries', () => {
  assert.equal(plugin.validateRegionIndex(index), index);
  assert.equal(plugin.validateGovernance(governance), governance);
  assert.equal(index.truth.origin, 'derived');
  assert.equal(governance.truth.origin, 'modeled');
  assert.match(index.claimBoundary, /never fabricate missing NTA evidence/i);
  assert.match(governance.claimBoundary, /does not appraise a parcel/i);
  assert.match(governance.priceModel.validation, /fails closed/i);
  assert.equal(index.regions.filter((row) => row.coverage.historicalSites === 0).length, 32);
  assert.equal(index.regions.filter((row) => row.coverage.capacityCandidates === 0).length, 77);
});

test('historical replay preserves observed milestones and modeled intermediate stages', () => {
  const result = run(baseParameters);
  const states = result.snapshots.flatMap((snapshot) => snapshot.historicalBuildingStates);
  const completed = states.find((row) => row.stage === 'completed');
  const inferred = states.find((row) => (
    ['site-preparation', 'foundation', 'structure', 'enclosure'].includes(row.stage)
  ));
  assert.equal(completed.stageOrigin, 'observed');
  assert.equal(inferred.stageOrigin, 'modeled');
  assert.ok(inferred.visibleHeightM > 0 && inferred.visibleHeightM < inferred.targetHeightM);
  assert.ok(result.snapshots.some((row) => row.storyFocus?.targetLayerId));
  assert.ok(result.snapshots.filter((row) => row.year < 2016).every((row) => (
    row.price.status === 'not-observed' && row.price.p50Usd === null
  )));
});

test('sparse selections refuse price and development forecasts without fallback output', () => {
  const result = run({
    ...baseParameters,
    regionId: 'BK0261',
    forecastEndYear: 2030,
  });
  assert.equal(result.forecasts.intervention.priceStatus, 'refused-insufficient-price-history');
  assert.equal(
    result.forecasts.intervention.developmentStatus,
    'refused-no-sector-capacity-candidates'
  );
  assert.equal(result.forecasts.intervention.projects.length, 0);
  assert.ok(result.forecasts.intervention.years.every((row) => (
    row.priceP10Usd === null && row.priceP50Usd === null && row.priceP90Usd === null
  )));
  assert.ok(result.snapshots.filter((row) => row.year > 2026).every((row) => (
    row.price.status === 'forecast-refused' && row.metrics.medianPriceUsd === null
  )));
  assert.doesNotMatch(JSON.stringify(result), /750000/);
});

test('tax classes generate only sector-correct supply', () => {
  const class1 = run({ ...baseParameters, sectorId: 'tax-class-1' });
  assert.ok(class1.forecasts.intervention.projects.length);
  assert.ok(class1.forecasts.intervention.projects.every((row) => (
    row.units >= 1 && row.units <= 3 && row.affordableUnits === 0
  )));
  const class4 = run({
    ...baseParameters,
    sectorId: 'tax-class-4',
    regionId: 'MN0201',
  });
  assert.ok(class4.forecasts.intervention.projects.length);
  assert.ok(class4.forecasts.intervention.projects.every((row) => (
    row.units === 0 && row.affordableUnits === 0 && row.floorAreaSquareFeet > 0
  )));
  const mixed = run({ ...baseParameters, sectorId: 'all' });
  assert.equal(
    mixed.forecasts.intervention.developmentStatus,
    'refused-mixed-sector-development-unsupported'
  );
  assert.equal(mixed.forecasts.intervention.projects.length, 0);
});

test('baseline and intervention share exact exogenous draws and calibration fails closed', () => {
  const first = run(baseParameters);
  const second = run(baseParameters);
  assert.deepEqual(first, second);
  assert.equal(first.exogenousIdentity, first.forecasts.baseline.exogenousIdentity);
  assert.equal(first.exogenousIdentity, first.forecasts.intervention.exogenousIdentity);
  assert.equal(first.backtest.status, 'not-evaluated-missing-pipeline-history');
  assert.equal(first.backtest.predictionCount, 0);
  assert.equal(first.backtest.mapePct, null);
  assert.ok(first.backtest.missingInputs.includes('historical-capacity-snapshots'));
  assert.equal(first.conservation.categoryConserved, true);
  assert.equal(first.conservation.unitsConserved, true);
});

test('city price surface is deterministic, uses one shared domain, and refuses sparse regions', () => {
  const first = surfaceFor(baseParameters);
  const second = surfaceFor(baseParameters);
  assert.deepEqual(first, second);
  const observed = first.years.find((row) => row.year === 2025);
  const missing = first.years.find((row) => row.year === 2026);
  const forecast = first.years.find((row) => row.year === 2035);
  assert.equal(observed.regions.length, 262);
  assert.ok(observed.availableRegionCount > 0);
  assert.ok(observed.domainUsd[0] < observed.domainUsd[1]);
  assert.equal(missing.availableRegionCount, 0);
  assert.ok(missing.regions.every((row) => row.status === 'missing-governed-current-price'));
  assert.ok(forecast.regions.some((row) => row.status === 'scenario-forecast'));
  assert.ok(forecast.regions.some((row) => row.status === 'refused-insufficient-price-history'));
  assert.ok(forecast.regions.filter((row) => row.status.startsWith('refused')).every((row) => (
    row.p10Usd === null && row.p50Usd === null && row.p90Usd === null
  )));
});

test('shared comparison executes branches in lockstep with closed evidence', async () => {
  const result = run(baseParameters);
  const comparison = await comparisonApi.runComparison({
    result,
    dataReceipts: receiptsFor('BK0101'),
  });
  assert.equal(comparison.settlement.status, 'settled');
  assert.equal(comparison.settlement.synchronizationPolicy, 'lockstep');
  assert.equal(comparison.sharedExogenousIdentity, result.exogenousIdentity);
  assert.ok(comparison.comparisonExecutionReceipt.history.length > 0);
  assert.deepEqual(
    comparison.comparisonExecutionReceipt.history.map((row) => row.masterTimeMs),
    comparison.comparisonExecutionReceipt.history.map((row) => row.masterTimeMs).sort((a, b) => a - b)
  );
  assert.equal(comparison.settlement.evidenceClosure.status, 'closed');
  assert.deepEqual(
    Object.keys(comparison.branchMetrics.baseline).sort(),
    Object.keys(comparison.branchMetrics.intervention).sort()
  );
});

test('V4 has dynamic controls, complete inspections, citywide overview, and compare layers', async () => {
  const result = run(baseParameters);
  const shard = shardFor('BK0101');
  const datasets = datasetBundle(shard);
  const storySnapshot = result.snapshots.find((row) => row.storyFocus);
  const story = v4Api.createContribution({
    datasets,
    dataReceipts: datasets.dataReceipts,
    result,
    priceSurface: surfaceFor(baseParameters),
    snapshot: storySnapshot,
  });
  assert.equal(story.presentation.viewIntents[0].mode, 'overview');
  assert.equal(story.presentation.viewIntents[0].targetIds.length, 262);
  assert.equal(story.controls.controls.length, 10);
  const visibleBuildingIds = story.presentation.layers
    .filter((row) => row.id.startsWith('historical:') || row.id.startsWith('future:'))
    .map((row) => row.id);
  const inspectedIds = new Set(story.inspections.flatMap((row) => row.targetIds));
  visibleBuildingIds.forEach((id) => assert.ok(inspectedIds.has(id), id));
  const surfaceIds = story.presentation.layers
    .filter((row) => row.id.startsWith('price-surface:'))
    .map((row) => row.id);
  assert.equal(surfaceIds.length, 262);
  surfaceIds.forEach((id) => assert.ok(inspectedIds.has(id), id));

  const comparison = await comparisonApi.runComparison({
    result,
    dataReceipts: datasets.dataReceipts,
  });
  const terminal = v4Api.createContribution({
    datasets,
    dataReceipts: datasets.dataReceipts,
    result,
    priceSurface: surfaceFor(baseParameters),
    snapshot: result.snapshots.at(-1),
    comparison,
  });
  assert.equal(terminal.presentation.viewIntents[0].mode, 'overview');
  assert.equal(terminal.presentation.viewIntents[0].targetIds.length, 262);
  assert.ok(terminal.presentation.layers.some((row) => row.id === 'comparison:baseline:region'));
  assert.ok(terminal.presentation.layers.some((row) => row.id === 'comparison:intervention:region'));
  assert.ok(terminal.presentation.layers.filter((row) => row.role === 'comparison').length > 2);

  const class4 = run({ ...baseParameters, sectorId: 'tax-class-4', regionId: 'MN0201' });
  const class4Shard = shardFor('MN0201');
  const class4Contribution = v4Api.createContribution({
    datasets: datasetBundle(class4Shard),
    dataReceipts: receiptsFor('MN0201'),
    result: class4,
    priceSurface: surfaceFor({ ...baseParameters, sectorId: 'tax-class-4', regionId: 'MN0201' }),
    snapshot: class4.snapshots.at(-1),
  });
  assert.equal(class4Contribution.controls.controls.length, 9);
  assert.equal(
    class4Contribution.controls.controls.some((row) => row.id === 'affordableHousingSharePct'),
    false
  );
});

test('plugin lazily loads one selected shard, compares, settles, and replays', async () => {
  const harness = createSdkHarness();
  const scenario = profile.seeds[0];
  const instance = await plugin.activate({ sdk: harness.sdk, config, profile, scenario });
  assert.deepEqual(harness.shardLoads, ['BK0101']);
  const values = { ...baseParameters, scenarioId: scenario.id, phase: 'start' };
  const started = await instance.handleAction('scenario.run', { scenario, values });
  assert.equal(started.status, 'running');
  assert.deepEqual(harness.shardLoads, ['BK0101', 'BK0101']);
  const comparison = await instance.handleAction('counterfactual.compare', {
    values: { comparisonId: 'business-as-usual-vs-selected-policy' },
  });
  assert.equal(comparison.status, 'settled');
  assert.ok(comparison.comparisonBranches.baseline);
  assert.ok(harness.receipts.some((row) => row.schema === 'simulatte.comparisonExecutionReceipt.v4'));
  assert.equal(instance.contributeV4().presentation.viewIntents[0].mode, 'overview');
  let playback = started;
  while (playback.status === 'running') {
    playback = await instance.handleAction('scenario.run', { values: { phase: 'step' } });
  }
  assert.equal(playback.calendarYear, 2035);
  assert.ok(instance.settle().obligationResults.every((row) => row.status === 'settled'));
  assert.ok(harness.receipts.some((row) => (
    row.schema === 'simulatte.plugin.nycRealEstateSettlementReceipt.v1'
  )));
  const replayed = await instance.handleAction('scenario.run', { scenario, values });
  assert.deepEqual(replayed, started);
});

test('scenario selection applies its own region and policy defaults', async () => {
  const harness = createSdkHarness();
  const initialScenario = profile.seeds[0];
  const nextScenario = profile.seeds[1];
  const instance = await plugin.activate({
    sdk: harness.sdk,
    config,
    profile,
    scenario: initialScenario,
  });

  await instance.setScenario(nextScenario);
  const contribution = instance.contributeV4();
  assert.equal(contribution.presentation.viewIntents[0].mode, 'overview');
  const started = await instance.handleAction('scenario.run', {
    scenario: nextScenario,
    values: { phase: 'start' },
  });

  assert.equal(started.acceptedParameters.regionId, 'QN0201');
  assert.equal(started.acceptedParameters.policyId, 'zoning-capacity-expansion');
  assert.equal(started.acceptedParameters.zoningCapacityMultiplier, 1.35);
  assert.deepEqual(harness.shardLoads, ['BK0101', 'QN0201']);
});

test('model hashes bind every executable model and governance artifact', () => {
  assert.equal(v4Api.MODEL_HASHES.forecast, fileHash('forecast-model.js'));
  assert.equal(v4Api.MODEL_HASHES.statistics, fileHash('forecast-statistics.js'));
  assert.equal(v4Api.MODEL_HASHES.sector, fileHash('sector-model.js'));
  assert.equal(v4Api.MODEL_HASHES.comparison, fileHash('comparison-driver.js'));
  assert.equal(v4Api.MODEL_HASHES.priceSurface, fileHash('price-surface.js'));
  assert.equal(
    v4Api.MODEL_HASHES.governance,
    sha256(readFileSync(join(DATA_DIRECTORY, 'model-governance-v1.json')))
  );
});

function run(parameters) {
  const shard = shardFor(parameters.regionId);
  return model.runScenario({ index, shard, governance, parameters });
}

function surfaceFor(parameters) {
  return surfaceApi.runSurface({ surface, governance, parameters });
}

function shardFor(regionId) {
  return json(join(DATA_DIRECTORY, `regions/${regionId}.json`));
}

function datasetBundle(shard) {
  const dataReceipts = receiptsFor(shard.region.id);
  return Object.freeze({
    index,
    shard,
    governance,
    surface,
    shardReceipt: dataReceipts.at(-1),
    dataReceipts,
  });
}

function receiptsFor(regionId) {
  const fixed = manifest.datasets.map((row) => ({
    datasetId: row.id,
    schemaId: row.reference.schemaId,
    sha256: row.reference.sha256,
  }));
  const reference = index.shards.find((row) => row.regionId === regionId);
  return [...fixed, {
    schema: 'simulatte.datasetShardLoadReceipt.v1',
    datasetId: reference.id,
    shardId: reference.id,
    regionId,
    schemaId: reference.schemaId,
    sha256: reference.sha256,
    byteCount: reference.byteCount,
    cacheMode: 'test',
  }];
}

function createSdkHarness() {
  let state = null;
  let reducer = null;
  const receipts = [];
  const shardLoads = [];
  const byId = Object.fromEntries(manifest.datasets.map((row) => [
    row.id,
    json(resolve(PLUGIN_DIRECTORY, row.reference.path)),
  ]));
  const fixedReceipts = manifest.datasets.map((row) => ({
    datasetId: row.id,
    schemaId: row.reference.schemaId,
    sha256: row.reference.sha256,
  }));
  return {
    receipts,
    shardLoads,
    sdk: {
      datasets: {
        require(id) {
          if (!byId[id]) throw new Error(`missing dataset ${id}`);
          return byId[id];
        },
        receipt(id) {
          return fixedReceipts.find((row) => row.datasetId === id) || null;
        },
        async loadShard(parentId, regionId) {
          assert.equal(parentId, 'nyc-real-estate-region-index-2026-v1');
          shardLoads.push(regionId);
          const value = shardFor(regionId);
          return { value, receipt: receiptsFor(regionId).at(-1) };
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

function fileHash(filename) {
  return sha256(readFileSync(join(PLUGIN_DIRECTORY, filename)));
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function json(filename) {
  return JSON.parse(readFileSync(filename, 'utf8'));
}
