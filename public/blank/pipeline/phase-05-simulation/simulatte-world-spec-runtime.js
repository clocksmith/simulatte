(function attachSimulatteWorldSpecRuntime(root) {
  const registry = typeof module === 'object' && module.exports
    ? require('../../app/runtime/phase-module-registry.js')
    : root.SimulattePhaseModuleRegistry;
  const scope = registry.family('physicsModel');

  function serializeSpec(spec) {
    return scope.worldSpec.serializeWorldSpec(scope.normalizeSpec(spec));
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
    const currentPhase4 = current.phaseArtifacts && current.phaseArtifacts.phase4;
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
        phase1: current.phaseArtifacts.phase1,
        phase2: current.phaseArtifacts.phase2,
        phase3: current.phaseArtifacts.phase3,
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
    deserializeSpec,
    recordWorldSpecEdit,
    applyWorldSpecEdit,
  });
})(typeof globalThis !== 'undefined' ? globalThis : window);
