#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const PLUGIN_DIRECTORY = resolve('public/shared/plugins/subsea-network-global');
const DATA_DIRECTORY = resolve('public/data/subsea-network-global');
const dataManifest = JSON.parse(await readFile(resolve(DATA_DIRECTORY, 'dataset-manifest.json'), 'utf8'));
const resources = [
  './config.schema.json',
  './default-config.json',
  './demand-model.js',
  './path-catalog.js',
  './allocation-solver.js',
  './repair-engine.js',
  './metrics.js',
  './network-model.js',
  './presentation.js',
  './v4-contribution.js',
  './comparison-driver.js',
];
const resourceRows = [];
for (const path of resources) {
  resourceRows.push({
    integrity: `sha384-${await digest(resolve(PLUGIN_DIRECTORY, path), 'sha384')}`,
    path,
  });
}
const datasetRows = dataManifest.artifacts.map((artifact) => ({
  id: artifact.id,
  reference: {
    id: artifact.id,
    path: `../../../data/subsea-network-global/${artifact.path.replace('./', '')}`,
    schemaId: artifact.schemaId,
    sha256: artifact.sha256,
  },
  required: true,
}));
const manifest = {
  configSchema: './config.schema.json',
  consumes: [],
  datasets: datasetRows,
  defaultConfig: './default-config.json',
  entry: {
    globalFactory: 'SimulattePluginSubseaNetworkGlobal',
    integrity: `sha384-${await digest(resolve(PLUGIN_DIRECTORY, 'index.js'), 'sha384')}`,
    path: './index.js',
  },
  extensionPoints: ['request', 'event', 'settlement', 'ui', 'presentation'],
  id: 'subsea-network-global',
  permissions: [
    'events.propose.v1',
    'receipts.append.v1',
    'state.reduce.v1',
    'ui.geospatial.v1',
    'ui.inspector.v1',
  ],
  provides: ['simulation.subsea-network.v1'],
  receiptSchemas: [
    'simulatte.plugin.subseaScenarioReceipt.v1',
    'simulatte.plugin.subseaPathCatalogReceipt.v1',
    'simulatte.plugin.subseaAllocationReceipt.v1',
    'simulatte.plugin.subseaRepairReceipt.v1',
    'simulatte.plugin.subseaEnsembleReceipt.v1',
    'simulatte.plugin.subseaConservationReceipt.v1',
    'simulatte.plugin.subseaSettlementReceipt.v1',
    'simulatte.plugin.subseaComparisonReceipt.v1',
    'simulatte.comparisonExecutionReceipt.v4',
  ],
  resources: resourceRows,
  schema: 'simulatte.pluginManifest.v1',
  sdkVersion: 2,
  version: '1.0.0',
};
await writeFile(resolve(PLUGIN_DIRECTORY, 'plugin.json'), `${JSON.stringify(manifest, null, 2)}\n`);
process.stdout.write(`Updated Subsea plugin manifest with ${datasetRows.length} datasets and ${resourceRows.length} resources.\n`);

async function digest(path, algorithm) {
  return createHash(algorithm).update(await readFile(path)).digest('hex');
}
