(function attachSubseaPresentation(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteSubseaPresentation = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createSubseaPresentation() {
  function createSemanticPresentation({ datasets, result, snapshot }) {
    const pointById = new Map(datasets.landings.points.map((row) => [row.id, row]));
    const edgeObjects = snapshot.edges.map((edge) => ({
      id: `corridor:${edge.id}`,
      kind: 'subsea_capacity_corridor',
      geometry: { type: 'line_string', coordinates: edge.coordinates },
      quantities: {
        capacityGbps: edge.capacityGbps,
        availableGbps: edge.availableGbps,
        loadGbps: edge.loadGbps,
        utilizationRatio: edge.utilizationRatio,
        failureState: edge.failureState,
      },
      evidenceRefs: [...edge.evidenceRefs, ...edge.capacityEvidenceRefs],
      truth: edge.truth,
    }));
    const landingObjects = datasets.landings.points.map((point) => ({
      id: `landing:${point.id}`,
      kind: 'regional_landing_anchor',
      geometry: { type: 'point', coordinates: [...point.coordinates, 0] },
      quantities: {
        requestedGbps: snapshot.demands.filter((row) => row.destinationLandingId === point.id)
          .reduce((sum, row) => sum + row.requestedGbps, 0),
        deliveredGbps: snapshot.demands.filter((row) => row.destinationLandingId === point.id)
          .reduce((sum, row) => sum + row.deliveredGbps, 0),
        coordinateClassification: point.coordinateClassification,
      },
      evidenceRefs: point.evidenceRefs,
      truth: point.truth,
    }));
    const droppedObjects = snapshot.demands.filter((row) => row.droppedGbps > 0).map((demand) => ({
      id: `dropped:${demand.id}`,
      kind: 'modeled_dropped_demand',
      geometry: {
        type: 'point',
        coordinates: [...pointById.get(demand.destinationLandingId).coordinates, 0],
      },
      quantities: {
        requestedGbps: demand.requestedGbps,
        deliveredGbps: demand.deliveredGbps,
        droppedGbps: demand.droppedGbps,
        categoryId: demand.categoryId,
      },
      evidenceRefs: [`scenario-demand:${demand.id}`],
      truth: demand.truth,
    }));
    return deepFreeze({
      schema: 'simulatte.semanticPresentation.v4',
      coordinateSystem: 'wgs84',
      epoch: result.configurationIdentity.startInstant || null,
      currentEventId: snapshot.eventIds.at(-1) || null,
      layers: [
        layer('subsea-landings', 'network_nodes', landingObjects, 'cluster', 'deliveredGbps'),
        layer('subsea-corridors', 'capacity_flow', edgeObjects, 'corridor_bundle', 'utilizationRatio'),
        layer('subsea-service-loss', 'dropped_demand', droppedObjects, 'region_sum', 'droppedGbps'),
      ],
      viewIntents: [{
        schema: 'simulatte.viewIntent.v4',
        mode: snapshot.status === 'settled' ? 'compare' : 'overview',
        targetIds: edgeObjects.filter((row) => row.quantities.failureState === 'failed'
          || row.quantities.utilizationRatio > 0.8).map((row) => row.id),
        transitionReason: snapshot.eventIds.at(-1) ? `simulation_event:${snapshot.eventIds.at(-1)}` : 'scenario_ready',
        priority: 55,
        expiresAtEventId: null,
        mayInterruptManualOverride: false,
      }],
    });
  }

  function adaptToV3(semantic) {
    const objects = semantic.layers.flatMap((row) => row.objects);
    const points = objects.filter((row) => row.geometry.type === 'point');
    const corridors = objects.filter((row) => row.kind === 'subsea_capacity_corridor');
    return deepFreeze({
      schema: 'simulatte.pluginPresentation.v3',
      coordinateSystem: 'wgs84',
      epoch: semantic.epoch,
      markers: points.map((row) => ({
        id: row.id,
        position: row.geometry.coordinates,
        label: labelFor(row),
        tone: row.kind === 'modeled_dropped_demand' ? 'amber' : 'cyan',
        radius: row.kind === 'modeled_dropped_demand' ? 1.1 : 0.7,
      })),
      paths: corridors.map((row) => ({
        id: row.id,
        coordinates: row.geometry.coordinates,
        label: `${Math.round(row.quantities.loadGbps).toLocaleString()} of ${Math.round(row.quantities.availableGbps).toLocaleString()} scenario Gbps`,
        tone: row.quantities.failureState === 'failed'
          ? 'red'
          : row.quantities.utilizationRatio > 0.85 ? 'amber' : 'cyan',
        width: 1.2,
      })),
      actors: [],
      areas: [],
      cameraTargets: [{
        id: 'subsea-atlantic',
        center: [-37, 47, 0],
        label: 'Modeled Atlantic network',
        distance: 150,
      }],
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

  function labelFor(row) {
    if (row.kind === 'modeled_dropped_demand') {
      return `${Math.round(row.quantities.droppedGbps).toLocaleString()} modeled Gbps unserved`;
    }
    return row.id.replace('landing:', '').replaceAll('-', ' ');
  }

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
  }

  return Object.freeze({ adaptToV3, createSemanticPresentation });
});
