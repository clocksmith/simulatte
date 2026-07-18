#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import zlib from 'node:zlib';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const WORLD_PATH = path.join(ROOT, 'public/data/autonomy/worlds/nyc-core-autonomy-v1.json');
const SOURCE_PATH = path.join(ROOT, 'tools/autonomy/data-sources/villages-williamsburg-2026-07-13/nyc-building-footprints.geojson.gz');
const OUTPUT_PATH = path.join(ROOT, 'public/data/autonomy/evidence/shade-geometry-audit-v1.json');
const check = process.argv.includes('--check');

const worldBytes = fs.readFileSync(WORLD_PATH);
const sourceBytes = fs.readFileSync(SOURCE_PATH);
const world = JSON.parse(worldBytes);
const source = JSON.parse(zlib.gunzipSync(sourceBytes));
const sourceParts = source.features.flatMap((feature) => geometryParts(feature));
const retained = world.renderGeometry.buildings;
const knownHeights = retained.map((row) => row.heightM).filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
const orientation = northOrientationReceipt(world);
const segmentRows = world.segments;
const receipt = {
  schema: 'simulatte.shadeGeometryAudit.v1',
  id: 'nyc-core-shade-geometry-audit-v1',
  worldId: world.id,
  worldContentVersion: world.contentVersion,
  inputs: {
    worldPath: path.relative(ROOT, WORLD_PATH),
    worldSha256: sha256(worldBytes),
    buildingSourcePath: path.relative(ROOT, SOURCE_PATH),
    buildingSourceSha256: sha256(sourceBytes),
    compilerPath: 'tools/autonomy/build-nyc-autonomy-world.mjs',
  },
  buildingGeometry: {
    sourceFeatureCount: source.features.length,
    sourcePolygonPartCount: sourceParts.length,
    sourceGeometryTypes: counts(source.features.map((row) => row.geometry?.type || 'missing')),
    invalidSourcePartCount: sourceParts.filter((row) => !validRing(row.polygon?.[0])).length,
    retainedBuildingCount: retained.length,
    omittedBuildingCount: world.renderGeometry.buildingLodReceipt.omittedFeatureCount,
    fullCoverageClaim: world.renderGeometry.buildingLodReceipt.fullCoverageClaim,
    retainedValidFootprintCount: retained.filter((row) => validLocalRing(row.footprint)).length,
    retainedBuildingWithInteriorRingsCount: retained.filter((row) => row.interiorRings.length > 0).length,
    retainedInteriorRingCount: retained.reduce((sum, row) => sum + row.interiorRings.length, 0),
    omittedInteriorRingCount: retained.reduce((sum, row) => sum + row.omittedInteriorRingCount, 0),
  },
  heightEvidence: {
    sourceField: world.renderGeometry.buildingLodReceipt.heightField,
    sourceUnit: world.renderGeometry.buildingLodReceipt.heightSourceUnit,
    outputUnit: world.renderGeometry.buildingLodReceipt.heightOutputUnit,
    retainedKnownCount: knownHeights.length,
    retainedUnknownCount: retained.length - knownHeights.length,
    retainedCoverageRatio: round(knownHeights.length / retained.length),
    minimumM: quantile(knownHeights, 0),
    p50M: quantile(knownHeights, 0.5),
    p95M: quantile(knownHeights, 0.95),
    maximumM: quantile(knownHeights, 1),
    groundElevationField: world.renderGeometry.buildingLodReceipt.groundElevationField,
    retainedGroundElevationCount: retained.filter((row) => Number.isFinite(row.groundElevationM)).length,
    semantics: 'height_roof is compiled as building height above local ground; ground_elevation remains separate and is not added to shadow length.',
  },
  coordinateFrame: {
    kind: world.coordinateSystem.kind,
    originWgs84: world.coordinateSystem.originWgs84,
    xAxis: 'east',
    yAxis: 'true_north',
    orientationProbe: orientation,
    solarAzimuthMapping: 'x=sin(azimuth), y=cos(azimuth); no street-grid rotation constant',
  },
  streetSegments: {
    count: segmentRows.length,
    withGeometryPolyline: segmentRows.filter((row) => Array.isArray(row.geometry) && row.geometry.length >= 2).length,
    withPositiveLengthM: segmentRows.filter((row) => Number.isFinite(row.lengthM) && row.lengthM > 0).length,
    withLaneType: segmentRows.filter((row) => typeof row.laneType === 'string' && row.laneType).length,
    withRiskScore: segmentRows.filter((row) => Number.isFinite(row.riskScore)).length,
    nodesWithWgs84: world.nodes.filter((row) => Number.isFinite(row.positionWgs84?.latitude) && Number.isFinite(row.positionWgs84?.longitude)).length,
    nodeCount: world.nodes.length,
  },
  verdict: retained.length > 0
    && knownHeights.length > 0
    && retained.every((row) => validLocalRing(row.footprint))
    && segmentRows.every((row) => Array.isArray(row.geometry) && row.geometry.length >= 2)
    && orientation.axisErrorDegrees < 0.5
    ? 'pass_with_declared_coverage_limits'
    : 'fail',
  claimBoundary: 'This receipt proves structural readiness of the frozen retained LOD. It does not prove omitted-building coverage, tree-canopy shade, solar accuracy, route optimality, rendered-shadow parity, or field observation.',
};

