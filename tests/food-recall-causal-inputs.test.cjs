const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const engine = require('../public/shared/plugins/food-recall-us/food-engine.js');
const inputContext = require('../public/shared/plugins/food-recall-us/input-context.js');
const plugin = require('../public/shared/plugins/food-recall-us/index.js');
const contracts = require('../public/simulatte/platform/contracts/plugin-v4-contracts.js');
const randomApi = require('../public/simulatte/platform/plugin-host/plugin-random.js');
const schedulerApi = require('../public/simulatte/platform/plugin-host/plugin-scheduler.js');
const computeApi = require('../public/simulatte/platform/plugin-host/plugin-compute.js');
const environmentApi = require('../public/simulatte/platform/plugin-host/plugin-environment.js');

const root = path.resolve(__dirname, '..');
const pluginDirectory = path.join(root, 'public/shared/plugins/food-recall-us');
const manifest = json(path.join(pluginDirectory, 'plugin.json'));
const config = json(path.join(pluginDirectory, 'default-config.json'));
const values = new Map(manifest.datasets.map((row) => [
  row.id,
  json(path.resolve(pluginDirectory, row.reference.path)),
]));

function model() {
  return engine.compileModel({
    facilities: values.get('us.food.facilities.synthetic.v1').facilities,
    corridors: values.get('us.food.freight-corridors.v1').corridors,
    products: values.get('us.food.commodity-profiles.v1').products,
    hazards: values.get('us.food.hazard-model-registry.v1'),
    consumerZones: values.get('us.food.consumer-zones.v1'),
  });
}

function run(scenario, appliedInputs) {
  return runWithIntervention(scenario, appliedInputs, scenario.defaultIntervention);
}

function runWithIntervention(scenario, appliedInputs, intervention) {
  const random = randomApi.createRandomPort({
    rootSeed: 'food-causal-input-test',
    scenarioId: scenario.id,
  }).forPlugin('food-recall-us');
  const scheduler = schedulerApi.createSchedulerPort({}).forPlugin('food-recall-us');
  return engine.runScenario({
    model: model(),
    scenario,
    random,
    scheduler,
    intervention,
    inputContext: appliedInputs,
  });
}

function applied({ temperatureC, delayHours, availability, failureMultiplier = 1 }) {
  return {
    weather: { fieldIdentity: `weather:${temperatureC}` },
    logistics: { fieldIdentity: `logistics:${delayHours}:${availability}` },
    refrigeration: {
      fieldIdentity: `refrigeration:${failureMultiplier}`,
      forcedFailure: {
        corridorStage: 'distributor',
        repairHours: 18,
        ambientTempC: temperatureC,
      },
    },
    engineInputs: {
      ambientTemperatureC: temperatureC,
      logisticsDelayHours: delayHours,
      logisticsAvailability: availability,
      refrigerationSetpointC: 3.5,
      refrigerationTimeConstantHours: 6,
      refrigerationFailureRateMultiplier: failureMultiplier,
    },
  };
}

test('host weather and logistics capabilities resolve into immutable, traceable fields', () => {
  assert.equal(config.defaultScenarioId, 'scenario:egg-cold-chain');
  const calls = [];
  const sdk = {
    capabilities: {
      invoke(id, request) {
        calls.push({ id, request });
        if (id === 'field.weather.v1') {
          return {
            providerId: 'test-weather',
            value: 31,
            units: 'degC',
            sourceRowIds: ['station:KNYC:2026-07-01T12'],
            interpolation: 'nearest-hour',
            truth: {
              origin: 'observed',
              temporalStatus: 'historical',
              uncertainty: { kind: 'interval', value: { plusMinusC: 0.5 } },
            },
          };
        }
        return {
          providerId: 'test-logistics',
          value: 4,
          units: 'hours',
          transitDelayHoursPrior: 4,
          availabilityPrior: 0.82,
          sourceRowIds: ['service:food-freight:001'],
          truth: {
            origin: 'modeled',
            temporalStatus: 'forecast',
            uncertainty: { kind: 'distribution', value: { family: 'fixture' } },
          },
        };
      },
    },
  };
  const context = inputContext.resolve({
    sdk,
    model: model(),
    scenario: config.scenarios[1],
    environmentDataset: values.get('us.environment.snapshot.v1'),
  });
  assert.deepEqual(calls.map((row) => row.id), ['field.weather.v1', 'field.logistics-service.v1']);
  assert.equal(context.engineInputs.ambientTemperatureC, 31);
  assert.equal(context.engineInputs.logisticsDelayHours, 4);
  assert.equal(context.engineInputs.logisticsAvailability, 0.82);
  assert.equal(context.weather.sourceRowIds[0], 'station:KNYC:2026-07-01T12');
  assert.equal(context.weather.truth.origin, 'observed');
  assert.ok(Object.isFrozen(context));
});

