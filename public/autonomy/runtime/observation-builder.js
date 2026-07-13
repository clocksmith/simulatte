(function attachAutonomyObservationBuilder(root, factory) {
  const contracts = typeof module === 'object' && module.exports
    ? require('../contracts/contract-validator.js')
    : root.SimulatteAutonomyContracts;
  const api = factory(contracts);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteAutonomyObservationBuilder = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createAutonomyObservationBuilder(contracts) {
  function buildObservation({ mission, state, route, worldModel, policyMemory, policy }) {
    const position = worldModel.agentPosition(state);
    const nearbyActors = worldModel.nearbyActors(position, state.tick, policy.safety.nearbyActorRadiusM).map((actor) => ({
      id: actor.id,
      type: actor.type,
      position: roundPoint(actor.position),
      distanceM: round(actor.distanceM),
      isActive: actor.isActive,
    }));
    const observation = {
      schema: 'simulatte.autonomyObservation.v1',
      missionId: mission.id,
      tick: state.tick,
      simulatedTimeSeconds: round(state.simulatedTimeSeconds),
      agent: {
        position: roundPoint(position),
        speedMps: round(state.speedMps),
        currentNodeId: state.currentNodeId,
        currentSegmentId: state.currentSegmentId,
        segmentProgressM: round(state.segmentProgressM),
        status: state.status,
      },
      route: {
        segmentIds: [...route.segmentIds],
        cost: round(route.cost),
        revision: state.routeRevision,
        reason: state.routeReason,
      },
      signals: worldModel.signalRows(state.tick),
      nearbyActors,
      blockedSegmentIds: worldModel.blockedSegmentIds(state.tick),
      policyMemory: structuredClone(policyMemory),
    };
    return contracts.validateObservation(observation);
  }

  function createPolicyMemory(policy) {
    const calibrationByManeuver = {};
    policy.candidateManeuvers.forEach((maneuver) => {
      calibrationByManeuver[maneuver] = {
        trials: 0,
        wins: 0,
        confidence: round(policy.confidence.priorWins / policy.confidence.priorTrials),
      };
    });
    return { settledBetCount: 0, wonBetCount: 0, calibrationByManeuver };
  }

  function roundPoint(point) {
    return { x: round(point.x), y: round(point.y) };
  }

  function round(value) {
    return Number(value.toFixed(9));
  }

  return { buildObservation, createPolicyMemory, round, roundPoint };
});
