#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const POLICY_PATH = path.join(ROOT, 'tools', 'samer', 'model-selection-policy.json');
const JOBS_PATH = path.join(ROOT, 'tools', 'samer', 'classification-jobs-v1.json');
const RESOURCE_METRICS = Object.freeze([
  'downloadBytes',
  'peakMemoryBytes',
  'coldLoadMs',
  'warmLatencyMs',
]);

export function evaluateModelSelectionFrontier(trial, policy = readPolicy(), jobs = readClassificationJobs()) {
  const taskPolicy = validateTrial(trial, policy, jobs);
  const candidates = trial.candidates.map((candidate) => {
    const quality = normalizeQuality(candidate.quality, trial.task, jobs, candidate.id, trial.schema);
    const qualityGate = qualityGateResult(quality, trial.task, taskPolicy, jobs, trial.schema);
    return {
      id: candidate.id,
      implementationId: candidate.implementationId,
      kind: candidate.kind,
      modelId: candidate.kind === 'deterministic' ? null : candidate.modelId,
      ...(candidate.components ? { components: { ...candidate.components } } : {}),
      deploymentEligible: candidate.deploymentEligible,
      deploymentEvidence: candidate.deploymentEvidence,
      quality,
      primaryQuality: quality[taskPolicy.primaryMetric],
      performance: normalizePerformance(candidate.performance, policy, candidate.id),
      receipt: { ...candidate.receipt },
      clearsQualityGate: qualityGate.pass,
      qualityRejectionReasons: qualityGate.reasons,
    };
  });
  const eligibleIds = new Set(candidates.filter((candidate) => candidate.clearsQualityGate).map((candidate) => candidate.id));
  const evaluated = candidates.map((candidate) => {
    const dominatedBy = eligibleIds.has(candidate.id)
      ? candidates
        .filter((other) => eligibleIds.has(other.id) && dominates(other, candidate))
        .map((other) => other.id)
        .sort()
      : [];
    return {
      ...candidate,
      dominatedBy,
      isPareto: eligibleIds.has(candidate.id) && dominatedBy.length === 0,
    };
  });
  const pareto = evaluated.filter((candidate) => candidate.isPareto).sort(selectionOrder(policy));
  const selected = pareto[0] || null;
  return {
    schema: 'simulatte.modelSelectionFrontier.v2',
    task: trial.task,
    population: { ...trial.population },
    environment: { ...trial.environment },
    environmentSha256: environmentSha256(trial.environment),
    workload: { ...trial.workload },
    qualityContract: taskPolicy,
    performanceContract: policy.performanceContract,
    selectionPolicyId: policy.id,
    candidates: evaluated,
    paretoCandidateIds: pareto.map((candidate) => candidate.id),
    selectedCandidateId: selected ? selected.id : null,
    promotionCandidateId: selected && selected.deploymentEligible ? selected.id : null,
    promotionEligible: Boolean(selected && selected.deploymentEligible),
    rejectionReasons: selected
      ? selected.deploymentEligible
        ? []
        : ['smallest sufficient candidate lacks exact deployment parity evidence']
      : ['no candidate clears every predeclared sealed quality gate'],
  };
}

export function evaluateRequiredModelFrontiers(trials, policy = readPolicy(), jobs = readClassificationJobs()) {
  if (!Array.isArray(trials)) fail('required model frontiers must be an array');
  const expectedTasks = policy.requiredTasks.map((task) => task.id).sort();
  const receivedTasks = trials.map((trial) => String(trial && trial.task || '')).sort();
  if (JSON.stringify(receivedTasks) !== JSON.stringify(expectedTasks)) {
    fail(`expected separate frontiers for ${expectedTasks.join(', ')}, received ${receivedTasks.join(', ')}`);
  }
  requireDistinctPopulationField(trials, 'id', 'identities');
  requireDistinctPopulationField(trials, 'commitmentSha256', 'commitments');
  const frontiers = trials.map((trial) => evaluateModelSelectionFrontier(trial, policy, jobs))
    .sort((left, right) => left.task.localeCompare(right.task));
  return {
    schema: 'simulatte.requiredModelSelectionFrontiers.v2',
    policyId: policy.id,
    classificationJobsId: jobs.id,
    frontiers,
    promotionEligible: frontiers.every((frontier) => frontier.promotionEligible),
    selectedCandidates: Object.fromEntries(frontiers.map((frontier) => [frontier.task, frontier.selectedCandidateId])),
    promotionCandidates: Object.fromEntries(frontiers.map((frontier) => [frontier.task, frontier.promotionCandidateId])),
  };
}

