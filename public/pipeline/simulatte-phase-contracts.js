(function attachSimulattePhaseContracts(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulattePhaseContracts = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createPhaseContractsApi() {
  const PHASE_ZERO_INPUT_SCHEMA = 'simulatte.phase0.input.v1';
  const ENVELOPE_REQUIRED = Object.freeze([
    'schema',
    'phase',
    'inputSchema',
    'runtimeReceiptId',
    'artifact',
    'receipts',
  ]);

  function phase({
    id,
    number,
    allowedInputs,
    outputSchema,
    artifactSchema,
    artifactKeys,
    receipts,
    forbiddenUpstreamReads,
    notes = '',
  }) {
    const contract = {
      id,
      phase: number,
      allowedInputs: Object.freeze(allowedInputs),
      outputSchema,
      artifactSchema,
      artifactKeys: Object.freeze(artifactKeys),
      receipts: Object.freeze(receipts),
      forbiddenUpstreamReads: Object.freeze(forbiddenUpstreamReads),
    };
    if (notes) contract.notes = notes;
    return Object.freeze(contract);
  }

  const phases = Object.freeze([
    phase({
      id: 'phase1RuntimeReady',
      number: 1,
      allowedInputs: [
        PHASE_ZERO_INPUT_SCHEMA,
        'appConfig',
        'modelManifest',
        'indexManifest',
        'cacheState',
        'providerCapabilities',
        'rawPromptIngress',
      ],
      outputSchema: 'simulatte.phase1.output.v1',
      artifactSchema: 'simulatte.phase1.runtimeReady.v1',
      artifactKeys: ['runtimeContext', 'promptIngress', 'compositionLedger'],
      receipts: [
        'phase1-runtime-context',
        'model-ready',
        'model-probe',
        'cache-health',
        'runtime-ready',
      ],
      forbiddenUpstreamReads: [],
    }),
    phase({
      id: 'phase2LanguageGraph',
      number: 2,
      allowedInputs: [
        'simulatte.phase1.output.v1',
        'phase1.runtimeContext',
        'phase1.promptIngress.sourceText',
      ],
      outputSchema: 'simulatte.phase2.output.v1',
      artifactSchema: 'simulatte.phase2.sceneLanguageGraph.v1',
      artifactKeys: [
        'languageGraph',
        'sceneLanguageGraph',
        'queryPlan',
        'compositionLedger',
        'promptParse',
      ],
      receipts: ['phase2-language-graph'],
      forbiddenUpstreamReads: [
        'retrievalRows',
        'activationCloud',
        'groundedIntent',
        'renderIR',
        'visualIR',
        'renderProgram',
      ],
    }),
    phase({
      id: 'phase3RetrievalRerank',
      number: 3,
      allowedInputs: ['simulatte.phase2.output.v1', 'phase1.runtimeContext'],
      outputSchema: 'simulatte.phase3.output.v2',
      artifactSchema: 'simulatte.phase3.retrievalRerank.v3',
      artifactKeys: [
        'languageGraph',
        'sceneLanguageGraph',
        'queryPlan',
        'retrievalRerankResult',
        'activationCloud',
        'compositionLedger',
      ],
      receipts: ['phase3-retrieval-rerank', 'phase3-activation-fusion'],
      forbiddenUpstreamReads: [
        'rawPrompt',
        'spec.intent',
        'groundedIntent',
        'physicsIR',
        'renderIR',
        'visualIR',
        'renderProgram',
      ],
      notes: 'Reranking and activation fusion are closing operations inside Phase 3, not separate phases.',
    }),
    phase({
      id: 'phase4GroundedIntent',
      number: 4,
      allowedInputs: ['simulatte.phase3.output.v2', 'phase1.runtimeContext'],
      outputSchema: 'simulatte.phase4.output.v2',
      artifactSchema: 'simulatte.phase4.groundedSceneContract.v1',
      artifactKeys: [
        'activationCloud',
        'groundedIntent',
        'groundedSceneContract',
        'compositionLedger',
      ],
      receipts: ['phase4-grounded-intent'],
      forbiddenUpstreamReads: [
        'rawPrompt',
        'rankedPrimitives',
        'rankedCards',
        'rankedUniverseRows',
        'semanticRag',
        'physicsIR',
        'renderIR',
        'visualIR',
        'renderProgram',
      ],
    }),
    phase({
      id: 'phase5SimulationCompile',
      number: 5,
      allowedInputs: ['simulatte.phase4.output.v2', 'phase1.runtimeContext'],
      outputSchema: 'simulatte.phase5.output.v2',
      artifactSchema: 'simulatte.phase5.simulationCompile.v2',
      artifactKeys: ['simulationCompile', 'compositionLedger'],
      receipts: ['phase5-simulation-compile'],
      forbiddenUpstreamReads: [
        'rawPrompt',
        'retrievalRows',
        'activationCloudWithoutPhase4',
        'renderProgram',
        'visualIR',
      ],
    }),
    phase({
      id: 'phase6VisualCompile',
      number: 6,
      allowedInputs: ['simulatte.phase5.output.v2', 'phase1.runtimeContext'],
      outputSchema: 'simulatte.phase6.output.v2',
      artifactSchema: 'simulatte.phase6.visualCompile.v2',
      artifactKeys: ['visualCompile', 'compositionLedger'],
      receipts: ['phase6-visual-compile'],
      forbiddenUpstreamReads: [
        'rawPrompt',
        'spec.intent',
        'retrievalRows',
        'activationCloud',
        'groundedIntentDirect',
        'renderProgram.visualIR',
      ],
    }),
    phase({
      id: 'phase7RenderExecution',
      number: 7,
      allowedInputs: [
        'simulatte.phase6.output.v2',
        'phase1.runtimeContext',
        'simulationState',
        'canvas',
      ],
      outputSchema: 'simulatte.phase7.output.v2',
      artifactSchema: 'simulatte.phase7.renderExecution.v2',
      artifactKeys: ['renderExecution', 'compositionLedger'],
      receipts: ['phase7-webgpu-render'],
      forbiddenUpstreamReads: [
        'rawPrompt',
        'promptParse',
        'spec.intent',
        'retrievalRows',
        'activationCloud',
        'groundedIntent',
        'renderIR',
        'visualIR',
        'renderProgram',
      ],
    }),
    phase({
      id: 'phase8SceneProof',
      number: 8,
      allowedInputs: ['simulatte.phase7.output.v2', 'phase1.runtimeContext'],
      outputSchema: 'simulatte.phase8.output.v2',
      artifactSchema: 'simulatte.phase8.sceneProof.v1',
      artifactKeys: ['sceneProof', 'compositionLedger'],
      receipts: ['phase8-scene-proof'],
      forbiddenUpstreamReads: [
        'rawPrompt',
        'promptParse',
        'spec.intent',
        'retrievalRows',
        'activationCloud',
        'groundedIntent',
        'renderIR',
        'visualIR',
        'renderProgram',
      ],
      notes: 'Scene Proof settles composition obligations from render receipts and adds no scene content.',
    }),
  ]);

  const PHASE_OUTPUT_SCHEMAS = Object.freeze(Object.fromEntries(
    phases.map((row) => [row.phase, row.outputSchema])
  ));
  const PHASE_CONTRACTS = Object.freeze(Object.fromEntries(phases.map((row) => [
    row.phase,
    Object.freeze({
      phase: row.phase,
      inputSchema: row.allowedInputs[0],
      artifactKeys: row.artifactKeys,
      receiptIds: row.receipts,
      forbiddenUpstreamReads: row.forbiddenUpstreamReads,
    }),
  ])));

  return Object.freeze({
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    title: 'Simulatte Phase Contracts',
    schema: 'simulatte.phaseContracts.v1',
    version: 'strict-8-phase-scene-proof-v2',
    envelope: Object.freeze({
      schemaPattern: 'simulatte.phaseN.output.v2',
      required: ENVELOPE_REQUIRED,
      receiptsSchema: 'simulatte.phaseReceipt.v1',
    }),
    phases,
    PHASE_ZERO_INPUT_SCHEMA,
    PHASE_OUTPUT_SCHEMAS,
    PHASE_CONTRACTS,
  });
});