test('temperature, refrigeration, and logistics inputs causally change timing, growth, detection, illnesses, and recall', () => {
  const scenario = config.scenarios[1];
  const cold = run(scenario, applied({ temperatureC: 5, delayHours: 0, availability: 1 }));
  const hotDelayed = run(scenario, applied({
    temperatureC: 35,
    delayHours: 10,
    availability: 0.7,
    failureMultiplier: 2,
  }));
  assert.ok(hotDelayed.shipmentDurationHours > cold.shipmentDurationHours);
  assert.ok(hotDelayed.refrigerationFailures >= cold.refrigerationFailures);
  assert.ok(hotDelayed.lots.reduce((sum, row) => sum + row.totalLoadCfu, 0)
    > cold.lots.reduce((sum, row) => sum + row.totalLoadCfu, 0));
  assert.notEqual(hotDelayed.trueIllnesses, cold.trueIllnesses);
  assert.notEqual(hotDelayed.observedCases, cold.observedCases);
  assert.notEqual(hotDelayed.detectionDay, cold.detectionDay);
  assert.notDeepEqual(hotDelayed.recall, cold.recall);
  assert.ok(hotDelayed.lineage.every((row, index, rows) => index === 0 || row.timeHours >= rows[index - 1].timeHours));
  assert.ok(hotDelayed.lineage.some((row) => row.inputFieldIds?.length === 3));
});

test('identical inputs and seeds replay byte-for-byte', () => {
  const scenario = config.scenarios[1];
  const inputs = applied({ temperatureC: 28, delayHours: 3, availability: 0.9 });
  assert.deepEqual(run(scenario, inputs), run(scenario, inputs));
});

test('recall targeting follows observable traceback rank and later action cannot recover more inventory', () => {
  const scenario = config.scenarios[1];
  const inputs = applied({ temperatureC: 28, delayHours: 3, availability: 0.9 });
  const early = runWithIntervention(scenario, inputs, {
    ...scenario.defaultIntervention,
    dayOffset: 0,
  });
  const late = runWithIntervention(scenario, inputs, {
    ...scenario.defaultIntervention,
    dayOffset: 14,
  });
  for (const result of [early, late]) {
    assert.equal(result.recall.targetSelectionBasis, 'traceback-ranking');
    assert.equal(result.recall.selectedTracebackRank, 1);
    assert.deepEqual(result.recall.targetTlcIds, [result.traceback[0].candidateId]);
    assert.equal(
      result.recall.casesAverted,
      Math.round(result.trueIllnesses * result.recall.recallSensitivity)
    );
  }
  assert.ok(late.recall.recallDay > early.recall.recallDay);
  assert.ok(late.recall.inInventoryFraction <= early.recall.inInventoryFraction);
  assert.ok(late.recall.contaminatedUnitsRemoved <= early.recall.contaminatedUnitsRemoved);
  assert.ok(late.recall.casesAverted <= early.recall.casesAverted);
});

