(function attachSimulatteWorldSpecRuntime(root) {
  const registry = typeof module === 'object' && module.exports
    ? require('../../app/runtime/phase-module-registry.js')
    : root.SimulattePhaseModuleRegistry;
  const scope = registry.family('physicsModel');

  function serializeSpec(spec) {
    return scope.worldSpec.serializeWorldSpec(scope.normalizeSpec(spec));
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
    return scope.createSpec(templateId, {
      ...descriptor,
      intent: { ...candidate.intent, universeGraph: grounded.acceptedGraph,
        phaseArtifacts: scope.phaseArtifactSet(phaseArtifacts.phase1, phaseArtifacts.phase2, phaseArtifacts.phase3, phaseArtifacts.phase4) },
      promptParse: phaseArtifacts.phase2.artifact.promptParse,
      universeGraph: grounded.acceptedGraph,
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
    serializeSpec,
    projectWorldSpec,
    deserializeSpec,
    recordWorldSpecEdit,
    applyWorldSpecEdit,
    compileWorldSpecEdits,
  });
})(typeof globalThis !== 'undefined' ? globalThis : window);
