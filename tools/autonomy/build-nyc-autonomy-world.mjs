#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { compileFeatureCatalog, compileOccurrenceCatalog } from './compile-autonomy-catalogs.mjs';
import { compileParkNetwork } from './compile-park-network.mjs';

const TOOL_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(TOOL_DIR, '../..');
const require = createRequire(import.meta.url);
const contracts = require('../../public/contracts/contract-validator.js');
const routingPolicy = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/autonomy/policies/bet-selector-v1.json'), 'utf8'));

const SNAPSHOT_DATE = '2026-07-13';
const TILE = Object.freeze({ south: 40.705, west: -74.015, north: 40.745, east: -73.940 });
const ORIGIN = Object.freeze({ longitude: -73.978, latitude: 40.726 });
const LANDMARKS = Object.freeze([
  { label: 'West Village', kind: 'place', longitude: -74.0048, latitude: 40.7340 },
  { label: 'Washington Square', kind: 'place', longitude: -73.9973, latitude: 40.7308 },
  { label: 'Union Square', kind: 'depot', longitude: -73.9903, latitude: 40.7359 },
  { label: 'East Village', kind: 'place', longitude: -73.9818, latitude: 40.7265 },
  { label: 'Tompkins Square', kind: 'place', longitude: -73.9818, latitude: 40.7260 },
  { label: 'Williamsburg Bridge', kind: 'place', longitude: -73.9743, latitude: 40.7137 },
  { label: 'Williamsburg Waterfront', kind: 'place', longitude: -73.9622, latitude: 40.7163 },
  { label: 'North Williamsburg', kind: 'delivery', longitude: -73.9563, latitude: 40.7183 },
  { label: 'McCarren Park', kind: 'place', longitude: -73.9522, latitude: 40.7217 },
  { label: 'Greenpoint', kind: 'place', longitude: -73.9546, latitude: 40.7304 }
]);
const DEFAULT_ROUTE = Object.freeze({ originLabel: 'Union Square', destinationLabel: 'North Williamsburg' });
const SOURCE_DIR = path.join(ROOT, 'tools/autonomy/data-sources/villages-williamsburg-2026-07-13');
const DEFAULT_OUTPUT = path.join(ROOT, 'public/data/autonomy/worlds/nyc-core-autonomy-v1.json');
const DEFAULT_FEATURE_OUTPUT = path.join(ROOT, 'public/data/autonomy/feature-cards-v1.json');
const DEFAULT_OCCURRENCE_OUTPUT = path.join(ROOT, 'public/data/autonomy/patterns/nyc-replay-patterns-v1.json');
const PARK_SOURCE_FILE = path.join(ROOT, 'tools/autonomy/data-sources/nyc-parks-properties-2026-07-13-v2/nyc-parks-properties.geojson');
const SOURCE_FILES = Object.freeze({
  bike: 'nyc-bike-routes.geojson.gz',
  buildings: 'nyc-building-footprints.geojson.gz',
  land: 'nyc-borough-boundaries.geojson.gz',
  streets: 'osm-highways.json.gz',
  parks: 'nyc-parks-union-square.geojson.gz',
});
const SOURCE_CONTRACTS = Object.freeze({
  bike: {
    id: 'nyc-dot-bike-routes',
    authority: 'NYC Department of Transportation',
    license: 'NYC Open Data Terms of Use',
    url: 'https://data.cityofnewyork.us/resource/mzxg-pwib.geojson',
    query: `$limit=50000&$where=within_box(the_geom, ${TILE.north}, ${TILE.west}, ${TILE.south}, ${TILE.east})`,
  },
  buildings: {
    id: 'nyc-building-footprints',
    authority: 'NYC Department of Information Technology and Telecommunications',
    license: 'NYC Open Data Terms of Use',
    url: 'https://data.cityofnewyork.us/resource/5zhs-2jue.geojson',
    query: `$limit=50000&$where=within_box(the_geom, ${TILE.north}, ${TILE.west}, ${TILE.south}, ${TILE.east})`,
  },
  land: {
    id: 'nyc-borough-boundaries',
    authority: 'NYC Department of City Planning',
    license: 'NYC Open Data Terms of Use',
    url: 'https://data.cityofnewyork.us/resource/gthc-hcne.geojson',
    query: "$where=borocode in ('1','3')",
  },
  streets: {
    id: 'openstreetmap-highways',
    authority: 'OpenStreetMap contributors',
    license: 'ODbL 1.0',
    url: 'https://api.openstreetmap.org/api/0.6/map',
    query: 'deterministic_3_by_4_bbox_subtiles; OSM map responses filtered to governed highway classes',
  },
  parks: {
    id: 'nyc-parks-properties',
    authority: 'NYC Department of Parks and Recreation',
    license: 'NYC Open Data Terms of Use',
    url: 'https://data.cityofnewyork.us/resource/enfh-gkve.geojson',
    query: "$limit=20&$where=gispropnum in('M089','M098','M088','B058')",
  },
});

