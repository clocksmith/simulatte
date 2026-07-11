#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readModelRuntimeLock } from './model-runtime-lock-utils.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODEL_RUNTIME_LOCK = readModelRuntimeLock();
const DOPPLER_PACKAGE = Object.freeze(MODEL_RUNTIME_LOCK.doppler && MODEL_RUNTIME_LOCK.doppler.package || {});
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
      changed.push(relativePath);
    }
  });
  if (changed.length) {
    fail(
      'vendor file contents differ from the published Doppler package',
      relativeSample('changed:', changed)
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

  console.log(`Deploy surface clean: lock #${MODEL_RUNTIME_LOCK.number} pins public/vendor/doppler to ${DOPPLER_PACKAGE.name}@${DOPPLER_PACKAGE.version}.`);
}

try {
  main();
} catch (error) {
  console.error(error && error.message ? error.message : String(error));
  process.exit(1);
}
