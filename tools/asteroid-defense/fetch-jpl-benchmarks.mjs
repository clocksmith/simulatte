#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const directory = path.join(root, 'public/data/asteroid-defense');
fs.mkdirSync(directory, { recursive: true });
const sources = [
  { id: 'sbdb-apophis', url: 'https://ssd-api.jpl.nasa.gov/sbdb.api?sstr=99942&phys-par=1' },
  { id: 'cad-apophis-2029', url: 'https://ssd-api.jpl.nasa.gov/cad.api?des=99942&date-min=2025-01-01&date-max=2030-01-01&dist-max=0.2' },
];
const responses = [];
for (const source of sources) {
  const response = await fetch(source.url);
  if (!response.ok) throw new Error(`${source.id} failed: ${response.status}`);
  const body = await response.text();
  responses.push({
    id: source.id,
    url: source.url,
    retrievedAt: '2026-07-26T00:00:00Z',
    sha256: sha256(body),
    response: JSON.parse(body),
  });
}
fs.writeFileSync(path.join(directory, 'jpl-reference-snapshots-v1.json'), `${JSON.stringify({
  schema: 'simulatte.asteroidJplReferenceSnapshots.v1',
  id: 'asteroid-jpl-reference-snapshots-v1',
  publisher: 'NASA/JPL Solar System Dynamics',
  license: 'U.S. government public data; attribution retained',
  claimBoundary: 'Pinned agency output used for API identity and benchmark terminology only; not an operational risk reproduction.',
  responses,
}, null, 2)}\n`);
console.log(`ASTEROID-JPL wrote responses=${responses.length}`);

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}