function parseArgs(argv) {
  const options = { output: DEFAULT_OUTPUT, featureOutput: DEFAULT_FEATURE_OUTPUT, occurrenceOutput: DEFAULT_OCCURRENCE_OUTPUT, refresh: false, refreshParks: false, imports: {} };
  for (let index = 0; index < argv.length; index += 1) {
    const [key, inline] = argv[index].split('=');
    const value = () => inline ?? argv[++index];
    if (key === '--refresh') options.refresh = true;
    else if (key === '--refresh-parks') options.refreshParks = true;
    else if (key === '--output') options.output = path.resolve(value());
    else if (key === '--feature-output') options.featureOutput = path.resolve(value());
    else if (key === '--occurrence-output') options.occurrenceOutput = path.resolve(value());
    else if (key === '--bike') options.imports.bike = path.resolve(value());
    else if (key === '--buildings') options.imports.buildings = path.resolve(value());
    else if (key === '--land') options.imports.land = path.resolve(value());
    else if (key === '--streets') options.imports.streets = path.resolve(value());
    else if (key === '--parks') options.imports.parks = path.resolve(value());
    else if (key === '--help') {
      console.log('usage: node tools/autonomy/build-nyc-autonomy-world.mjs [--refresh|--refresh-parks] [--bike FILE --buildings FILE --land FILE --streets FILE --parks FILE] [--output FILE] [--feature-output FILE] [--occurrence-output FILE]');
      process.exit(0);
    } else throw new Error(`Unknown argument: ${argv[index]}`);
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (Object.keys(options.imports).length) {
    const missing = Object.keys(SOURCE_FILES).filter((key) => !options.imports[key]);
    if (missing.length) throw new Error(`Source import expected all five inputs, missing ${missing.join(', ')}`);
  }
  if (options.refresh) await refreshSources();
  else if (options.refreshParks) throw new Error('Park refresh requires manage-autonomy-data.mjs fetch, verify, and promote; the compiler never mutates a frozen park snapshot');
  const snapshots = loadSnapshots(options.imports);
  const world = compileWorld(snapshots);
  const featureCatalog = compileFeatureCatalog(world, { snapshotDate: SNAPSHOT_DATE });
  const occurrenceCatalog = compileOccurrenceCatalog(world);
  contracts.validateWorld(world, featureCatalog);
  contracts.validateFeatureCatalog(featureCatalog);
  contracts.validateOccurrenceCatalog(occurrenceCatalog, world);
  fs.mkdirSync(path.dirname(options.output), { recursive: true });
  fs.mkdirSync(path.dirname(options.featureOutput), { recursive: true });
  fs.mkdirSync(path.dirname(options.occurrenceOutput), { recursive: true });
  fs.writeFileSync(options.output, `${JSON.stringify(sortValue(world), null, 2)}\n`);
  fs.writeFileSync(options.featureOutput, `${JSON.stringify(sortValue(featureCatalog), null, 2)}\n`);
  fs.writeFileSync(options.occurrenceOutput, `${JSON.stringify(sortValue(occurrenceCatalog), null, 2)}\n`);
  const route = world.scenario.defaultRoute;
  console.log(`AUTONOMY-NYC world=${world.id} nodes=${world.nodes.length} segments=${world.segments.length} cards=${featureCatalog.cards.length} patterns=${occurrenceCatalog.patterns.length} buildings=${world.renderGeometry.buildings.length} streets=${world.renderGeometry.streets.length} routeSegments=${route.segmentIds.length} routeMeters=${route.distanceM} output=${options.output}`);
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
  const elementById = new Map();
  const streetRows = [];
  const tiles = streetTiles(TILE);
  const tileDirectory = path.join(SOURCE_DIR, 'osm-api-tiles');
  fs.mkdirSync(tileDirectory, { recursive: true });
  for (const [index, tile] of tiles.entries()) {
    const tileFile = path.join(tileDirectory, `tile-${String(index + 1).padStart(2, '0')}.json.gz`);
    const row = fs.existsSync(tileFile)
      ? JSON.parse(zlib.gunzipSync(fs.readFileSync(tileFile)).toString('utf8'))
      : await fetchStreetTile(tile);
    if (!fs.existsSync(tileFile)) fs.writeFileSync(tileFile, zlib.gzipSync(Buffer.from(`${JSON.stringify(row)}\n`), { level: 9, mtime: 0 }));
    streetRows.push(row);
    (row.elements || []).forEach((element) => elementById.set(`${element.type}:${element.id}`, element));
    console.log(`AUTONOMY-NYC-SOURCE streetsTile=${index + 1}/${tiles.length} uniqueWays=${elementById.size}`);
  }
  const merged = {
    version: 0.6,
    generator: 'Simulatte tiled Overpass compiler',
    osm3s: streetRows[0] && streetRows[0].osm3s || null,
    elements: [...elementById.values()].sort((left, right) => left.type.localeCompare(right.type) || left.id - right.id),
  };
  const bytes = Buffer.from(`${JSON.stringify(merged)}\n`);
  fs.writeFileSync(path.join(SOURCE_DIR, SOURCE_FILES.streets), zlib.gzipSync(bytes, { level: 9, mtime: 0 }));
}

function streetTiles(bounds) {
  const rows = [];
  const latitudeStep = (bounds.north - bounds.south) / 3;
  const longitudeStep = (bounds.east - bounds.west) / 4;
  for (let latitudeIndex = 0; latitudeIndex < 3; latitudeIndex += 1) {
    for (let longitudeIndex = 0; longitudeIndex < 4; longitudeIndex += 1) {
      rows.push({
        south: bounds.south + latitudeStep * latitudeIndex,
        north: bounds.south + latitudeStep * (latitudeIndex + 1),
        west: bounds.west + longitudeStep * longitudeIndex,
        east: bounds.west + longitudeStep * (longitudeIndex + 1),
      });
    }
  }
  return rows;
}

async function fetchStreetTile(bounds, depth = 0) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);
  const bbox = `${bounds.west},${bounds.south},${bounds.east},${bounds.north}`;
  try {
    const response = await fetch(`${SOURCE_CONTRACTS.streets.url}?bbox=${bbox}`, {
      headers: { 'User-Agent': 'Simulatte-Autonomy-Data-Compiler/1.0' },
      signal: controller.signal,
    });
    if (!response.ok) {
      if (depth < 3 && [400, 429, 509].includes(response.status)) return fetchStreetSubtiles(bounds, depth + 1);
      throw new Error(`HTTP ${response.status}`);
    }
    return parseOsmXml(await response.text());
  } catch (error) {
    if (depth < 3 && error.name === 'AbortError') return fetchStreetSubtiles(bounds, depth + 1);
    throw new Error(`streets source subtile ${bbox} failed: ${error.name} ${error.message}`);
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchStreetSubtiles(bounds, depth) {
  const middleLatitude = (bounds.south + bounds.north) / 2;
  const middleLongitude = (bounds.west + bounds.east) / 2;
  const rows = [
    { south: bounds.south, west: bounds.west, north: middleLatitude, east: middleLongitude },
    { south: bounds.south, west: middleLongitude, north: middleLatitude, east: bounds.east },
    { south: middleLatitude, west: bounds.west, north: bounds.north, east: middleLongitude },
    { south: middleLatitude, west: middleLongitude, north: bounds.north, east: bounds.east },
  ];
  const elementById = new Map();
  for (const row of rows) {
    const source = await fetchStreetTile(row, depth);
    (source.elements || []).forEach((element) => elementById.set(`${element.type}:${element.id}`, element));
  }
  return { version: 0.6, generator: `OpenStreetMap API adaptive depth ${depth}`, elements: [...elementById.values()].sort((left, right) => left.id - right.id) };
}

function parseOsmXml(xml) {
  const nodes = new Map();
  for (const match of xml.matchAll(/<node\b([^>]*)>/g)) {
    const attributes = xmlAttributes(match[1]);
    if (attributes.id && attributes.lat && attributes.lon) nodes.set(attributes.id, { lat: Number(attributes.lat), lon: Number(attributes.lon) });
  }
  const allowed = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'residential', 'unclassified', 'service', 'living_street', 'pedestrian', 'cycleway']);
  const elements = [];
  for (const match of xml.matchAll(/<way\b([^>]*)>([\s\S]*?)<\/way>/g)) {
    const attributes = xmlAttributes(match[1]);
    const tags = {};
    for (const tagMatch of match[2].matchAll(/<tag\b([^>]*)\/>/g)) {
      const tag = xmlAttributes(tagMatch[1]);
      if (tag.k) tags[tag.k] = tag.v || '';
    }
    if (!allowed.has(tags.highway)) continue;
    const geometry = [...match[2].matchAll(/<nd\s+ref="(\d+)"\s*\/>/g)].map((row) => nodes.get(row[1])).filter(Boolean);
    if (geometry.length > 1) elements.push({ type: 'way', id: Number(attributes.id), tags, geometry });
  }
  return { version: 0.6, generator: 'OpenStreetMap API normalized by Simulatte', elements };
}

