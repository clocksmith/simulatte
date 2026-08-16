(function attachSimulatteIntentProof(root) {
  const registry = typeof module === 'object' && module.exports
    ? require('../../app/runtime/phase-module-registry.js')
    : root.SimulattePhaseModuleRegistry;
  const scope = registry.family('physicsModel');

  function createIntentProofReceiptForSpec(inputSpec, options = {}) {
    const spec = scope.normalizeSpec(inputSpec);
    const binding = scope.worldProof.createWorldProofBinding(spec, {
      buildId: options.buildId,
      runtimeId: options.runtimeId,
    });
    return scope.worldProof.createIntentProofReceipt({ spec, binding });
  }

  registry.define('physicsModel', 'simulatte-intent-proof.js', {
    createIntentProofReceiptForSpec,
  });
})(typeof globalThis !== 'undefined' ? globalThis : window);
