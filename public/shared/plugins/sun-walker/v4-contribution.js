(function attachSunWalkerV4(root, factory) {
  const builder = typeof module === 'object' && module.exports
    ? require('../../core/simulation/plugin-v4-builder.js')
    : root.SimulattePluginV4Builder;
  const shadowGeometry = typeof module === 'object' && module.exports
    ? require('./shadow-geometry.js')
    : root.SimulatteSunWalkerShadowGeometry;
  const exposureSummary = typeof module === 'object' && module.exports
    ? require('./exposure-summary.js')
    : root.SimulatteSunWalkerExposureSummary;
  const api = factory(builder, shadowGeometry, exposureSummary);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteSunWalkerV4 = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createSunWalkerV4(builder, shadowGeometry, exposureSummaryApi) {
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
    const latestCompletedSample = samples.at(-1) || null;
    const activeSample = latestCompletedSample || selected.samples[0];
    const exposureStatus = exposureSummaryApi.summarize(snapshot.state, latestCompletedSample);
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
      ...walkedSegmentLayers(samples, claim),
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
        role: 'primary',
        importance: 0.7,
        aggregationKey: shadow.id,
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
      ...[activeSample].filter(Boolean).map((sample) => builder.layer({
        id: 'sun-walker-actor',
        kind: 'actor',
        label: `Walker · ${exposureStatus.current.label} · ${sample.timestamp} UTC`,
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
    const navigationMode = walkerNavigationMode(step, isSettled);
    const isOverview = navigationMode === 'overview';
    const followReasonEvent = events[1] || activeEvent;
    const presentation = builder.presentation({
      pluginId: PLUGIN_ID,
      coordinateSystem: 'city-node-segment-id',
      epoch: simulation.departureAt,
      layers,
      sun: activeSample?.solarPosition ? {
        id: 'modeled-sun',
        label: `Modeled sun at ${Math.round(activeSample.solarPosition.elevationDegrees)}° elevation`,
        azimuthDegrees: activeSample.solarPosition.azimuthDegrees,
        elevationDegrees: activeSample.solarPosition.elevationDegrees,
        anchorSegmentIds: selected.route.segmentIds.slice(0, 1),
        distanceM: 900,
        radiusM: 18,
        intensity: 1.1,
      } : null,
      viewIntents: [builder.viewIntent({
        id: isSettled ? 'sun-route-summary' : isOverview ? 'sun-route-overview' : 'sun-walker-navigation',
        mode: navigationMode,
        targetIds: isSettled
          ? settledTargetIds
          : isOverview
            ? ['shade-selected-route']
            : ['sun-walker-actor'],
        reasonEventId: isSettled || isOverview
          ? activeEvent?.id || null
          : followReasonEvent?.id || null,
        priority: isSettled ? 65 : isOverview ? 50 : 55,
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
        builder.quantity('night', snapshot.state.nightSeconds, 'seconds'),
        builder.quantity('direct-sun-share', exposureStatus.percentages.direct / 100, 'ratio', [0, 1]),
        builder.quantity('shade-share', exposureStatus.percentages.shade / 100, 'ratio', [0, 1]),
        builder.quantity('geometric-direct-sun-share', exposureStatus.geometricPercentages.direct / 100, 'ratio', [0, 1]),
        builder.quantity('geometric-shade-share', exposureStatus.geometricPercentages.shade / 100, 'ratio', [0, 1]),
        builder.quantity('adjusted-direct-beam-share', exposureStatus.adjustedDirectBeamPercent / 100, 'ratio', [0, 1]),
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
          field('current-status', 'Current exposure', exposureStatus.current.label, null, claim),
          field('current-geometric-status', 'Current geometric sun', exposureStatus.current.geometricLabel, null, claim),
          field('current-adjusted-beam', 'Current adjusted direct beam', exposureStatus.current.adjustedDirectBeamPercent / 100, 'ratio', claim),
          field('exposure-split', 'Walked exposure', exposureStatus.split, null, claim),
          field('geometric-split', 'Walked geometric sun', exposureStatus.geometricSplit, null, claim),
          field('shade-share', 'Exposure shade percent', exposureStatus.percentages.shade / 100, 'ratio', claim),
          field('direct-sun-share', 'Exposure sun percent', exposureStatus.percentages.direct / 100, 'ratio', claim),
          field('geometric-shade-share', 'Geometric shade percent', exposureStatus.geometricPercentages.shade / 100, 'ratio', claim),
          field('geometric-direct-sun-share', 'Geometric direct sun percent', exposureStatus.geometricPercentages.direct / 100, 'ratio', claim),
          field('direct-sun', 'Direct sun so far', snapshot.state.directSunSeconds, 'seconds', claim),
          field('direct-beam-equivalent', 'Weather/canopy-adjusted direct beam so far', snapshot.state.directBeamEquivalentSeconds, 'seconds', claim),
          field('adjusted-direct-beam-share', 'Weather/canopy-adjusted direct beam average', exposureStatus.adjustedDirectBeamPercent / 100, 'ratio', claim),
          field('modeled-shade', 'Modeled shade so far', snapshot.state.shadeSeconds, 'seconds', claim),
          field('building-shade', 'Building shade so far', snapshot.state.buildingShadeSeconds, 'seconds', claim),
          field('canopy-shade', 'Canopy shade so far', snapshot.state.canopyShadeSeconds, 'seconds', claim),
          field('unknown', 'Unknown exposure so far', snapshot.state.unknownSeconds, 'seconds', claim),
          field('night', 'Night exposure so far', snapshot.state.nightSeconds, 'seconds', claim),
          field('shadow-display', 'Shadow display', exposureStatus.shadowDisplay, null, claim),
          field('shadow-calculation', 'Calculation', exposureStatus.shadowCalculation, null, claim),
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

  function walkedSegmentLayers(samples, provenance) {
    const bySegmentId = new Map();
    samples.forEach((sample) => {
      const row = bySegmentId.get(sample.segmentId) || {
        segmentId: sample.segmentId,
        representedSeconds: 0,
        activeSample: sample,
      };
      row.representedSeconds += sample.representedSeconds;
      row.activeSample = sample;
      bySegmentId.set(sample.segmentId, row);
    });
    return [...bySegmentId.values()].map((row) => builder.layer({
      id: `sun-walked-segment-${row.segmentId}`,
      kind: 'path',
      label: `${exposureLabel(row.activeSample.state)} · ${Math.round(row.representedSeconds)} s sampled`,
      geometry: builder.geometry('segments', 'city-segment-id', [row.segmentId]),
      quantity: builder.quantity(
        `exposure.${row.activeSample.state}`,
        row.representedSeconds,
        'seconds',
        [0, Math.max(1, row.representedSeconds)],
      ),
      role: row.activeSample.state === 'direct' ? 'event' : row.activeSample.state === 'unknown' ? 'uncertainty' : 'primary',
      importance: 0.9,
      aggregationKey: null,
      provenance,
    }));
  }

  function exposureLabel(state) {
    return {
      direct: 'Direct sun',
      shade: 'Modeled shade',
      unknown: 'Unknown exposure',
      night: 'Night',
    }[state] || state;
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

  function walkerNavigationMode(step, settled = false) {
    return settled || step === 0 ? 'overview' : 'follow';
  }

  return Object.freeze({ createContribution, walkedSegmentLayers, walkerNavigationMode });
});
