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
        'intentRequirements',
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
        'intentRequirements',
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
        'intentSettlement',
        'semanticProvenance',
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
      artifactKeys: ['sceneProof', 'worldProof', 'compositionLedger'],
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

  function phaseOutputSchema(phaseNumber) {
    const phaseId = Number(phaseNumber);
    return PHASE_OUTPUT_SCHEMAS[phaseId] || `simulatte.phase${phaseId || 0}.output.v1`;
  }

  function createPhaseEnvelope({
    phase: phaseNumber,
    inputSchema,
    runtimeReceiptId,
    artifact = {},
    receipts = [],
  }) {
    const phaseId = Number(phaseNumber);
    if (!Number.isInteger(phaseId) || phaseId < 1 || phaseId > 8) {
      throw new Error(`Invalid Simulatte phase envelope phase: ${phaseNumber}`);
    }
    return {
      schema: phaseOutputSchema(phaseId),
      phase: phaseId,
      inputSchema: inputSchema || (
        phaseId === 1 ? PHASE_ZERO_INPUT_SCHEMA : phaseOutputSchema(phaseId - 1)
      ),
      runtimeReceiptId: String(runtimeReceiptId || 'runtime:unknown'),
      artifact: artifact && typeof artifact === 'object' ? artifact : {},
      receipts: Array.isArray(receipts) ? receipts.filter(Boolean) : [],
    };
  }

  function assertPhaseEnvelope(envelope, phaseNumber, label = 'phase boundary') {
    const phaseId = Number(phaseNumber);
    const expected = phaseOutputSchema(phaseId);
    if (!envelope || envelope.schema !== expected || Number(envelope.phase) !== phaseId) {
      const received = envelope && envelope.schema ? envelope.schema : typeof envelope;
      throw new Error(`${label} expected ${expected}, received ${received}`);
    }
    const contract = PHASE_CONTRACTS[phaseId];
    if (contract && envelope.inputSchema !== contract.inputSchema) {
      throw new Error(
        `${label} expected inputSchema ${contract.inputSchema}, received ${envelope.inputSchema || 'missing'}`
      );
    }
    if (!envelope.artifact || typeof envelope.artifact !== 'object' || Array.isArray(envelope.artifact)) {
      throw new Error(`${label} expected artifact object`);
    }
    const allowedArtifactKeys = new Set(contract ? contract.artifactKeys : []);
    for (const key of allowedArtifactKeys) {
      if (!(key in envelope.artifact)) throw new Error(`${label} missing artifact.${key}`);
    }
    for (const key of Object.keys(envelope.artifact)) {
      if (contract && !allowedArtifactKeys.has(key)) {
        throw new Error(`${label} unexpected artifact.${key}`);
      }
    }
    if (!Array.isArray(envelope.receipts)) {
      throw new Error(`${label} expected receipts array`);
    }
    const receiptIds = new Set(envelope.receipts
      .map((receipt) => receipt && receipt.id)
      .filter(Boolean));
    for (const required of contract ? contract.receiptIds : []) {
      if (!receiptIds.has(required)) throw new Error(`${label} missing receipt ${required}`);
    }
    for (const receipt of envelope.receipts) {
      if (!receipt || receipt.schema !== 'simulatte.phaseReceipt.v1') {
        throw new Error(`${label} expected receipt schema simulatte.phaseReceipt.v1`);
      }
    }
    const forbidden = firstForbiddenField(
      envelope.artifact,
      contract ? contract.forbiddenUpstreamReads : []
    );
    if (forbidden) throw new Error(`${label} contains forbidden upstream field ${forbidden}`);
    return envelope;
  }

  function firstForbiddenField(value, forbiddenRows = []) {
    if (!value || typeof value !== 'object' || !forbiddenRows.length) return '';
    const names = new Set(forbiddenRows.filter((field) => !field.includes('.')));
    const paths = forbiddenRows
      .filter((field) => field.includes('.'))
      .map((field) => ({ field, parts: field.split('.') }));
    const stack = [value];
    const seen = new WeakSet();
    while (stack.length) {
      const current = stack.pop();
      if (!current || typeof current !== 'object' || seen.has(current)) continue;
      seen.add(current);
      for (const key of Object.keys(current)) {
        if (names.has(key)) return key;
        const child = current[key];
        if (child && typeof child === 'object') stack.push(child);
      }
      for (const path of paths) {
        if (pathPresentAt(current, path.parts)) return path.field;
      }
    }
    return '';
  }

  function pathPresentAt(value, pathParts) {
    let current = value;
    for (const part of pathParts) {
      if (
        !current ||
        typeof current !== 'object' ||
        !Object.prototype.hasOwnProperty.call(current, part)
      ) {
        return false;
      }
      current = current[part];
    }
    return true;
  }

  function forbiddenFieldPresent(value, forbidden) {
    return firstForbiddenField(value, forbidden ? [forbidden] : []) === forbidden;
  }

  function validatePhaseEnvelope(envelope, phaseNumber) {
    return assertPhaseEnvelope(envelope, phaseNumber, `Phase ${phaseNumber} validator`);
  }

  const validatePhase1RuntimeReady = (envelope) => validatePhaseEnvelope(envelope, 1);
  const validatePhase2LanguageGraph = (envelope) => validatePhaseEnvelope(envelope, 2);
  const validatePhase3RetrievalRerank = (envelope) => validatePhaseEnvelope(envelope, 3);
  const validatePhase4GroundedIntent = (envelope) => validatePhaseEnvelope(envelope, 4);
  const validatePhase5SimulationCompile = (envelope) => validatePhaseEnvelope(envelope, 5);
  const validatePhase6VisualCompile = (envelope) => validatePhaseEnvelope(envelope, 6);
  const validatePhase7RenderExecution = (envelope) => validatePhaseEnvelope(envelope, 7);
  const validatePhase8SceneProof = (envelope) => validatePhaseEnvelope(envelope, 8);

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
    phaseOutputSchema,
    createPhaseEnvelope,
    assertPhaseEnvelope,
    forbiddenFieldPresent,
    dottedPathPresent: (value, pathParts) => forbiddenFieldPresent(value, (pathParts || []).join('.')),
    fieldNamePresent: forbiddenFieldPresent,
    validatePhaseEnvelope,
    validatePhase1RuntimeReady,
    validatePhase2LanguageGraph,
    validatePhase3RetrievalRerank,
    validatePhase4GroundedIntent,
    validatePhase5SimulationCompile,
    validatePhase6VisualCompile,
    validatePhase7RenderExecution,
    validatePhase8SceneProof,
  });
});
