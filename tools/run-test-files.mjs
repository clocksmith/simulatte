#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runTestFileWithWatchdog } from './test-file-watchdog.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const testsDir = path.join(root, 'tests');

async function loadPolicy() {
  const policy = JSON.parse(await fs.readFile(path.join(testsDir, 'test-run-policy.json'), 'utf8'));
  if (policy.schema !== 'simulatte.testRunPolicy.v1') throw new Error('invalid test run policy schema');
  if (!Number.isInteger(policy.concurrency) || policy.concurrency < 1) throw new Error('test run policy requires positive concurrency');
  return policy;
}

async function testFiles(argv) {
  const requested = argv.filter((arg) => !arg.startsWith('-'));
  if (requested.length) return requested.map((file) => path.resolve(root, file)).sort();
  return (await fs.readdir(testsDir))
    .filter((file) => file.endsWith('.test.cjs'))
    .sort()
    .map((file) => path.join(testsDir, file));
}

function tapCount(output) {
  const match = String(output || '').match(/^# tests (\d+)$/m);
  return match ? Number(match[1]) : 0;
}

async function main() {
  const policy = await loadPolicy();
  const files = await testFiles(process.argv.slice(2));
  const results = new Array(files.length);
  let cursor = 0;

  const worker = async () => {
    while (cursor < files.length) {
      const index = cursor++;
      const file = files[index];
      const name = path.basename(file);
      const override = policy.overrides && policy.overrides[name] || {};
      process.stdout.write(`START ${name}\n`);
      const result = await runTestFileWithWatchdog(file, {
        cwd: root,
        stallTimeoutMs: Number(override.stallTimeoutMs || policy.stallTimeoutMs),
        terminationGraceMs: Number(override.terminationGraceMs || policy.terminationGraceMs),
      });
      results[index] = { file, name, ...result };
      process.stdout.write(`${result.status.toUpperCase()} ${name} tests=${tapCount(result.stdout)}\n`);
    }
  };

  await Promise.all(Array.from({ length: Math.min(policy.concurrency, files.length) }, () => worker()));
  const failures = results.filter((result) => result.status !== 'passed');
  for (const failure of failures) {
    process.stderr.write(`\n--- ${failure.name} (${failure.status}) ---\n`);
    process.stderr.write(failure.stdout);
    process.stderr.write(failure.stderr);
  }
  const testCount = results.reduce((sum, result) => sum + tapCount(result.stdout), 0);
  process.stdout.write(`TEST-RUN files=${results.length} tests=${testCount} passed=${results.length - failures.length} failed=${failures.length}\n`);
  if (failures.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error && error.stack || error);
  process.exit(1);
});
