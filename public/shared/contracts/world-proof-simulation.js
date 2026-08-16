(function attachSimulatteWorldProofSimulation(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteWorldProofSimulation = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createSimulationProofApi() {
  const SIMULATION_REPRODUCIBILITY_RECEIPT_SCHEMA =
    'simulatte.simulationReproducibilityReceipt.v1';
  const HASH_PREFIX = 'fnv1a32:';
  const MAX_MISMATCH_PATHS = 16;

  class SimulationProofError extends Error {
    constructor(message, path = '$.simulationReproducibilityReceipt') {
      super(`${message} at ${path}`);
      this.name = 'SimulationProofError';
      this.path = path;
    }
  }

  function canonicalValue(value, counter = { nodes: 0 }, limit = Number.MAX_SAFE_INTEGER) {
    counter.nodes += 1;
    if (counter.nodes > limit) throw new SimulationProofError('Simulation proof state exceeds its declared node limit');
    if (ArrayBuffer.isView(value)) {
      return Array.from(value, (row) => canonicalValue(row, counter, limit));
    }
    if (Array.isArray(value)) return value.map((row) => canonicalValue(row, counter, limit));
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.keys(value).sort().flatMap((key) => (
        value[key] === undefined ? [] : [[key, canonicalValue(value[key], counter, limit)]]
      )));
    }
    if (typeof value === 'number' && !Number.isFinite(value)) {
      throw new SimulationProofError('Simulation proof state contains a non-finite number');
    }
    return value;
  }

  function canonicalJson(value) {
    return JSON.stringify(value);
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
    return `${HASH_PREFIX}${fnv1a32(canonicalJson(value)).toString(16).padStart(8, '0')}`;
  }

  function stateEvidence(state, maxStateNodes) {
    const counter = { nodes: 0 };
    const canonical = canonicalValue(state, counter, maxStateNodes);
    return {
      canonical,
      nodeCount: counter.nodes,
      contentHash: contentHash(canonical),
    };
  }

  function compareStates(left, right, tolerance) {
    const result = { maxAbsoluteDelta: 0, mismatchPaths: [] };
    compareValue(left, right, '$', tolerance, result);
    return result;
  }

  function compareValue(left, right, path, tolerance, result) {
    if (typeof left === 'number' && typeof right === 'number') {
      const delta = Math.abs(left - right);
      result.maxAbsoluteDelta = Math.max(result.maxAbsoluteDelta, delta);
      if (delta > tolerance) recordMismatch(result, path);
      return;
    }
    if (Array.isArray(left) || Array.isArray(right)) {
      if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
        recordMismatch(result, path);
        return;
      }
      left.forEach((row, index) => compareValue(row, right[index], `${path}[${index}]`, tolerance, result));
      return;
    }
    const leftObject = left && typeof left === 'object';
    const rightObject = right && typeof right === 'object';
    if (leftObject || rightObject) {
      if (!leftObject || !rightObject) {
        recordMismatch(result, path);
        return;
      }
      const leftKeys = Object.keys(left);
      const rightKeys = Object.keys(right);
      if (canonicalJson(leftKeys) !== canonicalJson(rightKeys)) {
        recordMismatch(result, path);
        return;
      }
      leftKeys.forEach((key) => compareValue(left[key], right[key], `${path}.${key}`, tolerance, result));
      return;
    }
    if (left !== right) recordMismatch(result, path);
  }

  function recordMismatch(result, path) {
    if (result.mismatchPaths.length < MAX_MISMATCH_PATHS) result.mismatchPaths.push(path);
  }

  function createSimulationReproducibilityReceipt(options = {}) {
    const binding = options.binding || null;
    const expected = binding && binding.simulationReproducibility || {};
    const policy = expected.policy || {};
    const stepCount = Number(policy.stepCount || 0);
    const stepSeconds = Number(policy.stepSeconds || 0);
    const maxStateNodes = Number(policy.maxStateNodes || 0);
    const tolerance = Number(expected.tolerance);
    let baseline = null;
    let replay = null;
    let error = options.error || null;
    if (!error && options.baselineState !== undefined && options.replayState !== undefined) {
      try {
        baseline = stateEvidence(options.baselineState, maxStateNodes);
        replay = stateEvidence(options.replayState, maxStateNodes);
      } catch (stateError) {
        error = stateError;
      }
    }
    const comparison = baseline && replay
      ? compareStates(baseline.canonical, replay.canonical, tolerance)
      : { maxAbsoluteDelta: 0, mismatchPaths: [] };
    const independentExecution = options.independentExecution === true;
    const facts = {
      binding,
      policy,
      stepCount,
      stepSeconds,
      maxStateNodes,
      tolerance,
      baseline,
      replay,
      comparison,
      independentExecution,
      stateInputsValid: Boolean(
        options.baselineState && typeof options.baselineState === 'object' &&
        options.replayState && typeof options.replayState === 'object'
      ),
      error,
    };
    const failureCode = simulationFailureCode(facts);
    const receipt = {
      schema: SIMULATION_REPRODUCIBILITY_RECEIPT_SCHEMA,
      status: failureCode ? 'fail' : 'pass',
      failureCode,
      reason: failureCode
        ? String(error && error.message || simulationFailureReason(failureCode))
        : 'Independent fixed-step executions reproduced the declared simulation state',
      independentExecution,
      worldSpecContentHash: String(binding && binding.worldSpec && binding.worldSpec.contentHash || ''),
      worldSpecRevision: Number(binding && binding.worldSpec && binding.worldSpec.revision || 0),
      buildId: String(binding && binding.replayIdentity && binding.replayIdentity.buildId || ''),
      policyHash: String(expected.policyHash || ''),
      seed: Object.hasOwn(expected, 'seed') ? expected.seed : null,
      stepCount,
      stepSeconds,
      tolerance,
      maxStateNodes,
      baselineStateHash: String(baseline && baseline.contentHash || ''),
      replayStateHash: String(replay && replay.contentHash || ''),
      baselineStateNodeCount: Number(baseline && baseline.nodeCount || 0),
      replayStateNodeCount: Number(replay && replay.nodeCount || 0),
      maxAbsoluteDelta: Number(comparison.maxAbsoluteDelta || 0),
      mismatchPaths: comparison.mismatchPaths,
    };
    return validateSimulationReproducibilityReceipt(receipt);
  }

  function simulationFailureCode(facts) {
    if (facts.error) return facts.error instanceof SimulationProofError
      ? 'simulation-state-invalid' : String(facts.error.code || 'simulation-execution-failed');
    if (!facts.binding || !facts.binding.worldSpec) return 'simulation-binding-missing';
    if (!facts.binding.replayIdentity || !facts.binding.replayIdentity.buildId) return 'simulation-build-identity-missing';
    if (!facts.policy || facts.policy.schema !== 'simulatte.simulationReproducibilityPolicy.v1') {
      return 'simulation-policy-missing';
    }
    if (!Number.isInteger(facts.stepCount) || facts.stepCount < 1 || !Number.isFinite(facts.stepSeconds) || facts.stepSeconds <= 0 ||
        !Number.isInteger(facts.maxStateNodes) || facts.maxStateNodes < 1 || !Number.isFinite(facts.tolerance) || facts.tolerance < 0) {
      return 'simulation-policy-invalid';
    }
    if (!facts.independentExecution) return 'independent-simulation-execution-missing';
    if (!facts.stateInputsValid || !facts.baseline || !facts.replay) return 'simulation-state-missing';
    if (facts.comparison.mismatchPaths.length) return 'simulation-state-mismatch';
    return '';
  }

  function simulationFailureReason(code) {
    return ({
      'simulation-binding-missing': 'Simulation proof is not bound to a WorldSpec',
      'simulation-build-identity-missing': 'Simulation proof build identity is missing',
      'simulation-policy-missing': 'No fixed-step simulation proof policy was declared',
      'simulation-policy-invalid': 'The fixed-step simulation proof policy is invalid',
      'independent-simulation-execution-missing': 'A second simulation execution was not recorded',
      'simulation-state-missing': 'One or both simulation states are missing',
      'simulation-state-mismatch': 'Fixed-step simulation states exceeded the declared tolerance',
    })[code] || 'Simulation reproducibility proof failed';
  }

  function validateSimulationReproducibilityReceipt(receipt) {
    requireObject(receipt);
    requireExactKeys(receipt, [
      'schema', 'status', 'failureCode', 'reason', 'independentExecution',
      'worldSpecContentHash', 'worldSpecRevision', 'buildId', 'policyHash', 'seed',
      'stepCount', 'stepSeconds', 'tolerance', 'maxStateNodes', 'baselineStateHash',
      'replayStateHash', 'baselineStateNodeCount', 'replayStateNodeCount',
      'maxAbsoluteDelta', 'mismatchPaths',
    ]);
    if (receipt.schema !== SIMULATION_REPRODUCIBILITY_RECEIPT_SCHEMA) {
      throw new SimulationProofError('Unexpected simulation-reproducibility receipt schema');
    }
    if (!['pass', 'fail'].includes(receipt.status)) {
      throw new SimulationProofError('Unexpected simulation-reproducibility status');
    }
    for (const key of [
      'failureCode', 'reason', 'worldSpecContentHash', 'buildId', 'policyHash',
      'baselineStateHash', 'replayStateHash',
    ]) {
      if (typeof receipt[key] !== 'string') throw new SimulationProofError(`Expected string field ${key}`);
    }
    for (const key of ['worldSpecRevision', 'stepCount', 'maxStateNodes', 'baselineStateNodeCount', 'replayStateNodeCount']) {
      if (!Number.isInteger(receipt[key]) || receipt[key] < 0) {
        throw new SimulationProofError(`Expected nonnegative integer field ${key}`);
      }
    }
    for (const key of ['stepSeconds', 'tolerance', 'maxAbsoluteDelta']) {
      if (!Number.isFinite(receipt[key]) || receipt[key] < 0) {
        throw new SimulationProofError(`Expected nonnegative finite field ${key}`);
      }
    }
    if (receipt.seed !== null && !Number.isFinite(receipt.seed)) {
      throw new SimulationProofError('Simulation proof seed must be finite or null');
    }
    if (typeof receipt.independentExecution !== 'boolean' || !Array.isArray(receipt.mismatchPaths) ||
        receipt.mismatchPaths.some((row) => typeof row !== 'string')) {
      throw new SimulationProofError('Simulation proof execution and mismatch fields are invalid');
    }
    if (receipt.status === 'pass' && (
      receipt.failureCode || !receipt.reason || !receipt.independentExecution ||
      !receipt.worldSpecContentHash || !receipt.buildId || !receipt.policyHash ||
      receipt.stepCount < 1 || receipt.stepSeconds <= 0 || receipt.maxStateNodes < 1 ||
      !receipt.baselineStateHash || !receipt.replayStateHash || receipt.mismatchPaths.length ||
      receipt.maxAbsoluteDelta > receipt.tolerance
    )) {
      throw new SimulationProofError('Passing simulation-reproducibility receipt is incomplete');
    }
    return receipt;
  }

  function simulationReproducibilityStatus(receipt, binding) {
    if (!receipt) return 'not-proven';
    try {
      validateSimulationReproducibilityReceipt(receipt);
    } catch (_error) {
      return 'fail';
    }
    const expected = binding && binding.simulationReproducibility || {};
    const worldSpec = binding && binding.worldSpec || {};
    const replay = binding && binding.replayIdentity || {};
    const policy = expected.policy || {};
    const matches = receipt.worldSpecContentHash === String(worldSpec.contentHash || '') &&
      receipt.worldSpecRevision === Number(worldSpec.revision || 0) &&
      receipt.buildId === String(replay.buildId || '') &&
      receipt.policyHash === String(expected.policyHash || '') &&
      receipt.seed === (Object.hasOwn(expected, 'seed') ? expected.seed : null) &&
      receipt.stepCount === Number(policy.stepCount || 0) &&
      receipt.stepSeconds === Number(policy.stepSeconds || 0) &&
      receipt.maxStateNodes === Number(policy.maxStateNodes || 0) &&
      receipt.tolerance === Number(expected.tolerance);
    return receipt.status === 'pass' && matches ? 'pass' : 'fail';
  }

  function requireObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new SimulationProofError('Simulation-reproducibility receipt must be an object');
    }
  }

  function requireExactKeys(value, allowed) {
    const expected = new Set(allowed);
    for (const key of Object.keys(value || {})) {
      if (!expected.has(key)) throw new SimulationProofError(`Unknown field ${key}`);
    }
    for (const key of allowed) {
      if (!Object.hasOwn(value, key)) throw new SimulationProofError(`Missing field ${key}`);
    }
  }

  return Object.freeze({
    SIMULATION_REPRODUCIBILITY_RECEIPT_SCHEMA,
    SimulationProofError,
    createSimulationReproducibilityReceipt,
    validateSimulationReproducibilityReceipt,
    simulationReproducibilityStatus,
  });
});
