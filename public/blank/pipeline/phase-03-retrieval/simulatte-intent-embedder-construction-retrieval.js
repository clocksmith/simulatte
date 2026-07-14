(function attachSimulatteIntentEmbedderConstructionRetrieval(root) {
  const scope = root.__SimulatteIntentEmbedderRefactorScope;
  if (!scope || scope.missingDependency) return;
  const semanticRag = typeof module === 'object' && module.exports
    ? require('./simulatte-semantic-rag.js')
    : root.SimulatteSemanticRag;
  const surfaceCards = semanticRag && semanticRag.SEMANTIC_SURFACE_CARDS || [];
  const groundingCards = semanticRag && semanticRag.GROUNDING_BASIS_CARDS || [];
  const surfaceById = new Map(surfaceCards.map((card) => [card.id, card]));
  const groundingById = new Map(groundingCards.map((card) => [card.id, card]));
  const evidenceTerm = (value = '') => String(value || '').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  const surfaceByLabel = new Map();
  for (const card of surfaceCards) {
    for (const label of card.labels || []) {
      const key = evidenceTerm(label);
      if (!surfaceByLabel.has(key)) surfaceByLabel.set(key, []);
      surfaceByLabel.get(key).push(card);
    }
  }

  with (scope) {
    function slotNeedsModelConstructionEvidence(slot = {}) {
      const role = String(slot.slotRole || '');
      const semanticClass = String(slot.semanticClass || '').toLowerCase();
      if (/(?:^|-)(?:process|state|field|medium|effect|signal)$/.test(semanticClass)) return false;
      return /^(actor|concept|object|part|environment)$/.test(role);
    }

    function slotNeedsModelRetrievalEvidence(slot = {}) {
      const role = String(slot.slotRole || '');
      if (role === 'concept' && slot.required === false) return false;
      if (/^(actor|concept|object|part|environment|medium)$/.test(role)) return true;
      if (role !== 'relation' || slot.required === false) return false;
      if (slot.modelEvidenceRequired === false) return false;
      return !slot.spatialRelation;
    }

    function slotUsesPromptOwnedLocalEvidence(slot = {}) {
      const role = String(slot.slotRole || '');
      const lexicalVisual = role === 'visual' && (slot.queries || []).length > 0 &&
        (slot.queries || []).every((row) => row && row.kind === 'lexical');
      return Boolean(slot.entryId) && (!slotNeedsModelRetrievalEvidence(slot) || lexicalVisual);
    }

    function slotHasPromptOwnedVisualIdentity(slot = {}) {
      return /^(?:actor|object|environment)$/.test(String(slot.slotRole || '')) &&
        /^object-grammar\.[a-z0-9-]+$/.test(String(slot.localGeometryGrammarId || ''));
    }

    function promptOwnedLocalCandidate(slot = {}) {
      const role = String(slot.slotRole || 'object');
      const target = normalizeSpanText(String(slot.entryId || '')
        .replace(/^[a-z]+:/, '').replace(/[_:]+/g, ' '));
      const id = `prompt.${role}.${target.replace(/\s+/g, '-')}`;
      const semanticType = ({
        actor: 'entity', concept: 'entity', object: 'entity', part: 'part', environment: 'environment', medium: 'medium',
        action: 'action', relation: 'relation', visual: 'visual',
      })[role] || 'entity';
      return {
        id,
        candidateId: id,
        candidateType: 'prompt-literal',
        label: target,
        candidateText: target,
        source: 'prompt-typed-slot',
        score: 1,
        localScore: 1,
        lexicalScore: 1,
        modelEvaluated: false,
        rerankEvaluated: false,
        literalSlotMatch: true,
        indexName: 'prompt-typed-slot',
        semanticType,
        semanticClass: slot.semanticClass || '',
        sourceLabel: slot.sourceLabel || target,
        visualArchetype: slot.visualArchetype || '',
        localGeometryGrammarId: slot.localGeometryGrammarId || '',
        shapeHints: slot.shapeHints || [],
        identityEvidence: !/^(?:action|concept|relation|visual)$/.test(role),
        constructionEvidence: false,
        supportOnly: role === 'concept',
        slotId: slot.slotId || '',
        slotRole: role,
        entryId: slot.entryId || '',
      };
    }

    function promptOwnedLocalSlotRow(slot = {}, promptText = '') {
      const candidate = promptOwnedLocalCandidate(slot);
      const skipReason = slotHasPromptOwnedVisualIdentity(slot)
        ? 'phase2-data-owned-visual-identity'
        : 'prompt-owned-local-identity';
      return {
        schema: 'simulatte.phase3ModelSlotRetrievalRow.v1',
        slotId: slot.slotId || '',
        slotRole: candidate.slotRole,
        entryId: slot.entryId || '',
        required: slot.required !== false,
        queryText: slotQueryText(slot, promptText),
        vectorHash: '',
        primitiveRankBackend: 'prompt-owned-local-evidence',
        rerankerMode: 'not-run-local-identity',
        rerankerModelReady: false,
        candidates: [candidate],
        acceptedCandidates: [candidate],
        constructionCandidates: [],
        supportOnlyCandidates: [],
        receipt: {
          schema: 'simulatte.phase3SlotRerankReceipt.v1',
          rerankerMode: 'not-run-local-identity',
          modelReady: false,
          modelStatus: 'not-run',
          skipReason,
          candidateInputCount: 0,
          candidateOutputCount: 0,
          localCandidateCount: 1,
          localGeometryGrammarId: slot.localGeometryGrammarId || '',
        },
      };
    }

    function constructionQueryText(slot = {}, promptText = '') {
      const role = String(slot.slotRole || 'object');
      const target = normalizeSpanText(String(slot.entryId || '').replace(/^[a-z]+:/, ''));
      const relationText = (slot.relationIds || []).join(' ');
      const constructionMode = slotNeedsModelConstructionEvidence(slot);
      return [
        `Scene: ${String(promptText || '').trim()}`,
        `${constructionMode ? 'Construct' : 'Resolve'} the required ${role}: ${target}`,
        constructionMode
          ? 'Retrieve visible parts, shape, articulation, material, affordance, scale, and spatial relationship evidence.'
          : 'Retrieve typed material, process, and relationship evidence.',
        relationText ? `Relations: ${relationText}` : '',
      ].filter(Boolean).join('\n');
    }

    function constructionForCandidate(slot = {}, row = {}) {
      if (!slotNeedsModelConstructionEvidence(slot)) return null;
      const candidateId = row.cardId || row.candidateId || row.id || '';
      const target = evidenceTerm(String(slot.entryId || '').replace(/^[a-z]+:/, ''));
      const labelTerms = uniqueStrings([
        candidateId,
        row.canonicalId,
        row.label,
        ...(row.labels || []),
      ]).map(evidenceTerm).filter(Boolean);
      const exactCards = labelTerms.flatMap((term) => surfaceByLabel.get(term) || []);
      const targetCards = surfaceByLabel.get(target) || [];
      const card = surfaceById.get(candidateId) || exactCards[0] ||
        (row.literalSlotMatch === true ? targetCards[0] : null) || null;
      const directBasisIds = uniqueStrings([
        candidateId,
        row.canonicalId,
        ...(row.primitiveHints || []),
      ]).filter((id) => groundingById.has(id));
      const groundingIds = uniqueStrings([
        ...(card && card.groundingIds || []),
        ...(row.groundingIds || []),
        ...directBasisIds,
      ]);
      const bases = groundingIds.map((id) => groundingById.get(id)).filter(Boolean);
      if (!constructionCandidateCanOwnPhysicalShape(card, row, candidateId, bases)) return null;
      const sourcePartHints = uniqueStrings([
        ...(card && card.partHints || []),
        ...(row.partHints || []),
      ]);
      const basisPartHints = uniqueStrings([
        ...bases.flatMap((basis) => basis.parts || []),
      ]);
      const partHints = uniqueStrings([...sourcePartHints, ...basisPartHints]);
      const shapeHints = uniqueStrings([
        ...(card && card.shapeHints || []),
        ...(row.shapeHints || []),
      ]);
      const classHints = uniqueStrings([
        ...(card && card.classHints || []),
        ...(row.classHints || []),
        ...(row.domains || []),
      ]);
      const materialHints = uniqueStrings([
        ...(card && card.materialHints || []),
        ...(row.materialHints || []),
        ...bases.flatMap((basis) => basis.materials || []),
      ]);
      const behaviorHints = uniqueStrings([
        ...(card && card.behaviorHints || []),
        ...(row.behaviorHints || []),
      ]);
      const affordanceHints = uniqueStrings([
        ...(card && card.affordanceHints || []),
        ...(row.affordanceHints || []),
      ]);
      const relationHints = uniqueStrings([
        ...(card && card.relationHints || []),
        ...(row.relationHints || []),
        ...(slot.relationIds || []),
      ]);
      const scaleHints = uniqueStrings([
        ...(card && card.scaleHints || []),
        ...(row.scaleHints || []),
      ]);
      const primitiveHints = uniqueStrings([
        ...(row.primitiveHints || []),
        ...bases.flatMap((basis) => basis.primitives || []),
      ]);
      if (!card && !partHints.length && !shapeHints.length && !materialHints.length &&
          !affordanceHints.length && !relationHints.length) return null;
      const targetIdentity = constructionTargetIdentity(slot, row, card);
      return {
        schema: 'simulatte.constructionEvidence.v1',
        targetEntryId: slot.entryId || '',
        sourceCardId: card && card.id || directBasisIds[0] || candidateId,
        sourceType: card && card.type || (directBasisIds.length ? 'grounding-basis' : row.type || row.semanticType || ''),
        sourceLabel: card && card.labels && card.labels[0] || row.label || '',
        classHints,
        partHints,
        sourcePartHints,
        basisPartHints,
        shapeHints,
        materialHints,
        behaviorHints,
        affordanceHints,
        relationHints,
        scaleHints,
        primitiveHints,
        groundingIds,
        basisIds: bases.map((basis) => basis.id),
        ...targetIdentity,
      };
    }

    function constructionTargetIdentity(slot = {}, row = {}, card = null) {
      const targetIdentity = evidenceTerm(
        String(slot.entryId || '').replace(/^[a-z]+:/, ' ').replace(/[-_]+/g, ' ')
      );
      const targetTokens = uniqueStrings(fallbackFeatureTokens(
        String(slot.entryId || '').replace(/^[a-z]+:/, ' ').replace(/[-_]+/g, ' ')
      ));
      const primaryIdentities = uniqueStrings([
        row.label,
        card && card.labels && card.labels[0],
        String(row.candidateId || '').split('.').pop(),
        String(card && card.id || '').split('.').pop(),
      ].map(evidenceTerm));
      const identityTokens = new Set(fallbackFeatureTokens([
        row.candidateId,
        row.cardId,
        row.canonicalId,
        row.label,
        ...(row.labels || []),
        card && card.id,
        ...(card && card.labels || []),
      ].filter(Boolean).join(' ')));
      const targetTokenMatches = targetTokens.filter((token) => identityTokens.has(token));
      return {
        targetTokenMatches,
        targetTokenMatchCount: targetTokenMatches.length,
        targetTokenCoverage: Number((
          targetTokenMatches.length / Math.max(1, targetTokens.length)
        ).toFixed(4)),
        targetIdentityExact: primaryIdentities.includes(targetIdentity),
        targetIdentityBound: targetTokenMatches.length > 0,
      };
    }

    function constructionCandidateCanOwnPhysicalShape(card = null, row = {}, candidateId = '', bases = []) {
      const canonicalId = String(row.canonicalId || candidateId || '').toLowerCase();
      if (/^(?:affordance|concept|event|operator|process|relation|scene|shape|visual)[._-]/.test(canonicalId)) {
        return false;
      }
      const type = String(card && card.type || row.semanticType || row.cardType || row.type || '')
        .toLowerCase().replace(/_/g, '-');
      if (/^(?:affordance|behavior|concept|event|operator|process|relation|scene|shape|visual|universe-row)$/.test(type)) {
        return false;
      }
      if (/^(?:artifact|assembly|body|celestial|construction-topology|entity|entity-class|environment|infrastructure|instrument|machine|organism|structure|vehicle)$/.test(type)) {
        return true;
      }
      return bases.length > 0 && /^(?:primitive|grounding-basis)$/.test(type);
    }

    function annotateConstructionCandidate(slot = {}, row = {}) {
      const construction = constructionForCandidate(slot, row);
      if (!construction) return row;
      return {
        ...row,
        construction,
        constructionEvidence: true,
        identityEvidence: false,
        modelEvaluated: Number.isFinite(Number(row.modelScore)),
        reason: 'model-indexed construction evidence ranked for typed scene slot',
      };
    }

    function constructionUniverseMatches(slot = {}, matches = {}, maximum = 0) {
      if (!slotNeedsModelConstructionEvidence(slot)) return matches;
      const bases = (matches.byIndex && matches.byIndex.concepts || [])
        .filter((row) => groundingById.has(row.canonicalId))
        .slice(0, Math.max(2, Math.floor(Number(maximum || 0) / 2)));
      const seen = new Set();
      const candidates = [...bases, ...(matches.candidates || [])].filter((row) => {
        const id = row.id || row.canonicalId || '';
        if (!id || seen.has(id)) return false;
        seen.add(id);
        return true;
      }).slice(0, Math.max(0, Number(maximum || 0)));
      return { ...matches, candidates };
    }

    function constructionCandidatesForSlot(slot = {}, rows = [], maximum = 3) {
      const ranked = (rows || []).filter((row) => (
        row.constructionEvidence === true && row.construction && constructionRoleRank(slot, row) <= 1
      ))
        .sort((a, b) => (
          Number(b.construction.targetIdentityExact === true) - Number(a.construction.targetIdentityExact === true) ||
          constructionRoleRank(slot, a) - constructionRoleRank(slot, b) ||
          Number(b.construction.targetIdentityBound === true) - Number(a.construction.targetIdentityBound === true) ||
          Number(b.construction.targetTokenCoverage || 0) - Number(a.construction.targetTokenCoverage || 0) ||
          Number(b.modelRerankEvaluated === true) - Number(a.modelRerankEvaluated === true) ||
          Number(a.modelRerankRank ?? Number.MAX_SAFE_INTEGER) - Number(b.modelRerankRank ?? Number.MAX_SAFE_INTEGER) ||
          Number(b.score || 0) - Number(a.score || 0)
        ));
      // Exact prompt-owned construction cards define the candidate family. Keep
      // embedding neighbours only when the index has no literal construction;
      // otherwise a retry can drift from an excavator to an unrelated celestial
      // topology merely because both were close in embedding space.
      const exact = ranked.filter((row) => row.construction.targetIdentityExact === true);
      const literal = ranked.filter((row) => row.literalSlotMatch === true);
      const targetBound = ranked.filter((row) => row.construction.targetIdentityBound === true);
      const familyRows = exact.length ? exact : literal.length ? literal : targetBound.length ? targetBound : ranked;
      const seenFamilies = new Set();
      return familyRows.filter((row) => {
        const family = row.construction.sourceCardId || row.candidateId || row.id || '';
        if (!family || seenFamilies.has(family)) return false;
        seenFamilies.add(family);
        return true;
      }).slice(0, Math.max(0, Number(maximum || 0)));
    }

    function reserveConstructionTopologyCandidates(slot = {}, rows = [], maximum = 0) {
      const limit = Math.max(0, Number(maximum || 0));
      if (!limit || !slotNeedsModelConstructionEvidence(slot)) return rows.slice(0, limit);
      if (rows.some((row) => row.literalSlotMatch === true)) return rows.slice(0, limit);
      const isTopology = (row) => String(
        row.construction && row.construction.sourceType || row.type || ''
      ) === 'construction-topology';
      const reserve = rows.filter(isTopology).slice(0, Math.min(2, limit));
      if (!reserve.length) return rows.slice(0, limit);
      const reservedIds = new Set(reserve.map((row) => row.candidateId || row.id));
      const primary = rows.filter((row) => !reservedIds.has(row.candidateId || row.id))
        .slice(0, limit - reserve.length);
      return [...primary, ...reserve.map((row) => ({
        ...row,
        retrievalReservation: 'construction-topology',
      }))];
    }

    function constructionRoleRank(slot = {}, row = {}) {
      if (groundingById.has(row.canonicalId) || groundingById.has(row.candidateId)) return 1;
      const type = String(row.construction && row.construction.sourceType || row.type || row.semanticType || '').toLowerCase();
      const role = String(slot.slotRole || 'object');
      let rank = 3;
      if (role === 'actor' && type === 'entity') rank = 1;
      if (/^(concept|object)$/.test(role) && /^(entity|artifact|assembly|entity_class)$/.test(type)) rank = 1;
      if (role === 'environment' && /^(environment|celestial|entity_class)$/.test(type)) rank = 1;
      if (role === 'medium' && /^(material|grounding-basis)$/.test(type)) rank = 1;
      if (type === 'construction-topology' && /^(actor|concept|object|part|environment)$/.test(role)) rank = 1;
      if (/^(relation|event|process|affordance)$/.test(type)) rank = 4;
      return row.literalSlotMatch === true && rank < 4 ? 0 : rank;
    }

    function exactConstructionCandidate(slot = {}, rows = []) {
      return (rows || []).find((row) => (
        row.literalSlotMatch === true &&
        constructionRoleRank(slot, row) === 0 &&
        row.constructionEvidence === true &&
        row.modelEvaluated === true &&
        row.construction && row.construction.schema === 'simulatte.constructionEvidence.v1'
      )) || null;
    }

    function promptVectorExactConstructionCandidates(slot = {}, runtime = {}, vector = null, config = {}, options = {}) {
      if (!vector || !slotNeedsModelConstructionEvidence(slot) ||
          !slotAllowsCandidateType(slot, 'surface-card')) return [];
      const cardMax = slotCandidateBudget(slot, 'surfaceCard', config.perSlotCardMax);
      if (cardMax <= 0) return [];
      const rows = rankSurfaceCardsForSlot(
        runtime.cardIndex, slot, vector, { ...config, perSlotCardMax: cardMax }, options
      );
      return constructionCandidatesForSlot(slot, rows, 3).filter((row) => (
        row.literalSlotMatch === true && row.modelEvaluated === true
      ));
    }

    function promptVectorConstructionSlotRow(slot = {}, rows = [], vector = null, config = {}, promptText = '') {
      const constructionRows = rows.slice().sort(slotCandidateSort);
      const localIdentity = slotHasPromptOwnedVisualIdentity(slot)
        ? promptOwnedLocalCandidate(slot)
        : null;
      const candidates = localIdentity ? [localIdentity, ...constructionRows] : constructionRows;
      return {
        schema: 'simulatte.phase3ModelSlotRetrievalRow.v1',
        slotId: slot.slotId || '',
        slotRole: slot.slotRole || '',
        entryId: slot.entryId || '',
        required: slot.required !== false,
        queryText: 'prompt embedding reused for exact construction',
        vectorHash: embeddingVectorHash(vector),
        primitiveRankBackend: 'prompt-embedding-surface-card-index',
        rerankerMode: 'not-run-exact-prompt-embedding-construction',
        rerankerModelReady: false,
        candidates,
        acceptedCandidates: candidates.filter((row) => row.supportOnly !== true)
          .slice(0, config.perSlotAcceptedMax),
        constructionCandidates: constructionCandidatesForSlot(slot, constructionRows, 3),
        supportOnlyCandidates: [],
        receipt: {
          schema: 'simulatte.phase3SlotRerankReceipt.v1',
          rerankerMode: 'not-run-exact-prompt-embedding-construction',
          modelReady: false,
          modelStatus: 'not-run',
          skipReason: 'exact-construction-scored-by-prompt-embedding',
          candidateInputCount: 0,
          candidateOutputCount: 0,
          localCandidateCount: candidates.length,
          localIdentityCandidateCount: localIdentity ? 1 : 0,
        },
      };
    }

    function slotRerankSummary(bySlot = []) {
      const sum = (field) => bySlot.reduce(
        (total, row) => total + Number(row.receipt && row.receipt[field] || 0), 0
      );
      const paths = [...new Set(bySlot.flatMap(
        (row) => row.receipt && row.receipt.scoringPaths || []
      ))].sort();
      const prefixCounts = bySlot.map(
        (row) => Number(row.receipt && row.receipt.minimumPrefixTokenCount || 0)
      ).filter((count) => count > 0);
      return {
        rerankCandidateInputCount: sum('candidateInputCount'),
        rerankCandidateOutputCount: sum('candidateOutputCount'),
        rerankScoringPaths: paths,
        selectedTokenLogitCount: sum('selectedTokenLogitCount'),
        prefixKvReuseCount: sum('prefixKvReuseCount'),
        prefixStateReuseCount: sum('prefixStateReuseCount'),
        selectedTokenExecutionCount: sum('selectedTokenExecutionCount'),
        scoreCacheHitCount: sum('scoreCacheHitCount'),
        prefixPreparationDurationMs: Number(sum('prefixPreparationDurationMs').toFixed(3)),
        rerankCallDurationMs: Number(sum('rerankCallDurationMs').toFixed(3)),
        unattributedRerankDurationMs: Number(sum('unattributedRerankDurationMs').toFixed(3)),
        totalExecutionDurationMs: Number(sum('totalExecutionDurationMs').toFixed(3)),
        maximumExecutionDurationMs: Number(Math.max(0, ...bySlot.map(
          (row) => Number(row.receipt && row.receipt.maximumExecutionDurationMs || 0)
        )).toFixed(3)),
        minimumPrefixTokenCount: prefixCounts.length ? Math.min(...prefixCounts) : 0,
      };
    }

    Object.assign(scope, {
      slotNeedsModelConstructionEvidence,
      slotNeedsModelRetrievalEvidence,
      slotUsesPromptOwnedLocalEvidence,
      slotHasPromptOwnedVisualIdentity,
      promptOwnedLocalCandidate,
      promptOwnedLocalSlotRow,
      constructionQueryText,
      constructionForCandidate,
      constructionTargetIdentity,
      annotateConstructionCandidate,
      constructionUniverseMatches,
      constructionCandidatesForSlot,
      reserveConstructionTopologyCandidates,
      exactConstructionCandidate,
      promptVectorExactConstructionCandidates,
      promptVectorConstructionSlotRow,
      slotRerankSummary,
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
