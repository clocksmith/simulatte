function modeledFootprint(point, footprintAreaSquareFeet) {
  const sideM = Math.max(
    12,
    Math.min(70, Math.sqrt(squareFeetToSquareMeters(Math.max(900, footprintAreaSquareFeet))))
  );
  const latDelta = sideM / 111320;
  const lonDelta = sideM / (111320 * Math.cos(point[1] * Math.PI / 180));
  return [
    [point[0] - lonDelta, point[1] - latDelta],
    [point[0] + lonDelta, point[1] - latDelta],
    [point[0] + lonDelta, point[1] + latDelta],
    [point[0] - lonDelta, point[1] + latDelta],
    [point[0] - lonDelta, point[1] - latDelta],
  ].map((coordinate) => coordinate.map((value) => rounded(value, 7)));
}

function polygonRings(geometry) {
  if (geometry?.type === 'Polygon') return geometry.coordinates.slice(0, 1);
  if (geometry?.type === 'MultiPolygon') return geometry.coordinates.map((polygon) => polygon[0]);
  return [];
}

function polygonSurfaces(geometry) {
  if (geometry?.type === 'Polygon') {
    return [{ outer: geometry.coordinates[0], holes: geometry.coordinates.slice(1) }];
  }
  if (geometry?.type === 'MultiPolygon') {
    return geometry.coordinates.map((polygon) => ({
      outer: polygon[0],
      holes: polygon.slice(1),
    }));
  }
  return [];
}

function largestRing(rings) {
  return rings.slice().sort((left, right) => Math.abs(ringArea(right)) - Math.abs(ringArea(left)))[0] || [];
}

function ringArea(ring) {
  let area = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    area += ring[index][0] * ring[index + 1][1] - ring[index + 1][0] * ring[index][1];
  }
  return area / 2;
}

function simplifyClosedRing(ring, tolerance, maximumPoints) {
  if (!Array.isArray(ring) || ring.length < 4) return [];
  const open = samePoint(ring[0], ring.at(-1)) ? ring.slice(0, -1) : [...ring];
  let simplified = simplifyLine(open, tolerance);
  if (simplified.length > maximumPoints - 1) {
    const stride = Math.ceil(simplified.length / (maximumPoints - 1));
    simplified = simplified.filter((_point, index) => index % stride === 0);
  }
  if (simplified.length < 3) simplified = open.slice(0, 3);
  return [...simplified, simplified[0]].map((point) => [
    rounded(point[0], 7),
    rounded(point[1], 7),
  ]);
}

function simplifyLine(points, tolerance) {
  if (points.length <= 2) return [...points];
  let maximumDistance = 0;
  let splitIndex = 0;
  for (let index = 1; index < points.length - 1; index += 1) {
    const distance = segmentDistance(points[index], points[0], points.at(-1));
    if (distance > maximumDistance) {
      maximumDistance = distance;
      splitIndex = index;
    }
  }
  if (maximumDistance <= tolerance) return [points[0], points.at(-1)];
  return [
    ...simplifyLine(points.slice(0, splitIndex + 1), tolerance).slice(0, -1),
    ...simplifyLine(points.slice(splitIndex), tolerance),
  ];
}

function segmentDistance(point, start, end) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  if (!dx && !dy) return Math.hypot(point[0] - start[0], point[1] - start[1]);
  const ratio = Math.max(0, Math.min(1, (
    (point[0] - start[0]) * dx + (point[1] - start[1]) * dy
  ) / (dx * dx + dy * dy)));
  return Math.hypot(
    point[0] - (start[0] + ratio * dx),
    point[1] - (start[1] + ratio * dy)
  );
}

function boundsFor(points) {
  return points.reduce((bounds, point) => ({
    west: Math.min(bounds.west, point[0]),
    south: Math.min(bounds.south, point[1]),
    east: Math.max(bounds.east, point[0]),
    north: Math.max(bounds.north, point[1]),
  }), { west: Infinity, south: Infinity, east: -Infinity, north: -Infinity });
}

function centroidFor(points) {
  if (!points.length) return [0, 0];
  const total = points.reduce((sum, point) => [sum[0] + point[0], sum[1] + point[1]], [0, 0]);
  return [rounded(total[0] / points.length, 7), rounded(total[1] / points.length, 7)];
}

function pointInRing(point, ring) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const [x, y] = ring[index];
    const [previousX, previousY] = ring[previous];
    if ((y > point[1]) !== (previousY > point[1])
      && point[0] < ((previousX - x) * (point[1] - y)) / (previousY - y) + x) {
      inside = !inside;
    }
  }
  return inside;
}

function pointInSurface(point, surface) {
  return pointInRing(point, surface.outer)
    && !surface.holes.some((ring) => pointInRing(point, ring));
}

function withinBounds(point, bounds) {
  return point[0] >= bounds.west && point[0] <= bounds.east
    && point[1] >= bounds.south && point[1] <= bounds.north;
}

function validPoint(point) {
  return Array.isArray(point) && point.length >= 2
    && Number.isFinite(point[0]) && Number.isFinite(point[1])
    && point[0] >= -75 && point[0] <= -73
    && point[1] >= 40 && point[1] <= 41.5;
}

function squareFeetToSquareMeters(value) {
  return value * 0.092903;
}

function rounded(value, places) {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}

function samePoint(left, right) {
  return left?.[0] === right?.[0] && left?.[1] === right?.[1];
}

export {
  boundsFor,
  centroidFor,
  largestRing,
  modeledFootprint,
  pointInSurface,
  polygonRings,
  polygonSurfaces,
  simplifyClosedRing,
  validPoint,
  withinBounds,
};