export function readPolicy() {
  return JSON.parse(fs.readFileSync(POLICY_PATH, 'utf8'));
}

export function readClassificationJobs() {
  return JSON.parse(fs.readFileSync(JOBS_PATH, 'utf8'));
}

export function environmentSha256(environment) {
  return digest(canonicalJson(environment || {}));
}

function validateTrial(trial, policy, jobs) {
  if (!trial || !['simulatte.modelSelectionTrial.v2', 'simulatte.modelSelectionTrial.v3'].includes(trial.schema)) {
    fail('trial schema must be simulatte.modelSelectionTrial.v2 or simulatte.modelSelectionTrial.v3');
  }
  const calibratedContract = trial.schema === 'simulatte.modelSelectionTrial.v3';
  if (!policy || policy.schema !== 'simulatte.modelSelectionPolicy.v2') fail('model selection policy schema mismatch');
  validateClassificationJobs(policy, jobs);
  const taskPolicy = policy.requiredTasks.find((task) => task.id === trial.task);
  if (!taskPolicy) fail(`unsupported model selection task: ${trial.task || 'missing'}`);
  const population = trial.population || {};
  const requiredPopulation = policy.requiredPopulation || {};
  for (const field of ['kind', 'visibility', 'promotionEligible', 'contaminationStatus']) {
    if (population[field] !== requiredPopulation[field]) {
      fail(`${trial.task} population ${field} must be ${String(requiredPopulation[field])}`);
    }
  }
  if (population.schema !== taskPolicy.populationContract) {
    fail(`${trial.task} population schema must be ${taskPolicy.populationContract}`);
  }
  requireText(population.id, `${trial.task} population id`);
  requireHash(population.commitmentSha256, `${trial.task} population commitment`);
  requirePositiveInteger(population.rowCount, `${trial.task} population row count`);
  requireReceipt(population.openingReceipt, `${trial.task} population opening receipt`);
  const environment = trial.environment || {};
  for (const field of ['deviceId', 'runtimeId', 'dtype', 'cacheProtocolId']) {
    requireText(environment[field], `${trial.task} environment ${field}`);
  }
  const expectedEnvironmentHash = environmentSha256(environment);
  requireText(trial.workload && trial.workload.id, `${trial.task} workload id`);
  requireHash(trial.workload && trial.workload.sha256, `${trial.task} workload hash`);
  if (taskPolicy.evaluationK != null && trial.workload.k !== taskPolicy.evaluationK) {
    fail(`${trial.task} workload K must be ${taskPolicy.evaluationK}`);
  }
  const minimumCandidateCount = Number(policy.comparisonContract && policy.comparisonContract.minimumCandidateCount || 2);
  if (!Array.isArray(trial.candidates) || trial.candidates.length < minimumCandidateCount) {
    fail(`${trial.task} frontier requires at least ${minimumCandidateCount} candidates`);
  }
  if (policy.comparisonContract.deterministicControlRequired && !trial.candidates.some((candidate) => candidate.kind === 'deterministic')) {
    fail(`${trial.task} frontier requires a deterministic control`);
  }
  const candidateIds = new Set();
  const candidatesById = new Map();
  for (const candidate of trial.candidates) {
    const candidateId = requireText(candidate && candidate.id, `${trial.task} candidate id`);
    if (candidateIds.has(candidateId)) fail(`${trial.task} candidate id is duplicated: ${candidateId}`);
    candidateIds.add(candidateId);
    candidatesById.set(candidateId, candidate);
    requireText(candidate.implementationId, `${candidateId} implementation id`);
    if (!['deterministic', 'model', 'composite'].includes(candidate.kind)) fail(`${candidateId} kind must be deterministic, model, or composite`);
    if (candidate.kind !== 'deterministic') requireText(candidate.modelId, `${candidateId} model id`);
    if (candidate.kind === 'deterministic' && candidate.modelId != null) fail(`${candidateId} deterministic candidate must use a null model id`);
    if (candidate.kind === 'composite') {
      requireText(candidate.components && candidate.components.refusalGateCandidateId, `${candidateId} refusal gate component`);
      requireText(candidate.components && candidate.components.recallCandidateId, `${candidateId} recall component`);
    }
    if (typeof candidate.deploymentEligible !== 'boolean') fail(`${candidateId} deploymentEligible must be boolean`);
    requireText(candidate.deploymentEvidence, `${candidateId} deployment evidence`);
    normalizeQuality(candidate.quality, trial.task, jobs, candidateId, trial.schema);
    normalizePerformance(candidate.performance, policy, candidateId);
    requireReceipt(candidate.receipt, `${candidateId} receipt`);
    if (calibratedContract && trial.task === 'classification') requireReceipt(candidate.receipt.calibration, `${candidateId} calibration receipt`);
    if (calibratedContract && candidate.kind === 'composite') requireReceipt(candidate.receipt.calibration, `${candidateId} calibration receipt`);
    if (candidate.receipt.environmentSha256 !== expectedEnvironmentHash) fail(`${candidateId} receipt environment hash differs from the trial environment`);
    if (candidate.receipt.workloadSha256 !== trial.workload.sha256) fail(`${candidateId} receipt workload hash differs from the trial workload`);
    if (candidate.receipt.cacheProtocolId !== environment.cacheProtocolId) fail(`${candidateId} receipt cache protocol differs from the trial environment`);
  }
  if (calibratedContract && trial.task === 'embedding-retrieval') {
    const cascades = trial.candidates.filter((candidate) => candidate.kind === 'composite');
    if (!cascades.length) fail('embedding-retrieval v3 requires a calibrated composite candidate');
    for (const cascade of cascades) {
      const gate = candidatesById.get(cascade.components.refusalGateCandidateId);
      const recall = candidatesById.get(cascade.components.recallCandidateId);
      if (gate?.kind !== 'deterministic') fail(`${cascade.id} refusal gate component must be deterministic`);
      if (recall?.kind !== 'model') fail(`${cascade.id} recall component must be model-backed`);
      if (cascade.modelId !== recall.modelId) fail(`${cascade.id} model identity must match its recall component`);
    }
  }
  return taskPolicy;
}

