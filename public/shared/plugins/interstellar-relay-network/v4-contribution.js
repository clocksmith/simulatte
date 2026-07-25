(function attachInterstellarV4(root, factory) {
  const builder = typeof module === 'object' && module.exports
    ? require('../../core/simulation/plugin-v4-builder.js')
    : root.SimulattePluginV4Builder;
  const api = factory(builder);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.InterstellarRelayV4 = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createInterstellarV4(builder) {
  const PLUGIN_ID = 'interstellar-relay-network';
  const MODEL_HASH = '0df39609ee3573112e2ebe1698edb28b46c9ebe316f1558abef4db100ad3596d';
  function createContribution({ result, progressive }) {
    const datasets = result.dataReceipts.filter((row) => row.sha256).map((row) => builder.datasetRecord(row.datasetId, row, {
      coverage: row.coverage,
      license: row.license,
    }));
    const gaia = datasets.find((row) => row.id.startsWith('gaia.'));
    const starRows = result.stellarStates.map((state) => builder.rowRecord(gaia, state.sourceRowIds[0] || state.sourceId, {
      sourceId: state.sourceId,
      name: state.name,
    }));
    const model = builder.modelRecord({
      id: `${PLUGIN_ID}:model:relay-v2`,
      datasetId: datasets.find((row) => row.id === 'interstellar.relay.models.v1')?.id || gaia.id,
      contentHash: MODEL_HASH,
      parentIds: datasets.map((row) => row.id),
      metadata: { modelIds: result.modelReceipts.map((row) => row.modelId), claimBoundary: result.claimBoundary },
    });
    const observed = (state) => builder.provenance({
      origin: 'observed',
      temporalStatus: 'snapshot',
      uncertainty: state.truth.uncertainty,
      records: [starRows.find((row) => row.metadata.sourceId === state.sourceId)],
    });
    const modeled = builder.provenance({
      origin: 'modeled',
      temporalStatus: 'forecast',
      uncertainty: result.metrics.truth.uncertainty,
      records: [model],
    });
    const simulated = builder.provenance({
      origin: 'simulated',
      temporalStatus: 'forecast',
      uncertainty: result.metrics.truth.uncertainty,
      records: [model],
    });
    const stateById = new Map(result.stellarStates.map((row) => [row.sourceId, row]));
    const layers = [
      ...result.stellarStates.map((state) => builder.layer({
        id: `star:${state.sourceId}`,
        kind: 'point',
        label: state.name,
        geometry: builder.geometry('point', 'icrs-cartesian-pc', [state.positionPc]),
        quantity: builder.quantity('distance', state.distancePc, 'pc'),
        role: result.scenario.relayHops.includes(state.sourceId) ? 'primary' : 'context',
        importance: result.scenario.relayHops.includes(state.sourceId) ? 0.9 : 0.25,
        aggregationKey: 'stellar-neighborhood',
        provenance: observed(state),
      })),
      ...result.schedule.hops.map((hop, index) => builder.layer({
        id: `relay-link:${index}`,
        kind: 'path',
        label: `${stateById.get(hop.fromId).name} to ${stateById.get(hop.toId).name}`,
        geometry: builder.geometry('polyline', 'icrs-cartesian-pc', [
          stateById.get(hop.fromId).positionPc,
          stateById.get(hop.toId).positionPc,
        ]),
        quantity: builder.quantity('data-rate', result.linkBudgets[index].achievableDataRateGbps, 'Gb/s'),
        role: 'primary',
        importance: 0.8,
        aggregationKey: 'relay-links',
        provenance: modeled,
      })),
    ];
    const packetState = stateById.get(progressive.packetLocationId) || result.relayStates[0];
    if (packetState) layers.push(builder.layer({
      id: result.packet.packetId,
      kind: 'actor',
      label: `Scenario packet: ${progressive.status}`,
      geometry: builder.geometry('point', 'icrs-cartesian-pc', [packetState.positionPc]),
      quantity: builder.quantity('payload', result.packet.payloadBytes, 'bytes'),
      role: 'event',
      importance: 1,
      provenance: simulated,
    }));
    const events = result.schedule.trace.map((row, sequence) => builder.event({
      id: row.id,
      pluginId: PLUGIN_ID,
      sequence,
      simulationTimeMs: row.timeSeconds * 1000,
      kind: `${PLUGIN_ID}.${row.kind.replace(/^relay\./, '')}`,
      causationIds: row.causalParentIds,
      correlationId: result.scenarioId,
      payload: { affectedEntityIds: row.affectedEntityIds },
      provenance: simulated,
    }));
    const currentEvent = events[Math.max(0, progressive.currentEventIndex)] || null;
    const presentation = builder.presentation({
      pluginId: PLUGIN_ID,
      coordinateSystem: 'icrs-cartesian-pc',
      epoch: `J${result.targetEpochYear}`,
      layers,
      viewIntents: [builder.viewIntent({
        id: 'interstellar-relay-overview',
        mode: progressive.status === 'settled' ? 'compare' : 'overview',
        targetIds: [...result.schedule.hops.map((_, index) => `relay-link:${index}`), result.packet.packetId],
        reasonEventId: currentEvent?.id || null,
        priority: 65,
      })],
    });
    const controls = builder.controls([
      numeric('packetBytes', 'Packet size', result.controls.packetBytes, 1, 1000000000, 1, modeled),
      numeric('processingDelayHours', 'Relay processing delay', result.controls.processingDelayHours, 0, 8760, 1, modeled),
      numeric('targetEpochYear', 'Target epoch year', result.controls.targetEpochYear, 1900, 2500, 1, modeled),
    ], [{
      id: result.comparisonDefinition.id,
      label: result.comparisonDefinition.label || 'Relay path vs direct baseline',
      baselineScenarioId: `${result.scenarioId}:direct`,
      variantScenarioId: result.scenarioId,
      synchronizedClock: true,
    }]);
    const state = builder.state({
      id: `${PLUGIN_ID}:state:${progressive.currentEventIndex}`,
      pluginId: PLUGIN_ID,
      simulationTimeMs: progressive.elapsedSeconds * 1000,
      status: progressive.status,
      previousStateId: progressive.currentEventIndex > 0 ? `${PLUGIN_ID}:state:${progressive.currentEventIndex - 1}` : null,
      eventIds: events.slice(0, progressive.currentEventIndex + 1).map((row) => row.id),
      measures: [
        builder.quantity('latency', result.metrics.oneWayLatencyYears, 'year'),
        builder.quantity('bottleneck-rate', result.metrics.bottleneckDataRateGbps, 'Gb/s'),
        builder.quantity('minimum-margin', result.metrics.minimumLinkMarginDb, 'dB'),
      ],
      provenance: simulated,
    });
    return builder.contribution({
      pluginId: PLUGIN_ID,
      presentation,
      events,
      controls,
      state,
      inspections: [{
        id: 'relay-experiment',
        label: 'Relay experiment and limits',
        targetIds: result.schedule.hops.map((_, index) => `relay-link:${index}`),
        fields: [
          field('latency', 'One-way latency', result.metrics.oneWayLatencyYears, 'year', modeled),
          field('rate', 'Bottleneck rate', result.metrics.bottleneckDataRateGbps, 'Gb/s', modeled),
          field('boundary', 'Claim boundary', result.claimBoundary, null, modeled),
        ],
      }],
      provenanceRecords: [...datasets, ...starRows, model],
    });
  }
  function numeric(id, label, value, minimum, maximum, step, provenance) {
    return { id, label, kind: 'number', value, options: null, minimum, maximum, step, provenance };
  }
  function field(id, label, value, unit, provenance) { return { id, label, value, unit, provenance }; }
  return Object.freeze({ createContribution });
});
