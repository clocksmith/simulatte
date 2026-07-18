const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

test('classification abstention is candidate/head calibrated outside the candidate process', async () => {
  const { applyClassificationCalibration } = await import('../tools/samer/model-selection-calibration.mjs');
  const jobs = readJson('tools/samer/classification-jobs-v1.json');
  const heads = Object.fromEntries(jobs.jobs.map((job) => [job.id, {
    minimumConfidence: job.id === 'pose' ? 0.7 : 0.5,
    clearsCalibrationGate: true,
  }]));
  const calibration = {
    schema: 'simulatte.classificationAbstentionCalibration.v1',
    id: 'classification-calibration-test',
    policyId: 'policy-test',
    population: calibrationPopulation('classification'),
    candidates: { compact: { eligible: true, heads } },
  };
  const predictions = {
    schema: 'simulatte.modelCandidatePredictions.v1',
    candidateId: 'compact',
    task: 'classification',
    rows: [
      { id: 'low', headId: 'pose', confidence: 0.69, scores: [{ id: 'flying', score: 0.69 }, { id: 'standing', score: 0.2 }] },
      { id: 'high', headId: 'pose', confidence: 0.71, scores: [{ id: 'flying', score: 0.71 }, { id: 'standing', score: 0.2 }] },
    ],
  };
  const calibrated = applyClassificationCalibration(predictions, jobs, calibration, 'compact');
  assert.equal(calibrated.rows[0].predictedLabel, 'abstain');
  assert.equal(calibrated.rows[1].predictedLabel, 'flying');
  assert.equal(calibrated.rows[0].calibrationDecision.minimumConfidence, 0.7);
});

test('retrieval cascade keeps neural ranking while deterministic calibrated rule owns refusal', async () => {
  const { composeRetrievalCascade } = await import('../tools/samer/model-selection-calibration.mjs');
  const cascade = {
    id: 'det-plus-neural',
    refusalGateCandidateId: 'det',
    recallCandidateId: 'neural',
  };
  const calibration = {
    schema: 'simulatte.retrievalRefusalCalibration.v1',
    id: 'retrieval-calibration-test',
    policyId: 'policy-test',
    population: calibrationPopulation('embedding-retrieval'),
    cascades: {
      'det-plus-neural': {
        id: 'rule-test',
        refusalGateCandidateId: 'det',
        recallCandidateId: 'neural',
        minimumLexicalTopScore: 0.5,
        minimumLexicalMargin: 0.2,
        minimumRecallTopScore: 0.8,
        minimumRecallMargin: 0.3,
        clearsCalibrationGate: true,
        calibrationMetrics: { answerableAcceptance: 0.95, mustRefuseAccuracy: 1, refusalPrecision: 0.95 },
      },
    },
  };
  const lexicalPredictions = envelope('det', false, null, [
    retrievalRow('answer', [0.1, 0.09]),
    retrievalRow('refuse', [0.1, 0.09]),
  ]);
  const recallPredictions = envelope('neural', true, 'neural/model', [
    retrievalRow('answer', [0.95, 0.4]),
    retrievalRow('refuse', [0.45, 0.4]),
  ]);
  const composed = composeRetrievalCascade({ cascade, lexicalPredictions, recallPredictions, calibration });
  assert.equal(composed.rows[0].refused, false);
  assert.deepEqual(composed.rows[0].ranking, ['a', 'b']);
  assert.equal(composed.rows[1].refused, true);
  assert.equal(composed.rows[1].refusalDecision.recallModelExecuted, true);
});

