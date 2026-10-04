(function attachSunWalkerShadowGeometry(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteSunWalkerShadowGeometry = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createSunWalkerShadowGeometry() {
  const MAX_EVIDENCE_SHADOWS = 64;

  function projectedEvidenceShadows(world, occluderIds, solarPosition) {
    if (!solarPosition || solarPosition.elevationDegrees < 2 || !occluderIds.length) return [];
    const buildingsById = new Map((world.renderGeometry?.buildings || []).map((row) => [row.id, row]));
    const azimuth = solarPosition.azimuthDegrees * Math.PI / 180;
    const elevation = solarPosition.elevationDegrees * Math.PI / 180;
    return [...new Set(occluderIds)].slice(-MAX_EVIDENCE_SHADOWS).flatMap((buildingId) => {
      const building = buildingsById.get(buildingId);
      if (!building || !Number.isFinite(building.heightM) || building.heightM <= 0) return [];
      const lengthM = building.heightM / Math.tan(elevation);
      const delta = { x: -Math.sin(azimuth) * lengthM, y: -Math.cos(azimuth) * lengthM };
      return footprintSlabs(building).map((footprint, index) => ({
        id: `shadow-${building.id}-${index}`,
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
      }));
    });
  }

  // Sweep convex pieces of the actual footprint. A hull of the entire building
  // incorrectly fills concave recesses and courtyard holes with shade.
  function footprintSlabs(building) {
    const rings = [building.footprint, ...(building.interiorRings || [])].map(openRing);
    const edges = rings.flatMap(ring => ring.map((point, i) => [point, ring[(i + 1) % ring.length]]));
    const levels = [...new Set(rings.flat().map(point => point.y))].sort((a, b) => a - b);
    const xAt = ([a, b], y) => a.x + (y - a.y) * (b.x - a.x) / (b.y - a.y);
    const pieces = [];
    for (let i = 1; i < levels.length; i++) {
      const bottom = levels[i - 1], top = levels[i], middle = (bottom + top) / 2;
      const crossings = edges.filter(([a, b]) => Math.min(a.y, b.y) < middle && Math.max(a.y, b.y) > middle)
        .sort((a, b) => xAt(a, middle) - xAt(b, middle));
      for (let j = 0; j < crossings.length; j += 2) {
        const left = crossings[j], right = crossings[j + 1];
        pieces.push([{x:xAt(left,bottom),y:bottom},{x:xAt(right,bottom),y:bottom},
          {x:xAt(right,top),y:top},{x:xAt(left,top),y:top}]);
      }
    }
    return pieces;
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
