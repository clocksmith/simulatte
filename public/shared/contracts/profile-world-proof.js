(function attachSimulatteProfileWorldProof(root, factory) {
  const worldSpec = typeof module === 'object' && module.exports
    ? require('./world-spec.js')
    : root.SimulatteWorldSpec;
  const worldProof = typeof module === 'object' && module.exports
    ? require('./world-proof.js')
    : root.SimulatteWorldProof;
  const intentProof = typeof module === 'object' && module.exports
    ? require('./world-proof-intent.js')
    : root.SimulatteWorldProofIntent;
  const semanticProof = typeof module === 'object' && module.exports
    ? require('./world-proof-semantic.js')
    : root.SimulatteWorldProofSemantic;
  if (!worldSpec || !worldProof || !intentProof || !semanticProof) {
    throw new Error('SimulatteProfileWorldProof requires WorldSpec, WorldProof, intent, and semantic contracts');
  }
  const api = factory(worldSpec, worldProof, intentProof, semanticProof);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteProfileWorldProof = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createProfileWorldProofApi(
  worldSpecContract,
  worldProofContract,
  intentProofContract,
  semanticProofContract
) {
  const PROFILE_TEMPLATE_ID = 'simulatte.profile-conformance.v1';
  const PROFILE_RUNTIME_ID = 'simulatte.world.profile-runtime.v1';
  const PROFILE_SIMULATION_RECEIPT_SCHEMA = 'simulatte.profileSimulationProofReceipt.v1';
  const PROFILE_SCENE_PROOF_SCHEMA = 'simulatte.profileSceneProof.v1';
  const PROFILE_REPLAY_EXECUTION_SCHEMA = 'simulatte.profileReplayExecutionIdentity.v1';
  const PROFILE_DETERMINISM_CLASSES = Object.freeze([
    'compiler-deterministic',
    'replay-identified',
  ]);
  const SHA256_PATTERN = /^[a-f0-9]{64}$/i;

  class ProfileWorldProofError extends Error {
    constructor(code, message, evidence = null) {
      super(`${code}: ${message}`);
      this.name = 'SimulatteProfileWorldProofError';
      this.code = code;
      this.evidence = evidence;
    }
  }

  function createProfileWorldProof(options = {}) {
    const proof = buildProfileWorldProof(options);
    return validateProfileWorldProof(proof, options);
  }

  function buildProfileWorldProof(options = {}) {
    const spec = options.spec || null;
    const run = options.run || {};
    const evidence = options.evidence || {};
    const sourceIdentity = options.sourceIdentity || {};
    const browser = options.browser || {};
    assertProfileBinding(spec, run);
    const binding = worldProofContract.createWorldProofBinding(spec, {
      buildId: String(sourceIdentity.build && sourceIdentity.build.buildId || ''),
      runtimeId: PROFILE_RUNTIME_ID,
    });
    const intentReceipt = intentProofContract.createIntentProofReceipt({ spec, binding });
    const semanticReceipt = semanticProofContract.createSemanticProofReceipt({ spec, binding });
    const compilerDeterminismReceipt = createProfileCompilerReceipt(options, binding);
    const simulationReceipt = createProfileSimulationReceipt(spec, run, evidence, options.runtime || {});
    const sceneProof = createProfileSceneProof(spec, run, evidence, options.claims || []);
    const baselineExecution = createReplayExecutionIdentity(spec, run, evidence.replay, 'before');
    const replayExecution = createReplayExecutionIdentity(spec, run, evidence.replay, 'after');
    const commonReplay = {
      binding,
      compilerDeterminismReceipt,
      intentReceipt,
      semanticReceipt,
      sceneProof,
      simulationReceipt,
      deviceClass: profileDeviceClass(browser),
    };
    const replayReceipt = worldProofContract.createReplayReceipt(
      worldProofContract.createReplayBaseline({
        ...commonReplay,
        executionReceipt: baselineExecution,
      }),
      {
        ...commonReplay,
        executionReceipt: replayExecution,
      }
    );
    return worldProofContract.createWorldProof({
      binding,
      compilerDeterminismReceipt,
      intentReceipt,
      semanticReceipt,
      sceneProof,
      simulationReceipt,
      replayReceipt,
      runtimeReceiptId: String(
        options.runtime && options.runtime.runReceipt && options.runtime.runReceipt.contentSha256 ||
        run.id || ''
      ),
      renderDataKey: String(evidence.screenshot && evidence.screenshot.sha256 || ''),
      nowIso: String(options.nowIso || new Date().toISOString()),
    });
  }

  function createProfileCompilerReceipt(options, binding) {
    const retained = options.runtime && options.runtime.compilerDeterminismReceipt || null;
    if (retained) {
      worldProofContract.validateCompilerDeterminismReceipt(retained);
      return canonicalValue(retained);
    }
    return worldProofContract.createCompilerDeterminismReceipt({
      binding,
      recompiledSpec: options.recompiledSpec || null,
      independentExecution: options.independentCompilerExecution === true,
      error: options.compilerError || null,
    });
  }

  function validateProfileWorldProof(proof, options = {}) {
    worldProofContract.validateWorldProof(proof);
    const spec = options.spec || null;
    const run = options.run || {};
    assertProfileBinding(spec, run);
    if (
      proof.worldSpec.id !== spec.id ||
      proof.worldSpec.contentHash !== spec.contentHash ||
      proof.worldSpec.revision !== spec.authorship.revision
    ) {
      fail('profile_world_proof_spec_rebound', 'WorldProof does not bind the executed profile WorldSpec', {
        expected: { id: spec.id, contentHash: spec.contentHash, revision: spec.authorship.revision },
        actual: proof.worldSpec,
      });
    }
    const expected = buildProfileWorldProof({ ...options, nowIso: proof.createdAt });
    if (worldProofContract.canonicalJson(expected) !== worldProofContract.canonicalJson(proof)) {
      fail('profile_world_proof_evidence_mismatch', 'WorldProof does not match the supplied profile execution evidence', null);
    }
    return proof;
  }

  function createProfileSimulationReceipt(spec, run, evidence = {}, runtime = {}) {
    const settlements = Array.isArray(evidence.settlements) ? evidence.settlements : [];
    const settled = settlements.length > 0 && settlements.every(isSettledEvidence);
    const runReceipt = runtime.runReceipt || null;
    const runReceiptSettled = Boolean(
      runReceipt &&
      runReceipt.profileId === run.profileId &&
      runReceipt.scenario && runReceipt.scenario.id === run.seedId &&
      runReceipt.scenario.seed === run.seed &&
      runReceipt.status === 'settled'
    );
    const failureCodes = [];
    if (!runReceiptSettled) failureCodes.push('profile-run-receipt-unsettled');
    if (!settled) failureCodes.push('profile-settlement-evidence-unsettled');
    return canonicalValue({
      schema: PROFILE_SIMULATION_RECEIPT_SCHEMA,
      status: failureCodes.length ? 'fail' : 'pass',
      worldSpecContentHash: spec.contentHash,
      worldSpecRevision: spec.authorship.revision,
      profileId: run.profileId,
      scenarioId: run.seedId,
      scenarioSeed: run.seed,
      runReceiptSha256: String(runReceipt && runReceipt.contentSha256 || ''),
      settlementCount: settlements.length,
      settlementContentHash: valueHash(settlements),
      failureCodes,
    });
  }

  function createProfileSceneProof(spec, run, evidence = {}, claims = []) {
    const screenshot = evidence.screenshot || {};
    const pixelReadback = evidence.pixelReadback || {};
    const visual = evidence.visual || {};
    const machineEvidencePass = Boolean(
      visual.schema === 'simulatte.renderedEvidence.v1' &&
      visual.canvas && visual.canvas.width > 0 && visual.canvas.height > 0 &&
      SHA256_PATTERN.test(String(screenshot.sha256 || '')) &&
      pixelReadback.status === 'pass' &&
      (!pixelReadback.sha256 || pixelReadback.sha256 === screenshot.sha256)
    );
    const obligations = (Array.isArray(claims) ? claims : []).map((claim) => ({
      obligationId: String(claim && claim.id || ''),
      required: true,
      status: machineEvidencePass ? 'not-proven' : 'fail',
    })).filter((row) => row.obligationId);
    return canonicalValue({
      schema: PROFILE_SCENE_PROOF_SCHEMA,
      verdict: machineEvidencePass ? 'not-proven' : 'fail',
      worldSpecContentHash: spec.contentHash,
      profileId: run.profileId,
      scenarioId: run.seedId,
      screenshotSha256: String(screenshot.sha256 || ''),
      pixelReadbackStatus: String(pixelReadback.status || ''),
      humanReviewStatus: 'required',
      summary: {
        required: obligations.length,
        settled: 0,
        failed: machineEvidencePass ? 0 : obligations.length,
        notProven: machineEvidencePass ? obligations.length : 0,
      },
      settledObligations: obligations,
    });
  }

  function createReplayExecutionIdentity(spec, run, replay = {}, role) {
    const hash = role === 'before' ? replay.beforeSha256 : replay.afterSha256;
    const valid = replay.attempted === true && SHA256_PATTERN.test(String(hash || ''));
    return canonicalValue({
      schema: PROFILE_REPLAY_EXECUTION_SCHEMA,
      status: valid ? 'pass' : 'fail',
      contentHash: valid ? String(hash) : `missing-${role}`,
      profileId: run.profileId,
      scenarioId: run.seedId,
      scenarioSeed: run.seed,
      worldSpecContentHash: spec.contentHash,
    });
  }

  function profileDeviceClass(browser = {}) {
    const gpu = browser.gpu || {};
    if (gpu.available === true) {
      const identity = [
        gpu.rendererBackend || gpu.backend,
        gpu.vendor,
        gpu.architecture,
        gpu.device,
        gpu.description,
      ].map(identifierPart).filter(Boolean).join(':');
      return `webgpu:${identity || 'identified-adapter'}`;
    }
    return `canvas2d:${identifierPart(browser.product) || 'identified-browser'}`;
  }

  function isSettledEvidence(value) {
    if (!value || typeof value !== 'object') return false;
    if (value.status === 'settled') return true;
    return Array.isArray(value.obligationResults) && value.obligationResults.length > 0 &&
      value.obligationResults.every((row) => row && row.status === 'settled');
  }

  function assertProfileBinding(spec, run) {
    worldSpecContract.validateWorldSpec(spec);
    if (spec.templateId !== PROFILE_TEMPLATE_ID || spec.kind !== 'governed-profile') {
      fail('profile_world_proof_template_invalid', 'WorldProof requires a governed profile WorldSpec', null);
    }
    if (
      spec.params.profileId !== run.profileId ||
      spec.params.scenarioId !== run.seedId ||
      spec.params.scenarioSeed !== run.seed
    ) {
      fail('profile_world_proof_run_rebound', 'WorldSpec does not match the evidence run', {
        profileId: run.profileId,
        seedId: run.seedId,
        seed: run.seed,
      });
    }
    const requiredClasses = spec.determinism && spec.determinism.requiredClasses || [];
    if (canonicalJson(requiredClasses) !== canonicalJson(PROFILE_DETERMINISM_CLASSES)) {
      fail(
        'profile_world_proof_determinism_overclaimed',
        'Profile WorldSpec determinism classes must match the independent compiler and replay harness',
        { requiredClasses }
      );
    }
  }

  function identifierPart(value) {
    return String(value || '').trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-|-$/g, '');
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

  function fail(code, message, evidence) {
    throw new ProfileWorldProofError(code, message, evidence);
  }

  return Object.freeze({
    PROFILE_RUNTIME_ID,
    PROFILE_SIMULATION_RECEIPT_SCHEMA,
    PROFILE_SCENE_PROOF_SCHEMA,
    PROFILE_REPLAY_EXECUTION_SCHEMA,
    PROFILE_DETERMINISM_CLASSES,
    ProfileWorldProofError,
    createProfileWorldProof,
    validateProfileWorldProof,
    profileDeviceClass,
  });
});
