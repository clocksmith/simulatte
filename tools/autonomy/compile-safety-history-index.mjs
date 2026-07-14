#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SOURCE_DIR = path.join(ROOT, 'tools/autonomy/data-sources/nyc-safety-history-2025-07-to-2026-07');
const SOURCE_RECEIPT = path.join(SOURCE_DIR, 'snapshot-receipt.json');
const WORLD_FILE = path.join(ROOT, 'public/data/autonomy/worlds/nyc-core-autonomy-v1.json');
const OUTPUT_FILE = path.join(ROOT, 'public/data/autonomy/safety-history-index-v1.json');
const CELL_SIZE_M = 50;
const MAXIMUM_JOIN_DISTANCE_M = 35;

function compileSafetyHistoryIndex() {
  const receiptBytes = fs.readFileSync(SOURCE_RECEIPT);
  const receipt = JSON.parse(receiptBytes.toString('utf8'));
  const worldBytes = fs.readFileSync(WORLD_FILE);
  const world = JSON.parse(worldBytes.toString('utf8'));
  const sourceFiles = receipt.files.slice().sort((left, right) => left.output.localeCompare(right.output));
  const sourceRows = sourceFiles.flatMap((file) => readVerifiedSource(file));
  const physicalSegments = physicalSegmentRows(world.segments);
  const grid = buildSegmentGrid(physicalSegments);
  const joined = [];
  const unjoinedCollisionIds = [];
  sourceRows.forEach((row) => {
    const point = projectCrash(row, world.coordinateSystem.originWgs84);
    const match = point && nearestSegment(point, grid);
    if (!match) {
      unjoinedCollisionIds.push(String(row.collision_id));
      return;
    }
    joined.push({ row, physicalKey: match.segment.physicalKey, distanceM: match.distanceM });
  });
  const statsByPhysicalKey = aggregateJoinedRows(joined);
  const segmentRows = physicalSegments.flatMap((physical) => {
    const stats = statsByPhysicalKey.get(physical.physicalKey);
    if (!stats) return [];
    return physical.segmentIds.map((segmentId) => ({
      segmentId,
      physicalKey: physical.physicalKey,
      ...stats,
    }));
  }).sort((left, right) => left.segmentId.localeCompare(right.segmentId));
  const monthlyCounts = monthHistogram(sourceRows);
  const hourOfWeekCounts = hourHistogram(sourceRows);
  return {
    schema: 'simulatte.autonomySafetyHistoryIndex.v1',
    id: 'nyc-crash-history-2025-07-to-2026-07-v1',
    contentVersion: '2026-07-13',
    world: { id: world.id, contentVersion: world.contentVersion, sha256: sha256(worldBytes) },
    source: {
      datasetId: 'nyc-motor-vehicle-crashes',
      authority: 'New York City Police Department',
      periodStart: '2025-07-01',
      periodEndExclusive: '2026-07-01',
      sourceReceiptSha256: sha256(receiptBytes),
      sourceFileSha256: Object.fromEntries(sourceFiles.map((row) => [row.output, row.sha256])),
    },
    method: {
      id: 'nearest_physical_route_segment_within_35m_v1',
      maximumJoinDistanceM: MAXIMUM_JOIN_DISTANCE_M,
      spatialIndexCellM: CELL_SIZE_M,
      severityFormula: 'crashes + 4*injuries + 25*fatalities',
      exposureDenominator: null,
      routeUse: 'optional_historical_observation_penalty_challenger',
    },
    counts: {
      sourceCrashes: sourceRows.length,
      joinedCrashes: joined.length,
      unjoinedCrashes: unjoinedCollisionIds.length,
      physicalRouteSegments: physicalSegments.length,
      physicalSegmentsWithHistory: statsByPhysicalKey.size,
      directedSegmentsWithHistory: segmentRows.length,
      personsInjured: sum(sourceRows, 'number_of_persons_injured'),
      personsKilled: sum(sourceRows, 'number_of_persons_killed'),
    },
    monthlyCounts,
    hourOfWeekCounts,
    unjoinedCollisionIds: unjoinedCollisionIds.sort(),
    segmentRows,
    claimBoundary: 'This index spatially joins one frozen year of reported NYPD crashes to the nearest governed route geometry. It has no traffic, trip, distance, or population exposure denominator, so it supports historical-observation counterfactuals only. It does not prove causality, predict live risk, rank a safest route, or establish that an unobserved segment is safe.',
  };

  function readVerifiedSource(file) {
    const bytes = fs.readFileSync(path.join(SOURCE_DIR, file.output));
    if (bytes.length !== file.byteCount || sha256(bytes) !== file.sha256) throw new Error(`Crash-history source receipt mismatch for ${file.output}`);
    const rows = JSON.parse(bytes.toString('utf8'));
    if (!Array.isArray(rows)) throw new Error(`Crash-history source ${file.output} expected an array`);
    return rows;
  }
}

