(function attachAutonomyReferenceDynamics(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteAutonomyDynamics = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createAutonomyReferenceDynamics() {
  function simulateAction({ state, action, worldModel, embodiment, mission, policy }) {
    const before = structuredClone(state);
    const next = structuredClone(state);
    const stepSeconds = integrationStepSeconds(before, embodiment, mission);
    const startPosition = worldModel.agentPosition(before);
    let enteredSegmentId = null;
    let reachedNodeId = null;

    if (!next.currentSegmentId && action.targetSegmentId) {
      const target = worldModel.segment(action.targetSegmentId);
      if (target.fromNodeId !== next.currentNodeId) {
        throw dynamicsError('segment_entry_mismatch', `Action target ${target.id} starts at ${target.fromNodeId}, agent is at ${next.currentNodeId}`);
      }
      next.currentSegmentId = target.id;
      next.currentNodeId = null;
      next.segmentProgressM = 0;
      enteredSegmentId = target.id;
    }

    const maximumSpeed = Math.min(embodiment.dynamics.maximumSpeedMps, mission.constraints.maximumSpeedMps);
    const proposedSpeed = clamp(before.speedMps + action.accelerationMps2 * stepSeconds, 0, maximumSpeed + embodiment.dynamics.strongAccelerationMps2 * stepSeconds);
    const travelM = next.currentSegmentId
      ? Math.max(0, (before.speedMps + proposedSpeed) * 0.5 * stepSeconds)
      : 0;
    let progressDeltaM = 0;
    next.speedMps = proposedSpeed;

    if (next.currentSegmentId) {
      const segment = worldModel.segment(next.currentSegmentId);
      const remainingM = Math.max(0, segment.lengthM - next.segmentProgressM);
      const remainingMissionM = loopTargetDistanceM(mission) === null
        ? Infinity
        : Math.max(0, loopTargetDistanceM(mission) - before.distanceTraveledM);
      progressDeltaM = Math.min(remainingM, travelM, remainingMissionM);
      next.segmentProgressM += progressDeltaM;
      next.distanceTraveledM += progressDeltaM;
      if (next.segmentProgressM >= segment.lengthM - 1e-9) {
        next.currentNodeId = segment.toNodeId;
        next.currentSegmentId = null;
        next.segmentProgressM = 0;
        reachedNodeId = segment.toNodeId;
      }
    }

    next.tick += 1;
    next.simulatedTimeSeconds = round(next.simulatedTimeSeconds + stepSeconds);
    const endPosition = worldModel.agentPosition(next);
    next.position = { ...endPosition };
    const clearance = worldModel.minimumActorClearance(
      startPosition,
      endPosition,
      before.tick,
      embodiment.dimensions.collisionRadiusM,
      policy.safety.nearbyActorRadiusM
    );
    const finalStopPending = mission.task.type !== 'loop'
      && next.remainingStopNodeIds.length === 1
      && next.remainingStopNodeIds[0] === mission.destinationNodeId;
    const willArrive = finalStopPending && next.currentNodeId === mission.destinationNodeId && !next.currentSegmentId;
    const reachedLoopTarget = loopTerminationReached(next, mission);
    const willComplete = willArrive || reachedLoopTarget;
    const completionReason = willArrive ? 'destination_reached' : reachedLoopTarget ? loopCompletionReason(mission) : null;
    if (willComplete) {
      next.status = 'completed';
      next.speedMps = 0;
      if (willArrive && mission.task.type === 'delivery') next.payloadStatus = 'delivered';
    }
    return {
      schema: 'simulatte.autonomyTransition.v2',
      state: next,
      startPosition: roundPoint(startPosition),
      endPosition: roundPoint(endPosition),
      progressDeltaM: round(progressDeltaM),
      endSpeedMps: round(next.speedMps),
      minimumClearanceM: round(clearance.clearanceM),
      clearanceIsLowerBound: clearance.actorId === null,
      closestActorId: clearance.actorId,
      enteredSegmentId,
      reachedNodeId,
      willReachNode: Boolean(reachedNodeId),
      willArrive,
      willComplete,
      completionReason,
    };
  }

  function integrationStepSeconds(state, embodiment, mission) {
    const configured = embodiment.dynamics.integrationStepSeconds;
    if (mission.task.type !== 'loop' || mission.task.termination.kind !== 'duration') return configured;
    return Math.min(configured, Math.max(0, mission.task.termination.targetDurationSeconds - state.simulatedTimeSeconds));
  }

  function loopTargetDistanceM(mission) {
    if (mission.task.type !== 'loop') return null;
    return mission.task.termination.targetDistanceM ?? null;
  }

  function loopTerminationReached(state, mission) {
    if (mission.task.type !== 'loop') return false;
    const termination = mission.task.termination;
    if (termination.kind === 'duration') return state.simulatedTimeSeconds >= termination.targetDurationSeconds - 1e-9;
    return state.distanceTraveledM >= termination.targetDistanceM - 1e-9;
  }

  function loopCompletionReason(mission) {
    const kind = mission.task.termination.kind;
    return kind === 'distance' ? 'distance_target_reached' : kind === 'laps' ? 'lap_target_reached' : 'duration_target_reached';
  }

  function dynamicsError(code, message) {
    const error = new Error(`${code}: ${message}`);
    error.name = 'AutonomyDynamicsError';
    error.code = code;
    return error;
  }

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function round(value) {
    return Number(value.toFixed(9));
  }

  function roundPoint(point) {
    return { x: round(point.x), y: round(point.y) };
  }

  return { integrationStepSeconds, loopCompletionReason, loopTargetDistanceM, loopTerminationReached, simulateAction };
});
