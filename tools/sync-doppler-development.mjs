#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MODEL_RUNTIME_LOCK_PATH,
  readModelRuntimeLock,
} from './model-runtime-lock-utils.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VENDOR_ROOT = path.join(ROOT, 'public', 'vendor', 'doppler');
const LIST_LIMIT = 20;
const WRITE = process.argv.includes('--write');

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
  const lines = [`Doppler development source invalid: ${message}`];
  if (details.length) lines.push('', ...details);
  throw new Error(lines.join('\n'));
}

function listFiles(root) {
  const files = [];
  const walk = (relativeDir) => {
    const absoluteDir = path.join(root, relativeDir);
    const entries = fs.readdirSync(absoluteDir, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const relativePath = path.join(relativeDir, entry.name);
      const normalized = relativePath.split(path.sep).join('/');
      if (entry.isDirectory()) {
        walk(relativePath);
      } else if (entry.isFile()) {
        files.push(normalized);
      } else {
        fail(`unsupported package entry ${normalized}; expected a regular file`);
      }
    }
  };
  walk('.');
  return files;
}

function hashFile(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function sample(label, rows) {
  const visible = rows.slice(0, LIST_LIMIT).map((row) => `${label} ${row}`);
  if (rows.length > LIST_LIMIT) visible.push(`${label} ... ${rows.length - LIST_LIMIT} more`);
  return visible;
}

function compareTrees(expectedRoot, actualRoot) {
  const expectedFiles = listFiles(expectedRoot);
  const actualFiles = fs.existsSync(actualRoot) ? listFiles(actualRoot) : [];
  const expectedSet = new Set(expectedFiles);
  const actualSet = new Set(actualFiles);
  const missing = expectedFiles.filter((file) => !actualSet.has(file));
  const extra = actualFiles.filter((file) => !expectedSet.has(file));
  const changed = expectedFiles.filter((file) => (
    actualSet.has(file)
    && hashFile(path.join(expectedRoot, file)) !== hashFile(path.join(actualRoot, file))
  ));
  return { expectedFiles, actualFiles, missing, extra, changed };
}

function replaceVendorTree(packageRoot) {
  const parent = path.dirname(VENDOR_ROOT);
  const stage = path.join(parent, `.doppler-sync-${process.pid}`);
  const backup = path.join(parent, `.doppler-backup-${process.pid}`);
  fs.rmSync(stage, { recursive: true, force: true });
  fs.rmSync(backup, { recursive: true, force: true });
  fs.cpSync(packageRoot, stage, { recursive: true, force: true });
  try {
    if (fs.existsSync(VENDOR_ROOT)) fs.renameSync(VENDOR_ROOT, backup);
    fs.renameSync(stage, VENDOR_ROOT);
    fs.rmSync(backup, { recursive: true, force: true });
  } catch (error) {
    if (!fs.existsSync(VENDOR_ROOT) && fs.existsSync(backup)) {
      fs.renameSync(backup, VENDOR_ROOT);
    }
    fs.rmSync(stage, { recursive: true, force: true });
    throw error;
  }
}

function verifyPackument(packument, packagePin, refreshIdentity) {
  if (!Array.isArray(packument) || packument.length !== 1) {
    fail(`npm pack returned ${Array.isArray(packument) ? packument.length : 'non-array'} entries; expected one`);
  }
  const entry = packument[0];
  const stableChecks = [
    ['name', entry.name, packagePin.name],
    ['version', entry.version, packagePin.version],
  ];
  const identityChecks = [
    ['integrity', entry.integrity, packagePin.integrity],
    ['shasum', entry.shasum, packagePin.shasum],
    ['fileCount', Number(entry.entryCount), Number(packagePin.fileCount)],
  ];
  for (const [label, actual, expected] of stableChecks) {
    if (actual !== expected) fail(`package ${label} mismatch: expected ${expected}, received ${actual}`);
  }
  if (refreshIdentity) {
    if (!String(entry.integrity || '').startsWith('sha512-')) fail('npm pack did not return a sha512 integrity');
    if (!/^[0-9a-f]{40}$/i.test(String(entry.shasum || ''))) fail('npm pack did not return a valid shasum');
    if (!Number.isInteger(Number(entry.entryCount)) || Number(entry.entryCount) < 1) {
      fail('npm pack did not return a positive file count');
    }
  } else {
    for (const [label, actual, expected] of identityChecks) {
      if (actual !== expected) fail(`package ${label} mismatch: expected ${expected}, received ${actual}`);
    }
  }
  return entry;
}

function writeLock(lock) {
  const stage = `${MODEL_RUNTIME_LOCK_PATH}.${process.pid}.tmp`;
  fs.writeFileSync(stage, `${JSON.stringify(lock, null, 2)}\n`);
  fs.renameSync(stage, MODEL_RUNTIME_LOCK_PATH);
}

function main() {
  if (WRITE && process.argv.includes('--check')) fail('choose either --write or --check');
  const lock = readModelRuntimeLock();
  const development = lock.doppler && lock.doppler.development || {};
  const packagePin = lock.doppler && lock.doppler.package || {};
  if (development.kind !== 'sibling-git-archive') {
    fail('doppler.development.kind must be sibling-git-archive');
  }
  if (!/^[0-9a-f]{40}$/i.test(String(development.gitSha || ''))) {
    fail('doppler.development.gitSha must be a full Git SHA');
  }
  const siblingRoot = path.resolve(ROOT, String(development.workspacePath || ''));
  if (!fs.existsSync(path.join(siblingRoot, '.git'))) {
    fail(`sibling repository not found at ${siblingRoot}`);
  }
  const siblingHead = run('git', ['rev-parse', 'HEAD'], { cwd: siblingRoot }).trim();
  if (!WRITE && siblingHead !== development.gitSha) {
    fail(`sibling HEAD ${siblingHead} differs from lock #${lock.number} source ${development.gitSha}`);
  }
  const sourceSha = WRITE ? siblingHead : development.gitSha;

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'simulatte-doppler-development-'));
  try {
    const archivePath = path.join(tempDir, 'doppler.tar');
    run('git', ['archive', '--format=tar', `--output=${archivePath}`, sourceSha], { cwd: siblingRoot });
    run('tar', ['-xf', archivePath, '-C', tempDir]);
    const packDir = path.join(tempDir, 'pack');
    fs.mkdirSync(packDir);
    const output = run('npm', [
      'pack',
      tempDir,
      '--ignore-scripts',
      '--pack-destination',
      packDir,
      '--json',
      '--silent',
    ]);
    const entry = verifyPackument(JSON.parse(output), packagePin, WRITE);
    run('tar', ['-xzf', path.join(packDir, entry.filename), '-C', packDir]);
    const packageRoot = path.join(packDir, 'package');
    const initial = compareTrees(packageRoot, VENDOR_ROOT);
    if (WRITE && (initial.missing.length || initial.extra.length || initial.changed.length)) {
      replaceVendorTree(packageRoot);
    }
    const comparison = compareTrees(packageRoot, VENDOR_ROOT);
    const expectedFileCount = WRITE ? Number(entry.entryCount) : Number(packagePin.fileCount);
    if (comparison.expectedFiles.length !== expectedFileCount) {
      fail(`packed source has ${comparison.expectedFiles.length} files; expected ${expectedFileCount}`);
    }
    if (comparison.missing.length || comparison.extra.length || comparison.changed.length) {
      fail('public/vendor/doppler differs from the pinned sibling package', [
        ...sample('missing:', comparison.missing),
        ...sample('extra:', comparison.extra),
        ...sample('changed:', comparison.changed),
      ]);
    }
    if (WRITE) {
      packagePin.integrity = entry.integrity;
      packagePin.shasum = entry.shasum;
      packagePin.fileCount = Number(entry.entryCount);
      development.gitSha = sourceSha;
      writeLock(lock);
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
  const action = WRITE ? 'synced' : 'clean';
  console.log(`Doppler development source ${action}: lock #${lock.number} uses ${packagePin.name}@${packagePin.version} from ${sourceSha}.`);
}

try {
  main();
} catch (error) {
  console.error(error && error.message ? error.message : String(error));
  process.exit(1);
}
