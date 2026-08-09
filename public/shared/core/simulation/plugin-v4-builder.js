(function attachPluginV4Builder(root, factory) {
  const contracts = typeof module === 'object' && module.exports
    ? require('../../../simulatte/platform/contracts/plugin-v4-contracts.js')
    : root.SimulattePluginV4Contracts;
  const api = factory(contracts);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulattePluginV4Builder = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createPluginV4Builder(contracts) {
  const builtContributions = new WeakSet();

  function datasetRecord(id, receipt, metadata = {}) {
    const contentHash = receipt?.sha256 || receipt?.contentHash || receipt?.reference?.sha256;
    if (typeof contentHash !== 'string' || !contentHash) throw builderError('plugin_v4_dataset_hash_missing', `Dataset ${id} has no content hash`);
    return record({
      id,
      kind: 'dataset',
      datasetId: id,
      contentHash,
      metadata,
      envelope: migrateDatasetEnvelope(id, contentHash, receipt, metadata),
    });
  }

  function rowRecord(dataset, rowId, metadata = {}) {
    return record({
      id: `${dataset.id}:row:${rowId}`,
      kind: 'row',
      datasetId: dataset.datasetId,
      rowId: String(rowId),
      contentHash: dataset.contentHash,
      parentIds: [dataset.id],
      metadata,
      envelope: contracts.createProvenanceEnvelope({
        ...dataset.envelope,
        subjectId: `${dataset.id}:row:${rowId}`,
        subjectKind: 'row',
        rowIds: [String(rowId)],
        parentIds: [dataset.id],
      }),
    });
  }

  function modelRecord({ id, datasetId, contentHash, parentIds = [], metadata = {}, lineage = {} }) {
    return record({
      id,
      kind: 'model',
      datasetId,
      contentHash,
      parentIds,
      metadata,
      envelope: createComputedEnvelope({ id, kind: 'model', datasetId, contentHash, parentIds, metadata, lineage }),
    });
  }

  function transformationRecord({ id, datasetId, contentHash, parentIds = [], metadata = {}, lineage = {} }) {
    return record({
      id,
      kind: 'transformation',
      datasetId,
      contentHash,
      parentIds,
      metadata,
      envelope: createComputedEnvelope({ id, kind: 'transformation', datasetId, contentHash, parentIds, metadata, lineage }),
    });
  }

  function record({ id, kind, datasetId, rowId, contentHash, parentIds = [], metadata = {}, envelope }) {
    const value = {
      schema: 'simulatte.provenanceRecord.v4',
      id,
      kind,
      datasetId,
      ...(rowId === undefined ? {} : { rowId }),
      contentHash,
      parentIds,
      metadata,
      envelope,
    };
    contracts.validateProvenanceRecord(value);
    return deepFreeze(value);
  }

  function evidence(recordValue) {
    return deepFreeze({
      id: recordValue.id,
      datasetId: recordValue.datasetId,
      ...(recordValue.rowId === undefined ? {} : { rowId: recordValue.rowId }),
      contentHash: recordValue.contentHash,
      ...(recordValue.kind === 'transformation' ? { transformationId: recordValue.id } : {}),
      ...(recordValue.kind === 'model' ? { modelReceiptId: recordValue.id } : {}),
    });
  }

  function provenance({ origin, temporalStatus, uncertainty = null, records = [] }) {
    return contracts.createProvenance({
      origin,
      temporalStatus,
      uncertainty,
      evidenceRefs: records.map(evidence),
    });
  }

  function migrateDatasetEnvelope(id, contentHash, receipt, metadata) {
    const declaredAxes = declaredTruthAxes(receipt?.truth || receipt?.provenance?.truth || metadata.truth);
    const isScenario = Boolean(metadata.seed || metadata.scenarioKind || /synthetic|scenario/i.test(String(metadata.kind || '')));
    const licenseIdentifier = normalizeLicense(metadata.license || receipt?.license || receipt?.provenance?.license);
    const origin = declaredAxes?.origin || (isScenario ? 'scenario' : licenseIdentifier ? 'observed' : 'derived');
    const temporalStatus = declaredAxes?.temporalStatus
      || (isScenario ? 'forecast' : receipt?.retrievalAt || receipt?.retrievedAt ? 'snapshot' : 'historical');
    const uncertainty = declaredAxes?.uncertainty || {
      kind: 'missing',
      value: { reason: 'source receipt does not declare quantified uncertainty' },
    };
    const contentVersion = String(
      receipt?.contentVersion
      || receipt?.version
      || metadata.contentVersion
      || metadata.schemaId
      || `sha256:${normalizeSha256(contentHash)}`,
    );
    const retrievalEpoch = receipt?.retrievalAt
      || receipt?.retrievedAt
      || receipt?.provenance?.retrievalAt
      || receipt?.provenance?.retrievedAt
      || (!isScenario ? `content-version:${contentVersion}` : null);
    const scenarioEpoch = metadata.seed
      ? `seed:${metadata.seed}`
      : isScenario
        ? `content-version:${contentVersion}`
        : null;
    return contracts.createProvenanceEnvelope({
      subjectId: id,
      subjectKind: 'dataset',
      axes: { origin, temporalStatus, uncertainty },
      datasetIds: [id],
      artifactSha256: contentHash,
      retrievalEpoch,
      scenarioEpoch,
      contentVersion,
      license: {
        required: origin === 'observed',
        identifier: licenseIdentifier,
      },
    });
  }

  function createComputedEnvelope({ id, kind, datasetId, contentHash, parentIds, metadata, lineage }) {
    const axes = lineage.axes || {
      origin: kind === 'transformation' ? 'derived' : 'modeled',
      temporalStatus: lineage.temporalStatus || 'forecast',
      uncertainty: lineage.uncertainty || {
        kind: 'missing',
        value: { reason: `${kind} receipt does not declare quantified uncertainty` },
      },
    };
    const contentVersion = String(lineage.contentVersion || metadata.version || metadata.engineVersion || `sha256:${normalizeSha256(contentHash)}`);
    return contracts.createProvenanceEnvelope({
      subjectId: id,
      subjectKind: kind,
      axes,
      datasetIds: [datasetId],
      artifactSha256: contentHash,
      parentIds,
      transformationChain: kind === 'transformation'
        ? [...new Set([...(lineage.transformationChain || []), id])]
        : (lineage.transformationChain || []),
      modelReceiptId: kind === 'model' ? (lineage.modelReceiptId || id) : (lineage.modelReceiptId || null),
      retrievalEpoch: lineage.retrievalEpoch || null,
      scenarioEpoch: lineage.scenarioEpoch || `content-version:${contentVersion}`,
      contentVersion,
      license: lineage.license || { required: false, identifier: null },
    });
  }

  function declaredTruthAxes(value) {
    if (!value || typeof value !== 'object') return null;
    const origin = value.origin;
    const temporalStatus = value.temporalStatus;
    const uncertainty = value.uncertainty;
    if (!contracts.ORIGINS.includes(origin) || !contracts.TEMPORAL_STATUSES.includes(temporalStatus) || uncertainty === undefined) return null;
    return { origin, temporalStatus, uncertainty };
  }

  function normalizeLicense(value) {
    if (typeof value === 'string' && value) return value;
    if (!value || typeof value !== 'object') return null;
    return value.id || value.identifier || value.url || null;
  }

  function normalizeSha256(value) {
    return value.startsWith('sha256-') ? value.slice('sha256-'.length) : value;
  }

  function quantity(kind, value, unit, domain = null) {
    return deepFreeze({ kind, value: finiteValue(value, kind), unit, domain });
  }

  function layer({
    id,
    kind,
    label,
    geometry,
    quantity: measure = null,
    role = 'context',
    importance = 0.5,
    aggregationKey = null,
    temporal = null,
    provenance: claim,
  }) {
    const value = {
      id,
      kind,
      label,
      geometry,
      quantity: measure,
      role,
      importance,
      aggregationKey,
      temporal,
      provenance: claim,
    };
    contracts.validateSemanticLayer(value);
    return deepFreeze(value);
  }

  function event({
    id,
    pluginId,
    sequence,
    simulationTimeMs,
    kind,
    causationIds = [],
    correlationId,
    payload,
    provenance: claim,
  }) {
    const value = {
      schema: 'simulatte.pluginEvent.v4',
      id,
      pluginId,
      sequence,
      simulationTimeMs,
      kind,
      causationIds,
      correlationId,
      payload,
      provenance: claim,
    };
    contracts.validateDomainEvent(value);
    return deepFreeze(value);
  }

  function presentation({ pluginId, coordinateSystem, epoch = null, layers = [], viewIntents = [], sun = null }) {
    const value = {
      schema: 'simulatte.pluginPresentation.v4',
      pluginId,
      coordinateSystem,
      epoch,
      layers,
      viewIntents,
      sun,
    };
    contracts.validatePresentation(value);
    return deepFreeze(value);
  }

  function controls(rows = [], comparisons = []) {
    const value = { schema: 'simulatte.pluginControls.v4', controls: rows, comparisons };
    contracts.validateControls(value);
    return deepFreeze(value);
  }

  function state({ id, pluginId, simulationTimeMs, status, previousStateId = null, eventIds = [], measures = [], provenance: claim }) {
    const value = {
      schema: 'simulatte.progressiveState.v4',
      id,
      pluginId,
      simulationTimeMs,
      status,
      previousStateId,
      eventIds,
      measures,
      provenance: claim,
    };
    contracts.validateProgressiveState(value);
    return deepFreeze(value);
  }

  function contribution({
    pluginId,
    presentation: visual,
    events = [],
    controls: controlSet = controls(),
    state: progressiveState = null,
    inspections = [],
    provenanceRecords = [],
  }) {
    const value = {
      schema: 'simulatte.pluginContribution.v4',
      pluginId,
      presentation: visual,
      events,
      controls: controlSet,
      state: progressiveState,
      inspections,
      provenanceRecords,
    };
    contracts.validateContribution(value);
    const frozen = deepFreeze(value);
    builtContributions.add(frozen);
    return frozen;
  }

  function isBuiltContribution(value) {
    return Boolean(value && builtContributions.has(value));
  }

  function viewIntent({ id, mode, targetIds = [], reasonEventId = null, priority = 0, transition = 'ease' }) {
    const value = {
      schema: 'simulatte.viewIntent.v4',
      id,
      mode,
      targetIds,
      reasonEventId,
      priority,
      transition,
    };
    contracts.validateViewIntent(value);
    return deepFreeze(value);
  }

  function geometry(kind, coordinateSystem, values) {
    const value = {
      kind,
      coordinateSystem,
      nodeIds: kind === 'node' || kind === 'node-path' ? values : [],
      segmentIds: kind === 'segments' ? values : [],
      coordinates: ['point', 'point-cloud', 'polyline', 'polygon'].includes(kind) ? values : [],
    };
    return deepFreeze(value);
  }

  function finiteValue(value, label) {
    const number = Number(value);
    if (!Number.isFinite(number)) throw builderError('plugin_v4_quantity_invalid', `Quantity ${label} expected a finite value`);
    return number;
  }

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
  }

  function builderError(code, message) {
    const error = new Error(`${code}: ${message}`);
    error.name = 'SimulattePluginV4BuilderError';
    error.code = code;
    return error;
  }

  return Object.freeze({
    contribution,
    controls,
    datasetRecord,
    evidence,
    event,
    geometry,
    isBuiltContribution,
    layer,
    modelRecord,
    presentation,
    provenance,
    quantity,
    rowRecord,
    state,
    transformationRecord,
    viewIntent,
  });
});
