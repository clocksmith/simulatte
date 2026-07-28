#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const config = readJson('public/shared/plugins/cable-trader/default-config.json');
const profile = readJson('public/data/application-profiles/cable-trader-pickup-v1.json');
const world = readJson('public/data/simulatte/worlds/nyc-core-autonomy-v1.json');
const policy = readJson('public/data/simulatte/policies/bet-selector-v1.json');
const circulation = require(path.join(
  ROOT,
  'public/shared/plugins/cable-trader/circulation-simulation.js'
));
const plugin = require(path.join(ROOT, 'public/shared/plugins/cable-trader/index.js'));
const contributionApi = require(path.join(
  ROOT,
  'public/shared/plugins/cable-trader/v4-contribution.js'
));
const worldApi = require(path.join(ROOT, 'public/simulatte/world/world-model.js'));
const routing = require(path.join(ROOT, 'public/simulatte/world/route-planner.js'));
const outputPath = resolveOutput(process.argv.slice(2));

const worldModel = worldApi.createWorldModel(world);
const hubs = config.hubs.slice(0, config.simulation.hubCount);
const locations = config.locations.slice(0, config.simulation.locationCount);
const routes = hubs.flatMap((hub) => locations.flatMap((location) => (
  ['from-hub', 'to-hub'].map((direction) => {
    const originNodeId = direction === 'from-hub' ? hub.nodeId : location.nodeId;
    const destinationNodeId = direction === 'from-hub' ? location.nodeId : hub.nodeId;
    const route = routing.planRoute({
      worldModel,
      originNodeId,
      destinationNodeId,
      mode: 'delivery_bike',
      tick: 0,
      mission: {
        constraints: { avoidStreetNames: [], lanePreference: 'protected' },
        task: { type: 'point_to_point' },
      },
      policy,
    });
    return {
      id: `route-${hub.id}-${location.id}-${direction}`,
      hubId: hub.id,
      locationId: location.id,
      direction,
      segmentIds: route.segmentIds,
      distanceM: route.segmentIds.reduce(
        (total, segmentId) => total + worldModel.segment(segmentId).lengthM,
        0
      ),
    };
  })
)));
const simulation = circulation.simulateCirculation({
  ...config,
  simulation: { ...config.simulation, scenarioId: profile.defaultSeedId },
}, routes);
const state = {
  simulation,
  playback: { status: 'running', day: 180 },
};
const contribution = contributionApi.createContribution({
  config,
  simulation,
  routes,
  state,
});
const journeyLayers = contribution.presentation.layers.filter((row) => (
  row.id.startsWith('path:') || row.id.startsWith('actor:')
));
const hubLayers = contribution.presentation.layers.filter((row) => row.id.startsWith('hub:'));
const locationLayers = contribution.presentation.layers.filter((row) => row.id.startsWith('location:'));
const publicClaims = profile.seeds.map((row) => plugin.validatePublicClaim(row.description));
const report = {
  schema: 'simulatte.cableTraderPluginAudit.v2',
  pass: simulation.people.length >= 1000
    && simulation.events.length === 365
    && simulation.snapshots.length === 366
    && simulation.balance.pass
    && simulation.summary.totalSupply > 0
    && simulation.summary.totalDemand > 0
    && simulation.summary.cablesReused > 0
    && contribution.schema === 'simulatte.pluginContribution.v4'
    && contribution.provenanceRecords.some((row) => row.kind === 'dataset')
    && contribution.provenanceRecords.some((row) => row.kind === 'model')
    && journeyLayers.length > 0
    && journeyLayers.every((row) => row.geometry.segmentIds.length > 0)
    && hubLayers.length === config.simulation.hubCount
    && locationLayers.length === config.simulation.locationCount
    && contribution.controls.comparisons.length === 0
    && publicClaims.length === profile.seeds.length,
  identities: {
    simulationId: simulation.id,
    scenarioId: simulation.scenarioId,
    seed: simulation.seed,
    configurationHash: simulation.configurationHash,
    selectedCableTypeIds: simulation.selectedCableTypeIds,
    worldId: world.id,
    cableCatalog: contributionApi.DATASET_REFERENCE,
  },
  simulation: {
    durationDays: simulation.durationDays,
    peopleCount: simulation.people.length,
    hubCount: simulation.activeHubIds.length,
    locationCount: simulation.activeLocationIds.length,
    eventCount: simulation.events.length,
    snapshotCount: simulation.snapshots.length,
    totalSupply: simulation.summary.totalSupply,
    totalDemand: simulation.summary.totalDemand,
    cablesReused: simulation.summary.cablesReused,
    waitingDemand: simulation.summary.waitingDemand,
    totalJourneys: simulation.summary.totalJourneys,
    balance: simulation.balance,
  },
  semanticPresentation: {
    schema: contribution.presentation.schema,
    layerKinds: [...new Set(contribution.presentation.layers.map((row) => row.kind))],
    hubCount: hubLayers.length,
    locationCount: locationLayers.length,
    journeyLayerCount: journeyLayers.length,
    routeSegmentReferenceCount: new Set(
      journeyLayers.flatMap((row) => row.geometry.segmentIds)
    ).size,
  },
  controls: contribution.controls.controls.map((row) => row.id),
  publicClaimValidation: {
    status: 'pass',
    claimCount: publicClaims.length,
  },
  comparisons: contribution.controls.comparisons,
  viewIntents: contribution.presentation.viewIntents,
  claimBoundary: simulation.claimBoundary,
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`CABLE-TRADER-AUDIT status=${report.pass ? 'pass' : 'failed'} report=${outputPath}`);
if (!report.pass) process.exitCode = 1;

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
}

function resolveOutput(argv) {
  const index = argv.indexOf('--out');
  if (index < 0 || !argv[index + 1]) {
    return path.join(ROOT, 'artifacts/cable-trader-plugin-audit/report.json');
  }
  return path.resolve(argv[index + 1]);
}
