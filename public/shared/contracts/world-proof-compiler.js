(function attachSimulatteWorldProofCompiler(root, factory) {
  const worldSpec = typeof module === 'object' && module.exports
    ? require('./world-spec.js')
    : root.SimulatteWorldSpec;
  if (!worldSpec) throw new Error('SimulatteWorldProofCompiler requires WorldSpec');
  const api = factory(worldSpec);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteWorldProofCompiler = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createCompilerProofApi(worldSpecContract) {
  const COMPILER_DETERMINISM_RECEIPT_SCHEMA = 'simulatte.compilerDeterminismReceipt.v1';
  const HASH_PREFIX = 'fnv1a32:';

  class CompilerProofError extends Error {
    constructor(message, path = '$.compilerDeterminismReceipt') {
      super(`${message} at ${path}`);
      this.name = 'CompilerProofError';
      this.path = path;
    }
  }

  function canonicalValue(value) {
    if (Array.isArray(value)) return value.map(canonicalValue);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]));
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

  function compilerInputIdentity(spec = {}) {
    const prompt = String(spec.source && spec.source.prompt || '');
    const compilerConfig = spec.source && spec.source.compilerConfig || {};
    return {
      compilerConfigHash: `${HASH_PREFIX}${fnv1a32(canonicalJson(compilerConfig)).toString(16).padStart(8, '0')}`,
      compilerInputHash: `${HASH_PREFIX}${fnv1a32(canonicalJson({ prompt, compilerConfig })).toString(16).padStart(8, '0')}`,
      compilerLane: String(compilerConfig.compilerLane || ''),
    };
  }

  function createCompilerDeterminismReceipt(options = {}) {
    const binding = options.binding || null;
    const compilation = binding && binding.compilation || {};
    const recompiledSpec = options.recompiledSpec || null;
    let error = options.error || null;
    if (recompiledSpec && !error) {
      try {
        worldSpecContract.validateWorldSpec(recompiledSpec);
      } catch (contractError) {
        error = contractError;
      }
    }
    const recompiledInput = recompiledSpec ? compilerInputIdentity(recompiledSpec) : {};
    const independentExecution = options.independentExecution === true;
    const inputMatches = Boolean(
      recompiledSpec && compilation.compilerInputHash &&
      recompiledInput.compilerInputHash === compilation.compilerInputHash
    );
    const laneMatches = Boolean(
      recompiledSpec && compilation.compilerLane &&
      recompiledInput.compilerLane === compilation.compilerLane
    );
    const outputMatches = Boolean(
      recompiledSpec && compilation.compilerBaselineContentHash &&
      recompiledSpec.contentHash === compilation.compilerBaselineContentHash
    );
    const buildId = String(binding && binding.replayIdentity && binding.replayIdentity.buildId || '');
    const failureCode = compilerFailureCode({
      error, independentExecution, recompiledSpec, inputMatches, laneMatches, outputMatches, buildId,
    });
    const receipt = canonicalValue({
      schema: COMPILER_DETERMINISM_RECEIPT_SCHEMA,
      status: failureCode ? 'fail' : 'pass',
      failureCode,
      reason: failureCode
        ? String(error && error.message || compilerFailureReason(failureCode))
        : 'Independent compilation reproduced the canonical compiler baseline',
      independentExecution,
      buildId,
      compilerLane: String(compilation.compilerLane || ''),
      compilerConfigHash: String(compilation.compilerConfigHash || ''),
      compilerInputHash: String(compilation.compilerInputHash || ''),
      authoredWorldSpecContentHash: String(binding && binding.worldSpec && binding.worldSpec.contentHash || ''),
      authoredWorldSpecRevision: Number(binding && binding.worldSpec && binding.worldSpec.revision || 0),
      baselineContentHash: String(compilation.compilerBaselineContentHash || ''),
      recompiledWorldSpecId: String(recompiledSpec && recompiledSpec.id || ''),
      recompiledContentHash: String(recompiledSpec && recompiledSpec.contentHash || ''),
      recompiledInputHash: String(recompiledInput.compilerInputHash || ''),
      inputMatches,
      laneMatches,
      outputMatches,
    });
    return validateCompilerDeterminismReceipt(receipt);
  }

  function compilerFailureCode(facts = {}) {
    if (facts.error) return String(facts.error.code || 'compiler-execution-failed');
    if (!facts.independentExecution) return 'independent-execution-missing';
    if (!facts.buildId) return 'compiler-build-identity-missing';
    if (!facts.recompiledSpec) return 'recompiled-world-spec-missing';
    if (!facts.inputMatches) return 'compiler-input-mismatch';
    if (!facts.laneMatches) return 'compiler-lane-mismatch';
    if (!facts.outputMatches) return 'compiler-output-mismatch';
    return '';
  }

  function compilerFailureReason(code) {
    return ({
      'independent-execution-missing': 'No independent compiler execution was recorded',
      'compiler-build-identity-missing': 'Compiler build identity is missing',
      'recompiled-world-spec-missing': 'Independent compilation produced no WorldSpec',
      'compiler-input-mismatch': 'Independent compilation used different declared inputs',
      'compiler-lane-mismatch': 'Independent compilation used a different compiler lane',
      'compiler-output-mismatch': 'Independent compilation produced a different canonical WorldSpec',
    })[code] || 'Independent compiler execution failed';
  }

  function validateCompilerDeterminismReceipt(receipt) {
    requireObject(receipt);
    requireExactKeys(receipt, [
      'schema', 'status', 'failureCode', 'reason', 'independentExecution', 'buildId',
      'compilerLane', 'compilerConfigHash', 'compilerInputHash', 'authoredWorldSpecContentHash',
      'authoredWorldSpecRevision', 'baselineContentHash', 'recompiledWorldSpecId',
      'recompiledContentHash', 'recompiledInputHash', 'inputMatches', 'laneMatches', 'outputMatches',
    ]);
    if (receipt.schema !== COMPILER_DETERMINISM_RECEIPT_SCHEMA) {
      throw new CompilerProofError('Unexpected compiler-determinism receipt schema');
    }
    if (!['pass', 'fail'].includes(receipt.status)) throw new CompilerProofError('Unexpected compiler-determinism status');
    for (const key of [
      'failureCode', 'reason', 'buildId', 'compilerLane', 'compilerConfigHash', 'compilerInputHash',
      'authoredWorldSpecContentHash', 'baselineContentHash', 'recompiledWorldSpecId',
      'recompiledContentHash', 'recompiledInputHash',
    ]) {
      if (typeof receipt[key] !== 'string') throw new CompilerProofError(`Expected string field ${key}`);
    }
    for (const key of ['independentExecution', 'inputMatches', 'laneMatches', 'outputMatches']) {
      if (typeof receipt[key] !== 'boolean') throw new CompilerProofError(`Expected boolean field ${key}`);
    }
    if (!Number.isInteger(receipt.authoredWorldSpecRevision) || receipt.authoredWorldSpecRevision < 0) {
      throw new CompilerProofError('Authored WorldSpec revision must be nonnegative');
    }
    if (receipt.status === 'pass' && (
      receipt.failureCode || !receipt.independentExecution || !receipt.buildId || !receipt.compilerLane ||
      !receipt.inputMatches || !receipt.laneMatches || !receipt.outputMatches
    )) throw new CompilerProofError('Passing compiler receipt is incomplete');
    return receipt;
  }

  function compilerDeterminismStatus(receipt, binding) {
    if (!receipt) return 'not-proven';
    try {
      validateCompilerDeterminismReceipt(receipt);
    } catch (_error) {
      return 'fail';
    }
    const compilation = binding && binding.compilation || {};
    const worldSpec = binding && binding.worldSpec || {};
    const replay = binding && binding.replayIdentity || {};
    const bindingMatches = receipt.authoredWorldSpecContentHash === String(worldSpec.contentHash || '') &&
      receipt.authoredWorldSpecRevision === Number(worldSpec.revision || 0) &&
      receipt.compilerConfigHash === String(compilation.compilerConfigHash || '') &&
      receipt.compilerInputHash === String(compilation.compilerInputHash || '') &&
      receipt.compilerLane === String(compilation.compilerLane || '') &&
      receipt.baselineContentHash === String(compilation.compilerBaselineContentHash || '') &&
      receipt.buildId === String(replay.buildId || '');
    return receipt.status === 'pass' && bindingMatches ? 'pass' : 'fail';
  }

  function requireObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new CompilerProofError('Expected an object');
  }

  function requireExactKeys(value, allowed) {
    const expected = new Set(allowed);
    for (const key of Object.keys(value || {})) {
      if (!expected.has(key)) throw new CompilerProofError(`Unknown field ${key}`);
    }
    for (const key of allowed) {
      if (!Object.hasOwn(value, key)) throw new CompilerProofError(`Missing field ${key}`);
    }
  }

  return Object.freeze({
    COMPILER_DETERMINISM_RECEIPT_SCHEMA,
    compilerInputIdentity,
    createCompilerDeterminismReceipt,
    validateCompilerDeterminismReceipt,
    compilerDeterminismStatus,
  });
});
