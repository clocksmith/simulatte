(function attachSimulattePhysicsModel(root) {
  if (typeof module === 'object' && module.exports) {
    require('./simulatte-physics-model-dependencies.js');
    require('./simulatte-physics-model-contracts.js');
    require('./simulatte-physics-model-phase-runtime-language.js');
    require('./simulatte-physics-model-phase-retrieval.js');
    require('./simulatte-physics-model-activation-verdicts.js');
    require('./simulatte-physics-model-activation-fusion.js');
    require('./simulatte-physics-model-phase-grounding.js');
    require('./simulatte-physics-model-phase-simulation.js');
    require('./simulatte-physics-model-phase-visual-render.js');
    require('./simulatte-physics-model-state-solvers.js');
    require('./simulatte-physics-model-spec-api.js');
    require('./simulatte-physics-model-metrics.js');
    require('./simulatte-physics-model-compatibility.js');
  }
  const scope = root.SimulattePhaseModuleRegistry.family('physicsModel');
  let api;

    api = {
    ...scope.catalog,
    COMPOSITION_SCHEMA: scope.COMPOSITION_SCHEMA,
    INTENT_CLASSIFICATION_SCHEMA: scope.INTENT_CLASSIFICATION_SCHEMA,
    DETERMINISTIC_TFIDF_RANKER_ID: scope.DETERMINISTIC_TFIDF_RANKER_ID,
    NEGATION_RE: scope.NEGATION_RE,
    PHYSICAL_IR_SCHEMA: scope.PHYSICAL_IR_SCHEMA,
    PHASE_OUTPUT_SCHEMAS: scope.PHASE_OUTPUT_SCHEMAS,
    PROMPT_PARSE_SCHEMA: scope.PROMPT_PARSE_SCHEMA,
    RENDER_PROGRAM_SCHEMA: scope.RENDER_PROGRAM_SCHEMA,
    RENDER_EXECUTION_INPUT_SCHEMA: scope.RENDER_EXECUTION_INPUT_SCHEMA,
    RENDER_IR_SCHEMA: scope.RENDER_IR_SCHEMA,
    SEMANTIC_RAG_SCHEMA: scope.SEMANTIC_RAG_SCHEMA,
    SOLVER_GRAPH_SCHEMA: scope.SOLVER_GRAPH_SCHEMA,
    ENERGY_LEDGER_SCHEMA: scope.ENERGY_LEDGER_SCHEMA,
    CHECKPOINT_SCHEMA: scope.CHECKPOINT_SCHEMA,
    SYNTHESIS_SCHEMA: scope.SYNTHESIS_SCHEMA,
    OBLIGATION_VERDICTS: scope.OBLIGATION_VERDICTS,
    UNIVERSE_GRAPH_SCHEMA: scope.UNIVERSE_GRAPH_SCHEMA,
    VALIDATION_RECEIPT_SCHEMA: scope.VALIDATION_RECEIPT_SCHEMA,
    buildPrimitiveProgram: scope.buildPrimitiveProgram,
    buildCompositionGraph: scope.buildCompositionGraph,
    buildPhysicsIR: scope.buildPhysicsIR,
    classificationSummary: scope.classificationSummary,
    classifyIntentPrompt: scope.classifyIntentPrompt,
    compileCompositionToRenderProgram: scope.compileCompositionToRenderProgram,
    compileRenderIR: scope.compileRenderIR,
    compileSolverGraph: scope.compileSolverGraph,
    createPhaseEnvelope: scope.createPhaseEnvelope,
    assertPhaseEnvelope: scope.assertPhaseEnvelope,
    validatePhaseEnvelope: scope.validatePhaseEnvelope,
    validatePhase1RuntimeReady: scope.validatePhase1RuntimeReady,
    validatePhase2LanguageGraph: scope.validatePhase2LanguageGraph,
    validatePhase3RetrievalRerank: scope.validatePhase3RetrievalRerank,
    validatePhase4GroundedIntent: scope.validatePhase4GroundedIntent,
    validatePhase5SimulationCompile: scope.validatePhase5SimulationCompile,
    validatePhase6VisualCompile: scope.validatePhase6VisualCompile,
    validatePhase7RenderExecution: scope.validatePhase7RenderExecution,
    validatePhase8SceneProof: scope.validatePhase8SceneProof,
    runPhase1RuntimeGate: scope.runPhase1RuntimeGate,
    runPhase2LanguageGraph: scope.runPhase2LanguageGraph,
    runPhase3Retrieval: scope.runPhase3Retrieval,
    runPhase4GroundedIntent: scope.runPhase4GroundedIntent,
    runPhase5SimulationCompile: scope.runPhase5SimulationCompile,
    runPhase6VisualCompile: scope.runPhase6VisualCompile,
    runPhase7RenderExecution: scope.runPhase7RenderExecution,
    runPhase8SceneProof: scope.runPhase8SceneProof,
    obligationVerdictRows: scope.obligationVerdictRows,
    evidenceConflictRows: scope.evidenceConflictRows,
    conflictsBySlotRows: scope.conflictsBySlotRows,
    createRenderExecutionInput: scope.createRenderExecutionInput,
    createBlankState: scope.createBlankState,
    createComponentStates: scope.createComponentStates,
    createCustomState: scope.createCustomState,
    createFluidState: scope.createFluidState,
    createIntentFromPrompt: scope.createIntentFromPrompt,
    createSemanticRag: scope.createSemanticRag,
    createReactionState: scope.createReactionState,
    createSimulationState: scope.createSimulationState,
    createSolverState: scope.createSolverState,
    createEnergyLedger: scope.createEnergyLedger,
    createSolverCheckpoint: scope.createSolverCheckpoint,
    createSpec: scope.createSpec,
    createSpecFromPrompt: scope.createSpecFromPrompt,
    createState: scope.createState,
    deserializeSpec: scope.deserializeSpec,
    deserializeSolverCheckpoint: scope.deserializeSolverCheckpoint,
    energyLedger: scope.energyLedger,
    formatMetric: scope.formatMetric,
    groundedPrimitiveRows: scope.groundedPrimitiveRows,
    groundUniverseGraph: scope.groundUniverseGraph,
    hasModule: scope.hasModule,
    isMagneticMachine: scope.isMagneticMachine,
    kineticEnergy: scope.kineticEnergy,
    magnetPosition: scope.magnetPosition,
    magneticTorque: scope.magneticTorque,
    maxField: scope.maxField,
    normalizeSpec: scope.normalizeSpec,
    operatorTotals: scope.operatorTotals,
    parsePrompt: scope.parsePrompt,
    rankPrimitivesForClassification: scope.rankPrimitivesForClassification,
    readoutLabelsForSpec: scope.readoutLabelsForSpec,
    readoutValues: scope.readoutValues,
    remixSpec: scope.remixSpec,
    restoreSolverCheckpoint: scope.restoreSolverCheckpoint,
    resolveIntentToSpec: scope.resolveIntentToSpec,
    serializeSpec: scope.serializeSpec,
    serializeSolverCheckpoint: scope.serializeSolverCheckpoint,
    sliderTargetAngle: scope.sliderTargetAngle,
    solarPower: scope.solarPower,
    stateLabel: scope.stateLabel,
    stepSolverState: scope.stepSolverState,
    stepBlankState: scope.stepBlankState,
    stepComponentStates: scope.stepComponentStates,
    stepCustomState: scope.stepCustomState,
    stepFluidState: scope.stepFluidState,
    stepReactionState: scope.stepReactionState,
    stepSimulation: scope.stepSimulation,
    stepState: scope.stepState,
    applyGridBoundaryFlux: scope.applyGridBoundaryFlux,
    buildGridGhostLayer: scope.buildGridGhostLayer,
    synthesizeWorldIntent: scope.synthesizeWorldIntent,
    titleFromPrompt: scope.titleFromPrompt,
    validatePhysicsIR: scope.validatePhysicsIR,
  };
  root.SimulattePhaseModuleRegistry.finalize('physicsModel', {
    requiredExports: Object.keys(api).filter((name) => (
      root.SimulattePhaseModuleRegistry.ownerOf('physicsModel', name)
    )),
  });
  Object.freeze(api);

  if (typeof module === 'object' && module.exports) {
      module.exports = api;
    }
  root.SimulattePhysicsModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
