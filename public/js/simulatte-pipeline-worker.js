(function attachSimulattePipelineWorker(root) {
  const SCRIPT_ORDER = Object.freeze([
    './simulatte-physics-catalog.js',
    './simulatte-semantic-rag.js',
    './simulatte-doppler-intent.js',
    './simulatte-graph-synthesis.js',
    './simulatte-intent-classifier.js',
    './simulatte-universe-parser.js',
    './simulatte-universe-grounder.js',
    './simulatte-physics-ir.js',
    './simulatte-physics-ir-validator.js',
    './simulatte-intent-brief-schema.js',
    './simulatte-structured-intent-model.js',
    './simulatte-causal-physics-graph.js',
    './simulatte-assumption-ledger.js',
    './simulatte-causal-visual-affordances.js',
    './simulatte-language-evidence.js',
    './simulatte-activation-cloud.js',
    './simulatte-grounded-interpretation.js',
    './simulatte-intent-forensics.js',
    './solvers/simulatte-solver-rigid-body-2d.js',
    './solvers/simulatte-solver-particles.js',
    './solvers/simulatte-solver-constraints.js',
    './solvers/simulatte-solver-thermal.js',
    './solvers/simulatte-solver-advection.js',
    './solvers/simulatte-solver-pressure-flow-lite.js',
    './solvers/simulatte-solver-wave-field.js',
    './solvers/simulatte-solver-reaction-diffusion.js',
    './solvers/simulatte-solver-fracture-threshold.js',
    './solvers/simulatte-solver-rotational-mechanics.js',
    './solvers/simulatte-solver-network-control.js',
    './solvers/simulatte-solver-growth-decay.js',
    './simulatte-solver-registry.js',
    './simulatte-solver-compiler.js',
    './simulatte-render-registry.js',
    './simulatte-render-ir.js',
    './simulatte-visual-operator-atlas.js',
    './simulatte-visual-operator-compiler.js',
    './simulatte-composition-graph.js',
    './simulatte-physics-model.js',
  ]);

  function loadCompilerScripts() {
    if (typeof importScripts !== 'function') {
      throw new Error('Worker importScripts unavailable');
    }
    importScripts(...SCRIPT_ORDER);
    if (!root.SimulattePhysicsModel || !root.SimulattePhysicsModel.createSpecFromPrompt) {
      throw new Error('SimulattePhysicsModel unavailable in pipeline worker');
    }
  }

  function errorMessage(error) {
    if (!error) return 'Pipeline worker compile failed';
    return error && error.message ? error.message : String(error);
  }

  function postResult(id, payload) {
    root.postMessage({
      type: 'simulatte:pipeline-worker:result',
      id,
      ...payload,
    });
  }

  let ready = false;
  let loadError = null;
  try {
    loadCompilerScripts();
    ready = true;
  } catch (error) {
    loadError = error;
  }

  root.addEventListener('message', (event) => {
    const data = event && event.data || {};
    if (data.type !== 'simulatte:pipeline-worker:compile') return;
    if (!ready) {
      postResult(data.id, { ok: false, error: errorMessage(loadError) });
      return;
    }
    try {
      const model = root.SimulattePhysicsModel;
      const spec = model.createSpecFromPrompt(data.prompt || '', data.options || {});
      postResult(data.id, { ok: true, spec });
    } catch (error) {
      postResult(data.id, { ok: false, error: errorMessage(error) });
    }
  });
})(typeof globalThis !== 'undefined' ? globalThis : self);
