(function attachSimulatteSemanticProvenance(root) {
  const registry = typeof module === 'object' && module.exports
    ? require('../../app/runtime/phase-module-registry.js')
    : root.SimulattePhaseModuleRegistry;
  const scope = registry.family('physicsModel');

  function provenanceByNodeRows(acceptedGraph = {}, intentBrief = {}) {
    const bindings = intentBrief.evidenceBindings || [];
    return Object.fromEntries((acceptedGraph && acceptedGraph.nodes || []).map((node) => [
      node.id,
      {
        source: node.source || node.provenance && node.provenance.source ||
          node.spanId && 'prompt-language-span' || node.indexName ||
          node.constructionProvenance && node.constructionProvenance[0] &&
            node.constructionProvenance[0].source || '',
        evidenceIds: scope.uniqueList([
          node.spanId,
          ...(node.evidence || []),
          node.indexName ? `index:${node.indexName}` : '',
          ...(node.constructionProvenance || []).flatMap((row) => [
            row && row.candidateId,
            row && row.source ? `source:${row.source}` : '',
          ]),
          ...bindings
            .filter((row) => row && (row.nodeId === node.id || row.targetId === node.id))
            .map((row) => row.evidenceId || row.id || ''),
        ].filter(Boolean)),
      },
    ]));
  }

  function groundedSceneContractFromPhase4({
    acceptedGraph = null,
    rejectedGraph = null,
    activationCloud = {},
    groundingEvidence = {},
    intentBrief = {},
    groundedInterpretation = {},
    compositionLedger = null,
  } = {}) {
    const nodes = acceptedGraph && Array.isArray(acceptedGraph.nodes) ? acceptedGraph.nodes : [];
    const graphRelations = acceptedGraph && Array.isArray(acceptedGraph.edges) ? acceptedGraph.edges : [];
    const ledgerRelations = compositionLedger && Array.isArray(compositionLedger.relations)
      ? compositionLedger.relations : [];
    const nodeById = new Map(nodes.map((node) => [String(node.id || ''), node]));
    const provenanceByEntry = provenanceByNodeRows(acceptedGraph, {
      ...intentBrief,
      evidenceBindings: scope.uniqueById([
        ...(intentBrief.evidenceBindings || []),
        ...(groundedInterpretation.evidenceBindings || []),
      ]),
    });
    const acceptedRelations = scope.uniqueById([
      ...ledgerRelations,
      ...graphRelations.map((edge) => ({
        id: edge.id || `${edge.source || 'source'}:${edge.relation || edge.type || 'relation'}:${edge.target || 'target'}`,
        kind: edge.kind || edge.type || edge.relation || 'graph-relation',
        from: edge.source || edge.from || '',
        to: edge.target || edge.to || '',
        sourceSpanIds: scope.uniqueList([
          ...(edge.sourceSpanIds || []),
          nodeById.get(String(edge.source || edge.from || '')) &&
            nodeById.get(String(edge.source || edge.from || '')).spanId,
          nodeById.get(String(edge.target || edge.to || '')) &&
            nodeById.get(String(edge.target || edge.to || '')).spanId,
        ].filter(Boolean)),
        evidenceIds: scope.uniqueList([
          ...(edge.evidence || []),
          ...(edge.evidenceIds || []),
        ]),
        confidence: Number(edge.confidence || 0),
      })),
    ]);
    return scope.phaseCarryObject({
      schema: scope.GROUNDED_SCENE_CONTRACT_SCHEMA,
      acceptedEntries: nodes.map((node) => ({
        id: node.id || node.canonicalId || '',
        label: node.label || node.canonicalId || '',
        kind: node.nodeType || node.semanticType || 'entity',
        provenance: provenanceByEntry[node.id || node.canonicalId || ''] &&
          provenanceByEntry[node.id || node.canonicalId || ''].source || '',
        confidence: Number(node.confidence || 0),
      })),
      acceptedRelations,
      acceptedObligations: compositionLedger && Array.isArray(compositionLedger.obligations)
        ? compositionLedger.obligations.filter((row) => row.status !== 'lost' && row.status !== 'failed')
        : [],
      rejectedEntries: rejectedGraph && Array.isArray(rejectedGraph.rejected) ? rejectedGraph.rejected : [],
      unsupported: groundingEvidence.unsupported || intentBrief.unsupported ||
        acceptedGraph && acceptedGraph.unsupported || [],
      assumptions: groundingEvidence.assumptions || intentBrief.assumptions || [],
      provenanceByEntry,
      slotCoverage: activationCloud.coverageBySlot || {},
      compositionLedger,
    });
  }

  registry.define('physicsModel', 'simulatte-semantic-provenance.js', {
    provenanceByNodeRows,
    groundedSceneContractFromPhase4,
  });
})(typeof globalThis !== 'undefined' ? globalThis : window);
