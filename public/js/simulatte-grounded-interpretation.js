(function groundedInterpretationModule(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SimulatteGroundedInterpretation = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function groundedInterpretationFactory() {
  'use strict';

  function buildGroundedInterpretation(options) {
    const languageEvidence = options && options.languageEvidence ? options.languageEvidence : {};
    const activationCloud = Array.isArray(options && options.activationCloud) ? options.activationCloud : [];
    const structuredIntent = options && options.structuredIntent ? options.structuredIntent : {};
    const causalGraph = Array.isArray(options && options.causalGraph) ? options.causalGraph : [];
    const visualAffordances = Array.isArray(options && options.visualAffordances) ? options.visualAffordances : [];
    const acceptedActivations = selectAcceptedActivations(activationCloud);
    const bindings = evidenceBindings(acceptedActivations, causalGraph, visualAffordances);
    const unresolvedSpans = unresolvedLanguageSpans(languageEvidence, acceptedActivations);
    const coverageGaps = coverageGapsFor(languageEvidence, acceptedActivations, causalGraph, visualAffordances, structuredIntent);

    return {
      schema: 'simulatte.groundedInterpretation.v1',
      acceptedActivations,
      evidenceBindings: bindings,
      unresolvedSpans,
      coverageGaps,
      summary: {
        acceptedActivationCount: acceptedActivations.length,
        evidenceBindingCount: bindings.length,
        unresolvedSpanCount: unresolvedSpans.length,
        coverageGapCount: coverageGaps.length,
        groundedCausalEdgeCount: causalGraph.length,
        groundedVisualAffordanceCount: visualAffordances.length
      }
    };
  }

  function buildGroundedStructuredIntent(options) {
    const structuredIntent = options && options.structuredIntent ? options.structuredIntent : {};
    const grounding = options && options.groundedInterpretation
      ? options.groundedInterpretation
      : buildGroundedInterpretation(options || {});
    const evidenceRows = array(options && (options.evidenceRows || options.retrievedEvidence));
    const support = supportIndex(grounding, evidenceRows);
    const filter = (rows) => array(rows).filter((row) => hasGroundedSupport(row, support));
    const scaleRegime = hasGroundedSupport(structuredIntent.scaleRegime, support)
      ? structuredIntent.scaleRegime
      : {
        id: 'scale.unresolved',
        label: 'scale unresolved until catalog evidence supports a regime',
        confidence: 0,
        evidence: ['grounding-gate'],
      };
    const visualIntent = groundedVisualIntent(structuredIntent.visualIntent || {}, support);
    const rejectedUngrounded = [];
    for (const group of ['entities', 'materials', 'phenomena', 'forces', 'fields', 'environment', 'observables', 'timeBehavior']) {
      for (const row of array(structuredIntent[group])) {
        if (!hasGroundedSupport(row, support)) rejectedUngrounded.push({
          id: `${group}.${row.id || rejectedUngrounded.length + 1}`,
          sourceId: row.id || '',
          group,
          label: row.label || row.id || '',
          reason: 'no accepted activation or catalog evidence survived grounding',
          evidence: array(row.evidence),
        });
      }
    }
    return {
      ...structuredIntent,
      schema: 'simulatte.groundedStructuredIntent.v1',
      draftSchema: structuredIntent.schema || '',
      entities: filter(structuredIntent.entities),
      materials: filter(structuredIntent.materials),
      phenomena: filter(structuredIntent.phenomena),
      forces: filter(structuredIntent.forces),
      fields: filter(structuredIntent.fields),
      environment: filter(structuredIntent.environment),
      observables: filter(structuredIntent.observables),
      timeBehavior: filter(structuredIntent.timeBehavior),
      scaleRegime,
      visualIntent,
      rejectedUngrounded,
      provenance: {
        ...(structuredIntent.provenance || {}),
        groundingGate: grounding.schema || 'simulatte.groundedInterpretation.v1',
        acceptedActivationCount: array(grounding.acceptedActivations).length,
        rejectedUngroundedCount: rejectedUngrounded.length,
      },
    };
  }

  function selectAcceptedActivations(activationCloud) {
    const rows = [];
    const perSpanKind = new Map();
    activationCloud.forEach((activation) => {
      if (activation.score < 0.38 && activation.rank > 24) return;
      const key = `${activation.spanId}:${activation.candidateKind}`;
      const count = perSpanKind.get(key) || 0;
      if (count >= 5) return;
      perSpanKind.set(key, count + 1);
      rows.push({
        id: `grounding.${String(rows.length + 1).padStart(4, '0')}`,
        activationId: activation.id,
        spanId: activation.spanId,
        spanKind: activation.spanKind,
        spanText: activation.spanText,
        candidateId: activation.candidateId,
        candidateKind: activation.candidateKind,
        candidateLabel: activation.candidateLabel,
        score: activation.score,
        decision: 'accepted-by-evidence-score'
      });
    });
    return rows;
  }

  function evidenceBindings(acceptedActivations, causalGraph, visualAffordances) {
    const rows = [];
    acceptedActivations.forEach((activation) => {
      rows.push({
        id: `binding.${String(rows.length + 1).padStart(4, '0')}`,
        kind: 'span-candidate',
        spanId: activation.spanId,
        spanText: activation.spanText,
        targetId: activation.candidateId,
        targetKind: activation.candidateKind,
        score: activation.score
      });
    });
    causalGraph.forEach((edge) => {
      rows.push({
        id: `binding.${String(rows.length + 1).padStart(4, '0')}`,
        kind: 'causal-edge',
        targetId: edge.id || edge.relationId || 'causal-edge',
        targetKind: 'causal-edge',
        source: edge.source || edge.from || null,
        target: edge.target || edge.to || null,
        operatorType: edge.operatorType || edge.operator || null
      });
    });
    visualAffordances.forEach((affordance) => {
      rows.push({
        id: `binding.${String(rows.length + 1).padStart(4, '0')}`,
        kind: 'visual-affordance',
        targetId: affordance.id,
        targetKind: 'visual-affordance',
        sceneKind: affordance.sceneKind || affordance.scene || null
      });
    });
    return rows;
  }

  function unresolvedLanguageSpans(languageEvidence, acceptedActivations) {
    const bound = new Set(acceptedActivations.map((row) => row.spanId));
    return array(languageEvidence.spans)
      .filter((span) => !bound.has(span.id) && ['clause', 'predicate-frame', 'verb-phrase'].includes(span.kind))
      .slice(0, 24)
      .map((span, index) => ({
        id: `unresolved-span.${String(index + 1).padStart(3, '0')}`,
        spanId: span.id,
        spanKind: span.kind,
        text: span.text,
        reason: 'no accepted catalog activation'
      }));
  }

  function coverageGapsFor(languageEvidence, acceptedActivations, causalGraph, visualAffordances, structuredIntent) {
    const gaps = [];
    const hasPredicateFrames = array(languageEvidence.predicateFrames).length > 0;
    const hasCausalLanguage = Boolean(languageEvidence.summary && languageEvidence.summary.hasCausalLanguage);
    const hasCausalActivations = acceptedActivations.some((row) => row.candidateKind === 'causal-candidate');
    if (hasPredicateFrames && hasCausalLanguage && !hasCausalActivations && causalGraph.length === 0) {
      gaps.push(gap('causal-language-without-grounded-causal-relation', 'Causal language exists, but no catalog-backed causal relation was accepted.'));
    }
    if (array(languageEvidence.quantities).length > 0 && !hasAcceptedKind(acceptedActivations, 'operator-candidate')) {
      gaps.push(gap('quantity-without-operator-grounding', 'Quantities were found, but no operator candidate accepted them.'));
    }
    if (array(structuredIntent.unsupported).length > 0) {
      gaps.push(gap('unsupported-meaning-present', 'Structured interpretation includes unsupported meaning that must remain explicit.'));
    }
    if (visualAffordances.length === 0 && acceptedActivations.some((row) => row.candidateKind === 'visual-candidate')) {
      gaps.push(gap('visual-candidate-without-affordance', 'Visual catalog candidates exist, but no visual affordance was selected.'));
    }
    return gaps;
  }

  function hasAcceptedKind(rows, kind) {
    return rows.some((row) => row.candidateKind === kind);
  }

  function supportIndex(grounding, evidenceRows) {
    const activationIds = new Set();
    const candidateIds = new Set();
    const candidateLabels = new Set();
    array(grounding && grounding.acceptedActivations).forEach((row) => {
      if (row.activationId) activationIds.add(String(row.activationId));
      if (row.candidateId) candidateIds.add(String(row.candidateId));
      if (row.candidateLabel) candidateLabels.add(normalize(row.candidateLabel));
    });
    const evidenceIds = new Set();
    const evidenceLabels = new Set();
    array(evidenceRows).forEach((row) => {
      if (row.id) evidenceIds.add(String(row.id));
      if (row.label) evidenceLabels.add(normalize(row.label));
    });
    return { activationIds, candidateIds, candidateLabels, evidenceIds, evidenceLabels };
  }

  function hasGroundedSupport(row, support) {
    if (!row) return false;
    const id = String(row.id || '');
    const label = normalize(row.label || row.id || '');
    if (support.candidateIds.has(id) || support.evidenceIds.has(id)) return true;
    if (label && support.candidateLabels.has(label)) return true;
    if (label && support.evidenceLabels.has(label)) return true;
    return array(row.evidence).some((item) => {
      const value = String(item || '');
      const normalized = normalize(value);
      if (!value || value === 'prompt-text' || value === 'prompt-language' || value === 'compiler-default') return false;
      return support.activationIds.has(value) ||
        support.candidateIds.has(value) ||
        support.evidenceIds.has(value) ||
        support.candidateLabels.has(normalized) ||
        support.evidenceLabels.has(normalized);
    });
  }

  function groundedVisualIntent(visualIntent, support) {
    const evidence = array(visualIntent.evidence).filter((item) => {
      const value = String(item || '');
      const normalized = normalize(value);
      return support.activationIds.has(value) ||
        support.candidateIds.has(value) ||
        support.evidenceIds.has(value) ||
        support.candidateLabels.has(normalized) ||
        support.evidenceLabels.has(normalized);
    });
    const hasEvidence = evidence.length > 0;
    return {
      ...visualIntent,
      sceneKind: hasEvidence ? visualIntent.sceneKind || 'generic' : 'generic',
      evidence,
      grounding: hasEvidence ? 'accepted-activation-or-catalog-evidence' : 'ungrounded-visual-intent-suppressed',
    };
  }

  function gap(id, message) {
    return { id: `gap.${id}`, message, severity: 'needs-grounding' };
  }

  function array(value) {
    return Array.isArray(value) ? value : [];
  }

  function normalize(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  return {
    buildGroundedInterpretation,
    buildGroundedStructuredIntent,
    selectAcceptedActivations
  };
});
