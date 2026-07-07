(function attachSimulatteIntentEmbedderconstants(root) {
  const scope = root.__SimulatteIntentEmbedderRefactorScope;
  if (!scope || scope.missingDependency) return;
  with (scope) {
    const DEFAULT_MANIFEST_URL = './data/simulatte-embedder/manifest.json';

    const DEFAULT_DOPPLER_MODULE_URL = './vendor/doppler/src/index-browser.js';

    const DEFAULT_DOPPLER_KERNEL_BASE_PATH = './vendor/doppler/src/gpu/kernels';

    const PROMPT_RUNTIME_STABILITY_THRESHOLD = 0.995;

    const PROMPT_RUNTIME_DIVERSITY_THRESHOLD = 0.9999;

    const FEATURE_MODEL_ID = 'simulatte-semantic-feature-v1';

    let blake3ModulePromise = null;

    Object.assign(scope, {
      DEFAULT_MANIFEST_URL,
      DEFAULT_DOPPLER_MODULE_URL,
      DEFAULT_DOPPLER_KERNEL_BASE_PATH,
      PROMPT_RUNTIME_STABILITY_THRESHOLD,
      PROMPT_RUNTIME_DIVERSITY_THRESHOLD,
      FEATURE_MODEL_ID,
      blake3ModulePromise,
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
