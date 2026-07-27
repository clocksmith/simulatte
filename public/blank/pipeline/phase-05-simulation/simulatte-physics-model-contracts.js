(function attachSimulattePhysicsModelcontracts(root) {
  const scope = root.SimulattePhaseModuleRegistry.family('physicsModel');

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
      } = scope.catalog;

    const {
        COMPOSITION_SCHEMA,
        RENDER_PROGRAM_SCHEMA,
        buildCompositionGraph,
        compileCompositionToRenderProgram,
      } = scope.composer || {};

    const {
        INTENT_CLASSIFICATION_SCHEMA,
        DETERMINISTIC_TFIDF_RANKER_ID,
        classificationSummary,
        classifyIntentPrompt,
        rankPrimitivesForClassification,
      } = scope.classifier || {};

    const {
        SEMANTIC_RAG_SCHEMA,
        buildPrimitiveProgram,
        createSemanticRag,
      } = scope.semantic || {};

    const {
        DOPPLER_INTENT_SCHEMA,
        normalizeDopplerIntent,
      } = scope.doppler || {};

    const {
        SYNTHESIS_SCHEMA,
        groundedPrimitiveRows,
        synthesizeWorldIntent,
      } = scope.graphSynthesis || {};

    const {
        PROMPT_PARSE_SCHEMA,
        parsePrompt,
      } = scope.universeParser || {};

    const {
        UNIVERSE_GRAPH_SCHEMA,
        groundUniverseGraph,
      } = scope.universeGrounder || {};

    const {
        PHYSICAL_IR_SCHEMA,
        buildPhysicsIR,
      } = scope.physicsIR || {};

    const {
        VALIDATION_RECEIPT_SCHEMA,
        validatePhysicsIR,
      } = scope.physicsIRValidator || {};

    const {
        SOLVER_GRAPH_SCHEMA,
        ENERGY_LEDGER_SCHEMA,
        CHECKPOINT_SCHEMA,
        compileSolverGraph,
        createSolverState,
        stepSolverState,
        createEnergyLedger,
        createSolverCheckpoint,
        restoreSolverCheckpoint,
        serializeSolverCheckpoint,
        deserializeSolverCheckpoint,
        applyGridBoundaryFlux,
        buildGridGhostLayer,
        deriveChannelSummary,
      } = scope.solverCompiler || {};

    const {
        RENDER_IR_SCHEMA,
        compileRenderIR,
      } = scope.renderIR || {};

    const interactionIR = typeof module === 'object' && module.exports
      ? require('./simulatte-interaction-ir.js')
      : root.SimulatteInteractionIR;
    if (!interactionIR) throw new Error('Simulatte InteractionIR compiler unavailable');

    const {
        INTENT_BRIEF_SCHEMA,
        buildIntentForensics,
      } = scope.intentForensics || {};

    const {
        buildActivationCloud,
        summarizeActivationCloud,
      } = scope.activationModule || {};

    const {
        buildGroundedInterpretation,
      } = scope.groundedModule || {};

    const {
      PHASE_CONTRACTS,
      PHASE_OUTPUT_SCHEMAS,
      PHASE_ZERO_INPUT_SCHEMA,
      phaseOutputSchema,
      createPhaseEnvelope,
      assertPhaseEnvelope,
      forbiddenFieldPresent,
      dottedPathPresent,
      fieldNamePresent,
      validatePhaseEnvelope,
      validatePhase1RuntimeReady,
      validatePhase2LanguageGraph,
      validatePhase3RetrievalRerank,
      validatePhase4GroundedIntent,
      validatePhase5SimulationCompile,
      validatePhase6VisualCompile,
      validatePhase7RenderExecution,
      validatePhase8SceneProof,
    } = scope.phaseContracts || {};
    if (!PHASE_CONTRACTS || !PHASE_OUTPUT_SCHEMAS || !PHASE_ZERO_INPUT_SCHEMA) {
      throw new Error('Simulatte phase contract module unavailable');
    }

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

    const WATER_ENVIRONMENT_RE = /\b(?:lake|pool|beach|pond|river|ocean)\b/;

    const WATER_MEDIUM_RE = /\b(?:water|fluid)\b/;

    const SWIMMING_RE = /\b(?:swim|swims|swimming|swam)\b/;

    const NEGATION_RE = scope.universeParser && scope.universeParser.NEGATION_RE ||
      /\b(?:no|not|never|without|none|cannot|can't|wont|won't)\b/;

    root.SimulattePhaseModuleRegistry.define('physicsModel', 'simulatte-physics-model-contracts.js', {
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
      COMPOSITION_SCHEMA,
      RENDER_PROGRAM_SCHEMA,
      buildCompositionGraph,
      compileCompositionToRenderProgram,
      INTENT_CLASSIFICATION_SCHEMA,
      DETERMINISTIC_TFIDF_RANKER_ID,
      classificationSummary,
      classifyIntentPrompt,
      rankPrimitivesForClassification,
      SEMANTIC_RAG_SCHEMA,
      buildPrimitiveProgram,
      createSemanticRag,
      DOPPLER_INTENT_SCHEMA,
      normalizeDopplerIntent,
      SYNTHESIS_SCHEMA,
      groundedPrimitiveRows,
      synthesizeWorldIntent,
      PROMPT_PARSE_SCHEMA,
      parsePrompt,
      UNIVERSE_GRAPH_SCHEMA,
      groundUniverseGraph,
      PHYSICAL_IR_SCHEMA,
      buildPhysicsIR,
      VALIDATION_RECEIPT_SCHEMA,
      validatePhysicsIR,
      SOLVER_GRAPH_SCHEMA,
      ENERGY_LEDGER_SCHEMA,
      CHECKPOINT_SCHEMA,
      compileSolverGraph,
      createSolverState,
      stepSolverState,
      createEnergyLedger,
      createSolverCheckpoint,
      restoreSolverCheckpoint,
      serializeSolverCheckpoint,
      deserializeSolverCheckpoint,
      applyGridBoundaryFlux,
      buildGridGhostLayer,
      deriveChannelSummary,
      RENDER_IR_SCHEMA,
      compileRenderIR,
      ...interactionIR,
      INTENT_BRIEF_SCHEMA,
      buildIntentForensics,
      buildActivationCloud,
      summarizeActivationCloud,
      buildGroundedInterpretation,
      PHASE_CONTRACTS,
      PHASE_ZERO_INPUT_SCHEMA,
      phaseOutputSchema,
      createPhaseEnvelope,
      assertPhaseEnvelope,
      forbiddenFieldPresent,
      dottedPathPresent,
      fieldNamePresent,
      validatePhaseEnvelope,
      validatePhase1RuntimeReady,
      validatePhase2LanguageGraph,
      validatePhase3RetrievalRerank,
      validatePhase4GroundedIntent,
      validatePhase5SimulationCompile,
      validatePhase6VisualCompile,
      validatePhase7RenderExecution,
      validatePhase8SceneProof,
      PHASE_OUTPUT_SCHEMAS,
      RENDER_EXECUTION_INPUT_SCHEMA,
      SCENE_COMPOSITION_LEDGER_SCHEMA,
      SCENE_LANGUAGE_GRAPH_SCHEMA,
      SCENE_QUERY_PLAN_SCHEMA,
      RETRIEVAL_RERANK_RESULT_SCHEMA,
      ACTIVATION_CLOUD_SCHEMA,
      GROUNDED_SCENE_CONTRACT_SCHEMA,
      SIMULATION_COMPILE_SCHEMA,
      VISUAL_COMPILE_SCHEMA,
      RENDER_EXECUTION_SCHEMA,
      WATER_ENVIRONMENT_RE,
      WATER_MEDIUM_RE,
      SWIMMING_RE,
      NEGATION_RE,
    });

})(typeof globalThis !== 'undefined' ? globalThis : window);
