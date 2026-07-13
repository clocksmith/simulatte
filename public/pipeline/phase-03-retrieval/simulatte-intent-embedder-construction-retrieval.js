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
      return /^(actor|object|part|environment)$/.test(role);
    }

    function slotNeedsModelRetrievalEvidence(slot = {}) {
      const role = String(slot.slotRole || '');
      if (/^(actor|object|part|environment|medium)$/.test(role)) return true;
      return role === 'relation' && !slot.spatialRelation && slot.required !== false;
    }

    function slotUsesPromptOwnedLocalEvidence(slot = {}) {
      const role = String(slot.slotRole || '');
      const lexicalVisual = role === 'visual' && (slot.queries || []).length > 0 &&
        (slot.queries || []).every((row) => row && row.kind === 'lexical');
      return Boolean(slot.entryId) && (!slotNeedsModelRetrievalEvidence(slot) || lexicalVisual);
    }

    function promptOwnedLocalSlotRow(slot = {}, promptText = '') {
      const role = String(slot.slotRole || 'object');
      const target = normalizeSpanText(String(slot.entryId || '')
        .replace(/^[a-z]+:/, '').replace(/[_:]+/g, ' '));
      const id = `prompt.${role}.${target.replace(/\s+/g, '-')}`;
      const semanticType = ({
        actor: 'entity', object: 'entity', part: 'part', environment: 'environment', medium: 'medium',
        action: 'action', relation: 'relation', visual: 'visual',
      })[role] || 'entity';
      const candidate = {
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
        shapeHints: slot.shapeHints || [],
        identityEvidence: !/^(?:action|relation|visual)$/.test(role),
        constructionEvidence: false,
        supportOnly: false,
        slotId: slot.slotId || '',
        slotRole: role,
        entryId: slot.entryId || '',
      };
      return {
        schema: 'simulatte.phase3ModelSlotRetrievalRow.v1',
        slotId: slot.slotId || '',
        slotRole: role,
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
          skipReason: 'prompt-owned-local-identity',
          candidateInputCount: 0,
          candidateOutputCount: 0,
          localCandidateCount: 1,
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
      const partHints = uniqueStrings([
        ...(card && card.partHints || []),
        ...(row.partHints || []),
        ...bases.flatMap((basis) => basis.parts || []),
      ]);
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
      if (!card && !partHints.length && !shapeHints.length && !materialHints.length &&
          !affordanceHints.length && !relationHints.length) return null;
      return {
        schema: 'simulatte.constructionEvidence.v1',
        targetEntryId: slot.entryId || '',
        sourceCardId: card && card.id || directBasisIds[0] || candidateId,
        sourceType: card && card.type || (directBasisIds.length ? 'grounding-basis' : row.type || row.semanticType || ''),
        sourceLabel: card && card.labels && card.labels[0] || row.label || '',
        classHints,
        partHints,
        shapeHints,
        materialHints,
        behaviorHints,
        affordanceHints,
        relationHints,
        scaleHints,
        groundingIds,
        basisIds: bases.map((basis) => basis.id),
      };
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
      return (rows || []).filter((row) => (
        row.constructionEvidence === true && row.construction && constructionRoleRank(slot, row) <= 1
      ))
        .sort((a, b) => (
          constructionRoleRank(slot, a) - constructionRoleRank(slot, b) ||
          Number(b.modelRerankEvaluated === true) - Number(a.modelRerankEvaluated === true) ||
          Number(a.modelRerankRank ?? Number.MAX_SAFE_INTEGER) - Number(b.modelRerankRank ?? Number.MAX_SAFE_INTEGER) ||
          Number(b.score || 0) - Number(a.score || 0)
        )).slice(0, Math.max(0, Number(maximum || 0)));
    }

    function constructionRoleRank(slot = {}, row = {}) {
      if (groundingById.has(row.canonicalId) || groundingById.has(row.candidateId)) return 1;
      const type = String(row.construction && row.construction.sourceType || row.type || row.semanticType || '').toLowerCase();
      const role = String(slot.slotRole || 'object');
      let rank = 3;
      if (role === 'actor' && type === 'entity') rank = 1;
      if (role === 'object' && /^(entity|artifact|assembly|entity_class)$/.test(type)) rank = 1;
      if (role === 'environment' && /^(environment|celestial|entity_class)$/.test(type)) rank = 1;
      if (role === 'medium' && /^(material|grounding-basis)$/.test(type)) rank = 1;
      if (/^(relation|event|process|affordance)$/.test(type)) rank = 4;
      return row.literalSlotMatch === true && rank === 1 ? 0 : rank;
    }

    function exactConstructionCandidate(slot = {}, rows = []) {
      return (rows || []).find((row) => (
        row.literalSlotMatch === true &&
        constructionRoleRank(slot, row) === 0 &&
        row.constructionEvidence === true &&
        row.modelEvaluated === true &&
        (row.construction && row.construction.partHints || []).length > 0
      )) || null;
    }

    Object.assign(scope, {
      slotNeedsModelConstructionEvidence,
      slotNeedsModelRetrievalEvidence,
      slotUsesPromptOwnedLocalEvidence,
      promptOwnedLocalSlotRow,
      constructionQueryText,
      constructionForCandidate,
      annotateConstructionCandidate,
      constructionUniverseMatches,
      constructionCandidatesForSlot,
      exactConstructionCandidate,
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
