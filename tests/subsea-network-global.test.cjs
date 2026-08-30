const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');

const ROOT = join(__dirname, '..');
const PLUGIN_DIRECTORY = join(ROOT, 'public/shared/plugins/subsea-network-global');
const DATA_DIRECTORY = join(ROOT, 'public/data/subsea-network-global');
const model = require(join(PLUGIN_DIRECTORY, 'network-model.js'));
const solver = require(join(PLUGIN_DIRECTORY, 'allocation-solver.js'));
const comparison = require(join(PLUGIN_DIRECTORY, 'comparison-driver.js'));
const plugin = require(join(PLUGIN_DIRECTORY, 'index.js'));
const v4 = require(join(PLUGIN_DIRECTORY, 'v4-contribution.js'));
const config = json(join(PLUGIN_DIRECTORY, 'default-config.json'));
const manifest = json(join(PLUGIN_DIRECTORY, 'plugin.json'));
const dataReceipts = manifest.datasets.map((row) => ({
  datasetId: row.id,
  schemaId: row.reference.schemaId,
  sha256: row.reference.sha256,
}));
const datasets = loadDatasets();
const scenario = Object.freeze({
  id: 'atlantic-single-cut',
  scenarioId: 'atlantic-single-cut',
  seed: 'subsea-atlantic-001',
  allocationPolicyId: 'proportional-fair',
  comparisonPolicyId: 'weighted-throughput',
  repairPolicyId: 'unmet-demand-first',
  failedResourceIds: ['marea:spain'],
  excludedLandingIds: [],
  essentialServiceWeight: 3,
  repairResourceCount: 2,
  ensembleSize: 2,
});

test('governed datasets validate and preserve the observed/scenario boundary', () => {
  for (const declaration of manifest.datasets) {
    const value = datasetsById()[declaration.id];
    const validate = plugin.datasetValidators[declaration.reference.schemaId];
    assert.equal(typeof validate, 'function');
    assert.equal(validate(value), value);
  }
  assert.ok(datasets.fcc.cables.every((row) => row.truth.origin === 'observed'));
  assert.equal(datasets.capacities.scenarios[0].truth.origin, 'scenario');
  assert.match(datasets.capacities.claimBoundary, /scenario inputs/i);
  assert.match(datasets.demands.claimBoundary, /never current internet traffic/i);
});

test('allocation is deterministic and independently conserves demand and edge capacity', () => {
  const first = model.runScenario({ datasets, config, scenario });
  const second = model.runScenario({ datasets, config, scenario });
  assert.deepEqual(first, second);
  assert.equal(first.scenarioIdentity, second.scenarioIdentity);
  for (const snapshot of first.snapshots) {
    assert.equal(snapshot.allocationReceipt.feasibility.isValid, true);
    for (const demand of snapshot.demands) {
      assert.ok(Math.abs(demand.requestedGbps - demand.deliveredGbps - demand.droppedGbps) <= config.solver.absoluteTolerance);
    }
    for (const edge of snapshot.edges) {
      assert.ok(edge.loadGbps <= edge.availableGbps + config.solver.absoluteTolerance);
      if (edge.failureState === 'failed') assert.equal(edge.loadGbps, 0);
    }
  }
  assert.equal(first.repairReceipt.inventoryConserved, true);
  assert.equal(first.snapshots.at(-1).status, 'settled');
});

test('allocation policies execute distinct feasible allocations on identical exogenous inputs', () => {
  const throughput = model.runScenario({
    datasets,
    config,
    scenario: { ...scenario, allocationPolicyId: 'weighted-throughput' },
  });
  const fair = model.runScenario({
    datasets,
    config,
    scenario: { ...scenario, allocationPolicyId: 'proportional-fair' },
  });
  assert.equal(throughput.configurationIdentity.seed, fair.configurationIdentity.seed);
  assert.deepEqual(throughput.failedResourceIds, fair.failedResourceIds);
  assert.notDeepEqual(
    throughput.snapshots[0].demands.map((row) => row.deliveredGbps),
    fair.snapshots[0].demands.map((row) => row.deliveredGbps)
  );
  assert.equal(throughput.snapshots[0].allocationReceipt.feasibility.isValid, true);
  assert.equal(fair.snapshots[0].allocationReceipt.feasibility.isValid, true);
});

