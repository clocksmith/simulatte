(function attachSimulatteWorldSpecRuntime(root) {
  const registry = typeof module === 'object' && module.exports
    ? require('../../app/runtime/phase-module-registry.js')
    : root.SimulattePhaseModuleRegistry;
  const scope = registry.family('physicsModel');

  async function createAuthoredPhaseResources(inputSpec, configuration = { deterministicRuntime: true }, { recompile = false } = {}) {
    const contracts = scope.phaseContracts;
    const spec = contracts.immutableArtifact(inputSpec);
    const options = contracts.immutableArtifact(configuration);
    scope.worldSpec.validateWorldSpec(spec);
    scope.worldSpec.compilerBaselineContentHash(spec);
    if (!recompile) {
      const projected = projectWorldSpec(spec.phaseArtifacts);
      if (projected.contentHash !== spec.contentHash) throw new Error('Authored WorldSpec contradicts its accepted phase artifacts');
    }
    const worldSpecDigest = await contracts.artifactDigest(spec);
    const resources = {};
    const sourceDigests = {};
    let predecessorSourceDigest = null;
    for (let phase = 1; phase <= 6; phase++) {
      const output = spec.phaseArtifacts[`phase${phase}`];
      const sourceArtifactDigest = await contracts.artifactDigest(output);
      const source = contracts.immutableArtifact({ schema: 'simulatte.authoredPhaseSource.v2', phase,
        mode: recompile ? 'authored-edit' : 'replay', authoring: recompile && phase === 4 ? spec : null,
        worldSpecDigest, predecessorSourceDigest, sourceArtifactDigest, output });
      const id = `authored-phase-${phase}`;
      const contentDigest = await contracts.artifactDigest(source);
      sourceDigests[id] = contentDigest;
      resources[id] = { descriptor: { id, kind: 'artifact', contentDigest,
        residentBytes: new TextEncoder().encode(contracts.canonicalJson(source)).byteLength,
        capabilities: ['authored-phase-replay'] }, handle: source };
      predecessorSourceDigest = sourceArtifactDigest;
    }
    resources['compiler-options'] = { descriptor: { id: 'compiler-options', kind: 'artifact',
      contentDigest: await contracts.artifactDigest(options),
      residentBytes: new TextEncoder().encode(contracts.canonicalJson(options)).byteLength,
      capabilities: ['authored-runtime-qualification'] }, handle: options };
    const request = contracts.createRequestEnvelope({
      request: { kind: 'world-spec', text: spec.source.prompt || '' }, configuration: options,
      authoredInputs: [{ id: 'authored-world-spec', contentDigest: worldSpecDigest, sourceDigests }], retryPolicy: null,
    });
    return Object.freeze({ worldSpec: spec, request, recompile, resources: Object.freeze(resources) });
  }

  async function runAuthoredPhase(phase, call, resources) {
    const contracts = scope.phaseContracts;
    const source = resources[`authored-phase-${phase}`];
    if (!source || !['simulatte.authoredPhaseSource.v1', 'simulatte.authoredPhaseSource.v2'].includes(source.schema) || source.phase !== phase) {
      throw new Error(`Authored Phase ${phase} requires its admitted source`);
    }
    const mode = source.schema === 'simulatte.authoredPhaseSource.v1' ? 'replay' : source.mode;
    if (!['replay', 'authored-edit'].includes(mode) ||
        (source.schema === 'simulatte.authoredPhaseSource.v2' && Boolean(source.authoring) !== (mode === 'authored-edit' && phase === 4))) {
      throw new Error('Authored phase source mode or authoring resource is invalid');
    }
    contracts.assertPhaseEnvelope(source.output, phase, 'Authored phase source');
    if (await contracts.artifactDigest(source.output) !== source.sourceArtifactDigest) throw new Error('Authored phase source artifact digest mismatch');
    const prior = phase === 1 ? null : call.previous.receipts.find(row => row.id === 'authored-phase-replay');
    const reference = phase === 1 ? call.previous.authoredInputs[0] : prior?.authoredInput;
    if (!reference || reference.id !== 'authored-world-spec' || reference.contentDigest !== source.worldSpecDigest ||
        reference.sourceDigests?.[`authored-phase-${phase}`] !== await contracts.artifactDigest(source)) {
      throw new Error('Authored phase source does not match request provenance');
    }
    if (phase === 1 ? source.predecessorSourceDigest !== null : prior?.sourceArtifactDigest !== source.predecessorSourceDigest) {
      throw new Error('Authored phase source does not follow its declared predecessor');
    }
    if (phase > 1 && (prior.sourceMode || 'replay') !== mode) throw new Error('Authored phase source mode changed within the request');
    let output;
    if (phase === 1) {
      if (call.previous.request.text !== source.output.artifact.promptIngress.sourceText) throw new Error('Authored request prompt provenance mismatch');
      output = scope.runPhase1RuntimeGate(call.previous.request.text, resources['compiler-options']);
    } else if (mode === 'authored-edit' && phase >= 4) {
      const previous = contracts.legacyPhaseProjection(call.previous);
      if (phase === 4) {
        scope.worldSpec.validateWorldSpec(source.authoring);
        if (await contracts.artifactDigest(source.authoring) !== source.worldSpecDigest) throw new Error('Authored edit program digest mismatch');
        output = scope.createUserOverridePhase4(contracts.legacyPhaseProjection(source.output), source.authoring,
          { intentRequirements: previous.artifact.intentRequirements });
        output = { ...output, runtimeReceiptId: call.previous.runtimeReceiptId,
          artifact: { ...output.artifact, runtimeContext: previous.artifact.runtimeContext } };
      } else output = phase === 5 ? scope.runPhase5SimulationCompile(previous) : scope.runPhase6VisualCompile(previous);
    } else {
      const compatible = contracts.legacyPhaseProjection(source.output);
      const artifact = { ...compatible.artifact };
      if (Object.hasOwn(artifact, 'runtimeContext')) artifact.runtimeContext = call.previous.artifact.runtimeContext;
      output = { ...compatible, runtimeReceiptId: call.previous.runtimeReceiptId, artifact };
    }
    return contracts.immutableArtifact({ ...output, receipts: [...output.receipts.filter(row => row.id !== 'authored-phase-replay'), {
      id: 'authored-phase-replay', schema: 'simulatte.phaseReceipt.v1', phase, sourceMode: mode,
      mode: phase === 1 ? 'runtime-requalification' : mode === 'authored-edit' && phase >= 4 ? 'authored-recompile' : 'authored-artifact-replay',
      interpreted: false, authoredInput: reference, sourceArtifactDigest: source.sourceArtifactDigest,
    }] });
  }

  async function createRenderInvocation(spec, simulationState, frame, viewport, options = {}) {
    // WorldSpec assembly owns this binding. Only its evidence projection crosses
    // the render boundary; the renderer cannot reopen the authored program.
    const contracts = scope.phaseContracts;
    spec = contracts.immutableArtifact(spec);
    const worldProofBinding = scope.worldProof.createWorldProofBinding(spec, options);
    if (!worldProofBinding) throw new Error('Render invocation requires an authored WorldSpec binding');
    const phase6 = contracts.immutableArtifact(options.phase6Output || spec.phaseArtifacts.phase6);
    contracts.assertPhaseEnvelope(phase6, 6, 'Render invocation predecessor');
    const captured = contracts.immutableArtifact({ state: simulationState,
      worldProofBinding, frame, viewport });
    if (contracts.canonicalJson(spec.renderProgram.sceneRenderPacket) !==
        contracts.canonicalJson(phase6.artifact.visualCompile.sceneRenderPacket)) {
      throw new Error('WorldSpec render program contradicts its Phase 6 artifact');
    }
    if (options.phase6Output) {
      const replay = phase6.receipts.find(row => row.id === 'authored-phase-replay');
      if (!replay || replay.authoredInput.contentDigest !== await contracts.artifactDigest(spec) ||
          replay.sourceArtifactDigest !== await contracts.artifactDigest(spec.phaseArtifacts.phase6)) {
        throw new Error('Render predecessor is not bound to the authored WorldSpec');
      }
    }
    const snapshot = contracts.immutableArtifact({ schema: 'simulatte.renderSimulationSnapshot.v1',
      state: captured.state, worldProofBinding: captured.worldProofBinding,
      phase6Digest: await contracts.artifactDigest(phase6) });
    const invocation = contracts.immutableArtifact({ simulationSnapshot: {
      ...snapshot, contentDigest: await contracts.artifactDigest(snapshot),
    }, frame: captured.frame, viewport: captured.viewport });
    contracts.validateInvocation(7, invocation);
    return invocation;
  }

  function serializeSpec(spec, options = {}) {
    const normalized = scope.normalizeSpec(spec);
    const serialized = scope.worldSpec.serializeWorldSpec(normalized);
    if (options.retainPhaseSources !== true) return serialized;
    const projected = projectWorldSpec(normalized.phaseArtifacts);
    if (projected.contentHash !== normalized.contentHash) throw new Error('WorldSpec export contradicts its accepted phase artifacts');
    const phaseArtifacts = Object.fromEntries(Array.from({ length: 6 }, (_, index) =>
      [`phase${index + 1}`, normalized.phaseArtifacts[`phase${index + 1}`]]));
    return scope.phaseContracts.canonicalJson({ ...JSON.parse(serialized), phaseArtifacts });
  }

  function projectWorldSpec(phaseArtifacts) {
    const first = phaseArtifacts && phaseArtifacts.phase1;
    for (let phase = 1; phase <= 6; phase += 1) {
      const current = scope.assertPhaseEnvelope(phaseArtifacts && phaseArtifacts[`phase${phase}`], phase, 'WorldSpec projection');
      if (current.runtimeReceiptId !== first.runtimeReceiptId ||
          current.artifact.compositionLedger?.sourcePromptHash !== first.artifact.compositionLedger?.sourcePromptHash ||
          current.binding?.revision !== first.binding?.revision ||
          current.binding?.producerDigest !== first.binding?.producerDigest) {
        throw new Error(`WorldSpec projection Phase ${phase} belongs to another request or revision`);
      }
    }
    const grounded = phaseArtifacts.phase4.artifact.groundedIntent;
    const input = grounded.worldSpecInput;
    const compilerConfig = grounded.worldSpecCompilerConfig;
    const candidate = phaseArtifacts.phase3.artifact.retrievalRerankResult.worldSpecCandidate;
    const simulation = phaseArtifacts.phase5.artifact.simulationCompile;
    const visualCompile = phaseArtifacts.phase6.artifact.visualCompile;
    const visual = visualCompile.worldSpecProjection;
    if (input?.schema !== 'simulatte.worldSpecInput.v1' || !compilerConfig ||
        candidate?.schema !== 'simulatte.worldSpecCandidate.v1' ||
        visual?.schema !== 'simulatte.worldSpecVisualProjection.v1') {
      throw new Error('WorldSpec projection requires accepted authoring and visual artifacts');
    }
    scope.validateWorldSpecInput(input);
    const { schema, templateId, ...descriptor } = input;
    const authoring = grounded.worldSpecAuthoring || null;
    const authoredFields = ['source', 'authorship', 'determinism', 'dependencies', 'safety',
      'unsupportedRequirements', 'unresolvedAmbiguities', 'createdAt', 'remixOf', 'universeGraph'];
    if (authoring && (authoring.schema !== 'simulatte.worldSpecAuthoringProjection.v1' ||
        Object.keys(authoring).some(key => key !== 'schema' && !authoredFields.includes(key)) ||
        authoredFields.some(key => !Object.hasOwn(authoring, key)))) {
      throw new Error('WorldSpec projection requires complete declared authoring metadata');
    }
    const authored = authoring ? Object.fromEntries(authoredFields.map(key => [key, authoring[key]])) : {};
    return scope.createSpec(templateId, {
      ...descriptor,
      ...authored,
      intent: { ...candidate.intent, universeGraph: grounded.acceptedGraph,
        phaseArtifacts: scope.phaseArtifactSet(phaseArtifacts.phase1, phaseArtifacts.phase2, phaseArtifacts.phase3, phaseArtifacts.phase4) },
      promptParse: phaseArtifacts.phase2.artifact.promptParse,
      universeGraph: authored.universeGraph || grounded.acceptedGraph,
      physicsIR: simulation.physicsIR,
      validationReceipt: simulation.validationReceipt,
      solverGraph: simulation.solverGraph,
      renderIR: simulation.renderIR,
      interactionIR: simulation.interactionIR,
      compositionGraph: visual.compositionGraph,
      renderProgram: { ...visual.renderProgramFields, visualIR: visualCompile.visualIR,
        sceneRenderPacket: visualCompile.sceneRenderPacket, rendererPlan: visualCompile.rendererPlan },
      phaseArtifacts,
      compilerConfig,
      preserveCompiledWorldSpec: true,
    });
  }

  function deserializeSpec(text) {
    const parsed = scope.worldSpec.parseWorldSpec(text);
    if (parsed.schema !== scope.worldSpec.WORLD_SPEC_SCHEMA) return scope.normalizeSpec(parsed);
    return scope.hydrateImportedWorldSpec(parsed);
  }

  function recordWorldSpecEdit(inputSpec, input, options = {}) {
    const current = scope.normalizeSpec(inputSpec);
    const edited = scope.worldSpec.prepareUserEdit(current, input, options);
    return scope.acceptNormalizedWorldSpec(edited);
  }

  function applyWorldSpecEdit(inputSpec, input, options = {}) {
    const current = scope.normalizeSpec(inputSpec);
    const edited = scope.worldSpec.prepareUserEdit(current, input, options);
    return compileWorldSpecEdits(edited, options);
  }

  function compileWorldSpecEdits(edited, options = {}) {
    scope.worldSpec.validateWorldSpec(edited);
    if (edited.authorship.revision === 0) return scope.acceptNormalizedWorldSpec(edited);
    const currentPhase4 = edited.phaseArtifacts && edited.phaseArtifacts.phase4;
    if (!currentPhase4) throw new Error('WorldSpec edit requires the compiled Phase 4 artifact');
    const userOverridePhase4 = scope.createUserOverridePhase4(currentPhase4, edited);
    const intent = edited.intent && typeof edited.intent === 'object'
      ? {
        ...edited.intent,
        prompt: edited.source.prompt,
        components: edited.objects,
        universeGraph: edited.universeGraph,
        phaseArtifacts: null,
        resolution: {
          ...(edited.intent.resolution || {}),
          contract: edited.contract,
        },
      }
      : null;
    return scope.createSpec(edited.templateId, {
      id: edited.id,
      name: edited.name,
      description: edited.description,
      modules: edited.modules,
      objects: edited.objects,
      controls: edited.controls,
      params: edited.params,
      intent,
      contract: edited.contract,
      universeGraph: edited.universeGraph,
      phaseArtifacts: {
        phase1: edited.phaseArtifacts.phase1,
        phase2: edited.phaseArtifacts.phase2,
        phase3: edited.phaseArtifacts.phase3,
        phase4: userOverridePhase4,
      },
      createdAt: edited.createdAt,
      remixOf: edited.remixOf,
      source: edited.source,
      authorship: edited.authorship,
      determinism: edited.determinism,
      dependencies: edited.dependencies,
      safety: edited.safety,
      unsupportedRequirements: edited.unsupportedRequirements,
      unresolvedAmbiguities: edited.unresolvedAmbiguities,
      compilerConfig: edited.source.compilerConfig,
      onPhaseProgress: options.onPhaseProgress,
    });
  }

  registry.define('physicsModel', 'simulatte-world-spec-runtime.js', {
    createAuthoredPhaseResources,
    runAuthoredPhase,
    createRenderInvocation,
    serializeSpec,
    projectWorldSpec,
    deserializeSpec,
    recordWorldSpecEdit,
    applyWorldSpecEdit,
    compileWorldSpecEdits,
  });
})(typeof globalThis !== 'undefined' ? globalThis : window);
