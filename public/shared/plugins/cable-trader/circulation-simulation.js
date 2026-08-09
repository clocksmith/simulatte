(function attachCableTraderCirculation(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteCableTraderCirculation = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createCableTraderCirculation() {
  const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
  const ROUTABLE_COMPONENT_CACHE = new WeakMap();

  function createNetwork(config, worldModel) {
    const settings = validateConfig(config);
    const routableNodes = largestRoutableComponent(worldModel);
    if (routableNodes.length <= settings.hubCount) {
      throw new Error(`Cable Trader needs more than ${settings.hubCount} mutually routable city nodes`);
    }
    const networkSeed = [
      config.simulation.seed,
      config.simulation.scenarioId || 'everyday-exchange',
      settings.peopleCount,
      settings.hubCount,
      worldModel.world.id || 'world',
    ].join(':');
    const hubs = selectSpreadHubs(routableNodes, settings.hubCount, networkSeed);
    const hubNodeIds = new Set(hubs.map((row) => row.nodeId));
    const anchorNodes = routableNodes.filter((row) => !hubNodeIds.has(row.id));
    const offset = fnv1a(`${networkSeed}:residence-offset`) % anchorNodes.length;
    const stride = coprimeStride(anchorNodes.length, fnv1a(`${networkSeed}:residence-stride`));
    const angleOffset = fnv1a(`${networkSeed}:residence-angle`) / 0xffffffff * Math.PI * 2;
    const residences = Array.from({ length: settings.peopleCount }, (unused, index) => {
      const anchorIndex = (offset + index * stride) % anchorNodes.length;
      const anchor = anchorNodes[anchorIndex];
      const lap = Math.floor(index / anchorNodes.length);
      const radiusM = 1.2 + lap * 1.35;
      const angle = angleOffset + index * GOLDEN_ANGLE;
      const position = {
        x: Number((anchor.position.x + Math.cos(angle) * radiusM).toFixed(6)),
        y: Number((anchor.position.y + Math.sin(angle) * radiusM).toFixed(6)),
      };
      const preferredHub = nearestHub(position, hubs);
      return {
        id: `residence-${String(index + 1).padStart(5, '0')}`,
        label: `Residence ${String(index + 1).padStart(5, '0')}`,
        nodeId: anchor.id,
        position,
        preferredHubId: preferredHub.id,
      };
    });
    return {
      schema: 'simulatte.plugin.cableTraderNetwork.v1',
      worldId: worldModel.world.id || 'world',
      hubs,
      residences,
    };
  }

  function simulateCirculation(config, network) {
    const settings = validateConfig(config);
    validateNetwork(network, settings);
    const hubs = network.hubs;
    const residences = network.residences;
    const residenceById = new Map(residences.map((row) => [row.id, row]));
    const cableTypes = config.cableTypes.filter((row) => settings.selectedCableTypeIds.includes(row.id));
    const identity = createScenarioIdentity(config, network);
    const random = createRandom(identity.seed);
    const people = residences.map((residence, index) => ({
      id: `person-${String(index + 1).padStart(5, '0')}`,
      homeResidenceId: residence.id,
      preferredHubId: residence.preferredHubId,
    }));
    const peopleById = new Map(people.map((row) => [row.id, row]));
    const hubById = new Map(hubs.map((row) => [row.id, row]));
    const inventory = createMatrix(hubs, cableTypes, settings.initialInventoryPerHubCable);
    const backlog = createMatrix(hubs, cableTypes, 0);
    const waitingQueues = createMatrix(hubs, cableTypes, () => []);
    const cumulative = { supply: 0, demand: 0, fulfilled: 0, journeys: 0 };
    const snapshots = [
      createSnapshot({
        day: 0,
        durationDays: settings.durationDays,
        hubs,
        cableTypes,
        inventory,
        backlog,
        dailyBoards: emptyDailyBoards(hubs, cableTypes),
        journeys: [],
        cumulative,
        renderedTravelerCount: settings.renderedTravelerCount,
      }),
    ];
    const events = [];

    for (let day = 1; day <= settings.durationDays; day += 1) {
      const dailyBoards = emptyDailyBoards(hubs, cableTypes);
      const journeys = [];
      const usedPeople = new Set();
      const participation = seasonalParticipation(day);
      const actionCount = Math.max(
        12,
        Math.round(settings.peopleCount * settings.dailyParticipationRate * participation)
      );

      for (let actionIndex = 0; actionIndex < actionCount; actionIndex += 1) {
        const person = nextPerson(people, usedPeople, random);
        const residence = residenceById.get(person.homeResidenceId);
        const hub = hubById.get(person.preferredHubId);
        const action = random() < 0.5 ? 'dropoff' : 'pickup';
        const cableType = weightedChoice(
          cableTypes,
          action === 'dropoff' ? 'supplyWeight' : 'demandWeight',
          random
        );
        const board = dailyBoards[hub.id][cableType.id];

        if (action === 'dropoff') {
          board.supply += 1;
          cumulative.supply += 1;
          journeys.push(createJourney({
            day,
            sequence: journeys.length,
            action,
            person,
            cableType,
            hub,
            residence,
            random,
          }));
          cumulative.journeys += 1;

          if (backlog[hub.id][cableType.id] > 0) {
            backlog[hub.id][cableType.id] -= 1;
            board.fulfilled += 1;
            cumulative.fulfilled += 1;
            const waitingPersonId = waitingQueues[hub.id][cableType.id].shift();
            const waitingPerson = peopleById.get(waitingPersonId);
            const waitingResidence = residenceById.get(waitingPerson.homeResidenceId);
            journeys.push(createJourney({
              day,
              sequence: journeys.length,
              action: 'pickup',
              person: waitingPerson,
              cableType,
              hub,
              residence: waitingResidence,
              random,
              matchedFromBacklog: true,
            }));
            cumulative.journeys += 1;
          } else {
            inventory[hub.id][cableType.id] += 1;
          }
          continue;
        }

        board.demand += 1;
        cumulative.demand += 1;
        if (inventory[hub.id][cableType.id] > 0) {
          inventory[hub.id][cableType.id] -= 1;
          board.fulfilled += 1;
          cumulative.fulfilled += 1;
          journeys.push(createJourney({
            day,
            sequence: journeys.length,
            action,
            person,
            cableType,
            hub,
            residence,
            random,
          }));
          cumulative.journeys += 1;
        } else {
          backlog[hub.id][cableType.id] += 1;
          waitingQueues[hub.id][cableType.id].push(person.id);
        }
      }

      const snapshot = createSnapshot({
        day,
        durationDays: settings.durationDays,
        hubs,
        cableTypes,
        inventory,
        backlog,
        dailyBoards,
        journeys,
        cumulative,
        renderedTravelerCount: settings.renderedTravelerCount,
      });
      snapshots.push(snapshot);
      events.push({
        id: `${identity.id}:day-${day}`,
        kind: 'cable-trader.circulation-day',
        day,
        causalParentIds: day === 1 ? [] : [`${identity.id}:day-${day - 1}`],
        measures: {
          supply: snapshot.global.supply,
          demand: snapshot.global.demand,
          fulfilled: snapshot.global.fulfilled,
          waiting: snapshot.global.waiting,
          journeys: snapshot.global.journeys,
        },
      });
    }

    const finalSnapshot = snapshots.at(-1);
    const startingInventory = hubs.length * cableTypes.length * settings.initialInventoryPerHubCable;
    const endingInventory = finalSnapshot.global.inventory;
    const balance = {
      startingInventory,
      supplied: cumulative.supply,
      fulfilled: cumulative.fulfilled,
      endingInventory,
      pass: startingInventory + cumulative.supply === cumulative.fulfilled + endingInventory,
    };
    const summary = {
      peopleCount: people.length,
      residenceCount: residences.length,
      hubCount: hubs.length,
      cableTypeCount: cableTypes.length,
      durationDays: settings.durationDays,
      totalSupply: cumulative.supply,
      totalDemand: cumulative.demand,
      cablesReused: cumulative.fulfilled,
      waitingDemand: finalSnapshot.global.waiting,
      endingInventory,
      totalJourneys: cumulative.journeys,
      fulfillmentPercent: cumulative.demand
        ? Number((cumulative.fulfilled / cumulative.demand * 100).toFixed(1))
        : 100,
    };
    return {
      schema: 'simulatte.plugin.cableTraderCirculation.v1',
      id: identity.id,
      scenarioId: identity.scenarioId,
      seed: identity.seed,
      baseSeed: identity.baseSeed,
      configurationHash: identity.configurationHash,
      selectedCableTypeIds: identity.selectedCableTypeIds,
      durationDays: settings.durationDays,
      people,
      hubs,
      residences,
      activeHubIds: hubs.map((row) => row.id),
      activeResidenceIds: residences.map((row) => row.id),
      events,
      snapshots,
      summary,
      balance,
      claimBoundary: 'People, unique residences, cable supply, demand, inventories, and journeys are deterministic modeled activity. Residence anchors and route geometry come from the governed city network; no exchange operations are observed.',
    };
  }

  function createScenarioIdentity(config, network = null) {
    const selectedCableTypeIds = normalizeCableTypeIds(
      config.cableTypes,
      config.simulation.selectedCableTypeIds
    );
    const baseSeed = config.simulation.seed;
    const scenarioId = config.simulation.scenarioId || 'everyday-exchange';
    const configuration = {
      schema: config.schema,
      id: config.id,
      scenarioId,
      baseSeed,
      durationDays: config.simulation.durationDays,
      peopleCount: config.simulation.peopleCount,
      hubCount: config.simulation.hubCount,
      selectedCableTypeIds,
      initialInventoryPerHubCable: config.simulation.initialInventoryPerHubCable,
      dailyParticipationRate: config.simulation.dailyParticipationRate,
      renderedTravelerCount: config.simulation.renderedTravelerCount,
      worldId: network?.worldId || null,
      hubs: network?.hubs?.map(placeIdentity) || [],
      residenceAnchorsHash: network
        ? contentHash(network.residences.map((row) => row.nodeId).join('|'))
        : null,
      cableTypes: config.cableTypes
        .filter((row) => selectedCableTypeIds.includes(row.id))
        .map((row) => ({
          id: row.id,
          demandWeight: row.demandWeight,
          supplyWeight: row.supplyWeight,
        })),
    };
    const configurationHash = contentHash(canonical(configuration));
    return {
      schema: 'simulatte.plugin.cableTraderScenarioIdentity.v2',
      id: `${scenarioId}:${configurationHash.slice(0, 20)}`,
      scenarioId,
      baseSeed,
      seed: `${baseSeed}:configuration:${configurationHash.slice(0, 16)}`,
      configurationHash,
      selectedCableTypeIds,
    };
  }

  function createJourney({
    day,
    sequence,
    action,
    person,
    cableType,
    hub,
    residence,
    random,
    matchedFromBacklog = false,
  }) {
    const direction = action === 'dropoff' ? 'to-hub' : 'from-hub';
    return {
      id: `journey-day-${day}-${String(sequence + 1).padStart(3, '0')}`,
      day,
      personId: person.id,
      action,
      cableTypeId: cableType.id,
      hubId: hub.id,
      residenceId: residence.id,
      routeId: routeId(hub.id, residence.id, direction),
      progress: Number(random().toFixed(4)),
      matchedFromBacklog,
    };
  }

  function createSnapshot({
    day,
    durationDays,
    hubs,
    cableTypes,
    inventory,
    backlog,
    dailyBoards,
    journeys,
    cumulative,
    renderedTravelerCount,
  }) {
    const hubBoards = hubs.map((hub) => {
      const cables = cableTypes.map((cableType) => {
        const daily = dailyBoards[hub.id][cableType.id];
        return {
          id: cableType.id,
          supply: daily.supply,
          demand: daily.demand,
          fulfilled: daily.fulfilled,
          waiting: backlog[hub.id][cableType.id],
          inventory: inventory[hub.id][cableType.id],
        };
      });
      return {
        id: hub.id,
        supply: sum(cables, 'supply'),
        demand: sum(cables, 'demand'),
        fulfilled: sum(cables, 'fulfilled'),
        waiting: sum(cables, 'waiting'),
        inventory: sum(cables, 'inventory'),
        journeys: journeys.filter((row) => row.hubId === hub.id).length,
        cables,
      };
    });
    const visibleJourneys = sampleJourneys(journeys, renderedTravelerCount);
    return {
      day,
      durationDays,
      hubBoards,
      journeys,
      visibleJourneys,
      global: {
        supply: sum(hubBoards, 'supply'),
        demand: sum(hubBoards, 'demand'),
        fulfilled: sum(hubBoards, 'fulfilled'),
        waiting: sum(hubBoards, 'waiting'),
        inventory: sum(hubBoards, 'inventory'),
        journeys: journeys.length,
        renderedJourneys: visibleJourneys.length,
      },
      cumulative: {
        supply: cumulative.supply,
        demand: cumulative.demand,
        fulfilled: cumulative.fulfilled,
        journeys: cumulative.journeys,
      },
    };
  }

  function sampleJourneys(journeys, maximum) {
    if (journeys.length <= maximum) return journeys.map((row) => ({ ...row }));
    const pickups = journeys.filter((row) => row.action === 'pickup');
    const dropoffs = journeys.filter((row) => row.action === 'dropoff');
    const sample = [];
    const half = Math.floor(maximum / 2);
    sample.push(...pickups.slice(0, half), ...dropoffs.slice(0, half));
    const selected = new Set(sample.map((row) => row.id));
    for (const journey of journeys) {
      if (sample.length >= maximum) break;
      if (!selected.has(journey.id)) sample.push(journey);
    }
    return sample.map((row) => ({ ...row }));
  }

  function largestRoutableComponent(worldModel) {
    const cacheKey = worldModel?.world || worldModel;
    const cached = ROUTABLE_COMPONENT_CACHE.get(cacheKey);
    if (cached) return cached;
    if (!worldModel?.world?.nodes || !worldModel?.world?.segments) {
      throw new Error('Cable Trader requires a governed city network');
    }
    const segments = worldModel.world.segments.filter((row) => (
      Array.isArray(row.allowedModes) && row.allowedModes.includes('delivery_bike')
    ));
    const eligibleIds = new Set(segments.flatMap((row) => [row.fromNodeId, row.toNodeId]));
    const nodes = worldModel.world.nodes
      .filter((row) => eligibleIds.has(row.id) && finitePoint(row.position))
      .sort((left, right) => left.id.localeCompare(right.id));
    const nodeById = new Map(nodes.map((row) => [row.id, row]));
    const outgoing = new Map(nodes.map((row) => [row.id, []]));
    const incoming = new Map(nodes.map((row) => [row.id, []]));
    segments.forEach((segment) => {
      if (!nodeById.has(segment.fromNodeId) || !nodeById.has(segment.toNodeId)) return;
      outgoing.get(segment.fromNodeId).push(segment.toNodeId);
      incoming.get(segment.toNodeId).push(segment.fromNodeId);
    });
    const order = finishingOrder(nodes.map((row) => row.id), outgoing);
    const seen = new Set();
    const components = [];
    order.reverse().forEach((start) => {
      if (seen.has(start)) return;
      const component = [];
      const stack = [start];
      seen.add(start);
      while (stack.length) {
        const id = stack.pop();
        component.push(nodeById.get(id));
        incoming.get(id).forEach((next) => {
          if (seen.has(next)) return;
          seen.add(next);
          stack.push(next);
        });
      }
      components.push(component.sort((left, right) => left.id.localeCompare(right.id)));
    });
    const largest = components.sort((left, right) => (
      right.length - left.length || left[0].id.localeCompare(right[0].id)
    ))[0];
    if (!largest?.length) throw new Error('Cable Trader could not find a routable city component');
    const result = Object.freeze(largest);
    ROUTABLE_COMPONENT_CACHE.set(cacheKey, result);
    return result;
  }

  function finishingOrder(ids, outgoing) {
    const seen = new Set();
    const order = [];
    ids.forEach((start) => {
      if (seen.has(start)) return;
      const stack = [[start, 0]];
      seen.add(start);
      while (stack.length) {
        const row = stack.at(-1);
        const neighbors = outgoing.get(row[0]);
        if (row[1] < neighbors.length) {
          const next = neighbors[row[1]];
          row[1] += 1;
          if (!seen.has(next)) {
            seen.add(next);
            stack.push([next, 0]);
          }
        } else {
          order.push(row[0]);
          stack.pop();
        }
      }
    });
    return order;
  }

  function selectSpreadHubs(nodes, count, seed) {
    const first = nodes[fnv1a(`${seed}:first-hub`) % nodes.length];
    const selected = [first];
    const selectedIds = new Set([first.id]);
    while (selected.length < count) {
      let best = null;
      let bestDistance = -1;
      nodes.forEach((node) => {
        if (selectedIds.has(node.id)) return;
        const distance = Math.min(...selected.map((hub) => squaredDistance(node.position, hub.position)));
        if (distance > bestDistance || (distance === bestDistance && node.id < best.id)) {
          best = node;
          bestDistance = distance;
        }
      });
      selected.push(best);
      selectedIds.add(best.id);
    }
    return selected.map((node, index) => ({
      id: `hub-${String(index + 1).padStart(2, '0')}`,
      label: `Hub ${String(index + 1).padStart(2, '0')}`,
      nodeId: node.id,
      position: { x: node.position.x, y: node.position.y },
    }));
  }

  function nearestHub(position, hubs) {
    return hubs.reduce((best, hub) => {
      const distance = squaredDistance(position, hub.position);
      if (!best || distance < best.distance || (distance === best.distance && hub.id < best.hub.id)) {
        return { hub, distance };
      }
      return best;
    }, null).hub;
  }

  function emptyDailyBoards(hubs, cableTypes) {
    return Object.fromEntries(hubs.map((hub) => [
      hub.id,
      Object.fromEntries(cableTypes.map((cableType) => [
        cableType.id,
        { supply: 0, demand: 0, fulfilled: 0 },
      ])),
    ]));
  }

  function createMatrix(hubs, cableTypes, value) {
    return Object.fromEntries(hubs.map((hub) => [
      hub.id,
      Object.fromEntries(cableTypes.map((cableType) => [
        cableType.id,
        typeof value === 'function' ? value() : value,
      ])),
    ]));
  }

  function validateConfig(config) {
    if (config?.schema !== 'simulatte.plugin.cableTraderConfig.v6') {
      throw new Error('Cable Trader requires circulation configuration v6');
    }
    const settings = config.simulation;
    if (!settings || settings.durationDays !== 365) {
      throw new Error('Cable Trader requires one 365-day pseudo-year');
    }
    integerBetween(settings.peopleCount, 64, 10000, 'peopleCount');
    integerBetween(settings.hubCount, 4, 64, 'hubCount');
    integerBetween(settings.renderedTravelerCount, 1, 64, 'renderedTravelerCount');
    normalizeCableTypeIds(config.cableTypes, settings.selectedCableTypeIds);
    return settings;
  }

  function validateNetwork(network, settings) {
    if (network?.schema !== 'simulatte.plugin.cableTraderNetwork.v1') {
      throw new Error('Cable Trader network is missing');
    }
    if (network.hubs?.length !== settings.hubCount) {
      throw new Error(`Cable Trader network expected ${settings.hubCount} hubs`);
    }
    if (network.residences?.length !== settings.peopleCount) {
      throw new Error(`Cable Trader network expected ${settings.peopleCount} unique residences`);
    }
    if (new Set(network.residences.map((row) => row.id)).size !== network.residences.length) {
      throw new Error('Cable Trader residence IDs must be unique');
    }
    if (new Set(network.residences.map((row) => `${row.position.x}:${row.position.y}`)).size !== network.residences.length) {
      throw new Error('Cable Trader residence positions must be unique');
    }
  }

  function normalizeCableTypeIds(cableTypes, selectedIds) {
    if (!Array.isArray(selectedIds) || !selectedIds.length) {
      throw new Error('Cable Trader requires at least one cable type');
    }
    if (new Set(selectedIds).size !== selectedIds.length) {
      throw new Error('Cable Trader cable types must be unique');
    }
    const known = new Set(cableTypes.map((row) => row.id));
    const unknown = selectedIds.find((id) => !known.has(id));
    if (unknown) throw new Error(`Cable Trader cable type is unknown: ${unknown}`);
    const selected = new Set(selectedIds);
    return cableTypes.filter((row) => selected.has(row.id)).map((row) => row.id);
  }

  function nextPerson(people, usedPeople, random) {
    for (let attempt = 0; attempt < 32; attempt += 1) {
      const person = people[Math.floor(random() * people.length)];
      if (!usedPeople.has(person.id)) {
        usedPeople.add(person.id);
        return person;
      }
    }
    const person = people.find((row) => !usedPeople.has(row.id)) || people[0];
    usedPeople.add(person.id);
    return person;
  }

  function weightedChoice(rows, weightKey, random) {
    const total = rows.reduce((value, row) => value + row[weightKey], 0);
    let cursor = random() * total;
    for (const row of rows) {
      cursor -= row[weightKey];
      if (cursor <= 0) return row;
    }
    return rows.at(-1);
  }

  function seasonalParticipation(day) {
    const annualWave = 1 + 0.18 * Math.sin((day - 35) / 365 * Math.PI * 2);
    const weekendFactor = day % 7 === 0 || day % 7 === 6 ? 1.12 : 0.96;
    return annualWave * weekendFactor;
  }

  function routeKey(hubId, residenceId, direction) {
    return `${hubId}:${residenceId}:${direction}`;
  }

  function routeId(hubId, residenceId, direction) {
    return `route-${hubId}-${residenceId}-${direction}`;
  }

  function placeIdentity(row) {
    return { id: row.id, nodeId: row.nodeId };
  }

  function coprimeStride(count, seed) {
    let stride = Math.max(1, seed % count);
    while (greatestCommonDivisor(stride, count) !== 1) stride = (stride + 1) % count || 1;
    return stride;
  }

  function greatestCommonDivisor(left, right) {
    let a = left;
    let b = right;
    while (b) [a, b] = [b, a % b];
    return a;
  }

  function squaredDistance(left, right) {
    return (left.x - right.x) ** 2 + (left.y - right.y) ** 2;
  }

  function finitePoint(value) {
    return value && Number.isFinite(value.x) && Number.isFinite(value.y);
  }

  function integerBetween(value, minimum, maximum, label) {
    if (!Number.isInteger(value) || value < minimum || value > maximum) {
      throw new Error(`Cable Trader ${label} must be an integer from ${minimum} to ${maximum}`);
    }
  }

  function sum(rows, key) {
    return rows.reduce((total, row) => total + Number(row[key] || 0), 0);
  }

  function canonical(value) {
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
    if (value && typeof value === 'object') {
      return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
  }

  function contentHash(value) {
    return Array.from({ length: 8 }, (unused, index) => (
      fnv1a(`${index}:${value}`).toString(16).padStart(8, '0')
    )).join('');
  }

  function fnv1a(value) {
    let hash = 0x811c9dc5;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
  }

  function createRandom(seed) {
    let state = fnv1a(seed) || 0x6d2b79f5;
    return function random() {
      state += 0x6d2b79f5;
      let value = state;
      value = Math.imul(value ^ value >>> 15, value | 1);
      value ^= value + Math.imul(value ^ value >>> 7, value | 61);
      return ((value ^ value >>> 14) >>> 0) / 4294967296;
    };
  }

  return Object.freeze({
    canonical,
    contentHash,
    createNetwork,
    createScenarioIdentity,
    normalizeCableTypeIds,
    routeId,
    routeKey,
    simulateCirculation,
  });
});
