(function attachSimulatteMain(root) {
  if (!root || !root.document) return;

  const runtimeManifest = root.SimulatteRuntimeScriptManifest;
  if (!runtimeManifest || runtimeManifest.schema !== 'simulatte.runtimeScriptManifest.v1') {
    throw new Error('Simulatte runtime script manifest unavailable');
  }
  const RUNTIME_SCRIPTS = Object.freeze(
    runtimeManifest.browser.map((src) => `./${src}`)
  );
  const REQUIRED_GLOBALS = [
    'SimulattePhysicsCatalog',
    'SimulatteSemanticRag',
    'SimulatteCompactClassifierRuntime',
    'SimulatteBoundedClassificationRequests',
    'SimulatteClassificationTierRouter',
    'SimulatteConditionalReranking',
    'SimulatteIntentClassifier',
    'SimulatteCausalPhysicsGraph',
    'SimulatteLanguageEvidence',
    'SimulatteCompositionGraph',
    'SimulattePhysicsModel',
	    'SimulatteRuntimeProgress',
	    'SimulattePhysicsRenderer',
	    'SimulatteSceneProof',
	    'SimulattePhysicsLab',
	  ];

  const state = root.SimulatteBoot = root.SimulatteBoot || { failedScripts: [] };
  state.recovered = false;

  function missingGlobals() {
    return REQUIRED_GLOBALS.filter((name) => {
      if (name === 'SimulattePhysicsLab') {
        return !root[name] || typeof root[name].start !== 'function';
      }
      return !root[name];
    });
  }

  function canStartLab() {
    return root.SimulattePhysicsLab && typeof root.SimulattePhysicsLab.start === 'function';
  }

  function cacheBusted(src, token) {
    const url = new URL(src, root.location.href);
    url.searchParams.set('simulatte-retry', token);
    return url.href;
  }

  function loadScript(src, token) {
    return new Promise((resolve, reject) => {
      const script = root.document.createElement('script');
      script.src = cacheBusted(src, token);
      script.async = false;
      script.dataset.simulatteRetry = 'true';
      script.onload = () => resolve(src);
      script.onerror = () => reject(new Error(`Failed loading ${src}`));
      root.document.head.appendChild(script);
    });
  }

  async function reloadRuntime() {
    const token = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    for (const src of RUNTIME_SCRIPTS) {
      await loadScript(src, token);
    }
  }

  function startLab() {
    if (!canStartLab()) return false;
    if (!root.SimulattePhysicsLab._browserLab) {
      root.SimulattePhysicsLab._browserLab = root.SimulattePhysicsLab.start();
    }
    return true;
  }

  function reportFailure(error) {
    const failed = Array.from(new Set(state.failedScripts || []));
    const dependencies = state.missingDependencies || [];
    const missing = missingGlobals();
    console.error('[simulatte.boot] runtime failed to start', { error, failed, dependencies, missing });
  }

  async function boot() {
    if (startLab()) return;
    const failed = state.failedScripts || [];
    const missing = missingGlobals();
    const dependencies = state.missingDependencies || [];
    if (!failed.length && !missing.length && !dependencies.length) return;
    console.warn('[simulatte.boot] retrying runtime scripts', { failed, dependencies, missing });
    try {
      await reloadRuntime();
      state.recovered = startLab();
      if (!state.recovered) throw new Error(`Missing runtime globals: ${missingGlobals().join(', ')}`);
    } catch (error) {
      reportFailure(error);
    }
  }

  function onReady(callback) {
    if (root.document.readyState === 'loading') {
      root.document.addEventListener('DOMContentLoaded', callback, { once: true });
    } else {
      callback();
    }
  }

  onReady(boot);
})(typeof globalThis !== 'undefined' ? globalThis : window);
