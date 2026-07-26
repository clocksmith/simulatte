const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join, resolve } = require('node:path');
const test = require('node:test');

const ROOT = join(__dirname, '..');
const PLUGIN_DIRECTORY = join(ROOT, 'public/shared/plugins/asteroid-defense');
const plugin = require(join(PLUGIN_DIRECTORY, 'index.js'));
const model = require(join(PLUGIN_DIRECTORY, 'asteroid-model.js'));
const orbit = require(join(PLUGIN_DIRECTORY, 'orbit-determination.js'));
const comparison = require(join(PLUGIN_DIRECTORY, 'comparison-driver.js'));
const propagation = require(join(ROOT, 'public/shared/core/simulation/n-body-propagation.js'));
const config = json(join(PLUGIN_DIRECTORY, 'default-config.json'));
const manifest = json(join(PLUGIN_DIRECTORY, 'plugin.json'));
const profile = json(join(ROOT, 'public/data/application-profiles/asteroid-defense-v1.json'));
const dataReceipts = manifest.datasets.map((row) => ({
  datasetId: row.id,
  schemaId: row.reference.schemaId,
  sha256: row.reference.sha256,
}));
const datasets = loadDatasets();
const scenario = Object.freeze({
  id: 'short-arc-follow-up',
  scenarioId: 'short-arc-follow-up',
  observationCampaignId: 'short-arc-follow-up',
  seed: 'asteroid-short-arc-001',
  forceModelId: config.forceModelId,
  followUpPolicyId: config.followUpPolicyId,
  decisionPolicyId: config.decisionPolicyId,
  interventionArchetypeId: config.interventionArchetypeId,
  executionUncertaintyModelId: config.executionUncertaintyModelId,
  ensembleSize: 12,
  observationBudget: 8,
  decisionThreshold: config.decisionThreshold,
});

test('governed campaigns are synthetic while pinned JPL rows remain benchmark-only', () => {
  for (const declaration of manifest.datasets) {
    const value = datasetsById()[declaration.id];
    const validate = plugin.datasetValidators[declaration.reference.schemaId];
    assert.equal(typeof validate, 'function');
    assert.equal(validate(value), value);
  }
  assert.ok(datasets.campaigns.campaigns.every((row) => row.truth.origin === 'scenario' && row.hiddenTruth.truthHash));
  assert.match(datasets.campaigns.claimBoundary, /synthetic/i);
  assert.match(datasets.jpl.claimBoundary, /not an operational risk reproduction/i);
  const closeApproach = datasets.jpl.responses.find((row) => row.id === 'cad-apophis-2029').response;
  assert.equal(closeApproach.signature.source, 'NASA/JPL SBDB Close Approach Data API');
  assert.match(closeApproach.data[0][3], /^2029-Apr-13/);
});

test('shared n-body propagation is deterministic and receipts force-model omissions', () => {
  const input = {
    stateVector: { positionAu: [1, 0, 0], velocityAuD: [0, Math.sqrt(0.0002959122082855911), 0] },
    startDay: 0,
    durationDays: 30,
    stepDays: 0.05,
    gmSunAuD2: 0.0002959122082855911,
  };
  const first = propagation.propagate(input);
  const second = propagation.propagate(input);
  assert.deepEqual(first, second);
  assert.equal(first.methodId, 'shared-heliocentric-rk4-v1');
  assert.ok(first.maximumSpecificEnergyDriftAu2D2 < 1e-12);
  assert.ok(first.omissions.includes('relativity'));
});

test('orbit fit reads public observations only and hidden-truth mutation cannot change it', () => {
  const campaign = datasets.campaigns.campaigns[0];
  const forceModel = datasets.forceModels.models[0];
  const options = {
    campaign,
    forceModel,
    observationBudget: 8,
    followUpPolicyId: 'information-gain',
    fit: config.fit,
  };
  const first = orbit.fit(options);
  const mutated = orbit.fit({
    ...options,
    campaign: {
      ...campaign,
      hiddenTruth: {
        ...campaign.hiddenTruth,
        initialState: { positionAu: [4, 0, 0], velocityAuD: [0, 0, 0] },
      },
    },
  });
  assert.deepEqual(mutated, first);
  assert.equal(first.converged, true);
  assert.equal(first.covarianceReceipt.positiveSemidefinite, true);
  assert.ok(first.iterations.every((row) => Number.isFinite(row.weightedCost)));
});

test('all five scenarios replay deterministically and keep frequency separate from probability', () => {
  for (const seed of profile.seeds) {
    const parameters = { ...scenario, id: seed.id, scenarioId: seed.id, observationCampaignId: seed.id, seed: seed.seed };
    const first = model.runScenario({ datasets, config, scenario: parameters });
    const second = model.runScenario({ datasets, config, scenario: parameters });
    assert.deepEqual(first, second);
    assert.equal(first.settlement.status, 'settled');
    assert.equal(first.settlement.probabilityClaimAllowed, false);
    assert.equal(first.baselineEncounter.probabilityClaimAllowed, false);
    assert.match(first.baselineEncounter.interpretation, /not an impact probability/i);
    assert.equal(first.ensembleReceipt.samples.length, parameters.ensembleSize);
  }
});

