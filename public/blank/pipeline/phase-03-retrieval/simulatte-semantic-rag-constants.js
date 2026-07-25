(function attachSimulatteSemanticRagconstants(root) {
  const scope = root.SimulattePhaseModuleRegistry.family('semanticRag');

    const {
        PHYSICAL_PRIMITIVES,
        TOKEN_SYNONYMS,
        clamp,
        hashNoise,
        primitiveText,
        uniqueList,
      } = scope.catalog;

    const SEMANTIC_RAG_SCHEMA = 'simulatte.semanticRag.v1';

    const SYNTH_GRAPH_SCHEMA = 'simulatte.synthGraph.v1';

    const FEATURE_DIM = 384;

    const FEATURE_MODEL_ID = 'simulatte-semantic-feature-v1';

    const MODEL_VECTOR_SPACE = 'qwen-model-embedding';

    const LOCAL_VECTOR_SPACE = 'simulatte-local-hashed-features';

    const TOKEN_RE = /[a-z0-9][a-z0-9'-]*/g;

    root.SimulattePhaseModuleRegistry.define('semanticRag', 'simulatte-semantic-rag-constants.js', {
      PHYSICAL_PRIMITIVES,
      TOKEN_SYNONYMS,
      clamp,
      hashNoise,
      primitiveText,
      uniqueList,
      SEMANTIC_RAG_SCHEMA,
      SYNTH_GRAPH_SCHEMA,
      FEATURE_DIM,
      FEATURE_MODEL_ID,
      MODEL_VECTOR_SPACE,
      LOCAL_VECTOR_SPACE,
      TOKEN_RE,
    });

})(typeof globalThis !== 'undefined' ? globalThis : window);
