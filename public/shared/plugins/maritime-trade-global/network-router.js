(function attachMaritimeNetworkRouter(root, factory) {
  const api = factory();
  root.MaritimeNetworkRouter = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createMaritimeNetworkRouter() {
  const SCENARIOS = Object.freeze({
    'asia-europe-mainline': Object.freeze({
      originPortId: 'port:cnsha',
      destinationPortId: 'port:nlrtm',
      label: 'Shanghai to Rotterdam',
    }),
    'transpacific-eastbound': Object.freeze({
      originPortId: 'port:cnsha',
      destinationPortId: 'port:uslax',
      label: 'Shanghai to Los Angeles',
    }),
    'suez-closure-cape-reroute': Object.freeze({
      originPortId: 'port:cnsha',
      destinationPortId: 'port:nlrtm',
      label: 'Shanghai to Rotterdam via Cape reroute',
    }),
    'north-atlantic-cyclone': Object.freeze({
      originPortId: 'port:nlrtm',
      destinationPortId: 'port:usnyc',
      label: 'Rotterdam to New York/New Jersey',
    }),
    'north-atlantic-baseline': Object.freeze({
      originPortId: 'port:nlrtm',
      destinationPortId: 'port:usnyc',
      label: 'Rotterdam to New York/New Jersey baseline',
    }),
    'transpacific-panama-restriction': Object.freeze({
      originPortId: 'port:uslgb',
      destinationPortId: 'port:usnyc',
      label: 'Long Beach to New York/New Jersey via Panama',
    }),
    'panama-baseline': Object.freeze({
      originPortId: 'port:uslgb',
      destinationPortId: 'port:usnyc',
      label: 'Long Beach to New York/New Jersey via Panama baseline',
    }),
  });

  function planRoute({
    ports,
    corridors,
    scenarioCatalog,
    vessel,
    scenarioId,
    speedPolicy = 'service',
    disruption = null,
    routeObjective = {},
  }) {
    const spec = scenarioFor(scenarioId, scenarioCatalog);
    const portRows = ports?.ports || [];
    const portById = new Map(portRows.map((row) => [row.id, row]));
    if (!portById.has(spec.originPortId) || !portById.has(spec.destinationPortId)) {
      throw routeError('maritime_route_port_missing', `Scenario ${scenarioId} references an unavailable port`);
    }
    const speedKnots = speedForPolicy(vessel, speedPolicy) * Number(disruption?.speedMultiplier ?? 1);
    if (!(speedKnots > 0)) throw routeError('maritime_route_speed_invalid', `Scenario ${scenarioId} produced a non-positive speed`);
    const edges = graphEdges(corridors?.corridors || [], speedKnots, {
      ...disruption,
      blockedCanalIds: [...new Set([...(disruption?.blockedCanalIds || []), ...(spec.blockedCanalIds || [])])],
    }, routeObjective);
    const selected = shortestPath(edges, spec.originPortId, spec.destinationPortId);
    if (!selected) {
      throw routeError('maritime_route_unreachable', `No governed corridor connects ${spec.originPortId} to ${spec.destinationPortId}`);
    }
    const waypoints = selected.portIds.map((portId) => {
      const point = portById.get(portId)?.location;
      if (!point || !Number.isFinite(point.longitude) || !Number.isFinite(point.latitude)) {
        throw routeError('maritime_route_coordinate_missing', `Port ${portId} has no governed coordinate`);
      }
      return Object.freeze([point.longitude, point.latitude, 0]);
    });
    const graphDistanceKm = selected.edges.reduce((sum, row) => sum + row.distanceKm, 0);
    const distanceNm = Number(spec.distanceCalibrationNm || graphDistanceKm / 1.852);
    const distanceKm = distanceNm * 1.852;
    const distanceScale = distanceKm / graphDistanceKm;
    const sailingDays = distanceNm / (speedKnots * 24);
    const canalIds = [...new Set(selected.edges.map((row) => row.canalId).filter(Boolean))];
    if ((spec.requiredCanalIds || []).some((canalId) => !canalIds.includes(canalId))) {
      throw routeError('maritime_route_required_canal_missing', `Scenario ${scenarioId} did not traverse its required canal`);
    }
    return Object.freeze({
      schema: 'simulatte.maritimeRoutePlan.v2',
      id: `${scenarioId}:${selected.edges.map((row) => row.id).join('|')}:${speedPolicy}`,
      scenarioId,
      name: spec.label,
      originPort: spec.originPortId,
      destinationPort: spec.destinationPortId,
      portIds: Object.freeze(selected.portIds),
      corridorIds: Object.freeze(selected.edges.map((row) => row.id)),
      canalIds: Object.freeze(canalIds),
      distanceKm,
      distanceNm,
      speedKnots,
      speedPolicy,
      sailingDays,
      waypoints: Object.freeze(waypoints),
      legs: Object.freeze(selected.edges.map((row, index) => Object.freeze({
        id: row.id,
        fromPortId: selected.portIds[index],
        toPortId: selected.portIds[index + 1],
        canalId: row.canalId,
        distanceKm: row.distanceKm * distanceScale,
        distanceNm: row.distanceKm * distanceScale / 1.852,
        sailingHours: row.distanceKm * distanceScale / 1.852 / speedKnots,
        sourceRowIds: Object.freeze([row.id]),
      }))),
      disruptionId: disruption?.id || 'baseline',
      algorithm: 'bidirectional_governed_corridor_dijkstra_v2',
      objective: Object.freeze(normalizeObjective(routeObjective)),
      truth: truth('modeled', 'forecast', {
        kind: 'interval',
        value: {
          relativeMinimum: -0.1,
          relativeMaximum: 0.1,
          basis: 'Endpoint-to-endpoint corridor geometry omits navigational track detail.',
        },
      }),
      evidenceRefs: Object.freeze([
        'dataset:global-port-registry-wpi-v1',
        'dataset:global-maritime-corridors-v1',
        `row:maritime.voyage.scenarios.v1:${spec.id}`,
        ...selected.edges.map((row) => `row:global-maritime-corridors-v1:${row.id}`),
        'model:governed-corridor-dijkstra-v2',
      ]),
      claimBoundary: 'Modeled route over a sparse, bidirectional aggregate corridor graph. It is not hydrographic navigation, a carrier schedule, or a live vessel route.',
    });
  }

  function graphEdges(rows, speedKnots, disruption, routeObjective) {
    const blockedCanalIds = new Set([
      ...(disruption?.blockedCanalIds || []),
      ...(disruption?.blockedCanalId ? [disruption.blockedCanalId] : []),
    ]);
    const objective = normalizeObjective(routeObjective);
    return rows.flatMap((row) => {
      if (!(row.distanceKm > 0) || !row.fromPortId || !row.toPortId || blockedCanalIds.has(row.canalId)) return [];
      const sailingDays = row.distanceKm / 1.852 / speedKnots / 24;
      const normalizedDistance = row.distanceKm / 1000;
      const weight = sailingDays * objective.totalTransitDays
        + normalizedDistance * objective.fuelTons
        + normalizedDistance * objective.co2Tons;
      const base = { ...row, weight };
      return [
        Object.freeze({ ...base, from: row.fromPortId, to: row.toPortId }),
        Object.freeze({ ...base, from: row.toPortId, to: row.fromPortId }),
      ];
    });
  }

  function shortestPath(edges, origin, destination) {
    const adjacency = new Map();
    edges.forEach((edge) => {
      if (!adjacency.has(edge.from)) adjacency.set(edge.from, []);
      adjacency.get(edge.from).push(edge);
    });
    adjacency.forEach((rows) => rows.sort((left, right) => left.id.localeCompare(right.id) || left.to.localeCompare(right.to)));
    const distance = new Map([[origin, 0]]);
    const previous = new Map();
    const pending = new Set([origin, ...edges.flatMap((row) => [row.from, row.to])]);
    while (pending.size) {
      const current = [...pending].sort((left, right) => (distance.get(left) ?? Infinity) - (distance.get(right) ?? Infinity) || left.localeCompare(right))[0];
      pending.delete(current);
      if (!Number.isFinite(distance.get(current))) break;
      if (current === destination) break;
      for (const edge of adjacency.get(current) || []) {
        if (!pending.has(edge.to)) continue;
        const candidate = distance.get(current) + edge.weight;
        if (candidate < (distance.get(edge.to) ?? Infinity)) {
          distance.set(edge.to, candidate);
          previous.set(edge.to, edge);
        }
      }
    }
    if (!previous.has(destination) && origin !== destination) return null;
    const pathEdges = [];
    const portIds = [destination];
    for (let cursor = destination; cursor !== origin;) {
      const edge = previous.get(cursor);
      if (!edge) return null;
      pathEdges.unshift(edge);
      cursor = edge.from;
      portIds.unshift(cursor);
    }
    return { edges: pathEdges, portIds };
  }

  function scenarioFor(scenarioId, catalog = null) {
    const normalizedId = scenarioId === 'north-atlantic-baseline'
      ? 'north-atlantic-cyclone'
      : scenarioId === 'panama-baseline'
        ? 'transpacific-panama-restriction'
        : scenarioId;
    const governed = (catalog?.scenarios || []).find((row) => row.id === normalizedId);
    return governed || SCENARIOS[scenarioId] || SCENARIOS[normalizedId] || SCENARIOS['asia-europe-mainline'];
  }

  function speedForPolicy(vessel, policy) {
    if (!vessel) throw routeError('maritime_route_vessel_missing', 'A modeled vessel archetype is required');
    if (policy === 'slow') return Math.max(8, Number(vessel.serviceSpeedKn) * 0.82);
    if (policy === 'fast') return Math.min(Number(vessel.maxSpeedKn), Number(vessel.serviceSpeedKn) * 1.12);
    return Number(vessel.serviceSpeedKn);
  }

  function normalizeObjective(value) {
    const objective = {
      fuelTons: Number(value?.fuelTons ?? 1),
      co2Tons: Number(value?.co2Tons ?? 0.8),
      totalTransitDays: Number(value?.totalTransitDays ?? 0.5),
    };
    if (Object.values(objective).some((row) => !Number.isFinite(row) || row < 0)) {
      throw routeError('maritime_route_objective_invalid', 'Route objective weights must be finite and non-negative');
    }
    return objective;
  }

  function truth(origin, temporalStatus, uncertainty) {
    return Object.freeze({ origin, temporalStatus, uncertainty: Object.freeze(uncertainty) });
  }

  function routeError(code, message) {
    const error = new Error(`${code}: ${message}`);
    error.name = 'MaritimeRouteError';
    error.code = code;
    return error;
  }

  return Object.freeze({ SCENARIOS, planRoute, scenarioFor, speedForPolicy });
});
