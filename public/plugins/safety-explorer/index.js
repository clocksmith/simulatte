(function attachSafetyExplorerPlugin(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulattePluginSafetyExplorer = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createSafetyExplorerPlugin() {
  async function activate({ sdk }) {
    sdk.state.register(reduce, { audit: null });
    const index = sdk.datasets.require('nyc-crash-history-2025-07-to-2026-07-v1');
    const rows = new Map(index.segmentRows.map((row) => [row.segmentId, row]));

    function createRouteContributor() {
      return {
        id: 'safety-explorer:historical-observation',
        evaluateSegment({ segment }) {
          const row = rows.get(segment.id);
          return { eligible: true, costDimensions: { historicalObservation: row?.historicalObservationScore || 0 }, rejectionReasons: [], receipt: row || null };
        },
        evaluateRoute({ route }) {
          const physical = new Map();
          route.segmentIds.forEach((id) => { const row = rows.get(id); if (row && !physical.has(row.physicalKey)) physical.set(row.physicalKey, row); });
          const values = [...physical.values()];
          const audit = {
            schema: 'simulatte.plugin.safetyExplorerRouteAudit.v1',
            crashCount: sum(values, 'crashCount'), injuryCount: sum(values, 'injuryCount'), fatalityCount: sum(values, 'fatalityCount'),
            historicalObservationScore: sum(values, 'historicalObservationScore'), physicalSegmentsWithHistory: values.length,
            segmentIds: [...route.segmentIds],
            indexId: index.id, claimBoundary: index.claimBoundary,
          };
          sdk.events.propose({ pluginId: 'safety-explorer', kind: 'safety-explorer.route-audited', audit });
          sdk.receipts.append(audit);
          return audit;
        },
      };
    }

    function view() {
      const audit = sdk.state.read().audit;
      if (!audit) return null;
      return [
        { slot: 'inspector', title: 'Historical street observations', rows: [{ label: 'Recorded crashes', value: String(audit.crashCount) }, { label: 'Recorded injuries', value: String(audit.injuryCount) }, { label: 'Observation score', value: audit.historicalObservationScore.toFixed(3) }], actions: [] },
        { slot: 'hud', title: 'Historical observations', rows: [{ label: 'Crashes', value: String(audit.crashCount) }, { label: 'Score', value: audit.historicalObservationScore.toFixed(2) }], actions: [{ id: 'focus-observations', label: 'View route', command: { kind: 'camera.focus', targetId: 'observed-route' } }] },
      ];
    }
    function present() {
      const audit = sdk.state.read().audit;
      if (!audit?.segmentIds?.length) return null;
      const tone = audit.fatalityCount ? 'red' : audit.crashCount ? 'amber' : 'green';
      return { schema: 'simulatte.pluginPresentation.v1', markers: [], actors: [], paths: [{ id: 'observed-route', label: 'Historically observed route', segmentIds: audit.segmentIds, tone, widthM: 7, intensity: 1.25 }], cameraTargets: [{ id: 'observed-route', label: 'Historically observed route', nodeIds: [], segmentIds: audit.segmentIds, distanceM: 1100 }] };
    }
    return Object.freeze({ id: 'safety-explorer', createRouteContributor, view, present, dispose() {} });
  }
  function reduce(state, event) { return event.kind === 'safety-explorer.route-audited' ? { ...state, audit: event.audit } : state; }
  function sum(rows, key) { return Number(rows.reduce((total, row) => total + (row[key] || 0), 0).toFixed(6)); }
  return Object.freeze({ activate });
});
