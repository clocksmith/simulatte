(function attachAmenityRouterPlugin(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulattePluginAmenityRouter = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createAmenityRouterPlugin() {
  async function activate({ sdk }) {
    sdk.state.register(reduce, { audit: null });
    const index = sdk.datasets.require('nyc-bicycle-parking-route-amenity-v1');
    const rows = new Map(index.segmentRows.map((row) => [row.segmentId, row]));
    function createRouteContributor({ mission }) {
      const maximumDistanceM = mission.constraints.maximumBikeRackDistanceM;
      if (maximumDistanceM === null) return null;
      return {
        id: 'amenity-router:bicycle-rack',
        evaluateSegment({ segment }) {
          const row = rows.get(segment.id);
          const observed = row?.maximumNearestRackDistanceM ?? null;
          const eligible = observed !== null && observed <= maximumDistanceM;
          return { eligible, costDimensions: { amenityDistance: observed || 0 }, rejectionReasons: eligible ? [] : ['bicycle_rack_distance_exceeded'], receipt: row || null };
        },
        evaluateRoute({ route }) {
          const routeRows = route.segmentIds.map((id) => rows.get(id)).filter(Boolean);
          const limiting = routeRows.slice().sort((left, right) => (right.maximumNearestRackDistanceM || 0) - (left.maximumNearestRackDistanceM || 0))[0] || null;
          const audit = { schema: 'simulatte.plugin.amenityRouteAudit.v1', maximumDistanceM, maximumObservedDistanceM: limiting?.maximumNearestRackDistanceM ?? null, limitingRackId: limiting?.limitingRackId || null, pass: routeRows.length === route.segmentIds.length && routeRows.every((row) => row.maximumNearestRackDistanceM <= maximumDistanceM), indexId: index.id, claimBoundary: index.claimBoundary };
          sdk.events.propose({ pluginId: 'amenity-router', kind: 'amenity-router.route-audited', audit });
          sdk.receipts.append(audit);
          return audit;
        },
      };
    }
    function view() {
      const audit = sdk.state.read().audit;
      if (!audit) return null;
      return { slot: 'inspector', title: 'Route amenities', rows: [{ label: 'Bicycle-rack constraint', value: audit.pass ? 'Supported' : 'Not supported' }, { label: 'Farthest modeled distance', value: audit.maximumObservedDistanceM === null ? 'Unavailable' : `${Math.round(audit.maximumObservedDistanceM)} m` }], actions: [] };
    }
    return Object.freeze({ id: 'amenity-router', createRouteContributor, view, dispose() {} });
  }
  function reduce(state, event) { return event.kind === 'amenity-router.route-audited' ? { ...state, audit: event.audit } : state; }
  return Object.freeze({ activate });
});