const serialized = `${JSON.stringify(receipt, null, 2)}\n`;
if (check) {
  const current = fs.existsSync(OUTPUT_PATH) ? fs.readFileSync(OUTPUT_PATH, 'utf8') : '';
  if (current !== serialized) {
    console.error(`SHADE-GEOMETRY stale=${path.relative(ROOT, OUTPUT_PATH)}`);
    process.exit(1);
  }
} else {
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, serialized);
}
console.log(`SHADE-GEOMETRY verdict=${receipt.verdict} buildings=${retained.length} knownHeights=${knownHeights.length} rings=${receipt.buildingGeometry.retainedInteriorRingCount} segments=${segmentRows.length} northErrorDeg=${orientation.axisErrorDegrees}`);

function geometryParts(feature) {
  if (feature?.geometry?.type === 'Polygon') return [{ polygon: feature.geometry.coordinates }];
  if (feature?.geometry?.type === 'MultiPolygon') return feature.geometry.coordinates.map((polygon) => ({ polygon }));
  return [];
}

function validRing(ring) {
  return Array.isArray(ring) && ring.length >= 4 && ring.every((point) => Array.isArray(point)
    && Number.isFinite(Number(point[0])) && Number.isFinite(Number(point[1])));
}

function validLocalRing(ring) {
  return Array.isArray(ring) && ring.length >= 4 && ring.every((point) => Number.isFinite(point?.x) && Number.isFinite(point?.y));
}

function northOrientationReceipt(value) {
  const xRows = [...value.nodes].sort((left, right) => left.position.x - right.position.x || left.id.localeCompare(right.id));
  const yRows = [...value.nodes].sort((left, right) => left.position.y - right.position.y || left.id.localeCompare(right.id));
  const extremes = [xRows[0], xRows.at(-1), yRows[0], yRows.at(-1)];
  let best = null;
  for (const from of extremes) for (const to of extremes) {
    if (from.id === to.id) continue;
    const dx = to.position.x - from.position.x;
    const dy = to.position.y - from.position.y;
    const baselineM = Math.hypot(dx, dy);
    const localBearing = modulo(Math.atan2(dx, dy) * 180 / Math.PI, 360);
    const geographicBearing = initialBearing(from.positionWgs84, to.positionWgs84);
    const axisErrorDegrees = angularDistance(localBearing, geographicBearing);
    const candidate = { fromNodeId: from.id, toNodeId: to.id, baselineM: round(baselineM), localBearingDegrees: round(localBearing), geographicBearingDegrees: round(geographicBearing), axisErrorDegrees: round(axisErrorDegrees) };
    if (!best || candidate.baselineM > best.baselineM) best = candidate;
  }
  return best;
}

function initialBearing(from, to) {
  const lat1 = from.latitude * Math.PI / 180;
  const lat2 = to.latitude * Math.PI / 180;
  const deltaLon = (to.longitude - from.longitude) * Math.PI / 180;
  return modulo(Math.atan2(
    Math.sin(deltaLon) * Math.cos(lat2),
    Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLon)
  ) * 180 / Math.PI, 360);
}

function angularDistance(left, right) {
  const distance = Math.abs(left - right);
  return Math.min(distance, 360 - distance);
}

function counts(rows) {
  return Object.fromEntries([...new Set(rows)].sort().map((key) => [key, rows.filter((row) => row === key).length]));
}

function quantile(rows, ratio) {
  if (!rows.length) return null;
  const index = Math.min(rows.length - 1, Math.max(0, Math.ceil(rows.length * ratio) - 1));
  return round(rows[index]);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function modulo(value, divisor) {
  return ((value % divisor) + divisor) % divisor;
}

function round(value) {
  return Number(value.toFixed(6));
}
