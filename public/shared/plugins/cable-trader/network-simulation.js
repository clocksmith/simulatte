(function attachCableTraderNetwork(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteCableTraderNetwork = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createCableTraderNetwork() {
  function simulateNetwork(config, transferRoutes, options = {}) {
    validateInputs(config, transferRoutes);
    const { hubs, simulation } = config;
    const scenarioIdentity = createScenarioIdentity(config);
    const cableTypes = config.cableTypes.filter((type) => scenarioIdentity.selectedCableFamilyIds.includes(type.id));
    const scenarioModifier = config.scenarioModifiers.find((row) => row.id === simulation.scenarioId)
      || config.scenarioModifiers[0];
    const allocationPolicy = options.allocationPolicy || 'optimized';
    if (!['optimized', 'local-only'].includes(allocationPolicy)) {
      throw new Error(`Cable network allocation policy is invalid: ${allocationPolicy}`);
    }
    const exogenous = options.exogenous
      ? validateExogenous(options.exogenous, config, scenarioModifier.id)
      : generateExogenous(
        { ...config, cableTypes, scenarioIdentity },
        scenarioModifier,
        options.rng || createRandom(scenarioIdentity.seed)
      );
    const {
      needCounts,
      returnCounts,
      journeyPenalties,
      journeyEventCounts,
      needSamples,
    } = exogenous;
    const routeByPair = new Map(transferRoutes.map((route) => [`${route.sourceHubId}:${route.destinationHubId}`, route]));
    const inventory = Object.fromEntries(hubs.flatMap((hub) => cableTypes.map((type) => [`${hub.id}:${type.id}`, simulation.initialInventoryPerHubType])));
    const hubStats = hubs.map((hub) => ({ id: hub.id, label: hub.label, needs: 0, fulfilled: 0, returns: 0, supplied: 0 }));
    const typeStats = cableTypes.map((type) => ({ id: type.id, label: type.label, needs: 0, fulfilled: 0, burden: 0 }));
    const flows = new Map();
    const daily = [];
    const snapshots = [];
    const events = [];
    let totalBurden = 0;
    let fulfilledNeeds = 0;
    let optimalAllocations = 0;
    let processedNeeds = 0;
    let processedReturns = 0;
    let processedJourneyEvents = 0;
    const startingInventory = hubs.length * cableTypes.length * simulation.initialInventoryPerHubType;
    snapshots.push(createSnapshot({
      day: 0,
      durationDays: simulation.durationDays,
      inventory,
      hubStats,
      typeStats,
      flows,
      needs: 0,
      fulfilledNeeds: 0,
      returns: 0,
      journeyEvents: 0,
      modeledRequests: 0,
      startingInventory,
      totalBurden: 0,
      allocations: 0,
      optimalAllocations: 0,
      scenarioIdentity,
    }));
    for (let day = 0; day < simulation.durationDays; day += 1) {
      let dayNeeds = 0;
      let dayFulfilled = 0;
      let dayBurden = 0;
      let dayReturns = 0;
      for (let type = 0; type < cableTypes.length; type += 1) {
        hubs.forEach((hub, source) => {
          const returned = returnCounts[day][type][source];
          inventory[`${hub.id}:${cableTypes[type].id}`] += returned;
          hubStats[source].returns += returned;
          dayReturns += returned;
        });
        const supplies = hubs.map((hub) => inventory[`${hub.id}:${cableTypes[type].id}`]);
        const demands = needCounts[day][type];
        const costs = hubs.map((sourceHub, source) => hubs.map((destinationHub, destination) => {
          if (source === destination) return 0;
          return routeByPair.get(`${sourceHub.id}:${destinationHub.id}`).costUnits + journeyPenalties[day][source][destination];
        }));
        const allocation = allocationPolicy === 'local-only'
          ? localInventoryTransport(supplies, demands)
          : minimumCostTransport(supplies, demands, costs);
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
      processedNeeds += dayNeeds;
      processedReturns += dayReturns;
      processedJourneyEvents += journeyEventCounts[day];
      daily.push(Object.freeze({
        day: day + 1,
        needs: dayNeeds,
        fulfilled: dayFulfilled,
        returns: dayReturns,
        journeyEvents: journeyEventCounts[day],
        burden: dayBurden,
        optimalityProven: true,
      }));
      snapshots.push(createSnapshot({
        day: day + 1,
        durationDays: simulation.durationDays,
        inventory,
        hubStats,
        typeStats,
        flows,
        needs: processedNeeds,
        fulfilledNeeds,
        returns: processedReturns,
        journeyEvents: processedJourneyEvents,
        modeledRequests: processedNeeds,
        startingInventory,
        totalBurden,
        allocations: (day + 1) * cableTypes.length,
        optimalAllocations,
        scenarioIdentity,
      }));
      const before = snapshots[day];
      const after = snapshots[day + 1];
      events.push(Object.freeze({
        schema: 'simulatte.SimulationEvent.v4-draft',
        id: `cable-trader:${scenarioIdentity.id}:${allocationPolicy}:event:day-${day + 1}`,
        kind: 'cable-trader.daily-allocation-settled',
        timestamp: Object.freeze({ value: day + 1, units: 'simulation_day' }),
        causalParentIds: Object.freeze(day
          ? [`cable-trader:${scenarioIdentity.id}:${allocationPolicy}:event:day-${day}`]
          : []),
        affectedEntityIds: Object.freeze([
          ...hubs.map((row) => `hub:${row.id}`),
          ...cableTypes.map((row) => `cable-type:${row.id}`),
        ]),
        beforeState: Object.freeze({
          id: `snapshot:day-${day}`,
          needs: before.summary.needs,
          fulfilledNeeds: before.summary.fulfilledNeeds,
          endingInventory: before.summary.endingInventory,
        }),
        afterState: Object.freeze({
          id: `snapshot:day-${day + 1}`,
          needs: after.summary.needs,
          fulfilledNeeds: after.summary.fulfilledNeeds,
          endingInventory: after.summary.endingInventory,
        }),
        measures: Object.freeze({
          arrivingNeeds: dayNeeds,
          returns: dayReturns,
          journeyCostEvents: journeyEventCounts[day],
          fulfilledNeeds: dayFulfilled,
          transportBurden: dayBurden,
          scenarioId: scenarioIdentity.id,
          configurationHash: scenarioIdentity.configurationHash,
          selectedCableFamilyIds: scenarioIdentity.selectedCableFamilyIds,
        }),
        evidenceReferences: Object.freeze([
          'cable-trader:data:authored-scenario',
          'cable-trader:model:event-generator',
          'cable-trader:model:min-cost-flow',
        ]),
        origin: 'simulated',
        temporalStatus: 'forecast',
        uncertainty: Object.freeze({
          kind: 'distribution',
          value: Object.freeze({ ensembleSize: 1, seed: scenarioIdentity.seed, intervalStatus: 'not_computed' }),
        }),
      }));
    }
    const endingInventory = Object.values(inventory).reduce((total, quantity) => total + quantity, 0);
    const allocations = simulation.durationDays * cableTypes.length;
    const summary = Object.freeze({
      needs: simulation.needCount,
      fulfilledNeeds,
      fulfillmentPercent: percentage(fulfilledNeeds, simulation.needCount),
      randomEvents: simulation.needCount + simulation.returnCount + simulation.journeyEventCount,
      returns: simulation.returnCount,
      journeyEvents: simulation.journeyEventCount,
      modeledRequests: simulation.needCount,
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
      id: `cable-network-${stableId(`${scenarioIdentity.id}:${scenarioIdentity.seed}:${allocationPolicy}:${simulation.needCount}:${fulfilledNeeds}:${totalBurden}`)}`,
      seed: scenarioIdentity.seed,
      baseSeed: scenarioIdentity.baseSeed,
      scenarioId: scenarioIdentity.id,
      scenarioProfileId: scenarioModifier.id,
      configurationHash: scenarioIdentity.configurationHash,
      selectedCableFamilyIds: scenarioIdentity.selectedCableFamilyIds,
      allocationPolicy,
      durationDays: simulation.durationDays,
      summary,
      daily: Object.freeze(daily),
      snapshots: Object.freeze(snapshots),
      events: Object.freeze(events),
      hubStats: Object.freeze(hubStats.map((row) => Object.freeze({ ...row, endingInventory: inventoryAtHub(inventory, row.id) }))),
      typeStats: Object.freeze(typeStats.map(Object.freeze)),
      flows: Object.freeze([...flows.values()].map(Object.freeze).sort((left, right) => right.quantity - left.quantity || `${left.sourceHubId}:${left.destinationHubId}`.localeCompare(`${right.sourceHubId}:${right.destinationHubId}`))),
      endingInventory: Object.freeze(inventory),
      needSamples: Object.freeze(needSamples),
      exogenous,
      solver: Object.freeze(allocationPolicy === 'optimized'
        ? { algorithm: 'exact_min_cost_maximum_flow', completeCandidateGraph: true, allocationUnit: 'day_cable_family', optimalityProven: true }
        : { algorithm: 'exact_local_inventory_only', completeCandidateGraph: false, allocationUnit: 'day_cable_family_hub', optimalityProven: true }),
      claimBoundary: allocationPolicy === 'optimized'
        ? 'Exact optimum over every modeled day, cable family, hub, inventory unit, and complete inter-hub route set. Seeded demand events and journey costs are scenario inputs, not observed operations.'
        : 'Exact fulfillment under the constraint that each modeled demand event can use inventory at its destination hub only. Seeded demand events are scenario inputs, not observed operations.',
    });
  }

  function generateExogenous(config, scenarioModifier, random) {
    const { cableTypes, hubs, simulation, scenarioIdentity } = config;
    const needCounts = createCube(simulation.durationDays, cableTypes.length, hubs.length);
    const returnCounts = createCube(simulation.durationDays, cableTypes.length, hubs.length);
    const journeyPenalties = createCube(simulation.durationDays, hubs.length, hubs.length);
    const journeyEventCounts = Array(simulation.durationDays).fill(0);
    const needSamples = [];
    const needEvents = [];
    const weightedTypes = cableTypes.map((type) => type.demandWeight * (scenarioModifier.demandTypeMultipliers[type.id] || 1));
    const weightedDemandHubs = hubs.map((hub) => scenarioModifier.demandHubMultipliers[hub.id] || 1);
    const weightedReturnHubs = hubs.map((hub) => scenarioModifier.returnHubMultipliers[hub.id] || 1);
    for (let index = 0; index < simulation.needCount; index += 1) {
      const day = random.integer(simulation.durationDays);
      const cableType = random.weightedIndex(weightedTypes);
      const destination = random.weightedIndex(weightedDemandHubs);
      needCounts[day][cableType][destination] += 1;
      needEvents.push({ day, cableType });
      if (needSamples.length < 16) {
        needSamples.push({
          id: `need-${index + 1}`,
          day: day + 1,
          cableTypeId: cableTypes[cableType].id,
          destinationHubId: hubs[destination].id,
        });
      }
    }
    for (let index = 0; index < simulation.returnCount; index += 1) {
      const pairedNeed = needEvents[index % needEvents.length];
      returnCounts[pairedNeed.day][pairedNeed.cableType][random.weightedIndex(weightedReturnHubs)] += 1;
    }
    for (let index = 0; index < simulation.journeyEventCount; index += 1) {
      const day = random.integer(simulation.durationDays);
      const source = random.integer(hubs.length);
      let destination = random.integer(hubs.length - 1);
      if (destination >= source) destination += 1;
      journeyPenalties[day][source][destination] += 1 + random.integer(4);
      journeyEventCounts[day] += 1;
    }
    return deepFreeze({
      schema: 'simulatte.plugin.cableTraderExogenousInputs.v1',
      scenarioId: scenarioIdentity.id,
      scenarioProfileId: scenarioModifier.id,
      seed: scenarioIdentity.seed,
      configurationHash: scenarioIdentity.configurationHash,
      selectedCableFamilyIds: scenarioIdentity.selectedCableFamilyIds,
      needCounts,
      returnCounts,
      journeyPenalties,
      journeyEventCounts,
      needSamples,
    });
  }

  function validateExogenous(value, config, scenarioId) {
    const identity = createScenarioIdentity({
      ...config,
      simulation: { ...config.simulation, scenarioId },
    });
    if (value?.schema !== 'simulatte.plugin.cableTraderExogenousInputs.v1'
      || value.scenarioId !== identity.id
      || value.scenarioProfileId !== scenarioId
      || value.seed !== identity.seed
      || value.configurationHash !== identity.configurationHash
      || canonical(value.selectedCableFamilyIds) !== canonical(identity.selectedCableFamilyIds)
      || !Array.isArray(value.needCounts)
      || value.needCounts.length !== config.simulation.durationDays
      || !Array.isArray(value.returnCounts)
      || value.returnCounts.length !== config.simulation.durationDays
      || !Array.isArray(value.journeyPenalties)
      || value.journeyPenalties.length !== config.simulation.durationDays
      || !Array.isArray(value.journeyEventCounts)
      || value.journeyEventCounts.length !== config.simulation.durationDays
      || !Array.isArray(value.needSamples)) {
      throw new Error('Cable network exogenous inputs do not match the selected scenario');
    }
    return deepFreeze(structuredClone(value));
  }

  function createSnapshot({
    day,
    durationDays,
    inventory,
    hubStats,
    typeStats,
    flows,
    needs,
    fulfilledNeeds,
    returns,
    journeyEvents,
    modeledRequests,
    startingInventory,
    totalBurden,
    allocations,
    optimalAllocations,
    scenarioIdentity,
  }) {
    const endingInventory = Object.values(inventory).reduce((total, quantity) => total + quantity, 0);
    return Object.freeze({
      day,
      durationDays,
      scenarioId: scenarioIdentity.id,
      configurationHash: scenarioIdentity.configurationHash,
      selectedCableFamilyIds: scenarioIdentity.selectedCableFamilyIds,
      summary: Object.freeze({
        needs,
        fulfilledNeeds,
        fulfillmentPercent: percentage(fulfilledNeeds, needs),
        randomEvents: needs + returns + journeyEvents,
        returns,
        journeyEvents,
        modeledRequests,
        startingInventory,
        endingInventory,
        totalBurden,
        allocations,
        optimalAllocations,
        optimalityPercent: percentage(optimalAllocations, allocations),
        optimalityProven: optimalAllocations === allocations,
      }),
      hubStats: Object.freeze(hubStats.map((row) => Object.freeze({ ...row, endingInventory: inventoryAtHub(inventory, row.id) }))),
      typeStats: Object.freeze(typeStats.map((row) => Object.freeze({ ...row }))),
      flows: Object.freeze([...flows.values()].map((row) => Object.freeze({ ...row })).sort((left, right) => right.quantity - left.quantity || `${left.sourceHubId}:${left.destinationHubId}`.localeCompare(`${right.sourceHubId}:${right.destinationHubId}`))),
      inventory: Object.freeze({ ...inventory }),
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
    const potentials = Array(graph.length).fill(0);
    let delivered = 0;
    let cost = 0;
    while (delivered < target) {
      const shortest = shortestResidualPath(graph, source, potentials);
      if (!Number.isFinite(shortest.distance[sink])) break;
      let quantity = target - delivered;
      const path = [];
      for (let node = sink; node !== source;) {
        const previous = shortest.previous[node];
        if (!previous) throw new Error(`Cable transport path to node ${node} did not reach the source`);
        path.push(previous.edge);
        quantity = Math.min(quantity, previous.edge.capacity);
        node = previous.from;
      }
      if (!(quantity > 0)) throw new Error(`Cable transport expected a positive augmentation, received ${quantity}`);
      let pathCost = 0;
      path.forEach((edge) => {
        edge.capacity -= quantity;
        edge.reverse.capacity += quantity;
        pathCost += edge.cost;
      });
      delivered += quantity;
      cost += quantity * pathCost;
    }
    const flows = [];
    transportEdges.forEach((row, supply) => row.forEach((edge, demand) => {
      if (edge.reverse.capacity > 0) flows.push(Object.freeze({ source: supply, destination: demand, quantity: edge.reverse.capacity, unitCost: costs[supply][demand] }));
    }));
    return Object.freeze({ demand: target, delivered, cost, flows: Object.freeze(flows), optimalityProven: true });
  }

  function localInventoryTransport(supplies, demands) {
    if (!Array.isArray(supplies) || !Array.isArray(demands) || supplies.length !== demands.length) {
      throw new Error('Cable local-only transport expected aligned supply and demand arrays');
    }
    const flows = [];
    let delivered = 0;
    demands.forEach((demand, index) => {
      const quantity = Math.min(supplies[index], demand);
      delivered += quantity;
      if (quantity > 0) {
        flows.push(Object.freeze({
          source: index,
          destination: index,
          quantity,
          unitCost: 0,
        }));
      }
    });
    return Object.freeze({
      demand: demands.reduce((total, quantity) => total + quantity, 0),
      delivered,
      cost: 0,
      flows: Object.freeze(flows),
      optimalityProven: true,
    });
  }

  function addEdge(graph, from, to, capacity, cost) {
    const forward = { from, to, capacity, cost, order: graph[from].length, reverse: null };
    const reverse = { from: to, to: from, capacity: 0, cost: -cost, order: graph[to].length, reverse: forward };
    forward.reverse = reverse;
    graph[from].push(forward);
    graph[to].push(reverse);
    return forward;
  }

  function shortestResidualPath(graph, source, potentials) {
    const distance = Array(graph.length).fill(Infinity);
    const previous = Array(graph.length).fill(null);
    const visited = Array(graph.length).fill(false);
    distance[source] = 0;
    for (let pass = 0; pass < graph.length; pass += 1) {
      let from = -1;
      for (let node = 0; node < graph.length; node += 1) {
        if (visited[node] || !Number.isFinite(distance[node])) continue;
        if (from < 0 || distance[node] < distance[from] || (distance[node] === distance[from] && node < from)) from = node;
      }
      if (from < 0) break;
      visited[from] = true;
      for (const edge of graph[from]) {
        if (edge.capacity <= 0 || visited[edge.to]) continue;
        const reducedCost = edge.cost + potentials[from] - potentials[edge.to];
        if (reducedCost < -1e-9) {
          throw new Error(`Cable transport reduced cost became negative: ${reducedCost}`);
        }
        const candidate = distance[from] + Math.max(0, reducedCost);
        if (candidate < distance[edge.to]) {
          distance[edge.to] = candidate;
          previous[edge.to] = { from, edge };
        }
      }
    }
    distance.forEach((value, node) => {
      if (Number.isFinite(value)) potentials[node] += value;
    });
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
  function canonical(value) {
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
    if (value && typeof value === 'object') {
      return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
  }

  function createScenarioIdentity(config) {
    const selectedCableFamilyIds = normalizeCableFamilyIds(
      config.cableTypes,
      config.simulation.selectedCableFamilyIds
    );
    const scenarioProfileId = config.scenarioModifiers.some((row) => row.id === config.simulation.scenarioId)
      ? config.simulation.scenarioId
      : config.scenarioModifiers[0].id;
    const baseSeed = config.simulation.seed;
    const seed = `${baseSeed}:families:${selectedCableFamilyIds.join(',')}`;
    const configuration = {
      configId: config.id,
      configSchema: config.schema,
      scenarioProfileId,
      scenarioModifier: config.scenarioModifiers.find((row) => row.id === scenarioProfileId),
      baseSeed,
      seed,
      selectedCableFamilyIds,
      durationDays: config.simulation.durationDays,
      needCount: config.simulation.needCount,
      returnCount: config.simulation.returnCount,
      journeyEventCount: config.simulation.journeyEventCount,
      initialInventoryPerHubType: config.simulation.initialInventoryPerHubType,
      cableTypes: config.cableTypes
        .filter((row) => selectedCableFamilyIds.includes(row.id))
        .map((row) => ({ id: row.id, demandWeight: row.demandWeight })),
      hubs: config.hubs.map((row) => ({ id: row.id, nodeId: row.nodeId })),
    };
    const configurationHash = sha256Hex(canonical(configuration));
    return deepFreeze({
      schema: 'simulatte.plugin.cableTraderScenarioIdentity.v1',
      id: `${scenarioProfileId}:families:${configurationHash.slice(0, 16)}`,
      scenarioProfileId,
      baseSeed,
      seed,
      configurationHash,
      selectedCableFamilyIds,
    });
  }

  function normalizeCableFamilyIds(cableTypes, selectedIds) {
    if (!Array.isArray(selectedIds) || !selectedIds.length) {
      throw new Error('Cable network selectedCableFamilyIds expected at least one cable family');
    }
    const selected = new Set(selectedIds);
    if (selected.size !== selectedIds.length) {
      throw new Error('Cable network selectedCableFamilyIds must be unique');
    }
    const knownIds = new Set(cableTypes.map((row) => row.id));
    const unknownId = selectedIds.find((id) => !knownIds.has(id));
    if (unknownId) throw new Error(`Cable network selectedCableFamilyIds references unknown cable family ${unknownId}`);
    return Object.freeze(cableTypes.filter((row) => selected.has(row.id)).map((row) => row.id));
  }

  const SHA256_K = Object.freeze([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]);

  function sha256Hex(value) {
    const bytes = new TextEncoder().encode(String(value));
    const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
    const padded = new Uint8Array(paddedLength);
    padded.set(bytes);
    padded[bytes.length] = 0x80;
    const view = new DataView(padded.buffer);
    const bitLength = bytes.length * 8;
    view.setUint32(paddedLength - 8, Math.floor(bitLength / 4294967296));
    view.setUint32(paddedLength - 4, bitLength >>> 0);
    const hash = [
      0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
      0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
    ];
    const words = new Uint32Array(64);
    for (let offset = 0; offset < paddedLength; offset += 64) {
      for (let index = 0; index < 16; index += 1) words[index] = view.getUint32(offset + index * 4);
      for (let index = 16; index < 64; index += 1) {
        const a = words[index - 15];
        const b = words[index - 2];
        const sigma0 = rotateRight(a, 7) ^ rotateRight(a, 18) ^ (a >>> 3);
        const sigma1 = rotateRight(b, 17) ^ rotateRight(b, 19) ^ (b >>> 10);
        words[index] = (words[index - 16] + sigma0 + words[index - 7] + sigma1) >>> 0;
      }
      let [a, b, c, d, e, f, g, h] = hash;
      for (let index = 0; index < 64; index += 1) {
        const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
        const choice = (e & f) ^ (~e & g);
        const temp1 = (h + sum1 + choice + SHA256_K[index] + words[index]) >>> 0;
        const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
        const majority = (a & b) ^ (a & c) ^ (b & c);
        const temp2 = (sum0 + majority) >>> 0;
        [h, g, f, e, d, c, b, a] = [g, f, e, (d + temp1) >>> 0, c, b, a, (temp1 + temp2) >>> 0];
      }
      [a, b, c, d, e, f, g, h].forEach((word, index) => { hash[index] = (hash[index] + word) >>> 0; });
    }
    return hash.map((word) => word.toString(16).padStart(8, '0')).join('');
  }

  function rotateRight(value, count) {
    return (value >>> count) | (value << (32 - count));
  }
  function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.values(value).forEach(deepFreeze); return Object.freeze(value); }

  function validateInputs(config, routes) {
    if (!config?.simulation || config.hubs.length < 2 || !config.cableTypes.length) throw new Error('Cable network expected simulation, hubs, and cable types');
    normalizeCableFamilyIds(config.cableTypes, config.simulation.selectedCableFamilyIds);
    if (!Array.isArray(config.simulation.ensembleSeeds)
      || config.simulation.ensembleSeeds.length < 2
      || new Set(config.simulation.ensembleSeeds).size !== config.simulation.ensembleSeeds.length) {
      throw new Error('Cable network ensembleSeeds expected at least two unique declared seeds');
    }
    if (config.cableTypes.some((type) => !Number.isFinite(type.demandWeight) || type.demandWeight <= 0)) throw new Error('Cable network demand weights must be positive');
    if (!Array.isArray(config.scenarioModifiers) || !config.scenarioModifiers.length) throw new Error('Cable network expected scenario modifiers');
    const cableTypeIds = new Set(config.cableTypes.map((row) => row.id));
    const hubIds = new Set(config.hubs.map((row) => row.id));
    const scenarioIds = new Set();
    config.scenarioModifiers.forEach((modifier) => {
      if (!modifier?.id) throw new Error('Cable network scenario modifier expected an ID');
      if (scenarioIds.has(modifier.id)) throw new Error(`Cable network duplicates scenario modifier ${modifier.id}`);
      scenarioIds.add(modifier.id);
      const invalidTypeId = Object.keys(modifier.demandTypeMultipliers || {}).find((id) => !cableTypeIds.has(id));
      const invalidHubId = [...Object.keys(modifier.demandHubMultipliers || {}), ...Object.keys(modifier.returnHubMultipliers || {})].find((id) => !hubIds.has(id));
      if (invalidTypeId) throw new Error(`Cable network scenario modifier ${modifier.id} references unknown cable type ${invalidTypeId}`);
      if (invalidHubId) throw new Error(`Cable network scenario modifier ${modifier.id} references unknown hub ${invalidHubId}`);
    });
    const expectedPairs = config.hubs.length * (config.hubs.length - 1);
    if (!Array.isArray(routes) || routes.length !== expectedPairs) throw new Error(`Cable network expected ${expectedPairs} complete directed transfer routes, received ${routes?.length ?? 'missing'}`);
  }

  return Object.freeze({
    canonical,
    createRandom,
    createScenarioIdentity,
    localInventoryTransport,
    minimumCostTransport,
    normalizeCableFamilyIds,
    sha256Hex,
    simulateNetwork,
  });
});
