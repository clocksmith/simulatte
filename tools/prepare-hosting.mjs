#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const surfaceArg = args.find((a) => a.startsWith('--surface='));
const TARGET_SURFACE = surfaceArg ? surfaceArg.split('=')[1] : 'both';

const startTime = Date.now();
process.stdout.write(`\n=== Preparing Hosting (surface: ${TARGET_SURFACE}) ===\n`);

// 1. Stamp entrypoints with scoped build identifiers
execFileSync(process.execPath, ['tools/stamp-build.mjs', `--surface=${TARGET_SURFACE}`], {
  cwd: ROOT,
  stdio: 'inherit',
});

// 2. Package hosting surfaces incrementally (Build once!)
execFileSync(process.execPath, ['tools/package-hosting-surfaces.mjs', `--surface=${TARGET_SURFACE}`], {
  cwd: ROOT,
  stdio: 'inherit',
});

// 3. Run deploy qualification checks (Validating the packaged output!)
execFileSync(process.execPath, ['tools/run-deploy-checks.mjs', `--surface=${TARGET_SURFACE}`], {
  cwd: ROOT,
  stdio: 'inherit',
});

const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(2);
process.stdout.write(`\n=== Prepared Hosting Successfully in ${elapsedSec}s (surface: ${TARGET_SURFACE}) ===\n`);
