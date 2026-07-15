(function attachCooperativeRelayPlanner(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteCooperativeRelayPlanner = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createCooperativeRelayPlanner() {
  function planRelay({ request, legs, maximumCarrierLegs = 2, legSetComplete = false }) {
    validateRequest(request);
    if (!Number.isInteger(maximumCarrierLegs) || maximumCarrierLegs < 1) throw relayError('maximum_carrier_legs_invalid');
    const candidateLegs = [...legs].sort(compareLegs);
    candidateLegs.forEach(validateLeg);
    const retainedLegs = candidateLegs.filter((leg) => leg.itemId === request.itemId
      && Date.parse(leg.departureAt) >= Date.parse(request.earliestAt)
      && Date.parse(leg.arrivalAt) <= Date.parse(request.latestAt)
      && Date.parse(leg.arrivalAt) > Date.parse(leg.departureAt));
    const paths = enumeratePaths(request, retainedLegs, maximumCarrierLegs);
    const result = allocatePaths(request.quantity, retainedLegs, paths);
    const allocations = allocationRows(retainedLegs, paths, result.pathQuantities);
    const searchComplete = Boolean(legSetComplete);
    const plan = {
      schema: 'simulatte.cooperativeRelayPlan.v1',
      requestId: request.id,
      algorithm: 'bounded_relay_path_allocation_dp_v1',
      maximumCarrierLegs,
      requiredQuantity: request.quantity,
      allocatedQuantity: result.allocatedQuantity,
      totalCost: round(result.totalCost),
      allocations,
      searchComplete,
      optimalityProven: searchComplete && result.allocatedQuantity === request.quantity,
      claimBoundary: searchComplete
        ? `Optimal over the supplied complete leg set and all time-feasible paths using at most ${maximumCarrierLegs} carrier leg(s).`
        : 'The supplied leg set is not declared complete; this is a feasible bounded allocation, not an optimality claim.',
    };
    const receipt = {
      schema: 'simulatte.cooperativeAllocationReceipt.v1',
      requestId: request.id,
      candidateLegCount: candidateLegs.length,
      retainedLegCount: retainedLegs.length,
      enumeratedPathCount: paths.length,
      dynamicProgrammingStateCount: result.stateCount,
      requiredQuantity: request.quantity,
      allocatedQuantity: result.allocatedQuantity,
      rejectedLegIds: candidateLegs.filter((leg) => !retainedLegs.includes(leg)).map((leg) => leg.id),
    };
    return { plan, receipt };
  }

  function enumeratePaths(request, legs, maximumCarrierLegs) {
    const byOrigin = new Map();
    legs.forEach((leg) => {
      if (!byOrigin.has(leg.fromNodeId)) byOrigin.set(leg.fromNodeId, []);
      byOrigin.get(leg.fromNodeId).push(leg);
    });
    byOrigin.forEach((rows) => rows.sort(compareLegs));
    const paths = [];
    const walk = (nodeId, readyAt, selected, selectedIds) => {
      if (nodeId === request.destinationNodeId && selected.length) {
        paths.push(pathRow(selected));
        return;
      }
      if (selected.length >= maximumCarrierLegs) return;
      (byOrigin.get(nodeId) || []).forEach((leg) => {
        if (selectedIds.has(leg.id) || Date.parse(leg.departureAt) < Date.parse(readyAt)) return;
        selected.push(leg);
        selectedIds.add(leg.id);
        walk(leg.toNodeId, leg.arrivalAt, selected, selectedIds);
        selectedIds.delete(leg.id);
        selected.pop();
      });
    };
    walk(request.sourceNodeId, request.earliestAt, [], new Set());
    return paths.sort((left, right) => left.unitCost - right.unitCost || left.id.localeCompare(right.id));
  }

  function allocatePaths(requiredQuantity, legs, paths) {
    const initialCapacities = legs.map((leg) => leg.capacity);
    const legIndex = new Map(legs.map((leg, index) => [leg.id, index]));
    let stateCount = 0;
    for (let target = requiredQuantity; target >= 0; target -= 1) {
      const memo = new Map();
      const result = solve(0, target, initialCapacities);
      if (result) return {
        allocatedQuantity: target,
        totalCost: result.cost,
        pathQuantities: result.quantities,
        stateCount,
      };

      function solve(pathIndex, remaining, capacities) {
        stateCount += 1;
        if (remaining === 0) return { cost: 0, quantities: Array(paths.length).fill(0) };
        if (pathIndex >= paths.length) return null;
        const key = `${pathIndex}|${remaining}|${capacities.join(',')}`;
        if (memo.has(key)) return memo.get(key);
        const path = paths[pathIndex];
        const pathCapacity = Math.min(remaining, ...path.legIds.map((id) => capacities[legIndex.get(id)]));
        let best = null;
        for (let quantity = 0; quantity <= pathCapacity; quantity += 1) {
          const nextCapacities = [...capacities];
          path.legIds.forEach((id) => { nextCapacities[legIndex.get(id)] -= quantity; });
          const suffix = solve(pathIndex + 1, remaining - quantity, nextCapacities);
          if (!suffix) continue;
          const candidate = {
            cost: suffix.cost + quantity * path.unitCost,
            quantities: [...suffix.quantities],
          };
          candidate.quantities[pathIndex] = quantity;
          if (!best || compareAllocations(candidate, best) < 0) best = candidate;
        }
        memo.set(key, best);
        return best;
      }
    }
    return { allocatedQuantity: 0, totalCost: 0, pathQuantities: Array(paths.length).fill(0), stateCount };
  }

  function allocationRows(legs, paths, pathQuantities) {
    const quantities = new Map(legs.map((leg) => [leg.id, 0]));
    paths.forEach((path, index) => path.legIds.forEach((legId) => {
      quantities.set(legId, quantities.get(legId) + pathQuantities[index]);
    }));
    return legs.filter((leg) => quantities.get(leg.id) > 0).map((leg) => ({
      legId: leg.id,
      carrierId: leg.carrierId,
      fromNodeId: leg.fromNodeId,
      toNodeId: leg.toNodeId,
      departureAt: leg.departureAt,
      arrivalAt: leg.arrivalAt,
      quantity: quantities.get(leg.id),
      unitCost: leg.unitCost,
    }));
  }

  function pathRow(legs) {
    return {
      id: legs.map((leg) => leg.id).join('>'),
      legIds: legs.map((leg) => leg.id),
      unitCost: round(legs.reduce((sum, leg) => sum + leg.unitCost, 0)),
    };
  }

  function compareAllocations(left, right) {
    if (left.cost !== right.cost) return left.cost - right.cost;
    for (let index = 0; index < left.quantities.length; index += 1) {
      if (left.quantities[index] !== right.quantities[index]) return right.quantities[index] - left.quantities[index];
    }
    return 0;
  }

  function validateRequest(request) {
    ['id', 'itemId', 'sourceNodeId', 'destinationNodeId', 'earliestAt', 'latestAt'].forEach((key) => {
      if (!request || typeof request[key] !== 'string' || !request[key]) throw relayError(`request_${key}_invalid`);
    });
    if (!Number.isInteger(request.quantity) || request.quantity < 1) throw relayError('request_quantity_invalid');
  }

  function validateLeg(leg) {
    ['id', 'carrierId', 'itemId', 'fromNodeId', 'toNodeId', 'departureAt', 'arrivalAt'].forEach((key) => {
      if (!leg || typeof leg[key] !== 'string' || !leg[key]) throw relayError(`leg_${key}_invalid`);
    });
    if (!Number.isInteger(leg.capacity) || leg.capacity < 1) throw relayError('leg_capacity_invalid');
    if (!Number.isFinite(leg.unitCost) || leg.unitCost < 0) throw relayError('leg_unit_cost_invalid');
  }

  function compareLegs(left, right) {
    return Date.parse(left.departureAt) - Date.parse(right.departureAt)
      || Date.parse(left.arrivalAt) - Date.parse(right.arrivalAt)
      || left.id.localeCompare(right.id);
  }

  function round(value) {
    return Number(value.toFixed(6));
  }

  function relayError(code) {
    const error = new Error(code);
    error.code = code;
    return error;
  }

  return { planRelay };
});
