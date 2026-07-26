#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const directory = path.join(root, 'public/data/grid-resilience-us');
fs.mkdirSync(directory, { recursive: true });

const scenarioTruth = truth('scenario', 'forecast', 'distribution', {
  interpretation: 'Declared experiment assumption; not an operating-system forecast.',
});
const modeledTruth = truth('modeled', 'forecast', 'distribution', {
  interpretation: 'Aggregate authored representation calibrated only to order-of-magnitude public snapshots.',
});
const regions = [
  { id: 'west', respondent: 'CISO', name: 'West aggregate', coordinates: [-119.5, 37.2] },
  { id: 'texas', respondent: 'ERCO', name: 'Texas aggregate', coordinates: [-99.2, 31.2] },
  { id: 'central', respondent: 'MISO', name: 'Central aggregate', coordinates: [-91.5, 41.5] },
  { id: 'east', respondent: 'PJM', name: 'East aggregate', coordinates: [-78.4, 39.6] },
];

write('regional-interface-scenarios-v1.json', {
  schema: 'simulatte.gridRegionalInterfaceScenarios.v1',
  id: 'grid-regional-interface-scenarios-v1',
  regions: regions.map((row) => ({ ...row, geometryClassification: 'modeled_display_anchor', truth: modeledTruth })),
  interfaces: [
    link('west-central', 'west', 'central', 5200),
    link('west-texas', 'west', 'texas', 3200),
    link('texas-central', 'texas', 'central', 4600),
    link('central-east', 'central', 'east', 7200),
    link('texas-east', 'texas', 'east', 2800),
  ],
  claimBoundary: 'Aggregate authored interfaces are not physical transmission lines or protected topology.',
});

write('resource-archetypes-v1.json', {
  schema: 'simulatte.gridResourceArchetypes.v1',
  id: 'grid-resource-archetypes-v1',
  blocks: regions.flatMap((region, regionIndex) => [
    resource(region.id, 'firm-zero-carbon', 0.31, 8 + regionIndex, 0.02, 0.02, 0.02),
    resource(region.id, 'variable-renewable', 0.25, 3, 0, 1, 1),
    resource(region.id, 'efficient-gas', 0.28, 46, 0.39, 0.35, 0.35),
    resource(region.id, 'peaking', 0.16, 125, 0.62, 1, 1),
  ]),
  truth: modeledTruth,
});

write('storage-archetypes-v1.json', {
  schema: 'simulatte.gridStorageArchetypes.v1',
  id: 'grid-storage-archetypes-v1',
  storage: regions.map((region, index) => ({
    id: `storage-${region.id}`,
    regionId: region.id,
    powerFractionOfPeakDemand: 0.06 + index * 0.005,
    durationHours: 4,
    initialStateOfChargeFraction: 0.68,
    minimumStateOfChargeFraction: 0.08,
    chargeEfficiency: 0.94,
    dischargeEfficiency: 0.92,
    degradationCostUsdPerMwh: 7,
    truth: modeledTruth,
  })),
});

write('disturbance-scenarios-v1.json', {
  schema: 'simulatte.gridDisturbanceScenarios.v1',
  id: 'grid-disturbance-scenarios-v1',
  scenarios: [
    disturbance('heat-demand-peak', 'Temperature-linked aggregate demand uplift', {
      demandMultiplierByRegion: { west: 1.12, texas: 1.18, central: 1.1, east: 1.13 },
      unavailableResourceFractions: {},
      unavailableInterfaceIds: [],
    }),
    disturbance('generator-outage-cluster', 'Seeded aggregate resource unavailability', {
      demandMultiplierByRegion: { west: 1, texas: 1.04, central: 1.02, east: 1 },
      unavailableResourceFractions: { 'texas:efficient-gas': 0.42, 'central:firm-zero-carbon': 0.3 },
      unavailableInterfaceIds: [],
    }),
    disturbance('renewable-forecast-error', 'Common renewable shortfall realization', {
      demandMultiplierByRegion: { west: 1.03, texas: 1.03, central: 1.03, east: 1.03 },
      unavailableResourceFractions: {
        'west:variable-renewable': 0.48,
        'texas:variable-renewable': 0.35,
        'central:variable-renewable': 0.3,
        'east:variable-renewable': 0.25,
      },
      unavailableInterfaceIds: [],
    }),
    disturbance('interface-loss', 'One aggregate transfer interface unavailable', {
      demandMultiplierByRegion: { west: 1, texas: 1.05, central: 1.04, east: 1.06 },
      unavailableResourceFractions: {},
      unavailableInterfaceIds: ['central-east'],
    }),
    disturbance('restoration-sequence', 'Aggregate interface and resource outages with repair dependencies', {
      demandMultiplierByRegion: { west: 1, texas: 1.08, central: 1.06, east: 1.08 },
      unavailableResourceFractions: { 'central:efficient-gas': 0.38, 'east:peaking': 0.55 },
      unavailableInterfaceIds: ['central-east'],
    }),
  ],
});