function xmlAttributes(source) {
  const attributes = {};
  for (const match of source.matchAll(/([:\w-]+)="([^"]*)"/g)) attributes[match[1]] = decodeXml(match[2]);
  return attributes;
}

function decodeXml(value) {
  return value.replaceAll('&quot;', '"').replaceAll('&apos;', "'").replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&');
}

function loadSnapshots(imports = {}) {
  return Object.fromEntries(Object.entries(SOURCE_FILES).map(([key, filename]) => {
    const file = imports[key] || (key === 'parks' ? PARK_SOURCE_FILE : path.join(SOURCE_DIR, filename));
    if (!fs.existsSync(file)) throw new Error(`Missing frozen source ${file}; pass all source inputs or use --refresh`);
    const sourceBytes = fs.readFileSync(file);
    const rawBytes = file.endsWith('.gz') ? zlib.gunzipSync(sourceBytes) : sourceBytes;
    return [key, { data: JSON.parse(rawBytes.toString('utf8')), rawBytes, contract: SOURCE_CONTRACTS[key] }];
  }));
}

function compileWorld(snapshots) {
  const project = createProjector(ORIGIN);
  const bikeNetwork = compileBikeNetwork(snapshots.bike.data, project);
  labelLandmarks(bikeNetwork, LANDMARKS, project);
  const parkNetwork = compileParkNetwork(snapshots.parks.data, {
    project,
    sourceContract: SOURCE_CONTRACTS.parks,
    snapshotDate: SNAPSHOT_DATE,
  });
  const network = {
    nodes: [...bikeNetwork.nodes, ...parkNetwork.nodes],
    segments: [...bikeNetwork.segments, ...parkNetwork.segments],
    nodesById: new Map([...bikeNetwork.nodes, ...parkNetwork.nodes].map((row) => [row.id, row])),
  };
  const origin = LANDMARKS.find((row) => row.label === DEFAULT_ROUTE.originLabel);
  const destination = LANDMARKS.find((row) => row.label === DEFAULT_ROUTE.destinationLabel);
  const route = shortestRoute(network, origin, destination, project, (segment) => {
    const travel = segment.lengthM / segment.speedLimitMps * routingPolicy.route.travelWeight;
    const risk = segment.riskScore * routingPolicy.route.riskWeight;
    const preference = segment.laneType === 'shared' ? routingPolicy.route.unprotectedPreferencePenalty : 0;
    return travel + risk + preference;
  });
  const scenario = buildScenario(route, network);
  const routeGeometry = route.segmentIds.flatMap((id) => network.segments.find((row) => row.id === id).geometry);
  const buildingCompilation = compileBuildings(snapshots.buildings.data, project, routeGeometry);
  const renderGeometry = {
    schema: 'simulatte.autonomyRenderGeometry.v1',
    coordinateSystem: 'local_cartesian_meters',
    land: compileLand(snapshots.land.data, project),
    parks: parkNetwork.renderGeometry,
    streets: compileVisualStreets(snapshots.streets.data, project),
    buildings: buildingCompilation.rows,
    buildingLodReceipt: buildingCompilation.receipt,
    bikeFacilities: compileBikeFacilities(snapshots.bike.data, project),
    claimBoundary: 'Building footprints, roof heights, bike facilities, park-property boundaries, streets, and land geometry preserve the frozen source snapshots. Park boundaries are not surveyed sidewalk centerlines. Render colors, widths, lighting, traffic actors, and signal timing are simulation presentation or policy assumptions.',
  };
  const sourceReceipts = Object.fromEntries(Object.entries(snapshots).map(([key, snapshot]) => [key, {
    ...snapshot.contract,
    snapshotDate: SNAPSHOT_DATE,
    rawSha256: sha256(snapshot.rawBytes),
    rawByteCount: snapshot.rawBytes.length,
  }]));
  const allPoints = [
    ...renderGeometry.streets.flatMap((row) => row.geometry),
    ...renderGeometry.parks.flatMap((row) => row.outerRing),
    ...renderGeometry.buildings.flatMap((row) => row.footprint),
    ...network.nodes.map((row) => row.position),
  ];
  return {
    schema: 'simulatte.autonomyWorld.v1',
    id: 'nyc-core-autonomy-v1',
    contentVersion: `nyc-core-autonomy-${SNAPSHOT_DATE}`,
    label: 'NYC core multimodal autonomy world',
    coordinateSystem: {
      kind: 'local_cartesian_meters',
      originLabel: `${ORIGIN.latitude},${ORIGIN.longitude}`,
      originWgs84: { longitude: ORIGIN.longitude, latitude: ORIGIN.latitude },
      bounds: boundsFor(allPoints, 30),
    },
    provenance: {
      sourceKind: 'compiled_open_data_snapshot',
      sourceId: 'simulatte-nyc-core-open-data-tile-v1',
      snapshotDate: SNAPSHOT_DATE,
      sources: sourceReceipts,
      compiler: 'tools/autonomy/build-nyc-autonomy-world.mjs',
      endpointSnapToleranceM: 3,
      claimBoundary: 'The street, bike, park-property, building, and land geometry is compiled from the named frozen sources. Park boundaries are not surveyed sidewalk centerlines. Traffic actors, signal timing, routing risk, simulated speed, and action outcomes are bounded simulation assumptions, not live conditions or physical autonomy evidence.',
    },
    nodes: network.nodes.sort(byId),
    segments: network.segments.sort(byId),
    circuits: parkNetwork.circuits,
    signals: scenario.signals,
    actors: scenario.actors,
    disruptions: scenario.disruptions,
    scenario: scenario.receipt,
    renderGeometry,
  };
}

