#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const CLASSIFICATION_CALIBRATION_SCHEMA = 'simulatte.classificationAbstentionCalibration.v1';
export const RETRIEVAL_CALIBRATION_SCHEMA = 'simulatte.retrievalRefusalCalibration.v1';

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

export function validateClassificationCalibration(calibration, jobs, candidateIds) {
  validateCalibrationPopulation(calibration, CLASSIFICATION_CALIBRATION_SCHEMA, 'classification');
  if (!calibration.candidates || typeof calibration.candidates !== 'object') fail('classification calibration candidates are required');
  for (const candidateId of candidateIds) {
    const candidate = calibration.candidates[candidateId];
    if (!candidate || !candidate.heads) fail(`classification calibration lacks candidate ${candidateId}`);
    for (const job of jobs.jobs) {
      const head = candidate.heads[job.id];
      const threshold = head.minimumConfidence;
      requireUnit(threshold, `${candidateId}/${job.id} minimumConfidence`);
    }
  }
  return calibration;
}

export function validateRetrievalCalibration(calibration, cascades) {
  validateCalibrationPopulation(calibration, RETRIEVAL_CALIBRATION_SCHEMA, 'embedding-retrieval');
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
  if (calibration.population.sha256 === promotionPopulation.commitmentSha256) fail(`${label} calibration and promotion population hashes must differ`);
}

function validateCalibrationPopulation(calibration, schema, task) {
  if (!calibration || calibration.schema !== schema) fail(`${task} calibration schema mismatch`);
  if (!calibration.id || !calibration.policyId) fail(`${task} calibration id and policyId are required`);
  const population = calibration.population || {};
  if (population.task !== task || population.role !== 'calibration') fail(`${task} calibration population role mismatch`);
  if (population.promotionEligible !== false) fail(`${task} calibration population cannot be promotion eligible`);
  if (!population.id || !/^[a-f0-9]{64}$/.test(String(population.sha256 || ''))) fail(`${task} calibration population identity/hash is required`);
  if (!Number.isInteger(population.rowCount) || population.rowCount < 1) fail(`${task} calibration population rowCount is required`);
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

function digest(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function fail(message) {
  throw new Error(`Model selection calibration invalid: ${message}`);
}
