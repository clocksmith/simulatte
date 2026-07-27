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
  const CORRIDOR_GUIDES = Object.freeze({
    'corridor:cnsha-sgsin': [[125, 29], [123, 21], [116, 12], [107, 5]],
    'corridor:sgsin-lkcmb': [[98, 4], [90, 5], [83, 6]],
    'corridor:lkcmb-aejea': [[72, 10], [61, 16], [57, 23]],
    'corridor:aejea-grpir': [[56, 24], [48, 17], [42, 13], [35, 17], [32.5, 29.8], [29, 34]],
    'corridor:sgsin-nlrtm': [[95, 5], [80, 9], [60, 15], [43, 13], [35, 18], [32.5, 29.8], [20, 35], [5, 38], [-5, 44], [0, 50]],
    'corridor:sgsin-grpir': [[95, 5], [80, 9], [60, 15], [43, 13], [35, 18], [32.5, 29.8], [29, 34]],
    'corridor:grpir-esvlc': [[18, 36], [10, 37], [3, 38]],
    'corridor:esvlc-nlrtm': [[-2, 39], [-6, 44], [-3, 49]],
    'corridor:nlrtm-beanr': [[3.4, 51.7]],
    'corridor:nlrtm-deham': [[3.5, 52.5], [6.5, 54.2]],
    'corridor:nlrtm-usnyc': [[-5, 50], [-20, 47], [-40, 44], [-60, 41]],
    'corridor:usnyc-ussav': [[-73, 38], [-75, 34]],
    'corridor:cnsha-uslax': [[135, 28], [155, 31], [179, 33], [-179, 33], [-155, 34], [-130, 34]],
    'corridor:cnngb-uslgb': [[135, 27], [155, 30], [179, 32], [-179, 32], [-155, 33], [-130, 33]],
    'corridor:krpus-uslax': [[145, 37], [165, 36], [179, 35], [-179, 35], [-150, 35], [-125, 34]],
    'corridor:jptyo-uslax': [[150, 36], [170, 36], [179, 35], [-179, 35], [-150, 35], [-125, 34]],
    'corridor:cnsha-krpus': [[125, 32], [128, 34]],
    'corridor:cnsha-cnngb': [[122.2, 30.6]],
    'corridor:cnszn-hkhkg': [[114.1, 22.45]],
    'corridor:hkhkg-sgsin': [[113, 18], [110, 12], [106, 5]],
    'corridor:twkhh-cnsha': [[121.5, 25], [123, 28]],
    'corridor:phmnl-hkhkg': [[117, 16], [114.5, 20]],
    'corridor:mytpp-sgsin': [[102.5, 1.1]],
    'corridor:cntao-krpus': [[124, 35], [127, 34]],
    'corridor:uslgb-usnyc': [[-117, 25], [-105, 14], [-90, 10], [-79.7, 9.1], [-77, 15], [-75, 28]],
    'corridor:ussav-uslax': [[-77, 28], [-79.7, 9.1], [-90, 10], [-105, 18], [-116, 28]],
    'corridor:brssz-uslgb': [[-40, -18], [-45, 0], [-65, 10], [-79.7, 9.1], [-95, 13], [-110, 25]],
    'corridor:brssz-usnyc': [[-40, -16], [-38, 0], [-52, 18], [-67, 33]],
    'corridor:zadur-sgsin': [[35, -34], [50, -30], [70, -18], [90, -6], [101, 0]],
    'corridor:zadur-nlrtm': [[20, -36], [5, -35], [-10, -20], [-15, 0], [-10, 22], [-6, 40], [0, 50]],
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
    const legs = selected.edges.map((row, index) => Object.freeze({
      id: row.id,
      fromPortId: selected.portIds[index],
      toPortId: selected.portIds[index + 1],
      canalId: row.canalId,
      distanceKm: row.distanceKm,
      distanceNm: row.distanceKm / 1.852,
      sailingHours: row.transitHours,
      routeSelectionFuelTons: row.fuelTons,
      routeSelectionCo2Tons: row.co2Tons,
      effectiveSpeedKnots: row.effectiveSpeedKnots,
      coordinates: corridorCoordinates(row, waypoints[index], waypoints[index + 1]),
      sourceRowIds: Object.freeze([row.id]),
    }));
    const graphDistanceKm = selected.edges.reduce((sum, row) => sum + row.distanceKm, 0);
    const distanceNm = Number(spec.distanceCalibrationNm || graphDistanceKm / 1.852);
    const distanceKm = distanceNm * 1.852;
    const distanceScale = distanceKm / graphDistanceKm;
    const sailingDays = selected.edges.reduce((sum, row) => sum + row.transitHours, 0) * distanceScale / 24;
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
      renderCoordinates: Object.freeze(flattenLegCoordinates(legs)),
      legs: Object.freeze(legs.map((row) => Object.freeze({
        ...row,
        distanceKm: row.distanceKm * distanceScale,
        distanceNm: row.distanceNm * distanceScale,
        sailingHours: row.sailingHours * distanceScale,
        routeSelectionFuelTons: row.routeSelectionFuelTons * distanceScale,
        routeSelectionCo2Tons: row.routeSelectionCo2Tons * distanceScale,
      }))),
      objectiveValues: Object.freeze({
        totalTransitDays: sailingDays,
        fuelTons: selected.edges.reduce((sum, row) => sum + row.fuelTons, 0) * distanceScale,
        co2Tons: selected.edges.reduce((sum, row) => sum + row.co2Tons, 0) * distanceScale,
      }),
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
      claimBoundary: 'Modeled route over a sparse, bidirectional aggregate corridor graph with authored ocean-following display geometry. It is not hydrographic navigation, a carrier schedule, or a live vessel route.',
    });
  }

  function corridorCoordinates(edge, from, to) {
    const guides = CORRIDOR_GUIDES[edge.id] || [];
    const forward = edge.from === edge.fromPortId;
    const ordered = forward ? guides : [...guides].reverse();
    return Object.freeze([
      Object.freeze([...from]),
      ...ordered.map((point) => Object.freeze([point[0], point[1], 0])),
      Object.freeze([...to]),
    ]);
  }

  function flattenLegCoordinates(legs) {
    return legs.flatMap((leg, index) => index === 0 ? leg.coordinates : leg.coordinates.slice(1));
  }

  function graphEdges(rows, speedKnots, disruption, routeObjective) {
    const blockedCanalIds = new Set([
      ...(disruption?.blockedCanalIds || []),
      ...(disruption?.blockedCanalId ? [disruption.blockedCanalId] : []),
    ]);
    const objective = normalizeObjective(routeObjective);
    return rows.flatMap((row) => {
      if (!(row.distanceKm > 0) || !row.fromPortId || !row.toPortId || blockedCanalIds.has(row.canalId)) return [];
      const effectiveSpeedKnots = Math.min(speedKnots, Number(row.serviceSpeedKn || speedKnots));
      const transitHours = row.distanceKm / 1.852 / effectiveSpeedKnots;
      const referenceSpeed = Math.max(1, Number(routeObjective?.vesselServiceSpeedKnots || speedKnots));
      const engineLoad = Math.min(1, Math.max(0.08, (effectiveSpeedKnots / referenceSpeed) ** 3));
      const mainEnginePowerKw = Math.max(1, Number(routeObjective?.mainEnginePowerKw || 40000));
      const sfocGPerKwh = Math.max(1, Number(routeObjective?.sfocGPerKwh || 175));
      const fuelTons = mainEnginePowerKw * engineLoad * transitHours * sfocGPerKwh / 1e6;
      const co2Tons = fuelTons * Math.max(0, Number(routeObjective?.co2TonsPerFuelTon || 3.114));
      const weight = transitHours / 24 * objective.totalTransitDays
        + fuelTons * objective.fuelTons
        + co2Tons * objective.co2Tons;
      const base = {
        ...row,
        weight,
        transitHours,
        fuelTons,
        co2Tons,
        effectiveSpeedKnots,
      };
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

  return Object.freeze({ CORRIDOR_GUIDES, SCENARIOS, planRoute, scenarioFor, speedForPolicy });
});
