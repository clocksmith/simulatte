(function attachProvenanceRegistry(root, factory) {
  const contracts = typeof module === 'object' && module.exports
    ? require('../contracts/plugin-v4-contracts.js')
    : root.SimulattePluginV4Contracts;
  const api = factory(contracts);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteProvenanceRegistry = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createProvenanceRegistryModule(contracts) {
  const RECORD_KINDS = Object.freeze(['dataset', 'row', 'transformation', 'model']);

  function createProvenanceRegistry() {
    const records = new Map();
    const bindings = new Map();

    function register(value) {
      validateRecord(value);
      const frozen = freezeClone(value);
      const existing = records.get(value.id);
      if (existing && canonical(existing) !== canonical(frozen)) {
        throw registryError('provenance_identity_conflict', `Provenance record ${value.id} changed identity`, { id: value.id });
      }
      records.set(value.id, existing || frozen);
      return records.get(value.id);
    }

    function bind(objectId, evidenceRefs) {
      text(objectId, 'provenance_binding_id_invalid', 'Provenance binding object ID');
      if (!Array.isArray(evidenceRefs)) throw registryError('provenance_binding_refs_invalid', `Binding ${objectId} expected evidence references`);
      evidenceRefs.forEach((row, index) => {
        contracts.validateEvidenceRef(row, `Binding ${objectId} evidenceRefs[${index}]`);
        if (!records.has(row.id)) throw registryError('provenance_binding_record_missing', `Binding ${objectId} references unregistered evidence ${row.id}`, { objectId, evidenceId: row.id });
      });
      const ids = evidenceRefs.map((row) => row.id);
      if (new Set(ids).size !== ids.length) throw registryError('provenance_binding_duplicate', `Binding ${objectId} repeats evidence`, { objectId, ids });
      bindings.set(objectId, Object.freeze(ids));
      return resolve(objectId);
    }

    function resolve(objectId) {
      return Object.freeze((bindings.get(objectId) || []).map((id) => records.get(id)));
    }

    function evidence(id) {
      return records.get(id) || null;
    }

    function receipt() {
      const counts = Object.fromEntries(RECORD_KINDS.map((kind) => [kind, [...records.values()].filter((row) => row.kind === kind).length]));
      return freezeClone({
        schema: 'simulatte.provenanceRegistryReceipt.v4',
        recordCount: records.size,
        bindingCount: bindings.size,
        counts,
        recordIds: [...records.keys()].sort(),
        boundObjectIds: [...bindings.keys()].sort(),
      });
    }

    return Object.freeze({ bind, evidence, receipt, register, resolve });
  }

  function validateRecord(value) {
    contracts.validateProvenanceRecord(value);
  }

  function canonical(value) {
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
    if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
    return JSON.stringify(value);
  }

  function freezeClone(value) {
    return deepFreeze(structuredClone(value));
  }

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
  }

  function text(value, code, label) {
    if (typeof value !== 'string' || !value) throw registryError(code, `${label} expected non-empty text`);
  }

  function registryError(code, message, evidence = null) {
    const error = new Error(`${code}: ${message}`);
    error.name = 'SimulatteProvenanceRegistryError';
    error.code = code;
    error.evidence = evidence;
    return error;
  }

  return Object.freeze({ RECORD_KINDS, createProvenanceRegistry });
});
