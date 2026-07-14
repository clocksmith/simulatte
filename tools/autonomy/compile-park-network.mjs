import crypto from 'node:crypto';

function compileParkNetwork(collection, { project, sourceContract, snapshotDate }) {
  const matches = (collection.features || []).filter((row) => row.properties?.gispropnum === 'M089');
  if (matches.length !== 1) throw new Error(`Union Square park compilation expected one M089 feature, received ${matches.length}`);
  const feature = matches[0];
  if (feature.geometry?.type !== 'MultiPolygon' || !feature.geometry.coordinates.length) {
    throw new Error(`Union Square park expected a non-empty MultiPolygon, received ${feature.geometry?.type || 'missing'}`);
  }
  const members = feature.geometry.coordinates.map((polygon, index) => {
    const rawRing = polygon[0];
    const rows = cleanCoordinatePairs(rawRing, project);
    return { index, rawRing, rows, areaM2: Math.abs(polygonArea(rows.map((row) => row.position))) };
  }).sort((left, right) => right.areaM2 - left.areaM2 || left.index - right.index);
  const selected = members[0];
  const sourceGeometryHash = sha256(Buffer.from(JSON.stringify(feature.geometry)));
  let rows = selected.rows;
  if (rows.length > 1 && distance(rows[0].position, rows.at(-1).position) < 0.001) rows = rows.slice(0, -1);
  if (rows.length < 4) throw new Error(`Union Square park boundary expected at least four distinct points, received ${rows.length}`);
  const closedPositions = [...rows.map((row) => row.position), { ...rows[0].position }];
  if (polygonArea(closedPositions) > 0) rows.reverse();
  const source = {
    datasetId: sourceContract.id,
    sourceRevision: snapshotDate,
    propertyId: String(feature.properties.gispropnum),
    boundaryKind: 'nyc_parks_property_boundary',
    surfaceClaim: 'park_property_boundary_not_surveyed_sidewalk',
    geometryWgs84Sha256: sourceGeometryHash,
    selectedRingWgs84Sha256: sha256(Buffer.from(JSON.stringify(selected.rawRing))),
    memberCount: feature.geometry.coordinates.length,
    selectedMemberIndex: selected.index,
    selectionMethod: 'largest_projected_exterior_ring_area_v1',
    claimBoundary: 'The circuit follows the largest exterior member of the frozen NYC Parks property geometry. It does not claim a surveyed sidewalk centerline, current access condition, or obstacle-free physical route.',
  };
  const nodes = rows.map((row, index) => ({
    id: `ped-node-${shortHash(`${source.datasetId}:${source.sourceRevision}:${source.propertyId}:${row.wgs84.longitude.toFixed(7)},${row.wgs84.latitude.toFixed(7)}`, 12)}`,
    label: index === 0 ? 'Union Square Park perimeter start' : `Union Square Park perimeter ${String(index + 1).padStart(2, '0')}`,
    kind: 'pedestrian_waypoint',
    position: { ...row.position },
    positionWgs84: { ...row.wgs84 },
  }));
  const segments = nodes.map((node, index) => {
    const next = nodes[(index + 1) % nodes.length];
    const fromWgs84 = rows[index].wgs84;
    const toWgs84 = rows[(index + 1) % rows.length].wgs84;
    return {
      id: `ped-${shortHash(`${source.propertyId}:${node.id}:${next.id}`, 12)}-cw`,
      fromNodeId: node.id,
      toNodeId: next.id,
      geometry: [{ ...node.position }, { ...next.position }],
      lengthM: round(distance(node.position, next.position)),
      laneType: 'pedestrian',
      allowedModes: ['pedestrian'],
      speedLimitMps: 4.5,
      riskScore: 0.02,
      cardIds: ['street.pedestrian-perimeter'],
      source: {
        datasetId: source.datasetId,
        propertyId: source.propertyId,
        street: 'Union Square Park perimeter',
        direction: 'clockwise',
        sourceRevision: source.sourceRevision,
        geometryWgs84Sha256: sha256(Buffer.from(JSON.stringify([fromWgs84, toWgs84]))),
      },
    };
  });
  const circuit = {
    id: 'union-square-park-perimeter-v1',
    label: 'Union Square Park',
    aliases: ['Union Square', 'Union Square Park'],
    mode: 'pedestrian',
    direction: 'clockwise',
    nodeIds: nodes.map((row) => row.id),
    segmentIds: segments.map((row) => row.id),
    lengthM: round(segments.reduce((sum, row) => sum + row.lengthM, 0)),
    source,
  };
  return {
    nodes,
    segments,
    circuits: [circuit],
    renderGeometry: [{
      id: 'park-union-square-m089',
      label: 'Union Square Park',
      outerRing: [...rows.map((row) => ({ ...row.position })), { ...rows[0].position }],
      source: structuredClone(source),
    }],
  };
}

function cleanCoordinatePairs(coordinates, project) {
  return coordinates.map(([longitude, latitude]) => ({
    position: project([longitude, latitude]),
    wgs84: { longitude: roundCoordinate(longitude), latitude: roundCoordinate(latitude) },
  })).filter((row, index, rows) => index === 0 || distance(row.position, rows[index - 1].position) > 0.001);
}

function polygonArea(points) {
  let area = 0;
  for (let index = 0; index < points.length - 1; index += 1) area += points[index].x * points[index + 1].y - points[index + 1].x * points[index].y;
  return area / 2;
}

function distance(left, right) {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function round(value) {
  return Number(Number(value).toFixed(6));
}

function roundCoordinate(value) {
  return Number(Number(value).toFixed(7));
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function shortHash(value, length) {
  return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, length);
}

export { compileParkNetwork };