function validateClassificationJobs(policy, jobs) {
  if (!jobs || jobs.schema !== 'simulatte.compactClassificationJobs.v1') fail('classification jobs schema mismatch');
  if (jobs.id !== policy.classificationJobs.id) fail('classification jobs id differs from policy');
  const expected = [...policy.classificationJobs.requiredHeadIds].sort();
  const received = (jobs.jobs || []).map((job) => job.id).sort();
  if (JSON.stringify(received) !== JSON.stringify(expected)) fail('classification jobs do not match the required head ids');
  for (const job of jobs.jobs) {
    if (!Array.isArray(job.labels) || !job.labels.includes(job.abstention && job.abstention.label)) {
      fail(`${job.id} taxonomy must include its abstention label`);
    }
    for (const metric of ['minimumMacroF1', 'minimumCoverage', 'maximumSelectiveRisk', 'maximumExpectedCalibrationError']) {
      requireUnitInterval(job.qualityFloor && job.qualityFloor[metric], `${job.id} ${metric}`);
    }
  }
}

function normalizeQuality(quality, task, jobs, candidateId = 'candidate', trialSchema = 'simulatte.modelSelectionTrial.v2') {
  if (!quality || typeof quality !== 'object') fail(`${candidateId} quality metrics are required`);
  if (task === 'classification') {
    const rows = Array.isArray(quality.heads) ? quality.heads : [];
    const expected = jobs.jobs.map((job) => job.id).sort();
    const received = rows.map((row) => String(row && row.id || '')).sort();
    if (JSON.stringify(received) !== JSON.stringify(expected)) fail(`${candidateId} classification metrics must include each required head exactly once`);
    const heads = rows.map((row) => ({
      id: row.id,
      macroF1: unitMetric(row.macroF1, `${candidateId} ${row.id} macroF1`),
      coverage: unitMetric(row.coverage, `${candidateId} ${row.id} coverage`),
      selectiveRisk: unitMetric(row.selectiveRisk, `${candidateId} ${row.id} selectiveRisk`),
      expectedCalibrationError: unitMetric(row.expectedCalibrationError, `${candidateId} ${row.id} expectedCalibrationError`),
    })).sort((left, right) => left.id.localeCompare(right.id));
    return {
      macroF1: mean(heads.map((row) => row.macroF1)),
      coverage: Math.min(...heads.map((row) => row.coverage)),
      selectiveRisk: Math.max(...heads.map((row) => row.selectiveRisk)),
      expectedCalibrationError: Math.max(...heads.map((row) => row.expectedCalibrationError)),
      heads,
    };
  }
  if (task === 'embedding-retrieval') {
    const normalized = {
      recallAtK: unitMetric(quality.recallAtK, `${candidateId} recallAtK`),
      hardNegativeAccuracy: unitMetric(quality.hardNegativeAccuracy, `${candidateId} hardNegativeAccuracy`),
      mustRefuseAccuracy: unitMetric(quality.mustRefuseAccuracy, `${candidateId} mustRefuseAccuracy`),
    };
    if (trialSchema === 'simulatte.modelSelectionTrial.v3') {
      normalized.deliveredRecallAtK = unitMetric(quality.deliveredRecallAtK, `${candidateId} deliveredRecallAtK`);
      normalized.answerableAcceptance = unitMetric(quality.answerableAcceptance, `${candidateId} answerableAcceptance`);
      normalized.refusalPrecision = unitMetric(quality.refusalPrecision, `${candidateId} refusalPrecision`);
    }
    return normalized;
  }
  return {
    ndcgAtK: unitMetric(quality.ndcgAtK, `${candidateId} ndcgAtK`),
    winnerAccuracy: unitMetric(quality.winnerAccuracy, `${candidateId} winnerAccuracy`),
  };
}

