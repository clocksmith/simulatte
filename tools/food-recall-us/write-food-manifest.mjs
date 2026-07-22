#!/usr/bin/env node
// Authoritatively write the food-recall-us plugin manifest `datasets` block from the
// generated dataset manifest (real sha256 + schema ids), so dataset references never
// drift from the generated files. Entry/resource SHA-384 integrity remains owned by
// `npm run plugins:sync`; this only rewrites the dataset reference array.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
const datasetManifestPath = join(repoRoot, 'public', 'data', 'food-recall-us', 'dataset-manifest.json');
const pluginManifestPath = join(repoRoot, 'public', 'shared', 'plugins', 'food-recall-us', 'plugin.json');

const REQUIRED = new Set([
  'us.food.facilities.synthetic.v1', 'us.food.freight-corridors.v1', 'us.food.commodity-profiles.v1',
  'us.food.hazard-model-registry.v1', 'us.food.consumer-zones.v1',
]);

function main() {
  if (!existsSync(datasetManifestPath)) throw new Error('dataset-manifest.json missing — run build-food-data.mjs');
  if (!existsSync(pluginManifestPath)) throw new Error('food-recall-us/plugin.json missing');
  const datasetManifest = JSON.parse(readFileSync(datasetManifestPath, 'utf8'));
  const plugin = JSON.parse(readFileSync(pluginManifestPath, 'utf8'));
  plugin.datasets = datasetManifest.datasets.map((row) => ({
    id: row.datasetId,
    required: REQUIRED.has(row.datasetId),
    reference: { id: row.datasetId, path: row.path, sha256: row.sha256, schemaId: row.schemaId },
  }));
  writeFileSync(pluginManifestPath, `${JSON.stringify(plugin, null, 2)}\n`);
  process.stdout.write(`Wrote ${plugin.datasets.length} dataset references into ${pluginManifestPath}\n`);
}
main();
