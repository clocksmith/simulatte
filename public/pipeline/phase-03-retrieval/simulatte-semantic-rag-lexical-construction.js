(function attachSimulatteSemanticRagLexicalConstruction(root) {
  const scope = root.__SimulatteSemanticRagRefactorScope;
  if (!scope || scope.missingDependency) return;
  with (scope) {
    const PROTOTYPE_CONSTRUCTION_ROLES = new Set([
      'actor', 'concept', 'object', 'part', 'environment',
    ]);
    const LEXICAL_CONSTRUCTION_STOPS = new Set([
      'a', 'an', 'and', 'artifact', 'body', 'build', 'component', 'construct', 'constructive',
      'entity', 'for', 'from', 'geometry', 'in', 'into', 'material', 'object', 'of', 'on',
      'part', 'scene', 'shape', 'the', 'to', 'with', 'world', 'agent', 'action',
    ]);
    const IRREGULAR_CONSTRUCTION_TOKENS = Object.freeze({
      children: 'child', feet: 'foot', geese: 'goose', leaves: 'leaf', men: 'man',
      mice: 'mouse', people: 'person', teeth: 'tooth', women: 'woman',
    });
    const MAX_POSTING_TERMS = 6;
    const MAX_SCORED_CARDS = 96;
    const MAX_SLOT_CANDIDATES = 3;
    let lexicalConstructionIndexCache = null;

    function createPrototypeSlotRetrieval(queryPlan = {}, promptText = '') {
      const index = lexicalConstructionIndex();
      const bySlot = [];
      let postingVisits = 0;
      let scoredCardCount = 0;
      let exactLabelHitCount = 0;
      for (const slot of queryPlan.slots || []) {
        if (!prototypeConstructionSlot(slot)) continue;
        const result = prototypeConstructionCandidates(slot, index);
        postingVisits += result.postingVisits;
        scoredCardCount += result.scoredCardCount;
        exactLabelHitCount += result.exactLabelHitCount;
        if (!result.candidates.length && slot.slotRole === 'concept') continue;
        bySlot.push(prototypeSlotRow(slot, promptText, result));
      }
      const evidenceRows = bySlot.flatMap((row) => row.candidates.map((candidate) => ({
        ...candidate,
        slotId: row.slotId,
        slotRole: row.slotRole,
        entryId: row.entryId,
        retrievalKind: 'prototype-lexical-construction',
        evidence: [row.slotId, candidate.candidateId].filter(Boolean),
      })));
      return {
        schema: 'simulatte.phase3SlotRetrieval.v1',
        queryPlanSchema: queryPlan.schema || '',
        sourcePromptHash: queryPlan.sourcePromptHash || '',
        model: '',
        mode: 'prototype-lexical-construction-index',
        config: {
          schema: 'simulatte.prototypeLexicalConstructionConfig.v1',
          maximumPostingTerms: MAX_POSTING_TERMS,
          maximumScoredCards: MAX_SCORED_CARDS,
          maximumSlotCandidates: MAX_SLOT_CANDIDATES,
        },
        queryPlanSlotCount: (queryPlan.slots || []).length,
        slotCount: bySlot.length,
        embeddedSlotCount: 0,
        localEvidenceSlotCount: bySlot.length,
        rerankCallCount: 0,
        rerankCandidateInputCount: 0,
        rerankCandidateOutputCount: 0,
        rerankScoringPaths: [],
        selectedTokenLogitCount: 0,
        prefixKvReuseCount: 0,
        prefixStateReuseCount: 0,
        selectedTokenExecutionCount: 0,
        scoreCacheHitCount: 0,
        totalExecutionDurationMs: 0,
        maximumExecutionDurationMs: 0,
        minimumPrefixTokenCount: 0,
        bySlot,
        evidenceRows,
        candidateCount: evidenceRows.length,
        acceptedCandidateCount: evidenceRows.length,
        indexReceipt: {
          schema: 'simulatte.prototypeLexicalConstructionIndexReceipt.v1',
          source: 'semantic-surface-card-catalog',
          cardCount: index.docs.length,
          groundingBasisCount: index.basisById.size,
          tokenCount: index.postings.size,
          postingVisits,
          scoredCardCount,
          exactLabelHitCount,
        },
      };
    }

    function prototypeConstructionSlot(slot = {}) {
      const role = String(slot.slotRole || '');
      return PROTOTYPE_CONSTRUCTION_ROLES.has(role);
    }

    function prototypeConstructionCandidates(slot, index) {
      const query = constructionSlotQuery(slot, index);
      const exactIndexes = new Set();
      for (const phrase of query.targetPhrases) {
        for (const cardIndex of index.exactLabels.get(phrase) || []) exactIndexes.add(cardIndex);
      }
      const postingTerms = query.tokens
        .map((token) => ({ token, size: (index.postings.get(token) || []).length }))
        .filter((row) => row.size > 0)
        .sort((a, b) => a.size - b.size || a.token.localeCompare(b.token))
        .slice(0, MAX_POSTING_TERMS);
      const candidateIndexes = new Set(exactIndexes);
      let postingVisits = 0;
      for (const row of postingTerms) {
        for (const cardIndex of index.postings.get(row.token) || []) {
          postingVisits += 1;
          if (candidateIndexes.size < MAX_SCORED_CARDS || exactIndexes.has(cardIndex)) {
            candidateIndexes.add(cardIndex);
          }
        }
      }
      const top = [];
      let scoredCardCount = 0;
      let exactLabelHitCount = 0;
      for (const cardIndex of candidateIndexes) {
        const doc = index.docs[cardIndex];
        const score = constructionCardScore(slot, query, doc, index, exactIndexes.has(cardIndex));
        if (!score) continue;
        scoredCardCount += 1;
        if (score.exactLabel) exactLabelHitCount += 1;
        insertConstructionTopK(top, constructionCandidate(slot, doc.card, score, index), MAX_SLOT_CANDIDATES);
      }
      return { candidates: top, postingVisits, scoredCardCount, exactLabelHitCount };
    }

    function constructionSlotQuery(slot, index) {
      const entryTarget = normalizeConstructionPhrase(String(slot.entryId || '')
        .replace(/^[a-z]+:/, '').replace(/:\d+$/, '').replace(/[_:]+/g, ' '));
      const sourceLabel = normalizeConstructionPhrase(slot.sourceLabel || '');
      const visualArchetype = normalizeConstructionPhrase(slot.visualArchetype || '');
      const shapeHints = (slot.shapeHints || []).map(normalizeConstructionPhrase).filter(Boolean);
      const targetPhrases = uniqueConstructionStrings([entryTarget, sourceLabel]);
      const contextPhrases = uniqueConstructionStrings([
        ...targetPhrases,
        visualArchetype,
        ...shapeHints,
        normalizeConstructionPhrase(slot.semanticClass || ''),
        ...(slot.queries || []).filter((row) => row && row.kind === 'lexical')
          .map((row) => normalizeConstructionPhrase(row.text || '')),
      ]);
      const targetTokens = constructionTokens(targetPhrases.join(' '));
      const tokens = uniqueConstructionStrings(contextPhrases.flatMap(constructionTokens))
        .filter((token) => index.postings.has(token));
      return { targetPhrases, contextPhrases, targetTokens, tokens };
    }

    function constructionCardScore(slot, query, doc, index, exactLabel) {
      const roleFit = constructionRoleFit(slot.slotRole, doc.card.type, exactLabel);
      if (roleFit <= 0) return null;
      // A single noun cannot justify a wider multi-word construction family. Exact
      // labels keep "network" from selecting "fluid network" and "arm" from
      // selecting "robot arm" while multi-token queries can still use coverage.
      if (!exactLabel && query.targetTokens.length < 2) return null;
      const targetWeight = constructionTokenWeight(query.targetTokens, index);
      const queryWeight = constructionTokenWeight(query.tokens, index);
      const labelTargetWeight = constructionIntersectionWeight(query.targetTokens, doc.labelTokens, index);
      const documentQueryWeight = constructionIntersectionWeight(query.tokens, doc.tokens, index);
      const targetCoverage = targetWeight > 0 ? labelTargetWeight / targetWeight : 0;
      const queryCoverage = queryWeight > 0 ? documentQueryWeight / queryWeight : 0;
      const isTopology = doc.card.type === 'construction-topology';
      if (!exactLabel && targetCoverage < 0.72) return null;
      const score = Math.min(1,
        (exactLabel ? 0.58 : 0) +
        targetCoverage * 0.24 +
        queryCoverage * 0.08 +
        roleFit * 0.07 +
        (isTopology ? 0.03 : 0)
      );
      if (score < 0.34) return null;
      return {
        score: Number(score.toFixed(4)),
        exactLabel,
        targetCoverage: Number(targetCoverage.toFixed(4)),
        queryCoverage: Number(queryCoverage.toFixed(4)),
        roleFit: Number(roleFit.toFixed(4)),
      };
    }

    function constructionRoleFit(role = '', type = '', exactLabel = false) {
      if (type === 'construction-topology') return 1;
      if (role === 'actor') return /^(entity|entity_class)$/.test(type) ? 1 : 0;
      if (role === 'object') return /^(entity|artifact|entity_class)$/.test(type) ? 1 : 0;
      if (role === 'environment') return type === 'environment' ? 1 : 0;
      if (role === 'part') return exactLabel && /^(entity|artifact|entity_class)$/.test(type) ? 0.82 : 0;
      if (role === 'concept') {
        return exactLabel && /^(entity|artifact|entity_class|environment)$/.test(type) ? 0.9 : 0;
      }
      return 0;
    }

    function constructionCandidate(slot, card, score, index) {
      const groundingIds = uniqueConstructionStrings(card.groundingIds || []);
      const bases = groundingIds.map((id) => index.basisById.get(id)).filter(Boolean);
      const sourcePartHints = uniqueConstructionStrings(card.partHints || []);
      const basisPartHints = uniqueConstructionStrings(bases.flatMap((basis) => basis.parts || []));
      const construction = {
        schema: 'simulatte.constructionEvidence.v1',
        targetEntryId: slot.entryId || '',
        sourceCardId: card.id,
        sourceType: card.type || '',
        sourceLabel: card.labels && card.labels[0] || '',
        classHints: uniqueConstructionStrings(card.classHints || []),
        partHints: uniqueConstructionStrings([...sourcePartHints, ...basisPartHints]),
        sourcePartHints,
        basisPartHints,
        shapeHints: uniqueConstructionStrings(card.shapeHints || []),
        materialHints: uniqueConstructionStrings([
          ...(card.materialHints || []),
          ...bases.flatMap((basis) => basis.materials || []),
        ]),
        behaviorHints: uniqueConstructionStrings(card.behaviorHints || []),
        affordanceHints: uniqueConstructionStrings(card.affordanceHints || []),
        relationHints: uniqueConstructionStrings([
          ...(card.relationHints || []),
          ...(slot.relationIds || []),
        ]),
        scaleHints: uniqueConstructionStrings(card.scaleHints || []),
        groundingIds,
        basisIds: bases.map((basis) => basis.id),
      };
      return {
        id: card.id,
        candidateId: card.id,
        candidateType: 'surface-card',
        cardId: card.id,
        canonicalId: card.id,
        label: construction.sourceLabel,
        labels: (card.labels || []).slice(),
        candidateText: [construction.sourceLabel, card.description || ''].filter(Boolean).join(': '),
        source: 'phase3-prototype-lexical-construction-index',
        indexName: 'semantic-surface-card-lexical-index',
        semanticType: card.type || '',
        score: score.score,
        lexicalScore: score.score,
        modelScore: null,
        modelEvaluated: false,
        modelRerankEvaluated: false,
        literalSlotMatch: score.exactLabel,
        constructionEvidence: true,
        identityEvidence: false,
        supportOnly: false,
        construction,
        rankSignals: {
          exactLabel: score.exactLabel,
          targetCoverage: score.targetCoverage,
          queryCoverage: score.queryCoverage,
          roleFit: score.roleFit,
        },
        reason: 'bounded lexical construction evidence for explicit prototype mode; no model or reranker executed',
      };
    }

    function prototypeSlotRow(slot, promptText, result) {
      return {
        schema: 'simulatte.phase3ModelSlotRetrievalRow.v1',
        slotId: slot.slotId || '',
        slotRole: slot.slotRole || '',
        entryId: slot.entryId || '',
        required: slot.required !== false,
        queryText: [slot.sourceLabel || slot.entryId || '', promptText ? `scene:${promptText}` : '']
          .filter(Boolean).join(' | '),
        vectorHash: '',
        primitiveRankBackend: 'prototype-lexical-construction-index',
        rerankerMode: 'not-run-prototype-lexical',
        rerankerModelReady: false,
        candidates: result.candidates,
        acceptedCandidates: result.candidates,
        constructionCandidates: result.candidates,
        supportOnlyCandidates: [],
        receipt: {
          schema: 'simulatte.phase3SlotRerankReceipt.v1',
          rerankerMode: 'not-run-prototype-lexical',
          modelReady: false,
          modelStatus: 'not-run',
          skipReason: 'explicit-prototype-lexical-control-lane',
          candidateInputCount: 0,
          candidateOutputCount: 0,
          localCandidateCount: result.candidates.length,
          postingVisits: result.postingVisits,
          scoredCardCount: result.scoredCardCount,
        },
      };
    }

    function lexicalConstructionIndex() {
      if (lexicalConstructionIndexCache) return lexicalConstructionIndexCache;
      const basisById = new Map((GROUNDING_BASIS_CARDS || []).map((card) => [card.id, card]));
      const exactLabels = new Map();
      const postings = new Map();
      const docs = (SEMANTIC_SURFACE_CARDS || []).map((card, index) => {
        const normalizedLabels = uniqueConstructionStrings((card.labels || []).map(normalizeConstructionPhrase));
        const labelTokens = new Set(normalizedLabels.flatMap(constructionTokens));
        const tokens = new Set(constructionTokens([
          card.id,
          ...(card.labels || []),
          card.description,
          ...(card.classHints || []),
          ...(card.shapeHints || []),
          ...(card.partHints || []),
          ...(card.materialHints || []),
          ...(card.behaviorHints || []),
          ...(card.affordanceHints || []),
          ...(card.relationHints || []),
          ...(card.scaleHints || []),
        ].filter(Boolean).join(' ')));
        for (const label of normalizedLabels) appendPosting(exactLabels, label, index);
        for (const token of tokens) appendPosting(postings, token, index);
        return { card, normalizedLabels, labelTokens, tokens };
      });
      lexicalConstructionIndexCache = { docs, basisById, exactLabels, postings };
      return lexicalConstructionIndexCache;
    }

    function appendPosting(index, key, value) {
      if (!key) return;
      const rows = index.get(key) || [];
      rows.push(value);
      index.set(key, rows);
    }

    function constructionTokenWeight(tokens, index) {
      return (tokens || []).reduce((sum, token) => sum + constructionTokenIdf(token, index), 0);
    }

    function constructionIntersectionWeight(tokens, candidateTokens, index) {
      return (tokens || []).reduce((sum, token) => (
        sum + (candidateTokens.has(token) ? constructionTokenIdf(token, index) : 0)
      ), 0);
    }

    function constructionTokenIdf(token, index) {
      const frequency = (index.postings.get(token) || []).length;
      return Math.log((index.docs.length + 1) / (frequency + 1)) + 1;
    }

    function insertConstructionTopK(rows, candidate, maximum) {
      let index = 0;
      while (index < rows.length && constructionCandidateOrder(rows[index], candidate) <= 0) index += 1;
      rows.splice(index, 0, candidate);
      if (rows.length > maximum) rows.pop();
    }

    function constructionCandidateOrder(a, b) {
      return Number(b.score || 0) - Number(a.score || 0) ||
        Number(b.literalSlotMatch === true) - Number(a.literalSlotMatch === true) ||
        String(a.candidateId || '').localeCompare(String(b.candidateId || ''));
    }

    function normalizeConstructionPhrase(value = '') {
      return constructionTokens(value).join(' ');
    }

    function constructionTokens(value = '') {
      return String(value || '').toLowerCase().match(/[a-z0-9]+/g)?.map(normalizeConstructionToken)
        .filter((token) => token && !LEXICAL_CONSTRUCTION_STOPS.has(token)) || [];
    }

    function normalizeConstructionToken(token = '') {
      const value = String(token || '').toLowerCase();
      if (IRREGULAR_CONSTRUCTION_TOKENS[value]) return IRREGULAR_CONSTRUCTION_TOKENS[value];
      if (value.endsWith('ies') && value.length > 4) return `${value.slice(0, -3)}y`;
      if (/(ches|shes|xes|zes|sses)$/.test(value) && value.length > 5) return value.slice(0, -2);
      if (value.endsWith('s') && value.length > 3 && !/(ss|us|is)$/.test(value)) return value.slice(0, -1);
      return value;
    }

    function uniqueConstructionStrings(values = []) {
      return Array.from(new Set(values.filter(Boolean).map((value) => String(value))));
    }

    Object.assign(scope, {
      createPrototypeSlotRetrieval,
      lexicalConstructionIndex,
      normalizeConstructionPhrase,
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
