(function attachSunWalkerEnvironment(root, factory) {
  const truth = typeof module === 'object' && module.exports
    ? require('./truth.js')
    : root.SimulatteSunWalkerTruth;
  const api = factory(truth);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteSunWalkerEnvironment = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createSunWalkerEnvironment(truthApi) {
  const CELL_SIZE_M = 40;
  const compiledCache = new WeakMap();
  const truth = () => {
    const api = truthApi || globalThis.SimulatteSunWalkerTruth;
    if (!api?.deepFreeze) throw new Error('sun_walker_truth_dependency_missing');
    return api;
  };

  function compile(dataset, world) {
    let worldCache = compiledCache.get(dataset);
    if (!worldCache) {
      worldCache = new WeakMap();
      compiledCache.set(dataset, worldCache);
    }
    if (worldCache.has(world)) return worldCache.get(world);
    validateDataset(dataset);
    const origin = worldOrigin(world);
    const canopyRows = dataset.canopy.rows.map((row) => {
      const point = wgs84ToLocal(row, origin);
      const envelope = canopyEnvelope(row, dataset.canopy.model);
      return {
        ...row,
        point,
        ...envelope,
        evidenceRef: `canopy:${row.sourceRowId}`,
      };
    });
    const canopy = spatialIndex(canopyRows);
    const weather = {
      rows: dataset.weather.rows,
      factors: dataset.weather.model.directBeamFactorByCode,
      interpolation: dataset.weather.model.interpolation,
    };
    const result = truth().deepFreeze({ dataset, origin, canopy, weather });
    worldCache.set(world, result);
    return result;
  }

  function sample({ point, sun, timestamp, environment, config }) {
    const weather = config.weatherParticipation
      ? weatherAt(timestamp, environment.weather)
      : disabledWeather();
    const canopy = config.treeCanopyParticipation && sun.elevationDegrees > 0
      ? canopyAt(point, sun, environment.canopy)
      : disabledCanopy();
    return truth().deepFreeze({
      schema: 'simulatte.sunWalkerEnvironmentalSample.v1',
      weather,
      canopy,
      directBeamFactor: round(weather.directBeamFactor * canopy.directBeamTransmittance),
      evidenceRefs: [
        ...(weather.sourceRowId ? [`weather:${weather.sourceRowId}`] : []),
        ...(canopy.sourceRowId ? [`canopy:${canopy.sourceRowId}`] : []),
      ],
      truth: {
        origin: 'modeled',
        temporalStatus: 'forecast',
        uncertainty: {
          kind: 'missing',
          value: {
            historicalAnalog: config.weatherParticipation,
            currentCanopyState: config.treeCanopyParticipation,
            measuredStreetIrradiance: true,
          },
        },
      },
    });
  }

  function canopyEnvelope(row, model) {
    const diameter = Number.isFinite(row.diameterInches) ? row.diameterInches : 0;
    return {
      crownRadiusM: round(clamp(1.25 + 0.09 * diameter, 1.5, 6.5)),
      crownCenterHeightM: round(clamp(3.5 + 0.22 * diameter, 4, 11)),
      crownHalfHeightM: round(clamp(1 + 0.06 * diameter, 1.25, 3.5)),
      directBeamTransmittance: model.directBeamTransmittanceByHealth[row.health]
        ?? model.directBeamTransmittanceByHealth.unknown,
    };
  }

  function canopyAt(point, sun, scene) {
    const elevation = sun.elevationDegrees * Math.PI / 180;
    const direction = {
      x: Math.sin(sun.azimuthDegrees * Math.PI / 180),
      y: Math.cos(sun.azimuthDegrees * Math.PI / 180),
    };
    const maximumDistanceM = scene.maximumCrownTopM / Math.max(Math.tan(elevation), 1e-6) + scene.maximumRadiusM;
    const candidates = nearbyRows(scene, point, maximumDistanceM);
    let selected = null;
    for (const tree of candidates) {
      const deltaX = tree.point.x - point.x;
      const deltaY = tree.point.y - point.y;
      const along = deltaX * direction.x + deltaY * direction.y;
      if (along < 0 || along > maximumDistanceM) continue;
      const perpendicular = Math.abs(deltaX * direction.y - deltaY * direction.x);
      if (perpendicular > tree.crownRadiusM) continue;
      const rayHeightM = along * Math.tan(elevation);
      const crownBottomM = tree.crownCenterHeightM - tree.crownHalfHeightM;
      const crownTopM = tree.crownCenterHeightM + tree.crownHalfHeightM;
      if (rayHeightM < crownBottomM || rayHeightM > crownTopM) continue;
      if (!selected || tree.directBeamTransmittance < selected.directBeamTransmittance
        || (tree.directBeamTransmittance === selected.directBeamTransmittance && tree.id.localeCompare(selected.id) < 0)) {
        selected = tree;
      }
    }
    if (!selected) return {
      participation: true,
      occluded: false,
      sourceRowId: null,
      treeId: null,
      directBeamTransmittance: 1,
      modelId: 'dbh-canopy-envelope-v1',
    };
    return {
      participation: true,
      occluded: true,
      sourceRowId: selected.sourceRowId,
      treeId: selected.id,
      observedAt: selected.observedAt,
      health: selected.health,
      speciesCommon: selected.speciesCommon,
      diameterInches: selected.diameterInches,
      crownRadiusM: selected.crownRadiusM,
      crownCenterHeightM: selected.crownCenterHeightM,
      crownHalfHeightM: selected.crownHalfHeightM,
      directBeamTransmittance: selected.directBeamTransmittance,
      modelId: 'dbh-canopy-envelope-v1',
    };
  }

  function weatherAt(timestamp, weather) {
    const target = new Date(timestamp);
    if (!Number.isFinite(target.valueOf())) throw environmentError('weather_timestamp_invalid', timestamp);
    const monthDay = timestamp.slice(5, 10);
    const sameDay = weather.rows.filter((row) => row.observedAt.slice(5, 10) === monthDay);
    const pool = sameDay.length ? sameDay : weather.rows;
    const targetMinutes = target.getUTCHours() * 60 + target.getUTCMinutes();
    let selected = null;
    let selectedDistance = Infinity;
    for (const row of pool) {
      const date = new Date(row.observedAt);
      const distance = circularMinuteDistance(targetMinutes, date.getUTCHours() * 60 + date.getUTCMinutes());
      if (!selected || distance < selectedDistance ||
          (distance === selectedDistance && row.id.localeCompare(selected.id) < 0)) {
        selected = row;
        selectedDistance = distance;
      }
    }
    const directBeamFactor = weather.factors[selected.skyCode] ?? weather.factors.unknown;
    return {
      participation: true,
      sourceRowId: selected.sourceRowId,
      observationId: selected.id,
      observedAt: selected.observedAt,
      interpolation: weather.interpolation,
      analogFor: timestamp,
      skyCode: selected.skyCode,
      airTemperatureC: selected.airTemperatureC,
      dewPointC: selected.dewPointC,
      windSpeedMps: selected.windSpeedMps,
      directBeamFactor,
      modelId: 'metar-sky-direct-beam-attenuation-v1',
      temporalStatus: 'historical',
    };
  }

  function spatialIndex(rows) {
    const cells = new Map();
    rows.forEach((row, index) => {
      const key = cellKey(row.point.x, row.point.y);
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key).push(index);
    });
    return {
      rows,
      cells,
      cellSizeM: CELL_SIZE_M,
      maximumRadiusM: Math.max(...rows.map((row) => row.crownRadiusM), 0),
      maximumCrownTopM: Math.max(...rows.map((row) => row.crownCenterHeightM + row.crownHalfHeightM), 0),
    };
  }

  function nearbyRows(scene, point, distanceM) {
    const radius = Math.ceil(distanceM / scene.cellSizeM);
    const centerX = Math.floor(point.x / scene.cellSizeM);
    const centerY = Math.floor(point.y / scene.cellSizeM);
    const indexes = new Set();
    for (let x = centerX - radius; x <= centerX + radius; x += 1) {
      for (let y = centerY - radius; y <= centerY + radius; y += 1) {
        (scene.cells.get(`${x}:${y}`) || []).forEach((index) => indexes.add(index));
      }
    }
    return [...indexes].sort((left, right) => left - right).map((index) => scene.rows[index]);
  }

  function validateDataset(value) {
    if (!value || value.schema !== 'simulatte.sunWalkerEnvironment.v1' || value.id !== 'sun-walker.environment.v1') {
      throw environmentError('environment_schema_invalid', value?.schema || 'missing');
    }
    if (!Array.isArray(value.sources) || value.sources.length !== 2
      || !Array.isArray(value.canopy?.rows) || !value.canopy.rows.length
      || !Array.isArray(value.weather?.rows) || !value.weather.rows.length) {
      throw environmentError('environment_content_invalid', value.id);
    }
    value.sources.forEach((source) => {
      if (!/^[a-f0-9]{64}$/.test(source.rawSha256 || '') || !source.retrievedAt || !source.license
        || !source.rowIdentityField || source.rowCount <= 0) {
        throw environmentError('environment_source_receipt_invalid', source.id);
      }
    });
    if (new Set(value.canopy.rows.map((row) => row.sourceRowId)).size !== value.canopy.rows.length) {
      throw environmentError('environment_canopy_identity_duplicate', value.canopy.rows.length);
    }
    if (new Set(value.weather.rows.map((row) => row.sourceRowId)).size !== value.weather.rows.length) {
      throw environmentError('environment_weather_identity_duplicate', value.weather.rows.length);
    }
    return value;
  }

  function disabledWeather() {
    return {
      participation: false,
      sourceRowId: null,
      directBeamFactor: 1,
      reason: 'weather_participation_disabled',
    };
  }

  function disabledCanopy() {
    return {
      participation: false,
      occluded: false,
      sourceRowId: null,
      treeId: null,
      directBeamTransmittance: 1,
      reason: 'canopy_participation_disabled',
    };
  }

  function worldOrigin(world) {
    const value = world.coordinateSystem?.originWgs84;
    if (!value) throw environmentError('environment_world_origin_missing', world.id);
    return { latitude: value.latitude, longitude: value.longitude };
  }

  function wgs84ToLocal(row, origin) {
    const longitudeScale = Math.cos(origin.latitude * Math.PI / 180) * 111320;
    return {
      x: round((row.longitude - origin.longitude) * longitudeScale),
      y: round((row.latitude - origin.latitude) * 110540),
    };
  }

  function cellKey(x, y) {
    return `${Math.floor(x / CELL_SIZE_M)}:${Math.floor(y / CELL_SIZE_M)}`;
  }

  function circularMinuteDistance(left, right) {
    const direct = Math.abs(left - right);
    return Math.min(direct, 1440 - direct);
  }

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function round(value) {
    return Number(value.toFixed(6));
  }

  function environmentError(code, received) {
    const error = new Error(`${code}: received ${received}`);
    error.name = 'SunWalkerEnvironmentError';
    error.code = code;
    return error;
  }

  return Object.freeze({ canopyEnvelope, compile, sample, validateDataset, weatherAt });
});
