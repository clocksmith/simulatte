(function attachCableTraderPresentation(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteCableTraderPresentation = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createCableTraderPresentation() {
  const V1_MARKER_LIMIT = 128;

  function createViews({ config, simulation, playback }) {
    const visible = simulation.snapshots[playback.day];
    const cableTypes = selectedCableTypes(config);
    const hubs = simulation.hubs;
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
        {
          label: 'People / residences',
          value: `${format(simulation.people.length)} people · ${format(simulation.residences.length)} unique homes`,
        },
        { label: 'Global supply today', value: `${format(visible.global.supply)} cables offered` },
        { label: 'Global demand today', value: `${format(visible.global.demand)} cables requested` },
        { label: 'Reused today', value: `${format(visible.global.fulfilled)} pickups fulfilled` },
        { label: 'Waiting globally', value: `${format(visible.global.waiting)} open requests` },
        {
          label: 'Traveling now',
          value: `${format(visible.global.journeys)} modeled trips · ${format(visible.global.renderedJourneys)} visible`,
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
      title: 'Cable exchange',
      rows: [
        {
          label: 'Global',
          value: `${visible.global.supply} in · ${visible.global.demand} asked · ${visible.global.inventory} available · ${visible.global.waiting} waiting`,
        },
        {
          label: 'Network',
          value: `${format(hubs.length)} hubs · ${format(simulation.residences.length)} unique residences · ${cableTypes.length} cable types`,
        },
        {
          label: 'Traveling',
          value: `${visible.global.journeys} people carrying cables · ${visible.global.renderedJourneys} visible`,
        },
      ],
      actions: [{
        id: 'focus-network',
        label: 'Whole exchange',
        command: { kind: 'camera.focus', targetId: 'cable-network-overview' },
      }],
    }];
  }

  function createPresentation({ config, simulation, playback, routes }) {
    const visible = simulation.snapshots[playback.day];
    const hubs = simulation.hubs;
    const residences = simulation.residences;
    const cableTypeById = new Map(selectedCableTypes(config).map((row) => [row.id, row]));
    const hubById = new Map(hubs.map((row) => [row.id, row]));
    const residenceById = new Map(residences.map((row) => [row.id, row]));
    const routeById = new Map(routes.map((row) => [row.id, row]));
    const maximumInventory = Math.max(...visible.hubBoards.map((row) => row.inventory), 1);
    const residenceMarkerLimit = Math.max(0, V1_MARKER_LIMIT - hubs.length);

    const markers = [
      ...hubs.map((hub) => {
        const board = visible.hubBoards.find((row) => row.id === hub.id);
        const pressure = board.waiting > board.inventory;
        return {
          id: `hub:${hub.id}`,
          label: hub.label,
          nodeId: hub.nodeId,
          tone: pressure ? 'magenta' : 'green',
          heightM: 8 + Math.sqrt(board.inventory / maximumInventory) * 10,
          radiusM: 2.5 + Math.sqrt(board.inventory / maximumInventory) * 1.5,
          intensity: pressure ? 1.25 : 0.9,
        };
      }),
      ...residences.slice(0, residenceMarkerLimit).map((residence) => ({
        id: `residence:${residence.id}`,
        label: residence.label,
        nodeId: residence.nodeId,
        tone: 'muted',
        heightM: 0.5,
        radiusM: 0.25,
        intensity: 0.22,
      })),
    ];
    const paths = visible.visibleJourneys.flatMap((journey) => {
      const route = routeById.get(journey.routeId);
      if (!route) return [];
      const cableType = cableTypeById.get(journey.cableTypeId);
      return [{
        id: `journey:${journey.id}`,
        label: journeyLabel(
          journey,
          cableType,
          hubById.get(journey.hubId),
          residenceById.get(journey.residenceId)
        ),
        segmentIds: route.segmentIds,
        tone: cableType?.tone || 'cyan',
        widthM: 0.45,
        intensity: 0.55,
      }];
    });
    const actors = visible.visibleJourneys.flatMap((journey) => {
      const route = routeById.get(journey.routeId);
      if (!route) return [];
      const cableType = cableTypeById.get(journey.cableTypeId);
      return [{
        id: `person:${journey.id}`,
        label: journeyLabel(
          journey,
          cableType,
          hubById.get(journey.hubId),
          residenceById.get(journey.residenceId)
        ),
        kind: 'pedestrian',
        segmentIds: route.segmentIds,
        tone: cableType?.tone || 'cyan',
        speedMps: 1.35,
        phaseOffsetM: Math.max(0, journey.progress * route.distanceM),
        isSelected: false,
      }];
    });
    const allSegments = [...new Set(routes.flatMap((row) => row.segmentIds))];
    const overviewNodes = [...new Set([
      ...hubs.map((row) => row.nodeId),
      ...residences.map((row) => row.nodeId),
    ])].slice(0, 128);
    return {
      schema: 'simulatte.pluginPresentation.v1',
      markers,
      paths,
      actors,
      cameraTargets: [
        {
          id: 'cable-network-overview',
          label: 'Community cable exchange',
          nodeIds: overviewNodes,
          segmentIds: allSegments,
          distanceM: 4200,
        },
        ...visible.visibleJourneys.slice(0, 8).flatMap((journey) => {
          const route = routeById.get(journey.routeId);
          if (!route) return [];
          return [{
            id: `journey:${journey.id}`,
            label: `Follow ${personLabel(journey.personId)}`,
            nodeIds: [],
            segmentIds: route.segmentIds,
            distanceM: 480,
          }];
        }),
      ],
    };
  }

  function journeyLabel(journey, cableType, hub, residence) {
    const cable = cableType?.shortLabel || journey.cableTypeId;
    if (journey.action === 'dropoff') {
      return `${personLabel(journey.personId)} · ${cable} · ${residence?.label} → ${hub?.label}`;
    }
    return `${personLabel(journey.personId)} · ${cable} · ${hub?.label} → ${residence?.label}`;
  }

  function selectedCableTypes(config) {
    const selected = new Set(config.simulation.selectedCableTypeIds);
    return config.cableTypes.filter((row) => selected.has(row.id));
  }

  function personLabel(id) {
    return `Person ${String(id).replace(/^person-/, '')}`;
  }

  function format(value) {
    return Number(value || 0).toLocaleString('en-US');
  }

  return Object.freeze({ createPresentation, createViews, journeyLabel });
});
