(function attachSimulattePhysicsModelPhaseRetrievalBoundary(root) {
  const scope = root.SimulattePhaseModuleRegistry.family('physicsModel');

  function assertPhase3RetrievalEvidencePromptHash(retrievalEvidence = {}, expectedHash = '') {
    if (!expectedHash || !retrievalEvidence || typeof retrievalEvidence !== 'object') return;
    const topLevel = String(retrievalEvidence.sourcePromptHash || retrievalEvidence.promptHash || '');
    if (topLevel && topLevel !== expectedHash) {
      throw new Error(`Phase 3 retrieval evidence prompt hash mismatch: expected ${expectedHash}, received ${topLevel}`);
    }
    const rows = [
      ['slotRetrieval', retrievalEvidence.slotRetrieval],
      ['spanRetrieval', retrievalEvidence.spanRetrieval],
      ['queryPlan', retrievalEvidence.queryPlan],
    ];
    for (const [label, row] of rows) {
      const actual = row && row.sourcePromptHash;
      if (actual && actual !== expectedHash) {
        throw new Error(`Phase 3 ${label}.sourcePromptHash mismatch: expected ${expectedHash}, received ${actual}`);
      }
    }
    if (!topLevel && hasPhase3RetrievalPayload(retrievalEvidence)) {
      throw new Error('Phase 3 retrieval evidence sourcePromptHash is required for nonempty retrieval evidence');
    }
  }

  function requiredPhase2Artifact(artifact = {}, key = '') {
    const value = artifact[key];
    if (!value || typeof value !== 'object') {
      throw new Error(`Phase 3 input missing required Phase 2 artifact.${key}`);
    }
    return value;
  }

  function hasPhase3RetrievalPayload(retrievalEvidence = {}) {
    const payloadKeys = [
      'rankedPrimitives', 'primitiveMatches', 'rankedCards', 'cardMatches',
      'rankedUniverseRows', 'universeMatches', 'semanticRag', 'rerank',
      'rerankReceipt', 'dopplerIntent', 'spanRetrieval', 'slotRetrieval',
      'evidenceRows', 'classification', 'synthesis',
    ];
    return payloadKeys.some((key) => {
      const value = retrievalEvidence[key];
      if (Array.isArray(value)) return value.length > 0;
      return Boolean(value && typeof value === 'object' && Object.keys(value).length > 0);
    });
  }

  root.SimulattePhaseModuleRegistry.define('physicsModel', 'simulatte-physics-model-phase-retrieval-boundary.js', {
    assertPhase3RetrievalEvidencePromptHash,
    requiredPhase2Artifact,
    hasPhase3RetrievalPayload,
  });
})(typeof globalThis !== 'undefined' ? globalThis : window);
