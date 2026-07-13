(function attachSimulatteIntentEmbedderruntimeclass(root) {
  const scope = root.__SimulatteIntentEmbedderRefactorScope;
  if (!scope || scope.missingDependency) return;
  with (scope) {
    function create(options = {}) {
        return new ModelBackedIntentEmbedder(options);
      }

    Object.assign(scope, {
      create,
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
