#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '../..');
const directory = path.join(root, 'public/data/asteroid-defense');
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
fs.writeFileSync(path.join(directory, 'dataset-manifest.json'), `${JSON.stringify({
  schema: 'simulatte.pluginDatasetManifest.v1',
  id: 'asteroid-defense-dataset-manifest-v1',
  generatedBy: 'tools/asteroid-defense/update-asteroid-manifest.mjs',
  datasets,
}, null, 2)}\n`);
console.log(`ASTEROID-MANIFEST wrote datasets=${datasets.length}`);
