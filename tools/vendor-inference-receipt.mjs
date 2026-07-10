import crypto from 'node:crypto';

function requireValue(condition, message) {
  if (!condition) throw new Error(`vendor inference receipt invalid: ${message}`);
}

function hashHex(value) {
  if (typeof value === 'string') return value;
  return value && typeof value.hex === 'string' ? value.hex : '';
}

export function modelRuntimeLockHashFromText(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

export function validateVendorInferenceReport(report, modelRuntimeLock, modelRuntimeLockHash) {
  requireValue(report && report.schema === 'simulatte.intentSceneScreenshotAudit.v1', 'audit report schema is missing');
  requireValue(report.intentMode === 'model', 'audit did not run in model mode');
  requireValue(report.summary && report.summary.ok === true, 'browser audit did not pass');
  requireValue(Array.isArray(report.results) && report.results.length === 1, 'lane must produce exactly one prompt result');

  const result = report.results[0];
  const execution = result.modelExecutionReceipt || {};
  const lockReceipt = execution.modelRuntimeLock || {};
  const phase3 = execution.phase3Rerank || {};
  const expectedEmbedding = modelRuntimeLock.embedding || {};
  const expectedReranker = modelRuntimeLock.reranker || {};
  const expectedRerankerModel = expectedReranker.model || {};

  requireValue(execution.schema === 'simulatte.modelExecutionAuditReceipt.v1', 'model execution receipt is missing');
  requireValue(execution.ready === true && execution.providerReady === true, 'embedding provider was not ready');
  requireValue(execution.noFallback === true, 'model execution used a fallback');
  requireValue(Boolean(execution.providerBackend), 'embedding backend is missing');
  requireValue(lockReceipt.id === modelRuntimeLock.id, 'runtime lock id differs from the canonical lock');
  requireValue(Number(lockReceipt.number) === Number(modelRuntimeLock.number), 'runtime lock number differs from the canonical lock');
  requireValue(hashHex(lockReceipt.artifactHash) === modelRuntimeLockHash, 'runtime lock hash differs from the canonical lock');
  requireValue(execution.embeddingModelId === expectedEmbedding.id, 'embedding model id differs from the lock');
  requireValue(execution.embeddingModelHash === hashHex(expectedEmbedding.manifestHash), 'embedding manifest hash differs from the lock');
  requireValue(execution.embeddingDim === Number(expectedEmbedding.dimensions), 'embedding dimensions differ from the lock');
  requireValue(execution.embeddingProbe === true && execution.embeddingProbeCount > 0, 'real embedding probe did not execute');
  requireValue(execution.embeddingProbeDim === Number(expectedEmbedding.dimensions), 'embedding probe dimensions are wrong');
  requireValue(execution.embeddingStabilitySimilarity > 0, 'embedding stability receipt is missing');
  requireValue(execution.embeddingDistinctProbePairs > 0, 'embedding diversity probe receipt is missing');
  requireValue(execution.rerankerId === expectedReranker.id, 'reranker contract id differs from the lock');
  requireValue(execution.rerankerModelId === expectedRerankerModel.id, 'reranker model id differs from the lock');
  requireValue(execution.rerankerModelHash === hashHex(expectedRerankerModel.manifestHash), 'reranker manifest hash differs from the lock');
  requireValue(execution.rerankerRequired === true, 'reranker was not required');
  requireValue(execution.rerankerReady === true && execution.rerankerStatus === 'ready', 'reranker was not ready');
  requireValue(Boolean(execution.rerankerBackend), 'reranker backend is missing');
  requireValue(execution.rerankerProbeCount > 0, 'real reranker probe did not execute');
  requireValue(execution.rerankerProbeCandidateCount > 0, 'reranker probe had no candidates');
  requireValue(execution.rerankerProbeOutputCount > 0, 'reranker probe returned no candidates');
  requireValue(phase3.modelReady === true && phase3.modelRequired === true, 'Phase 3 did not require and execute the reranker');
  requireValue(phase3.modelStatus === 'ready' && Boolean(phase3.modelBackend), 'Phase 3 reranker backend was not ready');
  requireValue(phase3.candidateInputCount > 0 && phase3.candidateOutputCount > 0, 'Phase 3 reranker did not rank prompt candidates');
  requireValue(result.sceneProofVerdict === 'pass', 'scene proof did not pass');
  requireValue(result.phase7PixelProofStatus === 'pass', 'pixel proof did not pass');

  return {
    schema: 'simulatte.vendorInferenceLaneReceipt.v1',
    createdAt: report.createdAt || '',
    status: 'pass',
    prompt: result.prompt || '',
    modelRuntimeLock: {
      id: modelRuntimeLock.id,
      number: Number(modelRuntimeLock.number),
      sha256: modelRuntimeLockHash,
    },
    dopplerPackage: modelRuntimeLock.doppler && modelRuntimeLock.doppler.package || null,
    embedding: {
      modelId: execution.embeddingModelId,
      manifestHash: execution.embeddingModelHash,
      dimensions: execution.embeddingDim,
      backend: execution.providerBackend,
      probeCount: execution.embeddingProbeCount,
      stabilitySimilarity: execution.embeddingStabilitySimilarity,
      distinctProbePairs: execution.embeddingDistinctProbePairs,
    },
    reranker: {
      contractId: execution.rerankerId,
      modelId: execution.rerankerModelId,
      manifestHash: execution.rerankerModelHash,
      backend: execution.rerankerBackend,
      probeCount: execution.rerankerProbeCount,
      promptBackend: phase3.modelBackend,
      candidateInputCount: phase3.candidateInputCount,
      candidateOutputCount: phase3.candidateOutputCount,
      slotRerankCallCount: phase3.slotRerankCallCount,
    },
    browserProof: {
      sceneProofVerdict: result.sceneProofVerdict,
      pixelProofStatus: result.phase7PixelProofStatus,
      renderer: result.physicsCanvasRenderer || '',
      rendererStatus: result.physicsCanvasRendererStatus || '',
    },
    sourceReport: 'report.json',
  };
}
