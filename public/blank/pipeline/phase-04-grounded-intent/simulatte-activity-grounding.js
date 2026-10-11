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
  const ACTION_EDIT_FIELDS = ['hand', 'afterActionId', 'durationSeconds', 'objectId', 'supportObjectId'];
  const OBJECT_EDIT_FIELDS = ['seatHeight', 'supportHeight', 'position', 'radius', 'liquidFillFraction', 'activityCapabilities'];
  function resolveActivityObjectCapabilities(node, inventory) {
    const archetype = String(node.visualArchetype || node.label || '').toLowerCase();
    const profile = inventory.objectProfiles?.find(row => row.archetypes.includes(archetype));
    const authored = node.params?.activityCapabilities;
    if (authored !== undefined && (!Array.isArray(authored) || authored.some(value =>
      !inventory.objectCapabilityNames?.includes(value)) || new Set(authored).size !== authored.length)) {
      throw new Error(`Invalid activity capabilities for ${node.id}`);
    }
    // Legacy inventories retain their original interpreted profiles.
    const legacyKind = /chair|seat|bench/.test(archetype) ? 'seat' : /cup|mug/.test(archetype) ? 'cup'
      : /phone/.test(archetype) ? 'phone' : /table|shelf|surface/.test(archetype) ? 'support' : 'object';
    const legacyCapabilities = { seat: ['seat-support'], cup: ['graspable-object', 'liquid-container'],
      phone: ['graspable-object'], support: ['support-surface'], object: ['graspable-object'] };
    const capabilities = authored ?? profile?.capabilities ?? (inventory.objectProfiles ? [] : legacyCapabilities[legacyKind]);
    const kind = capabilities.includes('seat-support') ? 'seat' : capabilities.includes('liquid-container') ? 'cup'
      : capabilities.includes('support-surface') ? 'support' : profile?.kind || (inventory.objectProfiles ? 'object' : legacyKind);
    return { kind, capabilities: capabilities.slice(), provenance: authored !== undefined
      ? { authority: 'userOverride', patchIds: node.authorship?.patchIds || [] }
      : { authority: 'declared-object-profile', archetype } };
  }
  function prepareActivityRevision(spec, revision) {
    if (!spec.activityProgram || !revision || typeof revision !== 'object') throw new Error('Activity revision requires an accepted activity');
    const candidate = { universeGraph: JSON.parse(JSON.stringify(spec.universeGraph)) };
    const nodes = candidate.universeGraph.nodes;
    function editAction(actionId, edits) {
      const action = spec.universeGraph.activityGraph?.actions.find(row => row.id === actionId);
      if (!action) throw new Error(`Unknown activity action ${actionId}`);
      const actor = nodes.find(row => row.id === action.actorId);
      if (!actor) throw new Error(`Missing activity actor ${action.actorId}`);
      if (Object.keys(edits).some(key => !ACTION_EDIT_FIELDS.includes(key))) throw new Error('Unsupported activity action edit');
      actor.params = { ...actor.params, activityOverrides: { ...actor.params?.activityOverrides,
        [action.id]: { ...actor.params?.activityOverrides?.[action.id], ...edits } } };
    }
    if (revision.swapHands === true) {
      for (const action of spec.activityProgram.actions.filter(row => row.hand)) {
        editAction(action.id, { hand: action.hand === 'left' ? 'right' : 'left' });
      }
    } else if (revision.actionId) {
      editAction(revision.actionId, revision.changes || {});
    } else if (revision.objectId) {
      const node = nodes.find(row => row.id === revision.objectId);
      if (!node || !spec.activityProgram.objects.some(row => row.id === node.id)) throw new Error('Unknown activity object');
      if (revision.remove === true) {
        candidate.universeGraph.nodes = nodes.filter(row => row.id !== node.id);
        candidate.universeGraph.edges = candidate.universeGraph.edges.filter(row => row.from !== node.id && row.to !== node.id);
      } else {
        if (!revision.changes || Object.keys(revision.changes).some(key => !OBJECT_EDIT_FIELDS.includes(key))) throw new Error('Unsupported activity object edit');
        node.params = { ...node.params, ...revision.changes };
      }
    } else throw new Error('Activity revision must identify an action or object');
    return candidate;
  }
  function reconcileActivityGraph(graph, acceptedGraph) {
    if (!graph) return null;
    const requests = graph.sourceRequests || graph.actions;
    return groundActivityGraph({ capabilities: graph.capabilities, candidates: requests.map(request => ({
      request, component: graph.capabilities.components.find(row => row.id === request.action),
      rejection: request.negated ? 'prohibited activity' :
        graph.capabilities.components.find(row => row.id === request.action)?.execution.supported === false
          ? 'declared activity component is not qualified' : null,
    })) }, acceptedGraph);
  }
  function groundActivityGraph(retrieval, acceptedGraph) {
    if (!retrieval) return null;
    const nodes = acceptedGraph?.nodes || [], actions = [], unsupported = [], assumptions = [];
    const candidates = retrieval.candidates.map(row => {
      const actor = nodes.find(node => node.spanId === row.request.actorSpanId && !node.unresolved);
      const override = actor?.params?.activityOverrides?.[row.request.id];
      if (override && (typeof override !== 'object' || Array.isArray(override) ||
          Object.keys(override).some(key => !ACTION_EDIT_FIELDS.includes(key)))) throw new Error('Invalid activity action override');
      const request = { ...row.request, timing: { ...row.request.timing } };
      if (override) {
        if (Object.hasOwn(override, 'hand')) request.hand = override.hand;
        if (Object.hasOwn(override, 'durationSeconds')) request.timing.durationSeconds = override.durationSeconds;
        if (Object.hasOwn(override, 'afterActionId')) {
          request.timing.after = override.afterActionId;
          request.timing.simultaneous = override.afterActionId === null;
        }
        request.authoredParticipants = override;
        request.authorship = actor.authorship || { authority: 'userOverride', patchIds: [] };
      }
      return { ...row, request };
    });
    const schedules = new Map(), visiting = new Set();
    function schedule(id) {
      if (schedules.has(id)) return schedules.get(id);
      const request = candidates.find(row => row.request.id === id)?.request;
      if (!request || visiting.has(id)) return null;
      visiting.add(id);
      const prior = request.timing.after ? schedule(request.timing.after) : { end: 0 };
      const duration = request.timing.durationSeconds ?? 4;
      const value = prior && Number.isFinite(duration) && duration > 0 ? { start: prior.end, end: prior.end + duration, duration } : null;
      visiting.delete(id); schedules.set(id, value); return value;
    }
    for (const row of candidates) {
      const request = row.request;
      const actor = request.actorSpanId
        ? nodes.find(node => node.spanId === request.actorSpanId && !node.unresolved) : null;
      const object = Object.hasOwn(request.authoredParticipants || {}, 'objectId')
        ? nodes.find(node => node.id === request.authoredParticipants.objectId && !node.unresolved) : request.objectSpanId
        ? nodes.find(node => (node.spanId === request.objectSpanId || node.sourceSpanIds?.includes(request.objectSpanId)) && !node.unresolved) : null;
      const support = Object.hasOwn(request.authoredParticipants || {}, 'supportObjectId')
        ? nodes.find(node => node.id === request.authoredParticipants.supportObjectId && !node.unresolved)
        : request.supportSpanId ? nodes.find(node=>node.spanId===request.supportSpanId&&!node.unresolved) : null;
      const resolved = schedule(request.id);
      const start = resolved?.start;
      const duration = resolved?.duration;
      const hand = ['hold', 'drink', 'place'].includes(request.action) ? request.hand ?? 'right' : null;
      const reason = row.rejection || (!row.component ? 'missing activity component' :
        !actor ? 'missing supported actor' : !['walk','stand'].includes(request.action) && !object ? 'missing supported object' : request.action==='place'&&!support ? 'missing supported placement surface' :
          (actor.cardinality || 1) !== 1 || object && (object.cardinality || 1) !== 1 ? 'activity requires individually identified participants; exact count is retained as unsupported' :
          hand && !['left', 'right'].includes(hand) ? 'unsupported hand' :
          start == null ? 'missing temporal predecessor, invalid duration, or cyclic action order' :
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
    for (let pass = 0; pass < actions.length; pass++) {
      let changed = false;
      for (const action of actions) if (action.status === 'accepted' && action.timing.after &&
          !actions.some(row => row.id === action.timing.after && row.status === 'accepted')) {
        action.status = 'unsupported'; changed = true;
        unsupported.push({ id: action.id, reason: 'temporal predecessor is unresolved', evidence: action.sourceEvidence });
      }
      if (!changed) break;
    }
    return { schema: 'simulatte.activityGraph.v1', sourceRequests: retrieval.candidates.map(row => row.request), capabilities: retrieval.capabilities, actions,
      unsupported, assumptions, coverage: retrieval.capabilities.coverage };
  }
  registry.define('physicsModel', 'simulatte-activity-grounding.js', { groundActivityGraph, bindActivityParticipantIdentities, reconcileActivityGraph, resolveActivityObjectCapabilities, prepareActivityRevision });
})(typeof globalThis !== 'undefined' ? globalThis : window);
