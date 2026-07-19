#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  CLASSIFICATION_CALIBRATION_SCHEMA,
  populationRowFingerprints,
  RETRIEVAL_CALIBRATION_SCHEMA,
  validateCalibrationPopulationContract,
} from './model-selection-calibration.mjs';
import { classificationLabelPrototype } from './classification-label-prototypes.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const JOBS_PATH = path.join(ROOT, 'tools/samer/classification-jobs-v1.json');
const POLICY_PATH = path.join(ROOT, 'tools/samer/model-selection-policy.json');
const REGISTRY_PATH = path.join(ROOT, 'tools/samer/model-candidate-registry.json');

export function calibrateClassification(population, predictionsById, jobs, policy) {
  const partition = validateCalibrationPopulationContract(population, 'classification', policy);
  const developmentIds = new Set(partition.development.rowIds);
  const validationIds = new Set(partition.validation.rowIds);
  const candidates = {};
  for (const [candidateId, envelope] of Object.entries(predictionsById)) {
    validateEnvelope(envelope, candidateId, population);
    const byId = new Map(envelope.rows.map((row) => [row.id, row]));
    const heads = {};
    let eligible = true;
    for (const job of jobs.jobs) {
      const rows = population.rows.filter((row) => row.headId === job.id);
      const developmentRows = rows.filter((row) => developmentIds.has(row.id));
      const validationRows = rows.filter((row) => validationIds.has(row.id));
      const trials = thresholdCandidates(developmentRows.map((row) => Number(byId.get(row.id)?.confidence || 0)))
        .map((threshold) => classificationMetrics(developmentRows, byId, job, threshold));
      const passing = trials.filter((row) => classificationPasses(row, job.qualityFloor));
      const selected = (passing.length ? passing : trials).sort(classificationOrder)[0];
      const validationMetrics = classificationMetrics(validationRows, byId, job, selected.minimumConfidence);
      const clearsCalibrationGate = classificationPasses(validationMetrics, job.qualityFloor);
      eligible = eligible && clearsCalibrationGate;
      heads[job.id] = {
        minimumConfidence: selected.minimumConfidence,
        developmentMetrics: metricValues(selected, ['minimumConfidence']),
        validationMetrics: metricValues(validationMetrics, ['minimumConfidence']),
        clearsCalibrationGate,
      };
    }
    candidates[candidateId] = { eligible, heads };
  }
  return {
    schema: CLASSIFICATION_CALIBRATION_SCHEMA,
    id: `${population.id}-classification-abstention-v1`,
    policyId: policy.id,
    createdAt: new Date().toISOString(),
    population: populationReceipt(population),
    partition,
    candidates,
  };
}

export function calibrateRetrieval(population, predictionsById, cascades, policy) {
  const partition = validateCalibrationPopulationContract(population, 'embedding-retrieval', policy);
  const developmentIds = new Set(partition.development.rowIds);
  const validationIds = new Set(partition.validation.rowIds);
  const taskPolicy = policy.requiredTasks.find((row) => row.id === 'embedding-retrieval');
  const lexicalById = new Map();
  const results = {};
  for (const cascade of cascades) {
    const lexical = predictionsById[cascade.refusalGateCandidateId];
    const recall = predictionsById[cascade.recallCandidateId];
    validateEnvelope(lexical, cascade.refusalGateCandidateId, population);
    validateEnvelope(recall, cascade.recallCandidateId, population);
    lexical.rows.forEach((row) => lexicalById.set(row.id, row));
    const recallById = new Map(recall.rows.map((row) => [row.id, row]));
    const signalRows = population.rows.map((gold) => ({
      id: gold.id,
      mustRefuse: gold.mustRefuse === true,
      ...signals(lexicalById.get(gold.id), recallById.get(gold.id)),
    }));
    const developmentRows = signalRows.filter((row) => developmentIds.has(row.id));
    const validationRows = signalRows.filter((row) => validationIds.has(row.id));
    const grids = {
      lexicalTop: thresholdCandidates(developmentRows.map((row) => row.lexicalTopScore), 9),
      lexicalMargin: thresholdCandidates(developmentRows.map((row) => row.lexicalMargin), 9),
      recallTop: thresholdCandidates(developmentRows.map((row) => row.recallTopScore), 9),
      recallMargin: thresholdCandidates(developmentRows.map((row) => row.recallMargin), 9),
    };
    const trials = [];
    for (const minimumLexicalTopScore of grids.lexicalTop) {
      for (const minimumLexicalMargin of grids.lexicalMargin) {
        for (const minimumRecallTopScore of grids.recallTop) {
          for (const minimumRecallMargin of grids.recallMargin) {
            const rule = { minimumLexicalTopScore, minimumLexicalMargin, minimumRecallTopScore, minimumRecallMargin };
            trials.push({ ...rule, developmentMetrics: retrievalMetrics(developmentRows, rule) });
          }
        }
      }
    }
    const floor = policy.retrievalRefusalCascade.calibrationFloor;
    const passing = trials.filter((row) => retrievalPasses(row.developmentMetrics, floor));
    const selected = (passing.length ? passing : trials).sort(retrievalOrder)[0];
    const validationMetrics = retrievalMetrics(validationRows, selected);
    results[cascade.id] = {
      id: `${cascade.id}-deterministic-refusal-rule-v1`,
      refusalGateCandidateId: cascade.refusalGateCandidateId,
      recallCandidateId: cascade.recallCandidateId,
      ...selected,
      calibrationMetrics: validationMetrics,
      clearsCalibrationGate: retrievalPasses(validationMetrics, floor),
      sealedQualityFloor: { ...taskPolicy.qualityFloor },
    };
  }
  return {
    schema: RETRIEVAL_CALIBRATION_SCHEMA,
    id: `${population.id}-retrieval-refusal-v1`,
    policyId: policy.id,
    createdAt: new Date().toISOString(),
    population: populationReceipt(population),
    partition,
    cascades: results,
  };
}

