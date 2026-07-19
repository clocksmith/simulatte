(function attachSimulatteIntentEmbedderBoundedClassification(root, factory) {
  const requests = typeof module === 'object' && module.exports
    ? require('./simulatte-bounded-classification-requests.js')
    : root.SimulatteBoundedClassificationRequests;
  const router = typeof module === 'object' && module.exports
    ? require('./simulatte-classification-tier-router.js')
    : root.SimulatteClassificationTierRouter;
  const api = factory(requests, router);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteIntentEmbedderBoundedClassification = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createBoundedClassification(requestApi, routerApi) {
  if (!requestApi || !routerApi) throw new Error('Phase 3 bounded classification dependencies are required');

  async function classify(options) {
    const state = options && options.state;
    const runtime = options && options.runtime;
    const provider = options && options.provider;
    const manifest = runtime && runtime.manifest || {};
    const policy = manifest.classification;
    if (!state || !policy || !provider || typeof options.validateEmbedding !== 'function') {
      throw new Error('Phase 3 bounded classification execution dependencies are incomplete');
    }
    if (!state.classificationRouter || state.classificationRouterPolicyId !== policy.id) {
      state.classificationRouter = routerApi.createRouter(policy, {
        'qwen-embedding': embeddingAdapter(provider, options.validateEmbedding),
      });
      state.classificationRouterPolicyId = policy.id;
    }
    const requests = requestApi.buildRequests(
      options.promptText,
      options.languageEvidence,
      options.sceneLanguageGraph || {}
    );
    return state.classificationRouter.classifyMany(requests, {
      selectedTierId: options.classificationTierId || null,
      allowEvaluation: true,
      allowUncalibratedDiagnostics: policy.execution && policy.execution.allowUncalibratedDiagnostics === true,
      modelConsent: true,
      calibration: options.calibration || null,
      embeddingIdentity: embeddingIdentity(runtime),
    });
  }

  function embeddingAdapter(provider, validateEmbedding) {
    return {
      async embedTexts(rows) {
        const results = typeof provider.embedMany === 'function'
          ? await provider.embedMany(rows)
          : await Promise.all(rows.map((row) => provider.embed(row)));
        return results.map(validateEmbedding);
      },
    };
  }

  function embeddingIdentity(runtime) {
    const manifest = runtime && runtime.manifest || {};
    const model = manifest.embedModel || {};
    const embeddingText = manifest.runtime && manifest.runtime.embeddingText || {};
    const embeddingMode = manifest.runtime && manifest.runtime.queryEmbeddingMode || '';
    const modelHash = model.manifestHash && (model.manifestHash.hex || model.manifestHash) || '';
    if (!model.id || !modelHash || !embeddingMode || !embeddingText.schema) {
      throw new Error('Phase 3 classification embedding compatibility identity is incomplete');
    }
    return JSON.stringify({
      modelId: model.id,
      modelHash,
      dimensions: Number(model.dimensions || 0),
      embeddingMode,
      embeddingText,
    });
  }

  return Object.freeze({ classify });
});
