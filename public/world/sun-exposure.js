(function attachSunExposure(root, factory) {
  const routePlanner = typeof module === 'object' && module.exports
    ? require('./route-planner.js')
    : root.SimulatteAutonomyRoutePlanner;
  const contracts = typeof module === 'object' && module.exports
    ? require('../contracts/cooperative-contracts.js')
    : root.SimulatteCooperativeContracts;
  const api = factory(routePlanner, contracts);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteSunExposure = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createSunExposureModule(routePlanner, contracts) {
  const DEG = Math.PI / 180;
  const buildingCache = new WeakMap();

  function solarPosition(utcInstant, latitudeDegrees, longitudeDegrees) {
    const date = new Date(utcInstant);
    if (!Number.isFinite(date.getTime())) throw exposureError('sun_time_invalid', `Expected an ISO UTC instant, received ${utcInstant}`);
    const start = Date.UTC(date.getUTCFullYear(), 0, 0);
    const day = Math.floor((date.getTime() - start) / 86_400_000);
    const hour = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
    const gamma = 2 * Math.PI / 365 * (day - 1 + (hour - 12) / 24);
    const equationMinutes = 229.18 * (0.000075 + 0.001868 * Math.cos(gamma) - 0.032077 * Math.sin(gamma)
      - 0.014615 * Math.cos(2 * gamma) - 0.040849 * Math.sin(2 * gamma));
    const declination = 0.006918 - 0.399912 * Math.cos(gamma) + 0.070257 * Math.sin(gamma)
      - 0.006758 * Math.cos(2 * gamma) + 0.000907 * Math.sin(2 * gamma)
      - 0.002697 * Math.cos(3 * gamma) + 0.00148 * Math.sin(3 * gamma);
    const trueSolarMinutes = modulo(hour * 60 + equationMinutes + 4 * longitudeDegrees, 1440);
    const hourAngle = (trueSolarMinutes / 4 - 180) * DEG;
    const latitude = latitudeDegrees * DEG;
    const cosZenith = clamp(Math.sin(latitude) * Math.sin(declination)
      + Math.cos(latitude) * Math.cos(declination) * Math.cos(hourAngle), -1, 1);
    const zenith = Math.acos(cosZenith);
    const elevation = Math.PI / 2 - zenith;
    const azimuth = modulo(Math.atan2(
      Math.sin(hourAngle),
      Math.cos(hourAngle) * Math.sin(latitude) - Math.tan(declination) * Math.cos(latitude)
    ) / DEG + 180, 360);
    return {
      schema: 'simulatte.solarPosition.v1',
      model: 'noaa_fractional_year_reference_v1',
      utcInstant: date.toISOString(),
      latitudeDegrees: round(latitudeDegrees),
      longitudeDegrees: round(longitudeDegrees),
      azimuthDegrees: round(azimuth),
      elevationDegrees: round(elevation / DEG),
      equationOfTimeMinutes: round(equationMinutes),
    };
  }

  function buildEnvironmentField({ world, worldModel, segmentIds, utcInstant, sampleSpacingM = 18 }) {
    const origin = world.provenance?.coordinateOriginWgs84
      || world.renderGeometry?.coordinateOriginWgs84
      || inferOrigin(world);
    const sun = solarPosition(utcInstant, origin.lat, origin.lon);
    const buildings = compiledBuildings(world);
    const uniqueSegmentIds = [...new Set(segmentIds)].sort();
    let sampleCount = 0;
    let unknownHeightCount = 0;
    const segmentRows = uniqueSegmentIds.map((segmentId) => {
      const segment = worldModel.segment(segmentId);
      const row = segmentExposureRow({ segment, buildings, sun, sampleSpacingM });
      const states = row.states;
      sampleCount += states.length;
      unknownHeightCount += states.filter((state) => state === 'unknown').length;
      return {
        ...row.output,
        routeCandidateId: null,
        arrivalOffsetSeconds: 0,
        midpointUtcInstant: sun.utcInstant,
        azimuthDegrees: sun.azimuthDegrees,
        elevationDegrees: sun.elevationDegrees,
      };
    });
    const field = {
      schema: 'simulatte.environmentField.v1',
      id: `sun-field-${stableId(`${world.id}:${utcInstant}:${uniqueSegmentIds.join(',')}:${sampleSpacingM}`)}`,
      worldId: world.id,
      civilTime: utcInstant,
      utcInstant: new Date(utcInstant).toISOString(),
      sunModel: sun.model,
      buildingDatasetId: world.provenance?.sources?.buildings?.id || 'world-render-buildings',
      azimuthDegrees: sun.azimuthDegrees,
      elevationDegrees: sun.elevationDegrees,
      gridResolutionM: sampleSpacingM,
      computeImplementation: 'cpu_reference_ray_footprint_v1',
      counts: {
        buildingCount: buildings.length,
        segmentCount: segmentRows.length,
        sampleCount,
        unknownHeightCount,
      },
      segmentRows,
      quality: {
        knownHeightBuildingCount: buildings.filter((row) => row.heightState === 'known').length,
        missingHeightBuildingCount: buildings.filter((row) => row.heightState === 'unknown').length,
        groundElevationApplied: false,
        treeCanopyApplied: false,
      },
      claimBoundary: 'Direct sun is a deterministic building-footprint and roof-height estimate. Ground slope, facade detail, tree canopy, clouds, and reflected heat are not included.',
    };
    contracts.validateEnvironmentField(field);
    return field;
  }

  function buildTimeVaryingEnvironmentField({ world, worldModel, routes, utcInstant, sampleSpacingM = 18 }) {
    const origin = world.provenance?.coordinateOriginWgs84
      || world.renderGeometry?.coordinateOriginWgs84
      || inferOrigin(world);
    const initialSun = solarPosition(utcInstant, origin.lat, origin.lon);
    const buildings = compiledBuildings(world);
    let sampleCount = 0;
    let unknownHeightCount = 0;
    const sampledInstants = new Set();
    const segmentRows = routes.flatMap((route, routeIndex) => {
      let arrivalOffsetSeconds = 0;
      return route.segmentIds.map((segmentId) => {
        const segment = worldModel.segment(segmentId);
        const travelSeconds = segment.lengthM / segment.speedLimitMps;
        const midpointOffsetSeconds = arrivalOffsetSeconds + travelSeconds / 2;
        const midpointUtcInstant = new Date(Date.parse(utcInstant) + midpointOffsetSeconds * 1000).toISOString();
        const sun = solarPosition(midpointUtcInstant, origin.lat, origin.lon);
        const row = segmentExposureRow({ segment, buildings, sun, sampleSpacingM });
        arrivalOffsetSeconds += travelSeconds;
        sampleCount += row.states.length;
        unknownHeightCount += row.states.filter((state) => state === 'unknown').length;
        sampledInstants.add(midpointUtcInstant);
        return {
          ...row.output,
          routeCandidateId: `route-${routeIndex + 1}`,
          arrivalOffsetSeconds: round(arrivalOffsetSeconds - travelSeconds),
          midpointUtcInstant,
          azimuthDegrees: sun.azimuthDegrees,
          elevationDegrees: sun.elevationDegrees,
        };
      });
    });
    const field = {
      schema: 'simulatte.environmentField.v1',
      id: `sun-field-${stableId(`${world.id}:${utcInstant}:${routes.map((row) => row.segmentIds.join(',')).join(';')}:${sampleSpacingM}:arrival`)}`,
      worldId: world.id,
      civilTime: utcInstant,
      utcInstant: new Date(utcInstant).toISOString(),
      sunModel: initialSun.model,
      buildingDatasetId: world.provenance?.sources?.buildings?.id || 'world-render-buildings',
      azimuthDegrees: initialSun.azimuthDegrees,
      elevationDegrees: initialSun.elevationDegrees,
      gridResolutionM: sampleSpacingM,
      computeImplementation: 'cpu_reference_arrival_time_ray_footprint_v1',
      timeSampling: {
        method: 'segment_midpoint_simulated_arrival_v1',
        routeCandidateCount: routes.length,
        sampledInstantCount: sampledInstants.size,
      },
      counts: {
        buildingCount: buildings.length,
        segmentCount: segmentRows.length,
        uniqueSegmentCount: new Set(segmentRows.map((row) => row.segmentId)).size,
        sampleCount,
        unknownHeightCount,
      },
      segmentRows,
      quality: {
        knownHeightBuildingCount: buildings.filter((row) => row.heightState === 'known').length,
        missingHeightBuildingCount: buildings.filter((row) => row.heightState === 'unknown').length,
        groundElevationApplied: false,
        treeCanopyApplied: false,
      },
      claimBoundary: 'Direct sun is a deterministic building-footprint and roof-height estimate sampled at simulated segment arrival times. Ground slope, facade detail, tree canopy, clouds, and reflected heat are not included.',
    };
    contracts.validateEnvironmentField(field);
    return field;
  }

  function selectShadeAwareRoute({ world, worldModel, originNodeId, destinationNodeId, mode, mission, policy, utcInstant, maximumAlternatives = 3, directSunWeight = 1, unknownWeight = 2 }) {
    const alternatives = routePlanner.planRouteAlternatives({
      worldModel, originNodeId, destinationNodeId, mode, tick: 0, mission, policy,
    }, maximumAlternatives);
    const field = buildTimeVaryingEnvironmentField({ world, worldModel, routes: alternatives, utcInstant });
    const candidates = alternatives.map((route, routeIndex) => {
      const rowsBySegment = new Map(field.segmentRows
        .filter((row) => row.routeCandidateId === `route-${routeIndex + 1}`)
        .map((row) => [row.segmentId, row]));
      const exposure = route.segmentIds.reduce((sum, segmentId) => {
        const row = rowsBySegment.get(segmentId);
        sum.travelSeconds += row.travelSeconds;
        sum.directSunSeconds += row.directSunSeconds;
        sum.shadeSeconds += row.shadeSeconds;
        sum.unknownSeconds += row.unknownSeconds;
        return sum;
      }, { travelSeconds: 0, directSunSeconds: 0, shadeSeconds: 0, unknownSeconds: 0 });
      const objective = exposure.travelSeconds + exposure.directSunSeconds * directSunWeight + exposure.unknownSeconds * unknownWeight;
      return {
        route,
        exposure: Object.fromEntries(Object.entries(exposure).map(([key, value]) => [key, round(value)])),
        objective: round(objective),
      };
    }).sort((left, right) => left.objective - right.objective
      || left.exposure.travelSeconds - right.exposure.travelSeconds
      || left.route.segmentIds.join('|').localeCompare(right.route.segmentIds.join('|')));
    return {
      schema: 'simulatte.shadeRouteSelection.v1',
      selected: candidates[0],
      candidates,
      field,
      weights: { travelSeconds: 1, directSunSeconds: directSunWeight, unknownSeconds: unknownWeight },
      selectionAuthority: 'inspectable_javascript',
      modelExecution: false,
      searchComplete: alternatives.length < maximumAlternatives,
      claimBoundary: field.claimBoundary,
    };
  }

  function segmentExposureRow({ segment, buildings, sun, sampleSpacingM }) {
    const travelSeconds = segment.lengthM / segment.speedLimitMps;
    const samples = samplePolyline(segment.geometry, sampleSpacingM);
    const states = samples.map((point) => pointSunState(point, buildings, sun));
    const directFraction = states.filter((state) => state === 'direct').length / states.length;
    const shadeFraction = states.filter((state) => state === 'shade').length / states.length;
    const unknownFraction = states.filter((state) => state === 'unknown').length / states.length;
    return {
      states,
      output: {
        segmentId: segment.id,
        travelSeconds: round(travelSeconds),
        directSunSeconds: round(travelSeconds * directFraction),
        shadeSeconds: round(travelSeconds * shadeFraction),
        unknownSeconds: round(travelSeconds * unknownFraction),
        sampleCount: states.length,
        directFraction: round(directFraction),
        shadeFraction: round(shadeFraction),
        unknownFraction: round(unknownFraction),
      },
    };
  }

  function compiledBuildings(world) {
    if (buildingCache.has(world)) return buildingCache.get(world);
    const rows = (world.renderGeometry?.buildings || []).map((building) => {
      const bounds = boundsOf(building.footprint);
      const known = Number.isFinite(building.heightM) && building.heightM > 0;
      return {
        id: building.id,
        footprint: building.footprint,
        bounds,
        heightM: known ? building.heightM : null,
        groundElevationM: Number.isFinite(building.groundElevationM) ? building.groundElevationM : null,
        heightState: known ? 'known' : 'unknown',
      };
    });
    buildingCache.set(world, rows);
    return rows;
  }

  function pointSunState(point, buildings, sun) {
    if (sun.elevationDegrees <= 0) return 'shade';
    const elevation = sun.elevationDegrees * DEG;
    const direction = {
      x: Math.sin(sun.azimuthDegrees * DEG),
      y: Math.cos(sun.azimuthDegrees * DEG),
    };
    let unknownIntersected = false;
    for (const building of buildings) {
      const maximumShadowM = building.heightM === null ? 220 : building.heightM / Math.tan(elevation);
      if (!rayMayReachBounds(point, direction, maximumShadowM, building.bounds)) continue;
      const distanceM = rayPolygonEntryDistance(point, direction, building.footprint);
      if (distanceM === null || distanceM < 0 || distanceM > maximumShadowM) continue;
      if (building.heightState === 'unknown') unknownIntersected = true;
      else if (building.heightM > distanceM * Math.tan(elevation)) return 'shade';
    }
    return unknownIntersected ? 'unknown' : 'direct';
  }

  function rayPolygonEntryDistance(origin, direction, polygon) {
    if (pointInPolygon(origin, polygon)) return 0;
    let nearest = Infinity;
    for (let index = 1; index < polygon.length; index += 1) {
      const distanceM = raySegmentDistance(origin, direction, polygon[index - 1], polygon[index]);
      if (distanceM !== null && distanceM < nearest) nearest = distanceM;
    }
    return Number.isFinite(nearest) ? nearest : null;
  }

  function raySegmentDistance(origin, direction, start, end) {
    const sx = end.x - start.x;
    const sy = end.y - start.y;
    const denominator = cross(direction.x, direction.y, sx, sy);
    if (Math.abs(denominator) < 1e-12) return null;
    const ox = start.x - origin.x;
    const oy = start.y - origin.y;
    const rayDistance = cross(ox, oy, sx, sy) / denominator;
    const segmentRatio = cross(ox, oy, direction.x, direction.y) / denominator;
    return rayDistance >= 0 && segmentRatio >= 0 && segmentRatio <= 1 ? rayDistance : null;
  }

  function rayMayReachBounds(origin, direction, distanceM, bounds) {
    const end = { x: origin.x + direction.x * distanceM, y: origin.y + direction.y * distanceM };
    return Math.max(origin.x, end.x) >= bounds.minX && Math.min(origin.x, end.x) <= bounds.maxX
      && Math.max(origin.y, end.y) >= bounds.minY && Math.min(origin.y, end.y) <= bounds.maxY;
  }

  function pointInPolygon(point, polygon) {
    let inside = false;
    for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
      const a = polygon[index];
      const b = polygon[previous];
      const crosses = (a.y > point.y) !== (b.y > point.y)
        && point.x < (b.x - a.x) * (point.y - a.y) / ((b.y - a.y) || Number.EPSILON) + a.x;
      if (crosses) inside = !inside;
    }
    return inside;
  }

  function samplePolyline(points, spacingM) {
    const samples = [];
    for (let index = 1; index < points.length; index += 1) {
      const start = points[index - 1];
      const end = points[index];
      const length = Math.hypot(end.x - start.x, end.y - start.y);
      const count = Math.max(1, Math.ceil(length / spacingM));
      for (let sample = 0; sample < count; sample += 1) {
        const ratio = sample / count;
        samples.push({ x: start.x + (end.x - start.x) * ratio, y: start.y + (end.y - start.y) * ratio });
      }
    }
    samples.push({ ...points.at(-1) });
    return samples;
  }

  function inferOrigin(world) {
    const point = world.nodes.find((row) => row.positionWgs84)?.positionWgs84;
    if (!point) throw exposureError('world_origin_missing', `World ${world.id} has no WGS84 coordinate origin`);
    return { lat: point.latitude, lon: point.longitude };
  }

  function boundsOf(points) {
    return points.reduce((bounds, point) => ({
      minX: Math.min(bounds.minX, point.x),
      minY: Math.min(bounds.minY, point.y),
      maxX: Math.max(bounds.maxX, point.x),
      maxY: Math.max(bounds.maxY, point.y),
    }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
  }

  function cross(ax, ay, bx, by) {
    return ax * by - ay * bx;
  }

  function stableId(value) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  }

  function modulo(value, divisor) {
    return ((value % divisor) + divisor) % divisor;
  }

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function round(value) {
    return Number(value.toFixed(6));
  }

  function exposureError(code, message) {
    const error = new Error(`${code}: ${message}`);
    error.name = 'SunExposureError';
    error.code = code;
    return error;
  }

  return { buildEnvironmentField, buildTimeVaryingEnvironmentField, pointSunState, selectShadeAwareRoute, solarPosition };
});
