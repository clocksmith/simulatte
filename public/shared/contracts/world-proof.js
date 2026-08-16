(function attachSimulatteWorldProof(root, factory) {
  const worldSpec = typeof module === 'object' && module.exports
    ? require('./world-spec.js')
    : root.SimulatteWorldSpec;
  const compilerProof = typeof module === 'object' && module.exports
    ? require('./world-proof-compiler.js')
    : root.SimulatteWorldProofCompiler;
  const intentProof = typeof module === 'object' && module.exports
    ? require('./world-proof-intent.js')
    : root.SimulatteWorldProofIntent;
  const semanticProof = typeof module === 'object' && module.exports
    ? require('./world-proof-semantic.js')
    : root.SimulatteWorldProofSemantic;
  const simulationProof = typeof module === 'object' && module.exports
    ? require('./world-proof-simulation.js')
    : root.SimulatteWorldProofSimulation;
  const interactionProof = typeof module === 'object' && module.exports
    ? require('./world-proof-interaction.js')
    : root.SimulatteWorldProofInteraction;
  const safetyProof = typeof module === 'object' && module.exports
    ? require('./world-proof-safety.js')
    : root.SimulatteWorldProofSafety;
  if (!worldSpec || !compilerProof || !intentProof || !semanticProof || !simulationProof ||
      !interactionProof || !safetyProof) {
    throw new Error('SimulatteWorldProof requires WorldSpec and all typed proof contracts');
  }
  const api = factory(
    worldSpec,
    compilerProof,
    intentProof,
    semanticProof,
    simulationProof,
    interactionProof,
    safetyProof
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteWorldProof = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createWorldProofApi(
  worldSpecContract,
  compilerProofContract,
  intentProofContract,
  semanticProofContract,
  simulationProofContract,
  interactionProofContract,
  safetyProofContract
) {
  const WORLD_PROOF_SCHEMA = 'simulatte.worldProof.v1';
  const WORLD_PROOF_BINDING_SCHEMA = 'simulatte.worldProofBinding.v1';
  const WORLD_PROOF_CLASS_SCHEMA = 'simulatte.worldProofClass.v1';
  const WORLD_PROOF_HASH_PREFIX = 'fnv1a32:';
  const PROOF_CLASS_NAMES = Object.freeze([
    'intent', 'semantic', 'compilation', 'simulation',
    'interaction', 'safety', 'visual', 'replay',
  ]);
  const PROOF_STATUSES = Object.freeze([
    'pass', 'fail', 'not-proven', 'not-applicable', 'unsupported',
  ]);

  class WorldProofError extends Error {
    constructor(message, path = '$') {
      super(`${message} at ${path}`);
      this.name = 'WorldProofError';
      this.path = path;
    }
  }

  function canonicalValue(value) {
    if (Array.isArray(value)) return value.map(canonicalValue);
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])])
      );
    }
    return value;
  }

  function canonicalJson(value) {
    return JSON.stringify(canonicalValue(value));
  }

  function fnv1a32(value) {
    let hash = 0x811c9dc5;
    const bytes = new TextEncoder().encode(String(value || ''));
    for (const byte of bytes) {
      hash ^= byte;
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash >>> 0;
  }

  function contentHash(value) {
    const copy = canonicalValue(value || {});
    delete copy.contentHash;
    delete copy.createdAt;
    return `${WORLD_PROOF_HASH_PREFIX}${fnv1a32(canonicalJson(copy)).toString(16).padStart(8, '0')}`;
  }

  function phaseIdentity(spec, number) {
    const phase = spec && spec.phaseArtifacts && spec.phaseArtifacts[`phase${number}`] || null;
    return {
      phase: number,
      schema: String(phase && phase.schema || ''),
      runtimeReceiptId: String(phase && phase.runtimeReceiptId || ''),
      receiptIds: (phase && Array.isArray(phase.receipts) ? phase.receipts : [])
        .map((row) => String(row && row.id || ''))
        .filter(Boolean),
    };
  }

  function hashedDependencies(rows) {
    return (Array.isArray(rows) ? rows : []).map((row) => ({
      id: String(row && (row.id || row.name || row.pluginId || row.packId || row.assetId) || ''),
      contentHash: String(row && (row.contentHash || row.sha256 || row.hash || row.version) || ''),
    }));
  }

  function createWorldProofBinding(spec = null, options = {}) {
    if (!spec || spec.schema !== 'simulatte.worldSpec.v1') return null;
    worldSpecContract.validateWorldSpec(spec);
    const phases = [1, 2, 3, 4, 5, 6].map((number) => phaseIdentity(spec, number));
    const validation = spec.validationReceipt || {};
    const dependencies = spec.dependencies || {};
    const requiredClasses = Array.isArray(spec.determinism && spec.determinism.requiredClasses)
      ? spec.determinism.requiredClasses.map(String)
      : [];
    const prompt = String(spec.source && spec.source.prompt || '');
    const compilerInput = compilerProofContract.compilerInputIdentity(spec);
    const compilerConfig = spec.source && spec.source.compilerConfig || {};
    const safety = spec.safety || {};
    const safetyRules = Array.isArray(safety.rules) ? canonicalValue(safety.rules) : [];
    const intentIdentity = intentProofContract.intentBindingIdentity(spec);
    const interactionIdentity = interactionProofContract.interactionBindingIdentity(spec);
    const simulationPolicy = compilerConfig.simulationProof &&
      typeof compilerConfig.simulationProof === 'object'
      ? canonicalValue(compilerConfig.simulationProof) : null;
    return canonicalValue({
      schema: WORLD_PROOF_BINDING_SCHEMA,
      worldSpec: {
        schema: spec.schema,
        id: String(spec.id || ''),
        contentHash: String(spec.contentHash || ''),
        revision: Number(spec.authorship && spec.authorship.revision || 0),
        promptHash: `${WORLD_PROOF_HASH_PREFIX}${fnv1a32(prompt).toString(16).padStart(8, '0')}`,
        patchIds: (spec.authorship && Array.isArray(spec.authorship.patches) ? spec.authorship.patches : [])
          .map((row) => String(row && row.id || ''))
          .filter(Boolean),
      },
      phases,
      intent: {
        ...intentIdentity,
        unsupportedRequirementCount: Array.isArray(spec.unsupportedRequirements)
          ? spec.unsupportedRequirements.length : 0,
        unresolvedAmbiguityCount: Array.isArray(spec.unresolvedAmbiguities)
          ? spec.unresolvedAmbiguities.length : 0,
      },
      semantic: semanticProofContract.semanticBindingIdentity(spec),
      interaction: interactionIdentity,
      compilation: {
        validationSchema: String(validation.schema || ''),
        validationPassed: validation.valid !== false && validation.status !== 'fail',
        compilerConfigHash: compilerInput.compilerConfigHash,
        compilerInputHash: compilerInput.compilerInputHash,
        compilerLane: compilerInput.compilerLane,
        compilerBaselineContentHash: worldSpecContract.compilerBaselineContentHash(spec),
      },
      simulationReproducibility: {
        policy: simulationPolicy,
        policyHash: simulationPolicy
          ? `${WORLD_PROOF_HASH_PREFIX}${fnv1a32(canonicalJson(simulationPolicy)).toString(16).padStart(8, '0')}`
          : '',
        tolerance: spec.determinism && Number.isFinite(spec.determinism.simulationTolerance)
          ? Number(spec.determinism.simulationTolerance) : null,
        seed: spec.determinism && Object.hasOwn(spec.determinism, 'seed')
          ? spec.determinism.seed : null,
      },
      safety: {
        status: String(safety.status || 'not-declared'),
        rules: safetyRules,
        ruleCount: safetyRules.length,
        rulesHash: safetyRules.length
          ? `${WORLD_PROOF_HASH_PREFIX}${fnv1a32(canonicalJson(safetyRules)).toString(16).padStart(8, '0')}`
          : '',
      },
      declarations: {
        simulation: Boolean(
          spec.physicsIR && Array.isArray(spec.physicsIR.operators) && spec.physicsIR.operators.length ||
          spec.solverGraph && Array.isArray(spec.solverGraph.steps) && spec.solverGraph.steps.length
        ),
        interaction: interactionIdentity.declared === true,
        safety: String(safety.status || 'not-declared') !== 'not-declared',
      },
      replayIdentity: {
        buildId: String(options.buildId || ''),
        runtimeId: String(options.runtimeId || 'simulatte.blank.webgpu.v1'),
        seed: spec.determinism && Object.hasOwn(spec.determinism, 'seed')
          ? spec.determinism.seed : null,
        requiredClasses,
        governedPacks: hashedDependencies(dependencies.governedPacks),
        plugins: hashedDependencies(dependencies.plugins),
        assets: hashedDependencies(dependencies.assets),
      },
    });
  }

  function proofClass(name, required, status, evidence = [], failures = []) {
    return {
      schema: WORLD_PROOF_CLASS_SCHEMA,
      class: name,
      required: Boolean(required),
      status,
      evidence: [...new Set((evidence || []).map(String).filter(Boolean))],
      failures: [...new Set((failures || []).map(String).filter(Boolean))],
    };
  }

  function phasePresent(binding, number) {
    const phase = binding && Array.isArray(binding.phases)
      ? binding.phases.find((row) => Number(row.phase) === number) : null;
    const expectedSchema = number <= 2
      ? `simulatte.phase${number}.output.v1`
      : `simulatte.phase${number}.output.v2`;
    return Boolean(phase && phase.schema === expectedSchema);
  }

  function statusFromReceipt(receipt, passStatuses = ['pass']) {
    if (!receipt) return 'not-proven';
    const status = String(receipt.status || receipt.verdict || '');
    if (passStatuses.includes(status)) return 'pass';
    if (status === 'unsupported') return 'unsupported';
    if (status === 'not-applicable') return 'not-applicable';
    if (['not-proven', 'not-configured', 'not-exercised'].includes(status)) return 'not-proven';
    return 'fail';
  }

  function replayIdentity(binding, deviceClass = '') {
    const source = binding && binding.replayIdentity || {};
    return canonicalValue({
      worldSpecContentHash: String(binding && binding.worldSpec && binding.worldSpec.contentHash || ''),
      worldSpecRevision: Number(binding && binding.worldSpec && binding.worldSpec.revision || 0),
      buildId: String(source.buildId || ''),
      runtimeId: String(source.runtimeId || ''),
      deviceClass: String(deviceClass || ''),
      seed: Object.hasOwn(source, 'seed') ? source.seed : null,
      requiredClasses: (source.requiredClasses || []).map(String).sort(),
      governedPacks: source.governedPacks || [],
      plugins: source.plugins || [],
      assets: source.assets || [],
    });
  }

  function replayOutcomes(options = {}) {
    const sceneProof = options.sceneProof || {};
    const simulationReceipt = options.simulationReceipt || {};
    const interactionReceipt = options.interactionProofReceipt ||
      options.sceneProof && options.sceneProof.interactionProof ||
      options.interactionReceipt || {};
    const safetyReceipt = options.safetyReceipt || {};
    const intentReceipt = options.intentReceipt || null;
    const semanticReceipt = options.semanticReceipt || null;
    const compilerReceipt = options.compilerDeterminismReceipt || null;
    const simulationReproducibilityReceipt = options.simulationReproducibilityReceipt || null;
    const executionReceipt = options.executionReceipt || null;
    return canonicalValue({
      visualVerdict: String(sceneProof.verdict || ''),
      requiredVisualSettlements: (sceneProof.settledObligations || [])
        .filter((row) => row.required === true)
        .map((row) => ({ id: row.obligationId, status: row.status }))
        .sort((a, b) => a.id.localeCompare(b.id)),
      simulation: {
        status: String(simulationReceipt.status || ''),
        executedOperatorIds: (simulationReceipt.executedOperatorIds || []).slice().sort(),
        missingOperatorIds: (simulationReceipt.missingOperatorIds || []).slice().sort(),
        finiteChannels: simulationReceipt.finiteChannels === true,
      },
      interaction: {
        status: String(interactionReceipt.status || ''),
        contentHash: String(interactionReceipt.contentHash || ''),
        interactionProgramHash: String(interactionReceipt.interactionProgramHash || ''),
        transitionHash: String(interactionReceipt.transitionHash || ''),
        provenTransitionCount: Number(interactionReceipt.provenTransitionCount || 0),
        changedChannels: (interactionReceipt.changedChannelIds || interactionReceipt.changedChannels || []).slice().sort(),
        visualStateConsumed: interactionReceipt.visualStateConsumed === true,
      },
      safety: {
        status: String(safetyReceipt.status || 'not-applicable'),
        decision: String(safetyReceipt.baselineDecision || ''),
        rulesHash: String(safetyReceipt.rulesHash || ''),
        baselineTraceHash: String(safetyReceipt.baselineTraceHash || ''),
        replayTraceHash: String(safetyReceipt.replayTraceHash || ''),
      },
      intent: intentReceipt ? {
        status: String(intentReceipt.status || ''),
        contentHash: String(intentReceipt.contentHash || ''),
        requirementLedgerHash: String(intentReceipt.requirementLedgerHash || ''),
        settlementLedgerHash: String(intentReceipt.settlementLedgerHash || ''),
      } : null,
      semantic: semanticReceipt ? {
        status: String(semanticReceipt.status || ''),
        contentHash: String(semanticReceipt.contentHash || ''),
        provenanceLedgerHash: String(semanticReceipt.provenanceLedgerHash || ''),
        graphHash: String(semanticReceipt.graphHash || ''),
      } : null,
      compilerDeterminism: compilerReceipt ? {
        status: String(compilerReceipt.status || ''),
        buildId: String(compilerReceipt.buildId || ''),
        compilerLane: String(compilerReceipt.compilerLane || ''),
        compilerInputHash: String(compilerReceipt.compilerInputHash || ''),
        baselineContentHash: String(compilerReceipt.baselineContentHash || ''),
        recompiledContentHash: String(compilerReceipt.recompiledContentHash || ''),
      } : null,
      simulationReproducibility: simulationReproducibilityReceipt ? {
        status: String(simulationReproducibilityReceipt.status || ''),
        buildId: String(simulationReproducibilityReceipt.buildId || ''),
        policyHash: String(simulationReproducibilityReceipt.policyHash || ''),
        stepCount: Number(simulationReproducibilityReceipt.stepCount || 0),
        stepSeconds: Number(simulationReproducibilityReceipt.stepSeconds || 0),
        tolerance: Number(simulationReproducibilityReceipt.tolerance || 0),
        baselineStateHash: String(simulationReproducibilityReceipt.baselineStateHash || ''),
        replayStateHash: String(simulationReproducibilityReceipt.replayStateHash || ''),
        maxAbsoluteDelta: Number(simulationReproducibilityReceipt.maxAbsoluteDelta || 0),
      } : null,
      execution: executionReceipt ? {
        schema: String(executionReceipt.schema || ''),
        status: String(executionReceipt.status || ''),
        contentHash: String(executionReceipt.contentHash || ''),
        profileId: String(executionReceipt.profileId || ''),
        scenarioId: String(executionReceipt.scenarioId || ''),
        scenarioSeed: Object.hasOwn(executionReceipt, 'scenarioSeed')
          ? executionReceipt.scenarioSeed : null,
      } : null,
    });
  }

  function createReplayBaseline(options = {}) {
    return canonicalValue({
      schema: 'simulatte.replayBaseline.v1',
      identity: replayIdentity(options.binding, options.deviceClass),
      outcomes: replayOutcomes(options),
    });
  }

  function replayIdentityComplete(identity = {}) {
    const dependencies = [
      ...(identity.governedPacks || []),
      ...(identity.plugins || []),
      ...(identity.assets || []),
    ];
    return Boolean(
      identity.worldSpecContentHash && identity.buildId && identity.runtimeId && identity.deviceClass &&
      !/(?:unreported|uninitialized)$/.test(identity.deviceClass) &&
      dependencies.every((row) => row.id && row.contentHash)
    );
  }

  function createReplayReceipt(baseline, options = {}) {
    const current = createReplayBaseline(options);
    const identityMatches = canonicalJson(baseline && baseline.identity || null) ===
      canonicalJson(current.identity);
    const outcomesMatch = canonicalJson(baseline && baseline.outcomes || null) ===
      canonicalJson(current.outcomes);
    const identityComplete = replayIdentityComplete(current.identity);
    const requiredClasses = current.identity.requiredClasses || [];
    const classStatuses = Object.fromEntries(requiredClasses.map((className) => [
      className,
      className === 'replay-identified'
        ? identityMatches && identityComplete ? 'pass' : 'fail'
        : className === 'compiler-deterministic'
          ? compilerProofContract.compilerDeterminismStatus(
            options.compilerDeterminismReceipt,
            options.binding
          )
          : className === 'simulation-reproducible'
            ? simulationProofContract.simulationReproducibilityStatus(
              options.simulationReproducibilityReceipt,
              options.binding
            )
        : 'not-proven',
    ]));
    const failedRequiredClasses = requiredClasses.filter((className) => (
      classStatuses[className] === 'fail'
    ));
    const unsupportedRequiredClasses = requiredClasses.filter((className) => (
      classStatuses[className] === 'not-proven'
    ));
    const status = !identityMatches || !outcomesMatch || !identityComplete || failedRequiredClasses.length
      ? 'fail'
      : unsupportedRequiredClasses.length
        ? 'not-proven'
        : 'pass';
    return canonicalValue({
      schema: 'simulatte.replayProofReceipt.v1',
      status,
      requiredClasses,
      classStatuses,
      failedRequiredClasses,
      unsupportedRequiredClasses,
      identityMatches,
      outcomesMatch,
      identityComplete,
      baseline,
      current,
    });
  }

  function createWorldProof(options = {}) {
    const binding = options.binding || null;
    if (!binding || !binding.worldSpec) {
      throw new WorldProofError('WorldProof requires a bound WorldSpec identity', '$.binding.worldSpec');
    }
    const sceneProof = options.sceneProof || null;
    const intentReceipt = options.intentReceipt || null;
    const semanticReceipt = options.semanticReceipt || null;
    const simulationReceipt = options.simulationReceipt || null;
    const safetyReceipt = options.safetyReceipt || null;
    const compilerDeterminismReceipt = options.compilerDeterminismReceipt || null;
    const simulationReproducibilityReceipt = options.simulationReproducibilityReceipt || null;
    const replayReceipt = options.replayReceipt || null;
    const interactionProof = sceneProof && sceneProof.interactionProof || null;
    const intentStatus = intentProofContract.intentProofStatus(intentReceipt, binding);
    const semanticStatus = semanticProofContract.semanticProofStatus(semanticReceipt, binding);
    const compilationPass = Boolean(
      phasePresent(binding, 5) && phasePresent(binding, 6) &&
      binding.compilation && binding.compilation.validationPassed === true
    );
    const simulationRequired = Boolean(binding.declarations && binding.declarations.simulation);
    const interactionRequired = Boolean(binding.declarations && binding.declarations.interaction);
    const safetyRequired = Boolean(binding.declarations && binding.declarations.safety);
    const safetyStatus = safetyRequired
      ? binding.safety && binding.safety.status === 'unsupported'
        ? 'unsupported'
        : safetyProofContract.safetyProofStatus(safetyReceipt, binding)
      : 'not-applicable';
    const requiredDeterminismClasses = binding.replayIdentity &&
      Array.isArray(binding.replayIdentity.requiredClasses)
      ? binding.replayIdentity.requiredClasses.map(String).sort() : [];
    const replayRequired = requiredDeterminismClasses.length > 0;
    const replayStatus = replayRequired
      ? replayProofStatus(replayReceipt, requiredDeterminismClasses)
      : 'not-applicable';
    const visualStatus = sceneProof && sceneProof.verdict === 'pass'
      ? 'pass'
      : sceneProof && sceneProof.verdict === 'fail'
        ? 'fail'
        : 'not-proven';
    const interactionStatus = interactionRequired
      ? interactionProofContract.interactionProofStatus(interactionProof, binding)
      : 'not-applicable';
    const classes = {
      intent: proofClass(
        'intent', true, intentStatus,
        intentReceipt ? ['intentReceipt', 'phase2IntentRequirements', 'phase4IntentSettlement'] : [],
        intentStatus === 'pass' ? []
          : intentStatus === 'fail'
            ? ['at least one critical requirement was lost or the intent receipt is invalid']
            : ['critical requirement extraction or settlement is not fully proven']
      ),
      semantic: proofClass(
        'semantic', true, semanticStatus,
        semanticReceipt ? ['semanticReceipt', 'phase4SemanticProvenance'] : [],
        semanticStatus === 'pass' ? []
          : semanticStatus === 'fail'
            ? ['at least one accepted semantic fact lost provenance or the receipt is invalid']
            : ['accepted semantic provenance is not fully proven']
      ),
      compilation: proofClass(
        'compilation', true, compilationPass ? 'pass' : 'not-proven',
        compilationPass ? ['phase5', 'phase6', 'validationReceipt'] : [],
        compilationPass ? [] : ['simulation and visual compilation are not both bound']
      ),
      simulation: proofClass(
        'simulation', simulationRequired,
        simulationRequired ? statusFromReceipt(simulationReceipt) : 'not-applicable',
        simulationReceipt ? ['simulationReceipt'] : [],
        simulationRequired && !simulationReceipt ? ['declared dynamics have no behavior receipt'] : []
      ),
      interaction: proofClass(
        'interaction', interactionRequired, interactionStatus,
        interactionProof ? ['phase8InteractionProof'] : [],
        interactionRequired && interactionStatus !== 'pass'
          ? ['declared controls were not proven through state transitions'] : []
      ),
      safety: proofClass(
        'safety', safetyRequired,
        safetyStatus,
        safetyReceipt ? ['safetyReceipt'] : [],
        safetyRequired && safetyStatus !== 'pass'
          ? safetyStatus === 'unsupported'
            ? ['declared safety requirements are unsupported']
            : !safetyReceipt
              ? ['declared safety rules have no reproducible gate receipt']
              : ['declared safety gates did not reproduce an allowing decision']
          : []
      ),
      visual: proofClass(
        'visual', true, visualStatus,
        sceneProof ? ['sceneProof', 'renderReceipt', 'pixelEvidence'] : [],
        visualStatus === 'pass' ? [] : ['required visible obligations did not all pass']
      ),
      replay: proofClass(
        'replay', replayRequired,
        replayStatus,
        replayReceipt ? ['replayReceipt'] : [],
        replayRequired && !replayReceipt
          ? ['no independent replay comparison is bound']
          : replayRequired && replayStatus !== 'pass'
            ? replayReceipt && replayReceipt.failedRequiredClasses && replayReceipt.failedRequiredClasses.length
              ? [`declared determinism classes failed: ${replayReceipt.failedRequiredClasses.join(', ')}`]
              : replayReceipt && replayReceipt.unsupportedRequiredClasses && replayReceipt.unsupportedRequiredClasses.length
                ? [`declared determinism classes are not proven: ${replayReceipt.unsupportedRequiredClasses.join(', ')}`]
                : ['independent replay did not prove every declared determinism class']
            : []
      ),
    };
    const required = Object.values(classes).filter((row) => row.required);
    const verdict = required.some((row) => ['fail', 'unsupported'].includes(row.status))
      ? 'fail'
      : required.some((row) => row.status !== 'pass')
        ? 'not-proven'
        : 'pass';
    const proof = {
      schema: WORLD_PROOF_SCHEMA,
      contentHash: '',
      verdict,
      worldSpec: binding.worldSpec,
      proofClasses: classes,
      criticalFailures: required
        .filter((row) => row.status !== 'pass')
        .map((row) => ({ class: row.class, status: row.status, failures: row.failures })),
      bindings: {
        schema: binding.schema,
        runtimeReceiptId: String(options.runtimeReceiptId || ''),
        renderDataKey: String(options.renderDataKey || ''),
      },
      evidence: {
        intentReceipt,
        semanticReceipt,
        sceneProof: sceneProof ? {
          schema: sceneProof.schema,
          verdict: sceneProof.verdict,
          summary: sceneProof.summary,
        } : null,
        simulationReceipt,
        interactionProof,
        safetyReceipt,
        compilerDeterminismReceipt,
        simulationReproducibilityReceipt,
        replayReceipt,
      },
      createdAt: String(options.nowIso || new Date().toISOString()),
    };
    proof.contentHash = contentHash(proof);
    return validateWorldProof(proof);
  }

  function replayProofStatus(receipt, requiredClasses) {
    if (!receipt || receipt.schema !== 'simulatte.replayProofReceipt.v1') return 'not-proven';
    const receiptClasses = Array.isArray(receipt.requiredClasses)
      ? receipt.requiredClasses.map(String).sort() : [];
    if (canonicalJson(receiptClasses) !== canonicalJson(requiredClasses)) return 'fail';
    if (!receipt.classStatuses || typeof receipt.classStatuses !== 'object') return 'fail';
    if (requiredClasses.some((className) => receipt.classStatuses[className] !== 'pass')) {
      return receipt.status === 'fail' ? 'fail' : 'not-proven';
    }
    return receipt.status === 'pass' ? 'pass' : receipt.status === 'fail' ? 'fail' : 'not-proven';
  }

  function validateWorldProof(proof, options = {}) {
    if (!proof || typeof proof !== 'object' || Array.isArray(proof)) {
      throw new WorldProofError('WorldProof must be an object');
    }
    requireExactKeys(
      proof,
      ['schema', 'contentHash', 'verdict', 'worldSpec', 'proofClasses', 'criticalFailures', 'bindings', 'evidence', 'createdAt'],
      '$'
    );
    if (proof.schema !== WORLD_PROOF_SCHEMA) {
      throw new WorldProofError(`Expected ${WORLD_PROOF_SCHEMA}`, '$.schema');
    }
    if (!['pass', 'fail', 'not-proven'].includes(proof.verdict)) {
      throw new WorldProofError('Unexpected verdict', '$.verdict');
    }
    if (!proof.worldSpec || typeof proof.worldSpec !== 'object') {
      throw new WorldProofError('WorldSpec identity is required', '$.worldSpec');
    }
    requireExactKeys(
      proof.worldSpec,
      ['schema', 'id', 'contentHash', 'revision', 'promptHash', 'patchIds'],
      '$.worldSpec'
    );
    if (!proof.proofClasses || typeof proof.proofClasses !== 'object') {
      throw new WorldProofError('Proof classes are required', '$.proofClasses');
    }
    requireExactKeys(proof.proofClasses, PROOF_CLASS_NAMES, '$.proofClasses');
    for (const name of PROOF_CLASS_NAMES) validateProofClass(proof.proofClasses[name], name);
    if (!Array.isArray(proof.criticalFailures)) {
      throw new WorldProofError('Critical failures must be an array', '$.criticalFailures');
    }
    if (!proof.bindings || typeof proof.bindings !== 'object') {
      throw new WorldProofError('Bindings are required', '$.bindings');
    }
    requireExactKeys(
      proof.bindings,
      ['schema', 'runtimeReceiptId', 'renderDataKey'],
      '$.bindings'
    );
    if (!proof.evidence || typeof proof.evidence !== 'object') {
      throw new WorldProofError('Evidence receipts are required', '$.evidence');
    }
    requireExactKeys(
      proof.evidence,
      [
        'intentReceipt', 'semanticReceipt', 'sceneProof', 'simulationReceipt', 'interactionProof', 'safetyReceipt',
        'compilerDeterminismReceipt', 'simulationReproducibilityReceipt', 'replayReceipt',
      ],
      '$.evidence'
    );
    if (proof.evidence.intentReceipt !== null) {
      intentProofContract.validateIntentProofReceipt(proof.evidence.intentReceipt);
    }
    if (proof.evidence.semanticReceipt !== null) {
      semanticProofContract.validateSemanticProofReceipt(proof.evidence.semanticReceipt);
    }
    if (proof.evidence.compilerDeterminismReceipt !== null) {
      compilerProofContract.validateCompilerDeterminismReceipt(
        proof.evidence.compilerDeterminismReceipt
      );
    }
    if (proof.evidence.simulationReproducibilityReceipt !== null) {
      simulationProofContract.validateSimulationReproducibilityReceipt(
        proof.evidence.simulationReproducibilityReceipt
      );
    }
    if (proof.evidence.safetyReceipt !== null) {
      safetyProofContract.validateSafetyProofReceipt(proof.evidence.safetyReceipt);
    }
    if (proof.evidence.interactionProof !== null) {
      interactionProofContract.validateInteractionProofReceipt(proof.evidence.interactionProof);
    }
    if (typeof proof.createdAt !== 'string' || !proof.createdAt) {
      throw new WorldProofError('createdAt is required', '$.createdAt');
    }
    if (typeof proof.contentHash !== 'string' || !proof.contentHash.startsWith(WORLD_PROOF_HASH_PREFIX)) {
      throw new WorldProofError('WorldProof contentHash must name its algorithm', '$.contentHash');
    }
    if (options.verifyHash !== false && proof.contentHash !== contentHash(proof)) {
      throw new WorldProofError('WorldProof contentHash does not match canonical content', '$.contentHash');
    }
    return proof;
  }

  function validateProofClass(row, name) {
    const path = `$.proofClasses.${name}`;
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      throw new WorldProofError('Proof class must be an object', path);
    }
    requireExactKeys(row, ['schema', 'class', 'required', 'status', 'evidence', 'failures'], path);
    if (row.schema !== WORLD_PROOF_CLASS_SCHEMA) {
      throw new WorldProofError('Unexpected proof-class schema', `${path}.schema`);
    }
    if (row.class !== name) throw new WorldProofError('Proof class name mismatch', `${path}.class`);
    if (typeof row.required !== 'boolean') {
      throw new WorldProofError('Proof required must be boolean', `${path}.required`);
    }
    if (!PROOF_STATUSES.includes(row.status)) {
      throw new WorldProofError('Unexpected proof status', `${path}.status`);
    }
    if (!Array.isArray(row.evidence) || !Array.isArray(row.failures)) {
      throw new WorldProofError('Evidence and failures must be arrays', path);
    }
  }

  function requireExactKeys(value, allowed, path) {
    const expected = new Set(allowed);
    for (const key of Object.keys(value || {})) {
      if (!expected.has(key)) throw new WorldProofError(`Unknown field ${key}`, `${path}.${key}`);
    }
    for (const key of allowed) {
      if (!Object.hasOwn(value, key)) throw new WorldProofError(`Missing field ${key}`, `${path}.${key}`);
    }
  }

  function requireObject(value, path) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new WorldProofError('Expected an object', path);
    }
  }

  return Object.freeze({
    WORLD_PROOF_SCHEMA,
    WORLD_PROOF_BINDING_SCHEMA,
    WORLD_PROOF_CLASS_SCHEMA,
    INTENT_REQUIREMENT_LEDGER_SCHEMA: intentProofContract.INTENT_REQUIREMENT_LEDGER_SCHEMA,
    INTENT_SETTLEMENT_LEDGER_SCHEMA: intentProofContract.INTENT_SETTLEMENT_LEDGER_SCHEMA,
    INTENT_PROOF_RECEIPT_SCHEMA: intentProofContract.INTENT_PROOF_RECEIPT_SCHEMA,
    SEMANTIC_PROVENANCE_LEDGER_SCHEMA:
      semanticProofContract.SEMANTIC_PROVENANCE_LEDGER_SCHEMA,
    SEMANTIC_PROVENANCE_BINDING_SCHEMA:
      semanticProofContract.SEMANTIC_PROVENANCE_BINDING_SCHEMA,
    SEMANTIC_PROOF_RECEIPT_SCHEMA: semanticProofContract.SEMANTIC_PROOF_RECEIPT_SCHEMA,
    COMPILER_DETERMINISM_RECEIPT_SCHEMA:
      compilerProofContract.COMPILER_DETERMINISM_RECEIPT_SCHEMA,
    SIMULATION_REPRODUCIBILITY_RECEIPT_SCHEMA:
      simulationProofContract.SIMULATION_REPRODUCIBILITY_RECEIPT_SCHEMA,
    INTERACTION_PROOF_RECEIPT_SCHEMA:
      interactionProofContract.INTERACTION_PROOF_RECEIPT_SCHEMA,
    SAFETY_PROOF_RECEIPT_SCHEMA: safetyProofContract.SAFETY_PROOF_RECEIPT_SCHEMA,
    PROOF_CLASS_NAMES,
    PROOF_STATUSES,
    WorldProofError,
    canonicalJson,
    contentHash,
    createIntentRequirementLedger: intentProofContract.createIntentRequirementLedger,
    validateIntentRequirementLedger: intentProofContract.validateIntentRequirementLedger,
    createIntentSettlementLedger: intentProofContract.createIntentSettlementLedger,
    validateIntentSettlementLedger: intentProofContract.validateIntentSettlementLedger,
    createIntentProofReceipt: intentProofContract.createIntentProofReceipt,
    validateIntentProofReceipt: intentProofContract.validateIntentProofReceipt,
    createSemanticProvenanceLedger: semanticProofContract.createSemanticProvenanceLedger,
    validateSemanticProvenanceLedger: semanticProofContract.validateSemanticProvenanceLedger,
    createSemanticProofReceipt: semanticProofContract.createSemanticProofReceipt,
    validateSemanticProofReceipt: semanticProofContract.validateSemanticProofReceipt,
    createWorldProofBinding,
    createCompilerDeterminismReceipt:
      compilerProofContract.createCompilerDeterminismReceipt,
    validateCompilerDeterminismReceipt:
      compilerProofContract.validateCompilerDeterminismReceipt,
    createSimulationReproducibilityReceipt:
      simulationProofContract.createSimulationReproducibilityReceipt,
    validateSimulationReproducibilityReceipt:
      simulationProofContract.validateSimulationReproducibilityReceipt,
    createInteractionProofReceipt:
      interactionProofContract.createInteractionProofReceipt,
    validateInteractionProofReceipt:
      interactionProofContract.validateInteractionProofReceipt,
    captureSafetyCheckpoint: safetyProofContract.captureSafetyCheckpoint,
    createSafetyProofReceipt: safetyProofContract.createSafetyProofReceipt,
    validateSafetyProofReceipt: safetyProofContract.validateSafetyProofReceipt,
    createReplayBaseline,
    createReplayReceipt,
    createWorldProof,
    validateWorldProof,
  });
});
