(function registerActivityGrounding(root) {
  const registry = typeof module === 'object' && module.exports
    ? require('../../app/runtime/phase-module-registry.js') : root.SimulattePhaseModuleRegistry;
  function bindActivityParticipantIdentities(retrieval, graph) {
    if(!retrieval||!graph)return;
    const bindings=[];
    for(const {request}of retrieval.candidates){
      if(!request.definiteReference)continue;
      const object=graph.nodes.find(node=>node.spanId===request.objectSpanId);
      if(!object||(object.cardinality||1)!==1)continue;
      const previous=retrieval.candidates.filter(row=>row.request.evidence.start<request.evidence.start&&row.request.actorSpanId===request.actorSpanId);
      const matches=[...new Set(previous.map(row=>graph.nodes.find(node=>node.spanId===row.request.objectSpanId||node.sourceSpanIds?.includes(row.request.objectSpanId))).filter(node=>node&&node.id!==object.id&&node.label===object.label&&(node.cardinality||1)===1))];
      if(matches.length!==1)continue;
      const target=matches[0];target.sourceSpanIds=[...new Set([...(target.sourceSpanIds||[]),target.spanId,object.spanId])];
      bindings.push({sourceSpanId:object.spanId,sourceNodeId:object.id,targetNodeId:target.id,evidence:request.evidence});
      graph.nodes=graph.nodes.filter(node=>node!==object);
      graph.edges=(graph.edges||[]).map(edge=>({...edge,from:edge.from===object.id?target.id:edge.from,to:edge.to===object.id?target.id:edge.to}));
    }
    graph.activityIdentityBindings=bindings;
  }
  function groundActivityGraph(retrieval, acceptedGraph) {
    if (!retrieval) return null;
    const nodes = acceptedGraph?.nodes || [], actions = [], unsupported = [], assumptions = [];
    for (const row of retrieval.candidates) {
      const request = row.request;
      const actor = request.actorSpanId
        ? nodes.find(node => node.spanId === request.actorSpanId && !node.unresolved) : null;
      const object = request.objectSpanId
        ? nodes.find(node => (node.spanId === request.objectSpanId || node.sourceSpanIds?.includes(request.objectSpanId)) && !node.unresolved) : null;
      const support = request.supportSpanId ? nodes.find(node=>node.spanId===request.supportSpanId&&!node.unresolved) : null;
      const prior = actions.find(action => action.id === request.timing.after);
      const start = request.timing.after ? prior?.endSeconds : 0;
      const duration = request.timing.durationSeconds ?? 4;
      const hand = ['hold', 'drink', 'place'].includes(request.action) ? request.hand || 'right' : null;
      const reason = row.rejection || (!row.component ? 'missing activity component' :
        !actor ? 'missing supported actor' : !['walk','stand'].includes(request.action) && !object ? 'missing supported object' : request.action==='place'&&!support ? 'missing supported placement surface' :
          (actor.cardinality || 1) !== 1 || object && (object.cardinality || 1) !== 1 ? 'activity requires individually identified participants; exact count is retained as unsupported' :
          start == null ? 'missing temporal predecessor' :
            duration <= 0 || start + duration > retrieval.capabilities.limits.maxDurationSeconds ? 'unsupported duration' : null);
      if (reason) { unsupported.push({ id: request.id, reason, evidence: request.evidence }); continue; }
      if (hand && !request.hand) assumptions.push({ id: `${request.id}:hand`, value: hand, reason: 'unspecified hand' });
      if (request.timing.durationSeconds == null) assumptions.push({ id: `${request.id}:duration`, value: duration, units: 's' });
      const action = { ...request, actorId: actor.id, objectId: object?.id || null, supportObjectId:support?.id||null, hand,
        startSeconds: start, endSeconds: start + duration, durationSeconds: duration,
        component: row.component, sourceEvidence: request.evidence,
        reads: row.component.reads, writes: row.component.writes.map(channel => `${actor.id}:${channel === 'hand' ? hand + '-hand' : channel}`),
        status: 'accepted' };
      actions.push(action);
    }
    for (let i = 0; i < actions.length; i++) for (let j = i + 1; j < actions.length; j++) {
      const a = actions[i], b = actions[j];
      if (Math.max(a.startSeconds, b.startSeconds) >= Math.min(a.endSeconds, b.endSeconds)) continue;
      const shared = a.writes.filter(channel => b.writes.includes(channel));
      const sameObject = a.objectId && a.objectId === b.objectId && ['hold', 'drink'].includes(a.action) && ['hold', 'drink'].includes(b.action);
      const holdDrink = sameObject && a.hand === b.hand && a.actorId === b.actorId && a.action !== b.action;
      if (holdDrink) { a.compositionRule = b.compositionRule = 'drink-controls-shared-hold'; continue; }
      const ownershipConflict = a.objectId && a.objectId === b.objectId && ['hold', 'drink', 'place'].includes(a.action) && ['hold', 'drink', 'place'].includes(b.action);
      if (!shared.length && !ownershipConflict) continue;
      for (const action of [a, b]) {
        action.status = 'unsupported';
        unsupported.push({ id: action.id, reason: ownershipConflict ? 'conflicting object ownership' : 'conflicting channel writers',
          conflictingActionIds: [a.id, b.id], channels: shared, evidence: action.sourceEvidence });
      }
    }
    if (actions.length > retrieval.capabilities.limits.maxActions) throw new Error('Activity action bound exceeded');
    return { schema: 'simulatte.activityGraph.v1', capabilities: retrieval.capabilities, actions,
      unsupported, assumptions, coverage: retrieval.capabilities.coverage };
  }
  registry.define('physicsModel', 'simulatte-activity-grounding.js', { groundActivityGraph, bindActivityParticipantIdentities });
})(typeof globalThis !== 'undefined' ? globalThis : window);
