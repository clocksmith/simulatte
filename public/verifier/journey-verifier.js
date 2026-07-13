(function attachAutonomyJourneyVerifier(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteAutonomyJourneyVerifier = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createAutonomyJourneyVerifier() {
  function verifyJourney({ mission, state, receiptChain, worldModel }) {
    const ticks = receiptChain.entries.map((entry) => entry.payload).filter((row) => row.schema === 'simulatte.autonomyTickReceipt.v1');
    const violations = ticks.flatMap((row) => row.violations || []);
    const enteredSegmentIds = ticks.map((row) => row.transition && row.transition.enteredSegmentId).filter(Boolean);
    const enteredSegments = enteredSegmentIds.map((id) => worldModel.segment(id));
    const sharedSegments = enteredSegments.filter((row) => row.laneType === 'shared').map((row) => row.id);
    const protectedSegments = enteredSegments.filter((row) => row.laneType === 'protected').map((row) => row.id);
    const routePreferenceReceipts = ticks.map((row) => row.observation && row.observation.route).filter(Boolean);
    const protectedPreferenceApplied = mission.constraints.lanePreference !== 'protected' || routePreferenceReceipts.every((route) =>
      route.algorithm === 'a_star_v1' && route.costBreakdown.weights.unprotectedPreferencePenalty > 0
    );
    const settlements = ticks.map((row) => row.settlement).filter(Boolean);
    const requiredByKind = new Map(mission.obligations.map((row) => [row.kind, row.required]));
    const obligations = [
      obligation('arrival', state.status === 'completed' && state.currentNodeId === mission.destinationNodeId, requiredByKind.get('arrival'), {
        destinationNodeId: mission.destinationNodeId,
        finalNodeId: state.currentNodeId,
      }),
      obligation('payload_delivery', state.payloadStatus === 'delivered', requiredByKind.get('payload_delivery'), {
        payloadId: mission.task.payloadId,
        payloadStatus: state.payloadStatus,
      }),
      obligation('signal_compliance', !violations.some((row) => row.kind === 'signal_compliance'), requiredByKind.get('signal_compliance'), {
        violationCount: violations.filter((row) => row.kind === 'signal_compliance').length,
      }),
      obligation('pedestrian_yield', !violations.some((row) => row.kind === 'pedestrian_clearance'), requiredByKind.get('pedestrian_yield'), {
        violationCount: violations.filter((row) => row.kind === 'pedestrian_clearance').length,
        minimumObservedClearanceM: minimumClearance(ticks),
      }),
      obligation('lane_preference', protectedPreferenceApplied, requiredByKind.get('lane_preference'), {
        lanePreference: mission.constraints.lanePreference,
        interpretation: 'preference_weight_applied_to_route_search',
        protectedSegmentIds: protectedSegments,
        sharedSegmentIds: sharedSegments,
        routeReceiptCount: routePreferenceReceipts.length,
      }),
    ];
    const requiredFailures = obligations.filter((row) => row.required && !row.pass);
    const selectedBetCount = ticks.filter((row) => row.selectedBetId).length;
    const settledBetCount = settlements.length;
    const continuityPass = ticks.every((row, index) => row.tick === index);
    return {
      schema: 'simulatte.autonomyJourneyVerification.v1',
      pass: requiredFailures.length === 0 && violations.length === 0 && continuityPass && selectedBetCount === settledBetCount,
      terminalState: state.terminalReason || state.status,
      obligations,
      requiredFailureIds: requiredFailures.map((row) => row.id),
      violations,
      traceChecks: {
        continuousTickSequence: continuityPass,
        oneSettlementPerSelectedBet: selectedBetCount === settledBetCount,
        selectedBetCount,
        settledBetCount,
      },
      metrics: {
        tickCount: ticks.length,
        distanceTraveledM: round(state.distanceTraveledM),
        routeRevisionCount: ticks.filter((row) => row.route.reason === 'blocked_segment').length,
        proposedBetCount: ticks.reduce((sum, row) => sum + row.bets.length, 0),
        rejectedBetCount: ticks.reduce((sum, row) => sum + row.bets.filter((bet) => !bet.gate.accepted).length, 0),
        wonBetCount: settlements.filter((row) => row.verdict === 'won').length,
        lostBetCount: settlements.filter((row) => row.verdict === 'lost').length,
        minimumPedestrianClearanceM: minimumClearance(ticks),
      },
      claimBoundary: 'This verification settles deterministic trace obligations against the named world artifact. It does not establish physical-world autonomy or live traffic knowledge.',
    };
  }

  function obligation(kind, pass, required, evidence) {
    return { id: `obligation-${kind.replaceAll('_', '-')}`, kind, required: required === true, pass: Boolean(pass), evidence };
  }

  function minimumClearance(ticks) {
    const values = ticks.map((row) => row.transition && row.transition.minimumClearanceM).filter(Number.isFinite);
    return values.length ? round(Math.min(...values)) : null;
  }

  function round(value) {
    return Number(value.toFixed(9));
  }

  return { verifyJourney };
});
