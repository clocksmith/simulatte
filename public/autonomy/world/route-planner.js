(function attachAutonomyRoutePlanner(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteAutonomyRoutePlanner = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createAutonomyRoutePlanner() {
  function planRoute({ worldModel, originNodeId, destinationNodeId, mode, tick, mission, policy }) {
    if (originNodeId === destinationNodeId) return routeResult([], 0, [originNodeId], 0);
    const blocked = new Set(worldModel.blockedSegmentIds(tick));
    const open = [{ nodeId: originNodeId, cost: 0, estimate: heuristic(worldModel, originNodeId, destinationNodeId), path: [] }];
    const bestCost = new Map([[originNodeId, 0]]);
    const visited = [];
    let evaluatedSegmentCount = 0;

    while (open.length) {
      open.sort(compareOpenRows);
      const current = open.shift();
      if (current.cost > (bestCost.get(current.nodeId) ?? Infinity)) continue;
      visited.push(current.nodeId);
      if (current.nodeId === destinationNodeId) return routeResult(current.path, current.cost, visited, evaluatedSegmentCount);
      for (const segment of worldModel.outgoing(current.nodeId)) {
        evaluatedSegmentCount += 1;
        if (!segment.allowedModes.includes(mode)) continue;
        if (policy.route.blockedSegmentsAreIneligible && blocked.has(segment.id)) continue;
        const nextCost = current.cost + segmentCost(segment, mission, policy);
        const previous = bestCost.get(segment.toNodeId);
        if (previous !== undefined && nextCost >= previous - 1e-12) continue;
        bestCost.set(segment.toNodeId, nextCost);
        open.push({
          nodeId: segment.toNodeId,
          cost: nextCost,
          estimate: nextCost + heuristic(worldModel, segment.toNodeId, destinationNodeId),
          path: [...current.path, segment.id],
        });
      }
    }
    const error = new Error(`route_not_found: ${originNodeId} to ${destinationNodeId} at tick ${tick} has no ${mode} path`);
    error.name = 'AutonomyRouteError';
    error.code = 'route_not_found';
    error.evidence = { originNodeId, destinationNodeId, tick, mode, blockedSegmentIds: [...blocked].sort(), visitedNodeIds: visited };
    throw error;
  }

  function segmentCost(segment, mission, policy) {
    const travel = segment.lengthM / segment.speedLimitMps * policy.route.travelWeight;
    const risk = segment.riskScore * policy.route.riskWeight;
    const preference = mission.constraints.lanePreference === 'protected' && segment.laneType === 'shared'
      ? policy.route.unprotectedPreferencePenalty : 0;
    return travel + risk + preference;
  }

  function heuristic(worldModel, fromNodeId, destinationNodeId) {
    const from = worldModel.node(fromNodeId).position;
    const to = worldModel.node(destinationNodeId).position;
    return Math.hypot(from.x - to.x, from.y - to.y) / 7;
  }

  function compareOpenRows(left, right) {
    return left.estimate - right.estimate || left.cost - right.cost || left.nodeId.localeCompare(right.nodeId) || left.path.join('|').localeCompare(right.path.join('|'));
  }

  function routeResult(segmentIds, cost, visitedNodeIds, evaluatedSegmentCount) {
    return {
      schema: 'simulatte.autonomyRoutePlan.v1',
      algorithm: 'a_star_v1',
      segmentIds,
      cost: round(cost),
      visitedNodeIds,
      evaluatedSegmentCount,
      deterministicTieBreak: 'segment_id_ascending',
    };
  }

  function round(value) {
    return Number(value.toFixed(9));
  }

  return { planRoute, segmentCost };
});
