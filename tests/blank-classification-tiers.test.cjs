const assert = require('node:assert/strict');
const test = require('node:test');

const lock = require('../public/data/simulatte-embedder/model-runtime-lock.json');
const runtime = require('../public/blank/pipeline/phase-03-retrieval/simulatte-compact-classifier-runtime.js');
const routerApi = require('../public/blank/pipeline/phase-03-retrieval/simulatte-classification-tier-router.js');
const conditionalReranking = require('../public/blank/pipeline/phase-03-retrieval/simulatte-conditional-reranking.js');

test('browser linear tiers execute but abstain without candidate-specific calibration', () => {
  const svc = runtime.classify('material', 'a clear glass lens', { modelKey: 'linearSVC' });
  const logistic = runtime.classify('material', 'a clear glass lens', { modelKey: 'logisticRegression' });

  assert.equal(svc.modelExecuted, true);
  assert.equal(svc.candidateLabel, 'glass');
  assert.equal(svc.predictedLabel, 'abstain');
  assert.equal(svc.refusalReason, 'candidate-specific-calibration-required');
  assert.equal(logistic.modelExecuted, true);
  assert.equal(logistic.candidateLabel, 'glass');
  assert.equal(logistic.predictedLabel, 'abstain');
});

test('tier router selects the cheapest calibrated candidate and receipts skipped tiers', async () => {
  const router = routerApi.createRouter(lock.classification);
  const calibration = {
    id: 'classification-calibration-fixture',
    candidates: {
      'linear-svc-tfidf-head': {
        eligible: true,
        heads: {
          material: {
            clearsCalibrationGate: true,
            minimumConfidence: 0.2,
            minimumMargin: 0.1,
          },
        },
      },
    },
  };
  const receipt = await router.classify({ id: 'material:glass', headId: 'material', text: 'a clear glass lens' }, {
    allowEvaluation: true,
    calibration,
  });

  assert.equal(receipt.accepted, true);
  assert.equal(receipt.selectedTierId, 'linear-svc-tfidf-head');
  assert.equal(receipt.result.predictedLabel, 'glass');
  assert.equal(receipt.attempts.length, 1);
});

test('conditional reranking never claims execution before the model runs', () => {
  const candidates = [
    { id: 'glass', score: 0.8, lexicalScore: 0.8, modelScore: 0.81 },
    { id: 'water', score: 0.4, lexicalScore: 0.4, modelScore: 0.39 },
  ];
  const disabled = conditionalReranking.decide({ candidates, config: { enabled: false } });
  const required = conditionalReranking.decide({
    candidates,
    config: { enabled: true, qualification: { promotionEligible: true } },
  });

  assert.equal(disabled.action, 'deterministic');
  assert.equal(disabled.modelExecuted, false);
  assert.equal(required.action, 'rerank');
  assert.equal(required.modelExecutionRequired, true);
  assert.equal(required.modelExecuted, false);
});
