(function initSimulatteLoadingCanvasDependencies(root) {
  const scope = root.__SimulatteLoadingCanvasRefactorScope = root.__SimulatteLoadingCanvasRefactorScope || {};
  if (scope.initialized) return;

  scope.root = root;
  scope.root = root;
  scope.initialized = true;
})(typeof globalThis !== 'undefined' ? globalThis : window);
