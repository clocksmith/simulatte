#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const CLASSIFICATION_CALIBRATION_SCHEMA = 'simulatte.classificationAbstentionCalibration.v1';
export const RETRIEVAL_CALIBRATION_SCHEMA = 'simulatte.retrievalRefusalCalibration.v1';
const ROW_FINGERPRINT_SCHEMA = 'simulatte.modelSelectionRowFingerprint.v1';
const PARTITION_SCHEMA = 'simulatte.calibrationPartitionReceipt.v1';

export function applyClassificationCalibration(predictions, jobs, calibration, candidateId) {
  validateClassificationCalibration(calibration, jobs, [candidateId]);
  const rules = calibration.candidates[candidateId].heads;
  return {
    ...predictions,
    rows: predictions.rows.map((row) => {
      const rule = rules[row.headId];
      if (!rule) fail(`classification calibration lacks ${candidateId}/${row.headId}`);
      const scores = [...(row.scores || [])].sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));
      if (!scores.length) fail(`${candidateId}/${row.id} lacks scores required for calibrated abstention`);
      const abstentionId = jobs.jobs.find((job) => job.id === row.headId)?.abstention?.label;
      if (!abstentionId) fail(`classification job ${row.headId} lacks an abstention label`);
      const accepted = Number(row.confidence) >= rule.minimumConfidence;
      return {
        ...row,
        predictedLabel: accepted ? scores[0].id : abstentionId,
        calibrationDecision: {
          schema: 'simulatte.classificationAbstentionDecision.v1',
          calibrationId: calibration.id,
          candidateId,
          headId: row.headId,
          minimumConfidence: rule.minimumConfidence,
          observedConfidence: Number(row.confidence),
          accepted,
        },
      };
    }),
  };
}

export function composeRetrievalCascade({ cascade, lexicalPredictions, recallPredictions, calibration }) {
  validateRetrievalCalibration(calibration, [cascade]);
  const rule = calibration.cascades[cascade.id];
  const lexicalById = new Map(lexicalPredictions.rows.map((row) => [row.id, row]));
  const rows = recallPredictions.rows.map((recallRow) => {
    const lexicalRow = lexicalById.get(recallRow.id);
    if (!lexicalRow) fail(`${cascade.id} lacks lexical gate signals for ${recallRow.id}`);
    const signalValues = retrievalSignals(lexicalRow, recallRow);
    const lexicalAccepted = signalValues.lexicalTopScore >= rule.minimumLexicalTopScore
      && signalValues.lexicalMargin >= rule.minimumLexicalMargin;
    const semanticAccepted = signalValues.recallTopScore >= rule.minimumRecallTopScore
      && signalValues.recallMargin >= rule.minimumRecallMargin;
    const refused = !(lexicalAccepted || semanticAccepted);
    return {
      ...recallRow,
      refused,
      refusalDecision: {
        schema: 'simulatte.deterministicRetrievalRefusalDecision.v1',
        calibrationId: calibration.id,
        cascadeId: cascade.id,
        ruleId: rule.id,
        signalValues,
        lexicalAccepted,
        semanticAccepted,
        refused,
        recallModelExecuted: recallPredictions.model?.executed === true,
      },
    };
  });
  return {
    schema: 'simulatte.modelCandidatePredictions.v1',
    candidateId: cascade.id,
    task: 'embedding-retrieval',
    kind: 'composite-cascade',
    model: { executed: recallPredictions.model?.executed === true },
    modelId: recallPredictions.modelId,
    revision: recallPredictions.revision,
    runtime: { ...recallPredictions.runtime },
    components: {
      refusalGateCandidateId: cascade.refusalGateCandidateId,
      recallCandidateId: cascade.recallCandidateId,
    },
    calibration: calibrationPointer(calibration),
    rows,
    performance: combinePerformance(lexicalPredictions.performance, recallPredictions.performance),
  };
}