export function sanitizedCalibrationWorkload(population, task, jobs, candidateId, k = 2) {
  validatePopulation(population, task);
  const jobsById = new Map(jobs.jobs.map((job) => [job.id, job]));
  const rows = population.rows.map((row) => {
    if (task === 'classification') {
      const job = jobsById.get(row.headId);
      if (!job) fail(`classification calibration row ${row.id} has unknown head ${row.headId}`);
      return {
        id: row.id,
        headId: row.headId,
        text: row.input.text,
        span: row.input.span || '',
        labels: job.labels
          .filter((id) => id !== job.abstention.label)
          .map((id) => ({ id, description: classificationLabelPrototype(job, id) })),
        abstentionId: job.abstention.label,
      };
    }
    return {
      id: row.id,
      query: row.query,
      candidates: row.candidates.map((candidate) => ({
        id: candidate.id,
        text: candidate.text,
        types: Array.isArray(candidate.types) ? candidate.types : [],
      })),
      minimumScore: 0,
      minimumMargin: 0,
    };
  });
  const workload = {
    schema: 'simulatte.modelCandidateWorkload.v1',
    id: `${population.id}-sanitized-calibration-v1`,
    candidateId,
    task,
    k,
    rows,
  };
  assertNoGold(workload);
  return workload;
}

function classificationMetrics(rows, predictions, job, minimumConfidence) {
  const labels = job.labels.filter((label) => !(job.scoredLabelsExclude || []).includes(label));
  const pairs = rows.map((gold) => {
    const prediction = predictions.get(gold.id);
    const scores = [...prediction.scores].sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));
    const predicted = Number(prediction.confidence) >= minimumConfidence ? scores[0].id : job.abstention.label;
    return { gold: gold.expectedLabel, predicted, confidence: Number(prediction.confidence) };
  });
  const answered = pairs.filter((row) => row.predicted !== job.abstention.label);
  const correctAnswered = answered.filter((row) => row.predicted === row.gold).length;
  return {
    minimumConfidence,
    macroF1: round(mean(labels.map((label) => f1(pairs, label)))),
    coverage: round(answered.length / Math.max(1, pairs.length)),
    selectiveRisk: round(answered.length ? 1 - correctAnswered / answered.length : 1),
    expectedCalibrationError: round(calibrationError(answered)),
  };
}

function retrievalMetrics(rows, rule) {
  const answerable = rows.filter((row) => !row.mustRefuse);
  const refusals = rows.filter((row) => row.mustRefuse);
  const accepts = (row) => (row.lexicalTopScore >= rule.minimumLexicalTopScore && row.lexicalMargin >= rule.minimumLexicalMargin)
    || (row.recallTopScore >= rule.minimumRecallTopScore && row.recallMargin >= rule.minimumRecallMargin);
  const refused = rows.filter((row) => !accepts(row));
  const correctRefusals = refused.filter((row) => row.mustRefuse).length;
  return {
    answerableAcceptance: round(mean(answerable.map((row) => accepts(row) ? 1 : 0))),
    mustRefuseAccuracy: round(mean(refusals.map((row) => accepts(row) ? 0 : 1))),
    refusalPrecision: round(refused.length ? correctRefusals / refused.length : 0),
  };
}

