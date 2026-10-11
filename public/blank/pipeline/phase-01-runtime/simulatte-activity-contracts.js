(function registerActivityContracts(root) {
  const registry = typeof module === 'object' && module.exports
    ? require('../../app/runtime/phase-module-registry.js') : root.SimulattePhaseModuleRegistry;
  const scope = registry.family('physicsModel');
  const slots = ['actorId', 'objectId', 'supportObjectId'];
  const primitives = ['walk', 'sit', 'stand', 'hold', 'drink', 'place'];
  const template = (text, action) => String(text).replace(/\{(actorId|objectId|supportObjectId|hand)\}/g, (_, key) => {
    if (!action[key]) throw new Error(`Unbound activity contract parameter ${key}`);
    return action[key];
  });
  function validateActivityComponent(component) {
    const contract = component?.contract;
    if (!/^[a-z][a-z0-9-]{0,63}$/.test(component?.id || '') || !contract || contract.schema !== 'simulatte.interactionContract.v1' ||
        !primitives.includes(component.execution?.primitive) || !Array.isArray(contract.participants) ||
        !Array.isArray(contract.resources) || !Array.isArray(contract.requirements) ||
        !Array.isArray(contract.entry) || !Array.isArray(contract.exit) || !Array.isArray(contract.parameters) ||
        [contract.participants, contract.resources, contract.requirements, contract.entry, contract.exit, contract.parameters].some(rows => rows.length > 16) ||
        !Array.isArray(component.languageForms) || !component.languageForms.length || component.languageForms.length > 16 ||
        component.languageForms.some(form => !/^[a-z]{1,64}$/.test(form))) throw new Error('Invalid activity component contract');
    for (const parameter of contract.parameters) if (parameter.type !== 'choice' || !parameter.key || !parameter.label ||
      !Array.isArray(parameter.values) || !parameter.values.length || !parameter.values.includes(parameter.default)) throw new Error('Invalid interaction parameter');
    for (const participant of contract.participants) {
      if (!slots.includes(participant.slot) || !Array.isArray(participant.capabilities) || !participant.label) throw new Error('Invalid interaction participant');
    }
    if (new Set(contract.participants.map(row => row.slot)).size !== contract.participants.length ||
        !contract.participants.some(row => row.slot === 'actorId')) throw new Error('Invalid interaction participant slots');
    for (const resource of contract.resources) {
      if (!['channel', 'ownership'].includes(resource.kind) || typeof resource.key !== 'string') throw new Error('Invalid interaction resource');
    }
    for (const requirement of contract.requirements) {
      if (!requirement.key || typeof requirement.value !== 'string') throw new Error('Invalid shared interaction requirement');
    }
    for (const condition of contract.entry) {
      if (!['equals', 'empty-or-equals', 'not-equals'].includes(condition.operator) || !condition.key ||
          !Object.hasOwn(condition, 'value') || !condition.reason) throw new Error('Invalid interaction entry condition');
    }
    for (const effect of contract.exit) if (!effect.key || !Object.hasOwn(effect, 'value')) throw new Error('Invalid interaction exit condition');
    const declared = [...contract.participants.map(row => row.slot), ...contract.parameters.map(row => row.key)];
    for (const row of [...contract.resources, ...contract.requirements, ...contract.entry, ...contract.exit]) {
      for (const value of [row.key, row.value]) {
        if (value === undefined || value === null) continue;
        if (typeof value !== 'string' || !value.length || value.length > 256 ||
            [...value.matchAll(/\{([^{}]+)\}/g)].some(match => !declared.includes(match[1])) ||
            /[{}]/.test(value.replace(/\{(actorId|objectId|supportObjectId|hand)\}/g, ''))) throw new Error('Invalid interaction binding template');
      }
    }
    const primitive = component.execution.primitive;
    const neededSlots = ['walk', 'stand'].includes(primitive) ? ['actorId'] : primitive === 'place' ? slots : slots.slice(0, 2);
    if (neededSlots.some(slot => !contract.participants.some(row => row.slot === slot))) throw new Error('Motion provider participant contract is incomplete');
    // Reusing a qualified trajectory cannot drop the channels or capabilities it needs.
    const neededChannels = ['walk', 'sit', 'stand'].includes(primitive) ? ['{actorId}:root', '{actorId}:legs'] : ['{actorId}:{hand}-hand'];
    if (neededChannels.some(key => !contract.resources.some(row => row.kind === 'channel' && row.key === key))) throw new Error('Motion provider channel contract is incomplete');
    const required = primitive === 'sit' ? [['objectId', 'seat-support']]
      : ['hold', 'drink', 'place'].includes(primitive) ? [['objectId', 'graspable-object'],
        ...(primitive === 'drink' ? [['objectId', 'liquid-container']] : []), ...(primitive === 'place' ? [['supportObjectId', 'support-surface']] : [])] : [];
    if (required.some(([slot, capability]) => !contract.participants.find(row => row.slot === slot)?.capabilities.includes(capability))) throw new Error('Motion provider capability contract is incomplete');
    return component;
  }
  function activityPrimitive(action) { return action.component?.execution?.primitive || action.action; }
  const motionActions = new WeakMap();
  function activityMotionAction(action) {
    const primitive = activityPrimitive(action);
    if (primitive === action.action) return action;
    if (!motionActions.has(action)) motionActions.set(action, { ...action, semanticAction: action.action, action: primitive });
    return motionActions.get(action);
  }
  function bindActivityResources(action) {
    const contract = action.component.contract;
    return { resources: contract.resources.map(row => ({ ...row, key: template(row.key, action) })),
      requirements: contract.requirements.map(row => ({ ...row, key: template(row.key, action), value: template(row.value, action) })) };
  }
  function activityCompositionConflict(a, b) {
    const shared = a.resources.filter(resource => b.resources.some(other => other.key === resource.key));
    const incompatible = a.requirements.filter(requirement => b.requirements.some(other =>
      other.key === requirement.key && other.value !== requirement.value));
    const overlap = a.component.contract.overlap, other = b.component.contract.overlap;
    const sharing = overlap && other && overlap.group === other.group && overlap.role !== other.role &&
      [overlap.role, other.role].includes('maintain') && [overlap.role, other.role].includes('drive') &&
      overlap.same.every(key => a[key] === b[key]) && other.same.every(key => a[key] === b[key]);
    const conflicts = shared.filter(resource => !sharing || !overlap.resources.some(key => template(key, a) === resource.key) || !other.resources.some(key => template(key, b) === resource.key));
    if (!conflicts.length && !incompatible.length) return sharing ? { sharing: overlap.group } : null;
    return { reason: incompatible.length ? 'incompatible shared interaction requirements' :
      conflicts.some(row => row.kind === 'ownership') ? 'conflicting object ownership' : 'conflicting channel writers',
      resources: conflicts.map(row => row.key), requirements: incompatible.map(row => row.key) };
  }
  function bindActivityConditions(rows, action) {
    return rows.map(row => ({ ...row, key: template(row.key, action), value: row.value === null ? null : template(row.value, action) }));
  }
  registry.define('physicsModel', 'simulatte-activity-contracts.js', { validateActivityComponent, activityPrimitive,
    activityMotionAction, bindActivityResources, activityCompositionConflict, bindActivityConditions });
})(typeof globalThis !== 'undefined' ? globalThis : window);
