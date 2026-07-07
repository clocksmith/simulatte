(function attachSimulatteSemanticRag(root) {
  if (typeof module === 'object' && module.exports) {
    require('./simulatte-semantic-rag-dependencies.js');
    require('./simulatte-semantic-rag-constants.js');
    require('./simulatte-semantic-rag-helpers.js');
    require('./simulatte-semantic-rag-surface-cards.js');
    require('./simulatte-semantic-rag-grounding-cards.js');
    require('./simulatte-semantic-rag-retrieval.js');
  }
  const scope = root.__SimulatteSemanticRagRefactorScope = root.__SimulatteSemanticRagRefactorScope || {};
  if (scope.missingDependency) return;
  let api;
  with (scope) {
    api = {
    FEATURE_DIM,
    FEATURE_MODEL_ID,
    GROUNDING_BASIS_CARDS,
    SEMANTIC_RAG_SCHEMA,
    SEMANTIC_SURFACE_CARDS,
    SYNTH_GRAPH_SCHEMA,
    buildPrimitiveProgram,
    buildSemanticFeatureVector,
    createSemanticRag,
  };
  }
  if (typeof module === 'object' && module.exports) {
      module.exports = api;
    }
  root.SimulatteSemanticRag = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
