#!/usr/bin/env node
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  modelRuntimeLockHashFromText,
  validateVendorInferenceReport,
} from './vendor-inference-receipt.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const options = {
    outDir: path.join(root, 'artifacts', 'simulatte-vendor-inference'),
    profileDir: path.join(root, 'artifacts', 'model-cache-profile'),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const [key, inline] = argv[index].split('=');
    const value = () => inline ?? argv[++index];
    if (key === '--out') options.outDir = path.resolve(value());
    else if (key === '--profile-dir') options.profileDir = path.resolve(value());
    else throw new Error(`unknown vendor inference option: ${key}`);
  }
  return options;
}

function runAudit(options) {
  const args = [
    'tools/audit-intent-scene-screenshots.mjs',
    '--curated', '1',
    '--broad', '0',
    '--four', '0',
    '--eighty', '0',
    '--intent-mode', 'model',
    '--timeout-ms', '60000',
    '--profile-dir', options.profileDir,
    '--out', options.outDir,
  ];
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd: root, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`model-backed browser audit failed (${signal || `exit ${code}`})`));
    });
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  await runAudit(options);
  const lockPath = path.join(root, 'public', 'data', 'simulatte-embedder', 'model-runtime-lock.json');
  const [lockText, reportText] = await Promise.all([
    fs.readFile(lockPath, 'utf8'),
    fs.readFile(path.join(options.outDir, 'report.json'), 'utf8'),
  ]);
  const lock = JSON.parse(lockText);
  const report = JSON.parse(reportText);
  const receipt = validateVendorInferenceReport(report, lock, modelRuntimeLockHashFromText(lockText));
  const receiptPath = path.join(options.outDir, 'receipt.json');
  await fs.writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(JSON.stringify({ receiptPath, ...receipt }, null, 2));
}

main().catch((error) => {
  console.error(error && error.stack || error);
  process.exit(1);
});
