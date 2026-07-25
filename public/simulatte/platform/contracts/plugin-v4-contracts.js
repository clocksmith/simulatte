(function attachPluginV4Contracts(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulattePluginV4Contracts = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createPluginV4Contracts() {
  const ORIGINS = Object.freeze(['observed', 'derived', 'modeled', 'simulated', 'scenario']);
  const TEMPORAL_STATUSES = Object.freeze(['historical', 'snapshot', 'forecast', 'live']);
  const UNCERTAINTY_KINDS = Object.freeze(['interval', 'distribution', 'confidence', 'missing']);
  const GEOMETRY_KINDS = Object.freeze(['node', 'node-path', 'segments', 'point', 'polyline', 'polygon']);
  const LAYER_KINDS = Object.freeze(['point', 'path', 'area', 'actor', 'field', 'label']);
  const SEMANTIC_ROLES = Object.freeze(['primary', 'context', 'comparison', 'uncertainty', 'event']);
  const VIEW_MODES = Object.freeze(['overview', 'follow', 'pov', 'compare', 'free']);
  const CONTROL_KINDS = Object.freeze(['number', 'range', 'select', 'toggle', 'time']);
  const HASH_PATTERN = /^(?:[a-f0-9]{64}|sha(?:256|384)-[a-f0-9]{64,96})$/;

  function validateTruthAxes(value, label = 'Truth axes') {
    object(value, 'plugin_v4_truth_invalid', `${label} expected an object`);
    exactKeys(value, ['origin', 'temporalStatus', 'uncertainty'], label);
    enumValue(value.origin, ORIGINS, 'plugin_v4_origin_invalid', `${label} origin`);
    enumValue(value.temporalStatus, TEMPORAL_STATUSES, 'plugin_v4_temporal_status_invalid', `${label} temporal status`);
    if (value.uncertainty !== null) {
      object(value.uncertainty, 'plugin_v4_uncertainty_invalid', `${label} uncertainty expected an object or null`);
      exactKeys(value.uncertainty, ['kind', 'value'], `${label} uncertainty`);
      enumValue(value.uncertainty.kind, UNCERTAINTY_KINDS, 'plugin_v4_uncertainty_kind_invalid', `${label} uncertainty kind`);
      if (value.uncertainty.value === undefined) fail('plugin_v4_uncertainty_value_missing', `${label} uncertainty value is missing`);
    }
    return value;
  }

  function validateEvidenceRef(value, label = 'Evidence reference') {
    object(value, 'plugin_v4_evidence_ref_invalid', `${label} expected an object`);
    allowedKeys(
      value,
      ['id', 'datasetId', 'rowId', 'contentHash', 'transformationId', 'modelReceiptId'],
      ['id', 'datasetId', 'contentHash'],
      label
    );
    ['id', 'datasetId'].forEach((key) => text(value[key], 'plugin_v4_evidence_ref_text_invalid', `${label} ${key}`));
    if (!HASH_PATTERN.test(value.contentHash)) fail('plugin_v4_evidence_hash_invalid', `${label} content hash is invalid`, { contentHash: value.contentHash });
    ['rowId', 'transformationId', 'modelReceiptId'].forEach((key) => {
      if (value[key] !== undefined) text(value[key], 'plugin_v4_evidence_ref_text_invalid', `${label} ${key}`);
    });
    return value;
  }

  function validateProvenance(value, label = 'Provenance') {
    object(value, 'plugin_v4_provenance_invalid', `${label} expected an object`);
    exactKeys(value, ['schema', 'axes', 'evidenceRefs'], label);
    equal(value.schema, 'simulatte.provenance.v4', 'plugin_v4_provenance_schema_invalid', `${label} schema`);
    validateTruthAxes(value.axes, `${label} axes`);
    array(value.evidenceRefs, 'plugin_v4_evidence_refs_invalid', `${label} evidenceRefs`);
    value.evidenceRefs.forEach((row, index) => validateEvidenceRef(row, `${label} evidenceRefs[${index}]`));
    unique(value.evidenceRefs.map((row) => row.id), 'plugin_v4_evidence_ref_duplicate', `${label} evidence reference IDs`);
    return value;
  }

  function validateDomainEvent(value, label = 'Domain event') {
    object(value, 'plugin_v4_event_invalid', `${label} expected an object`);
    exactKeys(
      value,
      ['schema', 'id', 'pluginId', 'sequence', 'simulationTimeMs', 'kind', 'causationIds', 'correlationId', 'payload', 'provenance'],
      label
    );
    equal(value.schema, 'simulatte.pluginEvent.v4', 'plugin_v4_event_schema_invalid', `${label} schema`);
    ['id', 'pluginId', 'kind', 'correlationId'].forEach((key) => text(value[key], 'plugin_v4_event_text_invalid', `${label} ${key}`));
    integer(value.sequence, 0, Number.MAX_SAFE_INTEGER, 'plugin_v4_event_sequence_invalid', `${label} sequence`);
    finite(value.simulationTimeMs, 0, Number.MAX_SAFE_INTEGER, 'plugin_v4_event_time_invalid', `${label} simulationTimeMs`);
    array(value.causationIds, 'plugin_v4_event_causation_invalid', `${label} causationIds`);
    value.causationIds.forEach((id) => text(id, 'plugin_v4_event_causation_invalid', `${label} causation ID`));
    unique(value.causationIds, 'plugin_v4_event_causation_duplicate', `${label} causation IDs`);
    if (value.payload === undefined) fail('plugin_v4_event_payload_missing', `${label} payload is missing`);
    validateProvenance(value.provenance, `${label} provenance`);
    return value;
  }

  function validateGeometry(value, label = 'Geometry') {
    object(value, 'plugin_v4_geometry_invalid', `${label} expected an object`);
    allowedKeys(value, ['kind', 'coordinateSystem', 'nodeIds', 'segmentIds', 'coordinates'], ['kind', 'coordinateSystem'], label);
    enumValue(value.kind, GEOMETRY_KINDS, 'plugin_v4_geometry_kind_invalid', `${label} kind`);
    text(value.coordinateSystem, 'plugin_v4_coordinate_system_invalid', `${label} coordinateSystem`);
    const nodeIds = value.nodeIds || [];
    const segmentIds = value.segmentIds || [];
    const coordinates = value.coordinates || [];
    [nodeIds, segmentIds, coordinates].forEach((rows) => array(rows, 'plugin_v4_geometry_rows_invalid', `${label} geometry rows`));
    nodeIds.forEach((id) => text(id, 'plugin_v4_geometry_id_invalid', `${label} node ID`));
    segmentIds.forEach((id) => text(id, 'plugin_v4_geometry_id_invalid', `${label} segment ID`));
    coordinates.forEach((row, index) => {
      if (!Array.isArray(row) || row.length < 2 || row.length > 3 || row.some((entry) => !Number.isFinite(entry))) {
        fail('plugin_v4_geometry_coordinate_invalid', `${label} coordinate ${index} expected two or three finite values`, { coordinate: row });
      }
    });
    if (value.kind === 'node' && nodeIds.length !== 1) fail('plugin_v4_geometry_node_invalid', `${label} node geometry expected one node ID`);
    if (value.kind === 'node-path' && nodeIds.length < 2) fail('plugin_v4_geometry_node_path_invalid', `${label} node path expected at least two node IDs`);
    if (value.kind === 'segments' && !segmentIds.length) fail('plugin_v4_geometry_segments_invalid', `${label} segment geometry expected segment IDs`);
    if (value.kind === 'point' && coordinates.length !== 1) fail('plugin_v4_geometry_point_invalid', `${label} point geometry expected one coordinate`);
    if (value.kind === 'polyline' && coordinates.length < 2) fail('plugin_v4_geometry_polyline_invalid', `${label} polyline expected at least two coordinates`);
    if (value.kind === 'polygon' && coordinates.length < 3) fail('plugin_v4_geometry_polygon_invalid', `${label} polygon expected at least three coordinates`);
    return value;
  }

  function validateSemanticLayer(value, label = 'Semantic layer') {
    object(value, 'plugin_v4_layer_invalid', `${label} expected an object`);
    exactKeys(
      value,
      ['id', 'kind', 'label', 'geometry', 'quantity', 'role', 'importance', 'aggregationKey', 'temporal', 'provenance'],
      label
    );
    text(value.id, 'plugin_v4_layer_id_invalid', `${label} id`);
    text(value.label, 'plugin_v4_layer_label_invalid', `${label} label`);
    enumValue(value.kind, LAYER_KINDS, 'plugin_v4_layer_kind_invalid', `${label} kind`);
    enumValue(value.role, SEMANTIC_ROLES, 'plugin_v4_layer_role_invalid', `${label} role`);
    validateGeometry(value.geometry, `${label} geometry`);
    finite(value.importance, 0, 1, 'plugin_v4_layer_importance_invalid', `${label} importance`);
    if (value.aggregationKey !== null) text(value.aggregationKey, 'plugin_v4_layer_aggregation_invalid', `${label} aggregationKey`);
    if (value.quantity !== null) validateQuantity(value.quantity, `${label} quantity`);
    if (value.temporal !== null) validateTemporalExtent(value.temporal, `${label} temporal`);
    validateProvenance(value.provenance, `${label} provenance`);
    return value;
  }

  function validateQuantity(value, label) {
    object(value, 'plugin_v4_quantity_invalid', `${label} expected an object`);
    exactKeys(value, ['kind', 'value', 'unit', 'domain'], label);
    text(value.kind, 'plugin_v4_quantity_text_invalid', `${label} kind`);
    finite(value.value, -Number.MAX_VALUE, Number.MAX_VALUE, 'plugin_v4_quantity_value_invalid', `${label} value`);
    text(value.unit, 'plugin_v4_quantity_text_invalid', `${label} unit`);
    if (value.domain !== null) {
      if (!Array.isArray(value.domain) || value.domain.length !== 2 || value.domain.some((row) => !Number.isFinite(row)) || value.domain[0] >= value.domain[1]) {
        fail('plugin_v4_quantity_domain_invalid', `${label} domain expected an ascending finite pair`, { domain: value.domain });
      }
    }
  }

  function validateTemporalExtent(value, label) {
    object(value, 'plugin_v4_temporal_extent_invalid', `${label} expected an object`);
    exactKeys(value, ['startMs', 'endMs'], label);
    finite(value.startMs, 0, Number.MAX_SAFE_INTEGER, 'plugin_v4_temporal_extent_invalid', `${label} startMs`);
    finite(value.endMs, value.startMs, Number.MAX_SAFE_INTEGER, 'plugin_v4_temporal_extent_invalid', `${label} endMs`);
  }

  function validateViewIntent(value, label = 'View intent') {
    object(value, 'plugin_v4_view_intent_invalid', `${label} expected an object`);
    exactKeys(value, ['schema', 'id', 'mode', 'targetIds', 'reasonEventId', 'priority', 'transition'], label);
    equal(value.schema, 'simulatte.viewIntent.v4', 'plugin_v4_view_intent_schema_invalid', `${label} schema`);
    text(value.id, 'plugin_v4_view_intent_id_invalid', `${label} id`);
    enumValue(value.mode, VIEW_MODES, 'plugin_v4_view_mode_invalid', `${label} mode`);
    array(value.targetIds, 'plugin_v4_view_targets_invalid', `${label} targetIds`);
    value.targetIds.forEach((id) => text(id, 'plugin_v4_view_target_invalid', `${label} target ID`));
    unique(value.targetIds, 'plugin_v4_view_target_duplicate', `${label} target IDs`);
    if (value.reasonEventId !== null) text(value.reasonEventId, 'plugin_v4_view_reason_invalid', `${label} reasonEventId`);
    integer(value.priority, 0, 100, 'plugin_v4_view_priority_invalid', `${label} priority`);
    enumValue(value.transition, ['cut', 'ease'], 'plugin_v4_view_transition_invalid', `${label} transition`);
    return value;
  }

  function validateControls(value, label = 'Controls') {
    object(value, 'plugin_v4_controls_invalid', `${label} expected an object`);
    exactKeys(value, ['schema', 'controls', 'comparisons'], label);
    equal(value.schema, 'simulatte.pluginControls.v4', 'plugin_v4_controls_schema_invalid', `${label} schema`);
    array(value.controls, 'plugin_v4_controls_rows_invalid', `${label} controls`);
    array(value.comparisons, 'plugin_v4_comparison_rows_invalid', `${label} comparisons`);
    value.controls.forEach((row, index) => validateControl(row, `${label} controls[${index}]`));
    value.comparisons.forEach((row, index) => validateComparison(row, `${label} comparisons[${index}]`));
    unique(value.controls.map((row) => row.id), 'plugin_v4_control_duplicate', `${label} control IDs`);
    unique(value.comparisons.map((row) => row.id), 'plugin_v4_comparison_duplicate', `${label} comparison IDs`);
    return value;
  }

  function validateControl(value, label) {
    object(value, 'plugin_v4_control_invalid', `${label} expected an object`);
    exactKeys(value, ['id', 'label', 'kind', 'value', 'options', 'minimum', 'maximum', 'step', 'provenance'], label);
    text(value.id, 'plugin_v4_control_text_invalid', `${label} id`);
    text(value.label, 'plugin_v4_control_text_invalid', `${label} label`);
    enumValue(value.kind, CONTROL_KINDS, 'plugin_v4_control_kind_invalid', `${label} kind`);
    if (value.value === undefined) fail('plugin_v4_control_value_missing', `${label} value is missing`);
    if (value.options !== null) {
      array(value.options, 'plugin_v4_control_options_invalid', `${label} options`);
      value.options.forEach((option) => {
        object(option, 'plugin_v4_control_option_invalid', `${label} option expected an object`);
        exactKeys(option, ['value', 'label'], `${label} option`);
        text(option.label, 'plugin_v4_control_option_label_invalid', `${label} option label`);
      });
    }
    ['minimum', 'maximum', 'step'].forEach((key) => {
      if (value[key] !== null && !Number.isFinite(value[key])) fail('plugin_v4_control_bound_invalid', `${label} ${key} expected a finite number or null`);
    });
    if (value.minimum !== null && value.maximum !== null && value.minimum >= value.maximum) fail('plugin_v4_control_bounds_invalid', `${label} minimum must be below maximum`);
    validateProvenance(value.provenance, `${label} provenance`);
  }

  function validateComparison(value, label) {
    object(value, 'plugin_v4_comparison_invalid', `${label} expected an object`);
    exactKeys(value, ['id', 'label', 'baselineScenarioId', 'variantScenarioId', 'synchronizedClock'], label);
    ['id', 'label', 'baselineScenarioId', 'variantScenarioId'].forEach((key) => text(value[key], 'plugin_v4_comparison_text_invalid', `${label} ${key}`));
    if (typeof value.synchronizedClock !== 'boolean') fail('plugin_v4_comparison_clock_invalid', `${label} synchronizedClock expected a boolean`);
  }

  function validatePresentation(value, label = 'Presentation') {
    object(value, 'plugin_v4_presentation_invalid', `${label} expected an object`);
    exactKeys(value, ['schema', 'pluginId', 'coordinateSystem', 'epoch', 'layers', 'viewIntents'], label);
    equal(value.schema, 'simulatte.pluginPresentation.v4', 'plugin_v4_presentation_schema_invalid', `${label} schema`);
    text(value.pluginId, 'plugin_v4_presentation_plugin_invalid', `${label} pluginId`);
    text(value.coordinateSystem, 'plugin_v4_coordinate_system_invalid', `${label} coordinateSystem`);
    if (value.epoch !== null) text(value.epoch, 'plugin_v4_epoch_invalid', `${label} epoch`);
    array(value.layers, 'plugin_v4_layers_invalid', `${label} layers`);
    array(value.viewIntents, 'plugin_v4_view_intents_invalid', `${label} viewIntents`);
    value.layers.forEach((row, index) => validateSemanticLayer(row, `${label} layers[${index}]`));
    value.viewIntents.forEach((row, index) => validateViewIntent(row, `${label} viewIntents[${index}]`));
    unique(value.layers.map((row) => row.id), 'plugin_v4_layer_duplicate', `${label} layer IDs`);
    unique(value.viewIntents.map((row) => row.id), 'plugin_v4_view_intent_duplicate', `${label} view intent IDs`);
    return value;
  }

  function validateProgressiveState(value, label = 'Progressive state') {
    object(value, 'plugin_v4_state_invalid', `${label} expected an object`);
    exactKeys(
      value,
      ['schema', 'id', 'pluginId', 'simulationTimeMs', 'status', 'previousStateId', 'eventIds', 'measures', 'provenance'],
      label
    );
    equal(value.schema, 'simulatte.progressiveState.v4', 'plugin_v4_state_schema_invalid', `${label} schema`);
    ['id', 'pluginId', 'status'].forEach((key) => text(value[key], 'plugin_v4_state_text_invalid', `${label} ${key}`));
    finite(value.simulationTimeMs, 0, Number.MAX_SAFE_INTEGER, 'plugin_v4_state_time_invalid', `${label} simulationTimeMs`);
    if (value.previousStateId !== null) text(value.previousStateId, 'plugin_v4_state_previous_invalid', `${label} previousStateId`);
    array(value.eventIds, 'plugin_v4_state_events_invalid', `${label} eventIds`);
    value.eventIds.forEach((id) => text(id, 'plugin_v4_state_event_invalid', `${label} event ID`));
    unique(value.eventIds, 'plugin_v4_state_event_duplicate', `${label} event IDs`);
    array(value.measures, 'plugin_v4_state_measures_invalid', `${label} measures`);
    value.measures.forEach((row, index) => validateQuantity(row, `${label} measures[${index}]`));
    validateProvenance(value.provenance, `${label} provenance`);
    return value;
  }

  function validateInspection(value, label = 'Inspection') {
    object(value, 'plugin_v4_inspection_invalid', `${label} expected an object`);
    exactKeys(value, ['id', 'label', 'targetIds', 'fields'], label);
    text(value.id, 'plugin_v4_inspection_text_invalid', `${label} id`);
    text(value.label, 'plugin_v4_inspection_text_invalid', `${label} label`);
    array(value.targetIds, 'plugin_v4_inspection_targets_invalid', `${label} targetIds`);
    value.targetIds.forEach((id) => text(id, 'plugin_v4_inspection_target_invalid', `${label} target ID`));
    unique(value.targetIds, 'plugin_v4_inspection_target_duplicate', `${label} target IDs`);
    array(value.fields, 'plugin_v4_inspection_fields_invalid', `${label} fields`);
    value.fields.forEach((field, index) => {
      const fieldLabel = `${label} fields[${index}]`;
      object(field, 'plugin_v4_inspection_field_invalid', `${fieldLabel} expected an object`);
      exactKeys(field, ['id', 'label', 'value', 'unit', 'provenance'], fieldLabel);
      text(field.id, 'plugin_v4_inspection_field_text_invalid', `${fieldLabel} id`);
      text(field.label, 'plugin_v4_inspection_field_text_invalid', `${fieldLabel} label`);
      if (field.value === undefined) fail('plugin_v4_inspection_field_value_missing', `${fieldLabel} value is missing`);
      if (field.unit !== null) text(field.unit, 'plugin_v4_inspection_field_unit_invalid', `${fieldLabel} unit`);
      validateProvenance(field.provenance, `${fieldLabel} provenance`);
    });
    unique(value.fields.map((field) => field.id), 'plugin_v4_inspection_field_duplicate', `${label} field IDs`);
    return value;
  }

  function validateProvenanceRecord(value, label = 'Provenance record') {
    object(value, 'plugin_v4_provenance_record_invalid', `${label} expected an object`);
    allowedKeys(
      value,
      ['schema', 'id', 'kind', 'datasetId', 'rowId', 'contentHash', 'parentIds', 'metadata'],
      ['schema', 'id', 'kind', 'datasetId', 'contentHash', 'parentIds', 'metadata'],
      label
    );
    equal(value.schema, 'simulatte.provenanceRecord.v4', 'plugin_v4_provenance_record_schema_invalid', `${label} schema`);
    ['id', 'datasetId'].forEach((key) => text(value[key], 'plugin_v4_provenance_record_text_invalid', `${label} ${key}`));
    if (!['dataset', 'row', 'transformation', 'model'].includes(value.kind)) fail('plugin_v4_provenance_record_kind_invalid', `${label} kind is invalid`);
    if (!HASH_PATTERN.test(value.contentHash)) fail('plugin_v4_provenance_record_hash_invalid', `${label} contentHash is invalid`);
    if (value.rowId !== undefined) text(value.rowId, 'plugin_v4_provenance_record_row_invalid', `${label} rowId`);
    array(value.parentIds, 'plugin_v4_provenance_record_parents_invalid', `${label} parentIds`);
    value.parentIds.forEach((id) => text(id, 'plugin_v4_provenance_record_parent_invalid', `${label} parent ID`));
    unique(value.parentIds, 'plugin_v4_provenance_record_parent_duplicate', `${label} parent IDs`);
    object(value.metadata, 'plugin_v4_provenance_record_metadata_invalid', `${label} metadata expected an object`);
    return value;
  }

  function validateContribution(value, label = 'Plugin contribution') {
    object(value, 'plugin_v4_contribution_invalid', `${label} expected an object`);
    exactKeys(
      value,
      ['schema', 'pluginId', 'presentation', 'events', 'controls', 'state', 'inspections', 'provenanceRecords'],
      label
    );
    equal(value.schema, 'simulatte.pluginContribution.v4', 'plugin_v4_contribution_schema_invalid', `${label} schema`);
    text(value.pluginId, 'plugin_v4_contribution_plugin_invalid', `${label} pluginId`);
    validatePresentation(value.presentation, `${label} presentation`);
    if (value.presentation.pluginId !== value.pluginId) fail('plugin_v4_contribution_presentation_plugin_mismatch', `${label} presentation plugin does not match`);
    array(value.events, 'plugin_v4_contribution_events_invalid', `${label} events`);
    value.events.forEach((row, index) => {
      validateDomainEvent(row, `${label} events[${index}]`);
      if (row.pluginId !== value.pluginId) fail('plugin_v4_contribution_event_plugin_mismatch', `${label} event plugin does not match`);
    });
    validateControls(value.controls, `${label} controls`);
    if (value.state !== null) {
      validateProgressiveState(value.state, `${label} state`);
      if (value.state.pluginId !== value.pluginId) fail('plugin_v4_contribution_state_plugin_mismatch', `${label} state plugin does not match`);
    }
    array(value.inspections, 'plugin_v4_contribution_inspections_invalid', `${label} inspections`);
    value.inspections.forEach((row, index) => validateInspection(row, `${label} inspections[${index}]`));
    array(value.provenanceRecords, 'plugin_v4_contribution_records_invalid', `${label} provenanceRecords`);
    value.provenanceRecords.forEach((row, index) => validateProvenanceRecord(row, `${label} provenanceRecords[${index}]`));
    unique(value.provenanceRecords.map((row) => row.id), 'plugin_v4_contribution_record_duplicate', `${label} provenance record IDs`);
    validateContributionEvidence(value, label);
    return value;
  }

  function validateContributionEvidence(value, label) {
    const recordIds = new Set(value.provenanceRecords.map((row) => row.id));
    const provenances = [
      ...value.presentation.layers.map((row) => row.provenance),
      ...value.events.map((row) => row.provenance),
      ...(value.state ? [value.state.provenance] : []),
      ...value.controls.controls.map((row) => row.provenance),
      ...value.inspections.flatMap((row) => row.fields.map((field) => field.provenance)),
    ];
    const missing = provenances
      .flatMap((row) => row.evidenceRefs.map((reference) => reference.id))
      .filter((id) => !recordIds.has(id));
    if (missing.length) fail('plugin_v4_contribution_evidence_missing', `${label} references undeclared provenance records`, { missing: [...new Set(missing)] });
    value.provenanceRecords.forEach((row) => {
      const missingParents = row.parentIds.filter((id) => !recordIds.has(id));
      if (missingParents.length) fail('plugin_v4_contribution_parent_missing', `${label} provenance record ${row.id} has missing parents`, { missingParents });
    });
  }

  function createProvenance({ origin, temporalStatus, uncertainty = null, evidenceRefs = [] }) {
    const value = {
      schema: 'simulatte.provenance.v4',
      axes: { origin, temporalStatus, uncertainty },
      evidenceRefs,
    };
    validateProvenance(value);
    return deepFreeze(structuredClone(value));
  }

  function allowedKeys(value, allowed, required, label) {
    object(value, 'plugin_v4_object_invalid', `${label} expected an object`);
    const unexpected = Object.keys(value).filter((key) => !allowed.includes(key));
    const missing = required.filter((key) => !Object.hasOwn(value, key));
    if (unexpected.length || missing.length) fail('plugin_v4_keys_invalid', `${label} has missing or unexpected keys`, { unexpected, missing });
  }

  function exactKeys(value, keys, label) {
    allowedKeys(value, keys, keys, label);
  }

  function object(value, code, message) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code, message);
  }

  function array(value, code, message) {
    if (!Array.isArray(value)) fail(code, `${message} expected an array`);
  }

  function unique(values, code, label) {
    if (new Set(values).size !== values.length) fail(code, `${label} must be unique`, { values });
  }

  function text(value, code, label) {
    if (typeof value !== 'string' || !value) fail(code, `${label} expected non-empty text`, { value });
  }

  function enumValue(value, choices, code, label) {
    if (!choices.includes(value)) fail(code, `${label} expected ${choices.join(', ')}`, { value });
  }

  function equal(actual, expected, code, label) {
    if (actual !== expected) fail(code, `${label} expected ${expected}`, { actual });
  }

  function finite(value, minimum, maximum, code, label) {
    if (!Number.isFinite(value) || value < minimum || value > maximum) fail(code, `${label} expected ${minimum}..${maximum}`, { value });
  }

  function integer(value, minimum, maximum, code, label) {
    if (!Number.isInteger(value) || value < minimum || value > maximum) fail(code, `${label} expected integer ${minimum}..${maximum}`, { value });
  }

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
  }

  function fail(code, message, evidence = null) {
    const error = new Error(`${code}: ${message}`);
    error.name = 'SimulattePluginV4ContractError';
    error.code = code;
    error.evidence = evidence;
    throw error;
  }

  return Object.freeze({
    CONTROL_KINDS,
    GEOMETRY_KINDS,
    LAYER_KINDS,
    ORIGINS,
    SEMANTIC_ROLES,
    TEMPORAL_STATUSES,
    UNCERTAINTY_KINDS,
    VIEW_MODES,
    createProvenance,
    validateContribution,
    validateControls,
    validateDomainEvent,
    validateEvidenceRef,
    validateInspection,
    validatePresentation,
    validateProgressiveState,
    validateProvenance,
    validateProvenanceRecord,
    validateSemanticLayer,
    validateTruthAxes,
    validateViewIntent,
  });
});
