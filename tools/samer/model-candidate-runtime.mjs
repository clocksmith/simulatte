#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

const MODEL_FALSE = Object.freeze({ executed: false });

export function runDeterministicCandidate(workload) {
  validateWorkload(workload);
  const started = performance.now();
  const rows = workload.rows.map((row) => {
    const rowStarted = performance.now();
    const prediction = workload.task === 'classification'
      ? classifyRow(row)
      : rankRow(row, workload.task === 'reranking');
    return { ...prediction, durationMs: round(performance.now() - rowStarted) };
  });
  return {
    schema: 'simulatte.modelCandidatePredictions.v1',
    candidateId: workload.candidateId,
    task: workload.task,
    kind: 'deterministic-rules',
    model: MODEL_FALSE,
    modelId: null,
    policy: workload.task === 'classification'
      ? 'deterministic-tfidf-label-ranking-v1'
      : workload.task === 'embedding-retrieval'
        ? 'deterministic-lexical-retrieval-v1'
        : 'deterministic-typed-score-reranker-v1',
    rows,
    performance: {
      coldLoadMs: round(Number(workload.loadDurationMs || 0)),
      warmLatencyMs: rows.map((row) => row.durationMs),
      totalExecutionMs: round(performance.now() - started),
      downloadBytes: 0,
      peakMemoryBytes: process.memoryUsage().rss,
    },
  };
}

function classifyRow(row) {
  const labels = Array.isArray(row.labels) ? row.labels : [];
  if (!labels.length) fail(`classification row ${row.id || 'missing'} has no labels`);
  const inputText = [row.text, row.span].filter(Boolean).join(' ');
  const scored = labels.map((label) => ({
    id: label.id,
    score: tfidfLikeScore(inputText, [label.id, label.description].filter(Boolean).join(' ')),
  })).sort(scoreOrder);
  const top = scored[0] || { id: 'abstain', score: 0 };
  const next = scored[1] || { score: 0 };
  const confidence = normalizedMargin(top.score, next.score);
  const minimumConfidence = Number(row.minimumConfidence || 0);
  const abstentionId = row.abstentionId || 'abstain';
  return {
    id: row.id,
    predictedLabel: confidence >= minimumConfidence ? top.id : abstentionId,
    confidence,
    scores: scored,
  };
}

function rankRow(row, typedBoost) {
  const candidates = Array.isArray(row.candidates) ? row.candidates : [];
  if (!candidates.length) fail(`ranking row ${row.id || 'missing'} has no candidates`);
  const queryTokens = tokenSet(row.query);
  const scored = candidates.map((candidate) => {
    const text = [candidate.id, candidate.text, ...(candidate.types || [])].filter(Boolean).join(' ');
    const lexical = tfidfLikeScore(row.query, text);
    const typeHits = typedBoost
      ? (candidate.types || []).filter((type) => queryTokens.has(normalizeToken(type))).length
      : 0;
    return {
      id: candidate.id,
      score: round(Math.min(1, lexical + typeHits * 0.08)),
    };
  }).sort(scoreOrder);
  const top = scored[0] || { score: 0 };
  const next = scored[1] || { score: 0 };
  const margin = round(top.score - next.score);
  const minimumScore = Number(row.minimumScore || 0.08);
  const minimumMargin = Number(row.minimumMargin || 0.015);
  return {
    id: row.id,
    ranking: scored.map((candidate) => candidate.id),
    scores: scored,
    refused: top.score < minimumScore || margin < minimumMargin,
    topScore: top.score,
    margin,
  };
}

function tfidfLikeScore(left, right) {
  const leftFeatures = featureVector(left);
  const rightFeatures = featureVector(right);
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (const [key, value] of leftFeatures) {
    leftNorm += value * value;
    dot += value * (rightFeatures.get(key) || 0);
  }
  for (const value of rightFeatures.values()) rightNorm += value * value;
  if (!leftNorm || !rightNorm) return 0;
  return round(dot / Math.sqrt(leftNorm * rightNorm));
}

function featureVector(text) {
  const tokens = normalizedTokens(text);
  const vector = new Map();
  const add = (key, weight) => vector.set(key, (vector.get(key) || 0) + weight);
  for (const token of tokens) {
    add(`w:${token}`, 1);
    const padded = `^${token}$`;
    for (const size of [3, 4]) {
      for (let index = 0; index <= padded.length - size; index += 1) add(`g:${padded.slice(index, index + size)}`, 0.38);
    }
  }
  for (let index = 0; index < tokens.length - 1; index += 1) add(`b:${tokens[index]}_${tokens[index + 1]}`, 0.72);
  return vector;
}

function tokenSet(text) {
  return new Set(normalizedTokens(text));
}

function normalizedTokens(text) {
  return String(text || '').toLowerCase().split(/[^a-z0-9]+/).map(normalizeToken).filter((token) => token.length > 1);
}

function normalizeToken(token) {
  const value = String(token || '').toLowerCase();
  return value.length > 3 && value.endsWith('s') ? value.slice(0, -1) : value;
}

function normalizedMargin(top, next) {
  if (top <= 0) return 0;
  return round(Math.max(0, Math.min(1, top - next * 0.35)));
}

function scoreOrder(left, right) {
  return right.score - left.score || left.id.localeCompare(right.id);
}

function validateWorkload(workload) {
  if (!workload || workload.schema !== 'simulatte.modelCandidateWorkload.v1') fail('workload schema mismatch');
  if (!['classification', 'embedding-retrieval', 'reranking'].includes(workload.task)) fail('workload task mismatch');
  if (!Array.isArray(workload.rows) || !workload.rows.length) fail('workload rows are required');
}

function round(value) {
  return Number(Number(value || 0).toFixed(6));
}

function fail(message) {
  throw new Error(`Deterministic model candidate invalid: ${message}`);
}

function parseArgs(argv) {
  const options = { input: '', out: '' };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!['--input', '--out'].includes(key)) fail(`unknown argument ${key}`);
    options[key.slice(2)] = argv[++index] || '';
  }
  if (!options.input) fail('--input is required');
  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const loadStarted = performance.now();
  const workload = JSON.parse(fs.readFileSync(path.resolve(options.input), 'utf8'));
  workload.loadDurationMs = performance.now() - loadStarted;
  const result = runDeterministicCandidate(workload);
  const serialized = `${JSON.stringify(result, null, 2)}\n`;
  if (options.out) fs.writeFileSync(path.resolve(options.out), serialized);
  else process.stdout.write(serialized);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error && error.stack ? error.stack : error);
    process.exitCode = 1;
  }
}
