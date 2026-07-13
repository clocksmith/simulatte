(function attachAutonomySafetyGate(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteAutonomySafetyGate = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createAutonomySafetyGate() {
  function gateActionBets({ proposals, state, route, worldModel, embodiment, mission, policy }) {
    return proposals.map((proposal) => {
      const checks = safetyChecks({ proposal, state, route, worldModel, embodiment, mission, policy });
      const accepted = checks.every((row) => row.pass);
      return {
        bet: { ...proposal.bet, status: accepted ? 'eligible' : 'rejected' },
        transition: proposal.transition,
        gate: {
          schema: 'simulatte.autonomySafetyGateReceipt.v1',
          accepted,
          blockingCheckIds: checks.filter((row) => !row.pass).map((row) => row.id),
          checks,
        },
      };
    });
  }

  function safetyChecks({ proposal, state, route, worldModel, embodiment, mission, policy }) {
    const { bet, transition } = proposal;
    const targetSegmentId = bet.action.targetSegmentId;
    const activeSegmentId = targetSegmentId || state.currentSegmentId;
    const activeSegment = activeSegmentId ? worldModel.segment(activeSegmentId) : null;
    const blocked = new Set(worldModel.blockedSegmentIds(state.tick));
    const signal = targetSegmentId && state.currentNodeId
      ? worldModel.signalForEntry(state.currentNodeId, targetSegmentId, state.tick)
      : null;
    const maximumSpeed = activeSegment
      ? Math.min(activeSegment.speedLimitMps, embodiment.dynamics.maximumSpeedMps, mission.constraints.maximumSpeedMps)
      : Math.min(embodiment.dynamics.maximumSpeedMps, mission.constraints.maximumSpeedMps);
    const routeTarget = state.currentSegmentId || route.segmentIds[0] || null;
    return [
      check('network_containment', !policy.safety.requiresNetworkContainment || Boolean(transition.state.currentNodeId || transition.state.currentSegmentId), {
        currentNodeId: transition.state.currentNodeId,
        currentSegmentId: transition.state.currentSegmentId,
      }),
      check('mode_eligibility', !policy.safety.requiresModeEligibility || !activeSegment || activeSegment.allowedModes.includes(embodiment.mode), {
        mode: embodiment.mode,
        segmentId: activeSegmentId,
      }),
      check('blocked_segment', !targetSegmentId || !blocked.has(targetSegmentId), {
        targetSegmentId,
        blockedSegmentIds: [...blocked].sort(),
      }),
      check('signal_compliance', !policy.safety.requiresSignalCompliance || !signal || signal.state === 'green', {
        signalId: signal && signal.id || null,
        signalState: signal && signal.state || null,
        targetSegmentId,
      }),
      check('speed_limit', Math.max(transition.endSpeedMps, proposal.lookahead.maximumSpeedMps) <= maximumSpeed + policy.safety.maximumSpeedToleranceMps, {
        predictedSpeedMps: transition.endSpeedMps,
        lookaheadMaximumSpeedMps: proposal.lookahead.maximumSpeedMps,
        maximumSpeedMps: maximumSpeed,
      }),
      check('pedestrian_clearance', Math.min(transition.minimumClearanceM, proposal.lookahead.minimumClearanceM) >= policy.safety.minimumPedestrianClearanceM, {
        predictedClearanceM: transition.minimumClearanceM,
        lookaheadClearanceM: proposal.lookahead.minimumClearanceM,
        clearanceIsLowerBound: transition.clearanceIsLowerBound && proposal.lookahead.clearanceIsLowerBound,
        lookaheadTicks: proposal.lookahead.tickCount,
        requiredClearanceM: policy.safety.minimumPedestrianClearanceM,
        closestActorId: transition.closestActorId,
      }),
      check('route_adherence', !targetSegmentId || targetSegmentId === routeTarget, {
        targetSegmentId,
        routeTargetSegmentId: routeTarget,
      }),
    ];
  }

  function check(id, pass, evidence) {
    return { id, pass: Boolean(pass), evidence };
  }

  return { gateActionBets, safetyChecks };
});
