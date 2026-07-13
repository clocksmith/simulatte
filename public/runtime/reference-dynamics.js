(function attachAutonomyReferenceDynamics(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteAutonomyDynamics = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createAutonomyReferenceDynamics() {
  function simulateAction({ state, action, worldModel, embodiment, mission, policy }) {
    const before = structuredClone(state);
    const next = structuredClone(state);
    const stepSeconds = embodiment.dynamics.integrationStepSeconds;
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
      progressDeltaM = Math.min(remainingM, travelM);
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
    next.simulatedTimeSeconds += stepSeconds;
    const endPosition = worldModel.agentPosition(next);
    next.position = { ...endPosition };
    const clearance = worldModel.minimumActorClearance(
      startPosition,
      endPosition,
      before.tick,
      embodiment.dimensions.collisionRadiusM,
      policy.safety.nearbyActorRadiusM
    );
    const willArrive = next.currentNodeId === mission.destinationNodeId && !next.currentSegmentId;
    if (willArrive) {
      next.status = 'completed';
      next.payloadStatus = 'delivered';
    }
    return {
      schema: 'simulatte.autonomyTransition.v1',
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
    };
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

  return { simulateAction };
});
