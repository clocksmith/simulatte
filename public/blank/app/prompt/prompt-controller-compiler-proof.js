(function attachSimulattePromptCompilerProof(root, factory) {
  const worldProof = typeof module === 'object' && module.exports
    ? require('../../../shared/contracts/world-proof.js')
    : root.SimulatteWorldProof;
  if (!worldProof) throw new Error('SimulattePromptCompilerProof requires the WorldProof contract');
  const api = factory(worldProof);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulattePromptCompilerProof = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createPromptCompilerProofApi(worldProof) {
  function create(root, dependencies = {}) {
    const createPipelineCompiler = dependencies.createPipelineCompiler;
    const createSpecFromPrompt = dependencies.createSpecFromPrompt;
    if (typeof createPipelineCompiler !== 'function' || typeof createSpecFromPrompt !== 'function') {
      throw new Error('Compiler proof requires worker and main-thread compiler factories');
    }
    let generation = 0;
    let activeKey = '';
    let activePromise = null;
    let activeCompiler = null;
    let latestReceipt = null;

    function required(spec = {}) {
      return Boolean(
        spec.determinism && Array.isArray(spec.determinism.requiredClasses) &&
        spec.determinism.requiredClasses.includes('compiler-deterministic')
      );
    }

    function receiptFor(spec = {}) {
      return latestReceipt &&
        latestReceipt.authoredWorldSpecContentHash === String(spec.contentHash || '') &&
        latestReceipt.authoredWorldSpecRevision === Number(spec.authorship && spec.authorship.revision || 0)
        ? latestReceipt
        : null;
    }

    function cancelActive(message) {
      if (activeCompiler && typeof activeCompiler.cancel === 'function') {
        activeCompiler.cancel(message);
      }
      activeCompiler = null;
    }

    function invalidate() {
      generation += 1;
      cancelActive('Compiler proof superseded by a different WorldSpec');
      activeKey = '';
      activePromise = null;
      latestReceipt = null;
    }

    function verify(spec = {}, binding = null) {
      if (!required(spec)) return Promise.resolve(null);
      const key = [
        spec.contentHash || '',
        spec.authorship && spec.authorship.revision || 0,
        binding && binding.replayIdentity && binding.replayIdentity.buildId || '',
      ].join(':');
      const cached = receiptFor(spec);
      if (cached && cached.buildId === String(binding && binding.replayIdentity && binding.replayIdentity.buildId || '')) {
        return Promise.resolve(cached);
      }
      if (activePromise && activeKey === key) return activePromise;
      if (activePromise) invalidate();
      const token = generation;
      activeKey = key;
      activePromise = compileAndCompare(spec, binding, token).finally(() => {
        if (token !== generation) return;
        activeKey = '';
        activePromise = null;
      });
      return activePromise;
    }

    async function compileAndCompare(spec, binding, token) {
      const prompt = String(spec.source && spec.source.prompt || '');
      const compilerConfig = cloneCompilerConfig(spec.source && spec.source.compilerConfig || {});
      let recompiledSpec = null;
      let failure = null;
      let compiler = null;
      try {
        if (compilerConfig.compilerLane === 'pipeline-worker') {
          compiler = createPipelineCompiler(root);
          if (!compiler) throw compilerError(
            'Independent pipeline worker is unavailable',
            'SIMULATTE_COMPILER_PROOF_WORKER_UNAVAILABLE'
          );
          activeCompiler = compiler;
          recompiledSpec = await compiler.compile(prompt, compilerConfig);
        } else if (compilerConfig.compilerLane === 'main-thread') {
          recompiledSpec = await Promise.resolve().then(() => (
            createSpecFromPrompt(prompt, compilerConfig)
          ));
        } else {
          throw compilerError(
            `Unsupported compiler proof lane ${compilerConfig.compilerLane || 'missing'}`,
            'SIMULATTE_COMPILER_PROOF_LANE_UNSUPPORTED'
          );
        }
      } catch (error) {
        failure = error;
      } finally {
        if (compiler && typeof compiler.cancel === 'function') {
          compiler.cancel('Independent compiler proof completed');
        }
        if (activeCompiler === compiler) activeCompiler = null;
      }
      const receipt = worldProof.createCompilerDeterminismReceipt({
        binding,
        recompiledSpec,
        independentExecution: true,
        error: failure,
      });
      if (token === generation) latestReceipt = receipt;
      return token === generation ? receipt : null;
    }

    return Object.freeze({
      required,
      receiptFor,
      verify,
      invalidate,
    });
  }

  function cloneCompilerConfig(value) {
    return JSON.parse(JSON.stringify(value || {}));
  }

  function compilerError(message, code) {
    const error = new Error(message);
    error.code = code;
    return error;
  }

  return Object.freeze({ create });
});