function labelLandmarks(network, landmarks, project) {
  const claimedNodeIds = new Set();
  landmarks.forEach((landmark) => {
    const target = project([landmark.longitude, landmark.latitude]);
    const node = [...network.nodes]
      .filter((row) => !claimedNodeIds.has(row.id))
      .sort((left, right) => distance(left.position, target) - distance(right.position, target) || left.id.localeCompare(right.id))[0];
    if (!node) throw new Error(`No unique bike-network node available for ${landmark.label}`);
    node.label = landmark.label;
    node.kind = landmark.kind;
    node.landmark = {
      requestedWgs84: { longitude: landmark.longitude, latitude: landmark.latitude },
      snapDistanceM: round(distance(node.position, target)),
      source: 'scenario_place_grounding',
    };
    claimedNodeIds.add(node.id);
  });
}

function compileBikeNetwork(collection, project) {
  const rows = [];
  collection.features.forEach((feature) => {
    if (!feature || feature.properties?.status !== 'Current' || feature.geometry?.type !== 'MultiLineString') return;
    feature.geometry.coordinates.forEach((coordinates, partIndex) => {
      const cleaned = cleanCoordinatePairs(coordinates, project);
      if (cleaned.length < 2) return;
      rows.push({
        properties: feature.properties,
        partIndex,
        geometry: cleaned.map((row) => row.position),
        geometryWgs84: cleaned.map((row) => row.wgs84),
      });
    });
  });
  rows.sort((left, right) => sourceLineKey(left).localeCompare(sourceLineKey(right)));
  const endpoints = rows.flatMap((row, rowIndex) => [
    { rowIndex, side: 'from', point: row.geometry[0], wgs84: row.geometryWgs84[0] },
    { rowIndex, side: 'to', point: row.geometry.at(-1), wgs84: row.geometryWgs84.at(-1) },
  ]);
  const groups = clusterEndpoints(endpoints, 3);
  const nodeByEndpoint = new Map();
  const nodes = groups.map((group) => {
    const position = {
      x: round(group.reduce((sum, row) => sum + row.point.x, 0) / group.length),
      y: round(group.reduce((sum, row) => sum + row.point.y, 0) / group.length),
    };
    const positionWgs84 = {
      longitude: roundCoordinate(group.reduce((sum, row) => sum + row.wgs84.longitude, 0) / group.length),
      latitude: roundCoordinate(group.reduce((sum, row) => sum + row.wgs84.latitude, 0) / group.length),
    };
    const globalKey = `${SOURCE_CONTRACTS.bike.id}:${SNAPSHOT_DATE}:${positionWgs84.longitude.toFixed(7)},${positionWgs84.latitude.toFixed(7)}`;
    const id = `bike-node-${shortHash(globalKey, 12)}`;
    const streets = [...new Set(group.map((endpoint) => rows[endpoint.rowIndex].properties.street).filter(Boolean))].sort();
    const node = { id, label: streets.slice(0, 2).join(' / ') || id, kind: 'intersection', position, positionWgs84 };
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
    const sourceKey = `${SOURCE_CONTRACTS.bike.id}:${SNAPSHOT_DATE}:${properties.segmentid || 'none'}:${properties.bikeid || 'none'}:${row.partIndex}:${sourceLineKey(row)}`;
    if (forward) segments.push(networkSegment(sourceKey, 'ft', row.geometry, row.geometryWgs84, from, to, laneType, properties));
    if (reverse) segments.push(networkSegment(sourceKey, 'tf', [...row.geometry].reverse(), [...row.geometryWgs84].reverse(), to, from, laneType, properties));
  });
  const uniqueSegments = [...new Map(segments.map((row) => [row.id, row])).values()];
  const nodesById = new Map(nodes.map((row) => [row.id, row]));
  return { nodes, segments: uniqueSegments, nodesById };
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

function networkSegment(sourceKey, direction, sourceGeometry, sourceGeometryWgs84, from, to, laneType, properties) {
  const geometry = sourceGeometry.map((point) => ({ ...point }));
  geometry[0] = { ...from.position };
  geometry[geometry.length - 1] = { ...to.position };
  return {
    id: `bike-${shortHash(`${sourceKey}:${direction}`, 12)}-${direction}`,
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
      sourceRevision: SNAPSHOT_DATE,
      geometryWgs84Sha256: sha256(Buffer.from(JSON.stringify(sourceGeometryWgs84))),
    },
  };
}

