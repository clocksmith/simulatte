#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { writeImmutableGeneratedArtifact } from './immutable-generated-artifact.mjs';

const TOOL_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(TOOL_DIR, '../..');
const require = createRequire(import.meta.url);
const missionApi = require('../../public/simulatte/mission/mission-compiler.js');
const routePlanner = require('../../public/simulatte/world/route-planner.js');
const worldApi = require('../../public/simulatte/world/world-model.js');
const OUTPUT = path.join(ROOT, 'tools/samer/autonomy/public-navigation-missions-v2.json');
const PAIRS = Object.freeze([
  ['Union Square', 'North Williamsburg'],
  ['West Village', 'Union Square'],
  ['Union Square', 'West Village'],
  ['East Village', 'Union Square'],
  ['Union Square', 'East Village'],
  ['Washington Square', 'East Village'],
  ['East Village', 'Washington Square'],
  ['Tompkins Square', 'Union Square'],
  ['Union Square', 'Tompkins Square'],
  ['Williamsburg Bridge', 'North Williamsburg'],
  ['North Williamsburg', 'Williamsburg Bridge'],
  ['Williamsburg Waterfront', 'North Williamsburg'],
  ['North Williamsburg', 'Williamsburg Waterfront'],
  ['McCarren Park', 'Greenpoint'],
  ['Greenpoint', 'McCarren Park'],
  ['North Williamsburg', 'Greenpoint'],
  ['Greenpoint', 'North Williamsburg'],
  ['Union Square', 'Williamsburg Waterfront'],
  ['Williamsburg Waterfront', 'Union Square'],
  ['West Village', 'Greenpoint'],
]);

function main() {
  const manifest = readJson('public/data/simulatte/autonomy-manifest.json');
  const worldPath = path.resolve(ROOT, 'public/data/simulatte', manifest.world.path);
  const policyPath = path.resolve(ROOT, 'public/data/simulatte', manifest.policy.path);
  const embodimentReference = manifest.embodiments.find((row) => row.id === manifest.defaultEmbodimentId);
  if (!embodimentReference) throw new Error(`Default embodiment ${manifest.defaultEmbodimentId} is not registered`);
  const embodimentPath = path.resolve(ROOT, 'public/data/simulatte', embodimentReference.path);
  const world = readJson(path.relative(ROOT, worldPath));
  const policy = readJson(path.relative(ROOT, policyPath));
  const embodiment = readJson(path.relative(ROOT, embodimentPath));
  const worldModel = worldApi.createWorldModel(world);
  const missions = PAIRS.map(([origin, destination], index) => buildMissionRow({ index, origin, destination, world, worldModel, policy, embodiment }));
  const rowsHash = sha256(Buffer.from(JSON.stringify(sortValue(missions))));
  const artifact = {
    schema: 'simulatte.autonomyDiagnosticMissionSet.v1',
    id: 'public-navigation-missions-v2',
    contentVersion: 'public-navigation-missions-2026-07-18',
    population: 'public_diagnostic',
    promotionEligible: false,
    exposure: 'Checked into the repository and available to developers, agents, selectors, and evaluators.',
    identities: {
      worldId: world.id,
      worldSha256: sha256(fs.readFileSync(worldPath)),
      policyId: policy.id,
      policySha256: sha256(fs.readFileSync(policyPath)),
      embodimentId: embodiment.id,
      embodimentSha256: sha256(fs.readFileSync(embodimentPath)),
    },
    construction: {
      method: 'by_construction_from_named_world_nodes',
      rowCount: missions.length,
      rowsSha256: rowsHash,
      owner: 'tools/autonomy/build-public-navigation-missions.mjs',
    },
    missions,
    claimBoundary: 'These exposed rows detect parser, route, and retrieval regressions. They are not a contamination-secure promotion holdout and cannot authorize an autonomy capability claim.',
  };
  const status = writeImmutableGeneratedArtifact(OUTPUT, `${JSON.stringify(sortValue(artifact), null, 2)}\n`, artifact.id);
  console.log(`AUTONOMY-DIAGNOSTIC id=${artifact.id} rows=${missions.length} rowsSha256=${rowsHash} status=${status} output=${OUTPUT}`);
}

function buildMissionRow({ index, origin, destination, world, worldModel, policy, embodiment }) {
  const prefersProtected = index % 4 !== 3;
  const yieldsToPedestrians = index % 5 !== 4;
  const suffix = [prefersProtected ? 'Prefer protected lanes.' : '', yieldsToPedestrians ? 'Yield to pedestrians.' : ''].filter(Boolean).join(' ');
  const sourceText = `Deliver the parcel by bike from ${origin} to ${destination}. ${suffix}`.trim();
  const mission = missionApi.compileMission(sourceText, world, embodiment);
  const route = routePlanner.planRoute({
    worldModel,
    originNodeId: mission.originNodeId,
    destinationNodeId: mission.destinationNodeId,
    mode: embodiment.mode,
    tick: 0,
    mission,
    policy,
  });
  const firstSegment = worldModel.segment(route.segmentIds[0]);
  const exactNetworkCardId = firstSegment.cardIds.find((id) => id.startsWith('network.'));
  if (!exactNetworkCardId) throw new Error(`Mission ${index + 1} first segment expected a compiled network card`);
  return {
    id: `public-mission-${String(index + 1).padStart(2, '0')}`,
    sourceText,
    gold: {
      originLabel: origin,
      destinationLabel: destination,
      originNodeId: mission.originNodeId,
      destinationNodeId: mission.destinationNodeId,
      constraints: structuredClone(mission.constraints),
      requiredObligationIds: mission.obligations.filter((row) => row.required).map((row) => row.id),
      retrieval: {
        routeSegmentCardId: exactNetworkCardId,
        missionCardId: 'scenario.delivery-arrival',
      },
    },
    routeControl: {
      algorithm: route.algorithm,
      isReachable: true,
      segmentCount: route.segmentIds.length,
      distanceM: round(route.segmentIds.reduce((sum, id) => sum + worldModel.segment(id).lengthM, 0)),
      protectedSegmentCount: route.segmentIds.filter((id) => worldModel.segment(id).laneType === 'protected').length,
      sharedSegmentCount: route.segmentIds.filter((id) => worldModel.segment(id).laneType === 'shared').length,
      firstSegmentId: route.segmentIds[0],
      lastSegmentId: route.segmentIds.at(-1),
    },
  };
}

function readJson(relative) {
  return JSON.parse(fs.readFileSync(path.resolve(ROOT, relative), 'utf8'));
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function round(value) {
  return Number(value.toFixed(6));
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortValue(value[key])]));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error && error.stack || error);
    process.exit(1);
  }
}

export { PAIRS, buildMissionRow };
