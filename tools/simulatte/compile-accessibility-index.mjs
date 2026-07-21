#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SOURCE_DIR = path.join(ROOT, 'tools/simulatte/data-sources/nyc-pedestrian-ramps-2026-07-13');
const SOURCE_FILE = path.join(SOURCE_DIR, 'nyc-pedestrian-ramps.geojson');
const SOURCE_RECEIPT = path.join(SOURCE_DIR, 'snapshot-receipt.json');
const WORLD_FILE = path.join(ROOT, 'public/data/simulatte/worlds/nyc-core-autonomy-v1.json');
const OUTPUT_FILE = path.join(ROOT, 'public/data/simulatte/accessibility-index-v1.json');
const MAXIMUM_SNAP_DISTANCE_M = 18;
const CELL_SIZE_M = 24;

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function project(point, origin) {
  const longitudeScale = Math.cos(origin.latitude * Math.PI / 180) * 111320;
  return {
    x: (Number(point[0]) - origin.longitude) * longitudeScale,
    y: (Number(point[1]) - origin.latitude) * 110540,
  };
}

function compileAccessibilityIndex() {
  const sourceBytes = fs.readFileSync(SOURCE_FILE);
  const sourceReceiptBytes = fs.readFileSync(SOURCE_RECEIPT);
  const worldBytes = fs.readFileSync(WORLD_FILE);
  const source = JSON.parse(sourceBytes.toString('utf8'));
  const sourceReceipt = JSON.parse(sourceReceiptBytes.toString('utf8'));
  const world = JSON.parse(worldBytes.toString('utf8'));
  const receiptFile = sourceReceipt.files.find((row) => row.output === 'nyc-pedestrian-ramps.geojson');
  if (!receiptFile || receiptFile.sha256 !== sha256(sourceBytes)) throw new Error('Pedestrian-ramp source receipt does not match source bytes');
  const origin = world.coordinateSystem.originWgs84;
  const ramps = source.features.map((feature) => rampRow(feature, project(feature.geometry.coordinates, origin))).sort((left, right) => left.id.localeCompare(right.id));
  const grid = new Map();
  ramps.forEach((ramp) => {
    const key = gridKey(ramp.position);
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(ramp);
  });
  const eligibleNodes = world.nodes.filter((node) => node.id.startsWith('street-node-'));
  const nodeRows = eligibleNodes.map((node) => nearestRampRow(node, grid)).filter(Boolean).sort((left, right) => left.nodeId.localeCompare(right.nodeId));
  const statusCounts = Object.fromEntries(['meets_simulation_thresholds', 'fails_simulation_thresholds', 'insufficient_measurements'].map((status) => [status, nodeRows.filter((row) => row.status === status).length]));
  return {
    schema: 'simulatte.autonomyAccessibilityIndex.v1',
    id: 'nyc-pedestrian-ramp-accessibility-v1',
    contentVersion: '2026-07-13',
    source: {
      datasetId: 'nyc-pedestrian-ramps',
      authority: 'NYC Department of Transportation',
      sourceReceiptSha256: sha256(sourceReceiptBytes),
      sourceBytesSha256: sha256(sourceBytes),
      sourceFeatureCount: source.features.length,
      captureDateField: 'geocyclora',
    },
    world: { id: world.id, contentVersion: world.contentVersion, sha256: sha256(worldBytes) },
    policy: {
      id: 'wheelchair-route-audit-thresholds-v1',
      maximumSnapDistanceM: MAXIMUM_SNAP_DISTANCE_M,
      maximumCurbRevealInches: 0.5,
      maximumRunningSlopePercent: 8.33,
      maximumCrossSlopePercent: 2,
      requiredObstacleValues: ['None'],
      requiredDetectableWarningSurfaceValues: ['Good Condition', 'Off Ramp - Good'],
    },
    counts: {
      sourceRamps: ramps.length,
      streetNodes: eligibleNodes.length,
      nodesWithRampEvidence: nodeRows.length,
      nodesWithoutRampEvidence: eligibleNodes.length - nodeRows.length,
      statusCounts,
    },
    nodeRows,
    claimBoundary: 'This index evaluates pinned ramp measurements against declared simulation thresholds. NYC DOT states that these measurements are not ADA compliance determinations. A passing row is simulation evidence only; missing rows and technical-review factors remain unresolved.',
  };
}

