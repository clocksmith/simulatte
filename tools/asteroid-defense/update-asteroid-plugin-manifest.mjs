#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '../..');
const pluginDirectory = path.join(root, 'public/shared/plugins/asteroid-defense');
const datasetManifest = JSON.parse(fs.readFileSync(path.join(root, 'public/data/asteroid-defense/dataset-manifest.json'), 'utf8'));
const datasets = datasetManifest.datasets.map((row) => ({
  id: row.id,
  required: true,
  reference: {
    id: row.id,
    path: `../../../data/asteroid-defense/${row.path.slice(2)}`,
    schemaId: row.schemaId,
    sha256: row.sha256,
  },
}));
const manifest = {
  schema: 'simulatte.pluginManifest.v1',
  id: 'asteroid-defense',
  version: '1.0.0',
  sdkVersion: 2,
  entry: {
    path: './index.js',
    globalFactory: 'SimulattePluginAsteroidDefense',
    integrity: sha384(fs.readFileSync(path.join(pluginDirectory, 'index.js'))),
  },
  configSchema: './config.schema.json',
  defaultConfig: './default-config.json',
  extensionPoints: ['request', 'event', 'settlement', 'ui', 'presentation'],
  permissions: ['events.propose.v1', 'receipts.append.v1', 'state.reduce.v1', 'ui.geospatial.v1', 'ui.inspector.v1'],
  consumes: [],
  provides: ['simulation.asteroid-defense.v1', 'propagation.n-body.v1'],
  receiptSchemas: [
    'simulatte.plugin.asteroidScenarioReceipt.v1',
    'simulatte.plugin.asteroidSettlementReceipt.v1',
    'simulatte.plugin.asteroidComparisonReceipt.v1',
    'simulatte.comparisonExecutionReceipt.v4',
  ],
  datasets,
  resources: [],
};
fs.writeFileSync(path.join(pluginDirectory, 'plugin.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`ASTEROID-PLUGIN-MANIFEST wrote datasets=${datasets.length}`);
function sha384(bytes) { return `sha384-${crypto.createHash('sha384').update(bytes).digest('hex')}`; }
