const assert = require('node:assert/strict');
const test = require('node:test');

test('vendor inference receipt requires real probes, prompt reranking, and the numbered lock', async () => {
  const { validateVendorInferenceReport } = await import('../tools/vendor-inference-receipt.mjs');
  const lock = {
    id: 'runtime-lock',
    number: 7,
    doppler: { package: { version: '1.2.3' } },
    embedding: { id: 'embed', dimensions: 4, manifestHash: { hex: 'embed-hash' } },
    reranker: {
      id: 'reranker-contract',
      model: { id: 'reranker-model', manifestHash: { hex: 'reranker-hash' } },
    },
  };
  const execution = {
    schema: 'simulatte.modelExecutionAuditReceipt.v1',
    ready: true,
    noFallback: true,
    providerReady: true,
    providerBackend: 'doppler-browser-load',
    modelRuntimeLock: { id: 'runtime-lock', number: 7, artifactHash: 'lock-hash' },
    embeddingModelId: 'embed',
    embeddingModelHash: 'embed-hash',
    embeddingDim: 4,
    embeddingProbe: true,
    embeddingProbeCount: 3,
    embeddingProbeDim: 4,
    embeddingStabilitySimilarity: 1,
    embeddingDistinctProbePairs: 3,
    rerankerId: 'reranker-contract',
    rerankerModelId: 'reranker-model',
    rerankerModelHash: 'reranker-hash',
    rerankerRequired: true,
    rerankerReady: true,
    rerankerStatus: 'ready',
    rerankerBackend: 'doppler-reranker-load',
    rerankerProbeCount: 1,
    rerankerProbeCandidateCount: 2,
    rerankerProbeOutputCount: 2,
    phase3Rerank: {
      modelReady: true,
      modelRequired: true,
      modelStatus: 'ready',
      modelBackend: 'doppler-reranker',
      candidateInputCount: 8,
      candidateOutputCount: 8,
      slotRerankCallCount: 2,
    },
  };
  const report = {
    schema: 'simulatte.intentSceneScreenshotAudit.v1',
    createdAt: '2026-07-10T00:00:00.000Z',
    intentMode: 'model',
    summary: { ok: true },
    results: [{
      prompt: 'model prompt',
      modelExecutionReceipt: execution,
      sceneProofVerdict: 'pass',
      phase7PixelProofStatus: 'pass',
      physicsCanvasRenderer: 'webgpu',
      physicsCanvasRendererStatus: 'ready',
    }],
  };

  const receipt = validateVendorInferenceReport(report, lock, 'lock-hash');
  assert.equal(receipt.status, 'pass');
  assert.equal(receipt.modelRuntimeLock.number, 7);
  assert.equal(receipt.reranker.candidateInputCount, 8);

  const configOnly = structuredClone(report);
  configOnly.results[0].modelExecutionReceipt.rerankerProbeCount = 0;
  assert.throws(
    () => validateVendorInferenceReport(configOnly, lock, 'lock-hash'),
    /real reranker probe did not execute/
  );
});
