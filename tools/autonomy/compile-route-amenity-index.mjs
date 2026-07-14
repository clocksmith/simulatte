#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SOURCE_DIR = path.join(ROOT, 'tools/autonomy/data-sources/nyc-bicycle-parking-2026-07-13');
const SOURCE_FILE = path.join(SOURCE_DIR, 'nyc-bicycle-parking.geojson');
const SOURCE_RECEIPT = path.join(SOURCE_DIR, 'snapshot-receipt.json');
const WORLD_FILE = path.join(ROOT, 'public/data/autonomy/worlds/nyc-core-autonomy-v1.json');
const OUTPUT_FILE = path.join(ROOT, 'public/data/autonomy/route-amenity-index-v1.json');
const CELL_SIZE_M = 100;
const SEARCH_RADIUS_M = 400;
const SAMPLE_INTERVAL_M = 20;

function compileRouteAmenityIndex() {
  const sourceBytes = fs.readFileSync(SOURCE_FILE);
  const receiptBytes = fs.readFileSync(SOURCE_RECEIPT);
  const worldBytes = fs.readFileSync(WORLD_FILE);
  const source = JSON.parse(sourceBytes.toString('utf8'));
  const receipt = JSON.parse(receiptBytes.toString('utf8'));
  const world = JSON.parse(worldBytes.toString('utf8'));
  const receiptFile = receipt.files.find((row) => row.output === 'nyc-bicycle-parking.geojson');
  if (!receiptFile || receiptFile.sha256 !== sha256(sourceBytes)) throw new Error('Bicycle-parking source receipt does not match source bytes');
  const origin = world.coordinateSystem.originWgs84;
  const racks = source.features.map((feature) => rackRow(feature, project(feature.geometry.coordinates, origin)))
    .filter((row) => Number.isFinite(row.position.x) && Number.isFinite(row.position.y))
    .sort((left, right) => left.id.localeCompare(right.id));
  const grid = buildGrid(racks);
  const segmentRows = world.segments.map((segment) => segmentAmenityRow(segment, grid)).sort((left, right) => left.segmentId.localeCompare(right.segmentId));
  return {
    schema: 'simulatte.autonomyRouteAmenityIndex.v1',
    id: 'nyc-bicycle-parking-route-amenity-v1',
    contentVersion: '2026-07-13',
    world: { id: world.id, contentVersion: world.contentVersion, sha256: sha256(worldBytes) },
    source: {
      datasetId: 'nyc-bicycle-parking',
      authority: 'NYC Department of Transportation',
      sourceReceiptSha256: sha256(receiptBytes),
      sourceBytesSha256: sha256(sourceBytes),
      sourceFeatureCount: source.features.length,
    },
    method: {
      id: 'route_polyline_nearest_bike_rack_v1',
      sampleIntervalM: SAMPLE_INTERVAL_M,
      searchRadiusM: SEARCH_RADIUS_M,
      spatialIndexCellM: CELL_SIZE_M,
    },
    counts: {
      sourceRacks: racks.length,
      routeSegments: segmentRows.length,
      segmentsWithRackWithin200M: segmentRows.filter((row) => row.maximumNearestRackDistanceM !== null && row.maximumNearestRackDistanceM <= 200).length,
      segmentsWithoutRackInSearchRadius: segmentRows.filter((row) => row.maximumNearestRackDistanceM === null).length,
    },
    segmentRows,
    claimBoundary: 'This index proves geometric proximity to listed bicycle-parking sites in a frozen source snapshot. It does not prove free capacity, current availability, security, condition, or legal parking access.',
  };
}

function segmentAmenityRow(segment, grid) {
  const samples = samplePolyline(segment.geometry, SAMPLE_INTERVAL_M);
  const nearest = samples.map((point) => nearestRack(point, grid));
  const unresolved = nearest.some((row) => row === null);
  const worst = unresolved ? null : nearest.sort((left, right) => right.distanceM - left.distanceM || left.rack.id.localeCompare(right.rack.id))[0];
  return {
    segmentId: segment.id,
    sampleCount: samples.length,
    maximumNearestRackDistanceM: worst ? round(worst.distanceM) : null,
    limitingRackId: worst?.rack.id || null,
    limitingRackSiteId: worst?.rack.siteId || null,
  };
}

function samplePolyline(points, intervalM) {
  const samples = [{ ...points[0] }];
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1];
    const to = points[index];
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    const count = Math.floor(length / intervalM);
    for (let step = 1; step <= count; step += 1) {
      const ratio = Math.min(1, step * intervalM / length);
      samples.push({ x: from.x + (to.x - from.x) * ratio, y: from.y + (to.y - from.y) * ratio });
    }
    samples.push({ ...to });
  }
  return samples;
}

function buildGrid(racks) {
  const grid = new Map();
  racks.forEach((rack) => {
    const key = gridKey(rack.position);
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(rack);
  });
  return grid;
}

function nearestRack(point, grid) {
  const centerX = Math.floor(point.x / CELL_SIZE_M);
  const centerY = Math.floor(point.y / CELL_SIZE_M);
  const extent = Math.ceil(SEARCH_RADIUS_M / CELL_SIZE_M);
  const candidates = [];
  for (let dx = -extent; dx <= extent; dx += 1) for (let dy = -extent; dy <= extent; dy += 1) {
    candidates.push(...(grid.get(`${centerX + dx},${centerY + dy}`) || []));
  }
  return candidates.map((rack) => ({ rack, distanceM: Math.hypot(point.x - rack.position.x, point.y - rack.position.y) }))
    .filter((row) => row.distanceM <= SEARCH_RADIUS_M)
    .sort((left, right) => left.distanceM - right.distanceM || left.rack.id.localeCompare(right.rack.id))[0] || null;
}

function rackRow(feature, position) {
  const row = feature.properties || {};
  const identity = row.site_id || row.group_id || sha256(Buffer.from(JSON.stringify(feature.geometry))).slice(0, 16);
  return {
    id: `bike-rack-${identity}`,
    siteId: row.site_id || null,
    groupId: row.group_id || null,
    rackType: row.racktype || null,
    installedAt: row.date_inst || null,
    address: row.ifoaddress || null,
    street: row.onstreet || null,
    position,
  };
}

function project(point, origin) {
  const longitudeScale = Math.cos(origin.latitude * Math.PI / 180) * 111320;
  return { x: (Number(point[0]) - origin.longitude) * longitudeScale, y: (Number(point[1]) - origin.latitude) * 110540 };
}

function gridKey(position) {
  return `${Math.floor(position.x / CELL_SIZE_M)},${Math.floor(position.y / CELL_SIZE_M)}`;
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function round(value) {
  return Number(value.toFixed(6));
}

const index = compileRouteAmenityIndex();
const text = `${JSON.stringify(index, null, 2)}\n`;
if (process.argv.includes('--check')) {
  if (!fs.existsSync(OUTPUT_FILE) || fs.readFileSync(OUTPUT_FILE, 'utf8') !== text) throw new Error('Route-amenity index is stale; run compile-route-amenity-index.mjs');
  console.log(`AUTONOMY-AMENITIES status=verified racks=${index.counts.sourceRacks} segments=${index.counts.routeSegments}`);
} else {
  fs.writeFileSync(OUTPUT_FILE, text);
  console.log(`AUTONOMY-AMENITIES status=written racks=${index.counts.sourceRacks} segments=${index.counts.routeSegments} output=${OUTPUT_FILE}`);
}

export { compileRouteAmenityIndex, samplePolyline };
