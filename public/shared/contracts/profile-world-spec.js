(function attachSimulatteProfileWorldSpec(root, factory) {
  const worldSpec = typeof module === 'object' && module.exports
    ? require('./world-spec.js')
    : root.SimulatteWorldSpec;
  const intentProof = typeof module === 'object' && module.exports
    ? require('./world-proof-intent.js')
    : root.SimulatteWorldProofIntent;
  const semanticProof = typeof module === 'object' && module.exports
    ? require('./world-proof-semantic.js')
    : root.SimulatteWorldProofSemantic;
  if (!worldSpec || !intentProof || !semanticProof) {
    throw new Error('SimulatteProfileWorldSpec requires WorldSpec, intent proof, and semantic proof contracts');
  }
  const api = factory(worldSpec, intentProof, semanticProof);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteProfileWorldSpec = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createProfileWorldSpecApi(
  worldSpec,
  intentProof,
  semanticProof
) {
  const TEMPLATE_ID = 'simulatte.profile-conformance.v1';
  const COMPILER_LANE = 'simulatte.profile-pack-compiler.v1';
  const RECEIPT_SCHEMA = 'simulatte.profileWorldSpecConformanceReceipt.v1';
  const PROFILE_EXECUTION_ROOTS = Object.freeze([
    'schema',
    'schemaVersion',
    'id',
    'templateId',
    'name',
    'kind',
    'description',
    'modules',
    'objects',
    'controls',
    'params',
    'contract',
    'source',
    'universeGraph',
    'physicsIR',
    'solverGraph',
    'renderIR',
    'validationReceipt',
    'phaseArtifacts',
    'determinism',
    'dependencies',
    'safety',
    'unsupportedRequirements',
    'unresolvedAmbiguities',
  ]);

  class ProfileWorldSpecError extends Error {
    constructor(code, message, evidence = null) {
      super(`${code}: ${message}`);
      this.name = 'SimulatteProfileWorldSpecError';
      this.code = code;
      this.evidence = evidence;
    }
  }

  function compileProfileWorldSpec({ profile, scenario = null, pluginManifests = [] } = {}) {
    assertObject(profile, 'profile_world_spec_profile_missing', 'Profile compilation requires an application profile');
    const selectedScenario = selectScenario(profile, scenario);
    const manifests = selectedManifests(profile, pluginManifests);
    const profileHash = valueHash(profile);
    const scenarioHash = valueHash(selectedScenario);
    const pluginDependencies = manifests.map(({ selection, manifest }) => ({
      id: manifest.id,
      version: manifest.version,
      configId: selection.configId,
      contentHash: manifest.entry && manifest.entry.integrity || valueHash(manifest),
    }));
    const governedIntent = compileGovernedIntent({
      profile,
      scenario: selectedScenario,
      plugins: pluginDependencies,
      profileHash,
      scenarioHash,
    });
    const prompt = governedIntent.prompt;
    const sourceIds = [
      {
        id: governedIntent.sourceId,
        authority: 'governedPack',
        label: 'Governed profile brief',
      },
      { id: 'source:compiler', authority: 'compilerInference', label: 'Profile pack compiler' },
      { id: `source:profile:${profile.id}`, authority: 'governedPack', label: `Application profile ${profile.id}` },
      { id: `source:scenario:${selectedScenario.id}`, authority: 'governedPack', label: `Scenario ${selectedScenario.id}` },
      ...pluginDependencies.map((plugin) => ({
        id: `source:plugin:${plugin.id}`,
        authority: 'plugin',
        label: `Plugin ${plugin.id}@${plugin.version}`,
      })),
    ];
    const profileNodeId = `profile:${profile.id}`;
    const scenarioNodeId = `scenario:${selectedScenario.id}`;
    const raw = {
      id: `world-spec:${profile.id}:${selectedScenario.id}`,
      templateId: TEMPLATE_ID,
      name: selectedScenario.label || profile.id,
      kind: 'governed-profile',
      description: selectedScenario.description || prompt,
      modules: pluginDependencies.map((plugin) => ({
        id: `module:${plugin.id}`,
        kind: 'plugin',
        pluginId: plugin.id,
        configId: plugin.configId,
        version: plugin.version,
      })),
      objects: [
        {
          id: profileNodeId,
          kind: 'governed-profile',
          profileId: profile.id,
          tier: profile.tier || 'city',
          worldModelId: profile.worldModelId || 'simulatte-city-runtime',
        },
        {
          id: scenarioNodeId,
          kind: 'scenario',
          scenarioId: selectedScenario.id,
          seed: selectedScenario.seed,
        },
      ],
      controls: (profile.plugins || []).map((selection) => ({
        id: `control:${selection.id}`,
        kind: 'plugin-controls',
        pluginId: selection.id,
        configId: selection.configId,
      })),
      params: {
        profileId: profile.id,
        scenarioId: selectedScenario.id,
        scenarioSeed: selectedScenario.seed,
        tier: profile.tier || 'city',
        worldModelId: profile.worldModelId || 'simulatte-city-runtime',
        routeObjective: canonicalValue(profile.routeObjective || {}),
        comparisonMode: profile.experience && profile.experience.comparisonMode || 'none',
      },
      contract: {
        schema: 'simulatte.profileWorldSpecContract.v1',
        compilerLane: COMPILER_LANE,
        profileSchema: String(profile.schema || ''),
        profileContentHash: profileHash,
        scenarioContentHash: scenarioHash,
      },
      universeGraph: governedIntent.acceptedGraph,
      physicsIR: {
        schema: 'simulatte.profileSimulationProgram.v1',
        operators: pluginDependencies.map((plugin) => ({ id: `operator:${plugin.id}`, pluginId: plugin.id })),
      },
      solverGraph: {
        schema: 'simulatte.profileSolverGraph.v1',
        steps: pluginDependencies.map((plugin, index) => ({ id: `step:${plugin.id}`, pluginId: plugin.id, order: index })),
      },
      renderIR: {
        schema: 'simulatte.profileVisualProgram.v1',
        profileId: profile.id,
        pluginIds: pluginDependencies.map((plugin) => plugin.id),
      },
      validationReceipt: {
        schema: 'simulatte.profileWorldSpecValidation.v1',
        status: 'pass',
        valid: true,
        compilerLane: COMPILER_LANE,
      },
      phaseArtifacts: {
        phase2: governedIntent.phase2,
        phase4: governedIntent.phase4,
        phase5: phaseArtifact(5, 'simulation', profile, selectedScenario, pluginDependencies),
        phase6: phaseArtifact(6, 'visual', profile, selectedScenario, pluginDependencies),
      },
      determinism: {
        schema: 'simulatte.worldSpecDeterminism.v1',
        requiredClasses: ['compiler-deterministic', 'replay-identified'],
        seed: null,
        simulationTolerance: 0,
        pixelPolicy: {
          comparisonMode: profile.experience && profile.experience.comparisonMode || 'none',
          scope: 'semantic-and-bounded-pixels',
        },
      },
      dependencies: {
        schema: 'simulatte.worldSpecDependencies.v1',
        governedPacks: [{ id: profile.id, contentHash: profileHash }],
        plugins: pluginDependencies,
        assets: [],
      },
      safety: {
        schema: 'simulatte.worldSpecSafety.v1',
        rules: [],
        status: 'not-declared',
      },
      unsupportedRequirements: [],
      unresolvedAmbiguities: [],
      authorship: {
        schema: 'simulatte.worldSpecAuthoring.v1',
        revision: 0,
        sources: sourceIds,
        fieldProvenance: [
          { path: '/source/prompt', authority: 'governedPack', sourceId: governedIntent.sourceId },
          { path: '/', authority: 'compilerInference', sourceId: 'source:compiler' },
          { path: '/params', authority: 'governedPack', sourceId: `source:profile:${profile.id}` },
          { path: '/params/scenarioId', authority: 'governedPack', sourceId: `source:scenario:${selectedScenario.id}` },
          ...pluginDependencies.map((plugin) => ({
            path: `/modules/${pluginDependencies.indexOf(plugin)}`,
            authority: 'plugin',
            sourceId: `source:plugin:${plugin.id}`,
          })),
        ],
        patches: [],
      },
    };
    return worldSpec.finalizeWorldSpec(raw, {
      prompt,
      compilerConfig: {
        compilerLane: COMPILER_LANE,
        profileId: profile.id,
        profileSchema: profile.schema,
        scenarioId: selectedScenario.id,
        pluginIds: pluginDependencies.map((plugin) => plugin.id),
      },
    });
  }

  function resolveProfileExecution(spec, { profile, scenario = null, pluginManifests = [] } = {}) {
    worldSpec.validateWorldSpec(spec);
    assertObject(profile, 'profile_world_spec_profile_missing', 'Profile resolution requires an application profile');
    if (spec.templateId !== TEMPLATE_ID || spec.kind !== 'governed-profile') {
      fail('profile_world_spec_template_invalid', 'WorldSpec is not a governed profile program', {
        templateId: spec.templateId,
        kind: spec.kind,
      });
    }
    if (spec.params.profileId !== profile.id) {
      fail('profile_world_spec_profile_mismatch', `WorldSpec selects ${spec.params.profileId}, expected ${profile.id}`, null);
    }
    if (spec.contract && spec.contract.compilerLane !== COMPILER_LANE) {
      fail('profile_world_spec_compiler_lane_invalid', 'WorldSpec does not retain the profile compiler lane', null);
    }
    if (spec.contract && spec.contract.profileContentHash !== valueHash(profile)) {
      fail('profile_world_spec_profile_identity_mismatch', 'WorldSpec profile identity is stale or edited', null);
    }
    const selectedScenario = selectScenario(profile, {
      ...(scenario || {}),
      id: spec.params.scenarioId,
      seed: spec.params.scenarioSeed,
    });
    const manifests = selectedManifests(profile, pluginManifests);
    const expectedPlugins = manifests.map(({ selection, manifest }) => ({
      id: manifest.id,
      version: manifest.version,
      configId: selection.configId,
      contentHash: manifest.entry && manifest.entry.integrity || valueHash(manifest),
    }));
    if (canonicalJson(spec.dependencies.plugins) !== canonicalJson(expectedPlugins)) {
      fail('profile_world_spec_plugin_identity_mismatch', 'WorldSpec plugin dependencies do not match the governed profile', null);
    }
    const expected = compileProfileWorldSpec({
      profile,
      scenario: selectedScenario,
      pluginManifests,
    });
    const differingRoots = PROFILE_EXECUTION_ROOTS.filter((key) => (
      canonicalJson(spec[key]) !== canonicalJson(expected[key])
    ));
    if (differingRoots.length) {
      fail(
        'profile_world_spec_scenario_binding_mismatch',
        'WorldSpec does not match the governed compiler output for its selected scenario',
        {
          profileId: profile.id,
          scenarioId: selectedScenario.id,
          differingRoots,
        }
      );
    }
    return Object.freeze({
      schema: 'simulatte.profileWorldSpecResolution.v1',
      status: 'resolved',
      profileId: profile.id,
      scenario: canonicalValue(selectedScenario),
      worldSpecContentHash: spec.contentHash,
      worldSpecRevision: spec.authorship.revision,
    });
  }

  function createConformanceReceipt(spec, options = {}) {
    const resolution = resolveProfileExecution(spec, options);
    return Object.freeze({
      schema: RECEIPT_SCHEMA,
      status: 'pass',
      compilerLane: COMPILER_LANE,
      profileId: resolution.profileId,
      scenarioId: resolution.scenario.id,
      scenarioSeed: resolution.scenario.seed,
      worldSpecSchema: spec.schema,
      worldSpecVersion: spec.schemaVersion,
      worldSpecId: spec.id,
      worldSpecContentHash: spec.contentHash,
      worldSpecRevision: spec.authorship.revision,
      requiredDeterminismClasses: [...spec.determinism.requiredClasses],
    });
  }

  function compileProfileScenarioSelection({ profile, scenarioId, pluginManifests = [] } = {}) {
    const selectedScenario = selectScenario(profile, { id: scenarioId });
    return compileProfileWorldSpec({ profile, scenario: selectedScenario, pluginManifests });
  }

  function prepareProfileScenarioEdit(current, options = {}) {
    worldSpec.validateWorldSpec(current);
    return compileProfileScenarioSelection(options);
  }

  function phaseArtifact(number, kind, profile, scenario, plugins) {
    return {
      schema: `simulatte.phase${number}.output.v2`,
      runtimeReceiptId: `profile-compiler:${profile.id}:${scenario.id}:phase${number}`,
      receipts: [],
      artifact: {
        schema: `simulatte.profile${kind === 'simulation' ? 'Simulation' : 'Visual'}Compilation.v1`,
        profileId: profile.id,
        scenarioId: scenario.id,
        pluginIds: plugins.map((plugin) => plugin.id),
      },
    };
  }

  function compileGovernedIntent({ profile, scenario, plugins, profileHash, scenarioHash }) {
    const sourceId = `source:brief:${profile.id}:${scenario.id}`;
    const missionText = sourceBrief(profile, scenario);
    const segments = [
      { id: `span:profile:${profile.id}`, kind: 'entity', label: profile.id, prefix: 'Profile ' },
      { id: `span:scenario:${scenario.id}`, kind: 'entity', label: scenario.id, prefix: 'Scenario ' },
      ...plugins.map((plugin) => ({
        id: `span:plugin:${plugin.id}`,
        kind: 'entity',
        label: plugin.id,
        prefix: 'Plugin ',
      })),
      { id: `span:mission:${scenario.id}`, kind: 'term', label: missionText, prefix: 'Mission ' },
    ];
    const { prompt, spans } = serializeBriefSegments(segments);
    const nodes = spans.map((span) => ({
      id: spanNodeId(span),
      kind: span.kind === 'term' ? 'mission' : governedNodeKind(span.id),
      label: span.text,
      spanId: span.id,
      sourceSpanIds: [span.id],
      evidence: governedEvidenceIds(span.id, profileHash, scenarioHash, plugins),
      authorship: { authority: 'governedPack', sourceId },
    }));
    const profileNode = nodes.find((node) => node.kind === 'governed-profile');
    const scenarioNode = nodes.find((node) => node.kind === 'scenario');
    const pluginNodes = nodes.filter((node) => node.kind === 'plugin');
    const missionNode = nodes.find((node) => node.kind === 'mission');
    const edges = [
      governedRelation('selects', profileNode, scenarioNode, sourceId),
      governedRelation('describes', scenarioNode, missionNode, sourceId),
      ...pluginNodes.map((pluginNode) => (
        governedRelation('uses', profileNode, pluginNode, sourceId)
      )),
    ];
    const languageGraph = canonicalValue({
      schema: 'simulatte.languageGraph.v1',
      sourceText: prompt,
      tokens: [],
      spans,
      clauses: [],
      predicates: [],
      quantities: [],
      modifiers: [],
      negations: [],
      relations: [],
    });
    const sceneLanguageGraph = canonicalValue({
      schema: 'simulatte.sceneLanguageGraph.v1',
      entities: spans.filter((span) => span.kind === 'entity').map((span) => ({
        id: spanNodeId(span),
        kind: 'entity',
        label: span.text,
        sourceSpanIds: [span.id],
      })),
      concepts: [{
        id: missionNode.id,
        kind: 'concept',
        label: missionNode.label,
        sourceSpanIds: [missionNode.spanId],
      }],
      parts: [],
      actions: [],
      environments: [],
      mediums: [],
      attributes: [],
      relations: edges.map((edge) => ({ ...edge, required: true })),
    });
    const intentRequirements = intentProof.createIntentRequirementLedger({
      languageGraph,
      sceneLanguageGraph,
    });
    const acceptedGraph = canonicalValue({
      schema: 'simulatte.profileUniverseGraph.v1',
      prompt,
      nodes,
      edges,
      unsupported: [],
      unresolved: [],
      promptVisualObligations: [],
    });
    const groundedIntent = canonicalValue({
      schema: 'simulatte.profileGroundedIntent.v1',
      acceptedGraph,
      rejectedGraph: { rejected: [], unresolved: [] },
      unsupported: [],
      negativeEvidence: [],
      authorship: { authority: 'governedPack', sourceId },
    });
    const groundedSceneContract = canonicalValue({
      schema: 'simulatte.profileGroundedSceneContract.v1',
      unsupported: [],
      acceptedRelations: edges,
      provenanceByEntry: Object.fromEntries(nodes.map((node) => [node.id, {
        authority: 'governedPack',
        evidenceIds: node.evidence,
      }])),
    });
    const phase4Artifact = {
      schema: 'simulatte.profileGroundedIntentCompilation.v1',
      profileId: profile.id,
      scenarioId: scenario.id,
      groundedIntent,
      groundedSceneContract,
    };
    phase4Artifact.intentSettlement = intentProof.createIntentSettlementLedger(
      intentRequirements,
      phase4Artifact
    );
    phase4Artifact.semanticProvenance = semanticProof.createSemanticProvenanceLedger(
      intentRequirements,
      phase4Artifact,
      { patches: [] }
    );
    return canonicalValue({
      sourceId,
      prompt,
      acceptedGraph,
      phase2: {
        schema: 'simulatte.phase2.output.v1',
        runtimeReceiptId: `profile-compiler:${profile.id}:${scenario.id}:phase2`,
        receipts: [],
        artifact: {
          schema: 'simulatte.profileLanguageCompilation.v1',
          profileId: profile.id,
          scenarioId: scenario.id,
          languageGraph,
          sceneLanguageGraph,
          intentRequirements,
        },
      },
      phase4: {
        schema: 'simulatte.phase4.output.v2',
        runtimeReceiptId: `profile-compiler:${profile.id}:${scenario.id}:phase4`,
        receipts: [],
        artifact: phase4Artifact,
      },
    });
  }

  function serializeBriefSegments(segments) {
    let prompt = '';
    const spans = [];
    segments.forEach((segment) => {
      if (prompt) prompt += ' ';
      prompt += segment.prefix;
      const start = prompt.length;
      prompt += segment.label;
      spans.push({
        id: segment.id,
        kind: segment.kind,
        text: segment.label,
        start,
        end: prompt.length,
      });
      if (!/[.!?]$/.test(segment.label)) prompt += '.';
    });
    return { prompt, spans };
  }

  function spanNodeId(span) {
    return span.id.replace(/^span:/, 'intent:');
  }

  function governedNodeKind(spanId) {
    if (spanId.startsWith('span:profile:')) return 'governed-profile';
    if (spanId.startsWith('span:scenario:')) return 'scenario';
    if (spanId.startsWith('span:plugin:')) return 'plugin';
    return 'governed-intent';
  }

  function governedEvidenceIds(spanId, profileHash, scenarioHash, plugins) {
    if (spanId.startsWith('span:profile:')) return [`profile:${profileHash}`];
    if (spanId.startsWith('span:scenario:') || spanId.startsWith('span:mission:')) {
      return [`scenario:${scenarioHash}`];
    }
    const plugin = plugins.find((row) => spanId === `span:plugin:${row.id}`);
    return plugin ? [`plugin:${plugin.id}:${plugin.contentHash}`] : [];
  }

  function governedRelation(predicate, from, to, sourceId) {
    if (!from || !to) {
      fail('profile_world_spec_intent_relation_invalid', `Cannot compile ${predicate} without both endpoints`, null);
    }
    return canonicalValue({
      id: `relation:${predicate}:${from.id}:${to.id}`,
      kind: 'relation',
      type: predicate,
      predicate,
      from: from.id,
      to: to.id,
      sourceSpanIds: [from.spanId, to.spanId].sort(),
      evidence: [...new Set([...(from.evidence || []), ...(to.evidence || [])])].sort(),
      authorship: { authority: 'governedPack', sourceId },
    });
  }

  function selectScenario(profile, requested) {
    const declared = Array.isArray(profile.seeds) ? profile.seeds : [];
    if (!declared.length) {
      return canonicalValue({
        id: 'default',
        label: 'Default scenario',
        description: `Default scenario for ${profile.id}`,
        seed: profile.id,
        ...(requested || {}),
      });
    }
    const requestedId = requested && requested.id || profile.defaultSeedId;
    const requestedSeed = requested && requested.seed;
    const selected = declared.find((row) => row.id === requestedId);
    if (!selected || (requestedSeed !== undefined && requestedSeed !== null && selected.seed !== requestedSeed)) {
      fail('profile_world_spec_scenario_undeclared', `Scenario ${requestedId || 'missing'} is not declared by ${profile.id}`, {
        requestedId: requestedId || null,
        requestedSeed: requestedSeed || null,
        available: declared.map((row) => ({ id: row.id, seed: row.seed })),
      });
    }
    return canonicalValue(selected);
  }

  function selectedManifests(profile, pluginManifests) {
    const byId = new Map((pluginManifests || []).map((manifest) => [manifest && manifest.id, manifest]));
    return (profile.plugins || []).map((selection) => {
      const manifest = byId.get(selection.id);
      if (!manifest) {
        fail('profile_world_spec_plugin_manifest_missing', `Profile plugin ${selection.id} has no manifest`, {
          pluginId: selection.id,
        });
      }
      return { selection, manifest };
    });
  }

  function sourceBrief(profile, scenario) {
    return String(
      scenario.missionText || scenario.description || scenario.label || profile.description || profile.id
    );
  }

  function canonicalValue(value) {
    if (Array.isArray(value)) return value.map(canonicalValue);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.keys(value).sort().flatMap((key) => (
      value[key] === undefined ? [] : [[key, canonicalValue(value[key])]]
    )));
  }

  function canonicalJson(value) {
    return JSON.stringify(canonicalValue(value));
  }

  function valueHash(value) {
    let hash = 2166136261;
    const text = canonicalJson(value);
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, '0')}`;
  }

  function assertObject(value, code, message) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code, message, null);
  }

  function fail(code, message, evidence) {
    throw new ProfileWorldSpecError(code, message, evidence);
  }

  return Object.freeze({
    TEMPLATE_ID,
    COMPILER_LANE,
    RECEIPT_SCHEMA,
    ProfileWorldSpecError,
    canonicalJson,
    valueHash,
    compileProfileWorldSpec,
    compileProfileScenarioSelection,
    prepareProfileScenarioEdit,
    resolveProfileExecution,
    createConformanceReceipt,
  });
});
