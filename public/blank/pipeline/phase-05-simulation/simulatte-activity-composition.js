(function registerActivityComposition(root) {
  const registry = typeof module === 'object' && module.exports
    ? require('../../app/runtime/phase-module-registry.js') : root.SimulattePhaseModuleRegistry;
  const scope = registry.family('physicsModel');
  function compileActivityRelationships(actions, participants, unsupported) {
    const accepted = [], facts = new Map(), events = [], transitions = [];
    const fail = (action, reason) => unsupported.push({ id: action.id, reason, evidence: action.sourceEvidence });
    const commit = time => {
      events.sort((a, b) => a.time - b.time || a.index - b.index);
      while (events.length && events[0].time <= time) {
        const event = events.shift();
        for (const effect of event.effects) {
          facts.set(effect.key, effect.value);
          transitions.push({ ...effect, actionId: event.action.id, timeSeconds: event.time });
        }
      }
    };
    for (const action of actions) {
      commit(action.startSeconds);
      if (action.timing.after && !accepted.some(row => row.id === action.timing.after)) { fail(action, 'temporal predecessor is unresolved'); continue; }
      const contract = action.component.contract;
      const missing = contract.participants.find(role => {
        const participant = participants.find(row => row.id === action[role.slot]);
        return !participant || role.capabilities.some(capability => !participant.capabilities?.includes(capability));
      });
      if (missing) {
        fail(action, missing.reason || `${missing.label.toLowerCase()} has no qualified ${missing.capabilities.join(', ')} capability`); continue;
      }
      const entry = scope.bindActivityConditions(contract.entry, action);
      const rejected = entry.find(condition => {
        const value = facts.get(condition.key) ?? null;
        return condition.operator === 'equals' ? value !== condition.value : condition.operator === 'not-equals'
          ? value === condition.value : value !== null && value !== condition.value;
      });
      if (rejected) { fail(action, rejected.reason); continue; }
      accepted.push(action);
      const effects = scope.bindActivityConditions(contract.exit, action);
      // Ownership persists beyond a clip; an explicit release changes it. Entry
      // reservations let concurrent compatible components see the same attachment.
      for (const condition of entry.filter(row => row.operator === 'empty-or-equals')) facts.set(condition.key, condition.value);
      events.push({ action, time: action.endSeconds, effects, index: accepted.length });
    }
    commit(Infinity);
    return { actions: accepted, relationships: { schema: 'simulatte.activityRelationships.v1',
      transitions, final: [...facts].map(([key, value]) => ({ key, value })) } };
  }
  function activityObjectAuthoringFields(object, inventory) {
    const descriptors = [...(inventory.objectProperties || []), ...object.capabilities.flatMap(capability => inventory.capabilityProperties?.[capability] || [])];
    const keys = new Set();
    return descriptors.filter(field => {
      const id = `${field.key}:${field.axis ?? ''}`;
      if (keys.has(id)) return false;
      keys.add(id); return true;
    }).map(field => ({ ...field, value: field.path.reduce((value, key) => value?.[key], object) * (field.scale || 1) }));
  }
  function activityObjectRevisionChanges(object, values) {
    const changes = {};
    for (const field of object.authoringFields || []) {
      const id = `${field.key}:${field.axis ?? ''}`;
      if (!Object.hasOwn(values, id)) continue;
      const value = Number(values[id]) / (field.scale || 1);
      if (!Number.isFinite(value) || field.min !== undefined && Number(values[id]) < field.min ||
          field.max !== undefined && Number(values[id]) > field.max) throw new Error(`Invalid ${field.label}`);
      if (field.axis !== undefined) {
        changes[field.key] ||= object[field.key].slice(); changes[field.key][field.axis] = value;
      } else changes[field.key] = value;
      if (field.link) {
        changes[field.link.key] ||= object[field.link.key].slice(); changes[field.link.key][field.link.axis] = value;
      }
    }
    if (Object.keys(values).some(id => !object.authoringFields?.some(field => `${field.key}:${field.axis ?? ''}` === id))) throw new Error('Undeclared activity property edit');
    return changes;
  }
  function activityObservedRelationships(program, frame) {
    const facts = new Map();
    for (const actor of program.actors) {
      const body = frame.actors[actor.id];
      if (!body) continue;
      facts.set(`${actor.id}:posture`, body.supportObjectId ? 'seated' : 'standing');
      facts.set(`${actor.id}:support`, body.supportObjectId || 'ground');
      for (const hand of ['left', 'right']) {
        const held = Object.values(frame.objects).find(object => object.owner?.actorId === actor.id && object.owner.hand === hand);
        facts.set(`${actor.id}:${hand}:held-object`, held?.id || null);
      }
    }
    for (const object of Object.values(frame.objects)) {
      facts.set(`${object.id}:owner`, object.owner ? `${object.owner.actorId}:${object.owner.hand}` : null);
      facts.set(`${object.id}:support`, object.supportObjectId || null);
    }
    return facts;
  }
  function activityRelationshipViolations(program, frame) {
    const facts = activityObservedRelationships(program, frame), violations = [];
    for (const action of program.actions) {
      if (!action.component.contract || frame.time < action.endSeconds) continue;
      for (const effect of scope.bindActivityConditions(action.component.contract.exit, action)) {
        const superseded = program.actions.some(later => later.id !== action.id && later.startSeconds >= action.endSeconds &&
          later.startSeconds <= frame.time && scope.bindActivityConditions(later.component.contract?.exit || [], later).some(row => row.key === effect.key));
        if (!superseded && facts.get(effect.key) !== effect.value) violations.push(`interaction exit condition failed: ${effect.key}`);
      }
    }
    return violations;
  }
  registry.define('physicsModel', 'simulatte-activity-composition.js', { compileActivityRelationships,
    activityObjectAuthoringFields, activityObjectRevisionChanges, activityObservedRelationships, activityRelationshipViolations });
})(typeof globalThis !== 'undefined' ? globalThis : window);
