#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import propagation from '../../public/shared/core/simulation/n-body-propagation.js';

const root = path.resolve(import.meta.dirname, '../..');
const directory = path.join(root, 'public/data/asteroid-defense');
fs.mkdirSync(directory, { recursive: true });
const GM_SUN = 0.0002959122082855911;
const scenarioTruth = truth('scenario', 'forecast', 'distribution', 'Synthetic campaign assumption.');
const modeledTruth = truth('modeled', 'forecast', 'distribution', 'Declared scientific model assumption.');

const definitions = [
  campaignDefinition('short-arc-follow-up', 2.5, 8, [0.9845, -0.008, 0.0012], [0.00022, 0.01729, -0.000018], 2.5),
  campaignDefinition('late-precision-observation', 14, 9, [0.983, -0.012, 0.0008], [0.00028, 0.01725, -0.000012], 2),
  campaignDefinition('keyhole-sensitive-encounter', 22, 12, [0.981, -0.016, 0.0003], [0.00034, 0.01720, -0.000006], 1.5),
  campaignDefinition('launch-reliability', 10, 10, [0.982, -0.011, 0.001], [0.0003, 0.01724, -0.000015], 2),
  campaignDefinition('false-alarm-calibration', 5, 8, [0.985, -0.009, 0.0045], [0.00020, 0.01731, 0.000025], 3),
];
const campaigns = definitions.map(buildCampaign);

write('synthetic-observation-campaigns-v1.json', {
  schema: 'simulatte.asteroidSyntheticCampaigns.v1',
  id: 'asteroid-synthetic-observation-campaigns-v1',
  generator: {
    id: 'asteroid-campaign-generator-v1',
    solarGmAu3Day2: GM_SUN,
    propagationMethodId: propagation.METHOD_ID,
    observationModel: 'heliocentric two-body state to geocentric angular line of sight',
    noiseModel: 'deterministic Box-Muller independent RA/Dec draws',
  },
  campaigns,
  claimBoundary: 'All public campaigns and measurements are synthetic; hidden state is evaluation truth only.',
});

write('observer-stations-v1.json', {
  schema: 'simulatte.asteroidObserverStations.v1',
  id: 'asteroid-observer-stations-v1',
  stations: [
    { id: 'scenario-north', label: 'Scenario northern station', longitudeDeg: -110.7, latitudeDeg: 32.4, elevationM: 2100, classification: 'scenario_station', truth: scenarioTruth },
    { id: 'scenario-south', label: 'Scenario southern station', longitudeDeg: -70.8, latitudeDeg: -30.2, elevationM: 2400, classification: 'scenario_station', truth: scenarioTruth },
  ],
});

write('force-models-v1.json', {
  schema: 'simulatte.asteroidForceModels.v1',
  id: 'asteroid-force-models-v1',
  models: [{
    id: 'heliocentric-two-body-screening-v1',
    referenceCenter: 'Sun',
    referenceFrame: 'ICRF ecliptic approximation',
    timeScale: 'TDB day offset',
    gmSunAu3Day2: GM_SUN,
    integrator: propagation.METHOD_ID,
    stepDays: 0.05,
    omissions: ['planetary third bodies', 'relativity', 'nongravitational acceleration', 'Earth gravity during close approach'],
    truth: modeledTruth,
  }],
});

write('intervention-archetypes-v1.json', {
  schema: 'simulatte.asteroidInterventionArchetypes.v1',
  id: 'asteroid-intervention-archetypes-v1',
  archetypes: [
    intervention('none', 'No intervention', 0, 1),
    intervention('kinetic-impactor', 'Synthetic kinetic impulse', 0.00000032, 0.82),
    intervention('reconnaissance-first', 'Observation campaign then bounded kinetic impulse', 0.00000024, 0.9),
    intervention('gravity-tractor', 'Synthetic accumulated low impulse', 0.00000008, 0.96),
  ],
});

write('execution-uncertainty-models-v1.json', {
  schema: 'simulatte.asteroidExecutionUncertainty.v1',
  id: 'asteroid-execution-uncertainty-models-v1',
  models: [{
    id: 'execution-independent-v1',
    launchFailureProbability: 0.1,
    navigationSigmaFraction: 0.12,
    deliverySigmaFraction: 0.08,
    momentumEnhancementMean: 1,
    momentumEnhancementSigma: 0.15,
    correlationAssumption: 'independent named deterministic streams',
    truth: modeledTruth,
  }],
});

