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
const catalog = require(join(PLUGIN_DIRECTORY, 'asteroid-catalog.js'));
const semanticCompositor = require(join(ROOT, 'public/simulatte/platform/render/semantic-compositor.js'));
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

test('governed JPL context produces bounded three-dimensional catalog positions', () => {
  assert.ok(datasets.neoCatalog.objects.length >= 100);
  assert.match(datasets.neoCatalog.source.documentationUrl, /jpl\.nasa\.gov/);
  const object = datasets.neoCatalog.objects.find((row) => row.inclinationDeg > 10);
  const position = catalog.positionAtEpoch(object, object.epochTdbJd);
  assert.equal(position.length, 3);
  assert.ok(position.every(Number.isFinite));
  assert.notEqual(position[2], 0);
  const visual = catalog.visualCatalog(datasets.neoCatalog.objects, object.epochTdbJd, 120);
  assert.equal(visual.length, 120);
  assert.ok(visual.some((row) => row.object.potentiallyHazardous));
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
  assert.equal(first.observationSelectionReceipt.method, 'greedy_d_optimal_actual_measurement_jacobian_v1');
  assert.equal(first.observationSelectionReceipt.selectionSteps.length, 8);
  assert.ok(first.iterations.every((row) => Number.isFinite(row.weightedCost)));
});

test('covariance validation checks the full spectrum rather than only the diagonal', () => {
  const invalid = orbit.validateCovariance([
    [1, 2],
    [2, 1],
  ]);
  assert.equal(invalid.symmetric, true);
  assert.equal(invalid.positiveSemidefinite, false);
  assert.ok(invalid.minimumEigenvalue < 0);
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
    const lastObservationDay = Math.max(...first.fitReceipt.observationIds.map((id) => (
      datasets.campaigns.campaigns.find((row) => row.id === seed.id)
        .observations.find((row) => row.id === id).epochDayTdb
    )));
    assert.ok(first.interventionEncounter.members.every((member) => (
      member.executionProfile.decisionDay >= lastObservationDay
    )));
    const baselineSnapshot = first.snapshots.find((row) => row.status === 'baseline-propagated');
    assert.equal(baselineSnapshot.baselineEncounter.schema, 'simulatte.asteroidEncounterSummary.v1');
    assert.equal(Object.hasOwn(baselineSnapshot.baselineEncounter, 'members'), false);
    assert.ok(first.baselineEncounter.members.every((member) => (
      member.propagationReceipts.every((receipt) => (
        !Object.hasOwn(receipt, 'trajectory')
        && receipt.trajectorySummary.sampleCount > 0
      ))
    )));
    assert.ok(
      Buffer.byteLength(JSON.stringify(first)) < 8 * 1024 * 1024,
      'a governed Asteroid result must fit within the runtime serialization budget',
    );
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
    decisionPolicyId: 'act-at-threshold',
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
  assert.notDeepEqual(
    informed.interventionEncounter.members.map((row) => row.minimumDistanceKm),
    none.interventionEncounter.members.map((row) => row.minimumDistanceKm)
  );
});

