#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { environmentSha256, evaluateModelSelectionFrontier } from '../model-selection-frontier.mjs';
import { readCandidateRegistry, validateCandidateRegistry } from './check-model-candidate-registry.mjs';
import {
  applyClassificationCalibration,
  assertCalibrationDisjoint,
  composeRetrievalCascade,
  readCalibration,
  validateClassificationCalibration,
  validateRetrievalCalibration,
} from './model-selection-calibration.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SAMER_DIR = path.join(ROOT, 'tools', 'samer');
const DEFAULT_SEALED_DIR = path.join(SAMER_DIR, 'model-selection', 'sealed');
const LOCK_PATH = path.join(ROOT, 'public', 'data', 'simulatte-embedder', 'model-runtime-lock.json');
const JOBS_PATH = path.join(SAMER_DIR, 'classification-jobs-v1.json');
const POLICY_PATH = path.join(SAMER_DIR, 'model-selection-policy.json');
const TASKS = Object.freeze(['classification', 'embedding-retrieval', 'reranking']);
const POPULATIONS = Object.freeze({
  classification: {
    file: 'classification-population-v1.json',
    commitment: 'classification-population-v1.commitment.json',
    schema: 'simulatte.sealedClassificationPopulation.v1',
  },
  'embedding-retrieval': {
    file: 'embedding-retrieval-population-v1.json',
    commitment: 'embedding-retrieval-population-v1.commitment.json',
    schema: 'simulatte.sealedEmbeddingRetrievalPopulation.v1',
  },
  reranking: {
    file: 'reranking-population-v1.json',
    commitment: 'reranking-population-v1.commitment.json',
    schema: 'simulatte.sealedRerankingPopulation.v1',
  },
});

