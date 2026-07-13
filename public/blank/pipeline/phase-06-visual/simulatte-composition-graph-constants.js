(function attachSimulatteCompositionGraphconstants(root) {
  const scope = root.__SimulatteCompositionGraphRefactorScope;
  if (!scope || scope.missingDependency) return;
  with (scope) {
    const {
        clamp,
        hashNoise,
        PROCEDURAL_VISUAL_BASE,
        SEMANTIC_VISUAL_ATLAS,
        uniqueList,
      } = catalog;

    const COMPOSITION_SCHEMA = 'simulatte.compositionGraph.v1';

    const RENDER_PROGRAM_SCHEMA = 'simulatte.renderProgram.v1';

    const VISUAL_IR_SCHEMA = 'simulatte.visualIR.v1';

    const SCENE_RENDER_PACKET_SCHEMA = 'simulatte.sceneRenderPacket.v1';

    const SCENE_COMPOSITION_LEDGER_SCHEMA = 'simulatte.sceneCompositionLedger.v1';

    const VISUAL_GENOME_SCHEMA = 'simulatte.visualGenome.v1';

    Object.assign(scope, {
      clamp,
      hashNoise,
      PROCEDURAL_VISUAL_BASE,
      SEMANTIC_VISUAL_ATLAS,
      uniqueList,
      COMPOSITION_SCHEMA,
      RENDER_PROGRAM_SCHEMA,
      VISUAL_IR_SCHEMA,
      SCENE_RENDER_PACKET_SCHEMA,
      SCENE_COMPOSITION_LEDGER_SCHEMA,
      VISUAL_GENOME_SCHEMA,
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
