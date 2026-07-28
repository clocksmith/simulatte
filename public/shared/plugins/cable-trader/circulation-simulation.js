(function attachCableTraderCirculation(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteCableTraderCirculation = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createCableTraderCirculation() {
  function simulateCirculation(config, routes) {
    const settings = validateConfig(config);
    const hubs = config.hubs.slice(0, settings.hubCount);
    const locations = config.locations.slice(0, settings.locationCount);
    const cableTypes = config.cableTypes.filter((row) => settings.selectedCableTypeIds.includes(row.id));
    const routeByKey = validateRoutes(routes, hubs, locations);
    const identity = createScenarioIdentity(config);
    const random = createRandom(identity.seed);
    const people = createPeople(settings.peopleCount, locations, hubs, random);
    const inventory = createMatrix(hubs, cableTypes, settings.initialInventoryPerHubCable);
    const backlog = createMatrix(hubs, cableTypes, 0);
    const cumulative = {
      supply: 0,
      demand: 0,
      fulfilled: 0,
      journeys: 0,
    };
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
        const hub = hubs[Math.floor(random() * hubs.length)];
        const location = locations[Math.floor(random() * locations.length)];
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
            location,
            route: routeByKey.get(routeKey(hub.id, location.id, 'to-hub')),
            random,
          }));
          cumulative.journeys += 1;

          if (backlog[hub.id][cableType.id] > 0) {
            backlog[hub.id][cableType.id] -= 1;
            board.fulfilled += 1;
            cumulative.fulfilled += 1;
            const waitingPerson = nextPerson(people, usedPeople, random);
            journeys.push(createJourney({
              day,
              sequence: journeys.length,
              action: 'pickup',
              person: waitingPerson,
              cableType,
              hub,
              location: config.locations.find((row) => row.id === waitingPerson.homeLocationId) || location,
              route: routeByKey.get(routeKey(
                hub.id,
                (config.locations.find((row) => row.id === waitingPerson.homeLocationId) || location).id,
                'from-hub'
              )),
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
            location,
            route: routeByKey.get(routeKey(hub.id, location.id, 'from-hub')),
            random,
          }));
          cumulative.journeys += 1;
        } else {
          backlog[hub.id][cableType.id] += 1;
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
      hubCount: hubs.length,
      locationCount: locations.length,
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
      activeHubIds: hubs.map((row) => row.id),
      activeLocationIds: locations.map((row) => row.id),
      events,
      snapshots,
      summary,
      balance,
      claimBoundary: 'People, cable supply, demand, inventories, and journeys are deterministic modeled activity. City nodes and route geometry come from the governed world; no exchange operations are observed.',
    };
  }

  function createScenarioIdentity(config) {
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
      locationCount: config.simulation.locationCount,
      selectedCableTypeIds,
      initialInventoryPerHubCable: config.simulation.initialInventoryPerHubCable,
      dailyParticipationRate: config.simulation.dailyParticipationRate,
      renderedTravelerCount: config.simulation.renderedTravelerCount,
      hubs: config.hubs.slice(0, config.simulation.hubCount).map(placeIdentity),
      locations: config.locations.slice(0, config.simulation.locationCount).map(placeIdentity),
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

  function createPeople(count, locations, hubs, random) {
    return Array.from({ length: count }, (unused, index) => ({
      id: `person-${String(index + 1).padStart(5, '0')}`,
      homeLocationId: locations[Math.floor(random() * locations.length)].id,
      preferredHubId: hubs[Math.floor(random() * hubs.length)].id,
    }));
  }

  function createJourney({
    day,
    sequence,
    action,
    person,
    cableType,
    hub,
    location,
    route,
    random,
    matchedFromBacklog = false,
  }) {
    if (!route) {
      throw new Error(`Cable Trader route missing for ${action} between ${hub.id} and ${location.id}`);
    }
    return {
      id: `journey-day-${day}-${String(sequence + 1).padStart(3, '0')}`,
      day,
      personId: person.id,
      action,
      cableTypeId: cableType.id,
      hubId: hub.id,
      locationId: location.id,
      routeId: route.id,
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
      Object.fromEntries(cableTypes.map((cableType) => [cableType.id, value])),
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
    integerBetween(settings.peopleCount, 1000, 25000, 'peopleCount');
    integerBetween(settings.hubCount, 2, config.hubs.length, 'hubCount');
    integerBetween(settings.locationCount, 4, config.locations.length, 'locationCount');
    integerBetween(settings.renderedTravelerCount, 1, 64, 'renderedTravelerCount');
    normalizeCableTypeIds(config.cableTypes, settings.selectedCableTypeIds);
    return settings;
  }

  function validateRoutes(routes, hubs, locations) {
    if (!Array.isArray(routes)) throw new Error('Cable Trader routes are missing');
    const routeByKey = new Map(routes.map((row) => [
      routeKey(row.hubId, row.locationId, row.direction),
      row,
    ]));
    hubs.forEach((hub) => locations.forEach((location) => {
      ['to-hub', 'from-hub'].forEach((direction) => {
        const route = routeByKey.get(routeKey(hub.id, location.id, direction));
        if (!route?.segmentIds?.length) {
          throw new Error(`Cable Trader route missing: ${hub.id}/${location.id}/${direction}`);
        }
      });
    }));
    return routeByKey;
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

  function routeKey(hubId, locationId, direction) {
    return `${hubId}:${locationId}:${direction}`;
  }

  function placeIdentity(row) {
    return { id: row.id, nodeId: row.nodeId };
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
    createScenarioIdentity,
    normalizeCableTypeIds,
    routeKey,
    simulateCirculation,
  });
});
