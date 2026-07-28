(function attachCableTraderV4Contribution(root, factory) {
  const builder = typeof module === 'object' && module.exports
    ? require('../../core/simulation/plugin-v4-builder.js')
    : root.SimulattePluginV4Builder;
  const api = factory(builder);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteCableTraderV4Contribution = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createCableTraderV4Contribution(builder) {
  const PLUGIN_ID = 'cable-trader';
  const DAY_MS = 86400000;
  const DATASET_REFERENCE = Object.freeze({
    id: 'cable-circulation-catalog-v1',
    path: '../../../data/cable-trader/cable-circulation-catalog-v1.json',
    sha256: '5694a3049a8f6b8036599a64545535531adffc2413720776b344a6ac959451b6',
    schemaId: 'simulatte.cableCirculationCatalog.v1',
  });
  const MODEL_IDENTITIES = Object.freeze({
    circulationModelHash: '6a70009eafa90588144ed192deba09e2a4190072e993ffec5faf86e112cec837',
  });

  function createContribution({ config, simulation, state, routes }) {
    const visible = simulation.snapshots[state.playback.day];
    const scenarioRecord = builder.datasetRecord(config.id, {
      sha256: simulation.configurationHash,
    }, {
      kind: 'authored synthetic community cable exchange',
      seed: simulation.seed,
      peopleCount: simulation.people.length,
      selectedCableTypeIds: simulation.selectedCableTypeIds,
    });
    const catalogRecord = builder.datasetRecord(DATASET_REFERENCE.id, {
      sha256: DATASET_REFERENCE.sha256,
    }, {
      schemaId: DATASET_REFERENCE.schemaId,
      coverage: 'authored everyday cable taxonomy',
    });
    const modelRecord = builder.modelRecord({
      id: `${PLUGIN_ID}:model:hub-spoke-circulation`,
      datasetId: scenarioRecord.id,
      contentHash: MODEL_IDENTITIES.circulationModelHash,
      parentIds: [scenarioRecord.id, catalogRecord.id],
      metadata: {
        algorithm: 'seeded_person_hub_spoke_circulation_v1',
        durationDays: simulation.durationDays,
        balancePass: simulation.balance.pass,
      },
    });
    const simulated = builder.provenance({
      origin: 'simulated',
      temporalStatus: 'forecast',
      uncertainty: {
        kind: 'missing',
        value: { reason: 'Community exchange behavior is not calibrated to observed operations.' },
      },
      records: [scenarioRecord, catalogRecord, modelRecord],
    });
    const scenario = builder.provenance({
      origin: 'scenario',
      temporalStatus: 'forecast',
      uncertainty: {
        kind: 'missing',
        value: { reason: 'Controls and seed define a deterministic pseudo-year.' },
      },
      records: [scenarioRecord, catalogRecord],
    });
    const routeById = new Map(routes.map((row) => [row.id, row]));
    const events = simulation.events.map((row, sequence) => builder.event({
      id: row.id,
      pluginId: PLUGIN_ID,
      sequence,
      simulationTimeMs: row.day * DAY_MS,
      kind: row.kind,
      causationIds: row.causalParentIds,
      correlationId: simulation.id,
      payload: { day: row.day, measures: row.measures },
      provenance: simulated,
    }));
    const layers = [
      ...hubLayers(config, simulation, visible, scenario),
      ...locationLayers(config, simulation, visible, scenario),
      ...journeyLayers(config, visible, routeById, simulated),
    ];
    const presentation = builder.presentation({
      pluginId: PLUGIN_ID,
      coordinateSystem: 'city-node-segment-id',
      layers,
      viewIntents: [
        builder.viewIntent({
          id: 'cable-network-overview',
          mode: 'overview',
          targetIds: [
            ...simulation.activeHubIds.map((id) => `hub:${id}`),
            ...simulation.activeLocationIds.map((id) => `location:${id}`),
          ],
          reasonEventId: visible.day ? events[visible.day - 1]?.id || null : null,
          priority: 50,
        }),
      ],
    });
    const controls = builder.controls([
      numeric('peopleCount', 'People', simulation.people.length, 1000, 25000, 1000, scenario),
      numeric('hubCount', 'Hubs', simulation.activeHubIds.length, 2, config.hubs.length, 1, scenario),
      numeric('locationCount', 'Locations', simulation.activeLocationIds.length, 4, config.locations.length, 1, scenario),
      multiSelect(
        'selectedCableTypeIds',
        'Cable set',
        simulation.selectedCableTypeIds,
        config.cableTypes,
        scenario
      ),
    ]);
    const progressiveState = builder.state({
      id: `${simulation.id}:state-day-${visible.day}`,
      pluginId: PLUGIN_ID,
      simulationTimeMs: visible.day * DAY_MS,
      status: state.playback.status,
      previousStateId: visible.day ? `${simulation.id}:state-day-${visible.day - 1}` : null,
      eventIds: events.slice(0, visible.day).map((row) => row.id),
      measures: [
        builder.quantity('people', simulation.people.length, 'people'),
        builder.quantity('cable-supply', visible.global.supply, 'cables/day'),
        builder.quantity('cable-demand', visible.global.demand, 'cables/day'),
        builder.quantity('cables-reused', visible.cumulative.fulfilled, 'cables'),
        builder.quantity('active-travelers', visible.global.journeys, 'people/day'),
        builder.quantity('waiting-demand', visible.global.waiting, 'cables'),
        builder.quantity('hub-inventory', visible.global.inventory, 'cables'),
      ],
      provenance: simulated,
    });
    return builder.contribution({
      pluginId: PLUGIN_ID,
      presentation,
      events,
      controls,
      state: progressiveState,
      inspections: inspections(config, simulation, visible, simulated),
      provenanceRecords: [catalogRecord, scenarioRecord, modelRecord],
    });
  }

  function hubLayers(config, simulation, visible, provenance) {
    return activeHubs(config, simulation).map((hub) => {
      const board = visible.hubBoards.find((row) => row.id === hub.id);
      return builder.layer({
        id: `hub:${hub.id}`,
        kind: 'point',
        label: `${hub.label} · ${board.supply} in · ${board.demand} asked · ${board.inventory} available · ${board.waiting} waiting`,
        geometry: builder.geometry('node', 'city-node-id', [hub.nodeId]),
        quantity: builder.quantity('hub-cable-inventory', board.inventory, 'cables'),
        role: 'primary',
        importance: 0.95,
        aggregationKey: 'cable-exchange-hubs',
        provenance,
      });
    });
  }

  function locationLayers(config, simulation, visible, provenance) {
    return activeLocations(config, simulation).map((location) => {
      const journeys = visible.journeys.filter((row) => row.locationId === location.id).length;
      return builder.layer({
        id: `location:${location.id}`,
        kind: 'point',
        label: `${location.label} · ${journeys} cable trips today`,
        geometry: builder.geometry('node', 'city-node-id', [location.nodeId]),
        quantity: builder.quantity('community-cable-trips', journeys, 'trips/day'),
        role: journeys ? 'primary' : 'context',
        importance: journeys ? 0.78 : 0.38,
        aggregationKey: 'cable-exchange-locations',
        provenance,
      });
    });
  }

  function journeyLayers(config, visible, routeById, provenance) {
    const cableById = new Map(config.cableTypes.map((row) => [row.id, row]));
    const hubById = new Map(config.hubs.map((row) => [row.id, row]));
    const locationById = new Map(config.locations.map((row) => [row.id, row]));
    return visible.visibleJourneys.flatMap((journey) => {
      const route = routeById.get(journey.routeId);
      if (!route?.segmentIds?.length) return [];
      const cable = cableById.get(journey.cableTypeId);
      const hub = hubById.get(journey.hubId);
      const location = locationById.get(journey.locationId);
      const label = journey.action === 'dropoff'
        ? `${personLabel(journey.personId)} drops off ${cable.shortLabel} at ${hub.label} from ${location.label}`
        : `${personLabel(journey.personId)} picks up ${cable.shortLabel} at ${hub.label} for ${location.label}`;
      return [
        builder.layer({
          id: `path:${journey.id}`,
          kind: 'path',
          label,
          geometry: builder.geometry('segments', 'city-segment-id', route.segmentIds),
          quantity: builder.quantity(`cable.${journey.cableTypeId}.${journey.action}`, 1, 'cable'),
          role: 'event',
          importance: 0.72,
          aggregationKey: `cable-route:${journey.action}`,
          provenance,
        }),
        builder.layer({
          id: `actor:${journey.id}`,
          kind: 'actor',
          label,
          geometry: builder.geometry('segments', 'city-segment-id', route.segmentIds),
          quantity: builder.quantity(
            `actor.bicycle.cable-${journey.action}`,
            journey.progress,
            'ratio',
            [0, 1]
          ),
          role: 'event',
          importance: 1,
          aggregationKey: `cable-person:${journey.action}`,
          provenance,
        }),
      ];
    });
  }

  function inspections(config, simulation, visible, provenance) {
    const hubById = new Map(config.hubs.map((row) => [row.id, row]));
    const locationById = new Map(config.locations.map((row) => [row.id, row]));
    const cableById = new Map(config.cableTypes.map((row) => [row.id, row]));
    return [
      {
        id: `inspection:${simulation.id}:global-day-${visible.day}`,
        label: 'Global supply and demand',
        targetIds: simulation.activeHubIds.map((id) => `hub:${id}`),
        fields: [
          field('day', 'Pseudo-day', visible.day, provenance, 'day'),
          field('people', 'People', simulation.people.length, provenance, 'people'),
          field('supply', 'Supply today', visible.global.supply, provenance, 'cables'),
          field('demand', 'Demand today', visible.global.demand, provenance, 'cables'),
          field('reused', 'Reused this year', visible.cumulative.fulfilled, provenance, 'cables'),
          field('waiting', 'Waiting requests', visible.global.waiting, provenance, 'cables'),
        ],
      },
      ...activeHubs(config, simulation).map((hub) => {
        const board = visible.hubBoards.find((row) => row.id === hub.id);
        return {
          id: `inspection:${simulation.id}:${hub.id}:day-${visible.day}`,
          label: `${hub.label} board`,
          targetIds: [`hub:${hub.id}`],
          fields: [
            field('supply', 'Dropped off today', board.supply, provenance, 'cables'),
            field('demand', 'Requested today', board.demand, provenance, 'cables'),
            field('fulfilled', 'Pickups fulfilled', board.fulfilled, provenance, 'cables'),
            field('inventory', 'Available now', board.inventory, provenance, 'cables'),
            field('waiting', 'Waiting now', board.waiting, provenance, 'cables'),
          ],
        };
      }),
      ...visible.visibleJourneys.slice(0, 6).map((journey) => ({
        id: `inspection:${journey.id}`,
        label: `${personLabel(journey.personId)} cable trip`,
        targetIds: [`path:${journey.id}`, `actor:${journey.id}`],
        fields: [
          field('action', 'Action', journey.action, provenance),
          field('cable', 'Cable', cableById.get(journey.cableTypeId).label, provenance),
          field('hub', 'Hub', hubById.get(journey.hubId).label, provenance),
          field('location', 'Location', locationById.get(journey.locationId).label, provenance),
        ],
      })),
    ];
  }

  function activeHubs(config, simulation) {
    const active = new Set(simulation.activeHubIds);
    return config.hubs.filter((row) => active.has(row.id));
  }

  function activeLocations(config, simulation) {
    const active = new Set(simulation.activeLocationIds);
    return config.locations.filter((row) => active.has(row.id));
  }

  function field(id, label, value, provenance, unit = null) {
    return { id, label, value, unit, provenance };
  }

  function numeric(id, label, value, minimum, maximum, step, provenance) {
    return {
      id,
      label,
      kind: 'number',
      value,
      options: null,
      minimum,
      maximum,
      step,
      provenance,
    };
  }

  function multiSelect(id, label, value, rows, provenance) {
    return {
      id,
      label,
      kind: 'multiselect',
      value,
      options: rows.map((row) => ({ value: row.id, label: row.shortLabel || row.label })),
      minimum: null,
      maximum: null,
      step: null,
      provenance,
    };
  }

  function personLabel(id) {
    return `Person ${String(id).replace(/^person-/, '')}`;
  }

  return Object.freeze({ DATASET_REFERENCE, MODEL_IDENTITIES, createContribution });
});
