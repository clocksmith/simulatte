(function attachSimulattePipelineWorker(root) {
  const SCRIPT_ORDER = Object.freeze([
    '../../pipeline/phase-06-simulation/simulatte-physics-catalog.js',
    '../../pipeline/phase-03-retrieval/simulatte-semantic-rag.js',
    '../../pipeline/phase-01-runtime/simulatte-doppler-intent.js',
    '../../pipeline/phase-05-grounded-intent/simulatte-graph-synthesis.js',
    '../../pipeline/phase-03-retrieval/simulatte-intent-classifier.js',
    '../../pipeline/phase-02-language/simulatte-universe-parser.js',
    '../../pipeline/phase-05-grounded-intent/simulatte-universe-grounder.js',
    '../../pipeline/phase-06-simulation/simulatte-physics-ir.js',
    '../../pipeline/phase-06-simulation/simulatte-physics-ir-validator.js',
    '../../pipeline/phase-05-grounded-intent/simulatte-intent-brief-schema.js',
    '../../pipeline/phase-05-grounded-intent/simulatte-structured-intent-model.js',
    '../../pipeline/phase-05-grounded-intent/simulatte-causal-physics-graph.js',
    '../../pipeline/phase-05-grounded-intent/simulatte-assumption-ledger.js',
    '../../pipeline/phase-05-grounded-intent/simulatte-causal-visual-affordances.js',
    '../../pipeline/phase-02-language/simulatte-language-evidence.js',
    '../../pipeline/phase-04-activation/simulatte-activation-cloud.js',
    '../../pipeline/phase-05-grounded-intent/simulatte-grounded-interpretation.js',
    '../../pipeline/phase-05-grounded-intent/simulatte-intent-forensics.js',
    '../../pipeline/phase-06-simulation/solvers/simulatte-solver-rigid-body-2d.js',
    '../../pipeline/phase-06-simulation/solvers/simulatte-solver-particles.js',
    '../../pipeline/phase-06-simulation/solvers/simulatte-solver-constraints.js',
    '../../pipeline/phase-06-simulation/solvers/simulatte-solver-thermal.js',
    '../../pipeline/phase-06-simulation/solvers/simulatte-solver-advection.js',
    '../../pipeline/phase-06-simulation/solvers/simulatte-solver-pressure-flow-lite.js',
    '../../pipeline/phase-06-simulation/solvers/simulatte-solver-wave-field.js',
    '../../pipeline/phase-06-simulation/solvers/simulatte-solver-reaction-diffusion.js',
    '../../pipeline/phase-06-simulation/solvers/simulatte-solver-fracture-threshold.js',
    '../../pipeline/phase-06-simulation/solvers/simulatte-solver-rotational-mechanics.js',
    '../../pipeline/phase-06-simulation/solvers/simulatte-solver-network-control.js',
    '../../pipeline/phase-06-simulation/solvers/simulatte-solver-growth-decay.js',
    '../../pipeline/phase-06-simulation/simulatte-solver-registry.js',
    '../../pipeline/phase-06-simulation/simulatte-solver-compiler.js',
    '../../pipeline/phase-06-simulation/simulatte-render-registry.js',
    '../../pipeline/phase-06-simulation/simulatte-render-ir.js',
    '../../pipeline/phase-07-visual/simulatte-visual-operator-atlas.js',
    '../../pipeline/phase-07-visual/simulatte-visual-operator-compiler.js',
    '../../pipeline/phase-07-visual/simulatte-composition-graph.js',
    '../../pipeline/phase-06-simulation/simulatte-physics-model.js',
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
