(function attachAutonomyFeatureRetrieval(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteAutonomyFeatureRetrieval = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createAutonomyFeatureRetrieval() {
  const MAX_SELECTED_CARDS = 5;
  const MAX_POSTING_ROWS = 256;

  function retrieveAndRerankFeatures({ featureCatalog, mission, state, route, worldModel }) {
    const queries = buildQueries({ mission, state, route, worldModel });
    const cardsById = new Map(featureCatalog.cards.map((card) => [card.id, { ...card, searchTerms: card.searchTerms || [] }]));
    const candidateReceipt = retrieveCandidates(featureCatalog.index, queries, cardsById, worldModel.world.id);
    const candidateIds = candidateReceipt.cardIds;
    const candidateRows = candidateIds.map((id) => scoreCard(cardsById.get(id), queries));
    const retrieved = candidateRows.filter((row) => row.lexicalScore > 0 || row.referenceScore > 0)
      .sort((left, right) => right.retrievalScore - left.retrievalScore || left.cardId.localeCompare(right.cardId));
    const weights = featureCatalog.rerankerPolicy.weights;
    const reranked = retrieved.map((row) => ({
      ...row,
      rerankScore: round(row.retrievalScore
        + row.kindScore * weights.kindMatch
        + row.constraintScore * weights.constraintMatch
        + row.referenceScore * weights.exactReference),
    })).sort((left, right) => right.rerankScore - left.rerankScore || left.cardId.localeCompare(right.cardId));
    const selected = reranked.slice(0, MAX_SELECTED_CARDS);
    return {
      schema: 'simulatte.autonomyFeatureRetrieval.v2',
      method: 'deterministic_lexical_inverted_scan_v1',
      reranker: 'typed_evidence_reranker_v1',
      modelExecution: {
        embedding: { executed: false, modelId: null },
        neuralReranker: { executed: false, modelId: null },
        sharedModelRegistryPath: '/data/simulatte-embedder/model-runtime-lock.json',
        registryScope: 'blank_compiler_only',
        claimBoundary: 'This navigation decision used lexical retrieval and typed deterministic reranking. It did not execute an embedding model or neural reranker.',
      },
      queryRows: queries,
      retrievedRows: retrieved,
      rerankedRows: reranked,
      selectedCardIds: selected.map((row) => row.cardId),
      counts: {
        queryCount: queries.length,
        catalogCount: featureCatalog.cards.length,
        indexCandidateCount: candidateIds.length,
        lookedUpTokenCount: candidateReceipt.lookedUpTokenCount,
        skippedPostingCount: candidateReceipt.skippedPostingCount,
        retrievedCount: retrieved.length,
        rerankedCount: reranked.length,
        selectedCount: selected.length,
      },
      scoreFormula: {
        retrieval: 'lexical_overlap + exact_reference * 8',
        rerank: `retrieval + kind_match * ${weights.kindMatch} + constraint_match * ${weights.constraintMatch} + exact_reference * ${weights.exactReference}`,
      },
      deterministicTieBreak: 'card_id_ascending',
    };
  }

  function retrieveCandidates(index, queries, cardsById = null, worldId = null) {
    const ids = new Set();
    const lookedUpTokens = new Set();
    let skippedPostingCount = 0;
    queries.forEach((query) => {
      query.referencedCardIds.forEach((id) => ids.add(id));
      query.tokens.forEach((token) => {
        lookedUpTokens.add(token);
        const postings = index.tokenToCardIds[token] || [];
        if (postings.length <= MAX_POSTING_ROWS) postings.forEach((id) => ids.add(id));
        else skippedPostingCount += 1;
      });
    });
    const cardIds = [...ids].filter((id) => {
      if (!cardsById) return true;
      const card = cardsById?.get(id);
      return card && (!card.provenance.worldId || card.provenance.worldId === worldId);
    }).sort();
    return { cardIds, lookedUpTokenCount: lookedUpTokens.size, skippedPostingCount };
  }

  function retrieveCandidateIds(index, queries, cardsById = null, worldId = null) {
    return retrieveCandidates(index, queries, cardsById, worldId).cardIds;
  }

  function buildQueries({ mission, state, route, worldModel }) {
    const rows = [];
    const targetSegmentId = state.currentSegmentId || route.segmentIds[0] || null;
    if (targetSegmentId) {
      const segment = worldModel.segment(targetSegmentId);
      rows.push(queryRow(
        'route-segment',
        [segment.laneType, segment.source?.street, mission.task.type === 'loop' ? 'closed circuit perimeter' : 'bike lane'],
        ['street_segment'],
        segment.cardIds,
        ['mode_eligible', 'network_contained', `${segment.laneType}_lane`]
      ));
      const signal = state.currentNodeId ? worldModel.signalForEntry(state.currentNodeId, targetSegmentId, state.tick) : null;
      if (signal) rows.push(queryRow('traffic-signal', ['signal', signal.state, 'compliance', 'entry'], ['behavior'], signal.cardIds, [signal.state === 'red' ? 'red_blocks_entry' : 'green_allows_entry']));
    }
    const position = worldModel.agentPosition(state);
    const nearbyActors = worldModel.nearbyActors(position, state.tick, 32);
    if (nearbyActors.some((row) => row.type === 'pedestrian')) {
      rows.push(queryRow('nearby-pedestrian', ['pedestrian', 'yield', 'clearance'], ['behavior'], ['behavior.pedestrian-yield'], ['minimum_clearance_hard_gate']));
    }
    const blocked = worldModel.blockedSegmentIds(state.tick);
    if (blocked.length) rows.push(queryRow('blocked-network', ['blocked', 'segment', 'replan', ...blocked], ['behavior'], ['behavior.blocked-segment-replan'], ['blocked_segment_ineligible', 'route_revision_receipted']));
    if (mission.task.type === 'loop') {
      rows.push(queryRow(
        'mission',
        [mission.task.gait, 'loop', 'perimeter', 'distance', mission.grounding.label],
        ['scenario'],
        ['scenario.loop-distance'],
        ['distance_target', 'closed_circuit', 'boundary_grounded']
      ));
    } else {
      rows.push(queryRow('mission', ['delivery', 'arrival', 'parcel', mission.constraints.lanePreference], ['scenario'], ['scenario.delivery-arrival'], ['destination_reached', 'payload_retained']));
    }
    return rows;
  }

  function queryRow(id, values, kinds, referencedCardIds, constraints) {
    return {
      id,
      text: values.filter(Boolean).join(' '),
      tokens: tokenize(values.filter(Boolean).join(' ')),
      kinds,
      referencedCardIds: [...new Set(referencedCardIds || [])].sort(),
      constraints: [...new Set(constraints || [])].sort(),
    };
  }

  function scoreCard(card, queries) {
    const cardTokens = new Set(tokenize([card.id, card.kind, card.label, ...(card.searchTerms || []), ...card.constraints].join(' ')));
    let lexicalScore = 0;
    let referenceScore = 0;
    let kindScore = 0;
    let constraintScore = 0;
    const matchedQueryIds = [];
    const matchedTokens = new Set();
    for (const query of queries) {
      const overlap = query.tokens.filter((token) => cardTokens.has(token));
      const isReferenced = query.referencedCardIds.includes(card.id);
      const kindMatches = query.kinds.includes(card.kind);
      const constraints = query.constraints.filter((constraint) => card.constraints.includes(constraint));
      if (overlap.length || isReferenced || kindMatches && constraints.length) matchedQueryIds.push(query.id);
      overlap.forEach((token) => matchedTokens.add(token));
      lexicalScore += overlap.length;
      if (isReferenced) referenceScore = 1;
      if (kindMatches) kindScore = 1;
      constraintScore += constraints.length;
    }
    return {
      cardId: card.id,
      label: card.label,
      kind: card.kind,
      matchedQueryIds: [...new Set(matchedQueryIds)].sort(),
      matchedTokens: [...matchedTokens].sort(),
      lexicalScore,
      referenceScore,
      kindScore,
      constraintScore,
      retrievalScore: round(lexicalScore + referenceScore * 8),
    };
  }

  function tokenize(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter((token) => token.length > 1);
  }

  function round(value) {
    return Number(value.toFixed(6));
  }

  return { MAX_POSTING_ROWS, MAX_SELECTED_CARDS, buildQueries, retrieveAndRerankFeatures, retrieveCandidateIds, retrieveCandidates, scoreCard, tokenize };
});
