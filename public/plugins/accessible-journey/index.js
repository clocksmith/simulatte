(function attachAccessibleJourneyPlugin(root, factory) {
  const audit = typeof module === 'object' && module.exports
    ? require('./accessibility-audit.js')
    : root.SimulatteAccessibilityAudit;
  const api = factory(audit);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulattePluginAccessibleJourney = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createAccessibleJourneyPlugin(auditApi) {
  async function activate({ sdk }) {
    sdk.state.register(reduce, { audit: null, requestedProfile: null });
    const index = sdk.datasets.require('nyc-pedestrian-ramp-accessibility-v1');

    function contributeRequest({ sourceText, mission }) {
      const requestedProfile = /\b(?:wheelchair|mobility\s+(?:device|aid)|step[- ]?free|accessible\s+route)\b/i.test(sourceText || '') ? 'wheelchair' : null;
      if (!mission) return null;
      sdk.events.propose({ pluginId: 'accessible-journey', kind: 'accessible-journey.requested', requestedProfile });
      if (!requestedProfile) return null;
      return { recognized: true, obligations: [{ id: 'accessible-journey:route-eligibility', kind: 'accessibility_route_eligibility', required: true }], unresolved: [] };
    }

    function createRouteContributor({ mission }) {
      const requestedProfile = sdk.state.read().requestedProfile;
      if (!requestedProfile) return null;
      return {
        id: 'accessible-journey:eligibility',
        evaluateSegment({ segment, worldModel }) {
          const result = auditApi.auditRouteAccessibility({ route: { segmentIds: [segment.id] }, worldModel, index });
          return { eligible: result.verdict === 'supported', costDimensions: {}, rejectionReasons: result.verdict === 'supported' ? [] : [`accessibility_${result.verdict}`], receipt: result };
        },
        evaluateRoute({ route, worldModel }) {
          const result = { ...auditApi.auditRouteAccessibility({ route, worldModel, index }), requestedProfile, enforced: true };
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

    function settle({ journey }) {
      const state = sdk.state.read();
      if (!state.requestedProfile) return null;
      const pass = state.audit?.verdict === 'supported' && journey?.finalState?.status === 'completed';
      return { obligationResults: [{ obligationId: 'accessible-journey:route-eligibility', status: pass ? 'settled' : 'not_settled', pass }], stateIdentity: `${state.requestedProfile}:${state.audit?.verdict || 'missing'}`, losses: pass ? [] : ['accessibility_evidence_not_settled'] };
    }

    return Object.freeze({ id: 'accessible-journey', contributeRequest, createRouteContributor, settle, view, dispose() {} });
  }

  function reduce(state, event) {
    if (event.kind === 'accessible-journey.requested') return { ...state, requestedProfile: event.requestedProfile };
    return event.kind === 'accessible-journey.route-audited' ? { ...state, audit: event.audit } : state;
  }

  return Object.freeze({ activate });
});