test('every failed target gets a progressive repair voyage and causally ranked burden', () => {
  const dual = model.runScenario({
    datasets,
    config,
    scenario: {
      ...scenario,
      scenarioId: 'dual-regional-disruption',
      failedResourceIds: ['marea:spain', 'amitie:united-kingdom'],
      repairResourceCount: 2,
    },
  });
  for (const targetId of dual.failedResourceIds) {
    const targetEvents = dual.repairReceipt.events.filter((row) => row.targetId === targetId);
    assert.equal(targetEvents.filter((row) => row.kind === 'repair.transit-progressed').length, 3);
    assert.ok(targetEvents.every((row) => Array.isArray(row.position)));
    assert.ok(dual.snapshots.some((row) => (
      row.activeRepairEventId && targetEvents.some((event) => event.id === row.activeRepairEventId)
    )));
    assert.ok(Number.isFinite(dual.repairReceipt.targetPriorityBurdenGbps[targetId]));
  }
  assert.ok(dual.snapshots.every((row, index, rows) => !index
    || row.simulationTimeMs >= rows[index - 1].simulationTimeMs));
  const transitSnapshot = dual.snapshots.find((row) => (
    dual.repairReceipt.events.find((event) => event.id === row.activeRepairEventId)?.kind
      === 'repair.transit-progressed'
  ));
  const contribution = v4.createContribution({
    datasets,
    dataReceipts,
    config,
    result: dual,
    snapshot: transitSnapshot,
  });
  const transitEvent = dual.repairReceipt.events.find((row) => row.id === transitSnapshot.activeRepairEventId);
  const actor = contribution.presentation.layers.find((row) => row.kind === 'actor');
  assert.equal(actor.quantity.kind, 'actor.repair-vessel.route-progress');
  assert.equal(actor.geometry.kind, 'polyline');
  assert.deepEqual(actor.geometry.coordinates, [transitEvent.origin, transitEvent.destination]);
  assert.ok(contribution.presentation.layers.some((row) => row.id.startsWith('repair-transit:')));
  assert.deepEqual(contribution.presentation.viewIntents[0].targetIds, [actor.id]);
});

test('solver fails closed for unavailable-path flow and invalid policy inputs', () => {
  assert.throws(() => solver.solveAllocation({
    edges: [],
    demands: [],
    pathCatalog: { paths: [] },
    policyId: 'decorative-policy',
    solver: config.solver,
  }), /subsea_policy_invalid/);
  const disconnected = model.runScenario({
    datasets,
    config,
    scenario: {
      ...scenario,
      failedResourceIds: ['landing:us-northeast', 'landing:us-mid-atlantic'],
      repairResourceCount: 2,
    },
  });
  assert.ok(disconnected.snapshots[0].metrics.droppedGbps > 0);
  assert.equal(disconnected.snapshots[0].allocationReceipt.feasibility.isValid, true);
});

