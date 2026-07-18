(function attachSunExposure(root, factory) {
  const routePlanner = typeof module === 'object' && module.exports
    ? require('./route-planner.js')
    : root.SimulatteAutonomyRoutePlanner;
  const contracts = typeof module === 'object' && module.exports
    ? require('../contracts/cooperative-contracts.js')
    : root.SimulatteCooperativeContracts;
  const timeCosts = typeof module === 'object' && module.exports
    ? require('./time-dependent-edge-cost.js')
    : root.SimulatteTimeDependentEdgeCost;
  const api = factory(routePlanner, contracts, timeCosts);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteSunExposure = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createSunExposureModule(routePlanner, contracts, timeCosts) {
  const DEG = Math.PI / 180;
  const DEFAULT_SAMPLE_SPACING_M = 18;
  const DEFAULT_INDEX_CELL_SIZE_M = 180;
  const DEFAULT_MINIMUM_SOLAR_ELEVATION_DEGREES = 2;
  const UNKNOWN_BUILDING_HEIGHT_M = 360;
  const buildingCache = new WeakMap();
  const arraySceneCache = new WeakMap();

  function solarPosition(utcInstant, latitudeDegrees, longitudeDegrees) {
    const date = new Date(utcInstant);
    if (!Number.isFinite(date.getTime())) throw exposureError('sun_time_invalid', `Expected an ISO instant, received ${utcInstant}`);
    if (!Number.isFinite(latitudeDegrees) || latitudeDegrees < -90 || latitudeDegrees > 90) {
      throw exposureError('sun_latitude_invalid', `Expected -90..90, received ${latitudeDegrees}`);
    }
    if (!Number.isFinite(longitudeDegrees) || longitudeDegrees < -180 || longitudeDegrees > 180) {
      throw exposureError('sun_longitude_invalid', `Expected -180..180, received ${longitudeDegrees}`);
    }
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
    const elevation = Math.PI / 2 - Math.acos(cosZenith);
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
      azimuthFrame: 'degrees_clockwise_from_true_north',
    };
  }

  function zonedCivilTimeToUtc({ civilTime, timeZone, disambiguation = 'reject' }) {
    const parts = parseCivilTime(civilTime);
    if (typeof timeZone !== 'string' || !timeZone) throw exposureError('civil_time_zone_invalid', String(timeZone));
    if (!['reject', 'earlier', 'later'].includes(disambiguation)) throw exposureError('civil_time_disambiguation_invalid', disambiguation);
    const targetMs = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    const candidates = [];
    for (let offsetMinutes = -14 * 60; offsetMinutes <= 14 * 60; offsetMinutes += 15) {
      const instantMs = targetMs - offsetMinutes * 60_000;
      if (civilPartsAt(instantMs, timeZone) === civilPartsKey(parts)) candidates.push(instantMs);
    }
    const unique = [...new Set(candidates)].sort((left, right) => left - right);
    if (!unique.length) throw exposureError('civil_time_nonexistent', `${civilTime} in ${timeZone}`);
    if (unique.length > 1 && disambiguation === 'reject') throw exposureError('civil_time_ambiguous', `${civilTime} in ${timeZone}`);
    const selectedMs = disambiguation === 'later' ? unique.at(-1) : unique[0];
    return {
      schema: 'simulatte.civilTimeResolution.v1',
      civilTime,
      timeZone,
      disambiguation,
      candidateCount: unique.length,
      utcInstant: new Date(selectedMs).toISOString(),
      offsetMinutes: Math.round((targetMs - selectedMs) / 60_000),
    };
  }

  function createShadeCostModel({
    world,
    buildings = compiledBuildings(world),
    latitudeDegrees,
    longitudeDegrees,
    sampleSpacingM = DEFAULT_SAMPLE_SPACING_M,
    directSunWeight = 1,
    unknownWeight = 2,
    minimumSolarElevationDegrees = DEFAULT_MINIMUM_SOLAR_ELEVATION_DEGREES,
  }) {
    return timeCosts.defineCostModel({
      id: 'building-direct-sun-arrival-cost',
      version: 'v2',
      fifo: true,
      claimBoundary: 'Traversal duration is time-independent and FIFO. Exposure utility varies by arrival time; the FIFO declaration does not prove globally optimal shade routing.',
      evaluate({ segment, enteredAt }) {
        const travelSeconds = segment.lengthM / segment.speedLimitMps;
        const midpointUtcInstant = new Date(Date.parse(enteredAt) + travelSeconds * 500).toISOString();
        const sun = solarPosition(midpointUtcInstant, latitudeDegrees, longitudeDegrees);
        const row = segmentExposureRow({ segment, buildings, sun, sampleSpacingM, minimumSolarElevationDegrees });
        const generalizedCost = travelSeconds
          + row.output.directSunSeconds * directSunWeight
          + row.output.unknownSeconds * unknownWeight;
        return {
          traversalSeconds: travelSeconds,
          generalizedCost,
          components: {
            travelSeconds: row.output.travelSeconds,
            directSunSeconds: row.output.directSunSeconds,
            shadeSeconds: row.output.shadeSeconds,
            unknownSeconds: row.output.unknownSeconds,
            nightSeconds: row.output.nightSeconds,
          },
          evidence: { ...row.output, midpointUtcInstant, sun, query: row.query },
        };
      },
    });
  }

  function buildEnvironmentField({ world, worldModel, segmentIds, utcInstant, sampleSpacingM = DEFAULT_SAMPLE_SPACING_M }) {
    const origin = worldOrigin(world);
    const sun = solarPosition(utcInstant, origin.lat, origin.lon);
    const buildings = compiledBuildings(world);
    const uniqueSegmentIds = [...new Set(segmentIds)].sort();
    const segmentRows = uniqueSegmentIds.map((segmentId) => {
      const row = segmentExposureRow({ segment: worldModel.segment(segmentId), buildings, sun, sampleSpacingM });
      return {
        ...row.output,
        routeCandidateId: null,
        arrivalOffsetSeconds: 0,
        midpointUtcInstant: sun.utcInstant,
        azimuthDegrees: sun.azimuthDegrees,
        elevationDegrees: sun.elevationDegrees,
      };
    });
    return finalizeEnvironmentField({
      world, utcInstant, sampleSpacingM, initialSun: sun, buildings, segmentRows,
      computeImplementation: 'cpu_spatial_index_ray_multipolygon_v2',
      timeSampling: null,
    });
  }

  function buildTimeVaryingEnvironmentField({
    world,
    worldModel,
    routes,
    utcInstant,
    sampleSpacingM = DEFAULT_SAMPLE_SPACING_M,
    directSunWeight = 1,
    unknownWeight = 2,
    minimumSolarElevationDegrees = DEFAULT_MINIMUM_SOLAR_ELEVATION_DEGREES,
  }) {
    const origin = worldOrigin(world);
    const initialSun = solarPosition(utcInstant, origin.lat, origin.lon);
    const buildings = compiledBuildings(world);
    const model = createShadeCostModel({
      world, buildings, latitudeDegrees: origin.lat, longitudeDegrees: origin.lon,
      sampleSpacingM, directSunWeight, unknownWeight, minimumSolarElevationDegrees,
    });
    const routeEvaluations = routes.map((route, routeIndex) => timeCosts.evaluateRoute({
      model,
      segmentIds: route.segmentIds,
      worldModel,
      departureAt: utcInstant,
      routeCandidateId: `route-${routeIndex + 1}`,
    }));
    const segmentRows = routeEvaluations.flatMap((evaluation) => evaluation.edgeRows.map((edge) => ({
      segmentId: edge.segmentId,
      ...edge.components,
      sampleCount: edge.evidence.sampleCount,
      directFraction: edge.evidence.directFraction,
      shadeFraction: edge.evidence.shadeFraction,
      unknownFraction: edge.evidence.unknownFraction,
      nightFraction: edge.evidence.nightFraction,
      routeCandidateId: edge.routeCandidateId,
      arrivalOffsetSeconds: edge.arrivalOffsetSeconds,
      midpointUtcInstant: edge.evidence.midpointUtcInstant,
      azimuthDegrees: edge.evidence.sun.azimuthDegrees,
      elevationDegrees: edge.evidence.sun.elevationDegrees,
      candidateBuildingChecks: edge.evidence.query.candidateBuildingChecks,
      maximumShadowQueryM: edge.evidence.query.maximumShadowQueryM,
      lowSunSampleCount: edge.evidence.query.lowSunSampleCount,
    })));
    const sampledInstants = new Set(segmentRows.map((row) => row.midpointUtcInstant));
    const field = finalizeEnvironmentField({
      world, utcInstant, sampleSpacingM, initialSun, buildings, segmentRows,
      computeImplementation: 'cpu_arrival_time_spatial_index_ray_multipolygon_v2',
      timeSampling: {
        method: 'segment_midpoint_simulated_arrival_v1',
        routeCandidateCount: routes.length,
        sampledInstantCount: sampledInstants.size,
        edgeCostModelId: model.id,
        edgeCostModelVersion: model.version,
        fifo: model.fifo,
      },
    });
    return { ...field, routeEvaluations };
  }

  function finalizeEnvironmentField({ world, utcInstant, sampleSpacingM, initialSun, buildings, segmentRows, computeImplementation, timeSampling }) {
    const stateSeconds = segmentRows.reduce((sum, row) => {
      sum.direct += row.directSunSeconds;
      sum.shade += row.shadeSeconds;
      sum.unknown += row.unknownSeconds;
      sum.night += row.nightSeconds;
      return sum;
    }, { direct: 0, shade: 0, unknown: 0, night: 0 });
    const field = {
      schema: 'simulatte.environmentField.v1',
      id: `sun-field-${stableId(`${world.id}:${utcInstant}:${segmentRows.map((row) => `${row.routeCandidateId}:${row.segmentId}`).join(',')}:${sampleSpacingM}:${computeImplementation}`)}`,
      worldId: world.id,
      civilTime: utcInstant,
      utcInstant: new Date(utcInstant).toISOString(),
      sunModel: initialSun.model,
      buildingDatasetId: world.provenance?.sources?.buildings?.id || 'world-render-buildings',
      azimuthDegrees: initialSun.azimuthDegrees,
      elevationDegrees: initialSun.elevationDegrees,
      gridResolutionM: sampleSpacingM,
      computeImplementation,
      ...(timeSampling ? { timeSampling } : {}),
      counts: {
        buildingCount: buildings.rows.length,
        segmentCount: segmentRows.length,
        uniqueSegmentCount: new Set(segmentRows.map((row) => row.segmentId)).size,
        sampleCount: segmentRows.reduce((sum, row) => sum + row.sampleCount, 0),
        unknownHeightCount: buildings.rows.filter((row) => row.heightState === 'unknown').length,
        unknownSampleCount: segmentRows.reduce((sum, row) => sum + Math.round(row.sampleCount * row.unknownFraction), 0),
        nightSampleCount: segmentRows.reduce((sum, row) => sum + Math.round(row.sampleCount * row.nightFraction), 0),
        candidateBuildingChecks: segmentRows.reduce((sum, row) => sum + (row.candidateBuildingChecks || 0), 0),
      },
      segmentRows,
      quality: {
        knownHeightBuildingCount: buildings.rows.filter((row) => row.heightState === 'known').length,
        missingHeightBuildingCount: buildings.rows.filter((row) => row.heightState === 'unknown').length,
        buildingInteriorRingCount: buildings.rows.reduce((sum, row) => sum + row.interiorRings.length, 0),
        groundElevationAvailableCount: buildings.rows.filter((row) => row.groundElevationM !== null).length,
        groundElevationApplied: false,
        treeCanopyApplied: false,
        atmosphere: 'clear_sky_direct_sun_only',
        stateSeconds: Object.fromEntries(Object.entries(stateSeconds).map(([key, value]) => [key, round(value)])),
      },
      performance: {
        spatialIndex: 'uniform_grid_bounds_v1',
        spatialIndexCellSizeM: buildings.cellSizeM,
        indexedCellCount: buildings.cells.size,
        maximumSceneQueryM: round(buildings.maximumQueryM),
      },
      claimBoundary: 'Direct sun is a deterministic clear-sky estimate over retained building footprints, courtyard rings, and roof heights at simulated arrival times. Ground slope, facade detail, omitted LOD buildings, tree canopy, clouds, diffuse light, awnings, and reflected heat are not included.',
    };
    contracts.validateEnvironmentField(field);
    return field;
  }

  function selectShadeAwareRoute({
    world,
    worldModel,
    originNodeId,
    destinationNodeId,
    mode,
    mission,
    policy,
    utcInstant,
    maximumAlternatives,
    directSunWeight,
    unknownWeight,
    maximumAddedTimeSeconds,
    maximumAddedRatio,
    sampleSpacingM,
  }) {
    const shadePolicy = policy.route?.timeDependentCosts?.shade || {};
    const bounds = {
      maximumAlternatives: maximumAlternatives ?? shadePolicy.maximumAlternatives ?? 3,
      directSunWeight: directSunWeight ?? shadePolicy.directSunWeight ?? 1,
      unknownWeight: unknownWeight ?? shadePolicy.unknownWeight ?? 2,
      maximumAddedTimeSeconds: maximumAddedTimeSeconds ?? shadePolicy.maximumAddedTimeSeconds ?? 600,
      maximumAddedRatio: maximumAddedRatio ?? shadePolicy.maximumAddedRatio ?? 0.25,
      sampleSpacingM: sampleSpacingM ?? shadePolicy.sampleSpacingM ?? DEFAULT_SAMPLE_SPACING_M,
    };
    validateShadeBounds(bounds);
    const alternatives = routePlanner.planRouteAlternatives({
      worldModel, originNodeId, destinationNodeId, mode, tick: 0, mission, policy,
    }, bounds.maximumAlternatives);
    const field = buildTimeVaryingEnvironmentField({
      world, worldModel, routes: alternatives, utcInstant,
      sampleSpacingM: bounds.sampleSpacingM,
      directSunWeight: bounds.directSunWeight,
      unknownWeight: bounds.unknownWeight,
      minimumSolarElevationDegrees: shadePolicy.minimumSolarElevationDegrees ?? DEFAULT_MINIMUM_SOLAR_ELEVATION_DEGREES,
    });
    const fastestTravelSeconds = Math.min(...field.routeEvaluations.map((row) => row.traversalSeconds));
    const allowedAddedSeconds = Math.min(bounds.maximumAddedTimeSeconds, fastestTravelSeconds * bounds.maximumAddedRatio);
    const candidates = alternatives.map((route, routeIndex) => {
      const evaluation = field.routeEvaluations[routeIndex];
      const exposure = evaluation.edgeRows.reduce((sum, row) => {
        Object.entries(row.components).forEach(([key, value]) => { sum[key] = (sum[key] || 0) + value; });
        return sum;
      }, {});
      const addedTimeSeconds = evaluation.traversalSeconds - fastestTravelSeconds;
      return {
        route,
        exposure: roundedObject(exposure),
        objective: evaluation.generalizedCost,
        addedTimeSeconds: round(addedTimeSeconds),
        detourRatio: fastestTravelSeconds ? round(addedTimeSeconds / fastestTravelSeconds) : 0,
        withinDetourBound: addedTimeSeconds <= allowedAddedSeconds + 1e-9,
      };
    });
    const eligible = candidates.filter((row) => row.withinDetourBound).sort(compareShadeCandidates);
    const selected = eligible[0] || candidates.slice().sort((left, right) => left.exposure.travelSeconds - right.exposure.travelSeconds)[0];
    const fastest = candidates.slice().sort((left, right) => left.exposure.travelSeconds - right.exposure.travelSeconds
      || left.route.segmentIds.join('|').localeCompare(right.route.segmentIds.join('|')))[0];
    const comparison = comparativeShadeReceipt(selected, fastest, bounds, allowedAddedSeconds);
    const publicField = { ...field };
    delete publicField.routeEvaluations;
    return {
      schema: 'simulatte.shadeRouteSelection.v1',
      selected,
      fastest,
      candidates: candidates.sort(compareShadeCandidates),
      field: publicField,
      comparison,
      weights: { travelSeconds: 1, directSunSeconds: bounds.directSunWeight, unknownSeconds: bounds.unknownWeight },
      detourPolicy: {
        maximumAddedTimeSeconds: bounds.maximumAddedTimeSeconds,
        maximumAddedRatio: bounds.maximumAddedRatio,
        effectiveMaximumAddedTimeSeconds: round(allowedAddedSeconds),
      },
      traversalCostModel: field.timeSampling ? {
        id: field.timeSampling.edgeCostModelId,
        version: field.timeSampling.edgeCostModelVersion,
        fifo: field.timeSampling.fifo,
      } : null,
      selectionAuthority: 'inspectable_javascript',
      modelExecution: false,
      searchComplete: alternatives.length < bounds.maximumAlternatives,
      claimBoundary: publicField.claimBoundary,
    };
  }

  function comparativeShadeReceipt(selected, fastest, bounds, effectiveMaximumAddedTimeSeconds) {
    const selectedLit = selected.exposure.directSunSeconds + selected.exposure.shadeSeconds;
    const fastestLit = fastest.exposure.directSunSeconds + fastest.exposure.shadeSeconds;
    return {
      schema: 'simulatte.comparativeShadeReceipt.v1',
      selectedRouteId: selected.route.segmentIds.join('|'),
      fastestRouteId: fastest.route.segmentIds.join('|'),
      selectedModeledBuildingShadePercent: selectedLit ? round(selected.exposure.shadeSeconds / selectedLit * 100) : 0,
      fastestModeledBuildingShadePercent: fastestLit ? round(fastest.exposure.shadeSeconds / fastestLit * 100) : 0,
      selectedDirectSunSeconds: selected.exposure.directSunSeconds,
      fastestDirectSunSeconds: fastest.exposure.directSunSeconds,
      selectedUnknownSeconds: selected.exposure.unknownSeconds,
      addedTravelSeconds: round(selected.exposure.travelSeconds - fastest.exposure.travelSeconds),
      bounds: {
        maximumAddedTimeSeconds: bounds.maximumAddedTimeSeconds,
        maximumAddedRatio: bounds.maximumAddedRatio,
        effectiveMaximumAddedTimeSeconds: round(effectiveMaximumAddedTimeSeconds),
      },
      assumptions: ['clear_sky_direct_sun', 'retained_building_lod', 'no_tree_canopy', 'segment_sampled_exposure'],
      claimBoundary: 'Percentages describe modeled building shade under clear-sky direct sun. They are not total thermal comfort or observed street shade.',
    };
  }

  function segmentExposureRow({
    segment,
    buildings,
    sun,
    sampleSpacingM,
    minimumSolarElevationDegrees = DEFAULT_MINIMUM_SOLAR_ELEVATION_DEGREES,
  }) {
    const travelSeconds = segment.lengthM / segment.speedLimitMps;
    const samples = samplePolyline(segment.geometry, sampleSpacingM);
    const results = samples.map((point) => pointSunStateDetailed(point, buildings, sun, { minimumSolarElevationDegrees }));
    const states = results.map((row) => row.state);
    const fractions = Object.fromEntries(['direct', 'shade', 'unknown', 'night'].map((state) => [state, states.filter((row) => row === state).length / states.length]));
    return {
      states,
      query: {
        candidateBuildingChecks: results.reduce((sum, row) => sum + row.candidateBuildingChecks, 0),
        maximumShadowQueryM: Math.max(...results.map((row) => row.maximumShadowQueryM), 0),
        lowSunSampleCount: results.filter((row) => row.reason === 'solar_elevation_below_bounded_floor').length,
      },
      output: {
        segmentId: segment.id,
        travelSeconds: round(travelSeconds),
        directSunSeconds: round(travelSeconds * fractions.direct),
        shadeSeconds: round(travelSeconds * fractions.shade),
        unknownSeconds: round(travelSeconds * fractions.unknown),
        nightSeconds: round(travelSeconds * fractions.night),
        sampleCount: states.length,
        directFraction: round(fractions.direct),
        shadeFraction: round(fractions.shade),
        unknownFraction: round(fractions.unknown),
        nightFraction: round(fractions.night),
      },
    };
  }

  function compiledBuildings(world) {
    if (buildingCache.has(world)) return buildingCache.get(world);
    const rows = (world.renderGeometry?.buildings || []).map((building) => {
      const footprint = building.footprint;
      const known = Number.isFinite(building.heightM) && building.heightM > 0;
      return {
        id: building.id,
        footprint,
        interiorRings: Array.isArray(building.interiorRings) ? building.interiorRings : [],
        bounds: boundsOf(footprint),
        heightM: known ? building.heightM : null,
        groundElevationM: Number.isFinite(building.groundElevationM) ? building.groundElevationM : null,
        heightState: known ? 'known' : 'unknown',
      };
    });
    const scene = buildBuildingScene(rows, DEFAULT_INDEX_CELL_SIZE_M);
    buildingCache.set(world, scene);
    return scene;
  }

  function buildBuildingScene(rows, cellSizeM = DEFAULT_INDEX_CELL_SIZE_M) {
    const cells = new Map();
    const sceneBounds = rows.reduce((bounds, row) => mergeBounds(bounds, row.bounds || boundsOf(row.footprint)), emptyBounds());
    rows.forEach((row, index) => {
      row.bounds ||= boundsOf(row.footprint);
      row.interiorRings ||= [];
      const minCellX = Math.floor(row.bounds.minX / cellSizeM);
      const maxCellX = Math.floor(row.bounds.maxX / cellSizeM);
      const minCellY = Math.floor(row.bounds.minY / cellSizeM);
      const maxCellY = Math.floor(row.bounds.maxY / cellSizeM);
      for (let x = minCellX; x <= maxCellX; x += 1) for (let y = minCellY; y <= maxCellY; y += 1) {
        const key = `${x}:${y}`;
        if (!cells.has(key)) cells.set(key, []);
        cells.get(key).push(index);
      }
    });
    const maximumHeightM = Math.max(...rows.map((row) => row.heightM || UNKNOWN_BUILDING_HEIGHT_M), 0);
    return {
      rows,
      cells,
      cellSizeM,
      maximumHeightM,
      bounds: sceneBounds,
      maximumQueryM: Number.isFinite(sceneBounds.minX)
        ? Math.hypot(sceneBounds.maxX - sceneBounds.minX, sceneBounds.maxY - sceneBounds.minY)
        : 0,
    };
  }

  function pointSunState(point, buildings, sun, options = {}) {
    return pointSunStateDetailed(point, buildings, sun, options).state;
  }

  function pointSunStateDetailed(point, buildings, sun, { minimumSolarElevationDegrees = DEFAULT_MINIMUM_SOLAR_ELEVATION_DEGREES } = {}) {
    if (sun.elevationDegrees <= 0) return stateResult('night', 'sun_below_horizon');
    if (sun.elevationDegrees < minimumSolarElevationDegrees) {
      return stateResult('unknown', 'solar_elevation_below_bounded_floor');
    }
    const scene = normalizeBuildingScene(buildings);
    const elevation = sun.elevationDegrees * DEG;
    const direction = { x: Math.sin(sun.azimuthDegrees * DEG), y: Math.cos(sun.azimuthDegrees * DEG) };
    const physicalQueryM = scene.maximumHeightM / Math.tan(elevation);
    const maximumShadowQueryM = Math.min(physicalQueryM, scene.maximumQueryM || physicalQueryM);
    const candidates = buildingsAlongRay(scene, point, direction, maximumShadowQueryM);
    let unknownIntersected = false;
    let candidateBuildingChecks = 0;
    for (const building of candidates) {
      candidateBuildingChecks += 1;
      const maximumShadowM = (building.heightM || UNKNOWN_BUILDING_HEIGHT_M) / Math.tan(elevation);
      if (!rayMayReachBounds(point, direction, maximumShadowM, building.bounds)) continue;
      const distanceM = raySolidEntryDistance(point, direction, building, maximumShadowM);
      if (distanceM === null || distanceM > maximumShadowM) continue;
      if (building.heightState === 'unknown') unknownIntersected = true;
      else if (building.heightM > distanceM * Math.tan(elevation)) {
        return stateResult('shade', 'building_occlusion', candidateBuildingChecks, maximumShadowQueryM, building.id);
      }
    }
    return unknownIntersected
      ? stateResult('unknown', 'intersected_building_height_unknown', candidateBuildingChecks, maximumShadowQueryM)
      : stateResult('direct', 'no_building_occlusion', candidateBuildingChecks, maximumShadowQueryM);
  }

  function normalizeBuildingScene(buildings) {
    if (buildings && Array.isArray(buildings.rows) && buildings.cells instanceof Map) return buildings;
    if (!Array.isArray(buildings)) throw exposureError('buildings_invalid', 'Expected building rows or compiled scene');
    if (!arraySceneCache.has(buildings)) arraySceneCache.set(buildings, buildBuildingScene(buildings));
    return arraySceneCache.get(buildings);
  }

  function buildingsAlongRay(scene, origin, direction, distanceM) {
    if (!scene.cells.size || !Number.isFinite(distanceM)) return scene.rows;
    const end = { x: origin.x + direction.x * distanceM, y: origin.y + direction.y * distanceM };
    const minCellX = Math.floor(Math.min(origin.x, end.x) / scene.cellSizeM);
    const maxCellX = Math.floor(Math.max(origin.x, end.x) / scene.cellSizeM);
    const minCellY = Math.floor(Math.min(origin.y, end.y) / scene.cellSizeM);
    const maxCellY = Math.floor(Math.max(origin.y, end.y) / scene.cellSizeM);
    const indexes = new Set();
    for (let x = minCellX; x <= maxCellX; x += 1) for (let y = minCellY; y <= maxCellY; y += 1) {
      (scene.cells.get(`${x}:${y}`) || []).forEach((index) => indexes.add(index));
    }
    return [...indexes].sort((left, right) => left - right).map((index) => scene.rows[index]);
  }

  function raySolidEntryDistance(origin, direction, building, maximumDistanceM) {
    if (pointInBuilding(origin, building)) return 0;
    const distances = [0, maximumDistanceM];
    [building.footprint, ...(building.interiorRings || [])].forEach((ring) => {
      for (let index = 1; index < ring.length; index += 1) {
        const distanceM = raySegmentDistance(origin, direction, ring[index - 1], ring[index]);
        if (distanceM !== null && distanceM <= maximumDistanceM) distances.push(distanceM);
      }
    });
    const sorted = [...new Set(distances.map((value) => round(value)))].sort((left, right) => left - right);
    for (let index = 1; index < sorted.length; index += 1) {
      const start = sorted[index - 1];
      const end = sorted[index];
      if (end - start < 1e-8) continue;
      const midpoint = start + (end - start) / 2;
      if (pointInBuilding({ x: origin.x + direction.x * midpoint, y: origin.y + direction.y * midpoint }, building)) return start;
    }
    return null;
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

  function pointInBuilding(point, building) {
    return pointInPolygon(point, building.footprint)
      && !(building.interiorRings || []).some((ring) => pointInPolygon(point, ring));
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

  function validateShadeBounds(bounds) {
    if (!Number.isInteger(bounds.maximumAlternatives) || bounds.maximumAlternatives < 1) throw exposureError('shade_alternatives_invalid', bounds.maximumAlternatives);
    ['directSunWeight', 'unknownWeight', 'maximumAddedTimeSeconds', 'maximumAddedRatio', 'sampleSpacingM'].forEach((key) => {
      if (!Number.isFinite(bounds[key]) || bounds[key] < 0 || (key === 'sampleSpacingM' && bounds[key] === 0)) {
        throw exposureError(`shade_${key}_invalid`, bounds[key]);
      }
    });
  }

  function worldOrigin(world) {
    const value = world.coordinateSystem?.originWgs84
      || world.provenance?.coordinateOriginWgs84
      || world.renderGeometry?.coordinateOriginWgs84;
    if (value) return { lat: value.latitude ?? value.lat, lon: value.longitude ?? value.lon };
    return inferOrigin(world);
  }

  function inferOrigin(world) {
    const point = world.nodes.find((row) => row.positionWgs84)?.positionWgs84;
    if (!point) throw exposureError('world_origin_missing', `World ${world.id} has no WGS84 coordinate origin`);
    return { lat: point.latitude, lon: point.longitude };
  }

  function parseCivilTime(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value || '');
    if (!match) throw exposureError('civil_time_invalid', String(value));
    const parts = {
      year: Number(match[1]), month: Number(match[2]), day: Number(match[3]),
      hour: Number(match[4]), minute: Number(match[5]), second: Number(match[6] || 0),
    };
    const normalized = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second));
    if (normalized.getUTCFullYear() !== parts.year || normalized.getUTCMonth() + 1 !== parts.month
      || normalized.getUTCDate() !== parts.day || normalized.getUTCHours() !== parts.hour
      || normalized.getUTCMinutes() !== parts.minute || normalized.getUTCSeconds() !== parts.second) {
      throw exposureError('civil_time_invalid', value);
    }
    return parts;
  }

  function civilPartsAt(instantMs, timeZone) {
    let formatter;
    try {
      formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
      });
    } catch {
      throw exposureError('civil_time_zone_invalid', timeZone);
    }
    const rows = Object.fromEntries(formatter.formatToParts(new Date(instantMs))
      .filter((row) => row.type !== 'literal').map((row) => [row.type, row.value]));
    return `${rows.year}-${rows.month}-${rows.day}T${rows.hour}:${rows.minute}:${rows.second}`;
  }

  function civilPartsKey(parts) {
    return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}T${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}:${String(parts.second).padStart(2, '0')}`;
  }

  function compareShadeCandidates(left, right) {
    if (left.withinDetourBound !== right.withinDetourBound) return left.withinDetourBound ? -1 : 1;
    return left.objective - right.objective
      || left.exposure.travelSeconds - right.exposure.travelSeconds
      || left.route.segmentIds.join('|').localeCompare(right.route.segmentIds.join('|'));
  }

  function stateResult(state, reason, candidateBuildingChecks = 0, maximumShadowQueryM = 0, occluderId = null) {
    return { state, reason, candidateBuildingChecks, maximumShadowQueryM: round(maximumShadowQueryM), occluderId };
  }

  function roundedObject(value) {
    return Object.fromEntries(Object.entries(value).map(([key, row]) => [key, round(row)]));
  }

  function boundsOf(points) {
    return points.reduce((bounds, point) => mergeBounds(bounds, { minX: point.x, minY: point.y, maxX: point.x, maxY: point.y }), emptyBounds());
  }

  function emptyBounds() {
    return { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  }

  function mergeBounds(left, right) {
    return {
      minX: Math.min(left.minX, right.minX),
      minY: Math.min(left.minY, right.minY),
      maxX: Math.max(left.maxX, right.maxX),
      maxY: Math.max(left.maxY, right.maxY),
    };
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

  return {
    buildBuildingScene,
    buildEnvironmentField,
    buildTimeVaryingEnvironmentField,
    createShadeCostModel,
    pointSunState,
    selectShadeAwareRoute,
    solarPosition,
    zonedCivilTimeToUtc,
  };
});