write('restoration-resources-v1.json', {
  schema: 'simulatte.gridRestorationResources.v1',
  id: 'grid-restoration-resources-v1',
  crews: [
    { id: 'crew-west', homeRegionId: 'west', skillIds: ['resource', 'interface'], truth: scenarioTruth },
    { id: 'crew-central', homeRegionId: 'central', skillIds: ['resource', 'interface'], truth: scenarioTruth },
  ],
  tasks: [
    task('restore-central-east', 'interface', 'central-east', [], 4),
    task('restore-central-gas', 'resource', 'central:efficient-gas', [], 3),
    task('restore-east-peaker', 'resource', 'east:peaking', ['restore-central-east'], 2),
    task('restore-texas-gas', 'resource', 'texas:efficient-gas', [], 3),
  ],
  truth: scenarioTruth,
});

write('model-governance-v1.json', {
  schema: 'simulatte.gridModelGovernance.v1',
  id: 'grid-model-governance-v1',
  algorithms: [
    { id: 'interface-constrained-dispatch-v1', kind: 'deterministic_lexicographic_dispatch', limitation: 'Aggregate active-power accounting only; no AC or contingency model.' },
    { id: 'storage-transition-v1', kind: 'bounded_energy_state_transition', limitation: 'Aggregate storage archetypes, not actual assets.' },
    { id: 'restoration-state-machine-v1', kind: 'dependency_and_crew_scheduler', limitation: 'Scenario crews and durations.' },
    { id: 'grid-ensemble-v1', kind: 'declared_seed_sensitivity', limitation: 'Scenario variance, not calibrated forecast uncertainty.' },
  ],
  prohibitedClaims: [
    'protected or exact grid topology',
    'security-constrained dispatch',
    'AC power flow or cascading outage realism',
    'operational blackout forecast',
    'utility control-room recommendation',
  ],
  publicClaim: 'Under the declared regional model and disturbance, the intervention changed modeled unserved energy, reserve margin, storage use, and emissions.',
});

write('provenance-registry-v1.json', {
  schema: 'simulatte.gridProvenanceRegistry.v1',
  id: 'grid-provenance-registry-v1',
  records: [
    provenance('grid-eia-balancing-authority-hourly-v1', 'observed', ['eia:*'], 'Agency-reported demand aggregates'),
    provenance('grid-eia-generation-mix-hourly-v1', 'observed', ['eia:*'], 'Agency-reported generation-by-fuel aggregates'),
    provenance('grid-noaa-weather-stations-v1', 'observed', ['noaa:*:station'], 'Station metadata'),
    provenance('grid-noaa-weather-observations-v1', 'observed', ['noaa:*'], 'Historical station observations'),
    provenance('grid-regional-interface-scenarios-v1', 'modeled', [], 'Authored aggregate geography and interface limits'),
    provenance('grid-resource-archetypes-v1', 'modeled', [], 'Authored aggregate resource blocks'),
    provenance('grid-storage-archetypes-v1', 'modeled', [], 'Authored aggregate storage'),
    provenance('grid-disturbance-scenarios-v1', 'scenario', [], 'Declared disruptions'),
    provenance('grid-restoration-resources-v1', 'scenario', [], 'Declared crews, durations, and dependencies'),
  ],
});

function link(id, fromRegionId, toRegionId, limitMw) {
  return { id, fromRegionId, toRegionId, forwardLimitMw: limitMw, reverseLimitMw: limitMw, truth: modeledTruth };
}

function resource(regionId, kind, capacityFractionOfPeakDemand, variableCostUsdPerMwh, emissionsTonsPerMwh, rampUpFraction, rampDownFraction) {
  return {
    id: `${regionId}:${kind}`,
    regionId,
    kind,
    capacityFractionOfPeakDemand,
    minimumOutputFraction: kind === 'firm-zero-carbon' ? 0.55 : 0,
    variableCostUsdPerMwh,
    emissionsTonsPerMwh,
    rampUpFraction,
    rampDownFraction,
    truth: modeledTruth,
  };
}

function disturbance(id, name, assumptions) {
  return { id, name, ...assumptions, truth: scenarioTruth };
}

function task(id, targetKind, targetId, dependencyIds, durationHours) {
  return { id, targetKind, targetId, dependencyIds, durationHours, attemptSuccessProbability: 0.88, truth: scenarioTruth };
}

function provenance(datasetId, origin, rowIdPatterns, claim) {
  return {
    id: `provenance:${datasetId}`,
    datasetId,
    origin,
    temporalStatus: origin === 'observed' ? 'historical' : 'forecast',
    uncertainty: origin === 'observed'
      ? { kind: 'missing', value: { reason: 'Source-specific uncertainty or revision flags retained where available.' } }
      : { kind: 'distribution', value: { interpretation: 'Declared aggregate experiment assumption.' } },
    rowIdPatterns,
    artifactHashBinding: 'dataset-manifest',
    transformationChain: ['grid-resilience-data-v1'],
    contentVersion: 'v1',
    claim,
  };
}

function truth(origin, temporalStatus, kind, value) {
  return { origin, temporalStatus, uncertainty: { kind, value } };
}

function write(name, value) {
  fs.writeFileSync(path.join(directory, name), `${JSON.stringify(value, null, 2)}\n`);
  console.log(`GRID-DATA wrote=${name} sha256=${sha256(JSON.stringify(value)).slice(0, 12)}`);
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}
