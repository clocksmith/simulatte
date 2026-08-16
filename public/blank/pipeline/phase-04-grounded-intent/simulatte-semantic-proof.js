(function attachSimulatteSemanticProof(root) {
  const registry = typeof module === 'object' && module.exports
    ? require('../../app/runtime/phase-module-registry.js')
    : root.SimulattePhaseModuleRegistry;
  const scope = registry.family('physicsModel');

  function createSemanticProofReceiptForSpec(inputSpec, options = {}) {
    const spec = scope.normalizeSpec(inputSpec);
    const binding = scope.worldProof.createWorldProofBinding(spec, {
      buildId: options.buildId,
      runtimeId: options.runtimeId,
    });
    return scope.worldProof.createSemanticProofReceipt({ spec, binding });
  }

  registry.define('physicsModel', 'simulatte-semantic-proof.js', {
    createSemanticProofReceiptForSpec,
  });
})(typeof globalThis !== 'undefined' ? globalThis : window);
