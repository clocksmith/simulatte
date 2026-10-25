#!/usr/bin/env node
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const surfaceArg = args.find((a) => a.startsWith('--surface='));
const TARGET_SURFACE = surfaceArg ? surfaceArg.split('=')[1] : 'both';

function runStep(name, command) {
  process.stdout.write(`\n> [deploy-check] ${name}\n> ${command}\n`);
  execSync(command, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: 'inherit',
  });
}

function runChecks(surface = TARGET_SURFACE) {
  const includeWorld = surface === 'world' || surface === 'both';
  const includeCreate = surface === 'create' || surface === 'both';

  process.stdout.write(`\n=== Running Deploy Qualification Checks (surface: ${surface}) ===\n`);

  // 1. Shared release & runtime contract gates
  runStep('simulatte:tiers:check', 'node tools/simulatte/sync-tier-application-manifest.mjs && node tools/simulatte/sync-tier-dataset-references.mjs');
  runStep('check:model-lock-references', 'node tools/sync-model-runtime-lock-references.mjs --check');
  runStep('check-model-runtime-lock', 'node tools/check-model-runtime-lock.mjs');
  runStep('check:artifacts', 'node tools/sync-generated-artifact-inventory.mjs');
  runStep('check-deploy-surface', 'node tools/check-deploy-surface.mjs');
  runStep('check:hosting', `node tools/package-hosting-surfaces.mjs --check --surface=${surface} && node tools/run-test-files.mjs --fail-fast tests/hosting-surfaces.test.cjs`);

  // 2. World-specific runtime, plugins, catalog and dataset gates
  if (includeWorld) {
    runStep('plugins:check', 'node tools/simulatte/sync-model-source-hashes.mjs && node tools/simulatte/sync-tier-dataset-references.mjs && node tools/plugins/sync-plugin-integrity.mjs && node tools/plugins/sync-plugin-registry.mjs && node tools/plugins/check-plugin-boundaries.mjs');
    runStep('check:field-models', 'node tools/cached-check.mjs field-models');
    runStep('check:solar-drive-data', 'node tools/cached-check.mjs solar-drive-data');
    runStep('check:runtime-entrypoint', 'node tools/sync-runtime-script-entrypoint.mjs');
    runStep('check:world-entrypoint', 'node tools/check-world-runtime-entrypoint.mjs');
    runStep('catalog:check', 'node tools/simulatte/build-simulation-illustrations.mjs --check && node tools/sync-simulation-homepage.mjs --check && node --test tests/simulation-catalog.test.cjs');
    runStep('check:simulatte:derived', 'node tools/cached-check.mjs simulatte-derived');
    runStep('check:shade-data', 'node tools/cached-check.mjs shade-data');
    runStep('check:autonomy-data', 'node tools/cached-check.mjs autonomy-data');
    runStep('samer:simulatte:check', 'node tools/cached-check.mjs samer-simulatte');
  }

  // 3. Create-specific model selection and compiler gates
  if (includeCreate) {
    runStep('check:model-candidates', 'node tools/samer/check-model-candidate-registry.mjs && node tools/cached-check.mjs compact-classifiers && node tools/render-pipeline-job-matrix.mjs --check');
    runStep('check:model-populations', 'node tools/samer/commit-model-selection-populations.mjs');
  }

  process.stdout.write(`\n=== All Deploy Qualification Checks Passed (surface: ${surface}) ===\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    runChecks(TARGET_SURFACE);
  } catch (error) {
    process.stderr.write(`Deploy checks failed: ${error?.message || String(error)}\n`);
    process.exit(error.status || 1);
  }
}
