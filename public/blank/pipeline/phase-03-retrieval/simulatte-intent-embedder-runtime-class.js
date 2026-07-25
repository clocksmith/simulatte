(function attachSimulatteIntentEmbedderruntimeclass(root) {
  const scope = root.SimulattePhaseModuleRegistry.family('intentEmbedder');

    function create(options = {}) {
        return new scope.ModelBackedIntentEmbedder(options);
      }

    root.SimulattePhaseModuleRegistry.define('intentEmbedder', 'simulatte-intent-embedder-runtime-class.js', {
      create,
    });

})(typeof globalThis !== 'undefined' ? globalThis : window);