function rampRow(feature, position) {
  const row = feature.properties || {};
  const metrics = {
    curbRevealInches: numberOrNull(row.curb_reveal),
    runningSlopePercent: numberOrNull(row.ramp_running_slope_total),
    crossSlopePercent: numberOrNull(row.ramp_cross_slope),
  };
  const failures = [];
  if (metrics.curbRevealInches !== null && metrics.curbRevealInches > 0.5) failures.push('curb_reveal');
  if (metrics.runningSlopePercent !== null && metrics.runningSlopePercent > 8.33) failures.push('running_slope');
  if (metrics.crossSlopePercent !== null && Math.abs(metrics.crossSlopePercent) > 2) failures.push('cross_slope');
  if (row.obstacles_ramp && row.obstacles_ramp !== 'None') failures.push('ramp_obstacle');
  if (row.dws_conditions && !['Good Condition', 'Off Ramp - Good'].includes(row.dws_conditions)) failures.push('detectable_warning_surface');
  const complete = Object.values(metrics).every(Number.isFinite) && Boolean(row.dws_conditions);
  return {
    id: `ramp-${row.rampid}`,
    rampId: String(row.rampid),
    cornerId: String(row.cornerid || ''),
    position,
    streets: [row.ramp_onstr, row.stname1, row.stname2].filter(Boolean),
    capturedAt: row.geocyclora || null,
    metrics,
    conditions: { detectableWarningSurface: row.dws_conditions || null, rampObstacles: row.obstacles_ramp || null, landingObstacles: row.obstacles_landing || null },
    status: !complete ? 'insufficient_measurements' : failures.length ? 'fails_simulation_thresholds' : 'meets_simulation_thresholds',
    failures,
  };
}

function nearestRampRow(node, grid) {
  const gx = Math.floor(node.position.x / CELL_SIZE_M);
  const gy = Math.floor(node.position.y / CELL_SIZE_M);
  const candidates = [];
  for (let dx = -1; dx <= 1; dx += 1) for (let dy = -1; dy <= 1; dy += 1) candidates.push(...(grid.get(`${gx + dx},${gy + dy}`) || []));
  const rows = candidates.map((ramp) => ({ ramp, distanceM: Math.hypot(node.position.x - ramp.position.x, node.position.y - ramp.position.y) }))
    .filter((row) => row.distanceM <= MAXIMUM_SNAP_DISTANCE_M)
    .sort((left, right) => left.distanceM - right.distanceM || left.ramp.id.localeCompare(right.ramp.id));
  if (!rows.length) return null;
  const selected = rows[0];
  return {
    nodeId: node.id,
    rampId: selected.ramp.rampId,
    snapDistanceM: Number(selected.distanceM.toFixed(6)),
    status: selected.ramp.status,
    failures: [...selected.ramp.failures],
    capturedAt: selected.ramp.capturedAt,
    metrics: selected.ramp.metrics,
    conditions: selected.ramp.conditions,
  };
}

function gridKey(position) {
  return `${Math.floor(position.x / CELL_SIZE_M)},${Math.floor(position.y / CELL_SIZE_M)}`;
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

const index = compileAccessibilityIndex();
const text = `${JSON.stringify(index, null, 2)}\n`;
if (process.argv.includes('--check')) {
  if (!fs.existsSync(OUTPUT_FILE) || fs.readFileSync(OUTPUT_FILE, 'utf8') !== text) throw new Error('Accessibility index is stale; run compile-accessibility-index.mjs');
  console.log(`AUTONOMY-ACCESSIBILITY status=verified nodes=${index.nodeRows.length} sourceRamps=${index.counts.sourceRamps}`);
} else {
  fs.writeFileSync(OUTPUT_FILE, text);
  console.log(`AUTONOMY-ACCESSIBILITY status=written nodes=${index.nodeRows.length} sourceRamps=${index.counts.sourceRamps} output=${OUTPUT_FILE}`);
}

export { compileAccessibilityIndex };
