(function attachViewDirector(root, factory) {
  const contracts = typeof module === 'object' && module.exports
    ? require('../contracts/plugin-v4-contracts.js')
    : root.SimulattePluginV4Contracts;
  const api = factory(contracts);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteViewDirector = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createViewDirectorModule(contracts) {
  function createViewDirector({ defaultIntent = null, provenanceReceipts = [] } = {}) {
    const listeners = new Set();
    const intents = new Map();
    const provenanceByTargetId = new Map();
    let sequence = 0;
    let active = null;
    let manual = null;
    registerProvenance(provenanceReceipts);
    if (defaultIntent !== null) submit(defaultIntent, { source: 'core-default' });

    function submit(intent, { source = 'plugin' } = {}) {
      contracts.validateViewIntent(intent);
      text(source, 'view_director_source_invalid', 'View intent source');
      const missingTargets = intent.targetIds.filter((id) => !provenanceForTarget(id, source));
      if (!source.startsWith('core-') && provenanceByTargetId.size && missingTargets.length) {
        throw directorError('view_director_target_provenance_missing', `View intent ${intent.id} targets objects without canonical provenance`, {
          intentId: intent.id,
          missingTargets,
        });
      }
      sequence += 1;
      intents.set(intent.id, Object.freeze({
        intent: deepFreeze(structuredClone(intent)),
        source,
        sequence,
      }));
      arbitrate('intent-submitted');
      return snapshot();
    }

    function remove(intentId) {
      intents.delete(intentId);
      arbitrate('intent-removed');
      return snapshot();
    }

    function setManualOverride({ mode = 'free', targetIds = [] } = {}) {
      if (!contracts.VIEW_MODES.includes(mode)) throw directorError('view_director_manual_mode_invalid', `Manual view mode ${mode} is invalid`);
      if (!Array.isArray(targetIds) || targetIds.some((id) => typeof id !== 'string' || !id)) {
        throw directorError('view_director_manual_targets_invalid', 'Manual target IDs are invalid');
      }
      manual = deepFreeze({
        schema: 'simulatte.viewDecision.v4',
        source: 'manual',
        intentId: null,
        mode,
        targetIds: [...new Set(targetIds)],
        transition: 'cut',
        reasonEventId: null,
      });
      emit('manual-override');
      return snapshot();
    }

    function releaseManualOverride() {
      manual = null;
      arbitrate('manual-released');
      return snapshot();
    }

    function resolveEvent(eventId) {
      text(eventId, 'view_director_event_invalid', 'View event ID');
      [...intents.entries()].forEach(([id, entry]) => {
        if (entry.intent.reasonEventId === eventId) intents.delete(id);
      });
      arbitrate('event-resolved');
      return snapshot();
    }

    function subscribe(listener) {
      if (typeof listener !== 'function') throw directorError('view_director_listener_invalid', 'View listener expected a function');
      listeners.add(listener);
      listener(Object.freeze({ type: 'state', reason: 'subscribed', state: snapshot() }));
      return () => listeners.delete(listener);
    }

    function snapshot() {
      return deepFreeze({
        schema: 'simulatte.viewDirectorState.v4',
        decision: manual || active || fallbackDecision(),
        manualOverride: manual !== null,
        candidateCount: intents.size,
      });
    }

    function receipt() {
      const state = snapshot();
      return deepFreeze({
        schema: 'simulatte.viewDirectorReceipt.v4',
        state,
        candidates: [...intents.values()]
          .sort(compareEntries)
          .map((entry) => ({
            id: entry.intent.id,
            source: entry.source,
            priority: entry.intent.priority,
            sequence: entry.sequence,
          })),
        provenance: provenanceReceipt(state.decision.targetIds, state.decision.source),
      });
    }

    function registerProvenance(receipts) {
      const rows = Array.isArray(receipts) ? receipts : [receipts];
      rows.filter(Boolean).forEach((receipt, receiptIndex) => {
        if (receipt.schema !== 'simulatte.contributionProvenanceReceipt.v4' || !Array.isArray(receipt.envelopes)) {
          throw directorError('view_director_provenance_receipt_invalid', `View provenance receipt ${receiptIndex} is invalid`);
        }
        receipt.envelopes.filter((row) => row.subjectKind === 'semanticObject').forEach((envelope) => {
          contracts.validateProvenanceEnvelope(envelope, `View provenance ${receipt.pluginId}:${envelope.subjectId}`);
          const key = provenanceKey(receipt.pluginId, envelope.subjectId);
          const existing = provenanceByTargetId.get(key);
          if (existing && canonical(existing) !== canonical(envelope)) {
            throw directorError('view_director_provenance_conflict', `View target ${key} has conflicting provenance`);
          }
          provenanceByTargetId.set(key, envelope);
        });
      });
      return receipt();
    }

    function provenanceReceipt(targetIds, source) {
      const resolved = targetIds.filter((id) => provenanceForTarget(id, source));
      const unresolved = targetIds.filter((id) => !provenanceForTarget(id, source));
      const origins = Object.fromEntries(contracts.ORIGINS.map((origin) => [
        origin,
        resolved.filter((id) => provenanceForTarget(id, source).axes.origin === origin).length,
      ]));
      return {
        schema: 'simulatte.viewProvenanceReceipt.v4',
        availableEnvelopeCount: provenanceByTargetId.size,
        resolvedTargetIds: resolved,
        unresolvedTargetIds: unresolved,
        byOrigin: origins,
      };
    }

    function provenanceForTarget(targetId, source) {
      if (!targetId || !provenanceByTargetId.size) return null;
      if (source && !source.startsWith('core-') && !['manual', 'plugin'].includes(source)) {
        return provenanceByTargetId.get(provenanceKey(source, targetId)) || null;
      }
      if (targetId.startsWith('plugin:')) {
        const [, pluginId, ...subjectParts] = targetId.split(':');
        return provenanceByTargetId.get(provenanceKey(pluginId, subjectParts.join(':'))) || null;
      }
      const matches = [...provenanceByTargetId.entries()]
        .filter(([key]) => key.endsWith(`:${targetId}`))
        .map(([, envelope]) => envelope);
      return matches.length === 1 ? matches[0] : null;
    }

    function arbitrate(reason) {
      const winner = [...intents.values()].sort(compareEntries)[0] || null;
      active = winner ? decisionFor(winner) : null;
      emit(reason);
    }

    function emit(reason) {
      const message = Object.freeze({ type: 'state', reason, state: snapshot() });
      listeners.forEach((listener) => listener(message));
    }

    return Object.freeze({
      schema: 'simulatte.viewDirector.v4',
      receipt,
      registerProvenance,
      releaseManualOverride,
      remove,
      resolveEvent,
      setManualOverride,
      snapshot,
      submit,
      subscribe,
    });
  }

  function compareEntries(left, right) {
    if (right.intent.priority !== left.intent.priority) return right.intent.priority - left.intent.priority;
    if (right.sequence !== left.sequence) return right.sequence - left.sequence;
    return left.intent.id.localeCompare(right.intent.id);
  }

  function provenanceKey(pluginId, subjectId) {
    return `${pluginId}:${subjectId}`;
  }

  function decisionFor(entry) {
    return deepFreeze({
      schema: 'simulatte.viewDecision.v4',
      source: entry.source,
      intentId: entry.intent.id,
      mode: entry.intent.mode,
      targetIds: entry.intent.targetIds,
      transition: entry.intent.transition,
      reasonEventId: entry.intent.reasonEventId,
    });
  }

  function fallbackDecision() {
    return Object.freeze({
      schema: 'simulatte.viewDecision.v4',
      source: 'core-fallback',
      intentId: null,
      mode: 'free',
      targetIds: [],
      transition: 'cut',
      reasonEventId: null,
    });
  }

  function text(value, code, label) {
    if (typeof value !== 'string' || !value) throw directorError(code, `${label} expected non-empty text`);
  }

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
  }

  function canonical(value) {
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
    if (value && typeof value === 'object') {
      return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
  }

  function directorError(code, message, evidence = null) {
    const error = new Error(`${code}: ${message}`);
    error.name = 'SimulatteViewDirectorError';
    error.code = code;
    error.evidence = evidence;
    return error;
  }

  return Object.freeze({ compareEntries, createViewDirector });
});
