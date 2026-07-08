(function attachSimulatteGraphSynthesis(root) {
  if (typeof module === 'object' && module.exports) {
    require('./simulatte-graph-synthesis-dependencies.js');
    require('./simulatte-graph-synthesis-constants.js');
    require('./simulatte-graph-synthesis-helpers.js');
    require('./simulatte-graph-synthesis-surface-cards.js');
    require('./simulatte-graph-synthesis-retrieval.js');
  }
  const scope = root.__SimulatteGraphSynthesisRefactorScope = root.__SimulatteGraphSynthesisRefactorScope || {};
  if (scope.missingDependency) return;
  let api;
  with (scope) {
    api = {
    CARD_INDEX_SCHEMA,
    GROUNDED_GRAPH_SCHEMA,
    SURFACE_CARD_LIBRARY,
    SURFACE_CARD_SCHEMA,
    SYNTHESIS_SCHEMA,
    SYNTH_GRAPH_SCHEMA,
    SYNTH_MODEL_ID,
    WORLD_INTENT_SCHEMA,
    cardText,
    createSurfaceCardDocuments,
    extractSpans,
    groundedPrimitiveRows,
    retrieveSurfaceCards,
    synthesizeWorldIntent,
    validateGroundedGraph,
  };
  }
  if (typeof module === 'object' && module.exports) {
      module.exports = api;
    }
  root.SimulatteGraphSynthesis = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