test('observation and intervention policies materially alter declared outcomes', () => {
  const policyScenario = {
    ...scenario,
    id: 'late-precision-observation',
    scenarioId: 'late-precision-observation',
    observationCampaignId: 'late-precision-observation',
    seed: 'asteroid-policy-difference',
    observationBudget: 6,
  };
  const fixed = model.runScenario({
    datasets,
    config,
    scenario: { ...policyScenario, followUpPolicyId: 'fixed-cadence', decisionThreshold: 0 },
  });
  const informed = model.runScenario({
    datasets,
    config,
    scenario: { ...policyScenario, followUpPolicyId: 'information-gain', decisionThreshold: 0 },
  });
  const none = model.runScenario({
    datasets,
    config,
    scenario: { ...policyScenario, interventionArchetypeId: 'none', decisionThreshold: 0 },
  });
  assert.notEqual(fixed.metrics.fitResidualRmsArcsec, informed.metrics.fitResidualRmsArcsec);
  assert.notEqual(informed.metrics.interventionMedianDistanceKm, none.metrics.interventionMedianDistanceKm);
});

test('comparison executes blind lockstep branches and does not serialize hidden state', async () => {
  const result = await comparison.runComparison({ datasets, config, scenario: { ...scenario, decisionThreshold: 0 } });
  assert.equal(result.settlement.status, 'settled');
  assert.equal(result.comparisonExecutionReceipt.state, 'settled');
  assert.equal(result.comparisonExecutionReceipt.synchronizationPolicy, 'lockstep');
  assert.equal(result.comparisonExecutionReceipt.startingIdentity.seed, scenario.seed);
  const text = JSON.stringify(result.comparisonExecutionReceipt);
  assert.doesNotMatch(text, /hiddenInitialState|futureObservationOutcomes|executionDraws|trueEncounterOutcome/);
  assert.doesNotMatch(text, /"positionAu":\[/);
});

test('typed controls rebuild once, step existing state, replay exactly, and close v4 evidence', async () => {
  const harness = createSdkHarness();
  const instance = await plugin.activate({ sdk: harness.sdk, config, profile, scenario });
  const values = {
    observationCampaignId: 'late-precision-observation',
    followUpPolicyId: 'fixed-cadence',
    decisionPolicyId: 'act-at-threshold',
    interventionArchetypeId: 'gravity-tractor',
    observationBudget: 7,
    ensembleSize: 8,
    decisionThreshold: 0,
  };
  const started = await instance.handleAction('scenario.run', {
    scenario: { id: 'late-precision-observation', scenarioId: 'late-precision-observation', seed: 'asteroid-replay' },
    values: { ...values, phase: 'start' },
  });
  assert.equal(started.status, 'running');
  assert.equal(started.acceptedParameters.observationBudget, 7);
  const receiptCount = harness.receipts.length;
  const stepped = await instance.handleAction('scenario.run', { values: { ...values, phase: 'step' } });
  assert.equal(stepped.currentStep, 1);
  assert.equal(stepped.scenarioIdentity, started.scenarioIdentity);
  assert.equal(harness.receipts.length, receiptCount);
  const replayed = await instance.handleAction('scenario.run', {
    scenario: { id: 'late-precision-observation', scenarioId: 'late-precision-observation', seed: 'asteroid-replay' },
    values: { ...values, phase: 'start' },
  });
  assert.deepEqual(replayed, started);
  const contribution = instance.contributeV4();
  assert.equal(contribution.schema, 'simulatte.pluginContribution.v4');
  assert.deepEqual(contribution.controls.controls.map((row) => row.id).sort(), [
    'decisionPolicyId',
    'decisionThreshold',
    'ensembleSize',
    'followUpPolicyId',
    'interventionArchetypeId',
    'observationBudget',
    'observationCampaignId',
  ].sort());
  assert.ok(contribution.inspections[0].fields.some((row) => row.id === 'screening-language'));
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
      state: {
        read: () => state,
        register(nextReducer, initialState) { reducer = nextReducer; state = initialState; },
      },
      events: { propose(event) { state = reducer(state, event); return event; } },
      receipts: { append(receipt) { receipts.push(receipt); return receipt; } },
    },
  };
}

function loadDatasets() {
  const rows = datasetsById();
  return Object.freeze({
    campaigns: rows['asteroid-synthetic-observation-campaigns-v1'],
    stations: rows['asteroid-observer-stations-v1'],
    forceModels: rows['asteroid-force-models-v1'],
    interventions: rows['asteroid-intervention-archetypes-v1'],
    execution: rows['asteroid-execution-uncertainty-models-v1'],
    policies: rows['asteroid-decision-policies-v1'],
    benchmarks: rows['asteroid-historical-benchmark-cases-v1'],
    jpl: rows['asteroid-jpl-reference-snapshots-v1'],
    governance: rows['asteroid-model-governance-v1'],
    provenance: rows['asteroid-provenance-registry-v1'],
    dataReceipts,
  });
}

function datasetsById() {
  return Object.fromEntries(manifest.datasets.map((row) => [
    row.id,
    json(resolve(PLUGIN_DIRECTORY, row.reference.path)),
  ]));
}
function json(path) { return JSON.parse(readFileSync(path, 'utf8')); }
