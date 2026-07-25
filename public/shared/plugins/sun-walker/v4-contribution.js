(function attachSunWalkerV4(root, factory) {
  const builder = typeof module === 'object' && module.exports
    ? require('../../core/simulation/plugin-v4-builder.js')
    : root.SimulattePluginV4Builder;
  const api = factory(builder);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteSunWalkerV4 = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createSunWalkerV4(builder) {
  const PLUGIN_ID = 'sun-walker';
  const MODEL_HASH = '3f5955769b066c43acaee934f8b9b775fe76a2b796db48d4a9eea89e7bd66ce7';

  function createContribution({ simulation, step, buildingReceipt, governanceReceipt }) {
    const buildings = builder.datasetRecord('world.buildings.v1', buildingReceipt, { coverage: simulation.dataReceipt.datasets[0].coverage });
    const governance = builder.datasetRecord('sun-walker.model-governance.v1', governanceReceipt, { coverage: 'solar equations and assumptions' });
    const model = builder.modelRecord({
      id: simulation.modelReceipt.id,
      datasetId: governance.id,
      contentHash: MODEL_HASH,
      parentIds: [buildings.id, governance.id],
      metadata: { algorithms: simulation.modelReceipt.algorithms.map((row) => row.id), claimBoundary: simulation.claimBoundary },
    });
    const selected = simulation.candidates.find((row) => row.id === simulation.selectedCandidateId);
    const fastest = simulation.candidates.find((row) => row.id === simulation.fastestCandidateId);
    const snapshot = simulation.timeline.snapshots[Math.min(step, simulation.timeline.snapshots.length - 1)];
    const samples = selected.samples.slice(0, snapshot.state.completedSamples);
    const buildingRows = [...new Set(samples.map((row) => row.occluderId).filter(Boolean))]
      .map((id) => builder.rowRecord(buildings, id, {}));
    const claim = builder.provenance({
      origin: 'modeled',
      temporalStatus: 'forecast',
      uncertainty: simulation.modelReceipt.uncertainty,
      records: [model],
    });
    const layers = [
      routeLayer('shade-selected-route', 'Shade-selected route', selected, 'primary', 1, claim),
      ...(fastest.id === selected.id ? [] : [routeLayer('fastest-route', 'Fastest route baseline', fastest, 'comparison', 0.55, claim)]),
      ...samples.map((sample) => builder.layer({
        id: sample.id,
        kind: 'point',
        label: `${sample.state} at ${sample.timestamp}`,
        geometry: builder.geometry('point', 'city-local-m', [[sample.point.x, sample.point.y, 0]]),
        quantity: builder.quantity('represented-exposure', sample.representedSeconds, 'seconds'),
        role: sample.state === 'direct' ? 'event' : sample.state === 'unknown' ? 'uncertainty' : 'context',
        importance: sample.state === 'direct' ? 0.85 : 0.4,
        aggregationKey: 'sun-exposure-samples',
        provenance: builder.provenance({
          origin: 'modeled',
          temporalStatus: 'forecast',
          uncertainty: simulation.modelReceipt.uncertainty,
          records: [model, ...buildingRows.filter((row) => row.rowId === sample.occluderId)],
        }),
      })),
    ];
    const departureMs = Date.parse(simulation.departureAt);
    const events = simulation.timeline.events.map((row) => builder.event({
      id: row.id,
      pluginId: PLUGIN_ID,
      sequence: row.sequence,
      simulationTimeMs: Math.max(0, Date.parse(row.timestamp) - departureMs),
      kind: row.kind,
      causationIds: row.causalParents,
      correlationId: simulation.id,
      payload: { affectedEntities: row.affectedEntities, severity: row.severity },
      provenance: claim,
    }));
    const activeEvent = events[Math.min(step, events.length - 1)] || null;
    const targetIds = fastest.id === selected.id ? ['shade-selected-route'] : ['shade-selected-route', 'fastest-route'];
    const presentation = builder.presentation({
      pluginId: PLUGIN_ID,
      coordinateSystem: 'city-node-segment-id',
      epoch: simulation.departureAt,
      layers,
      viewIntents: [builder.viewIntent({
        id: 'sun-route-overview',
        mode: snapshot.state.status === 'settled' ? 'compare' : 'overview',
        targetIds,
        reasonEventId: activeEvent?.id || null,
        priority: snapshot.state.status === 'settled' ? 65 : 45,
      })],
    });
    const controls = builder.controls(simulation.controls.filter((row) => row.kind !== 'datetime' && row.isEnabled !== false).map((row) => ({
      id: row.id,
      label: row.description,
      kind: row.kind === 'toggle' ? 'toggle' : 'number',
      value: row.defaultValue,
      options: null,
      minimum: null,
      maximum: null,
      step: null,
      provenance: claim,
    })), [{
      id: 'fastest-versus-shade-selected',
      label: 'Fastest route vs shade-selected route',
      baselineScenarioId: fastest.id,
      variantScenarioId: selected.id,
      synchronizedClock: true,
    }]);
    const state = builder.state({
      id: `${simulation.id}:step-${step}`,
      pluginId: PLUGIN_ID,
      simulationTimeMs: activeEvent?.simulationTimeMs || 0,
      status: snapshot.state.status,
      previousStateId: step ? `${simulation.id}:step-${step - 1}` : null,
      eventIds: events.slice(0, step + 1).map((row) => row.id),
      measures: [
        builder.quantity('progress', snapshot.state.progress, 'ratio', [0, 1]),
        builder.quantity('direct-sun', snapshot.state.directSunSeconds, 'seconds'),
        builder.quantity('shade', snapshot.state.shadeSeconds, 'seconds'),
        builder.quantity('unknown', snapshot.state.unknownSeconds, 'seconds'),
      ],
      provenance: claim,
    });
    return builder.contribution({
      pluginId: PLUGIN_ID,
      presentation,
      events,
      controls,
      state,
      inspections: [{
        id: 'sun-route-comparison',
        label: 'Sun exposure comparison',
        targetIds: ['shade-selected-route'],
        fields: [
          field('direct-sun', 'Direct sun', selected.metrics.directSunSeconds, 'seconds', claim),
          field('shade', 'Modeled building shade', selected.metrics.shadeSeconds, 'seconds', claim),
          field('unknown', 'Unknown exposure', selected.metrics.unknownSeconds, 'seconds', claim),
          field('boundary', 'Claim boundary', simulation.claimBoundary, null, claim),
        ],
      }],
      provenanceRecords: [buildings, governance, model, ...buildingRows],
    });
  }

  function routeLayer(id, label, candidate, role, importance, provenance) {
    return builder.layer({
      id,
      kind: 'path',
      label,
      geometry: builder.geometry('segments', 'city-segment-id', candidate.route.segmentIds),
      quantity: builder.quantity('direct-sun', candidate.metrics.directSunSeconds, 'seconds', [0, Math.max(1, candidate.metrics.travelSeconds)]),
      role,
      importance,
      provenance,
    });
  }

  function field(id, label, value, unit, provenance) {
    return { id, label, value, unit, provenance };
  }

  return Object.freeze({ createContribution });
});
