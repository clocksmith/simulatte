const assert = require('node:assert/strict');
const test = require('node:test');

const lock = require('../public/data/simulatte-embedder/model-runtime-lock.json');
const runtime = require('../public/blank/pipeline/phase-03-retrieval/simulatte-compact-classifier-runtime.js');
const routerApi = require('../public/blank/pipeline/phase-03-retrieval/simulatte-classification-tier-router.js');
const conditionalReranking = require('../public/blank/pipeline/phase-03-retrieval/simulatte-conditional-reranking.js');

test('browser compact tiers execute but abstain without candidate-specific calibration', () => {
  for (const head of runtime.artifact.heads) {
    const expected = head.labels.filter((id) => !head.scoredLabelsExclude.includes(id));
    assert.deepEqual(head.labelPrototypes.map((row) => row.id), expected, head.id);
    assert.ok(head.labelPrototypes.every((row) => row.text !== row.id.replaceAll('-', ' ')), head.id);
  }
  for (const modelKey of runtime.MODEL_KEYS) {
    const result = runtime.classify('material', 'a clear glass lens', { modelKey });
    assert.equal(result.modelExecuted, true, modelKey);
    assert.equal(result.candidateLabel, 'glass', modelKey);
    assert.equal(result.predictedLabel, 'abstain', modelKey);
    assert.equal(result.refusalReason, 'candidate-specific-calibration-required', modelKey);
  }
});

test('tier router selects the cheapest calibrated candidate and receipts skipped tiers', async () => {
  const router = routerApi.createRouter(lock.classification);
  const calibration = {
    id: 'classification-calibration-fixture',
    candidates: {
      'multinomial-nb-tfidf-head': {
        eligible: true,
        heads: {
          material: {
            clearsCalibrationGate: true,
            minimumConfidence: 0.15,
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
  assert.equal(receipt.selectedTierId, 'multinomial-nb-tfidf-head');
  assert.equal(receipt.result.predictedLabel, 'glass');
  assert.equal(receipt.attempts.length, 1);
});

test('tier router executes the explicitly selected browser model instead of the default order', async () => {
  const router = routerApi.createRouter(lock.classification);
  const receipt = await router.classify({ id: 'material:glass', headId: 'material', text: 'a clear glass lens' }, {
    selectedTierId: 'linear-svc-tfidf-head',
    allowEvaluation: true,
  });

  assert.equal(receipt.selectedTierId, null);
  assert.equal(receipt.attempts.length, 1);
  assert.equal(receipt.attempts[0].tierId, 'linear-svc-tfidf-head');
  assert.equal(receipt.attempts[0].status, 'executed');
  assert.equal(receipt.attempts[0].result.modelExecuted, true);
  assert.equal(receipt.attempts[0].result.accepted, false);
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

test('Qwen embedding classification batches and reuses fixed label vectors after linear tiers abstain', async () => {
  const calls = [];
  const provider = {
    async embedTexts(rows) {
      calls.push(rows.map((row) => ({ ...row })));
      return rows.map((row) => String(row.text).includes('glass')
        ? Float32Array.from([1, 0])
        : Float32Array.from([0, 1]));
    },
  };
  const router = routerApi.createRouter(lock.classification, { 'qwen-embedding': provider });
  const calibration = {
    id: 'qwen-classification-calibration-fixture',
    candidates: {
      'qwen3-embedding-classifier-control': {
        eligible: true,
        heads: {
          material: {
            clearsCalibrationGate: true,
            minimumConfidence: 0.9,
            minimumMargin: 0.5,
          },
        },
      },
    },
  };
  const receipt = await router.classifyMany([
    { id: 'material:first', headId: 'material', text: 'glass object' },
    { id: 'material:second', headId: 'material', text: 'glass object' },
  ], {
    calibration,
    embeddingIdentity: 'qwen-test-identity',
    modelConsent: true,
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].filter((row) => row.embeddingKind === 'query').length, 1);
  assert.match(calls[0].find((row) => row.embeddingKind === 'document' && row.text.includes('glass')).text, /Material class:/);
  assert.equal(receipt.acceptedCount, 2);
  assert.equal(receipt.routes[0].selectedTierId, 'qwen3-embedding-classifier-control');
  assert.equal(receipt.results[0].predictedLabel, 'glass');
});