function qualityGateResult(quality, task, taskPolicy, jobs, trialSchema = 'simulatte.modelSelectionTrial.v2') {
  const reasons = [];
  if (task === 'classification') {
    for (const row of quality.heads) {
      const floor = jobs.jobs.find((job) => job.id === row.id).qualityFloor;
      if (row.macroF1 < floor.minimumMacroF1) reasons.push(`${row.id}:macroF1`);
      if (row.coverage < floor.minimumCoverage) reasons.push(`${row.id}:coverage`);
      if (row.selectiveRisk > floor.maximumSelectiveRisk) reasons.push(`${row.id}:selectiveRisk`);
      if (row.expectedCalibrationError > floor.maximumExpectedCalibrationError) reasons.push(`${row.id}:expectedCalibrationError`);
    }
  } else if (task === 'embedding-retrieval') {
    const floor = taskPolicy.qualityFloor;
    if (quality.recallAtK < floor.minimumRecallAtK) reasons.push('recallAtK');
    if (trialSchema === 'simulatte.modelSelectionTrial.v3' && quality.deliveredRecallAtK < floor.minimumDeliveredRecallAtK) reasons.push('deliveredRecallAtK');
    if (quality.hardNegativeAccuracy < floor.minimumHardNegativeAccuracy) reasons.push('hardNegativeAccuracy');
    if (quality.mustRefuseAccuracy < floor.minimumMustRefuseAccuracy) reasons.push('mustRefuseAccuracy');
    if (trialSchema === 'simulatte.modelSelectionTrial.v3' && quality.answerableAcceptance < floor.minimumAnswerableAcceptance) reasons.push('answerableAcceptance');
    if (trialSchema === 'simulatte.modelSelectionTrial.v3' && quality.refusalPrecision < floor.minimumRefusalPrecision) reasons.push('refusalPrecision');
  } else {
    const floor = taskPolicy.qualityFloor;
    if (quality.ndcgAtK < floor.minimumNdcgAtK) reasons.push('ndcgAtK');
    if (quality.winnerAccuracy < floor.minimumWinnerAccuracy) reasons.push('winnerAccuracy');
  }
  return { pass: reasons.length === 0, reasons };
}

function normalizePerformance(performance, policy, candidateId = 'candidate') {
  if (!performance || typeof performance !== 'object') fail(`${candidateId} performance metrics are required`);
  const downloadBytes = nonnegativeInteger(performance.downloadBytes, `${candidateId} downloadBytes`);
  const peakMemoryBytes = nonnegativeInteger(performance.peakMemoryBytes, `${candidateId} peakMemoryBytes`);
  const coldSamples = sampleArray(performance.coldLoadMs && performance.coldLoadMs.samples, 1, `${candidateId} coldLoadMs`);
  const minimumWarm = Number(policy.performanceContract.warmLatency.minimumMeasuredSamples);
  const warmSamples = sampleArray(performance.warmLatencyMs && performance.warmLatencyMs.samples, minimumWarm, `${candidateId} warmLatencyMs`);
  return {
    downloadBytes,
    peakMemoryBytes,
    coldLoadMs: distribution(coldSamples, 0.5),
    warmLatencyMs: distribution(warmSamples, 0.95),
  };
}

function distribution(samples, selectionQuantile) {
  return {
    sampleCount: samples.length,
    samples,
    p50: quantile(samples, 0.5),
    p95: quantile(samples, 0.95),
    selectionStatistic: selectionQuantile === 0.95 ? 'p95' : 'p50',
    selectionValue: quantile(samples, selectionQuantile),
  };
}

