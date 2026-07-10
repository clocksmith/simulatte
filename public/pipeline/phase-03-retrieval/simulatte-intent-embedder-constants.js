(function attachSimulatteIntentEmbedderconstants(root) {
  const scope = root.__SimulatteIntentEmbedderRefactorScope;
  if (!scope || scope.missingDependency) return;
  with (scope) {
    const DEFAULT_MANIFEST_URL = './data/simulatte-embedder/manifest.json';

    const PROMPT_RUNTIME_STABILITY_THRESHOLD = 0.995;

    const PROMPT_RUNTIME_DIVERSITY_THRESHOLD = 0.9999;

    const FEATURE_MODEL_ID = 'simulatte-semantic-feature-v1';

    let blake3ModulePromise = null;

    Object.assign(scope, {
      DEFAULT_MANIFEST_URL,
      PROMPT_RUNTIME_STABILITY_THRESHOLD,
      PROMPT_RUNTIME_DIVERSITY_THRESHOLD,
      FEATURE_MODEL_ID,
      blake3ModulePromise,
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
