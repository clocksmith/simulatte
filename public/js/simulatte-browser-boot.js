(function attachSimulatteBrowserBoot(root) {
  if (!root || !root.document) return;

  const RUNTIME_SCRIPTS = [
    './js/simulatte-physics-catalog.js',
    './js/simulatte-semantic-rag.js',
    './js/simulatte-doppler-intent.js',
    './js/simulatte-graph-synthesis.js',
    './js/simulatte-intent-embedder.js',
    './js/simulatte-intent-classifier.js',
    './js/simulatte-universe-parser.js',
    './js/simulatte-universe-grounder.js',
    './js/simulatte-physics-ir.js',
    './js/simulatte-physics-ir-validator.js',
    './js/simulatte-intent-brief-schema.js',
    './js/simulatte-structured-intent-model.js',
    './js/simulatte-causal-physics-graph.js',
    './js/simulatte-assumption-ledger.js',
    './js/simulatte-causal-visual-affordances.js',
    './js/simulatte-language-evidence.js',
    './js/simulatte-activation-cloud.js',
    './js/simulatte-grounded-interpretation.js',
    './js/simulatte-intent-forensics.js',
    './js/solvers/simulatte-solver-rigid-body-2d.js',
    './js/solvers/simulatte-solver-particles.js',
    './js/solvers/simulatte-solver-constraints.js',
    './js/solvers/simulatte-solver-thermal.js',
    './js/solvers/simulatte-solver-advection.js',
    './js/solvers/simulatte-solver-pressure-flow-lite.js',
    './js/solvers/simulatte-solver-wave-field.js',
    './js/solvers/simulatte-solver-reaction-diffusion.js',
    './js/solvers/simulatte-solver-fracture-threshold.js',
    './js/solvers/simulatte-solver-rotational-mechanics.js',
    './js/solvers/simulatte-solver-network-control.js',
    './js/solvers/simulatte-solver-growth-decay.js',
    './js/simulatte-solver-registry.js',
    './js/simulatte-solver-compiler.js',
    './js/simulatte-render-registry.js',
    './js/simulatte-render-ir.js',
    './js/simulatte-visual-operator-atlas.js',
    './js/simulatte-visual-operator-compiler.js',
    './js/simulatte-composition-graph.js',
    './js/simulatte-webgpu-renderer.js',
    './js/simulatte-physics-model.js',
    './js/simulatte-physics-renderer.js',
    './js/simulatte-physics-lab.js',
  ];

  const REQUIRED_GLOBALS = [
    'SimulattePhysicsCatalog',
    'SimulatteSemanticRag',
    'SimulatteIntentClassifier',
    'SimulatteCausalPhysicsGraph',
    'SimulatteLanguageEvidence',
    'SimulatteCompositionGraph',
    'SimulattePhysicsModel',
    'SimulattePhysicsRenderer',
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