test('comparison executes synchronized policy-blind branches and settles compatible metrics', async () => {
  const run = await comparison.runComparison({
    datasets,
    dataReceipts,
    config,
    scenario,
  });
  assert.equal(run.settlement.status, 'settled');
  assert.equal(run.comparisonExecutionReceipt.state, 'settled');
  assert.deepEqual(Object.keys(run.branchMetrics).sort(), ['baseline', 'intervention']);
  assert.deepEqual(
    Object.keys(run.branchMetrics.baseline).sort(),
    Object.keys(run.branchMetrics.intervention).sort()
  );
  const receiptText = JSON.stringify(run.comparisonExecutionReceipt);
  assert.doesNotMatch(receiptText, /hiddenTruthValue|futureFailures|futureRepairResults/);
  assert.equal(run.comparisonExecutionReceipt.startingIdentity.seed, scenario.seed);
  assert.equal(run.comparisonExecutionReceipt.synchronizationPolicy, 'lockstep');
  assert.deepEqual(run.policies, {
    baseline: scenario.comparisonPolicyId,
    intervention: scenario.allocationPolicyId,
  });
  assert.equal(run.selectedPolicyId, scenario.allocationPolicyId);
  assert.equal(run.selectedBranchId, 'intervention');
  assert.equal(run.comparisonPolicyId, scenario.comparisonPolicyId);
  assert.equal(run.comparisonBranchId, 'baseline');
  assert.notEqual(run.branchIdentities.baseline, run.branchIdentities.intervention);
});

test('comparison uses the explicit selected and comparison policies and refuses identical branches', async () => {
  const selected = {
    ...scenario,
    allocationPolicyId: 'weighted-throughput',
    comparisonPolicyId: 'geographic-equity',
  };
  const run = await comparison.runComparison({ datasets, dataReceipts, config, scenario: selected });
  assert.deepEqual(run.policies, {
    baseline: 'geographic-equity',
    intervention: 'weighted-throughput',
  });
  await assert.rejects(
    comparison.runComparison({
      datasets,
      dataReceipts,
      config,
      scenario: { ...selected, comparisonPolicyId: selected.allocationPolicyId },
    }),
    /subsea_comparison_policy_duplicate/
  );
});

test('comparison reuses only an exact selected branch and preserves the independent receipt', async () => {
  const selectedResult = model.runScenario({ datasets, config, scenario });
  const baseline = await comparison.runComparison({ datasets, dataReceipts, config, scenario });
  const reused = await comparison.runComparison({ datasets, dataReceipts, config, scenario, selectedResult });

  assert.deepEqual(reused.branchMetrics, baseline.branchMetrics);
  assert.deepEqual(reused.settlement, baseline.settlement);
  assert.deepEqual(reused.comparisonExecutionReceipt, baseline.comparisonExecutionReceipt);
  assert.ok(Buffer.byteLength(JSON.stringify(reused.comparisonExecutionReceipt)) < 750_000);
});

test('plugin comparison publishes one full proof and returns only its settled identity', async () => {
  const harness = createSdkHarness();
  const instance = await plugin.activate({ sdk: harness.sdk, config, profile: null, scenario });
  const result = await instance.handleAction('counterfactual.compare');
  const archived = harness.receipts.find((receipt) => receipt.schema === 'simulatte.comparisonExecutionReceipt.v4');

  assert.equal(result.status, 'settled');
  assert.equal(result.comparisonExecutionReceipt, undefined);
  assert.equal(result.comparisonExecutionReceiptId, archived.id);
  assert.equal(archived.state, 'settled');
  assert.equal(instance.contributeV4().presentation.viewIntents[0].mode, 'compare');
});

