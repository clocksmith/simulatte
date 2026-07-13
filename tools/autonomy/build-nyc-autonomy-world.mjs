#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const TOOL_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(TOOL_DIR, '../..');
const require = createRequire(import.meta.url);
const contracts = require('../../public/autonomy/contracts/contract-validator.js');
const featureCatalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/autonomy/feature-cards-v1.json'), 'utf8'));

const SNAPSHOT_DATE = '2026-07-13';
const TILE = Object.freeze({ south: 40.700, west: -74.020, north: 40.718, east: -73.995 });
const ORIGIN = Object.freeze({ longitude: -74.0075, latitude: 40.709 });
const LANDMARKS = Object.freeze({
  origin: { label: 'City Hall', kind: 'depot', longitude: -74.0060, latitude: 40.7127 },
  destination: { label: 'Wall Street', kind: 'delivery', longitude: -74.0110, latitude: 40.7075 },
});
const SOURCE_DIR = path.join(ROOT, 'tools/autonomy/data-sources/lower-manhattan-2026-07-13');
const DEFAULT_OUTPUT = path.join(ROOT, 'public/data/autonomy/worlds/lower-manhattan-delivery-bike-v1.json');
const SOURCE_FILES = Object.freeze({
  bike: 'nyc-bike-routes.geojson.gz',
  buildings: 'nyc-building-footprints.geojson.gz',
  land: 'nyc-manhattan-boundary.geojson.gz',
  streets: 'osm-highways.json.gz',
});
const SOURCE_CONTRACTS = Object.freeze({
  bike: {
    id: 'nyc-dot-bike-routes',
    authority: 'NYC Department of Transportation',
    license: 'NYC Open Data Terms of Use',
    url: 'https://data.cityofnewyork.us/resource/mzxg-pwib.geojson',
    query: `$limit=5000&$where=within_box(the_geom, ${TILE.north}, ${TILE.west}, ${TILE.south}, ${TILE.east})`,
  },
  buildings: {
    id: 'nyc-building-footprints',
    authority: 'NYC Department of Information Technology and Telecommunications',
    license: 'NYC Open Data Terms of Use',
    url: 'https://data.cityofnewyork.us/resource/5zhs-2jue.geojson',
    query: `$limit=5000&$where=within_box(the_geom, ${TILE.north}, ${TILE.west}, ${TILE.south}, ${TILE.east})`,
  },
  land: {
    id: 'nyc-borough-boundaries',
    authority: 'NYC Department of City Planning',
    license: 'NYC Open Data Terms of Use',
    url: 'https://data.cityofnewyork.us/resource/gthc-hcne.geojson',
    query: '$where=borocode=1',
  },
  streets: {
    id: 'openstreetmap-highways',
    authority: 'OpenStreetMap contributors',
    license: 'ODbL 1.0',
    url: 'https://overpass-api.de/api/interpreter',
    query: `[out:json][timeout:60];way["highway"](${TILE.south},${TILE.west},${TILE.north},${TILE.east});out tags geom;`,
  },
});

