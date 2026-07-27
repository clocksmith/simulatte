(function attachSunWalkerCompatibility(root, factory) {
  const shadows = typeof module === 'object' && module.exports
    ? require('./shadow-geometry.js')
    : root.SimulatteSunWalkerShadowGeometry;
  const api = factory(shadows);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteSunWalkerCompatibility = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createSunWalkerCompatibility(shadowGeometry) {
  function legacyPresentation({ simulation, step, world }) {
    const snapshot = simulation.timeline.snapshots[Math.min(step, simulation.timeline.snapshots.length - 1)];
    const selected = simulation.candidates.find((row) => row.id === simulation.selectedCandidateId);
    const fastest = simulation.candidates.find((row) => row.id === simulation.fastestCandidateId);
    const completed = selected.samples.slice(0, snapshot.state.completedSamples);
    const latest = completed.at(-1) || selected.samples[0];
    const paths = [{
      id: 'shade-route',
      label: `Shade-selected: ${Math.round(selected.metrics.modeledBuildingShadePercent)}% modeled building shade`,
      segmentIds: selected.route.segmentIds,
      tone: 'green',
      widthM: 3,
      intensity: 1,
    }];
    if (fastest.id !== selected.id) {
      paths.unshift({
        id: 'fastest-route',
        label: `Fastest: ${Math.round(fastest.metrics.modeledBuildingShadePercent)}% modeled building shade`,
        segmentIds: fastest.route.segmentIds,
        tone: 'amber',
        widthM: 1.5,
        intensity: 0.65,
      });
    }
    const occluderIds = completed.map((row) => row.occluderId).filter(Boolean);
    const areas = shadowGeometry.projectedEvidenceShadows(world, occluderIds, latest?.solarPosition)
      .map(({ sourceBuildingId: _sourceBuildingId, lengthM: _lengthM, ...area }) => area);
    return {
      schema: 'simulatte.pluginPresentation.v2',
      markers: [],
      paths,
      actors: latest ? [{
        id: 'sun-walker-actor',
        label: `Walker · ${latest.state} · ${latest.timestamp}`,
        kind: 'pedestrian',
        segmentIds: [latest.segmentId],
        tone: latest.state === 'direct' ? 'amber' : latest.state === 'unknown' ? 'gray' : 'green',
        speedMps: 0.1,
        phaseOffsetM: 0,
        isSelected: true,
      }] : [],
      areas,
      sun: latest ? {
        id: 'modeled-sun',
        label: `Modeled clear-sky sun at ${Math.round(latest.solarPosition.elevationDegrees)}° elevation`,
        azimuthDegrees: latest.solarPosition.azimuthDegrees,
        elevationDegrees: latest.solarPosition.elevationDegrees,
        anchorSegmentIds: [latest.segmentId],
        distanceM: 260,
        radiusM: 12,
        intensity: 1.2,
      } : null,
      cameraTargets: [
        {
          id: 'shade-route',
          label: 'Shade-selected route',
          nodeIds: [],
          segmentIds: selected.route.segmentIds,
          distanceM: 740,
        },
        {
          id: 'shade-compare',
          label: 'Fastest and shade-selected routes',
          nodeIds: [],
          segmentIds: [...new Set([...selected.route.segmentIds, ...fastest.route.segmentIds])],
          distanceM: 900,
        },
      ],
    };
  }

  return Object.freeze({ legacyPresentation });
});
