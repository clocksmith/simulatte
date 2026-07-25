#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = path.join(root, 'public/data/generated-artifact-inventory.json');
const write = process.argv.includes('--write');
const definitions = [
  ['autonomy-world', 'public/data/simulatte/autonomy-manifest.json', 'simulatte-world', 'npm run build:simulatte:data', 'active', 'npm run check:simulatte'],
  ['tier-applications', 'public/data/simulatte/tier-application-manifest.json', 'simulatte-world', 'npm run simulatte:tiers:sync', 'active', 'npm run simulatte:tiers:check'],
  ['model-runtime', 'public/data/simulatte-embedder/manifest.json', 'blank-runtime', 'npm run sync:model-lock-references', 'active', 'npm run check:model-lock'],
  ['semantic-universe', 'public/data/simulatte-universe/manifest.json', 'blank-retrieval', 'npm run build:universe', 'active', 'npm run validate:universe'],
  ['visual-cards', 'public/data/simulatte-visual-cards/manifest.json', 'blank-visual', 'npm run build:visual-cards', 'active', 'npm run validate:visual-cards'],
  ['pipeline-jobs', 'public/data/pipeline-job-registry.json', 'shared-pipeline', 'npm run pipeline:matrix:sync', 'active', 'npm run pipeline:matrix:check'],
  ['us-major-cities', 'public/data/simulatte/cache/country/us-cities-v1.json', 'world-tiers', 'curated fixture', 'active-fixture', 'npm run check:artifacts'],
  ['solar-system-cache', 'public/data/simulatte/cache/space/solar-system.json', 'world-tiers', 'npm run simulatte:fetch:solar-system', 'inactive-empty-placeholder', 'npm run check:artifacts'],
];

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

const artifacts = definitions.map(([artifactId, relativePath, owner, generatorCommand, activationState, validationCommand]) => {
  const bytes = fs.readFileSync(path.join(root, relativePath));
  const parsed = JSON.parse(bytes);
  return {
    artifactId,
    owner,
    schema: parsed.schema || 'unpopulated',
    generatorCommand,
    inputIdentities: [{ manifestRef: relativePath }],
    output: { path: relativePath, sha256: sha256(bytes) },
    contentVersion: parsed.contentVersion || parsed.id || 'unpopulated',
    activationState,
    validationCommand,
  };
});

const inventory = {
  schema: 'simulatte.generatedArtifactInventory.v1',
  id: 'simulatte-generated-artifacts-v1',
  claimBoundary: 'Reference inventory only. Canonical artifact details remain owned by each referenced manifest or governed cache payload.',
  artifacts,
};
const serialized = `${JSON.stringify(inventory, null, 2)}\n`;
if (write) {
  fs.writeFileSync(outputPath, serialized);
  process.stdout.write('Wrote public/data/generated-artifact-inventory.json.\n');
} else {
  const current = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, 'utf8') : '';
  if (current !== serialized) throw new Error('generated artifact inventory is stale; run npm run sync:artifacts');
  process.stdout.write(`Generated artifact inventory is synchronized (${artifacts.length} artifacts).\n`);
}
