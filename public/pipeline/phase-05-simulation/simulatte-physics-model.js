(function attachSimulattePhysicsModel(root, factory) {
  function markMissingDependency(moduleName, dependencyName) {
    const state = root.SimulatteBoot = root.SimulatteBoot || { failedScripts: [] };
    state.missingDependencies = state.missingDependencies || [];
    state.missingDependencies.push({ moduleName, dependencyName });
    console.warn(`[simulatte.boot] ${moduleName} waiting for ${dependencyName}`);
  }

  const catalog = typeof module === 'object' && module.exports
    ? require('./simulatte-physics-catalog.js')
    : root.SimulattePhysicsCatalog;
  const composer = typeof module === 'object' && module.exports
    ? require('../phase-06-visual/simulatte-composition-graph.js')
    : root.SimulatteCompositionGraph;
  const classifier = typeof module === 'object' && module.exports
    ? require('../phase-03-retrieval/simulatte-intent-classifier.js')
    : root.SimulatteIntentClassifier;
  const semantic = typeof module === 'object' && module.exports
    ? require('../phase-03-retrieval/simulatte-semantic-rag.js')
    : root.SimulatteSemanticRag;
  const doppler = typeof module === 'object' && module.exports
    ? require('../phase-01-runtime/simulatte-doppler-intent.js')
    : root.SimulatteDopplerIntent;
  const graphSynthesis = typeof module === 'object' && module.exports
    ? require('../phase-04-grounded-intent/simulatte-graph-synthesis.js')
    : root.SimulatteGraphSynthesis;
  const universeParser = typeof module === 'object' && module.exports
    ? require('../phase-02-language/simulatte-universe-parser.js')
    : root.SimulatteUniverseParser;
  const universeGrounder = typeof module === 'object' && module.exports
    ? require('../phase-04-grounded-intent/simulatte-universe-grounder.js')
    : root.SimulatteUniverseGrounder;
  const physicsIR = typeof module === 'object' && module.exports
    ? require('./simulatte-physics-ir.js')
    : root.SimulattePhysicsIR;
  const physicsIRValidator = typeof module === 'object' && module.exports
    ? require('./simulatte-physics-ir-validator.js')
    : root.SimulattePhysicsIRValidator;
  const solverCompiler = typeof module === 'object' && module.exports
    ? require('./simulatte-solver-compiler.js')
    : root.SimulatteSolverCompiler;
  const renderIR = typeof module === 'object' && module.exports
    ? require('./simulatte-render-ir.js')
    : root.SimulatteRenderIR;
  const intentForensics = typeof module === 'object' && module.exports
    ? require('../phase-04-grounded-intent/simulatte-intent-forensics.js')
    : root.SimulatteIntentForensics;
  const activationModule = typeof module === 'object' && module.exports
    ? require('../phase-03-retrieval/simulatte-activation-cloud.js')
    : root.SimulatteActivationCloud;
  const groundedModule = typeof module === 'object' && module.exports
    ? require('../phase-04-grounded-intent/simulatte-grounded-interpretation.js')
    : root.SimulatteGroundedInterpretation;
  if (!catalog) {
    markMissingDependency('SimulattePhysicsModel', 'SimulattePhysicsCatalog');
    return;
  }
  const api = factory(
    catalog,
    composer,
    classifier,
    semantic,
    doppler,
    graphSynthesis,
    universeParser,
    universeGrounder,
    physicsIR,
    physicsIRValidator,
    solverCompiler,
    renderIR,
    intentForensics,
    activationModule,
    groundedModule
  );
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.SimulattePhysicsModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createPhysicsModel(
  catalog,
  composer = {},
  classifier = {},
  semantic = {},
  doppler = {},
  graphSynthesis = {},
  universeParser = {},
  universeGrounder = {},
  physicsIR = {},
  physicsIRValidator = {},
  solverCompiler = {},
  renderIR = {},
  intentForensics = {},
  activationModule = {},
  groundedModule = {}
) {
  const {
    CONTROL_LIBRARY,
    DEFAULT_PARAMS,
    EXAMPLE_INTENTS,
    FIELD_GRID,
    PHYSICAL_PRIMITIVES,
    SEMANTIC_STOPWORDS,
    TAU,
    TEMPLATE_LIBRARY,
    TOKEN_SYNONYMS,
    buildIntentVector,
    clamp,
    clamp01,
    contractSummaryForPrimitives,
    controlsByKey,
    visualSlotTargetsForAction,
    controlsForSpec,
    explicitPrimitiveScore,
    hashNoise,
    labelize,
    meaningfulTokens,
    normalizeControl,
    normalizeObjects,
    normalizeParams,
    primitiveById,
    primitiveText,
    rankPhysicalPrimitives,
    shortestAngle,
    slugify,
    templateById,
    unitsForParams,
    uniqueList,
    vectorScore,
    withPrimitiveDependencies,
    wrapAngle,
  } = catalog;
  const {
    COMPOSITION_SCHEMA,
    RENDER_PROGRAM_SCHEMA,
    buildCompositionGraph,
    compileCompositionToRenderProgram,
  } = composer || {};
  const {
    INTENT_CLASSIFICATION_SCHEMA,
    INTENT_MODEL_ID,
    classificationSummary,
    classifyIntentPrompt,
    rankPrimitivesForClassification,
  } = classifier || {};
  const {
    SEMANTIC_RAG_SCHEMA,
    buildPrimitiveProgram,
    createSemanticRag,
  } = semantic || {};
  const {
    DOPPLER_INTENT_SCHEMA,
    normalizeDopplerIntent,
  } = doppler || {};
  const {
    SYNTHESIS_SCHEMA,
    groundedPrimitiveRows,
    synthesizeWorldIntent,
  } = graphSynthesis || {};
  const {
    PROMPT_PARSE_SCHEMA,
    parsePrompt,
  } = universeParser || {};
  const {
    UNIVERSE_GRAPH_SCHEMA,
    groundUniverseGraph,
  } = universeGrounder || {};
  const {
    PHYSICAL_IR_SCHEMA,
    buildPhysicsIR,
  } = physicsIR || {};
  const {
    VALIDATION_RECEIPT_SCHEMA,
    validatePhysicsIR,
  } = physicsIRValidator || {};
  const {
    SOLVER_GRAPH_SCHEMA,
    compileSolverGraph,
    createSolverState,
    stepSolverState,
    deriveChannelSummary,
  } = solverCompiler || {};
  const {
    RENDER_IR_SCHEMA,
    compileRenderIR,
  } = renderIR || {};
  const {
    INTENT_BRIEF_SCHEMA,
    buildIntentForensics,
  } = intentForensics || {};
  const {
    buildActivationCloud,
    summarizeActivationCloud,
  } = activationModule || {};
  const {
    buildGroundedInterpretation,
  } = groundedModule || {};

  const PHASE_OUTPUT_SCHEMAS = Object.freeze({
    1: 'simulatte.phase1.output.v1',
    2: 'simulatte.phase2.output.v1',
    3: 'simulatte.phase3.output.v2',
    4: 'simulatte.phase4.output.v2',
    5: 'simulatte.phase5.output.v2',
    6: 'simulatte.phase6.output.v2',
    7: 'simulatte.phase7.output.v2',
    8: 'simulatte.phase8.output.v2',
	  });
	  const PHASE_ZERO_INPUT_SCHEMA = 'simulatte.phase0.input.v1';
	  const RENDER_EXECUTION_INPUT_SCHEMA = 'simulatte.renderExecutionInput.v1';
	  const SCENE_COMPOSITION_LEDGER_SCHEMA = 'simulatte.sceneCompositionLedger.v1';
	  const SCENE_LANGUAGE_GRAPH_SCHEMA = 'simulatte.sceneLanguageGraph.v1';
	  const SCENE_QUERY_PLAN_SCHEMA = 'simulatte.sceneQueryPlan.v1';
	  const RETRIEVAL_RERANK_RESULT_SCHEMA = 'simulatte.retrievalRerankResult.v2';
	  const ACTIVATION_CLOUD_SCHEMA = 'simulatte.activationCloud.v2';
	  const GROUNDED_SCENE_CONTRACT_SCHEMA = 'simulatte.groundedSceneContract.v1';
	  const SIMULATION_COMPILE_SCHEMA = 'simulatte.simulationCompile.v2';
	  const VISUAL_COMPILE_SCHEMA = 'simulatte.visualCompile.v2';
	  const RENDER_EXECUTION_SCHEMA = 'simulatte.renderExecution.v2';
	  const LEDGER_FAILURE_STATUSES = Object.freeze(new Set(['lost', 'failed', 'wrong-identity', 'not-proven']));
	  const PHASE_CARRY_FORBIDDEN_FIELD_NAMES = Object.freeze([
    'activationCloud',
    'rankedPrimitives',
    'rankedCards',
    'rankedUniverseRows',
    'semanticRag',
    'physicsIR',
    'renderIR',
    'visualIR',
    'renderProgram',
  ]);
  const PHASE3_GENERIC_PROMPT_MATCH_VALUES = Object.freeze(new Set([
    'body',
    'component',
    'constraint',
    'entity',
    'field',
    'material',
    'math',
    'object',
    'physics',
    'process',
  ]));
  const WATER_ENVIRONMENT_RE = /\b(?:lake|pool|beach|pond|river|ocean)\b/;
  const WATER_MEDIUM_RE = /\b(?:water|fluid)\b/;
  const SWIMMING_RE = /\b(?:swim|swims|swimming|swam)\b/;
  const NEGATION_RE = /\b(?:no|not|never|without|none|cannot|can't|wont|won't)\b/;
  const PHASE_CONTRACTS = Object.freeze({
	    1: phaseContract(1, PHASE_ZERO_INPUT_SCHEMA, ['runtimeContext', 'promptIngress', 'compositionLedger'], [
      'phase1-runtime-context',
      'model-ready',
      'model-probe',
      'cache-health',
      'runtime-ready',
    ], []),
	    2: phaseContract(2, phaseOutputSchema(1), ['languageGraph', 'sceneLanguageGraph', 'queryPlan', 'compositionLedger', 'promptParse'], ['phase2-language-graph'], [
      'retrievalRows',
      'activationCloud',
      'groundedIntent',
      'renderIR',
      'visualIR',
      'renderProgram',
    ]),
	    3: phaseContract(3, phaseOutputSchema(2), ['languageGraph', 'sceneLanguageGraph', 'queryPlan', 'retrievalRerankResult', 'activationCloud', 'compositionLedger'], ['phase3-retrieval-rerank', 'phase3-activation-fusion'], [
      'rawPrompt',
      'spec.intent',
      'groundedIntent',
      'physicsIR',
      'renderIR',
      'visualIR',
      'renderProgram',
    ]),
	    4: phaseContract(4, phaseOutputSchema(3), ['activationCloud', 'groundedIntent', 'groundedSceneContract', 'compositionLedger'], ['phase4-grounded-intent'], [
      'rawPrompt',
      'rankedPrimitives',
      'rankedCards',
      'rankedUniverseRows',
      'semanticRag',
      'physicsIR',
      'renderIR',
      'visualIR',
      'renderProgram',
    ]),
	    5: phaseContract(5, phaseOutputSchema(4), ['simulationCompile', 'compositionLedger'], ['phase5-simulation-compile'], [
      'rawPrompt',
      'retrievalRows',
      'activationCloudWithoutPhase4',
      'renderProgram',
      'visualIR',
    ]),
	    6: phaseContract(6, phaseOutputSchema(5), ['visualCompile', 'compositionLedger'], ['phase6-visual-compile'], [
      'rawPrompt',
      'spec.intent',
      'retrievalRows',
      'activationCloud',
      'groundedIntentDirect',
      'renderProgram.visualIR',
    ]),
	    7: phaseContract(7, phaseOutputSchema(6), ['renderExecution', 'compositionLedger'], ['phase7-webgpu-render'], [
      'rawPrompt',
      'promptParse',
      'spec.intent',
      'retrievalRows',
      'activationCloud',
      'groundedIntent',
      'renderIR',
      'visualIR',
      'renderProgram',
    ]),
	    8: phaseContract(8, phaseOutputSchema(7), ['sceneProof', 'compositionLedger'], ['phase8-scene-proof'], [
      'rawPrompt',
      'promptParse',
      'spec.intent',
      'retrievalRows',
      'activationCloud',
      'groundedIntent',
      'renderIR',
      'visualIR',
      'renderProgram',
    ]),
  });

  function phaseOutputSchema(phase) {
    return PHASE_OUTPUT_SCHEMAS[Number(phase)] || `simulatte.phase${Number(phase) || 0}.output.v1`;
  }

  function phaseContract(phase, inputSchema, artifactKeys, receiptIds, forbiddenUpstreamReads) {
    return Object.freeze({
      phase,
      inputSchema,
      artifactKeys: Object.freeze(artifactKeys),
      receiptIds: Object.freeze(receiptIds),
      forbiddenUpstreamReads: Object.freeze(forbiddenUpstreamReads),
    });
  }

  function createPhaseEnvelope({ phase, inputSchema, runtimeReceiptId, artifact = {}, receipts = [] }) {
    const phaseNumber = Number(phase);
    if (!Number.isInteger(phaseNumber) || phaseNumber < 1 || phaseNumber > 8) {
      throw new Error(`Invalid Simulatte phase envelope phase: ${phase}`);
    }
    return {
      schema: phaseOutputSchema(phaseNumber),
      phase: phaseNumber,
      inputSchema: inputSchema || (phaseNumber === 1 ? PHASE_ZERO_INPUT_SCHEMA : phaseOutputSchema(phaseNumber - 1)),
      runtimeReceiptId: String(runtimeReceiptId || 'runtime:unknown'),
      artifact: artifact && typeof artifact === 'object' ? artifact : {},
      receipts: Array.isArray(receipts) ? receipts.filter(Boolean) : [],
    };
  }

  function assertPhaseEnvelope(envelope, phase, label = 'phase boundary') {
    const expected = phaseOutputSchema(phase);
    if (!envelope || envelope.schema !== expected || Number(envelope.phase) !== Number(phase)) {
      const received = envelope && envelope.schema ? envelope.schema : typeof envelope;
      throw new Error(`${label} expected ${expected}, received ${received}`);
    }
    const contract = PHASE_CONTRACTS[Number(phase)];
    if (contract && envelope.inputSchema !== contract.inputSchema) {
      throw new Error(`${label} expected inputSchema ${contract.inputSchema}, received ${envelope.inputSchema || 'missing'}`);
    }
    if (!envelope.artifact || typeof envelope.artifact !== 'object' || Array.isArray(envelope.artifact)) {
      throw new Error(`${label} expected artifact object`);
    }
    for (const key of contract ? contract.artifactKeys : []) {
      if (!(key in envelope.artifact)) {
        throw new Error(`${label} missing artifact.${key}`);
      }
    }
    if (contract) {
      const allowedArtifactKeys = new Set(contract.artifactKeys);
      for (const key of Object.keys(envelope.artifact)) {
        if (!allowedArtifactKeys.has(key)) {
          throw new Error(`${label} unexpected artifact.${key}`);
        }
      }
    }
    if (!Array.isArray(envelope.receipts)) {
      throw new Error(`${label} expected receipts array`);
    }
    const receiptIds = new Set(envelope.receipts.map((receipt) => receipt && receipt.id).filter(Boolean));
    for (const required of contract ? contract.receiptIds : []) {
      if (!receiptIds.has(required)) {
        throw new Error(`${label} missing receipt ${required}`);
      }
    }
    for (const receipt of envelope.receipts) {
      if (!receipt || receipt.schema !== 'simulatte.phaseReceipt.v1') {
        throw new Error(`${label} expected receipt schema simulatte.phaseReceipt.v1`);
      }
    }
    for (const forbidden of contract ? contract.forbiddenUpstreamReads : []) {
      if (forbiddenFieldPresent(envelope.artifact, forbidden)) {
        throw new Error(`${label} contains forbidden upstream field ${forbidden}`);
      }
    }
    return envelope;
  }

  function forbiddenFieldPresent(value, forbidden) {
    if (!value || typeof value !== 'object' || !forbidden) return false;
    if (forbidden.includes('.')) return dottedPathPresent(value, forbidden.split('.'));
    return fieldNamePresent(value, forbidden);
  }

  function dottedPathPresent(value, pathParts) {
    if (!value || typeof value !== 'object' || !pathParts.length) return false;
    const [head, ...rest] = pathParts;
    if (Object.prototype.hasOwnProperty.call(value, head)) {
      if (!rest.length) return true;
      return dottedPathPresent(value[head], rest);
    }
    return Object.values(value).some((child) => dottedPathPresent(child, pathParts));
  }

  function fieldNamePresent(value, forbidden) {
    if (!value || typeof value !== 'object') return false;
    if (Object.prototype.hasOwnProperty.call(value, forbidden)) return true;
    return Object.values(value).some((child) => fieldNamePresent(child, forbidden));
  }

  function validatePhaseEnvelope(envelope, phase) {
    return assertPhaseEnvelope(envelope, phase, `Phase ${phase} validator`);
  }

  function validatePhase1RuntimeReady(envelope) {
    return validatePhaseEnvelope(envelope, 1);
  }

  function validatePhase2LanguageGraph(envelope) {
    return validatePhaseEnvelope(envelope, 2);
  }

  function validatePhase3RetrievalRerank(envelope) {
    return validatePhaseEnvelope(envelope, 3);
  }

  function validatePhase4GroundedIntent(envelope) {
    return validatePhaseEnvelope(envelope, 4);
  }

  function validatePhase5SimulationCompile(envelope) {
    return validatePhaseEnvelope(envelope, 5);
  }

  function validatePhase6VisualCompile(envelope) {
    return validatePhaseEnvelope(envelope, 6);
  }

  function validatePhase7RenderExecution(envelope) {
    return validatePhaseEnvelope(envelope, 7);
  }

  function validatePhase8SceneProof(envelope) {
    return validatePhaseEnvelope(envelope, 8);
  }

  function sceneProofApi() {
    if (typeof globalThis !== 'undefined' && globalThis.SimulatteSceneProof) {
      return globalThis.SimulatteSceneProof;
    }
    if (typeof module === 'object' && module.exports && typeof require === 'function') {
      try {
        return require('../phase-08-scene-proof/simulatte-scene-proof.js');
      } catch (_err) {}
    }
    return null;
  }

  function runPhase8SceneProof(phase7Output, options = {}) {
    const api = sceneProofApi();
    if (!api || typeof api.settleSceneProof !== 'function') {
      throw new Error('Phase 8 scene proof requires SimulatteSceneProof.settleSceneProof; load phase-08-scene-proof/simulatte-scene-proof.js');
    }
    return assertPhaseEnvelope(api.settleSceneProof(phase7Output, options), 8, 'Phase 8 output');
  }

  function phaseArtifactSet(...envelopes) {
    const out = {};
    for (const envelope of envelopes) {
      if (!envelope || !envelope.phase) continue;
      out[`phase${envelope.phase}`] = envelope;
    }
    return out;
  }

  function mergePhaseArtifacts(...sets) {
    return sets.reduce((out, set) => {
      if (!set || typeof set !== 'object') return out;
      for (const key of Object.keys(set)) {
        if (/^phase[1-8]$/.test(key) && set[key]) out[key] = set[key];
      }
      return out;
    }, {});
  }

  function runtimeContextFromOptions(options = {}) {
    const receipt = options.promptRuntimeReceipt || options.runtimeReceipt || null;
    const embeddingModel = options.embeddingModel || receipt && receipt.model || null;
    const modelId = embeddingModel && embeddingModel.id || receipt && (receipt.modelId || receipt.id) || '';
    const backend = options.embeddingBackend || receipt && (receipt.providerBackend || receipt.backend || receipt.provider) || '';
    const cacheMode = receipt && (receipt.cacheMode || receipt.cacheBackends) || options.cacheMode || '';
    const runtimeReceiptId = String(
      options.runtimeReceiptId ||
      receipt && (receipt.runtimeReceiptId || receipt.receiptId || receipt.id) ||
      `runtime:${seedFromString([modelId, backend, cacheMode].filter(Boolean).join(':') || 'local').toString(36)}`
    );
    const retrievalEvidence = retrievalEvidenceFromOptions(options);
    return {
      schema: 'simulatte.phaseRuntimeContext.v1',
      runtimeReceiptId,
      modelId: modelId || '',
      backend: backend || '',
      cacheMode: cacheMode || '',
      providerReady: receipt && receipt.providerReady === true,
      noFallback: receipt && receipt.noFallback === true,
      promptRuntimeReceipt: receipt,
      retrievalEvidence,
      retrievalPhase: options.retrievalPhase || '',
      runtimeMode: receipt && receipt.providerReady === true
        ? 'model-backed'
        : options.allowPrototypeFallback === true
          ? 'prototype-fallback'
          : 'unproven',
    };
  }

  function runtimeContextFromPhase(phaseOutput) {
    const artifact = phaseOutput && phaseOutput.artifact || {};
    return artifact.runtimeContext || {
      schema: 'simulatte.phaseRuntimeContext.v1',
      runtimeReceiptId: phaseOutput && phaseOutput.runtimeReceiptId || 'runtime:unknown',
    };
  }

  function retrievalEvidenceFromOptions(options = {}) {
    if (options.phase3RetrievalEvidence && typeof options.phase3RetrievalEvidence === 'object') {
      return sanitizePhase3RetrievalEvidence(options.phase3RetrievalEvidence);
    }
    return sanitizePhase3RetrievalEvidence({
      schema: 'simulatte.phase3.retrievalEvidence.v1',
      rankedPrimitives: arrayClone(options.rankedPrimitives || options.embeddingPriors || options.primitiveMatches),
      rankedCards: arrayClone(options.rankedCards || options.cardMatches || options.surfaceCardMatches),
      rankedUniverseRows: arrayClone(options.rankedUniverseRows || options.universeMatches),
      classification: clonePhaseValue(options.classification || null),
      semanticRag: clonePhaseValue(options.semanticRag || null),
      rerank: clonePhaseValue(options.intentRerank || options.rerank || null),
      dopplerIntent: clonePhaseValue(options.dopplerIntent || null),
      spanRetrieval: clonePhaseValue(options.spanRetrieval || null),
      slotRetrieval: clonePhaseValue(options.slotRetrieval || null),
      evidenceRows: arrayClone(options.evidenceRows),
      universeGraph: clonePhaseValue(options.universeGraph || null),
      components: arrayClone(options.components),
      visualSource: clonePhaseValue(options.visualSource || null),
      params: clonePhaseValue(options.params || {}),
      retrievalPhase: options.retrievalPhase || '',
      model: clonePhaseValue(options.embeddingModel || null),
      backend: options.embeddingBackend || '',
    });
  }

  function sanitizePhase3RetrievalEvidence(evidence = {}) {
    return {
      schema: evidence.schema || 'simulatte.phase3.retrievalEvidence.v1',
      sourcePromptHash: evidence.sourcePromptHash || evidence.promptHash || '',
      rankedPrimitives: arrayClone(evidence.rankedPrimitives || evidence.primitiveMatches),
      primitiveMatches: arrayClone(evidence.primitiveMatches),
      rankedCards: arrayClone(evidence.rankedCards || evidence.cardMatches || evidence.surfaceCardMatches),
      rankedUniverseRows: arrayClone(evidence.rankedUniverseRows || evidence.universeMatches),
      classification: clonePhaseValue(evidence.classification || null),
      semanticRag: clonePhaseValue(evidence.semanticRag || null),
      rerank: clonePhaseValue(evidence.intentRerank || evidence.rerank || null),
      rerankReceipt: clonePhaseValue(evidence.rerankReceipt || null),
      dopplerIntent: clonePhaseValue(evidence.dopplerIntent || null),
      spanRetrieval: clonePhaseValue(evidence.spanRetrieval || null),
      slotRetrieval: clonePhaseValue(evidence.slotRetrieval || null),
      evidenceRows: arrayClone(evidence.evidenceRows),
      universeGraph: clonePhaseValue(evidence.universeGraph || null),
      components: arrayClone(evidence.components),
      visualSource: clonePhaseValue(evidence.visualSource || null),
      params: clonePhaseValue(evidence.params || {}),
      retrievalPhase: evidence.retrievalPhase || '',
      model: clonePhaseValue(evidence.model || evidence.embeddingModel || null),
      backend: evidence.backend || evidence.embeddingBackend || '',
    };
  }

  function assertPhase3RetrievalEvidencePromptHash(evidence = {}, expectedPromptHash = '') {
    if (!evidence || typeof evidence !== 'object') return;
    const expected = String(expectedPromptHash || '');
    const received = String(evidence.sourcePromptHash || evidence.promptHash || '');
    if (!expected || !received) return;
    if (received !== expected) {
      throw new Error(`Phase 3 retrieval evidence prompt hash mismatch: expected ${expected}, received ${received}`);
    }
  }

  function withPhase1RetrievalEvidence(phase1Output, retrievalEvidence = {}) {
    assertPhaseEnvelope(phase1Output, 1, 'Phase 1 retrieval carrier');
    const carried = retrievalEvidence && typeof retrievalEvidence === 'object' ? retrievalEvidence : {};
    const existingRuntime = runtimeContextFromPhase(phase1Output);
    const promptIngress = phase1Output.artifact && phase1Output.artifact.promptIngress || {};
    const sourcePromptHash = carried.sourcePromptHash ||
      existingRuntime.retrievalEvidence && existingRuntime.retrievalEvidence.sourcePromptHash ||
      stableTextHash(promptIngress.sourceText || '');
    const runtimeContext = {
      ...existingRuntime,
      retrievalEvidence: clonePhaseValue({
        ...(existingRuntime.retrievalEvidence || {}),
        ...carried,
        schema: carried.schema || 'simulatte.phase3.retrievalEvidence.v1',
        sourcePromptHash,
      }),
      retrievalPhase: carried.retrievalPhase || existingRuntime.retrievalPhase || '',
    };
    return {
      ...phase1Output,
      artifact: {
        ...phase1Output.artifact,
        runtimeContext,
      },
    };
  }

  function clonePhaseValue(value) {
    if (value == null) return value;
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (_error) {
      if (Array.isArray(value)) return value.map((item) => clonePhaseValue(item));
      if (typeof value === 'object') return { ...value };
      return value;
    }
  }

	  function arrayClone(value) {
	    return Array.isArray(value) ? clonePhaseValue(value) : [];
	  }

	  function stableTextHash(value = '') {
	    let hash = 2166136261;
	    const text = String(value || '');
	    for (let index = 0; index < text.length; index += 1) {
	      hash ^= text.charCodeAt(index);
	      hash = Math.imul(hash, 16777619);
	    }
	    return `fnv1a:${(hash >>> 0).toString(16).padStart(8, '0')}`;
	  }

	  function phase1CompositionLedger(sourceText = '') {
	    const sourcePromptHash = stableTextHash(sourceText);
	    return {
	      schema: SCENE_COMPOSITION_LEDGER_SCHEMA,
	      sourcePromptHash,
	      sourcePhase: 1,
	      currentPhase: 1,
	      entries: [{
	        id: 'prompt:source',
	        kind: 'prompt',
	        label: 'source prompt',
	        source: 'prompt',
	        required: true,
	        status: 'preserved',
	        evidenceIds: ['promptIngress.sourceText'],
	        supportOnly: false,
	      }],
	      relations: [],
	      obligations: [],
	      phaseDeltas: [{
	        phase: 1,
	        entryId: 'prompt:source',
	        operation: 'preserved',
	        receiptId: 'phase1-runtime-context',
	      }],
	      losses: [],
	      unsupported: [],
	      summary: {
	        entryCount: 1,
	        relationCount: 0,
	        obligationCount: 0,
	        failedCount: 0,
	      },
	    };
	  }

	  function sceneLanguageGraphFromLanguageGraph(languageGraph = {}) {
	    const spans = Array.isArray(languageGraph.spans) ? languageGraph.spans : [];
	    const predicates = Array.isArray(languageGraph.predicates) ? languageGraph.predicates : [];
	    const relations = sceneRelationsFromLanguageGraph(languageGraph);
	    const entities = uniqueById(spans
	      .filter((span) => span.kind === 'entity')
	      .map((span) => sceneEntryForSpan(span, 'entity', languageGraph)));
	    const actions = uniqueById([
	      ...spans.filter((span) => span.kind === 'process').map((span) => sceneEntryForSpan(span, 'action', languageGraph)),
	      ...predicates.filter((predicate) => predicate.process).map((predicate) => ({
	        id: `action:${normalizeForEvidence(predicate.process).replace(/\s+/g, '-')}`,
	        kind: 'action',
	        label: predicate.process,
	        semanticClass: predicate.process === 'swimming' ? 'locomotion-in-fluid' : predicate.process,
	        source: 'predicate',
	        sourceSpanIds: [predicate.verbSpanId].filter(Boolean),
	        required: true,
	      })),
	    ]);
	    const environments = uniqueById(spans
	      .filter((span) => span.kind === 'environment')
	      .map((span) => sceneEntryForSpan(span, 'environment', languageGraph)));
	    const promptMediums = spans
	      .filter((span) => span.kind === 'material' && WATER_MEDIUM_RE.test(normalizeForEvidence(span.text || span.materialHint || '')))
	      .map((span) => sceneEntryForSpan(span, 'medium', languageGraph));
	    const inferredMediums = predicates.some((predicate) => (
	      predicate.process === 'swimming' ||
	      predicate.objectRole === 'fluid-medium' ||
	      predicate.causalAffordance === 'agents-in-water'
	    )) || environments.some((entry) => WATER_ENVIRONMENT_RE.test(normalizeForEvidence(entry.label)))
	      ? [{
	        id: 'medium:water',
	        kind: 'medium',
	        label: 'water',
	        semanticClass: 'fluid-medium',
	        source: 'inference',
	        sourceSpanIds: environments.flatMap((entry) => entry.sourceSpanIds || []),
	        required: false,
	        inferred: true,
	      }]
	      : [];
	    const mediums = uniqueById([...promptMediums, ...inferredMediums]);
	    const attributes = spans
	      .filter((span) => span.kind === 'modifier')
	      .map((span) => sceneEntryForSpan(span, 'attribute', languageGraph));
	    const unsupportedSpans = spans.filter((span) => span.kind === 'term' && !sceneSpanHasKnownRole(span));
	    const negations = sceneNegationsFromLanguageGraph(languageGraph);
	    return {
	      schema: SCENE_LANGUAGE_GRAPH_SCHEMA,
	      sourcePromptHash: stableTextHash(languageGraph.sourceText || ''),
	      tokens: arrayClone(languageGraph.tokens),
	      spans: arrayClone(spans),
	      entities,
	      actions,
	      attributes,
	      quantities: arrayClone(languageGraph.quantities),
	      environments,
	      mediums,
	      relations,
	      negations,
	      unsupportedSpans: unsupportedSpans.map((span) => phaseCarryObject({
	        id: span.id || '',
	        text: span.text || '',
	        reason: 'no typed scene role',
	      })),
	      summary: {
	        entityCount: entities.length,
	        actionCount: actions.length,
	        environmentCount: environments.length,
	        mediumCount: mediums.length,
	        relationCount: relations.length,
	      },
	    };
	  }

	  function sceneEntryForSpan(span = {}, fallbackKind = '', languageGraph = {}) {
	    const kind = fallbackKind === 'action' ? 'action' :
	      fallbackKind === 'medium' ? 'medium' :
	      fallbackKind || span.kind || 'entry';
	    const target = sceneTargetForSpan(span, kind);
	    const negated = sceneSpanIsNegated(languageGraph, span);
	    return {
	      id: `${kind}:${target}`,
	      kind,
	      label: span.text || target,
	      semanticClass: span.semanticRole || span.entityClass || span.materialHint || kind,
	      source: 'prompt',
	      sourceSpanIds: [span.id].filter(Boolean),
	      required: negated ? false : true,
	      inferred: false,
	      negated,
	      status: negated ? 'negated' : 'preserved',
	    };
	  }

	  function sceneTargetForSpan(span = {}, kind = '') {
	    if (span.entityClass) return normalizeForEvidence(span.entityClass).replace(/\s+/g, '-');
	    if (kind === 'action') {
	      const text = normalizeForEvidence(span.text);
	      if (SWIMMING_RE.test(text)) return 'swimming';
	      return text.replace(/\s+/g, '-') || 'action';
	    }
	    if (kind === 'medium') {
	      if (span.materialHint) return normalizeForEvidence(span.materialHint).replace(/\s+/g, '-');
	      if (WATER_MEDIUM_RE.test(normalizeForEvidence(span.text))) return 'water';
	    }
	    return normalizeForEvidence(span.text).replace(/\s+/g, '-') || kind || 'entry';
	  }

	  function sceneSpanHasKnownRole(span = {}) {
	    return ['entity', 'process', 'material', 'environment', 'modifier', 'observable'].includes(span.kind || '');
	  }

	  function sceneRelationsFromLanguageGraph(languageGraph = {}) {
	    const relations = [];
	    for (const predicate of languageGraph.predicates || []) {
	      const subject = sceneSpanById(languageGraph, predicate.subjectSpanId);
	      const object = sceneSpanById(languageGraph, predicate.objectSpanId);
	      if (sceneSpanIsNegated(languageGraph, subject) || sceneSpanIsNegated(languageGraph, object)) continue;
	      const subjectTarget = subject ? sceneTargetForSpan(subject, 'entity') : '';
	      const actionTarget = predicate.process ? normalizeForEvidence(predicate.process).replace(/\s+/g, '-') : '';
	      const implicitTarget = predicate.implicitObject
	        ? normalizeForEvidence(predicate.implicitObject).replace(/\s+/g, '-')
	        : '';
	      const objectTarget = object
	        ? sceneTargetForSpan(object, object.kind === 'environment' ? 'environment' : object.kind)
	        : implicitTarget;
	      if (subjectTarget && actionTarget) {
	        relations.push({
	          id: `relation:${subjectTarget}:${actionTarget}:${objectTarget || 'world'}`,
	          kind: objectTarget ? 'agent-action-location' : 'agent-action',
	          from: `entity:${subjectTarget}`,
	          to: `action:${actionTarget}`,
	          target: object
	            ? `${object.kind === 'environment' ? 'environment' : object.kind}:${objectTarget}`
	            : objectTarget ? `medium:${objectTarget}` : '',
	          sourceSpanIds: [predicate.subjectSpanId, predicate.verbSpanId, predicate.objectSpanId].filter(Boolean),
	          required: true,
	          status: 'preserved',
	          evidenceIds: [predicate.id].filter(Boolean),
	          spatialRelation: predicate.spatialRelation || '',
	          causalAffordance: predicate.causalAffordance || '',
	        });
	      }
	    }
	    return uniqueById(relations);
	  }

	  function sceneSpanById(languageGraph = {}, id = '') {
	    return (languageGraph.spans || []).find((span) => span.id === id) || null;
	  }

	  function sceneNegationsFromLanguageGraph(languageGraph = {}) {
	    return (languageGraph.negations || []).map((negation, index) => phaseCarryObject({
	      id: negation.id || `negation:${index + 1}`,
	      text: negation.text || '',
	      start: negation.start,
	      end: negation.end,
	      tokenStart: negation.tokenStart,
	      tokenEnd: negation.tokenEnd,
	      source: 'languageGraph.negations',
	    }));
	  }

	  function sceneSpanIsNegated(languageGraph = {}, span = null) {
	    if (!span || typeof span !== 'object') return false;
	    const sourceText = String(languageGraph.sourceText || '').toLowerCase();
	    if (Number.isFinite(span.start)) {
	      const prefix = sourceText.slice(Math.max(0, span.start - 24), span.start);
	      if (new RegExp(`${NEGATION_RE.source}\\s+$`).test(prefix)) return true;
	    }
	    const spanTokenStart = Number.isInteger(span.tokenStart) ? span.tokenStart : -1;
	    const negations = languageGraph.negations || [];
	    return negations.some((negation) => {
	      const negToken = Number.isInteger(negation.tokenStart) ? negation.tokenStart : -1;
	      if (spanTokenStart >= 0 && negToken >= 0) {
	        return negToken < spanTokenStart && spanTokenStart - negToken <= 3;
	      }
	      if (Number.isFinite(negation.end) && Number.isFinite(span.start)) {
	        return negation.end <= span.start && span.start - negation.end <= 16;
	      }
	      return false;
	    });
	  }

	  function queryPlanFromSceneLanguageGraph(sceneLanguageGraph = {}) {
	    const slots = [];
	    const addSlot = (slot) => slots.push(phaseCarryObject(slot));
	    for (const entry of sceneLanguageGraph.entities || []) {
	      if (entry.negated === true) continue;
	      addSlot(sceneQuerySlotForEntry(entry, entry.semanticClass === 'biological-agent' ? 'actor' : 'object'));
	    }
	    for (const entry of sceneLanguageGraph.actions || []) {
	      if (entry.negated === true) continue;
	      addSlot(sceneQuerySlotForEntry(entry, 'action'));
	    }
	    for (const entry of sceneLanguageGraph.environments || []) {
	      if (entry.negated === true) continue;
	      addSlot(sceneQuerySlotForEntry(entry, 'environment'));
	    }
	    for (const entry of sceneLanguageGraph.mediums || []) {
	      if (entry.negated === true) continue;
	      addSlot(sceneQuerySlotForEntry(entry, 'medium'));
	    }
	    for (const relation of sceneLanguageGraph.relations || []) {
	      addSlot({
	        schema: 'simulatte.sceneQuerySlot.v1',
	        slotId: `slot.relation.${relation.id.replace(/^relation:/, '').replace(/:/g, '_')}`,
	        slotRole: 'relation',
	        entryId: relation.id,
	        relationIds: [relation.id],
	        required: relation.required !== false,
	        sourceSpanIds: relation.sourceSpanIds || [],
	        queries: [{
	          kind: 'embedding',
	          text: [relation.from, relation.to, relation.target, relation.causalAffordance].filter(Boolean).join(' '),
	        }],
	        budgets: { primitive: 4, surfaceCard: 4, universe: 8, support: 2 },
	        allowedCandidateTypes: ['relation', 'operator', 'primitive', 'surface-card', 'universe-row'],
	      });
	    }
	    const visualTargets = uniqueList((sceneLanguageGraph.actions || [])
	      .filter((entry) => entry.negated !== true)
	      .flatMap((entry) => typeof visualSlotTargetsForAction === 'function' ? visualSlotTargetsForAction(entry) : []));
	    for (const visual of visualTargets) {
	      addSlot({
	        schema: 'simulatte.sceneQuerySlot.v1',
	        slotId: `slot.visual.${visual}`,
	        slotRole: 'visual',
	        entryId: `visual:${visual}`,
	        required: true,
	        sourceSpanIds: [],
	        queries: [{ kind: 'lexical', text: visual.replace(/-/g, ' ') }],
	        budgets: { primitive: 0, surfaceCard: 4, universe: 2, support: 0 },
	        allowedCandidateTypes: ['visual-card', 'surface-card', 'render-operator'],
	      });
	    }
	    return {
	      schema: SCENE_QUERY_PLAN_SCHEMA,
	      sourcePromptHash: sceneLanguageGraph.sourcePromptHash || '',
	      slots: uniqueById(slots),
	      summary: {
	        slotCount: uniqueById(slots).length,
	        requiredSlotCount: uniqueById(slots).filter((slot) => slot.required !== false).length,
	      },
	    };
	  }

	  function sceneQuerySlotForEntry(entry = {}, role = 'object') {
	    const label = entry.label || entry.id || '';
	    return {
	      schema: 'simulatte.sceneQuerySlot.v1',
	      slotId: `slot.${role}.${String(entry.id || label).replace(/^[a-z]+:/, '').replace(/[^a-z0-9]+/gi, '_')}`,
	      slotRole: role,
	      entryId: entry.id || '',
	      required: entry.required !== false,
	      inferred: entry.inferred === true,
	      sourceSpanIds: entry.sourceSpanIds || [],
	      queries: [
	        { kind: 'embedding', text: `${label} ${entry.semanticClass || ''}`.trim() },
	        { kind: 'lexical', text: label },
	      ],
	      budgets: {
	        primitive: role === 'actor' || role === 'object' ? 4 : 3,
	        surfaceCard: role === 'actor' ? 6 : 4,
	        universe: role === 'relation' ? 8 : 4,
	        support: role === 'actor' || role === 'environment' ? 0 : 2,
	      },
	      allowedCandidateTypes: ['primitive', 'surface-card', 'universe-row'],
	    };
	  }

	  function phase2CompositionLedger(sceneLanguageGraph = {}, queryPlan = {}, phase1Ledger = null) {
	    const entries = uniqueById([
	      ...(phase1Ledger && phase1Ledger.entries || []),
	      ...(sceneLanguageGraph.entities || []),
	      ...(sceneLanguageGraph.actions || []),
	      ...(sceneLanguageGraph.environments || []),
	      ...(sceneLanguageGraph.mediums || []),
	      ...(sceneLanguageGraph.attributes || []),
	    ].map((entry) => ({
	      ...entry,
	      status: entry.status || 'preserved',
	      evidenceIds: entry.evidenceIds || entry.sourceSpanIds || [],
	      supportOnly: entry.supportOnly === true,
	    })));
	    const relations = uniqueById(sceneLanguageGraph.relations || []);
	    const obligations = uniqueById((queryPlan.slots || []).map((slot) => ({
	      id: slot.entryId || slot.slotId,
	      kind: slot.slotRole === 'actor' ? 'entity' : slot.slotRole,
	      ownedByPhase: slot.slotRole === 'visual' ? 6 : slot.slotRole === 'relation' ? 4 : 3,
	      sourceRelationId: Array.isArray(slot.relationIds) ? slot.relationIds[0] || '' : '',
	      required: slot.required !== false,
	      mustPreserveIds: uniqueList([
	        slot.entryId,
	        ...(slot.relationIds || []),
	      ].filter(Boolean)),
	      status: slot.slotRole === 'visual' ? 'pending' : 'preserved',
	      phase: 2,
	      receiptId: 'phase2-language-graph',
	    })));
	    return normalizeCompositionLedger({
	      schema: SCENE_COMPOSITION_LEDGER_SCHEMA,
	      sourcePromptHash: sceneLanguageGraph.sourcePromptHash || phase1Ledger && phase1Ledger.sourcePromptHash || '',
	      sourcePhase: phase1Ledger && phase1Ledger.sourcePhase || 1,
	      currentPhase: 2,
	      entries,
	      relations,
	      obligations,
	      phaseDeltas: [
	        ...(phase1Ledger && phase1Ledger.phaseDeltas || []),
	        ...entries.filter((entry) => entry.id !== 'prompt:source').map((entry) => ({
	          phase: 2,
	          entryId: entry.id,
	          operation: 'preserved',
	          receiptId: 'phase2-language-graph',
	        })),
	        ...relations.map((relation) => ({
	          phase: 2,
	          relationId: relation.id,
	          operation: 'preserved',
	          receiptId: 'phase2-language-graph',
	        })),
	      ],
	      losses: [],
	      unsupported: sceneLanguageGraph.unsupportedSpans || [],
	    });
	  }

	  function normalizeCompositionLedger(ledger = {}, overrides = {}) {
	    const next = {
	      ...ledger,
	      ...overrides,
	      schema: SCENE_COMPOSITION_LEDGER_SCHEMA,
	      entries: uniqueById([...(overrides.entries || []), ...(ledger.entries || [])]),
	      relations: uniqueById([...(overrides.relations || []), ...(ledger.relations || [])]),
	      obligations: uniqueById([...(overrides.obligations || []), ...(ledger.obligations || [])]),
	      phaseDeltas: [...(ledger.phaseDeltas || []), ...(overrides.phaseDeltas || [])],
	      losses: [...(ledger.losses || []), ...(overrides.losses || [])],
	      unsupported: [...(ledger.unsupported || []), ...(overrides.unsupported || [])],
	    };
	    const obligations = next.obligations || [];
	    next.summary = {
	      ...(ledger.summary || {}),
	      ...(overrides.summary || {}),
	      entryCount: (next.entries || []).length,
	      relationCount: (next.relations || []).length,
	      obligationCount: obligations.length,
	      requiredCount: obligations.filter((row) => row.required).length,
	      failedCount: obligations.filter((row) => LEDGER_FAILURE_STATUSES.has(row.status)).length,
	    };
	    return phaseCarryObject(next);
	  }

	  function advanceCompositionLedger(ledger = null, phase = 0, receiptId = '') {
	    if (!ledger || typeof ledger !== 'object') return null;
	    return normalizeCompositionLedger(ledger, {
	      currentPhase: phase,
	      phaseDeltas: [{
	        phase,
	        operation: 'carried',
	        receiptId,
	      }],
	    });
	  }

	  function runPhase1RuntimeGate(sourceText = '', options = {}) {
	    const runtimeContext = runtimeContextFromOptions(options);
	    const promptText = String(sourceText || '').trim();
	    if (phase1RequiresModelProof(promptText, options, runtimeContext)) {
	      throw new Error('Phase 1 runtime gate requires promptRuntimeReceipt with providerReady=true for nonblank browser prompt');
	    }
	    const receipts = phase1RuntimeReceipts(runtimeContext, options);
	    const compositionLedger = phase1CompositionLedger(promptText);
	    return createPhaseEnvelope({
	      phase: 1,
	      inputSchema: PHASE_ZERO_INPUT_SCHEMA,
	      runtimeReceiptId: runtimeContext.runtimeReceiptId,
	      artifact: {
	        runtimeContext,
	        promptIngress: {
	          schema: 'simulatte.promptIngress.v1',
	          sourceText: promptText,
	        },
	        compositionLedger,
	      },
	      receipts,
	    });
	  }

  function phase1RequiresModelProof(promptText = '', options = {}, runtimeContext = {}) {
    if (!promptText) return false;
    if (options.allowPrototypeFallback === true) return false;
    if (!isBrowserRuntime()) return false;
    const receipt = runtimeContext.promptRuntimeReceipt || {};
    const rerankerReady = receipt.rerankerRequired === true ? receipt.rerankerReady === true : true;
    return runtimeContext.providerReady !== true || runtimeContext.noFallback !== true || rerankerReady !== true;
  }

  function isBrowserRuntime() {
    if (typeof window !== 'undefined') return true;
    return typeof WorkerGlobalScope !== 'undefined' &&
      typeof self !== 'undefined' &&
      self instanceof WorkerGlobalScope;
  }

  function phase1RuntimeReceipts(runtimeContext = {}, options = {}) {
    const receipt = runtimeContext.promptRuntimeReceipt || {};
    const cacheReady = receipt.cachePrefetch === true || Boolean(runtimeContext.cacheMode) || options.allowPrototypeFallback === true;
    const probeReady = receipt.embeddingProbe === true || options.allowPrototypeFallback === true;
    const modelReady = runtimeContext.providerReady === true || options.allowPrototypeFallback === true;
    const rerankerRequired = receipt.rerankerRequired === true;
    const rerankerReady = !rerankerRequired || receipt.rerankerReady === true || options.allowPrototypeFallback === true;
    return [
      {
        id: 'phase1-runtime-context',
        schema: 'simulatte.phaseReceipt.v1',
        modelId: runtimeContext.modelId,
        backend: runtimeContext.backend,
        cacheMode: runtimeContext.cacheMode,
        providerReady: runtimeContext.providerReady,
        runtimeMode: runtimeContext.runtimeMode,
      },
      {
        id: 'model-ready',
        schema: 'simulatte.phaseReceipt.v1',
        ready: modelReady,
        modelId: runtimeContext.modelId,
        backend: runtimeContext.backend,
        providerReady: runtimeContext.providerReady,
        noFallback: runtimeContext.noFallback,
      },
      {
        id: 'model-probe',
        schema: 'simulatte.phaseReceipt.v1',
        ready: probeReady,
        embeddingProbe: receipt.embeddingProbe === true,
        probeCount: Number(receipt.probeCount || 0),
        embeddingDim: Number(receipt.embeddingDim || receipt.probeEmbeddingDim || 0),
        stabilitySimilarity: Number(receipt.stabilitySimilarity || 0),
        maxDistinctProbeSimilarity: Number(receipt.maxDistinctProbeSimilarity || 0),
      },
      {
        id: 'cache-health',
        schema: 'simulatte.phaseReceipt.v1',
        ready: cacheReady,
        cachePrefetch: receipt.cachePrefetch === true,
        cacheMode: runtimeContext.cacheMode || '',
        modelBaseUrl: receipt.modelBaseUrl || '',
      },
      {
        id: 'runtime-ready',
        schema: 'simulatte.phaseReceipt.v1',
        ready: modelReady && (probeReady || options.allowPrototypeFallback === true) && rerankerReady,
        providerReady: runtimeContext.providerReady,
        rerankerRequired,
        rerankerReady,
        rerankerStatus: receipt.rerankerStatus || '',
        runtimeMode: runtimeContext.runtimeMode,
      },
    ];
  }

	  function runPhase2LanguageGraph(phase1Output) {
	    assertPhaseEnvelope(phase1Output, 1, 'Phase 2 input');
	    const runtimeContext = runtimeContextFromPhase(phase1Output);
	    const sourceText = phase1Output.artifact && phase1Output.artifact.promptIngress
	      ? phase1Output.artifact.promptIngress.sourceText || ''
	      : '';
	    const promptParse = parsePrompt ? parsePrompt(sourceText) : emptyPromptParse(sourceText);
	    const languageGraph = languageGraphFromPromptParse(sourceText, promptParse);
	    const sceneLanguageGraph = sceneLanguageGraphFromLanguageGraph(languageGraph);
	    const queryPlan = queryPlanFromSceneLanguageGraph(sceneLanguageGraph);
	    const compositionLedger = phase2CompositionLedger(
	      sceneLanguageGraph,
	      queryPlan,
	      phase1Output.artifact && phase1Output.artifact.compositionLedger || null
	    );
	    return createPhaseEnvelope({
	      phase: 2,
	      inputSchema: phase1Output.schema,
	      runtimeReceiptId: runtimeContext.runtimeReceiptId,
	      artifact: {
	        languageGraph,
	        sceneLanguageGraph,
	        queryPlan,
	        compositionLedger,
	        promptParse,
	      },
	      receipts: [
	        {
	          id: 'phase2-language-graph',
          schema: 'simulatte.phaseReceipt.v1',
	          tokens: languageGraph.tokens.length,
	          spans: languageGraph.spans.length,
	          clauses: languageGraph.clauses.length,
	          relations: languageGraph.relations.length,
	          querySlots: queryPlan.slots.length,
	          obligationCount: compositionLedger.obligations.length,
	        },
	      ],
	    });
	  }

  function emptyPromptParse(sourceText = '') {
    return {
      schema: PROMPT_PARSE_SCHEMA || 'simulatte.promptParse.v1',
      prompt: String(sourceText || ''),
      tokens: [],
      spans: [],
      clauses: [],
      modifiers: [],
    };
  }

  function languageGraphFromPromptParse(sourceText = '', promptParse = {}) {
    const tokens = Array.isArray(promptParse.tokens) ? promptParse.tokens : [];
    const spans = languageGraphSpans(tokens, Array.isArray(promptParse.spans) ? promptParse.spans : []);
    const clauses = Array.isArray(promptParse.clauses) ? promptParse.clauses : [];
    const modifiers = Array.isArray(promptParse.modifiers) ? promptParse.modifiers : [];
    const clauseRelations = languageGraphClauseRelations(clauses);
    const modifierRelations = modifiers.map((modifier) => ({
      id: modifier.id || '',
      sourceSpanId: modifier.targetSpanId || '',
      targetSpanId: modifier.modifierSpanId || '',
      relation: modifier.relation || '',
      source: 'modifier',
    }));
    return {
      schema: 'simulatte.languageGraph.v1',
      sourceText: String(sourceText || ''),
      tokens,
      spans,
      clauses,
      predicates: clauses.map((clause) => ({
        id: clause.id || '',
        subjectSpanId: clause.subjectSpanId || '',
        verbSpanId: clause.verbSpanId || '',
        objectSpanId: clause.objectSpanId || '',
        process: clause.process || '',
        subjectRole: clause.subjectRole || '',
        objectRole: clause.objectRole || '',
        spatialRelation: clause.spatialRelation || '',
        causalAffordance: clause.causalAffordance || '',
        implicitObject: clause.implicitObject || '',
      })),
      quantities: tokens.filter((token) => /^(?:\d+(?:\.\d+)?|\.\d+)$/.test(String(token.text || ''))),
      negations: spans.filter((span) => span.kind === 'negation').concat(
        tokens.filter((token) => /^(?:no|not|never|without)$/.test(String(token.text || '').toLowerCase()))
      ),
      relations: [...clauseRelations, ...modifierRelations],
      modifiers,
    };
  }

  function languageGraphClauseRelations(clauses = []) {
    const relations = [];
    for (const clause of clauses || []) {
      const clauseId = clause.id || `clause${relations.length + 1}`;
      if (clause.subjectSpanId && clause.verbSpanId) {
        relations.push({
          id: `${clauseId}:agent-process`,
          sourceSpanId: clause.subjectSpanId,
          targetSpanId: clause.verbSpanId,
          relation: 'performs',
          process: clause.process || '',
          subjectRole: clause.subjectRole || '',
          source: 'clause',
        });
      }
      if (clause.subjectSpanId && clause.objectSpanId && clause.spatialRelation) {
        relations.push({
          id: `${clauseId}:agent-location`,
          sourceSpanId: clause.subjectSpanId,
          targetSpanId: clause.objectSpanId,
          relation: clause.spatialRelation,
          process: clause.process || '',
          subjectRole: clause.subjectRole || '',
          objectRole: clause.objectRole || '',
          causalAffordance: clause.causalAffordance || '',
          source: 'clause',
        });
      }
      if (clause.subjectSpanId && !clause.objectSpanId && clause.implicitObject && clause.spatialRelation) {
        relations.push({
          id: `${clauseId}:agent-implicit-location`,
          sourceSpanId: clause.subjectSpanId,
          targetSpanId: '',
          targetText: clause.implicitObject,
          relation: clause.spatialRelation,
          process: clause.process || '',
          subjectRole: clause.subjectRole || '',
          objectRole: clause.objectRole || '',
          causalAffordance: clause.causalAffordance || '',
          inferred: true,
          source: 'clause',
        });
      }
      if (clause.verbSpanId && clause.objectSpanId && clause.spatialRelation) {
        relations.push({
          id: `${clauseId}:process-location`,
          sourceSpanId: clause.verbSpanId,
          targetSpanId: clause.objectSpanId,
          relation: 'occurs_in',
          process: clause.process || '',
          objectRole: clause.objectRole || '',
          causalAffordance: clause.causalAffordance || '',
          source: 'clause',
        });
      }
      if (clause.verbSpanId && !clause.objectSpanId && clause.implicitObject && clause.spatialRelation) {
        relations.push({
          id: `${clauseId}:process-implicit-location`,
          sourceSpanId: clause.verbSpanId,
          targetSpanId: '',
          targetText: clause.implicitObject,
          relation: 'occurs_in',
          process: clause.process || '',
          objectRole: clause.objectRole || '',
          causalAffordance: clause.causalAffordance || '',
          inferred: true,
          source: 'clause',
        });
      }
    }
    return relations;
  }

  function languageGraphSpans(tokens = [], parsedSpans = []) {
    const covered = new Set(parsedSpans.flatMap((span) => {
      if (Number.isInteger(span.tokenStart) && Number.isInteger(span.tokenEnd)) {
        const indexes = [];
        for (let index = span.tokenStart; index <= span.tokenEnd; index += 1) indexes.push(index);
        return indexes;
      }
      return [];
    }));
    const parsed = parsedSpans.map((span) => ({ ...span }));
    const fallback = tokens
      .map((token, index) => ({ token, index }))
      .filter(({ token, index }) => {
        if (covered.has(index)) return false;
        const text = String(token.text || '').toLowerCase();
        if (!text || semanticStopwordHas(text)) return false;
        return /[a-z0-9]/.test(text);
      })
      .map(({ token, index }) => ({
        id: `term${index + 1}`,
        text: token.text,
        kind: 'term',
        start: token.start,
        end: token.end,
        tokenStart: index,
        tokenEnd: index,
      }));
    return [...parsed, ...fallback];
  }

  function semanticStopwordHas(text) {
    if (SEMANTIC_STOPWORDS && typeof SEMANTIC_STOPWORDS.has === 'function') return SEMANTIC_STOPWORDS.has(text);
    return Array.isArray(SEMANTIC_STOPWORDS) && SEMANTIC_STOPWORDS.includes(text);
  }

	  function runPhase3Retrieval(phase2Output, runtimeContext = {}) {
	    assertPhaseEnvelope(phase2Output, 2, 'Phase 3 input');
	    const phase2Artifact = phase2Output.artifact || {};
	    const languageGraph = phase2Artifact.languageGraph || {};
	    const sceneLanguageGraph = phase2Artifact.sceneLanguageGraph || sceneLanguageGraphFromLanguageGraph(languageGraph);
		    const queryPlan = phase2Artifact.queryPlan || queryPlanFromSceneLanguageGraph(sceneLanguageGraph);
		    const query = String(languageGraph.sourceText || '');
		    const retrievalEvidence = runtimeContext && runtimeContext.retrievalEvidence || {};
		    assertPhase3RetrievalEvidencePromptHash(retrievalEvidence, sceneLanguageGraph.sourcePromptHash || stableTextHash(query));
		    const rawRankedPrimitives = retrievalEvidence.rankedPrimitives || retrievalEvidence.primitiveMatches || [];
	    const primitiveCuration = curatePhase3PrimitiveCandidates(rawRankedPrimitives, languageGraph);
	    const rankedPrimitives = primitiveCuration.rankedPrimitives;
	    const typedEvidenceBuckets = phase3TypedEvidenceBuckets(primitiveCuration, languageGraph);
		    const rankedCards = retrievalEvidence.rankedCards || retrievalEvidence.cardMatches || [];
		    const rankedUniverseRows = retrievalEvidence.rankedUniverseRows || retrievalEvidence.universeMatches || [];
		    const semanticRag = retrievalEvidence.semanticRag || null;
		    const slotRetrieval = retrievalEvidence.slotRetrieval || null;
		    const slotEvidence = phase3SlotEvidence(queryPlan, typedEvidenceBuckets, rankedCards, rankedUniverseRows, slotRetrieval);
	    const acceptedCandidatesBySlot = phase3AcceptedCandidatesBySlot(slotEvidence);
	    const supportOnlyCandidates = phase3SupportOnlyCandidates(primitiveCuration, slotEvidence);
	    const rejectedGenericCandidates = phase3RejectedGenericCandidates(primitiveCuration, typedEvidenceBuckets);
	    const missingRequiredSlots = phase3MissingRequiredSlots(queryPlan, acceptedCandidatesBySlot);
		    const rerankReceipt = phase3RerankReceipt(
		      retrievalEvidence.rerankReceipt || retrievalEvidence.rerank || null,
		      queryPlan,
		      slotEvidence,
		      missingRequiredSlots,
		      slotRetrieval
		    );
	    const compositionLedger = phase3CompositionLedger(
	      typedEvidenceBuckets,
	      languageGraph,
	      phase2Artifact.compositionLedger || null,
	      queryPlan,
	      acceptedCandidatesBySlot,
	      missingRequiredSlots
	    );
	    const groundingEvidence = retrievalGroundingEvidence(
	      retrievalEvidence,
	      primitiveCuration,
	      typedEvidenceBuckets,
	      compositionLedger,
	      languageGraph,
	      queryPlan,
	      slotEvidence,
      acceptedCandidatesBySlot,
      missingRequiredSlots
    );
    const retrievalRerankResult = {
	          schema: RETRIEVAL_RERANK_RESULT_SCHEMA,
	          query,
	          queryPlanSource: sceneLanguageGraph.schema || '',
	          queryPlan,
	          slotEvidence,
	          acceptedCandidatesBySlot,
	          supportOnlyCandidates,
	          rejectedGenericCandidates,
	          missingRequiredSlots,
	          rankedPrimitives,
	          supportPrimitives: primitiveCuration.supportPrimitives,
	          rejectedSupportPrimitives: primitiveCuration.rejectedSupportPrimitives,
	          curation: primitiveCuration.receipt,
		          typedEvidenceBuckets,
		          slotRetrieval,
	          compositionLedger,
          rankedCards,
          rankedUniverseRows,
          semanticRag,
          rerankReceipt,
          spanRetrieval: retrievalEvidence.spanRetrieval || null,
          evidenceRows: Array.isArray(retrievalEvidence.evidenceRows) ? retrievalEvidence.evidenceRows : [],
          classification: retrievalEvidence.classification || null,
          synthesis: retrievalEvidence.synthesis || null,
          dopplerIntent: retrievalEvidence.dopplerIntent || null,
          scores: {
          primitiveCount: rankedPrimitives.length,
          rawPrimitiveCount: rawRankedPrimitives.length,
          supportPrimitiveCount: primitiveCuration.supportPrimitives.length,
          typedBucketCount: Object.keys(typedEvidenceBuckets.buckets || {}).length,
          cardCount: rankedCards.length,
          universeRowCount: rankedUniverseRows.length,
            classificationConfidence: retrievalEvidence.classification && retrievalEvidence.classification.confidence || 0,
          },
          provenance: {
            modelId: runtimeContext.modelId || '',
            backend: runtimeContext.backend || '',
            retrievalPhase: runtimeContext.retrievalPhase || retrievalEvidence.retrievalPhase || '',
            synthesisSchema: retrievalEvidence.synthesis && retrievalEvidence.synthesis.schema || '',
          },
	          groundingEvidence,
    };
    const artifact = {
      languageGraph,
      sceneLanguageGraph,
      queryPlan,
      retrievalRerankResult,
      compositionLedger,
    };
    const activationCloud = activationCloudFromPhase3Artifact(artifact);
    artifact.activationCloud = {
      ...activationCloud,
      compositionLedger,
    };
    return createPhaseEnvelope({
      phase: 3,
      inputSchema: phase2Output.schema,
      runtimeReceiptId: runtimeContext.runtimeReceiptId || phase2Output.runtimeReceiptId,
      artifact,
      receipts: [
        {
          id: 'phase3-retrieval-rerank',
	          schema: 'simulatte.phaseReceipt.v1',
          primitiveCount: rankedPrimitives.length,
          rawPrimitiveCount: rawRankedPrimitives.length,
	          supportPrimitiveCount: primitiveCuration.supportPrimitives.length,
	          rejectedSupportCount: primitiveCuration.rejectedSupportPrimitives.length,
	          typedBucketCount: Object.keys(typedEvidenceBuckets.buckets || {}).length,
		          obligationCount: compositionLedger.obligations.length,
		          slotCount: slotEvidence.length,
		          modelSlotCount: slotRetrieval && Number(slotRetrieval.slotCount || 0) || 0,
		          modelSlotRerankCallCount: slotRetrieval && Number(slotRetrieval.rerankCallCount || 0) || 0,
		          missingRequiredSlots: missingRequiredSlots.length,
	          curation: primitiveCuration.receipt.id,
	          cardCount: rankedCards.length,
	          universeRowCount: rankedUniverseRows.length,
	        },
        {
          id: 'phase3-activation-fusion',
          schema: 'simulatte.phaseReceipt.v1',
          activationCount: activationCloud.weightedActivations.length,
          slotActivationCount: (activationCloud.slotActivations || []).length,
          relationActivationCount: (activationCloud.relationActivations || []).length,
          supportActivationCount: (activationCloud.supportActivations || []).length,
          rejectedCount: activationCloud.rejectedMatches.length,
          obligationCoverageCount: Object.keys(activationCloud.coverageByObligation || {}).length,
          coveredObligationCount: Object.values(activationCloud.coverageByObligation || {})
            .filter((row) => row && row.covered === true).length,
          negativeEvidenceCount: (activationCloud.negativeEvidence || []).length,
        },
      ],
    });
	  }

	  function assertPhase3RetrievalEvidencePromptHash(retrievalEvidence = {}, expectedHash = '') {
	    if (!expectedHash) return;
	    const rows = [
	      ['slotRetrieval', retrievalEvidence.slotRetrieval],
	      ['spanRetrieval', retrievalEvidence.spanRetrieval],
	      ['queryPlan', retrievalEvidence.queryPlan],
	    ];
	    for (const [label, row] of rows) {
	      const actual = row && row.sourcePromptHash;
	      if (actual && actual !== expectedHash) {
	        throw new Error(`Phase 3 ${label}.sourcePromptHash mismatch: expected ${expectedHash}, received ${actual}`);
	      }
	    }
	  }

	  function curatePhase3PrimitiveCandidates(rows = [], languageGraph = {}) {
    const prompt = String(languageGraph.sourceText || '').toLowerCase();
    const spans = Array.isArray(languageGraph.spans) ? languageGraph.spans : [];
    const predicates = Array.isArray(languageGraph.predicates) ? languageGraph.predicates : [];
    const relations = Array.isArray(languageGraph.relations) ? languageGraph.relations : [];
    const hasSpecificLanguage = spans.some((span) => (
      span.kind === 'entity' ||
      span.kind === 'material' ||
      span.kind === 'environment' ||
      span.kind === 'process'
    ));
    const curated = [];
    const support = [];
    for (const row of rows || []) {
      const decision = phase3PrimitiveCandidateDecision(row, prompt, spans, predicates, relations);
      const next = phaseCarryObject({
        ...row,
        retrievalRole: decision.role,
        matchKind: decision.matchKind,
        supportOnly: decision.role === 'support',
        supportReason: decision.reason,
      });
      if (decision.role === 'candidate') curated.push(next);
      else support.push(next);
    }
    if (!hasSpecificLanguage || curated.length < Math.min(2, rows.length)) {
      const supportRows = (rows || []).map((row) => phaseCarryObject({
        ...row,
        retrievalRole: 'support',
        matchKind: hasSpecificLanguage ? 'insufficient-literal-evidence' : 'untyped-language-support',
        supportOnly: true,
        supportReason: hasSpecificLanguage
          ? 'curation produced too few literal candidates'
          : 'prompt language lacks typed scene evidence',
      })).sort(phase3PrimitiveSort);
      const rejectedSupportRows = supportRows.filter(phase3SupportRowIsGeneric);
      return {
        rankedPrimitives: curated.sort(phase3PrimitiveSort),
        supportPrimitives: supportRows,
        rejectedSupportPrimitives: rejectedSupportRows,
        receipt: {
          id: 'phase3-primitive-curation',
          schema: 'simulatte.phase3PrimitiveCuration.v1',
          mode: hasSpecificLanguage ? 'strict-insufficient-candidates' : 'strict-untyped-support-only',
          rawPrimitiveCount: rows.length,
          candidateCount: curated.length,
          supportCount: supportRows.length,
          rejectedSupportCount: rejectedSupportRows.length,
          candidateIds: curated.map((row) => row.id || row.primitiveId).filter(Boolean).slice(0, 24),
          supportIds: supportRows.map((row) => row.id || row.primitiveId).filter(Boolean).slice(0, 24),
        },
      };
    }
    const rankedPrimitives = curated.sort(phase3PrimitiveSort);
    const supportPrimitives = support.sort(phase3PrimitiveSort);
    const rejectedSupportPrimitives = supportPrimitives.filter(phase3SupportRowIsGeneric);
    return {
      rankedPrimitives,
      supportPrimitives,
      rejectedSupportPrimitives,
      receipt: {
        id: 'phase3-primitive-curation',
        schema: 'simulatte.phase3PrimitiveCuration.v1',
        mode: 'literal-candidates-support-separated',
        rawPrimitiveCount: rows.length,
        candidateCount: rankedPrimitives.length,
        supportCount: supportPrimitives.length,
        rejectedSupportCount: rejectedSupportPrimitives.length,
        candidateIds: rankedPrimitives.map((row) => row.id || row.primitiveId).filter(Boolean).slice(0, 24),
        supportIds: supportPrimitives.map((row) => row.id || row.primitiveId).filter(Boolean).slice(0, 24),
      },
    };
  }

  function phase3TypedEvidenceBuckets(curation = {}, languageGraph = {}) {
    const rankedPrimitives = curation.rankedPrimitives || [];
    const supportPrimitives = curation.supportPrimitives || [];
    const buckets = {
      literalPromptObjects: [],
      actionEvidence: [],
      environmentEvidence: [],
      materialMediumEvidence: [],
      relationEvidence: [],
      supportOnlyPhysicsEvidence: [],
      rejectedGenericEvidence: [],
    };
    for (const row of rankedPrimitives) {
      const slot = phase3EvidenceSlot(row, languageGraph);
      buckets[slot].push(phase3EvidenceBucketRow(row));
    }
    for (const row of supportPrimitives) {
      const bucketRow = phase3EvidenceBucketRow(row);
      buckets.supportOnlyPhysicsEvidence.push(bucketRow);
      if (phase3SupportRowIsGeneric(row)) buckets.rejectedGenericEvidence.push(bucketRow);
    }
	    for (const relation of languageGraph.relations || []) {
	      buckets.relationEvidence.push(phaseCarryObject({
	        id: relation.id || `${relation.sourceSpanId || 'source'}:${relation.relation || 'relation'}:${relation.targetSpanId || 'target'}`,
	        sourceSpanId: relation.sourceSpanId || '',
	        targetSpanId: relation.targetSpanId || '',
	        sourceText: relation.sourceText || phase3SpanTextById(languageGraph, relation.sourceSpanId),
	        targetText: relation.targetText || phase3SpanTextById(languageGraph, relation.targetSpanId),
	        relation: relation.relation || '',
	        process: relation.process || '',
	        causalAffordance: relation.causalAffordance || '',
	      }));
	    }
    for (const predicate of languageGraph.predicates || []) {
      if (!predicate.process) continue;
      buckets.actionEvidence.push(phaseCarryObject({
        id: `action:${predicate.process}`,
        label: predicate.process,
        source: 'language-predicate',
        retrievalRole: 'candidate',
        supportOnly: false,
        matchKind: 'predicate-process',
        subjectSpanId: predicate.subjectSpanId || '',
        objectSpanId: predicate.objectSpanId || '',
      }));
    }
    for (const predicate of languageGraph.predicates || []) {
      buckets.relationEvidence.push(phaseCarryObject({
        id: predicate.id || `${predicate.subjectSpanId || 'subject'}:${predicate.process || 'process'}:${predicate.objectSpanId || 'object'}`,
	        subjectSpanId: predicate.subjectSpanId || '',
	        verbSpanId: predicate.verbSpanId || '',
	        objectSpanId: predicate.objectSpanId || '',
	        subjectText: phase3SpanTextById(languageGraph, predicate.subjectSpanId),
	        verbText: phase3SpanTextById(languageGraph, predicate.verbSpanId),
	        objectText: phase3SpanTextById(languageGraph, predicate.objectSpanId),
	        process: predicate.process || '',
	        subjectRole: predicate.subjectRole || '',
	        objectRole: predicate.objectRole || '',
        spatialRelation: predicate.spatialRelation || '',
        causalAffordance: predicate.causalAffordance || '',
      }));
    }
    return phaseCarryObject({
      schema: 'simulatte.phase3TypedEvidenceBuckets.v1',
      buckets,
      summary: Object.fromEntries(Object.entries(buckets).map(([key, rows]) => [key, rows.length])),
    });
  }

  function phase3EvidenceSlot(row = {}, languageGraph = {}) {
    const id = normalizeForEvidence(row.id || row.primitiveId || '');
    const text = normalizeForEvidence([
      row.id,
      row.primitiveId,
      row.label,
      row.role,
      row.phrase,
      row.material,
      ...(row.domains || []),
    ].filter(Boolean).join(' '));
    if (/\b(?:dog|dogs|cat|cats|animal|mammal|agent)\b/.test(text)) return 'literalPromptObjects';
    if (/\b(?:lake|pool|pond|river|ocean|beach|environment|container)\b/.test(text)) return 'environmentEvidence';
    if (id === 'water' || /\b(?:water|fluid|medium)\b/.test(text)) return 'materialMediumEvidence';
    if (/\b(?:swim|swims|swimming|locomotion|gait)\b/.test(text)) return 'actionEvidence';
    const spans = languageGraph.spans || [];
    if (spans.some((span) => span.semanticRole === 'containing-environment' && phase3PhraseInPrompt(row.id || row.label || '', span.text))) {
      return 'environmentEvidence';
    }
    if (spans.some((span) => span.semanticRole === 'biological-agent' && phase3PhraseInPrompt(row.id || row.label || '', span.text))) {
      return 'literalPromptObjects';
    }
    return 'supportOnlyPhysicsEvidence';
  }

  function phase3EvidenceBucketRow(row = {}) {
    return phaseCarryObject({
      id: row.id || row.primitiveId || '',
      label: row.label || row.role || row.phrase || row.id || '',
      source: row.source || row.indexName || '',
      score: Number(row.score || row.confidence || 0),
      retrievalRole: row.retrievalRole || '',
      supportOnly: row.supportOnly === true,
      matchKind: row.matchKind || '',
      reason: row.supportReason || row.reason || '',
    });
  }

	  function phase3SupportRowIsGeneric(row = {}) {
	    const text = normalizeForEvidence([
	      row.id,
	      row.primitiveId,
	      row.label,
      row.role,
      row.phrase,
      ...(row.domains || []),
	    ].filter(Boolean).join(' '));
	    return /\b(?:biomass|collision|elasticity|friction|gel|membrane|soft body|soft-body|diffusion|growth decay|growth-decay|kernel|gradient|constraint)\b/.test(text);
	  }

		  function phase3SlotEvidence(queryPlan = {}, typedEvidenceBuckets = {}, rankedCards = [], rankedUniverseRows = [], slotRetrieval = null) {
		    const buckets = typedEvidenceBuckets.buckets || {};
		    return (queryPlan.slots || []).map((slot) => {
		      const candidates = phase3CandidatesForSlot(slot, buckets, rankedCards, rankedUniverseRows, slotRetrieval);
	      const acceptedCandidates = candidates.filter((candidate) => candidate.decision === 'accept');
	      const supportOnlyCandidates = candidates.filter((candidate) => candidate.supportOnly === true);
	      return phaseCarryObject({
	        schema: 'simulatte.phase3SlotEvidence.v1',
	        id: slot.slotId || slot.entryId || '',
	        slotId: slot.slotId || '',
	        slotRole: slot.slotRole || '',
	        entryId: slot.entryId || '',
	        relationIds: slot.relationIds || [],
	        required: slot.required !== false,
	        status: phase3SlotEvidenceStatus(slot, acceptedCandidates, supportOnlyCandidates),
	        queryTexts: (slot.queries || []).map((query) => query.text || '').filter(Boolean),
	        candidates,
	        acceptedCandidates,
	        supportOnlyCandidates,
	        acceptedCount: acceptedCandidates.length,
	        supportOnlyCount: supportOnlyCandidates.length,
	        acceptedCandidateIds: candidates
	          .filter((candidate) => candidate.decision === 'accept')
	          .map((candidate) => candidate.candidateId)
	          .filter(Boolean),
	        rejectedCandidateIds: candidates
	          .filter((candidate) => candidate.decision === 'reject')
	          .map((candidate) => candidate.candidateId)
	          .filter(Boolean),
	        supportOnlyCandidateIds: candidates
	          .filter((candidate) => candidate.supportOnly === true)
	          .map((candidate) => candidate.candidateId)
	          .filter(Boolean),
	      });
	    });
	  }

		  function phase3CandidatesForSlot(slot = {}, buckets = {}, rankedCards = [], rankedUniverseRows = [], slotRetrieval = null) {
		    const rows = uniquePhase3SlotRows([
		      ...phase3ModelRowsForSlot(slot, slotRetrieval),
		      ...phase3RowsForSlot(slot, buckets, rankedCards, rankedUniverseRows),
		    ]);
		    return rows.slice(0, phase3SlotBudget(slot)).map((row) => {
		      const supportOnly = row.supportOnly === true || slot.slotRole === 'support';
		      const candidateId = row.candidateId || row.id || row.cardId || row.canonicalId || row.primitiveId || '';
		      return {
		        id: candidateId,
		        candidateId,
		        candidateType: row.candidateType || phase3CandidateType(row),
		        label: row.label || row.phrase || row.role || row.id || '',
		        candidateText: row.candidateText || row.label || row.phrase || row.role || row.id || '',
		        source: row.source || row.indexName || '',
		        slotId: slot.slotId || '',
		        slotRole: slot.slotRole || '',
		        modelRerankScore: row.modelRerankScore,
		        modelRerankRank: row.modelRerankRank,
		        lexicalScore: row.lexicalScore,
		        decision: supportOnly ? 'support-only' : 'accept',
		        score: Number(row.score || row.confidence || 0),
		        supportOnly,
	        reason: supportOnly ? row.reason || 'support evidence cannot satisfy required literal slot' : 'slot evidence matches query plan role',
	      };
	    });
	  }

	  function phase3RowsForSlot(slot = {}, buckets = {}, rankedCards = [], rankedUniverseRows = []) {
	    const role = slot.slotRole || '';
	    const entryId = String(slot.entryId || '');
	    if (role === 'actor' || role === 'object') return phase3FilterRowsForEntry(buckets.literalPromptObjects || [], entryId);
	    if (role === 'action') return phase3FilterRowsForEntry(buckets.actionEvidence || [], entryId);
	    if (role === 'environment') return phase3FilterRowsForEntry(buckets.environmentEvidence || [], entryId);
	    if (role === 'medium') return phase3FilterRowsForEntry(buckets.materialMediumEvidence || [], entryId);
	    if (role === 'relation') {
	      return phase3FilterRowsForEntry([
	        ...(buckets.relationEvidence || []),
	        ...(buckets.actionEvidence || []),
	        ...(buckets.materialMediumEvidence || []),
	      ], entryId);
	    }
	    if (role === 'visual') {
	      return [
	        ...phase3VisualRowsForEntry(entryId, rankedCards),
	        ...phase3VisualRowsForEntry(entryId, rankedUniverseRows),
	      ];
	    }
		    return [];
		  }

		  function phase3ModelRowsForSlot(slot = {}, slotRetrieval = null) {
		    const slotId = String(slot.slotId || '');
		    if (!slotId || !slotRetrieval || !Array.isArray(slotRetrieval.bySlot)) return [];
		    const row = slotRetrieval.bySlot.find((entry) => entry && entry.slotId === slotId);
		    if (!row) return [];
		    return (row.candidates || []).map((candidate) => ({
		      ...candidate,
		      id: candidate.candidateId || candidate.id || candidate.primitiveId || '',
		      source: candidate.source || 'slot-embedding-retrieval',
		      slotId,
		      slotRole: slot.slotRole || candidate.slotRole || '',
		    }));
		  }

		  function uniquePhase3SlotRows(rows = []) {
		    const seen = new Set();
		    return rows.filter((row) => {
		      const key = `${row.candidateType || phase3CandidateType(row)}:${row.candidateId || row.id || row.cardId || row.canonicalId || row.primitiveId || ''}`;
		      if (!key || seen.has(key)) return false;
		      seen.add(key);
		      return true;
		    }).sort((a, b) => (
		      Number(b.score || b.confidence || 0) - Number(a.score || a.confidence || 0) ||
		      String(a.candidateId || a.id || a.primitiveId || '').localeCompare(String(b.candidateId || b.id || b.primitiveId || ''))
		    ));
		  }

	  function phase3FilterRowsForEntry(rows = [], entryId = '') {
	    const target = normalizeForEvidence(entryId.replace(/^[a-z]+:/, ''));
	    const filtered = rows.filter((row) => {
	      const text = normalizeForEvidence([
	        row.id,
	        row.label,
	        row.candidateId,
	        row.canonicalId,
	        row.sourceText,
	        row.targetText,
	        row.subjectText,
	        row.verbText,
	        row.objectText,
	        row.process,
	        row.causalAffordance,
	      ].filter(Boolean).join(' '));
	      if (!target || !text) return false;
	      if (target === 'dog') return /\b(?:dogs?|surface dog|primitive dog)\b/.test(text);
	      if (target === 'cat') return /\b(?:cats?|surface cat|primitive cat)\b/.test(text);
	      if (target === 'swimming') return /\b(?:swim|swims|swimming|locomotion)\b/.test(text);
	      if (target === 'lake') return /\b(?:lake|pond|pool|water body|containing environment)\b/.test(text);
	      if (target === 'water') return /\b(?:water|fluid|medium)\b/.test(text);
	      if (target.includes('swimming') && target.includes('lake')) {
	        const wantsDog = target.includes('dog');
	        const wantsCat = target.includes('cat');
	        const hasAnimal = wantsDog ? /\bdogs?\b/.test(text) : wantsCat ? /\bcats?\b/.test(text) : true;
	        return hasAnimal && /\b(?:swim|swimming)\b/.test(text) && /\blake\b/.test(text);
	      }
	      return phase3PhraseInPrompt(target, text) || phase3PhraseInPrompt(text, target);
	    });
	    return filtered;
	  }

	  function phase3VisualRowsForEntry(entryId = '', rows = []) {
	    const target = normalizeForEvidence(entryId.replace(/^visual:/, '').replace(/-/g, ' '));
	    return candidateList(rows).filter((row) => {
	      const text = normalizeForEvidence([
	        row.id,
	        row.cardId,
	        row.label,
	        row.title,
	        row.description,
	        ...(row.visualHints || []),
	        ...(row.shapeHints || []),
	        ...(row.sceneHints || []),
	      ].filter(Boolean).join(' '));
	      return target && target.split(/\s+/).some((term) => text.includes(term));
	    });
	  }

	  function phase3SlotBudget(slot = {}) {
	    const budgets = slot.budgets || {};
	    return Math.max(1, Number(budgets.primitive || 0) + Number(budgets.surfaceCard || 0) + Number(budgets.universe || 0) + Number(budgets.support || 0));
	  }

		  function phase3SlotEvidenceStatus(slot = {}, acceptedCandidates = [], supportOnlyCandidates = []) {
		    if (slot.slotRole === 'visual') return 'pending';
		    if (acceptedCandidates.length > 0) {
		      return slot.slotRole === 'medium' && slot.inferred === true ? 'expanded' : 'preserved';
		    }
		    if (supportOnlyCandidates.length > 0) return 'pending';
	    return slot.required === false ? 'unsupported' : 'lost';
	  }

	  function phase3CandidateType(row = {}) {
	    if (row.cardId || row.visualHints || row.shapeHints) return 'surface-card';
	    if (row.canonicalId || row.conceptId) return 'universe-row';
	    if (row.operatorType || row.operatorTypes) return 'operator';
	    return 'primitive';
	  }

	  function phase3AcceptedCandidatesBySlot(slotEvidence = []) {
	    return Object.fromEntries((slotEvidence || [])
	      .filter((slot) => (slot.acceptedCandidates || []).length > 0)
	      .map((slot) => [
	        slot.slotId,
	        (slot.acceptedCandidates || []).slice(),
	      ]));
	  }

	  function phase3SupportOnlyCandidates(primitiveCuration = {}, slotEvidence = []) {
	    return uniqueById([
	      ...(primitiveCuration.supportPrimitives || []).map((row) => phase3EvidenceBucketRow(row)),
	      ...(slotEvidence || []).flatMap((slot) => (slot.candidates || [])
	        .filter((candidate) => candidate.supportOnly === true)
	        .map((candidate) => ({
	          id: candidate.candidateId,
	          label: candidate.candidateText,
	          slotId: slot.slotId,
	          slotRole: slot.slotRole,
	          supportOnly: true,
	          reason: candidate.reason,
	        }))),
	    ]);
	  }

	  function phase3RejectedGenericCandidates(primitiveCuration = {}, typedEvidenceBuckets = {}) {
	    const buckets = typedEvidenceBuckets.buckets || {};
	    return uniqueById([
	      ...(primitiveCuration.rejectedSupportPrimitives || []).filter(phase3SupportRowIsGeneric).map((row) => phase3EvidenceBucketRow(row)),
	      ...(buckets.rejectedGenericEvidence || []),
	    ]);
	  }

	  function phase3MissingRequiredSlots(queryPlan = {}, acceptedCandidatesBySlot = {}) {
	    return (queryPlan.slots || []).filter((slot) => {
	      if (slot.required === false) return false;
	      if (slot.slotRole === 'visual') return false;
	      return !(acceptedCandidatesBySlot[slot.slotId] || []).length;
	    }).map((slot) => phaseCarryObject({
	      schema: 'simulatte.phase3MissingRequiredSlot.v1',
	      id: slot.slotId || slot.entryId || '',
	      slotId: slot.slotId || '',
	      slotRole: slot.slotRole || '',
	      entryId: slot.entryId || '',
	      required: true,
	      status: 'lost',
	      reason: 'required retrieval slot had no literal candidate evidence',
	    }));
	  }

		  function phase3RerankReceipt(sourceReceipt = null, queryPlan = {}, slotEvidence = [], missingRequiredSlots = [], slotRetrieval = null) {
		    const hasModelSlotRetrieval = slotRetrieval && Number(slotRetrieval.embeddedSlotCount || 0) > 0;
		    return phaseCarryObject({
		      schema: 'simulatte.phase3SlotAwareRerankReceipt.v1',
		      sourceSchema: sourceReceipt && sourceReceipt.schema || '',
		      sourceBackend: sourceReceipt && (sourceReceipt.backend || sourceReceipt.modelBackend) || '',
		      sourceModelId: sourceReceipt && (sourceReceipt.modelId || sourceReceipt.rerankerModelId) || '',
		      mode: hasModelSlotRetrieval ? 'model-slot-aware-rerank' : 'slot-aware-retrieval-gate',
		      queryPlanSchema: queryPlan.schema || '',
		      slotRetrievalSchema: slotRetrieval && slotRetrieval.schema || '',
		      embeddedSlotCount: slotRetrieval && Number(slotRetrieval.embeddedSlotCount || 0) || 0,
		      slotRerankCallCount: slotRetrieval && Number(slotRetrieval.rerankCallCount || 0) || 0,
		      slotRetrievalCandidateCount: slotRetrieval && Number(slotRetrieval.candidateCount || 0) || 0,
		      slotCount: slotEvidence.length,
	      requiredSlotCount: queryPlan.summary && queryPlan.summary.requiredSlotCount || 0,
	      satisfiedSlotCount: (slotEvidence || []).filter((row) => row.acceptedCount > 0).length,
	      supportOnlySlotCount: (slotEvidence || []).filter((row) => row.acceptedCount === 0 && row.supportOnlyCount > 0).length,
	      missingRequiredSlotCount: missingRequiredSlots.length,
	      missingRequiredSlotIds: missingRequiredSlots.map((row) => row.slotId).filter(Boolean),
	      source: sourceReceipt || null,
	    });
	  }

	  function phase3CompositionLedger(
	    typedEvidenceBuckets = {},
	    languageGraph = {},
	    sourceLedger = null,
	    queryPlan = {},
	    acceptedCandidatesBySlot = {},
	    missingRequiredSlots = []
	  ) {
	    const buckets = typedEvidenceBuckets.buckets || {};
	    const sourceObligations = sourceLedger && Array.isArray(sourceLedger.obligations) ? sourceLedger.obligations : [];
	    const obligations = sourceObligations.map((row) => ({
	      ...row,
	      status: phase3ObligationStatus(row, acceptedCandidatesBySlot, missingRequiredSlots),
	      phase: 3,
	      receiptId: 'phase3-retrieval-rerank',
	    }));
	    const add = (row) => obligations.push(phaseCarryObject(row));
    const bucketRowsBySlotRole = {
      actor: buckets.literalPromptObjects || [],
      object: buckets.literalPromptObjects || [],
      action: buckets.actionEvidence || [],
      environment: buckets.environmentEvidence || [],
      medium: buckets.materialMediumEvidence || [],
    };
    const slotKindByRole = {
      actor: 'entity',
      object: 'entity',
      action: 'action',
      environment: 'environment',
      medium: 'medium',
    };
    for (const slot of queryPlan.slots || []) {
      const kind = slotKindByRole[slot.slotRole || ''];
      if (!kind || !slot.entryId) continue;
      const target = String(slot.entryId).replace(/^[a-z]+:/, '');
      if (!target) continue;
      const evidenceRows = phase3FilterRowsForEntry(bucketRowsBySlotRole[slot.slotRole] || [], slot.entryId);
      const accepted = (acceptedCandidatesBySlot[slot.slotId] || []).length > 0;
      const row = {
        id: slot.entryId,
        kind,
        required: slot.required !== false,
        target,
        sourceEvidenceIds: evidenceRows.map((item) => item.id).filter(Boolean).slice(0, 6),
        status: accepted || evidenceRows.length ? 'preserved' : 'pending',
        phase: 3,
      };
      if (kind === 'medium') {
        row.inferred = slot.inferred === true ||
          !phase3PhraseInPrompt(target.replace(/-/g, ' '), languageGraph.sourceText || '');
        if (accepted || evidenceRows.length) row.status = 'expanded';
      }
      add(row);
    }
    const hasCarriedRelationObligations = sourceObligations.some((row) => row.kind === 'relation');
    if (!hasCarriedRelationObligations) {
      for (const predicate of languageGraph.predicates || []) {
        if (!predicate.process || predicate.negated === true) continue;
        const subject = phase3SpanTextById(languageGraph, predicate.subjectSpanId);
        if (!subject) continue;
        const subjectTarget = normalizeForEvidence(subject).replace(/\s+/g, '-');
        const objectText = phase3SpanTextById(languageGraph, predicate.objectSpanId) ||
          predicate.objectText ||
          predicate.implicitObject ||
          '';
        const objectTarget = normalizeForEvidence(objectText).replace(/\s+/g, '-');
        add({
          id: `relation:${subjectTarget}:${predicate.process}:${objectTarget || 'world'}`,
          kind: 'relation',
          required: true,
          subject: subjectTarget,
          action: predicate.process,
          object: objectTarget,
          spatialRelation: predicate.spatialRelation || '',
          causalAffordance: predicate.causalAffordance || '',
          status: 'preserved',
          phase: 3,
        });
      }
    }
    for (const slot of queryPlan.slots || []) {
      if (slot.slotRole !== 'visual' || !slot.entryId) continue;
      add({
        id: slot.entryId,
        kind: 'visual',
        required: slot.required !== false,
        target: String(slot.entryId).replace(/^visual:/, ''),
        status: 'pending',
        phase: 3,
      });
    }
	    const losses = (missingRequiredSlots || []).map((slot) => ({
	      id: `loss:${slot.slotId}`,
	      phase: 3,
	      entryId: slot.entryId || '',
	      reason: slot.reason || 'required slot missing',
	      sourceReceiptId: 'phase3-retrieval-rerank',
	      nextRequiredAction: 'add slot evidence or mark unsupported',
	    }));
	    return normalizeCompositionLedger(sourceLedger || {}, {
	      sourcePhase: sourceLedger && sourceLedger.sourcePhase || 2,
	      currentPhase: 3,
	      obligations: uniqueById(obligations),
	      phaseDeltas: (queryPlan.slots || []).map((slot) => ({
	        phase: 3,
	        entryId: slot.entryId || '',
	        operation: (acceptedCandidatesBySlot[slot.slotId] || []).length ? 'preserved' : 'lost',
	        receiptId: 'phase3-retrieval-rerank',
	      })),
	      losses,
	    });
	  }

	  function phase3ObligationStatus(row = {}, acceptedCandidatesBySlot = {}, missingRequiredSlots = []) {
	    if (row.status === 'pending' || row.kind === 'visual') return row.status || 'pending';
	    const missing = (missingRequiredSlots || []).some((slot) => slot.entryId === row.id);
	    if (missing) return 'lost';
	    const suffix = row.id ? row.id.replace(/^[a-z]+:/, '') : '';
	    const slotId = Object.keys(acceptedCandidatesBySlot || {}).find((key) => key.endsWith(suffix));
	    if (slotId && (acceptedCandidatesBySlot[slotId] || []).length) return 'preserved';
	    return row.status || 'preserved';
	  }

  function phase3SpanTextById(languageGraph = {}, id = '') {
    const span = (languageGraph.spans || []).find((row) => row.id === id);
    return span && span.text || '';
  }

  function phase3PrimitiveCandidateDecision(row = {}, prompt = '', spans = [], predicates = [], relations = []) {
    const source = String(row.source || '');
    const id = String(row.id || row.primitiveId || '');
    const label = String(row.label || row.role || row.phrase || id || '');
    const layer = String(row.layer || row.type || '').toLowerCase();
    const text = normalizeForEvidence([
      id,
      label,
      row.phrase,
      row.role,
      row.material,
      row.visualRegime,
      ...(row.domains || []),
    ].filter(Boolean).join(' '));
    if (source === 'semantic-surface-grounder') {
      return { role: 'candidate', matchKind: 'literal-surface-card', reason: 'surface card matches prompt span' };
    }
    if (source === 'open-semantic-rag') {
      return { role: 'candidate', matchKind: 'literal-open-component', reason: 'open semantic component matches prompt span' };
    }
    if (/^embedding-guided-synth-node/.test(source)) {
      return { role: 'candidate', matchKind: 'literal-synth-node', reason: 'synthesized node is prompt object' };
    }
    if (source === 'prompt-explicit') {
      return { role: 'candidate', matchKind: 'explicit-primitive', reason: 'primitive id appears in prompt' };
    }
    if (source === 'prompt-family' && id === 'water' && phase3LanguageImpliesWater(prompt, predicates, relations)) {
      return { role: 'candidate', matchKind: 'implied-fluid-medium', reason: 'swimming language implies visible water medium' };
    }
    if (source === 'prompt-family') {
      if (phase3RowDirectlyMatchesPrompt({ ...row, phrase: '' }, prompt, spans)) {
        return { role: 'candidate', matchKind: 'direct-prompt-family', reason: 'prompt family primitive identity appears in prompt' };
      }
      return { role: 'support', matchKind: 'prompt-family-support', reason: 'prompt family support primitive is not literal prompt object' };
    }
    if (phase3RowDirectlyMatchesPrompt(row, prompt, spans)) {
      return { role: 'candidate', matchKind: 'literal-lexical', reason: 'primitive identity appears in prompt language' };
    }
    if (/^(math|physics|material|constraint|loss|field|process|body)$/.test(layer)) {
      return { role: 'support', matchKind: 'recipe-support', reason: 'unprompted implementation primitive from recipe expansion' };
    }
    return { role: 'support', matchKind: 'nonliteral-support', reason: 'retrieved row lacks direct prompt evidence' };
  }

  function phase3RowDirectlyMatchesPrompt(row = {}, prompt = '', spans = []) {
    if (!prompt) return false;
    const promptText = normalizeForEvidence(prompt);
    const spanTexts = (spans || []).map((span) => normalizeForEvidence(span.text)).filter(Boolean);
    const values = [
      row.id,
      row.primitiveId,
      row.label,
      row.phrase,
      row.role,
    ].map((value) => normalizeForEvidence(value)).filter(Boolean);
    return values.some((value) => {
      if (!value || phase3GenericPromptMatchValue(value)) return false;
      if (phase3PhraseInPrompt(value, promptText)) return true;
      return spanTexts.some((spanText) => phase3PhraseInPrompt(value, spanText) || phase3PhraseInPrompt(spanText, value));
    });
  }

  function phase3PhraseInPrompt(value = '', promptText = '') {
    const phrase = normalizeForEvidence(value);
    const prompt = normalizeForEvidence(promptText);
    if (!phrase || !prompt) return false;
    if (prompt.includes(phrase)) return true;
    const terms = phrase.split(/\s+/).filter((term) => term.length > 2);
    if (!terms.length || terms.length > 3) return false;
    return terms.every((term) => {
      const singular = term.endsWith('s') ? term.slice(0, -1) : term;
      return new RegExp(`\\b${singular}(?:s|es)?\\b`).test(prompt);
    });
  }

  function phase3GenericPromptMatchValue(value = '') {
    return PHASE3_GENERIC_PROMPT_MATCH_VALUES.has(normalizeForEvidence(value));
  }

  function phase3LanguageImpliesWater(prompt = '', predicates = [], relations = []) {
    if (/\b(water|lake|pool|pond|river|ocean|beach|underwater|swim|swims|swimming|swam)\b/.test(prompt)) return true;
    return (predicates || []).some((predicate) => (
      predicate.process === 'swimming' &&
      (predicate.objectRole === 'fluid-medium' || predicate.objectRole === 'containing-environment')
    )) || (relations || []).some((relation) => (
      relation.causalAffordance === 'agents-in-water' ||
      relation.targetText === 'water'
    ));
  }

  function phase3PrimitiveSort(a = {}, b = {}) {
    return Number(b.score || 0) - Number(a.score || 0) ||
      String(a.id || a.primitiveId || '').localeCompare(String(b.id || b.primitiveId || ''));
  }

	  function retrievalGroundingEvidence(
	    retrievalEvidence = {},
	    primitiveCuration = {},
	    typedEvidenceBuckets = null,
	    compositionLedger = null,
	    languageGraph = {},
	    queryPlan = null,
	    slotEvidence = [],
	    acceptedCandidatesBySlot = {},
	    missingRequiredSlots = []
	  ) {
    const components = phase3GroundingComponents(retrievalEvidence.components, primitiveCuration);
    return {
      schema: 'simulatte.retrievalGroundingEvidence.v1',
      intentBrief: null,
      acceptedGraph: null,
      rejectedGraph: null,
      contract: null,
      universeGraphCandidates: phaseCarryObject(retrievalEvidence.universeGraph || null),
      components: phaseCarryObject(components),
      assumptions: [],
      unsupported: [],
      visualSource: phaseCarryObject(retrievalEvidence.visualSource || null),
      params: phaseCarryObject(retrievalEvidence.params || {}),
      languageEvidence: null,
	      typedEvidenceBuckets: phaseCarryObject(typedEvidenceBuckets || null),
	      slotRetrieval: phaseCarryObject(retrievalEvidence.slotRetrieval || null),
	      compositionLedger: phaseCarryObject(compositionLedger || null),
	      languageGraph: phaseCarryObject(languageGraph || null),
	      queryPlan: phaseCarryObject(queryPlan || null),
	      slotEvidence: phaseCarryObject(slotEvidence || []),
	      acceptedCandidatesBySlot: phaseCarryObject(acceptedCandidatesBySlot || {}),
	      missingRequiredSlots: phaseCarryObject(missingRequiredSlots || []),
	    };
	  }

  function phase3GroundingComponents(components = [], primitiveCuration = {}) {
    const rows = Array.isArray(components) ? components : [];
    const candidateById = new Map((primitiveCuration.rankedPrimitives || [])
      .map((row) => [row.id || row.primitiveId, row]));
    const supportById = new Map((primitiveCuration.supportPrimitives || [])
      .map((row) => [row.id || row.primitiveId, row]));
    return rows.map((component) => {
      const id = component && (component.id || component.primitiveId || component.canonicalId);
      const candidate = candidateById.get(id);
      const support = supportById.get(id);
      if (candidate) {
        return {
          ...component,
          retrievalRole: 'candidate',
          matchKind: candidate.matchKind || component.matchKind || '',
          supportOnly: false,
          supportReason: '',
        };
      }
      if (support) {
        return {
          ...component,
          retrievalRole: 'support',
          matchKind: support.matchKind || component.matchKind || '',
          supportOnly: true,
          supportReason: support.supportReason || support.reason || 'support primitive not literal prompt object',
        };
      }
      return component;
    });
  }

  function phaseCarryIntentBrief(intentBrief = null) {
    if (!intentBrief || typeof intentBrief !== 'object') return null;
    const { activationCloud, ...rest } = intentBrief;
    return phaseCarryObject({
      ...rest,
      activationRows: Array.isArray(activationCloud) ? activationCloud : [],
    });
  }

  function phaseCarryObject(value) {
    return stripForbiddenCarryFields(value, new Set(PHASE_CARRY_FORBIDDEN_FIELD_NAMES));
  }

  function stripForbiddenCarryFields(value, forbiddenNames) {
    if (Array.isArray(value)) return value.map((item) => stripForbiddenCarryFields(item, forbiddenNames));
    if (!value || typeof value !== 'object') return value;
    const out = {};
    for (const [key, child] of Object.entries(value)) {
      if (forbiddenNames.has(key)) continue;
      out[key] = stripForbiddenCarryFields(child, forbiddenNames);
    }
    return out;
  }

  function activationCloudFromPhase3Artifact(artifact = {}) {
    const retrievalRerankResult = artifact.retrievalRerankResult || {};
    const groundingEvidence = retrievalRerankResult.groundingEvidence || {};
    const intentBrief = groundingEvidence.intentBrief || {};
    const languageEvidence = languageEvidenceFromPhase3Artifact(artifact, intentBrief, groundingEvidence);
    const candidateEvidence = normalizedEvidenceRowsFromPhase3(retrievalRerankResult, intentBrief);
    const builtActivations = buildActivationCloud
      ? buildActivationCloud({ languageEvidence, evidenceRows: candidateEvidence })
      : [];
    const fallbackActivations = activationRowsFromIntentBrief(intentBrief);
    const weightedActivations = builtActivations.length ? builtActivations : fallbackActivations;
    const summary = summarizeActivationCloud
      ? summarizeActivationCloud(weightedActivations)
      : {
        schema: 'simulatte.activationCloudSummary.v1',
        activationCount: weightedActivations.length,
      };
    const intentBriefWithEvidence = {
      ...(intentBrief || {}),
      languageEvidence: intentBrief.languageEvidence || languageEvidence,
      retrievedEvidence: Array.isArray(intentBrief.retrievedEvidence) && intentBrief.retrievedEvidence.length
        ? intentBrief.retrievedEvidence
        : candidateEvidence,
	      activationSummary: intentBrief.activationSummary || summary,
	      typedEvidenceBuckets: intentBrief.typedEvidenceBuckets || retrievalRerankResult.typedEvidenceBuckets || null,
	      compositionLedger: intentBrief.compositionLedger || retrievalRerankResult.compositionLedger || null,
	      queryPlan: intentBrief.queryPlan || retrievalRerankResult.queryPlan || null,
	      slotEvidence: intentBrief.slotEvidence || retrievalRerankResult.slotEvidence || [],
	      acceptedCandidatesBySlot: intentBrief.acceptedCandidatesBySlot || retrievalRerankResult.acceptedCandidatesBySlot || {},
	      missingRequiredSlots: intentBrief.missingRequiredSlots || retrievalRerankResult.missingRequiredSlots || [],
	    };
	    const slotActivations = slotActivationsFromSlotEvidence(retrievalRerankResult.slotEvidence || []);
	    const relationActivations = slotActivations.filter((row) => row.slotRole === 'relation');
	    const supportActivations = supportActivationsFromRetrieval(retrievalRerankResult);
	    return {
	      schema: ACTIVATION_CLOUD_SCHEMA,
	      languageEvidence: phaseCarryObject(languageEvidence),
	      candidateEvidence: candidateEvidence.map((row) => phaseCarryObject(row)),
	      weightedActivations,
	      slotActivations,
	      relationActivations,
		      supportActivations,
		      queryPlan: phaseCarryObject(retrievalRerankResult.queryPlan || groundingEvidence.queryPlan || null),
		      slotEvidence: phaseCarryObject(retrievalRerankResult.slotEvidence || groundingEvidence.slotEvidence || []),
		      acceptedCandidatesBySlot: phaseCarryObject(
		        retrievalRerankResult.acceptedCandidatesBySlot ||
		        groundingEvidence.acceptedCandidatesBySlot ||
		        {}
		      ),
		      missingRequiredSlots: phaseCarryObject(
		        retrievalRerankResult.missingRequiredSlots ||
		        groundingEvidence.missingRequiredSlots ||
		        []
		      ),
		      typedEvidenceBuckets: phaseCarryObject(retrievalRerankResult.typedEvidenceBuckets || groundingEvidence.typedEvidenceBuckets || null),
		      compositionLedger: phaseCarryObject(retrievalRerankResult.compositionLedger || groundingEvidence.compositionLedger || null),
	      coverageBySlot: slotCoverageBySlot(retrievalRerankResult.queryPlan || {}, retrievalRerankResult.acceptedCandidatesBySlot || {}),
	      coverageByObligation: coverageByObligation(
	        retrievalRerankResult.compositionLedger || null,
	        retrievalRerankResult.acceptedCandidatesBySlot || {}
	      ),
	      negativeEvidence: negativeEvidenceRows(artifact.languageGraph || {}, artifact.sceneLanguageGraph || {}),
	      conflictsBySlot: {},
	      rejectedBySlot: rejectedBySlot(retrievalRerankResult.slotEvidence || []),
	      coverage: activationCoverage(intentBriefWithEvidence, summary, languageEvidence, candidateEvidence),
	      conflicts: uniqueByJson([
	        ...(intentBrief.coverageGaps || []),
	        ...(intentBrief.causalQuestions || []),
      ]),
      rejectedMatches: intentBrief.alternatives || retrievalRerankResult.rejectedMatches || [],
      evidenceBySpan: evidenceBySpanRows(intentBriefWithEvidence, languageEvidence, candidateEvidence),
      summary,
      groundingEvidence: phaseCarryObject({
        ...groundingEvidence,
        intentBrief: intentBriefWithEvidence,
	        languageEvidence,
	        typedEvidenceBuckets: retrievalRerankResult.typedEvidenceBuckets || groundingEvidence.typedEvidenceBuckets || null,
	        compositionLedger: retrievalRerankResult.compositionLedger || groundingEvidence.compositionLedger || null,
		        queryPlan: retrievalRerankResult.queryPlan || groundingEvidence.queryPlan || null,
		        slotEvidence: retrievalRerankResult.slotEvidence || groundingEvidence.slotEvidence || [],
		        acceptedCandidatesBySlot: retrievalRerankResult.acceptedCandidatesBySlot || groundingEvidence.acceptedCandidatesBySlot || {},
		        missingRequiredSlots: retrievalRerankResult.missingRequiredSlots || groundingEvidence.missingRequiredSlots || [],
		      }),
		    };
		  }

	  function slotActivationsFromSlotEvidence(slotEvidence = []) {
	    return (slotEvidence || []).flatMap((slot) => (slot.candidates || [])
	      .filter((candidate) => candidate.decision === 'accept')
	      .map((candidate, index) => phaseCarryObject({
	        id: `activation.${slot.slotId || 'slot'}.${index + 1}`,
	        slotId: slot.slotId || '',
	        slotRole: slot.slotRole || '',
	        entryId: slot.entryId || '',
	        relationIds: slot.relationIds || [],
	        candidateId: candidate.candidateId || '',
	        candidateKind: candidate.candidateType || '',
	        candidateLabel: candidate.candidateText || '',
	        score: Number(candidate.score || 0),
	        source: 'phase3-slot-evidence',
	        supportOnly: false,
	      })));
	  }

	  function supportActivationsFromRetrieval(retrievalRerankResult = {}) {
	    return (retrievalRerankResult.supportOnlyCandidates || []).map((row, index) => phaseCarryObject({
	      id: `support.activation.${index + 1}`,
	      slotId: row.slotId || 'support',
	      slotRole: row.slotRole || 'support',
	      candidateId: row.id || row.candidateId || '',
	      candidateLabel: row.label || row.candidateText || '',
	      source: 'phase3-support-only',
	      supportOnly: true,
	      reason: row.reason || row.supportReason || '',
	    }));
	  }

	  function slotCoverageBySlot(queryPlan = {}, acceptedCandidatesBySlot = {}) {
	    return Object.fromEntries((queryPlan.slots || []).map((slot) => {
	      const accepted = acceptedCandidatesBySlot[slot.slotId] || [];
	      return [slot.slotId, {
	        slotRole: slot.slotRole || '',
	        entryId: slot.entryId || '',
	        required: slot.required !== false,
	        status: accepted.length ? 'covered' : slot.required === false ? 'optional' : 'missing',
	        candidateIds: accepted.map((candidate) => candidate.id || candidate.candidateId || '').filter(Boolean),
	      }];
	    }));
	  }

	  function coverageByObligation(compositionLedger = null, acceptedCandidatesBySlot = {}) {
	    const obligations = compositionLedger && Array.isArray(compositionLedger.obligations)
	      ? compositionLedger.obligations
	      : [];
	    const acceptedSlotIds = Object.keys(acceptedCandidatesBySlot || {});
	    return Object.fromEntries(obligations.map((row) => {
	      const obligationId = String(row.obligationId || row.id || '');
	      const suffix = obligationId.replace(/^[a-z]+:/, '');
	      const slotId = acceptedSlotIds.find((key) => suffix && key.endsWith(suffix));
	      const evidenceCount = slotId ? (acceptedCandidatesBySlot[slotId] || []).length : 0;
	      return [obligationId, phaseCarryObject({
	        kind: row.kind || '',
	        required: row.required === true,
	        status: row.status || '',
	        covered: evidenceCount > 0,
	        evidenceCount,
	        slotId: slotId || '',
	      })];
	    }));
	  }

	  function negativeEvidenceRows(languageGraph = {}, sceneLanguageGraph = {}) {
	    const rows = [];
	    for (const negation of languageGraph.negations || []) {
	      rows.push(phaseCarryObject({
	        id: negation.id || `negation:${rows.length + 1}`,
	        kind: 'negation',
	        text: negation.text || '',
	        source: 'language-graph',
	      }));
	    }
	    const negatedEntries = [
	      ...(sceneLanguageGraph.entities || []),
	      ...(sceneLanguageGraph.actions || []),
	      ...(sceneLanguageGraph.environments || []),
	      ...(sceneLanguageGraph.mediums || []),
	    ].filter((entry) => entry.negated === true);
	    for (const entry of negatedEntries) {
	      rows.push(phaseCarryObject({
	        id: `negated:${entry.id || rows.length + 1}`,
	        kind: 'negated-entry',
	        entryId: entry.id || '',
	        label: entry.label || '',
	        source: 'scene-language-graph',
	      }));
	    }
	    return rows;
	  }

	  function rejectedBySlot(slotEvidence = []) {
	    return Object.fromEntries((slotEvidence || []).map((slot) => [
	      slot.slotId,
	      (slot.rejectedCandidateIds || []).slice(),
	    ]));
	  }

  function activationRowsFromIntentBrief(intentBrief = {}) {
    const grounded = intentBrief.groundedInterpretation || {};
    if (Array.isArray(intentBrief.activationRows)) return intentBrief.activationRows;
    if (Array.isArray(intentBrief.activationCloud)) return intentBrief.activationCloud;
    return (grounded.acceptedActivations || []).map((row) => ({
      id: row.id || row.candidateId || row.candidateLabel || '',
      spanId: row.spanId || '',
      spanKind: row.spanKind || '',
      spanText: row.spanText || '',
      candidateId: row.candidateId || '',
      candidateLabel: row.candidateLabel || row.label || '',
      candidateKind: row.candidateKind || row.kind || '',
      score: Number(row.score || row.confidence || 0),
      source: row.source || 'intent-brief-grounding',
    }));
  }

  function activationCoverage(intentBrief = {}, summary = {}, languageEvidence = {}, candidateEvidence = []) {
    const spans = languageEvidence.spans || intentBrief.languageEvidence && intentBrief.languageEvidence.spans || [];
    const confidence = Number(intentBrief.confidence || summary.confidence || 0);
    return {
      schema: 'simulatte.activationCoverage.v1',
      confidence: Number((confidence || Math.min(0.92, 0.28 + candidateEvidence.length * 0.015)).toFixed(3)),
      evidenceCount: candidateEvidence.length || (intentBrief.retrievedEvidence || []).length,
      spanCount: spans.length,
      activationCount: Number(summary.activationCount || 0),
    };
  }

  function evidenceBySpanRows(intentBrief = {}, languageEvidence = null, candidateEvidence = null) {
    const spans = languageEvidence && languageEvidence.spans || intentBrief.languageEvidence && intentBrief.languageEvidence.spans || [];
    const evidence = candidateEvidence || intentBrief.retrievedEvidence || [];
    return spans.map((span) => ({
      spanId: span.id || '',
      text: span.text || '',
      evidenceIds: evidence
        .filter((row) => evidenceSupportsSpan(row, span))
        .map((row) => row.id || row.candidateId || row.cardId || row.primitiveId || '')
        .filter(Boolean),
    }));
  }

  function evidenceSupportsSpan(row = {}, span = {}) {
    const spanId = String(span.id || '');
    const spanText = normalizeForEvidence(span.text);
    const rowSpan = String(row.spanId || row.span || '');
    if (spanId && rowSpan.includes(spanId)) return true;
    const rowText = normalizeForEvidence([
      row.label,
      row.id,
      row.candidateId,
      row.canonicalId,
      row.phrase,
      ...(row.aliases || []),
    ].filter(Boolean).join(' '));
    if (!spanText || !rowText) return false;
    return rowText.includes(spanText) || spanText.includes(rowText);
  }

  function languageEvidenceFromPhase3Artifact(artifact = {}, intentBrief = {}, groundingEvidence = {}) {
    if (groundingEvidence.languageEvidence) return phaseCarryObject(groundingEvidence.languageEvidence);
    if (intentBrief.languageEvidence) return phaseCarryObject(intentBrief.languageEvidence);
    return languageEvidenceFromLanguageGraph(artifact.languageGraph || {});
  }

  function languageEvidenceFromLanguageGraph(languageGraph = {}) {
    const spans = (languageGraph.spans || []).map((span, index) => ({
      id: span.id || `span.${index + 1}`,
      kind: span.kind || 'term',
      text: span.text || '',
      start: span.start,
      end: span.end,
      tokenStart: span.tokenStart,
      tokenEnd: span.tokenEnd,
    })).filter((span) => span.text);
    const spanById = new Map(spans.map((span) => [span.id, span]));
    const predicateFrames = (languageGraph.clauses || []).map((clause, index) => {
      const subject = spanById.get(clause.subjectSpanId) || {};
      const predicate = spanById.get(clause.verbSpanId) || {};
      const object = spanById.get(clause.objectSpanId) || {};
      const text = [subject.text, predicate.text || clause.process, object.text].filter(Boolean).join(' ');
      return {
        id: clause.id || `predicate.${index + 1}`,
        subject: subject.text || '',
        predicate: predicate.text || clause.process || '',
        object: object.text || '',
        result: '',
        text,
      };
    }).filter((frame) => frame.text);
    const rawText = String(languageGraph.sourceText || '');
    return {
      schema: 'simulatte.languageEvidence.v1',
      rawText,
      normalizedText: rawText.toLowerCase(),
      spans,
      predicateFrames,
      quantities: languageGraph.quantities || [],
      negations: languageGraph.negations || [],
      relations: languageGraph.relations || [],
      clauses: languageGraph.clauses || [],
      summary: {
        spanCount: spans.length,
        predicateFrameCount: predicateFrames.length,
        hasCausalLanguage: /\b(cause|drives|because|feedback|controls|forces|moves|flows|heats|cools|reacts|collides)\b/i.test(rawText),
      },
    };
  }

  function normalizedEvidenceRowsFromPhase3(retrievalRerankResult = {}, intentBrief = {}) {
    const rows = [];
    addEvidenceRows(rows, retrievalRerankResult.evidenceRows, 'retrieval-evidence');
    addEvidenceRows(rows, intentBrief.retrievedEvidence, 'intent-brief');
    addEvidenceRows(rows, retrievalRerankResult.rankedPrimitives, 'primitive-index');
    addEvidenceRows(rows, retrievalRerankResult.rankedCards, 'visual-card-index');
    addEvidenceRows(rows, candidateList(retrievalRerankResult.rankedUniverseRows), 'universe-index');
    addEvidenceRows(rows, retrievalRerankResult.semanticRag && retrievalRerankResult.semanticRag.openComponents, 'semantic-rag');
    addEvidenceRows(rows, retrievalRerankResult.spanRetrieval && retrievalRerankResult.spanRetrieval.matches, 'span-retrieval');
    return uniqueEvidenceRows(rows).slice(0, 320);
  }

  function addEvidenceRows(out, value, source) {
    candidateList(value).forEach((row, index) => {
      const normalized = normalizeCandidateEvidenceRow(row, source, index);
      if (normalized) out.push(normalized);
    });
  }

  function candidateList(value) {
    if (Array.isArray(value)) return value;
    if (!value || typeof value !== 'object') return [];
    if (Array.isArray(value.candidates)) return value.candidates;
    if (Array.isArray(value.matches)) return value.matches;
    if (Array.isArray(value.rows)) return value.rows;
    if (Array.isArray(value.openComponents)) return value.openComponents;
    return [];
  }

  function normalizeCandidateEvidenceRow(row = {}, source = 'candidate', index = 0) {
    if (!row || typeof row !== 'object') return null;
    const label = String(
      row.label ||
      row.name ||
      row.title ||
      row.phrase ||
      row.role ||
      row.primitiveId ||
      row.cardId ||
      row.canonicalId ||
      row.id ||
      ''
    ).trim();
    if (!label) return null;
    const id = String(
      row.id ||
      row.candidateId ||
      row.primitiveId ||
      row.cardId ||
      row.canonicalId ||
      `${source}.${slugify(label) || index + 1}`
    );
    const score = Number(row.score || row.confidence || row.similarity || row.finalScore || row.weight || 0.35);
    return phaseCarryObject({
      id,
      label,
      aliases: arrayClone(row.aliases),
      canonicalId: row.canonicalId || row.conceptId || row.primitiveId || row.cardId || id,
      semanticType: row.semanticType || row.type || row.kind || row.category || '',
      indexName: row.indexName || row.source || source,
      score: Number((Number.isFinite(score) ? score : 0.35).toFixed(4)),
      domains: arrayClone(row.domains || row.modules),
      materialId: row.materialId || row.material || '',
      materialIds: arrayClone(row.materialIds || (row.materialId || row.material ? [row.materialId || row.material] : [])),
      operatorHints: uniqueList([...(row.operatorHints || []), ...(row.operatorTypes || [])]).slice(0, 12),
      operatorTypes: uniqueList([...(row.operatorTypes || []), ...(row.operatorHints || [])]).slice(0, 12),
      primitiveHints: uniqueList([row.primitiveId, ...(row.primitiveHints || [])].filter(Boolean)).slice(0, 12),
      visualHints: uniqueList([...(row.visualHints || []), ...(row.shapeHints || []), ...(row.sceneHints || [])]).slice(0, 12),
      shapeHints: arrayClone(row.shapeHints),
      sceneHints: arrayClone(row.sceneHints),
      conceptIds: arrayClone(row.conceptIds || (row.canonicalId ? [row.canonicalId] : [])),
      evidence: arrayClone(row.evidence || [id]),
      source,
      retrievalRole: row.retrievalRole || '',
      supportOnly: row.supportOnly === true,
      matchKind: row.matchKind || '',
      supportReason: row.supportReason || '',
    });
  }

  function uniqueEvidenceRows(rows = []) {
    const seen = new Set();
    return rows.filter((row) => {
      const key = `${row.id}:${normalizeForEvidence(row.label)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function normalizeForEvidence(value = '') {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function uniqueByJson(rows = []) {
    const seen = new Set();
    return rows.filter((row) => {
      const key = JSON.stringify(row);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function runPhase4GroundedIntent(phase3Output, runtimeContext = {}) {
    assertPhaseEnvelope(phase3Output, 3, 'Phase 4 input');
    const activationCloud = phase3Output.artifact && phase3Output.artifact.activationCloud || {};
    const groundingEvidence = activationCloud.groundingEvidence || {};
    const languageEvidence = activationCloud.languageEvidence || groundingEvidence.languageEvidence || {};
    const candidateEvidence = activationCloud.candidateEvidence || [];
    const weightedActivations = activationCloud.weightedActivations || [];
    const intentBrief = phase4IntentBriefFromActivationCloud(activationCloud, groundingEvidence);
    const groundedInterpretation = buildGroundedInterpretation
      ? buildGroundedInterpretation({
        languageEvidence,
        activationCloud: weightedActivations,
        structuredIntent: intentBrief,
        causalGraph: intentBrief.causalGraph || [],
        visualAffordances: visualAffordancesFromIntentBrief(intentBrief),
      })
      : {
        schema: 'simulatte.groundedInterpretation.v1',
        acceptedActivations: [],
        evidenceBindings: [],
        unresolvedSpans: [],
        coverageGaps: [],
        summary: {},
      };
	    const acceptedGraph = groundedIntentAcceptedGraph({
	      groundingEvidence,
	      activationCloud,
	      languageEvidence,
	      candidateEvidence,
	      intentBrief,
	      groundedInterpretation,
	    });
	    const rejectedGraph = rejectedGraphFromGrounding(acceptedGraph, groundingEvidence, groundedInterpretation);
	    const compositionLedger = advanceCompositionLedger(
	      activationCloud.compositionLedger ||
	      groundingEvidence.compositionLedger ||
	      intentBrief.compositionLedger ||
	      null,
	      4,
	      'phase4-grounded-intent'
	    );
	    const groundedSceneContract = groundedSceneContractFromPhase4({
	      acceptedGraph,
	      rejectedGraph,
	      activationCloud,
	      groundingEvidence,
	      intentBrief,
	      groundedInterpretation,
	      compositionLedger,
	    });
	    const groundedIntent = {
	      schema: 'simulatte.groundedIntent.v1',
	      acceptedGraph,
	      rejectedGraph,
	      typedEvidenceBuckets: phaseCarryObject(
	        activationCloud.typedEvidenceBuckets ||
	        groundingEvidence.typedEvidenceBuckets ||
	        intentBrief.typedEvidenceBuckets ||
	        null
	      ),
		      queryPlan: phaseCarryObject(
		        activationCloud.queryPlan ||
		        groundingEvidence.queryPlan ||
		        intentBrief.queryPlan ||
		        null
		      ),
		      slotEvidence: phaseCarryObject(
		        activationCloud.slotEvidence ||
		        groundingEvidence.slotEvidence ||
		        intentBrief.slotEvidence ||
		        []
		      ),
		      acceptedCandidatesBySlot: phaseCarryObject(
		        activationCloud.acceptedCandidatesBySlot ||
		        groundingEvidence.acceptedCandidatesBySlot ||
		        intentBrief.acceptedCandidatesBySlot ||
		        {}
		      ),
		      missingRequiredSlots: phaseCarryObject(
		        activationCloud.missingRequiredSlots ||
		        groundingEvidence.missingRequiredSlots ||
		        intentBrief.missingRequiredSlots ||
		        []
		      ),
		      compositionLedger: phaseCarryObject(compositionLedger),
	      groundedSceneContract,
	      assumptions: groundingEvidence.assumptions || intentBrief.assumptions || [],
	      unsupported: groundingEvidence.unsupported || acceptedGraph && acceptedGraph.unsupported || intentBrief.unsupported || [],
      provenanceByNode: provenanceByNodeRows(acceptedGraph, {
        ...intentBrief,
        evidenceBindings: uniqueById([
          ...(intentBrief.evidenceBindings || []),
          ...(groundedInterpretation.evidenceBindings || []),
        ]),
      }),
      contract: groundingEvidence.contract || null,
      components: groundingEvidence.components || [],
      params: groundingEvidence.params || {},
      visualSource: groundingEvidence.visualSource || null,
      grounding: {
        schema: groundedInterpretation.schema || '',
        acceptedActivationCount: (groundedInterpretation.acceptedActivations || []).length,
        evidenceBindingCount: (groundedInterpretation.evidenceBindings || []).length,
        coverageGapCount: (groundedInterpretation.coverageGaps || []).length,
      },
    };
    return createPhaseEnvelope({
      phase: 4,
      inputSchema: phase3Output.schema,
      runtimeReceiptId: runtimeContext.runtimeReceiptId || phase3Output.runtimeReceiptId,
	      artifact: {
	        activationCloud,
	        groundedIntent,
	        groundedSceneContract,
	        compositionLedger,
	      },
	      receipts: [
	        {
	          id: 'phase4-grounded-intent',
	          schema: 'simulatte.phaseReceipt.v1',
	          acceptedNodes: acceptedGraph && Array.isArray(acceptedGraph.nodes) ? acceptedGraph.nodes.length : 0,
	          acceptedRelations: groundedSceneContract.acceptedRelations.length,
	          acceptedObligations: groundedSceneContract.acceptedObligations.length,
	          unsupported: groundedIntent.unsupported.length,
	          assumptions: groundedIntent.assumptions.length,
	        },
	      ],
    });
  }

  function phase4IntentBriefFromActivationCloud(activationCloud = {}, groundingEvidence = {}) {
    const carried = groundingEvidence.intentBrief || {};
    const candidateEvidence = activationCloud.candidateEvidence || [];
    const languageEvidence = activationCloud.languageEvidence || groundingEvidence.languageEvidence || {};
    const graphIntentBrief = groundingEvidence.universeGraphCandidates &&
      groundingEvidence.universeGraphCandidates.intentBrief || {};
    const graphVisualIntent = graphIntentBrief.visualIntent || {};
    const graphAffordances = visualAffordancesFromUniverseGraphCandidates(
      groundingEvidence.universeGraphCandidates || null
    );
    const carriedVisualIntent = carried.visualIntent || {};
    const visualIntent = {
      ...graphVisualIntent,
      ...carriedVisualIntent,
      affordances: uniqueById([
        ...graphAffordances,
        ...(carriedVisualIntent.affordances || []),
      ]),
    };
    return phaseCarryObject({
      ...carried,
      schema: carried.schema || INTENT_BRIEF_SCHEMA || 'simulatte.intentBrief.v1',
      prompt: carried.prompt || languageEvidence.rawText || '',
      languageEvidence: carried.languageEvidence || languageEvidence,
      retrievedEvidence: Array.isArray(carried.retrievedEvidence) && carried.retrievedEvidence.length
        ? carried.retrievedEvidence
        : candidateEvidence,
	      activationRows: activationCloud.weightedActivations || [],
	      activationSummary: carried.activationSummary || activationCloud.summary || {},
	      coverageGaps: carried.coverageGaps || activationCloud.conflicts || [],
	      alternatives: carried.alternatives || activationCloud.rejectedMatches || [],
	      causalVisualAffordances: uniqueById([
	        ...(carried.causalVisualAffordances || []),
	        ...graphAffordances,
	      ]),
	      visualIntent,
		      typedEvidenceBuckets: carried.typedEvidenceBuckets || activationCloud.typedEvidenceBuckets || groundingEvidence.typedEvidenceBuckets || null,
		      compositionLedger: carried.compositionLedger || activationCloud.compositionLedger || groundingEvidence.compositionLedger || null,
		      queryPlan: carried.queryPlan || activationCloud.queryPlan || groundingEvidence.queryPlan || null,
		      slotEvidence: carried.slotEvidence || activationCloud.slotEvidence || groundingEvidence.slotEvidence || [],
		      acceptedCandidatesBySlot: carried.acceptedCandidatesBySlot || activationCloud.acceptedCandidatesBySlot || groundingEvidence.acceptedCandidatesBySlot || {},
		      missingRequiredSlots: carried.missingRequiredSlots || activationCloud.missingRequiredSlots || groundingEvidence.missingRequiredSlots || [],
		    });
		  }

  function visualAffordancesFromUniverseGraphCandidates(graph = null) {
    if (!graph || typeof graph !== 'object') return [];
    const graphIntent = graph.intentBrief && graph.intentBrief.visualIntent || {};
    return uniqueById([
      ...(graph.visualAffordances || []),
      ...(graphIntent.affordances || []),
    ].map((row) => phaseCarryObject(row)));
  }

	  function groundedSceneContractFromPhase4({
	    acceptedGraph = null,
	    rejectedGraph = null,
	    activationCloud = {},
	    groundingEvidence = {},
	    intentBrief = {},
	    groundedInterpretation = {},
	    compositionLedger = null,
	  } = {}) {
	    const nodes = acceptedGraph && Array.isArray(acceptedGraph.nodes) ? acceptedGraph.nodes : [];
	    const graphRelations = acceptedGraph && Array.isArray(acceptedGraph.edges) ? acceptedGraph.edges : [];
	    const ledgerRelations = compositionLedger && Array.isArray(compositionLedger.relations) ? compositionLedger.relations : [];
	    const acceptedRelations = uniqueById([
	      ...ledgerRelations,
	      ...graphRelations.map((edge) => ({
	        id: edge.id || `${edge.source || 'source'}:${edge.relation || edge.type || 'relation'}:${edge.target || 'target'}`,
	        kind: edge.kind || edge.type || edge.relation || 'graph-relation',
	        from: edge.source || edge.from || '',
	        to: edge.target || edge.to || '',
	        evidenceIds: edge.evidence || [],
	        confidence: Number(edge.confidence || 0),
	      })),
	    ]);
	    return phaseCarryObject({
	      schema: GROUNDED_SCENE_CONTRACT_SCHEMA,
	      acceptedEntries: nodes.map((node) => ({
	        id: node.id || node.canonicalId || '',
	        label: node.label || node.canonicalId || '',
	        kind: node.nodeType || node.semanticType || 'entity',
	        provenance: node.provenance || node.source || '',
	        confidence: Number(node.confidence || 0),
	      })),
	      acceptedRelations,
	      acceptedObligations: compositionLedger && Array.isArray(compositionLedger.obligations)
	        ? compositionLedger.obligations.filter((row) => row.status !== 'lost' && row.status !== 'failed')
	        : [],
	      rejectedEntries: rejectedGraph && Array.isArray(rejectedGraph.rejected) ? rejectedGraph.rejected : [],
	      unsupported: groundingEvidence.unsupported || intentBrief.unsupported || acceptedGraph && acceptedGraph.unsupported || [],
	      assumptions: groundingEvidence.assumptions || intentBrief.assumptions || [],
	      provenanceByEntry: provenanceByNodeRows(acceptedGraph, {
	        ...intentBrief,
	        evidenceBindings: uniqueById([
	          ...(intentBrief.evidenceBindings || []),
	          ...(groundedInterpretation.evidenceBindings || []),
	        ]),
	      }),
	      slotCoverage: activationCloud.coverageBySlot || {},
	      compositionLedger,
	    });
	  }

  function groundedIntentAcceptedGraph({
    groundingEvidence = {},
    activationCloud = {},
    languageEvidence = {},
    candidateEvidence = [],
    intentBrief = {},
    groundedInterpretation = {},
  } = {}) {
    if (!groundUniverseGraph) return null;
    const promptParse = promptParseFromLanguageEvidence(languageEvidence);
    if (!promptParse) return null;
    const universeCandidateEvidence = candidateEvidenceFromUniverseGraphCandidates(
      groundingEvidence.universeGraphCandidates || null
    );
    const groundingCandidateEvidence = uniqueEvidenceRows([
      ...(candidateEvidence || []),
      ...universeCandidateEvidence,
    ]);
    const graph = groundUniverseGraph({
      prompt: languageEvidence.rawText || intentBrief.prompt || '',
      promptParse,
      components: groundingEvidence.components || [],
      universeMatches: { candidates: groundingCandidateEvidence },
      intentBrief: {
        ...intentBrief,
        groundedInterpretation,
        retrievedEvidence: groundingCandidateEvidence.length
          ? groundingCandidateEvidence
          : intentBrief.retrievedEvidence || [],
      },
    });
    return phaseCarryObject({
	      ...graph,
	      typedEvidenceBuckets: activationCloud.typedEvidenceBuckets || groundingEvidence.typedEvidenceBuckets || intentBrief.typedEvidenceBuckets || null,
	      compositionLedger: activationCloud.compositionLedger || groundingEvidence.compositionLedger || intentBrief.compositionLedger || null,
	      queryPlan: activationCloud.queryPlan || groundingEvidence.queryPlan || intentBrief.queryPlan || null,
	      slotEvidence: activationCloud.slotEvidence || groundingEvidence.slotEvidence || intentBrief.slotEvidence || [],
	      acceptedCandidatesBySlot: activationCloud.acceptedCandidatesBySlot || groundingEvidence.acceptedCandidatesBySlot || intentBrief.acceptedCandidatesBySlot || {},
	      missingRequiredSlots: activationCloud.missingRequiredSlots || groundingEvidence.missingRequiredSlots || intentBrief.missingRequiredSlots || [],
	    });
	  }

  function candidateEvidenceFromUniverseGraphCandidates(graph = null) {
    if (!graph || typeof graph !== 'object') return [];
    const rows = [];
    for (const row of graph.nodes || []) {
      rows.push(phaseCarryObject({
        id: row.id || row.canonicalId || '',
        label: row.label || row.canonicalId || row.id || '',
        canonicalId: row.canonicalId || row.id || '',
        semanticType: row.semanticType || row.type || '',
        domains: arrayClone(row.domains),
        materialId: row.materialId || '',
        materialIds: arrayClone(row.materialIds || (row.materialId ? [row.materialId] : [])),
        operatorHints: arrayClone(row.operatorHints || row.operatorTypes),
        operatorTypes: arrayClone(row.operatorTypes || row.operatorHints),
        primitiveHints: arrayClone(row.primitiveHints),
        conceptIds: arrayClone(row.conceptIds),
        shapeHints: arrayClone(row.shapeHints),
        sceneHints: arrayClone(row.sceneHints),
        indexName: row.indexName || 'universe-candidate-graph',
        score: Number(row.confidence || row.score || 0.42),
        evidence: arrayClone(row.evidence || [row.id || row.canonicalId].filter(Boolean)),
      }));
    }
    for (const spanRow of graph.candidates || []) {
      for (const row of spanRow.candidates || []) {
        rows.push(phaseCarryObject({
          id: row.id || row.canonicalId || row.label || '',
          label: row.label || row.canonicalId || row.id || '',
          aliases: arrayClone(row.aliases),
          canonicalId: row.canonicalId || row.id || '',
          semanticType: row.semanticType || row.type || '',
          domains: arrayClone(row.domains),
          materialId: row.materialId || '',
          materialIds: arrayClone(row.materialIds || (row.materialId ? [row.materialId] : [])),
          operatorHints: arrayClone(row.operatorHints || row.operatorTypes),
          operatorTypes: arrayClone(row.operatorTypes || row.operatorHints),
          primitiveHints: arrayClone(row.primitiveHints),
          conceptIds: arrayClone(row.conceptIds),
          shapeHints: arrayClone(row.shapeHints),
          sceneHints: arrayClone(row.sceneHints),
          indexName: row.indexName || 'universe-candidate-graph',
          score: Number(row.confidence || row.score || 0.42),
          evidence: arrayClone(row.evidence || [row.id || row.canonicalId || row.label].filter(Boolean)),
        }));
      }
    }
    return uniqueEvidenceRows(rows.filter((row) => row.label));
  }

  function promptParseFromLanguageEvidence(languageEvidence = {}) {
    const prompt = String(languageEvidence.rawText || languageEvidence.normalizedText || '');
    const spans = (languageEvidence.spans || []).map((span, index) => ({
      id: span.id || `span.${index + 1}`,
      text: span.text || '',
      kind: span.kind || 'term',
      start: span.start,
      end: span.end,
      tokenStart: span.tokenStart,
      tokenEnd: span.tokenEnd,
    })).filter((span) => span.text);
    if (!prompt && !spans.length) return null;
    return {
      schema: PROMPT_PARSE_SCHEMA || 'simulatte.promptParse.v1',
      prompt,
      tokens: [],
      spans,
      clauses: languageEvidence.clauses || [],
      modifiers: [],
    };
  }

  function rejectedGraphFromGrounding(acceptedGraph = null, groundingEvidence = {}, groundedInterpretation = {}) {
    return groundingEvidence.rejectedGraph || {
      schema: 'simulatte.rejectedGroundedGraph.v1',
      rejected: acceptedGraph && acceptedGraph.rejected || [],
      unresolved: uniqueById([
        ...(acceptedGraph && acceptedGraph.unresolved || []),
        ...(groundedInterpretation.unresolvedSpans || []),
        ...(groundedInterpretation.coverageGaps || []),
      ]),
    };
  }

  function visualAffordancesFromIntentBrief(intentBrief = {}) {
    return [
      ...(intentBrief.causalVisualAffordances || []),
      ...((intentBrief.visualIntent && intentBrief.visualIntent.affordances) || []),
    ];
  }

  function provenanceByNodeRows(acceptedGraph = {}, intentBrief = {}) {
    const bindings = intentBrief.evidenceBindings || [];
    return Object.fromEntries((acceptedGraph && acceptedGraph.nodes || []).map((node) => [
      node.id,
      {
        source: node.source || node.provenance && node.provenance.source || '',
        evidenceIds: bindings
          .filter((row) => row && (row.nodeId === node.id || row.targetId === node.id))
          .map((row) => row.evidenceId || row.id || '')
          .filter(Boolean),
      },
    ]));
  }

  function uniqueById(rows = []) {
    const seen = new Set();
    return rows.filter((row) => {
      const key = row && (row.id || row.targetId || row.spanId || JSON.stringify(row));
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function runPhase5SimulationCompile(phase4Output, runtimeContext = {}) {
    assertPhaseEnvelope(phase4Output, 4, 'Phase 5 input');
    const groundedIntent = phase4Output.artifact && phase4Output.artifact.groundedIntent || {};
    const acceptedGraph = groundedIntent.acceptedGraph || null;
    const components = Array.isArray(groundedIntent.components) ? groundedIntent.components : [];
    const contract = groundedIntent.contract || null;
    const params = groundedIntent.params || {};
    let physicsIR = null;
    if (buildPhysicsIR && acceptedGraph) {
      physicsIR = buildPhysicsIR({
        universeGraph: acceptedGraph,
        objects: components,
        params,
        contract,
      });
    }
    let validationReceipt = physicsIR && validatePhysicsIR ? validatePhysicsIR(physicsIR) : null;
    if (physicsIR && validationReceipt) {
      physicsIR = {
        ...physicsIR,
        receipt: {
          exact: validationReceipt.exact || [],
          approximate: validationReceipt.approximate || [],
          unresolved: validationReceipt.unresolved || [],
          unsupported: validationReceipt.unsupported || [],
        },
      };
    }
	    const solverGraph = physicsIR && compileSolverGraph ? compileSolverGraph(physicsIR, validationReceipt) : null;
	    const renderIR = physicsIR && solverGraph && compileRenderIR
	      ? attachRenderIRPhaseInputs(compileRenderIR(physicsIR, solverGraph, acceptedGraph), acceptedGraph)
	      : null;
	    const visualSource = groundedIntent.visualSource || {};
	    const compositionLedger = advanceCompositionLedger(
	      physicsIR && physicsIR.compositionLedger ||
	      groundedIntent.compositionLedger ||
	      acceptedGraph && acceptedGraph.compositionLedger ||
	      null,
	      5,
	      'phase5-simulation-compile'
	    );
	    const simulationCompile = {
	      schema: SIMULATION_COMPILE_SCHEMA,
	      physicsIR,
	      validationReceipt,
	      solverGraph,
	      renderIR,
	      loweredRelations: relationLoweringRows(physicsIR),
	      physicsObligations: physicsObligationsFromLedger(compositionLedger, physicsIR),
	      unsupportedPhysics: validationReceipt && Array.isArray(validationReceipt.unsupported)
	        ? validationReceipt.unsupported
	        : [],
	      compositionLedger,
	      stateChannels: stateChannelsForSolverGraph(solverGraph),
	      controls: uniqueControlsFromComponents(components),
	      readouts: readoutLabelsForContract(contract),
	      visualSource: {
        ...visualSource,
        objects: visualSource.objects || components,
        params: visualSource.params || params,
        contract: visualSource.contract || contract,
      },
    };
    return createPhaseEnvelope({
      phase: 5,
	      inputSchema: phase4Output.schema,
	      runtimeReceiptId: runtimeContext.runtimeReceiptId || phase4Output.runtimeReceiptId,
	      artifact: { simulationCompile, compositionLedger },
	      receipts: [
	        {
	          id: 'phase5-simulation-compile',
	          schema: 'simulatte.phaseReceipt.v1',
	          physicsIR: simulationCompile.physicsIR && simulationCompile.physicsIR.schema || '',
	          solverGraph: simulationCompile.solverGraph && simulationCompile.solverGraph.schema || '',
	          renderIR: simulationCompile.renderIR && simulationCompile.renderIR.schema || '',
	          loweredRelations: simulationCompile.loweredRelations.length,
	          physicsObligations: simulationCompile.physicsObligations.length,
	          unsupportedPhysics: simulationCompile.unsupportedPhysics.length,
	          stateChannels: simulationCompile.stateChannels.length,
	        },
	      ],
	    });
	  }

	  function relationLoweringRows(physicsIR = null) {
	    return (physicsIR && physicsIR.behaviorRelations || []).map((row) => phaseCarryObject({
	      schema: 'simulatte.relationLoweringReceipt.v1',
	      relationId: row.id || '',
	      agentEntityId: row.agentEntityId || '',
	      mediumEntityId: row.mediumEntityId || '',
	      process: row.process || '',
	      operators: row.operators || [],
	      stateChannels: row.stateChannels || [],
	      status: (row.operators || []).length ? 'lowered' : 'unsupported',
	    }));
	  }

	  function physicsObligationsFromLedger(compositionLedger = null, physicsIR = null) {
	    const operatorTypes = new Set((physicsIR && physicsIR.operators || []).map((row) => row.type).filter(Boolean));
	    return (compositionLedger && compositionLedger.obligations || [])
	      .filter((row) => row.kind === 'relation' || row.kind === 'action')
	      .map((row) => phaseCarryObject({
	        schema: 'simulatte.physicsObligationReceipt.v1',
	        obligationId: row.id || '',
	        required: row.required === true,
	        expectedOperators: row.action === 'swimming' || row.target === 'swimming'
	          ? ['fluid_locomotion', 'buoyancy', 'drag', 'wake_generation', 'body_water_contact', 'partial_submersion']
	          : [],
	        satisfiedOperators: row.action === 'swimming' || row.target === 'swimming'
	          ? ['fluid_locomotion', 'buoyancy', 'drag', 'wake_generation', 'body_water_contact', 'partial_submersion'].filter((type) => operatorTypes.has(type))
	          : [],
	        status: row.action === 'swimming' || row.target === 'swimming'
	          ? ['fluid_locomotion', 'buoyancy', 'drag', 'wake_generation', 'body_water_contact', 'partial_submersion'].every((type) => operatorTypes.has(type))
	            ? 'lowered'
	            : 'unsupported'
	          : row.status || 'preserved',
	      }));
	  }

  function stateChannelsForSolverGraph(solverGraph = null) {
    return Object.keys(solverGraph && solverGraph.channels || {});
  }

  function uniqueControlsFromComponents(components = []) {
    const seen = new Set();
    const controls = [];
    for (const component of components || []) {
      for (const control of component && component.controls || []) {
        const normalized = normalizeControl(control);
        const key = normalized.id || normalized.label || JSON.stringify(normalized);
        if (seen.has(key)) continue;
        seen.add(key);
        controls.push(normalized);
      }
    }
    return controls;
  }

  function readoutLabelsForContract(contract = null) {
    const graph = contract && contract.graph || {};
    return uniqueList([
      ...(graph.observables || []).map((row) => row && (row.label || row.id || row.kind)).filter(Boolean),
      ...(graph.nodes || []).map((node) => node && node.state && (node.state.label || node.state.kind)).filter(Boolean),
    ]).slice(0, 12);
  }

  function phase6InputFromSimulationCompile(phase5Output) {
    assertPhaseEnvelope(phase5Output, 5, 'Phase 6 input');
    const simulationCompile = phase5Output.artifact && phase5Output.artifact.simulationCompile || {};
    const visualSource = simulationCompile.visualSource || {};
    return {
      schema: 'simulatte.phase6.input.v1',
      inputSchema: phase5Output.schema,
      runtimeReceiptId: phase5Output.runtimeReceiptId,
      id: visualSource.specId || 'compiled-scene',
      templateId: visualSource.templateId || 'custom-world',
      name: visualSource.name || 'Compiled Scene',
      kind: visualSource.kind || 'custom',
      modules: visualSource.modules || [],
      objects: visualSource.objects || [],
      controls: simulationCompile.controls || [],
      params: visualSource.params || {},
      contract: visualSource.contract || {},
      physicsIR: simulationCompile.physicsIR || null,
      solverGraph: simulationCompile.solverGraph || null,
      renderIR: simulationCompile.renderIR || null,
      simulationCompile,
      phaseArtifacts: { phase5: phase5Output },
    };
  }

  function compilePhase6VisualProgram(phase5Output, compositionGraph = null) {
    assertPhaseEnvelope(phase5Output, 5, 'Phase 6 input');
    const phase6Input = phase6InputFromSimulationCompile(phase5Output);
    const nextCompositionGraph = compositionGraph || (
      buildCompositionGraph ? buildCompositionGraph(phase6Input) : null
    );
    const visualProgram = nextCompositionGraph && compileCompositionToRenderProgram
      ? refineRenderProgramSceneKind(
        compileCompositionToRenderProgram(nextCompositionGraph, phase6Input),
        phase6Input
      )
      : null;
    return { phase6Input, compositionGraph: nextCompositionGraph, visualProgram };
  }

  function createVisualCompileEnvelope(phase5Output, compositionGraph = null) {
    const compiled = compilePhase6VisualProgram(phase5Output, compositionGraph);
    return createVisualCompileEnvelopeFromCompiled(phase5Output, compiled);
  }

  function createVisualCompileEnvelopeFromCompiled(phase5Output, compiled = {}) {
    assertPhaseEnvelope(phase5Output, 5, 'Phase 6 output builder');
    const visualProgram = compiled.visualProgram || null;
	    const visualIR = visualProgram && visualProgram.visualIR || null;
	    const sceneRenderPacket = visualProgram && visualProgram.sceneRenderPacket ||
	      visualIR && visualIR.sceneRenderPacket ||
	      null;
	    const compositionLedger = visualIR && visualIR.compositionLedger || sceneRenderPacket && sceneRenderPacket.compositionLedger || null;
	    const visualCompile = {
	      schema: VISUAL_COMPILE_SCHEMA,
	      visualIR,
	      sceneRenderPacket,
	      renderInstances: visualIR && Array.isArray(visualIR.renderInstances) ? visualIR.renderInstances : [],
	      visualObligations: visualObligationsFromLedger(compositionLedger),
	      identityPreservation: identityPreservationRows(sceneRenderPacket, compositionLedger),
	      compositionLedger,
	      camera: visualIR && visualIR.camera || visualProgram && visualProgram.camera || {},
	      lights: sceneRenderPacket && sceneRenderPacket.lights || visualIR && visualIR.lighting && visualIR.lighting.lights || [],
	      passes: sceneRenderPacket && sceneRenderPacket.passes || [],
	      rendererPlan: visualProgram && visualProgram.rendererPlan || null,
      compositionGraphId: compiled.compositionGraph && compiled.compositionGraph.graphId || '',
    };
    return createPhaseEnvelope({
      phase: 6,
	      inputSchema: phase5Output.schema,
	      runtimeReceiptId: phase5Output.runtimeReceiptId,
	      artifact: { visualCompile, compositionLedger },
	      receipts: [
	        {
	          id: 'phase6-visual-compile',
	          schema: 'simulatte.phaseReceipt.v1',
          visualIR: visualIR && visualIR.schema || '',
          sceneRenderPacket: sceneRenderPacket && sceneRenderPacket.schema || '',
          renderInstances: visualCompile.renderInstances.length,
	          obligationCount: visualCompile.compositionLedger && Array.isArray(visualCompile.compositionLedger.obligations)
	            ? visualCompile.compositionLedger.obligations.length
	            : 0,
	          lostObligations: visualCompile.compositionLedger && Array.isArray(visualCompile.compositionLedger.obligations)
	            ? visualCompile.compositionLedger.obligations.filter((row) => LEDGER_FAILURE_STATUSES.has(row.status)).length
	            : 0,
	          identityPreservation: visualCompile.identityPreservation.length,
	          passes: visualCompile.passes.length,
	        },
	      ],
	    });
	  }

	  function visualObligationsFromLedger(compositionLedger = null) {
	    return (compositionLedger && compositionLedger.obligations || [])
	      .filter((row) => row.kind === 'visual' || row.ownedByPhase === 6)
	      .map((row) => phaseCarryObject({
	        schema: 'simulatte.visualObligationReceipt.v1',
	        obligationId: row.id || '',
	        target: row.target || '',
	        status: row.status || '',
	        evidence: row.visualEvidence || [],
	        required: row.required === true,
	      }));
	  }

	  function identityPreservationRows(sceneRenderPacket = null, compositionLedger = null) {
	    const identities = new Set((sceneRenderPacket && sceneRenderPacket.entities || [])
	      .map((row) => row.identity && row.identity.type)
	      .filter(Boolean));
	    return (compositionLedger && compositionLedger.obligations || [])
	      .filter((row) => row.kind === 'entity' || /^entity:/.test(row.id || ''))
	      .map((row) => {
	        const expected = String(row.target || (row.id || '').replace(/^entity:/, '') || '');
	        return phaseCarryObject({
	          schema: 'simulatte.identityPreservationReceipt.v1',
	          sourceEntryId: row.id || '',
	          acceptedLabel: row.target || row.id || '',
	          packetIdentityType: identities.has(expected) ? expected : '',
	          status: identities.has(expected) ? 'preserved' : 'lost',
	        });
	      });
	  }

  function runPhase6VisualCompile(phase5Output, compositionGraph = null) {
    return createVisualCompileEnvelope(phase5Output, compositionGraph);
  }

	  function createRenderExecutionInput(source = {}, simulationState = null, canvas = null) {
	    const phase6Output = source && source.schema === phaseOutputSchema(6)
	      ? source
	      : source && source.phaseArtifacts && source.phaseArtifacts.phase6 || null;
    if (!phase6Output) {
      throw new Error(`renderExecutionInput source expected ${phaseOutputSchema(6)}, received ${source && source.schema || 'missing phase6 artifact'}`);
    }
    assertPhaseEnvelope(phase6Output, 6, 'renderExecutionInput source');
    const visualCompile = phase6Output.artifact.visualCompile || null;
    if (!visualCompile || !visualCompile.sceneRenderPacket) {
      throw new Error('renderExecutionInput source missing artifact.visualCompile.sceneRenderPacket');
    }
    return {
      schema: RENDER_EXECUTION_INPUT_SCHEMA,
      inputSchema: phase6Output.schema,
      runtimeReceiptId: phase6Output.runtimeReceiptId || source && source.runtimeReceiptId || 'runtime:unknown',
	      sceneRenderPacket: visualCompile && visualCompile.sceneRenderPacket || null,
	      renderInstances: visualCompile && Array.isArray(visualCompile.renderInstances)
	        ? visualCompile.renderInstances
	        : [],
	      visualObligations: visualCompile && Array.isArray(visualCompile.visualObligations)
	        ? visualCompile.visualObligations
	        : [],
	      compositionLedger: visualCompile && visualCompile.compositionLedger || phase6Output.artifact.compositionLedger || null,
	      simulationState,
	      canvas,
	    };
	  }

  function runPhase7RenderExecution(source, simulationState = null, canvas = null, frameReceipt = {}) {
    let renderExecutionInput = null;
    let inputSchema = '';
    let runtimeReceiptId = 'runtime:unknown';
    if (source && source.schema === RENDER_EXECUTION_INPUT_SCHEMA) {
      if (source.inputSchema !== phaseOutputSchema(6)) {
        throw new Error(`Phase 7 input expected ${phaseOutputSchema(6)}, received ${source.inputSchema || 'missing inputSchema'}`);
      }
      renderExecutionInput = {
        ...source,
        simulationState: simulationState || source.simulationState || null,
        canvas: canvas || source.canvas || null,
      };
      inputSchema = source.inputSchema;
      runtimeReceiptId = source.runtimeReceiptId || runtimeReceiptId;
    } else {
      assertPhaseEnvelope(source, 6, 'Phase 7 input');
      renderExecutionInput = createRenderExecutionInput(source, simulationState, canvas);
      inputSchema = source.schema;
      runtimeReceiptId = source.runtimeReceiptId || runtimeReceiptId;
    }
    const sceneRenderPacket = renderExecutionInput.sceneRenderPacket || {};
	    if (sceneRenderPacket.schema !== 'simulatte.sceneRenderPacket.v1') {
	      throw new Error(`Phase 7 input expected sceneRenderPacket simulatte.sceneRenderPacket.v1, received ${sceneRenderPacket.schema || 'missing'}`);
	    }
	    const compositionLedger = advanceCompositionLedger(
	      renderExecutionInput.compositionLedger || sceneRenderPacket.compositionLedger || null,
	      7,
	      'phase7-webgpu-render'
	    );
		    const visualObligationProof = renderObligationProof(
		      sceneRenderPacket,
		      renderExecutionInput.visualObligations || [],
		      compositionLedger,
		      frameReceipt
		    );
		    const visualObligationProofSummary = summarizeRenderObligationProof(visualObligationProof);
		    const pixelAudit = frameReceipt.pixelAudit || renderPixelAudit(
		      sceneRenderPacket,
		      frameReceipt,
		      renderExecutionInput.canvas,
		      visualObligationProofSummary
		    );
		    return createPhaseEnvelope({
	      phase: 7,
	      inputSchema,
	      runtimeReceiptId,
	      artifact: {
	        renderExecution: {
	          schema: RENDER_EXECUTION_SCHEMA,
	          renderExecutionInputSchema: renderExecutionInput.schema,
	          sceneRenderPacketSchema: sceneRenderPacket.schema || '',
		          rendered: frameReceipt.rendered === true,
		          packetIdentitySummary: scenePacketIdentitySummary(sceneRenderPacket),
		          visualObligationProof,
		          visualObligationProofSummary,
		          shaderPath: frameReceipt.shaderPath || frameReceipt.renderPath || '',
		          pixelAudit,
			          compositionLedger,
		          renderCount: Number(frameReceipt.renderCount || 0),
		          frameMs: Number(frameReceipt.frameMs || 0),
		        },
		        compositionLedger,
		      },
		      receipts: [
	        {
	          id: 'phase7-webgpu-render',
	          schema: 'simulatte.phaseReceipt.v1',
	          sceneKind: sceneRenderPacket.sceneKind || '',
	          entityCount: Array.isArray(sceneRenderPacket.entities) ? sceneRenderPacket.entities.length : 0,
		          fieldCount: Array.isArray(sceneRenderPacket.fields) ? sceneRenderPacket.fields.length : 0,
		          effectCount: Array.isArray(sceneRenderPacket.effects) ? sceneRenderPacket.effects.length : 0,
		          visualObligationProofs: visualObligationProof.length,
		          failedObligations: visualObligationProofSummary.failCount,
		          unprovenObligations: visualObligationProofSummary.notProvenCount,
		          pixelAuditStatus: pixelAudit.status,
		        },
	      ],
	    });
	  }

		  function scenePacketIdentitySummary(sceneRenderPacket = {}) {
		    return Array.from(new Set((sceneRenderPacket.entities || [])
		      .flatMap((row) => {
		        const identity = row.identity || {};
		        return [identity.label, identity.type, identity.sourceLabel, row.label, row.id];
		      })
		      .filter(Boolean)));
		  }

		  function renderObligationProof(sceneRenderPacket = {}, visualObligations = [], compositionLedger = null, frameReceipt = {}) {
	    const identities = new Set((sceneRenderPacket.entities || [])
	      .map((row) => row.identity && row.identity.type)
	      .filter(Boolean));
	    const packetText = JSON.stringify({
	      identities: Array.from(identities),
	      fields: (sceneRenderPacket.fields || []).map((row) => [row.id, row.kind, row.layerSlot]),
	      effects: (sceneRenderPacket.effects || []).map((row) => [row.id, row.kind, row.layerSlot]),
	      entities: (sceneRenderPacket.entities || []).map((row) => [row.id, row.layerSlot, row.geometry && row.geometry.primitive, row.animation && row.animation.kind]),
	    }).toLowerCase();
	    const obligations = visualObligations.length
	      ? visualObligations
	      : (compositionLedger && compositionLedger.obligations || []).filter((row) => row.kind === 'visual' || row.ownedByPhase === 6);
	    const entityObligationTargets = new Set(((compositionLedger && compositionLedger.obligations) || [])
	      .filter((row) => row.kind === 'entity')
	      .map((row) => normalizeForEvidence(row.target || ''))
	      .filter(Boolean));
	    const identityList = Array.from(identities).map((identity) => normalizeForEvidence(identity));
	    const distinctEntityIdentityCount = entityObligationTargets.size
	      ? identityList.filter((identity) => entityObligationTargets.has(identity)).length
	      : identityList.length;
	    return obligations.map((row) => {
	      const target = normalizeForEvidence(row.target || row.obligationId || row.id || '');
	      const packetSatisfied = target.split(/\s+|-/).filter(Boolean).some((term) => packetText.includes(term)) ||
	        (/species distinct|species-distinct/.test(target) && distinctEntityIdentityCount >= 2) ||
	        (/wake|ripple/.test(target) && /wake|ripple/.test(packetText)) ||
	        (/submersion/.test(target) && /submersion/.test(packetText)) ||
	        (/swimming|swim/.test(target) && /swim/.test(packetText));
		      const rendered = frameReceipt.rendered === true;
		      const sourceStatus = row.status || '';
		      const status = rendered && packetSatisfied && !LEDGER_FAILURE_STATUSES.has(sourceStatus)
		        ? 'pass'
		        : rendered ? 'fail' : 'not-proven';
		      return phaseCarryObject({
		        schema: 'simulatte.phase7VisualObligationProof.v1',
		        obligationId: row.obligationId || row.id || '',
		        target: row.target || '',
		        required: row.required === true,
		        phase6Status: sourceStatus,
		        packetSatisfied,
		        pixelSatisfied: rendered && packetSatisfied,
		        status,
		        pass: status === 'pass',
		        evidence: packetSatisfied ? ['sceneRenderPacket'] : [],
		      });
		    });
		  }

		  function summarizeRenderObligationProof(proofs = []) {
		    return {
		      schema: 'simulatte.phase7VisualObligationProofSummary.v1',
		      proofCount: proofs.length,
		      passCount: proofs.filter((row) => row.status === 'pass').length,
		      failCount: proofs.filter((row) => row.status === 'fail').length,
		      notProvenCount: proofs.filter((row) => row.status === 'not-proven').length,
		      requiredObligationIds: proofs
		        .filter((row) => row.required === true)
		        .map((row) => row.obligationId)
		        .filter(Boolean),
		      passedObligationIds: proofs
		        .filter((row) => row.status === 'pass')
		        .map((row) => row.obligationId)
		        .filter(Boolean),
		      failedObligationIds: proofs
		        .filter((row) => row.status === 'fail')
		        .map((row) => row.obligationId)
		        .filter(Boolean),
		    };
		  }

		  function renderPixelAudit(sceneRenderPacket = {}, frameReceipt = {}, canvas = null, proofSummary = {}) {
		    const width = Number(canvas && canvas.width || frameReceipt.canvas && frameReceipt.canvas.width || 0);
		    const height = Number(canvas && canvas.height || frameReceipt.canvas && frameReceipt.canvas.height || 0);
		    const hasCanvasPixels = width * height > 0;
		    const packetDrawables = scenePacketDrawableCount(sceneRenderPacket);
		    const drawCount = Number(frameReceipt.drawCount || frameReceipt.sceneInstanceCount || packetDrawables || 0);
		    const livePixelAudit = auditLivePixelSamples(
		      phase7PixelSamples(frameReceipt, canvas),
		      {
		        required: frameReceipt.requireLivePixelSamples === true,
		        proofSummary,
		        drawableCount: packetDrawables,
		      }
		    );
		    const thresholds = {
		      minDrawableCount: packetDrawables > 0 ? 1 : 0,
		      minDrawCount: packetDrawables > 0 ? 1 : 0,
		      minCanvasPixels: hasCanvasPixels ? 1 : 0,
		      minLivePixelSamples: livePixelAudit.required ? livePixelAudit.thresholds.minVisibleSampleCount : 0,
		      minLivePixelContrast: livePixelAudit.required ? livePixelAudit.thresholds.minContrast : 0,
		      maxFailedObligations: 0,
		    };
		    const checks = [
		      {
		        id: 'rendered-frame',
		        actual: frameReceipt.rendered === true,
		        expected: true,
		        pass: frameReceipt.rendered === true,
		      },
		      {
		        id: 'scene-packet-drawables',
		        actual: packetDrawables,
		        expectedMin: thresholds.minDrawableCount,
		        pass: packetDrawables >= thresholds.minDrawableCount,
		      },
		      {
		        id: 'draw-count',
		        actual: drawCount,
		        expectedMin: thresholds.minDrawCount,
		        pass: drawCount >= thresholds.minDrawCount,
		      },
		      {
		        id: 'canvas-pixels',
		        actual: width * height,
		        expectedMin: thresholds.minCanvasPixels,
		        pass: width * height >= thresholds.minCanvasPixels,
		      },
		      {
		        id: 'visual-obligation-failures',
		        actual: Number(proofSummary.failCount || 0),
		        expectedMax: thresholds.maxFailedObligations,
		        pass: Number(proofSummary.failCount || 0) <= thresholds.maxFailedObligations,
		      },
		      {
		        id: 'live-pixel-sample-count',
		        actual: livePixelAudit.visibleSampleCount,
		        expectedMin: thresholds.minLivePixelSamples,
		        pass: livePixelAudit.visibleSampleCount >= thresholds.minLivePixelSamples,
		      },
		      {
		        id: 'live-pixel-contrast',
		        actual: livePixelAudit.minContrast,
		        expectedMin: thresholds.minLivePixelContrast,
		        pass: livePixelAudit.minContrast >= thresholds.minLivePixelContrast,
		      },
		      {
		        id: 'visual-obligation-pixel-samples',
		        actual: livePixelAudit.sampledRequiredObligationCount,
		        expectedMin: livePixelAudit.required ? livePixelAudit.requiredObligationCount : 0,
		        pass: livePixelAudit.obligationsSampled,
		      },
		    ];
		    return {
		      schema: 'simulatte.phase7PixelAudit.v1',
		      method: livePixelAudit.sampleCount > 0
		        ? 'live-pixel-samples'
		        : hasCanvasPixels ? 'canvas-render-receipt' : 'scene-packet-render-receipt',
		      status: checks.every((check) => check.pass) ? 'pass' : 'fail',
		      thresholds,
		      checks,
		      canvas: { width, height },
		      drawCount,
		      drawableCount: packetDrawables,
		      livePixelAudit,
		    };
		  }

		  function phase7PixelSamples(frameReceipt = {}, canvas = null) {
		    return normalizePhase7PixelSamples(
		      frameReceipt.pixelSamples ||
		      frameReceipt.livePixelSamples ||
		      frameReceipt.renderData && (frameReceipt.renderData.pixelSamples || frameReceipt.renderData.livePixelSamples) ||
		      canvas && canvas.__simulattePixelSamples ||
		      null
		    );
		  }

		  function normalizePhase7PixelSamples(source = null) {
		    const rows = Array.isArray(source)
		      ? source
		      : source && (source.samples || source.rows || source.pixelSamples) || [];
		    return rows.map((row, index) => {
		      const rgba = normalizeSampleRgba(row && (row.rgba || row.color || row.pixel));
		      const contrast = Number.isFinite(Number(row && row.contrast))
		        ? Number(row.contrast)
		        : rgbaContrast(rgba, row && (row.backgroundRgba || row.background || row.expectedBackground));
		      return {
		        schema: 'simulatte.phase7PixelSample.v1',
		        id: row && row.id || `sample:${index + 1}`,
		        obligationId: row && (row.obligationId || row.obligation || row.targetObligationId) || '',
		        label: row && row.label || '',
		        rgba,
		        alpha: rgba[3],
		        contrast,
		        visible: row && row.visible === false ? false : rgba[3] >= 8 && contrast >= 0.02,
		      };
		    });
		  }

		  function auditLivePixelSamples(samples = [], options = {}) {
		    const required = options.required === true;
		    const drawableCount = Number(options.drawableCount || 0);
		    const requiredIds = options.proofSummary && Array.isArray(options.proofSummary.requiredObligationIds)
		      ? options.proofSummary.requiredObligationIds
		      : [];
		    const visibleSamples = samples.filter((row) => row.visible === true);
		    const sampledRequiredIds = new Set(samples
		      .filter((row) => row.visible === true && row.obligationId && requiredIds.includes(row.obligationId))
		      .map((row) => row.obligationId));
		    const minVisibleSampleCount = required
		      ? Math.max(1, Math.min(3, drawableCount || samples.length || 1))
		      : 0;
		    const minContrast = required ? 0.035 : 0;
		    const minContrastValue = visibleSamples.length
		      ? Math.min(...visibleSamples.map((row) => Number(row.contrast || 0)))
		      : 0;
		    const obligationsSampled = !required || requiredIds.length === 0 ||
		      requiredIds.every((id) => sampledRequiredIds.has(id));
		    return {
		      schema: 'simulatte.phase7LivePixelAudit.v1',
		      required,
		      sampleCount: samples.length,
		      visibleSampleCount: visibleSamples.length,
		      minContrast: Number(minContrastValue.toFixed(4)),
		      sampledRequiredObligationCount: sampledRequiredIds.size,
		      requiredObligationCount: requiredIds.length,
		      obligationsSampled,
		      sampledObligationIds: Array.from(sampledRequiredIds),
		      thresholds: {
		        minVisibleSampleCount,
		        minContrast,
		      },
		      status: visibleSamples.length >= minVisibleSampleCount &&
		        minContrastValue >= minContrast &&
		        obligationsSampled ? 'pass' : 'fail',
		      samples: samples.slice(0, 32),
		    };
		  }

		  function normalizeSampleRgba(value) {
		    const row = Array.isArray(value) ? value : [];
		    return [
		      clampByte(row[0]),
		      clampByte(row[1]),
		      clampByte(row[2]),
		      clampByte(row[3] == null ? 255 : row[3]),
		    ];
		  }

		  function rgbaContrast(rgba = [], background = null) {
		    const base = Array.isArray(background) && background.length >= 3
		      ? background.map(clampByte)
		      : [0, 0, 0, 255];
		    const dr = Math.abs(clampByte(rgba[0]) - base[0]);
		    const dg = Math.abs(clampByte(rgba[1]) - base[1]);
		    const db = Math.abs(clampByte(rgba[2]) - base[2]);
		    return Number((Math.max(dr, dg, db) / 255).toFixed(4));
		  }

		  function clampByte(value) {
		    const parsed = Number(value);
		    if (!Number.isFinite(parsed)) return 0;
		    return Math.max(0, Math.min(255, Math.round(parsed)));
		  }

		  function scenePacketDrawableCount(sceneRenderPacket = {}) {
		    return (sceneRenderPacket.entities || []).length +
		      (sceneRenderPacket.fields || []).length +
		      (sceneRenderPacket.effects || []).length;
		  }

  function createSpec(templateId = 'magnetic-wheel', overrides = {}) {
    const template = templateById(templateId);
    const name = String(overrides.name || template.name).trim() || template.name;
    const controls = (overrides.controls || template.controls || []).map(normalizeControl);
    const modules = uniqueList(overrides.modules || template.modules || []);
    const objects = normalizeObjects(overrides.objects, template.objects || []);
    const spec = {
      schema: 'simulatte.simulationSpec.v1',
      id: overrides.id || `${slugify(name)}-${Date.now().toString(36)}`,
      templateId: template.id,
      name,
      kind: template.kind,
      description: String(overrides.description || template.description),
      modules,
      objects,
      controls,
      params: normalizeParams(template, overrides.params, controls),
      intent: overrides.intent || null,
      contract: overrides.contract || (
        overrides.intent && overrides.intent.resolution
          ? overrides.intent.resolution.contract || null
          : null
      ),
      promptParse: overrides.promptParse || null,
      universeGraph: overrides.universeGraph || null,
      physicsIR: overrides.physicsIR || null,
      validationReceipt: overrides.validationReceipt || null,
      solverGraph: overrides.solverGraph || null,
      renderIR: overrides.renderIR || null,
      phaseArtifacts: mergePhaseArtifacts(
        overrides.phaseArtifacts,
        overrides.intent && overrides.intent.phaseArtifacts
      ),
      createdAt: overrides.createdAt || new Date(0).toISOString(),
      remixOf: overrides.remixOf || '',
    };
    if (spec.templateId === 'custom-world') {
      Object.assign(spec, compileCompilerArtifacts(spec, overrides));
    }
    if (spec.phaseArtifacts && spec.phaseArtifacts.phase4 && !spec.phaseArtifacts.phase5) {
      const phase5 = runPhase5SimulationCompile(spec.phaseArtifacts.phase4, runtimeContextFromPhase(spec.phaseArtifacts.phase4));
      const simulationCompile = phase5.artifact && phase5.artifact.simulationCompile || {};
      spec.phaseArtifacts = mergePhaseArtifacts(spec.phaseArtifacts, phaseArtifactSet(null, phase5));
      spec.physicsIR = spec.physicsIR || simulationCompile.physicsIR || null;
      spec.validationReceipt = spec.validationReceipt || simulationCompile.validationReceipt || null;
      spec.solverGraph = spec.solverGraph || simulationCompile.solverGraph || null;
      spec.renderIR = spec.renderIR || simulationCompile.renderIR || null;
    }
    if (spec.phaseArtifacts && spec.phaseArtifacts.phase5) {
      const phase6Compiled = compilePhase6VisualProgram(spec.phaseArtifacts.phase5, overrides.compositionGraph || null);
      spec.compositionGraph = phase6Compiled.compositionGraph;
      spec.renderProgram = phase6Compiled.visualProgram;
      spec.phaseArtifacts = {
        ...spec.phaseArtifacts,
        phase6: createVisualCompileEnvelopeFromCompiled(spec.phaseArtifacts.phase5, phase6Compiled),
      };
    } else {
      spec.compositionGraph = overrides.compositionGraph || (
        buildCompositionGraph && spec.templateId === 'custom-world' ? buildCompositionGraph(spec) : null
      );
      spec.renderProgram = overrides.renderProgram || (
        spec.compositionGraph && compileCompositionToRenderProgram
          ? compileCompositionToRenderProgram(spec.compositionGraph, spec)
          : null
      );
    }
    spec.physicalSpec = overrides.physicalSpec || (
      spec.contract && spec.contract.graph ? compilePhysicalSpec(spec) : null
    );
    return spec;
  }

  function refineRenderProgramSceneKind(renderProgram, spec) {
    const current = renderProgram.rendererPlan && renderProgram.rendererPlan.sceneKind || '';
    const authoritative = authoritativeVisualSceneKind(renderProgram);
    const sceneKind = authoritative || fineSceneKindFromSpec(spec, current);
    const visualIR = renderProgram.visualIR
      ? {
        ...renderProgram.visualIR,
        sceneKind,
        painterKind: renderProgram.visualIR.painterKind === 'generic' ||
          renderProgram.visualIR.painterKind === 'literal-composite'
          ? sceneKind
          : renderProgram.visualIR.painterKind,
      }
      : renderProgram.visualIR;
    return {
      ...renderProgram,
      rendererPlan: {
        ...(renderProgram.rendererPlan || {}),
        sceneKind,
      },
      visualIR,
      provenance: {
        ...(renderProgram.provenance || {}),
        sceneKind,
      },
    };
  }

  function authoritativeVisualSceneKind(renderProgram) {
    const candidates = [
      renderProgram && renderProgram.visualIR && renderProgram.visualIR.sceneKind,
      renderProgram && renderProgram.rendererPlan &&
        renderProgram.rendererPlan.visualIdentity &&
        renderProgram.rendererPlan.visualIdentity.sceneKind,
      renderProgram && renderProgram.rendererPlan &&
        renderProgram.rendererPlan.visualRecipe &&
        renderProgram.rendererPlan.visualRecipe.sceneKind,
      renderProgram && renderProgram.provenance &&
        renderProgram.provenance.visualIdentity &&
        renderProgram.provenance.visualIdentity.sceneKind,
    ];
    return candidates
      .map((value) => String(value || '').trim())
      .find((value) => value && value !== 'generic' && value !== 'literal-composite') || '';
  }

  function positiveLanguageText(value = '') {
    const word = "[a-z0-9]+(?:[-'][a-z0-9]+)*";
    const stop = '(?:and|with|while|where|when|because|but|however|though|although|unless|inside|outside|near|around|between|against|across|during|through|then|so)';
    const negated = new RegExp(`\\b(?:no|not|never|none|without|cannot|can't|wont|won't|avoid|exclude|except)\\b(?:\\s+(?:a|an|the|any))?(?:\\s+(?!\\b${stop}\\b)${word}){1,6}`, 'gi');
    return String(value || '').toLowerCase().replace(negated, ' ').replace(/\s+/g, ' ').trim();
  }

  function fineSceneKindFromSpec(spec, current = '') {
    const authoritative = authoritativeVisualSceneKind(spec && spec.renderProgram);
    if (authoritative) return authoritative;
    const renderIR = spec && spec.renderIR || {};
    const renderText = [
      renderIR.sceneHint,
      ...(renderIR.objects || []).map((object) => [
        object.id,
        object.label,
        object.glyph,
        object.materialId,
        object.visualRegime,
        object.semanticRef,
        object.physicalRef,
      ].filter(Boolean).join(' ')),
      ...(renderIR.fields || []).map((field) => [
        field.id,
        field.name,
        field.channel,
        field.domainId,
      ].filter(Boolean).join(' ')),
      ...(renderIR.causalAffordances || []).map((row) => [
        row.id,
        row.causalRelationId,
        row.sceneKind,
        row.geometry,
        ...(row.shaderHints || []),
        ...(row.motionHints || []),
      ].filter(Boolean).join(' ')),
    ].join(' ');
    const objectText = (spec.objects || []).map((object) => [
      object.id,
      object.type,
      object.role,
      object.layer,
      object.material,
      object.visualRegime,
      object.assembly,
      object.phrase,
      ...(object.domains || []),
      ...(object.slots || []),
    ].filter(Boolean).join(' ')).join(' ');
    const moduleText = (spec.modules || []).join(' ');
    const text = positiveLanguageText(`${renderText} ${objectText} ${moduleText}`);
    if (/\b(supercell|thunderstorm|hail|cloud microphysics|monsoon|atmospheric river|jetstream|storm cell|rain band|convection)\b/.test(text)) return 'weather-atmosphere';
    if (/\b(glacier calving|fjord|sea ice|ice shelf|iceberg|internal ocean wave|internal ocean waves|kelp canopy|ocean mixing|plankton bloom|thermocline)\b/.test(text)) return 'ocean-cryosphere';
    if (/\b(microgrid|battery inverter|inverter|transformer overload|substation|power flow|load shedding|frequency control|grid storage|voltage sag)\b/.test(text)) return 'grid-energy';
    if (/\b(warehouse robot|warehouse robots|robot arm|robot arms|robotic gripper|robot gripper|servo gripper|servo loop|drone swarm|autopilot|path planner|pick and place|pick-and-place|mobile robot|robot sorts|robot sort|contact force workcell|robotic workcell)\b/.test(text)) return 'robotics-control';
    if (/\b(injection molding|steel tooling|assembly line|conveyor belt|conveyor belts|cnc|extruder|cooling die|factory line|pick station)\b/.test(text)) return 'manufacturing-line';
    if (/\b(qubit|quantum chip|phase readout|microwave resonator|superconducting circuit|ion trap|spin lattice|photonic chip|wavefunction|electron microscope)\b/.test(text)) return 'quantum-instrument';
    if (/\b(compost|greenhouse crop|greenhouse crops|anaerobic digester|organic waste|nutrient loop|crop rotation|fish farm|soil nutrients|algae bioreactor)\b/.test(text)) return 'agro-waste-loop';
    if (/\b(neutrino|muon|particle collider|calorimeter|phototube|detector slice|water tank detector|underground water tank|cherenkov|photon cone)\b/.test(text)) return 'particle-instrument';
    if (/\b(protein folding|protein fold|bond constraint|energy minimization|molecular chain|amino acid|ligand|fermentation|sourdough|gluten|dough matrix|yeast|microbial fermentation)\b/.test(text)) return 'molecular-biology';
    if (/\b(chemical clock|belousov|polymer|epoxy|crosslink|electroplat|nickel|crystal nucleation|supersaturated|catalyst|ammonia|electrolyzer|hydrogen|reactor|reaction dish|microfluidic|droplet|droplets|channel junction|acidity gradient|acid gradient)\b/.test(text)) return 'chemistry-lab';
    if (/\b(museum preservation|archive preservation|oil paint aging|paint drying|pigment film|varnish aging|ceramic glaze|manuscript humidity|conservation lab)\b/.test(text)) return 'cultural-material';
    if (/\b(festival|stadium|restaurant|hotel|elevator|crowd|fan agents|guests|order queue|concourse|venue)\b/.test(text)) return 'venue-crowd';
    if (/\b(skate|skateboard|ski|surf|sailing|regatta|archery|fairground|mountain bike|rider|sports|trajectory transfer|centripetal|curved bowl|friction loss)\b/.test(text)) return 'sport-motion';
    if (/\b(bridge resonance|vortex shedding|wind vortex|bridge cable|bridge cables|structural mode|modal vibration|aeroelastic|flutter)\b/.test(text)) return 'structural-mechanics';
    if (/\b(radio telescope|telescope array|radio dishes|deep space network|microwave|beamforming|probe|link budget|baseline|antenna)\b/.test(text)) return 'space-instrument';
    if (/\b(heat|thermal|cooling|battery runaway|reentry|lava|magma|molten|volcano)\b/.test(text)) return 'thermal-plume';
    if (/\b(asteroid|mining|mars|venus|europa|titan|interstellar|comet|planetary ring|planetary rings|shepherd moon|moon resonance|orbital resonance|dark matter|galaxy cluster|exoplanet|magnetosphere|aurora|solar flare|cosmic ray|neutrino|black hole|singularity)\b/.test(text)) return 'planetary-space';
    if (/\b(population genetics|allele|ecological succession|predator|prey|pollinator|fish school|bird flock|animal trail|bee agents|plant cohorts|flower visitation)\b/.test(text)) return 'evolution-ecology';
    if (/\b(crop rotation|greenhouse|fish farm|algae bioreactor|compost|landfill|recycling|soil nutrients|oxygen water|organic waste|mixed materials)\b/.test(text)) return 'agro-waste-loop';
    if (/\b(tunnel boring|mine ventilation|earthquake|tsunami|hurricane|tornado|urban heat|noise pollution|light pollution|air quality|desertification|fault|hazard)\b/.test(text)) return 'hazard-atmosphere';
    if (/\b(housing market|power market|carbon credit|supply demand|bullwhip|transit priority|bike network|emergency response|policy|audit ledger)\b/.test(text)) return 'civic-market';
    if (/\b(cyber|blockchain|mempool|recommendation|search engine|index shard|query routing|service graph|network packet|attack propagation|embedding space|server rack|cooling aisle)\b/.test(text)) return 'digital-network';
    if (/\b(robot surgery|prosthetic|rehab|vaccine|hospital|patient|clinical|tissue mesh|sensor skin|muscle activation|bedflow|triage|kidney|liver|cochlea|eye aqueous|lymph|insulin|wound|dna|crispr|ribosome|mitochondria)\b/.test(text)) return 'clinical-control';
    if (/\b(water treatment|peatland|oyster reef|living breakwater|restoration|rewetting|nitrification|biofilm media|water table|shell beds)\b/.test(text)) return 'restoration-water';
    if (/\b(nuclear waste|stellarator|fusion|plasma ribbon|magnetic twist|canister|geologic repository|membrane stack)\b/.test(text)) return 'advanced-energy';
    if (/\b(compiler|database|logic|neural network|tensor|activation|boolean|chip|wafer|semiconductor|server rack|data center)\b/.test(text)) return 'digital-network';
    if (/\b(mangrove|kelp|coral|plankton|ocean|river|delta|aquifer|storm sewer|dam sediment|bridge scour|groundwater|estuary|glacier|permafrost|lake|sea ice)\b/.test(text)) return 'watershed';
    if (/\b(qubit|quantum|electron microscope|photonic|metamaterial|laser cavity|telescope|lens|mirror|wavefront|light|optics)\b/.test(text)) return 'optics';
    if (/\b(acoustic|sound|violin|speaker|cochlea|echolocation|granular synthesis|music)\b/.test(text)) return 'acoustic';
    if (/\b(bio|cell|neuron|organ|microbe|plant|root|phloem|chloroplast|gut|immune|bone|protein|enzyme|fermentation|sourdough|gluten|dough|yeast)\b/.test(text)) return 'biology';
    if (/\b(fire|wildfire|flame|combustion|burn|smoke)\b/.test(text)) return 'fire';
    if (/\b(grain|powder|sand|dune|granular|sediment core|snowpack|avalanche)\b/.test(text)) return 'granular';
    if (/\b(magnet|ferrofluid|coil|plasma confinement|field)\b/.test(text)) return 'ferrofluid';
    if (/\b(robot|vehicle|bridge|cable|exoskeleton|drivetrain|compressor|turbine|bearing|collision|fracture|pendulum|mechanical|wheel)\b/.test(text)) return 'mechanical';
    if (/\b(queue|network|agent|market|traffic|subway|port|grid|water network|dispatch|scheduling)\b/.test(text)) return 'city';
    if (current && current !== 'generic' && current !== 'literal-composite') return current;
    if (hasModule(spec, 'network') || hasModule(spec, 'queue')) return 'city';
    if (hasModule(spec, 'chemistry')) return 'chemistry-lab';
    if (hasModule(spec, 'biology')) return 'biology';
    if (hasModule(spec, 'fluid')) return 'watershed';
    if (hasModule(spec, 'acoustics') || hasModule(spec, 'wave')) return 'acoustic';
    if (hasModule(spec, 'optics')) return 'optics';
    if (hasModule(spec, 'thermal')) return 'thermal-plume';
    if (hasModule(spec, 'granular')) return 'granular';
    return 'mechanical';
  }

  function normalizeSpec(raw) {
    if (!raw || typeof raw !== 'object') return createSpec('magnetic-wheel');
    const template = templateById(raw.templateId);
    return createSpec(template.id, {
      id: raw.id || `${template.id}-${Date.now().toString(36)}`,
      name: raw.name || template.name,
      description: raw.description || template.description,
      modules: raw.modules || template.modules || [],
      objects: raw.objects || template.objects || [],
      controls: raw.controls || template.controls || [],
      params: raw.params || {},
      intent: raw.intent || null,
      contract: raw.contract || null,
      compositionGraph: raw.compositionGraph || null,
      renderProgram: raw.renderProgram || null,
      physicalSpec: raw.physicalSpec || null,
      promptParse: raw.promptParse || null,
      universeGraph: raw.universeGraph || null,
      physicsIR: raw.physicsIR || null,
      validationReceipt: raw.validationReceipt || null,
      solverGraph: raw.solverGraph || null,
      renderIR: raw.renderIR || null,
      phaseArtifacts: raw.phaseArtifacts || null,
      createdAt: raw.createdAt || new Date(0).toISOString(),
      remixOf: raw.remixOf || '',
    });
  }

  function compileCompilerArtifacts(spec, overrides = {}) {
    const intent = spec.intent || {};
    const phaseArtifacts = mergePhaseArtifacts(
      spec.phaseArtifacts,
      intent.phaseArtifacts,
      overrides.phaseArtifacts
    );
    const phase2Output = phaseArtifacts.phase2 || null;
    const phase4Output = phaseArtifacts.phase4 || null;
    const languageGraph = phase2Output && phase2Output.artifact && phase2Output.artifact.languageGraph || {};
    const groundedIntent = phase4Output && phase4Output.artifact && phase4Output.artifact.groundedIntent || {};
    const prompt = languageGraph.sourceText || spec.name || '';
    const promptParse = overrides.promptParse || spec.promptParse || intent.promptParse || (
      parsePrompt ? parsePrompt(prompt) : null
    );
    const selectedUniverseGraph = overrides.universeGraph ||
      spec.universeGraph ||
      groundedIntent.acceptedGraph ||
      intent.universeGraph ||
      (
      groundUniverseGraph && promptParse
        ? groundUniverseGraph({
          prompt,
          promptParse,
          components: spec.objects || [],
          semanticRag: intent.semanticRag,
          universeMatches: intent.universeMatches,
          synthesis: intent.synthesis,
          cardMatches: intent.cardMatches || [],
          intentBrief: intent.intentBrief || null,
        })
        : null
      );
    const universeGraph = mergeUniverseGraphIntentBrief(selectedUniverseGraph, intent.intentBrief || null);
    let nextIR = overrides.physicsIR || spec.physicsIR || null;
    if (!nextIR && buildPhysicsIR && universeGraph) {
      nextIR = buildPhysicsIR({
        universeGraph,
        objects: spec.objects || [],
        params: spec.params || {},
        contract: spec.contract,
      });
    }
    const validationReceipt = overrides.validationReceipt || spec.validationReceipt || (
      nextIR && validatePhysicsIR ? validatePhysicsIR(nextIR) : null
    );
    if (nextIR && validationReceipt) {
      nextIR = {
        ...nextIR,
        receipt: {
          exact: validationReceipt.exact || [],
          approximate: validationReceipt.approximate || [],
          unresolved: validationReceipt.unresolved || [],
          unsupported: validationReceipt.unsupported || [],
        },
      };
    }
    const solverGraph = overrides.solverGraph || spec.solverGraph || (
      nextIR && compileSolverGraph ? compileSolverGraph(nextIR, validationReceipt) : null
    );
    const nextRenderIR = overrides.renderIR || spec.renderIR || (
      nextIR && solverGraph && compileRenderIR
        ? attachRenderIRPhaseInputs(compileRenderIR(nextIR, solverGraph, universeGraph), universeGraph)
        : null
    );
    const nextIntent = intent && promptParse && universeGraph
      ? { ...intent, promptParse, universeGraph }
      : intent;
    let generatedPhaseArtifacts = {};
    let runtimeContext = phase4Output ? runtimeContextFromPhase(phase4Output) : runtimeContextFromOptions({});
    let nextPhase4 = phase4Output || null;
    if (!nextPhase4) {
      const compatibilityPhase1 = withPhase1RetrievalEvidence(
        phaseArtifacts.phase1 || runPhase1RuntimeGate(prompt, { allowPrototypeFallback: true }),
        {
          semanticRag: intent.semanticRag,
          universeMatches: intent.universeMatches || [],
          intentBrief: intent.intentBrief || null,
          universeGraph,
          contract: spec.contract,
          components: spec.objects || [],
          visualSource: {
            specId: spec.id,
            templateId: spec.templateId,
            name: spec.name,
            kind: spec.kind,
            modules: spec.modules || [],
            objects: spec.objects || [],
            params: spec.params || {},
            contract: spec.contract || null,
          },
        }
      );
      runtimeContext = runtimeContextFromPhase(compatibilityPhase1);
      const compatibilityPhase2 = phaseArtifacts.phase2 || runPhase2LanguageGraph(compatibilityPhase1);
      const compatibilityPhase3 = runPhase3Retrieval(compatibilityPhase2, runtimeContext);
      nextPhase4 = runPhase4GroundedIntent(compatibilityPhase3, runtimeContext);
      generatedPhaseArtifacts = phaseArtifactSet(
        compatibilityPhase1,
        compatibilityPhase2,
        compatibilityPhase3,
        nextPhase4
      );
    }
    nextPhase4 = mergePhase4IntentBrief(nextPhase4, intent.intentBrief || null);
    const nextPhase5 = phaseArtifacts.phase5 || runPhase5SimulationCompile(nextPhase4, runtimeContext);
    const simulationCompile = nextPhase5.artifact && nextPhase5.artifact.simulationCompile || {};
    return {
      intent: nextIntent,
      promptParse,
      universeGraph,
      physicsIR: simulationCompile.physicsIR || nextIR,
      validationReceipt: simulationCompile.validationReceipt || validationReceipt,
      solverGraph: simulationCompile.solverGraph || solverGraph,
      renderIR: simulationCompile.renderIR || nextRenderIR,
      phaseArtifacts: mergePhaseArtifacts(phaseArtifacts, generatedPhaseArtifacts, phaseArtifactSet(nextPhase4, nextPhase5)),
    };
  }

  function attachRenderIRPhaseInputs(renderIR, universeGraph) {
    if (!renderIR || typeof renderIR !== 'object') return renderIR;
    return {
      ...renderIR,
      causalAffordances: Array.isArray(universeGraph && universeGraph.visualAffordances)
        ? universeGraph.visualAffordances.slice(0, 8).map((row) => ({ ...row }))
        : [],
      intentBriefReceipt: universeGraph && universeGraph.intentBrief
        ? intentBriefReceipt(universeGraph.intentBrief)
        : null,
      phaseInputs: {
        ...(renderIR.phaseInputs || {}),
        source: 'universeGraph.visualAffordances',
        neighboringIO: true,
      },
    };
  }

  function compilePhysicalSpec(spec) {
    const graph = spec.contract && spec.contract.graph || {};
    const renderProgram = spec.renderProgram || {};
    const solverPlan = renderProgram.solverPlan || solverPlanForGraph(graph);
    const solverGraph = spec.solverGraph || null;
    const solverChannels = solverGraph ? Object.keys(solverGraph.channels || {}) : [];
    const solverSteps = solverGraph ? solverGraph.steps || [] : [];
    const nodes = graph.nodes || [];
    // Prefer the executable solverGraph channels as the source of truth for state
    // hints; fall back to the legacy solverPlan only when no solverGraph compiled.
    // This keeps visual hints from desyncing with the authoritative execution graph.
    const visualStateHints = uniqueList([
      ...(solverGraph ? solverChannels : (solverPlan.state || [])),
      ...nodes.flatMap((node) => node.solverRequirements || []),
    ]);
    const intentBrief = spec.universeGraph && spec.universeGraph.intentBrief || null;
    const intentBriefLedger = intentBriefLedgerCounts(intentBrief);
    const visualPassHints = renderPassesForSolverPlan(solverPlan);
    const nodeIdsByType = (type) => nodes.filter((node) => node.nodeType === type).map((node) => node.id);
    return {
      schema: 'simulatte.physicalSpec.v1',
      sourceGraph: graph.schema || '',
      prompt: spec.renderIR && spec.renderIR.prompt || spec.universeGraph && spec.universeGraph.prompt || spec.name,
      materials: graphMaterialMap(nodes),
      operators: spec.physicsIR && spec.physicsIR.operators ? spec.physicsIR.operators : graph.operators || [],
      executionSource: solverGraph ? 'solverGraph' : 'solverPlan',
      executableSolverGraph: solverGraph ? {
        schema: solverGraph.schema,
        schedule: solverGraph.schedule || [],
        channelCount: solverChannels.length,
        stepCount: solverSteps.length,
        channels: solverChannels,
        steps: solverSteps.map((step) => ({
          operatorId: step.operatorId,
          operatorType: step.operatorType,
          solverId: step.solverId,
          stage: step.stage,
          reads: step.reads || [],
          writes: step.writes || [],
        })),
      } : null,
      stateChannels: solverChannels,
      stateTextures: solverGraph ? solverChannels : visualStateHints,
      visualStateHints,
      sources: nodeIdsByType('source'),
      sinks: nodeIdsByType('sink'),
      boundaries: nodeIdsByType('boundary'),
      sensors: nodeIdsByType('sensor'),
      controllers: nodeIdsByType('controller'),
      particles: particlePlansForNodes(nodes),
      fields: renderProgram.fields || [],
      readouts: spec.contract && spec.contract.readouts || [],
      renderPasses: solverGraph ? renderPassesForSolverGraph(solverGraph) : visualPassHints,
      visualPassHints: solverGraph ? visualPassHints : [],
      debugViews: debugViewsForGraph(graph),
      quality: graph.quality || { score: 1, residualTerms: [] },
      receipt: {
        classifier: spec.intent && spec.intent.classification ? spec.intent.classification.model.id : '',
        rerank: spec.intent && spec.intent.rerank ? spec.intent.rerank : null,
        rag: spec.intent && spec.intent.semanticRag ? spec.intent.semanticRag.model.id : '',
        doppler: dopplerReceipt(spec.intent && spec.intent.dopplerIntent),
        synthesis: synthesisReceipt(spec.intent && spec.intent.synthesis),
        renderer: renderProgram.rendererPlan ? renderProgram.rendererPlan.renderer : '',
        visualIdentity: renderProgram.provenance ? renderProgram.provenance.visualIdentity || null : null,
        visualGenome: renderProgram.provenance ? renderProgram.provenance.visualGenome || null : null,
        graphValidation: graph.validation ? graph.validation.status : 'unknown',
        validation: spec.validationReceipt || null,
        intentEvidenceCount: intentBriefLedger.evidenceCount,
        causalEdgeCount: intentBriefLedger.causalEdgeCount,
        causalAffordanceCount: intentBriefLedger.causalAffordanceCount,
        assumptionCount: intentBriefLedger.assumptionCount,
        unsupportedCount: intentBriefLedger.unsupportedCount,
        degradedCount: intentBriefLedger.degradedCount,
        intentBrief: intentBriefReceipt(intentBrief),
        physicsIR: spec.physicsIR ? spec.physicsIR.schema : '',
        solverGraph: spec.solverGraph ? spec.solverGraph.schema : '',
        renderIR: spec.renderIR ? spec.renderIR.schema : '',
      },
    };
  }

  function mergeUniverseGraphIntentBrief(universeGraph = null, authoritativeBrief = null) {
    if (!universeGraph || typeof universeGraph !== 'object') return universeGraph;
    if (!authoritativeBrief || typeof authoritativeBrief !== 'object') return universeGraph;
    const current = universeGraph.intentBrief || null;
    const authoritativeReceipt = intentBriefReceipt(authoritativeBrief);
    if (!authoritativeReceipt) return universeGraph;
    return {
      ...universeGraph,
      intentBrief: {
        ...(current || {}),
        ...authoritativeReceipt,
        activationSummary: current && current.activationSummary || authoritativeBrief.activationSummary || null,
        languageEvidence: current && current.languageEvidence || authoritativeBrief.languageEvidence || null,
        groundedInterpretation: current && current.groundedInterpretation || authoritativeBrief.groundedInterpretation || null,
        retrievedEvidence: current && current.retrievedEvidence || authoritativeBrief.retrievedEvidence || [],
        causalGraph: current && Array.isArray(current.causalGraph) && current.causalGraph.length
          ? current.causalGraph
          : authoritativeBrief.causalGraph || [],
        assumptions: current && current.assumptions || authoritativeBrief.assumptions || [],
        alternatives: current && current.alternatives || authoritativeBrief.alternatives || [],
        unsupported: current && current.unsupported || authoritativeBrief.unsupported || [],
        degradedTo: current && current.degradedTo || authoritativeBrief.degradedTo || [],
        negativeKnowledge: current && current.negativeKnowledge || authoritativeBrief.negativeKnowledge || [],
        visualIntent: current && current.visualIntent || authoritativeBrief.visualIntent || null,
      },
      visualAffordances: Array.isArray(universeGraph.visualAffordances) && universeGraph.visualAffordances.length
        ? universeGraph.visualAffordances
        : authoritativeBrief.visualIntent && Array.isArray(authoritativeBrief.visualIntent.affordances)
          ? authoritativeBrief.visualIntent.affordances.slice(0, 8).map((row) => ({ ...row }))
          : universeGraph.visualAffordances || [],
    };
  }

  function mergePhase4IntentBrief(phase4Output = null, authoritativeBrief = null) {
    if (!phase4Output || !authoritativeBrief || typeof phase4Output !== 'object') return phase4Output;
    const artifact = phase4Output.artifact || {};
    const groundedIntent = artifact.groundedIntent || {};
    const acceptedGraph = groundedIntent.acceptedGraph || null;
    if (!acceptedGraph) return phase4Output;
    const mergedAcceptedGraph = mergeUniverseGraphIntentBrief(acceptedGraph, authoritativeBrief);
    return {
      ...phase4Output,
      artifact: {
        ...artifact,
        groundedIntent: {
          ...groundedIntent,
          acceptedGraph: mergedAcceptedGraph,
          intentBrief: {
            ...(groundedIntent.intentBrief || {}),
            ...intentBriefReceipt(authoritativeBrief),
          },
        },
      },
    };
  }

  function intentBriefLedgerCounts(brief) {
    if (!brief) {
      return {
        evidenceCount: 0,
        causalEdgeCount: 0,
        causalAffordanceCount: 0,
        assumptionCount: 0,
        unsupportedCount: 0,
        degradedCount: 0,
      };
    }
    return {
      evidenceCount: (brief.retrievedEvidence || []).length || Number(brief.evidenceCount || 0),
      causalEdgeCount: (brief.causalGraph || []).length || Number(brief.causalEdgeCount || 0),
      causalAffordanceCount: brief.visualIntent &&
        Array.isArray(brief.visualIntent.affordances)
        ? brief.visualIntent.affordances.length
        : Number(brief.causalAffordanceCount || 0),
      assumptionCount: (brief.assumptions || []).length || Number(brief.assumptionCount || 0),
      unsupportedCount: (brief.unsupported || []).length || Number(brief.unsupportedCount || 0),
      degradedCount: (brief.degradedTo || []).length || Number(brief.degradedCount || 0),
    };
  }

  function intentBriefReceipt(brief) {
    if (!brief) return null;
    const counts = intentBriefLedgerCounts(brief);
    return {
      schema: brief.schema || 'simulatte.intentBrief.v1',
      modelStack: brief.modelStack || null,
      evidenceCount: counts.evidenceCount,
      causalEdgeCount: counts.causalEdgeCount,
      groundedCausalEdgeCount: (brief.causalGraph || [])
        .filter((edge) => (edge.evidence || []).length).length,
      causalAffordanceCount: counts.causalAffordanceCount,
      assumptionCount: counts.assumptionCount,
      unsupportedCount: counts.unsupportedCount,
      degradedCount: counts.degradedCount,
      evidenceIds: (brief.retrievedEvidence || []).map((item) => item.id).filter(Boolean).slice(0, 32),
      causalEdgeIds: (brief.causalGraph || []).map((edge) => edge.id || edge.ruleId).filter(Boolean).slice(0, 24)
        .concat((brief.causalEdgeIds || []).slice(0, 24))
        .slice(0, 24),
      causalAffordanceIds: brief.visualIntent && Array.isArray(brief.visualIntent.affordances)
        ? brief.visualIntent.affordances.map((row) => row.id).filter(Boolean).slice(0, 16)
        : (brief.causalAffordanceIds || []).slice(0, 16),
      acceptedActivations: intentBriefAcceptedActivations(brief),
      languageSpans: intentBriefLanguageSpans(brief),
      shaderHints: brief.visualIntent && brief.visualIntent.shaderHints || [],
      motionHints: brief.visualIntent && brief.visualIntent.motionHints || [],
      confidence: Number(brief.confidence || 0),
      validation: brief.validation ? {
        valid: brief.validation.valid,
        errors: brief.validation.errors || [],
        warnings: brief.validation.warnings || [],
      } : null,
    };
  }

  function intentBriefAcceptedActivations(brief) {
    const rows = brief && brief.groundedInterpretation &&
      Array.isArray(brief.groundedInterpretation.acceptedActivations)
      ? brief.groundedInterpretation.acceptedActivations
      : [];
    return rows.slice(0, 48).map((row) => ({
      activationId: row.activationId || row.id || '',
      spanId: row.spanId || '',
      spanKind: row.spanKind || '',
      spanText: row.spanText || '',
      candidateId: row.candidateId || '',
      candidateKind: row.candidateKind || '',
      candidateLabel: row.candidateLabel || '',
      score: Number(row.score || 0),
      source: row.source || '',
      operatorHints: row.hints && Array.isArray(row.hints.operator) ? row.hints.operator.slice(0, 8) : [],
      visualHints: row.hints && Array.isArray(row.hints.visual) ? row.hints.visual.slice(0, 8) : [],
      primitiveHints: row.hints && Array.isArray(row.hints.primitive) ? row.hints.primitive.slice(0, 8) : [],
    }));
  }

  function intentBriefLanguageSpans(brief) {
    const spans = brief && brief.languageEvidence && Array.isArray(brief.languageEvidence.spans)
      ? brief.languageEvidence.spans
      : [];
    return spans
      .filter((span) => span && span.text && ['clause', 'predicate-frame', 'verb-phrase', 'noun-phrase', 'modifier'].includes(span.kind || ''))
      .slice(0, 48)
      .map((span) => ({
        id: span.id || '',
        kind: span.kind || 'span',
        text: span.text || '',
      }));
  }

  function graphMaterialMap(nodes) {
    return Object.fromEntries((nodes || [])
      .filter((node) => node.material)
      .map((node) => [node.id, node.material]));
  }

  function solverPlanForGraph(graph) {
    const regimes = new Set((graph.nodes || []).map((node) => node.visualRegime).filter(Boolean));
    const families = [];
    if (regimes.has('fluid')) families.push('particle-advection');
    if (regimes.has('thermal')) families.push('heat-diffusion');
    if (regimes.has('optical')) families.push('ray-optics');
    if (regimes.has('magnetic')) families.push('magnetic-vector-field');
    if (regimes.has('electrical')) families.push('electric-potential-field');
    if (regimes.has('granular')) families.push('granular-settling');
    if (regimes.has('biological')) families.push('growth-diffusion');
    if (regimes.has('soft')) families.push('membrane-relaxation');
    if (regimes.has('acoustic')) families.push('wave-equation');
    if (regimes.has('phase')) families.push('phase-boundary');
    if (!families.length) families.push('scalar-coupled-state');
    return { families, state: uniqueList((graph.nodes || []).flatMap((node) => node.solverRequirements || [])) };
  }

  function renderPassesForSolverGraph(solverGraph) {
    if (!solverGraph || !Array.isArray(solverGraph.steps)) return [];
    const names = {
      heat_source: 'thermal-source-solve',
      heat_transfer: 'heat-transfer-solve',
      advection: 'advection-solve',
      diffusion: 'diffusion-solve',
      phase_transition: 'phase-boundary-solve',
      rotational_torque: 'rotational-mechanics-solve',
      rigid_collision: 'rigid-collision-solve',
      fracture_threshold: 'fracture-threshold-solve',
      pressure_flow_lite: 'pressure-flow-solve',
      wave_field: 'wave-field-solve',
      reaction_diffusion: 'reaction-diffusion-solve',
      network_flow: 'network-flow-solve',
      oscillator: 'oscillator-solve',
      growth_decay: 'growth-decay-solve',
      fluid_locomotion: 'fluid-locomotion-solve',
      buoyancy: 'buoyancy-solve',
      drag: 'drag-solve',
      wake_generation: 'wake-generation-solve',
      body_water_contact: 'body-water-contact-solve',
      partial_submersion: 'partial-submersion-solve',
    };
    return uniqueList(solverGraph.steps.map((step) => names[step.operatorType] || `${step.operatorType || 'operator'}-solve`));
  }

  function particlePlansForNodes(nodes) {
    return (nodes || [])
      .filter((node) => node.primitiveProgram)
      .map((node) => ({
        nodeId: node.id,
        visualRegime: node.visualRegime,
        material: node.primitiveProgram.material,
        parts: node.primitiveProgram.parts,
      }));
  }

  function renderPassesForSolverPlan(plan) {
    const families = plan.families || [];
    return uniqueList([
      'state-upload',
      ...families.map((family) => `${family}-solve`),
      'material-field-render',
      'particle-render',
      'composite',
      'debug-readback',
    ]);
  }

  function debugViewsForGraph(graph) {
    return uniqueList([
      'coverage',
      'physical-graph',
      ...(graph.quality && graph.quality.residualTerms && graph.quality.residualTerms.length ? ['residual-terms'] : []),
      ...(graph.validation && graph.validation.status === 'repaired' ? ['repairs'] : []),
    ]);
  }

  function dopplerReceipt(dopplerIntent) {
    if (!dopplerIntent) return null;
    return {
      schema: DOPPLER_INTENT_SCHEMA || 'simulatte.dopplerIntentHints.v1',
      source: dopplerIntent.source || 'doppler-residual-intent',
      model: dopplerIntent.model ? dopplerIntent.model.id : '',
      primitiveCount: (dopplerIntent.primitives || []).length,
      regimes: dopplerIntent.regimes || [],
      operators: dopplerIntent.operators || [],
    };
  }

  function spanRetrievalReceipt(spanRetrieval) {
    if (!spanRetrieval) return null;
    return {
      schema: spanRetrieval.schema || 'simulatte.spanEmbeddingRetrieval.v1',
      model: spanRetrieval.model || '',
      disabledReason: spanRetrieval.disabledReason || '',
      spanCount: Number(spanRetrieval.spanCount || 0),
      embeddedSpanCount: Number(spanRetrieval.embeddedSpanCount || 0),
      cachedSpanCount: Number(spanRetrieval.cachedSpanCount || 0),
      candidateCount: Number(spanRetrieval.candidateCount || 0),
      config: spanRetrieval.config || null,
    };
  }

  function contractForComponent(contract, id) {
    return {
      geometry: contract && contract.geometry ? contract.geometry[id] || null : null,
      ports: contract && contract.ports ? contract.ports[id] || null : null,
      slots: contract && contract.recipeSlots ? contract.recipeSlots[id] || [] : [],
    };
  }

  function averageMaterialProperties(materials = {}) {
    const values = Object.values(materials);
    if (!values.length) return {};
    const totals = {};
    for (const material of values) {
      for (const [key, value] of Object.entries(material)) {
        totals[key] = (totals[key] || 0) + Number(value || 0);
      }
    }
    return Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, value / values.length]));
  }

  function interactionTotals(contract) {
    const totals = {};
    for (const rule of contract && contract.interactions || []) {
      for (const [key, value] of Object.entries(rule.params || {})) {
        totals[key] = (totals[key] || 0) + Number(value || 0);
      }
    }
    return totals;
  }

  function operatorTotals(contract) {
    const totals = {};
    const operators = contract && contract.graph ? contract.graph.operators || [] : [];
    for (const operator of operators) {
      if (operator.id === 'combustion') {
        totals.heat = (totals.heat || 0) + 0.18;
        totals.matter = (totals.matter || 0) - 0.04;
      } else if (operator.id === 'advection') {
        totals.motion = (totals.motion || 0) + 0.12;
      } else if (operator.id === 'erosion') {
        totals.matter = (totals.matter || 0) + 0.14;
        totals.stability = (totals.stability || 0) - 0.04;
      } else if (operator.id === 'refraction') {
        totals.field = (totals.field || 0) + 0.08;
      } else if (operator.id === 'queueService') {
        totals.motion = (totals.motion || 0) - 0.04;
      } else if (operator.id === 'magnetism') {
        totals.field = (totals.field || 0) + 0.12;
      }
    }
    return totals;
  }

  function applyContractDefaults(params, contract) {
    if (!contract) return;
    const material = averageMaterialProperties(contract.materials);
    const interactions = interactionTotals(contract);
    const use = (key, value) => {
      if (Number.isFinite(value)) params[key] = clamp01(Number(value));
    };
    use('density', material.density);
    use('hardness', material.hardness);
    use('conductivity', material.conductivity);
    use('combustibility', material.combustibility + (interactions.fire || 0));
    use('moisture', material.moisture);
    use('opacity', material.opacity);
    if (Number.isFinite(material.refractiveIndex)) {
      params.refractiveIndex = clamp(material.refractiveIndex, 1, 2.6);
    }
    use('magnetization', material.magnetization);
    use('viscosity', material.viscosity);
    use('phaseThreshold', material.phasePoint);
    if (Number.isFinite(interactions.heat)) {
      params.heatTransfer = clamp01((params.heatTransfer || 0) + interactions.heat);
    }
    if (Number.isFinite(interactions.field)) {
      params.fieldStrength = clamp01((params.fieldStrength || 0) + interactions.field);
    }
    if (Number.isFinite(interactions.matter)) {
      params.complexity = clamp01((params.complexity || 0.5) + interactions.matter * 0.25);
    }
  }

  function applyCompiledParameterHints(hintText, params, addControl = () => {}) {
    const evidenceText = String(hintText || '').toLowerCase();
    const has = (...terms) => terms.some((term) => evidenceText.includes(term));
    const assign = (values) => {
      for (const [key, value] of Object.entries(values)) {
        params[key] = value;
        addControl(key);
      }
    };

    if ((has('sunlit', 'solar') && has('rotor', 'wheel')) || has('alternating magnets')) {
      assign({
        irradiance: 1040,
        magneticStrength: 0.9,
        sliderAmplitude: 0.68,
        sliderPhase: 0.12,
        loadTorque: 0.28,
        friction: 0.055,
        driveTiming: 0.64,
      });
    }
    if (has('dry pine', 'combustion', 'smoke lift', 'damp pockets')) {
      assign({
        combustibility: 0.88,
        moisture: 0.18,
        windSpeed: 0.52,
        flowRate: 0.38,
        heatTransfer: 0.74,
        opacity: 0.62,
        damping: 0.07,
      });
    }
    if (has('collimated', 'prismatic', 'refractive split') || has('glass lens', 'prism')) {
      assign({
        lightIntensity: 0.92,
        refractiveIndex: 1.68,
        opacity: 0.08,
        fieldStrength: 0.62,
        heatTransfer: 0.14,
        signalNoise: 0.04,
      });
    }
    if (has('rush-hour', 'demand queue', 'throughput meter', 'noisy packets')) {
      assign({
        queueBacklog: 0.78,
        serviceRate: 0.42,
        marketDemand: 0.74,
        networkLatency: 0.44,
        signalDelay: 0.32,
        signalNoise: 0.18,
      });
    }
    if (has('steep rain', 'rain channel', 'sediment fan', 'gravity slope')) {
      assign({
        flowRate: 0.82,
        erosionRate: 0.62,
        terrainSlope: 0.54,
        gravity: 0.18,
        granularFriction: 0.32,
        moisture: 0.76,
      });
    }
  }

  function parameterHintTextForIntent(intent = {}, contract = null) {
    const brief = intent.intentBrief || {};
    const contractGraph = contract && contract.graph || {};
    return [
      intent.title,
      ...(intent.domains || []),
      ...(intent.components || []).map((component) => [
        component.id,
        component.type,
        component.role,
        component.layer,
        component.material,
        component.visualRegime,
        component.assembly,
        component.phrase,
        ...(component.domains || []),
      ].filter(Boolean).join(' ')),
      ...(contractGraph.nodes || []).map((node) => [
        node.id,
        node.label,
        node.nodeType,
        node.material,
        node.role,
        ...(node.domains || []),
        ...(node.solverRequirements || []),
      ].filter(Boolean).join(' ')),
      ...(contractGraph.operators || []).map((operator) => [
        operator.id,
        operator.type,
        operator.label,
        operator.family,
      ].filter(Boolean).join(' ')),
      ...(brief.retrievedEvidence || []).map((row) => [
        row.id,
        row.label,
        row.indexName,
        ...(row.primitiveHints || []),
        ...(row.operatorHints || []),
        ...(row.visualHints || []),
      ].filter(Boolean).join(' ')),
      ...(brief.groundedInterpretation && brief.groundedInterpretation.acceptedActivations || []).map((row) => [
        row.candidateId,
        row.candidateLabel,
        row.candidateKind,
      ].filter(Boolean).join(' ')),
      ...(brief.causalGraph || []).map((edge) => [
        edge.id,
        edge.relationType,
        edge.operatorType,
        edge.sourceLabel,
        edge.targetLabel,
        edge.mechanism,
      ].filter(Boolean).join(' ')),
    ].filter(Boolean).join(' ');
  }

  function graphNodeForSpec(contract, id) {
    const nodes = contract && contract.graph ? contract.graph.nodes || [] : [];
    return nodes.find((node) => node.id === id) || null;
  }

  function createIntentFromPrompt(promptText = '', options = {}) {
    const phase1Output = runPhase1RuntimeGate(promptText, options);
    const phase2Output = runPhase2LanguageGraph(phase1Output);
    const runtimeContext = runtimeContextFromPhase(phase1Output);
    const languageGraph = phase2Output.artifact.languageGraph;
    const sourceText = languageGraph.sourceText;
    const prompt = String(sourceText || '').toLowerCase();
    const words = prompt.split(/[^a-z0-9]+/).filter(Boolean);
    const title = titleFromPrompt(words);
    const promptParse = phase2Output.artifact.promptParse || null;
    const semanticRag = options.semanticRag || (
      createSemanticRag && prompt.trim()
        ? createSemanticRag(sourceText, PHYSICAL_PRIMITIVES, { maxDocuments: 72, maxOpenComponents: 12 })
        : null
    );
    const universeMatches = options.universeMatches || null;
    const dopplerIntent = normalizeDopplerIntent
      ? normalizeDopplerIntent(options.dopplerIntent || options.dopplerHints, PHYSICAL_PRIMITIVES)
      : null;
    const hasModelBackedSelection = Array.isArray(options.embeddingPriors)
      && options.embeddingPriors.length
      && options.embeddingModel
      && options.embeddingModel.id;
    const allowPrototypeFallback = options.allowPrototypeFallback === true;
    const blankPromptIntent = options.blankPromptIntent === true;
    const shouldClassify = classifyIntentPrompt && (
      hasModelBackedSelection ||
      allowPrototypeFallback ||
      !prompt ||
      blankPromptIntent
    );
    const classification = shouldClassify
      ? classifyIntentPrompt(sourceText, {
        max: 36,
        embeddingPriors: options.embeddingPriors || [],
        embeddingModel: options.embeddingModel || null,
        embeddingBackend: options.embeddingBackend || '',
        allowPrototypeFallback,
        blankPromptIntent,
        semanticRag,
      })
      : null;
    const intent = {
      schema: 'simulatte.intent.v1',
      prompt: String(sourceText || '').trim(),
      title: title || 'Custom Physics World',
      domains: [],
      components: [],
      conceptGraph: [],
      classification,
      promptParse,
      universeGraph: null,
      rerank: options.intentRerank || options.rerank || null,
      semanticRag,
      universeMatches,
      dopplerIntent,
      spanRetrieval: options.spanRetrieval || null,
      intentBrief: null,
      phaseArtifacts: phaseArtifactSet(phase1Output, phase2Output),
      resolution: {
        mode: '2d',
        integrator: 'semi-implicit-euler',
        renderer: 'webgpu-field-with-canvas-fallback',
        ranker: classification ? classification.model.id : 'simulatte-physical-primitives-v1',
        classifier: classification ? classification.model.id : 'simulatte-physical-primitives-v1',
        embedding: classification && classification.model.runtime ? classification.model.runtime : null,
        rerank: options.intentRerank || options.rerank || null,
        doppler: dopplerIntent ? dopplerReceipt(dopplerIntent) : null,
        retrievalPhase: options.retrievalPhase || '',
        spanRetrieval: spanRetrievalReceipt(options.spanRetrieval || null),
      },
    };
    const addDomain = (...domains) => {
      for (const domain of domains) {
        if (!intent.domains.includes(domain)) intent.domains.push(domain);
      }
    };
    const addComponent = (id, type, role, params = {}, controls = [], score = 0, meta = {}) => {
      if (intent.components.some((component) => component.id === id)) return;
      intent.components.push({
        id,
        type,
        role,
        params,
        controls: uniqueList(controls),
        score: Number(score || 0),
        ...meta,
      });
    };

    if (!prompt || blankPromptIntent) {
      intent.title = 'Blank Construction Plane';
      addDomain('blank');
      intent.resolution.integrator = 'none';
      addComponent('canvas', 'plane', 'empty 2d construction surface', { guideDensity: 0.42, canvasScale: 0.62 });
      if (groundUniverseGraph && promptParse) {
        intent.universeGraph = groundUniverseGraph({
          prompt,
          promptParse,
          components: intent.components,
          semanticRag,
          universeMatches,
          synthesis: null,
        });
      }
      const phase1WithRetrieval = withPhase1RetrievalEvidence(phase1Output, {
        rankedPrimitives: [],
        rankedCards: options.cardMatches || options.surfaceCardMatches || [],
        rankedUniverseRows: Array.isArray(universeMatches) ? universeMatches : [],
        semanticRag,
        rerank: intent.rerank,
        retrievalPhase: options.retrievalPhase || '',
        intentBrief: intent.intentBrief || null,
        universeGraph: intent.universeGraph || null,
        contract: intent.resolution.contract || null,
        components: intent.components || [],
        visualSource: {
          templateId: 'custom-world',
          name: intent.title,
          kind: 'custom',
          modules: intent.domains || [],
          objects: intent.components || [],
          params: {},
          contract: intent.resolution.contract || null,
        },
      });
      const retrievalRuntimeContext = runtimeContextFromPhase(phase1WithRetrieval);
      const phase3Output = runPhase3Retrieval(phase2Output, retrievalRuntimeContext);
      const phase4Output = runPhase4GroundedIntent(phase3Output, retrievalRuntimeContext);
      intent.phaseArtifacts = phaseArtifactSet(phase1WithRetrieval, phase2Output, phase3Output, phase4Output);
      return intent;
    }

    const synthesis = synthesizeWorldIntent
      ? synthesizeWorldIntent(sourceText, {
        cardMatches: options.cardMatches || options.surfaceCardMatches || [],
        primitivePriors: options.embeddingPriors || [],
        embeddingModel: options.embeddingModel || null,
        semanticRag,
        dopplerIntent,
      }, catalog)
      : null;
    if (synthesis) {
      intent.synthesis = synthesis;
      intent.resolution.synthesis = synthesisReceipt(synthesis);
    }

    const intentBrief = buildIntentForensics
      ? buildIntentForensics({
        prompt: sourceText,
        promptParse,
        semanticRag,
        universeMatches,
        dopplerIntent,
        synthesis,
        cardMatches: options.cardMatches || options.surfaceCardMatches || [],
        embeddingPriors: options.embeddingPriors || [],
        embeddingModel: options.embeddingModel || null,
        spanRetrieval: options.spanRetrieval || null,
        evidenceRows: options.evidenceRows || [],
      })
      : null;
    if (intentBrief) {
      intent.intentBrief = intentBrief;
      intent.resolution.intentBrief = {
        schema: intentBrief.schema || INTENT_BRIEF_SCHEMA || 'simulatte.intentBrief.v1',
        evidenceCount: (intentBrief.retrievedEvidence || []).length,
        causalEdgeCount: (intentBrief.causalGraph || []).length,
        assumptionCount: (intentBrief.assumptions || []).length,
        unsupportedCount: (intentBrief.unsupported || []).length,
        confidence: intentBrief.confidence || 0,
      };
    }

    const baseCatalogRanked = classification && rankPrimitivesForClassification
      ? rankPrimitivesForClassification(classification, { max: 40 })
      : withPrimitiveDependencies(rankPhysicalPrimitives(sourceText), sourceText);
    const synthRows = synthesisPrimitiveRows(synthesis);
    const preferSynthGraph = shouldPreferSynthGraph(sourceText, synthesis);
    const catalogRanked = preferSynthGraph ? [] : baseCatalogRanked;
    const semanticRows = preferSynthGraph ? [] : semanticOpenPrimitives(semanticRag);
    const explicitRows = explicitPromptPrimitiveRows(classification, sourceText);
    const ranked = mergeRankedPrimitives(
      catalogRanked,
      synthRows,
      semanticRows,
      dopplerHintPrimitives(dopplerIntent, sourceText),
      explicitRows
    );
    const contract = contractSummaryForPrimitives(ranked, sourceText);
    if (classification) {
      contract.layerFocus = classification.layerFocus;
      contract.classification = classificationSummary
        ? classificationSummary(classification)
        : {
          model: classification.model.id,
          confidence: classification.confidence,
          layerFocus: classification.layerFocus,
        };
    }
    if (dopplerIntent) {
      contract.doppler = {
        schema: dopplerIntent.schema,
        source: dopplerIntent.source,
        model: dopplerIntent.model,
        primitives: dopplerIntent.primitives.map((hint) => hint.primitiveId),
        regimes: dopplerIntent.regimes,
        operators: dopplerIntent.operators,
      };
    }
    if (synthesis) {
      contract.synthesis = {
        schema: synthesis.schema || SYNTHESIS_SCHEMA || '',
        model: synthesis.model,
        valid: synthesis.validation ? synthesis.validation.valid : false,
        nodes: synthesis.synthGraph ? synthesis.synthGraph.nodes.length : 0,
        relations: synthesis.synthGraph ? synthesis.synthGraph.relations.length : 0,
        events: synthesis.synthGraph ? synthesis.synthGraph.events.length : 0,
        groundedPrimitives: synthesis.groundedGraph ? synthesis.groundedGraph.primitiveIds.length : 0,
      };
    }
    intent.resolution.layerFocus = contract.layerFocus;
    intent.resolution.topLevel = contract.topLevel;
    intent.resolution.contract = contract;
    if (/\b(perpetual|magnetic wheel|solar magnetic|generator)\b/.test(prompt)) {
      intent.title = 'Solar Magnetic Perpetual Motion Machine';
    } else if (ranked.some((primitive) => primitive.domains.includes('optics'))) {
      intent.title = title || 'Prismatic Optics World';
    } else if (ranked.some((primitive) => primitive.domains.includes('fluid'))) {
      intent.title = title || 'Fluid Physics World';
    } else if (ranked.some((primitive) => primitive.domains.includes('chemistry'))) {
      intent.title = title || 'Reaction Field';
    } else if (ranked.some((primitive) => primitive.domains.includes('acoustics'))) {
      intent.title = title || 'Acoustic Wave World';
    } else {
      intent.title = title || 'Generated Physics World';
    }

    for (const primitive of ranked) {
      const primitiveContract = contractForComponent(contract, primitive.id);
      addDomain(...primitive.domains);
      addComponent(
        primitive.id,
        primitive.type,
        primitive.role,
        primitive.params,
        primitive.controls,
        primitive.score,
        {
          layer: primitive.layer || '',
          domains: primitive.domains || [],
          material: primitive.material || '',
          visualRegime: primitive.visualRegime || '',
          assembly: primitive.assembly || '',
          phrase: primitive.phrase || '',
          source: primitive.source || 'catalog',
          pinned: Boolean(primitive.pinned),
          primitiveProgram: primitive.primitiveProgram || null,
          geometry: primitiveContract.geometry,
          ports: primitiveContract.ports,
          slots: primitiveContract.slots,
        }
      );
      intent.conceptGraph.push({
        id: primitive.id,
        score: primitive.score,
        domains: primitive.domains,
        prior: classification && classification.priors
          ? classification.priors.find((prior) => prior.primitiveId === primitive.id) || null
          : null,
        phrase: primitive.phrase || '',
        source: primitive.source || 'catalog',
      });
    }
    addSynthesisComponents(synthesis, addDomain, addComponent, intent);
    if (groundUniverseGraph && promptParse) {
      intent.universeGraph = groundUniverseGraph({
        prompt,
        promptParse,
        components: intent.components,
        semanticRag,
        universeMatches,
        synthesis,
        cardMatches: options.cardMatches || options.surfaceCardMatches || [],
        intentBrief: intent.intentBrief || null,
      });
    }

    const phase1WithRetrieval = withPhase1RetrievalEvidence(phase1Output, {
      rankedPrimitives: ranked,
      rankedCards: options.cardMatches || options.surfaceCardMatches || [],
      rankedUniverseRows: Array.isArray(universeMatches) ? universeMatches : [],
      classification,
      semanticRag,
      rerank: intent.rerank,
      synthesis,
      retrievalPhase: options.retrievalPhase || '',
      intentBrief: intent.intentBrief || null,
      universeGraph: intent.universeGraph || null,
      contract,
      components: intent.components || [],
      visualSource: {
        templateId: 'custom-world',
        name: intent.title,
        kind: 'custom',
        modules: intent.domains || [],
        objects: intent.components || [],
        params: {},
        contract,
      },
    });
    const retrievalRuntimeContext = runtimeContextFromPhase(phase1WithRetrieval);
    const phase3Output = runPhase3Retrieval(phase2Output, retrievalRuntimeContext);
    const phase4Output = runPhase4GroundedIntent(phase3Output, retrievalRuntimeContext);
    intent.phaseArtifacts = phaseArtifactSet(phase1WithRetrieval, phase2Output, phase3Output, phase4Output);
    return intent;
  }

  function addSynthesisComponents(synthesis, addDomain, addComponent, intent = null) {
    if (!synthesis || !synthesis.synthGraph) return;
    for (const node of synthesis.synthGraph.nodes || []) {
      const componentId = slugify(node.id);
      const domains = uniqueList([
        'synth',
        node.nodeType,
        node.class,
        ...(node.materials || []),
        ...(node.behaviors || []),
        ...(node.constraints || []),
      ].filter(Boolean));
      addDomain(...domains);
      addComponent(
        componentId,
        node.nodeType,
        node.label,
        {},
        [],
        node.match ? node.match.score : 0.72,
        {
          layer: 'component',
          domains,
          material: materialForSynthesisNode(node),
          visualRegime: visualRegimeForSynthesisNode(node),
          assembly: node.class || node.cardId,
          phrase: node.match ? node.match.span : node.label,
          source: 'embedding-guided-synth-node',
          primitiveProgram: null,
          geometry: {
            kind: node.nodeType,
            shapes: node.morphology ? node.morphology.shapes || [] : [],
            parts: node.morphology ? node.morphology.parts || [] : [],
            scale: node.morphology ? node.morphology.scale || 'nominal' : 'nominal',
          },
          ports: node.ports || [],
          slots: node.morphology ? node.morphology.parts || [] : [],
          synthesis: {
            cardId: node.cardId,
            nodeType: node.nodeType,
            match: node.match || null,
          },
        }
      );
      if (intent && Array.isArray(intent.conceptGraph)) {
        intent.conceptGraph.push({
          id: componentId,
          score: node.match ? node.match.score : 0.72,
          domains,
          prior: null,
          phrase: node.match ? node.match.span : node.label,
          source: 'embedding-guided-synth-node',
        });
      }
    }
    for (const event of synthesis.synthGraph.events || []) {
      const componentId = slugify(event.id);
      const domains = uniqueList(['synth', 'event', event.type, ...(event.physics || [])]);
      addDomain(...domains);
      addComponent(
        componentId,
        'event',
        event.type,
        {},
        [],
        0.82,
        {
          layer: 'composition',
          domains,
          material: '',
          visualRegime: visualRegimeForSynthesisText(`${event.type} ${(event.physics || []).join(' ')}`),
          assembly: 'event',
          phrase: event.type,
          source: 'embedding-guided-synth-event',
          primitiveProgram: null,
          geometry: { kind: 'event', participants: event.participants || [] },
          ports: event.participants || [],
          slots: event.physics || [],
          synthesis: {
            cardId: event.cardId,
            eventType: event.type,
            participants: event.participants || [],
          },
        }
      );
      if (intent && Array.isArray(intent.conceptGraph)) {
        intent.conceptGraph.push({
          id: componentId,
          score: 0.82,
          domains,
          prior: null,
          phrase: event.type,
          source: 'embedding-guided-synth-event',
        });
      }
    }
    for (const environment of synthesis.synthGraph.environment || []) {
      const label = environment.label || environment.id || 'environment';
      const componentId = `environment-${slugify(environment.id || label)}`;
      const domains = uniqueList(['synth', 'environment', slugify(label)].filter(Boolean));
      addDomain(...domains);
      const environmentRegime = visualRegimeForSynthesisText(label);
      addComponent(
        componentId,
        'environment',
        label,
        {},
        [],
        0.68,
        {
          layer: 'scene',
          domains,
          material: /swamp|marsh|wetland|water/i.test(label) ? 'water' : '',
          visualRegime: environmentRegime,
          assembly: 'environment',
          phrase: label,
          source: 'embedding-guided-synth-environment',
          primitiveProgram: null,
          geometry: { kind: 'environment', label },
          ports: [],
          slots: [],
          synthesis: {
            environmentId: environment.id || label,
            source: environment.source || '',
          },
        }
      );
      if (intent && Array.isArray(intent.conceptGraph)) {
        intent.conceptGraph.push({
          id: componentId,
          score: 0.68,
          domains,
          prior: null,
          phrase: label,
          source: 'embedding-guided-synth-environment',
        });
      }
    }
  }

  function materialForSynthesisNode(node) {
    const materials = node.materials || [];
    if (materials.includes('soft_tissue')) return 'membrane';
    if (materials.includes('ferrofluid')) return 'ferrofluid';
    if (materials.includes('fur')) return 'protein';
    if (materials.includes('steel')) return 'metal';
    if (materials.includes('gold')) return 'gold';
    if (materials.includes('lava')) return 'lava';
    if (materials.includes('ice')) return 'ice';
    if (materials.includes('quartz')) return 'quartz';
    if (materials.includes('leaf')) return 'leaf';
    if (materials.includes('rubber_material')) return 'rubber';
    if (materials.includes('glass_material')) return 'glass';
    if (materials.includes('water_material')) return 'water';
    if (materials.includes('air_material')) return 'air';
    return materials.find((material) => primitiveById(material)) || '';
  }

  function visualRegimeForSynthesisNode(node) {
    const values = [
      node.class,
      ...(node.materials || []),
      ...(node.behaviors || []),
      ...(node.constraints || []),
      node.cardId,
    ].join(' ');
    return visualRegimeForSynthesisText(values);
  }

  function visualRegimeForSynthesisText(values) {
    if (/\bchemical|reaction|polymer|epoxy|plating|catalyst|ammonia|electrolyzer|crystal|glaze|paint/i.test(values)) return 'chemistry';
    if (/\bserver|cyber|blockchain|search|recommendation|compiler|database|logic|tensor|network_packet|packet/i.test(values)) return 'digital';
    if (/\bmarket|policy|carbon|housing|supply|demand|power grid|auction|dispatch|queue|traffic|rail|airport|port/i.test(values)) return 'operations';
    if (/\bspace|planet|asteroid|mars|venus|europa|titan|radio|telescope|probe|orbit|satellite|reentry|rocket|spacecraft/i.test(values)) return 'space';
    if (/\bhurricane|tornado|earthquake|tsunami|storm|wildfire|mine|tunnel|fault|hazard|urban heat|air quality/i.test(values)) return 'hazard';
    if (/\bmammal|rodent|tissue|gait|soft|clinical|hospital|prosthetic|surgery|rehab|organ|cell|dna|ribosome|mitochondria/i.test(values)) return 'biological';
    if (/\becology|fish|bird|pollinator|plant|crop|greenhouse|soil|algae|compost|landfill|oyster|peatland/i.test(values)) return 'ecological';
    if (/\bspacecraft|rocket|orbit|thrust|satellite/i.test(values)) return 'mechanical';
    if (/\bsubmarine|submersible|underwater|diving|swimming/i.test(values)) return 'fluid';
    if (/\bturbine|propeller|rotation|pumping/i.test(values)) return 'mechanical';
    if (/\blava|magma|molten|volcano/i.test(values)) return 'thermal';
    if (/\bpiano|keyboard|instrument|acoustic_resonance/i.test(values)) return 'acoustic';
    if (/\balgae|plant_cluster|glowing|photosynthesis/i.test(values)) return 'biological';
    if (/\bstorm|hurricane|rainstorm/i.test(values)) return 'fluid';
    if (/\bice|quartz|crystal|castle|tower/i.test(values)) return 'phase';
    if (/\bwheel|rotating|axle|apparatus|rigid/i.test(values)) return 'mechanical';
    if (/\bferrofluid|magnetic_fluid|magnetizes|spikes/i.test(values)) return 'magnetic';
    if (/\bwater|flow|pipe|pump/i.test(values)) return 'fluid';
    if (/\bheat|fire|thermal/i.test(values)) return 'thermal';
    if (/\blens|glass|optics/i.test(values)) return 'optical';
    if (/\bmagnet|rotor/i.test(values)) return 'magnetic';
    return 'mechanical';
  }

  function synthesisPrimitiveRows(synthesis) {
    if (!synthesis || typeof groundedPrimitiveRows !== 'function') return [];
    return groundedPrimitiveRows(synthesis, catalog);
  }

  function shouldPreferSynthGraph(promptText, synthesis) {
    if (!synthesis || !synthesis.validation || synthesis.validation.valid !== true) return false;
    if (hasCatalogCriticalDomain(promptText)) return false;
    const graph = synthesis.synthGraph || {};
    const relations = graph.relations || [];
    const events = graph.events || [];
    const hasCompositionalRelation = relations.some((relation) => (
      relation.type === 'inside' ||
      relation.type === 'attached_to' ||
      relation.type === 'drives'
    ));
    const hasWorldEvent = events.some((event) => ['collision', 'falling', 'break'].includes(event.type));
    if ((!hasWorldEvent && !hasCompositionalRelation) || (graph.nodes || []).length < 2) return false;
    return !/\b(perpetual|solar magnetic|magnetic wheel|generator)\b/i.test(String(promptText || ''));
  }

  function hasCatalogCriticalDomain(promptText) {
    return /\b(logistics|warehouse|inventory|supply chain|market|demand|queue|backlog|sensor|feedback|control|controller|data recorder|audit trace|telemetry|traffic|network)\b/i
      .test(String(promptText || ''));
  }

  function synthesisReceipt(synthesis) {
    if (!synthesis) return null;
    return {
      schema: synthesis.schema || SYNTHESIS_SCHEMA || '',
      model: synthesis.model ? synthesis.model.id : '',
      retriever: synthesis.model ? synthesis.model.retriever : '',
      planner: synthesis.model ? synthesis.model.planner : '',
      valid: synthesis.validation ? synthesis.validation.valid : false,
      warnings: synthesis.validation ? synthesis.validation.warnings || [] : [],
      repairs: synthesis.validation ? synthesis.validation.repairs || [] : [],
      nodes: synthesis.synthGraph ? synthesis.synthGraph.nodes.length : 0,
      relations: synthesis.synthGraph ? synthesis.synthGraph.relations.length : 0,
      events: synthesis.synthGraph ? synthesis.synthGraph.events.length : 0,
      groundedPrimitives: synthesis.groundedGraph ? synthesis.groundedGraph.primitiveIds.length : 0,
    };
  }

  function semanticOpenPrimitives(semanticRag) {
    return (semanticRag && semanticRag.openComponents || []).map((component) => ({
      id: component.id,
      type: component.type || 'component',
      role: component.role || component.phrase || component.id,
      layer: component.layer || 'component',
      domains: component.domains || [],
      params: component.params || {},
      controls: component.controls || [],
      score: Number(component.score || 0.42),
      material: component.material || '',
      visualRegime: component.visualRegime || '',
      assembly: component.assembly || '',
      phrase: component.phrase || '',
      source: component.source || 'open-semantic-rag',
      primitiveProgram: component.primitiveProgram || (
        buildPrimitiveProgram ? buildPrimitiveProgram(component) : null
      ),
      recipe: [],
      text: component.phrase || component.role || '',
    }));
  }

  function dopplerHintPrimitives(dopplerIntent, promptText) {
    const hints = dopplerIntent && Array.isArray(dopplerIntent.primitives)
      ? dopplerIntent.primitives
      : [];
    if (!hints.length) return [];
    const rows = hints
      .map((hint) => {
        const primitive = primitiveById(hint.primitiveId);
        if (!primitive) return null;
        return {
          ...primitive,
          score: Number(Math.max(0.62, Number(hint.score || 0)).toFixed(4)),
          source: 'doppler-residual',
          phrase: hint.reason || primitive.text || primitive.role || '',
        };
      })
      .filter(Boolean);
    return withPrimitiveDependencies(rows, promptText)
      .map((primitive) => {
        const hint = hints.find((item) => item.primitiveId === primitive.id);
        return {
          ...primitive,
          score: Number(Math.max(primitive.score || 0, hint ? hint.score : 0).toFixed(4)),
          source: hint ? 'doppler-residual' : primitive.source || 'doppler-dependency',
          phrase: hint && hint.reason ? hint.reason : primitive.phrase || primitive.text || '',
        };
      });
  }

  function explicitPromptPrimitiveRows(classification, promptText) {
    const prompt = String(promptText || '').toLowerCase();
    if (!classification || !Array.isArray(classification.priors) || !prompt) return [];
    const rows = classification.priors
      .filter((prior) => {
        const id = String(prior.primitiveId || '');
        const phrase = id.replace(/[-_]+/g, ' ');
        return phrase.length > 4 && prompt.includes(phrase);
      })
      .map((prior) => {
        const primitive = primitiveById(prior.primitiveId);
        if (!primitive) return null;
        return {
          ...primitive,
          score: Number(Math.max(Number(prior.score || 0), 0.58).toFixed(4)),
          source: 'prompt-explicit',
          phrase: prior.primitiveId.replace(/[-_]+/g, ' '),
          pinned: true,
        };
      })
      .filter(Boolean);
    const ensure = (primitiveId, score, phrase) => {
      if (rows.some((row) => row.id === primitiveId)) return;
      const primitive = primitiveById(primitiveId);
      if (!primitive) return;
      rows.push({
        ...primitive,
        score,
        source: 'prompt-family',
        phrase,
        pinned: true,
      });
    };
    if (/\bterrain\b/.test(prompt) && /\berosion\b/.test(prompt)) {
      ensure('terrain-heightfield', 0.64, 'terrain erosion');
      ensure('erosion-channel', 0.6, 'terrain erosion');
    }
    if (/\briver\b/.test(prompt) && /\berosion\b/.test(prompt)) {
      ensure('water', 0.58, 'river erosion');
      ensure('fluid-advection', 0.54, 'river erosion');
    }
    if (/\bswim(?:s|ming)?\b|\bswam\b|\bunderwater\b/.test(prompt)) {
      ensure('water', 0.62, 'swimming');
      ensure('fluid-advection', 0.58, 'swimming');
      ensure('pressure', 0.54, 'swimming');
    }
    if (/\bsand\b|\bgrains?\b|\bgranular\b|\bpowder\b/.test(prompt)) {
      ensure('granular-bed', 0.62, 'granular prompt');
      ensure('sand', 0.58, 'granular prompt');
    }
    if (/\bbubbles?\b|\bfloat(?:s|ing)?\b|\bbuoyan(?:t|cy)\b/.test(prompt)) {
      ensure('buoyant-body', 0.62, 'buoyancy prompt');
      ensure('water', 0.56, 'buoyancy prompt');
    }
    if (/\bprismatic\b|\bprism\b|\blaser beam\b/.test(prompt)) {
      ensure('optical-prism', 0.62, 'prismatic optics');
    }
    if (/\b(detector|phototube|calorimeter|instrument|probe|sensor)\b/.test(prompt)) {
      ensure('sensor-array', 0.68, prompt.match(/\b(neutrino detector|particle detector|detector|phototube array|calorimeter)\b/)?.[0] || 'instrument detector');
    }
    if (/\b(readout|readouts|telemetry|measurement)\b/.test(prompt)) {
      ensure('data-recorder', 0.64, prompt.match(/\b(calorimeter readouts|phase readout|readouts?|telemetry|measurement)\b/)?.[0] || 'instrument readout');
    }
    if (/\b(photon|photons|cherenkov|light cone|photon cone|photon cones|laser|beam)\b/.test(prompt)) {
      ensure('light-source', 0.62, prompt.match(/\b(cherenkov|photon cones?|light cone|laser beam|photon)\b/)?.[0] || 'photon cone');
      ensure('optics', 0.6, prompt.match(/\b(cherenkov|photon cones?|light|optics)\b/)?.[0] || 'optical photons');
      ensure('radiation', 0.56, prompt.match(/\b(photon|photons|radiation)\b/)?.[0] || 'photon radiation');
    }
    if (/\b(water tank|underground water tank|tank|pressure vessel|chamber)\b/.test(prompt)) {
      ensure('pressure-vessel', 0.62, prompt.match(/\b(underground water tank|water tank|pressure vessel|chamber|tank)\b/)?.[0] || 'tank boundary');
      ensure('water-volume', 0.6, prompt.match(/\b(underground water tank|water tank|water)\b/)?.[0] || 'water tank');
    }
    if (/\b(neutrino|muon|particle track|particle tracks|collider)\b/.test(prompt)) {
      ensure('particle-set', 0.58, prompt.match(/\b(neutrino|muon|particle tracks?|collider)\b/)?.[0] || 'particle track evidence');
    }
    return rows;
  }

  function mergeRankedPrimitives(...rowSets) {
    const byId = new Map();
    for (const primitive of rowSets.flat()) {
      if (!primitive || !primitive.id) continue;
      const existing = byId.get(primitive.id);
      if (existing) {
        const preferPrimitive = Number(primitive.score || 0) > Number(existing.score || 0);
        byId.set(primitive.id, {
          ...(preferPrimitive ? existing : primitive),
          ...(preferPrimitive ? primitive : existing),
          score: Math.max(Number(existing.score || 0), Number(primitive.score || 0)),
          pinned: Boolean(existing.pinned || primitive.pinned),
        });
      } else {
        byId.set(primitive.id, primitive);
      }
    }
    const sorted = Array.from(byId.values())
      .sort((a, b) => Number(b.score || 0) - Number(a.score || 0) || a.id.localeCompare(b.id));
    const pinned = sorted.filter((primitive) => primitive.pinned);
    const selected = pinned.slice();
    for (const primitive of sorted) {
      if (selected.length >= 56) break;
      if (primitive.pinned || selected.some((item) => item.id === primitive.id)) continue;
      selected.push(primitive);
    }
    return selected
      .sort((a, b) => Number(b.score || 0) - Number(a.score || 0) || a.id.localeCompare(b.id));
  }

  function resolveIntentToSpec(intentInput, overrides = {}) {
    const intent = intentInput && intentInput.schema === 'simulatte.intent.v1'
      ? intentInput
      : createIntentFromPrompt('');
    const overrideParams = overrides && overrides.params && typeof overrides.params === 'object'
      ? overrides.params
      : {};
    if (intent.domains.includes('blank')) {
      const plane = intent.components.find((component) => component.id === 'canvas');
      return createSpec('blank-world', {
        name: intent.title || 'Blank Construction Plane',
        description: intent.prompt ? `Intent: ${intent.prompt}` : 'Empty 2d construction surface.',
        params: { ...(plane ? plane.params : {}), ...overrideParams },
        intent,
        phaseArtifacts: intent.phaseArtifacts || null,
      });
    }

    const modules = ['mechanics', 'field', 'energy-ledger'];
    const objects = [];
    const controls = ['energyInput', 'fieldStrength', 'damping', 'complexity'];
    const params = { ...templateById('custom-world').params };
    const contract = intent.resolution && intent.resolution.contract
      ? intent.resolution.contract
      : null;
    const addControl = (key) => {
      if (CONTROL_LIBRARY[key] && !controls.includes(key)) controls.push(key);
    };
    for (const domain of intent.domains) {
      if (!modules.includes(domain)) modules.push(domain);
    }
    for (const component of intent.components) {
      const graphNode = graphNodeForSpec(contract, component.id);
      objects.push({
        id: component.id,
        type: component.type,
        role: component.role,
        layer: component.layer || '',
        domains: component.domains || [],
        material: component.material || '',
        visualRegime: component.visualRegime || '',
        assembly: component.assembly || '',
        phrase: component.phrase || '',
        source: component.source || '',
        primitiveProgram: component.primitiveProgram || null,
        geometry: component.geometry || null,
        ports: component.ports || null,
        slots: component.slots || [],
        synthesis: component.synthesis || null,
        state: graphNode ? graphNode.state : null,
      });
      for (const key of component.controls || []) addControl(key);
      for (const [key, value] of Object.entries(component.params || {})) {
        params[key] = value;
        addControl(key);
      }
    }
    applyContractDefaults(params, contract);
    applyCompiledParameterHints(parameterHintTextForIntent(intent, contract), params, addControl);

    const exactMachine = intent.title === 'Solar Magnetic Perpetual Motion Machine';
    if (exactMachine) {
      Object.assign(params, {
        irradiance: 780,
        sliderAmplitude: 0.42,
        loadTorque: 0.16,
      });
    }
    for (const [key, value] of Object.entries(overrideParams)) {
      if (!Number.isFinite(Number(value))) continue;
      params[key] = Number(value);
      addControl(key);
    }
    if (contract && contract.graph) {
      contract.graph.units = unitsForParams(params);
    }
    return createSpec('custom-world', {
      name: exactMachine ? 'Solar Magnetic Perpetual Motion Machine' : intent.title || 'Custom Physics World',
      description: intent.prompt ? `Intent: ${intent.prompt}` : 'Prompt resolved into 2d simulation components.',
      modules,
      objects,
      controls,
      params,
      intent,
      contract,
      phaseArtifacts: intent.phaseArtifacts || null,
    });
  }

  function createSpecFromPrompt(promptText = '', overrides = {}) {
    return resolveIntentToSpec(createIntentFromPrompt(promptText, overrides), overrides);
  }

  function titleFromPrompt(words) {
    const stop = new Set(['a', 'an', 'and', 'the', 'with', 'to', 'of', 'for', 'from', 'that', 'uses', 'use', 'build', 'make', 'create', 'simulate', 'simulation']);
    const keep = words.filter((word) => !stop.has(word)).slice(0, 6);
    if (!keep.length) return '';
    return keep.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  }

  // Deterministic 32-bit string seed (FNV-1a) so identical inputs remix identically.
  function seedFromString(text) {
    let hash = 2166136261;
    const str = String(text || '');
    for (let i = 0; i < str.length; i += 1) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0) % 100000;
  }

  function remixSpec(inputSpec, overrides = {}) {
    const spec = normalizeSpec(inputSpec);
    const params = { ...spec.params };
    // Reproducible remix: seed from an explicit override when provided, otherwise
    // from the spec identity. No wall-clock entropy on the compute path, so the
    // same spec (or same seed) always remixes to the same parameters.
    const seed = Number.isFinite(Number(overrides.seed))
      ? Number(overrides.seed)
      : seedFromString(spec.id || spec.name || '');
    let keyIndex = 0;
    for (const [key, , min, max] of controlsForSpec(spec)) {
      const span = Number(max) - Number(min);
      const drift = span * (hashNoise(seed + keyIndex, key.length + spec.id.length) - 0.5) * 0.12;
      params[key] = clamp(Number(params[key]) + drift, Number(min), Number(max));
      keyIndex += 1;
    }
    return createSpec(spec.templateId, {
      ...spec,
      ...overrides,
      id: overrides.id || `${slugify(spec.name)}-remix-${Date.now().toString(36)}`,
      name: overrides.name || `${spec.name} Remix`,
      modules: overrides.modules || spec.modules,
      objects: overrides.objects || spec.objects,
      controls: overrides.controls || spec.controls,
      params: { ...params, ...(overrides.params || {}) },
      remixOf: spec.id,
    });
  }

  function serializeSpec(spec) {
    return JSON.stringify(normalizeSpec(spec), null, 2);
  }

  function deserializeSpec(text) {
    return normalizeSpec(JSON.parse(String(text || '{}')));
  }

  function createSimulationState(spec) {
    const normalized = normalizeSpec(spec);
    if (normalized.templateId === 'blank-world') return createBlankState(normalized);
    if (normalized.templateId === 'custom-world') return createCustomState(normalized);
    if (normalized.templateId === 'fluid-vortex') return createFluidState(normalized.params);
    if (normalized.templateId === 'reaction-diffusion') return createReactionState(normalized.params);
    return createState(normalized.params);
  }

  function stepSimulation(inputState, spec, dt) {
    const normalized = normalizeSpec(spec);
    if (normalized.templateId === 'blank-world') return stepBlankState(inputState, normalized, dt);
    if (normalized.templateId === 'custom-world') return stepCustomState(inputState, normalized, dt);
    if (normalized.templateId === 'fluid-vortex') return stepFluidState(inputState, normalized.params, dt);
    if (normalized.templateId === 'reaction-diffusion') return stepReactionState(inputState, normalized.params, dt);
    return stepState(inputState, normalized.params, dt);
  }

  function solarPower(params) {
    return Math.max(0, params.irradiance) * Math.max(0, params.panelArea) * clamp(params.panelEfficiency, 0, 1);
  }

  function magnetPosition(angle, radius) {
    return {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    };
  }

  function createState(params = {}) {
    const next = { ...DEFAULT_PARAMS, ...params };
    return {
      kind: 'magnetic-wheel',
      t: 0,
      theta: 0.12,
      omega: 0,
      sliderAngle: 0,
      sliderVelocity: 0,
      solarBufferJ: 0,
      solarInputJ: 0,
      actuatorWorkJ: 0,
      wheelWorkJ: 0,
      loadOutputJ: 0,
      frictionLossJ: 0,
      generatorLossJ: 0,
      lastTorque: 0,
      lastMagneticTorque: 0,
      lastActuatorPower: 0,
      lastSolarPower: solarPower(next),
      lastLoadPower: 0,
      params: next,
    };
  }

  function magneticTorque(state, params) {
    const wheelMagnets = 10;
    const wheelRadius = 1.0;
    const sliderRadius = 1.42;
    const stator = magnetPosition(state.sliderAngle, sliderRadius);
    let torque = 0;
    for (let i = 0; i < wheelMagnets; i += 1) {
      const pole = i % 2 === 0 ? 1 : -1;
      const angle = state.theta + (i / wheelMagnets) * TAU;
      const rotor = magnetPosition(angle, wheelRadius);
      const dx = rotor.x - stator.x;
      const dy = rotor.y - stator.y;
      const dist2 = Math.max(0.055, dx * dx + dy * dy);
      const tangent = { x: -Math.sin(angle), y: Math.cos(angle) };
      const forceScale = params.magneticStrength * pole / (dist2 * Math.sqrt(dist2));
      const tangentialForce = (dx * tangent.x + dy * tangent.y) * forceScale;
      torque += tangentialForce * wheelRadius;
    }
    return clamp(torque, -2.8, 2.8);
  }

  function sliderTargetAngle(state, params) {
    const sunCycle = Math.sin(state.t * 0.42);
    const commutation = state.theta + params.sliderPhase * TAU;
    return wrapAngle(commutation + sunCycle * params.sliderAmplitude);
  }

  function stepState(inputState, inputParams, dtInput) {
    const params = { ...inputState.params, ...inputParams };
    const state = { ...inputState, params };
    const dt = clamp(Number(dtInput || 0.016), 0.001, 0.05);
    const sunPower = solarPower(params);
    state.solarInputJ += sunPower * dt;
    state.solarBufferJ += sunPower * dt;

    const target = sliderTargetAngle(state, params);
    const sliderError = shortestAngle(state.sliderAngle, target);
    const desiredVelocity = clamp(sliderError * 8, -3.6, 3.6);
    const velocityDelta = desiredVelocity - state.sliderVelocity;
    const actuatorPowerRequest = Math.abs(velocityDelta) * 9.5 + Math.abs(desiredVelocity) * 1.2;
    const actuatorPower = Math.min(state.solarBufferJ / dt, actuatorPowerRequest);
    const actuatorScale = actuatorPowerRequest > 0 ? actuatorPower / actuatorPowerRequest : 1;
    state.sliderVelocity += velocityDelta * actuatorScale * clamp(params.actuatorEfficiency, 0.05, 1);
    state.sliderVelocity *= 0.92;
    state.sliderAngle = wrapAngle(state.sliderAngle + state.sliderVelocity * dt);
    state.solarBufferJ = Math.max(0, state.solarBufferJ - actuatorPower * dt);
    state.actuatorWorkJ += actuatorPower * dt;

    let magTorque = magneticTorque(state, params);
    const predictedOmega = state.omega + (magTorque / Math.max(0.05, params.wheelInertia)) * dt;
    const fieldPowerRequest = Math.max(0, magTorque * predictedOmega) / clamp(params.actuatorEfficiency, 0.05, 1);
    const fieldPower = Math.min(state.solarBufferJ / dt, fieldPowerRequest);
    const fieldScale = fieldPowerRequest > 0 ? fieldPower / fieldPowerRequest : 1;
    magTorque *= fieldScale;
    state.solarBufferJ = Math.max(0, state.solarBufferJ - fieldPower * dt);
    state.actuatorWorkJ += fieldPower * dt;
    const loadTorque = Math.sign(state.omega || magTorque || 1) * Math.min(Math.abs(params.loadTorque), Math.abs(state.omega) * 0.18 + 0.08);
    const frictionTorque = state.omega * params.friction;
    const netTorque = magTorque - frictionTorque - loadTorque;
    const alpha = netTorque / Math.max(0.05, params.wheelInertia);
    state.omega += alpha * dt;
    state.omega *= 0.999;
    state.theta = wrapAngle(state.theta + state.omega * dt);

    const magneticPower = magTorque * state.omega;
    const loadPower = Math.max(0, loadTorque * state.omega);
    const frictionPower = Math.max(0, frictionTorque * state.omega);
    const generatorLoss = loadPower * 0.08;
    state.wheelWorkJ += magneticPower * dt;
    state.loadOutputJ += loadPower * dt;
    state.frictionLossJ += frictionPower * dt;
    state.generatorLossJ += generatorLoss * dt;
    state.t += dt;
    state.lastTorque = netTorque;
    state.lastMagneticTorque = magTorque;
    state.lastActuatorPower = actuatorPower + fieldPower;
    state.lastSolarPower = sunPower;
    state.lastLoadPower = loadPower;
    return state;
  }

  function kineticEnergy(state) {
    return 0.5 * state.params.wheelInertia * state.omega * state.omega;
  }

  function energyLedger(state) {
    const stored = kineticEnergy(state) + state.solarBufferJ;
    const spent = state.actuatorWorkJ + state.loadOutputJ + state.frictionLossJ + state.generatorLossJ + stored;
    return {
      solarInputJ: state.solarInputJ,
      actuatorWorkJ: state.actuatorWorkJ,
      wheelKineticJ: kineticEnergy(state),
      loadOutputJ: state.loadOutputJ,
      frictionLossJ: state.frictionLossJ,
      generatorLossJ: state.generatorLossJ,
      solarBufferJ: state.solarBufferJ,
      balanceErrorJ: state.solarInputJ - spent,
      rpm: state.omega * 60 / TAU,
      torqueNm: state.lastTorque,
      magneticTorqueNm: state.lastMagneticTorque,
      solarPowerW: state.lastSolarPower,
      actuatorPowerW: state.lastActuatorPower,
      loadPowerW: state.lastLoadPower,
    };
  }

  function createFluidState(params = {}) {
    const next = { ...templateById('fluid-vortex').params, ...params };
    const particles = Array.from({ length: 360 }, (_, index) => ({
      x: hashNoise(3, index),
      y: hashNoise(7, index),
      vx: 0,
      vy: 0,
      age: hashNoise(11, index),
    }));
    return {
      kind: 'fluid-vortex',
      t: 0,
      particles,
      pressure: 0,
      vorticity: 0,
      mixing: 0,
      dragLossJ: 0,
      flowInputJ: 0,
      params: next,
    };
  }

  function stepFluidState(inputState, inputParams, dtInput) {
    const params = { ...inputState.params, ...inputParams };
    const dt = clamp(Number(dtInput || 0.016), 0.001, 0.05);
    const state = {
      ...inputState,
      params,
      particles: inputState.particles.map((particle) => ({ ...particle })),
    };
    const obstacle = { x: 0.56, y: 0.52, r: params.obstacleRadius };
    let vorticity = 0;
    let pressure = 0;
    let mixing = 0;
    for (let i = 0; i < state.particles.length; i += 1) {
      const p = state.particles[i];
      const dx = p.x - obstacle.x;
      const dy = p.y - obstacle.y;
      const dist = Math.max(0.018, Math.hypot(dx, dy));
      const nx = dx / dist;
      const ny = dy / dist;
      const wake = Math.exp(-dist / Math.max(0.04, obstacle.r * 2.8));
      const swirl = params.vortexStrength * wake;
      const noise = (hashNoise(Math.floor(state.t * 30), i) - 0.5) * params.turbulence;
      p.vx += (params.inletFlow * 0.55 + -ny * swirl + noise) * dt;
      p.vy += (nx * swirl + params.gravity + noise * 0.35) * dt;
      p.vx *= 1 - params.viscosity * dt * 1.8;
      p.vy *= 1 - params.viscosity * dt * 1.8;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (dist < obstacle.r) {
        p.x = obstacle.x + nx * obstacle.r;
        p.y = obstacle.y + ny * obstacle.r;
        p.vx += nx * 0.4;
        p.vy += ny * 0.4;
        pressure += 1;
      }
      if (p.x > 1.04 || p.y < -0.04 || p.y > 1.04) {
        p.x = -0.03;
        p.y = hashNoise(i, Math.floor(state.t * 10));
        p.vx = params.inletFlow;
        p.vy = 0;
        p.age = 0;
      }
      if (p.x < -0.06) p.x = 1.03;
      p.age = clamp01(p.age + dt * 0.08);
      vorticity += Math.abs(p.vx * ny - p.vy * nx);
      mixing += p.age * (1 - Math.abs(p.y - 0.5) * 1.2);
    }
    const count = state.particles.length || 1;
    state.t += dt;
    state.vorticity = vorticity / count;
    state.pressure = pressure / count * 100;
    state.mixing = clamp01(mixing / count);
    state.flowInputJ += Math.max(0, params.inletFlow) * dt * 12;
    state.dragLossJ += state.vorticity * params.viscosity * dt * 7;
    return state;
  }

  function createReactionState(params = {}) {
    const next = { ...templateById('reaction-diffusion').params, ...params };
    const size = FIELD_GRID;
    const a = new Float32Array(size * size).fill(1);
    const b = new Float32Array(size * size);
    const heat = new Float32Array(size * size);
    const center = size / 2;
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const dist = Math.hypot(x - center, y - center);
        if (dist < size * 0.12 || hashNoise(x, y) > 0.986) {
          const idx = y * size + x;
          b[idx] = 0.9;
          a[idx] = 0.25;
        }
      }
    }
    return {
      kind: 'reaction-diffusion',
      t: 0,
      size,
      a,
      b,
      heat,
      conversion: 0,
      front: 0,
      entropy: 0,
      params: next,
    };
  }

  function laplace(field, size, x, y) {
    const xm = (x + size - 1) % size;
    const xp = (x + 1) % size;
    const ym = (y + size - 1) % size;
    const yp = (y + 1) % size;
    const c = field[y * size + x];
    return (
      field[y * size + xm] +
      field[y * size + xp] +
      field[ym * size + x] +
      field[yp * size + x] -
      4 * c
    );
  }

  function stepReactionState(inputState, inputParams, dtInput) {
    const params = { ...inputState.params, ...inputParams };
    const dt = clamp(Number(dtInput || 0.016), 0.001, 0.05);
    const size = inputState.size || FIELD_GRID;
    const a = new Float32Array(inputState.a);
    const b = new Float32Array(inputState.b);
    const heat = new Float32Array(inputState.heat);
    const nextA = new Float32Array(a.length);
    const nextB = new Float32Array(b.length);
    const nextHeat = new Float32Array(heat.length);
    let massB = 0;
    let front = 0;
    let entropy = 0;
    const scale = dt * 8;
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const idx = y * size + x;
        const av = a[idx];
        const bv = b[idx];
        const reaction = av * bv * bv * (0.75 + params.catalyst * 0.45);
        const da = params.diffusionA * laplace(a, size, x, y) - reaction + params.feedRate * (1 - av);
        const db = params.diffusionB * laplace(b, size, x, y) + reaction - (params.killRate + params.feedRate) * bv;
        const nvA = clamp(av + da * scale, 0, 1);
        const nvB = clamp(bv + db * scale, 0, 1);
        nextA[idx] = nvA;
        nextB[idx] = nvB;
        nextHeat[idx] = clamp(heat[idx] + reaction * scale * 0.22 - params.cooling * heat[idx] * dt, 0, 1);
        massB += nvB;
        front += Math.abs(nvB - bv);
        const local = clamp01(nvB);
        entropy += local > 0 && local < 1 ? -local * Math.log(local) : 0;
      }
    }
    const cells = size * size;
    return {
      kind: 'reaction-diffusion',
      t: inputState.t + dt,
      size,
      a: nextA,
      b: nextB,
      heat: nextHeat,
      conversion: massB / cells,
      front: front / cells,
      entropy: entropy / cells,
      params,
    };
  }

  function createBlankState(spec) {
    return {
      kind: 'blank-world',
      t: 0,
      params: { ...templateById('blank-world').params, ...spec.params },
      modules: [],
      objects: [],
    };
  }

  function stepBlankState(inputState, spec, dtInput) {
    const dt = clamp(Number(dtInput || 0.016), 0.001, 0.05);
    return {
      ...inputState,
      t: inputState.t + dt,
      params: { ...inputState.params, ...spec.params },
    };
  }

  function hasModule(specOrState, moduleName) {
    return (specOrState.modules || []).includes(moduleName);
  }

  function isMagneticMachine(spec) {
    return hasModule(spec, 'electromagnetism') &&
      (spec.objects || []).some((object) => /wheel|rotor|slider|magnet/i.test(`${object.id} ${object.role}`));
  }

  function createCustomParticles(spec) {
    const count = 120 + Math.round(clamp(spec.params.complexity ?? 0.5, 0, 1) * 220) + (spec.objects || []).length * 16;
    return Array.from({ length: count }, (_, index) => ({
      x: hashNoise(19, index),
      y: hashNoise(23, index),
      vx: (hashNoise(29, index) - 0.5) * 0.08,
      vy: (hashNoise(31, index) - 0.5) * 0.08,
      phase: hashNoise(37, index),
      kind: index % Math.max(1, (spec.objects || []).length),
    }));
  }

  function createComponentStates(spec) {
    const graphNodes = spec.contract && spec.contract.graph ? spec.contract.graph.nodes || [] : [];
    const graphStates = Object.fromEntries(graphNodes.map((node) => [node.id, node.state || {}]));
    return Object.fromEntries((spec.objects || []).map((object) => [
      object.id,
      {
        ...(graphStates[object.id] || {}),
        ...(object.state || {}),
      },
    ]));
  }

  function stepComponentStates(inputStates, spec, params, dt) {
    const next = {};
    const interactions = interactionTotals(spec.contract);
    const operators = operatorTotals(spec.contract);
    const heatDelta = ((params.heatTransfer || 0) * 0.02 + (operators.heat || 0)) * dt;
    const moistureDelta = ((params.moisture || 0) * 0.01 + Math.min(0, interactions.fire || 0) * 0.02) * dt;
    for (const object of spec.objects || []) {
      const previous = inputStates && inputStates[object.id] ? inputStates[object.id] : object.state || {};
      const isFire = /flame|combustion|fire/.test(object.id);
      const isQueue = /queue|market|traffic/.test(object.id);
      const isWater = /water|river|lake/.test(object.id);
      next[object.id] = {
        temperature: clamp01((previous.temperature ?? 0.5) + heatDelta + (isFire ? 0.018 : 0)),
        moisture: clamp01((previous.moisture ?? 0) + moistureDelta + (isWater ? 0.006 : -0.002) * dt),
        charge: clamp((previous.charge ?? 0) + (params.electricField || 0) * dt * 0.01, -1, 1),
        pressure: clamp01((previous.pressure ?? 0) + (params.pressure || 0) * dt * 0.01),
        backlog: clamp01((previous.backlog ?? 0) + (isQueue ? (params.queueBacklog || 0) * dt * 0.02 : 0)),
        fuel: clamp01((previous.fuel ?? 0) - (isFire ? Math.max(0, params.combustibility || 0) * dt * 0.008 : 0)),
        mass: Math.max(0, (previous.mass ?? 0.2) - (isFire ? dt * 0.001 : 0)),
        velocity: clamp01((previous.velocity ?? 0) + (params.flowRate || params.windSpeed || 0) * dt * 0.02),
        health: clamp01((previous.health ?? 1) - Math.max(0, params.infectionRate || 0) * dt * 0.006),
        inventory: clamp01((previous.inventory ?? 0) + (isQueue ? (params.marketDemand || 0) * dt * 0.012 : 0)),
      };
    }
    return next;
  }

  function componentStatesFromSolverState(spec, solverState) {
    const channels = solverState && solverState.channels || {};
    const baseStates = createComponentStates(spec);
    const renderObjects = spec.renderIR && Array.isArray(spec.renderIR.objects) ? spec.renderIR.objects : [];
    const byPhysicalRef = new Map(renderObjects.map((object) => [object.physicalRef, object]));
    const entries = [];
    for (const object of spec.objects || []) {
      const renderObject = byPhysicalRef.get(object.id) ||
        renderObjects.find((row) => row.semanticRef && String(row.semanticRef).includes(object.id)) ||
        null;
      const entityId = renderObject ? renderObject.physicalRef : object.id;
      entries.push([object.id, {
        ...(baseStates[object.id] || {}),
        ...componentStateForEntity(entityId, channels),
      }]);
    }
    for (const renderObject of renderObjects) {
      if (entries.some(([id]) => id === renderObject.physicalRef)) continue;
      entries.push([renderObject.physicalRef, componentStateForEntity(renderObject.physicalRef, channels)]);
    }
    return Object.fromEntries(entries);
  }

  function componentStateForEntity(entityId, channels) {
    const state = {};
    for (const [channel, value] of Object.entries(channels || {})) {
      if (!channel.endsWith(`:${entityId}`)) continue;
      const key = channel.split(':')[0];
      state[key] = cloneChannelValue(value);
    }
    return state;
  }

  function particlesFromSolverState(spec, solverState) {
    const objects = spec.renderIR && Array.isArray(spec.renderIR.objects)
      ? spec.renderIR.objects
      : [];
    const channels = solverState && solverState.channels || {};
    const rows = [];
    const maxObjects = Math.min(objects.length, 10);
    for (let objectIndex = 0; objectIndex < maxObjects; objectIndex += 1) {
      const object = objects[objectIndex];
      const position = channelVector(channels[`position:${object.physicalRef}`], {
        x: 0.24 + objectIndex * 0.055,
        y: 0.5,
      });
      const velocity = channelVector(
        channels[`flowVelocity:${object.physicalRef}`] || channels[`velocity:${object.physicalRef}`],
        { x: 0, y: 0 }
      );
      const activity = channelMagnitude(channels[`temperature:${object.physicalRef}`]) +
        channelMagnitude(channels[`angularVelocity:${object.physicalRef}`]) +
        channelMagnitude(channels[`damage:${object.physicalRef}`]);
      for (let i = 0; i < 8; i += 1) {
        const phase = hashNoise(objectIndex + 43, i + 11);
        rows.push({
          x: clamp(position.x + (phase - 0.5) * 0.16 + velocity.x * 0.02, 0.02, 0.98),
          y: clamp(position.y + (hashNoise(i + 17, objectIndex + 5) - 0.5) * 0.12 + velocity.y * 0.02, 0.02, 0.98),
          vx: velocity.x * 0.04,
          vy: velocity.y * 0.04,
          phase,
          kind: objectIndex,
          activity,
        });
      }
    }
    return rows;
  }

  function deriveSolverSummary(solverState, spec) {
    if (deriveChannelSummary && solverState && solverState.channels) {
      return deriveChannelSummary(
        solverState.channels,
        spec.solverGraph ? spec.solverGraph.channelMetadata || {} : {}
      );
    }
    return {
      energy: 0,
      motion: 0,
      field: 0,
      matter: 0,
      heat: 0,
      stability: 1,
    };
  }

  function channelVector(value, fallback) {
    if (value && typeof value === 'object') {
      const x = Number(value.x);
      const y = Number(value.y);
      return {
        x: Number.isFinite(x) ? x : fallback.x,
        y: Number.isFinite(y) ? y : fallback.y,
      };
    }
    return fallback;
  }

  function channelMagnitude(value) {
    if (value && typeof value === 'object') {
      const x = Number(value.x || 0);
      const y = Number(value.y || 0);
      return Number.isFinite(x + y) ? Math.hypot(x, y) : 0;
    }
    const number = Number(value);
    return Number.isFinite(number) ? Math.abs(number) : 0;
  }

  function cloneChannelValue(value) {
    if (value && typeof value === 'object') return { ...value };
    return value;
  }

  function createCustomState(spec) {
    const params = { ...templateById('custom-world').params, ...spec.params };
    const solverState = spec.solverGraph && createSolverState
      ? createSolverState(spec.solverGraph)
      : null;
    if (solverState) {
      const summary = solverState.summary || deriveSolverSummary(solverState, spec);
      return {
        kind: 'custom-world',
        t: solverState.t,
        params,
        modules: spec.modules,
        objects: spec.objects,
        solverState,
        channelValues: solverState.channels,
        componentStates: componentStatesFromSolverState(spec, solverState),
        particles: particlesFromSolverState(spec, solverState),
        machine: null,
        fluid: null,
        reaction: null,
        energy: summary.energy,
        motion: summary.motion,
        field: summary.field,
        matter: summary.matter,
        heat: summary.heat,
        stability: summary.stability,
      };
    }
    return {
      kind: 'custom-world',
      t: 0,
      params,
      modules: spec.modules,
      objects: spec.objects,
      componentStates: createComponentStates(spec),
      particles: createCustomParticles({ ...spec, params }),
      machine: isMagneticMachine(spec) ? createState(params) : null,
      fluid: hasModule(spec, 'fluid') ? createFluidState({
        ...params,
        inletFlow: params.inletFlow ?? params.flowRate,
        vortexStrength: params.vortexStrength ?? params.fieldStrength,
      }) : null,
      reaction: hasModule(spec, 'chemistry') ? createReactionState(params) : null,
      energy: 0,
      motion: 0,
      field: 0,
      matter: 0,
      heat: 0,
      stability: 1,
    };
  }

  function stepCustomState(inputState, spec, dtInput) {
    const params = { ...inputState.params, ...spec.params };
    if (spec.solverGraph && stepSolverState) {
      const sourceState = inputState.solverState || (
        createSolverState ? createSolverState(spec.solverGraph) : null
      );
      if (sourceState) {
        const solverState = stepSolverState(sourceState, spec.solverGraph, dtInput);
        const summary = solverState.summary || deriveSolverSummary(solverState, spec);
        return {
          ...inputState,
          t: solverState.t,
          params,
          modules: spec.modules,
          objects: spec.objects,
          solverState,
          channelValues: solverState.channels,
          componentStates: componentStatesFromSolverState(spec, solverState),
          particles: particlesFromSolverState(spec, solverState),
          machine: null,
          fluid: null,
          reaction: null,
          energy: summary.energy,
          motion: summary.motion,
          field: summary.field,
          matter: summary.matter,
          heat: summary.heat,
          stability: summary.stability,
        };
      }
    }
    const contract = spec.contract || null;
    const interactions = interactionTotals(contract);
    const operatorEffect = operatorTotals(contract);
    const dt = clamp(Number(dtInput || 0.016), 0.001, 0.05);
    const state = {
      ...inputState,
      params,
      modules: spec.modules,
      objects: spec.objects,
      componentStates: stepComponentStates(inputState.componentStates, spec, params, dt),
      particles: inputState.particles.map((particle) => ({ ...particle })),
    };
    if (state.machine) state.machine = stepState(state.machine, params, dt);
    if (state.fluid) {
      state.fluid = stepFluidState(state.fluid, {
        ...params,
        inletFlow: params.inletFlow ?? params.flowRate,
        vortexStrength: params.vortexStrength ?? params.fieldStrength,
      }, dt);
    }
    if (state.reaction) state.reaction = stepReactionState(state.reaction, params, dt);

    const field = (params.fieldStrength || 0) +
      (params.magneticStrength || 0) * 0.7 +
      (params.electricField || 0) * 0.52 +
      (interactions.field || 0) * 0.25 +
      (operatorEffect.field || 0) +
      (hasModule(spec, 'gravity') ? Math.abs(params.gravity || 0) : 0);
    const drive = (params.energyInput || 0) + solarPower({ ...DEFAULT_PARAMS, ...params }) / 900;
    const swirl = (params.turbulence || 0) + (params.vortexStrength || 0) * 0.28;
    const damping = clamp(params.damping ?? params.friction ?? 0.08, 0, 0.95);
    const spring = hasModule(spec, 'elasticity') ? clamp(params.springConstant || 0, 0, 1.6) : 0;
    const thermal = hasModule(spec, 'thermal') ? clamp(params.thermalFlux || params.heatTransfer || 0, 0, 1.5) : 0;
    const wave = hasModule(spec, 'wave') || hasModule(spec, 'acoustics') ? clamp(params.waveAmplitude || 0, 0, 1.2) : 0;
    const acoustic = hasModule(spec, 'acoustics') ? clamp(params.soundFrequency || 0.42, 0.05, 1.4) : 0;
    const buoyancy = hasModule(spec, 'buoyancy') ? clamp(params.buoyancy || 0, -0.4, 1.2) : 0;
    const wind = hasModule(spec, 'fluid') ? clamp(params.windSpeed || 0, -1.2, 1.2) : 0;
    const charge = hasModule(spec, 'electricity') || hasModule(spec, 'plasma') ? clamp(params.charge || params.electricField || 0, -1.2, 1.2) : 0;
    const granular = hasModule(spec, 'granular') ? clamp(params.granularFriction || 0.38, 0, 1) : 0;
    const restitution = hasModule(spec, 'collision') ? clamp(params.restitution || 0.72, 0, 1) : 0;
    const control = hasModule(spec, 'control') ? clamp(params.controlGain || 0, 0, 1.5) : 0;
    const signalNoise = hasModule(spec, 'signal') || hasModule(spec, 'noise') ? clamp(params.signalNoise || 0, 0, 1) : 0;
    const latency = hasModule(spec, 'network') ? clamp(params.networkLatency || params.signalDelay || 0, 0, 1.5) : 0;
    const queue = hasModule(spec, 'queue') ? clamp(params.queueBacklog || 0, 0, 1) : 0;
    const service = hasModule(spec, 'queue') || hasModule(spec, 'logistics') ? clamp(params.serviceRate || 0.5, 0.05, 1.5) : 0;
    const terrain = hasModule(spec, 'terrain') ? clamp(params.terrainSlope || 0, -1, 1) : 0;
    const erosion = hasModule(spec, 'erosion') ? clamp(params.erosionRate || 0, 0, 1) : 0;
    const biology = hasModule(spec, 'biology') ? clamp(params.populationGrowth || 0, 0, 1.4) : 0;
    const infection = hasModule(spec, 'biology') || hasModule(spec, 'diffusion') ? clamp(params.infectionRate || 0, 0, 1.2) : 0;
    const adhesion = hasModule(spec, 'surface') ? clamp(params.adhesion || 0, 0, 1.2) : 0;
    const cohesion = hasModule(spec, 'cohesion') || hasModule(spec, 'material') ? clamp(params.cohesion || 0, 0, 1.2) : 0;
    const phase = hasModule(spec, 'phase-change') ? clamp(params.phaseThreshold || 0.5, 0, 1) : 0;
    const latentHeat = hasModule(spec, 'phase-change') ? clamp(params.latentHeat || 0, 0, 1.4) : 0;
    const market = hasModule(spec, 'economics') || hasModule(spec, 'market') ? clamp(params.marketDemand || 0, 0, 1.5) : 0;
    const elasticity = hasModule(spec, 'economics') || hasModule(spec, 'market') ? clamp(params.priceElasticity || 0, 0, 1.2) : 0;
    const solarRadiation = hasModule(spec, 'radiation') ? clamp((params.irradiance || 0) / 1200, 0, 1.5) : 0;
    const fire = hasModule(spec, 'fire') ? clamp((params.combustibility || 0) + (interactions.fire || 0) * 0.3, 0, 1.2) : 0;
    const water = hasModule(spec, 'water') || hasModule(spec, 'liquid') ? clamp(params.moisture || 0.5, 0, 1) : 0;
    const solid = hasModule(spec, 'solid') || hasModule(spec, 'rock') || hasModule(spec, 'wood') ? clamp(params.hardness || 0, 0, 1.5) : 0;
    const metal = hasModule(spec, 'metal') ? clamp(params.conductivity || 0, 0, 1.5) : 0;
    const magneticMaterial = hasModule(spec, 'magnetic') ? clamp(params.magnetization || params.magneticStrength || 0, 0, 1.5) : 0;
    const glass = hasModule(spec, 'glass') ? clamp(1 - (params.opacity || 0), 0, 1) : 0;
    const atomic = hasModule(spec, 'atomic') ? clamp((params.atomicMass || 28) / 120, 0, 2) : 0;
    const bond = hasModule(spec, 'atomic') || hasModule(spec, 'cohesion') ? clamp(params.bondStrength || 0, 0, 1.5) : 0;
    const ionization = hasModule(spec, 'atomic') || hasModule(spec, 'plasma') ? clamp(params.ionization || 0, 0, 1.5) : 0;
    let motionSum = 0;
    for (let i = 0; i < state.particles.length; i += 1) {
      const p = state.particles[i];
      const cx = p.x - 0.5;
      const cy = p.y - 0.5;
      const radius = Math.max(0.03, Math.hypot(cx, cy));
      const tangentX = -cy / radius;
      const tangentY = cx / radius;
      const noise = hashNoise(Math.floor(state.t * 24), i) - 0.5;
      const phase = state.t * (1.8 + acoustic * 4.2) + p.phase * TAU;
      const waveForce = Math.sin(p.x * 10 + phase) * wave;
      const springForceX = -cx * spring * 0.42;
      const springForceY = -cy * spring * 0.42;
      const electricForce = charge / Math.max(0.08, radius * radius);
      const controlPull = control * (0.5 - radius) * 0.08;
      const queuePulse = queue * Math.sin(state.t * (1.2 + service) + p.phase * TAU) * 0.06;
      const terrainPush = terrain * (0.22 + erosion * 0.18);
      const biologyPush = biology * Math.sin(p.x * 7 + state.t * 0.9) * 0.035;
      const infectionPush = infection * Math.cos(p.y * 9 - state.t * 1.1) * 0.03;
      const cohesionPull = (cohesion + bond * 0.72 + atomic * 0.18) * (0.5 - radius) * 0.05;
      const refractionDrift = glass * Math.sin(p.y * 8 + state.t * 0.7) * 0.026;
      const fireLift = fire * (1 - water * 0.72 + Math.min(0, interactions.fire || 0) * 0.18) * 0.18;
      const materialInertia = 1 + solid * 0.44 + metal * 0.28 + atomic * 0.22;
      p.vx += (
        tangentX * (field + magneticMaterial * 0.46 + ionization * 0.22) * 0.18 +
        drive * (0.04 + market * 0.016 + solarRadiation * 0.018) +
        springForceX +
        cx * (electricForce + magneticMaterial * 0.14 + metal * 0.08) * 0.018 +
        wind * 0.22 +
        controlPull * cx +
        cohesionPull * cx +
        queuePulse +
        terrainPush +
        biologyPush +
        refractionDrift +
        noise * (swirl * 0.18 + thermal * 0.16 + signalNoise * 0.22 + fire * 0.16)
      ) * dt;
      p.vy += (
        tangentY * (field + magneticMaterial * 0.46 + ionization * 0.22) * 0.18 +
        (params.gravity || 0) * 0.34 -
        (buoyancy + water * 0.22) * 0.26 -
        fireLift +
        springForceY +
        waveForce * 0.16 +
        cy * (electricForce + magneticMaterial * 0.14 + metal * 0.08) * 0.014 +
        controlPull * cy +
        cohesionPull * cy -
        terrainPush * 0.34 +
        infectionPush +
        noise * (swirl * 0.12 + thermal * 0.12 + signalNoise * 0.18 + fire * 0.14)
      ) * dt;
      const granularDrag = granular && p.y > 0.63 ? 1 + granular * 2.8 : 1;
      const surfaceDrag = adhesion && (p.y > 0.78 || p.x < 0.12 || p.x > 0.88) ? 1 + adhesion * 2.2 : 1;
      const latencyDrag = 1 + latency * 0.24 + Math.max(0, queue - service * 0.5) * 0.28;
      const waterDrag = 1 + water * 0.55;
      p.vx *= 1 - damping * granularDrag * surfaceDrag * latencyDrag * waterDrag * materialInertia * dt * 2.4;
      p.vy *= 1 - damping * granularDrag * surfaceDrag * latencyDrag * waterDrag * materialInertia * dt * 2.4;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (restitution > 0) {
        if (p.x < 0.04 || p.x > 0.96) {
          p.x = clamp(p.x, 0.04, 0.96);
          p.vx *= -restitution;
        }
        if (p.y < 0.06 || p.y > 0.94) {
          p.y = clamp(p.y, 0.06, 0.94);
          p.vy *= -restitution;
        }
      } else {
        if (p.x < -0.04) p.x = 1.04;
        if (p.x > 1.04) p.x = -0.04;
        if (p.y < -0.04) p.y = 1.04;
        if (p.y > 1.04) p.y = -0.04;
      }
      motionSum += Math.hypot(p.vx, p.vy);
    }

    const machineLedger = state.machine ? energyLedger(state.machine) : null;
    const chemistryHeat = state.reaction ? maxField(state.reaction.heat) : 0;
    const fluidMotion = state.fluid ? state.fluid.vorticity : 0;
    state.t += dt;
    state.energy += (drive + solarRadiation * 0.42 + fire * 0.36 + market * (1 - elasticity * 0.22) + queue * 0.12) * dt * 10;
    state.motion = motionSum / Math.max(1, state.particles.length) +
      (machineLedger ? Math.abs(machineLedger.rpm) / 80 : 0) +
      fluidMotion +
      Math.max(0, interactions.motion || 0) * 0.04 +
      Math.max(0, operatorEffect.motion || 0) * 0.04;
    state.field = field + magneticMaterial * 0.34 + metal * 0.12 + control * 0.16 + signalNoise * 0.08 + latency * 0.05;
    state.matter = (state.fluid ? state.fluid.mixing : 0) +
      (state.reaction ? state.reaction.conversion : 0) +
      granular * 0.12 +
      buoyancy * 0.06 +
      biology * 0.1 +
      erosion * 0.07 +
      cohesion * 0.04 +
      solid * 0.05 +
      atomic * 0.04 +
      (interactions.matter || 0) * 0.08 +
      (operatorEffect.matter || 0) * 0.08;
    state.heat = chemistryHeat +
      (params.heatTransfer || 0) * 0.12 +
      thermal * 0.18 +
      fire * 0.28 +
      solarRadiation * 0.18 +
      metal * 0.05 +
      (interactions.heat || 0) * 0.08 +
      (operatorEffect.heat || 0) * 0.08 +
      (params.plasmaTemperature || 0) * 0.22 +
      latentHeat * Math.max(0, state.heat - phase * 0.1) +
      (machineLedger ? Math.max(0, machineLedger.actuatorPowerW) / 600 : 0);
    state.stability = clamp01(1 -
      Math.abs(state.field - drive) * 0.14 -
      swirl * 0.11 -
      chemistryHeat * 0.08 -
      thermal * 0.04 -
      fire * (0.12 - water * 0.05) -
      Math.abs(charge) * 0.04 -
      ionization * 0.05 -
      signalNoise * 0.07 -
      latency * 0.05 -
      Math.max(0, queue - service) * 0.1 -
      infection * 0.06 +
      control * 0.05 +
      solid * 0.03 +
      bond * 0.03 +
      (interactions.stability || 0) * 0.08 +
      (operatorEffect.stability || 0) * 0.08);
    return state;
  }

  function formatMetric(value, digits = 1) {
    if (!Number.isFinite(value)) return '0';
    return value.toFixed(digits);
  }

  function readoutValues(state, spec) {
    if (spec.templateId === 'blank-world') {
      return {
        modules: '0',
        objects: '0',
        forces: '0',
        sources: '0',
        sinks: '0',
        canvas: formatMetric(state.params.canvasScale, 2),
      };
    }
    if (spec.templateId === 'custom-world') {
      const usesContractReadouts = customSpecHasContractReadouts(spec);
      const channelReadouts = hasCompiledSpecArtifacts(spec) && !usesContractReadouts && state.solverState
        ? channelReadoutValues(state, spec)
        : null;
      if (channelReadouts) return channelReadouts;
      const generic = {
        energy: formatMetric(state.energy, 1),
        motion: formatMetric(state.motion * 100, 1),
        field: formatMetric(state.field, 2),
        matter: formatMetric(state.matter * 100, 0),
        heat: formatMetric(state.heat * 100, 0),
        stability: formatMetric(state.stability * 100, 0),
      };
      const labels = readoutLabelsForSpec(spec);
      return Object.fromEntries(labels.map((label) => [
        label,
        contextualReadoutValue(label, state, spec, generic),
      ]));
    }
    if (spec.templateId === 'fluid-vortex') {
      return {
        flow: formatMetric(state.params.inletFlow, 2),
        pressure: formatMetric(state.pressure, 1),
        vorticity: formatMetric(state.vorticity, 2),
        mixing: formatMetric(state.mixing * 100, 0),
        drag: formatMetric(state.dragLossJ, 1),
        age: formatMetric(state.t, 1),
      };
    }
    if (spec.templateId === 'reaction-diffusion') {
      const massB = state.conversion * state.size * state.size;
      return {
        conversion: formatMetric(state.conversion * 100, 1),
        heat: formatMetric(maxField(state.heat) * 100, 0),
        front: formatMetric(state.front * 1000, 2),
        'mass b': formatMetric(massB, 0),
        entropy: formatMetric(state.entropy, 3),
        time: formatMetric(state.t, 1),
      };
    }
    const ledger = energyLedger(state);
    return {
      rpm: formatMetric(ledger.rpm, 1),
      torque: formatMetric(ledger.torqueNm, 2),
      solar: formatMetric(ledger.solarPowerW, 0),
      load: formatMetric(ledger.loadPowerW, 1),
      actuator: formatMetric(ledger.actuatorPowerW, 1),
      balance: formatMetric(ledger.balanceErrorJ, 2),
    };
  }

  function maxField(field) {
    let max = 0;
    for (const value of field || []) max = Math.max(max, value);
    return max;
  }

  function readoutLabelsForSpec(spec) {
    if (spec.templateId === 'custom-world') {
      if (!hasCompiledSpecArtifacts(spec)) return templateById(spec.templateId).readouts;
      const contract = spec.contract || null;
      if (contract && Array.isArray(contract.readouts) && contract.readouts.length) {
        return contract.readouts.slice(0, 6);
      }
      const renderReadouts = spec.renderIR && Array.isArray(spec.renderIR.readouts)
        ? spec.renderIR.readouts
        : [];
      if (renderReadouts.length) {
        return renderReadouts.slice(0, 6).map((readout) => (
          String(readout.label || readout.channel || 'readout').replace(/([A-Z])/g, ' $1').trim()
        ));
      }
      return templateById(spec.templateId).readouts;
    }
    return templateById(spec.templateId).readouts;
  }

  function customSpecHasContractReadouts(spec) {
    const contract = spec.contract || null;
    return Boolean(contract && Array.isArray(contract.readouts) && contract.readouts.length);
  }

  function hasCompiledSpecArtifacts(spec) {
    const intentBrief = spec && spec.intent && spec.intent.intentBrief;
    return Boolean(
      intentBrief && intentBrief.schema &&
      (
        spec && spec.renderIR && spec.renderIR.schema ||
        spec && spec.universeGraph && spec.universeGraph.schema ||
        spec && spec.physicsIR && spec.physicsIR.schema
      )
    );
  }

  function channelReadoutValues(state, spec) {
    const bindings = spec.renderIR && Array.isArray(spec.renderIR.readouts)
      ? spec.renderIR.readouts
      : spec.physicsIR && Array.isArray(spec.physicsIR.readouts)
        ? spec.physicsIR.readouts
        : [];
    if (!bindings.length) return null;
    const channels = state.solverState && state.solverState.channels || {};
    const rows = bindings.slice(0, 6).map((binding) => {
      const label = String(binding.label || binding.channel || 'readout').replace(/([A-Z])/g, ' $1').trim();
      return [label, formatMetric(channelMagnitude(channels[binding.channel]), 2)];
    });
    if (!rows.length) return null;
    return Object.fromEntries(rows);
  }

  function contextualReadoutValue(label, state, spec, generic) {
    const params = spec.params || {};
    const ledger = state.machine ? energyLedger(state.machine) : null;
    switch (label) {
      case 'fuel load':
        return formatMetric((params.combustibility || 0) * (1 - (params.moisture || 0) * 0.35) * 100, 0);
      case 'burn front':
        return formatMetric((state.heat + state.motion * 0.08) * 100, 0);
      case 'smoke':
        return formatMetric(((params.opacity || 0) * 0.5 + state.heat * 0.3) * 100, 0);
      case 'moisture':
        return formatMetric((params.moisture || 0) * 100, 0);
      case 'wind':
        return formatMetric(Math.abs(params.windSpeed || params.flowRate || 0) * 100, 0);
      case 'containment':
        return formatMetric(state.stability * 100, 0);
      case 'water flow':
        return formatMetric((params.flowRate || params.inletFlow || 0) * 100, 0);
      case 'erosion rate':
        return formatMetric((params.erosionRate || 0) * 100, 0);
      case 'sediment':
        return formatMetric(state.matter * 100, 0);
      case 'slope':
        return formatMetric(Math.abs(params.terrainSlope || params.gravity || 0) * 100, 0);
      case 'terrain loss':
        return formatMetric((state.matter * (params.erosionRate || 0.1)) * 100, 0);
      case 'light':
        return formatMetric((params.lightIntensity || 0) * 100, 0);
      case 'refraction':
        return formatMetric(params.refractiveIndex || 1, 2);
      case 'beam split':
        return formatMetric((state.field + (params.lightIntensity || 0) * 0.2) * 100, 0);
      case 'focus':
        return formatMetric(state.stability * 100, 0);
      case 'grid load':
        return formatMetric((state.energy * 0.12 + (params.marketDemand || 0) * 60) % 100, 0);
      case 'queue backlog':
        return formatMetric((params.queueBacklog || 0) * 100, 0);
      case 'throughput':
        return formatMetric((params.serviceRate || 0) * (1 - (params.queueBacklog || 0) * 0.4) * 100, 0);
      case 'delay':
        return formatMetric((params.networkLatency || params.signalDelay || 0) * 100, 0);
      case 'demand':
        return formatMetric((params.marketDemand || 0) * 100, 0);
      case 'source':
        return formatMetric((params.energyInput || params.irradiance / 1200 || 0) * 100, 0);
      case 'loss':
        return formatMetric((1 - state.stability + state.heat * 0.05) * 100, 0);
      case 'balance':
        return ledger ? formatMetric(ledger.balanceErrorJ, 2) : generic.stability;
      case 'rpm':
        return ledger ? formatMetric(ledger.rpm, 1) : generic.motion;
      case 'timing':
        return formatMetric((params.driveTiming || params.signalDelay || 0) * 100, 0);
      default:
        return generic[label] || '0';
    }
  }

  function stateLabel(state, spec) {
    if (spec.templateId === 'blank-world') {
      return 'blank construction plane';
    }
    if (spec.templateId === 'custom-world') {
      const sceneKind = spec.renderProgram && spec.renderProgram.rendererPlan
        ? spec.renderProgram.rendererPlan.sceneKind
        : '';
      if (sceneKind === 'magnetic-machine') return 'composed magnetic machine';
      if (sceneKind === 'fire') return 'elemental reaction world';
      if (sceneKind === 'optics' || sceneKind === 'thin-film') return 'composed optics world';
      if (sceneKind === 'city') return 'composed operations network';
      if (sceneKind === 'watershed') return 'terrain flow world';
      if (sceneKind === 'biology') return 'composed control biology';
      if (sceneKind === 'acoustic') return 'composed wave world';
      if (sceneKind === 'granular') return 'granular physics world';
      if (sceneKind === 'ferrofluid') return 'magnetic fluid world';
	      if (sceneKind === 'thermal-plume') return 'thermal plume world';
	      if (sceneKind === 'mechanical') return 'mechanical constraint world';
	      if (sceneKind === 'weather-atmosphere') return 'weather atmosphere volume';
	      if (sceneKind === 'ocean-cryosphere') return 'ocean cryosphere system';
	      if (sceneKind === 'grid-energy') return 'energy grid stability field';
	      if (sceneKind === 'robotics-control') return 'robotics control workspace';
	      if (sceneKind === 'manufacturing-line') return 'manufacturing line field';
	      if (sceneKind === 'quantum-instrument') return 'quantum instrument field';
	      if (sceneKind === 'chemistry-lab') return 'oscillating chemistry lab';
      if (sceneKind === 'cultural-material') return 'cultural material conservation';
      if (sceneKind === 'venue-crowd') return 'crowd venue field';
      if (sceneKind === 'sport-motion') return 'sport trajectory world';
      if (sceneKind === 'space-instrument') return 'deep space instrument field';
      if (sceneKind === 'planetary-space') return 'planetary space environment';
      if (sceneKind === 'evolution-ecology') return 'evolution ecology landscape';
      if (sceneKind === 'agro-waste-loop') return 'agro waste loop';
      if (sceneKind === 'hazard-atmosphere') return 'hazard atmosphere world';
      if (sceneKind === 'civic-market') return 'civic market network';
      if (sceneKind === 'digital-network') return 'digital network system';
      if (sceneKind === 'clinical-control') return 'clinical control field';
      if (sceneKind === 'restoration-water') return 'restoration water system';
      if (sceneKind === 'advanced-energy') return 'advanced energy chemistry';
      if (hasModule(spec, 'terrain') && hasModule(spec, 'logistics')) return 'composed terrain market';
      if (hasModule(spec, 'phase-change') && hasModule(spec, 'network')) return 'composed phase network';
      if (hasModule(spec, 'biology') && hasModule(spec, 'control')) return 'composed control biology';
      if (hasModule(spec, 'atomic') && hasModule(spec, 'metal')) return 'atomic material world';
      if (hasModule(spec, 'fire') && hasModule(spec, 'water')) return 'elemental reaction world';
      if (hasModule(spec, 'glass') && hasModule(spec, 'magnetic')) return 'raw material optics';
      if (hasModule(spec, 'rock') || hasModule(spec, 'wood') || hasModule(spec, 'metal')) return 'raw material world';
      if (hasModule(spec, 'chemistry') && hasModule(spec, 'fluid')) return 'composed fluid chemistry';
      if (hasModule(spec, 'electromagnetism') && hasModule(spec, 'solar')) return 'composed magnetic machine';
      if (hasModule(spec, 'queue') || hasModule(spec, 'network')) return 'composed operations network';
      if (hasModule(spec, 'optics') && hasModule(spec, 'plasma')) return 'prismatic plasma world';
      if (hasModule(spec, 'optics')) return 'composed optics world';
      if (hasModule(spec, 'plasma') || hasModule(spec, 'electricity')) return 'charged plasma world';
      if (hasModule(spec, 'acoustics') || hasModule(spec, 'wave')) return 'composed wave world';
      if (hasModule(spec, 'granular')) return 'granular physics world';
      if (hasModule(spec, 'elasticity') || hasModule(spec, 'collision')) return 'mechanical constraint world';
      if (hasModule(spec, 'fluid')) return 'composed flow world';
      if (hasModule(spec, 'chemistry')) return 'composed reaction world';
      return 'composed physics world';
    }
    if (spec.templateId === 'fluid-vortex') {
      return state.vorticity > 0.35 ? 'turbulent wake' : 'laminar drift';
    }
    if (spec.templateId === 'reaction-diffusion') {
      return state.front > 0.0004 ? 'reaction front active' : 'diffusing';
    }
    const ledger = energyLedger(state);
    return Math.abs(state.omega) < 0.05 && state.t > 2
      ? 'stalled'
      : ledger.loadPowerW > 0.2
        ? 'spinning under load'
        : 'seeking torque';
  }
  return {
    ...catalog,
    COMPOSITION_SCHEMA,
    INTENT_CLASSIFICATION_SCHEMA,
    INTENT_MODEL_ID,
    PHYSICAL_IR_SCHEMA,
    PHASE_OUTPUT_SCHEMAS,
    PROMPT_PARSE_SCHEMA,
    RENDER_PROGRAM_SCHEMA,
    RENDER_EXECUTION_INPUT_SCHEMA,
    RENDER_IR_SCHEMA,
    SEMANTIC_RAG_SCHEMA,
    SOLVER_GRAPH_SCHEMA,
    SYNTHESIS_SCHEMA,
    UNIVERSE_GRAPH_SCHEMA,
    VALIDATION_RECEIPT_SCHEMA,
    buildPrimitiveProgram,
    buildCompositionGraph,
    buildPhysicsIR,
    classificationSummary,
    classifyIntentPrompt,
    compileCompositionToRenderProgram,
    compileRenderIR,
    compileSolverGraph,
    createPhaseEnvelope,
    assertPhaseEnvelope,
    validatePhaseEnvelope,
    validatePhase1RuntimeReady,
    validatePhase2LanguageGraph,
    validatePhase3RetrievalRerank,
    validatePhase4GroundedIntent,
    validatePhase5SimulationCompile,
    validatePhase6VisualCompile,
    validatePhase7RenderExecution,
    validatePhase8SceneProof,
    runPhase1RuntimeGate,
    runPhase2LanguageGraph,
    runPhase3Retrieval,
    runPhase4GroundedIntent,
    runPhase5SimulationCompile,
    runPhase6VisualCompile,
    runPhase7RenderExecution,
    runPhase8SceneProof,
    createRenderExecutionInput,
    createBlankState,
    createComponentStates,
    createCustomState,
    createFluidState,
    createIntentFromPrompt,
    createSemanticRag,
    createReactionState,
    createSimulationState,
    createSolverState,
    createSpec,
    createSpecFromPrompt,
    createState,
    deserializeSpec,
    energyLedger,
    formatMetric,
    groundedPrimitiveRows,
    groundUniverseGraph,
    hasModule,
    isMagneticMachine,
    kineticEnergy,
    magnetPosition,
    magneticTorque,
    maxField,
    normalizeSpec,
    operatorTotals,
    parsePrompt,
    rankPrimitivesForClassification,
    readoutLabelsForSpec,
    readoutValues,
    remixSpec,
    resolveIntentToSpec,
    serializeSpec,
    sliderTargetAngle,
    solarPower,
    stateLabel,
    stepSolverState,
    stepBlankState,
    stepComponentStates,
    stepCustomState,
    stepFluidState,
    stepReactionState,
    stepSimulation,
    stepState,
    synthesizeWorldIntent,
    titleFromPrompt,
    validatePhysicsIR,
  };
});