function physicalSegmentRows(segments) {
  const groups = new Map();
  segments.forEach((segment) => {
    if (!segment.geometry?.length || segment.id.startsWith('park-')) return;
    const key = physicalSegmentKey(segment);
    if (!groups.has(key)) groups.set(key, { physicalKey: key, segmentIds: [], geometry: canonicalGeometry(segment.geometry) });
    groups.get(key).segmentIds.push(segment.id);
  });
  return [...groups.values()].map((row) => ({ ...row, segmentIds: row.segmentIds.sort() })).sort((left, right) => left.physicalKey.localeCompare(right.physicalKey));
}

function physicalSegmentKey(segment) {
  const source = segment.source || {};
  if (source.wayId) return `${source.datasetId}:way:${source.wayId}:part:${source.partIndex ?? 0}`;
  if (source.segmentId || source.bikeId) return `${source.datasetId}:segment:${source.segmentId || 'none'}:bike:${source.bikeId || 'none'}`;
  const geometry = canonicalGeometry(segment.geometry);
  return `geometry:${sha256(Buffer.from(JSON.stringify(geometry))).slice(0, 24)}`;
}

function canonicalGeometry(geometry) {
  const forward = geometry.map((point) => [round(point.x), round(point.y)]);
  const reverse = [...forward].reverse();
  return JSON.stringify(forward) <= JSON.stringify(reverse) ? forward : reverse;
}

function buildSegmentGrid(segments) {
  const grid = new Map();
  segments.forEach((segment) => {
    const bounds = segment.geometry.reduce((row, point) => ({
      minimumX: Math.min(row.minimumX, point[0]), maximumX: Math.max(row.maximumX, point[0]),
      minimumY: Math.min(row.minimumY, point[1]), maximumY: Math.max(row.maximumY, point[1]),
    }), { minimumX: Infinity, maximumX: -Infinity, minimumY: Infinity, maximumY: -Infinity });
    for (let x = Math.floor((bounds.minimumX - MAXIMUM_JOIN_DISTANCE_M) / CELL_SIZE_M); x <= Math.floor((bounds.maximumX + MAXIMUM_JOIN_DISTANCE_M) / CELL_SIZE_M); x += 1) {
      for (let y = Math.floor((bounds.minimumY - MAXIMUM_JOIN_DISTANCE_M) / CELL_SIZE_M); y <= Math.floor((bounds.maximumY + MAXIMUM_JOIN_DISTANCE_M) / CELL_SIZE_M); y += 1) {
        const key = `${x},${y}`;
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key).push(segment);
      }
    }
  });
  return grid;
}

function nearestSegment(point, grid) {
  const rows = grid.get(`${Math.floor(point.x / CELL_SIZE_M)},${Math.floor(point.y / CELL_SIZE_M)}`) || [];
  return rows.map((segment) => ({ segment, distanceM: pointToPolylineDistance(point, segment.geometry) }))
    .filter((row) => row.distanceM <= MAXIMUM_JOIN_DISTANCE_M)
    .sort((left, right) => left.distanceM - right.distanceM || left.segment.physicalKey.localeCompare(right.segment.physicalKey))[0] || null;
}

function pointToPolylineDistance(point, geometry) {
  let minimum = Infinity;
  for (let index = 1; index < geometry.length; index += 1) minimum = Math.min(minimum, pointToSegmentDistance(point, geometry[index - 1], geometry[index]));
  return minimum;
}