test('plugin receipts, settlement, inspection, and v4 contribution expose applied causal inputs', async () => {
  let reducer = null;
  let state = null;
  const receipts = [];
  const sdk = {
    datasets: {
      require: (id) => values.get(id),
      receipt: (id) => {
        const declaration = manifest.datasets.find((row) => row.id === id);
        return declaration ? { id, sha256: declaration.reference.sha256 } : null;
      },
    },
    capabilities: {
      invoke(id) {
        if (id === 'field.weather.v1') {
          return {
            providerId: 'fixture-weather',
            value: 33,
            units: 'degC',
            sourceRowIds: ['fixture-weather:001'],
            truth: {
              origin: 'observed',
              temporalStatus: 'historical',
              uncertainty: { kind: 'interval', value: { plusMinusC: 1 } },
            },
          };
        }
        return {
          providerId: 'fixture-logistics',
          value: 6,
          units: 'hours',
          transitDelayHoursPrior: 6,
          availabilityPrior: 0.75,
          sourceRowIds: ['fixture-logistics:001'],
          truth: {
            origin: 'modeled',
            temporalStatus: 'forecast',
            uncertainty: { kind: 'distribution', value: { family: 'fixture' } },
          },
        };
      },
    },
    random: randomApi.createRandomPort({
      rootSeed: 'food-plugin-test',
      scenarioId: 'scenario:egg-cold-chain',
    }).forPlugin('food-recall-us'),
    scheduler: schedulerApi.createSchedulerPort({}).forPlugin('food-recall-us'),
    compute: computeApi.createComputePort({}).forPlugin('food-recall-us'),
    environment: environmentApi.createEnvironmentPort({
      snapshots: { 'us.environment.snapshot.v1': values.get('us.environment.snapshot.v1') },
    }).forPlugin('food-recall-us'),
    geography: {
      distanceMeters() {
        return 0;
      },
    },
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
  };
  const instance = await plugin.activate({
    sdk,
    config,
    scenario: { scenarioId: 'scenario:egg-cold-chain' },
  });
  const scenarioReceipt = receipts.find((row) => row.schema === 'simulatte.plugin.foodRecallScenarioReceipt.v3');
  assert.equal(scenarioReceipt.appliedInputs.weather.fieldIdentity.includes('weather'), true);
  assert.equal(scenarioReceipt.appliedInputs.logistics.transitDelayHoursPrior, 6);
  assert.equal(scenarioReceipt.causalOutcomes.shipmentDurationHours, state.run.shipmentDurationHours);
  const readyView = instance.view()[0];
  assert.ok(readyView.rows.some((row) => row.label === 'Ambient input'));
  assert.equal(readyView.rows.find((row) => row.label === 'Active layer').value, 'Baseline · no intervention applied');
  assert.equal(readyView.rows.find((row) => row.label === 'Resulting recall day').value, 'Not applied');
  assert.ok(readyView.fields.some((row) => row.id === 'recallDelayDays' && row.label === 'Delay after detection (days)'));
  assert.ok(readyView.actions.some((row) => row.id === 'recall.issue' && row.label === 'Apply intervention'));
  assert.equal(instance.settle().obligationResults.find((row) => row.obligationId.endsWith(':causal-inputs')).status, 'unmet');
  const readyContribution = instance.contributeV4();
  contracts.validateContribution(readyContribution);
  assert.ok(readyContribution.inspections[0].fields.some((row) => row.id === 'ambient-temperature'));
  assert.ok(readyContribution.provenanceRecords.some((row) => row.metadata.fieldIdentity === state.inputContext.weather.fieldIdentity));
  assert.equal(readyContribution.presentation.layers.filter((row) => row.id.startsWith('corridor:')).length, 0);
  assert.equal(instance.present().geoPaths.length, 0);
  let started = instance.handleAction('scenario.run', {
    values: { phase: 'start', recallDelayDays: 1, recallDepth: 'retail' },
  });
  assert.equal(started.status, 'running');
  assert.deepEqual(started.intervention, {
    dayOffset: 1,
    depth: 'retail',
    scope: config.scenarios[1].defaultIntervention.scope,
  });
  while (started.status === 'running') {
    started = instance.handleAction('scenario.run', { values: { phase: 'step' } });
  }
  assert.equal(started.status, 'settled');
  assert.equal(state.run.recall.dayOffset, 1);
  assert.equal(state.run.recall.depth, 'retail');
  assert.ok(Math.abs(state.run.recall.recallDay - (state.run.detectionDay + 1)) < 0.01);
  const settledView = instance.view()[0];
  assert.equal(settledView.rows.find((row) => row.label === 'Detected day').value, `day ${state.run.detectionDay}`);
  assert.equal(settledView.rows.find((row) => row.label === 'Resulting recall day').value, `day ${state.run.recall.recallDay}`);
  assert.match(settledView.rows.find((row) => row.label === 'Active layer').value, /Intervention · 1-day delay · retail/);
  assert.equal(instance.settle().obligationResults.find((row) => row.obligationId.endsWith(':causal-inputs')).status, 'settled');
  const contribution = instance.contributeV4();
  contracts.validateContribution(contribution);
  const activeCorridorIds = new Set(state.run.lineage.map((row) => row.corridorId).filter(Boolean));
  const corridorLayers = contribution.presentation.layers.filter((row) => row.id.startsWith('corridor:'));
  const facilityLayers = contribution.presentation.layers.filter((row) => row.id.startsWith('facility:'));
  const overview = contribution.presentation.viewIntents.find((row) => row.id === 'food-network-overview');
  assert.equal(corridorLayers.length, activeCorridorIds.size);
  assert.ok(corridorLayers.length < values.get('us.food.freight-corridors.v1').corridors.length);
  assert.ok(corridorLayers.every((row) => row.role === 'primary' && row.provenance.axes.origin === 'derived'));
  assert.ok(facilityLayers.every((row) => row.aggregationKey === null));
  assert.ok(corridorLayers.every((row) => overview.targetIds.includes(row.id)));
  assert.equal(instance.present().geoPaths.length, activeCorridorIds.size);
  assert.ok(receipts.some((row) => row.schema === 'simulatte.plugin.foodRecallInterventionReceipt.v2'));
  const interventionReceipt = receipts.find((row) => row.schema === 'simulatte.plugin.foodRecallInterventionReceipt.v2');
  assert.equal(interventionReceipt.metrics.recallDelayDays, 1);
  assert.equal(interventionReceipt.metrics.resultingRecallDay, state.run.recall.recallDay);
  const controls = instance.contributeV4().controls.controls;
  assert.ok(controls.some((row) => row.id === 'recallDelayDays' && row.label.includes('Delay after detection')));
  assert.equal(controls.some((row) => row.id === 'recallDay'), false);
});

function json(filename) {
  return JSON.parse(fs.readFileSync(filename, 'utf8'));
}
