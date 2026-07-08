(function attachSimulattePhysicsModelcontracts(root) {
  const scope = root.__SimulattePhysicsModelRefactorScope;
  if (!scope || scope.missingDependency) return;
  with (scope) {
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

    const PHASE_ZERO_INPUT_SCHEMA = 'simulatte.phase0.input.v1';

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

    const NEGATION_RE = /\b(?:no|not|never|without|none|cannot|can't|wont|won't)\b/;

    Object.assign(scope, {
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
      INTENT_MODEL_ID,
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
      compileSolverGraph,
      createSolverState,
      stepSolverState,
      deriveChannelSummary,
      RENDER_IR_SCHEMA,
      compileRenderIR,
      INTENT_BRIEF_SCHEMA,
      buildIntentForensics,
      buildActivationCloud,
      summarizeActivationCloud,
      buildGroundedInterpretation,
      PHASE_ZERO_INPUT_SCHEMA,
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
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
