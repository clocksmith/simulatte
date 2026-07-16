#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const POLICY_PATH = path.join(ROOT, 'tools', 'samer', 'conditional-reranking-policy.json');
const SIGNALS = Object.freeze(['lexicalMargin', 'embeddingMargin', 'entropy', 'candidateDisagreement']);

export function evaluateRerankSkipFrontier(trial, policy = readPolicy()) {
  validateTrial(trial, policy);
  const baselineCorrect = trial.rows.filter((row) => row.modelWinnerId === row.expectedWinnerId).length;
  const baselineAccuracy = baselineCorrect / trial.rows.length;
  const evaluated = trial.rules.map((rule) => {
    const decisions = trial.rows.map((row) => decisionFor(row, rule));
    const correct = decisions.filter((decision) => decision.selectedWinnerId === decision.expectedWinnerId).length;
    const skipped = decisions.filter((decision) => decision.modelExecuted === false).length;
    const winnerAccuracy = correct / decisions.length;
    const skipRate = skipped / decisions.length;
    const degradation = Math.max(0, baselineAccuracy - winnerAccuracy);
    const qualityPass = winnerAccuracy >= policy.quality.minimumWinnerAccuracy
      && degradation <= policy.quality.maximumAccuracyDegradationFromAlwaysRerank;
    return {
      id: rule.id,
      thresholds: { ...rule.thresholds },
      winnerAccuracy: round(winnerAccuracy),
      modelSkipRate: round(skipRate),
      modelExecutionRate: round(1 - skipRate),
      accuracyDegradation: round(degradation),
      qualityPass,
      decisions,
    };
  });
  const eligible = evaluated.filter((row) => row.qualityPass).sort((left, right) => (
    right.modelSkipRate - left.modelSkipRate
    || right.winnerAccuracy - left.winnerAccuracy
    || left.id.localeCompare(right.id)
  ));
  const selected = eligible[0] || null;
  return {
    schema: 'simulatte.conditionalRerankingFrontier.v1',
    policyId: policy.id,
    population: { ...trial.population },
    baseline: {
      policy: 'always-rerank',
      winnerAccuracy: round(baselineAccuracy),
      modelExecutionRate: 1,
    },
    rules: evaluated,
    selectedRuleId: selected ? selected.id : null,
    promotionEligible: Boolean(selected),
    runtimeActivationReceiptRequired: true,
    rejectionReasons: selected ? [] : ['no skip rule preserves the sealed reranking quality floor'],
  };
}

function decisionFor(row, rule) {
  const thresholds = rule.thresholds;
  const skip = row.signals.lexicalMargin >= thresholds.minimumLexicalMargin
    && row.signals.embeddingMargin >= thresholds.minimumEmbeddingMargin
    && row.signals.entropy <= thresholds.maximumEntropy
    && row.signals.candidateDisagreement <= thresholds.maximumCandidateDisagreement;
  return {
    rowId: row.id,
    ruleId: rule.id,
    signalValues: { ...row.signals },
    candidateCount: row.candidateCount,
    modelExecuted: !skip,
    modelNotExecutedReason: skip ? `sealed-calibrated-rule:${rule.id}` : null,
    selectedWinnerId: skip ? row.controlWinnerId : row.modelWinnerId,
    expectedWinnerId: row.expectedWinnerId,
  };
}

function validateTrial(trial, policy) {
  if (!policy || policy.schema !== 'simulatte.conditionalRerankingPolicy.v1') fail('policy schema mismatch');
  if (!trial || trial.schema !== 'simulatte.conditionalRerankingTrial.v1') fail('trial schema mismatch');
  const population = trial.population || {};
  if (population.schema !== policy.populationContract) fail('population schema mismatch');
  if (population.visibility !== 'sealed' || population.contaminationStatus !== 'unexposed') fail('conditional reranking requires an unexposed sealed population');
  requireHash(population.commitmentSha256, 'population commitment');
  if (!Array.isArray(trial.rows) || trial.rows.length < policy.quality.minimumEvaluatedRows) fail(`trial requires at least ${policy.quality.minimumEvaluatedRows} rows`);
  if (!Array.isArray(trial.rules) || !trial.rules.length) fail('trial rules are required');
  const rowIds = new Set();
  for (const row of trial.rows) {
    requireText(row.id, 'row id');
    if (rowIds.has(row.id)) fail(`duplicate row id ${row.id}`);
    rowIds.add(row.id);
    requirePositiveInteger(row.candidateCount, `${row.id} candidate count`);
    for (const field of ['expectedWinnerId', 'controlWinnerId', 'modelWinnerId']) requireText(row[field], `${row.id} ${field}`);
    for (const signal of SIGNALS) requireUnit(row.signals && row.signals[signal], `${row.id} ${signal}`);
  }
  const ruleIds = new Set();
  for (const rule of trial.rules) {
    requireText(rule.id, 'rule id');
    if (ruleIds.has(rule.id)) fail(`duplicate rule id ${rule.id}`);
    ruleIds.add(rule.id);
    for (const field of ['minimumLexicalMargin', 'minimumEmbeddingMargin', 'maximumEntropy', 'maximumCandidateDisagreement']) {
      requireUnit(rule.thresholds && rule.thresholds[field], `${rule.id} ${field}`);
    }
  }
}

function readPolicy() {
  return JSON.parse(fs.readFileSync(POLICY_PATH, 'utf8'));
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
  const bytes = fs.readFileSync(path.resolve(options.input));
  const report = evaluateRerankSkipFrontier(JSON.parse(bytes.toString('utf8')));
  report.trialSha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (options.out) fs.writeFileSync(path.resolve(options.out), serialized);
  process.stdout.write(serialized);
}

function requireText(value, label) {
  if (!String(value || '').trim()) fail(`${label} is required`);
}

function requireHash(value, label) {
  if (!/^[a-f0-9]{64}$/.test(String(value || ''))) fail(`${label} must be a SHA-256 digest`);
}

function requirePositiveInteger(value, label) {
  if (!Number.isInteger(value) || value < 1) fail(`${label} must be a positive integer`);
}

function requireUnit(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 1) fail(`${label} must be between zero and one`);
}

function round(value) {
  return Number(value.toFixed(6));
}

function fail(message) {
  throw new Error(`Conditional reranking frontier invalid: ${message}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error && error.stack ? error.stack : error);
    process.exitCode = 1;
  }
}
