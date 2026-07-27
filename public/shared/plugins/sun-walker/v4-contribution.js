(function attachSunWalkerV4(root, factory) {
  const builder = typeof module === 'object' && module.exports
    ? require('../../core/simulation/plugin-v4-builder.js')
    : root.SimulattePluginV4Builder;
  const shadowGeometry = typeof module === 'object' && module.exports
    ? require('./shadow-geometry.js')
    : root.SimulatteSunWalkerShadowGeometry;
  const api = factory(builder, shadowGeometry);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteSunWalkerV4 = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createSunWalkerV4(builder, shadowGeometry) {
  const PLUGIN_ID = 'sun-walker';
  const MODEL_HASH = '3f5955769b066c43acaee934f8b9b775fe76a2b796db48d4a9eea89e7bd66ce7';

  function createContribution({ simulation, step, world, buildingReceipt, governanceReceipt, environmentReceipt }) {
    const buildings = builder.datasetRecord('world.buildings.v1', buildingReceipt, { coverage: simulation.dataReceipt.datasets[0].coverage });
    const governance = builder.datasetRecord('sun-walker.model-governance.v1', governanceReceipt, { coverage: 'solar equations and assumptions' });
    const environment = builder.datasetRecord('sun-walker.environment.v1', environmentReceipt, {
      coverage: 'historical NYC street-tree identities and Central Park hourly weather observations',
    });
    const model = builder.modelRecord({
      id: simulation.modelReceipt.id,
      datasetId: governance.id,
      contentHash: MODEL_HASH,
      parentIds: [buildings.id, governance.id, environment.id],
      metadata: { algorithms: simulation.modelReceipt.algorithms.map((row) => row.id), claimBoundary: simulation.claimBoundary },
    });
    const selected = simulation.candidates.find((row) => row.id === simulation.selectedCandidateId);
    const fastest = simulation.candidates.find((row) => row.id === simulation.fastestCandidateId);
    const snapshot = simulation.timeline.snapshots[Math.min(step, simulation.timeline.snapshots.length - 1)];
    const samples = selected.samples.slice(0, snapshot.state.completedSamples);
    const activeSample = samples.at(-1) || selected.samples[0];
    const buildingRows = [...new Set(selected.samples.map((row) => row.occluderId).filter(Boolean))]
      .filter((id) => selected.samples.some((row) => row.occluderId === id && row.occluderKind === 'building'))
      .map((id) => builder.rowRecord(buildings, id, {}));
    const canopyRows = [...new Set(samples
      .filter((row) => row.occluderKind === 'tree-canopy')
      .map((row) => row.environment.canopy.sourceRowId))]
      .map((id) => builder.rowRecord(environment, id, { rowKind: 'historical-tree-census' }));
    const weatherRows = [...new Set(samples
      .map((row) => row.environment.weather.sourceRowId)
      .filter(Boolean))]
      .map((id) => builder.rowRecord(environment, id, { rowKind: 'historical-hourly-weather' }));
    const claim = builder.provenance({
      origin: 'modeled',
      temporalStatus: 'forecast',
      uncertainty: simulation.modelReceipt.uncertainty,
      records: [model],
    });
    const shadowAreas = shadowGeometry.projectedEvidenceShadows(
      world,
      selected.samples.filter((row) => row.occluderKind === 'building').map((row) => row.occluderId),
      activeSample?.solarPosition,
    );
    const layers = [
      routeLayer('shade-selected-route', 'Shade-selected route', selected, 'route.shade-selected', 'primary', 1, claim),
      ...(fastest.id === selected.id
        ? []
        : [routeLayer('fastest-route', 'Fastest route baseline', fastest, 'route.fastest-baseline', 'comparison', 0.55, claim)]),
      ...shadowAreas.map((shadow) => builder.layer({
        id: shadow.id,
        kind: 'area',
        label: shadow.label,
        geometry: builder.geometry(
          'polygon',
          'city-local-m',
          shadow.points.map((point) => [point.x, point.y, 0]),
        ),
        quantity: builder.quantity('occlusion.shadow-length', shadow.lengthM, 'meters'),
        role: 'context',
        importance: 0.7,
        aggregationKey: null,
        provenance: builder.provenance({
          origin: 'modeled',
          temporalStatus: 'forecast',
          uncertainty: simulation.modelReceipt.uncertainty,
          records: [
            model,
            ...buildingRows.filter((row) => row.rowId === shadow.sourceBuildingId),
          ],
        }),
      })),
      ...samples.map((sample) => builder.layer({
        id: sample.id,
        kind: 'point',
        label: `${sample.state} at ${sample.timestamp}`,
        geometry: builder.geometry('point', 'city-local-m', [[sample.point.x, sample.point.y, 0]]),
        quantity: builder.quantity(`exposure.${sample.state}`, sample.representedSeconds, 'seconds'),
        role: sample.state === 'direct' ? 'event' : sample.state === 'unknown' ? 'uncertainty' : 'context',
        importance: sample.state === 'direct' ? 0.85 : 0.4,
        aggregationKey: 'sun-exposure-samples',
        provenance: builder.provenance({
          origin: 'modeled',
          temporalStatus: 'forecast',
          uncertainty: simulation.modelReceipt.uncertainty,
          records: [
            model,
            ...buildingRows.filter((row) => row.rowId === sample.occluderId),
            ...canopyRows.filter((row) => row.rowId === sample.environment.canopy.sourceRowId),
            ...weatherRows.filter((row) => row.rowId === sample.environment.weather.sourceRowId),
          ],
        }),
      })),
      ...[activeSample].filter(Boolean).map((sample) => builder.layer({
        id: 'sun-walker-actor',
        kind: 'actor',
        label: `Walker · ${sample.state} · ${sample.timestamp}`,
        geometry: builder.geometry('point', 'city-local-m', [[sample.point.x, sample.point.y, 0]]),
        quantity: builder.quantity('actor.pedestrian.route-progress', snapshot.state.progress, 'ratio', [0, 1]),
        role: 'event',
        importance: 1,
        aggregationKey: null,
        provenance: claim,
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
    const settledTargetIds = fastest.id === selected.id ? ['shade-selected-route'] : ['shade-selected-route', 'fastest-route'];
    const isSettled = snapshot.state.status === 'settled';
    const previousSample = samples.length > 1 ? samples.at(-2) : null;
    const navigationMode = exposureNavigationMode(previousSample, activeSample, isSettled);
    const isExposureTransition = navigationMode === 'pov';
    const presentation = builder.presentation({
      pluginId: PLUGIN_ID,
      coordinateSystem: 'city-node-segment-id',
      epoch: simulation.departureAt,
      layers,
      viewIntents: [builder.viewIntent({
        id: isSettled
          ? 'sun-route-comparison'
          : isExposureTransition
            ? 'sun-exposure-transition'
            : 'sun-walker-navigation',
        mode: isSettled ? 'compare' : navigationMode,
        targetIds: isSettled ? settledTargetIds : ['sun-walker-actor'],
        reasonEventId: activeEvent?.id || null,
        priority: isSettled ? 65 : isExposureTransition ? 70 : 55,
      })],
    });
    const controls = builder.controls(simulation.controls.filter((row) => row.isEnabled !== false).map((row) => ({
      id: row.id,
      label: row.description,
      kind: row.kind === 'datetime' ? 'datetime-local' : row.kind === 'toggle' ? 'toggle' : 'number',
      value: row.kind === 'datetime' ? simulation.departureAt.slice(0, 16) : row.defaultValue,
      options: null,
      ...controlBounds(row.id),
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
        builder.quantity('direct-beam-equivalent', snapshot.state.directBeamEquivalentSeconds, 'seconds'),
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
          field('progress', 'Route progress', snapshot.state.progress, 'ratio', claim),
          field('direct-sun', 'Direct sun so far', snapshot.state.directSunSeconds, 'seconds', claim),
          field('direct-beam-equivalent', 'Weather/canopy-adjusted direct beam so far', snapshot.state.directBeamEquivalentSeconds, 'seconds', claim),
          field('building-shade', 'Modeled shade so far', snapshot.state.shadeSeconds, 'seconds', claim),
          field('unknown', 'Unknown exposure so far', snapshot.state.unknownSeconds, 'seconds', claim),
          field('environment', 'Environmental evidence', 'Historical 2015 trees + pinned 2024 Central Park analog', null, claim),
          field('boundary', 'Claim boundary', simulation.claimBoundary, null, claim),
        ],
      }],
      provenanceRecords: [buildings, governance, environment, model, ...buildingRows, ...canopyRows, ...weatherRows],
    });
  }

  function routeLayer(id, label, candidate, quantityKind, role, importance, provenance) {
    return builder.layer({
      id,
      kind: 'path',
      label,
      geometry: builder.geometry('segments', 'city-segment-id', candidate.route.segmentIds),
      quantity: builder.quantity(quantityKind, candidate.metrics.directSunSeconds, 'seconds', [0, Math.max(1, candidate.metrics.travelSeconds)]),
      role,
      importance,
      provenance,
    });
  }

  function field(id, label, value, unit, provenance) {
    return { id, label, value, unit, provenance };
  }

  function controlBounds(id) {
    return {
      maximumAddedTimeSeconds: { minimum: 0, maximum: 86400, step: 30 },
      maximumAddedRatio: { minimum: 0, maximum: 10, step: 0.05 },
      directSunWeight: { minimum: 0, maximum: 100, step: 0.1 },
      walkingSpeedMps: { minimum: 0.1, maximum: 3, step: 0.1 },
    }[id] || { minimum: null, maximum: null, step: null };
  }

  function exposureNavigationMode(previousSample, activeSample, settled = false) {
    if (settled) return 'compare';
    return previousSample && activeSample && previousSample.state !== activeSample.state
      ? 'pov'
      : 'follow';
  }

  return Object.freeze({ createContribution, exposureNavigationMode });
});
