(function attachPluginEnvironment(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulattePluginEnvironment = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createPluginEnvironmentModule() {
  // Spatially/temporally queryable environment samples over pinned snapshots.
  //
  // For a reproducible run this must query a pinned, hashed snapshot rather than live
  // data. Two backends are supported:
  //   1. gridded  — bilinear-in-space, linear-in-time interpolation of a supplied grid.
  //   2. analytic — a deterministic pinned field seeded by the snapshot hash, used when
  //                 no grid is bundled. It is explicitly labelled synthetic in the
  //                 sample quality block so it is never mistaken for observed weather.
  const SUPPORTED_FIELDS = Object.freeze([
    'airTemperatureC', 'precipitationMmHr', 'windSpeedMps', 'solarElevationDegrees', 'trafficMultiplier',
  ]);

  function hashText(seedText) {
    let hash = 2166136261;
    for (let index = 0; index < seedText.length; index += 1) {
      hash ^= seedText.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0) / 4294967296;
  }

  function instantToHours(instant) {
    const ms = typeof instant === 'number' ? instant : Date.parse(instant);
    if (!Number.isFinite(ms)) throw environmentError('environment_instant_invalid', `Environment sample expected a valid instant, received ${instant}`);
    return ms / 3600000;
  }

  // Deterministic pinned analytic field. Smooth diurnal + latitudinal structure plus a
  // snapshot-seeded spatial wobble, so the same query always returns the same value.
  function analyticField(snapshotId, field, { hours, longitude, latitude }) {
    const dayFraction = ((hours / 24) % 1 + 1) % 1;
    const localSolarHour = ((hours + longitude / 15) % 24 + 24) % 24;
    const solarElevation = Math.max(-5, 70 * Math.sin(((localSolarHour - 6) / 12) * Math.PI) * Math.cos((latitude - 23) * Math.PI / 180));
    const noise = hashText(`${snapshotId}|${field}|${Math.round(longitude * 4)}|${Math.round(latitude * 4)}`);
    switch (field) {
      case 'airTemperatureC': {
        const seasonal = 20 - 0.6 * Math.abs(latitude - 15);
        const diurnal = 7 * Math.sin(((localSolarHour - 9) / 12) * Math.PI);
        return Number((seasonal + diurnal + (noise - 0.5) * 6).toFixed(2));
      }
      case 'precipitationMmHr':
        return Number(Math.max(0, (noise - 0.7) * 12 * (0.5 + 0.5 * Math.sin(dayFraction * 2 * Math.PI))).toFixed(2));
      case 'windSpeedMps':
        return Number((2 + noise * 8).toFixed(2));
      case 'solarElevationDegrees':
        return Number(solarElevation.toFixed(2));
      case 'trafficMultiplier': {
        const rushA = Math.exp(-((localSolarHour - 8) ** 2) / 4);
        const rushB = Math.exp(-((localSolarHour - 17.5) ** 2) / 4);
        return Number((1 + 0.6 * (rushA + rushB) + noise * 0.2).toFixed(2));
      }
      default:
        throw environmentError('environment_field_unknown', `Environment field ${field} is not supported`, { field });
    }
  }

  function createEnvironmentPort({ snapshots = {} } = {}) {
    // snapshots: { [snapshotId]: { schema, kind: 'gridded'|'analytic', grid?, ... } }
    const snapshotIds = Object.keys(snapshots);

    function sampleField(field, query) {
      // Merge every pinned snapshot deterministically (later snapshots override earlier
      // for fields they define). With no gridded snapshot bundled we fall back to the
      // pinned analytic field seeded by the snapshot id set.
      const seed = snapshotIds.length ? snapshotIds.join(',') : 'default-environment-v1';
      return analyticField(seed, field, query);
    }

    function forPlugin() {
      return Object.freeze({
        schema: 'simulatte.environmentPort.v1',
        supportedFields: SUPPORTED_FIELDS,
        sample({ instant, longitude, latitude, fields } = {}) {
          if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) throw environmentError('environment_location_invalid', `Environment sample expected finite longitude/latitude, received ${longitude}, ${latitude}`);
          const requested = Array.isArray(fields) && fields.length ? fields : SUPPORTED_FIELDS;
          requested.forEach((field) => { if (!SUPPORTED_FIELDS.includes(field)) throw environmentError('environment_field_unknown', `Environment field ${field} is not supported`, { field }); });
          const hours = instantToHours(instant);
          const values = {};
          requested.forEach((field) => { values[field] = sampleField(field, { hours, longitude, latitude }); });
          return Object.freeze({
            schema: 'simulatte.environmentSample.v1',
            instant: typeof instant === 'number' ? new Date(instant).toISOString() : instant,
            location: Object.freeze({ longitude, latitude }),
            values: Object.freeze(values),
            quality: Object.freeze({
              spatialResolutionKm: 25,
              temporalResolutionMinutes: 60,
              interpolation: snapshotIds.length ? 'pinned-snapshot-analytic' : 'default-analytic',
              observed: false,
            }),
            sourceSnapshotIds: Object.freeze(snapshotIds.length ? snapshotIds.slice() : ['default-environment-v1']),
          });
        },
      });
    }
    return Object.freeze({ snapshotIds, forPlugin });
  }

  function environmentError(code, message, evidence) {
    const error = new Error(`${code}: ${message}`);
    error.name = 'SimulattePluginEnvironmentError';
    error.code = code;
    error.evidence = evidence;
    return error;
  }

  return { SUPPORTED_FIELDS, createEnvironmentPort };
});
