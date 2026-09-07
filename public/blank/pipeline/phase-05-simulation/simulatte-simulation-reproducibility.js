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

  function createSimulationPlaybackClock(spec) {
    const policy = spec.source && spec.source.compilerConfig && spec.source.compilerConfig.simulationProof ||
      scope.DEFAULT_SIMULATION_PROOF_POLICY;
    validateExecutionPolicy(policy);
    const stepSeconds = policy.stepSeconds;
    let accumulatedSeconds = 0;
    return Object.freeze({
      stepSeconds,
      advance(state, currentSpec, elapsedSeconds) {
        if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0) {
          throw proofPolicyError('SIMULATTE_PLAYBACK_INTERVAL_INVALID', 'Playback interval must be finite and non-negative');
        }
        accumulatedSeconds += elapsedSeconds;
        const available = Math.floor((accumulatedSeconds + stepSeconds * 1e-9) / stepSeconds);
        // Retain excess work as debt instead of changing the simulation timestep.
        const steps = Math.min(available, 64);
        for (let index = 0; index < steps; index += 1) {
          state = scope.stepSimulation(state, currentSpec, stepSeconds);
          accumulatedSeconds = Math.max(0, accumulatedSeconds - stepSeconds);
        }
        return state;
      },
    });
  }

  function validateReplayPolicy(policy) {
    if (policy?.schema !== 'simulatte.simulationReplayPolicy.v1' ||
        !Number.isSafeInteger(policy.maxSteps) || policy.maxSteps < 1 || policy.maxSteps > 4096 ||
        !Number.isSafeInteger(policy.maxCommands) || policy.maxCommands < 1 || policy.maxCommands > 64) {
      throw proofPolicyError('SIMULATTE_REPLAY_BUDGET_INVALID', 'Replay requires bounded steps and commands');
    }
  }

  async function createSimulationReplayInput(inputSpec, inputState, inputPolicy, baseline) {
    const contracts = scope.phaseContracts;
    const captured = contracts.immutableArtifact({ spec: inputSpec, state: inputState, policy: inputPolicy, baseline });
    const { spec, state, policy } = captured;
    scope.worldSpec.validateWorldSpec(spec);
    validateReplayPolicy(policy);
    const simulationPolicy = spec.source.compilerConfig.simulationProof;
    validateExecutionPolicy(simulationPolicy);
    const stepSeconds = simulationPolicy.stepSeconds;
    const stepFor = time => {
      const step = Math.round(time / stepSeconds);
      if (!Number.isFinite(time) || time < 0 || !Number.isSafeInteger(step) || step > policy.maxSteps ||
          Math.abs(time - step * stepSeconds) > stepSeconds * 1e-8) {
        throw proofPolicyError('SIMULATTE_REPLAY_TIME_INVALID', 'Replay time is outside its fixed-step budget or grid');
      }
      return step;
    };
    const totalSteps = stepFor(state.t);
    const interaction = state.interaction;
    if (!interaction || !Array.isArray(interaction.receipts) ||
        interaction.commandCount !== interaction.receipts.length || interaction.commandCount > policy.maxCommands) {
      throw proofPolicyError('SIMULATTE_REPLAY_HISTORY_INCOMPLETE', 'Replay requires the complete bounded interaction history');
    }
    let previousStep = 0;
    const commands = interaction.receipts.map(row => {
      if (row.schema !== 'simulatte.interactionCommandReceipt.v2' || !row.command ||
          contracts.canonicalJson(scope.createInteractionCommand(row.command)) !== contracts.canonicalJson(row.command) ||
          ['sequence', 'actionId', 'targetId', 'bindingId', 'point', 'delta'].some(key =>
            contracts.canonicalJson(row.command[key]) !== contracts.canonicalJson(row[key]))) {
        throw proofPolicyError('SIMULATTE_REPLAY_INPUT_MISSING', 'Replay requires original normalized command inputs');
      }
      const step = stepFor(row.simulationTime);
      if (step < previousStep || step > totalSteps) throw proofPolicyError('SIMULATTE_REPLAY_TIME_INVALID', 'Replay command order contradicts execution time');
      previousStep = step;
      return { step, command: row.command };
    });
    if (captured.baseline?.schema !== 'simulatte.replayBaseline.v1' ||
        captured.baseline.identity?.worldSpecContentHash !== spec.contentHash) {
      throw proofPolicyError('SIMULATTE_REPLAY_BASELINE_INVALID', 'Replay baseline does not bind this WorldSpec');
    }
    return contracts.immutableArtifact({ schema: 'simulatte.simulationReplayInput.v1',
      worldSpecDigest: await contracts.artifactDigest(spec), policy, stepSeconds, totalSteps,
      commands, expectedState: state, baseline: captured.baseline });
  }

  async function replaySimulationState(spec, input, signal) {
    const contracts = scope.phaseContracts;
    input = contracts.immutableArtifact(input);
    if (input.schema !== 'simulatte.simulationReplayInput.v1' ||
        input.worldSpecDigest !== await contracts.artifactDigest(spec)) {
      throw proofPolicyError('SIMULATTE_REPLAY_SOURCE_INVALID', 'Replay input belongs to another authored program');
    }
    const verified = await createSimulationReplayInput(spec, input.expectedState, input.policy, input.baseline);
    if (contracts.canonicalJson(verified) !== contracts.canonicalJson(input)) {
      throw proofPolicyError('SIMULATTE_REPLAY_INPUT_INVALID', 'Replay schedule contradicts its captured execution');
    }
    let state = scope.createSimulationState(spec);
    let cursor = 0;
    for (let step = 0; step <= input.totalSteps; step++) {
      if (signal?.aborted) throw signal.reason;
      while (cursor < input.commands.length && input.commands[cursor].step === step) {
        state = scope.applyInteractionCommands(state, spec.interactionIR, [input.commands[cursor++].command]);
      }
      if (step < input.totalSteps) state = scope.stepSimulation(state, spec, input.stepSeconds);
      if (step > 0 && step % 64 === 0) await new Promise(resolve => setTimeout(resolve, 0));
    }
    if (signal?.aborted) throw signal.reason;
    if (contracts.canonicalJson(state) !== contracts.canonicalJson(input.expectedState)) {
      throw proofPolicyError('SIMULATTE_REPLAY_STATE_DIVERGED', 'Independent replay did not reproduce the captured simulation state');
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
    createSimulationReplayInput,
    replaySimulationState,
    createSimulationPlaybackClock,
  });
})(typeof globalThis !== 'undefined' ? globalThis : window);
