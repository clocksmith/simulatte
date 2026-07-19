(function attachAutonomyJourneyVerifier(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteAutonomyJourneyVerifier = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createAutonomyJourneyVerifier() {
  const DISTANCE_TOLERANCE_M = 0.000001;
  const STREET_WORDS = Object.freeze({ avenue: 'av', ave: 'av', street: 'st', str: 'st', boulevard: 'blvd', road: 'rd', lane: 'ln', place: 'pl', square: 'sq' });

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
    const obligations = mission.task.type === 'loop'
      ? loopObligations({ mission, state, ticks, violations, enteredSegmentIds, requiredByKind })
      : pointToPointObligations({ mission, state, violations, protectedPreferenceApplied, protectedSegments, sharedSegments, routeReceipts, requiredByKind, ticks, enteredSegments });
    const requiredFailures = obligations.filter((row) => row.required && !row.pass);
    const selectedBetCount = ticks.filter((row) => row.selectedBetId).length;
    const settledBetCount = settlements.length;
    const continuityPass = ticks.every((row, index) => row.tick === index);
    const partialLapDistanceM = mission.task.type === 'loop'
      ? round(state.distanceTraveledM - state.completedLaps * mission.grounding.circuitLengthM)
      : null;
    const termination = mission.task.type === 'loop' ? mission.task.termination : null;
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
        targetDistanceM: termination?.targetDistanceM ?? null,
        targetLaps: termination?.targetLaps ?? null,
        targetDurationSeconds: termination?.targetDurationSeconds ?? null,
        simulatedTimeSeconds: round(state.simulatedTimeSeconds),
        completedLaps: state.completedLaps,
        partialLapDistanceM,
        routeRevisionCount: ticks.filter((row) => row.route.reason === 'blocked_segment').length,
        proposedBetCount: ticks.reduce((sum, row) => sum + row.bets.length, 0),
        rejectedBetCount: ticks.reduce((sum, row) => sum + row.bets.filter((bet) => !bet.gate.accepted).length, 0),
        wonBetCount: settlements.filter((row) => row.verdict === 'won').length,
        lostBetCount: settlements.filter((row) => row.verdict === 'lost').length,
        minimumPedestrianClearanceM: minimumClearance(ticks),
      },
      claimBoundary: mission.task.type === 'loop'
        ? 'This verification proves deterministic traversal of the pinned park-property boundary circuit. The boundary source does not prove a surveyed sidewalk centerline or physical-world running capability.'
        : 'This verification settles deterministic trace obligations against the named world artifact. It does not establish physical-world autonomy or live traffic knowledge.',
    };
  }

  function pointToPointObligations({ mission, state, violations, protectedPreferenceApplied, protectedSegments, sharedSegments, routeReceipts, requiredByKind, ticks, enteredSegments }) {
    const avoidedStreetKeys = new Set(mission.constraints.avoidStreetNames.map(normalizeStreetName));
    const enteredAvoidedStreetNames = [...new Set(enteredSegments.map((segment) => segment.source?.street).filter((name) => avoidedStreetKeys.has(normalizeStreetName(name))))];
    const avoidanceReceipted = routeReceipts.every((route) => sameRows(route.avoidedStreetNames, mission.constraints.avoidStreetNames));
    const excludedStreetSegmentIds = [...new Set(routeReceipts.flatMap((route) => route.excludedStreetSegmentIds))];
    const rows = [
      obligation('arrival', state.status === 'completed' && state.currentNodeId === mission.destinationNodeId, requiredByKind.get('arrival'), {
        destinationNodeId: mission.destinationNodeId,
        finalNodeId: state.currentNodeId,
      }),
      obligation('ordered_stops', sameRows(state.completedStopNodeIds, mission.task.stopNodeIds), requiredByKind.get('ordered_stops'), {
        declaredStopNodeIds: [...mission.task.stopNodeIds],
        completedStopNodeIds: [...state.completedStopNodeIds],
        remainingStopNodeIds: [...state.remainingStopNodeIds],
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
      obligation('street_avoidance', enteredAvoidedStreetNames.length === 0 && avoidanceReceipted, requiredByKind.get('street_avoidance'), {
        avoidedStreetNames: [...mission.constraints.avoidStreetNames],
        enteredAvoidedStreetNames,
        routeReceiptCount: routeReceipts.length,
        avoidanceReceipted,
        excludedStreetSegmentIds,
        alreadyAbsentFromRoutableGraph: mission.constraints.avoidStreetNames.length > 0 && excludedStreetSegmentIds.length === 0,
      }),
      obligation('arrival_deadline', mission.constraints.maximumDurationSeconds === null || (
        state.status === 'completed' && state.simulatedTimeSeconds <= mission.constraints.maximumDurationSeconds + DISTANCE_TOLERANCE_M
      ), requiredByKind.get('arrival_deadline'), {
        maximumDurationSeconds: mission.constraints.maximumDurationSeconds,
        actualDurationSeconds: round(state.simulatedTimeSeconds),
      }),
      daylightObligation(mission, state, requiredByKind),
    ];
    if (mission.task.type === 'delivery') rows.splice(1, 0, obligation('payload_delivery', state.payloadStatus === 'delivered', requiredByKind.get('payload_delivery'), {
      payloadId: mission.task.payloadId,
      payloadStatus: state.payloadStatus,
    }));
    return rows;
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
    const termination = terminationObligation(mission, state, requiredByKind);
    const expectedCompletedLaps = terminationExpectedLaps(mission);
    return [
      termination,
      obligation('closed_loop', state.completedLaps >= expectedCompletedLaps, requiredByKind.get('closed_loop'), {
        circuitId: mission.task.circuitId,
        circuitLengthM: mission.grounding.circuitLengthM,
        expectedCompletedLaps,
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
      obligation('arrival_deadline', mission.constraints.maximumDurationSeconds === null || (
        state.status === 'completed' && state.simulatedTimeSeconds <= mission.constraints.maximumDurationSeconds + DISTANCE_TOLERANCE_M
      ), requiredByKind.get('arrival_deadline'), {
        maximumDurationSeconds: mission.constraints.maximumDurationSeconds,
        actualDurationSeconds: round(state.simulatedTimeSeconds),
      }),
      daylightObligation(mission, state, requiredByKind),
    ];
  }

  function daylightObligation(mission, state, requiredByKind) {
    const [sunrise, sunset] = mission.constraints.daylightWindowLocalMinutes;
    const start = mission.constraints.departureLocalMinutes;
    const end = start + state.simulatedTimeSeconds / 60;
    return obligation('daylight_window', !mission.constraints.daylightOnly || (start >= sunrise && end <= sunset + DISTANCE_TOLERANCE_M), requiredByKind.get('daylight_window'), {
      daylightOnly: mission.constraints.daylightOnly,
      daylightWindowLocalMinutes: [sunrise, sunset],
      departureLocalMinutes: start,
      arrivalLocalMinutes: round(end),
    });
  }

  function terminationObligation(mission, state, requiredByKind) {
    const termination = mission.task.termination;
    if (termination.kind === 'distance') {
      return obligation('distance_target', state.status === 'completed' && Math.abs(state.distanceTraveledM - termination.targetDistanceM) <= DISTANCE_TOLERANCE_M, requiredByKind.get('distance_target'), {
        requestedDistance: structuredClone(termination.requestedDistance),
        targetDistanceM: termination.targetDistanceM,
        distanceTraveledM: round(state.distanceTraveledM),
        toleranceM: DISTANCE_TOLERANCE_M,
      });
    }
    if (termination.kind === 'laps') {
      return obligation('laps_target', state.status === 'completed' && state.completedLaps === termination.targetLaps && Math.abs(state.distanceTraveledM - termination.targetDistanceM) <= DISTANCE_TOLERANCE_M, requiredByKind.get('laps_target'), {
        targetLaps: termination.targetLaps,
        completedLaps: state.completedLaps,
        targetDistanceM: termination.targetDistanceM,
        distanceTraveledM: round(state.distanceTraveledM),
        toleranceM: DISTANCE_TOLERANCE_M,
      });
    }
    return obligation('duration_target', state.status === 'completed' && Math.abs(state.simulatedTimeSeconds - termination.targetDurationSeconds) <= DISTANCE_TOLERANCE_M, requiredByKind.get('duration_target'), {
      requestedDuration: structuredClone(termination.requestedDuration),
      targetDurationSeconds: termination.targetDurationSeconds,
      simulatedTimeSeconds: round(state.simulatedTimeSeconds),
      toleranceSeconds: DISTANCE_TOLERANCE_M,
    });
  }

  function terminationExpectedLaps(mission) {
    const termination = mission.task.termination;
    if (termination.kind === 'duration') return 0;
    return Math.floor(termination.targetDistanceM / mission.grounding.circuitLengthM);
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

  function sameRows(left, right) {
    return left.length === right.length && left.every((row, index) => row === right[index]);
  }

  function normalizeStreetName(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean).map((word) => STREET_WORDS[word] || word).join(' ');
  }

  function round(value) {
    return Number(value.toFixed(9));
  }

  return { DISTANCE_TOLERANCE_M, verifyJourney };
});
