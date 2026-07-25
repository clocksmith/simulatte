(function attachSimulatteSemanticRag(root) {
  if (typeof module === 'object' && module.exports) {
    require('./simulatte-semantic-rag-dependencies.js');
    require('./simulatte-semantic-rag-constants.js');
    require('./simulatte-semantic-rag-helpers.js');
    require('./simulatte-semantic-rag-surface-cards.js');
    require('./simulatte-semantic-rag-grounding-cards.js');
    require('./simulatte-semantic-rag-lexical-construction.js');
    require('./simulatte-semantic-rag-retrieval.js');
  }
  const scope = root.SimulattePhaseModuleRegistry.family('semanticRag');
  const api = {
    FEATURE_DIM: scope.FEATURE_DIM,
    FEATURE_MODEL_ID: scope.FEATURE_MODEL_ID,
    GROUNDING_BASIS_CARDS: scope.GROUNDING_BASIS_CARDS,
    SEMANTIC_RAG_SCHEMA: scope.SEMANTIC_RAG_SCHEMA,
    SEMANTIC_SURFACE_CARDS: scope.SEMANTIC_SURFACE_CARDS,
    SYNTH_GRAPH_SCHEMA: scope.SYNTH_GRAPH_SCHEMA,
    buildPrimitiveProgram: scope.buildPrimitiveProgram,
    buildSemanticFeatureVector: scope.buildSemanticFeatureVector,
    createDeterministicSlotRetrieval: scope.createDeterministicSlotRetrieval,
    createPrototypeSlotRetrieval: scope.createPrototypeSlotRetrieval,
    createSemanticRag: scope.createSemanticRag,
  };
  root.SimulattePhaseModuleRegistry.finalize('semanticRag', {
    requiredExports: Object.keys(api),
  });
  Object.freeze(api);
  if (typeof module === 'object' && module.exports) {
      module.exports = api;
    }
  root.SimulatteSemanticRag = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
