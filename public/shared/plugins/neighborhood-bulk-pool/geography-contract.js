(function attachNeighborhoodBulkGeography(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteNeighborhoodBulkGeography = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createNeighborhoodBulkGeography() {
  const EARTH_RADIUS_KM = 6371;
  const COORDINATE_EPSILON = 1e-7;

  function validateScenarioGeography(datasets, scenario) {
    const warehouses = requireRows(datasets?.warehouses?.warehouses, 'warehouses');
    const routes = datasets?.routes;
    const neighborhoods = requireRows(routes?.neighborhoods, 'neighborhoods');
    const hubs = requireRows(routes?.hubs, 'hubs');
    const coverageAreas = requireRows(routes?.coverageAreas, 'coverage areas');
    const corridors = requireRows(routes?.corridors, 'corridors');
    const demand = datasets?.demand;
    const participants = requireRows(demand?.participants, 'participants');
    const requests = requireRows(demand?.requests, 'requests');
    const trips = requireRows(demand?.trips, 'trips');
    const scenarios = requireRows(demand?.scenarios, 'scenarios');
    const warehouseById = rowsById(warehouses, 'warehouse');
    const neighborhoodById = rowsById(neighborhoods, 'neighborhood');
    const corridorById = rowsById(corridors, 'corridor');
    const participantById = rowsById(participants, 'participant');
    const requestById = rowsById(requests, 'request');
    const tripById = rowsById(trips, 'trip');
    const scenarioById = rowsById(scenarios, 'scenario');

    warehouses.forEach((row) => validatePoint(row.coordinates, `Warehouse ${row.id}`));
    neighborhoods.forEach((row) => validatePoint(row.coordinates, `Neighborhood ${row.id}`));
    coverageAreas.forEach((row) => validatePolygon(row.coordinates, `Coverage area ${row.id}`));
    hubs.forEach((row) => {
      validatePoint(row.coordinates, `Hub ${row.id}`);
      requireReference(neighborhoodById, row.neighborhoodId, `Hub ${row.id} neighborhood`);
      if (!Number.isFinite(row.walkingRadiusKm) || row.walkingRadiusKm <= 0) {
        throw geographyError('bulk_pool_hub_radius_invalid', `Hub ${row.id} requires a positive walking radius`);
      }
    });

    const corridorReceipts = corridors.map((row) => {
      validatePolyline(row.coordinates, `Corridor ${row.id}`);
      const warehouse = requireReference(warehouseById, row.warehouseId, `Corridor ${row.id} warehouse`);
      if (!sameCoordinate(row.coordinates[0], warehouse.coordinates)) {
        throw geographyError('bulk_pool_corridor_origin_mismatch', `Corridor ${row.id} does not start at warehouse ${warehouse.id}`);
      }
      const terminalNeighborhood = neighborhoods.find((entry) => sameCoordinate(entry.coordinates, row.coordinates.at(-1)));
      if (!terminalNeighborhood) {
        throw geographyError('bulk_pool_corridor_terminal_invalid', `Corridor ${row.id} does not end at a governed neighborhood`);
      }
      const polylineDistanceKm = pathDistanceKm(row.coordinates);
      if (!Number.isFinite(row.baseDistanceKm) || row.baseDistanceKm <= 0
        || row.baseDistanceKm + 0.01 < polylineDistanceKm) {
        throw geographyError('bulk_pool_corridor_distance_invalid', `Corridor ${row.id} modeled distance cannot be shorter than its display guide`, {
          baseDistanceKm: row.baseDistanceKm,
          polylineDistanceKm,
        });
      }
      return Object.freeze({
        id: row.id,
        warehouseId: warehouse.id,
        terminalNeighborhoodId: terminalNeighborhood.id,
        polylineDistanceKm: round(polylineDistanceKm, 3),
        baseDistanceKm: row.baseDistanceKm,
        roadExpansionRatio: round(row.baseDistanceKm / polylineDistanceKm, 3),
      });
    });

    const scopedPoints = [
      ...warehouses.map((row) => ({ id: row.id, coordinates: row.coordinates })),
      ...neighborhoods.map((row) => ({ id: row.id, coordinates: row.coordinates })),
      ...hubs.map((row) => ({ id: row.id, coordinates: row.coordinates })),
      ...corridors.flatMap((row) => row.coordinates.map((coordinates, index) => ({ id: `${row.id}:${index}`, coordinates }))),
    ];
    const uncovered = scopedPoints.filter((row) => !coverageAreas.some((area) => pointInPolygon(row.coordinates, area.coordinates)));
    if (uncovered.length) {
      throw geographyError('bulk_pool_geography_outside_coverage', 'Bulk Pool geography falls outside its declared scenario coverage', {
        ids: uncovered.map((row) => row.id),
      });
    }

    participants.forEach((row) => requireReference(neighborhoodById, row.neighborhoodId, `Participant ${row.id} neighborhood`));
    requests.forEach((row) => requireReference(participantById, row.participantId, `Request ${row.id} participant`));
    trips.forEach((row) => {
      const warehouse = requireReference(warehouseById, row.warehouseId, `Trip ${row.id} warehouse`);
      const corridor = requireReference(corridorById, row.corridorId, `Trip ${row.id} corridor`);
      if (corridor.warehouseId !== warehouse.id) {
        throw geographyError('bulk_pool_trip_corridor_mismatch', `Trip ${row.id} warehouse and corridor disagree`);
      }
    });
    scenarios.forEach((row) => {
      row.requestIds.forEach((id) => requireReference(requestById, id, `Scenario ${row.id} request`));
      row.tripIds.forEach((id) => requireReference(tripById, id, `Scenario ${row.id} trip`));
    });
    datasets.catalog.items.forEach((item) => item.offers.forEach((offer) => (
      requireReference(warehouseById, offer.warehouseId, `Catalog item ${item.id} offer warehouse`)
    )));

    const selectedScenario = requireReference(scenarioById, scenario?.scenarioId, 'Selected scenario');
    scenario.selectedWarehouseIds.forEach((id) => requireReference(warehouseById, id, 'Selected warehouse'));
    selectedScenario.tripIds.forEach((id) => requireReference(tripById, id, `Selected scenario ${selectedScenario.id} trip`));
    const bounds = boundsFor(scopedPoints.map((row) => row.coordinates));
    return deepFreeze({
      schema: 'simulatte.neighborhoodBulkGeographyReceipt.v1',
      coordinateSystem: 'wgs84',
      warehouseDatasetId: datasets.warehouses.id,
      routeDatasetId: routes.id,
      scenarioId: selectedScenario.id,
      bounds,
      counts: {
        warehouses: warehouses.length,
        neighborhoods: neighborhoods.length,
        hubs: hubs.length,
        coverageAreas: coverageAreas.length,
        corridors: corridors.length,
      },
      checks: {
        coordinatesValid: true,
        referencesResolved: true,
        corridorOriginsMatchWarehouses: true,
        corridorTerminalsMatchNeighborhoods: true,
        modeledDistancesBoundDisplayGuides: true,
        scenarioPointsCovered: true,
      },
      corridors: corridorReceipts,
      claimBoundary: 'This receipt proves internal WGS84 scope, references, endpoints, coverage, and modeled-distance sanity. It does not prove surveyed entrances, street routes, live traffic, inventory, or travel calibration.',
    });
  }

  function requireRows(value, label) {
    if (!Array.isArray(value) || !value.length) throw geographyError('bulk_pool_geography_rows_missing', `Bulk Pool requires ${label}`);
    return value;
  }

  function rowsById(rows, label) {
    const result = new Map();
    rows.forEach((row) => {
      if (typeof row?.id !== 'string' || !row.id || result.has(row.id)) {
        throw geographyError('bulk_pool_geography_id_invalid', `Bulk Pool ${label} IDs must be unique non-empty strings`);
      }
      result.set(row.id, row);
    });
    return result;
  }

  function requireReference(rows, id, label) {
    const value = rows.get(id);
    if (!value) throw geographyError('bulk_pool_geography_reference_invalid', `${label} ${id || 'missing'} is not governed`);
    return value;
  }

  function validatePoint(point, label) {
    if (!Array.isArray(point) || point.length < 2
      || !Number.isFinite(point[0]) || point[0] < -180 || point[0] > 180
      || !Number.isFinite(point[1]) || point[1] < -90 || point[1] > 90) {
      throw geographyError('bulk_pool_wgs84_invalid', `${label} requires finite longitude and latitude`);
    }
  }

  function validatePolyline(points, label) {
    if (!Array.isArray(points) || points.length < 2) throw geographyError('bulk_pool_polyline_invalid', `${label} requires at least two points`);
    points.forEach((point) => validatePoint(point, label));
  }

  function validatePolygon(points, label) {
    if (!Array.isArray(points) || points.length < 3) throw geographyError('bulk_pool_polygon_invalid', `${label} requires at least three points`);
    points.forEach((point) => validatePoint(point, label));
  }

  function sameCoordinate(left, right) {
    return Math.abs(left[0] - right[0]) <= COORDINATE_EPSILON
      && Math.abs(left[1] - right[1]) <= COORDINATE_EPSILON;
  }

  function pathDistanceKm(points) {
    let total = 0;
    for (let index = 1; index < points.length; index += 1) total += distanceKm(points[index - 1], points[index]);
    return total;
  }

  function distanceKm(left, right) {
    const radians = (value) => value * Math.PI / 180;
    const latitudeDelta = radians(right[1] - left[1]);
    const longitudeDelta = radians(right[0] - left[0]);
    const leftLatitude = radians(left[1]);
    const rightLatitude = radians(right[1]);
    const h = Math.sin(latitudeDelta / 2) ** 2
      + Math.cos(leftLatitude) * Math.cos(rightLatitude) * Math.sin(longitudeDelta / 2) ** 2;
    return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  function pointInPolygon(point, polygon) {
    let inside = false;
    for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
      const currentPoint = polygon[index];
      const previousPoint = polygon[previous];
      const crosses = (currentPoint[1] > point[1]) !== (previousPoint[1] > point[1])
        && point[0] < ((previousPoint[0] - currentPoint[0]) * (point[1] - currentPoint[1]))
          / (previousPoint[1] - currentPoint[1]) + currentPoint[0];
      if (crosses) inside = !inside;
    }
    return inside;
  }

  function boundsFor(points) {
    return points.reduce((bounds, point) => ({
      minimumLongitude: Math.min(bounds.minimumLongitude, point[0]),
      maximumLongitude: Math.max(bounds.maximumLongitude, point[0]),
      minimumLatitude: Math.min(bounds.minimumLatitude, point[1]),
      maximumLatitude: Math.max(bounds.maximumLatitude, point[1]),
    }), {
      minimumLongitude: Infinity,
      maximumLongitude: -Infinity,
      minimumLatitude: Infinity,
      maximumLatitude: -Infinity,
    });
  }

  function round(value, digits) {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
  }

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
  }

  function geographyError(code, message, evidence = null) {
    const error = new Error(`${code}: ${message}`);
    error.name = 'SimulatteNeighborhoodBulkGeographyError';
    error.code = code;
    error.evidence = evidence;
    return error;
  }

  return Object.freeze({ distanceKm, geographyError, pointInPolygon, validateScenarioGeography });
});
