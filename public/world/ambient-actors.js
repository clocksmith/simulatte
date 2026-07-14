(function attachAutonomyAmbientActors(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteAutonomyAmbientActors = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createAutonomyAmbientActors() {
  const SCHEMA = 'simulatte.autonomyAmbientActorCompilation.v1';
  const ACTIVE_UNTIL_TICK = 1000000000;
  const CONFIG = Object.freeze({
    pedestrian: Object.freeze({ count: 4, speedMps: 1.35, radiusM: 0.55 }),
    bicycle: Object.freeze({ count: 3, speedMps: 4.2, radiusM: 1.05 }),
    scooter: Object.freeze({ count: 2, speedMps: 3.6, radiusM: 0.8 }),
    car: Object.freeze({ count: 4, speedMps: 6.4, radiusM: 1.35 }),
  });

  function compileAmbientActors(world) {
    const anchors = anchorPoints(world);
    const parkPaths = (world.renderGeometry?.parks || []).map((row) => ({
      id: row.id,
      geometry: insetClosedPath(row.outerRing, 8),
      sourceClass: 'park_property_geometry',
    })).filter(validPath);
    const bikePaths = selectPaths((world.renderGeometry?.bikeFacilities || []).map((row) => ({
      id: row.id,
      geometry: row.geometry,
      sourceClass: 'bike_facility_render_geometry',
    })), anchors, CONFIG.bicycle.count + CONFIG.scooter.count, 45);
    const carPaths = selectPaths((world.renderGeometry?.streets || []).filter((row) => !['pedestrian', 'cycleway'].includes(row.highway)).map((row) => ({
      id: row.id,
      geometry: row.geometry,
      sourceClass: 'street_render_geometry',
    })), anchors, CONFIG.car.count, 70);
    const actorGroups = {
      pedestrian: actorsForPaths('pedestrian', repeatPaths(parkPaths, CONFIG.pedestrian.count)),
      bicycle: actorsForPaths('bicycle', bikePaths.slice(0, CONFIG.bicycle.count)),
      scooter: actorsForPaths('scooter', bikePaths.slice(CONFIG.bicycle.count)),
      car: actorsForPaths('car', carPaths),
    };
    const actors = Object.values(actorGroups).flat();
    return {
      schema: SCHEMA,
      actors,
      counts: Object.fromEntries(Object.entries(actorGroups).map(([kind, rows]) => [kind, rows.length])),
      sourceGeometryIds: [...new Set(actors.map((row) => row.provenance.sourceGeometryId))].sort(),
      interactionModel: 'observation_visible_nonblocking_v1',
      animationModel: 'distance_parameterized_loop_or_ping_pong_v1',
      claimBoundary: 'Ambient actors are deterministic simulation assumptions derived from frozen render geometry. They are animated and observation-visible but nonblocking until their paths pass mode-legal topology gates. They are not observed traffic or executable primary embodiments.',
    };
  }

  function actorsForPaths(kind, paths) {
    const config = CONFIG[kind];
    return paths.map((row, index) => {
      const lengthM = polylineLength(row.geometry);
      return {
        id: `ambient-${kind}-${String(index + 1).padStart(2, '0')}-${stableSuffix(row.id)}`,
        type: kind,
        activeFromTick: 0,
        activeUntilTick: ACTIVE_UNTIL_TICK,
        path: row.geometry.map(copyPoint),
        radiusM: config.radiusM,
        cardIds: kind === 'pedestrian' ? ['behavior.pedestrian-yield'] : [],
        motion: {
          kind: isClosed(row.geometry) ? 'loop' : 'ping_pong',
          speedMps: config.speedMps,
          phaseOffsetM: Number((lengthM * index / Math.max(1, paths.length)).toFixed(6)),
        },
        interactionRole: 'visible_ambient',
        provenance: {
          kind: 'simulation_assumption',
          source: 'runtime ambient actor compiler',
          sourceGeometryId: row.id,
          sourceGeometryClass: row.sourceClass,
          isLiveCondition: false,
        },
      };
    });
  }

  function anchorPoints(world) {
    const routeIds = world.scenario?.defaultRoute?.segmentIds || [];
    const segments = new Map(world.segments.map((row) => [row.id, row]));
    const routePoints = routeIds.flatMap((id) => segments.get(id)?.geometry || []);
    const parkPoints = (world.renderGeometry?.parks || []).flatMap((row) => row.outerRing || []);
    return [...parkPoints, ...routePoints];
  }

  function selectPaths(paths, anchors, count, minimumLengthM) {
    return paths.filter((row) => validPath(row) && polylineLength(row.geometry) >= minimumLengthM)
      .map((row) => ({ ...row, distanceToAnchorM: minimumDistance(row.geometry, anchors) }))
      .sort((left, right) => left.distanceToAnchorM - right.distanceToAnchorM || left.id.localeCompare(right.id))
      .slice(0, count)
      .map(({ distanceToAnchorM, ...row }) => row);
  }

  function repeatPaths(paths, count) {
    if (!paths.length) return [];
    return Array.from({ length: count }, (_, index) => paths[index % paths.length]);
  }

  function insetClosedPath(points, insetM) {
    const rows = stripClosingPoint(points);
    if (rows.length < 3) return points.map(copyPoint);
    const center = rows.reduce((sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }), { x: 0, y: 0 });
    center.x /= rows.length;
    center.y /= rows.length;
    const inset = rows.map((point) => {
      const distance = pointDistance(point, center);
      const ratio = distance ? Math.min(insetM, distance * 0.22) / distance : 0;
      return { x: point.x + (center.x - point.x) * ratio, y: point.y + (center.y - point.y) * ratio };
    });
    return [...inset, copyPoint(inset[0])];
  }

  function stripClosingPoint(points) {
    if (points.length > 1 && pointDistance(points[0], points.at(-1)) < 0.001) return points.slice(0, -1);
    return [...points];
  }

  function minimumDistance(points, anchors) {
    if (!anchors.length) return 0;
    let minimum = Infinity;
    points.forEach((point) => anchors.forEach((anchor) => {
      minimum = Math.min(minimum, pointDistance(point, anchor));
    }));
    return minimum;
  }

  function validPath(row) {
    return Array.isArray(row.geometry) && row.geometry.length > 1 && polylineLength(row.geometry) > 0;
  }

  function isClosed(points) {
    return points.length > 2 && pointDistance(points[0], points.at(-1)) < 0.001;
  }

  function polylineLength(points) {
    let length = 0;
    for (let index = 1; index < points.length; index += 1) length += pointDistance(points[index - 1], points[index]);
    return length;
  }

  function pointDistance(left, right) {
    return Math.hypot(left.x - right.x, left.y - right.y);
  }

  function copyPoint(point) {
    return { x: Number(point.x), y: Number(point.y) };
  }

  function stableSuffix(value) {
    let hash = 2166136261;
    for (const character of String(value)) {
      hash ^= character.codePointAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  }

  return { ACTIVE_UNTIL_TICK, CONFIG, SCHEMA, compileAmbientActors, insetClosedPath, polylineLength };
});
