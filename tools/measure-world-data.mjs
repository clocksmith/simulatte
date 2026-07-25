#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataRoot = path.join(root, 'public/data');
const limit = Number(process.argv.find((arg) => arg.startsWith('--limit='))?.split('=')[1] || 12);

function jsonFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? jsonFiles(absolute) : entry.name.endsWith('.json') ? [absolute] : [];
  });
}

function activationCount(value) {
  if (Array.isArray(value)) return value.length;
  if (!value || typeof value !== 'object') return 1;
  return Object.values(value).reduce((sum, row) => sum + (Array.isArray(row) ? row.length : 1), 0);
}

const candidates = jsonFiles(dataRoot)
  .map((file) => ({ file, bytes: fs.statSync(file).size }))
  .sort((a, b) => b.bytes - a.bytes)
  .slice(0, Math.max(1, limit));
const rows = [];
for (const candidate of candidates) {
  const transferStartedAt = performance.now();
  const bytes = fs.readFileSync(candidate.file);
  const transferMs = performance.now() - transferStartedAt;
  const heapBefore = process.memoryUsage().heapUsed;
  const parseStartedAt = performance.now();
  const parsed = JSON.parse(bytes);
  const parseMs = performance.now() - parseStartedAt;
  const heapAfter = process.memoryUsage().heapUsed;
  const activationStartedAt = performance.now();
  const activatedRows = activationCount(parsed);
  const activationMs = performance.now() - activationStartedAt;
  rows.push({
    path: path.relative(root, candidate.file),
    transferBytes: candidate.bytes,
    transferMs: Number(transferMs.toFixed(3)),
    parseMs: Number(parseMs.toFixed(3)),
    heapDeltaBytes: Math.max(0, heapAfter - heapBefore),
    activationMs: Number(activationMs.toFixed(3)),
    activatedRows,
  });
}
process.stdout.write(`${JSON.stringify({
  schema: 'simulatte.worldDataMeasurement.v1',
  measuredAt: new Date().toISOString(),
  claimBoundary: 'Local filesystem and Node heap measurements; not browser network benchmarks.',
  rows,
}, null, 2)}\n`);
