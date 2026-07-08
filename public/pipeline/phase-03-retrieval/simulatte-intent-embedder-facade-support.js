(function attachSimulatteIntentEmbedderfacadesupport(root) {
  const scope = root.__SimulatteIntentEmbedderRefactorScope;
  if (!scope || scope.missingDependency) return;
  with (scope) {
    const EMBEDDING_LOAD_PROGRESS = Object.freeze({ start: 20, end: 72 });

    const RERANKER_LOAD_PROGRESS = Object.freeze({ start: 72, end: 93.8 });

    const TRACE_URL_FLAGS = Object.freeze([
        'embeddingTrace',
        'embeddingTiming',
        'intentTrace',
        'modelTrace',
      ]);

    const PROMPT_RUNTIME_PROBES = Object.freeze([
        { id: 'optical-instrument', text: 'optics bench lens prism sensor prompt runtime probe' },
        { id: 'fluid-biological', text: 'river water swimming biological agents prompt runtime probe' },
        { id: 'network-control', text: 'queue network detector readout flow prompt runtime probe' },
      ]);

    const RERANK_MODEL_BLEND = Object.freeze({ localWeight: 0.35, modelWeight: 0.65 });

    const SLOT_RERANK_MODEL_BLEND = Object.freeze({ localWeight: 0.3, modelWeight: 0.7 });

    const HEURISTIC_FUSION_WEIGHTS = Object.freeze({
        modelScore: 0.58,
        ragScore: 0.16,
        lexicalScore: 0.03,
        symbolicBoost: 0.16,
        dopplerScore: 0.24,
        universeScore: 0.12,
      });

    Object.assign(scope, {
      EMBEDDING_LOAD_PROGRESS,
      RERANKER_LOAD_PROGRESS,
      TRACE_URL_FLAGS,
      PROMPT_RUNTIME_PROBES,
      RERANK_MODEL_BLEND,
      SLOT_RERANK_MODEL_BLEND,
      HEURISTIC_FUSION_WEIGHTS,
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
