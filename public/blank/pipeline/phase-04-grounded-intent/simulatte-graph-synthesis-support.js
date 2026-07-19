(function attachSimulatteGraphSynthesisSupport(root) {
  const semantic = typeof module === 'object' && module.exports
    ? require('../phase-03-retrieval/simulatte-semantic-rag.js')
    : root.SimulatteSemanticRag;
  if (!semantic) {
    throw new Error('SimulatteGraphSynthesis requires SimulatteSemanticRag');
  }

  const api = Object.freeze({
    semantic,
    WORLD_INTENT_SCHEMA: 'simulatte.worldIntent.v1',
    SYNTH_GRAPH_SCHEMA: 'simulatte.synthGraph.v1',
    GROUNDED_GRAPH_SCHEMA: 'simulatte.groundedGraph.v1',
    SYNTHESIS_SCHEMA: 'simulatte.embeddingGuidedGraphSynthesis.v1',
    SURFACE_CARD_SCHEMA: 'simulatte.surfaceCard.v1',
    CARD_INDEX_SCHEMA: 'simulatte.surfaceCardEmbeddingIndex.v1',
    SYNTH_MODEL_ID: 'simulatte.embedding-guided-graph-synthesis.v1',
    clamp01(value) {
      return Math.max(0, Math.min(1, Number(value) || 0));
    },
    uniqueList(values) {
      return Array.from(new Set((values || []).filter((value) => value !== undefined && value !== null)));
    },
    escapeRegExp(value) {
      return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    },
  });

  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteGraphSynthesisSupport = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
