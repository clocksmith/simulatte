(function attachSimulatteIntentForensics(root, factory) {
  const schema = typeof module === 'object' && module.exports
    ? require('./simulatte-intent-brief-schema.js')
    : root.SimulatteIntentBriefSchema;
  const structured = typeof module === 'object' && module.exports
    ? require('./simulatte-structured-intent-model.js')
    : root.SimulatteStructuredIntentModel;
  const causal = typeof module === 'object' && module.exports
    ? require('./simulatte-causal-physics-graph.js')
    : root.SimulatteCausalPhysicsGraph;
  const assumptions = typeof module === 'object' && module.exports
    ? require('./simulatte-assumption-ledger.js')
    : root.SimulatteAssumptionLedger;
  const visualAffordances = typeof module === 'object' && module.exports
    ? require('./simulatte-causal-visual-affordances.js')
    : root.SimulatteCausalVisualAffordances;
  const languageEvidence = typeof module === 'object' && module.exports
    ? require('../phase-02-language/simulatte-language-evidence.js')
    : root.SimulatteLanguageEvidence;
  const activationCloud = typeof module === 'object' && module.exports
    ? require('../phase-03-retrieval/simulatte-activation-cloud.js')
    : root.SimulatteActivationCloud;
  const groundedInterpretation = typeof module === 'object' && module.exports
    ? require('./simulatte-grounded-interpretation.js')
    : root.SimulatteGroundedInterpretation;
  const api = factory(schema || {}, structured || {}, causal || {}, assumptions || {}, visualAffordances || {}, languageEvidence || {}, activationCloud || {}, groundedInterpretation || {});
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.SimulatteIntentForensics = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createIntentForensicsApi(schema = {}, structured = {}, causal = {}, assumptions = {}, visualAffordances = {}, languageEvidence = {}, activationCloud = {}, groundedInterpretation = {}) {
  const {
    INTENT_BRIEF_SCHEMA = 'simulatte.intentBrief.v1',
    createEmptyIntentBrief = (prompt) => ({ schema: INTENT_BRIEF_SCHEMA, prompt }),
    normalizeIntentBrief = (brief) => brief,
    validateIntentBrief = () => ({ valid: true, errors: [], warnings: [] }),
    compactBriefSummary = (brief) => ({ schema: brief.schema, prompt: brief.prompt }),
    uniqueStrings = unique,
  } = schema;
  const { draftStructuredIntent } = structured;
  const { buildCausalPhysicsGraph } = causal;
  const { buildAssumptionLedger } = assumptions;
  const { selectCausalVisualAffordances } = visualAffordances;
  const { extractLanguageEvidence } = languageEvidence;
  const { buildActivationCloud, summarizeActivationCloud } = activationCloud;
  const { buildGroundedInterpretation, buildGroundedStructuredIntent } = groundedInterpretation;

  function buildIntentForensics(input = {}) {
    const prompt = String(input.prompt || '');
    const retrievedEvidence = buildEvidenceRows(input);
    const languageEvidence = extractLanguageEvidence
      ? extractLanguageEvidence(prompt)
      : fallbackLanguageEvidence(prompt, input.promptParse);
    const activationCloud = buildActivationCloud
      ? buildActivationCloud({ languageEvidence, evidenceRows: retrievedEvidence })
      : [];
    const activationSummary = summarizeActivationCloud
      ? summarizeActivationCloud(activationCloud)
      : { schema: 'simulatte.activationCloudSummary.v1', activationCount: activationCloud.length };
    const structuredIntentDraft = draftStructuredIntent
      ? draftStructuredIntent({
        prompt,
        evidenceRows: retrievedEvidence,
        languageEvidence,
        activationCloud,
        promptParse: input.promptParse,
        universeMatches: input.universeMatches,
      })
      : { entities: [], materials: [], phenomena: [], forces: [], fields: [], environment: [], observables: [], timeBehavior: [] };
    const initialGrounding = buildGroundedInterpretation
      ? buildGroundedInterpretation({
        languageEvidence,
        activationCloud,
        structuredIntent: structuredIntentDraft,
        causalGraph: [],
        visualAffordances: [],
      })
      : { schema: 'simulatte.groundedInterpretation.v1', acceptedActivations: [], evidenceBindings: [], coverageGaps: [], summary: {} };
    const structuredIntent = buildGroundedStructuredIntent
      ? buildGroundedStructuredIntent({
        languageEvidence,
        activationCloud,
        structuredIntent: structuredIntentDraft,
        groundedInterpretation: initialGrounding,
        evidenceRows: retrievedEvidence,
      })
      : groundStructuredIntent(structuredIntentDraft, initialGrounding);
    const causalGraph = buildCausalPhysicsGraph
      ? buildCausalPhysicsGraph({ languageEvidence, structuredIntent, evidenceRows: retrievedEvidence, groundedInterpretation: initialGrounding })
      : { edges: [] };
    const ledger = buildAssumptionLedger
      ? buildAssumptionLedger({ prompt, evidenceRows: retrievedEvidence, promptParse: input.promptParse })
      : { assumptions: [], alternatives: [], unsupported: [], degradedTo: [], negativeKnowledge: [] };
    const causalVisualAffordances = selectCausalVisualAffordances
      ? selectCausalVisualAffordances({
        languageEvidence,
        structuredIntent,
        causalGraph,
        evidenceRows: retrievedEvidence,
      })
      : [];
    const promptSignals = promptSignalsFor(prompt, input.promptParse);
    const intentFrames = intentFramesFor(prompt, promptSignals, structuredIntent, causalGraph, causalVisualAffordances);
    const finalGrounding = buildGroundedInterpretation
      ? buildGroundedInterpretation({
        languageEvidence,
        activationCloud,
        structuredIntent,
        causalGraph: causalGraph.edges || [],
        visualAffordances: causalVisualAffordances,
      })
      : { schema: 'simulatte.groundedInterpretation.v1', evidenceBindings: [], coverageGaps: [], summary: {} };
    const groundedInterpretation = {
      ...finalGrounding,
      draftGrounding: {
        schema: initialGrounding.schema || '',
        acceptedActivationCount: (initialGrounding.acceptedActivations || []).length,
        evidenceBindingCount: (initialGrounding.evidenceBindings || []).length,
        coverageGapCount: (initialGrounding.coverageGaps || []).length,
      },
    };
    const evidenceBindings = uniqueById([
      ...(groundedInterpretation.evidenceBindings || []),
      ...evidenceBindingsFor(promptSignals, structuredIntent, causalGraph, causalVisualAffordances, retrievedEvidence),
    ]);
    const coverageGaps = uniqueById([
      ...(groundedInterpretation.coverageGaps || []),
      ...coverageGapsFor(prompt, structuredIntent, causalGraph, ledger, causalVisualAffordances, retrievedEvidence),
    ]);
    const causalQuestions = causalQuestionsFor(prompt, structuredIntent, causalGraph, coverageGaps);
    const base = createEmptyIntentBrief(prompt);
    const brief = normalizeIntentBrief({
      ...base,
      prompt,
      retrievedEvidence,
      languageEvidence,
      activationCloud,
      activationSummary,
      groundedInterpretation,
      promptSignals,
      entities: structuredIntent.entities || [],
      materials: structuredIntent.materials || [],
      phenomena: structuredIntent.phenomena || [],
      forces: structuredIntent.forces || [],
      fields: structuredIntent.fields || [],
      scaleRegime: structuredIntent.scaleRegime || base.scaleRegime,
      environment: structuredIntent.environment || [],
      timeBehavior: structuredIntent.timeBehavior || [],
      causalGraph: causalGraph.edges || [],
      observables: structuredIntent.observables || [],
      visualIntent: enrichVisualIntent(structuredIntent.visualIntent || base.visualIntent, causalVisualAffordances),
      assumptions: ledger.assumptions || [],
      alternatives: ledger.alternatives || [],
      unsupported: mergeUnsupported(ledger.unsupported, input.unsupported),
      degradedTo: ledger.degradedTo || [],
      negativeKnowledge: ledger.negativeKnowledge || [],
      intentFrames,
      evidenceBindings,
      coverageGaps,
      causalQuestions,
      confidence: confidenceForBrief(structuredIntent, causalGraph, retrievedEvidence, ledger),
      provenance: {
        compiler: 'simulatte.intent-forensics.v1',
        retrieval: input.embeddingModel && input.embeddingModel.id || 'catalog-and-embedding-evidence',
        structuredModel: structuredIntentDraft.model || null,
        structuredDraftSchema: structuredIntentDraft.schema || '',
        groundingGate: initialGrounding.schema || '',
        causalGraph: causalGraph.schema || '',
        assumptionLedger: ledger.schema || '',
        synthesis: input.synthesis && input.synthesis.schema || '',
      },
      causalVisualAffordances,
    });
    const validation = validateIntentBrief(brief);
    return {
      ...brief,
      validation,
      summary: compactBriefSummary(brief),
    };
  }

  function enrichVisualIntent(visualIntent = {}, affordances = []) {
    const primary = affordances[0] || null;
    const shaderHints = uniqueStrings([
      ...(visualIntent.shaderHints || []),
      ...affordances.flatMap((row) => row.shaderHints || []),
    ]);
    const motionHints = uniqueStrings([
      ...(visualIntent.motionHints || []),
      ...affordances.flatMap((row) => row.motionHints || []),
    ]);
    return {
      ...visualIntent,
      sceneKind: primary && primary.sceneKind || visualIntent.sceneKind || 'generic',
      renderMode: 'semantic-3d-procedural',
      geometry: primary && primary.geometry || visualIntent.geometry || '',
      shaderHints,
      motionHints,
      motionCue: visualIntent.motionCue || motionHints[0] || '',
      affordances: affordances.map((row) => ({
        id: row.id,
        causalRelationId: row.causalRelationId,
        sceneKind: row.sceneKind,
        geometry: row.geometry,
        shaderHints: row.shaderHints || [],
        motionHints: row.motionHints || [],
        score: row.score,
      })),
      evidence: uniqueStrings([
        ...(visualIntent.evidence || []),
        ...affordances.map((row) => row.id),
      ]),
    };
  }

  function groundStructuredIntent(draft = {}, grounding = {}) {
    const acceptedActivations = Array.isArray(grounding.acceptedActivations) ? grounding.acceptedActivations : [];
    const acceptedIds = new Set();
    const acceptedText = [];
    acceptedActivations.forEach((row) => {
      [
        row.activationId,
        row.candidateId,
        row.candidateLabel,
        row.spanId,
        row.spanText,
      ].filter(Boolean).forEach((value) => {
        acceptedIds.add(normalizeKey(value));
        acceptedText.push(normalizeKey(value));
      });
    });
    const groundedRows = (rows) => (Array.isArray(rows) ? rows : [])
      .filter((row) => rowGroundedByAcceptedActivation(row, acceptedIds, acceptedText))
      .map((row) => annotateGroundedRow(row, grounding));
    const visualIntent = groundVisualIntent(draft.visualIntent || {}, acceptedActivations, acceptedIds, acceptedText);
    return {
      ...draft,
      schema: 'simulatte.groundedStructuredIntent.v1',
      draftSchema: draft.schema || '',
      entities: groundedRows(draft.entities),
      materials: groundedRows(draft.materials),
      phenomena: groundedRows(draft.phenomena),
      forces: groundedRows(draft.forces),
      fields: groundedRows(draft.fields),
      environment: groundedRows(draft.environment),
      observables: groundedRows(draft.observables),
      timeBehavior: groundedRows(draft.timeBehavior),
      visualIntent,
      grounding: {
        schema: grounding.schema || '',
        acceptedActivationCount: acceptedActivations.length,
        gate: 'accepted-activation-required-before-causal-graph',
      },
      provenance: {
        ...(draft.provenance || {}),
        groundedBy: grounding.schema || 'simulatte.groundedInterpretation.v1',
        draftSchema: draft.schema || '',
      },
    };
  }

  function groundVisualIntent(visualIntent, acceptedActivations, acceptedIds, acceptedText) {
    const hasVisualGrounding = acceptedActivations.some((row) => (
      row.candidateKind === 'visual-candidate' ||
      row.candidateKind === 'causal-candidate' ||
      rowGroundedByAcceptedActivation(visualIntent, acceptedIds, acceptedText)
    ));
    if (!hasVisualGrounding) {
      return {
        sceneKind: 'generic',
        renderMode: 'semantic-3d-procedural',
        geometry: '',
        shaderHints: [],
        motionHints: [],
        motionCue: '',
        affordances: [],
        evidence: [],
        grounding: 'no-accepted-visual-activation',
      };
    }
    return {
      ...visualIntent,
      evidence: unique([
        ...(visualIntent.evidence || []),
        ...acceptedActivations
          .filter((row) => row.candidateKind === 'visual-candidate' || row.candidateKind === 'causal-candidate')
          .map((row) => row.activationId || row.candidateId),
      ]),
      grounding: 'accepted-activation',
    };
  }

  function rowGroundedByAcceptedActivation(row, acceptedIds, acceptedText) {
    const values = rowValues(row).map(normalizeKey).filter(Boolean);
    if (values.some((value) => acceptedIds.has(value))) return true;
    const evidence = row && typeof row === 'object' && Array.isArray(row.evidence) ? row.evidence : [];
    if (evidence.some((value) => acceptedIds.has(normalizeKey(value)))) return true;
    const text = values.join(' ');
    if (!text) return false;
    return acceptedText.some((accepted) => accepted.length > 1 && (text.includes(accepted) || accepted.includes(text)));
  }

  function annotateGroundedRow(row, grounding) {
    if (!row || typeof row !== 'object') return row;
    return {
      ...row,
      grounding: {
        decision: 'accepted-before-causal-graph',
        source: grounding.schema || 'simulatte.groundedInterpretation.v1',
      },
    };
  }

  function rowValues(row) {
    if (row === undefined || row === null) return [];
    if (typeof row !== 'object') return [row];
    return [
      row.id,
      row.label,
      row.name,
      row.kind,
      row.type,
      row.family,
      row.sceneKind,
      row.geometry,
      row.materialId,
      row.operatorType,
      ...arrayValues(row.evidence),
      ...arrayValues(row.aliases),
      ...arrayValues(row.shaderHints),
      ...arrayValues(row.motionHints),
    ].filter(Boolean);
  }

  function arrayValues(value) {
    if (Array.isArray(value)) return value;
    return value === undefined || value === null || value === '' ? [] : [value];
  }

  function normalizeKey(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9_.-]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function buildEvidenceRows(input = {}) {
    const rows = [];
    addRows(rows, input.evidenceRows, 'intent-evidence');
    addRows(rows, input.retrievedEvidence, 'retrieved-evidence');
    addRows(rows, input.embeddingPriors, 'embedding-prior');
    addRows(rows, input.cardMatches || input.surfaceCardMatches, 'surface-card');
    addRows(rows, input.universeMatches && input.universeMatches.candidates, 'universe-candidate');
    for (const [indexName, matches] of Object.entries(input.universeMatches && input.universeMatches.byIndex || {})) {
      addRows(rows, matches, indexName);
    }
    addRows(rows, input.semanticRag && input.semanticRag.openComponents, 'semantic-rag-component');
    addRows(rows, input.semanticRag && input.semanticRag.surfaceRetrieved, 'semantic-rag-surface');
    addRows(rows, input.dopplerIntent && input.dopplerIntent.primitives, 'doppler-intent');
    addRows(rows, input.spanRetrieval && input.spanRetrieval.evidenceRows, 'span-retrieval');
    return uniqueEvidence(rows)
      .sort((a, b) => Number(b.score || 0) - Number(a.score || 0) || String(a.id).localeCompare(String(b.id)))
      .slice(0, 160);
  }

  function fallbackLanguageEvidence(prompt, promptParse = {}) {
    const text = String(prompt || '').replace(/\s+/g, ' ').trim();
    const spans = [
      { id: 'span.001', kind: 'prompt', text },
      ...(promptParse.spans || []).map((row, index) => ({
        id: row.id || `span.${String(index + 2).padStart(3, '0')}`,
        kind: row.kind || 'parse-span',
        text: row.text || row.label || '',
      })),
    ].filter((row) => row.text);
    return {
      schema: 'simulatte.languageEvidence.v1',
      rawText: prompt,
      normalizedText: text,
      tokens: [],
      spans,
      clauses: text ? [{ id: 'clause.001', text, connector: null }] : [],
      nounPhrases: [],
      verbPhrases: [],
      predicateFrames: [],
      modifiers: [],
      prepositions: [],
      negations: [],
      comparisons: [],
      quantities: [],
      temporalOrdering: [],
      causalConnectives: [],
      resultClauses: [],
      ambiguityMarkers: [],
      summary: {
        tokenCount: 0,
        spanCount: spans.length,
        clauseCount: text ? 1 : 0,
        predicateFrameCount: 0,
        hasCausalLanguage: false,
        hasTemporalLanguage: false,
        hasUncertaintyLanguage: false,
      },
    };
  }

  function addRows(out, rows, fallbackSource) {
    for (const row of rows || []) {
      if (!row) continue;
      const id = row.id || row.cardId || row.primitiveId || row.canonicalId || row.label || row.phrase || `${fallbackSource}.${out.length + 1}`;
      out.push({
        id: String(id),
        label: row.label || row.role || row.phrase || row.cardId || row.primitiveId || row.canonicalId || String(id),
        source: row.source || fallbackSource,
        indexName: row.indexName || fallbackSource,
        semanticType: row.semanticType || row.type || row.kind || '',
        score: Number(row.score || row.confidence || row.modelScore || row.semanticScore || 0),
        aliases: row.aliases || row.labels || [],
        candidateText: row.candidateText || row.text || '',
        materialId: row.materialId || row.material || '',
        materialIds: row.materialIds || (row.materialId || row.material ? [row.materialId || row.material] : []),
        operatorHints: row.operatorHints || row.operatorTypes || row.operators || [],
        primitiveHints: row.primitiveHints || (row.primitiveId ? [row.primitiveId] : []),
        conceptIds: row.conceptIds || row.concepts || [],
        evidence: row.evidence || [String(id)],
      });
    }
  }

  function promptSignalsFor(prompt, promptParse = {}) {
    const signals = [];
    const text = String(prompt || '').toLowerCase();
    const add = (id, label, evidence = ['prompt-text'], extra = {}) => signals.push({ id, label, evidence, ...extra });
    if (/\b(over|under|inside|through|around|between|onto|along)\b/.test(text)) add('signal.spatial-relation', 'spatial relation words');
    if (/\b(heats|cools|drives|pushes|pulls|melts|freezes|burns|flows|grows|collides|orbits|stabilizes|feeds|erodes|confines|splits|bleaches|corrodes)\b/.test(text)) {
      add('signal.causal-verb', 'causal process verb', ['prompt-text'], { kind: 'causal-language' });
    }
    if (/\b(temperature|pressure|speed|velocity|damage|energy|entropy|throughput)\b/.test(text)) add('signal.observable', 'observable requested');
    if (/\b(beautiful|cinematic|render|visual|glowing|transparent|volumetric|macro|wide)\b/.test(text)) add('signal.visual-intent', 'visual language requested');
    if (/\b(controller|feedback|sensor|throttle|stabilize|stabilizes|regulate|regulates)\b/.test(text)) add('signal.control-loop', 'control or feedback language');
    if (/\b(cutaway|cross-section|section|slice|inside|internal)\b/.test(text)) add('signal.cutaway', 'cutaway or internal view requested');
    if (/\b(micro|macro|planet|orbital|molecular|quantum|city|landscape|warehouse|factory|data center)\b/.test(text)) add('signal.scale-context', 'scale or domain context');
    for (const role of promptRoleSignals(text)) signals.push(role);
    for (const span of promptParse.spans || []) {
      signals.push({ id: span.id || `span.${signals.length + 1}`, label: span.text, kind: span.kind, evidence: ['prompt-parse'] });
    }
    return signals.slice(0, 48);
  }

  function promptRoleSignals(text) {
    const rows = [];
    const pairs = [
      ['role.thermal-source', ['lava', 'laser', 'fire', 'hot server', 'battery', 'current'], 'thermal source'],
      ['role.cooling-sink', ['cooling', 'cold', 'coolant', 'fan', 'rain', 'ice'], 'cooling sink'],
      ['role.flow-medium', ['water', 'air', 'wind', 'river', 'coolant', 'blood', 'steam'], 'flow medium'],
      ['role.structure', ['bridge', 'transformer', 'rack', 'mold', 'tooling', 'wall', 'membrane'], 'physical structure'],
      ['role.signal-network', ['grid', 'network', 'queue', 'packet', 'controller', 'sensor', 'inverter'], 'signal or network system'],
      ['role.growth-medium', ['algae', 'root', 'biofilm', 'coral', 'plant', 'protein'], 'biological or growth system'],
    ];
    for (const [id, terms, label] of pairs) {
      const hits = terms.filter((term) => text.includes(term));
      if (hits.length) rows.push({ id, label, kind: 'prompt-role', evidence: ['prompt-text'], terms: hits });
    }
    return rows;
  }

  function intentFramesFor(prompt, promptSignals, structuredIntent, causalGraph, affordances) {
    const text = String(prompt || '').toLowerCase();
    const frames = [];
    const add = (id, label, evidence, fields = {}) => frames.push({ id, label, evidence, ...fields });
    if ((causalGraph.edges || []).length) {
      add('frame.causal-mechanism', 'causal mechanism frame', (causalGraph.edges || []).map((edge) => edge.id), {
        edgeCount: (causalGraph.edges || []).length,
      });
    }
    if ((affordances || []).length) {
      add('frame.renderable-phenomenon', 'renderable phenomenon frame', affordances.map((row) => row.id), {
        affordanceCount: affordances.length,
        sceneKinds: unique((affordances || []).map((row) => row.sceneKind)),
      });
    }
    if ((structuredIntent.observables || []).length || /\b(show|measure|track|plot|display|readout)\b/.test(text)) {
      add('frame.observable-state', 'observable state frame', unique([
        ...((structuredIntent.observables || []).map((row) => row.id)),
        'prompt-text',
      ]));
    }
    if ((promptSignals || []).some((row) => row.id === 'signal.control-loop')) {
      add('frame.closed-loop-control', 'closed-loop control frame', ['signal.control-loop']);
    }
    return frames.slice(0, 12);
  }

  function evidenceBindingsFor(promptSignals, structuredIntent, causalGraph, affordances, evidenceRows) {
    const evidenceText = (evidenceRows || []).map((row) => ({
      id: row.id,
      text: [row.id, row.label, row.candidateText, ...(row.aliases || [])].join(' ').toLowerCase(),
    }));
    const bindTerms = (terms) => evidenceText
      .filter((row) => terms.some((term) => row.text.includes(term)))
      .map((row) => row.id)
      .slice(0, 8);
    const rows = [];
    for (const signal of promptSignals || []) {
      const terms = unique([signal.label, ...(signal.terms || [])].join(' ').toLowerCase().split(/[^a-z0-9]+/).filter((term) => term.length > 2));
      rows.push({
        id: `binding.${signal.id || rows.length + 1}`,
        kind: 'prompt-signal',
        sourceId: signal.id,
        evidence: unique([...(signal.evidence || []), ...bindTerms(terms)]),
      });
    }
    for (const edge of causalGraph.edges || []) {
      rows.push({
        id: `binding.${edge.id || rows.length + 1}`,
        kind: 'causal-edge',
        sourceId: edge.id,
        evidence: edge.evidence || [],
      });
    }
    for (const row of affordances || []) {
      rows.push({
        id: `binding.${row.id || rows.length + 1}`,
        kind: 'visual-affordance',
        sourceId: row.id,
        evidence: unique([row.causalRelationId, ...(row.triggers || [])].filter(Boolean)),
      });
    }
    for (const group of ['entities', 'materials', 'phenomena', 'forces', 'fields']) {
      for (const item of structuredIntent[group] || []) {
        rows.push({
          id: `binding.${group}.${item.id || rows.length + 1}`,
          kind: group.slice(0, -1),
          sourceId: item.id,
          evidence: item.evidence || [],
        });
      }
    }
    return uniqueById(rows).slice(0, 96);
  }

  function coverageGapsFor(prompt, structuredIntent, causalGraph, ledger, affordances, evidenceRows) {
    const gaps = [];
    const text = String(prompt || '').toLowerCase();
    const add = (id, label, severity, evidence = ['intent-audit']) => gaps.push({ id, label, severity, evidence });
    if (/\b(heats|cools|drives|pushes|melts|freezes|flows|stabilizes|erodes|confines|splits|grows)\b/.test(text) && !(causalGraph.edges || []).length) {
      add('gap.causal-verb-without-edge', 'prompt has causal language but no admitted causal edge', 'high', ['prompt-text']);
    }
    if ((structuredIntent.entities || []).length < 2 && /\b(where|with|between|into|through|over|under)\b/.test(text)) {
      add('gap.too-few-entities', 'prompt implies multiple participants but intent has fewer than two entities', 'medium', ['prompt-text']);
    }
    if (!(structuredIntent.materials || []).length && /\b(metal|water|air|lava|ice|plastic|soil|glass|silicon|polymer|blood)\b/.test(text)) {
      add('gap.material-mentioned-not-grounded', 'prompt names material language but no material slot was grounded', 'medium', ['prompt-text']);
    }
    if (!(affordances || []).length && (causalGraph.edges || []).length) {
      add('gap.causal-edge-without-visual-affordance', 'causal edge exists but no visual affordance was selected', 'medium', (causalGraph.edges || []).map((edge) => edge.id));
    }
    if ((ledger.unsupported || []).length) {
      add('gap.unsupported-semantics', 'unsupported semantics remain in prompt', 'high', (ledger.unsupported || []).map((row) => row.id));
    }
    if ((evidenceRows || []).length < 4 && String(prompt || '').trim()) {
      add('gap.low-retrieval-evidence', 'retrieval produced sparse evidence for the prompt', 'medium', ['retrieval']);
    }
    return uniqueById(gaps).slice(0, 24);
  }

  function causalQuestionsFor(prompt, structuredIntent, causalGraph, coverageGaps) {
    const rows = [];
    if ((coverageGaps || []).some((gap) => gap.id === 'gap.causal-verb-without-edge')) {
      rows.push({
        id: 'question.causal-participants',
        label: 'Which named entity causes which named effect?',
        evidence: ['gap.causal-verb-without-edge'],
      });
    }
    if ((structuredIntent.materials || []).length > 1 && !(causalGraph.edges || []).length) {
      rows.push({
        id: 'question.material-interaction',
        label: 'Do the named materials exchange heat, force, mass, or signal?',
        evidence: (structuredIntent.materials || []).map((row) => row.id).slice(0, 8),
      });
    }
    if (/\b(exact|full fidelity|realistic|all physics)\b/i.test(String(prompt || ''))) {
      rows.push({
        id: 'question.fidelity-boundary',
        label: 'What approximation boundary is acceptable for this simulation?',
        evidence: ['prompt-text'],
      });
    }
    return rows;
  }

  function confidenceForBrief(structuredIntent, causalGraph, evidenceRows, ledger) {
    const evidenceScore = Math.min(0.34, evidenceRows.length / 120);
    const structureScore = Math.min(0.26, (
      (structuredIntent.entities || []).length +
      (structuredIntent.materials || []).length +
      (structuredIntent.phenomena || []).length
    ) / 80);
    const causalScore = Math.min(0.28, ((causalGraph.edges || []).length) / 32);
    const penalty = Math.min(0.22, ((ledger.unsupported || []).length + (ledger.degradedTo || []).length) * 0.04);
    return Number(Math.max(0.05, Math.min(0.96, 0.18 + evidenceScore + structureScore + causalScore - penalty)).toFixed(4));
  }

  function mergeUnsupported(a = [], b = []) {
    return uniqueById([...(a || []), ...(b || [])]);
  }

  function uniqueEvidence(rows) {
    const seen = new Set();
    return (rows || []).filter((row) => {
      const key = `${row.id}:${row.source}`.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function uniqueById(rows) {
    const seen = new Set();
    return (rows || []).filter((row) => {
      const key = row.id || JSON.stringify(row);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function unique(values) {
    return Array.from(new Set((values || []).filter(Boolean).map((value) => String(value))));
  }

  return {
    INTENT_BRIEF_SCHEMA,
    buildIntentForensics,
    buildEvidenceRows,
  };
});
