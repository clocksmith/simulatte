(function attachProvenanceRegistry(root, factory) {
  const contracts = typeof module === 'object' && module.exports
    ? require('../contracts/plugin-v4-contracts.js')
    : root.SimulattePluginV4Contracts;
  const api = factory(contracts);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteProvenanceRegistry = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createProvenanceRegistryModule(contracts) {
  const RECORD_KINDS = Object.freeze(['dataset', 'row', 'transformation', 'model']);

  function createContributionProvenanceReceipt(contribution, { settlements = [] } = {}) {
    contracts.validateContribution(contribution);
    if (!Array.isArray(settlements)) {
      throw registryError('provenance_settlements_invalid', 'Contribution settlements expected an array');
    }
    const recordsById = new Map(contribution.provenanceRecords.map((row) => [row.id, row]));
    const subjects = [
      ...contribution.provenanceRecords.map((row) => row.envelope),
      ...contribution.presentation.layers.map((row) => subjectEnvelope(row.id, 'semanticObject', row.provenance, recordsById)),
      ...contribution.events.map((row) => subjectEnvelope(row.id, 'event', row.provenance, recordsById)),
      ...contribution.controls.controls.map((row) => subjectEnvelope(row.id, 'parameter', row.provenance, recordsById)),
      ...(contribution.state ? [
        subjectEnvelope(contribution.state.id, 'state', contribution.state.provenance, recordsById),
        ...contribution.state.measures.map((row) => subjectEnvelope(
          `${contribution.state.id}:metric:${row.kind}`,
          'metric',
          contribution.state.provenance,
          recordsById,
        )),
      ] : []),
      ...contribution.inspections.flatMap((inspection) => inspection.fields.map((field) => subjectEnvelope(
        `${inspection.id}:${field.id}`,
        'inspection',
        field.provenance,
        recordsById,
      ))),
      ...settlements.map((row, index) => {
        if (!row || typeof row.id !== 'string' || !row.id) {
          throw registryError('provenance_settlement_id_invalid', `Settlement ${index} requires an ID`);
        }
        contracts.validateProvenance(row.provenance, `Settlement ${row.id} provenance`);
        return subjectEnvelope(row.id, 'settlement', row.provenance, recordsById);
      }),
    ];
    return deepFreeze({
      schema: 'simulatte.contributionProvenanceReceipt.v4',
      pluginId: contribution.pluginId,
      envelopes: subjects,
      coverageMatrix: coverageForEnvelopes(subjects),
    });
  }

  function createPlatformProvenanceReceipt(contributionReceipts) {
    if (!Array.isArray(contributionReceipts)) {
      throw registryError('provenance_contribution_receipts_invalid', 'Platform provenance receipts expected an array');
    }
    const seen = new Map();
    const envelopes = contributionReceipts.flatMap((receipt, index) => {
      if (receipt?.schema !== 'simulatte.contributionProvenanceReceipt.v4' || !Array.isArray(receipt.envelopes)) {
        throw registryError('provenance_contribution_receipt_invalid', `Platform provenance receipt ${index} is invalid`);
      }
      return receipt.envelopes.map((envelope) => {
        contracts.validateProvenanceEnvelope(envelope, `Platform provenance ${receipt.pluginId}:${envelope.subjectId}`);
        const key = `${receipt.pluginId}:${envelope.subjectId}`;
        const existing = seen.get(key);
        if (existing && canonical(existing) !== canonical(envelope)) {
          throw registryError('provenance_platform_subject_conflict', `Platform provenance subject ${key} changed identity`);
        }
        seen.set(key, existing || envelope);
        return envelope;
      });
    });
    return deepFreeze({
      schema: 'simulatte.platformProvenanceReceipt.v4',
      pluginIds: contributionReceipts.map((row) => row.pluginId).sort(),
      contributionCount: contributionReceipts.length,
      coverageMatrix: coverageForEnvelopes(envelopes),
    });
  }

  function subjectEnvelope(subjectId, subjectKind, provenance, recordsById) {
    contracts.validateProvenance(provenance, `${subjectKind} ${subjectId} provenance`);
    if (!provenance.evidenceRefs.length) {
      throw registryError('provenance_subject_evidence_missing', `${subjectKind} ${subjectId} has no evidence`);
    }
    const records = provenance.evidenceRefs.map((reference) => {
      const record = recordsById.get(reference.id);
      if (!record) {
        throw registryError('provenance_subject_record_missing', `${subjectKind} ${subjectId} references missing record ${reference.id}`);
      }
      return record;
    });
    const origins = new Set(records.map((row) => row.envelope.axes.origin));
    if (origins.has('observed') && origins.has('scenario') && provenance.axes.origin !== 'derived') {
      throw registryError('provenance_subject_mixed_lineage_not_derived', `${subjectKind} ${subjectId} combines observed and scenario evidence but is not derived`, {
        subjectId,
        subjectKind,
        origin: provenance.axes.origin,
      });
    }
    const envelope = {
      schema: 'simulatte.provenanceEnvelope.v4',
      subjectId,
      subjectKind,
      axes: provenance.axes,
      datasetIds: unique(records.flatMap((row) => row.envelope.datasetIds)),
      rowIds: unique(records.flatMap((row) => row.envelope.rowIds)),
      artifactSha256s: unique(records.flatMap((row) => row.envelope.artifactSha256s)),
      parentIds: unique(records.map((row) => row.id)),
      transformationChain: unique(records.flatMap((row) => row.envelope.transformationChain)),
      modelReceiptIds: unique(records.flatMap((row) => row.envelope.modelReceiptIds)),
      retrievalEpochs: unique(records.flatMap((row) => row.envelope.retrievalEpochs)),
      scenarioEpochs: unique(records.flatMap((row) => row.envelope.scenarioEpochs)),
      contentVersions: unique(records.flatMap((row) => row.envelope.contentVersions)),
      licenseRequired: records.some((row) => row.envelope.licenseRequired),
      licenseIdentifiers: unique(records.flatMap((row) => row.envelope.licenseIdentifiers)),
    };
    contracts.validateProvenanceEnvelope(envelope, `${subjectKind} ${subjectId} envelope`);
    return deepFreeze(envelope);
  }

  function coverageForEnvelopes(envelopes) {
    const count = (keys, select) => Object.freeze(Object.fromEntries(keys.map((key) => [
      key,
      envelopes.filter((row) => select(row) === key).length,
    ])));
    return deepFreeze({
      schema: 'simulatte.provenanceCoverageMatrix.v4',
      subjectCount: envelopes.length,
      byOrigin: count(contracts.ORIGINS, (row) => row.axes.origin),
      byTemporalStatus: count(contracts.TEMPORAL_STATUSES, (row) => row.axes.temporalStatus),
      byUncertaintyKind: count(contracts.UNCERTAINTY_KINDS, (row) => row.axes.uncertainty.kind),
      bySubjectKind: Object.fromEntries(contracts.PROVENANCE_SUBJECT_KINDS.map((kind) => [
        kind,
        count(contracts.ORIGINS, (row) => row.subjectKind === kind ? row.axes.origin : null),
      ])),
      gaps: {
        hypotheticalSubjectIds: envelopes
          .filter((row) => ['modeled', 'simulated', 'scenario'].includes(row.axes.origin))
          .map((row) => row.subjectId)
          .sort(),
        missingUncertaintySubjectIds: envelopes
          .filter((row) => row.axes.uncertainty.kind === 'missing')
          .map((row) => row.subjectId)
          .sort(),
      },
    });
  }

  function createProvenanceRegistry() {
    const records = new Map();
    const bindings = new Map();

    function register(value) {
      validateRecord(value);
      const missingParents = value.parentIds.filter((id) => !records.has(id));
      if (missingParents.length) {
        throw registryError('provenance_parent_missing', `Provenance record ${value.id} has unregistered parents`, {
          id: value.id,
          missingParents,
        });
      }
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
        const record = records.get(row.id);
        const hash = row.contentHash.startsWith('sha256-') ? row.contentHash.slice('sha256-'.length) : row.contentHash;
        if (row.datasetId !== record.datasetId || !record.envelope.artifactSha256s.includes(hash) || (row.rowId !== undefined && row.rowId !== record.rowId)) {
          throw registryError('provenance_binding_identity_mismatch', `Binding ${objectId} evidence ${row.id} does not match its registered identity`, {
            objectId,
            evidenceId: row.id,
          });
        }
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
      const rows = [...records.values()];
      const counts = Object.fromEntries(RECORD_KINDS.map((kind) => [kind, rows.filter((row) => row.kind === kind).length]));
      return freezeClone({
        schema: 'simulatte.provenanceRegistryReceipt.v4',
        recordCount: records.size,
        bindingCount: bindings.size,
        counts,
        coverageMatrix: contracts.createCoverageMatrix(rows),
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

  function unique(values) {
    return [...new Set(values)].sort();
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

  return Object.freeze({
    RECORD_KINDS,
    createContributionProvenanceReceipt,
    createPlatformProvenanceReceipt,
    createProvenanceRegistry,
  });
});
