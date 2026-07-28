(function attachCableTraderPresentation(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteCableTraderPresentation = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createCableTraderPresentation() {
  function createViews({ config, simulation, playback }) {
    const visible = simulation.snapshots[playback.day];
    const cableTypes = selectedCableTypes(config);
    const hubs = activeHubs(config);
    const locations = activeLocations(config);
    return [{
      slot: 'inspector',
      title: 'Live cable exchange board',
      rows: [
        {
          label: 'Now',
          value: visible.day
            ? `Pseudo-day ${visible.day} of ${visible.durationDays}`
            : 'Network ready · start the continuous pseudo-year',
        },
        { label: 'People', value: format(simulation.people.length) },
        { label: 'Global supply today', value: `${format(visible.global.supply)} cables offered` },
        { label: 'Global demand today', value: `${format(visible.global.demand)} cables requested` },
        { label: 'Reused today', value: `${format(visible.global.fulfilled)} pickups fulfilled` },
        { label: 'Waiting globally', value: `${format(visible.global.waiting)} open requests` },
        {
          label: 'Traveling now',
          value: `${format(visible.global.journeys)} modeled trips · ${format(visible.global.renderedJourneys)} shown`,
        },
        {
          label: 'Pseudo-year total',
          value: `${format(visible.cumulative.fulfilled)} reused · ${format(visible.cumulative.supply)} dropped off`,
        },
        ...hubs.map((hub) => {
          const board = visible.hubBoards.find((row) => row.id === hub.id);
          return {
            label: hub.label,
            value: `${board.supply} in · ${board.demand} asked · ${board.inventory} available · ${board.waiting} waiting`,
          };
        }),
      ],
      actions: [],
    }, {
      slot: 'map',
      title: 'Hub supply and demand',
      rows: [
        {
          label: 'Global',
          value: `${visible.global.supply} in · ${visible.global.demand} asked · ${visible.global.inventory} available · ${visible.global.waiting} waiting`,
        },
        ...hubs.map((hub) => {
          const board = visible.hubBoards.find((row) => row.id === hub.id);
          return {
            label: hub.label.replace(/ hub$/, ''),
            value: `${board.supply} in · ${board.demand} asked · ${board.inventory} available · ${board.waiting} waiting`,
          };
        }),
        {
          label: 'Traveling',
          value: `${visible.global.journeys} people with cables · ${visible.global.renderedJourneys} shown`,
        },
        {
          label: 'Active network',
          value: `${hubs.length} hubs · ${locations.length} locations · ${cableTypes.length} cable types`,
        },
        {
          label: 'Flow',
          value: 'Pickup rides out · drop-off rides in',
        },
      ],
      actions: [
        {
          id: 'focus-network',
          label: 'Whole exchange',
          command: { kind: 'camera.focus', targetId: 'cable-network-overview' },
        },
        ...visible.visibleJourneys.slice(0, 3).map((journey) => ({
          id: `follow-${journey.id}`,
          label: `Follow ${personLabel(journey.personId)} ${journey.action}`,
          command: { kind: 'camera.focus', targetId: `journey:${journey.id}` },
        })),
      ],
    }];
  }

  function createPresentation({ config, simulation, playback, routes }) {
    const visible = simulation.snapshots[playback.day];
    const hubs = activeHubs(config);
    const locations = activeLocations(config);
    const cableTypeById = new Map(selectedCableTypes(config).map((row) => [row.id, row]));
    const hubById = new Map(hubs.map((row) => [row.id, row]));
    const locationById = new Map(locations.map((row) => [row.id, row]));
    const routeById = new Map(routes.map((row) => [row.id, row]));
    const maximumInventory = Math.max(...visible.hubBoards.map((row) => row.inventory), 1);
    const locationTrips = new Map(locations.map((row) => [row.id, 0]));
    visible.journeys.forEach((row) => {
      locationTrips.set(row.locationId, (locationTrips.get(row.locationId) || 0) + 1);
    });

    const markers = [
      ...hubs.map((hub) => {
        const board = visible.hubBoards.find((row) => row.id === hub.id);
        const pressure = board.waiting > board.inventory;
        return {
          id: `hub:${hub.id}`,
          label: `${hub.label} · ${board.supply} in · ${board.demand} asked · ${board.inventory} available · ${board.waiting} waiting`,
          nodeId: hub.nodeId,
          tone: pressure ? 'magenta' : 'green',
          heightM: 13 + Math.sqrt(board.inventory / maximumInventory) * 20,
          radiusM: 4.5 + Math.sqrt(board.inventory / maximumInventory) * 3,
          intensity: pressure ? 1.5 : 1.05,
        };
      }),
      ...locations.map((location) => {
        const tripCount = locationTrips.get(location.id) || 0;
        return {
          id: `location:${location.id}`,
          label: `${location.label} · ${tripCount} cable trips today`,
          nodeId: location.nodeId,
          tone: tripCount ? 'cyan' : 'muted',
          heightM: tripCount ? 11 + Math.sqrt(tripCount) * 2 : 7,
          radiusM: tripCount ? 3.5 : 2.5,
          intensity: tripCount ? 1.1 : 0.45,
        };
      }),
    ];
    const paths = visible.visibleJourneys.map((journey) => {
      const route = routeById.get(journey.routeId);
      const cableType = cableTypeById.get(journey.cableTypeId);
      return {
        id: `journey:${journey.id}`,
        label: journeyLabel(journey, cableType, hubById.get(journey.hubId), locationById.get(journey.locationId)),
        segmentIds: route.segmentIds,
        tone: cableType?.tone || 'cyan',
        widthM: journey.action === 'pickup' ? 1.8 : 1.25,
        intensity: journey.action === 'pickup' ? 1.35 : 0.95,
      };
    });
    const actors = visible.visibleJourneys.map((journey) => {
      const route = routeById.get(journey.routeId);
      const cableType = cableTypeById.get(journey.cableTypeId);
      return {
        id: `person:${journey.id}`,
        label: journeyLabel(journey, cableType, hubById.get(journey.hubId), locationById.get(journey.locationId)),
        kind: 'bicycle',
        segmentIds: route.segmentIds,
        tone: cableType?.tone || 'cyan',
        speedMps: 1.35,
        phaseOffsetM: Math.max(0, journey.progress * route.distanceM),
        isSelected: false,
      };
    });
    const allSegments = [...new Set(routes
      .filter((row) => (
        simulation.activeHubIds.includes(row.hubId)
        && simulation.activeLocationIds.includes(row.locationId)
      ))
      .flatMap((row) => row.segmentIds))];
    return {
      schema: 'simulatte.pluginPresentation.v1',
      markers,
      paths,
      actors,
      cameraTargets: [
        {
          id: 'cable-network-overview',
          label: 'Community cable exchange',
          nodeIds: [...hubs, ...locations].map((row) => row.nodeId),
          segmentIds: allSegments,
          distanceM: 4200,
        },
        ...visible.visibleJourneys.slice(0, 8).map((journey) => ({
          id: `journey:${journey.id}`,
          label: `Follow ${personLabel(journey.personId)}`,
          nodeIds: [],
          segmentIds: routeById.get(journey.routeId).segmentIds,
          distanceM: 480,
        })),
      ],
    };
  }

  function journeyLabel(journey, cableType, hub, location) {
    const cable = cableType?.shortLabel || journey.cableTypeId;
    if (journey.action === 'dropoff') {
      return `${personLabel(journey.personId)} · drop off ${cable} · ${location?.label} → ${hub?.label}`;
    }
    return `${personLabel(journey.personId)} · pick up ${cable} · ${hub?.label} → ${location?.label}`;
  }

  function selectedCableTypes(config) {
    const selected = new Set(config.simulation.selectedCableTypeIds);
    return config.cableTypes.filter((row) => selected.has(row.id));
  }

  function activeHubs(config) {
    return config.hubs.slice(0, config.simulation.hubCount);
  }

  function activeLocations(config) {
    return config.locations.slice(0, config.simulation.locationCount);
  }

  function personLabel(id) {
    return `Person ${String(id).replace(/^person-/, '')}`;
  }

  function format(value) {
    return Number(value || 0).toLocaleString('en-US');
  }

  return Object.freeze({ createPresentation, createViews, journeyLabel });
});