function shortestRoute(network, origin, destination, project, scoreSegment = (segment) => segment.lengthM) {
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
      const candidate = currentDistance + scoreSegment(segment);
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
  const distanceM = segmentIds.reduce((sum, id) => sum + network.segments.find((row) => row.id === id).lengthM, 0);
  return { nodeIds, segmentIds, distanceM: round(distanceM) };
}

function buildScenario(route, network) {
  const routeSegments = route.segmentIds.map((id) => network.segments.find((row) => row.id === id));
  const signalEdgeIndex = Math.min(3, routeSegments.length - 1);
  const signalSegment = routeSegments[signalEdgeIndex];
  const actorEdgeIndex = segmentIndexAtDistanceRatio(routeSegments, 0.45);
  const actorSegment = routeSegments[actorEdgeIndex];
  const actorCenter = pointAlong(actorSegment.geometry, 0.5);
  const tangent = segmentTangent(actorSegment.geometry);
  const normal = { x: -tangent.y, y: tangent.x };
  const actorCenterTick = estimatedRouteTick(routeSegments, actorEdgeIndex, 0.5);
  const actorStartTick = Math.max(0, actorCenterTick - 14);
  const actorEndTick = actorCenterTick + 18;
  const eventActorEdgeIndex = Math.max(actorEdgeIndex + 1, segmentIndexAtDistanceRatio(routeSegments, 0.72));
  const eventActorSegment = routeSegments[eventActorEdgeIndex];
  const eventActorCenter = pointAlong(eventActorSegment.geometry, 0.5);
  const eventActorTangent = segmentTangent(eventActorSegment.geometry);
  const eventActorNormal = { x: -eventActorTangent.y, y: eventActorTangent.x };
  const eventActorStartTick = estimatedRouteTick(routeSegments, eventActorEdgeIndex, 0);
  const eventActorDurationTicks = 18;
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
    activeFromTick: actorStartTick,
    activeUntilTick: actorEndTick,
    path: [offset(actorCenter, normal, -14), offset(actorCenter, normal, 14)],
    radiusM: 0.6,
    cardIds: ['behavior.pedestrian-yield'],
    provenance: { kind: 'simulation_assumption', source: 'scenario authoring', isLiveCondition: false },
  }, {
    id: 'assumed-pedestrian-route-2',
    type: 'pedestrian',
    activeFromTick: eventActorStartTick,
    activeUntilTick: eventActorStartTick + eventActorDurationTicks - 1,
    path: [offset(eventActorCenter, eventActorNormal, -10), offset(eventActorCenter, eventActorNormal, 10)],
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
      defaultMissionText: 'Deliver the parcel by bike from Union Square to North Williamsburg. Prefer protected lanes and yield to pedestrians.',
      defaultRoute: { algorithm: 'dijkstra_policy_cost_equivalent', ...route },
      eventActorTriggerNodeId: eventActorSegment.fromNodeId,
      eventActorDurationTicks,
      modeledAssumptions: ['signal_timing', 'time_triggered_pedestrian_path', 'event_triggered_pedestrian_path', 'bike_speed_limits', 'lane_risk_scores'],
      liveConditionsUsed: false,
    },
  };
}

