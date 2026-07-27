(function attachSunWalkerShadowGeometry(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteSunWalkerShadowGeometry = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createSunWalkerShadowGeometry() {
  const MAX_EVIDENCE_SHADOWS = 64;

  function projectedEvidenceShadows(world, occluderIds, solarPosition) {
    if (!solarPosition || solarPosition.elevationDegrees <= 2 || !occluderIds.length) return [];
    const buildingsById = new Map((world.renderGeometry?.buildings || []).map((row) => [row.id, row]));
    const azimuth = solarPosition.azimuthDegrees * Math.PI / 180;
    const elevation = solarPosition.elevationDegrees * Math.PI / 180;
    return [...new Set(occluderIds)].slice(-MAX_EVIDENCE_SHADOWS).flatMap((buildingId) => {
      const building = buildingsById.get(buildingId);
      if (!building || !Number.isFinite(building.heightM) || building.heightM <= 0) return [];
      const lengthM = Math.min(400, building.heightM / Math.tan(elevation));
      const delta = { x: -Math.sin(azimuth) * lengthM, y: -Math.cos(azimuth) * lengthM };
      const footprint = openRing(building.footprint);
      return [{
        id: `shadow-${building.id}`,
        sourceBuildingId: building.id,
        label: `${building.id} causal modeled shadow`,
        tone: 'shade',
        points: convexHull([
          ...footprint,
          ...footprint.map((point) => ({ x: point.x + delta.x, y: point.y + delta.y })),
        ]),
        lengthM,
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

  return Object.freeze({ MAX_EVIDENCE_SHADOWS, projectedEvidenceShadows });
});
