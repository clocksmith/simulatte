(function attachSimulatteIntentEmbedder(root) {
  if (typeof module === 'object' && module.exports) {
    require('../../../data/simulatte-compact-classifiers.js');
    require('./simulatte-compact-classifier-runtime.js');
    require('./simulatte-bounded-classification-requests.js');
    require('./simulatte-classification-tier-router.js');
    require('./simulatte-intent-embedder-bounded-classification.js');
    require('./simulatte-conditional-reranking.js');
    require('./simulatte-intent-embedder-dependencies.js');
    require('./simulatte-intent-embedder-constants.js');
    require('./simulatte-intent-embedder-model-lock.js');
    require('./simulatte-intent-embedder-model-cache.js');
    require('./simulatte-intent-embedder-runtime-class.js');
    require('./simulatte-intent-embedder-runtime-probes.js');
    require('./simulatte-intent-embedder-construction-retrieval.js');
    require('./simulatte-intent-embedder-span-retrieval.js');
    require('./simulatte-intent-embedder-slot-retrieval.js');
    require('./simulatte-intent-embedder-rerank-runtime.js');
    require('./simulatte-intent-embedder-manifest-cache.js');
    require('./simulatte-intent-embedder-rerank.js');
    require('./simulatte-intent-embedder-vectors.js');
    require('./simulatte-intent-embedder-facade-support.js');
  }
  const scope = root.__SimulatteIntentEmbedderRefactorScope = root.__SimulatteIntentEmbedderRefactorScope || {};
  if (scope.missingDependency) return;
  let api;
  with (scope) {
    api = {
    create,
    mergeRagScores,
  };
  }
  if (typeof module === 'object' && module.exports) {
      module.exports = api;
    }
  root.SimulatteIntentEmbedder = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
