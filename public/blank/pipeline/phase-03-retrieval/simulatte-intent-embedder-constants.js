(function attachSimulatteIntentEmbedderconstants(root) {
  const scope = root.SimulattePhaseModuleRegistry.family('intentEmbedder');

    const DEFAULT_MANIFEST_URL = '../data/simulatte-embedder/manifest.json';

    const PROMPT_RUNTIME_STABILITY_THRESHOLD = 0.995;

    const PROMPT_RUNTIME_DIVERSITY_THRESHOLD = 0.9999;

    const FEATURE_MODEL_ID = 'simulatte-semantic-feature-v1';

    let blake3ModulePromise = null;

    root.SimulattePhaseModuleRegistry.define('intentEmbedder', 'simulatte-intent-embedder-constants.js', {
      DEFAULT_MANIFEST_URL,
      PROMPT_RUNTIME_STABILITY_THRESHOLD,
      PROMPT_RUNTIME_DIVERSITY_THRESHOLD,
      FEATURE_MODEL_ID,
      blake3ModulePromise,
    });

})(typeof globalThis !== 'undefined' ? globalThis : window);
