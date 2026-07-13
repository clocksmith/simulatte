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
    const usedNodeIds = new Set();
    let mergedNodeCount = 0;
    let nodeIdCollisionCount = 0;
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
      if (usedNodeIds.has(primary.id)) {
        const ownedSpan = promptSpans.find((span) => span.id === primary.spanId);
        const baseId = ownedSpan
          ? `prompt-${ownedSpan.kind}-${normalizedIdentity(ownedSpan.text).replace(/\s+/g, '-')}`
          : `${primary.id}-canonical`;
        primary.id = uniqueNodeId(baseId, usedNodeIds);
        nodeIdCollisionCount += 1;
      }
      usedNodeIds.add(primary.id);
      for (const row of ordered) {
        nodeIdMap.set(row.id, primary.id);
        if (row.spanId) nodeIdMap.set(`span:${row.spanId}`, primary.id);
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
        nodeIdCollisionCount,
        unresolvedDuplicateNodeIdCount: canonicalNodes.length - new Set(canonicalNodes.map((node) => node.id)).size,
        duplicateConceptCount: 0,
      },
    };
  }

  function applyPromptSpanGrounding(node, promptSpans = []) {
    const span = promptSpans.find((row) => row.id === node.spanId);
    if (!span) return;
    node.directlyGrounded = true;
    node.sourceLabel = span.text || node.sourceLabel || '';
    node.label = String(span.text || node.label || '').trim().replace(/\s+/g, ' ').replace(/\b[a-z]/g, (value) => value.toUpperCase());
    if (span.semanticRole === 'visual-effect') node.semanticType = 'visual-effect';
    if (span.kind === 'observable') node.semanticType = 'observable';
    if (span.kind === 'environment') node.semanticType = 'environment';
    if (span.entityClass && (!node.semanticClass || genericSemanticClass(node.semanticClass))) {
      node.semanticClass = span.entityClass;
    }
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
      return componentId && (
        componentId === canonical ||
        nodeId === componentId ||
        nodeId === `primitive ${componentId}`
      );
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
    if ((!primary.semanticClass || genericSemanticClass(primary.semanticClass)) && row.semanticClass) {
      primary.semanticClass = row.semanticClass;
    }
    if ((!primary.visualArchetype || genericSemanticClass(primary.visualArchetype)) && row.visualArchetype) {
      primary.visualArchetype = row.visualArchetype;
    }
    if (!primary.construction && row.construction) primary.construction = row.construction;
    primary.constructionHypotheses = uniqueConstructionHypotheses([
      ...(primary.constructionHypotheses || []),
      ...(row.constructionHypotheses || []),
      row.construction,
    ].filter(Boolean));
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
      const exact = candidates.filter((candidate) => constructionCandidateExactness(candidate, slot) >= 2);
      const literal = candidates.filter((candidate) => candidate.literalSlotMatch === true);
      const selected = (exact.length ? exact : literal.length ? literal : candidates).slice(0, 3);
      const node = nodeForSlot(nodes, slot, selected[0]);
      if (!node) continue;
      node.constructionHypotheses = selected.map((candidate, index) => ({
        ...mergeConstructionRows([candidate]),
        hypothesisId: `construction:${slot.slotId || node.id}:${index + 1}`,
        hypothesisRank: index + 1,
        provenance: constructionCandidateProvenance(candidate, slot, node),
      }));
      node.construction = node.constructionHypotheses[0];
      node.constructionProvenance = node.constructionHypotheses.map((row) => row.provenance);
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

  function constructionCandidateProvenance(candidate = {}, slot = {}, node = null) {
    const target = normalizedIdentity(String(slot.entryId || '')
      .replace(/^[a-z]+:/, '').replace(/:\d+$/, ''));
    return {
      candidateId: candidate.candidateId || candidate.id || '',
      source: candidate.source || '',
      modelScore: finiteOrNull(candidate.modelScore),
      modelRerankScore: finiteOrNull(candidate.modelRerankScore),
      modelRerankRank: finiteOrNull(candidate.modelRerankRank),
      modelEvaluated: candidate.modelEvaluated === true,
      rerankEvaluated: candidate.modelRerankEvaluated === true,
      literalSlotMatch: candidate.literalSlotMatch === true,
      exactTargetMatch: constructionCandidateExactness(candidate, slot) >= 2,
      targetIdentityBound: Boolean(target && node && nodePrimaryIdentityLabels(node).includes(target)),
      vectorHash: candidate.vectorHash || '',
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

  function nodeForSlot(nodes = [], slot = {}, selectedCandidate = null) {
    const spanIds = new Set(slot.sourceSpanIds || []);
    const spanOwned = nodes.filter((node) => node.spanId && spanIds.has(node.spanId));
    const target = normalizedIdentity(String(slot.entryId || '').replace(/^[a-z]+:/, '').replace(/:\d+$/, ''));
    const exact = nodes.filter((node) => nodePrimaryIdentityLabels(node).includes(target));
    const exactSpanOwned = exact.filter((node) => spanOwned.includes(node));
    if (exactSpanOwned.length === 1) return exactSpanOwned[0];
    if (exact.length === 1) return exact[0];
    const candidateId = normalizedIdentity(
      selectedCandidate && (selectedCandidate.candidateId || selectedCandidate.cardId || selectedCandidate.id) || ''
    );
    const candidateOwned = candidateId ? nodes.filter((node) => unique([
      node.id,
      node.canonicalId,
      String(node.canonicalId || '').split('.').pop(),
    ].map(normalizedIdentity)).includes(candidateId)) : [];
    if (candidateOwned.length === 1) return candidateOwned[0];
    // A construction query can include material and relation context spans. A
    // single contextual span is not the slot target: for "glass greenhouse",
    // attaching the enclosure graph to glass deletes it from the rendered body.
    if (spanOwned.length === 1 && !target) return spanOwned[0];
    return exact.find((node) => node.directlyGrounded === true) || null;
  }

  function nodePrimaryIdentityLabels(node = {}) {
    return unique([
      node.id,
      node.canonicalId,
      String(node.canonicalId || '').split('.').pop(),
      node.label,
      node.sourceLabel,
    ].map(normalizedIdentity));
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
      sourcePartHints: unique(rows.flatMap((row) => row.sourcePartHints || [])),
      basisPartHints: unique(rows.flatMap((row) => row.basisPartHints || [])),
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

  function uniqueConstructionHypotheses(rows = []) {
    const seen = new Set();
    return rows.filter((row) => {
      const key = JSON.stringify([
        row.hypothesisId || '', row.sourceCardIds || [], row.basisIds || [], row.partHints || [],
      ]);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 3);
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
      const canonicalId = nodeIdMap.get(`span:${spanId}`) || nodeIdMap.get(node.id) || node.id;
      bySpan.set(spanId, byId.get(canonicalId) || node);
    }
    return bySpan;
  }

  function materializeTypedPromptNodes(nodes = [], bySpan = new Map(), promptParse = {}) {
    const existingIds = new Set(nodes.map((node) => node.id));
    for (const span of promptParse.spans || []) {
      if (!['entity', 'material', 'environment'].includes(span.kind) || bySpan.has(span.id)) continue;
      if (!['part', 'lighting-environment', 'visual-effect'].includes(span.semanticRole || '')) continue;
      const semanticType = span.semanticRole === 'visual-effect'
        ? 'visual-effect'
        : span.kind === 'material' ? 'material' : span.kind;
      const canonicalTarget = span.entityClass || span.materialHint || normalizedIdentity(span.text);
      const baseId = `prompt-${span.kind}-${normalizedIdentity(span.text).replace(/\s+/g, '-')}`;
      let id = baseId;
      let suffix = 2;
      while (existingIds.has(id)) id = `${baseId}-${suffix++}`;
      const node = {
        id,
        spanId: span.id,
        semanticType,
        semanticClass: span.entityClass || span.semanticRole || '',
        visualArchetype: span.visualArchetype || '',
        canonicalId: `prompt.${span.kind}.${canonicalTarget.replace(/\s+/g, '_')}`,
        label: span.text,
        aliases: [span.text],
        confidence: 0.76,
        domains: semanticType === 'material' ? ['solid'] : [],
        materialId: span.materialHint || '',
        materialIds: span.materialHint ? [span.materialHint] : [],
        operatorHints: [],
        operatorTypes: [],
        primitiveHints: [],
        conceptIds: [],
        shapeHints: span.visualArchetype ? [span.visualArchetype] : [],
        sceneHints: [],
        evidence: ['parser-lexicon'],
        directlyGrounded: true,
      };
      nodes.push(node);
      bySpan.set(span.id, node);
      existingIds.add(id);
    }
  }

  function applyPromptSemanticContracts(nodes = [], bySpan = new Map(), promptParse = {}) {
    const obligations = [];
    const environmentPrograms = [];
    const edges = [];
    const propertiesBySpan = new Map();
    const materialByTargetSpan = new Map();
    for (const clause of promptParse.clauses || []) {
      if (clause.process !== 'material_assignment') continue;
      const materialNode = bySpan.get(clause.subjectSpanId);
      const target = bySpan.get(clause.objectSpanId);
      if (!materialNode || !target) continue;
      const materialId = materialNode.materialId || normalizedIdentity(materialNode.label);
      materialByTargetSpan.set(clause.objectSpanId, materialId);
      materialNode.supportOnly = true;
      const property = {
        schema: 'simulatte.groundedProperty.v1',
        kind: 'material',
        value: materialId,
        sourceSpanIds: [clause.subjectSpanId, clause.objectSpanId].filter(Boolean),
      };
      target.properties = uniquePropertyRows([...(target.properties || []), property]);
      propertiesBySpan.set(clause.objectSpanId, target.properties);
      obligations.push(promptVisualObligation('property', target, {
        propertyKind: 'material',
        expectedValue: materialId,
      }));
    }
    for (const modifier of promptParse.modifiers || []) {
      if (!['color', 'articulation', 'material', 'emission', 'mechanism'].includes(modifier.relation)) continue;
      const target = bySpan.get(modifier.targetSpanId);
      if (!target) continue;
      const property = {
        schema: 'simulatte.groundedProperty.v1',
        kind: modifier.relation,
        value: modifier.value || '',
        sourceSpanIds: [modifier.targetSpanId, modifier.modifierSpanId].filter(Boolean),
      };
      target.properties = uniquePropertyRows([...(target.properties || []), property]);
      propertiesBySpan.set(modifier.targetSpanId, target.properties);
      obligations.push(promptVisualObligation('property', target, {
        propertyKind: property.kind,
        expectedValue: property.value,
      }));
    }
    for (const quantity of promptParse.quantities || []) {
      const target = bySpan.get(quantity.targetSpanId);
      if (!target) continue;
      target.cardinality = Math.max(1, Math.min(32, Math.floor(Number(quantity.value || 1))));
      obligations.push(promptVisualObligation('count', target, { expectedCount: target.cardinality }));
    }
    for (const clause of promptParse.clauses || []) {
      const subject = bySpan.get(clause.subjectSpanId);
      const object = bySpan.get(clause.objectSpanId);
      if (clause.process === 'part_composition' && subject && object) {
        object.semanticType = 'part';
        object.supportOnly = true;
        const explicitMaterial = materialByTargetSpan.get(clause.objectSpanId) || '';
        const part = {
          id: object.id,
          label: object.label,
          semanticClass: object.semanticClass || normalizedIdentity(object.label),
          visualArchetype: object.visualArchetype || '',
          materialId: explicitMaterial || object.materialId || '',
          properties: propertiesBySpan.get(clause.objectSpanId) || object.properties || [],
          sourceNodeId: object.id,
        };
        subject.partGraph = uniqueParts([...(subject.partGraph || []), part]);
        if (explicitMaterial) {
          obligations.push(promptVisualObligation('property', object, {
            propertyKind: 'material',
            expectedValue: part.materialId,
          }));
        }
        edges.push({
          id: `edge-prompt-part-${edges.length + 1}`,
          type: 'hasPart',
          from: subject.id,
          to: object.id,
          processId: 'part_composition',
          predicate: 'has-part',
          confidence: Math.min(Number(subject.confidence || 0), Number(object.confidence || 0), 0.82),
          evidence: ['explicit-part-language'],
        });
      }
      if (subject && clause.poseHint) {
        subject.poseHint = {
          schema: 'simulatte.groundedPoseHint.v1',
          action: clause.predicate || clause.process || '',
          pose: clause.poseHint,
          sourceSpanIds: [clause.subjectSpanId, clause.verbSpanId].filter(Boolean),
        };
        obligations.push(promptVisualObligation('pose', subject, { expectedPose: clause.poseHint }));
        if (object && (clause.prepositions || []).includes('with')) {
          object.poseHint = {
            schema: 'simulatte.groundedPoseHint.v1',
            action: clause.predicate || clause.process || '',
            pose: clause.poseHint,
            sourceSpanIds: [clause.objectSpanId, clause.verbSpanId].filter(Boolean),
          };
          obligations.push(promptVisualObligation('pose', object, { expectedPose: clause.poseHint }));
        }
      }
    }
    for (const span of promptParse.spans || []) {
      if (!span.environmentProgram) continue;
      const node = bySpan.get(span.id);
      if (!node) continue;
      const color = (node.properties || []).find((row) => row.kind === 'color');
      node.environmentProgram = {
        schema: 'simulatte.environmentProgram.v1',
        ...span.environmentProgram,
        color: color && color.value || '',
        sourceNodeId: node.id,
        sourceSpanIds: [span.id, ...(color && color.sourceSpanIds || [])],
      };
      node.supportOnly = true;
      environmentPrograms.push(node.environmentProgram);
      obligations.push(promptVisualObligation('environment', node, {
        expectedProgram: node.environmentProgram.kind,
        expectedValue: node.environmentProgram.color,
      }));
    }
    return { edges, obligations: uniqueObligations(obligations), environmentPrograms };
  }

  function promptVisualObligation(kind, node = {}, expected = {}) {
    const suffix = [kind, normalizedIdentity(node.label), ...Object.values(expected)].filter(Boolean)
      .join('-').replace(/[^a-z0-9#]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
    return {
      id: `visual:prompt-${suffix}`,
      kind: 'visual',
      ownedByPhase: 6,
      target: node.label || node.id || '',
      targetNodeId: node.id || '',
      targetIdentity: /^(?:body|entity|environment|material|medium|object|term)$/.test(String(node.semanticClass || ''))
        ? normalizedIdentity(node.label)
        : node.semanticClass || normalizedIdentity(node.label),
      constraintKind: kind,
      required: true,
      status: 'pending',
      phase: 4,
      ...expected,
    };
  }

  function uniqueParts(rows = []) {
    const byId = new Map();
    for (const row of rows) byId.set(row.id || row.label, row);
    return Array.from(byId.values());
  }

  function uniquePropertyRows(rows = []) {
    const byKey = new Map();
    for (const row of rows) byKey.set(`${row.kind}:${row.value}`, row);
    return Array.from(byKey.values());
  }

  function uniqueObligations(rows = []) {
    const byId = new Map();
    for (const row of rows) byId.set(row.id, row);
    return Array.from(byId.values());
  }

  function normalizedIdentity(value = '') {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
      .split(/\s+/).map((token) => token.length > 3 && token.endsWith('s') && !/(?:ss|us|is)$/.test(token)
        ? token.slice(0, -1) : token).join(' ');
  }

  function genericSemanticClass(value = '') {
    return /^(?:body|entity|environment|material|medium|object|term)$/.test(String(value || ''));
  }

  function finiteOrNull(value) {
    return value != null && Number.isFinite(Number(value)) ? Number(value) : null;
  }

  function uniqueNodeId(baseId = 'node', usedIds = new Set()) {
    let id = baseId;
    let suffix = 2;
    while (usedIds.has(id)) id = `${baseId}-${suffix++}`;
    return id;
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
    materializeTypedPromptNodes,
    applyPromptSemanticContracts,
  };
});
