(function attachAutonomyRoutePlanner(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteAutonomyRoutePlanner = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createAutonomyRoutePlanner() {
  function planRoute({ worldModel, originNodeId, destinationNodeId, mode, tick, mission, policy }) {
    if (originNodeId === destinationNodeId) return routeResult([], 0, [originNodeId], 0, routeCostBreakdown([], worldModel, mission, policy));
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
      if (current.nodeId === destinationNodeId) {
        return routeResult(current.path, current.cost, visited, evaluatedSegmentCount, routeCostBreakdown(current.path, worldModel, mission, policy));
      }
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

  function routeCostBreakdown(segmentIds, worldModel, mission, policy) {
    const components = segmentIds.reduce((total, segmentId) => {
      const segment = worldModel.segment(segmentId);
      total.travel += segment.lengthM / segment.speedLimitMps * policy.route.travelWeight;
      total.risk += segment.riskScore * policy.route.riskWeight;
      if (mission.constraints.lanePreference === 'protected' && segment.laneType === 'shared') {
        total.preference += policy.route.unprotectedPreferencePenalty;
      }
      return total;
    }, { travel: 0, risk: 0, preference: 0 });
    return {
      travel: round(components.travel),
      risk: round(components.risk),
      preference: round(components.preference),
      total: round(components.travel + components.risk + components.preference),
      formula: 'sum(lengthM / speedLimitMps * travelWeight + riskScore * riskWeight + preferencePenalty)',
      weights: {
        travelWeight: policy.route.travelWeight,
        riskWeight: policy.route.riskWeight,
        unprotectedPreferencePenalty: policy.route.unprotectedPreferencePenalty,
      },
    };
  }

  function heuristic(worldModel, fromNodeId, destinationNodeId) {
    const from = worldModel.node(fromNodeId).position;
    const to = worldModel.node(destinationNodeId).position;
    return Math.hypot(from.x - to.x, from.y - to.y) / 7;
  }

  function compareOpenRows(left, right) {
    return left.estimate - right.estimate || left.cost - right.cost || left.nodeId.localeCompare(right.nodeId) || left.path.join('|').localeCompare(right.path.join('|'));
  }

  function routeResult(segmentIds, cost, visitedNodeIds, evaluatedSegmentCount, costBreakdown) {
    return {
      schema: 'simulatte.autonomyRoutePlan.v1',
      algorithm: 'a_star_v1',
      segmentIds,
      cost: round(cost),
      visitedNodeIds,
      evaluatedSegmentCount,
      costBreakdown,
      deterministicTieBreak: 'segment_id_ascending',
    };
  }

  function round(value) {
    return Number(value.toFixed(9));
  }

  return { planRoute, routeCostBreakdown, segmentCost };
});
