(function attachAccessibleJourneyPlugin(root, factory) {
  const audit = typeof module === 'object' && module.exports
    ? require('./accessibility-audit.js')
    : root.SimulatteAccessibilityAudit;
  const api = factory(audit);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulattePluginAccessibleJourney = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createAccessibleJourneyPlugin(auditApi) {
  async function activate({ sdk }) {
    sdk.state.register(reduce, { audit: null });
    const index = sdk.datasets.require('nyc-pedestrian-ramp-accessibility-v1');

    function createRouteContributor({ mission }) {
      if (!mission.constraints.accessibilityProfile) return null;
      return {
        id: 'accessible-journey:eligibility',
        evaluateSegment({ segment, worldModel }) {
          const result = auditApi.auditRouteAccessibility({ route: { segmentIds: [segment.id] }, worldModel, index });
          return { eligible: result.verdict === 'supported', costDimensions: {}, rejectionReasons: result.verdict === 'supported' ? [] : [`accessibility_${result.verdict}`], receipt: result };
        },
        evaluateRoute({ route, worldModel }) {
          const result = { ...auditApi.auditRouteAccessibility({ route, worldModel, index }), requestedProfile: mission.constraints.accessibilityProfile, enforced: true };
          sdk.events.propose({ pluginId: 'accessible-journey', kind: 'accessible-journey.route-audited', audit: result });
          sdk.receipts.append({ schema: 'simulatte.plugin.accessibleJourneyReceipt.v1', audit: result });
          return result;
        },
      };
    }

    function view() {
      const result = sdk.state.read().audit;
      if (!result) return null;
      return { slot: 'inspector', title: 'Accessibility', rows: [{ label: 'Route evidence', value: result.verdict }, { label: 'Ramp evidence', value: `${result.counts?.nodesWithRampEvidence || 0} nodes` }], actions: [] };
    }

    return Object.freeze({ id: 'accessible-journey', createRouteContributor, view, dispose() {} });
  }

  function reduce(state, event) {
    return event.kind === 'accessible-journey.route-audited' ? { ...state, audit: event.audit } : state;
  }

  return Object.freeze({ activate });
});
