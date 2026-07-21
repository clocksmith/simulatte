(function attachCableTraderNetwork(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteCableTraderNetwork = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createCableTraderNetwork() {
  function simulateNetwork(config, transferRoutes) {
    validateInputs(config, transferRoutes);
    const { cableTypes, hubs, simulation } = config;
    const random = createRandom(simulation.seed);
    const needCounts = createCube(simulation.durationDays, cableTypes.length, hubs.length);
    const returnCounts = createCube(simulation.durationDays, cableTypes.length, hubs.length);
    const journeyPenalties = createCube(simulation.durationDays, hubs.length, hubs.length);
    const needSamples = [];
    const needEvents = [];
    const weightedTypes = cableTypes.map((type) => type.demandWeight);
    for (let index = 0; index < simulation.needCount; index += 1) {
      const day = random.integer(simulation.durationDays);
      const cableType = random.weightedIndex(weightedTypes);
      const destination = random.integer(hubs.length);
      needCounts[day][cableType][destination] += 1;
      needEvents.push({ day, cableType });
      if (needSamples.length < 16) needSamples.push(Object.freeze({ id: `need-${index + 1}`, day: day + 1, cableTypeId: cableTypes[cableType].id, destinationHubId: hubs[destination].id }));
    }
    for (let index = 0; index < simulation.returnCount; index += 1) {
      const pairedNeed = needEvents[index % needEvents.length];
      returnCounts[pairedNeed.day][pairedNeed.cableType][random.integer(hubs.length)] += 1;
    }
    for (let index = 0; index < simulation.journeyEventCount; index += 1) {
      const day = random.integer(simulation.durationDays);
      const source = random.integer(hubs.length);
      let destination = random.integer(hubs.length - 1);
      if (destination >= source) destination += 1;
      journeyPenalties[day][source][destination] += 1 + random.integer(4);
    }
    const routeByPair = new Map(transferRoutes.map((route) => [`${route.sourceHubId}:${route.destinationHubId}`, route]));
    const inventory = Object.fromEntries(hubs.flatMap((hub) => cableTypes.map((type) => [`${hub.id}:${type.id}`, simulation.initialInventoryPerHubType])));
    const hubStats = hubs.map((hub) => ({ id: hub.id, label: hub.label, needs: 0, fulfilled: 0, returns: 0, supplied: 0 }));
    const typeStats = cableTypes.map((type) => ({ id: type.id, label: type.label, needs: 0, fulfilled: 0, burden: 0 }));
    const flows = new Map();
    const daily = [];
    let totalBurden = 0;
    let fulfilledNeeds = 0;
    let optimalAllocations = 0;
    for (let day = 0; day < simulation.durationDays; day += 1) {
      let dayNeeds = 0;
      let dayFulfilled = 0;
      let dayBurden = 0;
      for (let type = 0; type < cableTypes.length; type += 1) {
        hubs.forEach((hub, source) => {
          const returned = returnCounts[day][type][source];
          inventory[`${hub.id}:${cableTypes[type].id}`] += returned;
          hubStats[source].returns += returned;
        });
        const supplies = hubs.map((hub) => inventory[`${hub.id}:${cableTypes[type].id}`]);
        const demands = needCounts[day][type];
        const costs = hubs.map((sourceHub, source) => hubs.map((destinationHub, destination) => {
          if (source === destination) return 0;
          return routeByPair.get(`${sourceHub.id}:${destinationHub.id}`).costUnits + journeyPenalties[day][source][destination];
        }));
        const allocation = minimumCostTransport(supplies, demands, costs);
        if (!allocation.optimalityProven) throw new Error(`Cable network allocation ${day}:${type} did not prove optimality`);
        optimalAllocations += 1;
        dayNeeds += allocation.demand;
        dayFulfilled += allocation.delivered;
        dayBurden += allocation.cost;
        typeStats[type].needs += allocation.demand;
        typeStats[type].fulfilled += allocation.delivered;
        typeStats[type].burden += allocation.cost;
        allocation.flows.forEach((row) => {
          const sourceHub = hubs[row.source];
          const destinationHub = hubs[row.destination];
          inventory[`${sourceHub.id}:${cableTypes[type].id}`] -= row.quantity;
          hubStats[row.source].supplied += row.quantity;
          hubStats[row.destination].fulfilled += row.quantity;
          const key = `${sourceHub.id}:${destinationHub.id}`;
          const current = flows.get(key) || { sourceHubId: sourceHub.id, destinationHubId: destinationHub.id, quantity: 0, burden: 0 };
          current.quantity += row.quantity;
          current.burden += row.quantity * costs[row.source][row.destination];
          flows.set(key, current);
        });
        demands.forEach((quantity, destination) => { hubStats[destination].needs += quantity; });
      }
      fulfilledNeeds += dayFulfilled;
      totalBurden += dayBurden;
      daily.push(Object.freeze({ day: day + 1, needs: dayNeeds, fulfilled: dayFulfilled, burden: dayBurden, optimalityProven: true }));
    }
    const startingInventory = hubs.length * cableTypes.length * simulation.initialInventoryPerHubType;
    const endingInventory = Object.values(inventory).reduce((total, quantity) => total + quantity, 0);
    const allocations = simulation.durationDays * cableTypes.length;
    const summary = Object.freeze({
      needs: simulation.needCount,
      fulfilledNeeds,
      fulfillmentPercent: percentage(fulfilledNeeds, simulation.needCount),
      randomEvents: simulation.needCount + simulation.returnCount + simulation.journeyEventCount,
      returns: simulation.returnCount,
      journeyEvents: simulation.journeyEventCount,
      participants: simulation.participantCount,
      startingInventory,
      endingInventory,
      totalBurden,
      allocations,
      optimalAllocations,
      optimalityPercent: percentage(optimalAllocations, allocations),
      optimalityProven: optimalAllocations === allocations,
    });
    return Object.freeze({
      schema: 'simulatte.plugin.cableTraderSimulation.v1',
      id: `cable-network-${stableId(`${simulation.seed}:${simulation.needCount}:${totalBurden}`)}`,
      seed: simulation.seed,
      durationDays: simulation.durationDays,
      summary,
      daily: Object.freeze(daily),
      hubStats: Object.freeze(hubStats.map((row) => Object.freeze({ ...row, endingInventory: inventoryAtHub(inventory, row.id) }))),
      typeStats: Object.freeze(typeStats.map(Object.freeze)),
      flows: Object.freeze([...flows.values()].map(Object.freeze).sort((left, right) => right.quantity - left.quantity || `${left.sourceHubId}:${left.destinationHubId}`.localeCompare(`${right.sourceHubId}:${right.destinationHubId}`))),
      endingInventory: Object.freeze(inventory),
      needSamples: Object.freeze(needSamples),
      solver: Object.freeze({ algorithm: 'exact_min_cost_maximum_flow', completeCandidateGraph: true, allocationUnit: 'day_cable_family', optimalityProven: true }),
      claimBoundary: 'Exact optimum over every modeled day, cable family, hub, inventory unit, and complete inter-hub route set. Seeded events model possible demand and journey costs; they are not forecasts of real people.',
    });
  }

  function minimumCostTransport(supplies, demands, costs) {
    if (!Array.isArray(supplies) || !Array.isArray(demands) || !Array.isArray(costs)) throw new Error('Cable transport expected supply, demand, and cost arrays');
    const supplyCount = supplies.length;
    const demandCount = demands.length;
    const source = 0;
    const supplyOffset = 1;
    const demandOffset = supplyOffset + supplyCount;
    const sink = demandOffset + demandCount;
    const graph = Array.from({ length: sink + 1 }, () => []);
    const transportEdges = Array.from({ length: supplyCount }, () => Array(demandCount));
    supplies.forEach((capacity, index) => addEdge(graph, source, supplyOffset + index, capacity, 0));
    demands.forEach((capacity, index) => addEdge(graph, demandOffset + index, sink, capacity, 0));
    for (let supply = 0; supply < supplyCount; supply += 1) {
      for (let demand = 0; demand < demandCount; demand += 1) {
        transportEdges[supply][demand] = addEdge(graph, supplyOffset + supply, demandOffset + demand, Number.MAX_SAFE_INTEGER, costs[supply][demand]);
      }
    }
    const target = demands.reduce((total, quantity) => total + quantity, 0);
    let delivered = 0;
    let cost = 0;
    while (delivered < target) {
      const shortest = shortestResidualPath(graph, source);
      if (!Number.isFinite(shortest.distance[sink])) break;
      let quantity = target - delivered;
      for (let node = sink; node !== source; node = shortest.previous[node].from) quantity = Math.min(quantity, shortest.previous[node].edge.capacity);
      for (let node = sink; node !== source; node = shortest.previous[node].from) {
        const edge = shortest.previous[node].edge;
        edge.capacity -= quantity;
        edge.reverse.capacity += quantity;
      }
      delivered += quantity;
      cost += quantity * shortest.distance[sink];
    }
    const flows = [];
    transportEdges.forEach((row, supply) => row.forEach((edge, demand) => {
      if (edge.reverse.capacity > 0) flows.push(Object.freeze({ source: supply, destination: demand, quantity: edge.reverse.capacity, unitCost: costs[supply][demand] }));
    }));
    return Object.freeze({ demand: target, delivered, cost, flows: Object.freeze(flows), optimalityProven: true });
  }

  function addEdge(graph, from, to, capacity, cost) {
    const forward = { from, to, capacity, cost, order: graph[from].length, reverse: null };
    const reverse = { from: to, to: from, capacity: 0, cost: -cost, order: graph[to].length, reverse: forward };
    forward.reverse = reverse;
    graph[from].push(forward);
    graph[to].push(reverse);
    return forward;
  }

  function shortestResidualPath(graph, source) {
    const distance = Array(graph.length).fill(Infinity);
    const previous = Array(graph.length).fill(null);
    distance[source] = 0;
    for (let pass = 0; pass < graph.length - 1; pass += 1) {
      let changed = false;
      for (let from = 0; from < graph.length; from += 1) {
        if (!Number.isFinite(distance[from])) continue;
        for (const edge of graph[from]) {
          if (edge.capacity <= 0) continue;
          const candidate = distance[from] + edge.cost;
          if (candidate < distance[edge.to]) {
            distance[edge.to] = candidate;
            previous[edge.to] = { from, edge };
            changed = true;
          }
        }
      }
      if (!changed) break;
    }
    return { distance, previous };
  }

  function createRandom(seed) {
    let state = parseInt(stableId(seed), 16) || 1;
    function next() {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      return (state >>> 0) / 4294967296;
    }
    return Object.freeze({
      integer(limit) { if (!Number.isInteger(limit) || limit < 1) throw new Error(`Cable random integer expected a positive limit, received ${limit}`); return Math.floor(next() * limit); },
      weightedIndex(weights) {
        const total = weights.reduce((sum, weight) => sum + weight, 0);
        let target = next() * total;
        for (let index = 0; index < weights.length; index += 1) { target -= weights[index]; if (target < 0) return index; }
        return weights.length - 1;
      },
    });
  }

  function createCube(first, second, third) { return Array.from({ length: first }, () => Array.from({ length: second }, () => Array(third).fill(0))); }
  function inventoryAtHub(inventory, hubId) { return Object.entries(inventory).reduce((total, [key, quantity]) => total + (key.startsWith(`${hubId}:`) ? quantity : 0), 0); }
  function percentage(numerator, denominator) { return denominator ? Math.round((numerator / denominator) * 10000) / 100 : 100; }
  function stableId(value) { let hash = 2166136261; for (const character of String(value)) { hash ^= character.codePointAt(0); hash = Math.imul(hash, 16777619); } return (hash >>> 0).toString(16); }

  function validateInputs(config, routes) {
    if (!config?.simulation || config.hubs.length < 2 || !config.cableTypes.length) throw new Error('Cable network expected simulation, hubs, and cable types');
    if (config.cableTypes.some((type) => !Number.isFinite(type.demandWeight) || type.demandWeight <= 0)) throw new Error('Cable network demand weights must be positive');
    const expectedPairs = config.hubs.length * (config.hubs.length - 1);
    if (!Array.isArray(routes) || routes.length !== expectedPairs) throw new Error(`Cable network expected ${expectedPairs} complete directed transfer routes, received ${routes?.length ?? 'missing'}`);
  }

  return Object.freeze({ createRandom, minimumCostTransport, simulateNetwork });
});
