(function attachInterstellarV4(root, factory) {
  const builder = typeof module === 'object' && module.exports
    ? require('../../core/simulation/plugin-v4-builder.js')
    : root.SimulattePluginV4Builder;
  const api = factory(builder);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.InterstellarRelayV4 = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createInterstellarV4(builder) {
  const PLUGIN_ID = 'interstellar-relay-network';
  function createContribution({ result, progressive }) {
    const datasets = result.dataReceipts.filter((row) => row.sha256).map((row) => builder.datasetRecord(row.datasetId, row, {
      coverage: row.coverage,
      license: row.license,
    }));
    const gaia = datasets.find((row) => row.id.startsWith('gaia.'));
    const modelDataset = datasets.find((row) => row.id === 'interstellar.relay.models.v1') || gaia;
    const starRows = result.stellarStates.map((state) => builder.rowRecord(gaia, state.sourceRowIds[0] || state.sourceId, {
      sourceId: state.sourceId,
      name: state.name,
    }));
    const model = builder.modelRecord({
      id: `${PLUGIN_ID}:model:relay-v2`,
      datasetId: modelDataset.id,
      contentHash: modelDataset.contentHash,
      parentIds: datasets.map((row) => row.id),
      metadata: {
        modelIds: result.modelReceipts.map((row) => row.modelId),
        omissionIds: result.omissions.map((row) => row.id),
        reliabilityScope: result.reliabilityScope,
        claimBoundary: result.claimBoundary,
      },
      lineage: {
        axes: {
          origin: 'derived',
          temporalStatus: 'forecast',
          uncertainty: result.metrics.truth.uncertainty,
        },
        transformationChain: result.modelReceipts.map((row) => row.modelId),
      },
    });
    const spatial = builder.transformationRecord({
      id: `${PLUGIN_ID}:spatial:icrs-cartesian-pc:true-3d:v1`,
      datasetId: gaia.id,
      contentHash: gaia.contentHash,
      parentIds: [gaia.id, model.id],
      metadata: {
        dimensions: 3,
        axisOrder: ['icrs-x', 'icrs-y', 'icrs-z'],
        units: 'parsec',
        origin: 'solar-system-barycentric-scenario-origin',
        epoch: `J${result.targetEpochYear}`,
        scaleSemantics: 'true-distance',
        distanceSemantics: 'euclidean-3d-parsec',
        depthSemantics: 'signed-icrs-z-parsec-not-render-order',
        projectionPolicy: 'Projection must retain source coordinates and evidence.',
      },
      lineage: {
        axes: {
          origin: 'derived',
          temporalStatus: 'forecast',
          uncertainty: result.metrics.truth.uncertainty,
        },
        modelReceiptId: model.id,
        transformationChain: ['linear-space-motion-v2', 'icrs-spherical-to-cartesian'],
      },
    });
    const derivedPosition = (state) => builder.provenance({
      origin: 'derived',
      temporalStatus: 'forecast',
      uncertainty: state.truth.uncertainty,
      records: [starRows.find((row) => row.metadata.sourceId === state.sourceId), spatial],
    });
    const modeled = builder.provenance({
      origin: 'modeled',
      temporalStatus: 'forecast',
      uncertainty: result.metrics.truth.uncertainty,
      records: [model, spatial],
    });
    const simulated = builder.provenance({
      origin: 'simulated',
      temporalStatus: 'forecast',
      uncertainty: result.metrics.truth.uncertainty,
      records: [model, spatial],
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
        provenance: derivedPosition(state),
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
    const packetPosition = locatePacket(result, progressive, stateById);
    if (packetState) layers.push(builder.layer({
      id: result.packet.packetId,
      kind: 'actor',
      label: `Scenario packet: ${progressive.status}`,
      geometry: builder.geometry('point', 'icrs-cartesian-pc', [packetPosition]),
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
      payload: {
        affectedEntityIds: row.affectedEntityIds,
        omissionIds: result.omissions.map((omission) => omission.id),
        reliabilityScope: result.reliabilityScope,
        spatialTransformationId: spatial.id,
      },
      provenance: simulated,
    }));
    const currentEvent = events[Math.max(0, progressive.currentEventIndex)] || null;
    const activeLayerId = progressive.activeHopIndex === null
      ? null
      : `relay-link:${progressive.activeHopIndex}`;
    const presentation = builder.presentation({
      pluginId: PLUGIN_ID,
      coordinateSystem: 'icrs-cartesian-pc',
      epoch: `J${result.targetEpochYear}`,
      layers,
      viewIntents: [builder.viewIntent({
        id: 'interstellar-relay-overview',
        mode: progressive.status === 'settled' ? 'compare' : activeLayerId ? 'follow' : 'overview',
        targetIds: activeLayerId
          ? [activeLayerId, result.packet.packetId]
          : [...result.schedule.hops.map((_, index) => `relay-link:${index}`), result.packet.packetId],
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
        builder.quantity('packet-distance', Math.hypot(...packetPosition), 'pc'),
        builder.quantity('packet-depth', packetPosition[2], 'pc'),
        builder.quantity('packet-success-conditional', result.metrics.endToEndPacketSuccessProbability, 'probability'),
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
          field('reliability', 'Packet success conditional on continuous contact', result.metrics.endToEndPacketSuccessProbability, 'probability', modeled),
          field('continuous-contact', 'Continuous contact availability', 'assumed, not observed', null, modeled),
          field('omissions', 'Omitted reliability effects', result.omissions.map((row) => `${row.label}: ${row.effect}`).join('; '), null, modeled),
          field('coordinates', 'Spatial frame', 'true 3D ICRS Cartesian parsecs', null, modeled),
          field('packet-depth', 'Packet signed ICRS-z depth', packetPosition[2], 'pc', simulated),
          field('packet-distance', 'Packet Euclidean distance from origin', Math.hypot(...packetPosition), 'pc', simulated),
          field('boundary', 'Claim boundary', result.claimBoundary, null, modeled),
        ],
      }],
      provenanceRecords: [...datasets, ...starRows, model, spatial],
    });
  }
  function locatePacket(result, progressive, stateById) {
    if (progressive.activeHopIndex === null) {
      return stateById.get(progressive.packetLocationId)?.positionPc || [0, 0, 0];
    }
    const hop = result.schedule.hops[progressive.activeHopIndex];
    const source = stateById.get(hop.fromId).positionPc;
    const target = stateById.get(hop.toId).positionPc;
    const duration = Math.max(1, hop.receiveOffsetSeconds - hop.transmitOffsetSeconds);
    const fraction = Math.max(0, Math.min(1, (progressive.elapsedSeconds - hop.transmitOffsetSeconds) / duration));
    return source.map((value, index) => value + ((target[index] - value) * fraction));
  }
  function numeric(id, label, value, minimum, maximum, step, provenance) {
    return { id, label, kind: 'number', value, options: null, minimum, maximum, step, provenance };
  }
  function field(id, label, value, unit, provenance) { return { id, label, value, unit, provenance }; }
  return Object.freeze({ createContribution });
});
