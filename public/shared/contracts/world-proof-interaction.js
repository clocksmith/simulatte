(function attachSimulatteWorldProofInteraction(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteWorldProofInteraction = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createInteractionProofApi() {
  const INTERACTION_PROOF_RECEIPT_SCHEMA = 'simulatte.interactionProofReceipt.v1';
  const INTERACTION_TRANSITION_PROOF_SCHEMA = 'simulatte.interactionTransitionProof.v1';
  const INTERACTION_TRANSITION_STATE_SCHEMA = 'simulatte.interactionTransitionState.v1';
  const INTERACTION_IR_SCHEMA = 'simulatte.interactionIR.v1';
  const PHASE7_INTERACTION_RECEIPT_SCHEMA = 'simulatte.phase7InteractionReceipt.v1';
  const HASH_PREFIX = 'fnv1a32:';
  const PHYSICAL_ACTIONS = new Set(['drag', 'nudge', 'impulse', 'adjust', 'activate']);

  class InteractionProofError extends Error {
    constructor(message, path = '$.interactionProofReceipt') {
      super(`${message} at ${path}`);
      this.name = 'InteractionProofError';
      this.path = path;
    }
  }

  function canonicalValue(value) {
    if (Array.isArray(value)) return value.map(canonicalValue);
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])])
      );
    }
    return value;
  }

  function canonicalJson(value) {
    return JSON.stringify(canonicalValue(value));
  }

  function fnv1a32(value) {
    let hash = 0x811c9dc5;
    const bytes = new TextEncoder().encode(String(value || ''));
    for (const byte of bytes) {
      hash ^= byte;
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash >>> 0;
  }

  function contentHash(value) {
    const copy = canonicalValue(value || {});
    delete copy.contentHash;
    delete copy.createdAt;
    return `${HASH_PREFIX}${fnv1a32(canonicalJson(copy)).toString(16).padStart(8, '0')}`;
  }

  function programContentHash(program = {}) {
    const copy = canonicalValue(program || {});
    delete copy.contentHash;
    return `${HASH_PREFIX}${fnv1a32(canonicalJson(copy)).toString(16).padStart(8, '0')}`;
  }

  function transitionStateHash(state = {}) {
    return `${HASH_PREFIX}${fnv1a32(canonicalJson(state)).toString(16).padStart(8, '0')}`;
  }

  function interactionBindingIdentity(spec = {}) {
    const program = spec && spec.interactionIR || null;
    if (!program || program.schema !== INTERACTION_IR_SCHEMA) return emptyBindingIdentity();
    const targets = (program.targets || []).map((row) => ({
      id: String(row && row.id || ''),
      entityId: String(row && row.entityId || ''),
      capabilities: uniqueStrings(row && row.capabilities).sort(),
      channelIds: uniqueStrings(Object.values(row && row.channels || {})).sort(),
    })).filter((row) => row.id).sort(byId);
    const actions = (program.actions || []).map((row) => ({
      id: String(row && row.id || ''),
      commandKind: String(row && row.commandKind || ''),
      requiredCapability: String(row && row.requiredCapability || ''),
    })).filter((row) => row.id).sort(byId);
    const bindings = (program.bindings || []).map((row) => ({
      id: String(row && row.id || ''),
      actionId: String(row && row.actionId || ''),
      device: String(row && row.device || ''),
      event: String(row && row.event || ''),
    })).filter((row) => row.id).sort(byId);
    const targetIds = targets.map((row) => row.id);
    const actionIds = actions.map((row) => row.id);
    const bindingIds = bindings.map((row) => row.id);
    const computedHash = programContentHash(program);
    const uniqueIdentity = new Set(targetIds).size === targetIds.length &&
      new Set(actionIds).size === actionIds.length &&
      new Set(bindingIds).size === bindingIds.length;
    const referencesValid = bindings.every((row) => actionIds.includes(row.actionId));
    return canonicalValue({
      declared: targets.length > 0 && actions.length > 0 && bindings.length > 0,
      schema: String(program.schema || ''),
      contentHash: computedHash,
      declaredContentHash: String(program.contentHash || ''),
      contractValid: Boolean(
        uniqueIdentity && referencesValid && program.contentHash === computedHash
      ),
      targets,
      actions,
      bindings,
    });
  }

  function emptyBindingIdentity() {
    return {
      declared: false,
      schema: '',
      contentHash: '',
      declaredContentHash: '',
      contractValid: true,
      targets: [],
      actions: [],
      bindings: [],
    };
  }

  function createInteractionProofReceipt(input = {}) {
    const binding = input.binding || {};
    const identity = binding.interaction || emptyBindingIdentity();
    const phase7 = input.phase7Receipt || null;
    const transitions = phase7 && Array.isArray(phase7.commandReceipts)
      ? phase7.commandReceipts.map((row, index) => transitionProof(row, identity, index))
      : [];
    const appliedTransitions = transitions.filter((row) => row.status === 'applied');
    const provenTransitions = appliedTransitions.filter((row) => row.valid);
    const invalidTransitions = appliedTransitions.filter((row) => !row.valid);
    const selectedOrActive = Boolean(
      phase7 && (phase7.selectedTargetId || phase7.activeTargetId)
    );
    const programMatches = Boolean(
      phase7 && phase7.programSchema === 'simulatte.sceneInteractionProgram.v1' &&
      phase7.sourceProgramSchema === identity.schema &&
      phase7.sourceProgramContentHash === identity.contentHash
    );
    const visualStateConsumed = Boolean(phase7 && phase7.visualStateConsumed === true);
    const failureCode = interactionFailureCode({
      binding,
      identity,
      phase7,
      transitions,
      appliedTransitions,
      provenTransitions,
      invalidTransitions,
      programMatches,
      selectedOrActive,
      visualStateConsumed,
    });
    const status = !failureCode
      ? 'pass'
      : ['interaction-not-exercised', 'phase7-interaction-receipt-missing'].includes(failureCode)
        ? 'not-proven'
        : 'fail';
    const changedChannelIds = uniqueStrings(
      provenTransitions.flatMap((row) => row.changedChannelIds)
    ).sort();
    const receipt = {
      schema: INTERACTION_PROOF_RECEIPT_SCHEMA,
      contentHash: '',
      status,
      failureCode,
      reason: interactionFailureReason(failureCode),
      worldSpecContentHash: String(binding.worldSpec && binding.worldSpec.contentHash || ''),
      worldSpecRevision: Number(binding.worldSpec && binding.worldSpec.revision || 0),
      interactionProgramSchema: String(identity.schema || ''),
      interactionProgramHash: String(identity.contentHash || ''),
      phase7ProgramSchema: String(phase7 && phase7.programSchema || ''),
      phase7SourceProgramHash: String(phase7 && phase7.sourceProgramContentHash || ''),
      commandCount: Number(phase7 && phase7.commandCount || 0),
      appliedCommandCount: Number(phase7 && phase7.appliedCommandCount || 0),
      rejectedCommandCount: Number(phase7 && phase7.rejectedCommandCount || 0),
      receiptWindowCount: transitions.length,
      provenTransitionCount: provenTransitions.length,
      invalidTransitionCount: invalidTransitions.length,
      executedActionIds: uniqueStrings(provenTransitions.map((row) => row.actionId)).sort(),
      executedTargetIds: uniqueStrings(provenTransitions.map((row) => row.targetId)).sort(),
      changedChannelIds,
      invalidTransitionIds: invalidTransitions.map((row) => row.id).sort(),
      transitionHash: `${HASH_PREFIX}${fnv1a32(canonicalJson(transitions)).toString(16).padStart(8, '0')}`,
      visualStateConsumed,
      transitions,
    };
    receipt.contentHash = contentHash(receipt);
    return validateInteractionProofReceipt(receipt);
  }

  function transitionProof(row = {}, identity = {}, index = 0) {
    const actionId = String(row.actionId || '');
    const targetId = String(row.targetId || '');
    const bindingId = String(row.bindingId || '');
    const action = (identity.actions || []).find((candidate) => candidate.id === actionId) || null;
    const target = (identity.targets || []).find((candidate) => candidate.id === targetId) || null;
    const binding = bindingId
      ? (identity.bindings || []).find((candidate) => candidate.id === bindingId) || null
      : null;
    const beforeState = normalizeTransitionState(row.beforeState);
    const afterState = normalizeTransitionState(row.afterState);
    const beforeHash = transitionStateHash(beforeState);
    const afterHash = transitionStateHash(afterState);
    const changedChannelIds = changedChannels(beforeState, afterState);
    const declaredChangedChannelIds = uniqueStrings(row.changedChannels).sort();
    const allowedChannelIds = new Set(target && target.channelIds || []);
    const failureCodes = [];
    if (row.schema !== 'simulatte.interactionCommandReceipt.v1') failureCodes.push('command-receipt-schema-invalid');
    if (!action) failureCodes.push('action-not-declared');
    if (targetId && !target) failureCodes.push('target-not-declared');
    if (action && action.requiredCapability && (!target || !target.capabilities.includes(action.requiredCapability))) {
      failureCodes.push('target-capability-missing');
    }
    if (bindingId && (!binding || binding.actionId !== actionId)) failureCodes.push('binding-not-declared');
    if (String(row.beforeStateHash || '') !== beforeHash || String(row.afterStateHash || '') !== afterHash) {
      failureCodes.push('transition-state-hash-mismatch');
    }
    if (canonicalJson(changedChannelIds) !== canonicalJson(declaredChangedChannelIds)) {
      failureCodes.push('changed-channel-mismatch');
    }
    if (changedChannelIds.some((id) => !allowedChannelIds.has(id))) {
      failureCodes.push('changed-channel-not-owned-by-target');
    }
    const stateChanged = beforeHash !== afterHash;
    if (row.status === 'applied' && !stateChanged) failureCodes.push('applied-command-has-no-transition');
    if (row.status === 'applied' && action && PHYSICAL_ACTIONS.has(action.commandKind) && !changedChannelIds.length) {
      failureCodes.push('physical-action-has-no-channel-transition');
    }
    return canonicalValue({
      schema: INTERACTION_TRANSITION_PROOF_SCHEMA,
      id: `transition:${Number(row.sequence || index)}:${actionId || 'unknown'}:${targetId || 'none'}`,
      sequence: Math.max(0, Math.floor(Number(row.sequence || 0))),
      actionId,
      targetId,
      bindingId,
      status: String(row.status || ''),
      beforeState,
      afterState,
      beforeStateHash: beforeHash,
      afterStateHash: afterHash,
      stateChanged,
      changedChannelIds,
      valid: row.status === 'applied' && failureCodes.length === 0,
      failureCodes: uniqueStrings(failureCodes).sort(),
    });
  }

  function normalizeTransitionState(state = null) {
    const source = state && typeof state === 'object' && !Array.isArray(state) ? state : {};
    return canonicalValue({
      schema: INTERACTION_TRANSITION_STATE_SCHEMA,
      selectedTargetId: String(source.selectedTargetId || ''),
      hoveredTargetId: String(source.hoveredTargetId || ''),
      grabbedTargetId: String(source.grabbedTargetId || ''),
      activeTargetId: String(source.activeTargetId || ''),
      visualPosition: Array.isArray(source.visualPosition)
        ? source.visualPosition.slice(0, 2).map((value) => finite(value, 0))
        : null,
      channels: (Array.isArray(source.channels) ? source.channels : [])
        .map((row) => ({
          id: String(row && row.id || ''),
          value: canonicalValue(row && Object.hasOwn(row, 'value') ? row.value : null),
        }))
        .filter((row) => row.id)
        .sort(byId),
    });
  }

  function changedChannels(beforeState = {}, afterState = {}) {
    const before = new Map((beforeState.channels || []).map((row) => [row.id, row.value]));
    const after = new Map((afterState.channels || []).map((row) => [row.id, row.value]));
    return uniqueStrings([...before.keys(), ...after.keys()])
      .filter((id) => canonicalJson(before.get(id)) !== canonicalJson(after.get(id)))
      .sort();
  }

  function interactionFailureCode(facts) {
    if (!facts.binding || !facts.binding.worldSpec) return 'interaction-binding-missing';
    if (!facts.identity || facts.identity.contractValid !== true) return 'interaction-program-invalid';
    if (!facts.phase7) return 'phase7-interaction-receipt-missing';
    if (facts.phase7.schema !== PHASE7_INTERACTION_RECEIPT_SCHEMA) return 'phase7-interaction-receipt-invalid';
    if (!facts.programMatches) return 'interaction-program-rebound';
    if (facts.phase7.status !== 'executed' || Number(facts.phase7.appliedCommandCount || 0) === 0) {
      return 'interaction-not-exercised';
    }
    if (!facts.transitions.length || !facts.appliedTransitions.length) return 'interaction-transition-evidence-missing';
    if (facts.invalidTransitions.length) return 'interaction-transition-invalid';
    if (!facts.provenTransitions.length) return 'interaction-transition-not-proven';
    if (facts.selectedOrActive && !facts.visualStateConsumed) return 'interaction-visual-consumption-missing';
    return '';
  }

  function interactionFailureReason(code) {
    return ({
      '': 'Every executed interaction is bound to the authored program and a valid state transition',
      'interaction-binding-missing': 'Interaction proof is not bound to a WorldSpec',
      'interaction-program-invalid': 'The authored InteractionIR identity is invalid',
      'phase7-interaction-receipt-missing': 'Phase 7 supplied no interaction receipt',
      'phase7-interaction-receipt-invalid': 'Phase 7 supplied an invalid interaction receipt',
      'interaction-program-rebound': 'Phase 7 executed a different interaction program',
      'interaction-not-exercised': 'No accepted interaction command executed',
      'interaction-transition-evidence-missing': 'Executed commands have no retained transition evidence',
      'interaction-transition-invalid': 'An applied command has invalid or contradictory transition evidence',
      'interaction-transition-not-proven': 'No applied command proves a declared state transition',
      'interaction-visual-consumption-missing': 'Visible interaction state was not consumed by Phase 7',
    })[code] || 'Interaction proof failed';
  }

  function validateInteractionProofReceipt(receipt = {}) {
    requireObject(receipt);
    requireExactKeys(receipt, [
      'schema', 'contentHash', 'status', 'failureCode', 'reason',
      'worldSpecContentHash', 'worldSpecRevision', 'interactionProgramSchema',
      'interactionProgramHash', 'phase7ProgramSchema', 'phase7SourceProgramHash',
      'commandCount', 'appliedCommandCount', 'rejectedCommandCount',
      'receiptWindowCount', 'provenTransitionCount', 'invalidTransitionCount',
      'executedActionIds', 'executedTargetIds', 'changedChannelIds',
      'invalidTransitionIds', 'transitionHash', 'visualStateConsumed', 'transitions',
    ]);
    if (receipt.schema !== INTERACTION_PROOF_RECEIPT_SCHEMA) {
      throw new InteractionProofError('Unexpected interaction-proof schema');
    }
    if (!['pass', 'fail', 'not-proven'].includes(receipt.status)) {
      throw new InteractionProofError('Unexpected interaction-proof status', '$.interactionProofReceipt.status');
    }
    for (const key of ['commandCount', 'appliedCommandCount', 'rejectedCommandCount', 'receiptWindowCount', 'provenTransitionCount', 'invalidTransitionCount', 'worldSpecRevision']) {
      if (!Number.isInteger(receipt[key]) || receipt[key] < 0) {
        throw new InteractionProofError(`${key} must be a non-negative integer`, `$.interactionProofReceipt.${key}`);
      }
    }
    for (const key of ['executedActionIds', 'executedTargetIds', 'changedChannelIds', 'invalidTransitionIds', 'transitions']) {
      if (!Array.isArray(receipt[key])) throw new InteractionProofError(`${key} must be an array`);
    }
    receipt.transitions.forEach(validateTransitionProof);
    if (receipt.receiptWindowCount !== receipt.transitions.length) {
      throw new InteractionProofError('receiptWindowCount does not match transitions');
    }
    if (receipt.provenTransitionCount !== receipt.transitions.filter((row) => row.valid).length) {
      throw new InteractionProofError('provenTransitionCount does not match transitions');
    }
    if (receipt.invalidTransitionCount !== receipt.transitions.filter((row) => row.status === 'applied' && !row.valid).length) {
      throw new InteractionProofError('invalidTransitionCount does not match transitions');
    }
    const expectedTransitionHash = `${HASH_PREFIX}${fnv1a32(canonicalJson(receipt.transitions)).toString(16).padStart(8, '0')}`;
    if (receipt.transitionHash !== expectedTransitionHash) {
      throw new InteractionProofError('transitionHash does not match transitions');
    }
    if (receipt.contentHash !== contentHash(receipt)) {
      throw new InteractionProofError('contentHash does not match canonical interaction proof');
    }
    if (receipt.status === 'pass' && (
      receipt.failureCode || !receipt.provenTransitionCount || receipt.invalidTransitionCount
    )) {
      throw new InteractionProofError('Passing interaction proof is incomplete');
    }
    return receipt;
  }

  function validateTransitionProof(row = {}, index = 0) {
    const path = `$.interactionProofReceipt.transitions[${index}]`;
    requireObject(row, path);
    requireExactKeys(row, [
      'schema', 'id', 'sequence', 'actionId', 'targetId', 'bindingId', 'status',
      'beforeState', 'afterState', 'beforeStateHash', 'afterStateHash',
      'stateChanged', 'changedChannelIds', 'valid', 'failureCodes',
    ], path);
    if (row.schema !== INTERACTION_TRANSITION_PROOF_SCHEMA) {
      throw new InteractionProofError('Unexpected transition-proof schema', `${path}.schema`);
    }
    if (row.beforeStateHash !== transitionStateHash(row.beforeState) ||
        row.afterStateHash !== transitionStateHash(row.afterState)) {
      throw new InteractionProofError('Transition state hash mismatch', path);
    }
    if (row.stateChanged !== (row.beforeStateHash !== row.afterStateHash)) {
      throw new InteractionProofError('Transition stateChanged mismatch', path);
    }
    if (canonicalJson(row.changedChannelIds) !== canonicalJson(changedChannels(row.beforeState, row.afterState))) {
      throw new InteractionProofError('Transition changedChannelIds mismatch', path);
    }
  }

  function interactionProofStatus(receipt = null, binding = {}) {
    if (!receipt) return 'not-proven';
    try {
      validateInteractionProofReceipt(receipt);
    } catch (_) {
      return 'fail';
    }
    const identity = binding && binding.interaction || emptyBindingIdentity();
    const bound = Boolean(
      binding && binding.worldSpec &&
      receipt.worldSpecContentHash === String(binding.worldSpec.contentHash || '') &&
      receipt.worldSpecRevision === Number(binding.worldSpec.revision || 0) &&
      receipt.interactionProgramSchema === String(identity.schema || '') &&
      receipt.interactionProgramHash === String(identity.contentHash || '') &&
      identity.contractValid === true
    );
    if (!bound) return 'fail';
    return receipt.status === 'pass' ? 'pass' : receipt.status === 'fail' ? 'fail' : 'not-proven';
  }

  function uniqueStrings(values) {
    return [...new Set((Array.isArray(values) ? values : [])
      .filter((value) => value !== null && value !== undefined)
      .map(String)
      .filter(Boolean))];
  }

  function byId(a, b) {
    return String(a.id || '').localeCompare(String(b.id || ''));
  }

  function finite(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function requireObject(value, path = '$.interactionProofReceipt') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new InteractionProofError('Expected an object', path);
    }
  }

  function requireExactKeys(value, allowed, path = '$.interactionProofReceipt') {
    const expected = new Set(allowed);
    for (const key of Object.keys(value || {})) {
      if (!expected.has(key)) throw new InteractionProofError(`Unknown field ${key}`, `${path}.${key}`);
    }
    for (const key of allowed) {
      if (!Object.hasOwn(value, key)) throw new InteractionProofError(`Missing field ${key}`, `${path}.${key}`);
    }
  }

  return Object.freeze({
    INTERACTION_PROOF_RECEIPT_SCHEMA,
    INTERACTION_TRANSITION_PROOF_SCHEMA,
    INTERACTION_TRANSITION_STATE_SCHEMA,
    InteractionProofError,
    interactionBindingIdentity,
    createInteractionProofReceipt,
    validateInteractionProofReceipt,
    interactionProofStatus,
    programContentHash,
    transitionStateHash,
  });
});
