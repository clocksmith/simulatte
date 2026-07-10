(function attachSimulattePipelineWorker(root) {
  const SCRIPT_ORDER = Object.freeze([
    '../../pipeline/phase-05-simulation/simulatte-physics-catalog-dependencies.js',
    '../../pipeline/phase-05-simulation/simulatte-physics-catalog-constants.js',
    '../../pipeline/phase-05-simulation/simulatte-physics-catalog-templates.js',
    '../../pipeline/phase-05-simulation/simulatte-physics-catalog-primitive-data.js',
    '../../pipeline/phase-05-simulation/simulatte-physics-catalog-materials.js',
    '../../pipeline/phase-05-simulation/simulatte-physics-catalog-graph-data.js',
    '../../pipeline/phase-05-simulation/simulatte-physics-catalog-examples.js',
    '../../pipeline/phase-05-simulation/simulatte-physics-catalog-graph-helpers.js',
    '../../pipeline/phase-05-simulation/simulatte-physics-catalog.js',
    '../../pipeline/phase-03-retrieval/simulatte-semantic-rag-dependencies.js',
    '../../pipeline/phase-03-retrieval/simulatte-semantic-rag-constants.js',
    '../../pipeline/phase-03-retrieval/simulatte-semantic-rag-helpers.js',
    '../../pipeline/phase-03-retrieval/simulatte-semantic-rag-surface-cards.js',
    '../../pipeline/phase-03-retrieval/simulatte-semantic-rag-grounding-cards.js',
    '../../pipeline/phase-03-retrieval/simulatte-semantic-rag-retrieval.js',
    '../../pipeline/phase-03-retrieval/simulatte-semantic-rag.js',
    '../../pipeline/phase-01-runtime/simulatte-doppler-intent.js',
    '../../pipeline/phase-04-grounded-intent/simulatte-graph-synthesis-dependencies.js',
    '../../pipeline/phase-04-grounded-intent/simulatte-graph-synthesis-constants.js',
    '../../pipeline/phase-04-grounded-intent/simulatte-graph-synthesis-helpers.js',
    '../../pipeline/phase-04-grounded-intent/simulatte-graph-synthesis-surface-cards.js',
    '../../pipeline/phase-04-grounded-intent/simulatte-graph-synthesis-retrieval.js',
    '../../pipeline/phase-04-grounded-intent/simulatte-graph-synthesis.js',
    '../../pipeline/phase-03-retrieval/simulatte-intent-classifier.js',
    '../../data/simulatte-language-lexicon.js',
    '../../pipeline/phase-02-language/simulatte-universe-parser.js',
    '../../pipeline/phase-04-grounded-intent/simulatte-universe-grounder.js',
    '../../pipeline/phase-05-simulation/simulatte-physics-ir-dependencies.js',
    '../../pipeline/phase-05-simulation/simulatte-physics-ir-constants.js',
    '../../pipeline/phase-05-simulation/simulatte-physics-ir-builder.js',
    '../../pipeline/phase-05-simulation/simulatte-physics-ir-domains.js',
    '../../pipeline/phase-05-simulation/simulatte-physics-ir-behaviors.js',
    '../../pipeline/phase-05-simulation/simulatte-physics-ir-operators.js',
    '../../pipeline/phase-05-simulation/simulatte-physics-ir.js',
    '../../pipeline/phase-05-simulation/simulatte-physics-ir-validator.js',
    '../../pipeline/phase-04-grounded-intent/simulatte-intent-brief-schema.js',
    '../../pipeline/phase-04-grounded-intent/simulatte-structured-intent-model.js',
    '../../pipeline/phase-04-grounded-intent/simulatte-causal-physics-graph.js',
    '../../pipeline/phase-04-grounded-intent/simulatte-assumption-ledger.js',
    '../../pipeline/phase-04-grounded-intent/simulatte-causal-visual-affordances.js',
    '../../pipeline/phase-02-language/simulatte-language-evidence.js',
    '../../pipeline/phase-03-retrieval/simulatte-activation-cloud.js',
    '../../pipeline/phase-04-grounded-intent/simulatte-grounded-interpretation.js',
    '../../pipeline/phase-04-grounded-intent/simulatte-intent-forensics.js',
    '../../pipeline/phase-05-simulation/solvers/simulatte-solver-rigid-body-2d.js',
    '../../pipeline/phase-05-simulation/solvers/simulatte-solver-particles.js',
    '../../pipeline/phase-05-simulation/solvers/simulatte-solver-constraints.js',
    '../../pipeline/phase-05-simulation/solvers/simulatte-solver-thermal.js',
    '../../pipeline/phase-05-simulation/solvers/simulatte-solver-advection.js',
    '../../pipeline/phase-05-simulation/solvers/simulatte-solver-pressure-flow-lite.js',
    '../../pipeline/phase-05-simulation/solvers/simulatte-solver-wave-field.js',
    '../../pipeline/phase-05-simulation/solvers/simulatte-solver-reaction-diffusion.js',
    '../../pipeline/phase-05-simulation/solvers/simulatte-solver-fracture-threshold.js',
    '../../pipeline/phase-05-simulation/solvers/simulatte-solver-rotational-mechanics.js',
    '../../pipeline/phase-05-simulation/solvers/simulatte-solver-network-control.js',
    '../../pipeline/phase-05-simulation/solvers/simulatte-solver-growth-decay.js',
    '../../pipeline/phase-05-simulation/simulatte-solver-registry.js',
    '../../pipeline/phase-05-simulation/simulatte-solver-compiler.js',
    '../../pipeline/phase-05-simulation/simulatte-render-registry.js',
    '../../pipeline/phase-05-simulation/simulatte-render-ir.js',
    '../../pipeline/phase-06-visual/simulatte-visual-operator-atlas.js',
    '../../pipeline/phase-06-visual/simulatte-visual-operator-compiler.js',
    '../../pipeline/phase-06-visual/simulatte-composition-graph-dependencies.js',
    '../../pipeline/phase-06-visual/simulatte-composition-graph-constants.js',
    '../../pipeline/phase-06-visual/simulatte-composition-graph-selection-layout.js',
    '../../pipeline/phase-06-visual/simulatte-composition-graph-render-ir-binding.js',
    '../../pipeline/phase-06-visual/simulatte-composition-graph-visual-ir.js',
    '../../pipeline/phase-06-visual/simulatte-composition-graph-materials.js',
    '../../pipeline/phase-06-visual/simulatte-composition-graph-scene-packet.js',
    '../../pipeline/phase-06-visual/simulatte-composition-graph-visual-genome.js',
    '../../pipeline/phase-06-visual/simulatte-composition-graph-programs.js',
    '../../pipeline/phase-06-visual/simulatte-composition-graph-helpers.js',
    '../../pipeline/phase-06-visual/simulatte-composition-graph-facade-support.js',
    '../../pipeline/phase-06-visual/simulatte-composition-graph.js',
    '../../pipeline/phase-05-simulation/simulatte-physics-model-dependencies.js',
    '../../pipeline/phase-05-simulation/simulatte-physics-model-contracts.js',
    '../../pipeline/phase-05-simulation/simulatte-physics-model-phase-runtime-language.js',
    '../../pipeline/phase-05-simulation/simulatte-physics-model-phase-retrieval.js',
    '../../pipeline/phase-05-simulation/simulatte-physics-model-activation-verdicts.js',
    '../../pipeline/phase-05-simulation/simulatte-physics-model-activation-fusion.js',
    '../../pipeline/phase-05-simulation/simulatte-physics-model-phase-grounding.js',
    '../../pipeline/phase-05-simulation/simulatte-physics-model-phase-simulation.js',
    '../../pipeline/phase-05-simulation/simulatte-physics-model-phase-visual-render.js',
    '../../pipeline/phase-05-simulation/simulatte-physics-model-state-solvers.js',
    '../../pipeline/phase-05-simulation/simulatte-physics-model-spec-api.js',
    '../../pipeline/phase-05-simulation/simulatte-physics-model-metrics.js',
    '../../pipeline/phase-05-simulation/simulatte-physics-model-compatibility.js',
    '../../pipeline/phase-05-simulation/simulatte-physics-model.js',
  ]);
  const WORKER_SEARCH = root && root.location && root.location.search || '';

  function loadCompilerScripts() {
    if (typeof importScripts !== 'function') {
      throw new Error('Worker importScripts unavailable');
    }
    importScripts(...versionedScriptOrder());
    if (!root.SimulattePhysicsModel || !root.SimulattePhysicsModel.createSpecFromPrompt) {
      throw new Error('SimulattePhysicsModel unavailable in pipeline worker');
    }
  }

  function versionedScriptOrder() {
    if (!WORKER_SEARCH || WORKER_SEARCH === '?') return SCRIPT_ORDER;
    const suffix = WORKER_SEARCH.startsWith('?') ? WORKER_SEARCH : `?${WORKER_SEARCH}`;
    return SCRIPT_ORDER.map((script) => `${script}${suffix}`);
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
