#!/usr/bin/env node
// Governed data generation for maritime-trade-global (TODO spec §A "Governed datasets").
//
// Global schedules are synthetic scenarios anchored to official port and performance
// datasets, not invented "live" ships. Every dataset is deterministic (seeded RNG), each
// carries a claim boundary + provenance, and each is content-hashed so a plugin manifest
// can lock it. The fetch-*.mjs tools pin the real NGA/UN/NOAA/World Bank snapshots
// separately; nothing here performs live network access.
import { writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { PORTS, CANALS, CORRIDORS, haversineKm, portsById } from './maritime-geo-reference.mjs';

const require = createRequire(import.meta.url);
const randomApi = require('../../public/simulatte/platform/plugin-host/plugin-random.js');
const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', '..', 'public', 'data', 'maritime-trade-global');

const CLAIM = 'Synthetic aggregate data anchored to official port and performance datasets. Ports and codes are public reference data; schedules, queues, corridors, and vessels are statistically generated, never observed AIS positions or carrier schedules. Not a live tracking or ETA system.';

function stream(name) {
  return randomApi.createRandomPort({ rootSeed: 'maritime-trade-global-data-v1' }).forPlugin('maritime-trade-global').stream(name);
}

function buildPortRegistry() {
  const rng = stream('ports');
  const ports = PORTS.map(([id, name, unlocode, country, lat, lon, harborSize]) => ({
    id: `port:${id}`, name, unlocode, country,
    location: { longitude: lon, latitude: lat },
    harborSize, berthCount: harborSize === 'L' ? 8 + Math.round(rng.next() * 12) : 3 + Math.round(rng.next() * 6),
    provenanceKind: 'public_reference_port',
  }));
  return { schema: 'simulatte.maritimePortRegistry.v1', source: 'NGA World Port Index (public reference)', claimBoundary: CLAIM, ports };
}

function buildUnlocode() {
  const codes = PORTS.map(([id, name, unlocode, country, lat, lon]) => ({ unlocode, country, name, portId: `port:${id}`, coordinates: { longitude: lon, latitude: lat } }));
  return { schema: 'simulatte.unlocodeRegistry.v1', source: 'UN/LOCODE (public reference)', claimBoundary: CLAIM, codes };
}

function buildCorridors() {
  const rng = stream('corridors');
  const byId = portsById();
  const corridors = CORRIDORS.map(([fromId, toId, canalId], index) => {
    const from = byId.get(fromId);
    const to = byId.get(toId);
    if (!from || !to) throw new Error(`corridor ${index} references missing port ${fromId}->${toId}`);
    const distanceKm = Number(haversineKm(from, to).toFixed(1));
    const serviceSpeedKn = 16 + rng.next() * 6; // slow-steaming container service speed
    const sailingDays = Number((distanceKm / (serviceSpeedKn * 1.852 * 24)).toFixed(2));
    return {
      id: `corridor:${fromId}-${toId}`, fromPortId: `port:${fromId}`, toPortId: `port:${toId}`,
      canalId: canalId ? `canal:${canalId}` : null, distanceKm, serviceSpeedKn: Number(serviceSpeedKn.toFixed(1)),
      sailingDays, provenanceKind: 'synthetic_aggregate_corridor',
    };
  });
  return { schema: 'simulatte.maritimeCorridors.v1', claimBoundary: CLAIM, corridors };
}

function buildCanalServiceModels() {
  const models = CANALS.map(([id, name, lat, lon, connects]) => ({
    id: `canal:${id}`, name, connects, location: { longitude: lon, latitude: lat },
    serviceHours: { distribution: 'lognormal', parameters: { mu: id === 'suez' ? 2.7 : 2.4, sigma: 0.35 } },
    dailyTransitCapacity: id === 'suez' ? 90 : 36,
    queueDisciplineFifo: true,
    provenanceKind: 'synthetic_canal_service_model',
  }));
  return { schema: 'simulatte.canalServiceModels.v1', claimBoundary: 'Canal service and capacity are modeled from published transit statistics, not a live reservation system.', models };
}

function buildCycloneTracks() {
  const rng = stream('cyclones');
  const basins = [
    { basin: 'north-atlantic', originLon: -45, originLat: 14, headingLon: 1.2, headingLat: 0.9 },
    { basin: 'western-pacific', originLon: 140, originLat: 12, headingLon: -1.3, headingLat: 0.7 },
  ];
  const tracks = basins.map((b, ti) => {
    const points = Array.from({ length: 20 }, (_, i) => ({
      hour: i * 6,
      longitude: Number((b.originLon + b.headingLon * i + (rng.next() - 0.5) * 2).toFixed(2)),
      latitude: Number((b.originLat + b.headingLat * i + (rng.next() - 0.5)).toFixed(2)),
      maxWindKt: Math.round(45 + rng.next() * 90),
    }));
    return { id: `cyclone:scenario-${ti}`, basin: b.basin, category: 'scenario', points };
  });
  return { schema: 'simulatte.ibtracsScenarioTracks.v1', source: 'NOAA IBTrACS v04r01 (scenario-shaped, synthetic tracks)', claimBoundary: 'Synthetic cyclone tracks shaped to IBTrACS climatology for disruption scenarios; not a forecast or observed storm.', tracks };
}

function buildPortPerformance() {
  const rng = stream('performance');
  const rows = PORTS.map(([id, name, unlocode, country, lat, lon, harborSize]) => ({
    portId: `port:${id}`, unlocode,
    medianHoursInPort: Number(((harborSize === 'L' ? 20 : 32) + rng.next() * 18).toFixed(1)),
    relativeServiceIndex: Number((0.7 + rng.next() * 0.6).toFixed(3)),
  }));
  return { schema: 'simulatte.containerPortPerformance.v1', source: 'World Bank CPPI (relative service priors; documented mapping model required before literal queue times)', claimBoundary: 'Relative port-service priors, not a literal queue-time guarantee.', rows };
}

function buildVesselArchetypes() {
  return {
    schema: 'simulatte.maritimeVesselArchetypes.v1', claimBoundary: CLAIM,
    archetypes: [
      { id: 'ulcv-24k', label: 'Ultra Large Container Vessel', teu: 24000, serviceSpeedKn: 18, maxSpeedKn: 22.5, mainEnginePowerKw: 62000, sfocGPerKwh: 170 },
      { id: 'neopanamax-14k', label: 'Neo-Panamax', teu: 14000, serviceSpeedKn: 19, maxSpeedKn: 23, mainEnginePowerKw: 45000, sfocGPerKwh: 172 },
      { id: 'panamax-5k', label: 'Panamax', teu: 5000, serviceSpeedKn: 20, maxSpeedKn: 24, mainEnginePowerKw: 36000, sfocGPerKwh: 178 },
      { id: 'feeder-2k', label: 'Regional Feeder', teu: 2000, serviceSpeedKn: 17, maxSpeedKn: 20, mainEnginePowerKw: 15000, sfocGPerKwh: 185 },
    ],
  };
}

function buildEmissionsModel() {
  return {
    schema: 'simulatte.maritimeEmissionsModel.v1',
    claimBoundary: 'Illustrative, versioned speed-power and emission coefficients. Numerical values are declared, not derived from a single global aggregate. Consistent with IMO decarbonization context, not an audited inventory.',
    version: 'maritime-emissions-1.0.0',
    // Propulsion power scales ~ cubically with speed relative to service speed.
    speedPower: { exponent: 3, referenceLoadFraction: 0.75 },
    fuel: { hfoCo2eFactorTPerT: 3.114, mgoCo2eFactorTPerT: 3.206, defaultFuel: 'vlsfo', vlsfoCo2eFactorTPerT: 3.151 },
    idleQueueLoadFraction: 0.12,
  };
}

function govern(id, schemaId, body) {
  return { ...body, datasetId: id, datasetSchemaId: schemaId, generatedBy: 'tools/simulatte/build-maritime-data.mjs', generatorVersion: 'maritime-data-1.0.0' };
}

function writeDataset(fileName, value) {
  const text = `${JSON.stringify(value, null, 2)}\n`;
  writeFileSync(join(outDir, fileName), text);
  return createHash('sha256').update(text).digest('hex');
}

function main() {
  mkdirSync(outDir, { recursive: true });
  const outputs = [
    ['port-registry-wpi-v1.json', 'global-port-registry-wpi-v1', 'simulatte.maritimePortRegistry.v1', buildPortRegistry()],
    ['location-codes-unlocode-v1.json', 'global-location-codes-unlocode-v1', 'simulatte.unlocodeRegistry.v1', buildUnlocode()],
    ['maritime-corridors-v1.json', 'global-maritime-corridors-v1', 'simulatte.maritimeCorridors.v1', buildCorridors()],
    ['canal-service-models-v1.json', 'global-canal-service-models-v1', 'simulatte.canalServiceModels.v1', buildCanalServiceModels()],
    ['ibtracs-scenario-tracks-v1.json', 'ibtracs-v04r01-scenario-tracks-v1', 'simulatte.ibtracsScenarioTracks.v1', buildCycloneTracks()],
    ['container-port-performance-v1.json', 'container-port-performance-v1', 'simulatte.containerPortPerformance.v1', buildPortPerformance()],
    ['vessel-archetypes-v1.json', 'maritime-vessel-archetypes-v1', 'simulatte.maritimeVesselArchetypes.v1', buildVesselArchetypes()],
    ['emissions-model-v1.json', 'maritime-emissions-model-v1', 'simulatte.maritimeEmissionsModel.v1', buildEmissionsModel()],
  ];
  const receipts = outputs.map(([fileName, datasetId, schemaId, body]) => ({
    datasetId, schemaId, path: `../../../data/maritime-trade-global/${fileName}`,
    sha256: writeDataset(fileName, govern(datasetId, schemaId, body)),
  }));
  writeFileSync(join(outDir, 'dataset-manifest.json'), `${JSON.stringify({ schema: 'simulatte.maritimeDataManifest.v1', generatedAt: '2026-07-22', datasets: receipts }, null, 2)}\n`);
  process.stdout.write('maritime-trade-global governed datasets:\n');
  receipts.forEach((r) => process.stdout.write(`  ${r.datasetId}  sha256=${r.sha256.slice(0, 12)}\n`));
}

main();