function signals(lexical, recall) {
  if (!lexical?.scores?.length || !recall?.scores?.length) fail('retrieval predictions must expose ranked scores');
  return {
    lexicalTopScore: Number(lexical.scores[0].score),
    lexicalMargin: scoreMargin(lexical.scores),
    recallTopScore: Number(recall.scores[0].score),
    recallMargin: scoreMargin(recall.scores),
  };
}

function thresholdCandidates(values, limit = 64) {
  const unique = [...new Set(values.map(Number).filter(Number.isFinite))].sort((left, right) => left - right);
  if (!unique.length) return [0];
  const selected = unique.length <= limit
    ? unique
    : Array.from({ length: limit }, (_, index) => unique[Math.round(index * (unique.length - 1) / (limit - 1))]);
  return [...new Set([0, ...selected, unique[unique.length - 1] + Number.EPSILON])];
}

function classificationPasses(row, floor) {
  return row.macroF1 >= floor.minimumMacroF1
    && row.coverage >= floor.minimumCoverage
    && row.selectiveRisk <= floor.maximumSelectiveRisk
    && row.expectedCalibrationError <= floor.maximumExpectedCalibrationError;
}

function retrievalPasses(row, floor) {
  return row.answerableAcceptance >= floor.minimumAnswerableAcceptance
    && row.mustRefuseAccuracy >= floor.minimumMustRefuseAccuracy
    && row.refusalPrecision >= floor.minimumRefusalPrecision;
}

function classificationOrder(left, right) {
  return Number(right.clearsCalibrationGate || 0) - Number(left.clearsCalibrationGate || 0)
    || right.macroF1 - left.macroF1
    || right.coverage - left.coverage
    || left.selectiveRisk - right.selectiveRisk
    || left.expectedCalibrationError - right.expectedCalibrationError
    || left.minimumConfidence - right.minimumConfidence;
}

function retrievalOrder(left, right) {
  return right.developmentMetrics.mustRefuseAccuracy - left.developmentMetrics.mustRefuseAccuracy
    || right.developmentMetrics.refusalPrecision - left.developmentMetrics.refusalPrecision
    || right.developmentMetrics.answerableAcceptance - left.developmentMetrics.answerableAcceptance
    || left.minimumLexicalTopScore - right.minimumLexicalTopScore
    || left.minimumRecallTopScore - right.minimumRecallTopScore;
}

function validatePopulation(population, task) {
  if (!population || population.task !== task || population.role !== 'calibration' || population.promotionEligible !== false) {
    fail(`${task} requires a non-promotable calibration population`);
  }
  if (!population.id || !Array.isArray(population.rows) || !population.rows.length) fail(`${task} calibration rows are required`);
}

function validateEnvelope(envelope, candidateId, population) {
  if (!envelope || envelope.schema !== 'simulatte.modelCandidatePredictions.v1' || envelope.candidateId !== candidateId) {
    fail(`${candidateId} prediction envelope mismatch`);
  }
  if (envelope.task !== population.task || envelope.rows.length !== population.rows.length) fail(`${candidateId} prediction population mismatch`);
  const ids = new Set(envelope.rows.map((row) => row.id));
  for (const row of population.rows) if (!ids.has(row.id)) fail(`${candidateId} lacks prediction ${row.id}`);
}

function populationReceipt(population) {
  const bytes = Buffer.from(`${JSON.stringify(population, null, 2)}\n`);
  return {
    id: population.id,
    task: population.task,
    role: 'calibration',
    promotionEligible: false,
    rowCount: population.rows.length,
    sha256: digest(bytes),
    fingerprintSchema: 'simulatte.modelSelectionRowFingerprint.v1',
    rowFingerprints: populationRowFingerprints(population, population.task).sort(),
  };
}

function metricValues(row, excluded = []) {
  return Object.fromEntries(Object.entries(row).filter(([key]) => !excluded.includes(key)));
}

function f1(rows, label) {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  for (const row of rows) {
    if (row.gold === label && row.predicted === label) tp += 1;
    else if (row.gold !== label && row.predicted === label) fp += 1;
    else if (row.gold === label && row.predicted !== label) fn += 1;
  }
  const precision = tp / Math.max(1, tp + fp);
  const recall = tp / Math.max(1, tp + fn);
  return precision + recall ? 2 * precision * recall / (precision + recall) : 0;
}

function calibrationError(rows) {
  const bins = Array.from({ length: 10 }, () => []);
  for (const row of rows) {
    const confidence = Math.max(0, Math.min(1, row.confidence));
    bins[Math.min(9, Math.floor(confidence * 10))].push({ confidence, correct: row.predicted === row.gold ? 1 : 0 });
  }
  return round(bins.reduce((total, bin) => {
    if (!bin.length) return total;
    return total + bin.length / rows.length * Math.abs(mean(bin.map((row) => row.correct)) - mean(bin.map((row) => row.confidence)));
  }, 0));
}

