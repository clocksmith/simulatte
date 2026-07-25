#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const dataDirectory = resolve('public/data/maritime-trade-global');
const rows = [
  ['global-port-registry-wpi-v1', 'port-registry-wpi-v1.json', 'simulatte.maritimePortRegistry.v1'],
  ['global-maritime-corridors-v1', 'maritime-corridors-v1.json', 'simulatte.maritimeCorridors.v1'],
  ['global-canal-service-models-v1', 'canal-service-models-v1.json', 'simulatte.canalServiceModels.v1'],
  ['container-port-performance-v1', 'container-port-performance-v1.json', 'simulatte.containerPortPerformance.v1'],
  ['ibtracs-v04r01-scenario-tracks-v1', 'ibtracs-scenario-tracks-v1.json', 'simulatte.ibtracsScenarioTracks.v1'],
  ['maritime-vessel-archetypes-v1', 'vessel-archetypes-v1.json', 'simulatte.maritimeVesselArchetypes.v1'],
  ['maritime-emissions-model-v1', 'emissions-model-v1.json', 'simulatte.maritimeEmissionsModel.v1'],
  ['maritime.voyage.scenarios.v1', 'voyage-scenarios-v1.json', 'simulatte.maritimeVoyageScenarios.v1'],
  ['maritime.provenance.registry.v1', 'provenance-registry-v1.json', 'simulatte.maritimeProvenanceRegistry.v1'],
];

function sha256(fileName) {
  return createHash('sha256').update(readFileSync(resolve(dataDirectory, fileName))).digest('hex');
}

const datasets = rows.map(([datasetId, fileName, schemaId]) => ({
  datasetId,
  schemaId,
  path: `../../../data/maritime-trade-global/${fileName}`,
  sha256: sha256(fileName),
}));
const manifest = {
  schema: 'simulatte.maritimeDataManifest.v2',
  generatedAt: '2026-07-25',
  generatedBy: 'tools/maritime-trade/update-maritime-manifest.mjs',
  datasets,
};
writeFileSync(resolve(dataDirectory, 'dataset-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
process.stdout.write(`Updated Maritime manifest with ${datasets.length} governed datasets.\n`);
