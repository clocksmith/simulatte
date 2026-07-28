(function attachCableTraderFlowSolver(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteCableTraderFlowSolver = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createCableTraderFlowSolver() {
  function exactAllocation({ supplies, projects, capacity, edgeCost, remainingDemand }) {
    if (!Array.isArray(supplies) || !Array.isArray(projects)) {
      throw new Error('Cable flow solver requires supply and project arrays');
    }
    if (!Number.isFinite(capacity) || capacity < 0) {
      throw new Error('Cable flow solver capacity must be finite and non-negative');
    }
    if (typeof edgeCost !== 'function' || typeof remainingDemand !== 'function') {
      throw new Error('Cable flow solver requires edge-cost and remaining-demand functions');
    }

    const source = 0;
    const capacityNode = 1;
    const supplyOffset = 2;
    const projectOffset = supplyOffset + supplies.length;
    const sink = projectOffset + projects.length;
    const graph = Array.from({ length: sink + 1 }, () => []);
    addEdge(graph, source, capacityNode, capacity, 0);
    supplies.forEach((supply, index) => {
      addEdge(graph, capacityNode, supplyOffset + index, supply.availableMeters, 0);
    });
    projects.forEach((project, index) => {
      addEdge(graph, projectOffset + index, sink, remainingDemand(project), 0);
    });

    const candidates = [];
    supplies.forEach((supply, supplyIndex) => {
      projects.forEach((project, projectIndex) => {
        const unitCost = edgeCost(supply, project);
        if (unitCost === null || unitCost === undefined) return;
        if (!Number.isFinite(unitCost) || unitCost < 0) {
          throw new Error('Cable flow solver edge costs must be finite and non-negative');
        }
        const edge = addEdge(
          graph,
          supplyOffset + supplyIndex,
          projectOffset + projectIndex,
          Number.MAX_SAFE_INTEGER,
          unitCost
        );
        candidates.push({ edge, supplyIndex, projectIndex, unitCost });
      });
    });

    minCostFlow(graph, source, sink);
    return Object.freeze({
      allocations: Object.freeze(candidates
        .filter((row) => row.edge.reverse.capacity > 0)
        .map((row) => Object.freeze({
          supplyIndex: row.supplyIndex,
          projectIndex: row.projectIndex,
          quantityMeters: row.edge.reverse.capacity,
          unitCost: row.unitCost,
        }))),
      optimalityProven: true,
    });
  }

  function minCostFlow(graph, source, sink) {
    const potentials = Array(graph.length).fill(0);
    while (true) {
      const distance = Array(graph.length).fill(Infinity);
      const previous = Array(graph.length).fill(null);
      const visited = Array(graph.length).fill(false);
      distance[source] = 0;
      for (let pass = 0; pass < graph.length; pass += 1) {
        const from = nearestUnvisited(distance, visited);
        if (from < 0) break;
        visited[from] = true;
        for (const edge of graph[from]) {
          if (edge.capacity <= 0 || visited[edge.to]) continue;
          const reducedCost = Math.max(0, edge.cost + potentials[from] - potentials[edge.to]);
          const candidate = distance[from] + reducedCost;
          if (candidate < distance[edge.to]) {
            distance[edge.to] = candidate;
            previous[edge.to] = edge;
          }
        }
      }
      if (!Number.isFinite(distance[sink])) return;
      distance.forEach((value, node) => {
        if (Number.isFinite(value)) potentials[node] += value;
      });
      const quantity = pathCapacity(previous, source, sink);
      if (!(quantity > 0)) return;
      applyPath(previous, source, sink, quantity);
    }
  }

  function nearestUnvisited(distance, visited) {
    let result = -1;
    for (let node = 0; node < distance.length; node += 1) {
      if (visited[node] || !Number.isFinite(distance[node])) continue;
      if (result < 0 || distance[node] < distance[result]) result = node;
    }
    return result;
  }

  function pathCapacity(previous, source, sink) {
    let quantity = Number.MAX_SAFE_INTEGER;
    for (let node = sink; node !== source;) {
      const edge = previous[node];
      if (!edge) return 0;
      quantity = Math.min(quantity, edge.capacity);
      node = edge.from;
    }
    return quantity;
  }

  function applyPath(previous, source, sink, quantity) {
    for (let node = sink; node !== source;) {
      const edge = previous[node];
      edge.capacity -= quantity;
      edge.reverse.capacity += quantity;
      node = edge.from;
    }
  }

  function addEdge(graph, from, to, capacity, cost) {
    const forward = { from, to, capacity, cost, reverse: null };
    const reverse = { from: to, to: from, capacity: 0, cost: -cost, reverse: forward };
    forward.reverse = reverse;
    graph[from].push(forward);
    graph[to].push(reverse);
    return forward;
  }

  return Object.freeze({ exactAllocation });
});
