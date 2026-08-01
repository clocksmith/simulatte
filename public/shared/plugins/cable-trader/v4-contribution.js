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
  const residenceLayerCache = new WeakMap();
  const DATASET_REFERENCE = Object.freeze({
    id: 'cable-circulation-catalog-v1',
    path: '../../../data/cable-trader/cable-circulation-catalog-v1.json',
    sha256: '4de18f918739242970e47f77c419ced2980ab8943a9d3f73f0b31a451535df5e',
    schemaId: 'simulatte.cableCirculationCatalog.v1',
  });
  const MODEL_IDENTITIES = Object.freeze({
    circulationModelHash: '35a9533f20a0b7dacf829135777bfd320b72eb99720334dd3b129e8d1d0bb7af',
  });

  function createContribution({ config, simulation, state, routes }) {
    const visible = simulation.snapshots[state.playback.day];
    const scenarioRecord = builder.datasetRecord(config.id, {
      sha256: simulation.configurationHash,
    }, {
      kind: 'authored synthetic community cable exchange',
      seed: simulation.seed,
      peopleCount: simulation.people.length,
      residenceCount: simulation.residences.length,
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
        algorithm: 'seeded_unique_residence_hub_spoke_circulation_v2',
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
      ...hubLayers(simulation, visible, scenario),
      ...residenceLayers(simulation, scenario),
      ...journeyLayers(config, simulation, visible, routeById, simulated),
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
            'residences',
          ],
          reasonEventId: visible.day ? events[visible.day - 1]?.id || null : null,
          priority: 50,
        }),
      ],
    });
    const controls = builder.controls([
      numeric('peopleCount', 'People / unique residences', simulation.people.length, 64, 10000, 64, scenario),
      numeric('hubCount', 'Hubs', simulation.activeHubIds.length, 4, 64, 1, scenario),
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
        builder.quantity('unique-residences', simulation.residences.length, 'residences'),
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

  function hubLayers(simulation, visible, provenance) {
    return simulation.hubs.map((hub) => {
      const board = visible.hubBoards.find((row) => row.id === hub.id);
      return builder.layer({
        id: `hub:${hub.id}`,
        kind: 'point',
        label: hub.label,
        geometry: builder.geometry('node', 'city-node-id', [hub.nodeId]),
        quantity: builder.quantity('hub-cable-inventory', board.inventory, 'cables'),
        role: 'primary',
        importance: 0.72,
        aggregationKey: 'cable-exchange-hubs',
        provenance,
      });
    });
  }

  function residenceLayers(simulation, provenance) {
    if (residenceLayerCache.has(simulation)) return residenceLayerCache.get(simulation);
    const layers = Object.freeze([builder.layer({
      id: 'residences',
      kind: 'point',
      label: `${simulation.residences.length.toLocaleString('en-US')} unique residences`,
      geometry: builder.geometry(
        'point-cloud',
        'city-planar-m',
        simulation.residences.map((row) => [row.position.x, row.position.y, 0])
      ),
      quantity: builder.quantity('person-residences', simulation.residences.length, 'residences'),
      role: 'context',
      importance: 0.08,
      aggregationKey: null,
      provenance,
    })]);
    residenceLayerCache.set(simulation, layers);
    return layers;
  }

  function journeyLayers(config, simulation, visible, routeById, provenance) {
    const cableById = new Map(config.cableTypes.map((row) => [row.id, row]));
    const hubById = new Map(simulation.hubs.map((row) => [row.id, row]));
    return visible.visibleJourneys.flatMap((journey) => {
      const route = routeById.get(journey.routeId);
      if (!route?.segmentIds?.length) return [];
      const cable = cableById.get(journey.cableTypeId);
      const hub = hubById.get(journey.hubId);
      const label = journey.action === 'dropoff'
        ? `${personLabel(journey.personId)} carries ${cable.shortLabel} to ${hub.label}`
        : `${personLabel(journey.personId)} carries ${cable.shortLabel} home`;
      return [
        builder.layer({
          id: `path:${journey.id}`,
          kind: 'path',
          label,
          geometry: builder.geometry('segments', 'city-segment-id', route.segmentIds),
          quantity: builder.quantity(`cable.${journey.cableTypeId}.${journey.action}`, 1, 'cable'),
          role: 'event',
          importance: 0.52,
          aggregationKey: `cable-route:${journey.action}`,
          provenance,
        }),
        builder.layer({
          id: `actor:${journey.id}`,
          kind: 'actor',
          label,
          geometry: builder.geometry('segments', 'city-segment-id', route.segmentIds),
          quantity: builder.quantity(
            `traveler.cable-${journey.cableTypeId}.${journey.action}`,
            journey.progress,
            'ratio',
            [0, 1]
          ),
          role: 'context',
          importance: 0.7,
          aggregationKey: null,
          provenance,
        }),
      ];
    });
  }

  function inspections(config, simulation, visible, provenance) {
    const hubById = new Map(simulation.hubs.map((row) => [row.id, row]));
    const residenceById = new Map(simulation.residences.map((row) => [row.id, row]));
    const cableById = new Map(config.cableTypes.map((row) => [row.id, row]));
    return [
      {
        id: `inspection:${simulation.id}:global-day-${visible.day}`,
        label: 'Global supply and demand',
        targetIds: simulation.activeHubIds.map((id) => `hub:${id}`),
        fields: [
          field('day', 'Pseudo-day', visible.day, provenance, 'day'),
          field('people', 'People', simulation.people.length, provenance, 'people'),
          field('residences', 'Unique residences', simulation.residences.length, provenance, 'residences'),
          field('hubs', 'Hubs', simulation.hubs.length, provenance, 'hubs'),
          field('supply', 'Supply today', visible.global.supply, provenance, 'cables'),
          field('demand', 'Demand today', visible.global.demand, provenance, 'cables'),
          field('reused', 'Reused this year', visible.cumulative.fulfilled, provenance, 'cables'),
          field('waiting', 'Waiting requests', visible.global.waiting, provenance, 'cables'),
        ],
      },
      ...simulation.hubs.map((hub) => {
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
          field('residence', 'Residence', residenceById.get(journey.residenceId).label, provenance),
        ],
      })),
    ];
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
