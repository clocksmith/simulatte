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
    const hyg = datasets.find((row) => row.id === 'hyg.visible-stars.v1');
    const modelDataset = datasets.find((row) => row.id === 'interstellar.relay.models.v1') || gaia;
    const starRows = result.stellarStates.map((state) => {
      const dataset = state.sourceId.startsWith('hyg:') ? hyg : gaia;
      if (!dataset) throw new Error(`interstellar_v4_dataset_missing: ${state.sourceId}`);
      return builder.rowRecord(dataset, state.sourceRowIds[0] || state.sourceId, {
        sourceId: state.sourceId,
        name: state.name,
      });
    });
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
      datasetId: modelDataset.id,
      contentHash: modelDataset.contentHash,
      parentIds: [...new Set([modelDataset.id, model.id, gaia?.id, hyg?.id].filter(Boolean))],
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
    const channelProvenance = builder.provenance({
      origin: ['traversable-wormhole', 'alcubierre-warp'].includes(result.controls.channelMode)
        ? 'scenario'
        : 'modeled',
      temporalStatus: 'forecast',
      uncertainty: result.channelReceipts[0]?.truth?.uncertainty || result.metrics.truth.uncertainty,
      records: [model, spatial],
    });
    const stateById = new Map(result.stellarStates.map((row) => [row.sourceId, row]));
    const alternativeLayers = result.routeSelection.alternatives
      .filter((row) => row.path.join(':') !== result.routeSelection.selectedPath.join(':'))
      .map((alternative, index) => builder.layer({
        id: `route-alternative:${index}`,
        kind: 'path',
        label: `Alternative ${index + 1}: ${pathLabel(alternative.path, stateById)}`,
        geometry: builder.geometry('polyline', 'icrs-cartesian-pc', alternative.path.map(
          (id) => stateById.get(id).positionPc,
        )),
        quantity: builder.quantity('route-score', alternative.score, 'normalized-score'),
        role: 'comparison',
        importance: Math.max(0.2, 0.48 - index * 0.06),
        aggregationKey: 'route-alternatives',
        provenance: modeled,
      }));
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
        label: `${result.channelReceipts[index].label}: ${stateById.get(hop.fromId).name} to ${stateById.get(hop.toId).name}`,
        geometry: builder.geometry('polyline', 'icrs-cartesian-pc', [
          stateById.get(hop.fromId).positionPc,
          stateById.get(hop.toId).positionPc,
        ]),
        quantity: builder.quantity('data-rate', result.channelReceipts[index].effectiveDataRateGbps, 'Gb/s'),
        role: 'primary',
        importance: ['traversable-wormhole', 'alcubierre-warp'].includes(result.controls.channelMode) ? 1 : 0.8,
        aggregationKey: `relay-links:${result.controls.channelMode}`,
        provenance: channelProvenance,
      })),
      ...alternativeLayers,
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
        modeledEffectIds: result.operations.modeledEffectIds,
        channelMode: result.controls.channelMode,
        routeSelectionSchema: result.routeSelection.schema,
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
          : [
            ...result.schedule.hops.map((_, index) => `relay-link:${index}`),
            ...alternativeLayers.map((row) => row.id),
            result.packet.packetId,
          ],
        reasonEventId: currentEvent?.id || null,
        priority: 65,
      })],
    });
    const options = result.controlOptions;
    const requiredRelays = result.controls.requiredRelayIds.length
      ? result.controls.requiredRelayIds
      : ['none'];
    const controls = builder.controls([
      select('sourceId', 'From star', result.controls.sourceId, options.stars, modeled),
      select('targetId', 'To star', result.controls.targetId, options.stars, modeled),
      select('routingMode', 'Routing mode', result.controls.routingMode, routeModes(), modeled),
      select('routeObjective', 'Route objective', result.controls.routeObjective, routeObjectives(), modeled),
      multiselect('requiredRelayIds', 'Required relay stars', requiredRelays, options.relays, modeled),
      multiselect('eligibleRelayIds', 'Stars eligible as relays', result.controls.eligibleRelayIds, options.stars, modeled),
      numeric('maxHops', 'Maximum hops', result.controls.maxHops, 1, 8, 1, modeled),
      numeric('maxHopDistancePc', 'Maximum hop distance', result.controls.maxHopDistancePc, 0.01, 250000, 0.01, modeled),
      select('channelMode', 'Physics lane', result.controls.channelMode, options.channels, channelProvenance),
      select('operationsProfileId', 'Operations profile', result.controls.operationsProfileId, options.operationsProfiles, modeled),
      numeric('ensembleSize', 'Operational samples', result.controls.ensembleSize, 8, 512, 8, modeled),
      numeric('retryLimit', 'Retry limit', result.controls.retryLimit, 0, 20, 1, modeled),
      datetime('startEpochIso', 'Transmission epoch', result.controls.startEpochIso.slice(0, 16), modeled),
      numeric('packetBytes', 'Packet size', result.controls.packetBytes, 64, 1073741824, 1, modeled),
      numeric('processingDelayHours', 'Relay processing delay', result.controls.processingDelayHours, 0, 8760, 1, modeled),
      numeric('targetEpochYear', 'Target epoch year', result.controls.targetEpochYear, 2016, 2200, 1, modeled),
      select('transceiverId', 'Optical terminal', result.controls.transceiverId, options.terminals, modeled),
      ...advancedControls(result, channelProvenance),
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
        builder.quantity('physical-packet-success', result.metrics.physicalChannelSuccessProbability, 'probability'),
        builder.quantity('operational-delivery-probability', result.operations.deliveryProbability, 'probability'),
        ...(Number.isFinite(result.operations.latencySeconds.p90)
          ? [builder.quantity('operational-p90-latency', result.operations.latencySeconds.p90, 'second')]
          : []),
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
          field('route', 'Selected route', pathLabel(result.routeSelection.selectedPath, stateById), null, modeled),
          field('route-candidates', 'Valid route candidates', result.routeSelection.candidateCount, 'routes', modeled),
          field('route-search', 'Bounded route work', `${result.routeSelection.searchAttempts}/${result.routeSelection.searchBound} edge attempts · ${result.routeSelection.pathSearchAttempts}/${result.routeSelection.pathSearchBound} route states · ${result.routeSelection.candidateCount} valid${result.routeSelection.pathSearchTruncated ? ' · truncated' : ''}`, null, modeled),
          field('channel', 'Physics lane', result.channelReceipts[0]?.label || result.controls.channelMode, null, channelProvenance),
          field('causality', 'Causality status', uniqueJoin(result.channelReceipts, 'causalityStatus'), null, channelProvenance),
          field('constructibility', 'Constructibility status', uniqueJoin(result.channelReceipts, 'constructibilityStatus'), null, channelProvenance),
          field('channel-constraints', 'Constraint receipt', JSON.stringify(result.channelReceipts[0]?.constraintReceipt || {}), null, channelProvenance),
          field('physical-reliability', 'Physical packet success', result.metrics.physicalChannelSuccessProbability, 'probability', modeled),
          field('operational-reliability', 'Operational delivery probability', result.operations.deliveryProbability, 'probability', simulated),
          field('operational-latency', 'Successful latency p10 / p50 / p90', quantileLabel(result.operations.latencySeconds), null, simulated),
          field('operational-effects', 'Modeled operations', result.operations.modeledEffectIds.join('; '), null, simulated),
          field('operational-counts', 'Mean retries / outages / maintenance', `${result.operations.meanRetryCount.toFixed(2)} / ${result.operations.meanOutageCount.toFixed(2)} / ${result.operations.meanMaintenanceCount.toFixed(2)}`, null, simulated),
          field('omissions', 'Remaining limitations', result.omissions.map((row) => `${row.label}: ${row.effect}`).join('; '), null, modeled),
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

  function select(id, label, value, options, provenance) {
    return { id, label, kind: 'select', value, options, minimum: null, maximum: null, step: null, provenance };
  }

  function multiselect(id, label, value, options, provenance) {
    return { id, label, kind: 'multiselect', value, options, minimum: null, maximum: null, step: null, provenance };
  }

  function datetime(id, label, value, provenance) {
    return { id, label, kind: 'datetime-local', value, options: null, minimum: null, maximum: null, step: null, provenance };
  }
  function advancedControls(result, provenance) {
    const value = result.controls;
    if (value.channelMode === 'quantum-assisted') return [
      numeric('quantumMemoryCoherenceHours', 'Quantum memory coherence', value.quantumMemoryCoherenceHours, 0.001, 1e12, 1, provenance),
      numeric('quantumInitialFidelity', 'Initial entanglement fidelity', value.quantumInitialFidelity, 0, 1, 0.001, provenance),
      numeric('entanglementPairRateHz', 'Entanglement pair rate', value.entanglementPairRateHz, 1, 1e18, 1, provenance),
    ];
    if (value.channelMode === 'traversable-wormhole') return [
      numeric('wormholeTraversalSeconds', 'Wormhole traversal time', value.wormholeTraversalSeconds, 0.000001, 1e12, 0.001, provenance),
      numeric('wormholeThroatRadiusM', 'Wormhole throat radius', value.wormholeThroatRadiusM, 1e-35, 1e12, 0.01, provenance),
      numeric('speculativeBandwidthGbps', 'Scenario bandwidth', value.speculativeBandwidthGbps, 1e-12, 1e12, 0.001, provenance),
      numeric('speculativeStabilityProbability', 'Scenario stability', value.speculativeStabilityProbability, 0, 1, 0.01, provenance),
    ];
    if (value.channelMode === 'alcubierre-warp') return [
      numeric('warpEffectiveSpeedC', 'Effective speed', value.warpEffectiveSpeedC, 0.01, 1e6, 0.01, provenance),
      numeric('warpBubbleRadiusM', 'Warp bubble radius', value.warpBubbleRadiusM, 0.01, 1e12, 1, provenance),
      numeric('speculativeBandwidthGbps', 'Scenario bandwidth', value.speculativeBandwidthGbps, 1e-12, 1e12, 0.001, provenance),
      numeric('speculativeStabilityProbability', 'Scenario stability', value.speculativeStabilityProbability, 0, 1, 0.01, provenance),
    ];
    return [];
  }
  function routeModes() {
    return [
      { value: 'automatic', label: 'Automatic route search' },
      { value: 'manual', label: 'Use required relay set' },
      { value: 'direct', label: 'Direct link only' },
    ];
  }
  function routeObjectives() {
    return [
      { value: 'balanced', label: 'Balanced frontier' },
      { value: 'latency', label: 'Lowest latency' },
      { value: 'throughput', label: 'Highest throughput' },
      { value: 'energy', label: 'Lowest energy' },
      { value: 'reliability', label: 'Highest reliability' },
    ];
  }
  function pathLabel(path, stateById) {
    return path.map((id) => stateById.get(id)?.name || id).join(' → ');
  }
  function uniqueJoin(rows, key) {
    return [...new Set(rows.map((row) => row[key]))].join('; ');
  }
  function quantileLabel(value) {
    const format = (seconds) => seconds === null ? 'not delivered' : `${(seconds / 31557600).toFixed(5)} y`;
    return `${format(value.p10)} / ${format(value.p50)} / ${format(value.p90)}`;
  }
  function field(id, label, value, unit, provenance) { return { id, label, value, unit, provenance }; }
  return Object.freeze({ createContribution });
});
