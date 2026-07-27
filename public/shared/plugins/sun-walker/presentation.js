(function attachSunWalkerPresentation(root, factory) {
  const truth = typeof module === 'object' && module.exports
    ? require('./truth.js')
    : root.SimulatteSunWalkerTruth;
  const api = factory(truth);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteSunWalkerPresentation = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createSunWalkerPresentation(truthApi) {
  function semanticPresentation(simulation, step = 0) {
    const snapshot = simulation.timeline.snapshots[Math.min(step, simulation.timeline.snapshots.length - 1)];
    const selected = simulation.candidates.find((row) => row.id === simulation.selectedCandidateId);
    const fastest = simulation.candidates.find((row) => row.id === simulation.fastestCandidateId);
    const visibleSamples = selected.samples.slice(0, snapshot.state.completedSamples);
    const transitions = exposureTransitions(visibleSamples);
    return truthApi.deepFreeze({
      schema: 'simulatte.presentationLayerSet.v4',
      id: `sun-presentation-${simulation.id}-step-${snapshot.step}`,
      simulationId: simulation.id,
      eventId: snapshot.eventId,
      layers: [
        {
          schema: 'simulatte.presentationLayer.v4',
          id: 'shade-selected-route',
          semanticLayerType: 'route.exposure',
          coordinateSystem: 'world-local-meters',
          temporalVisibility: { fromEventId: simulation.timeline.events[0].id, untilEventId: null },
          quantities: [
            quantity('directSunSeconds', selected.metrics.directSunSeconds, 'seconds'),
            quantity('directBeamEquivalentSeconds', selected.metrics.directBeamEquivalentSeconds, 'seconds'),
            quantity('shadeSeconds', selected.metrics.shadeSeconds, 'seconds'),
            quantity('unknownSeconds', selected.metrics.unknownSeconds, 'seconds'),
            quantity('modeledBuildingShadePercent', selected.metrics.modeledBuildingShadePercent, 'percent'),
            quantity('modeledCanopyShadePercent', selected.metrics.modeledCanopyShadePercent, 'percent'),
            quantity('modeledShadePercent', selected.metrics.modeledShadePercent, 'percent'),
          ],
          entities: selected.segments.map(segmentEntity),
          evidenceRefs: [simulation.dataReceipt.id, simulation.modelReceipt.id],
          truth: selected.truth,
          representationHint: 'thin route with exposure encoded along segments',
        },
        {
          schema: 'simulatte.presentationLayer.v4',
          id: 'fastest-route-baseline',
          semanticLayerType: 'route.comparison-baseline',
          coordinateSystem: 'world-local-meters',
          temporalVisibility: { fromEventId: simulation.timeline.events[0].id, untilEventId: null },
          quantities: [
            quantity('directSunSeconds', fastest.metrics.directSunSeconds, 'seconds'),
            quantity('travelSeconds', fastest.metrics.travelSeconds, 'seconds'),
          ],
          entities: fastest.segments.map(segmentEntity),
          evidenceRefs: [simulation.comparison.id],
          truth: fastest.truth,
          representationHint: 'restrained comparison route',
        },
        {
          schema: 'simulatte.presentationLayer.v4',
          id: 'walk-exposure-progress',
          semanticLayerType: 'exposure.sample-progress',
          coordinateSystem: 'world-local-meters',
          temporalVisibility: { fromEventId: simulation.timeline.events[0].id, untilEventId: null },
          quantities: [
            quantity('progress', snapshot.state.progress, 'ratio'),
            quantity('directSunSeconds', snapshot.state.directSunSeconds, 'seconds'),
            quantity('directBeamEquivalentSeconds', snapshot.state.directBeamEquivalentSeconds, 'seconds'),
            quantity('shadeSeconds', snapshot.state.shadeSeconds, 'seconds'),
          ],
          entities: visibleSamples.map(sampleEntity),
          evidenceRefs: [snapshot.eventId],
          truth: snapshot.truth,
          representationHint: 'view-dependent exposure samples with transitions emphasized',
        },
        {
          schema: 'simulatte.presentationLayer.v4',
          id: 'causal-shadow-evidence',
          semanticLayerType: 'building.shadow-evidence',
          coordinateSystem: 'world-local-meters',
          temporalVisibility: { fromEventId: simulation.timeline.events[0].id, untilEventId: null },
          quantities: [quantity('occludingBuildingCount', new Set(visibleSamples.map((row) => row.occluderId).filter(Boolean)).size, 'count')],
          entities: transitions.filter((row) => row.occluderKind === 'building').map(sampleEntity),
          evidenceRefs: [...new Set(visibleSamples
            .filter((row) => row.occluderKind === 'building')
            .flatMap((row) => row.evidenceRefs))],
          truth: selected.truth,
          representationHint: 'only shadows causally linked to sampled route exposure',
        },
        {
          schema: 'simulatte.presentationLayer.v4',
          id: 'causal-canopy-evidence',
          semanticLayerType: 'tree.canopy-evidence',
          coordinateSystem: 'world-local-meters',
          temporalVisibility: { fromEventId: simulation.timeline.events[0].id, untilEventId: null },
          quantities: [quantity('occludingTreeCount', new Set(visibleSamples
            .filter((row) => row.occluderKind === 'tree-canopy')
            .map((row) => row.occluderId)).size, 'count')],
          entities: transitions.filter((row) => row.occluderKind === 'tree-canopy').map(sampleEntity),
          evidenceRefs: [...new Set([
            simulation.dataReceipt.id,
            ...visibleSamples
            .filter((row) => row.occluderKind === 'tree-canopy')
            .flatMap((row) => row.evidenceRefs),
          ])],
          truth: selected.truth,
          representationHint: 'bounded canopy envelopes only where they causally attenuate a route sample',
        },
        {
          schema: 'simulatte.presentationLayer.v4',
          id: 'weather-analog-evidence',
          semanticLayerType: 'weather.historical-analog',
          coordinateSystem: 'world-local-meters',
          temporalVisibility: { fromEventId: simulation.timeline.events[0].id, untilEventId: null },
          quantities: [
            quantity('meanDirectBeamFactor', average(visibleSamples.map((row) => row.environment.directBeamFactor)), 'ratio'),
          ],
          entities: uniqueWeatherEntities(visibleSamples),
          evidenceRefs: [...new Set(visibleSamples.flatMap((row) => row.environment.evidenceRefs))],
          truth: selected.truth,
          representationHint: 'station-observation evidence for the historical weather analog, not a live weather field',
        },
      ].filter((layer) => layer.evidenceRefs.length > 0),
      viewIntents: viewIntents(simulation, snapshot, transitions),
      controls: simulation.controls,
      comparisons: simulation.comparisons,
      pickModel: {
        entityInspectFields: ['truth', 'quantities', 'evidenceRefs', 'timestamp', 'state', 'reason'],
        comparisonId: simulation.comparison.id,
      },
    });
  }

  function viewIntents(simulation, snapshot, transitions) {
    const selected = simulation.candidates.find((row) => row.id === simulation.selectedCandidateId);
    const rows = [{
      schema: 'simulatte.viewIntent.v4',
      id: 'sun-overview',
      mode: 'overview',
      targets: [{ entityId: selected.id, segmentIds: selected.route.segmentIds }],
      transitionReason: 'route alternatives and modeled exposure are ready',
      triggerEventId: simulation.timeline.events[0].id,
      priority: 20,
      expiresAfterEventId: null,
      preservesManualOverride: true,
    }];
    if (snapshot.state.status === 'running') {
      rows.push({
        schema: 'simulatte.viewIntent.v4',
        id: `sun-follow-${snapshot.step}`,
        mode: 'follow',
        targets: [{ entityId: 'sun-walker-actor' }],
        transitionReason: 'walker advanced to the next exposure sample',
        triggerEventId: snapshot.eventId,
        priority: 55,
        expiresAfterEventId: simulation.timeline.events[snapshot.step + 1]?.id || null,
        preservesManualOverride: true,
      });
      const transition = transitions.at(-1);
      if (transition && transition.sampleIndex === snapshot.state.completedSamples - 1) {
        rows.push({
          schema: 'simulatte.viewIntent.v4',
          id: `sun-pov-transition-${snapshot.step}`,
          mode: 'pov',
          targets: [{ entityId: 'sun-walker-actor', point: transition.point }],
          transitionReason: `exposure changed to ${transition.state}`,
          triggerEventId: snapshot.eventId,
          priority: 65,
          expiresAfterEventId: simulation.timeline.events[snapshot.step + 1]?.id || null,
          preservesManualOverride: true,
        });
      }
    }
    if (snapshot.state.status === 'settled') {
      rows.push({
        schema: 'simulatte.viewIntent.v4',
        id: 'sun-comparison-summary',
        mode: 'compare',
        targets: simulation.comparisons[0]
          ? [
              { entityId: simulation.comparisons[0].baseline.candidateId },
              { entityId: simulation.comparisons[0].intervention.candidateId },
            ]
          : [],
        transitionReason: 'walk completed and baseline comparison settled',
        triggerEventId: snapshot.eventId,
        priority: 60,
        expiresAfterEventId: null,
        preservesManualOverride: true,
      });
    }
    return rows;
  }

  function exposureTransitions(samples) {
    return samples.filter((sample, index) => index === 0 || sample.state !== samples[index - 1].state);
  }

  function segmentEntity(segment) {
    return {
      id: segment.segmentId,
      segmentIds: [segment.segmentId],
      quantities: [
        quantity('directSunSeconds', segment.directSunSeconds, 'seconds'),
        quantity('shadeSeconds', segment.shadeSeconds, 'seconds'),
        quantity('unknownSeconds', segment.unknownSeconds, 'seconds'),
      ],
      evidenceRefs: segment.evidenceRefs,
      truth: segment.truth,
    };
  }

  function sampleEntity(sample) {
    return {
      id: sample.id,
      segmentIds: [sample.segmentId],
      point: sample.point,
      timestamp: sample.timestamp,
      state: sample.state,
      reason: sample.reason,
      occluderId: sample.occluderId,
      occluderKind: sample.occluderKind,
      quantities: [
        quantity('representedSeconds', sample.representedSeconds, 'seconds'),
        quantity('directBeamFactor', sample.directBeamFactor, 'ratio'),
        quantity('directBeamEquivalentSeconds', sample.directBeamEquivalentSeconds, 'seconds'),
      ],
      evidenceRefs: sample.evidenceRefs,
      truth: sample.truth,
    };
  }

  function quantity(id, value, units) {
    return { id, value, units };
  }

  function uniqueWeatherEntities(samples) {
    const rows = new Map();
    samples.forEach((sample) => {
      const weather = sample.environment.weather;
      if (!weather.sourceRowId || rows.has(weather.sourceRowId)) return;
      rows.set(weather.sourceRowId, {
        id: weather.observationId,
        timestamp: weather.observedAt,
        analogFor: weather.analogFor,
        skyCode: weather.skyCode,
        quantities: [
          quantity('airTemperatureC', weather.airTemperatureC, 'celsius'),
          quantity('directBeamFactor', weather.directBeamFactor, 'ratio'),
        ],
        evidenceRefs: [`weather:${weather.sourceRowId}`],
        truth: {
          origin: 'observed',
          temporalStatus: 'historical',
          uncertainty: { kind: 'missing', value: { streetScaleIrradiance: true } },
        },
      });
    });
    return [...rows.values()];
  }

  function average(values) {
    if (!values.length) return null;
    return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(6));
  }

  return Object.freeze({ semanticPresentation });
});
