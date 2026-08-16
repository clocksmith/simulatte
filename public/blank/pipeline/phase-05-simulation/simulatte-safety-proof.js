(function attachSimulatteSafetyProof(root) {
  const registry = typeof module === 'object' && module.exports
    ? require('../../app/runtime/phase-module-registry.js')
    : root.SimulattePhaseModuleRegistry;
  const scope = registry.family('physicsModel');
  const MAX_SAFETY_STEPS = 1024;
  const MAX_SAFETY_STEP_SECONDS = 1;

  function createSafetyProofReceiptForSpec(inputSpec, options = {}) {
    const spec = scope.normalizeSpec(inputSpec);
    if (!spec.safety || spec.safety.status !== 'declared') return null;
    const binding = scope.worldProof.createWorldProofBinding(spec, {
      buildId: options.buildId,
      runtimeId: options.runtimeId,
    });
    const policy = binding && binding.simulationReproducibility &&
      binding.simulationReproducibility.policy || null;
    let baselineCheckpoints;
    let replayCheckpoints;
    let error = null;
    try {
      validateSafetyExecutionPolicy(policy);
      baselineCheckpoints = runSafetyExecution(spec, policy);
      replayCheckpoints = runSafetyExecution(spec, policy);
    } catch (executionError) {
      error = executionError;
    }
    return scope.worldProof.createSafetyProofReceipt({
      binding,
      baselineCheckpoints,
      replayCheckpoints,
      independentExecution: !error,
      error,
    });
  }

  function runSafetyExecution(spec, policy) {
    const rules = spec.safety.rules;
    let state = scope.createSimulationState(spec);
    const checkpoints = [scope.worldProof.captureSafetyCheckpoint(rules, state, 0)];
    for (let index = 0; index < policy.stepCount; index += 1) {
      state = scope.stepSimulation(state, spec, policy.stepSeconds);
      checkpoints.push(scope.worldProof.captureSafetyCheckpoint(rules, state, index + 1));
    }
    return checkpoints;
  }

  function validateSafetyExecutionPolicy(policy) {
    if (!policy || policy.schema !== 'simulatte.simulationReproducibilityPolicy.v1') {
      throw safetyPolicyError('SIMULATTE_SAFETY_PROOF_POLICY_MISSING', 'Safety proof policy is missing');
    }
    if (!Number.isInteger(policy.stepCount) || policy.stepCount < 1 ||
        policy.stepCount > MAX_SAFETY_STEPS) {
      throw safetyPolicyError(
        'SIMULATTE_SAFETY_PROOF_POLICY_UNSAFE',
        `Safety proof stepCount must be between 1 and ${MAX_SAFETY_STEPS}`
      );
    }
    if (!Number.isFinite(policy.stepSeconds) || policy.stepSeconds <= 0 ||
        policy.stepSeconds > MAX_SAFETY_STEP_SECONDS) {
      throw safetyPolicyError(
        'SIMULATTE_SAFETY_PROOF_POLICY_UNSAFE',
        `Safety proof stepSeconds must be greater than 0 and at most ${MAX_SAFETY_STEP_SECONDS}`
      );
    }
  }

  function safetyPolicyError(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
  }

  registry.define('physicsModel', 'simulatte-safety-proof.js', {
    createSafetyProofReceiptForSpec,
    runSafetyExecution,
  });
})(typeof globalThis !== 'undefined' ? globalThis : window);
