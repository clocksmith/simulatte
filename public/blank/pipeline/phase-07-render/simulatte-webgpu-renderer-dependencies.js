(function initSimulatteWebGpuRendererDependencies(root) {
  const scope = root.__SimulatteWebGpuRendererRefactorScope = root.__SimulatteWebGpuRendererRefactorScope || {};
  if (scope.initialized) return;

  const renderProof = typeof module === 'object' && module.exports
    ? require('./simulatte-render-proof.js')
    : root.SimulatteRenderProof;

  scope.root = root;
  Object.assign(scope, renderProof || {});
  scope.initialized = true;
})(typeof globalThis !== 'undefined' ? globalThis : window);
