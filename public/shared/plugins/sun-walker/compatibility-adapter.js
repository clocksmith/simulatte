(function attachSunWalkerCompatibility(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteSunWalkerCompatibility = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createSunWalkerCompatibility() {
  const MAX_EVIDENCE_SHADOWS = 64;

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
    const occluderIds = [...new Set(completed.map((row) => row.occluderId).filter(Boolean))].slice(-MAX_EVIDENCE_SHADOWS);
    const areas = projectedEvidenceShadows(world, occluderIds, latest?.solarPosition);
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

  function projectedEvidenceShadows(world, occluderIds, solarPosition) {
    if (!solarPosition || solarPosition.elevationDegrees <= 2 || !occluderIds.length) return [];
    const buildingsById = new Map((world.renderGeometry?.buildings || []).map((row) => [row.id, row]));
    const azimuth = solarPosition.azimuthDegrees * Math.PI / 180;
    const elevation = solarPosition.elevationDegrees * Math.PI / 180;
    return occluderIds.flatMap((buildingId) => {
      const building = buildingsById.get(buildingId);
      if (!building || !Number.isFinite(building.heightM) || building.heightM <= 0) return [];
      const lengthM = Math.min(400, building.heightM / Math.tan(elevation));
      const delta = { x: -Math.sin(azimuth) * lengthM, y: -Math.cos(azimuth) * lengthM };
      const footprint = openRing(building.footprint);
      return [{
        id: `shadow-${building.id}`,
        label: `${building.id} causal modeled shadow`,
        points: convexHull([...footprint, ...footprint.map((point) => ({ x: point.x + delta.x, y: point.y + delta.y }))]),
        tone: 'shade',
        heightM: 0.35,
        intensity: 0.12,
      }];
    });
  }

  function convexHull(points) {
    const sorted = [...points].sort((left, right) => left.x - right.x || left.y - right.y);
    const turn = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    const half = (rows) => rows.reduce((hull, point) => {
      while (hull.length >= 2 && turn(hull.at(-2), hull.at(-1), point) <= 0) hull.pop();
      hull.push(point);
      return hull;
    }, []);
    return [...half(sorted).slice(0, -1), ...half(sorted.reverse()).slice(0, -1)];
  }

  function openRing(points) {
    return points.length > 1 && points[0].x === points.at(-1).x && points[0].y === points.at(-1).y
      ? points.slice(0, -1)
      : [...points];
  }

  return Object.freeze({ legacyPresentation });
});
