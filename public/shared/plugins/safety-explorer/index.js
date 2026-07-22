(function attachSafetyExplorerPlugin(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulattePluginSafetyExplorer = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createSafetyExplorerPlugin() {
  async function activate({ sdk }) {
    sdk.state.register(reduce, { audit: null });
    const index = sdk.datasets.require('nyc-crash-history-2025-07-to-2026-07-v1');
    const rows = new Map(index.segmentRows.map((row) => [row.segmentId, row]));
    // v2 (§17): severity separation + empirical shrinkage + uncertainty. Fatal/serious
    // events weigh more than property-only ones, and a single crash on a low-volume
    // segment is shrunk toward the corpus mean so it cannot dominate a route. Evidence
    // coverage is reported so a score is never presented as more certain than its count.
    const SHRINK_K = 4;
    const severityRaw = (row) => (row.crashCount || 0) + 3 * (row.injuryCount || 0) + 10 * (row.fatalityCount || 0);
    const priorMean = index.segmentRows.length ? index.segmentRows.reduce((sum, row) => sum + severityRaw(row), 0) / index.segmentRows.length : 0;
    const shrunkSeverity = (row) => { const count = row?.crashCount || 0; return ((count * severityRaw(row)) + SHRINK_K * priorMean) / (count + SHRINK_K); };
    const evidenceCoverage = (row) => { const count = row?.crashCount || 0; return Number((count / (count + SHRINK_K)).toFixed(3)); };

    function createRouteContributor() {
      return {
        id: 'safety-explorer:historical-observation',
        evaluateSegment({ segment }) {
          const row = rows.get(segment.id);
          return {
            eligible: true,
            costDimensions: {
              historicalObservation: row?.historicalObservationScore || 0,
              // routing.dimension.historical-observation.v2: shrunk severity-weighted risk.
              severityWeightedObservation: row ? Number(shrunkSeverity(row).toFixed(4)) : Number(priorMean.toFixed(4)),
            },
            rejectionReasons: [],
            receipt: row ? { ...row, shrunkSeverity: Number(shrunkSeverity(row).toFixed(4)), evidenceCoverage: evidenceCoverage(row) } : null,
          };
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
    // Neutral mobility-risk field (§18): shrunk severity-weighted observation for a
    // segment plus evidence coverage. Preserves the observed-vs-simulated distinction.
    const capabilities = {
      'field.mobility-risk.v1': (input) => {
        const row = input?.segmentId ? rows.get(input.segmentId) : null;
        return {
          schema: 'field.mobility-risk.v1',
          value: row ? Number(shrunkSeverity(row).toFixed(4)) : Number(priorMean.toFixed(4)),
          units: 'severity_weighted_observation',
          evidenceCoverage: row ? evidenceCoverage(row) : 0,
          observed: true, providerId: 'safety-explorer',
          claimBoundary: index.claimBoundary,
        };
      },
    };
    return Object.freeze({ id: 'safety-explorer', createRouteContributor, view, present, capabilities, dispose() {} });
  }
  function reduce(state, event) { return event.kind === 'safety-explorer.route-audited' ? { ...state, audit: event.audit } : state; }
  function sum(rows, key) { return Number(rows.reduce((total, row) => total + (row[key] || 0), 0).toFixed(6)); }
  return Object.freeze({ activate });
});
