import crypto from 'node:crypto';

function compileParkNetwork(collection, { project, sourceContract, snapshotDate }) {
  const eligible = (collection.features || []).filter((feature) => feature?.properties?.gispropnum
    && ['Polygon', 'MultiPolygon'].includes(feature.geometry?.type));
  if (!eligible.length) throw new Error('Park circuit compilation expected at least one governed property geometry');
  const compiled = eligible.sort((left, right) => String(left.properties.gispropnum).localeCompare(String(right.properties.gispropnum)))
    .map((feature) => compilePropertyCircuit(feature, { project, sourceContract, snapshotDate }));
  return {
    nodes: compiled.flatMap((row) => row.nodes),
    segments: compiled.flatMap((row) => row.segments),
    circuits: compiled.map((row) => row.circuit),
    renderGeometry: compileParkRenderGeometry(collection, { project, sourceContract, snapshotDate }),
  };
}

function compilePropertyCircuit(feature, { project, sourceContract, snapshotDate }) {
  const propertyId = String(feature.properties.gispropnum);
  const label = String(feature.properties.signname || feature.properties.name || propertyId);
  const polygons = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
  if (!polygons.length) throw new Error(`${label} expected non-empty property geometry`);
  const members = polygons.map((polygon, index) => {
    const rawRing = polygon[0];
    const rows = cleanCoordinatePairs(rawRing, project);
    return { index, rawRing, rows, areaM2: Math.abs(polygonArea(rows.map((row) => row.position))) };
  }).sort((left, right) => right.areaM2 - left.areaM2 || left.index - right.index);
  const selected = members[0];
  const sourceGeometryHash = sha256(Buffer.from(JSON.stringify(feature.geometry)));
  let rows = selected.rows;
  if (rows.length > 1 && distance(rows[0].position, rows.at(-1).position) < 0.001) rows = rows.slice(0, -1);
  if (rows.length < 4) throw new Error(`${label} boundary expected at least four distinct points, received ${rows.length}`);
  const closedPositions = [...rows.map((row) => row.position), { ...rows[0].position }];
  if (polygonArea(closedPositions) > 0) rows.reverse();
  const source = {
    datasetId: sourceContract.id,
    sourceRevision: snapshotDate,
    propertyId,
    boundaryKind: 'nyc_parks_property_boundary',
    surfaceClaim: 'park_property_boundary_not_surveyed_sidewalk',
    geometryWgs84Sha256: sourceGeometryHash,
    selectedRingWgs84Sha256: sha256(Buffer.from(JSON.stringify(selected.rawRing))),
    memberCount: polygons.length,
    selectedMemberIndex: selected.index,
    selectionMethod: 'largest_projected_exterior_ring_area_v1',
    claimBoundary: 'The circuit follows the largest exterior member of the frozen NYC Parks property geometry. It does not claim a surveyed sidewalk centerline, current access condition, or obstacle-free physical route.',
  };
  const nodes = rows.map((row, index) => ({
    id: `ped-node-${shortHash(`${source.datasetId}:${source.sourceRevision}:${source.propertyId}:${row.wgs84.longitude.toFixed(7)},${row.wgs84.latitude.toFixed(7)}`, 12)}`,
    label: index === 0 ? `${label} perimeter start` : `${label} perimeter ${String(index + 1).padStart(2, '0')}`,
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
        street: `${label} perimeter`,
        direction: 'clockwise',
        sourceRevision: source.sourceRevision,
        geometryWgs84Sha256: sha256(Buffer.from(JSON.stringify([fromWgs84, toWgs84]))),
      },
    };
  });
  const circuitSlug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const circuit = {
    id: `${circuitSlug}-perimeter-v1`,
    label,
    aliases: [...new Set([label, label.replace(/\s+Park$/i, '')])],
    mode: 'pedestrian',
    direction: 'clockwise',
    nodeIds: nodes.map((row) => row.id),
    segmentIds: segments.map((row) => row.id),
    lengthM: round(segments.reduce((sum, row) => sum + row.lengthM, 0)),
    source,
  };
  return { nodes, segments, circuit };
}

function compileParkRenderGeometry(collection, { project, sourceContract, snapshotDate }) {
  return (collection.features || [])
    .filter((feature) => feature?.properties?.gispropnum && ['Polygon', 'MultiPolygon'].includes(feature.geometry?.type))
    .sort((left, right) => String(left.properties.gispropnum).localeCompare(String(right.properties.gispropnum)))
    .flatMap((feature) => {
      const propertyId = String(feature.properties.gispropnum);
      const label = String(feature.properties.signname || feature.properties.name || propertyId);
      const polygons = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
      const geometryWgs84Sha256 = sha256(Buffer.from(JSON.stringify(feature.geometry)));
      const memberAreas = polygons.map((polygon) => Math.abs(polygonArea(cleanCoordinatePairs(polygon[0], project).map((row) => row.position))));
      const largestMemberIndex = memberAreas.indexOf(Math.max(...memberAreas));
      return polygons.map((polygon, memberIndex) => {
        const rawRing = polygon[0];
        let ring = cleanCoordinatePairs(rawRing, project);
        if (ring.length > 1 && distance(ring[0].position, ring.at(-1).position) < 0.001) ring = ring.slice(0, -1);
        if (ring.length < 3) throw new Error(`${label} property boundary member ${memberIndex} expected at least three distinct points`);
        const outerRing = [...ring.map((row) => ({ ...row.position })), { ...ring[0].position }];
        return {
          id: propertyId === 'M089' && memberIndex === largestMemberIndex
            ? 'park-union-square-m089'
            : `park-${propertyId.toLowerCase()}-${String(memberIndex + 1).padStart(2, '0')}`,
          label,
          outerRing,
          source: {
            datasetId: sourceContract.id,
            sourceRevision: snapshotDate,
            propertyId,
            boundaryKind: 'nyc_parks_property_boundary',
            surfaceClaim: 'park_property_boundary_not_surveyed_sidewalk',
            geometryWgs84Sha256,
            selectedRingWgs84Sha256: sha256(Buffer.from(JSON.stringify(rawRing))),
            memberCount: polygons.length,
            selectedMemberIndex: memberIndex,
            selectionMethod: 'all_exterior_members_v1',
            claimBoundary: 'This row renders a frozen NYC Parks property exterior. It does not authorize traversal or claim current access, sidewalk placement, or obstacle-free conditions.',
          },
        };
      });
    })
    .sort((left, right) => left.id.localeCompare(right.id));
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

export { compileParkNetwork, compileParkRenderGeometry };