function scoreMargin(scores) {
  return Number(scores[0]?.score || 0) - Number(scores[1]?.score || 0);
}

function parseArgs(argv) {
  const options = { task: '', population: '', out: '', candidates: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === '--task') options.task = argv[++index] || '';
    else if (key === '--population') options.population = path.resolve(argv[++index] || '');
    else if (key === '--out') options.out = path.resolve(argv[++index] || '');
    else if (key === '--candidate') options.candidates.push(argv[++index] || '');
    else fail(`unknown argument ${key}`);
  }
  if (!['classification', 'embedding-retrieval'].includes(options.task)) fail('--task must be classification or embedding-retrieval');
  if (!options.population || !options.out) fail('--population and --out are required');
  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const populationBytes = fs.readFileSync(options.population);
  const population = JSON.parse(populationBytes.toString('utf8'));
  const jobs = JSON.parse(fs.readFileSync(JOBS_PATH, 'utf8'));
  const policy = JSON.parse(fs.readFileSync(POLICY_PATH, 'utf8'));
  const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
  validateCalibrationPopulationContract(population, options.task, policy);
  const requested = options.candidates.length
    ? options.candidates
    : registry.tasks[options.task].filter((row) => row.evaluationEligible).map((row) => row.id);
  const predictions = loadOrRunPredictions(requested, population, options.task, jobs, registry);
  const receipt = options.task === 'classification'
    ? calibrateClassification(population, predictions, jobs, policy)
    : calibrateRetrieval(population, predictions, registry.retrievalCascades, policy);
  receipt.population.sha256 = digest(populationBytes);
  fs.mkdirSync(path.dirname(options.out), { recursive: true });
  fs.writeFileSync(options.out, `${JSON.stringify(receipt, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ path: path.relative(ROOT, options.out), schema: receipt.schema, id: receipt.id }, null, 2)}\n`);
}

function loadOrRunPredictions(entries, population, task, jobs, registry) {
  const taskCandidates = new Map(registry.tasks[task].map((row) => [row.id, row]));
  const predictions = {};
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'simulatte-model-calibration-'));
  try {
    for (const entry of entries) {
      const separator = entry.indexOf('=');
      if (separator > 0) {
        const candidateId = entry.slice(0, separator);
        predictions[candidateId] = JSON.parse(fs.readFileSync(path.resolve(entry.slice(separator + 1)), 'utf8'));
        continue;
      }
      const candidate = taskCandidates.get(entry);
      if (!candidate) fail(`unknown ${task} calibration candidate ${entry}`);
      const workload = sanitizedCalibrationWorkload(population, task, jobs, candidate.id);
      const inputPath = path.join(temporary, `${candidate.id}-workload.json`);
      const outputPath = path.join(temporary, `${candidate.id}-predictions.json`);
      fs.writeFileSync(inputPath, `${JSON.stringify(workload, null, 2)}\n`);
      const runtime = path.resolve(ROOT, registry.comparisonEnvironment.entrypoint);
      const args = [runtime, '--input', inputPath, '--out', outputPath, '--mode', candidate.mode];
      const localCompact = candidate.mode.endsWith('-classification')
        && ['linear', 'linear-svc', 'multinomial-nb', 'complement-nb', 'nb-svm-logistic', 'sgd-modified-huber']
          .some((prefix) => candidate.mode === `${prefix}-classification`);
      if (candidate.modelId && !localCompact) args.push('--model-id', candidate.modelId);
      if (candidate.revision && !localCompact) args.push('--revision', candidate.revision);
      if (candidate.pooling) args.push('--pooling', candidate.pooling);
      if (candidate.instruction) args.push('--instruction', candidate.instruction);
      const result = spawnSync('python3', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
      if (result.error) throw result.error;
      if (result.status !== 0) fail(`${candidate.id} calibration execution failed:\n${result.stderr || result.stdout}`);
      predictions[candidate.id] = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    }
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
  return predictions;
}

function assertNoGold(value) {
  const forbidden = new Set(['expectedLabel', 'relevantIds', 'hardNegativeIds', 'winnerId', 'relevance', 'mustRefuse']);
  const visit = (node) => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== 'object') return;
    for (const [key, child] of Object.entries(node)) {
      if (forbidden.has(key)) fail(`candidate-visible calibration payload includes evaluator-owned field ${key}`);
      visit(child);
    }
  };
  visit(value);
}

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function round(value) {
  return Number(Number(value || 0).toFixed(6));
}

function digest(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function fail(message) {
  throw new Error(`Model selection calibration invalid: ${message}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error && error.stack ? error.stack : error);
    process.exitCode = 1;
  }
}
