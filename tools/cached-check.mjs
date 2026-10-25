#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE_DIR = path.join(ROOT, '.cache', 'simulatte-checks');

// Predefined check configurations for heavy dataset / validation checks.
const KNOWN_CHECKS = {
  'solar-drive-data': {
    inputs: [
      'tools/simulatte/build-solar-route.mjs',
      'tools/simulatte/build-solar-reference.py',
      'tools/simulatte/data/solar-route-elevation-v1.json',
      'tools/simulatte/data/sun-trip-2021.ods',
      'public/data/solar-drive',
      'public/data/simulatte/worlds/nyc-core-autonomy-v1.json',
      'public/data/simulatte/policies/bet-selector-v1.json',
      'public/simulatte/world/world-model.js',
      'public/simulatte/world/route-planner.js',
      'public/shared/contracts/world-spec.js',
    ],
    command: 'node tools/simulatte/build-solar-route.mjs && python3 tools/simulatte/build-solar-reference.py',
  },
  'shade-data': {
    inputs: [
      'tools/simulatte/audit-shade-geometry.mjs',
      'public/data/simulatte/worlds/nyc-core-autonomy-v1.json',
      'public/data/simulatte/shade',
    ],
    command: 'node tools/simulatte/audit-shade-geometry.mjs --check',
  },
  'simulatte-derived': {
    inputs: [
      'tools/simulatte/compile-accessibility-index.mjs',
      'tools/simulatte/compile-route-amenity-index.mjs',
      'tools/simulatte/compile-safety-history-index.mjs',
      'tools/simulatte/compile-place-embeddings.mjs',
      'public/data/simulatte/accessibility',
      'public/data/simulatte/amenities',
      'public/data/simulatte/safety',
      'public/data/simulatte/places',
    ],
    command: 'node tools/simulatte/compile-accessibility-index.mjs --check && node tools/simulatte/compile-route-amenity-index.mjs --check && node tools/simulatte/compile-safety-history-index.mjs --check && node tools/simulatte/compile-place-embeddings.mjs --check',
  },
  'autonomy-data': {
    inputs: [
      'tools/simulatte/check-autonomy-data.mjs',
      'public/data/simulatte/autonomy-manifest.json',
      'public/data/simulatte/worlds/nyc-core-autonomy-v1.json',
      'public/data/simulatte/policies',
    ],
    command: 'node tools/simulatte/check-autonomy-data.mjs',
  },
  'samer-simulatte': {
    inputs: [
      'tools/samer/simulatte/run-policy-trial.mjs',
      'tools/samer/simulatte/autonomy-same-r-reference.json',
      'public/data/simulatte',
    ],
    command: 'node tools/samer/simulatte/run-policy-trial.mjs --check',
  },
  'compact-classifiers': {
    inputs: [
      'tools/samer/build-browser-linear-classifiers.py',
      'tools/samer/data',
      'public/data/simulatte-compact-classifiers.js',
    ],
    command: 'python3 tools/samer/build-browser-linear-classifiers.py --check',
  },
  'field-models': {
    inputs: [
      'tools/simulatte/sync-field-models.mjs',
      'public/simulatte/world/field-models.js',
      'public/data/simulatte/field-models',
    ],
    command: 'node tools/simulatte/sync-field-models.mjs',
  },
};

function fileHash(absolutePath) {
  const content = fs.readFileSync(absolutePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

function hashTarget(targetPath, hasher) {
  const absolute = path.resolve(ROOT, targetPath);
  if (!fs.existsSync(absolute)) return;
  const stat = fs.statSync(absolute);
  if (stat.isFile()) {
    hasher.update(`${targetPath}\0${stat.size}\0${fileHash(absolute)}\0`);
    return;
  }
  if (stat.isDirectory()) {
    const entries = fs.readdirSync(absolute).sort();
    for (const entry of entries) {
      hashTarget(path.join(targetPath, entry), hasher);
    }
  }
}

export function computeCheckFingerprint(inputs, command) {
  const hasher = crypto.createHash('sha256');
  hasher.update(`command:${command}\0`);
  for (const input of inputs) {
    hashTarget(input, hasher);
  }
  return hasher.digest('hex');
}

export function runCachedCheck(checkId, options = {}) {
  const check = KNOWN_CHECKS[checkId] || options.check;
  if (!check) {
    throw new Error(`Unknown check ID: ${checkId}`);
  }
  const inputs = options.inputs || check.inputs || [];
  const command = options.command || check.command;
  const force = Boolean(options.force || process.env.SIMULATTE_NO_CACHE === '1');

  const fingerprint = computeCheckFingerprint(inputs, command);
  const cacheFile = path.join(CACHE_DIR, `${checkId}.json`);

  if (!force && fs.existsSync(cacheFile)) {
    try {
      const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      if (cached.fingerprint === fingerprint) {
        if (cached.output) {
          process.stdout.write(cached.output);
        }
        process.stdout.write(`[cached] ${checkId}: passed (fingerprint: ${fingerprint.slice(0, 12)})\n`);
        return true;
      }
    } catch {
      // Stale or corrupt cache, fall through to re-execution.
    }
  }

  // Execute check command synchronously
  let output = '';
  try {
    output = execSync(command, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    process.stdout.write(output);
  } catch (error) {
    if (fs.existsSync(cacheFile)) {
      try { fs.unlinkSync(cacheFile); } catch {}
    }
    throw error;
  }

  // Cache successful result
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(
    cacheFile,
    JSON.stringify({
      schema: 'simulatte.checkCache.v1',
      id: checkId,
      fingerprint,
      passedAt: new Date().toISOString(),
      output,
    }, null, 2),
    'utf8'
  );
  return true;
}

// CLI entrypoint
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const checkId = process.argv[2];
  const force = process.argv.includes('--force');
  if (!checkId) {
    console.error('Usage: node tools/cached-check.mjs <checkId> [--force]');
    process.exit(1);
  }
  try {
    runCachedCheck(checkId, { force });
  } catch (err) {
    process.exit(err.status || 1);
  }
}
