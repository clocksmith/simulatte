(function attachMaritimeNetworkRouter(root, factory) {
  const api = factory();
  root.MaritimeNetworkRouter = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createMaritimeNetworkRouter() {
  function planRoute({ lanes, vesselClasses, corridorId, vesselClassId, disruption = null }) {
    const base = lanes?.corridors?.find((row) => row.id === corridorId) || lanes?.corridors?.[0];
    const vessel = vesselClasses?.classes?.[vesselClassId] || Object.values(vesselClasses?.classes || {})[0];
    if (!base || !vessel) throw routeError('maritime_route_input_missing', 'Corridor and vessel class are required');
    const detour = disruption?.rerouteKind === 'cape_good_hope' ? capeDetour(base) : null;
    const distanceNm = detour?.distanceNm || base.distanceNm;
    const speedMultiplier = Math.max(0.15, Number(disruption?.speedMultiplier ?? 1));
    const speedKnots = vessel.designSpeedKnots * speedMultiplier;
    const sailingDays = distanceNm / (speedKnots * 24);
    return Object.freeze({
      schema: 'simulatte.maritimeRoutePlan.v1',
      id: `${base.id}:${disruption?.id || 'baseline'}`,
      corridorId: base.id,
      name: detour?.name || base.name,
      originPort: base.originPort,
      destinationPort: base.destinationPort,
      distanceNm,
      speedKnots,
      sailingDays,
      waypoints: Object.freeze((detour?.waypoints || base.waypoints || []).map(normalizeLatLon)),
      disruptionId: disruption?.id || null,
      algorithm: detour ? 'declared_cape_detour_v1' : 'declared_corridor_v1',
      claimBoundary: 'Scenario route over governed corridor waypoints; not live vessel routing or hydrographic navigation.',
    });
  }

  function routeIdForScenario(scenarioId) {
    const id = String(scenarioId || '').toLowerCase();
    return id.includes('transpacific') || id.includes('los-angeles') ? 'route-transpacific' : 'route-asia-europe';
  }

  function capeDetour(base) {
    if (base.id !== 'route-asia-europe') return null;
    return {
      name: `${base.name} via Cape of Good Hope`,
      distanceNm: Math.max(base.distanceNm + 4200, 14700),
      // Stored internally as [longitude, latitude].
      waypoints: [[121.47,31.23],[103.84,1.26],[80,6],[40,-20],[18.42,-33.93],[-5.3,36],[4.14,51.95]].map(([lon,lat]) => [lat,lon]),
    };
  }

  function normalizeLatLon(pair) {
    if (!Array.isArray(pair) || pair.length < 2) throw routeError('maritime_waypoint_invalid', 'Waypoint expected [latitude, longitude]');
    // Source fixtures currently encode [latitude, longitude]. Normalize to [longitude, latitude].
    return Object.freeze([Number(pair[1]), Number(pair[0])]);
  }

  function routeError(code, message) { const error = new Error(`${code}: ${message}`); error.name = 'MaritimeRouteError'; error.code = code; return error; }
  return Object.freeze({ planRoute, routeIdForScenario, normalizeLatLon });
});
