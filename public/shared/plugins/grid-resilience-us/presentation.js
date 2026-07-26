(function attachGridPresentation(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteGridPresentation = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createGridPresentation() {
  function createSemanticPresentation({ result, snapshot }) {
    const regionById = new Map(snapshot.regions.map((row) => [row.id, row]));
    const regions = snapshot.regions.map((region) => ({
      id: `grid-region:${region.id}`,
      kind: 'aggregate_grid_region',
      geometry: { type: 'point', coordinates: [...region.coordinates, 0] },
      quantities: {
        grossDemandMw: region.grossDemandMw,
        servedMw: region.servedMw,
        unservedMw: region.unservedMw,
        reserveMarginRatio: region.reserveMarginRatio,
        storageStateOfChargeMwh: region.storageStateOfChargeMwh || 0,
        emissionsTons: region.emissionsTons,
      },
      evidenceRefs: [region.observedDemandRowId, ...(region.observedWeatherRowIds || [])].filter(Boolean),
      truth: truth('derived', 'forecast'),
    }));
    const interfaces = snapshot.interfaces.map((edge) => ({
      id: `grid-interface:${edge.id}`,
      kind: 'aggregate_transfer_interface',
      geometry: {
        type: 'line_string',
        coordinates: [
          regionById.get(edge.fromRegionId).coordinates,
          regionById.get(edge.toRegionId).coordinates,
        ],
      },
      quantities: {
        transferMw: edge.transferMw,
        forwardLimitMw: edge.forwardLimitMw,
        reverseLimitMw: edge.reverseLimitMw,
        utilizationRatio: edge.utilizationRatio,
        available: edge.available,
      },
      evidenceRefs: [`scenario-interface:${edge.id}`],
      truth: truth('simulated', 'forecast'),
    }));
    return deepFreeze({
      schema: 'simulatte.semanticPresentation.v4',
      coordinateSystem: 'wgs84',
      epoch: result.configurationIdentity.startInstant || null,
      currentEventId: snapshot.eventIds.at(-1) || null,
      layers: [
        layer('grid-regions', 'regional_balance', regions, 'region_sum', 'unservedMw'),
        layer('grid-interfaces', 'aggregate_transfer', interfaces, 'corridor_bundle', 'utilizationRatio'),
      ],
      viewIntents: [{
        schema: 'simulatte.viewIntent.v4',
        mode: snapshot.status === 'settled' ? 'compare' : 'overview',
        targetIds: [
          ...regions.filter((row) => row.quantities.unservedMw > 0).map((row) => row.id),
          ...interfaces.filter((row) => !row.quantities.available || row.quantities.utilizationRatio > 0.85).map((row) => row.id),
        ],
        transitionReason: snapshot.eventIds.at(-1) ? `simulation_event:${snapshot.eventIds.at(-1)}` : 'scenario_ready',
        priority: 60,
        expiresAtEventId: null,
        mayInterruptManualOverride: false,
      }],
    });
  }

  function adaptToV3(semantic) {
    const objects = semantic.layers.flatMap((row) => row.objects);
    return deepFreeze({
      schema: 'simulatte.pluginPresentation.v3',
      coordinateSystem: 'wgs84',
      epoch: semantic.epoch,
      markers: objects.filter((row) => row.kind === 'aggregate_grid_region').map((row) => ({
        id: row.id,
        position: row.geometry.coordinates,
        label: row.quantities.unservedMw > 0
          ? `${row.id.replace('grid-region:', '')}: ${Math.round(row.quantities.unservedMw).toLocaleString()} modeled MW unserved`
          : `${row.id.replace('grid-region:', '')}: ${(row.quantities.reserveMarginRatio * 100).toFixed(1)}% reserve margin`,
        tone: row.quantities.unservedMw > 0 ? 'amber' : 'cyan',
        radius: row.quantities.unservedMw > 0 ? 1.15 : 0.8,
      })),
      paths: objects.filter((row) => row.kind === 'aggregate_transfer_interface').map((row) => ({
        id: row.id,
        coordinates: row.geometry.coordinates,
        label: row.quantities.available
          ? `${Math.round(Math.abs(row.quantities.transferMw)).toLocaleString()} modeled MW`
          : 'Scenario interface unavailable',
        tone: row.quantities.available ? row.quantities.utilizationRatio > 0.85 ? 'amber' : 'cyan' : 'red',
        width: 1.15,
      })),
      actors: [],
      areas: [],
      cameraTargets: [{ id: 'grid-us', center: [-98, 38, 0], label: 'Aggregate regional grid', distance: 55 }],
      viewIntents: semantic.viewIntents,
    });
  }

  function layer(id, semanticType, objects, method, quantity) {
    return {
      id,
      semanticType,
      objects,
      aggregationHint: { method, quantity },
      temporalVisibility: { kind: 'always' },
      pickBehavior: { kind: 'inspect_evidence' },
    };
  }

  function truth(origin, temporalStatus) {
    return {
      origin,
      temporalStatus,
      uncertainty: { kind: 'distribution', value: { interpretation: 'Declared regional scenario.' } },
    };
  }

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
  }

  return Object.freeze({ adaptToV3, createSemanticPresentation });
});
