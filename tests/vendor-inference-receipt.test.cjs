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
      maxSlotCandidatesPerCall: 4,
      model: { id: 'reranker-model', manifestHash: { hex: 'reranker-hash' } },
    },
  };
  const execution = {
    schema: 'simulatte.modelExecutionAuditReceipt.v1',
    ready: true,
    noFallback: true,
    providerReady: true,
    providerBackend: 'doppler-browser-load',
    cachePrefetch: true,
    cacheMode: 'opfs',
    cacheVerified: true,
    embeddingCacheState: 'verified-hit',
    rerankerCacheState: 'verified-hit',
    modelPreparation: {
      schema: 'simulatte.dopplerModelPreparationReceipt.v1',
      policy: 'prepare-all-sources-then-load-embedding-before-reranker',
      sourceOrder: ['embedding', 'reranker'],
      sourcePreparations: [
        { role: 'embedding', modelId: 'embed', order: 1, status: 'ready', overlap: false, queueWaitMs: 0, durationMs: 2 },
        { role: 'reranker', modelId: 'reranker-model', order: 2, status: 'ready', overlap: false, queueWaitMs: 2, durationMs: 3 },
      ],
      loadOrder: [
        { role: 'embedding', modelId: 'embed', order: 1, status: 'ready', overlap: false, queueWaitMs: 0, durationMs: 4 },
        { role: 'reranker', modelId: 'reranker-model', order: 2, status: 'ready', overlap: false, queueWaitMs: 4, durationMs: 5 },
      ],
    },
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
      promptScoringPaths: ['prefix-selected-token-logits'],
      promptSelectedTokenLogitCount: 8,
      promptPrefixKvReuseCount: 8,
      promptPrefixStateReuseCount: 8,
      promptMinimumPrefixTokenCount: 12,
      slotRerankCallCount: 2,
      slotCandidateInputCount: 8,
      slotCandidateOutputCount: 8,
      slotScoringPaths: ['prefix-selected-token-logits'],
      slotSelectedTokenLogitCount: 8,
      slotPrefixKvReuseCount: 8,
      slotPrefixStateReuseCount: 4,
      slotMinimumPrefixTokenCount: 10,
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
  assert.equal(receipt.reranker.slotSelectionMode, 'ambiguous-model-rerank');

  const exactEmbeddingSlots = structuredClone(report);
  Object.assign(exactEmbeddingSlots.results[0].modelExecutionReceipt.phase3Rerank, {
    promptPrefixStateReuseCount: 0,
    promptEmbeddingSlotCount: 5,
    modelEvidenceSlotCount: 5,
    slotRerankCallCount: 0,
    slotCandidateInputCount: 0,
    slotCandidateOutputCount: 0,
    slotScoringPaths: [],
    slotSelectedTokenLogitCount: 0,
    slotPrefixKvReuseCount: 0,
    slotPrefixStateReuseCount: 0,
    slotMinimumPrefixTokenCount: 0,
  });
  const exactReceipt = validateVendorInferenceReport(exactEmbeddingSlots, lock, 'lock-hash');
  assert.equal(exactReceipt.reranker.slotSelectionMode, 'exact-model-embedding');

  const unevaluatedSlots = structuredClone(exactEmbeddingSlots);
  unevaluatedSlots.results[0].modelExecutionReceipt.phase3Rerank.modelEvidenceSlotCount = 0;
  assert.throws(
    () => validateVendorInferenceReport(unevaluatedSlots, lock, 'lock-hash'),
    /neither reranked ambiguous slots nor proved exact model-embedded construction slots/
  );

  const configOnly = structuredClone(report);
  configOnly.results[0].modelExecutionReceipt.rerankerProbeCount = 0;
  assert.throws(
    () => validateVendorInferenceReport(configOnly, lock, 'lock-hash'),
    /real reranker probe did not execute/
  );

  const fullLogitFallback = structuredClone(report);
  fullLogitFallback.results[0].modelExecutionReceipt.phase3Rerank.promptScoringPaths = ['full-logits'];
  assert.throws(
    () => validateVendorInferenceReport(fullLogitFallback, lock, 'lock-hash'),
    /prompt reranking did not exclusively use prefix-selected-token logits/
  );

  const overlappingLoad = structuredClone(report);
  overlappingLoad.results[0].modelExecutionReceipt.modelPreparation.loadOrder[1].overlap = true;
  assert.throws(
    () => validateVendorInferenceReport(overlappingLoad, lock, 'lock-hash'),
    /reranker overlapped another model operation/
  );

  const missingCacheState = structuredClone(report);
  missingCacheState.results[0].modelExecutionReceipt.rerankerCacheState = '';
  assert.throws(
    () => validateVendorInferenceReport(missingCacheState, lock, 'lock-hash'),
    /cache state is missing/
  );
});
