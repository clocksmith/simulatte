(function attachSimulatteSemanticRagconstants(root) {
  const scope = root.__SimulatteSemanticRagRefactorScope;
  if (!scope || scope.missingDependency) return;
  with (scope) {
    const {
        PHYSICAL_PRIMITIVES,
        TOKEN_SYNONYMS,
        clamp,
        hashNoise,
        primitiveText,
        uniqueList,
      } = catalog;

    const SEMANTIC_RAG_SCHEMA = 'simulatte.semanticRag.v1';

    const SYNTH_GRAPH_SCHEMA = 'simulatte.synthGraph.v1';

    const FEATURE_DIM = 384;

    const FEATURE_MODEL_ID = 'simulatte-semantic-feature-v1';

    const MODEL_VECTOR_SPACE = 'qwen-model-embedding';

    const LOCAL_VECTOR_SPACE = 'simulatte-local-hashed-features';

    const TOKEN_RE = /[a-z0-9][a-z0-9'-]*/g;

    Object.assign(scope, {
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
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
