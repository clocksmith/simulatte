#!/usr/bin/env node
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { runTestFileWithWatchdog } from './test-file-watchdog.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const testsDir = path.join(root, 'tests');
const execFileAsync = promisify(execFile);

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

async function worktreeFingerprint() {
  const [{ stdout: diff }, { stdout: status }] = await Promise.all([
    execFileAsync('git', ['diff', '--binary', 'HEAD'], { cwd: root, encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 }),
    execFileAsync('git', ['status', '--porcelain=v1', '-z', '--untracked-files=all'], {
      cwd: root,
      encoding: 'buffer',
      maxBuffer: 16 * 1024 * 1024,
    }),
  ]);
  const hash = crypto.createHash('sha256').update(diff).update(status);
  const rows = status.toString('utf8').split('\0').filter(Boolean);
  for (const row of rows) {
    if (!row.startsWith('?? ')) continue;
    const file = path.join(root, row.slice(3));
    const stat = await fs.stat(file).catch(() => null);
    if (stat?.isFile()) hash.update(await fs.readFile(file));
  }
  return hash.digest('hex');
}

function tapCount(output) {
  const match = String(output || '').match(/^# tests (\d+)$/m);
  return match ? Number(match[1]) : 0;
}

async function main() {
  const policy = await loadPolicy();
  const argv = process.argv.slice(2);
  const failFast = argv.includes('--fail-fast');
  const files = await testFiles(argv);
  const results = new Array(files.length);
  const controller = new AbortController();
  const initialFingerprint = await worktreeFingerprint();
  let worktreeError = null;
  let cursor = 0;
  let interruptedSignal = '';

  const interrupt = (signal) => {
    interruptedSignal = signal;
    controller.abort();
  };
  const handleSigint = () => interrupt('SIGINT');
  const handleSigterm = () => interrupt('SIGTERM');
  process.once('SIGINT', handleSigint);
  process.once('SIGTERM', handleSigterm);

  const worker = async () => {
    while (!controller.signal.aborted) {
      // Reserve the slot before the fingerprint await. Otherwise concurrent
      // workers can all observe the same final cursor value and overrun files.
      const index = cursor++;
      if (index >= files.length) return;
      if (await worktreeFingerprint() !== initialFingerprint) {
        worktreeError = new Error('worktree changed while tests were running; refusing mixed-revision results');
        controller.abort();
        return;
      }
      const file = files[index];
      const name = path.basename(file);
      const override = policy.overrides && policy.overrides[name] || {};
      process.stdout.write(`START ${name}\n`);
      const result = await runTestFileWithWatchdog(file, {
        cwd: root,
        stallTimeoutMs: Number(override.stallTimeoutMs || policy.stallTimeoutMs),
        terminationGraceMs: Number(override.terminationGraceMs || policy.terminationGraceMs),
        signal: controller.signal,
      });
      results[index] = { file, name, ...result };
      process.stdout.write(`${result.status.toUpperCase()} ${name} tests=${tapCount(result.stdout)}\n`);
      if (await worktreeFingerprint() !== initialFingerprint) {
        worktreeError = new Error('worktree changed while tests were running; refusing mixed-revision results');
        controller.abort();
      } else if (failFast && result.status !== 'passed') {
        controller.abort();
      }
    }
  };

  try {
    await Promise.all(Array.from({ length: Math.min(policy.concurrency, files.length) }, () => worker()));
  } finally {
    process.removeListener('SIGINT', handleSigint);
    process.removeListener('SIGTERM', handleSigterm);
  }
  if (worktreeError) throw worktreeError;
  if (interruptedSignal) throw new Error(`test run interrupted by ${interruptedSignal}; child processes were terminated`);
  const completedResults = results.filter(Boolean);
  const failures = completedResults.filter((result) => result.status !== 'passed');
  for (const failure of failures) {
    process.stderr.write(`\n--- ${failure.name} (${failure.status}) ---\n`);
    process.stderr.write(failure.stdout);
    process.stderr.write(failure.stderr);
  }
  const testCount = completedResults.reduce((sum, result) => sum + tapCount(result.stdout), 0);
  process.stdout.write(`TEST-RUN files=${completedResults.length}/${files.length} tests=${testCount} passed=${completedResults.length - failures.length} failed=${failures.length}\n`);
  if (failures.length || completedResults.length !== files.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error && error.stack || error);
  process.exit(1);
});