function dominates(left, right) {
  const leftCost = resourceValues(left);
  const rightCost = resourceValues(right);
  const noWorse = left.primaryQuality >= right.primaryQuality
    && RESOURCE_METRICS.every((metric) => leftCost[metric] <= rightCost[metric]);
  const strictlyBetter = left.primaryQuality > right.primaryQuality
    || RESOURCE_METRICS.some((metric) => leftCost[metric] < rightCost[metric]);
  return noWorse && strictlyBetter;
}

function selectionOrder(policy) {
  return (left, right) => {
    const leftCost = resourceValues(left);
    const rightCost = resourceValues(right);
    for (const metric of policy.selection.resourcePriority) {
      const delta = leftCost[metric] - rightCost[metric];
      if (delta) return delta;
    }
    return right.primaryQuality - left.primaryQuality || left.id.localeCompare(right.id);
  };
}

function resourceValues(candidate) {
  return {
    downloadBytes: candidate.performance.downloadBytes,
    peakMemoryBytes: candidate.performance.peakMemoryBytes,
    coldLoadMs: candidate.performance.coldLoadMs.selectionValue,
    warmLatencyMs: candidate.performance.warmLatencyMs.selectionValue,
  };
}

function requireDistinctPopulationField(trials, field, label) {
  const values = trials.map((trial) => String(trial.population && trial.population[field] || ''));
  if (new Set(values).size !== values.length) fail(`classification, embedding retrieval, and reranking require separate held-out population ${label}`);
}

function requireReceipt(receipt, label) {
  requireText(receipt && receipt.path, `${label} path`);
  requireHash(receipt && receipt.sha256, `${label} hash`);
  return receipt;
}

function sampleArray(value, minimumLength, label) {
  if (!Array.isArray(value) || value.length < minimumLength) fail(`${label} requires at least ${minimumLength} measured samples`);
  return value.map((sample, index) => nonnegativeNumber(sample, `${label} sample ${index}`));
}

function quantile(values, probability) {
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(probability * sorted.length) - 1));
  return sorted[index];
}

function mean(values) {
  return Number((values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length)).toFixed(6));
}

function unitMetric(value, label) {
  return requireUnitInterval(value, label);
}

function nonnegativeInteger(value, label) {
  const number = nonnegativeNumber(value, label);
  if (!Number.isInteger(number)) fail(`${label} must be an integer`);
  return number;
}

function nonnegativeNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) fail(`${label} must be finite and nonnegative`);
  return number;
}

function requireText(value, label) {
  const text = String(value || '').trim();
  if (!text) fail(`${label} is required`);
  return text;
}

function requireHash(value, label) {
  const hash = String(value || '').toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(hash)) fail(`${label} must be a lowercase SHA-256 hex digest`);
  return hash;
}

function requirePositiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) fail(`${label} must be a positive integer`);
  return number;
}

function requireUnitInterval(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 1) fail(`${label} must be between zero and one`);
  return number;
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function digest(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function fail(message) {
  throw new Error(`Model selection frontier invalid: ${message}`);
}

function parseArguments(argv) {
  const options = { classification: '', 'embedding-retrieval': '', reranking: '', out: '' };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!['--classification', '--embedding-retrieval', '--reranking', '--out'].includes(key)) fail(`unknown argument: ${key}`);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) fail(`${key} requires a value`);
    options[key.slice(2)] = value;
    index += 1;
  }
  for (const task of ['classification', 'embedding-retrieval', 'reranking']) {
    if (!options[task]) fail(`--${task} is required`);
  }
  return options;
}

function readTrial(filePath) {
  const absolutePath = path.resolve(filePath);
  const bytes = fs.readFileSync(absolutePath);
  return {
    trial: JSON.parse(bytes.toString('utf8')),
    source: {
      path: path.relative(ROOT, absolutePath),
      sha256: digest(bytes),
    },
  };
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  const inputs = ['classification', 'embedding-retrieval', 'reranking'].map((task) => readTrial(options[task]));
  const report = evaluateRequiredModelFrontiers(inputs.map((input) => input.trial));
  report.sources = inputs.map((input) => input.source);
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (options.out) {
    const outputPath = path.resolve(options.out);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, serialized);
  }
  process.stdout.write(serialized);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error && error.stack ? error.stack : error);
    process.exitCode = 1;
  }
}
