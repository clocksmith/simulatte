#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const config = readJson('public/shared/plugins/cable-trader/default-config.json');
const world = readJson('public/data/simulatte/worlds/nyc-core-autonomy-v1.json');
const policy = readJson('public/data/simulatte/policies/bet-selector-v1.json');
const network = require(path.join(ROOT, 'public/shared/plugins/cable-trader/network-simulation.js'));
const contributionApi = require(path.join(ROOT, 'public/shared/plugins/cable-trader/v4-contribution.js'));
const worldApi = require(path.join(ROOT, 'public/simulatte/world/world-model.js'));
const routing = require(path.join(ROOT, 'public/simulatte/world/route-planner.js'));
const outputPath = resolveOutput(process.argv.slice(2));

const worldModel = worldApi.createWorldModel(world);
const transferRoutes = config.hubs.flatMap((sourceHub) => config.hubs
  .filter((destinationHub) => destinationHub.id !== sourceHub.id)
  .map((destinationHub) => {
    const route = routing.planRoute({
      worldModel,
      originNodeId: sourceHub.nodeId,
      destinationNodeId: destinationHub.nodeId,
      mode: 'delivery_bike',
      tick: 0,
      mission: { constraints: { avoidStreetNames: [], lanePreference: 'protected' }, task: { type: 'point_to_point' } },
      policy,
    });
    const distanceM = route.segmentIds.reduce((total, segmentId) => total + worldModel.segment(segmentId).lengthM, 0);
    return {
      id: `transfer-${sourceHub.id}-${destinationHub.id}`,
      sourceHubId: sourceHub.id,
      destinationHubId: destinationHub.id,
      segmentIds: route.segmentIds,
      distanceM,
      costUnits: Math.max(0.1, distanceM / 1000),
    };
  }));
const simulation = network.simulateNetwork({
  ...config,
  simulation: { ...config.simulation, scenarioId: 'july-baseline' },
}, transferRoutes);
const contribution = contributionApi.createContribution({
  config,
  simulation,
  transferRoutes,
  state: {
    simulation,
    playback: { status: 'settled', day: simulation.durationDays },
  },
});
const flowLayers = contribution.presentation.layers.filter((row) => row.id.startsWith('flow:'));
const hubLayers = contribution.presentation.layers.filter((row) => row.id.startsWith('hub:'));
const styleFields = ['widthM', 'tone', 'color', 'opacity', 'animationRate'];
const report = {
  schema: 'simulatte.cableTraderPluginAudit.v1',
  pass: simulation.events.length === simulation.durationDays
    && simulation.snapshots.length === simulation.durationDays + 1
    && simulation.summary.optimalityProven
    && simulation.summary.fulfilledNeeds === simulation.summary.needs
    && contribution.schema === 'simulatte.pluginContribution.v4'
    && contribution.provenanceRecords.some((row) => row.kind === 'dataset')
    && contribution.provenanceRecords.some((row) => row.kind === 'model')
    && contribution.presentation.layers.every((row) => row.provenance.axes.origin
      && row.provenance.axes.temporalStatus
      && row.provenance.axes.uncertainty)
    && flowLayers.length > 0
    && flowLayers.every((row) => row.geometry.segmentIds.length > 0)
    && contribution.presentation.layers.every((layer) => styleFields.every((field) => !(field in layer))),
  identities: {
    simulationId: simulation.id,
    scenarioId: simulation.scenarioId,
    seed: simulation.seed,
    worldId: world.id,
    compatibilityDataset: adapter.DATASET_REFERENCE,
  },
  simulation: {
    durationDays: simulation.durationDays,
    eventCount: simulation.events.length,
    snapshotCount: simulation.snapshots.length,
    needs: simulation.summary.needs,
    fulfilledNeeds: simulation.summary.fulfilledNeeds,
    allocations: simulation.summary.allocations,
    optimalAllocations: simulation.summary.optimalAllocations,
    randomEvents: simulation.summary.randomEvents,
  },
  semanticPresentation: {
    schema: contribution.presentation.schema,
    layerKinds: [...new Set(contribution.presentation.layers.map((row) => row.kind))],
    hubCount: hubLayers.length,
    flowCount: flowLayers.length,
    routeSegmentReferenceCount: new Set(flowLayers.flatMap((row) => row.geometry.segmentIds)).size,
    finalStyleFieldsAbsent: styleFields,
  },
  controls: contribution.controls.controls.map((row) => row.id),
  comparisons: contribution.controls.comparisons.map((row) => ({
    id: row.id,
    synchronizedClock: row.synchronizedClock,
  })),
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
  if (index < 0 || !argv[index + 1]) return path.join(ROOT, 'artifacts/cable-trader-plugin-audit/report.json');
  return path.resolve(argv[index + 1]);
}
