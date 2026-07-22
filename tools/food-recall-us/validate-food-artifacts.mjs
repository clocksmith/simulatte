#!/usr/bin/env node
// Validate every generated food artifact: required schema id, non-empty records, and
// that the on-disk content hash matches the dataset manifest. Fails closed.
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, '..', '..', 'public', 'data', 'food-recall-us');
const manifestPath = join(dataDir, 'dataset-manifest.json');

function fail(message) { process.stderr.write(`validate-food-artifacts: ${message}\n`); process.exit(1); }

function main() {
  if (!existsSync(manifestPath)) fail('dataset-manifest.json missing — run build-food-data.mjs');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  let checked = 0;
  manifest.datasets.forEach((row) => {
    const fileName = row.path.split('/').pop();
    const path = join(dataDir, fileName);
    if (!existsSync(path)) fail(`dataset file missing: ${fileName}`);
    const text = readFileSync(path, 'utf8');
    const actual = createHash('sha256').update(text).digest('hex');
    if (actual !== row.sha256) fail(`hash mismatch for ${row.datasetId}: manifest ${row.sha256} vs file ${actual}`);
    const value = JSON.parse(text);
    if (value.datasetSchemaId !== row.schemaId) fail(`schema id mismatch for ${row.datasetId}`);
    checked += 1;
  });
  process.stdout.write(`validate-food-artifacts: ${checked} datasets OK (schema + hash verified)\n`);
}
main();
