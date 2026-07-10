(function attachSimulatteCompositionGraph(root) {
  if (typeof module === 'object' && module.exports) {
    require('./simulatte-composition-graph-dependencies.js');
    require('./simulatte-composition-graph-constants.js');
    require('./simulatte-composition-graph-selection-layout.js');
    require('./simulatte-composition-graph-render-ir-binding.js');
    require('./simulatte-composition-graph-visual-ir.js');
    require('./simulatte-composition-graph-materials.js');
    require('./simulatte-composition-graph-scene-packet.js');
    require('./simulatte-composition-graph-visual-genome.js');
    require('./simulatte-composition-graph-programs.js');
    require('./simulatte-composition-graph-dialects.js');
    require('./simulatte-composition-graph-helpers.js');
    require('./simulatte-composition-graph-facade-support.js');
  }
  const scope = root.__SimulatteCompositionGraphRefactorScope = root.__SimulatteCompositionGraphRefactorScope || {};
  if (scope.missingDependency) return;
  let api;
  with (scope) {
    api = {
    COMPOSITION_SCHEMA,
    MATERIAL_STYLES,
    RENDER_PROGRAM_SCHEMA,
    buildCompositionGraph,
    compileCompositionToRenderProgram,
  };
  }
  if (typeof module === 'object' && module.exports) {
      module.exports = api;
    }
  root.SimulatteCompositionGraph = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