export function validateClassificationCalibration(calibration, jobs, candidateIds, policy = null) {
  validateCalibrationPopulation(calibration, CLASSIFICATION_CALIBRATION_SCHEMA, 'classification');
  if (policy) validateCalibrationReceiptContract(calibration, policy, 'classification');
  if (!calibration.candidates || typeof calibration.candidates !== 'object') fail('classification calibration candidates are required');
  for (const candidateId of candidateIds) {
    const candidate = calibration.candidates[candidateId];
    if (!candidate || !candidate.heads) fail(`classification calibration lacks candidate ${candidateId}`);
    if (candidate.eligible !== true) fail(`classification calibration validation did not clear every head for ${candidateId}`);
    for (const job of jobs.jobs) {
      const head = candidate.heads[job.id];
      if (head?.clearsCalibrationGate !== true) fail(`classification calibration validation did not clear ${candidateId}/${job.id}`);
      const threshold = head.minimumConfidence;
      requireUnit(threshold, `${candidateId}/${job.id} minimumConfidence`);
      validateClassificationMetrics(head.developmentMetrics, `${candidateId}/${job.id} development`);
      validateClassificationMetrics(head.validationMetrics, `${candidateId}/${job.id} validation`);
    }
  }
  return calibration;
}

export function validateRetrievalCalibration(calibration, cascades, policy = null) {
  validateCalibrationPopulation(calibration, RETRIEVAL_CALIBRATION_SCHEMA, 'embedding-retrieval');
  if (policy) validateCalibrationReceiptContract(calibration, policy, 'embedding-retrieval');
  if (!calibration.cascades || typeof calibration.cascades !== 'object') fail('retrieval calibration cascades are required');
  for (const cascade of cascades) {
    const rule = calibration.cascades[cascade.id];
    if (!rule) fail(`retrieval calibration lacks cascade ${cascade.id}`);
    if (rule.clearsCalibrationGate !== true) fail(`retrieval calibration did not clear ${cascade.id}`);
    if (rule.refusalGateCandidateId !== cascade.refusalGateCandidateId || rule.recallCandidateId !== cascade.recallCandidateId) {
      fail(`${cascade.id} calibration component identity mismatch`);
    }
    for (const field of ['minimumLexicalTopScore', 'minimumLexicalMargin', 'minimumRecallTopScore', 'minimumRecallMargin']) {
      requireFinite(rule[field], `${cascade.id} ${field}`);
    }
    requireUnit(rule.calibrationMetrics?.answerableAcceptance, `${cascade.id} answerableAcceptance`);
    requireUnit(rule.calibrationMetrics?.mustRefuseAccuracy, `${cascade.id} mustRefuseAccuracy`);
    requireUnit(rule.calibrationMetrics?.refusalPrecision, `${cascade.id} refusalPrecision`);
  }
  return calibration;
}

export function readCalibration(filePath) {
  const bytes = fs.readFileSync(filePath);
  const value = JSON.parse(bytes.toString('utf8'));
  return { value, pointer: { path: filePath, sha256: digest(bytes) } };
}

export function assertCalibrationDisjoint(calibration, promotionPopulation, label) {
  if (calibration.population.id === promotionPopulation.id) fail(`${label} calibration and promotion population ids must differ`);
  const promotionHash = promotionPopulation.commitmentSha256 || promotionPopulation.sha256;
  if (calibration.population.sha256 === promotionHash) fail(`${label} calibration and promotion population hashes must differ`);
  if (!Array.isArray(promotionPopulation.rows)) fail(`${label} promotion population rows are required for disjointness`);
  const calibrationFingerprints = new Set(calibration.population.rowFingerprints || []);
  const promotionFingerprints = populationRowFingerprints(promotionPopulation, promotionPopulation.task);
  const overlap = promotionFingerprints.filter((fingerprint) => calibrationFingerprints.has(fingerprint));
  if (overlap.length) fail(`${label} calibration and promotion populations overlap on ${overlap.length} content fingerprint(s)`);
  return {
    schema: 'simulatte.calibrationPromotionDisjointnessReceipt.v1',
    calibrationPopulationId: calibration.population.id,
    promotionPopulationId: promotionPopulation.id,
    fingerprintSchema: ROW_FINGERPRINT_SCHEMA,
    calibrationRowCount: calibrationFingerprints.size,
    promotionRowCount: promotionFingerprints.length,
    overlapCount: 0,
    calibrationFingerprintsSha256: fingerprintSetHash([...calibrationFingerprints]),
    promotionFingerprintsSha256: fingerprintSetHash(promotionFingerprints),
  };
}

