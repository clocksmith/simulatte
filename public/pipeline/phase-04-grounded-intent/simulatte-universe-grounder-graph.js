(function attachSimulatteUniverseGrounderGraph(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteUniverseGrounderGraph = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createUniverseGrounderGraphApi() {
  const SPATIAL_EDGE_TYPES = Object.freeze({
    in: 'inside',
    inside: 'inside',
    into: 'inside',
    within: 'inside',
    on: 'supportedBy',
    onto: 'supportedBy',
    at: 'near',
    over: 'above',
    above: 'above',
    under: 'below',
    below: 'below',
    beside: 'beside',
    near: 'near',
    outside: 'outside',
    around: 'around',
    behind: 'behind',
    'in-front-of': 'inFrontOf',
    'attached-to': 'attachedTo',
    against: 'attachedTo',
    through: 'through',
    between: 'between',
    supports: 'supports',
  });

  function canonicalizeGroundedNodes(nodes = [], input = {}) {
    const promptSpans = (input.promptParse && input.promptParse.spans || [])
      .filter((span) => ['entity', 'material', 'environment', 'observable', 'term'].includes(span.kind));
    const groups = new Map();
    const nodeIdMap = new Map();
    for (const node of nodes) {
      const key = componentPromptConceptKey(node, input.components || [], promptSpans) ||
        promptConceptKey(node, promptSpans) || `node:${node.id}`;
      const group = groups.get(key) || [];
      group.push(node);
      groups.set(key, group);
    }
    const canonicalNodes = [];
    let mergedNodeCount = 0;
    for (const [key, group] of groups.entries()) {
      const ordered = group.slice().sort((a, b) => (
        Number(Boolean(b.spanId)) - Number(Boolean(a.spanId)) ||
        Number(b.directlyGrounded === true) - Number(a.directlyGrounded === true) ||
        Number(b.confidence || 0) - Number(a.confidence || 0)
      ));
      const primary = { ...ordered[0] };
      if (String(key).startsWith('prompt:')) {
        primary.directlyGrounded = true;
        primary.spanId = primary.spanId || String(key).split(':')[1] || null;
      }
      for (const row of ordered) {
        nodeIdMap.set(row.id, primary.id);
        if (row === ordered[0]) continue;
        mergeNodeEvidence(primary, row);
        mergedNodeCount += 1;
      }
      applyPromptSpanGrounding(primary, promptSpans);
      canonicalNodes.push(primary);
    }
    return {
      nodes: canonicalNodes,
      nodeIdMap,
      receipt: {
        schema: 'simulatte.groundedGraphCanonicalization.v1',
        inputNodeCount: nodes.length,
        canonicalNodeCount: canonicalNodes.length,
        mergedNodeCount,
        duplicateConceptCount: 0,
      },
    };
  }

  function applyPromptSpanGrounding(node, promptSpans = []) {
    const span = promptSpans.find((row) => row.id === node.spanId);
    if (!span) return;
    node.directlyGrounded = true;
    if (span.kind === 'observable') node.semanticType = 'observable';
    if (span.entityClass) node.semanticClass = span.entityClass;
    if (span.visualArchetype) {
      node.visualArchetype = span.visualArchetype;
      node.shapeHints = unique([span.visualArchetype, ...(node.shapeHints || [])]);
    }
    if (span.materialHint) {
      node.materialId = span.materialHint;
      node.materialIds = unique([span.materialHint, ...(node.materialIds || [])]);
    }
  }

  function componentPromptConceptKey(node = {}, components = [], promptSpans = []) {
    const canonical = normalizedIdentity(String(node.canonicalId || '').replace(/^primitive[.]/, ''));
    const nodeId = normalizedIdentity(node.id);
    const component = components.find((row) => {
      const componentId = normalizedIdentity(row.id);
      return componentId && (componentId === canonical || nodeId.endsWith(componentId));
    });
    if (!component) return '';
    const phraseFor = (row) => normalizedIdentity([row.phrase, row.role].filter(Boolean).join(' '));
    const phrase = phraseFor(component);
    const componentId = normalizedIdentity(component.id).replace(/\b(?:a|b|c|\d+)$/, '').trim();
    const componentRole = normalizedIdentity(component.role);
    const componentPhrase = normalizedIdentity(component.phrase);
    const matches = promptSpans.filter((span) => {
      const raw = normalizedIdentity(span.text);
      const semantic = normalizedIdentity(span.entityClass || span.materialHint || '');
      return Boolean(
        raw && (raw === componentPhrase || raw === componentRole || raw === componentId) ||
        semantic && (semantic === componentId || semantic === componentRole)
      );
    }).sort((a, b) => String(b.text || '').length - String(a.text || '').length);
    const peers = components.filter((row) => phraseFor(row) === phrase);
    const occurrence = Math.max(0, peers.indexOf(component));
    const span = matches[Math.min(occurrence, Math.max(0, matches.length - 1))];
    return span ? `prompt:${span.id}:${normalizedIdentity(span.text)}` : '';
  }

  function promptConceptKey(node = {}, promptSpans = []) {
    const ownedSpan = node.spanId && promptSpans.find((span) => span.id === node.spanId);
    if (ownedSpan) return `prompt:${ownedSpan.id}:${normalizedIdentity(ownedSpan.text)}`;
    const labels = nodeIdentityLabels(node);
    for (const span of promptSpans) {
      const promptLabel = normalizedIdentity(span.text);
      if (!promptLabel) continue;
      if (labels.includes(promptLabel)) return `prompt:${span.id}:${promptLabel}`;
    }
    const sourceLabel = normalizedIdentity(node.sourceLabel);
    if (sourceLabel) {
      const span = promptSpans.find((row) => normalizedIdentity(row.text) === sourceLabel);
      if (span) return `prompt:${span.id}:${sourceLabel}`;
    }
    const canonical = normalizedIdentity(String(node.canonicalId || '').split('.').pop());
    const exactPrompt = promptSpans.find((span) => normalizedIdentity(span.text) === canonical);
    return exactPrompt ? `prompt:${exactPrompt.id}:${canonical}` : '';
  }

  function nodeIdentityLabels(node = {}) {
    return unique([
      node.sourceLabel,
      node.label,
      String(node.canonicalId || '').split('.').pop(),
      ...(node.aliases || []),
    ].map(normalizedIdentity));
  }

  function mergeNodeEvidence(primary, row) {
    for (const key of [
      'aliases', 'domains', 'materialIds', 'operatorHints', 'operatorTypes', 'primitiveHints',
      'conceptIds', 'shapeHints', 'sceneHints', 'evidence',
    ]) primary[key] = unique([...(primary[key] || []), ...(row[key] || [])]);
    primary.confidence = Math.max(Number(primary.confidence || 0), Number(row.confidence || 0));
    primary.directlyGrounded = primary.directlyGrounded === true || row.directlyGrounded === true;
    if (!primary.materialId && row.materialId) primary.materialId = row.materialId;
    if (!primary.semanticClass && row.semanticClass) primary.semanticClass = row.semanticClass;
    if (!primary.visualArchetype && row.visualArchetype) primary.visualArchetype = row.visualArchetype;
    if (!primary.construction && row.construction) primary.construction = row.construction;
  }

  function attachConstructionEvidence(nodes = [], slotEvidence = []) {
    let attachedCount = 0;
    for (const slot of slotEvidence || []) {
      const candidates = (slot.constructionCandidates || slot.acceptedCandidates || [])
        .filter((candidate) => candidate && candidate.constructionEvidence === true && candidate.construction)
        .sort((a, b) => (
          constructionCandidateExactness(b, slot) - constructionCandidateExactness(a, slot) ||
          Number(b.literalSlotMatch === true) - Number(a.literalSlotMatch === true) ||
          Number(b.modelRerankEvaluated === true) - Number(a.modelRerankEvaluated === true) ||
          Number(a.modelRerankRank ?? Number.MAX_SAFE_INTEGER) - Number(b.modelRerankRank ?? Number.MAX_SAFE_INTEGER) ||
          Number(b.score || 0) - Number(a.score || 0)
        ));
      if (!candidates.length) continue;
      const node = nodeForSlot(nodes, slot);
      if (!node) continue;
      const selected = candidates.slice(0, 1);
      node.construction = mergeConstructionRows(selected);
      node.constructionProvenance = selected.map((candidate) => ({
        candidateId: candidate.candidateId || candidate.id || '',
        source: candidate.source || '',
        modelScore: finiteOrNull(candidate.modelScore),
        modelRerankScore: finiteOrNull(candidate.modelRerankScore),
        modelRerankRank: finiteOrNull(candidate.modelRerankRank),
        modelEvaluated: candidate.modelEvaluated === true,
        rerankEvaluated: candidate.modelRerankEvaluated === true,
        literalSlotMatch: candidate.literalSlotMatch === true,
        exactTargetMatch: constructionCandidateExactness(candidate, slot) >= 2,
        vectorHash: candidate.vectorHash || '',
      }));
      attachedCount += 1;
    }
    return {
      schema: 'simulatte.constructionAttachmentReceipt.v1',
      slotCount: (slotEvidence || []).length,
      attachedCount,
      modelEvaluatedCount: nodes.filter((node) => (
        (node.constructionProvenance || []).some((row) => row.modelEvaluated)
      )).length,
      rerankEvaluatedCount: nodes.filter((node) => (
        (node.constructionProvenance || []).some((row) => row.rerankEvaluated)
      )).length,
    };
  }

  function constructionCandidateExactness(candidate = {}, slot = {}) {
    const target = normalizedIdentity(String(slot.entryId || '').replace(/^[a-z]+:/, '').replace(/:\d+$/, ''));
    if (!target) return 0;
    const construction = candidate.construction || {};
    const labels = unique([
      construction.sourceLabel,
      candidate.label,
      ...(candidate.labels || []),
    ].map(normalizedIdentity));
    return labels.includes(target) ? 2 : candidate.literalSlotMatch === true ? 1 : 0;
  }

  function nodeForSlot(nodes = [], slot = {}) {
    const spanIds = new Set(slot.sourceSpanIds || []);
    const spanOwned = nodes.filter((node) => node.spanId && spanIds.has(node.spanId));
    if (spanOwned.length === 1) return spanOwned[0];
    const target = normalizedIdentity(String(slot.entryId || '').replace(/^[a-z]+:/, '').replace(/:\d+$/, ''));
    if (!target) return null;
    const exact = nodes.filter((node) => nodeIdentityLabels(node).includes(target));
    if (exact.length === 1) return exact[0];
    return exact.find((node) => node.directlyGrounded === true) || null;
  }

  function mergeConstructionRows(candidates = []) {
    const rows = candidates.map((candidate) => candidate.construction || {});
    return {
      schema: 'simulatte.constructionProgramInput.v1',
      targetEntryId: rows[0] && rows[0].targetEntryId || '',
      sourceCardIds: unique(rows.map((row) => row.sourceCardId)),
      sourceLabels: unique(rows.map((row) => row.sourceLabel)),
      classHints: unique(rows.flatMap((row) => row.classHints || [])),
      partHints: unique(rows.flatMap((row) => row.partHints || [])),
      shapeHints: unique(rows.flatMap((row) => row.shapeHints || [])),
      materialHints: unique(rows.flatMap((row) => row.materialHints || [])),
      behaviorHints: unique(rows.flatMap((row) => row.behaviorHints || [])),
      affordanceHints: unique(rows.flatMap((row) => row.affordanceHints || [])),
      relationHints: unique(rows.flatMap((row) => row.relationHints || [])),
      scaleHints: unique(rows.flatMap((row) => row.scaleHints || [])),
      groundingIds: unique(rows.flatMap((row) => row.groundingIds || [])),
      basisIds: unique(rows.flatMap((row) => row.basisIds || [])),
    };
  }

  function edgeRowsForClauses(clauses = [], bySpan = new Map(), processToEdge = {}) {
    const edges = [];
    for (const clause of clauses) {
      const from = bySpan.get(clause.subjectSpanId) || null;
      const to = bySpan.get(clause.objectSpanId) || null;
      if (!from || !to || from.id === to.id) continue;
      const spatialRelation = String(clause.spatialRelation || '');
      const type = SPATIAL_EDGE_TYPES[spatialRelation] || processToEdge[clause.process] || 'interaction';
      edges.push({
        id: `edge${edges.length + 1}`,
        type,
        from: from.id,
        to: to.id,
        processId: clause.process || clause.predicate || 'interact',
        predicate: clause.predicate || '',
        spatialRelation,
        prepositions: clause.prepositions || [],
        confidence: Math.min(Number(from.confidence || 0), Number(to.confidence || 0), 0.82),
        evidence: [clause.relationSource || 'prompt-clause'],
      });
    }
    return edges;
  }

  function remapSpanNodes(bySpan = new Map(), nodes = [], nodeIdMap = new Map()) {
    const byId = new Map(nodes.map((node) => [node.id, node]));
    for (const [spanId, node] of bySpan.entries()) {
      bySpan.set(spanId, byId.get(nodeIdMap.get(node.id) || node.id) || node);
    }
    return bySpan;
  }

  function normalizedIdentity(value = '') {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
      .split(/\s+/).map((token) => token.length > 3 && token.endsWith('s') ? token.slice(0, -1) : token).join(' ');
  }

  function finiteOrNull(value) {
    return Number.isFinite(Number(value)) ? Number(value) : null;
  }

  function unique(values = []) {
    return Array.from(new Set(values.filter(Boolean)));
  }

  return {
    SPATIAL_EDGE_TYPES,
    canonicalizeGroundedNodes,
    attachConstructionEvidence,
    edgeRowsForClauses,
    remapSpanNodes,
  };
});
