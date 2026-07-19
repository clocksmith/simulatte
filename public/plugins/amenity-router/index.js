(function attachAmenityRouterPlugin(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulattePluginAmenityRouter = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createAmenityRouterPlugin() {
  async function activate({ sdk }) {
    sdk.state.register(reduce, { audit: null, maximumDistanceM: null });
    const index = sdk.datasets.require('nyc-bicycle-parking-route-amenity-v1');
    const rows = new Map(index.segmentRows.map((row) => [row.segmentId, row]));
    function contributeRequest({ sourceText, mission }) {
      const match = /\bwithin\s+(\d+(?:\.\d+)?)\s*(meters?|metres?|m|feet|ft)\s+of\s+(?:a\s+)?bike\s+rack\b/i.exec(sourceText || '');
      if (!mission) return null;
      const maximumDistanceM = match ? Number(match[1]) * (/feet|ft/i.test(match[2]) ? 0.3048 : 1) : null;
      sdk.events.propose({ pluginId: 'amenity-router', kind: 'amenity-router.requested', maximumDistanceM });
      if (!match) return null;
      return { recognized: true, obligations: [{ id: 'amenity-router:bicycle-rack', kind: 'amenity_proximity', required: true }], unresolved: [] };
    }
    function createRouteContributor({ mission }) {
      const maximumDistanceM = sdk.state.read().maximumDistanceM;
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
    function settle({ journey }) {
      const state = sdk.state.read();
      if (state.maximumDistanceM === null) return null;
      const pass = state.audit?.pass === true && journey?.finalState?.status === 'completed';
      return { obligationResults: [{ obligationId: 'amenity-router:bicycle-rack', status: pass ? 'settled' : 'not_settled', pass }], stateIdentity: `${state.maximumDistanceM}:${state.audit?.maximumObservedDistanceM ?? 'missing'}`, losses: pass ? [] : ['amenity_proximity_not_settled'] };
    }
    return Object.freeze({ id: 'amenity-router', contributeRequest, createRouteContributor, settle, view, dispose() {} });
  }
  function reduce(state, event) {
    if (event.kind === 'amenity-router.requested') return { ...state, maximumDistanceM: event.maximumDistanceM };
    return event.kind === 'amenity-router.route-audited' ? { ...state, audit: event.audit } : state;
  }
  return Object.freeze({ activate });
});
