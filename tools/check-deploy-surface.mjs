#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOPPLER_PACKAGE = Object.freeze({
  name: 'doppler-gpu',
  version: '0.4.7',
  integrity: 'sha512-D0+RebGvabiacHk39Jerm+56Slq6kSl4fnjgbxMBp7T/Jis17ZDcQzbmkDyFUcNWAWZL7jOuzKSOHxPVufg1dQ==',
  shasum: 'b25e38953607eb73ebb9e8f59decff2488c3e577',
  fileCount: 1701,
});
const DOPPLER_VENDOR_PATCH_HASHES = Object.freeze({
  'src/client/runtime/index.js': 'd7b7e7e3f0389d6fe3a3797ec36e720c93de39a19276bd514be54925e8153750',
  'src/client/runtime/model-source.js': '3eb28f6ed0d3386d77acdb25c955e47bce11931e614541fdc85edec3cc7bd82a',
  'src/config/transforms/execution-graph-transforms.js': '54b2054fde328416c74df77a592f835e9df16a10bf9aae66e15b0dc8270f3483',
  'src/inference/pipelines/text.js': '4c8a2c3eac83fa1f95a7463bfadf59d50ce80b54da35213ba4fec04736879169',
  'src/inference/pipelines/text/execution-v1.js': 'c3cb0050da8394681290dd0f661140e3106d668877ba130196adca1c8cebbaf6',
  'src/rules/inference/capability-transforms.rules.json': 'c3878e781c065975e8cf2a09f8b4eb58818c74af61319dcd6ff07fb05cec2f9d',
});
const VENDOR_ROOT = path.join(ROOT, 'public', 'vendor', 'doppler');
const LIST_LIMIT = 20;

function run(command, args, options = {}) {
  try {
    return execFileSync(command, args, {
      cwd: options.cwd || ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    const stderr = error && error.stderr ? String(error.stderr).trim() : '';
    const detail = stderr || (error && error.message ? error.message : String(error));
    throw new Error(`${command} ${args.join(' ')} failed: ${detail}`);
  }
}

function fail(message, details = []) {
  const lines = ['Deploy blocked: protected public vendor path is not the pinned Doppler package.', '', message];
  if (details.length) lines.push('', ...details);
  throw new Error(lines.join('\n'));
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`could not read JSON ${path.relative(ROOT, filePath)}: ${error && error.message ? error.message : String(error)}`);
  }
}

function listFiles(root) {
  const files = [];
  const walk = (relativeDir) => {
    const absoluteDir = path.join(root, relativeDir);
    const entries = fs.readdirSync(absoluteDir, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name));
    entries.forEach((entry) => {
      const relativePath = path.join(relativeDir, entry.name);
      const normalized = relativePath.split(path.sep).join('/');
      if (entry.isDirectory()) {
        walk(relativePath);
        return;
      }
      if (!entry.isFile()) {
        fail(`unsupported package entry ${normalized}; expected regular files only`);
      }
      files.push(normalized);
    });
  };
  walk('.');
  return files;
}

