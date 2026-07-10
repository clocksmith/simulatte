(function attachSimulatteMain(root) {
  if (!root || !root.document) return;

  const RUNTIME_SCRIPTS = [
    './pipeline/phase-05-simulation/simulatte-physics-catalog-dependencies.js',
    './pipeline/phase-05-simulation/simulatte-physics-catalog-constants.js',
    './pipeline/phase-05-simulation/simulatte-physics-catalog-templates.js',
    './pipeline/phase-05-simulation/simulatte-physics-catalog-primitive-data.js',
    './pipeline/phase-05-simulation/simulatte-physics-catalog-materials.js',
    './pipeline/phase-05-simulation/simulatte-physics-catalog-graph-data.js',
    './pipeline/phase-05-simulation/simulatte-physics-catalog-examples.js',
    './pipeline/phase-05-simulation/simulatte-physics-catalog-graph-helpers.js',
    './pipeline/phase-05-simulation/simulatte-physics-catalog.js',
    './pipeline/phase-03-retrieval/simulatte-semantic-rag-dependencies.js',
    './pipeline/phase-03-retrieval/simulatte-semantic-rag-constants.js',
    './pipeline/phase-03-retrieval/simulatte-semantic-rag-helpers.js',
    './pipeline/phase-03-retrieval/simulatte-semantic-rag-surface-cards.js',
    './pipeline/phase-03-retrieval/simulatte-semantic-rag-grounding-cards.js',
    './pipeline/phase-03-retrieval/simulatte-semantic-rag-retrieval.js',
    './pipeline/phase-03-retrieval/simulatte-semantic-rag.js',
    './pipeline/phase-01-runtime/simulatte-doppler-intent.js',
    './pipeline/phase-04-grounded-intent/simulatte-graph-synthesis-dependencies.js',
    './pipeline/phase-04-grounded-intent/simulatte-graph-synthesis-constants.js',
    './pipeline/phase-04-grounded-intent/simulatte-graph-synthesis-helpers.js',
    './pipeline/phase-04-grounded-intent/simulatte-graph-synthesis-surface-cards.js',
    './pipeline/phase-04-grounded-intent/simulatte-graph-synthesis-retrieval.js',
    './pipeline/phase-04-grounded-intent/simulatte-graph-synthesis.js',
    './pipeline/phase-03-retrieval/simulatte-intent-embedder-dependencies.js',
    './pipeline/phase-03-retrieval/simulatte-intent-embedder-constants.js',
    './pipeline/phase-03-retrieval/simulatte-intent-embedder-model-lock.js',
    './pipeline/phase-03-retrieval/simulatte-intent-embedder-model-cache.js',
    './pipeline/phase-03-retrieval/simulatte-intent-embedder-runtime-class.js',
    './pipeline/phase-03-retrieval/simulatte-intent-embedder-manifest-cache.js',
    './pipeline/phase-03-retrieval/simulatte-intent-embedder-runtime-probes.js',
    './pipeline/phase-03-retrieval/simulatte-intent-embedder-span-retrieval.js',
    './pipeline/phase-03-retrieval/simulatte-intent-embedder-slot-retrieval.js',
    './pipeline/phase-03-retrieval/simulatte-intent-embedder-rerank.js',
    './pipeline/phase-03-retrieval/simulatte-intent-embedder-vectors.js',
    './pipeline/phase-03-retrieval/simulatte-intent-embedder-facade-support.js',
    './pipeline/phase-03-retrieval/simulatte-intent-embedder.js',
    './pipeline/phase-03-retrieval/simulatte-intent-classifier.js',
    './data/simulatte-language-lexicon.js',
    './pipeline/phase-02-language/simulatte-universe-parser.js',
    './pipeline/phase-04-grounded-intent/simulatte-universe-grounder.js',
    './pipeline/phase-05-simulation/simulatte-physics-ir-dependencies.js',
    './pipeline/phase-05-simulation/simulatte-physics-ir-constants.js',
    './pipeline/phase-05-simulation/simulatte-physics-ir-builder.js',
    './pipeline/phase-05-simulation/simulatte-physics-ir-domains.js',
    './pipeline/phase-05-simulation/simulatte-physics-ir-behaviors.js',
    './pipeline/phase-05-simulation/simulatte-physics-ir-operators.js',
    './pipeline/phase-05-simulation/simulatte-physics-ir.js',
    './pipeline/phase-05-simulation/simulatte-physics-ir-validator.js',
    './pipeline/phase-04-grounded-intent/simulatte-intent-brief-schema.js',
    './pipeline/phase-04-grounded-intent/simulatte-structured-intent-model.js',
    './pipeline/phase-04-grounded-intent/simulatte-causal-physics-graph.js',
    './pipeline/phase-04-grounded-intent/simulatte-assumption-ledger.js',
    './pipeline/phase-04-grounded-intent/simulatte-causal-visual-affordances.js',
    './pipeline/phase-02-language/simulatte-language-evidence.js',
    './pipeline/phase-03-retrieval/simulatte-activation-cloud.js',
    './pipeline/phase-04-grounded-intent/simulatte-grounded-interpretation.js',
    './pipeline/phase-04-grounded-intent/simulatte-intent-forensics.js',
    './pipeline/phase-05-simulation/solvers/simulatte-solver-rigid-body-2d.js',
    './pipeline/phase-05-simulation/solvers/simulatte-solver-particles.js',
    './pipeline/phase-05-simulation/solvers/simulatte-solver-constraints.js',
    './pipeline/phase-05-simulation/solvers/simulatte-solver-thermal.js',
    './pipeline/phase-05-simulation/solvers/simulatte-solver-advection.js',
    './pipeline/phase-05-simulation/solvers/simulatte-solver-pressure-flow-lite.js',
    './pipeline/phase-05-simulation/solvers/simulatte-solver-wave-field.js',
    './pipeline/phase-05-simulation/solvers/simulatte-solver-reaction-diffusion.js',
    './pipeline/phase-05-simulation/solvers/simulatte-solver-fracture-threshold.js',
    './pipeline/phase-05-simulation/solvers/simulatte-solver-rotational-mechanics.js',
    './pipeline/phase-05-simulation/solvers/simulatte-solver-network-control.js',
    './pipeline/phase-05-simulation/solvers/simulatte-solver-growth-decay.js',
    './pipeline/phase-05-simulation/simulatte-solver-registry.js',
    './pipeline/phase-05-simulation/simulatte-solver-compiler.js',
    './pipeline/phase-05-simulation/simulatte-render-registry.js',
    './pipeline/phase-05-simulation/simulatte-render-ir.js',
    './pipeline/phase-06-visual/simulatte-visual-operator-atlas.js',
	    './pipeline/phase-06-visual/simulatte-visual-operator-compiler.js',
    './pipeline/phase-06-visual/simulatte-composition-graph-dependencies.js',
    './pipeline/phase-06-visual/simulatte-composition-graph-constants.js',
    './pipeline/phase-06-visual/simulatte-composition-graph-selection-layout.js',
    './pipeline/phase-06-visual/simulatte-composition-graph-render-ir-binding.js',
    './pipeline/phase-06-visual/simulatte-composition-graph-visual-ir.js',
    './pipeline/phase-06-visual/simulatte-composition-graph-materials.js',
    './pipeline/phase-06-visual/simulatte-composition-graph-scene-packet.js',
    './pipeline/phase-06-visual/simulatte-composition-graph-visual-genome.js',
    './pipeline/phase-06-visual/simulatte-composition-graph-programs.js',
    './pipeline/phase-06-visual/simulatte-composition-graph-helpers.js',
    './pipeline/phase-06-visual/simulatte-composition-graph-facade-support.js',
    './pipeline/phase-06-visual/simulatte-composition-graph.js',
    './pipeline/phase-07-render/simulatte-webgpu-renderer-dependencies.js',
    './pipeline/phase-07-render/simulatte-webgpu-renderer-constants.js',
    './pipeline/phase-07-render/simulatte-webgpu-renderer-renderer-class.js',
    './pipeline/phase-07-render/simulatte-webgpu-renderer-packets.js',
    './pipeline/phase-07-render/simulatte-webgpu-renderer-pixel-proof.js',
    './pipeline/phase-07-render/simulatte-webgpu-renderer-gpu-data.js',
    './pipeline/phase-07-render/simulatte-webgpu-renderer-shader-core.js',
    './pipeline/phase-07-render/simulatte-webgpu-renderer-shader-atoms.js',
    './pipeline/phase-07-render/simulatte-webgpu-renderer-shader-scene.js',
    './pipeline/phase-07-render/simulatte-webgpu-renderer-shader-composition.js',
    './pipeline/phase-07-render/simulatte-webgpu-renderer.js',
	    './pipeline/phase-08-scene-proof/simulatte-scene-proof.js',
    './pipeline/phase-05-simulation/simulatte-physics-model-dependencies.js',
    './pipeline/phase-05-simulation/simulatte-physics-model-contracts.js',
    './pipeline/phase-05-simulation/simulatte-physics-model-phase-runtime-language.js',
    './pipeline/phase-05-simulation/simulatte-physics-model-phase-retrieval.js',
    './pipeline/phase-05-simulation/simulatte-physics-model-activation-verdicts.js',
    './pipeline/phase-05-simulation/simulatte-physics-model-activation-fusion.js',
    './pipeline/phase-05-simulation/simulatte-physics-model-phase-grounding.js',
    './pipeline/phase-05-simulation/simulatte-physics-model-phase-simulation.js',
    './pipeline/phase-05-simulation/simulatte-physics-model-phase-visual-render.js',
    './pipeline/phase-05-simulation/simulatte-physics-model-state-solvers.js',
    './pipeline/phase-05-simulation/simulatte-physics-model-spec-api.js',
    './pipeline/phase-05-simulation/simulatte-physics-model-metrics.js',
    './pipeline/phase-05-simulation/simulatte-physics-model-compatibility.js',
    './pipeline/phase-05-simulation/simulatte-physics-model.js',
    './app/runtime/runtime-progress-dependencies.js',
    './app/runtime/runtime-progress-constants.js',
    './app/runtime/runtime-progress-controller.js',
    './app/runtime/runtime-progress-reducer.js',
    './app/runtime/runtime-progress-observers.js',
    './app/runtime/runtime-progress.js',
    './app/prompt/prompt-controller-dependencies.js',
    './app/prompt/prompt-controller-model-bindings.js',
    './app/prompt/prompt-controller-lab-controller.js',
    './app/prompt/prompt-controller-workers.js',
    './app/prompt/prompt-controller-training.js',
    './app/prompt/prompt-controller.js',
    './app/simulation/simulation-lab.js',
  ];

  const REQUIRED_GLOBALS = [
    'SimulattePhysicsCatalog',
    'SimulatteSemanticRag',
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
