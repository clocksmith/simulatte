(function attachSimulatteIntentEmbedderManifestLoader(root) {
  const scope = root.SimulattePhaseModuleRegistry.family('intentEmbedder');

  async function loadClassificationPolicy(owner) {
    const manifest = await owner.loadManifest();
    const policy = manifest.classification;
    if (!policy || policy.schema !== 'simulatte.classificationTierPolicy.v1') {
      throw new Error('intent manifest classification policy is required');
    }
    const artifact = root.SimulatteCompactClassifierArtifact;
    const lockedArtifact = policy.artifact || {};
    if (!artifact || artifact.id !== lockedArtifact.id) {
      throw new Error('loaded compact classifier artifact does not match the classification policy');
    }
    return Object.freeze({
      schema: 'simulatte.classificationPolicyLoad.v1',
      lockNumber: Number(manifest.modelRuntimeLock && manifest.modelRuntimeLock.number || 0),
      policy,
      calibration: null,
      artifactId: artifact.id,
      modelDownloaded: false,
    });
  }

  async function loadIntentManifestUncached(owner) {
    const rawManifest = await scope.fetchJson(
      scope.versionedAssetUrl(owner.manifestUrl, owner.assetVersionQuery),
      'intent manifest',
      {
        progress: owner.onProgress,
        traceEnabled: owner.traceEnabled,
        traceId: owner.traceId,
        stage: 'manifest-fetch',
        percent: 4,
        resourceKind: 'intent-manifest',
      }
    );
    const manifest = await scope.resolvePinnedModelManifest(rawManifest, owner.manifestUrl, {
      progress: owner.onProgress,
      traceEnabled: owner.traceEnabled,
      traceId: owner.traceId,
      assetVersionQuery: owner.assetVersionQuery,
    });
    validateIntentManifest(manifest);
    return manifest;
  }

  function validateIntentManifest(manifest) {
    if (!manifest.retrieval || manifest.retrieval.kind !== 'precomputed-primitive-index') {
      throw new Error('intent manifest retrieval must be a precomputed primitive index');
    }
    if (manifest.retrieval.rerank !== 'deterministic-until-qualified-model') {
      throw new Error('intent manifest retrieval must use deterministic reranking until a model is qualified');
    }
    const reranker = scope.rerankerConfig(manifest);
    if (reranker.enabled && reranker.schema !== 'simulatte.intentRerankerConfig.v1') {
      throw new Error('intent manifest reranker schema mismatch; expected simulatte.intentRerankerConfig.v1');
    }
    if (reranker.enabled && reranker.phase !== 3) {
      throw new Error('intent manifest reranker.phase must be 3');
    }
    if (reranker.enabled && reranker.executeInPhase !== 3) {
      throw new Error('intent manifest reranker.executeInPhase must be 3');
    }
    if (reranker.enabled && reranker.inputSchema !== 'simulatte.intentRerankInput.v1') {
      throw new Error('intent manifest reranker.inputSchema must be simulatte.intentRerankInput.v1');
    }
    if (reranker.enabled && reranker.outputSchema !== 'simulatte.intentRerank.v1') {
      throw new Error('intent manifest reranker.outputSchema must be simulatte.intentRerank.v1');
    }
    if (!manifest.embedModel || !manifest.embedModel.id) {
      throw new Error('intent manifest embedModel.id is required');
    }
    const dimensions = Number(manifest.embedModel.dimensions);
    if (!Number.isFinite(dimensions) || dimensions <= 0) {
      throw new Error('intent manifest embedModel.dimensions must be a positive number');
    }
    if (Number(manifest.retrieval.dimensions) !== dimensions) {
      throw new Error('intent manifest retrieval dimensions must match embedModel.dimensions');
    }
    if (manifest.retrieval.cards) {
      if (manifest.retrieval.cards.kind !== 'precomputed-surface-card-index') {
        throw new Error('intent manifest card retrieval must be a precomputed surface card index');
      }
      if (Number(manifest.retrieval.cards.dimensions) !== dimensions) {
        throw new Error('intent manifest card retrieval dimensions must match embedModel.dimensions');
      }
      if (manifest.retrieval.cards.rerank !== 'deterministic-until-qualified-model') {
        throw new Error('intent manifest card retrieval must use deterministic reranking until a model is qualified');
      }
    }
    if (manifest.retrieval.universe && Number(manifest.retrieval.universe.dimensions) !== dimensions) {
      throw new Error('intent manifest universe retrieval dimensions must match embedModel.dimensions');
    }
    if (!manifest.embedModel.defaultModelBaseUrl) {
      throw new Error('intent manifest embedModel.defaultModelBaseUrl is required');
    }
    if (!scope.hashHex(manifest.embedModel.manifestHash)) {
      throw new Error('intent manifest embedModel.manifestHash is required');
    }
    if (!manifest.runtime || !manifest.runtime.runtimeConfig) {
      throw new Error('intent manifest runtime.runtimeConfig is required');
    }
    if (!manifest.runtime.queryEmbeddingMode) {
      throw new Error('intent manifest runtime.queryEmbeddingMode is required');
    }
    const embeddingText = manifest.runtime.embeddingText || {};
    if (embeddingText.schema && embeddingText.schema !== 'simulatte.embeddingTextContract.v1') {
      throw new Error('intent manifest runtime.embeddingText.schema must be simulatte.embeddingTextContract.v1');
    }
    if (embeddingText.queryPrefix != null && typeof embeddingText.queryPrefix !== 'string') {
      throw new Error('intent manifest runtime.embeddingText.queryPrefix must be a string');
    }
    if (embeddingText.documentPrefix != null && typeof embeddingText.documentPrefix !== 'string') {
      throw new Error('intent manifest runtime.embeddingText.documentPrefix must be a string');
    }
    if (reranker.enabled && reranker.required && reranker.loadInPhase1WhenRequired !== false) {
      const model = reranker.model || {};
      if (!model.id || !model.defaultModelBaseUrl || !scope.hashHex(model.manifestHash)) {
        throw new Error('required intent reranker must declare model.id, defaultModelBaseUrl, and manifestHash');
      }
    }
    return manifest;
  }

  root.SimulattePhaseModuleRegistry.define(
    'intentEmbedder',
    'simulatte-intent-embedder-manifest-loader.js',
    {
      loadClassificationPolicy,
      loadIntentManifestUncached,
      validateIntentManifest,
    }
  );
})(typeof globalThis !== 'undefined' ? globalThis : window);
