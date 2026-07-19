(function attachSimulatteRuntimeScriptManifest(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteRuntimeScriptManifest = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createRuntimeScriptManifest() {
  const group = (...paths) => Object.freeze(paths);
  const join = (...groups) => Object.freeze(groups.flat());

  const phaseContracts = group(
    'pipeline/simulatte-phase-contracts.js'
  );
  const catalog = group(
    'pipeline/phase-05-simulation/simulatte-physics-catalog-dependencies.js',
    'pipeline/phase-05-simulation/simulatte-physics-catalog-constants.js',
    'pipeline/phase-05-simulation/simulatte-physics-catalog-templates.js',
    'pipeline/phase-05-simulation/simulatte-physics-catalog-primitive-data.js',
    'pipeline/phase-05-simulation/simulatte-physics-catalog-materials.js',
    'pipeline/phase-05-simulation/simulatte-physics-catalog-graph-data.js',
    'pipeline/phase-05-simulation/simulatte-physics-catalog-examples.js',
    'pipeline/phase-05-simulation/simulatte-physics-catalog-graph-helpers.js',
    'pipeline/phase-05-simulation/simulatte-physics-catalog.js'
  );
  const semanticRag = group(
    '../data/simulatte-construction-substrate.js',
    'pipeline/phase-03-retrieval/simulatte-semantic-rag-dependencies.js',
    'pipeline/phase-03-retrieval/simulatte-semantic-rag-constants.js',
    'pipeline/phase-03-retrieval/simulatte-semantic-rag-helpers.js',
    'pipeline/phase-03-retrieval/simulatte-semantic-rag-surface-cards.js',
    'pipeline/phase-03-retrieval/simulatte-semantic-rag-grounding-cards.js',
    'pipeline/phase-03-retrieval/simulatte-semantic-rag-lexical-construction.js',
    'pipeline/phase-03-retrieval/simulatte-semantic-rag-retrieval.js',
    'pipeline/phase-03-retrieval/simulatte-semantic-rag.js'
  );
  const dopplerIntent = group(
    'pipeline/phase-01-runtime/simulatte-doppler-intent.js'
  );
  const graphSynthesis = group(
    'pipeline/phase-04-grounded-intent/simulatte-graph-synthesis-dependencies.js',
    'pipeline/phase-04-grounded-intent/simulatte-graph-synthesis-constants.js',
    'pipeline/phase-04-grounded-intent/simulatte-graph-synthesis-helpers.js',
    'pipeline/phase-04-grounded-intent/simulatte-graph-synthesis-surface-cards.js',
    'pipeline/phase-04-grounded-intent/simulatte-graph-synthesis-retrieval.js',
    'pipeline/phase-04-grounded-intent/simulatte-graph-synthesis.js'
  );
  const intentEmbedder = group(
    'pipeline/phase-03-retrieval/simulatte-intent-embedder-dependencies.js',
    'pipeline/phase-03-retrieval/simulatte-intent-embedder-constants.js',
    'pipeline/phase-03-retrieval/simulatte-intent-embedder-model-lock.js',
    'pipeline/phase-03-retrieval/simulatte-intent-embedder-model-cache.js',
    'pipeline/phase-03-retrieval/simulatte-intent-embedder-runtime-class.js',
    'pipeline/phase-03-retrieval/simulatte-intent-embedder-runtime-probes.js',
    'pipeline/phase-03-retrieval/simulatte-intent-embedder-construction-retrieval.js',
    'pipeline/phase-03-retrieval/simulatte-intent-embedder-span-retrieval.js',
    'pipeline/phase-03-retrieval/simulatte-intent-embedder-slot-retrieval.js',
    'pipeline/phase-03-retrieval/simulatte-intent-embedder-rerank-runtime.js',
    'pipeline/phase-03-retrieval/simulatte-intent-embedder-manifest-cache.js',
    'pipeline/phase-03-retrieval/simulatte-intent-embedder-rerank.js',
    'pipeline/phase-03-retrieval/simulatte-intent-embedder-vectors.js',
    'pipeline/phase-03-retrieval/simulatte-intent-embedder-facade-support.js',
    'pipeline/phase-03-retrieval/simulatte-intent-embedder.js'
  );
  const languageAndGroundingEntry = group(
    'pipeline/phase-03-retrieval/simulatte-intent-classifier.js',
    '../data/simulatte-language-lexicon.js',
    '../language/simulatte-universe-parser.js',
    'pipeline/phase-02-language/simulatte-universe-parser.js',
    'pipeline/phase-04-grounded-intent/simulatte-universe-grounder-graph.js',
    'pipeline/phase-04-grounded-intent/simulatte-universe-grounder-candidates.js',
    'pipeline/phase-04-grounded-intent/simulatte-universe-grounder.js'
  );
  const physicsIr = group(
    'pipeline/phase-05-simulation/simulatte-operator-stage.js',
    'pipeline/phase-05-simulation/simulatte-physics-ir-dependencies.js',
    'pipeline/phase-05-simulation/simulatte-physics-ir-constants.js',
    'pipeline/phase-05-simulation/simulatte-physics-ir-builder.js',
    'pipeline/phase-05-simulation/simulatte-physics-ir-domains.js',
    'pipeline/phase-05-simulation/simulatte-physics-ir-behaviors.js',
    'pipeline/phase-05-simulation/simulatte-physics-ir-operators.js',
    'pipeline/phase-05-simulation/simulatte-physics-ir.js',
    'pipeline/phase-05-simulation/simulatte-physics-ir-validator.js'
  );
  const groundedIntent = group(
    'pipeline/phase-04-grounded-intent/simulatte-intent-brief-schema.js',
    'pipeline/phase-04-grounded-intent/simulatte-structured-intent-rules.js',
    'pipeline/phase-04-grounded-intent/simulatte-causal-physics-graph.js',
    'pipeline/phase-04-grounded-intent/simulatte-assumption-ledger.js',
    'pipeline/phase-04-grounded-intent/simulatte-causal-visual-affordances.js',
    'pipeline/phase-02-language/simulatte-language-evidence.js',
    'pipeline/phase-03-retrieval/simulatte-activation-cloud.js',
    'pipeline/phase-04-grounded-intent/simulatte-grounded-interpretation.js',
    'pipeline/phase-04-grounded-intent/simulatte-intent-forensics.js'
  );
  const solverAndRenderIr = group(
    'pipeline/phase-05-simulation/solvers/simulatte-solver-values.js',
    'pipeline/phase-05-simulation/solvers/simulatte-solver-rigid-body-2d.js',
    'pipeline/phase-05-simulation/solvers/simulatte-solver-particles.js',
    'pipeline/phase-05-simulation/solvers/simulatte-solver-constraints.js',
    'pipeline/phase-05-simulation/solvers/simulatte-solver-thermal.js',
    'pipeline/phase-05-simulation/solvers/simulatte-solver-advection.js',
    'pipeline/phase-05-simulation/solvers/simulatte-solver-pressure-flow-lite.js',
    'pipeline/phase-05-simulation/solvers/simulatte-solver-wave-field.js',
    'pipeline/phase-05-simulation/solvers/simulatte-solver-reaction-diffusion.js',
    'pipeline/phase-05-simulation/solvers/simulatte-solver-fracture-threshold.js',
    'pipeline/phase-05-simulation/solvers/simulatte-solver-rotational-mechanics.js',
    'pipeline/phase-05-simulation/solvers/simulatte-solver-network-control.js',
    'pipeline/phase-05-simulation/solvers/simulatte-solver-growth-decay.js',
    'pipeline/phase-05-simulation/solvers/simulatte-solver-particle-deposition.js',
    'pipeline/phase-05-simulation/simulatte-solver-registry.js',
    'pipeline/phase-05-simulation/simulatte-solver-compiler.js',
    'pipeline/phase-05-simulation/simulatte-render-registry.js',
    'pipeline/phase-05-simulation/simulatte-render-ir.js'
  );
  const visualCompile = group(
    'pipeline/phase-06-visual/simulatte-visual-operator-atlas.js',
    'pipeline/phase-06-visual/simulatte-visual-operator-compiler.js',
    'pipeline/phase-06-visual/simulatte-composition-graph-dependencies.js',
    'pipeline/phase-06-visual/simulatte-composition-graph-constants.js',
    'pipeline/phase-06-visual/simulatte-composition-graph-selection-layout.js',
    'pipeline/phase-06-visual/simulatte-composition-graph-render-ir-binding.js',
    'pipeline/phase-06-visual/simulatte-composition-graph-entity-lowering.js',
    'pipeline/phase-06-visual/simulatte-composition-graph-visual-ir.js',
    'pipeline/phase-06-visual/simulatte-composition-graph-materials.js',
    'pipeline/phase-06-visual/simulatte-construction-geometry.js',
    'pipeline/phase-06-visual/simulatte-prompt-visual-contracts.js',
    'pipeline/phase-06-visual/simulatte-object-geometry-grammars.js',
    'pipeline/phase-06-visual/simulatte-scene-framing.js',
    'pipeline/phase-06-visual/simulatte-scene-animation.js',
    'pipeline/phase-06-visual/simulatte-composition-graph-scene-packet.js',
    'pipeline/phase-06-visual/simulatte-composition-graph-visual-genome.js',
    'pipeline/phase-06-visual/simulatte-composition-graph-programs.js',
    'pipeline/phase-06-visual/simulatte-composition-graph-dialects.js',
    'pipeline/phase-06-visual/simulatte-composition-graph-constraint-layout.js',
    'pipeline/phase-06-visual/simulatte-composition-graph-helpers.js',
    'pipeline/phase-06-visual/simulatte-composition-graph-facade-support.js',
    'pipeline/phase-06-visual/simulatte-composition-graph.js'
  );
  const loading = group(
    'app/loading/loading-canvas-support.js',
    'app/loading/loading-canvas.js'
  );
  const runtimeProgress = group(
    'app/runtime/runtime-progress-support.js',
    'app/runtime/runtime-progress-state.js',
    'app/runtime/runtime-progress.js'
  );
  const renderProof = group(
    'pipeline/phase-07-render/simulatte-render-proof.js'
  );
  const webGpuRenderer = group(
    'pipeline/phase-07-render/simulatte-webgpu-renderer-dependencies.js',
    'pipeline/phase-07-render/simulatte-webgpu-renderer-constants.js',
    'pipeline/phase-07-render/simulatte-webgpu-renderer-pixel-plan.js',
    'pipeline/phase-07-render/simulatte-webgpu-renderer-scene-proof-observer.js',
    'pipeline/phase-07-render/simulatte-webgpu-renderer-renderer-class.js',
    'pipeline/phase-07-render/simulatte-webgpu-renderer-part-segmentation.js',
    'pipeline/phase-07-render/simulatte-webgpu-renderer-packets.js',
    'pipeline/phase-07-render/simulatte-webgpu-renderer-pixel-proof.js',
    'pipeline/phase-07-render/simulatte-webgpu-renderer-gpu-data.js',
    'pipeline/phase-07-render/simulatte-webgpu-renderer-background-shader.js',
    'pipeline/phase-07-render/simulatte-webgpu-renderer-object-shader.js',
    'pipeline/phase-07-render/simulatte-webgpu-renderer.js'
  );
  const sceneProof = group(
    'pipeline/phase-08-scene-proof/simulatte-scene-proof.js'
  );
  const physicsModel = group(
    'pipeline/phase-05-simulation/simulatte-physics-model-dependencies.js',
    'pipeline/phase-05-simulation/simulatte-physics-model-contracts.js',
    'pipeline/phase-05-simulation/simulatte-physics-model-phase-runtime-language.js',
    'pipeline/phase-05-simulation/simulatte-physics-model-phase-retrieval.js',
    'pipeline/phase-05-simulation/simulatte-physics-model-activation-verdicts.js',
    'pipeline/phase-05-simulation/simulatte-physics-model-activation-fusion.js',
    'pipeline/phase-05-simulation/simulatte-physics-model-phase-grounding.js',
    'pipeline/phase-05-simulation/simulatte-physics-model-phase-simulation.js',
    'pipeline/phase-05-simulation/simulatte-physics-model-phase-visual-render.js',
    'pipeline/phase-05-simulation/simulatte-physics-model-state-solvers.js',
    'pipeline/phase-05-simulation/simulatte-physics-model-spec-api.js',
    'pipeline/phase-05-simulation/simulatte-physics-model-metrics.js',
    'pipeline/phase-05-simulation/simulatte-physics-model-compatibility.js',
    'pipeline/phase-05-simulation/simulatte-physics-model.js'
  );
  const prompt = group(
    'app/prompt/prompt-controller-dependencies.js',
    'app/prompt/prompt-controller-model-bindings.js',
    'app/prompt/prompt-controller-construction-search.js',
    'app/prompt/prompt-controller-lab-controller.js',
    'app/prompt/prompt-controller-workers.js',
    'app/prompt/prompt-controller-training.js',
    'app/prompt/prompt-controller.js'
  );
  const simulation = group(
    'app/simulation/simulation-lab.js'
  );
  const review = group(
    'app/prompt/prompt-review-bridge-store.js',
    'app/prompt/prompt-review-bridge.js'
  );

  const browser = join(
    group('../neural-model-consent.js'),
    phaseContracts,
    catalog,
    semanticRag,
    dopplerIntent,
    graphSynthesis,
    intentEmbedder,
    languageAndGroundingEntry,
    physicsIr,
    groundedIntent,
    solverAndRenderIr,
    visualCompile,
    loading,
    runtimeProgress,
    renderProof,
    webGpuRenderer,
    sceneProof,
    physicsModel,
    prompt,
    simulation,
    review
  );
  const pipelineWorker = join(
    phaseContracts,
    catalog,
    semanticRag,
    dopplerIntent,
    graphSynthesis,
    languageAndGroundingEntry,
    physicsIr,
    groundedIntent,
    solverAndRenderIr,
    visualCompile,
    renderProof,
    physicsModel
  );
  const intentWorker = join(
    catalog,
    semanticRag,
    dopplerIntent,
    group('pipeline/phase-02-language/simulatte-language-evidence.js'),
    intentEmbedder
  );

  return Object.freeze({
    schema: 'simulatte.runtimeScriptManifest.v1',
    browser,
    pipelineWorker,
    intentWorker,
  });
});
