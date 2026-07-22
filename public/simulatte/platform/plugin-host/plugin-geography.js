(function attachPluginGeography(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulattePluginGeography = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createPluginGeographyModule() {
  // WGS84 <-> world-planar projection port. Country-scale worlds carry a
  // `coordinateSystem` block describing an equirectangular projection anchored at a
  // reference latitude/longitude. This lets a plugin present national geography using
  // real longitude/latitude and have the host resolve stable {x, y} world metres,
  // instead of minting fake world node IDs.
  const EARTH_METERS_PER_DEGREE_LAT = 111320;
  const DEFAULT_PROJECTION = Object.freeze({
    kind: 'equirectangular',
    originLongitude: -98.5795,
    originLatitude: 39.8283,
    referenceLatitude: 39.8283,
    // Country worlds compress real metres so the planar extent stays renderable.
    metersPerUnit: 1,
    yAxis: 'north-up',
  });

  function projectionFromWorld(world) {
    const declared = world && world.coordinateSystem && world.coordinateSystem.projection;
    if (!declared) return DEFAULT_PROJECTION;
    return Object.freeze({ ...DEFAULT_PROJECTION, ...declared });
  }

  function createProjection(projection) {
    const spec = Object.freeze({ ...DEFAULT_PROJECTION, ...(projection || {}) });
    const metersPerDegLat = EARTH_METERS_PER_DEGREE_LAT;
    const metersPerDegLon = EARTH_METERS_PER_DEGREE_LAT * Math.cos((spec.referenceLatitude * Math.PI) / 180);
    const yScale = spec.yAxis === 'south-up' ? -1 : 1;

    function project(coordinate) {
      const { longitude, latitude } = coordinate || {};
      if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) throw geographyError('geography_coordinate_invalid', `Projection expected finite longitude/latitude, received ${longitude}, ${latitude}`);
      const x = ((longitude - spec.originLongitude) * metersPerDegLon) / spec.metersPerUnit;
      const y = (yScale * (latitude - spec.originLatitude) * metersPerDegLat) / spec.metersPerUnit;
      return { x, y };
    }

    function unproject(point) {
      const { x, y } = point || {};
      if (!Number.isFinite(x) || !Number.isFinite(y)) throw geographyError('geography_point_invalid', `Unproject expected finite x/y, received ${x}, ${y}`);
      const longitude = spec.originLongitude + (x * spec.metersPerUnit) / metersPerDegLon;
      const latitude = spec.originLatitude + (yScale * y * spec.metersPerUnit) / metersPerDegLat;
      return { longitude, latitude };
    }

    // Great-circle distance (haversine) between two WGS84 coordinates, in metres.
    function distanceMeters(a, b) {
      const toRad = (value) => (value * Math.PI) / 180;
      const dLat = toRad(b.latitude - a.latitude);
      const dLon = toRad(b.longitude - a.longitude);
      const lat1 = toRad(a.latitude);
      const lat2 = toRad(b.latitude);
      const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
      return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(h)));
    }

    return Object.freeze({ schema: 'simulatte.geographyProjection.v1', spec, project, unproject, distanceMeters });
  }

  function createGeographyPort({ world = null, projection = null } = {}) {
    const active = createProjection(projection || projectionFromWorld(world));
    function forPlugin() {
      return Object.freeze({
        schema: 'simulatte.geographyPort.v1',
        projection: active.spec,
        project: active.project,
        unproject: active.unproject,
        distanceMeters: active.distanceMeters,
        projectMany(coordinates) { return coordinates.map((coordinate) => active.project(coordinate)); },
      });
    }
    return Object.freeze({ projection: active, forPlugin });
  }

  function geographyError(code, message) {
    const error = new Error(`${code}: ${message}`);
    error.name = 'SimulattePluginGeographyError';
    error.code = code;
    return error;
  }

  return { DEFAULT_PROJECTION, createGeographyPort, createProjection, projectionFromWorld };
});
