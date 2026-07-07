(function initSimulatteReviewBridgeDependencies(root) {
  const scope = root.__SimulatteReviewBridgeRefactorScope = root.__SimulatteReviewBridgeRefactorScope || {};
  if (scope.initialized) return;

  scope.root = root;
  scope.root = root;
  scope.initialized = true;
})(typeof globalThis !== 'undefined' ? globalThis : window);
