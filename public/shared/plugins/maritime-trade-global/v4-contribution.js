(function attachMaritimeV4(root, factory) {
  const builder = typeof module === 'object' && module.exports
    ? require('../../core/simulation/plugin-v4-builder.js')
    : root.SimulattePluginV4Builder;
  const api = factory(builder);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.MaritimeTradeV4 = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createMaritimeV4(builder) {
  const PLUGIN_ID = 'maritime-trade-global';
  const MODEL_HASH = '0fc99b214f626c1be3cd2f9c2777b789d326af0857b1de4248d565d33e3f212e';
  function createContribution({ portsData, result, snapshot, dataReceipts }) {
    const settled = snapshot.status === 'settled';
    const queueVisible = ['queued', 'berthing', 'discharged', 'delivered', 'settled'].includes(snapshot.status);
    const datasets = dataReceipts.filter((row) => row.sha256).map((row) => builder.datasetRecord(row.datasetId, row, {}));
    const portDataset = datasets.find((row) => /port-registry/.test(row.id)) || datasets[0];
    const activePorts = (portsData.ports || []).filter((row) => result.route.portIds.includes(row.id));
    const portRows = activePorts.map((port) => builder.rowRecord(portDataset, port.id, { label: port.name || port.label }));
    const model = builder.modelRecord({
      id: `${PLUGIN_ID}:model:voyage-v2`,
      datasetId: datasets[0].id,
      contentHash: MODEL_HASH,
      parentIds: datasets.map((row) => row.id),
      metadata: { modelReceiptIds: result.modelReceipts.map((row) => row.id), claimBoundary: result.claimBoundary },
    });
    const observed = (row) => builder.provenance({
      origin: 'observed',
      temporalStatus: 'snapshot',
      uncertainty: { kind: 'missing', value: { coordinateUncertainty: true } },
      records: [row],
    });
    const modeled = builder.provenance({
      origin: 'modeled',
      temporalStatus: 'forecast',
      uncertainty: result.route.truth.uncertainty,
      records: [model],
    });
    const simulated = builder.provenance({
      origin: 'simulated',
      temporalStatus: 'forecast',
      uncertainty: result.queueEnsemble.truth.uncertainty,
      records: [model],
    });
    const emissionsModeled = builder.provenance({
      origin: 'modeled',
      temporalStatus: 'forecast',
      uncertainty: result.emissions.truth.uncertainty,
      records: [model],
    });
    const layers = [
      ...activePorts.map((port) => builder.layer({
        id: `port:${port.id}`,
        kind: 'point',
        label: port.name || port.label || port.id,
        geometry: builder.geometry('point', 'wgs84', [[port.location.longitude, port.location.latitude, 0]]),
        role: 'context',
        importance: 0.7,
        aggregationKey: 'maritime-ports',
        provenance: observed(portRows.find((row) => row.rowId === port.id)),
      })),
      builder.layer({
        id: `route:${result.route.id}`,
        kind: 'path',
        label: 'Selected modeled voyage',
        geometry: builder.geometry('polyline', 'wgs84', result.route.waypoints),
        quantity: builder.quantity('cargo', result.parameters.cargoTeu, 'TEU', [0, 24000]),
        role: 'primary',
        importance: 1,
        provenance: modeled,
      }),
      builder.layer({
        id: `voyage:${result.scenarioId}`,
        kind: 'actor',
        label: 'Representative simulated vessel',
        geometry: builder.geometry('point', 'wgs84', [snapshot.position]),
        quantity: builder.quantity('progress', snapshot.progressFraction, 'ratio', [0, 1]),
        role: 'event',
        importance: 0.9,
        provenance: simulated,
      }),
    ];
    const events = result.eventTrace.map((row, sequence) => builder.event({
      id: row.id,
      pluginId: PLUGIN_ID,
      sequence,
      simulationTimeMs: row.timestamp * 3600000,
      kind: row.kind,
      causationIds: row.causalParentIds,
      correlationId: result.scenarioId,
      payload: { affectedEntityIds: row.affectedEntityIds },
      provenance: simulated,
    }));
    const eventIndex = Math.max(0, Math.min(events.length - 1, snapshot.cursor - 1));
    const currentEvent = events[eventIndex] || null;
    const presentation = builder.presentation({
      pluginId: PLUGIN_ID,
      coordinateSystem: 'wgs84',
      epoch: '2030-01-01T00:00:00Z',
      layers,
      viewIntents: [builder.viewIntent({
        id: 'maritime-voyage-overview',
        mode: snapshot.status === 'settled' ? 'compare' : 'overview',
        targetIds: [`route:${result.route.id}`, `voyage:${result.scenarioId}`],
        reasonEventId: currentEvent?.id || null,
        priority: 60,
      })],
    });
    const controls = builder.controls([
      select('vesselClassId', 'Vessel archetype', result.parameters.vesselClassId, result.controls.find((row) => row.id === 'vesselClassId').options, modeled),
      select('speedPolicy', 'Speed policy', result.parameters.speedPolicy, result.controls.find((row) => row.id === 'speedPolicy').options, modeled),
      numeric('cargoTeu', 'Scenario cargo', result.parameters.cargoTeu, 100, 24000, 100, modeled),
      numeric('ensembleReplicates', 'Queue ensemble runs', result.parameters.ensembleReplicates, 2, 512, 1, modeled),
    ], [{
      id: 'disrupted-vs-baseline',
      label: 'Configured voyage vs undisrupted baseline',
      baselineScenarioId: `${result.scenarioId}:baseline`,
      variantScenarioId: result.scenarioId,
      synchronizedClock: true,
    }]);
    const state = builder.state({
      id: `${PLUGIN_ID}:state:${snapshot.cursor}`,
      pluginId: PLUGIN_ID,
      simulationTimeMs: snapshot.timeHours * 3600000,
      status: snapshot.status,
      previousStateId: snapshot.cursor ? `${PLUGIN_ID}:state:${snapshot.cursor - 1}` : null,
      eventIds: events.slice(0, snapshot.cursor).map((row) => row.id),
      measures: [
        builder.quantity('progress', snapshot.progressFraction, 'ratio', [0, 1]),
        builder.quantity('elapsed-modeled-time', snapshot.timeHours / 24, 'day'),
        ...(settled ? [builder.quantity('transit-time', result.metrics.totalTransitDays.value, 'day')] : []),
        ...(queueVisible ? [builder.quantity('queue-p50', result.queueEnsemble.p50WaitHours, 'hour')] : []),
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
        id: 'maritime-voyage',
        label: 'Voyage model and limits',
        targetIds: [`route:${result.route.id}`],
        fields: [
          field('distance', 'Distance', result.route.distanceNm, 'nautical miles', modeled),
          field('progress', 'Voyage progress', snapshot.progressFraction, 'ratio', simulated),
          field('elapsed', 'Elapsed modeled time', snapshot.timeHours / 24, 'day', simulated),
          ...(settled ? [field('transit', 'Transit', result.metrics.totalTransitDays.value, 'day', simulated)] : []),
          ...(queueVisible ? [
            field('queue-p05', 'Queue stochastic p05', result.queueEnsemble.p05WaitHours, 'hour', simulated),
            field('queue-p50', 'Queue stochastic p50', result.queueEnsemble.p50WaitHours, 'hour', simulated),
            field('queue-p95', 'Queue stochastic p95', result.queueEnsemble.p95WaitHours, 'hour', simulated),
          ] : []),
          ...(settled ? [
            field('co2-baseline', 'CO2e baseline', result.emissions.parameterSensitivity.baselineCo2Tons, 'tonne', emissionsModeled),
            field('co2-sensitivity-low', 'CO2e parameter sensitivity low', result.emissions.parameterSensitivity.minimumCo2Tons, 'tonne', emissionsModeled),
            field('co2-sensitivity-high', 'CO2e parameter sensitivity high', result.emissions.parameterSensitivity.maximumCo2Tons, 'tonne', emissionsModeled),
          ] : []),
          field('boundary', 'Claim boundary', result.claimBoundary, null, modeled),
        ],
      }],
      provenanceRecords: [...datasets, ...portRows, model],
    });
  }
  function numeric(id, label, value, minimum, maximum, step, provenance) {
    return { id, label, kind: 'number', value, options: null, minimum, maximum, step, provenance };
  }

  function select(id, label, value, options, provenance) {
    return { id, label, kind: 'select', value, options, minimum: null, maximum: null, step: null, provenance };
  }
  function field(id, label, value, unit, provenance) { return { id, label, value, unit, provenance }; }
  return Object.freeze({ createContribution });
});
