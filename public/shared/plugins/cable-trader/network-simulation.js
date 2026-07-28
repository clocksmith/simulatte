(function attachCableTraderNetwork(root, factory) {
  const logistics = typeof module === 'object' && module.exports
    ? require('./logistics-engine.js')
    : root.SimulatteCableTraderLogistics;
  const api = factory(logistics);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteCableTraderNetwork = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createCableTraderNetwork(logistics) {
  function simulateNetwork(config, transferRoutes, options = {}) {
    validateInputs(config, transferRoutes);
    if (!logistics?.simulateNetwork) throw new Error('Cable logistics engine is unavailable');
    return logistics.simulateNetwork(config, transferRoutes, {
      ...options,
      scenarioIdentity: createScenarioIdentity(config),
    });
  }

  function minimumCostTransport(supplies, demands, costs) {
    validateTransportInputs(supplies, demands, costs);
    const source = 0;
    const supplyOffset = 1;
    const demandOffset = supplyOffset + supplies.length;
    const sink = demandOffset + demands.length;
    const graph = Array.from({ length: sink + 1 }, () => []);
    const transportEdges = Array.from({ length: supplies.length }, () => Array(demands.length));
    supplies.forEach((capacity, index) => addEdge(graph, source, supplyOffset + index, capacity, 0));
    demands.forEach((capacity, index) => addEdge(graph, demandOffset + index, sink, capacity, 0));
    supplies.forEach((unused, supply) => demands.forEach((ignored, demand) => {
      transportEdges[supply][demand] = addEdge(
        graph,
        supplyOffset + supply,
        demandOffset + demand,
        Number.MAX_SAFE_INTEGER,
        costs[supply][demand]
      );
    }));

    const target = demands.reduce((total, quantity) => total + quantity, 0);
    const potentials = Array(graph.length).fill(0);
    let delivered = 0;
    let cost = 0;
    while (delivered < target) {
      const shortest = shortestResidualPath(graph, source, potentials);
      if (!Number.isFinite(shortest.distance[sink])) break;
      const path = residualPath(shortest.previous, source, sink);
      const quantity = Math.min(target - delivered, ...path.map((edge) => edge.capacity));
      if (!(quantity > 0)) throw new Error('Cable transport augmentation must be positive');
      const pathCost = path.reduce((sum, edge) => sum + edge.cost, 0);
      path.forEach((edge) => {
        edge.capacity -= quantity;
        edge.reverse.capacity += quantity;
      });
      delivered += quantity;
      cost += quantity * pathCost;
    }

    const flows = [];
    transportEdges.forEach((row, supply) => row.forEach((edge, demand) => {
      if (edge.reverse.capacity <= 0) return;
      flows.push(Object.freeze({
        source: supply,
        destination: demand,
        quantity: edge.reverse.capacity,
        unitCost: costs[supply][demand],
      }));
    }));
    return Object.freeze({
      demand: target,
      delivered,
      cost,
      flows: Object.freeze(flows),
      optimalityProven: true,
    });
  }

  function shortestResidualPath(graph, source, potentials) {
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
        const reducedCost = edge.cost + potentials[from] - potentials[edge.to];
        if (reducedCost < -1e-9) throw new Error(`Cable transport negative reduced cost: ${reducedCost}`);
        const candidate = distance[from] + Math.max(0, reducedCost);
        if (candidate < distance[edge.to]) {
          distance[edge.to] = candidate;
          previous[edge.to] = edge;
        }
      }
    }
    distance.forEach((value, node) => {
      if (Number.isFinite(value)) potentials[node] += value;
    });
    return { distance, previous };
  }

  function nearestUnvisited(distance, visited) {
    let result = -1;
    for (let node = 0; node < distance.length; node += 1) {
      if (visited[node] || !Number.isFinite(distance[node])) continue;
      if (result < 0 || distance[node] < distance[result]) result = node;
    }
    return result;
  }

  function residualPath(previous, source, sink) {
    const path = [];
    for (let node = sink; node !== source;) {
      const edge = previous[node];
      if (!edge) throw new Error(`Cable transport path to node ${node} did not reach the source`);
      path.push(edge);
      node = edge.from;
    }
    return path;
  }

  function addEdge(graph, from, to, capacity, cost) {
    const forward = { from, to, capacity, cost, reverse: null };
    const reverse = { from: to, to: from, capacity: 0, cost: -cost, reverse: forward };
    forward.reverse = reverse;
    graph[from].push(forward);
    graph[to].push(reverse);
    return forward;
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
      initialInventoryPerHubType: config.simulation.initialInventoryPerHubType,
      demandPriority: config.simulation.demandPriority,
      allowSubstitutes: config.simulation.allowSubstitutes,
      reservePolicy: config.simulation.reservePolicy,
      transferCapacityMetersPerDay: config.simulation.transferCapacityMetersPerDay,
      allocationObjective: config.simulation.allocationObjective,
      fairnessWeight: config.simulation.fairnessWeight,
      disruptionScenario: config.simulation.disruptionScenario,
      interventions: (config.simulation.interventions || []).map((row) => ({
        id: row.id,
        kind: row.kind,
        day: row.day,
      })),
      cableTypes: config.cableTypes
        .filter((row) => selectedCableFamilyIds.includes(row.id))
        .map((row) => ({
          id: row.id,
          demandWeight: row.demandWeight,
          reelLengthM: row.reelLengthM,
          minimumUsefulRemnantM: row.minimumUsefulRemnantM,
          modeledCostPerMeter: row.modeledCostPerMeter,
          substitutesFor: row.substitutesFor,
        })),
      hubs: config.hubs.map((row) => ({ id: row.id, nodeId: row.nodeId })),
      demandSites: config.demandSites.map((row) => ({
        id: row.id,
        nodeId: row.nodeId,
        defaultPriority: row.defaultPriority,
      })),
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
      throw new Error('Cable network requires at least one selected cable family');
    }
    if (new Set(selectedIds).size !== selectedIds.length) {
      throw new Error('Cable network selected cable families must be unique');
    }
    const knownIds = new Set(cableTypes.map((row) => row.id));
    const unknownId = selectedIds.find((id) => !knownIds.has(id));
    if (unknownId) throw new Error(`Cable network references unknown cable family ${unknownId}`);
    const selected = new Set(selectedIds);
    return Object.freeze(cableTypes.filter((row) => selected.has(row.id)).map((row) => row.id));
  }

  function validateInputs(config, routes) {
    if (!config?.simulation || !Array.isArray(config.hubs) || config.hubs.length < 2) {
      throw new Error('Cable network requires simulation settings and at least two depots');
    }
    if (!Array.isArray(config.cableTypes) || !config.cableTypes.length) {
      throw new Error('Cable network requires cable families');
    }
    if (!Array.isArray(config.demandSites) || !config.demandSites.length) {
      throw new Error('Cable network requires project demand sites');
    }
    normalizeCableFamilyIds(config.cableTypes, config.simulation.selectedCableFamilyIds);
    const expectedRoutes = config.hubs.length * config.demandSites.length;
    if (!Array.isArray(routes) || routes.length !== expectedRoutes) {
      throw new Error(`Cable network requires ${expectedRoutes} depot-to-project routes`);
    }
  }

  function validateTransportInputs(supplies, demands, costs) {
    if (!Array.isArray(supplies) || !Array.isArray(demands) || !Array.isArray(costs)) {
      throw new Error('Cable transport requires supplies, demands, and costs');
    }
    if (costs.length !== supplies.length || costs.some((row) => row.length !== demands.length)) {
      throw new Error('Cable transport cost matrix dimensions do not match');
    }
    const invalid = [...supplies, ...demands, ...costs.flat()].find((value) => (
      !Number.isFinite(value) || value < 0
    ));
    if (invalid !== undefined) throw new Error('Cable transport inputs must be finite and non-negative');
  }

  function canonical(value) {
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
    if (value && typeof value === 'object') {
      return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
  }

  const SHA256_K = Object.freeze([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4, 0x5b9cca4f, 0x682e6ff3,
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
      [a, b, c, d, e, f, g, h].forEach((word, index) => {
        hash[index] = (hash[index] + word) >>> 0;
      });
    }
    return hash.map((word) => word.toString(16).padStart(8, '0')).join('');
  }

  function rotateRight(value, count) {
    return (value >>> count) | (value << (32 - count));
  }

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
  }

  return Object.freeze({
    canonical,
    createScenarioIdentity,
    minimumCostTransport,
    normalizeCableFamilyIds,
    sha256Hex,
    simulateNetwork,
  });
});