export function validateCalibrationPopulationContract(population, task, policy) {
  if (!population || population.task !== task || population.role !== 'calibration' || population.promotionEligible !== false) {
    fail(`${task} requires a non-promotable calibration population`);
  }
  if (!population.id || !Array.isArray(population.rows) || !population.rows.length) fail(`${task} calibration rows are required`);
  const ids = new Set();
  for (const row of population.rows) {
    if (!row || !String(row.id || '').trim()) fail(`${task} calibration row id is required`);
    if (ids.has(row.id)) fail(`${task} calibration row id is duplicated: ${row.id}`);
    ids.add(row.id);
  }
  const fingerprints = populationRowFingerprints(population, task);
  if (new Set(fingerprints).size !== fingerprints.length) fail(`${task} calibration contains duplicate row content`);
  const partition = buildCalibrationPartition(population, task, policy);
  validatePartitionSize(partition, task, policy);
  return partition;
}

export function buildCalibrationPartition(population, task, policy) {
  const contract = policy && policy.calibrationContract || {};
  if (contract.rowFingerprintSchema !== ROW_FINGERPRINT_SCHEMA || contract.partitionSchema !== PARTITION_SCHEMA) {
    fail('calibration fingerprint or partition schema contract mismatch');
  }
  if (contract.partitionMethod !== 'content-fingerprint-stratified-v1') fail('calibration partition method mismatch');
  const fraction = Number(contract.validationFraction);
  if (!(fraction > 0 && fraction < 0.5)) fail('calibration validationFraction must be greater than 0 and below 0.5');
  const salt = String(contract.partitionSalt || '').trim();
  if (!salt) fail('calibration partitionSalt is required');
  const grouped = new Map();
  for (const row of population.rows) {
    const fingerprint = fingerprintPopulationRow(row, task);
    const stratum = task === 'classification' ? String(row.headId || '') : row.mustRefuse === true ? 'must-refuse' : 'answerable';
    if (!stratum) fail(`${task} calibration row ${row.id} lacks a partition stratum`);
    if (!grouped.has(stratum)) grouped.set(stratum, []);
    grouped.get(stratum).push({ id: row.id, fingerprint });
  }
  const development = [];
  const validation = [];
  const strata = [];
  for (const [id, rows] of [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const ordered = [...rows].sort((left, right) => partitionKey(salt, left.fingerprint).localeCompare(partitionKey(salt, right.fingerprint)));
    const minimums = partitionStratumMinimums(task, policy, id);
    const validationCount = Math.max(minimums.validation, Math.round(ordered.length * fraction));
    if (ordered.length - validationCount < minimums.development) {
      fail(`${task} calibration stratum ${id} cannot satisfy development and validation size floors`);
    }
    const validationRows = ordered.slice(0, validationCount);
    const developmentRows = ordered.slice(validationCount);
    validation.push(...validationRows);
    development.push(...developmentRows);
    strata.push({ id, rowCount: ordered.length, developmentRowCount: developmentRows.length, validationRowCount: validationRows.length });
  }
  const developmentFingerprints = development.map((row) => row.fingerprint).sort();
  const validationFingerprints = validation.map((row) => row.fingerprint).sort();
  const validationFingerprintSet = new Set(validationFingerprints);
  const overlap = developmentFingerprints.filter((fingerprint) => validationFingerprintSet.has(fingerprint));
  if (overlap.length) fail(`${task} calibration development and validation partitions overlap`);
  return {
    schema: PARTITION_SCHEMA,
    method: contract.partitionMethod,
    salt,
    fingerprintSchema: contract.rowFingerprintSchema,
    rowCount: population.rows.length,
    parameterCount: task === 'classification'
      ? Number(contract.classification?.parameterCountPerHead || 0)
      : Number(contract.retrievalRefusal?.parameterCount || 0),
    development: partitionSide(development),
    validation: partitionSide(validation),
    strata,
    overlapCount: 0,
  };
}

export function populationRowFingerprints(population, task) {
  return (population.rows || []).map((row) => fingerprintPopulationRow(row, task));
}

export function fingerprintPopulationRow(row, task) {
  const payload = task === 'classification'
    ? {
      schema: ROW_FINGERPRINT_SCHEMA,
      task,
      headId: row.headId,
      input: row.input,
      expectedLabel: row.expectedLabel,
    }
    : {
      schema: ROW_FINGERPRINT_SCHEMA,
      task,
      query: row.query,
      candidates: (row.candidates || []).map((candidate) => ({
        id: candidate.id,
        text: candidate.text,
        types: Array.isArray(candidate.types) ? [...candidate.types].sort() : [],
      })),
      relevantIds: [...(row.relevantIds || [])].sort(),
      hardNegativeIds: [...(row.hardNegativeIds || [])].sort(),
      mustRefuse: row.mustRefuse === true,
    };
  return digest(Buffer.from(canonicalJson(payload)));
}

function validateCalibrationPopulation(calibration, schema, task) {
  if (!calibration || calibration.schema !== schema) fail(`${task} calibration schema mismatch`);
  if (!calibration.id || !calibration.policyId) fail(`${task} calibration id and policyId are required`);
  const population = calibration.population || {};
  if (population.task !== task || population.role !== 'calibration') fail(`${task} calibration population role mismatch`);
  if (population.promotionEligible !== false) fail(`${task} calibration population cannot be promotion eligible`);
  if (!population.id || !/^[a-f0-9]{64}$/.test(String(population.sha256 || ''))) fail(`${task} calibration population identity/hash is required`);
  if (!Number.isInteger(population.rowCount) || population.rowCount < 1) fail(`${task} calibration population rowCount is required`);
  if (population.fingerprintSchema !== ROW_FINGERPRINT_SCHEMA) fail(`${task} calibration row fingerprint schema mismatch`);
  if (!Array.isArray(population.rowFingerprints) || population.rowFingerprints.length !== population.rowCount) {
    fail(`${task} calibration row fingerprints must cover every row`);
  }
  if (new Set(population.rowFingerprints).size !== population.rowCount) fail(`${task} calibration row fingerprints must be unique`);
  for (const fingerprint of population.rowFingerprints) if (!/^[a-f0-9]{64}$/.test(fingerprint)) fail(`${task} calibration row fingerprint must be SHA-256`);
}

function validateCalibrationReceiptContract(calibration, policy, task) {
  const contract = policy.calibrationContract || {};
  const partition = calibration.partition || {};
  if (partition.schema !== contract.partitionSchema || partition.method !== contract.partitionMethod) fail(`${task} calibration partition contract mismatch`);
  if (partition.fingerprintSchema !== contract.rowFingerprintSchema || partition.overlapCount !== 0) fail(`${task} calibration partition fingerprint contract mismatch`);
  if (partition.rowCount !== calibration.population.rowCount) fail(`${task} calibration partition row count mismatch`);
  const partitionFingerprints = [...(partition.development?.rowFingerprints || []), ...(partition.validation?.rowFingerprints || [])];
  if (partitionFingerprints.length !== calibration.population.rowCount) fail(`${task} calibration partition does not cover every row`);
  if (new Set(partitionFingerprints).size !== partitionFingerprints.length) fail(`${task} calibration partition fingerprints overlap`);
  if (fingerprintSetHash(partitionFingerprints) !== fingerprintSetHash(calibration.population.rowFingerprints)) fail(`${task} calibration partition fingerprints differ from the population`);
  validatePartitionSize(partition, task, policy);
}

function validateClassificationMetrics(metrics, label) {
  for (const field of ['macroF1', 'coverage', 'selectiveRisk', 'expectedCalibrationError']) {
    requireUnit(metrics && metrics[field], `${label} ${field}`);
  }
}

function validatePartitionSize(partition, task, policy) {
  const contract = policy.calibrationContract || {};
  const config = task === 'classification' ? contract.classification || {} : contract.retrievalRefusal || {};
  const parameterCount = task === 'classification'
    ? positiveInteger(config.parameterCountPerHead, 'classification parameterCountPerHead')
    : positiveInteger(config.parameterCount, 'retrieval parameterCount');
  const minimumTotal = parameterCount * positiveInteger(config.minimumCalibrationRowsPerParameter, `${task} minimumCalibrationRowsPerParameter`);
  const minimumDevelopment = parameterCount * positiveInteger(config.minimumDevelopmentRowsPerParameter, `${task} minimumDevelopmentRowsPerParameter`);
  const minimumValidation = parameterCount * positiveInteger(config.minimumValidationRowsPerParameter, `${task} minimumValidationRowsPerParameter`);
  if (task === 'classification') {
    for (const stratum of partition.strata || []) {
      if (stratum.rowCount < minimumTotal || stratum.developmentRowCount < minimumDevelopment || stratum.validationRowCount < minimumValidation) {
        fail(`classification calibration head ${stratum.id} is below its parameter-scaled size floor`);
      }
    }
    return;
  }
  if (partition.rowCount < minimumTotal || partition.development.rowCount < minimumDevelopment || partition.validation.rowCount < minimumValidation) {
    fail('embedding-retrieval calibration is below its parameter-scaled size floor');
  }
  const minimumAnswerable = positiveInteger(config.minimumAnswerableRowsPerPartition, 'retrieval minimumAnswerableRowsPerPartition');
  const minimumRefusal = positiveInteger(config.minimumRefusalRowsPerPartition, 'retrieval minimumRefusalRowsPerPartition');
  const answerable = (partition.strata || []).find((row) => row.id === 'answerable');
  const refusals = (partition.strata || []).find((row) => row.id === 'must-refuse');
  if (!answerable || answerable.developmentRowCount < minimumAnswerable || answerable.validationRowCount < minimumAnswerable) {
    fail('embedding-retrieval calibration answerable strata are below the partition floor');
  }
  if (!refusals || refusals.developmentRowCount < minimumRefusal || refusals.validationRowCount < minimumRefusal) {
    fail('embedding-retrieval calibration refusal strata are below the partition floor');
  }
}

function partitionStratumMinimums(task, policy, stratumId) {
  const contract = policy.calibrationContract || {};
  if (task === 'classification') {
    const config = contract.classification || {};
    const parameters = positiveInteger(config.parameterCountPerHead, 'classification parameterCountPerHead');
    return {
      development: parameters * positiveInteger(config.minimumDevelopmentRowsPerParameter, 'classification minimumDevelopmentRowsPerParameter'),
      validation: parameters * positiveInteger(config.minimumValidationRowsPerParameter, 'classification minimumValidationRowsPerParameter'),
    };
  }
  const config = contract.retrievalRefusal || {};
  const minimum = stratumId === 'answerable'
    ? positiveInteger(config.minimumAnswerableRowsPerPartition, 'retrieval minimumAnswerableRowsPerPartition')
    : positiveInteger(config.minimumRefusalRowsPerPartition, 'retrieval minimumRefusalRowsPerPartition');
  return {
    development: minimum,
    validation: minimum,
  };
}

function partitionSide(rows) {
  const rowFingerprints = rows.map((row) => row.fingerprint).sort();
  return {
    rowCount: rows.length,
    rowIds: rows.map((row) => row.id).sort(),
    rowFingerprints,
    rowFingerprintsSha256: fingerprintSetHash(rowFingerprints),
  };
}

function partitionKey(salt, fingerprint) {
  return digest(Buffer.from(`${salt}:${fingerprint}`));
}

function fingerprintSetHash(fingerprints) {
  return digest(Buffer.from([...fingerprints].sort().join('\n')));
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function retrievalSignals(lexicalRow, recallRow) {
  const lexicalScores = lexicalRow.scores || [];
  const recallScores = recallRow.scores || [];
  if (!lexicalScores.length || !recallScores.length) fail(`retrieval cascade requires lexical and recall scores for ${recallRow.id}`);
  return {
    lexicalTopScore: Number(lexicalScores[0].score),
    lexicalMargin: margin(lexicalScores),
    recallTopScore: Number(recallScores[0].score),
    recallMargin: margin(recallScores),
  };
}

function margin(scores) {
  return Number(scores[0]?.score || 0) - Number(scores[1]?.score || 0);
}

function combinePerformance(lexical, recall) {
  const left = lexical || {};
  const right = recall || {};
  const leftWarm = left.warmLatencyMs || [];
  const rightWarm = right.warmLatencyMs || [];
  const sampleCount = Math.min(leftWarm.length, rightWarm.length);
  return {
    coldLoadMs: Number(left.coldLoadMs || 0) + Number(right.coldLoadMs || 0),
    warmLatencyMs: Array.from({ length: sampleCount }, (_, index) => Number(leftWarm[index] || 0) + Number(rightWarm[index] || 0)),
    downloadBytes: Number(left.downloadBytes || 0) + Number(right.downloadBytes || 0),
    peakMemoryBytes: Number(left.peakMemoryBytes || 0) + Number(right.peakMemoryBytes || 0),
    deviceId: right.deviceId,
    dtype: right.dtype,
    measurement: 'conservative-component-sum',
  };
}

function calibrationPointer(calibration) {
  return {
    schema: calibration.schema,
    id: calibration.id,
    populationId: calibration.population.id,
    populationSha256: calibration.population.sha256,
  };
}

function requireUnit(value, label) {
  requireFinite(value, label);
  if (Number(value) < 0 || Number(value) > 1) fail(`${label} must be within 0..1`);
}

function requireFinite(value, label) {
  if (!Number.isFinite(Number(value))) fail(`${label} must be finite`);
}

function positiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) fail(`${label} must be a positive integer`);
  return number;
}

function digest(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function fail(message) {
  throw new Error(`Model selection calibration invalid: ${message}`);
}
