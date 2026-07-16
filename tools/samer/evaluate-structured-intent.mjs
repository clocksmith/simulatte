#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const POLICY_PATH = path.join(ROOT, 'tools', 'samer', 'structured-intent-evaluation-policy.json');

export function evaluateStructuredIntentTrial(trial, policy = readPolicy()) {
  validateTrial(trial, policy);
  const entityCounts = matchCounts(trial.rows, 'entities', canonicalEntity);
  const relationCounts = matchCounts(trial.rows, 'relations', canonicalRelation);
  const unsupportedCounts = matchCounts(trial.rows, 'unsupportedConcepts', String);
  const obligationCounts = trial.rows.reduce((counts, row) => addSetCounts(
    counts,
    row.expected.phase8Obligations,
    row.actual.phase8CoveredObligations,
    String
  ), zeroCounts());
  const metrics = {
    entityPreservation: round(f1(entityCounts)),
    relationPreservation: round(f1(relationCounts)),
    unsupportedConceptRecall: round(recall(unsupportedCounts)),
    schemaValidity: round(trial.rows.filter((row) => row.actual.schemaValid === true).length / trial.rows.length),
    phase8ObligationCoverage: round(recall(obligationCounts)),
  };
  const failedMetrics = Object.entries(policy.requiredMetrics)
    .filter(([id, contract]) => metrics[id] < contract.minimum)
    .map(([id]) => id);
  return {
    schema: 'simulatte.structuredIntentEvaluation.v1',
    policyId: policy.id,
    population: { ...trial.population },
    candidate: { ...trial.candidate },
    rowCount: trial.rows.length,
    metrics,
    metricCounts: {
      entities: entityCounts,
      relations: relationCounts,
      unsupportedConcepts: unsupportedCounts,
      phase8Obligations: obligationCounts,
    },
    promotionEligible: failedMetrics.length === 0,
    failedMetrics,
  };
}

function validateTrial(trial, policy) {
  if (!policy || policy.schema !== 'simulatte.structuredIntentEvaluationPolicy.v1') fail('policy schema mismatch');
  if (!trial || trial.schema !== 'simulatte.structuredIntentTrial.v1') fail('trial schema mismatch');
  const population = trial.population || {};
  if (population.schema !== policy.populationContract) fail('population schema mismatch');
  if (population.visibility !== 'sealed' || population.contaminationStatus !== 'unexposed') fail('structured intent promotion requires an unexposed sealed population');
  requireHash(population.commitmentSha256, 'population commitment');
  requireText(trial.candidate && trial.candidate.id, 'candidate id');
  requireText(trial.candidate && trial.candidate.implementationId, 'candidate implementation id');
  if (!Array.isArray(trial.rows) || !trial.rows.length) fail('trial rows are required');
  const ids = new Set();
  for (const row of trial.rows) {
    requireText(row.id, 'row id');
    if (ids.has(row.id)) fail(`duplicate row id ${row.id}`);
    ids.add(row.id);
    for (const side of ['expected', 'actual']) {
      if (!row[side] || typeof row[side] !== 'object') fail(`${row.id} ${side} artifact is required`);
      for (const field of ['entities', 'relations', 'unsupportedConcepts']) requireArray(row[side][field], `${row.id} ${side}.${field}`);
    }
    requireArray(row.expected.phase8Obligations, `${row.id} expected.phase8Obligations`);
    requireArray(row.actual.phase8CoveredObligations, `${row.id} actual.phase8CoveredObligations`);
    if (typeof row.actual.schemaValid !== 'boolean') fail(`${row.id} actual.schemaValid must be boolean`);
    row.expected.entities.forEach(canonicalEntity);
    row.actual.entities.forEach(canonicalEntity);
    row.expected.relations.forEach(canonicalRelation);
    row.actual.relations.forEach(canonicalRelation);
  }
}

function matchCounts(rows, field, canonicalize) {
  return rows.reduce((counts, row) => addSetCounts(counts, row.expected[field], row.actual[field], canonicalize), zeroCounts());
}

function addSetCounts(counts, expectedRows, actualRows, canonicalize) {
  const expected = new Set(expectedRows.map(canonicalize));
  const actual = new Set(actualRows.map(canonicalize));
  for (const id of actual) expected.has(id) ? counts.truePositive += 1 : counts.falsePositive += 1;
  for (const id of expected) if (!actual.has(id)) counts.falseNegative += 1;
  return counts;
}

function canonicalEntity(entity) {
  if (typeof entity === 'string') return requireText(entity, 'entity');
  return [
    requireText(entity && entity.id, 'entity id'),
    String(entity && entity.role || ''),
    String((entity && entity.count) ?? 1),
  ].join('|');
}

function canonicalRelation(relation) {
  if (typeof relation === 'string') return requireText(relation, 'relation');
  return [
    requireText(relation && relation.source, 'relation source'),
    requireText(relation && relation.type, 'relation type'),
    requireText(relation && relation.target, 'relation target'),
  ].join('|');
}

function zeroCounts() {
  return { truePositive: 0, falsePositive: 0, falseNegative: 0 };
}

function precision(counts) {
  return counts.truePositive / Math.max(1, counts.truePositive + counts.falsePositive);
}

function recall(counts) {
  return counts.truePositive / Math.max(1, counts.truePositive + counts.falseNegative);
}

function f1(counts) {
  const p = precision(counts);
  const r = recall(counts);
  return p + r ? 2 * p * r / (p + r) : 0;
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
  const report = evaluateStructuredIntentTrial(JSON.parse(bytes.toString('utf8')));
  report.trialSha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (options.out) fs.writeFileSync(path.resolve(options.out), serialized);
  process.stdout.write(serialized);
}

function requireText(value, label) {
  const text = String(value || '').trim();
  if (!text) fail(`${label} is required`);
  return text;
}

function requireHash(value, label) {
  if (!/^[a-f0-9]{64}$/.test(String(value || ''))) fail(`${label} must be a SHA-256 digest`);
}

function requireArray(value, label) {
  if (!Array.isArray(value)) fail(`${label} must be an array`);
}

function round(value) {
  return Number(value.toFixed(6));
}

function fail(message) {
  throw new Error(`Structured intent evaluation invalid: ${message}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error && error.stack ? error.stack : error);
    process.exitCode = 1;
  }
}
