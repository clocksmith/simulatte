(function attachSimulattePhaseContracts(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulattePhaseContracts = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createPhaseContractsApi() {
  const PHASE_ZERO_INPUT_SCHEMA = 'simulatte.phase0.input.v1';
  const BOUND_OUTPUT_SCHEMAS = Object.freeze(Object.fromEntries(
    Array.from({ length: 8 }, (_, index) => [index + 1, `simulatte.phase${index + 1}.output.v3`])
  ));
  const PHASE_LABELS = Object.freeze([
    'Runtime', 'Language', 'Retrieval', 'Grounding',
    'Simulation', 'Visuals', 'Render', 'Proof',
  ]);
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
      label: PHASE_LABELS[number - 1],
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
    const bound = envelope && envelope.schema === BOUND_OUTPUT_SCHEMAS[phaseId];
    if (!envelope || (!bound && envelope.schema !== expected) || Number(envelope.phase) !== phaseId) {
      const received = envelope && envelope.schema ? envelope.schema : typeof envelope;
      throw new Error(`${label} expected ${expected}, received ${received}`);
    }
    const contract = PHASE_CONTRACTS[phaseId];
    const expectedInput = bound && phaseId > 1 ? BOUND_OUTPUT_SCHEMAS[phaseId - 1] : contract?.inputSchema;
    if (contract && envelope.inputSchema !== expectedInput) {
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
    if (bound) {
      assertBinding(envelope.binding);
      canonicalJson(envelope);
    }
    return envelope;
  }

  // Only snapshots constructed here can share validated descendants or digest work.
  // Freezing a caller's object does not establish serializability or deep immutability.
  const ownedSnapshots = new WeakSet();
  const snapshotDigests = new WeakMap();
  const RENDER_PROOF_RECEIPTS = Object.freeze(['intentReceipt', 'semanticReceipt', 'compilerDeterminismReceipt',
    'simulationReproducibilityReceipt', 'safetyReceipt', 'replayBaseline']);

  function canonicalJson(value) {
    if ('toJSON' in Object.prototype || 'toJSON' in Array.prototype) throw new Error('Inherited serialization hooks are not permitted');
    return JSON.stringify(immutableArtifact(value));
  }

  function immutableArtifact(value) {
    const active = new WeakSet();
    const copied = new WeakMap();
    function visit(current, path) {
      if (current === null || typeof current === 'boolean' || typeof current === 'string') return current;
      if (typeof current === 'number' && Number.isFinite(current)) return current === 0 ? 0 : current;
      if (!current || typeof current !== 'object') throw new Error(`${path}: expected serializable finite value`);
      if (ownedSnapshots.has(current)) return current;
      if (copied.has(current)) return copied.get(current);
      if (active.has(current)) throw new Error(`${path}: cyclic artifact`);
      const prototype = Object.getPrototypeOf(current);
      if (!Array.isArray(current) && prototype !== Object.prototype && prototype !== null) {
        throw new Error(`${path}: runtime handle is not a serializable artifact`);
      }
      if (Object.getOwnPropertySymbols(current).length) throw new Error(`${path}: symbol field is not serializable`);
      active.add(current);
      const result = Array.isArray(current) ? [] : {};
      const keys = Array.isArray(current) ? Array.from({ length: current.length }, (_, i) => String(i)) : Object.keys(current).sort();
      const permittedKeys = new Set(Array.isArray(current) ? [...keys, 'length'] : keys);
      if (Object.getOwnPropertyNames(current).some(key => !permittedKeys.has(key))) {
        throw new Error(`${path}: hidden or extra field is not serializable`);
      }
      for (const key of keys) {
        const descriptor = Object.getOwnPropertyDescriptor(current, key);
        if (!descriptor || !Object.hasOwn(descriptor, 'value')) throw new Error(`${path}.${key}: missing value or accessor`);
        Object.defineProperty(result, key, { value: visit(descriptor.value, `${path}.${key}`), enumerable: true,
          writable: true, configurable: true });
      }
      active.delete(current);
      Object.freeze(result);
      ownedSnapshots.add(result);
      copied.set(current, result);
      return result;
    }
    return visit(value, '$');
  }

  async function artifactDigest(value) {
    const snapshot = immutableArtifact(value);
    const cacheable = snapshot !== null && typeof snapshot === 'object';
    if (cacheable && snapshotDigests.has(snapshot)) return snapshotDigests.get(snapshot);
    const bytes = new TextEncoder().encode(canonicalJson(snapshot));
    const pending = globalThis.crypto.subtle.digest('SHA-256', bytes).then(hash =>
      `sha256:${Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('')}`);
    if (cacheable) snapshotDigests.set(snapshot, pending);
    try { return await pending; }
    catch (error) { if (cacheable) snapshotDigests.delete(snapshot); throw error; }
  }

  function requireDigest(value, label) {
    if (!/^sha256:[a-f0-9]{64}$/.test(value || '')) throw new Error(`${label}: expected SHA-256 identity`);
  }

  function assertBinding(binding) {
    if (!binding || !['simulatte.phaseBinding.v1', 'simulatte.phaseBinding.v2'].includes(binding.schema)) throw new Error('Missing phase binding');
    for (const key of ['predecessorDigest', 'invocationDigest', 'artifactDigest', 'dependencyDigest', 'producerDigest']) {
      requireDigest(binding[key], key);
    }
    if (binding.schema === 'simulatte.phaseBinding.v2') requireDigest(binding.envelopeDigest, 'envelopeDigest');
    if (!Number.isSafeInteger(binding.revision) || binding.revision < 1) throw new Error('Invalid run revision');
    validateProducer(binding.producer);
    validateDependencies(binding.dependencies);
  }

  function validateProducer(producer) {
    if (!producer || typeof producer.id !== 'string' || !producer.id.trim()) throw new Error('Missing phase producer');
    requireDigest(producer.buildDigest, 'producer.buildDigest');
    canonicalJson(producer);
  }

  function validateDependencies(dependencies) {
    if (!Array.isArray(dependencies)) throw new Error('Missing dependency descriptors');
    const ids = new Set();
    for (const dependency of dependencies) {
      if (!dependency || typeof dependency.id !== 'string' || !dependency.id || ids.has(dependency.id)) throw new Error('Invalid or duplicate dependency ID');
      ids.add(dependency.id);
      requireDigest(dependency.contentDigest, `dependency ${dependency.id}`);
      if (!Array.isArray(dependency.capabilities) || dependency.capabilities.some(value => typeof value !== 'string' || !value)) {
        throw new Error(`Invalid dependency capabilities: ${dependency.id}`);
      }
    }
    canonicalJson(dependencies);
  }

  function validateInvocation(phaseNumber, invocation) {
    if (!invocation || typeof invocation !== 'object' || Array.isArray(invocation)) throw new Error('Invocation must be an object');
    const allowed = phaseNumber === 7 ? ['simulationSnapshot', 'frame', 'viewport'] : [];
    if (Object.keys(invocation).some(key => !allowed.includes(key))) throw new Error(`Phase ${phaseNumber}: undeclared invocation input`);
    if (phaseNumber === 7) {
      for (const key of allowed) if (!invocation[key] || typeof invocation[key] !== 'object' || Array.isArray(invocation[key])) throw new Error(`Phase 7 invocation requires ${key}`);
      const keys = (value, permitted, label) => {
        if (Object.keys(value).some(key => !permitted.includes(key))) throw new Error(`Undeclared ${label} field`);
      };
      keys(invocation.frame, ['index', 'simulationTime'], 'frame');
      keys(invocation.viewport, ['width', 'height'], 'viewport');
      const snapshot = invocation.simulationSnapshot;
      if (Object.hasOwn(snapshot, 'schema')) {
        if (!['simulatte.renderSimulationSnapshot.v1', 'simulatte.renderSimulationSnapshot.v2'].includes(snapshot.schema)) throw new Error('Unsupported render simulation snapshot schema');
        const extended = snapshot.schema === 'simulatte.renderSimulationSnapshot.v2';
        keys(snapshot, ['schema', 'state', 'worldProofBinding', 'phase6Digest', 'contentDigest', ...(extended ? ['proofReceipts'] : [])], 'simulation snapshot');
        if (extended) {
          const receipts = snapshot.proofReceipts;
          if (!receipts || typeof receipts !== 'object' || Array.isArray(receipts)) throw new Error('Simulation snapshot requires declared proof receipts');
          keys(receipts, RENDER_PROOF_RECEIPTS, 'proof receipts');
          for (const name of RENDER_PROOF_RECEIPTS) {
            if (!Object.hasOwn(receipts, name) || (receipts[name] !== null && (typeof receipts[name] !== 'object' || Array.isArray(receipts[name])))) {
              throw new Error(`Invalid simulation snapshot ${name}`);
            }
          }
        }
        if (!snapshot.state || typeof snapshot.state !== 'object' || Array.isArray(snapshot.state)) throw new Error('Simulation snapshot requires state');
        if (!snapshot.worldProofBinding || typeof snapshot.worldProofBinding !== 'object' || Array.isArray(snapshot.worldProofBinding)) throw new Error('Simulation snapshot requires WorldSpec binding');
        for (const key of ['phase6Digest', 'contentDigest']) {
          if (!/^sha256:[a-f0-9]{64}$/.test(snapshot[key] || '')) throw new Error(`Invalid simulation snapshot ${key}`);
        }
      }
      const forbidden = firstForbiddenField(snapshot, PHASE_CONTRACTS[7].forbiddenUpstreamReads);
      if (forbidden) throw new Error(`Phase 7 invocation contains forbidden upstream field ${forbidden}`);
      for (const key of ['width', 'height']) {
        if (!Number.isSafeInteger(invocation.viewport[key]) || invocation.viewport[key] < 1) throw new Error(`Invalid viewport ${key}`);
      }
      if (!Number.isSafeInteger(invocation.frame.index) || invocation.frame.index < 0) throw new Error('Invalid frame index');
      if (!Number.isFinite(invocation.frame.simulationTime) || invocation.frame.simulationTime < 0) throw new Error('Invalid simulation time');
    }
    canonicalJson(invocation);
    return invocation;
  }

  function createRequestEnvelope({ request, configuration, authoredInputs, retryPolicy }) {
    if (!request || typeof request.text !== 'string' || !['prompt', 'world-spec'].includes(request.kind)) throw new Error('Invalid request ingress');
    if (!configuration || typeof configuration !== 'object' || Array.isArray(configuration)) throw new Error('Request configuration required');
    if (!Array.isArray(authoredInputs)) throw new Error('Authored input references required');
    for (const reference of authoredInputs) requireDigest(reference.contentDigest, 'authored input');
    if (request.kind === 'world-spec' && !authoredInputs.length) throw new Error('WorldSpec ingress requires an authored input');
    if (retryPolicy !== null && (!retryPolicy || typeof retryPolicy.id !== 'string' || !Number.isSafeInteger(retryPolicy.attempt) || retryPolicy.attempt < 1)) {
      throw new Error('Explicit versioned retry policy or null required');
    }
    return immutableArtifact({ schema: PHASE_ZERO_INPUT_SCHEMA, request, configuration, authoredInputs, retryPolicy });
  }

  async function bindPhaseOutput(output, call, { producer, dependencies, revision }) {
    output = immutableArtifact(output);
    call = immutableArtifact(call);
    producer = immutableArtifact(producer);
    dependencies = immutableArtifact(dependencies);
    assertPhaseEnvelope(output, output.phase);
    validateInvocation(output.phase, call.invocation);
    if (output.phase === 1) {
      if (call.previous?.schema !== PHASE_ZERO_INPUT_SCHEMA) throw new Error('Phase 1 requires request ingress');
    } else {
      assertPhaseEnvelope(call.previous, output.phase - 1, 'Bound predecessor');
      if (call.previous.schema !== BOUND_OUTPUT_SCHEMAS[output.phase - 1]) throw new Error('Bound predecessor required');
    }
    const artifact = immutableArtifact(output.artifact);
    const { binding: _previousBinding, ...payload } = { ...output, schema: BOUND_OUTPUT_SCHEMAS[output.phase],
      inputSchema: call.previous.schema, artifact };
    const binding = {
      schema: 'simulatte.phaseBinding.v2', revision,
      producer: immutableArtifact(producer), dependencies: immutableArtifact(dependencies),
      predecessorDigest: await artifactDigest(call.previous),
      invocationDigest: await artifactDigest(call.invocation),
      artifactDigest: await artifactDigest(artifact),
      dependencyDigest: await artifactDigest(dependencies),
      producerDigest: await artifactDigest(producer),
      envelopeDigest: await artifactDigest(payload),
    };
    assertBinding(binding);
    return immutableArtifact({ ...payload, binding });
  }

  async function validateBoundOutput(output, call, expected) {
    output = immutableArtifact(output);
    call = immutableArtifact(call);
    expected = immutableArtifact(expected);
    assertPhaseEnvelope(output, output.phase);
    if (output.schema !== BOUND_OUTPUT_SCHEMAS[output.phase]) throw new Error('Bound output required');
    const { binding } = output;
    if (binding.schema !== 'simulatte.phaseBinding.v2') throw new Error('Complete envelope integrity requires a v2 binding; legacy artifacts need an explicit rebind');
    const { binding: _binding, ...payload } = output;
    validateInvocation(output.phase, call.invocation);
    const actual = {
      predecessorDigest: await artifactDigest(call.previous), invocationDigest: await artifactDigest(call.invocation),
      artifactDigest: await artifactDigest(output.artifact), dependencyDigest: await artifactDigest(expected.dependencies),
      producerDigest: await artifactDigest(expected.producer),
      envelopeDigest: await artifactDigest(payload),
    };
    for (const [key, value] of Object.entries(actual)) if (binding[key] !== value) throw new Error(`Phase ${output.phase}: ${key} mismatch`);
    if (await artifactDigest(binding.dependencies) !== binding.dependencyDigest) throw new Error('Dependency descriptors mutated');
    if (await artifactDigest(binding.producer) !== binding.producerDigest) throw new Error('Producer identity mutated');
    if (binding.revision !== expected.revision) throw new Error('Stale phase revision');
    if (output.inputSchema !== call.previous.schema || output.phase !== (call.previous.phase || 0) + 1) throw new Error('Wrong predecessor phase');
    return output;
  }

  function legacyPhaseProjection(envelope) {
    assertPhaseEnvelope(envelope, envelope.phase, 'Compatibility phase input');
    const { binding: _binding, ...legacy } = envelope;
    return immutableArtifact({ ...legacy, schema: phaseOutputSchema(envelope.phase),
      inputSchema: envelope.phase === 1 ? PHASE_ZERO_INPUT_SCHEMA : phaseOutputSchema(envelope.phase - 1) });
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
    PHASE_LABELS,
    PHASE_ZERO_INPUT_SCHEMA,
    BOUND_OUTPUT_SCHEMAS,
    canonicalJson,
    immutableArtifact,
    RENDER_PROOF_RECEIPTS,
    artifactDigest,
    createRequestEnvelope,
    validateInvocation,
    validateDependencies,
    validateProducer,
    bindPhaseOutput,
    validateBoundOutput,
    legacyPhaseProjection,
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
