(function attachSimulatteSimulationReproducibility(root) {
  const registry = typeof module === 'object' && module.exports
    ? require('../../app/runtime/phase-module-registry.js')
    : root.SimulattePhaseModuleRegistry;
  const scope = registry.family('physicsModel');
  const MAX_PROOF_STEPS = 1024;
  const MAX_PROOF_STEP_SECONDS = 1;

  function createSimulationReproducibilityReceiptForSpec(inputSpec, options = {}) {
    const spec = scope.normalizeSpec(inputSpec);
    const requiredClasses = spec.determinism && Array.isArray(spec.determinism.requiredClasses)
      ? spec.determinism.requiredClasses : [];
    if (!requiredClasses.includes('simulation-reproducible')) return null;
    const binding = scope.worldProof.createWorldProofBinding(spec, {
      buildId: options.buildId,
      runtimeId: options.runtimeId,
    });
    const policy = binding && binding.simulationReproducibility &&
      binding.simulationReproducibility.policy || null;
    let baselineState;
    let replayState;
    let error = null;
    try {
      validateExecutionPolicy(policy);
      baselineState = runFixedStepSimulation(spec, policy);
      replayState = runFixedStepSimulation(spec, policy);
    } catch (executionError) {
      error = executionError;
    }
    return scope.worldProof.createSimulationReproducibilityReceipt({
      binding,
      baselineState,
      replayState,
      independentExecution: !error,
      error,
    });
  }

  function runFixedStepSimulation(spec, policy) {
    let state = scope.createSimulationState(spec);
    for (let index = 0; index < policy.stepCount; index += 1) {
      state = scope.stepSimulation(state, spec, policy.stepSeconds);
    }
    return state;
  }

  function validateExecutionPolicy(policy) {
    if (!policy || policy.schema !== 'simulatte.simulationReproducibilityPolicy.v1') {
      throw proofPolicyError('SIMULATTE_SIMULATION_PROOF_POLICY_MISSING', 'Simulation proof policy is missing');
    }
    if (!Number.isInteger(policy.stepCount) || policy.stepCount < 1 || policy.stepCount > MAX_PROOF_STEPS) {
      throw proofPolicyError(
        'SIMULATTE_SIMULATION_PROOF_POLICY_UNSAFE',
        `Simulation proof stepCount must be between 1 and ${MAX_PROOF_STEPS}`
      );
    }
    if (!Number.isFinite(policy.stepSeconds) || policy.stepSeconds <= 0 ||
        policy.stepSeconds > MAX_PROOF_STEP_SECONDS) {
      throw proofPolicyError(
        'SIMULATTE_SIMULATION_PROOF_POLICY_UNSAFE',
        `Simulation proof stepSeconds must be greater than 0 and at most ${MAX_PROOF_STEP_SECONDS}`
      );
    }
    if (!Number.isInteger(policy.maxStateNodes) || policy.maxStateNodes < 1) {
      throw proofPolicyError(
        'SIMULATTE_SIMULATION_PROOF_POLICY_UNSAFE',
        'Simulation proof maxStateNodes must be a positive integer'
      );
    }
  }

  function proofPolicyError(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
  }

  registry.define('physicsModel', 'simulatte-simulation-reproducibility.js', {
    createSimulationReproducibilityReceiptForSpec,
    runFixedStepSimulation,
  });
})(typeof globalThis !== 'undefined' ? globalThis : window);
