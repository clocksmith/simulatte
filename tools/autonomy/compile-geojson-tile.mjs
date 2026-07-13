#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const TOOL_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(TOOL_DIR, '../..');
const require = createRequire(import.meta.url);
const contracts = require('../../public/autonomy/contracts/contract-validator.js');
const FEATURE_CATALOG = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/autonomy/feature-cards-v1.json'), 'utf8'));

function parseArgs(argv) {
  const options = { input: '', output: '', sourceId: '', snapshotDate: '', worldId: '', coordinates: 'wgs84' };
  for (let index = 0; index < argv.length; index += 1) {
    const [key, inline] = argv[index].split('=');
    const value = () => inline ?? argv[++index];
    if (key === '--input') options.input = path.resolve(value());
    else if (key === '--output') options.output = path.resolve(value());
    else if (key === '--source-id') options.sourceId = value();
    else if (key === '--snapshot-date') options.snapshotDate = value();
    else if (key === '--world-id') options.worldId = value();
    else if (key === '--coordinates') options.coordinates = value();
    else if (key === '--help') {
      console.log('usage: node tools/autonomy/compile-geojson-tile.mjs --input FILE --output FILE --source-id ID --snapshot-date YYYY-MM-DD --world-id ID [--coordinates wgs84|local]');
      process.exit(0);
    } else throw new Error(`Unknown argument: ${argv[index]}`);
  }
  ['input', 'output', 'sourceId', 'snapshotDate', 'worldId'].forEach((key) => {
    if (!options[key]) throw new Error(`Missing required --${key.replace(/[A-Z]/g, (row) => `-${row.toLowerCase()}`)}`);
  });
  if (!['wgs84', 'local'].includes(options.coordinates)) throw new Error(`--coordinates expected wgs84 or local, received ${options.coordinates}`);
  return options;
}

function compileGeoJsonTile(collection, options) {
  if (!collection || collection.type !== 'FeatureCollection' || !Array.isArray(collection.features)) {
    throw new Error('GeoJSON input expected a FeatureCollection');
  }
  const lines = collection.features.filter((feature) => feature && feature.geometry && feature.geometry.type === 'LineString');
  if (!lines.length) throw new Error('GeoJSON input expected at least one LineString feature');
  const firstCoordinate = lines[0].geometry.coordinates[0];
  const project = coordinateProjector(firstCoordinate, options.coordinates);
  const nodesByCoordinate = new Map();
  const nodes = [];
  const nodeFor = (coordinate, explicitId, label, kind = 'intersection') => {
    const point = project(coordinate);
    const coordinateKey = `${point.x.toFixed(6)},${point.y.toFixed(6)}`;
    if (nodesByCoordinate.has(coordinateKey)) return nodesByCoordinate.get(coordinateKey);
    const id = explicitId || `node-${hash32(coordinateKey).toString(16).padStart(8, '0')}`;
    const node = { id, label: label || id, kind, position: point };
    nodesByCoordinate.set(coordinateKey, node);
    nodes.push(node);
    return node;
  };
  const segments = lines.map((feature, index) => {
    const properties = feature.properties || {};
    const coordinates = feature.geometry.coordinates;
    if (coordinates.length < 2) throw new Error(`Feature ${index} LineString expected at least two coordinates`);
    const from = nodeFor(coordinates[0], properties.fromNodeId, properties.fromLabel, properties.fromKind);
    const to = nodeFor(coordinates.at(-1), properties.toNodeId, properties.toLabel, properties.toKind);
    const geometry = coordinates.map(project);
    const lengthM = polylineLength(geometry);
    const laneType = properties.laneType || 'shared';
    if (!['protected', 'shared', 'connector'].includes(laneType)) throw new Error(`Feature ${index} laneType expected protected, shared, or connector`);
    return {
      id: properties.id || `segment-${String(index + 1).padStart(5, '0')}`,
      fromNodeId: from.id,
      toNodeId: to.id,
      geometry,
      lengthM: round(lengthM),
      laneType,
      allowedModes: Array.isArray(properties.allowedModes) ? properties.allowedModes : ['delivery_bike'],
      speedLimitMps: finiteOr(properties.speedLimitMps, 6),
      riskScore: finiteOr(properties.riskScore, 0),
      cardIds: [laneType === 'protected' ? 'street.protected-lane' : laneType === 'connector' ? 'street.connector' : 'street.shared-lane'],
    };
  });
  const positions = nodes.map((row) => row.position);
  const world = {
    schema: 'simulatte.autonomyWorld.v1',
    id: options.worldId,
    contentVersion: `${options.worldId}-${options.snapshotDate}`,
    label: options.worldId,
    coordinateSystem: {
      kind: 'local_cartesian_meters',
      originLabel: options.coordinates === 'wgs84' ? `${firstCoordinate[1]},${firstCoordinate[0]}` : 'source local origin',
      bounds: {
        minimumX: Math.min(...positions.map((row) => row.x)),
        minimumY: Math.min(...positions.map((row) => row.y)),
        maximumX: Math.max(...positions.map((row) => row.x)),
        maximumY: Math.max(...positions.map((row) => row.y)),
      },
    },
    provenance: {
      sourceKind: 'open_dataset_snapshot',
      sourceId: options.sourceId,
      snapshotDate: options.snapshotDate,
      claimBoundary: 'This artifact preserves the supplied line geometry and declared properties. It does not infer missing traffic controls, actors, disruptions, or legal rules.',
    },
    nodes: nodes.sort((left, right) => left.id.localeCompare(right.id)),
    segments: segments.sort((left, right) => left.id.localeCompare(right.id)),
    signals: [],
    actors: [],
    disruptions: [],
  };
  contracts.validateWorld(world, FEATURE_CATALOG);
  return world;
}

function coordinateProjector(origin, kind) {
  if (kind === 'local') return ([x, y]) => ({ x: round(Number(x)), y: round(Number(y)) });
  const [originLongitude, originLatitude] = origin.map(Number);
  const longitudeScale = Math.cos(originLatitude * Math.PI / 180) * 111320;
  return ([longitude, latitude]) => ({
    x: round((Number(longitude) - originLongitude) * longitudeScale),
    y: round((Number(latitude) - originLatitude) * 110540),
  });
}

function polylineLength(points) {
  let length = 0;
  for (let index = 1; index < points.length; index += 1) length += Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y);
  return length;
}

function finiteOr(value, fallback) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function hash32(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function round(value) {
  return Number(value.toFixed(6));
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortValue(value[key])]));
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const collection = JSON.parse(fs.readFileSync(options.input, 'utf8'));
  const world = compileGeoJsonTile(collection, options);
  fs.mkdirSync(path.dirname(options.output), { recursive: true });
  fs.writeFileSync(options.output, `${JSON.stringify(sortValue(world), null, 2)}\n`);
  console.log(`AUTONOMY-GEOJSON world=${world.id} nodes=${world.nodes.length} segments=${world.segments.length} output=${options.output}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error && error.stack || error);
    process.exit(1);
  }
}

export { compileGeoJsonTile, coordinateProjector };