write('decision-policies-v1.json', {
  schema: 'simulatte.asteroidDecisionPolicies.v1',
  id: 'asteroid-decision-policies-v1',
  policies: [
    { id: 'fixed-cadence', label: 'Fixed cadence', publicInputs: ['acquiredObservations', 'fitReceipt', 'observationBudget'], truth: scenarioTruth },
    { id: 'information-gain', label: 'Information-gain follow-up', publicInputs: ['acquiredObservations', 'fitCovariance', 'observationBudget'], truth: scenarioTruth },
    { id: 'act-at-threshold', label: 'Act at modeled threshold', publicInputs: ['fitReceipt', 'modeledEncounterDistribution', 'decisionThreshold'], truth: scenarioTruth },
    { id: 'observe-then-decide', label: 'Observe then decide', publicInputs: ['fitReceipt', 'fitCovariance', 'observationBudget', 'decisionThreshold'], truth: scenarioTruth },
  ],
  forbiddenInputs: ['hiddenInitialState', 'futureObservationOutcomes', 'executionDraws', 'trueEncounterOutcome'],
});

write('historical-benchmark-cases-v1.json', {
  schema: 'simulatte.asteroidHistoricalBenchmarks.v1',
  id: 'asteroid-historical-benchmark-cases-v1',
  cases: [{
    id: 'apophis-2029-api-identity',
    objectDesignation: '99942',
    expectedCloseApproachDatePrefix: '2029-Apr-13',
    expectedNominalDistanceAuRange: [0.00025, 0.00026],
    sourceSnapshotId: 'cad-apophis-2029',
    purpose: 'API parsing and units benchmark only',
    prohibitedUse: 'operational orbit, impact probability, or danger assessment',
    truth: truth('observed', 'snapshot', 'missing', 'Pinned agency output has its own source uncertainty fields.'),
  }],
});

write('model-governance-v1.json', {
  schema: 'simulatte.asteroidModelGovernance.v1',
  id: 'asteroid-model-governance-v1',
  algorithms: [
    { id: 'angular-lm-fit-v1', kind: 'weighted nonlinear least squares with central-difference Jacobian' },
    { id: propagation.METHOD_ID, kind: 'shared fixed-step RK4 two-body propagation' },
    { id: 'covariance-square-root-ensemble-v1', kind: 'deterministic Cholesky normal ensemble' },
    { id: 'encounter-screening-v1', kind: 'sampled closest approach and local encounter plane' },
  ],
  prohibitedClaims: [
    'public danger assessment',
    'operational Sentry reproduction',
    'launch or civil-defense recommendation',
    'validated impact probability',
    'navigation solution',
  ],
  publicClaim: 'Inside this declared simulation, the observation and intervention policy changed the modeled encounter distribution.',
});

write('provenance-registry-v1.json', {
  schema: 'simulatte.asteroidProvenanceRegistry.v1',
  id: 'asteroid-provenance-registry-v1',
  records: [
    record('asteroid-synthetic-observation-campaigns-v1', 'scenario'),
    record('asteroid-observer-stations-v1', 'scenario'),
    record('asteroid-force-models-v1', 'modeled'),
    record('asteroid-intervention-archetypes-v1', 'modeled'),
    record('asteroid-execution-uncertainty-models-v1', 'modeled'),
    record('asteroid-decision-policies-v1', 'scenario'),
    record('asteroid-historical-benchmark-cases-v1', 'observed'),
    record('asteroid-jpl-reference-snapshots-v1', 'observed'),
  ],
});

function campaignDefinition(id, arcDays, count, positionAu, velocityAuD, sigmaArcsec) {
  return { id, arcDays, count, positionAu, velocityAuD, sigmaArcsec };
}