function pointToSegmentDistance(point, from, to) {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const lengthSquared = dx * dx + dy * dy;
  const ratio = lengthSquared ? Math.max(0, Math.min(1, ((point.x - from[0]) * dx + (point.y - from[1]) * dy) / lengthSquared)) : 0;
  return Math.hypot(point.x - (from[0] + dx * ratio), point.y - (from[1] + dy * ratio));
}

function aggregateJoinedRows(rows) {
  const grouped = new Map();
  rows.forEach(({ row, physicalKey, distanceM }) => {
    if (!grouped.has(physicalKey)) grouped.set(physicalKey, { rows: [], distances: [] });
    grouped.get(physicalKey).rows.push(row);
    grouped.get(physicalKey).distances.push(distanceM);
  });
  return new Map([...grouped].map(([key, value]) => {
    const crashes = value.rows.length;
    const injuries = sum(value.rows, 'number_of_persons_injured');
    const fatalities = sum(value.rows, 'number_of_persons_killed');
    return [key, {
      crashCount: crashes,
      injuryCount: injuries,
      fatalityCount: fatalities,
      pedestrianInjuryCount: sum(value.rows, 'number_of_pedestrians_injured'),
      cyclistInjuryCount: sum(value.rows, 'number_of_cyclist_injured'),
      motoristInjuryCount: sum(value.rows, 'number_of_motorist_injured'),
      historicalObservationScore: crashes + 4 * injuries + 25 * fatalities,
      maximumJoinDistanceM: round(Math.max(...value.distances)),
      collisionIds: value.rows.map((row) => String(row.collision_id)).sort(),
    }];
  }));
}

function monthHistogram(rows) {
  const counts = new Map();
  rows.forEach((row) => {
    const month = String(row.crash_date || '').slice(0, 7);
    if (/^\d{4}-\d{2}$/.test(month)) counts.set(month, (counts.get(month) || 0) + 1);
  });
  return [...counts].sort().map(([month, crashCount]) => ({ month, crashCount }));
}

function hourHistogram(rows) {
  const counts = Array.from({ length: 168 }, (_, hourOfWeek) => ({ hourOfWeek, crashCount: 0 }));
  rows.forEach((row) => {
    const date = new Date(row.crash_date);
    const hour = Number.parseInt(String(row.crash_time || '').split(':')[0], 10);
    if (!Number.isFinite(date.getTime()) || !Number.isInteger(hour) || hour < 0 || hour > 23) return;
    counts[date.getUTCDay() * 24 + hour].crashCount += 1;
  });
  return counts;
}

function projectCrash(row, origin) {
  const longitude = Number(row.longitude);
  const latitude = Number(row.latitude);
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;
  const longitudeScale = Math.cos(origin.latitude * Math.PI / 180) * 111320;
  return { x: (longitude - origin.longitude) * longitudeScale, y: (latitude - origin.latitude) * 110540 };
}

function sum(rows, key) {
  return rows.reduce((total, row) => total + (Number(row[key]) || 0), 0);
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function round(value) {
  return Number(value.toFixed(6));
}

const index = compileSafetyHistoryIndex();
const text = `${JSON.stringify(index, null, 2)}\n`;
if (process.argv.includes('--check')) {
  if (!fs.existsSync(OUTPUT_FILE) || fs.readFileSync(OUTPUT_FILE, 'utf8') !== text) throw new Error('Safety-history index is stale; run compile-safety-history-index.mjs');
  console.log(`AUTONOMY-SAFETY-HISTORY status=verified crashes=${index.counts.sourceCrashes} joined=${index.counts.joinedCrashes} segments=${index.counts.directedSegmentsWithHistory}`);
} else {
  fs.writeFileSync(OUTPUT_FILE, text);
  console.log(`AUTONOMY-SAFETY-HISTORY status=written crashes=${index.counts.sourceCrashes} joined=${index.counts.joinedCrashes} segments=${index.counts.directedSegmentsWithHistory} output=${OUTPUT_FILE}`);
}

export { compileSafetyHistoryIndex, pointToPolylineDistance };