test('kinetic, reconnaissance, and gravity-tractor strategies execute distinct profiles', () => {
  const base = {
    ...scenario,
    decisionThreshold: 0,
    decisionPolicyId: 'act-at-threshold',
    seed: 'strategy-profile-comparison',
  };
  const kinetic = model.runScenario({
    datasets,
    config,
    scenario: { ...base, interventionArchetypeId: 'kinetic-impactor' },
  });
  const reconnaissance = model.runScenario({
    datasets,
    config,
    scenario: { ...base, interventionArchetypeId: 'reconnaissance-first' },
  });
  const tractor = model.runScenario({
    datasets,
    config,
    scenario: { ...base, interventionArchetypeId: 'gravity-tractor' },
  });
  assert.equal(kinetic.metrics.interventionExecutionProfile.deliveryMode, 'instantaneous-kinetic');
  assert.equal(kinetic.metrics.interventionExecutionProfile.impulseCount, 1);
  assert.equal(reconnaissance.metrics.interventionExecutionProfile.deliveryMode, 'reconnaissance-then-kinetic');
  assert.equal(reconnaissance.metrics.interventionExecutionProfile.campaignDelayDays, 10);
  assert.equal(reconnaissance.metrics.interventionExecutionProfile.navigationSigmaMultiplier, 0.45);
  assert.equal(tractor.metrics.interventionExecutionProfile.deliveryMode, 'continuous-low-thrust');
  assert.equal(tractor.metrics.interventionExecutionProfile.impulseCount, 15);
  assert.equal(tractor.metrics.interventionExecutionProfile.thrustDurationDays, 45);
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
  const applied = await instance.handleAction('asteroid.configuration.apply', {
    scenario: { id: 'late-precision-observation', scenarioId: 'late-precision-observation', seed: 'asteroid-replay' },
    values,
  });
  assert.equal(applied.status, 'applied');
  assert.equal(applied.playbackStatus, 'ready');
  const refusedDraft = await instance.handleAction('scenario.run', {
    values: { ...values, observationBudget: 6, phase: 'start' },
  });
  assert.equal(refusedDraft.status, 'refused');
  assert.equal(refusedDraft.reason, 'configuration_not_applied');
  const reset = await instance.handleAction('asteroid.configuration.reset');
  assert.equal(reset.status, 'reset');
  assert.deepEqual(reset.values, applied.acceptedParameters);
  const manual = await instance.handleAction('asteroid.view.manual');
  assert.equal(manual.automaticView, false);
  assert.equal(instance.contributeV4().presentation.viewIntents.length, 0);
  assert.equal(instance.semanticPresentation().viewIntents.length, 0);
  const manualView = instance.view()[0];
  assert.ok(manualView.rows.some((row) => row.label === 'Camera authority' && /manual/i.test(row.value)));
  assert.ok(manualView.rows.some((row) => row.label === 'Logical simulation time' && /Day 0\.00/.test(row.value)));
  assert.ok(manualView.rows.some((row) => row.label === 'Decision threshold' && /0\.0%/.test(row.value)));
  assert.deepEqual(manualView.actions.map((row) => row.id), [
    'asteroid.configuration.apply',
    'asteroid.configuration.reset',
    'asteroid.view.automatic',
  ]);
  const automatic = await instance.handleAction('asteroid.view.automatic');
  assert.equal(automatic.automaticView, true);
  assert.ok(instance.contributeV4().presentation.viewIntents.length > 0);
  const started = await instance.handleAction('scenario.run', {
    values: { ...values, phase: 'start' },
  });
  assert.equal(started.status, 'running');
  assert.equal(started.acceptedParameters.observationBudget, 7);
  const receiptCount = harness.receipts.length;
  const stepped = await instance.handleAction('scenario.run', { values: { ...values, phase: 'step' } });
  assert.equal(stepped.currentStep, 1);
  assert.equal(stepped.scenarioIdentity, started.scenarioIdentity);
  assert.equal(harness.receipts.length, receiptCount);
  const observedStage = instance.contributeV4();
  assert.equal(
    observedStage.presentation.layers.filter((row) => row.id.startsWith('jpl-neo-context:')).length,
    120
  );
  const composition = semanticCompositor.createCompositor({
    maxVisibleLayers: 300,
    maxLabels: 24,
  }).compose(observedStage.presentation, {
    viewport: { width: 1200, height: 800 },
    project: (position) => [
      600 + Number(position[0] || 0) * 100,
      400 + Number(position[1] || 0) * 100,
    ],
  });
  const catalogPrimitiveIds = composition.primitives
    .filter((row) => row.memberIds.some((id) => id.startsWith('jpl-neo-context:')))
    .flatMap((row) => row.memberIds);
  assert.equal(catalogPrimitiveIds.length, 120);
  assert.ok(composition.primitives
    .filter((row) => row.memberIds.some((id) => id.startsWith('jpl-neo-context:')))
    .every((row) => row.kind === 'point' && row.memberIds.length === 1));
  assert.equal(composition.receipt.representedLayerIds
    .filter((id) => id.startsWith('jpl-neo-context:')).length, 120);
  assert.ok(observedStage.presentation.layers.some((row) => row.id.startsWith('asteroid-observation:')));
  const replayed = await instance.handleAction('scenario.run', {
    scenario: { id: 'late-precision-observation', scenarioId: 'late-precision-observation', seed: 'asteroid-replay' },
    values: { ...values, phase: 'start' },
  });
  assert.deepEqual(replayed, started);
  const contribution = instance.contributeV4();
  assert.equal(contribution.schema, 'simulatte.pluginContribution.v4');
  assert.ok(contribution.presentation.viewIntents[0].targetIds.length > 0);
  assert.ok(contribution.presentation.viewIntents[0].targetIds.every((id) => (
    contribution.presentation.layers.some((row) => row.id === id)
  )));
  assert.deepEqual(contribution.controls.controls.map((row) => row.id).sort(), [
    'decisionPolicyId',
    'decisionThreshold',
    'ensembleSize',
    'followUpPolicyId',
    'interventionArchetypeId',
    'observationBudget',
    'observationCampaignId',
  ].sort());
  assert.ok(!contribution.inspections[0].fields.some((row) => row.id === 'screening-language'));
  assert.ok(contribution.inspections[0].fields.some((row) => row.id === 'logical-time' && row.unit === 'UTC'));
  assert.ok(contribution.inspections[0].fields.some((row) => row.id === 'decision-threshold' && row.value === 0));
  assert.ok(contribution.inspections[0].fields.some((row) => row.id === 'decision-state'));
  assert.ok(contribution.inspections[0].fields.some((row) => row.id === 'camera-authority' && /automatic/.test(row.value)));
  let terminal = replayed;
  let sawMovingActor = false;
  while (terminal.status === 'running') {
    terminal = await instance.handleAction('scenario.run', { values: { ...values, phase: 'step' } });
    const progressive = instance.contributeV4();
    if (progressive.state.status.includes('propagating')) {
      const actor = progressive.presentation.layers.find((row) => row.id === 'asteroid-active-clone');
      assert.equal(actor.quantity.kind, 'actor.asteroid.route-progress');
      assert.equal(progressive.presentation.viewIntents[0].mode, 'follow');
      assert.ok(progressive.presentation.viewIntents[0].targetIds.every((id) => (
        progressive.presentation.layers.some((row) => row.id === id && row.kind === 'actor')
      )));
      sawMovingActor = true;
    }
  }
  assert.equal(sawMovingActor, true);
  const settledContribution = instance.contributeV4();
  assert.ok(settledContribution.inspections[0].fields.some((row) => row.id === 'screening-language'));
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
    neoCatalog: rows['asteroid-jpl-neo-context-v1'],
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
