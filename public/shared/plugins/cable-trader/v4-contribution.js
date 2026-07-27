(function attachCableTraderV4Contribution(root, factory) {
  const builder = typeof module === 'object' && module.exports
    ? require('../../core/simulation/plugin-v4-builder.js')
    : root.SimulattePluginV4Builder;
  const api = factory(builder);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteCableTraderV4Contribution = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createCableTraderV4Contribution(builder) {
  const PLUGIN_ID = 'cable-trader';
  const DATASET_REFERENCE = Object.freeze({
    id: 'cable-compatibility-priors-v1',
    path: '../../../data/cable-trader/cable-compatibility-priors-v1.json',
    sha256: '489761dac36fb64f334a20460f6e43e3858bd0ec909c85ff32e0023c41492e4d',
    schemaId: 'simulatte.cableCompatibilityPriors.v1',
  });
  const EVENT_MODEL_HASH = 'b032abe941d0b487cb02ec5c5ab488f6e627317934e7f9bece548183b893982c';
  const FLOW_MODEL_HASH = '6299ec3045c8e0d7cca9daba1146fa0c6eb597de9a51cccd231eab635538101c';
  const LOCAL_ONLY_MODEL_HASH = 'b3b646930b80be26390392b477a16a1614eb08fe2a0b6a991eefb2fdcaa9899d';
  const STANDARDS_EVIDENCE_FAMILY_IDS = Object.freeze([
    'usb-c-to-a',
    'usb-c-to-c',
    'usb-c-to-lightning',
    'hdmi',
    'iec-c13-power',
  ]);
  const MODEL_IDENTITIES = Object.freeze({
    eventModelHash: EVENT_MODEL_HASH,
    flowModelHash: FLOW_MODEL_HASH,
    localOnlyModelHash: LOCAL_ONLY_MODEL_HASH,
  });
  const DAY_MS = 86400000;

  function createContribution({ config, simulation, state, transferRoutes }) {
    const scenario = builder.datasetRecord(config.id, { sha256: simulation.configurationHash }, {
      kind: 'authored synthetic exchange scenario',
      seed: simulation.seed,
      scenarioId: simulation.scenarioId,
      selectedCableFamilyIds: simulation.selectedCableFamilyIds,
    });
    const compatibility = builder.datasetRecord(DATASET_REFERENCE.id, { sha256: DATASET_REFERENCE.sha256 }, {
      schemaId: DATASET_REFERENCE.schemaId,
      coverage: 'connector-family priors only; no observed exchange demand',
    });
    const hubRecords = config.hubs.map((hub) => builder.rowRecord(scenario, `hub:${hub.id}`, {
      label: hub.label,
      nodeId: hub.nodeId,
    }));
    const compatibilityCoverageRecords = simulation.selectedCableFamilyIds.map((cableFamilyId) => (
      builder.rowRecord(compatibility, `coverage:${cableFamilyId}`, {
        cableFamilyId,
        standardsEvidence: STANDARDS_EVIDENCE_FAMILY_IDS.includes(cableFamilyId),
        coverage: STANDARDS_EVIDENCE_FAMILY_IDS.includes(cableFamilyId)
          ? 'connector-family standards context'
          : 'scenario-only cable-family identity',
      })
    ));
    const eventModel = builder.modelRecord({
      id: `${PLUGIN_ID}:model:event-generator`,
      datasetId: scenario.id,
      contentHash: EVENT_MODEL_HASH,
      parentIds: [scenario.id],
      metadata: { algorithm: 'seeded weighted categorical arrivals and returns' },
    });
    const flowModel = builder.modelRecord({
      id: `${PLUGIN_ID}:model:min-cost-flow`,
      datasetId: scenario.id,
      contentHash: FLOW_MODEL_HASH,
      parentIds: [scenario.id],
      metadata: {
        algorithm: 'exact minimum-cost maximum-flow',
        optimalityProven: simulation.summary.optimalityProven,
      },
    });
    const simulated = builder.provenance({
      origin: 'simulated',
      temporalStatus: 'forecast',
      uncertainty: {
        kind: 'distribution',
        value: { seed: simulation.seed, ensembleSize: 1, intervalStatus: 'not computed' },
      },
      records: [eventModel, flowModel],
    });
    const scenarioClaim = builder.provenance({
      origin: 'scenario',
      temporalStatus: 'forecast',
      uncertainty: { kind: 'missing', value: { empiricalDemandCalibration: true } },
      records: [scenario],
    });
    const visible = simulation.snapshots[state.playback.day];
    const routeByPair = new Map(transferRoutes.map((route) => [`${route.sourceHubId}:${route.destinationHubId}`, route]));
    const visibleFlows = visible.flows.filter((flow) => (
      flow.sourceHubId !== flow.destinationHubId && flow.quantity > 0
    ));
    const actorCount = visibleFlows.length
      ? Math.ceil(config.simulation.renderedRequestCount * (visible.day / simulation.durationDays))
      : 0;
    const layers = [
      ...visible.hubStats.map((hub) => {
        const configHub = config.hubs.find((row) => row.id === hub.id);
        return builder.layer({
          id: `hub:${hub.id}`,
          kind: 'point',
          label: `${hub.label}: ${hub.endingInventory} cables`,
          geometry: builder.geometry('node', 'city-node-id', [configHub.nodeId]),
          quantity: builder.quantity('ending-inventory', hub.endingInventory, 'items', [0, Math.max(1, visible.summary.endingInventory)]),
          role: 'primary',
          importance: 0.85,
          aggregationKey: 'cable-hubs',
          provenance: builder.provenance({
            origin: 'simulated',
            temporalStatus: 'forecast',
            uncertainty: simulated.axes.uncertainty,
            records: [hubRecords.find((row) => row.rowId === `hub:${hub.id}`), eventModel],
          }),
        });
      }),
      ...visibleFlows.flatMap((flow) => {
        const route = routeByPair.get(`${flow.sourceHubId}:${flow.destinationHubId}`);
        if (!route?.segmentIds?.length) return [];
        return [builder.layer({
          id: `flow:${flow.sourceHubId}:${flow.destinationHubId}`,
          kind: 'path',
          label: `${flow.quantity} cables rebalanced`,
          geometry: builder.geometry('segments', 'city-segment-id', route.segmentIds),
          quantity: builder.quantity('transferred-cables', flow.quantity, 'items', [0, Math.max(1, visible.summary.fulfilledNeeds)]),
          role: 'event',
          importance: Math.min(1, 0.45 + flow.quantity / Math.max(1, visible.summary.fulfilledNeeds)),
          aggregationKey: 'cable-flows',
          provenance: simulated,
        })];
      }),
      ...Array.from({ length: actorCount }, (_, index) => {
        const flow = selectFlow(visibleFlows, index, actorCount);
        const route = routeByPair.get(`${flow.sourceHubId}:${flow.destinationHubId}`);
        if (!route?.segmentIds?.length) return null;
        const progress = (
          (visible.day / Math.max(1, simulation.durationDays))
          + (index / Math.max(1, actorCount))
        ) % 1;
        return builder.layer({
          id: `modeled-cable-request-${index + 1}`,
          kind: 'actor',
          label: `Modeled request ${index + 1}`,
          geometry: builder.geometry('segments', 'city-segment-id', route.segmentIds),
          quantity: builder.quantity(
            `actor.${index % 5 === 0 ? 'scooter' : 'bicycle'}.route-progress`,
            progress,
            'ratio',
            [0, 1],
          ),
          role: 'event',
          importance: index === 0 ? 1 : 0.65,
          aggregationKey: 'modeled-cable-requests',
          provenance: simulated,
        });
      }).filter(Boolean),
    ];
    const events = simulation.events.map((row, sequence) => builder.event({
      id: row.id,
      pluginId: PLUGIN_ID,
      sequence,
      simulationTimeMs: (sequence + 1) * DAY_MS,
      kind: row.kind,
      causationIds: row.causalParentIds,
      correlationId: simulation.id,
      payload: { measures: row.measures, affectedEntityIds: row.affectedEntityIds },
      provenance: simulated,
    }));
    const leadingActor = layers.find((row) => row.id.startsWith('modeled-cable-request-'));
    const viewIntents = [
      builder.viewIntent({
        id: 'cable-network-overview',
        mode: 'overview',
        targetIds: layers.filter((row) => row.id.startsWith('hub:')).map((row) => row.id),
        reasonEventId: events[Math.max(0, state.playback.day - 1)]?.id || null,
        priority: 45,
      }),
      ...(leadingActor && state.playback.status === 'running' ? [builder.viewIntent({
        id: `cable-dominant-flow:${state.playback.day}`,
        mode: 'follow',
        targetIds: [leadingActor.id],
        reasonEventId: events[Math.max(0, state.playback.day - 1)]?.id || null,
        priority: 60,
      })] : []),
    ];
    const presentation = builder.presentation({
      pluginId: PLUGIN_ID,
      coordinateSystem: 'city-node-segment-id',
      layers,
      viewIntents,
    });
    const controls = builder.controls([
      multiSelectControl(
        'selectedCableFamilyIds',
        'Cable families',
        simulation.selectedCableFamilyIds,
        config.cableTypes.map((row) => ({ value: row.id, label: row.label })),
        scenarioClaim
      ),
      numericControl('durationDays', 'Duration', config.simulation.durationDays, 1, 365, 1, scenarioClaim),
      numericControl('initialInventoryPerHubType', 'Starting inventory', config.simulation.initialInventoryPerHubType, 1, 100000, 1, scenarioClaim),
    ], [{
      id: 'optimized-vs-local-only',
      label: 'Optimized redistribution vs local inventory only',
      baselineScenarioId: `${simulation.id}:local-only`,
      variantScenarioId: simulation.id,
      synchronizedClock: true,
    }]);
    const progressiveState = builder.state({
      id: `${simulation.id}:day-${visible.day}`,
      pluginId: PLUGIN_ID,
      simulationTimeMs: visible.day * DAY_MS,
      status: state.playback.status,
      previousStateId: visible.day ? `${simulation.id}:day-${visible.day - 1}` : null,
      eventIds: events.slice(0, visible.day).map((row) => row.id),
      measures: [
        builder.quantity('fulfilled-needs', visible.summary.fulfilledNeeds, 'items'),
        builder.quantity('selected-cable-families', simulation.selectedCableFamilyIds.length, 'families'),
        builder.quantity('ending-inventory', visible.summary.endingInventory, 'items'),
        builder.quantity('transport-burden', visible.summary.totalBurden, 'cost units'),
      ],
      provenance: simulated,
    });
    const inspections = [
      ...config.hubs.map((hub) => ({
        id: `inventory:${hub.id}`,
        label: `${hub.label} inventory`,
        targetIds: [`hub:${hub.id}`],
        fields: config.cableTypes.filter((type) => simulation.selectedCableFamilyIds.includes(type.id)).map((type) => ({
          id: type.id,
          label: type.label,
          value: visible.inventory[`${hub.id}:${type.id}`],
          unit: 'items',
          provenance: simulated,
        })),
      })),
      {
        id: 'connector-standards-evidence',
        label: 'Connector standards evidence',
        targetIds: config.hubs.map((hub) => `hub:${hub.id}`),
        fields: simulation.selectedCableFamilyIds.map((cableFamilyId) => ({
          id: cableFamilyId,
          label: config.cableTypes.find((row) => row.id === cableFamilyId).label,
          value: STANDARDS_EVIDENCE_FAMILY_IDS.includes(cableFamilyId)
            ? 'standards context available'
            : 'scenario-only identity',
          unit: null,
          provenance: builder.provenance({
            origin: 'derived',
            temporalStatus: 'snapshot',
            uncertainty: {
              kind: 'missing',
              value: { observedDemandCalibration: true },
            },
            records: [compatibilityCoverageRecords.find((row) => row.rowId === `coverage:${cableFamilyId}`)],
          }),
        })),
      },
    ];
    return builder.contribution({
      pluginId: PLUGIN_ID,
      presentation,
      events,
      controls,
      state: progressiveState,
      inspections,
      provenanceRecords: [
        compatibility,
        scenario,
        ...compatibilityCoverageRecords,
        ...hubRecords,
        eventModel,
        flowModel,
      ],
    });
  }

  function numericControl(id, label, value, minimum, maximum, step, provenance) {
    return { id, label, kind: 'number', value, options: null, minimum, maximum, step, provenance };
  }

  function multiSelectControl(id, label, value, options, provenance) {
    return {
      id,
      label,
      kind: 'multiselect',
      value,
      options,
      minimum: null,
      maximum: null,
      step: null,
      provenance,
    };
  }

  function selectFlow(flows, index, count) {
    const total = flows.reduce((sum, flow) => sum + flow.quantity, 0);
    let target = ((index + 0.5) / count) * total;
    for (const flow of flows) {
      target -= flow.quantity;
      if (target <= 0) return flow;
    }
    return flows.at(-1);
  }

  return Object.freeze({
    DATASET_REFERENCE,
    MODEL_IDENTITIES,
    STANDARDS_EVIDENCE_FAMILY_IDS,
    createContribution,
  });
});
