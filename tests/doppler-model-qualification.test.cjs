const assert = require('node:assert/strict');
const test = require('node:test');

test('Doppler model qualification summarizes exact successful browser evidence', async () => {
  const { summarizeModelResult } = await import('../tools/simulatte/qualify-doppler-models.mjs');
  const model = {
    id: 'model-id',
    manifestHash: { hex: 'a'.repeat(64) },
    source: { revision: 'b'.repeat(40), sizeBytes: 123 },
  };
  const shared = {
    ok: true,
    result: {
      modelId: model.id,
      passed: 2,
      failed: 0,
      skipped: 0,
      cacheMode: 'warm',
      loadMode: 'opfs',
      deviceInfo: { adapterInfo: { description: 'physical adapter' } },
    },
  };
  const embedding = summarizeModelResult({
    ...shared,
    result: {
      ...shared.result,
      workload: 'embedding',
      output: {
        mode: 'embedding',
        embeddingDim: 1024,
        finiteRatio: 1,
        l2Norm: 1,
        semantic: { passed: true, retrievalTop1Acc: 1 },
      },
    },
  }, 'embedding', model);
  assert.equal(embedding.output.dimensions, 1024);
  assert.equal(embedding.output.semanticPassed, true);

  const rerank = summarizeModelResult({
    ...shared,
    result: {
      ...shared.result,
      workload: 'rerank',
      output: {
        mode: 'rerank',
        documentCount: 2,
        topDocument: { index: 0 },
        ranking: [{ index: 0, scoringPath: 'prefix-selected-token-logits' }],
        semantic: { passed: true, pairAcc: 1 },
      },
    },
  }, 'rerank', model);
  assert.deepEqual(rerank.output.scoringPaths, ['prefix-selected-token-logits']);
});

test('Doppler model qualification rejects fallback-shaped or semantically invalid output', async () => {
  const { summarizeModelResult } = await import('../tools/simulatte/qualify-doppler-models.mjs');
  const model = {
    id: 'model-id',
    manifestHash: { hex: 'a'.repeat(64) },
    source: { revision: 'b'.repeat(40), sizeBytes: 123 },
  };
  assert.throws(() => summarizeModelResult({
    ok: true,
    result: {
      modelId: model.id,
      workload: 'rerank',
      passed: 1,
      failed: 0,
      deviceInfo: { adapterInfo: { description: 'physical adapter' } },
      output: {
        mode: 'rerank',
        topDocument: { index: 1 },
        ranking: [{ scoringPath: 'selected-token-logits' }],
        semantic: { passed: true },
      },
    },
  }, 'rerank', model), /expected document/);

  assert.throws(() => summarizeModelResult({
    ok: true,
    result: {
      modelId: model.id,
      workload: 'embedding',
      passed: 1,
      failed: 0,
      deviceInfo: { adapterInfo: { description: 'Google SwiftShader' } },
      output: {
        mode: 'embedding',
        embeddingDim: 1024,
        finiteRatio: 1,
        l2Norm: 1,
        semantic: { passed: true, retrievalTop1Acc: 1 },
      },
    },
  }, 'embedding', model), /software adapter/);
});