test('typed controls rebuild on start, step without recomputation, and replay deterministically', async () => {
  const harness = createSdkHarness();
  const instance = await plugin.activate({
    sdk: harness.sdk,
    config,
    profile: json(join(ROOT, 'public/data/application-profiles/subsea-network-global-v1.json')),
    scenario,
  });
  assert.equal(instance.id, 'subsea-network-global');
  const values = {
    demandScenarioId: 'dual-regional-disruption',
    allocationPolicyId: 'weighted-throughput',
    comparisonPolicyId: 'geographic-equity',
    repairPolicyId: 'nearest-first',
    failedResourceIds: ['marea:spain', 'amitie:united-kingdom'],
    jurisdictionExclusions: ['none'],
    essentialServiceWeight: 7,
    repairResourceCount: 1,
    ensembleSize: 2,
  };
  const started = await instance.handleAction('scenario.run', {
    scenario: { id: 'dual-regional-disruption', scenarioId: 'dual-regional-disruption', seed: 'replay-seed' },
    values: { ...values, phase: 'start' },
  });
  assert.equal(started.status, 'running');
  assert.deepEqual(started.acceptedParameters.failedResourceIds, values.failedResourceIds.sort());
  assert.equal(started.acceptedParameters.essentialServiceWeight, 7);
  assert.equal(started.acceptedParameters.seed, scenario.seed);
  assert.equal(started.acceptedParameters.comparisonPolicyId, 'geographic-equity');
  const identity = started.scenarioIdentity;
  const receiptCount = harness.receipts.length;
  const stepped = await instance.handleAction('scenario.run', { values: { ...values, phase: 'step' } });
  assert.equal(stepped.currentStep, 1);
  assert.equal(stepped.scenarioIdentity, identity);
  assert.equal(harness.receipts.length, receiptCount);
  const replayed = await instance.handleAction('scenario.run', {
    scenario: { id: 'dual-regional-disruption', scenarioId: 'dual-regional-disruption', seed: 'replay-seed' },
    values: { ...values, phase: 'start' },
  });
  assert.deepEqual(replayed, started);
  assert.throws(() => instance.handleAction('scenario.run', {
    scenario: { id: values.demandScenarioId, scenarioId: values.demandScenarioId, seed: 'ignored-invalid-policy-seed' },
    values: { ...values, allocationPolicyId: 'unknown', phase: 'start' },
  }), /subsea_control_invalid/);
  assert.throws(() => instance.handleAction('scenario.run', {
    scenario: { id: 'demand-surge', scenarioId: 'demand-surge', seed: 'outer-seed' },
    values: { ...values, phase: 'start' },
  }), /subsea_scenario_authority_conflict/);
});

test('v4 contribution exposes semantic quantities and every accepted public control', async () => {
  const harness = createSdkHarness();
  const instance = await plugin.activate({ sdk: harness.sdk, config, profile: null, scenario });
  const contribution = instance.contributeV4();
  assert.equal(contribution.schema, 'simulatte.pluginContribution.v4');
  assert.deepEqual(
    contribution.controls.controls.map((row) => row.id).sort(),
    [
      'allocationPolicyId',
      'comparisonPolicyId',
      'demandScenarioId',
      'ensembleSize',
      'essentialServiceWeight',
      'failedResourceIds',
      'jurisdictionExclusions',
      'repairPolicyId',
      'repairResourceCount',
    ].sort()
  );
  assert.ok(contribution.presentation.layers.some((row) => row.quantity?.kind === 'utilization-ratio'));
  assert.ok(contribution.presentation.layers.some((row) => row.quantity?.kind === 'dropped-demand'));
  assert.ok(contribution.provenanceRecords.length >= manifest.datasets.length);
  assert.ok(contribution.events.every((row) => row.provenance.axes.origin === 'simulated'));
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
        require(id) {
          if (!byId[id]) throw new Error(`missing dataset ${id}`);
          return byId[id];
        },
        receipt(id) {
          const row = dataReceipts.find((receipt) => receipt.datasetId === id);
          return row ? { ...row } : null;
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
    fcc: rows['subsea-fcc-cable-license-register-2025-v1'],
    landings: rows['subsea-landing-points-governed-v1'],
    topology: rows['subsea-cable-corridors-modeled-v1'],
    capacities: rows['subsea-capacity-scenarios-v1'],
    demands: rows['subsea-demand-scenarios-v1'],
    repairs: rows['subsea-repair-resources-v1'],
    governance: rows['subsea-model-governance-v1'],
    provenance: rows['subsea-provenance-registry-v1'],
    dataReceipts,
  });
}

function datasetsById() {
  return Object.fromEntries(manifest.datasets.map((row) => [
    row.id,
    json(join(PLUGIN_DIRECTORY, row.reference.path)),
  ]));
}

function json(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}
