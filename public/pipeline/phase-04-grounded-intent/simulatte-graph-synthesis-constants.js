(function attachSimulatteGraphSynthesisconstants(root) {
  const scope = root.__SimulatteGraphSynthesisRefactorScope;
  if (!scope || scope.missingDependency) return;
  with (scope) {
    const WORLD_INTENT_SCHEMA = 'simulatte.worldIntent.v1';

    const SYNTH_GRAPH_SCHEMA = 'simulatte.synthGraph.v1';

    const GROUNDED_GRAPH_SCHEMA = 'simulatte.groundedGraph.v1';

    const SYNTHESIS_SCHEMA = 'simulatte.embeddingGuidedGraphSynthesis.v1';

    const SURFACE_CARD_SCHEMA = 'simulatte.surfaceCard.v1';

    const CARD_INDEX_SCHEMA = 'simulatte.surfaceCardEmbeddingIndex.v1';

    const SYNTH_MODEL_ID = 'simulatte.embedding-guided-graph-synthesis.v1';

    Object.assign(scope, {
      WORLD_INTENT_SCHEMA,
      SYNTH_GRAPH_SCHEMA,
      GROUNDED_GRAPH_SCHEMA,
      SYNTHESIS_SCHEMA,
      SURFACE_CARD_SCHEMA,
      CARD_INDEX_SCHEMA,
      SYNTH_MODEL_ID,
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