function parseArgs(argv) {
  const options = { output: DEFAULT_OUTPUT, refresh: false, imports: {} };
  for (let index = 0; index < argv.length; index += 1) {
    const [key, inline] = argv[index].split('=');
    const value = () => inline ?? argv[++index];
    if (key === '--refresh') options.refresh = true;
    else if (key === '--output') options.output = path.resolve(value());
    else if (key === '--bike') options.imports.bike = path.resolve(value());
    else if (key === '--buildings') options.imports.buildings = path.resolve(value());
    else if (key === '--land') options.imports.land = path.resolve(value());
    else if (key === '--streets') options.imports.streets = path.resolve(value());
    else if (key === '--help') {
      console.log('usage: node tools/autonomy/build-nyc-autonomy-world.mjs [--refresh] [--bike FILE --buildings FILE --land FILE --streets FILE] [--output FILE]');
      process.exit(0);
    } else throw new Error(`Unknown argument: ${argv[index]}`);
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (Object.keys(options.imports).length) stageImports(options.imports);
  if (options.refresh) await refreshSources();
  const snapshots = loadSnapshots();
  const world = compileWorld(snapshots);
  contracts.validateWorld(world, featureCatalog);
  fs.mkdirSync(path.dirname(options.output), { recursive: true });
  fs.writeFileSync(options.output, `${JSON.stringify(sortValue(world), null, 2)}\n`);
  const route = world.scenario.defaultRoute;
  console.log(`AUTONOMY-NYC world=${world.id} nodes=${world.nodes.length} segments=${world.segments.length} buildings=${world.renderGeometry.buildings.length} streets=${world.renderGeometry.streets.length} routeSegments=${route.segmentIds.length} routeMeters=${route.distanceM} output=${options.output}`);
}

function stageImports(imports) {
  const missing = Object.keys(SOURCE_FILES).filter((key) => !imports[key]);
  if (missing.length) throw new Error(`Source import expected all four inputs, missing ${missing.join(', ')}`);
  fs.mkdirSync(SOURCE_DIR, { recursive: true });
  for (const [key, filename] of Object.entries(SOURCE_FILES)) {
    const bytes = fs.readFileSync(imports[key]);
    JSON.parse(bytes.toString('utf8'));
    fs.writeFileSync(path.join(SOURCE_DIR, filename), zlib.gzipSync(bytes, { level: 9, mtime: 0 }));
  }
}

async function refreshSources() {
  fs.mkdirSync(SOURCE_DIR, { recursive: true });
  for (const key of ['bike', 'buildings', 'land']) {
    const source = SOURCE_CONTRACTS[key];
    const response = await fetch(`${source.url}?${source.query}`);
    if (!response.ok) throw new Error(`${key} source request failed with ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    JSON.parse(bytes.toString('utf8'));
    fs.writeFileSync(path.join(SOURCE_DIR, SOURCE_FILES[key]), zlib.gzipSync(bytes, { level: 9, mtime: 0 }));
  }
  const streetSource = SOURCE_CONTRACTS.streets;
  const response = await fetch(streetSource.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Simulatte-Autonomy-Data-Compiler/1.0' },
    body: new URLSearchParams({ data: streetSource.query }),
  });
  if (!response.ok) throw new Error(`streets source request failed with ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  JSON.parse(bytes.toString('utf8'));
  fs.writeFileSync(path.join(SOURCE_DIR, SOURCE_FILES.streets), zlib.gzipSync(bytes, { level: 9, mtime: 0 }));
}

function loadSnapshots() {
  return Object.fromEntries(Object.entries(SOURCE_FILES).map(([key, filename]) => {
    const file = path.join(SOURCE_DIR, filename);
    if (!fs.existsSync(file)) throw new Error(`Missing frozen source ${file}; pass all source inputs or use --refresh`);
    const rawBytes = zlib.gunzipSync(fs.readFileSync(file));
    return [key, { data: JSON.parse(rawBytes.toString('utf8')), rawBytes, contract: SOURCE_CONTRACTS[key] }];
  }));
}

function compileWorld(snapshots) {
  const project = createProjector(ORIGIN);
  const network = compileBikeNetwork(snapshots.bike.data, project);
  const route = shortestRoute(network, LANDMARKS.origin, LANDMARKS.destination, project);
  const originNode = network.nodesById.get(route.nodeIds[0]);
  const destinationNode = network.nodesById.get(route.nodeIds.at(-1));
  originNode.label = LANDMARKS.origin.label;
  originNode.kind = LANDMARKS.origin.kind;
  destinationNode.label = LANDMARKS.destination.label;
  destinationNode.kind = LANDMARKS.destination.kind;
  const scenario = buildScenario(route, network);
  const renderGeometry = {
    schema: 'simulatte.autonomyRenderGeometry.v1',
    coordinateSystem: 'local_cartesian_meters',
    land: compileLand(snapshots.land.data, project),
    streets: compileVisualStreets(snapshots.streets.data, project),
    buildings: compileBuildings(snapshots.buildings.data, project),
    bikeFacilities: compileBikeFacilities(snapshots.bike.data, project),
    claimBoundary: 'Building footprints, roof heights, bike facilities, streets, and land geometry preserve the frozen source snapshots. Render colors, widths, lighting, traffic actors, and signal timing are simulation presentation or policy assumptions.',
  };
  const sourceReceipts = Object.fromEntries(Object.entries(snapshots).map(([key, snapshot]) => [key, {
    ...snapshot.contract,
    snapshotDate: SNAPSHOT_DATE,
    rawSha256: sha256(snapshot.rawBytes),
    rawByteCount: snapshot.rawBytes.length,
  }]));
  const allPoints = [
    ...renderGeometry.streets.flatMap((row) => row.geometry),
    ...renderGeometry.buildings.flatMap((row) => row.footprint),
    ...network.nodes.map((row) => row.position),
  ];
  return {
    schema: 'simulatte.autonomyWorld.v1',
    id: 'lower-manhattan-delivery-bike-v1',
    contentVersion: `lower-manhattan-delivery-bike-${SNAPSHOT_DATE}`,
    label: 'Lower Manhattan delivery-bike world',
    coordinateSystem: {
      kind: 'local_cartesian_meters',
      originLabel: `${ORIGIN.latitude},${ORIGIN.longitude}`,
      originWgs84: { longitude: ORIGIN.longitude, latitude: ORIGIN.latitude },
      bounds: boundsFor(allPoints, 30),
    },
    provenance: {
      sourceKind: 'compiled_open_data_snapshot',
      sourceId: 'simulatte-lower-manhattan-open-data-tile-v1',
      snapshotDate: SNAPSHOT_DATE,
      sources: sourceReceipts,
      compiler: 'tools/autonomy/build-nyc-autonomy-world.mjs',
      endpointSnapToleranceM: 3,
      claimBoundary: 'The street, bike, building, and land geometry is compiled from the named frozen sources. Traffic actors, signal timing, routing risk, simulated speed, and action outcomes are bounded simulation assumptions, not live conditions or physical autonomy evidence.',
    },
    nodes: network.nodes.sort(byId),
    segments: network.segments.sort(byId),
    signals: scenario.signals,
    actors: scenario.actors,
    disruptions: scenario.disruptions,
    scenario: scenario.receipt,
    renderGeometry,
  };
}

function compileBikeNetwork(collection, project) {
  const rows = [];
  collection.features.forEach((feature) => {
    if (!feature || feature.properties?.status !== 'Current' || feature.geometry?.type !== 'MultiLineString') return;
    feature.geometry.coordinates.forEach((coordinates, partIndex) => {
      const cleaned = cleanLine(coordinates.map(project));
      if (cleaned.length < 2) return;
      rows.push({ properties: feature.properties, partIndex, geometry: cleaned });
    });
  });
  rows.sort((left, right) => sourceLineKey(left).localeCompare(sourceLineKey(right)));
  const endpoints = rows.flatMap((row, rowIndex) => [
    { rowIndex, side: 'from', point: row.geometry[0] },
    { rowIndex, side: 'to', point: row.geometry.at(-1) },
  ]);
  const groups = clusterEndpoints(endpoints, 3);
  const nodeByEndpoint = new Map();
  const nodes = groups.map((group) => {
    const position = {
      x: round(group.reduce((sum, row) => sum + row.point.x, 0) / group.length),
      y: round(group.reduce((sum, row) => sum + row.point.y, 0) / group.length),
    };
    const id = `bike-node-${hash32(`${position.x.toFixed(3)},${position.y.toFixed(3)}`).toString(16).padStart(8, '0')}`;
    const streets = [...new Set(group.map((endpoint) => rows[endpoint.rowIndex].properties.street).filter(Boolean))].sort();
    const node = { id, label: streets.slice(0, 2).join(' / ') || id, kind: 'intersection', position };
    group.forEach((endpoint) => nodeByEndpoint.set(`${endpoint.rowIndex}:${endpoint.side}`, node));
    return node;
  });
  const segments = [];
  rows.forEach((row, rowIndex) => {
    const from = nodeByEndpoint.get(`${rowIndex}:from`);
    const to = nodeByEndpoint.get(`${rowIndex}:to`);
    if (from.id === to.id) return;
    const properties = row.properties;
    const laneType = laneTypeFor(properties);
    const forward = Boolean(properties.ft_facilit || properties.ft2facilit) || properties.bikedir === '2';
    const reverse = Boolean(properties.tf_facilit || properties.tf2facilit) || properties.bikedir === '2';
    const sourceKey = `${properties.segmentid || 'none'}:${properties.bikeid || 'none'}:${row.partIndex}:${sourceLineKey(row)}`;
    if (forward) segments.push(networkSegment(sourceKey, 'ft', row.geometry, from, to, laneType, properties));
    if (reverse) segments.push(networkSegment(sourceKey, 'tf', [...row.geometry].reverse(), to, from, laneType, properties));
  });
  const nodesById = new Map(nodes.map((row) => [row.id, row]));
  return { nodes, segments, nodesById };
}

function clusterEndpoints(endpoints, toleranceM) {
  const parent = endpoints.map((_, index) => index);
  const find = (index) => parent[index] === index ? index : (parent[index] = find(parent[index]));
  const join = (left, right) => {
    const a = find(left);
    const b = find(right);
    if (a !== b) parent[Math.max(a, b)] = Math.min(a, b);
  };
  for (let left = 0; left < endpoints.length; left += 1) {
    for (let right = left + 1; right < endpoints.length; right += 1) {
      if (distance(endpoints[left].point, endpoints[right].point) <= toleranceM) join(left, right);
    }
  }
  const groups = new Map();
  endpoints.forEach((row, index) => {
    const key = find(index);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  });
  return [...groups.values()].sort((left, right) => endpointKey(left[0]).localeCompare(endpointKey(right[0])));
}

function networkSegment(sourceKey, direction, sourceGeometry, from, to, laneType, properties) {
  const geometry = sourceGeometry.map((point) => ({ ...point }));
  geometry[0] = { ...from.position };
  geometry[geometry.length - 1] = { ...to.position };
  return {
    id: `bike-${hash32(`${sourceKey}:${direction}`).toString(16).padStart(8, '0')}-${direction}`,
    fromNodeId: from.id,
    toNodeId: to.id,
    geometry,
    lengthM: round(polylineLength(geometry)),
    laneType,
    allowedModes: ['delivery_bike'],
    speedLimitMps: laneType === 'protected' ? 6.4 : laneType === 'shared' ? 5.4 : 4.8,
    riskScore: laneType === 'protected' ? 0.05 : laneType === 'shared' ? 0.48 : 0.3,
    cardIds: [laneType === 'protected' ? 'street.protected-lane' : laneType === 'shared' ? 'street.shared-lane' : 'street.connector'],
    source: {
      datasetId: SOURCE_CONTRACTS.bike.id,
      segmentId: String(properties.segmentid || ''),
      bikeId: String(properties.bikeid || ''),
      street: properties.street || null,
      facilityClass: properties.facilitycl || null,
      facility: direction === 'ft' ? properties.ft_facilit || properties.ft2facilit : properties.tf_facilit || properties.tf2facilit,
      direction,
    },
  };
}

function shortestRoute(network, origin, destination, project) {
  const originNode = nearestNode(network.nodes, project([origin.longitude, origin.latitude]));
  const destinationNode = nearestNode(network.nodes, project([destination.longitude, destination.latitude]));
  const outgoing = new Map(network.nodes.map((row) => [row.id, []]));
  network.segments.forEach((segment) => outgoing.get(segment.fromNodeId).push(segment));
  outgoing.forEach((rows) => rows.sort(byId));
  const distances = new Map([[originNode.id, 0]]);
  const previous = new Map();
  const open = new Set(network.nodes.map((row) => row.id));
  while (open.size) {
    let currentId = null;
    let currentDistance = Infinity;
    [...open].sort().forEach((nodeId) => {
      const candidate = distances.get(nodeId) ?? Infinity;
      if (candidate < currentDistance) {
        currentDistance = candidate;
        currentId = nodeId;
      }
    });
    if (!currentId || currentId === destinationNode.id) break;
    open.delete(currentId);
    for (const segment of outgoing.get(currentId)) {
      const candidate = currentDistance + segment.lengthM;
      if (candidate < (distances.get(segment.toNodeId) ?? Infinity)) {
        distances.set(segment.toNodeId, candidate);
        previous.set(segment.toNodeId, { nodeId: currentId, segmentId: segment.id });
      }
    }
  }
  if (!distances.has(destinationNode.id)) throw new Error(`No directed bike route between ${origin.label} and ${destination.label}`);
  const nodeIds = [destinationNode.id];
  const segmentIds = [];
  let cursor = destinationNode.id;
  while (cursor !== originNode.id) {
    const row = previous.get(cursor);
    if (!row) throw new Error(`Route reconstruction failed at ${cursor}`);
    nodeIds.unshift(row.nodeId);
    segmentIds.unshift(row.segmentId);
    cursor = row.nodeId;
  }
  return { nodeIds, segmentIds, distanceM: round(distances.get(destinationNode.id)) };
}

function buildScenario(route, network) {
  const routeSegments = route.segmentIds.map((id) => network.segments.find((row) => row.id === id));
  const signalEdgeIndex = Math.min(3, routeSegments.length - 1);
  const signalSegment = routeSegments[signalEdgeIndex];
  const actorEdgeIndex = Math.min(Math.max(6, Math.floor(routeSegments.length * 0.45)), routeSegments.length - 1);
  const actorSegment = routeSegments[actorEdgeIndex];
  const actorCenter = pointAlong(actorSegment.geometry, 0.5);
  const tangent = segmentTangent(actorSegment.geometry);
  const normal = { x: -tangent.y, y: tangent.x };
  const signals = [{
    id: 'assumed-signal-route-1',
    nodeId: signalSegment.fromNodeId,
    controlledOutgoingSegmentIds: [signalSegment.id],
    cycleTicks: 12,
    greenTickCount: 6,
    phaseOffsetTicks: 7,
    cardIds: ['behavior.signal-compliance'],
    provenance: { kind: 'simulation_assumption', source: 'scenario authoring', isLiveCondition: false },
  }];
  const actors = [{
    id: 'assumed-pedestrian-route-1',
    type: 'pedestrian',
    activeFromTick: 52,
    activeUntilTick: 72,
    path: [offset(actorCenter, normal, -14), offset(actorCenter, normal, 14)],
    radiusM: 0.6,
    cardIds: ['behavior.pedestrian-yield'],
    provenance: { kind: 'simulation_assumption', source: 'scenario authoring', isLiveCondition: false },
  }];
  return {
    signals,
    actors,
    disruptions: [],
    receipt: {
      schema: 'simulatte.autonomyScenarioReceipt.v1',
      defaultMissionText: 'Deliver the parcel by bike from City Hall to Wall Street. Prefer protected lanes and yield to pedestrians.',
      defaultRoute: { algorithm: 'dijkstra_distance_control', ...route },
      modeledAssumptions: ['signal_timing', 'pedestrian_path', 'bike_speed_limits', 'lane_risk_scores'],
      liveConditionsUsed: false,
    },
  };
}

function compileBuildings(collection, project) {
  const buildings = [];
  collection.features.forEach((feature) => {
    if (!feature || !['Polygon', 'MultiPolygon'].includes(feature.geometry?.type)) return;
    const polygons = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
    polygons.forEach((polygon, partIndex) => {
      const footprint = simplifyRing(polygon[0].map(project), 0.8);
      if (footprint.length < 4 || Math.abs(polygonArea(footprint)) < 5) return;
      buildings.push({
        id: `building-${feature.properties?.objectid || feature.properties?.doitt_id || hash32(JSON.stringify(polygon[0]))}-${partIndex}`,
        footprint,
        heightM: round(clamp(Number(feature.properties?.height_roof || 24) * 0.3048, 3, 360)),
        groundElevationM: round(Number(feature.properties?.ground_elevation || 0) * 0.3048),
        sourceObjectId: String(feature.properties?.objectid || ''),
        sourceBin: feature.properties?.bin || null,
        omittedInteriorRingCount: Math.max(0, polygon.length - 1),
      });
    });
  });
  return buildings.sort(byId);
}

function compileVisualStreets(overpass, project) {
  const allowed = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'residential', 'unclassified', 'service', 'living_street', 'pedestrian', 'cycleway']);
  return (overpass.elements || []).filter((row) => row.type === 'way' && allowed.has(row.tags?.highway) && Array.isArray(row.geometry) && row.geometry.length > 1)
    .map((row) => ({
      id: `osm-way-${row.id}`,
      name: row.tags.name || null,
      highway: row.tags.highway,
      widthM: streetWidth(row.tags),
      geometry: simplifyLine(row.geometry.map((point) => project([point.lon, point.lat])), 0.65),
      sourceWayId: String(row.id),
    })).filter((row) => row.geometry.length > 1).sort(byId);
}

function compileBikeFacilities(collection, project) {
  const facilities = [];
  collection.features.forEach((feature) => {
    if (feature?.properties?.status !== 'Current' || feature.geometry?.type !== 'MultiLineString') return;
    feature.geometry.coordinates.forEach((line, partIndex) => facilities.push({
      id: `facility-${feature.properties.segmentid || feature.properties.bikeid}-${partIndex}-${hash32(JSON.stringify(line)).toString(16)}`,
      laneType: laneTypeFor(feature.properties),
      street: feature.properties.street || null,
      facilityClass: feature.properties.facilitycl || null,
      geometry: simplifyLine(line.map(project), 0.35),
    }));
  });
  return facilities.filter((row) => row.geometry.length > 1).sort(byId);
}

function compileLand(collection, project) {
  const polygons = [];
  collection.features.forEach((feature) => {
    const rows = feature.geometry?.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry?.type === 'MultiPolygon' ? feature.geometry.coordinates : [];
    rows.forEach((polygon, index) => {
      const ring = clipRingToBounds(polygon[0], TILE).map(project);
      const simplified = simplifyRing(ring, 2);
      if (simplified.length >= 4 && Math.abs(polygonArea(simplified)) > 100) {
        polygons.push({ id: `manhattan-land-${feature.properties?.borocode || 1}-${index}`, outerRing: simplified });
      }
    });
  });
  return polygons.sort(byId);
}

function clipRingToBounds(ring, bounds) {
  let output = ring.map(([longitude, latitude]) => ({ longitude, latitude }));
  const edges = [
    { inside: (p) => p.longitude >= bounds.west, intersect: (a, b) => intersectLongitude(a, b, bounds.west) },
    { inside: (p) => p.longitude <= bounds.east, intersect: (a, b) => intersectLongitude(a, b, bounds.east) },
    { inside: (p) => p.latitude >= bounds.south, intersect: (a, b) => intersectLatitude(a, b, bounds.south) },
    { inside: (p) => p.latitude <= bounds.north, intersect: (a, b) => intersectLatitude(a, b, bounds.north) },
  ];
  for (const edge of edges) {
    const input = output;
    output = [];
    for (let index = 0; index < input.length; index += 1) {
      const current = input[index];
      const previous = input[(index + input.length - 1) % input.length];
      if (edge.inside(current)) {
        if (!edge.inside(previous)) output.push(edge.intersect(previous, current));
        output.push(current);
      } else if (edge.inside(previous)) output.push(edge.intersect(previous, current));
    }
  }
  return output.map((point) => [point.longitude, point.latitude]);
}

function intersectLongitude(a, b, longitude) {
  const ratio = (longitude - a.longitude) / (b.longitude - a.longitude || 1);
  return { longitude, latitude: a.latitude + (b.latitude - a.latitude) * ratio };
}

function intersectLatitude(a, b, latitude) {
  const ratio = (latitude - a.latitude) / (b.latitude - a.latitude || 1);
  return { latitude, longitude: a.longitude + (b.longitude - a.longitude) * ratio };
}

function laneTypeFor(properties) {
  const text = [properties.facilitycl, properties.allclasses, properties.ft_facilit, properties.tf_facilit, properties.ft2facilit, properties.tf2facilit].filter(Boolean).join(' ').toLowerCase();
  if (properties.facilitycl === 'I' || /protected|greenway|sidewalk/.test(text)) return 'protected';
  if (properties.facilitycl === 'II' || /conventional|curbside|shared/.test(text)) return 'shared';
  return 'connector';
}

function streetWidth(tags) {
  const explicit = Number.parseFloat(tags.width);
  if (Number.isFinite(explicit)) return round(clamp(explicit, 2, 28));
  const lanes = Number.parseInt(tags.lanes, 10);
  if (Number.isFinite(lanes)) return round(clamp(lanes * 3.1 + 1.4, 3, 28));
  return ({ motorway: 18, trunk: 16, primary: 13, secondary: 11, tertiary: 9, residential: 7, unclassified: 6, service: 4.5, living_street: 5, pedestrian: 5, cycleway: 2.5 })[tags.highway] || 6;
}

function createProjector(origin) {
  const longitudeScale = Math.cos(origin.latitude * Math.PI / 180) * 111320;
  return ([longitude, latitude]) => ({
    x: round((Number(longitude) - origin.longitude) * longitudeScale),
    y: round((Number(latitude) - origin.latitude) * 110540),
  });
}

function nearestNode(nodes, point) {
  return [...nodes].sort((left, right) => distance(left.position, point) - distance(right.position, point) || left.id.localeCompare(right.id))[0];
}

function simplifyLine(points, toleranceM) {
  const cleaned = cleanLine(points);
  if (cleaned.length <= 2) return cleaned;
  const kept = [cleaned[0]];
  for (let index = 1; index < cleaned.length - 1; index += 1) {
    if (pointLineDistance(cleaned[index], kept.at(-1), cleaned[index + 1]) > toleranceM) kept.push(cleaned[index]);
  }
  kept.push(cleaned.at(-1));
  return kept;
}

function simplifyRing(points, toleranceM) {
  const ring = simplifyLine(points, toleranceM);
  if (ring.length && distance(ring[0], ring.at(-1)) > 0.001) ring.push({ ...ring[0] });
  return ring;
}

function cleanLine(points) {
  return points.filter((point, index) => index === 0 || distance(point, points[index - 1]) > 0.001);
}

function pointLineDistance(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (!lengthSquared) return distance(point, start);
  const ratio = clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared, 0, 1);
  return distance(point, { x: start.x + dx * ratio, y: start.y + dy * ratio });
}