export function sanitizedWorkload(population, task, jobs, candidateId, evaluationK = 1) {
  if (!population || population.task !== task || population.schema !== POPULATIONS[task].schema) fail(`${task} population mismatch`);
  const jobsById = new Map(jobs.jobs.map((job) => [job.id, job]));
  const rows = population.rows.map((row) => {
    if (task === 'classification') {
      const job = jobsById.get(row.headId);
      if (!job) fail(`classification row ${row.id} has unknown head ${row.headId}`);
      return {
        id: row.id,
        headId: row.headId,
        text: row.input.text,
        span: row.input.span || '',
        labels: job.labels
          .filter((id) => id !== job.abstention.label)
          .map((id) => ({ id, description: labelDescription(id) })),
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
      minimumScore: 0.08,
      minimumMargin: 0.015,
    };
  });
  const workload = {
    schema: 'simulatte.modelCandidateWorkload.v1',
    id: `${population.id}-sanitized-v1`,
    candidateId,
    task,
    k: evaluationK,
    rows,
  };
  assertNoGold(workload);
  return workload;
}

export function scoreCandidatePredictions(population, predictions, task, jobs, k = 10, calibration = null, candidateId = '') {
  validatePredictionEnvelope(predictions, task, population.rows);
  const calibrated = task === 'classification' && calibration
    ? applyClassificationCalibration(predictions, jobs, calibration, candidateId || predictions.candidateId)
    : predictions;
  const byId = new Map(calibrated.rows.map((row) => [row.id, row]));
  if (task === 'classification') return scoreClassification(population.rows, byId, jobs);
  if (task === 'embedding-retrieval') return scoreRetrieval(population.rows, byId, k);
  return scoreReranking(population.rows, byId, k);
}

export function validatePredictionEnvelope(predictions, task, goldRows) {
  if (!predictions || predictions.schema !== 'simulatte.modelCandidatePredictions.v1') fail('candidate prediction schema mismatch');
  if (predictions.task !== task) fail('candidate prediction task mismatch');
  if (!Array.isArray(predictions.rows) || predictions.rows.length !== goldRows.length) fail('candidate prediction row count mismatch');
  const expected = new Set(goldRows.map((row) => row.id));
  const received = new Set();
  for (const row of predictions.rows) {
    if (!expected.has(row.id)) fail(`candidate returned unknown row ${row.id || 'missing'}`);
    if (received.has(row.id)) fail(`candidate returned duplicate row ${row.id}`);
    received.add(row.id);
    if (!Number.isFinite(Number(row.durationMs ?? 0)) || Number(row.durationMs ?? 0) < 0) fail(`${row.id} duration must be finite and nonnegative`);
    if (Array.isArray(row.scores)) {
      for (const score of row.scores) {
        if (!Number.isFinite(Number(score && score.score))) fail(`${row.id} candidate score must be finite`);
      }
    }
  }
  assertNoGold(predictions);
}

function scoreClassification(goldRows, predictions, jobs) {
  const heads = jobs.jobs.map((job) => {
    const rows = goldRows.filter((row) => row.headId === job.id);
    const labels = job.labels.filter((label) => !(job.scoredLabelsExclude || []).includes(label));
    const pairs = rows.map((row) => ({ gold: row.expectedLabel, prediction: predictions.get(row.id) }));
    const answered = pairs.filter((row) => row.prediction.predictedLabel !== job.abstention.label);
    const correctAnswered = answered.filter((row) => row.prediction.predictedLabel === row.gold).length;
    return {
      id: job.id,
      macroF1: round(mean(labels.map((label) => f1ForLabel(pairs, label)))),
      coverage: round(answered.length / Math.max(1, pairs.length)),
      selectiveRisk: round(answered.length ? 1 - correctAnswered / answered.length : 1),
      expectedCalibrationError: round(calibrationError(answered)),
    };
  });
  return { heads };
}

function scoreRetrieval(goldRows, predictions, k) {
  const answerable = goldRows.filter((row) => row.mustRefuse !== true);
  const hardRows = answerable.filter((row) => Array.isArray(row.hardNegativeIds) && row.hardNegativeIds.length);
  const refusalRows = goldRows.filter((row) => row.mustRefuse === true);
  const recall = answerable.map((row) => {
    const ranking = predictions.get(row.id).ranking.slice(0, k);
    const hits = row.relevantIds.filter((id) => ranking.includes(id)).length;
    return hits / Math.max(1, row.relevantIds.length);
  });
  const deliveredRecall = answerable.map((row) => {
    const prediction = predictions.get(row.id);
    if (prediction.refused === true) return 0;
    const ranking = prediction.ranking.slice(0, k);
    const hits = row.relevantIds.filter((id) => ranking.includes(id)).length;
    return hits / Math.max(1, row.relevantIds.length);
  });
  const hardAccuracy = hardRows.map((row) => {
    const ranking = predictions.get(row.id).ranking;
    const bestRelevant = Math.min(...row.relevantIds.map((id) => rankOf(ranking, id)));
    const bestHard = Math.min(...row.hardNegativeIds.map((id) => rankOf(ranking, id)));
    return bestRelevant < bestHard ? 1 : 0;
  });
  const refusalAccuracy = refusalRows.map((row) => predictions.get(row.id).refused === true ? 1 : 0);
  const refusedRows = goldRows.filter((row) => predictions.get(row.id).refused === true);
  const correctRefusals = refusedRows.filter((row) => row.mustRefuse === true).length;
  return {
    recallAtK: round(mean(recall)),
    deliveredRecallAtK: round(mean(deliveredRecall)),
    hardNegativeAccuracy: round(mean(hardAccuracy)),
    mustRefuseAccuracy: round(mean(refusalAccuracy)),
    answerableAcceptance: round(mean(answerable.map((row) => predictions.get(row.id).refused === true ? 0 : 1))),
    refusalPrecision: round(refusedRows.length ? correctRefusals / refusedRows.length : 0),
  };
}

function scoreReranking(goldRows, predictions, k) {
  const ndcg = [];
  const winners = [];
  for (const row of goldRows) {
    const ranking = predictions.get(row.id).ranking.slice(0, k);
    const relevance = new Map(row.candidates.map((candidate) => [candidate.id, candidate.relevance]));
    const actual = dcg(ranking.map((id) => relevance.get(id) || 0));
    const ideal = dcg(row.candidates.map((candidate) => candidate.relevance).sort((left, right) => right - left).slice(0, k));
    ndcg.push(ideal ? actual / ideal : 1);
    winners.push(ranking[0] === row.winnerId ? 1 : 0);
  }
  return { ndcgAtK: round(mean(ndcg)), winnerAccuracy: round(mean(winners)) };
}

function f1ForLabel(rows, label) {
  let truePositive = 0;
  let falsePositive = 0;
  let falseNegative = 0;
  for (const row of rows) {
    const predicted = row.prediction.predictedLabel;
    if (row.gold === label && predicted === label) truePositive += 1;
    else if (row.gold !== label && predicted === label) falsePositive += 1;
    else if (row.gold === label && predicted !== label) falseNegative += 1;
  }
  const precision = truePositive / Math.max(1, truePositive + falsePositive);
  const recall = truePositive / Math.max(1, truePositive + falseNegative);
  return precision + recall ? 2 * precision * recall / (precision + recall) : 0;
}

function calibrationError(rows) {
  const bins = Array.from({ length: 10 }, () => []);
  for (const row of rows) {
    const confidence = Math.max(0, Math.min(1, Number(row.prediction.confidence || 0)));
    bins[Math.min(9, Math.floor(confidence * 10))].push({
      confidence,
      correct: row.prediction.predictedLabel === row.gold ? 1 : 0,
    });
  }
  return bins.reduce((total, bin) => {
    if (!bin.length) return total;
    const accuracy = mean(bin.map((row) => row.correct));
    const confidence = mean(bin.map((row) => row.confidence));
    return total + (bin.length / Math.max(1, rows.length)) * Math.abs(accuracy - confidence);
  }, 0);
}

function dcg(relevances) {
  return relevances.reduce((sum, relevance, index) => sum + (2 ** relevance - 1) / Math.log2(index + 2), 0);
}

function rankOf(ranking, id) {
  const index = ranking.indexOf(id);
  return index < 0 ? Number.MAX_SAFE_INTEGER : index;
}

function runCandidate(candidate, workloadPath, outputPath, registry, cacheRoot) {
  const entrypoint = path.resolve(ROOT, registry.comparisonEnvironment.entrypoint);
  const args = [entrypoint, '--input', workloadPath, '--out', outputPath, '--mode', candidate.mode];
  if (candidate.modelId && candidate.mode !== 'linear-classification') args.push('--model-id', candidate.modelId);
  if (candidate.revision && candidate.mode !== 'linear-classification') args.push('--revision', candidate.revision);
  if (candidate.pooling) args.push('--pooling', candidate.pooling);
  if (candidate.instruction) args.push('--instruction', candidate.instruction);
  const candidateCache = path.join(cacheRoot, candidate.id);
  fs.rmSync(candidateCache, { recursive: true, force: true });
  fs.mkdirSync(candidateCache, { recursive: true });
  const result = spawnSync('python3', args, {
    cwd: ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      HF_HOME: candidateCache,
      HUGGINGFACE_HUB_CACHE: path.join(candidateCache, 'hub'),
      PYTHONHASHSEED: '0',
      TOKENIZERS_PARALLELISM: 'false',
    },
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) fail(`${candidate.id} failed:\n${result.stderr || result.stdout}`);
  return {
    command: ['python3', ...args.map(receiptArgument)],
    stderr: result.stderr.trim(),
  };
}

export function receiptArgument(argument) {
  if (!path.isAbsolute(argument)) return argument;
  const relative = path.relative(ROOT, argument);
  return relative && !relative.startsWith(`..${path.sep}`) && relative !== '..'
    ? relative
    : argument;
}

function createTrial(task, population, commitment, registry, jobs, policy, outputDirectory, candidateIds, calibrations) {
  const cascadeRegistry = task === 'embedding-retrieval' ? registry.retrievalCascades : [];
  const requested = new Set(candidateIds);
  const selectedCascades = cascadeRegistry.filter((row) => requested.has(row.id));
  const requiredComponentIds = new Set(selectedCascades.flatMap((row) => [row.refusalGateCandidateId, row.recallCandidateId]));
  const candidates = registry.tasks[task].filter((row) => requested.has(row.id) || requiredComponentIds.has(row.id));
  const knownIds = new Set([...registry.tasks[task].map((row) => row.id), ...cascadeRegistry.map((row) => row.id)]);
  if (candidateIds.some((id) => !knownIds.has(id)) || requested.size !== candidateIds.length) fail(`${task} candidate selection contains an unknown or duplicate id`);
  if (!candidates.some((row) => row.kind === 'deterministic')) fail(`${task} execution requires its deterministic control`);
  const environment = comparisonEnvironment(registry);
  const registryBytes = fs.readFileSync(path.join(SAMER_DIR, 'model-candidate-registry.json'));
  const registrySha256 = digest(registryBytes);
  const runtimeSha256 = digest(fs.readFileSync(path.resolve(ROOT, registry.comparisonEnvironment.entrypoint)));
  const taskPolicy = policy.requiredTasks.find((row) => row.id === task);
  const evaluationK = Number(taskPolicy && taskPolicy.evaluationK || 1);
  const workloadTemplate = sanitizedWorkload(population, task, jobs, 'candidate-placeholder', evaluationK);
  delete workloadTemplate.candidateId;
  const workloadSha256 = digest(Buffer.from(canonicalJson(workloadTemplate)));
  const cacheRoot = path.join(outputDirectory, 'candidate-cache');
  const rawDirectory = path.join(outputDirectory, 'predictions');
  fs.mkdirSync(rawDirectory, { recursive: true });
  const executions = [];
  const trialCandidates = [];
  const predictionsById = new Map();
  for (const candidate of candidates) {
    const workload = sanitizedWorkload(population, task, jobs, candidate.id, evaluationK);
    const workloadPath = path.join(outputDirectory, `${candidate.id}-workload.json`);
    const outputPath = path.join(rawDirectory, `${candidate.id}.json`);
    fs.writeFileSync(workloadPath, `${JSON.stringify(workload, null, 2)}\n`);
    let execution;
    try {
      execution = runCandidate(candidate, workloadPath, outputPath, registry, cacheRoot);
    } finally {
      fs.rmSync(workloadPath, { force: true });
    }
    const outputBytes = fs.readFileSync(outputPath);
    const predictions = JSON.parse(outputBytes.toString('utf8'));
    validateCandidateIdentity(candidate, predictions, task);
    const quality = scoreCandidatePredictions(population, predictions, task, jobs, workload.k, calibrations.classification, candidate.id);
    const warmups = 3;
    const warmSamples = predictions.performance.warmLatencyMs.slice(warmups);
    const trialCandidate = {
      id: candidate.id,
      implementationId: candidate.implementationId,
      kind: candidate.kind,
      modelId: candidate.modelId,
      deploymentEligible: candidate.deploymentEligible,
      deploymentEvidence: candidate.deploymentEvidence,
      quality,
      performance: {
        downloadBytes: predictions.performance.downloadBytes,
        peakMemoryBytes: predictions.performance.peakMemoryBytes,
        coldLoadMs: { samples: [predictions.performance.coldLoadMs] },
        warmLatencyMs: { samples: warmSamples },
      },
      receipt: {
        path: path.relative(ROOT, outputPath),
        sha256: digest(outputBytes),
        environmentSha256: environmentSha256(environment),
        workloadSha256,
        cacheProtocolId: environment.cacheProtocolId,
        ...(task === 'classification' ? { calibration: calibrationReceipt(calibrations.classificationPointer) } : {}),
      },
    };
    trialCandidates.push(trialCandidate);
    predictionsById.set(candidate.id, predictions);
    executions.push({
      candidateId: candidate.id,
      implementationId: candidate.implementationId,
      modelId: candidate.modelId,
      revision: candidate.revision,
      command: execution.command,
      predictionSha256: digest(outputBytes),
    });
  }
  for (const cascade of selectedCascades) {
    const lexicalPredictions = predictionsById.get(cascade.refusalGateCandidateId);
    const recallPredictions = predictionsById.get(cascade.recallCandidateId);
    const predictions = composeRetrievalCascade({ cascade, lexicalPredictions, recallPredictions, calibration: calibrations.retrieval });
    const outputPath = path.join(rawDirectory, `${cascade.id}.json`);
    fs.writeFileSync(outputPath, `${JSON.stringify(predictions, null, 2)}\n`);
    const outputBytes = fs.readFileSync(outputPath);
    const quality = scoreCandidatePredictions(population, predictions, task, jobs, workloadTemplate.k);
    const recallCandidate = registry.tasks[task].find((row) => row.id === cascade.recallCandidateId);
    const warmSamples = predictions.performance.warmLatencyMs.slice(3);
    trialCandidates.push({
      id: cascade.id,
      implementationId: cascade.implementationId,
      kind: 'composite',
      modelId: recallCandidate.modelId,
      components: {
        refusalGateCandidateId: cascade.refusalGateCandidateId,
        recallCandidateId: cascade.recallCandidateId,
      },
      deploymentEligible: cascade.deploymentEligible,
      deploymentEvidence: cascade.deploymentEvidence,
      quality,
      performance: {
        downloadBytes: predictions.performance.downloadBytes,
        peakMemoryBytes: predictions.performance.peakMemoryBytes,
        coldLoadMs: { samples: [predictions.performance.coldLoadMs] },
        warmLatencyMs: { samples: warmSamples },
      },
      receipt: {
        path: path.relative(ROOT, outputPath),
        sha256: digest(outputBytes),
        environmentSha256: environmentSha256(environment),
        workloadSha256,
        cacheProtocolId: environment.cacheProtocolId,
        calibration: calibrationReceipt(calibrations.retrievalPointer),
      },
    });
    executions.push({
      candidateId: cascade.id,
      implementationId: cascade.implementationId,
      modelId: recallCandidate.modelId,
      revision: recallCandidate.revision,
      composition: { ...predictions.components },
      predictionSha256: digest(outputBytes),
    });
  }
  fs.rmSync(cacheRoot, { recursive: true, force: true });
  const opening = {
    schema: 'simulatte.sealedModelSelectionOpening.v1',
    populationId: population.id,
    populationSha256: commitment.populationSha256,
    task,
    openedAt: new Date().toISOString(),
    purpose: 'one-time-smallest-sufficient-model-selection',
    registrySha256,
    runtimeSha256,
    workloadSha256,
    candidateProcessesReceivedGoldLabels: false,
    evaluatorOwnedMetrics: true,
    executions,
  };
  const openingPath = path.join(outputDirectory, 'opening-receipt.json');
  fs.writeFileSync(openingPath, `${JSON.stringify(opening, null, 2)}\n`);
  const openingBytes = fs.readFileSync(openingPath);
  return {
    schema: 'simulatte.modelSelectionTrial.v3',
    task,
    population: {
      schema: population.schema,
      id: population.id,
      kind: 'held-out',
      visibility: 'sealed',
      commitmentSha256: commitment.populationSha256,
      rowCount: population.rows.length,
      promotionEligible: true,
      contaminationStatus: 'unexposed',
      openingReceipt: { path: path.relative(ROOT, openingPath), sha256: digest(openingBytes) },
    },
    environment,
    workload: { id: workloadTemplate.id, sha256: workloadSha256, k: workloadTemplate.k },
    candidates: trialCandidates,
  };
}

function validateCandidateIdentity(candidate, predictions, task) {
  if (predictions.candidateId !== candidate.id || predictions.task !== task) fail(`${candidate.id} prediction identity mismatch`);
  if (candidate.kind === 'deterministic') {
    if (predictions.kind !== 'deterministic-rules' || predictions.model?.executed !== false || predictions.modelId !== null) {
      fail(`${candidate.id} deterministic receipt falsely claims model execution`);
    }
  } else if (predictions.kind !== 'model-backed' || predictions.model?.executed !== true || predictions.modelId !== candidate.modelId) {
    fail(`${candidate.id} model receipt identity mismatch`);
  }
  if (predictions.runtime?.id !== 'python-transformers-candidate-screen-v1') fail(`${candidate.id} runtime differs from the comparison contract`);
  if (predictions.runtime?.deviceId !== 'cpu' || predictions.runtime?.dtype !== 'f32') fail(`${candidate.id} device or dtype differs from the comparison contract`);
}

function comparisonEnvironment(registry) {
  const cpu = os.cpus()[0] || { model: 'unknown-cpu' };
  return {
    deviceId: `${process.platform}-${process.arch}-${cpu.model}`,
    runtimeId: registry.comparisonEnvironment.runtimeId,
    dtype: registry.comparisonEnvironment.dtype,
    cacheProtocolId: registry.comparisonEnvironment.cacheProtocolId,
  };
}

function readPopulation(task, sealedDirectory) {
  const config = POPULATIONS[task];
  const populationPath = path.join(sealedDirectory, config.file);
  const commitmentPath = path.join(SAMER_DIR, config.commitment);
  const bytes = fs.readFileSync(populationPath);
  const commitment = JSON.parse(fs.readFileSync(commitmentPath, 'utf8'));
  if (digest(bytes) !== commitment.populationSha256) fail(`${task} population bytes differ from commitment`);
  if (commitment.openings.length) fail(`${task} population has already been opened; mint a new population`);
  return { population: JSON.parse(bytes.toString('utf8')), commitment, commitmentPath };
}

function recordOpening(commitmentPath, commitment, openingReceipt) {
  const updated = {
    ...commitment,
    contaminationStatus: 'opened-for-one-time-evaluation',
    openings: [openingReceipt],
  };
  fs.writeFileSync(commitmentPath, `${JSON.stringify(updated, null, 2)}\n`);
}

function loadRequiredCalibrations(options, privateInput, registry, jobs, candidateIds) {
  const result = {
    classification: null,
    classificationPointer: null,
    retrieval: null,
    retrievalPointer: null,
  };
  const promotionPopulation = {
    id: privateInput.population.id,
    commitmentSha256: privateInput.commitment.populationSha256,
  };
  if (options.task === 'classification') {
    if (!options.classificationCalibration) fail('classification sealed evaluation requires --classification-calibration from a disjoint split');
    const loaded = readCalibration(options.classificationCalibration);
    const selected = registry.tasks.classification.filter((row) => candidateIds.includes(row.id)).map((row) => row.id);
    validateClassificationCalibration(loaded.value, jobs, selected);
    assertCalibrationDisjoint(loaded.value, promotionPopulation, 'classification');
    result.classification = loaded.value;
    result.classificationPointer = loaded.pointer;
  }
  if (options.task === 'embedding-retrieval') {
    const cascades = registry.retrievalCascades.filter((row) => candidateIds.includes(row.id));
    if (!cascades.length) fail('embedding retrieval sealed evaluation requires at least one deterministic-refusal cascade');
    if (!options.refusalCalibration) fail('embedding retrieval sealed evaluation requires --refusal-calibration from a disjoint split');
    const loaded = readCalibration(options.refusalCalibration);
    validateRetrievalCalibration(loaded.value, cascades);
    assertCalibrationDisjoint(loaded.value, promotionPopulation, 'retrieval refusal');
    result.retrieval = loaded.value;
    result.retrievalPointer = loaded.pointer;
  }
  return result;
}

function calibrationReceipt(pointer) {
  return {
    path: receiptArgument(pointer.path),
    sha256: pointer.sha256,
  };
}

function parseArgs(argv) {
  const options = { task: '', sealedDir: DEFAULT_SEALED_DIR, out: '', candidateIds: [], classificationCalibration: '', refusalCalibration: '' };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === '--task') options.task = argv[++index] || '';
    else if (key === '--sealed-dir') options.sealedDir = path.resolve(argv[++index] || '');
    else if (key === '--out') options.out = path.resolve(argv[++index] || '');
    else if (key === '--candidate') options.candidateIds.push(argv[++index] || '');
    else if (key === '--classification-calibration') options.classificationCalibration = path.resolve(argv[++index] || '');
    else if (key === '--refusal-calibration') options.refusalCalibration = path.resolve(argv[++index] || '');
    else fail(`unknown argument ${key}`);
  }
  if (!TASKS.includes(options.task)) fail('--task must be classification, embedding-retrieval, or reranking');
  if (!options.out) fail('--out is required');
  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const registry = readCandidateRegistry();
  const modelLock = JSON.parse(fs.readFileSync(LOCK_PATH, 'utf8'));
  validateCandidateRegistry(registry, modelLock);
  const jobs = JSON.parse(fs.readFileSync(JOBS_PATH, 'utf8'));
  const policy = JSON.parse(fs.readFileSync(POLICY_PATH, 'utf8'));
  const privateInput = readPopulation(options.task, options.sealedDir);
  const ids = options.candidateIds.length
    ? options.candidateIds
    : [
      ...registry.tasks[options.task].filter((row) => row.evaluationEligible).map((row) => row.id),
      ...(options.task === 'embedding-retrieval' ? registry.retrievalCascades.filter((row) => row.evaluationEligible).map((row) => row.id) : []),
    ];
  const calibrations = loadRequiredCalibrations(options, privateInput, registry, jobs, ids);
  fs.mkdirSync(options.out, { recursive: true });
  const trial = createTrial(options.task, privateInput.population, privateInput.commitment, registry, jobs, policy, options.out, ids, calibrations);
  const trialPath = path.join(options.out, 'trial.json');
  fs.writeFileSync(trialPath, `${JSON.stringify(trial, null, 2)}\n`);
  const frontier = evaluateModelSelectionFrontier(trial, policy, jobs);
  const frontierPath = path.join(options.out, 'frontier.json');
  fs.writeFileSync(frontierPath, `${JSON.stringify(frontier, null, 2)}\n`);
  recordOpening(privateInput.commitmentPath, privateInput.commitment, trial.population.openingReceipt);
  process.stdout.write(`${JSON.stringify({ trialPath: path.relative(ROOT, trialPath), frontierPath: path.relative(ROOT, frontierPath), selectedCandidateId: frontier.selectedCandidateId, promotionEligible: frontier.promotionEligible }, null, 2)}\n`);
}

function assertNoGold(value) {
  const forbidden = new Set(['expectedLabel', 'relevantIds', 'hardNegativeIds', 'winnerId', 'relevance', 'mustRefuse']);
  const visit = (node) => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== 'object') return;
    for (const [key, child] of Object.entries(node)) {
      if (forbidden.has(key)) fail(`candidate-visible payload includes evaluator-owned field ${key}`);
      visit(child);
    }
  };
  visit(value);
}

function labelDescription(id) {
  return id.replace(/-/g, ' ');
}

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function round(value) {
  return Number(Number(value || 0).toFixed(6));
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function digest(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function fail(message) {
  throw new Error(`Model selection trial invalid: ${message}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error && error.stack ? error.stack : error);
    process.exitCode = 1;
  }
}