function hashFile(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function relativeSample(label, rows) {
  if (!rows.length) return [];
  const visible = rows.slice(0, LIST_LIMIT).map((row) => `${label} ${row}`);
  if (rows.length > LIST_LIMIT) visible.push(`${label} ... ${rows.length - LIST_LIMIT} more`);
  return visible;
}

function compareLists(expectedFiles, actualFiles) {
  const expectedSet = new Set(expectedFiles);
  const actualSet = new Set(actualFiles);
  return {
    missing: expectedFiles.filter((file) => !actualSet.has(file)),
    extra: actualFiles.filter((file) => !expectedSet.has(file)),
  };
}

function verifyPackageMetadata(packument) {
  if (!Array.isArray(packument) || packument.length !== 1) {
    fail(`npm pack returned ${Array.isArray(packument) ? packument.length : 'non-array'} entries; expected one`);
  }
  const entry = packument[0];
  if (entry.name !== DOPPLER_PACKAGE.name) {
    fail(`npm pack returned package ${entry.name}; expected ${DOPPLER_PACKAGE.name}`);
  }
  if (entry.version !== DOPPLER_PACKAGE.version) {
    fail(`npm pack returned version ${entry.version}; expected ${DOPPLER_PACKAGE.version}`);
  }
  if (entry.integrity !== DOPPLER_PACKAGE.integrity) {
    fail(`npm integrity mismatch for ${DOPPLER_PACKAGE.name}@${DOPPLER_PACKAGE.version}`);
  }
  if (entry.shasum !== DOPPLER_PACKAGE.shasum) {
    fail(`npm shasum mismatch for ${DOPPLER_PACKAGE.name}@${DOPPLER_PACKAGE.version}`);
  }
  if (entry.entryCount !== DOPPLER_PACKAGE.fileCount) {
    fail(`npm file count ${entry.entryCount}; expected ${DOPPLER_PACKAGE.fileCount}`);
  }
  return entry;
}

function verifyVendorPackageJson() {
  const pkg = readJson(path.join(VENDOR_ROOT, 'package.json'));
  if (pkg.name !== DOPPLER_PACKAGE.name) {
    fail(`vendor package name ${pkg.name}; expected ${DOPPLER_PACKAGE.name}`);
  }
  if (pkg.version !== DOPPLER_PACKAGE.version) {
    fail(`vendor package version ${pkg.version}; expected ${DOPPLER_PACKAGE.version}`);
  }
}

function verifyVendorMatchesPackage(packageRoot) {
  const expectedFiles = listFiles(packageRoot);
  const actualFiles = listFiles(VENDOR_ROOT);
  if (expectedFiles.length !== DOPPLER_PACKAGE.fileCount) {
    fail(`packed package has ${expectedFiles.length} files; expected ${DOPPLER_PACKAGE.fileCount}`);
  }
  if (actualFiles.length !== DOPPLER_PACKAGE.fileCount) {
    fail(`vendor tree has ${actualFiles.length} files; expected ${DOPPLER_PACKAGE.fileCount}`);
  }

  const { missing, extra } = compareLists(expectedFiles, actualFiles);
  if (missing.length || extra.length) {
    fail('vendor file list differs from the published Doppler package', [
      ...relativeSample('missing:', missing),
      ...relativeSample('extra:', extra),
    ]);
  }

  const changed = [];
  expectedFiles.forEach((relativePath) => {
    const expectedHash = hashFile(path.join(packageRoot, relativePath));
    const actualHash = hashFile(path.join(VENDOR_ROOT, relativePath));
    if (expectedHash !== actualHash) {
      changed.push({
        path: relativePath,
        actualHash,
        expectedPatchHash: DOPPLER_VENDOR_PATCH_HASHES[relativePath] || '',
      });
    }
  });
  const unknownChanges = changed.filter((row) => !row.expectedPatchHash);
  if (unknownChanges.length) {
    fail(
      'vendor file contents differ from the published Doppler package outside the pinned local patch set',
      relativeSample('changed:', unknownChanges.map((row) => row.path))
    );
  }
  const patchHashMismatches = changed.filter((row) => row.expectedPatchHash && row.actualHash !== row.expectedPatchHash);
  if (patchHashMismatches.length) {
    fail(
      'vendor local patch hashes differ from the pinned deploy patch set',
      relativeSample('changed:', patchHashMismatches.map((row) => `${row.path} sha256=${row.actualHash}`))
    );
  }
}

function main() {
  verifyVendorPackageJson();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'simulatte-doppler-vendor-'));
  try {
    const packOutput = run('npm', [
      'pack',
      `${DOPPLER_PACKAGE.name}@${DOPPLER_PACKAGE.version}`,
      '--pack-destination',
      tempDir,
      '--json',
      '--silent',
    ]);
    const packument = JSON.parse(packOutput);
    const entry = verifyPackageMetadata(packument);
    const tarballPath = path.join(tempDir, entry.filename);
    run('tar', ['-xzf', tarballPath, '-C', tempDir], { cwd: ROOT });
    verifyVendorMatchesPackage(path.join(tempDir, 'package'));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  const patchCount = Object.keys(DOPPLER_VENDOR_PATCH_HASHES).length;
  console.log(`Deploy surface clean: public/vendor/doppler matches ${DOPPLER_PACKAGE.name}@${DOPPLER_PACKAGE.version} plus ${patchCount} pinned local patch files.`);
}

try {
  main();
} catch (error) {
  console.error(error && error.message ? error.message : String(error));
  process.exit(1);
}