function estimatedRouteTick(routeSegments, segmentIndex, segmentRatio) {
  const distanceM = routeSegments.slice(0, segmentIndex).reduce((sum, row) => sum + row.lengthM, 0)
    + routeSegments[segmentIndex].lengthM * segmentRatio;
  return Math.round(distanceM / 5.9);
}

function segmentIndexAtDistanceRatio(routeSegments, ratio) {
  const targetM = routeSegments.reduce((sum, row) => sum + row.lengthM, 0) * ratio;
  let traversedM = 0;
  for (let index = 0; index < routeSegments.length; index += 1) {
    traversedM += routeSegments[index].lengthM;
    if (traversedM >= targetM) return index;
  }
  return routeSegments.length - 1;
}

function compileBuildings(collection, project, routeGeometry) {
  const buildings = [];
  collection.features.forEach((feature) => {
    if (!feature || !['Polygon', 'MultiPolygon'].includes(feature.geometry?.type)) return;
    const polygons = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
    polygons.forEach((polygon, partIndex) => {
      const footprint = simplifyRing(polygon[0].map(project), 0.8);
      if (footprint.length < 4 || Math.abs(polygonArea(footprint)) < 5) return;
      const areaM2 = Math.abs(polygonArea(footprint));
      const centroid = ringCentroid(footprint);
      buildings.push({
        id: `building-${feature.properties?.objectid || feature.properties?.doitt_id || hash32(JSON.stringify(polygon[0]))}-${partIndex}`,
        footprint,
        heightM: round(clamp(Number(feature.properties?.height_roof || 24) * 0.3048, 3, 360)),
        groundElevationM: round(Number(feature.properties?.ground_elevation || 0) * 0.3048),
        sourceObjectId: String(feature.properties?.objectid || ''),
        sourceBin: feature.properties?.bin || null,
        omittedInteriorRingCount: Math.max(0, polygon.length - 1),
        areaM2: round(areaM2),
        centroid,
      });
    });
  });
  const focusPoints = [
    [-74.009, 40.733],
    [-73.9903, 40.7359],
    [-73.9815, 40.7295],
    [-73.9563, 40.7183],
    [-73.9505, 40.7335],
  ].map(project);
  const maximumRows = 8500;
  const ranked = buildings.map((row) => {
    const routeDistanceM = distanceToPolyline(row.centroid, routeGeometry);
    const focusDistanceM = Math.min(...focusPoints.map((point) => distance(row.centroid, point)));
    const importance = Math.min(routeDistanceM, focusDistanceM * 0.82) - row.heightM * 2.4 - Math.sqrt(row.areaM2) * 1.2;
    return { row, routeDistanceM, focusDistanceM, importance };
  }).sort((left, right) => left.importance - right.importance || right.row.heightM - left.row.heightM || left.row.id.localeCompare(right.row.id));
  const selected = ranked.slice(0, maximumRows).map(({ row, routeDistanceM, focusDistanceM }) => ({
    ...row,
    lod: 'source_footprint',
    routeDistanceM: round(routeDistanceM),
    focusDistanceM: round(focusDistanceM),
  })).sort(byId);
  return {
    rows: selected,
    receipt: {
      schema: 'simulatte.autonomyBuildingLodReceipt.v1',
      sourceFeatureCount: buildings.length,
      retainedFeatureCount: selected.length,
      omittedFeatureCount: buildings.length - selected.length,
      maximumRetainedFeatures: maximumRows,
      policy: 'nearest_to_default_route_or_named_focus_center_then_height_and_area',
      fullCoverageClaim: false,
    },
  };
}

