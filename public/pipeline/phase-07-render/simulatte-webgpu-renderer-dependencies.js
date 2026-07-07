(function initSimulatteWebGpuRendererDependencies(root) {
  const scope = root.__SimulatteWebGpuRendererRefactorScope = root.__SimulatteWebGpuRendererRefactorScope || {};
  if (scope.initialized) return;

  scope.root = root;
  scope.initialized = true;
})(typeof globalThis !== 'undefined' ? globalThis : window);
