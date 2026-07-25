(function attachSimulatteConstructionGeometry(root) {
  const scope = root.SimulattePhaseModuleRegistry.family('compositionGraph');
  const substrateApi = typeof module === 'object' && module.exports
    ? require('../../../data/simulatte-construction-substrate.js')
    : root.SimulatteConstructionSubstrate || {};
  const constructionLayoutVariants = substrateApi.CONSTRUCTION_LAYOUT_VARIANTS || [];

    const CONSTRUCTION_GEOMETRY_SCHEMA = 'simulatte.constructiveGeometryProgram.v1';
    function constructionGeometryProgramForEntity(identity = {}, geometry = {}, entity = {}, options = {}) {
      const construction = options.construction || entity.construction || geometry.construction || null;
      if (!construction || construction.schema !== 'simulatte.constructionProgramInput.v1') return null;
      const layoutVariant = options.layoutVariant || constructionLayoutVariants[0] || {
        id: 'balanced', spread: 1, aspect: 1, radialStep: 0.72,
      };
      const descriptors = scope.constructionPartDescriptors(construction);
      const materialPalette = scope.constructionMaterialPalette(construction.materialHints || []);
      const geometryPartHints = construction.sourcePartHints && construction.sourcePartHints.length
        ? construction.sourcePartHints
        : construction.partHints || [];
      const graph = scope.constructionGraphForEvidence(construction, descriptors, layoutVariant);
      const graphParts = scope.constructionGraphParts(graph, materialPalette, layoutVariant);
      const topologyParts = graphParts.length ? graphParts : scope.constructionTopologyParts(construction, materialPalette);
      const parts = topologyParts.length ? topologyParts : scope.constructionParts(descriptors, materialPalette);
      if (!parts.length) return null;
      const sourceIds = construction.sourceCardIds || [];
      const provenance = construction.provenance
        ? [construction.provenance]
        : entity.constructionProvenance || [];
      const identityType = String(identity.type || construction.targetEntryId || 'constructed-object')
        .replace(/^[a-z]+:/, '');
      return {
        schema: 'simulatte.objectGeometryProgram.v1',
        constructionSchema: CONSTRUCTION_GEOMETRY_SCHEMA,
        grammarId: `object-grammar.constructive.${scope.constructionGeometrySafeId(
          graph.topologyId || sourceIds[0] || identityType
        )}.${scope.constructionGeometrySafeId(layoutVariant.id)}`,
        identityType,
        visualArchetype: (construction.shapeHints || [])[0] || 'constructed-object',
        pose: '',
        literal: true,
        minScale: scope.constructionMinimumScale(construction, parts.length),
        zOrder: 30,
        parts,
        source: 'phase3-model-construction-evidence',
        sourcePrimitive: geometry.primitive || entity.shape || '',
        selectionRole: 'model-construction',
        constructionGraph: graph,
        constructionReceipt: {
          schema: 'simulatte.constructiveGeometryReceipt.v1',
          sourceCardIds: sourceIds.slice(),
          basisIds: (construction.basisIds || []).slice(),
          inputPartHintCount: geometryPartHints.length,
          realizedPartCount: parts.length,
          modelEvaluated: provenance.some((row) => row.modelEvaluated === true),
          rerankEvaluated: provenance.some((row) => row.rerankEvaluated === true),
          literalSlotMatch: provenance.some((row) => row.literalSlotMatch === true),
          exactTargetMatch: provenance.some((row) => row.exactTargetMatch === true),
          targetIdentityBound: provenance.some((row) => row.targetIdentityBound === true),
          targetEntryId: construction.targetEntryId || '',
          candidateIds: provenance.map((row) => row.candidateId).filter(Boolean),
          hypothesisId: construction.hypothesisId || sourceIds[0] || '',
          topologyId: graph.topologyId,
          topologySelectionMethod: graph.topologySelectionMethod,
          topologyTargetCueScore: graph.topologyTargetCueScore,
          topologyTargetFit: graph.topologyTargetFit,
          layoutVariantId: layoutVariant.id,
          evidencePartCoverage: scope.constructionEvidencePartCoverage(parts, geometryPartHints),
        },
      };
    }

    root.SimulattePhaseModuleRegistry.define('compositionGraph', 'simulatte-construction-geometry.js', {
      CONSTRUCTION_GEOMETRY_SCHEMA,
      constructionGeometryProgramForEntity,
    });

})(typeof globalThis !== 'undefined' ? globalThis : window);