function ringCentroid(points) {
  const rows = points.length > 1 && distance(points[0], points.at(-1)) < 0.001 ? points.slice(0, -1) : points;
  return {
    x: round(rows.reduce((sum, point) => sum + point.x, 0) / rows.length),
    y: round(rows.reduce((sum, point) => sum + point.y, 0) / rows.length),
  };
}

function distanceToPolyline(point, points) {
  let minimum = Infinity;
  for (let index = 1; index < points.length; index += 1) minimum = Math.min(minimum, pointLineDistance(point, points[index - 1], points[index]));
  return minimum;
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
      id: `facility-${feature.properties.segmentid || feature.properties.bikeid}-${partIndex}-${shortHash(JSON.stringify(line), 10)}`,
      laneType: laneTypeFor(feature.properties),
      street: feature.properties.street || null,
      facilityClass: feature.properties.facilitycl || null,
      geometry: simplifyLine(line.map(project), 0.35),
    }));
  });
  return [...new Map(facilities.filter((row) => row.geometry.length > 1).map((row) => [row.id, row])).values()].sort(byId);
}

function compileLand(collection, project) {
  const polygons = [];
  collection.features.forEach((feature) => {
    const rows = feature.geometry?.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry?.type === 'MultiPolygon' ? feature.geometry.coordinates : [];
    rows.forEach((polygon, index) => {
      const ring = clipRingToBounds(polygon[0], TILE).map(project);
      const simplified = simplifyRing(ring, 2);
      if (simplified.length >= 4 && Math.abs(polygonArea(simplified)) > 100) {
        polygons.push({ id: `nyc-land-${feature.properties?.borocode || 'unknown'}-${index}`, outerRing: simplified });
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

function cleanCoordinatePairs(coordinates, project) {
  return coordinates.map(([longitude, latitude]) => ({
    position: project([longitude, latitude]),
    wgs84: { longitude: roundCoordinate(longitude), latitude: roundCoordinate(latitude) },
  })).filter((row, index, rows) => index === 0 || distance(row.position, rows[index - 1].position) > 0.001);
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
  let minimumX = Infinity;
  let minimumY = Infinity;
  let maximumX = -Infinity;
  let maximumY = -Infinity;
  points.forEach((row) => {
    minimumX = Math.min(minimumX, row.x);
    minimumY = Math.min(minimumY, row.y);
    maximumX = Math.max(maximumX, row.x);
    maximumY = Math.max(maximumY, row.y);
  });
  return {
    minimumX: round(minimumX - padding),
    minimumY: round(minimumY - padding),
    maximumX: round(maximumX + padding),
    maximumY: round(maximumY + padding),
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
  return `${row.properties.segmentid || ''}:${row.properties.bikeid || ''}:${row.partIndex}:${row.geometryWgs84.map((point) => `${point.longitude.toFixed(7)},${point.latitude.toFixed(7)}`).join(';')}`;
}

function endpointKey(row) {
  return `${row.wgs84.longitude.toFixed(7)},${row.wgs84.latitude.toFixed(7)}:${row.rowIndex}:${row.side}`;
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

function roundCoordinate(value) {
  return Number(Number(value).toFixed(7));
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

function shortHash(value, length) {
  return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, length);
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
