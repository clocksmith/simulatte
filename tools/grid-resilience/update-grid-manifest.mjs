#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const directory = path.join(root, 'public/data/grid-resilience-us');
const output = path.join(directory, 'dataset-manifest.json');
const files = fs.readdirSync(directory).filter((name) => name.endsWith('.json') && name !== 'dataset-manifest.json').sort();
const datasets = files.map((name) => {
  const bytes = fs.readFileSync(path.join(directory, name));
  const value = JSON.parse(bytes);
  return {
    id: value.id,
    path: `./${name}`,
    schemaId: value.schema,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    bytes: bytes.length,
  };
});
fs.writeFileSync(output, `${JSON.stringify({
  schema: 'simulatte.pluginDatasetManifest.v1',
  id: 'grid-resilience-us-dataset-manifest-v1',
  generatedBy: 'tools/grid-resilience/update-grid-manifest.mjs',
  datasets,
}, null, 2)}\n`);
console.log(`GRID-MANIFEST wrote=${output} datasets=${datasets.length}`);
