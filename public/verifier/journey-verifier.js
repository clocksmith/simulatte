(function attachAutonomyJourneyVerifier(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteAutonomyJourneyVerifier = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createAutonomyJourneyVerifier() {
  const DISTANCE_TOLERANCE_M = 0.000001;

  function verifyJourney({ mission, state, receiptChain, worldModel }) {
    const ticks = receiptChain.entries.map((entry) => entry.payload).filter((row) => row.schema === 'simulatte.autonomyTickReceipt.v2');
    const violations = ticks.flatMap((row) => row.violations || []);
    const enteredSegmentIds = ticks.map((row) => row.transition && row.transition.enteredSegmentId).filter(Boolean);
    const enteredSegments = enteredSegmentIds.map((id) => worldModel.segment(id));
    const sharedSegments = enteredSegments.filter((row) => row.laneType === 'shared').map((row) => row.id);
    const protectedSegments = enteredSegments.filter((row) => row.laneType === 'protected').map((row) => row.id);
    const routeReceipts = ticks.map((row) => row.observation && row.observation.route).filter(Boolean);
    const protectedPreferenceApplied = mission.constraints.lanePreference !== 'protected' || routeReceipts.every((route) =>
      route.algorithm === 'a_star_v1' && route.costBreakdown.weights.unprotectedPreferencePenalty > 0
    );
    const settlements = ticks.map((row) => row.settlement).filter(Boolean);
    const requiredByKind = new Map(mission.obligations.map((row) => [row.kind, row.required]));
    const obligations = mission.task.type === 'loop_distance'
      ? loopObligations({ mission, state, ticks, violations, enteredSegmentIds, requiredByKind })
      : deliveryObligations({ mission, state, violations, protectedPreferenceApplied, protectedSegments, sharedSegments, routeReceipts, requiredByKind, ticks });
    const requiredFailures = obligations.filter((row) => row.required && !row.pass);
    const selectedBetCount = ticks.filter((row) => row.selectedBetId).length;
    const settledBetCount = settlements.length;
    const continuityPass = ticks.every((row, index) => row.tick === index);
    const partialLapDistanceM = mission.task.type === 'loop_distance'
      ? round(state.distanceTraveledM - state.completedLaps * mission.grounding.circuitLengthM)
      : null;
    return {
      schema: 'simulatte.autonomyJourneyVerification.v2',
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
        targetDistanceM: mission.task.targetDistanceM || null,
        completedLaps: state.completedLaps,
        partialLapDistanceM,
        routeRevisionCount: ticks.filter((row) => row.route.reason === 'blocked_segment').length,
        proposedBetCount: ticks.reduce((sum, row) => sum + row.bets.length, 0),
        rejectedBetCount: ticks.reduce((sum, row) => sum + row.bets.filter((bet) => !bet.gate.accepted).length, 0),
        wonBetCount: settlements.filter((row) => row.verdict === 'won').length,
        lostBetCount: settlements.filter((row) => row.verdict === 'lost').length,
        minimumPedestrianClearanceM: minimumClearance(ticks),
      },
      claimBoundary: mission.task.type === 'loop_distance'
        ? 'This verification proves deterministic traversal of the pinned park-property boundary circuit. The boundary source does not prove a surveyed sidewalk centerline or physical-world running capability.'
        : 'This verification settles deterministic trace obligations against the named world artifact. It does not establish physical-world autonomy or live traffic knowledge.',
    };
  }

  function deliveryObligations({ mission, state, violations, protectedPreferenceApplied, protectedSegments, sharedSegments, routeReceipts, requiredByKind, ticks }) {
    return [
      obligation('arrival', state.status === 'completed' && state.currentNodeId === mission.destinationNodeId, requiredByKind.get('arrival'), {
        destinationNodeId: mission.destinationNodeId,
        finalNodeId: state.currentNodeId,
      }),
      obligation('payload_delivery', state.payloadStatus === 'delivered', requiredByKind.get('payload_delivery'), {
        payloadId: mission.task.payloadId,
        payloadStatus: state.payloadStatus,
      }),
      complianceObligation('signal_compliance', 'signal_compliance', violations, requiredByKind),
      obligation('pedestrian_yield', !violations.some((row) => row.kind === 'pedestrian_clearance'), requiredByKind.get('pedestrian_yield'), {
        violationCount: violations.filter((row) => row.kind === 'pedestrian_clearance').length,
        minimumObservedClearanceM: minimumClearance(ticks),
      }),
      obligation('lane_preference', protectedPreferenceApplied, requiredByKind.get('lane_preference'), {
        lanePreference: mission.constraints.lanePreference,
        interpretation: 'preference_weight_applied_to_route_search',
        protectedSegmentIds: protectedSegments,
        sharedSegmentIds: sharedSegments,
        routeReceiptCount: routeReceipts.length,
      }),
    ];
  }

  function loopObligations({ mission, state, ticks, violations, enteredSegmentIds, requiredByKind }) {
    const circuitSegmentIds = mission.grounding.segmentIds;
    const lapReceipts = ticks.map((row) => row.lapCompleted).filter(Boolean);
    const boundaryOrderPass = enteredSegmentIds.every((id, index) => id === circuitSegmentIds[index % circuitSegmentIds.length]);
    const lapAccountingPass = lapReceipts.length === state.completedLaps && lapReceipts.every((receipt, index) =>
      receipt.lapNumber === index + 1
      && receipt.circuitId === mission.task.circuitId
      && Math.abs(receipt.lapDistanceM - mission.grounding.circuitLengthM) <= DISTANCE_TOLERANCE_M
      && receipt.boundaryGeometrySha256 === mission.grounding.source.geometryWgs84Sha256
      && Math.abs(receipt.cumulativeDistanceM - receipt.lapNumber * mission.grounding.circuitLengthM) <= DISTANCE_TOLERANCE_M
    );
    return [
      obligation('distance_target', state.status === 'completed' && Math.abs(state.distanceTraveledM - mission.task.targetDistanceM) <= DISTANCE_TOLERANCE_M, requiredByKind.get('distance_target'), {
        requestedDistance: structuredClone(mission.task.requestedDistance),
        targetDistanceM: mission.task.targetDistanceM,
        distanceTraveledM: round(state.distanceTraveledM),
        toleranceM: DISTANCE_TOLERANCE_M,
      }),
      obligation('closed_loop', state.completedLaps >= Math.floor(mission.task.targetDistanceM / mission.grounding.circuitLengthM), requiredByKind.get('closed_loop'), {
        circuitId: mission.task.circuitId,
        circuitLengthM: mission.grounding.circuitLengthM,
        completedLaps: state.completedLaps,
        lapReceipts,
      }),
      obligation('boundary_adherence', boundaryOrderPass && enteredSegmentIds.every((id) => circuitSegmentIds.includes(id)), requiredByKind.get('boundary_adherence'), {
        circuitId: mission.task.circuitId,
        boundaryGeometrySha256: mission.grounding.source.geometryWgs84Sha256,
        declaredSegmentIds: [...circuitSegmentIds],
        enteredSegmentIds,
        orderedTraversal: boundaryOrderPass,
      }),
      obligation('lap_accounting', lapAccountingPass, requiredByKind.get('lap_accounting'), {
        expectedCompletedLaps: state.completedLaps,
        receiptCount: lapReceipts.length,
        lapReceipts,
      }),
      obligation('pedestrian_yield', !violations.some((row) => row.kind === 'pedestrian_clearance'), requiredByKind.get('pedestrian_yield'), {
        violationCount: violations.filter((row) => row.kind === 'pedestrian_clearance').length,
        minimumObservedClearanceM: minimumClearance(ticks),
      }),
    ];
  }

  function complianceObligation(kind, violationKind, violations, requiredByKind) {
    return obligation(kind, !violations.some((row) => row.kind === violationKind), requiredByKind.get(kind), {
      violationCount: violations.filter((row) => row.kind === violationKind).length,
    });
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

  return { DISTANCE_TOLERANCE_M, verifyJourney };
});