function pointAlong(points, ratio) {
  const total = polylineLength(points);
  let remaining = total * ratio;
  for (let index = 1; index < points.length; index += 1) {
    const length = distance(points[index - 1], points[index]);
    if (remaining <= length) {
      const t = length ? remaining / length : 0;
      return { x: points[index - 1].x + (points[index].x - points[index - 1].x) * t, y: points[index - 1].y + (points[index].y - points[index - 1].y) * t };
    }
    remaining -= length;
  }
  return { ...points.at(-1) };
}

function segmentTangent(points) {
  const left = points[Math.max(0, Math.floor(points.length / 2) - 1)];
  const right = points[Math.min(points.length - 1, Math.floor(points.length / 2) + 1)];
  const length = distance(left, right) || 1;
  return { x: (right.x - left.x) / length, y: (right.y - left.y) / length };
}

function offset(point, direction, amount) {
  return { x: round(point.x + direction.x * amount), y: round(point.y + direction.y * amount) };
}

function boundsFor(points, padding) {
  return {
    minimumX: round(Math.min(...points.map((row) => row.x)) - padding),
    minimumY: round(Math.min(...points.map((row) => row.y)) - padding),
    maximumX: round(Math.max(...points.map((row) => row.x)) + padding),
    maximumY: round(Math.max(...points.map((row) => row.y)) + padding),
  };
}

function polylineLength(points) {
  let length = 0;
  for (let index = 1; index < points.length; index += 1) length += distance(points[index - 1], points[index]);
  return length;
}

function polygonArea(points) {
  let area = 0;
  for (let index = 0; index < points.length - 1; index += 1) area += points[index].x * points[index + 1].y - points[index + 1].x * points[index].y;
  return area / 2;
}

function sourceLineKey(row) {
  return `${row.properties.segmentid || ''}:${row.properties.bikeid || ''}:${row.partIndex}:${row.geometry.map((point) => `${point.x.toFixed(3)},${point.y.toFixed(3)}`).join(';')}`;
}

function endpointKey(row) {
  return `${row.point.x.toFixed(6)},${row.point.y.toFixed(6)}:${row.rowIndex}:${row.side}`;
}

function distance(left, right) {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function round(value) {
  return Number(Number(value).toFixed(6));
}

function hash32(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function byId(left, right) {
  return left.id.localeCompare(right.id);
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortValue(value[key])]));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error && error.stack || error);
    process.exit(1);
  });
}

export { compileWorld, createProjector, laneTypeFor, parseArgs, shortestRoute };
