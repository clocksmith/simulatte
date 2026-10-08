(function registerActivityRetrieval(root) {
  const registry = typeof module === 'object' && module.exports
    ? require('../../app/runtime/phase-module-registry.js') : root.SimulattePhaseModuleRegistry;
  function retrieveActivityComponents(languageGraph) {
    const capabilities = languageGraph.activityCapabilities;
    if (!capabilities) return null;
    return { schema: 'simulatte.activityRetrieval.v1', capabilities,
      candidates: (languageGraph.activityRequests || []).map(request => ({ request,
        component: capabilities.components.find(row => row.id === request.action) || null,
        provenance: { source: 'phase1-declared-activity-capabilities', skeletonId: capabilities.skeleton.id },
        rejection: request.negated ? 'prohibited activity' :
          capabilities.components.find(row => row.id === request.action)?.execution.supported === false
            ? 'support placement and release trajectory are not qualified' : null })) };
  }
  function attachActivitySlotEvidence(rows, languageGraph) {
    const retrieval = retrieveActivityComponents(languageGraph);
    if (!retrieval) return rows;
    return rows.map(row => {
      if (!['action', 'relation'].includes(row.slotRole)) return row;
      const match = retrieval.candidates.find(candidate => candidate.component && !candidate.rejection &&
        row.sourceSpanIds.includes(candidate.request.evidence.verbSpanId));
      if (!match) return row;
      const id = `activity-component:${match.component.id}`;
      const candidate = { id, candidateId: id, candidateType: 'activity-component', label: match.component.id,
        candidateText: match.component.id, semanticType: 'process', canonicalId: id,
        source: 'phase1-declared-activity-capabilities', provenance: match.provenance,
        sourceSpanIds: match.request.evidence.sourceSpanIds, component: match.component,
        slotId: row.slotId, slotRole: row.slotRole, decision: 'accept', supportOnly: false,
        modelEvaluated: false, score: 1, reason: 'declared procedural component; Phase 4 checks composition and participants' };
      return { ...row, status: 'preserved', candidates: [...row.candidates, candidate],
        acceptedCandidates: [...row.acceptedCandidates, candidate], acceptedCount: row.acceptedCount + 1,
        acceptedCandidateIds: [...row.acceptedCandidateIds, id] };
    });
  }
  registry.define('physicsModel', 'simulatte-activity-retrieval.js', { retrieveActivityComponents, attachActivitySlotEvidence });
})(typeof globalThis !== 'undefined' ? globalThis : window);
