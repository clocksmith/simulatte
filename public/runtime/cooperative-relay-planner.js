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

  function allocateCompetingRequests({ requests, carriers, candidates, candidateSetComplete = false }) {
    validateMultiRequestInputs(requests, carriers, candidates);
    const source = 'source';
    const sink = 'sink';
    const graph = new Map();
    const addNode = (id) => { if (!graph.has(id)) graph.set(id, []); };
    const addEdge = (from, to, capacity, cost, metadata = null) => {
      addNode(from);
      addNode(to);
      const forward = { to, capacity, cost, flow: 0, reverse: graph.get(to).length, metadata };
      const reverse = { to: from, capacity: 0, cost: -cost, flow: 0, reverse: graph.get(from).length, metadata: null };
      graph.get(from).push(forward);
      graph.get(to).push(reverse);
    };
    [...carriers].sort(byId).forEach((carrier) => addEdge(source, `carrier:${carrier.id}`, carrier.capacity, 0));
    [...candidates].sort(compareMultiCandidates).forEach((candidate) => addEdge(
      `carrier:${candidate.carrierId}`,
      `request:${candidate.requestId}`,
      candidate.capacity,
      candidate.unitCost,
      { candidateId: candidate.id, carrierId: candidate.carrierId, requestId: candidate.requestId }
    ));
    [...requests].sort(byId).forEach((request) => addEdge(`request:${request.id}`, sink, request.quantity, 0));
    let totalFlow = 0;
    let totalCost = 0;
    let augmentationCount = 0;
    while (true) {
      const path = shortestResidualPath(graph, source, sink);
      if (!path) break;
      const capacity = Math.min(...path.map(({ edge }) => edge.capacity - edge.flow));
      if (!(capacity > 0)) break;
      path.forEach(({ from, edge }) => {
        edge.flow += capacity;
        graph.get(edge.to)[edge.reverse].flow -= capacity;
        totalCost += capacity * edge.cost;
        void from;
      });
      totalFlow += capacity;
      augmentationCount += 1;
    }
    const allocations = [];
    graph.forEach((edges) => edges.forEach((edge) => {
      if (edge.metadata && edge.flow > 0) allocations.push({ ...edge.metadata, quantity: edge.flow, unitCost: edge.cost });
    }));
    allocations.sort((left, right) => left.requestId.localeCompare(right.requestId)
      || left.carrierId.localeCompare(right.carrierId) || left.candidateId.localeCompare(right.candidateId));
    const requiredQuantity = requests.reduce((sum, request) => sum + request.quantity, 0);
    const fulfilledByRequest = Object.fromEntries([...requests].sort(byId).map((request) => [
      request.id,
      allocations.filter((row) => row.requestId === request.id).reduce((sum, row) => sum + row.quantity, 0),
    ]));
    return {
      schema: 'simulatte.cooperativeMultiRequestAllocation.v1',
      algorithm: 'successive_shortest_residual_path_min_cost_flow_v1',
      requiredQuantity,
      allocatedQuantity: totalFlow,
      totalCost: round(totalCost),
      fulfilledByRequest,
      allocations,
      candidateSetComplete: Boolean(candidateSetComplete),
      optimalityProven: Boolean(candidateSetComplete),
      augmentationCount,
      searchComplete: true,
      claimBoundary: candidateSetComplete
        ? 'Minimum cost maximum flow over the declared complete candidate graph with integer capacities.'
        : 'Minimum cost maximum flow over the supplied candidate graph; absent candidates prevent global optimality claims.',
    };
  }

  function shortestResidualPath(graph, source, sink) {
    const nodes = [...graph.keys()].sort();
    const distance = new Map(nodes.map((node) => [node, Infinity]));
    const prior = new Map();
    distance.set(source, 0);
    for (let iteration = 0; iteration < nodes.length - 1; iteration += 1) {
      let changed = false;
      for (const from of nodes) {
        if (!Number.isFinite(distance.get(from))) continue;
        graph.get(from).forEach((edge, edgeIndex) => {
          if (edge.flow >= edge.capacity) return;
          const candidate = distance.get(from) + edge.cost;
          const current = distance.get(edge.to);
          const key = `${from}:${edgeIndex}`;
          const priorKey = prior.get(edge.to)?.key || '';
          if (candidate < current - 1e-12 || (Math.abs(candidate - current) <= 1e-12 && key < priorKey)) {
            distance.set(edge.to, candidate);
            prior.set(edge.to, { from, edgeIndex, key });
            changed = true;
          }
        });
      }
      if (!changed) break;
    }
    if (!prior.has(sink)) return null;
    const path = [];
    let cursor = sink;
    const seen = new Set();
    while (cursor !== source) {
      if (seen.has(cursor)) throw relayError('residual_path_cycle');
      seen.add(cursor);
      const step = prior.get(cursor);
      if (!step) return null;
      const edge = graph.get(step.from)[step.edgeIndex];
      path.unshift({ from: step.from, edge });
      cursor = step.from;
    }
    return path;
  }

  function validateMultiRequestInputs(requests, carriers, candidates) {
    if (!Array.isArray(requests) || !requests.length) throw relayError('multi_requests_invalid');
    if (!Array.isArray(carriers) || !carriers.length) throw relayError('multi_carriers_invalid');
    if (!Array.isArray(candidates)) throw relayError('multi_candidates_invalid');
    const requestIds = new Set();
    requests.forEach((request) => {
      if (!request?.id || requestIds.has(request.id) || !Number.isInteger(request.quantity) || request.quantity < 1) throw relayError('multi_request_invalid');
      requestIds.add(request.id);
    });
    const carrierIds = new Set();
    carriers.forEach((carrier) => {
      if (!carrier?.id || carrierIds.has(carrier.id) || !Number.isInteger(carrier.capacity) || carrier.capacity < 1) throw relayError('multi_carrier_invalid');
      carrierIds.add(carrier.id);
    });
    const candidateIds = new Set();
    candidates.forEach((candidate) => {
      if (!candidate?.id || candidateIds.has(candidate.id) || !requestIds.has(candidate.requestId) || !carrierIds.has(candidate.carrierId)
        || !Number.isInteger(candidate.capacity) || candidate.capacity < 1 || !Number.isFinite(candidate.unitCost) || candidate.unitCost < 0) {
        throw relayError('multi_candidate_invalid');
      }
      candidateIds.add(candidate.id);
    });
  }

  function compareMultiCandidates(left, right) {
    return left.unitCost - right.unitCost || left.requestId.localeCompare(right.requestId)
      || left.carrierId.localeCompare(right.carrierId) || left.id.localeCompare(right.id);
  }

  function byId(left, right) {
    return left.id.localeCompare(right.id);
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

  return { allocateCompetingRequests, planRelay };
});
