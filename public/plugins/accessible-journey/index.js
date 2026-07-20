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
      const requestedProfile = /\baccessibility\s+(?:audit|evidence)\b/i.test(sourceText || '')
        ? 'audit'
        : /\b(?:wheelchair|mobility\s+(?:device|aid)|step[- ]?free|accessible\s+route)\b/i.test(sourceText || '') ? 'wheelchair' : null;
      if (!mission) return null;
      sdk.events.propose({ pluginId: 'accessible-journey', kind: 'accessible-journey.requested', requestedProfile });
      if (!requestedProfile) return null;
      return { recognized: true, obligations: [{ id: 'accessible-journey:route-eligibility', kind: requestedProfile === 'audit' ? 'accessibility_route_evidence' : 'accessibility_route_eligibility', required: true }], unresolved: [] };
    }

    function createRouteContributor({ mission }) {
      const requestedProfile = sdk.state.read().requestedProfile;
      if (!requestedProfile) return null;
      return {
        id: 'accessible-journey:eligibility',
        evaluateSegment({ segment, worldModel }) {
          const result = auditApi.auditRouteAccessibility({ route: { segmentIds: [segment.id] }, worldModel, index });
          const eligible = requestedProfile === 'audit' || result.verdict === 'supported';
          return { eligible, costDimensions: {}, rejectionReasons: eligible ? [] : [`accessibility_${result.verdict}`], receipt: result };
        },
        evaluateRoute({ route, worldModel }) {
          const result = { ...auditApi.auditRouteAccessibility({ route, worldModel, index }), requestedProfile, enforced: true, segmentIds: [...route.segmentIds] };
          sdk.events.propose({ pluginId: 'accessible-journey', kind: 'accessible-journey.route-audited', audit: result });
          sdk.receipts.append({ schema: 'simulatte.plugin.accessibleJourneyReceipt.v1', audit: result });
          return result;
        },
      };
    }

    function view(context = {}) {
      const result = sdk.state.read().audit;
      if (!result) return { slot: context.compositionSize === 1 ? 'map' : 'inspector', title: 'Accessibility evidence', rows: [{ label: 'Activation', value: 'Choose an accessibility-audit route' }], actions: [] };
      return [
        { slot: 'inspector', title: 'Accessibility', rows: [{ label: 'Route evidence', value: result.verdict }, { label: 'Ramp evidence', value: `${result.counts?.nodesWithRampEvidence || 0} nodes` }], actions: [] },
        { slot: 'hud', title: 'Accessibility audit', rows: [{ label: 'Evidence', value: result.verdict }, { label: 'Ramps checked', value: String(result.counts?.nodesWithRampEvidence || 0) }], actions: [{ id: 'focus-route', label: 'View route', command: { kind: 'camera.focus', targetId: 'accessible-route' } }] },
      ];
    }

    function present() {
      const result = sdk.state.read().audit;
      if (!result?.segmentIds?.length) return null;
      const failureNodeIds = [...new Set([...(result.failures?.missingNodeIds || []), ...(result.failures?.failedRamps || []).map((row) => row.nodeId), ...(result.failures?.unresolvedRamps || []).map((row) => row.nodeId)])];
      return presentation({
        paths: [{ id: 'accessible-route', label: 'Accessibility evidence route', segmentIds: result.segmentIds, tone: result.verdict === 'supported' ? 'green' : 'amber', widthM: 7, intensity: 1.25 }],
        markers: failureNodeIds.map((nodeId, index) => ({ id: `ramp-${index}`, label: 'Ramp evidence boundary', nodeId, tone: 'red', heightM: 24, radiusM: 2.2, intensity: 1.4 })),
        cameraTargets: [{ id: 'accessible-route', label: 'Accessibility evidence route', nodeIds: [], segmentIds: result.segmentIds, distanceM: 1100 }],
      });
    }

    function settle({ journey }) {
      const state = sdk.state.read();
      if (!state.requestedProfile) return null;
      const pass = Boolean(state.audit) && journey?.finalState?.status === 'completed' && (state.requestedProfile === 'audit' || state.audit.verdict === 'supported');
      return { obligationResults: [{ obligationId: 'accessible-journey:route-eligibility', status: pass ? 'settled' : 'not_settled', pass }], stateIdentity: `${state.requestedProfile}:${state.audit?.verdict || 'missing'}`, losses: pass ? [] : ['accessibility_evidence_not_settled'] };
    }

    return Object.freeze({ id: 'accessible-journey', contributeRequest, createRouteContributor, settle, view, present, dispose() {} });
  }

  function reduce(state, event) {
    if (event.kind === 'accessible-journey.requested') return { ...state, requestedProfile: event.requestedProfile };
    return event.kind === 'accessible-journey.route-audited' ? { ...state, audit: event.audit } : state;
  }

  function presentation({ markers = [], paths = [], actors = [], cameraTargets = [] }) { return { schema: 'simulatte.pluginPresentation.v1', markers, paths, actors, cameraTargets }; }

  return Object.freeze({ activate });
});
