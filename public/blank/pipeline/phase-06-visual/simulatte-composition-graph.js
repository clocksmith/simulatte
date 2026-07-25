(function attachSimulatteCompositionGraph(root) {
  if (typeof module === 'object' && module.exports) {
    require('./simulatte-composition-graph-dependencies.js');
    require('./simulatte-composition-graph-constants.js');
    require('./simulatte-composition-graph-selection-layout.js');
    require('./simulatte-composition-graph-render-ir-binding.js');
    require('./simulatte-composition-graph-entity-lowering.js');
    require('./simulatte-composition-graph-visual-ir.js');
    require('./simulatte-composition-graph-materials.js');
    require('./simulatte-construction-evidence.js');
    require('./simulatte-construction-placement.js');
    require('./simulatte-construction-parts.js');
    require('./simulatte-construction-geometry.js');
    require('./simulatte-prompt-visual-contracts.js');
    require('./simulatte-object-geometry-grammars.js');
    require('./simulatte-scene-framing.js');
    require('./simulatte-scene-animation.js');
    require('./simulatte-composition-graph-scene-packet.js');
    require('./simulatte-composition-graph-visual-genome.js');
    require('./simulatte-composition-graph-programs.js');
    require('./simulatte-composition-graph-dialects.js');
    require('./simulatte-composition-graph-constraint-layout.js');
    require('./simulatte-composition-graph-helpers.js');
    require('./simulatte-composition-graph-facade-support.js');
  }
  const scope = root.SimulattePhaseModuleRegistry.family('compositionGraph');
  const api = {
    COMPOSITION_SCHEMA: scope.COMPOSITION_SCHEMA,
    MATERIAL_STYLES: scope.MATERIAL_STYLES,
    RENDER_PROGRAM_SCHEMA: scope.RENDER_PROGRAM_SCHEMA,
    buildCompositionGraph: scope.buildCompositionGraph,
    compileCompositionToRenderProgram: scope.compileCompositionToRenderProgram,
  };
  root.SimulattePhaseModuleRegistry.finalize('compositionGraph', {
    requiredExports: Object.keys(api),
  });
  Object.freeze(api);
  if (typeof module === 'object' && module.exports) {
      module.exports = api;
    }
  root.SimulatteCompositionGraph = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
