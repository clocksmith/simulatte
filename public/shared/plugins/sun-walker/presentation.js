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
            quantity('shadeSeconds', selected.metrics.shadeSeconds, 'seconds'),
            quantity('unknownSeconds', selected.metrics.unknownSeconds, 'seconds'),
            quantity('modeledBuildingShadePercent', selected.metrics.modeledBuildingShadePercent, 'percent'),
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
          entities: transitions.filter((row) => row.occluderId).map(sampleEntity),
          evidenceRefs: [...new Set(visibleSamples.flatMap((row) => row.evidenceRefs))],
          truth: selected.truth,
          representationHint: 'only shadows causally linked to sampled route exposure',
        },
      ],
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
      priority: 40,
      expiresAfterEventId: null,
      preservesManualOverride: true,
    }];
    if (snapshot.state.status === 'running') {
      rows.push({
        schema: 'simulatte.viewIntent.v4',
        id: `sun-follow-${snapshot.step}`,
        mode: 'follow',
        targets: [{ entityId: snapshot.state.currentSegmentId }],
        transitionReason: 'walker advanced to the next exposure sample',
        triggerEventId: snapshot.eventId,
        priority: 30,
        expiresAfterEventId: simulation.timeline.events[snapshot.step + 1]?.id || null,
        preservesManualOverride: true,
      });
      const transition = transitions.at(-1);
      if (transition && transition.sampleIndex === snapshot.state.completedSamples - 1) {
        rows.push({
          schema: 'simulatte.viewIntent.v4',
          id: `sun-pov-transition-${snapshot.step}`,
          mode: 'pov',
          targets: [{ entityId: transition.segmentId, point: transition.point }],
          transitionReason: `exposure changed to ${transition.state}`,
          triggerEventId: snapshot.eventId,
          priority: 50,
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
    rows.push({
      schema: 'simulatte.viewIntent.v4',
      id: 'sun-free-camera',
      mode: 'free',
      targets: [],
      transitionReason: 'user-selected unrestricted inspection',
      triggerEventId: null,
      priority: 100,
      expiresAfterEventId: null,
      preservesManualOverride: true,
    });
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
      quantities: [quantity('representedSeconds', sample.representedSeconds, 'seconds')],
      evidenceRefs: sample.evidenceRefs,
      truth: sample.truth,
    };
  }

  function quantity(id, value, units) {
    return { id, value, units };
  }

  return Object.freeze({ semanticPresentation });
});