test('retrieval calibration finds a precise deterministic rule on a non-promotable split', async () => {
  const { calibrateRetrieval } = await import('../tools/samer/calibrate-model-selection.mjs');
  const policy = readJson('tools/samer/model-selection-policy.json');
  const cascades = [{ id: 'det-plus-neural', refusalGateCandidateId: 'det', recallCandidateId: 'neural' }];
  const population = {
    id: 'calibration-split',
    task: 'embedding-retrieval',
    role: 'calibration',
    promotionEligible: false,
    rows: [
      { id: 'answer-lexical', mustRefuse: false },
      { id: 'answer-semantic', mustRefuse: false },
      { id: 'refuse-one', mustRefuse: true },
      { id: 'refuse-two', mustRefuse: true },
    ],
  };
  const predictions = {
    det: envelope('det', false, null, [
      retrievalRow('answer-lexical', [0.9, 0.1]),
      retrievalRow('answer-semantic', [0.03, 0.02]),
      retrievalRow('refuse-one', [0.02, 0.019]),
      retrievalRow('refuse-two', [0.01, 0.009]),
    ]),
    neural: envelope('neural', true, 'neural/model', [
      retrievalRow('answer-lexical', [0.9, 0.3]),
      retrievalRow('answer-semantic', [0.95, 0.2]),
      retrievalRow('refuse-one', [0.4, 0.39]),
      retrievalRow('refuse-two', [0.35, 0.34]),
    ]),
  };
  const receipt = calibrateRetrieval(population, predictions, cascades, policy);
  const rule = receipt.cascades['det-plus-neural'];
  assert.equal(rule.clearsCalibrationGate, true);
  assert.deepEqual(rule.calibrationMetrics, { answerableAcceptance: 1, mustRefuseAccuracy: 1, refusalPrecision: 1 });
  assert.equal(receipt.population.promotionEligible, false);
});

test('retrieval scoring exposes the over-refusal cost as delivered recall and refusal precision', async () => {
  const { scoreCandidatePredictions } = await import('../tools/samer/run-model-selection-trial.mjs');
  const population = {
    schema: 'simulatte.sealedEmbeddingRetrievalPopulation.v1',
    id: 'retrieval-test',
    task: 'embedding-retrieval',
    rows: [
      { id: 'answer-accepted', mustRefuse: false, relevantIds: ['a'], hardNegativeIds: ['b'] },
      { id: 'answer-over-refused', mustRefuse: false, relevantIds: ['a'], hardNegativeIds: ['b'] },
      { id: 'refuse-correct', mustRefuse: true, relevantIds: [], hardNegativeIds: [] },
    ],
  };
  const predictions = {
    schema: 'simulatte.modelCandidatePredictions.v1',
    candidateId: 'cascade',
    task: 'embedding-retrieval',
    rows: [
      { id: 'answer-accepted', ranking: ['a', 'b'], refused: false, durationMs: 1 },
      { id: 'answer-over-refused', ranking: ['a', 'b'], refused: true, durationMs: 1 },
      { id: 'refuse-correct', ranking: ['b', 'a'], refused: true, durationMs: 1 },
    ],
  };
  const quality = scoreCandidatePredictions(population, predictions, 'embedding-retrieval', { jobs: [] }, 2);
  assert.equal(quality.recallAtK, 1);
  assert.equal(quality.deliveredRecallAtK, 0.5);
  assert.equal(quality.answerableAcceptance, 0.5);
  assert.equal(quality.mustRefuseAccuracy, 1);
  assert.equal(quality.refusalPrecision, 0.5);
});

test('calibration population cannot be reused as the promotion population', async () => {
  const { assertCalibrationDisjoint } = await import('../tools/samer/model-selection-calibration.mjs');
  const calibration = { population: { id: 'same', sha256: 'a'.repeat(64) } };
  assert.throws(
    () => assertCalibrationDisjoint(calibration, { id: 'same', commitmentSha256: 'b'.repeat(64) }, 'classification'),
    /population ids must differ/
  );
});

function calibrationPopulation(task) {
  return {
    id: `${task}-calibration`,
    task,
    role: 'calibration',
    promotionEligible: false,
    rowCount: 10,
    sha256: 'a'.repeat(64),
  };
}

function envelope(candidateId, modelExecuted, modelId, rows) {
  return {
    schema: 'simulatte.modelCandidatePredictions.v1',
    candidateId,
    task: 'embedding-retrieval',
    kind: modelExecuted ? 'model-backed' : 'deterministic-rules',
    model: { executed: modelExecuted },
    modelId,
    revision: modelExecuted ? 'revision' : null,
    runtime: { id: 'python-transformers-candidate-screen-v1', deviceId: 'cpu', dtype: 'f32' },
    rows,
    performance: { coldLoadMs: 1, warmLatencyMs: Array(23).fill(1), downloadBytes: modelExecuted ? 100 : 0, peakMemoryBytes: modelExecuted ? 100 : 1 },
  };
}

function retrievalRow(id, scores) {
  return {
    id,
    ranking: ['a', 'b'],
    scores: [{ id: 'a', score: scores[0] }, { id: 'b', score: scores[1] }],
    refused: false,
    durationMs: 1,
  };
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
}
