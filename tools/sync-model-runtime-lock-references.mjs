#!/usr/bin/env node
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import {
  ROOT,
  modelRuntimeLockReference,
} from './model-runtime-lock-utils.mjs';

const WRITE = process.argv.includes('--write');
const REFERENCES = Object.freeze([
  ['public/data/simulatte-embedder/manifest.json', './model-runtime-lock.json'],
  ['public/data/simulatte-embedder/intent-evidence-contract-v1.json', './model-runtime-lock.json'],
  ['public/data/simulatte-universe/manifest.json', '../simulatte-embedder/model-runtime-lock.json'],
  ['public/data/simulatte-catalog-inventory.json', './simulatte-embedder/model-runtime-lock.json'],
  ['public/data/simulatte-intent-structurer/manifest.json', '../simulatte-embedder/model-runtime-lock.json'],
]);

function main() {
  const stale = [];
  for (const [relativePath, artifact] of REFERENCES) {
    const filePath = path.join(ROOT, relativePath);
    const document = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const expected = modelRuntimeLockReference(artifact);
    if (JSON.stringify(document.modelRuntimeLock) === JSON.stringify(expected)) continue;
    stale.push(relativePath);
    if (WRITE) {
      document.modelRuntimeLock = expected;
      fs.writeFileSync(filePath, `${JSON.stringify(document, null, 2)}\n`);
    }
  }
  const evidencePath = path.join(ROOT, 'public/data/simulatte-embedder/intent-evidence-contract-v1.json');
  const manifestPath = path.join(ROOT, 'public/data/simulatte-embedder/manifest.json');
  const evidenceHash = crypto.createHash('sha256').update(fs.readFileSync(evidencePath)).digest('hex');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const expectedEvidenceHash = { alg: 'sha256', hex: evidenceHash };
  if (JSON.stringify(manifest.retrieval?.intentEvidence?.artifactHash) !== JSON.stringify(expectedEvidenceHash)) {
    stale.push('public/data/simulatte-embedder/manifest.json#retrieval.intentEvidence.artifactHash');
    if (WRITE) {
      manifest.retrieval.intentEvidence.artifactHash = expectedEvidenceHash;
      fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    }
  }
  if (stale.length && !WRITE) {
    throw new Error(`Model runtime lock references are stale: ${stale.join(', ')}`);
  }
  console.log(`Model runtime lock references ${WRITE ? 'synced' : 'clean'}: ${REFERENCES.length} mirrors checked.`);
}

try {
  main();
} catch (error) {
  console.error(error && error.message ? error.message : String(error));
  process.exit(1);
}
