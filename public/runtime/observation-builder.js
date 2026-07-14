(function attachAutonomyObservationBuilder(root, factory) {
  const contracts = typeof module === 'object' && module.exports
    ? require('../contracts/contract-validator.js')
    : root.SimulatteAutonomyContracts;
  const retrieval = typeof module === 'object' && module.exports
    ? require('./feature-retrieval.js')
    : root.SimulatteAutonomyFeatureRetrieval;
  const api = factory(contracts, retrieval);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteAutonomyObservationBuilder = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createAutonomyObservationBuilder(contracts, retrieval) {
  function buildObservation({ mission, state, route, worldModel, policyMemory, policy, featureCatalog, occurrenceReceipt }) {
    const position = worldModel.agentPosition(state);
    const nearbyActors = worldModel.nearbyActors(position, state.tick, policy.safety.nearbyActorRadiusM).map((actor) => ({
      id: actor.id,
      type: actor.type,
      position: roundPoint(actor.position),
      distanceM: round(actor.distanceM),
      motionKind: actor.motionKind,
      interactionRole: actor.interactionRole,
      provenanceKind: actor.provenanceKind,
      isActive: actor.isActive,
    }));
    const observation = {
      schema: 'simulatte.autonomyObservation.v2',
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
        algorithm: route.algorithm,
        visitedNodeCount: route.visitedNodeIds.length,
        visitedNodeIds: boundedIdentities(route.visitedNodeIds, 24),
        evaluatedSegmentCount: route.evaluatedSegmentCount,
        costBreakdown: structuredClone(route.costBreakdown),
        revision: state.routeRevision,
        reason: state.routeReason,
        circuitId: route.circuitId || null,
        circuitLengthM: route.circuitLengthM || null,
        avoidedStreetNames: [...(route.avoidedStreetNames || [])],
        excludedStreetSegmentIds: [...(route.excludedStreetSegmentIds || [])],
        excludedAmenitySegmentIds: [...(route.excludedAmenitySegmentIds || [])],
        maximumBikeRackDistanceM: route.maximumBikeRackDistanceM ?? null,
      },
      signals: worldModel.signalRows(state.tick),
      nearbyActors,
      blockedSegmentIds: worldModel.blockedSegmentIds(state.tick),
      featureRetrieval: retrieval.retrieveAndRerankFeatures({ featureCatalog, mission, state, route, worldModel }),
      occurrenceReceipt: structuredClone(occurrenceReceipt),
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

  function boundedIdentities(rows, maximum) {
    if (rows.length <= maximum) return [...rows];
    const head = Math.floor(maximum / 2);
    return [...rows.slice(0, head), ...rows.slice(-head)];
  }

  return { boundedIdentities, buildObservation, createPolicyMemory, round, roundPoint };
});
