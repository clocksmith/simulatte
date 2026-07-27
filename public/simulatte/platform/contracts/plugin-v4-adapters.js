(function attachPluginV4Adapters(root, factory) {
  const contracts = typeof module === 'object' && module.exports
    ? require('./plugin-v4-contracts.js')
    : root.SimulattePluginV4Contracts;
  const api = factory(contracts);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulattePluginV4Adapters = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createPluginV4Adapters(contracts) {
  const DEFAULT_PROVENANCE = contracts.createProvenance({
    origin: 'simulated',
    temporalStatus: 'snapshot',
    uncertainty: null,
    evidenceRefs: [],
  });

  function normalizePresentation(pluginId, value) {
    if (value.schema === 'simulatte.pluginPresentation.v4') {
      contracts.validatePresentation(value);
      return value;
    }
    if (!['simulatte.pluginPresentation.v1', 'simulatte.pluginPresentation.v2', 'simulatte.pluginPresentation.v3'].includes(value.schema)) {
      throw adapterError('plugin_v4_adapter_schema_unsupported', `Plugin ${pluginId} presentation ${value.schema || 'missing'} is unsupported`);
    }
    const coordinateSystem = value.coordinateSystem || (value.geoMarkers || value.geoPaths ? 'wgs84' : 'city-local-m');
    const layers = [];
    (value.markers || []).forEach((row) => layers.push(layerForMarker(row, coordinateSystem)));
    (value.paths || []).forEach((row) => layers.push(layerForPath(row, coordinateSystem)));
    (value.actors || []).forEach((row) => layers.push(layerForActor(row, coordinateSystem)));
    (value.areas || []).forEach((row) => layers.push(layerForArea(row, coordinateSystem)));
    (value.geoMarkers || []).forEach((row) => layers.push(layerForGeoMarker(row)));
    (value.geoPaths || []).forEach((row) => layers.push(layerForGeoPath(row)));
    (value.geoAreas || []).forEach((row) => layers.push(layerForGeoArea(row)));
    (value.choropleths || []).forEach((row) => layers.push(layerForChoropleth(row)));
    const targets = [...(value.cameraTargets || []), ...(value.geoCameraTargets || [])];
    const normalized = {
      schema: 'simulatte.pluginPresentation.v4',
      pluginId,
      coordinateSystem,
      epoch: value.epoch || null,
      layers,
      viewIntents: targets.map((row, index) => ({
        schema: 'simulatte.viewIntent.v4',
        id: `${row.id}:legacy-focus`,
        mode: 'overview',
        targetIds: [row.id],
        reasonEventId: null,
        priority: Math.max(0, 20 - index),
        transition: 'ease',
      })),
    };
    contracts.validatePresentation(normalized);
    return deepFreeze(normalized);
  }

  function normalizeEvent(pluginId, value, index = 0) {
    if (value.schema === 'simulatte.pluginEvent.v4') {
      contracts.validateDomainEvent(value);
      return value;
    }
    const sequence = Number.isInteger(value.sequence) ? value.sequence : index;
    const normalized = {
      schema: 'simulatte.pluginEvent.v4',
      id: value.id || `${pluginId}:legacy-event:${sequence}`,
      pluginId,
      sequence,
      simulationTimeMs: Math.max(0, Number(value.simulationTimeMs ?? value.time ?? sequence)),
      kind: value.kind || `${pluginId}.legacy-event`,
      causationIds: [],
      correlationId: value.correlationId || `${pluginId}:legacy-run`,
      payload: cloneWithout(value, ['schema', 'id', 'pluginId', 'sequence', 'simulationTimeMs', 'time', 'kind', 'correlationId']),
      provenance: DEFAULT_PROVENANCE,
    };
    contracts.validateDomainEvent(normalized);
    return deepFreeze(normalized);
  }

  function normalizeUi(pluginId, views) {
    const rows = Array.isArray(views) ? views : [views];
    const controls = [];
    const comparisons = [];
    rows.filter(Boolean).forEach((view) => {
      (view.fields || []).forEach((field) => controls.push({
        id: `${pluginId}:${field.id}`,
        label: field.label,
        kind: normalizeControlKind(field.type),
        value: field.value,
        options: field.options || null,
        minimum: field.minimum ?? null,
        maximum: field.maximum ?? null,
        step: field.step ?? null,
        provenance: DEFAULT_PROVENANCE,
      }));
      (view.actions || []).filter((action) => /compare|baseline|counterfactual/i.test(action.id)).forEach((action) => comparisons.push({
        id: `${pluginId}:${action.id}`,
        label: action.label,
        baselineScenarioId: 'baseline',
        variantScenarioId: 'active',
        synchronizedClock: true,
      }));
    });
    const normalized = { schema: 'simulatte.pluginControls.v4', controls, comparisons };
    contracts.validateControls(normalized);
    return deepFreeze(normalized);
  }

  function normalizeContribution({ pluginId, presentation, views = [], events = [] }) {
    const normalized = {
      schema: 'simulatte.pluginContribution.v4',
      pluginId,
      presentation: normalizePresentation(pluginId, presentation),
      events: events.map((event, index) => normalizeEvent(pluginId, event, index)),
      controls: normalizeUi(pluginId, views),
      state: null,
      inspections: [],
      provenanceRecords: [],
    };
    contracts.validateContribution(normalized);
    return deepFreeze(normalized);
  }

  function layerForMarker(row, coordinateSystem) {
    const geometry = row.nodeId
      ? geometryRow('node', coordinateSystem, [row.nodeId], [], [])
      : geometryRow('point', coordinateSystem, [], [], [row.position]);
    return semanticLayer(row, 'point', geometry, quantity('magnitude', Number(row.intensity || 1), 'relative', [0, 2]));
  }

  function layerForPath(row, coordinateSystem) {
    const geometry = row.segmentIds
      ? geometryRow('segments', coordinateSystem, [], row.segmentIds, [])
      : row.nodeIds
        ? geometryRow('node-path', coordinateSystem, row.nodeIds, [], [])
        : geometryRow('polyline', coordinateSystem, [], [], row.coordinates);
    return semanticLayer(row, 'path', geometry, quantity('flow', Number(row.intensity || 1), 'relative', [0, 2]));
  }

  function layerForActor(row, coordinateSystem) {
    const geometry = row.segmentIds
      ? geometryRow('segments', coordinateSystem, [], row.segmentIds, [])
      : geometryRow('point', coordinateSystem, [], [], [row.position]);
    return semanticLayer(row, 'actor', geometry, quantity('speed', Number(row.speedMps || 0), 'm/s', null));
  }

  function layerForArea(row, coordinateSystem) {
    const coordinates = row.coordinates || (row.points || []).map((point) => [point.x, point.y, 0]);
    return semanticLayer(row, 'area', geometryRow('polygon', coordinateSystem, [], [], coordinates), quantity('intensity', Number(row.intensity || 1), 'relative', [0, 2]));
  }

  function layerForGeoMarker(row) {
    return semanticLayer(row, 'point', geometryRow('point', 'wgs84', [], [], [[row.longitude, row.latitude, 0]]), quantity('magnitude', Number(row.intensity || 1), 'relative', [0, 2]));
  }

  function layerForGeoPath(row) {
    const coordinates = row.coordinates.map((point) => [point.longitude, point.latitude, 0]);
    return semanticLayer(row, 'path', geometryRow('polyline', 'wgs84', [], [], coordinates), quantity('flow', Number(row.intensity || 1), 'relative', [0, 2]));
  }

  function layerForGeoArea(row) {
    const coordinates = row.ring.map((point) => [point.longitude, point.latitude, 0]);
    return semanticLayer(row, 'area', geometryRow('polygon', 'wgs84', [], [], coordinates), quantity('intensity', Number(row.intensity || 1), 'relative', [0, 2]));
  }

  function layerForChoropleth(row) {
    const coordinates = row.ring.map((point) => [point.longitude, point.latitude, 0]);
    return semanticLayer(row, 'field', geometryRow('polygon', 'wgs84', [], [], coordinates), quantity('choropleth', Number(row.value), 'value', null));
  }

  function semanticLayer(row, kind, geometry, metric) {
    return {
      id: row.id,
      kind,
      label: row.label || row.id,
      geometry,
      quantity: metric,
      role: row.isSelected ? 'primary' : 'context',
      importance: row.isSelected ? 1 : Math.min(1, Math.max(0, Number(row.intensity || 0.5))),
      aggregationKey: kind === 'point' ? `${kind}:${row.tone || 'legacy'}` : null,
      temporal: null,
      provenance: DEFAULT_PROVENANCE,
    };
  }

  function geometryRow(kind, coordinateSystem, nodeIds, segmentIds, coordinates) {
    return { kind, coordinateSystem, nodeIds, segmentIds, coordinates };
  }

  function quantity(kind, value, unit, domain) {
    return { kind, value, unit, domain };
  }

  function normalizeControlKind(kind) {
    if (kind === 'date') return 'time';
    if (kind === 'text') return 'select';
    return kind;
  }

  function cloneWithout(value, keys) {
    return Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)));
  }

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
  }

  function adapterError(code, message) {
    const error = new Error(`${code}: ${message}`);
    error.name = 'SimulattePluginV4AdapterError';
    error.code = code;
    return error;
  }

  return Object.freeze({ normalizeContribution, normalizeEvent, normalizePresentation, normalizeUi });
});
