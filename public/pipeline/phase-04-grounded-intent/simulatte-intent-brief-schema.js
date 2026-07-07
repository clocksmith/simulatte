(function attachSimulatteIntentBriefSchema(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.SimulatteIntentBriefSchema = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createIntentBriefSchemaApi() {
  const INTENT_BRIEF_SCHEMA = 'simulatte.intentBrief.v1';
  const INTENT_BRIEF_MODEL_STACK = Object.freeze({
    retrieval: 'qwen-3-embedding-0-6b-q4k-ehf16-af32',
    structurer: 'qwen-3-5-0-8b-q4k-ehaf16-intent-structurer',
    reranker: 'qwen-3-reranker-0-6b-q4k-ehf16-af32',
    compiler: 'simulatte.retrieval-grounded-semantic-scene-forensics.v1',
  });

  const REQUIRED_ARRAY_FIELDS = Object.freeze([
    'promptSignals',
    'retrievedEvidence',
    'activationCloud',
    'entities',
    'materials',
    'phenomena',
    'forces',
    'fields',
    'environment',
    'timeBehavior',
    'causalGraph',
    'observables',
    'assumptions',
    'alternatives',
    'unsupported',
    'degradedTo',
    'negativeKnowledge',
    'intentFrames',
    'evidenceBindings',
    'coverageGaps',
    'causalQuestions',
  ]);

  function createEmptyIntentBrief(prompt = '') {
    return normalizeIntentBrief({
      schema: INTENT_BRIEF_SCHEMA,
      prompt: String(prompt || ''),
      modelStack: { ...INTENT_BRIEF_MODEL_STACK },
      promptSignals: [],
      retrievedEvidence: [],
      languageEvidence: null,
      activationCloud: [],
      activationSummary: null,
      groundedInterpretation: null,
      entities: [],
      materials: [],
      phenomena: [],
      forces: [],
      fields: [],
      scaleRegime: {
        id: 'scale.unspecified',
        label: 'unspecified scale',
        confidence: 0,
        evidence: [],
      },
      environment: [],
      timeBehavior: [],
      causalGraph: [],
      observables: [],
      visualIntent: {
        sceneKind: 'generic',
        camera: 'adaptive-3d-orbit',
        style: 'physically-annotated-procedural-render',
        evidence: [],
      },
      assumptions: [],
      alternatives: [],
      unsupported: [],
      degradedTo: [],
      negativeKnowledge: [],
      intentFrames: [],
      evidenceBindings: [],
      coverageGaps: [],
      causalQuestions: [],
      compilerContract: {
        groundedClaimsOnly: true,
        mayUseMLForDrafting: true,
        executablePhysicsMustBeCatalogBacked: true,
        unsupportedPhysicsMustBeExplicit: true,
      },
      confidence: 0,
    });
  }

  function normalizeIntentBrief(brief = {}) {
    const normalized = {
      schema: INTENT_BRIEF_SCHEMA,
      prompt: String(brief.prompt || ''),
      modelStack: { ...INTENT_BRIEF_MODEL_STACK, ...(brief.modelStack || {}) },
      scaleRegime: normalizeScaleRegime(brief.scaleRegime),
      visualIntent: normalizeVisualIntent(brief.visualIntent),
      compilerContract: {
        groundedClaimsOnly: true,
        mayUseMLForDrafting: true,
        executablePhysicsMustBeCatalogBacked: true,
        unsupportedPhysicsMustBeExplicit: true,
        ...(brief.compilerContract || {}),
      },
      confidence: finiteNumber(brief.confidence, 0),
      provenance: {
        compiler: 'simulatte.intent-brief-schema.v1',
        ...(brief.provenance || {}),
      },
      languageEvidence: normalizeObjectOrNull(brief.languageEvidence),
      activationSummary: normalizeObjectOrNull(brief.activationSummary),
      groundedInterpretation: normalizeObjectOrNull(brief.groundedInterpretation),
    };
    for (const field of REQUIRED_ARRAY_FIELDS) {
      normalized[field] = normalizeRows(brief[field]);
    }
    normalized.evidenceSummary = evidenceSummary(normalized);
    return normalized;
  }

  function validateIntentBrief(brief = {}) {
    const errors = [];
    const warnings = [];
    if (brief.schema !== INTENT_BRIEF_SCHEMA) errors.push('intent brief schema mismatch');
    if (!String(brief.prompt || '').trim()) warnings.push('intent brief prompt is blank');
    for (const field of REQUIRED_ARRAY_FIELDS) {
      if (!Array.isArray(brief[field])) errors.push(`${field} must be an array`);
    }
    for (const edge of brief.causalGraph || []) {
      if (!edge.id) errors.push('causal edge missing id');
      if (!edge.relationType) errors.push(`${edge.id || 'causal edge'} missing relationType`);
      if (!edge.sourceRef && !edge.sourceLabel) errors.push(`${edge.id || 'causal edge'} missing source`);
      if (!edge.targetRef && !edge.targetLabel) errors.push(`${edge.id || 'causal edge'} missing target`);
      if (!Array.isArray(edge.evidence) || !edge.evidence.length) warnings.push(`${edge.id || 'causal edge'} has no evidence`);
    }
    for (const unsupported of brief.unsupported || []) {
      if (!unsupported.reason) warnings.push(`${unsupported.id || unsupported.label || 'unsupported'} missing reason`);
    }
    return {
      schema: 'simulatte.intentBriefValidation.v1',
      valid: errors.length === 0,
      errors,
      warnings,
      metrics: {
        evidence: (brief.retrievedEvidence || []).length,
        languageSpans: brief.languageEvidence && Array.isArray(brief.languageEvidence.spans) ? brief.languageEvidence.spans.length : 0,
        activations: (brief.activationCloud || []).length,
        entities: (brief.entities || []).length,
        materials: (brief.materials || []).length,
        causalEdges: (brief.causalGraph || []).length,
        assumptions: (brief.assumptions || []).length,
        unsupported: (brief.unsupported || []).length,
        degraded: (brief.degradedTo || []).length,
        evidenceBindings: (brief.evidenceBindings || []).length,
        coverageGaps: (brief.coverageGaps || []).length,
        intentFrames: (brief.intentFrames || []).length,
      },
    };
  }

  function compactBriefSummary(brief = {}) {
    return {
      schema: brief.schema || INTENT_BRIEF_SCHEMA,
      prompt: brief.prompt || '',
      modelStack: brief.modelStack || INTENT_BRIEF_MODEL_STACK,
      evidenceCount: (brief.retrievedEvidence || []).length,
      languageSpanCount: brief.languageEvidence && Array.isArray(brief.languageEvidence.spans) ? brief.languageEvidence.spans.length : 0,
      activationCount: (brief.activationCloud || []).length,
      acceptedActivationCount: brief.groundedInterpretation && brief.groundedInterpretation.summary
        ? finiteNumber(brief.groundedInterpretation.summary.acceptedActivationCount, 0)
        : 0,
      entityCount: (brief.entities || []).length,
      materialCount: (brief.materials || []).length,
      causalEdgeCount: (brief.causalGraph || []).length,
      assumptionCount: (brief.assumptions || []).length,
      unsupportedCount: (brief.unsupported || []).length,
      degradedCount: (brief.degradedTo || []).length,
      evidenceBindingCount: (brief.evidenceBindings || []).length,
      coverageGapCount: (brief.coverageGaps || []).length,
      intentFrameCount: (brief.intentFrames || []).length,
      confidence: finiteNumber(brief.confidence, 0),
    };
  }

  function evidenceSummary(brief) {
    const evidence = brief.retrievedEvidence || [];
    const bySource = {};
    for (const row of evidence) {
      const source = String(row.source || row.indexName || 'unknown');
      bySource[source] = (bySource[source] || 0) + 1;
    }
    return {
      schema: 'simulatte.intentBriefEvidenceSummary.v1',
      total: evidence.length,
      bySource,
      languageSpans: brief.languageEvidence && Array.isArray(brief.languageEvidence.spans) ? brief.languageEvidence.spans.length : 0,
      activations: (brief.activationCloud || []).length,
      acceptedActivations: brief.groundedInterpretation && brief.groundedInterpretation.summary
        ? finiteNumber(brief.groundedInterpretation.summary.acceptedActivationCount, 0)
        : 0,
      groundedCausalEdges: (brief.causalGraph || []).filter((edge) => (edge.evidence || []).length).length,
      boundPromptSignals: (brief.evidenceBindings || []).filter((row) => row.kind === 'prompt-signal').length,
      coverageGaps: (brief.coverageGaps || []).length,
    };
  }

  function normalizeRows(rows) {
    return Array.isArray(rows) ? rows.filter(Boolean).map((row) => {
      if (row && typeof row === 'object') return { ...row };
      return { label: String(row) };
    }) : [];
  }

  function normalizeObjectOrNull(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    return { ...value };
  }

  function normalizeScaleRegime(value = {}) {
    if (!value || typeof value !== 'object') {
      return { id: 'scale.unspecified', label: 'unspecified scale', confidence: 0, evidence: [] };
    }
    return {
      id: value.id || 'scale.unspecified',
      label: value.label || 'unspecified scale',
      confidence: finiteNumber(value.confidence, 0),
      evidence: Array.isArray(value.evidence) ? value.evidence.slice() : [],
    };
  }

  function normalizeVisualIntent(value = {}) {
    if (!value || typeof value !== 'object') {
      return { sceneKind: 'generic', camera: 'adaptive-3d-orbit', style: 'physically-annotated-procedural-render', evidence: [] };
    }
    return {
      sceneKind: value.sceneKind || 'generic',
      camera: value.camera || 'adaptive-3d-orbit',
      style: value.style || 'physically-annotated-procedural-render',
      lighting: value.lighting || '',
      motionCue: value.motionCue || '',
      renderMode: value.renderMode || 'semantic-3d-procedural',
      geometry: value.geometry || '',
      shaderHints: Array.isArray(value.shaderHints) ? value.shaderHints.slice() : [],
      motionHints: Array.isArray(value.motionHints) ? value.motionHints.slice() : [],
      affordances: Array.isArray(value.affordances) ? value.affordances.map((row) => ({ ...row })) : [],
      evidence: Array.isArray(value.evidence) ? value.evidence.slice() : [],
    };
  }

  function finiteNumber(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function slugify(value) {
    return String(value || 'item').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item';
  }

  function uniqueStrings(values) {
    return Array.from(new Set((values || []).filter(Boolean).map((value) => String(value))));
  }

  return {
    INTENT_BRIEF_SCHEMA,
    INTENT_BRIEF_MODEL_STACK,
    createEmptyIntentBrief,
    normalizeIntentBrief,
    validateIntentBrief,
    compactBriefSummary,
    slugify,
    uniqueStrings,
  };
});
