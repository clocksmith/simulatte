#!/usr/bin/env node
// Governed data generation for food-recall-us (TODO_PLUGINS §5, §6).
//
// Public federal data can calibrate and validate the simulator, but it cannot
// reconstruct complete commercial consignee networks. So the runtime datasets are
// generated **synthetic / aggregate**, each carrying an explicit claim boundary, a
// content hash, and a provenance block. The fetch-*.mjs scripts (real federal APIs)
// pin observed snapshots separately; nothing here performs live network access.
//
// Every dataset is deterministic: it is produced from a fixed named RNG stream, so the
// same generator version always yields byte-identical output (and therefore a stable
// sha256 the plugin manifest can lock).
import { writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { STATE_CENTROIDS, HUB_CITIES } from './geo-reference.mjs';

const require = createRequire(import.meta.url);
const randomApi = require('../../public/simulatte/platform/plugin-host/plugin-random.js');

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
const outDir = join(repoRoot, 'public', 'data', 'food-recall-us');

const CLAIM_BOUNDARY = 'Synthetic aggregate data generated from public priors. Facilities, lots, shipments, and consumer zones are statistically generated, never observed commercial records. This is not a live recall alert, regulatory classification, or a representation of a real supply chain.';

function port(streamName) {
  return randomApi.createRandomPort({ rootSeed: 'food-recall-us-data-v1', scenarioId: null })
    .forPlugin('food-recall-us')
    .stream(streamName);
}

function jitter(rng, value, spread) {
  return Number((value + (rng.next() - 0.5) * spread).toFixed(4));
}

// ---- Facilities (simulatte.usFoodFacility.v1) --------------------------------------
function buildFacilities() {
  const rng = port('facilities');
  const facilities = [];
  const kinds = [
    { kind: 'grower', role: 'produce_origin', count: 2, capabilities: ['harvesting', 'cooling'] },
    { kind: 'initial_packer', role: 'produce_origin', count: 1, capabilities: ['cooling', 'initial_packing'] },
    { kind: 'processor', role: 'distribution', count: 1, capabilities: ['transformation', 'fresh_cut_transformation', 'storage'] },
    { kind: 'distributor', role: 'distribution', count: 1, capabilities: ['storage', 'shipping'] },
    { kind: 'retailer', role: 'consumer', count: 2, capabilities: ['retail_sale', 'storage'] },
    { kind: 'restaurant', role: 'consumer', count: 1, capabilities: ['food_service_sale'] },
  ];
  HUB_CITIES.forEach((hub) => {
    kinds.filter((row) => row.role === hub.role).forEach((row) => {
      for (let index = 0; index < row.count; index += 1) {
        const id = `facility:synthetic:${hub.state.toLowerCase()}:${row.kind}:${String(facilities.length).padStart(4, '0')}`;
        facilities.push({
          schema: 'simulatte.usFoodFacility.v1',
          id,
          label: `Synthetic ${hub.state} ${row.kind.replace(/_/g, ' ')} ${index + 1}`,
          provenanceKind: 'synthetic',
          facilityKind: row.kind,
          jurisdiction: 'FDA',
          location: {
            longitude: jitter(rng, hub.longitude, 0.6),
            latitude: jitter(rng, hub.latitude, 0.4),
            state: hub.state,
          },
          capabilities: row.capabilities,
          traceability: {
            supportedCtes: row.capabilities,
            recordCompletenessPrior: Number((0.82 + rng.next() * 0.16).toFixed(3)),
            notificationDelayHours: { distribution: 'lognormal', parameters: { mu: 1.6, sigma: 0.5 } },
          },
          coldStorage: {
            capacityKg: 50000 + Math.round(rng.next() * 400000),
            setpointC: Number((2.5 + rng.next() * 2).toFixed(2)),
            thermalTimeConstantHours: Number((3 + rng.next() * 4).toFixed(2)),
          },
        });
      }
    });
  });
  return facilities;
}

// ---- Freight corridors (facility -> facility, aggregate priors) --------------------
function buildCorridors(facilities) {
  const rng = port('corridors');
  const byKind = (kind) => facilities.filter((row) => row.facilityKind === kind);
  const chain = ['grower', 'initial_packer', 'processor', 'distributor', 'retailer'];
  const corridors = [];
  for (let stage = 0; stage < chain.length - 1; stage += 1) {
    const heads = byKind(chain[stage]);
    const tails = byKind(chain[stage + 1]);
    heads.forEach((head) => {
      tails.forEach((tail) => {
        corridors.push({
          id: `corridor:${head.id}->${tail.id}`,
          fromFacilityId: head.id,
          toFacilityId: tail.id,
          refrigerated: true,
          meanTransitHours: Number((6 + rng.next() * 60).toFixed(2)),
          transitHours: { distribution: 'lognormal', parameters: { mu: Number((Math.log(6 + rng.next() * 40)).toFixed(3)), sigma: 0.4 } },
          reeferFailureRatePerHour: Number((0.0004 + rng.next() * 0.0012).toFixed(6)),
          ambientTempC: Number((14 + rng.next() * 18).toFixed(2)),
          provenanceKind: 'synthetic_aggregate',
        });
      });
    });
  }
  // Distributor -> restaurant (food service).
  byKind('distributor').forEach((head) => byKind('restaurant').forEach((tail) => corridors.push({
    id: `corridor:${head.id}->${tail.id}`,
    fromFacilityId: head.id, toFacilityId: tail.id, refrigerated: true,
    meanTransitHours: Number((8 + rng.next() * 40).toFixed(2)),
    transitHours: { distribution: 'lognormal', parameters: { mu: 2.6, sigma: 0.4 } },
    reeferFailureRatePerHour: Number((0.0004 + rng.next() * 0.0012).toFixed(6)),
    ambientTempC: Number((14 + rng.next() * 18).toFixed(2)),
    provenanceKind: 'synthetic_aggregate',
  })));
  return corridors;
}

// ---- Commodity profiles (simulatte.usFoodProduct.v1) -------------------------------
function buildCommodities() {
  return [
    {
      schema: 'simulatte.usFoodProduct.v1', id: 'product:fresh-romaine', commodity: 'leafy_greens', form: 'fresh',
      isFtlFood: true, defaultUnitMassKg: 0.34, shelfLifeDays: { distribution: 'lognormal', parameters: { mu: 2.4, sigma: 0.3 } },
      preparationProfiles: [{ id: 'raw-no-kill-step', probability: 1.0, logReduction: 0 }],
    },
    {
      schema: 'simulatte.usFoodProduct.v1', id: 'product:shell-eggs', commodity: 'shell_eggs', form: 'fresh',
      isFtlFood: true, defaultUnitMassKg: 0.6, shelfLifeDays: { distribution: 'lognormal', parameters: { mu: 3.4, sigma: 0.2 } },
      preparationProfiles: [
        { id: 'cooked', probability: 0.75, logReduction: 6 },
        { id: 'undercooked', probability: 0.2, logReduction: 2 },
        { id: 'raw', probability: 0.05, logReduction: 0 },
      ],
    },
    {
      schema: 'simulatte.usFoodProduct.v1', id: 'product:rte-soft-cheese', commodity: 'ready_to_eat_dairy', form: 'ready_to_eat',
      isFtlFood: true, defaultUnitMassKg: 0.2, shelfLifeDays: { distribution: 'lognormal', parameters: { mu: 3.7, sigma: 0.4 } },
      preparationProfiles: [{ id: 'ready-to-eat-no-kill-step', probability: 1.0, logReduction: 0 }],
    },
    {
      schema: 'simulatte.usFoodProduct.v1', id: 'product:packaged-cookie', commodity: 'packaged_bakery', form: 'shelf_stable',
      isFtlFood: false, defaultUnitMassKg: 0.3, shelfLifeDays: { distribution: 'lognormal', parameters: { mu: 4.6, sigma: 0.3 } },
      preparationProfiles: [{ id: 'ready-to-eat-no-kill-step', probability: 1.0, logReduction: 0 }],
    },
  ];
}

// ---- Hazard model registry (growth, thermal, dose-response) ------------------------
function buildHazardRegistry() {
  return {
    schema: 'simulatte.usFoodHazardRegistry.v1',
    version: 'food-recall-hazard-registry-1.0.0',
    claimBoundary: 'Illustrative parameter sets drawn from published predictive-microbiology and QMRA ranges. Not a validated regulatory model. Dose-response is stratified by pathogen, food category, endpoint, and population.',
    hazards: [
      {
        id: 'ecoli-o157', family: 'microbial_pathogen', label: 'E. coli O157:H7',
        growth: { model: 'ratkowsky_sqrt', tMinC: 3.5, bPerSqrtC: 0.023, nMaxLog10CfuPerG: 9.0, lagHours: 6 },
        thermal: { dRefMin: 0.35, tRefC: 60, zC: 5.6 },
        doseResponse: [
          { foodCategory: 'leafy_greens', populationStratum: 'general', endpoint: 'illness', modelFamily: 'beta_poisson', parameters: { alpha: 0.49, beta: 1.5e5 }, validDoseRangeCfu: { min: 1, max: 1e9 } },
        ],
      },
      {
        id: 'salmonella', family: 'microbial_pathogen', label: 'Salmonella spp.',
        growth: { model: 'ratkowsky_sqrt', tMinC: 5.2, bPerSqrtC: 0.03, nMaxLog10CfuPerG: 9.0, lagHours: 4 },
        thermal: { dRefMin: 0.6, tRefC: 60, zC: 5.0 },
        doseResponse: [
          { foodCategory: 'shell_eggs', populationStratum: 'general', endpoint: 'illness', modelFamily: 'beta_poisson', parameters: { alpha: 0.3126, beta: 2884 }, validDoseRangeCfu: { min: 1, max: 1e9 } },
        ],
      },
      {
        id: 'listeria-monocytogenes', family: 'microbial_pathogen', label: 'Listeria monocytogenes',
        growth: { model: 'ratkowsky_sqrt', tMinC: -1.5, bPerSqrtC: 0.025, nMaxLog10CfuPerG: 8.0, lagHours: 12 },
        thermal: { dRefMin: 2.0, tRefC: 60, zC: 6.0 },
        doseResponse: [
          { foodCategory: 'ready_to_eat_dairy', populationStratum: 'older-or-immunocompromised', endpoint: 'invasive-listeriosis', modelFamily: 'exponential', parameters: { r: 1.06e-12 }, validDoseRangeCfu: { min: 1, max: 1e11 } },
          { foodCategory: 'ready_to_eat_dairy', populationStratum: 'general', endpoint: 'invasive-listeriosis', modelFamily: 'exponential', parameters: { r: 2.37e-14 }, validDoseRangeCfu: { min: 1, max: 1e11 } },
        ],
      },
      {
        id: 'undeclared-peanut', family: 'undeclared_allergen', label: 'Undeclared peanut',
        allergen: { susceptibleFraction: 0.011, reactionThresholdMg: 1.5, severeReactionFraction: 0.08 },
      },
    ],
    // Surveillance/detection stage timing distributions (hours) — §7.9.
    surveillanceStages: {
      incubationHours: { distribution: 'lognormal', parameters: { mu: 4.0, sigma: 0.5 } },
      onsetToCareHours: { distribution: 'lognormal', parameters: { mu: 3.4, sigma: 0.6 } },
      careToSpecimenHours: { distribution: 'lognormal', parameters: { mu: 3.0, sigma: 0.5 } },
      specimenToSequenceHours: { distribution: 'lognormal', parameters: { mu: 5.0, sigma: 0.4 } },
      sequenceToClusterHours: { distribution: 'lognormal', parameters: { mu: 4.3, sigma: 0.5 } },
      clusterToTracebackHours: { distribution: 'lognormal', parameters: { mu: 4.6, sigma: 0.5 } },
      observationProbabilities: { care: 0.64, sample: 0.45, report: 0.9 },
    },
  };
}

// ---- Consumer zones (aggregate population, high-risk fraction) ---------------------
function buildConsumerZones() {
  const rng = port('consumer-zones');
  const zones = Object.entries(STATE_CENTROIDS).map(([state, [latitude, longitude]]) => ({
    id: `zone:${state.toLowerCase()}`,
    state,
    location: { longitude, latitude },
    population: 300000 + Math.round(rng.next() * 9000000),
    highRiskFraction: Number((0.12 + rng.next() * 0.1).toFixed(3)),
    provenanceKind: 'synthetic_from_public_priors',
  }));
  return { schema: 'simulatte.usFoodConsumerZones.v1', claimBoundary: CLAIM_BOUNDARY, zones };
}

// ---- Historical recalls (normalized observed/aggregate) ----------------------------
function buildHistoricalRecalls() {
  return {
    schema: 'simulatte.usFoodHistoricalRecalls.v1',
    claimBoundary: 'Normalized public enforcement records. openFDA warns it is not a recall-lifecycle tracker; facility-level distribution paths are not reconstructed. Records marked observed=true are public facts; all network topology remains synthetic.',
    records: [
      { id: 'recall:hist:2018-leafy-green', regulator: 'FDA', class: 'I', commodity: 'leafy_greens', hazard: 'ecoli-o157', reportedIllnesses: 210, states: 36, observed: true, distributionPattern: 'nationwide' },
      { id: 'recall:hist:2010-shell-eggs', regulator: 'FDA', class: 'I', commodity: 'shell_eggs', hazard: 'salmonella', reportedIllnesses: 1900, states: 22, observed: true, distributionPattern: 'nationwide' },
      { id: 'recall:hist:2011-cantaloupe', regulator: 'FDA', class: 'I', commodity: 'ready_to_eat_dairy', hazard: 'listeria-monocytogenes', reportedIllnesses: 147, states: 28, observed: true, distributionPattern: 'multistate' },
    ],
  };
}

function buildEnvironmentSnapshot() {
  return {
    schema: 'simulatte.usEnvironmentSnapshot.v1',
    id: 'us.environment.snapshot.v1',
    claimBoundary: 'Pinned analytic environment field seeded for reproducibility. Not observed NOAA weather. A live mode would require the host to capture and hash all returned observations.',
    sourceSnapshotIds: ['noaa-environment-2026-07-21-analytic-v1', 'traffic-scenario-baseline-v1'],
    fields: ['airTemperatureC', 'precipitationMmHr', 'windSpeedMps', 'solarElevationDegrees', 'trafficMultiplier'],
    spatialResolutionKm: 25,
    temporalResolutionMinutes: 60,
  };
}

function govern(id, schemaId, body) {
  const value = { id, datasetId: id, datasetSchemaId: schemaId, schema: schemaId, ...body, generatedBy: 'tools/food-recall-us/build-food-data.mjs', generatorVersion: 'food-recall-data-1.0.0' };
  return value;
}

function writeDataset(fileName, value) {
  const text = `${JSON.stringify(value, null, 2)}\n`;
  const path = join(outDir, fileName);
  writeFileSync(path, text);
  const sha256 = createHash('sha256').update(text).digest('hex');
  return { fileName, sha256 };
}

function main() {
  mkdirSync(outDir, { recursive: true });
  const facilities = buildFacilities();
  const corridors = buildCorridors(facilities);
  const outputs = [
    ['facilities-synthetic-v1.json', 'us.food.facilities.synthetic.v1', 'simulatte.usFoodFacilityCatalog.v1', { claimBoundary: CLAIM_BOUNDARY, facilities }],
    ['freight-corridors-v1.json', 'us.food.freight-corridors.v1', 'simulatte.usFoodFreightCorridors.v1', { claimBoundary: CLAIM_BOUNDARY, corridors }],
    ['commodity-profiles-v1.json', 'us.food.commodity-profiles.v1', 'simulatte.usFoodCommodityProfiles.v1', { claimBoundary: CLAIM_BOUNDARY, products: buildCommodities() }],
    ['hazard-model-registry-v1.json', 'us.food.hazard-model-registry.v1', 'simulatte.usFoodHazardRegistry.v1', buildHazardRegistry()],
    ['consumer-zones-v1.json', 'us.food.consumer-zones.v1', 'simulatte.usFoodConsumerZones.v1', buildConsumerZones()],
    ['historical-recalls-v1.json', 'us.food.historical-recalls.v1', 'simulatte.usFoodHistoricalRecalls.v1', buildHistoricalRecalls()],
    ['environment-snapshot-v1.json', 'us.environment.snapshot.v1', 'simulatte.usEnvironmentSnapshot.v1', buildEnvironmentSnapshot()],
  ];
  const receipts = outputs.map(([fileName, datasetId, schemaId, body]) => {
    const { sha256 } = writeDataset(fileName, govern(datasetId, schemaId, body));
    return { datasetId, schemaId, path: `../../../data/food-recall-us/${fileName}`, sha256 };
  });
  writeFileSync(join(outDir, 'dataset-manifest.json'), `${JSON.stringify({ schema: 'simulatte.foodDataManifest.v1', generatedAt: '2026-07-21', datasets: receipts }, null, 2)}\n`);
  process.stdout.write('food-recall-us governed datasets:\n');
  receipts.forEach((row) => process.stdout.write(`  ${row.datasetId}  sha256=${row.sha256}\n`));
}

main();
