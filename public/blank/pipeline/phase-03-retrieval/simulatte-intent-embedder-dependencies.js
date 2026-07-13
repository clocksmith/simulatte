(function initSimulatteIntentEmbedderDependencies(root) {
  const scope = root.__SimulatteIntentEmbedderRefactorScope = root.__SimulatteIntentEmbedderRefactorScope || {};
  if (scope.initialized) return;

  scope.root = root;
  scope.initialized = true;
})(typeof globalThis !== 'undefined' ? globalThis : window);