function buildCampaign(definition) {
  const times = Array.from({ length: definition.count }, (_, index) => definition.arcDays * index / (definition.count - 1));
  const hiddenState = { positionAu: definition.positionAu, velocityAuD: definition.velocityAuD };
  const propagationReceipt = propagation.propagate({
    stateVector: hiddenState,
    startDay: 0,
    durationDays: definition.arcDays,
    stepDays: Math.min(0.05, definition.arcDays / 20),
    gmSunAuD2: GM_SUN,
    sampleLimit: 1024,
  });
  const observations = times.map((day, index) => {
    const asteroid = interpolate(propagationReceipt.trajectory, day);
    const earth = propagation.earthState(day, GM_SUN);
    const line = subtract(asteroid.positionAu, earth.positionAu);
    const noiseless = angles(line);
    const sigmaRad = definition.sigmaArcsec * Math.PI / (180 * 3600) * (index === definition.count - 1 && definition.id === 'late-precision-observation' ? 0.15 : 1);
    const noise = normalPair(`${definition.id}:${index}`);
    const observation = {
      id: `${definition.id}:obs-${String(index + 1).padStart(2, '0')}`,
      epochDayTdb: day,
      epochUtc: new Date(Date.parse('2036-01-01T00:00:00Z') + day * 86400000).toISOString(),
      stationId: index % 2 ? 'scenario-south' : 'scenario-north',
      rightAscensionRad: wrap(noiseless.rightAscensionRad + noise[0] * sigmaRad),
      declinationRad: noiseless.declinationRad + noise[1] * sigmaRad,
      covarianceRad2: [[sigmaRad ** 2, 0], [0, sigmaRad ** 2]],
      referenceFrame: 'ICRF ecliptic approximation',
      corrections: { lightTime: 'omitted', aberration: 'omitted', topocentricParallax: 'station identity retained; Earth-center approximation' },
      truth: scenarioTruth,
    };
    return { ...observation, rowId: observation.id, rowHash: sha256(stable(observation)) };
  });
  const initialGuess = {
    positionAu: hiddenState.positionAu.map((value, index) => value + [0.00001, -0.000008, 0.000005][index]),
    velocityAuD: hiddenState.velocityAuD.map((value, index) => value + [0.0000002, -0.00000015, 0.00000008][index]),
  };
  return {
    id: definition.id,
    label: definition.id.replaceAll('-', ' '),
    referenceEpochTdbDay: 0,
    startInstant: '2036-01-01T00:00:00Z',
    terminalDay: 90,
    initialGuess,
    rangePriorAu: 0.02,
    observations,
    hiddenTruth: {
      schema: 'simulatte.asteroidHiddenTruth.v1',
      id: `${definition.id}:hidden`,
      initialState: hiddenState,
      truthHash: sha256(stable(hiddenState)),
      classification: 'hidden synthetic evaluation truth',
    },
    truth: scenarioTruth,
  };
}

function intervention(id, label, deltaVAuD, reliability) {
  return { id, label, deltaVAuD, reliability, decisionDay: 20, direction: 'encounter-plane-normal-screening', truth: modeledTruth };
}

function interpolate(rows, day) {
  const upperIndex = rows.findIndex((row) => row.day >= day);
  if (upperIndex < 0) return rows.at(-1);
  if (upperIndex === 0) return rows[0];
  const a = rows[upperIndex - 1];
  const b = rows[upperIndex];
  const ratio = (day - a.day) / (b.day - a.day);
  return {
    positionAu: a.positionAu.map((value, index) => value + (b.positionAu[index] - value) * ratio),
    velocityAuD: a.velocityAuD.map((value, index) => value + (b.velocityAuD[index] - value) * ratio),
  };
}

function angles(vector) {
  const radius = Math.hypot(...vector);
  return { rightAscensionRad: Math.atan2(vector[1], vector[0]), declinationRad: Math.asin(vector[2] / radius) };
}
function subtract(a, b) { return a.map((row, index) => row - b[index]); }
function wrap(value) { return Math.atan2(Math.sin(value), Math.cos(value)); }
function normalPair(seed) {
  const a = Math.max(1e-12, unit(`${seed}:a`));
  const b = unit(`${seed}:b`);
  const radius = Math.sqrt(-2 * Math.log(a));
  return [radius * Math.cos(2 * Math.PI * b), radius * Math.sin(2 * Math.PI * b)];
}
function unit(seed) { return Number.parseInt(sha256(seed).slice(0, 8), 16) / 0xffffffff; }
function record(datasetId, origin) {
  return {
    id: `provenance:${datasetId}`,
    datasetId,
    origin,
    temporalStatus: origin === 'observed' ? 'snapshot' : 'forecast',
    uncertainty: { kind: 'missing', value: { reason: origin === 'observed' ? 'Source-specific fields retained.' : 'Declared scenario/model assumption.' } },
    artifactHashBinding: 'dataset-manifest',
    transformationChain: ['asteroid-defense-data-v1'],
    contentVersion: 'v1',
  };
}
function truth(origin, temporalStatus, kind, interpretation) {
  return { origin, temporalStatus, uncertainty: { kind, value: { interpretation } } };
}
function write(name, value) {
  fs.writeFileSync(path.join(directory, name), `${JSON.stringify(value, null, 2)}\n`);
  console.log(`ASTEROID-DATA wrote=${name}`);
}
function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
