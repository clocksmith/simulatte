// Shared ingestion library for food-recall-us federal snapshots (TODO_PLUGINS §5).
//
// Live network access happens ONLY in these build-time fetch scripts, never during a
// simulation. Each fetch pins an immutable snapshot with provenance: source id, retrieval
// time, the query, a content hash, record count, and an explicit claim boundary. The
// simulator then reads pinned snapshots, so a run is reproducible and auditable.
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
export const repoRoot = join(here, '..', '..');
export const snapshotDir = join(repoRoot, 'public', 'data', 'food-recall-us', 'snapshots');

export function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

// Fetch a source and write a governed snapshot. `extract(json)` returns the record array.
export async function ingest({ sourceId, url, query = {}, license, claimBoundary, sourceUpdatedThrough = null, transformVersion, extract }) {
  mkdirSync(snapshotDir, { recursive: true });
  if (typeof fetch !== 'function') throw new Error(`ingest(${sourceId}) requires a fetch implementation (Node 18+)`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`ingest(${sourceId}) HTTP ${response.status} for ${url}`);
  const json = await response.json();
  const records = extract ? extract(json) : json;
  const body = Array.isArray(records) ? records : [records];
  const payloadText = JSON.stringify(body);
  const snapshot = {
    schema: 'simulatte.foodIngestSnapshot.v1',
    sourceId,
    retrievedAt: new Date().toISOString(),
    sourceUpdatedThrough,
    license,
    contentSha256: sha256(payloadText),
    query,
    url,
    transformVersion,
    recordCount: body.length,
    warnings: [],
    claimBoundary,
    records: body,
  };
  const path = join(snapshotDir, `${sourceId}.json`);
  writeFileSync(path, `${JSON.stringify(snapshot, null, 2)}\n`);
  process.stdout.write(`ingested ${sourceId}: ${body.length} records -> ${path}\n  sha256=${snapshot.contentSha256}\n`);
  return snapshot;
}

export function readSnapshot(sourceId) {
  const path = join(snapshotDir, `${sourceId}.json`);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function runIfMain(importMeta, main) {
  if (process.argv[1] && importMeta.url === `file://${process.argv[1]}`) {
    main().catch((error) => { process.stderr.write(`${error.stack || error}\n`); process.exit(1); });
  }
}
