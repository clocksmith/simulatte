#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

const TOOL_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(TOOL_DIR, '../..');
const require = createRequire(import.meta.url);
const missionApi = require('../../public/simulatte/mission/mission-compiler.js');
const worldApi = require('../../public/simulatte/world/world-model.js');
const routePlanner = require('../../public/simulatte/world/route-planner.js');
const controllerApi = require('../../public/simulatte/runtime/autonomy-controller.js');

const DEFAULT_OUTPUT = path.join(ROOT, 'artifacts/autonomy-performance/decision-stack.json');
const DEFAULT_REPETITIONS = 20;
const DEFAULT_CONTROLLER_REPETITIONS = 2;

function parseArgs(argv) {
  const options = {
    output: DEFAULT_OUTPUT,
    repetitions: DEFAULT_REPETITIONS,
    controllerRepetitions: DEFAULT_CONTROLLER_REPETITIONS,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--out') options.output = path.resolve(ROOT, String(argv[++index] || ''));
    else if (argument === '--repetitions') options.repetitions = positiveInteger(argv[++index], argument);
    else if (argument === '--controller-repetitions') options.controllerRepetitions = positiveInteger(argv[++index], argument);
    else if (argument === '--help') {
      console.log('usage: node tools/autonomy/benchmark-decision-stack.mjs [--out PATH] [--repetitions N] [--controller-repetitions N]');
      process.exit(0);
    } else throw new Error(`unknown argument: ${argument}`);
  }
  return options;
}

function positiveInteger(value, label) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${label} expected a positive integer`);
  return parsed;
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
}

function hashFile(relativePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, relativePath))).digest('hex');
}

function loadAssets() {
  const manifest = readJson('public/data/simulatte/autonomy-manifest.json');
  const resolveReference = (reference) => readJson(`public/data/simulatte/${reference.path.replace(/^\.\//, '')}`);
  const embodiments = manifest.embodiments.map(resolveReference);
  return {
    manifest,
    world: resolveReference(manifest.world),
    featureCatalog: resolveReference(manifest.featureCatalog),
    policy: resolveReference(manifest.policy),
    occurrenceCatalog: resolveReference(manifest.occurrenceCatalog),
    accessibilityIndex: resolveReference(manifest.accessibilityIndex),
    routeAmenityIndex: resolveReference(manifest.routeAmenityIndex),
    safetyHistoryIndex: resolveReference(manifest.safetyHistoryIndex),
    embodiments,
  };
}

function routeArgs(worldModel, mission, policy, assets) {
  const embodiment = assets.embodiments.find((candidate) => candidate.id === mission.embodimentId);
  if (!embodiment) throw new Error(`missing embodiment ${mission.embodimentId}`);
  return {
    worldModel,
    originNodeId: mission.originNodeId,
    destinationNodeId: mission.destinationNodeId,
    mode: embodiment.mode,
    tick: 0,
    mission,
    policy,
    routeAmenityIndex: assets.routeAmenityIndex,
    safetyHistoryIndex: assets.safetyHistoryIndex,
  };
}

function routeMetrics(route, worldModel) {
  const segments = route.segmentIds.map((segmentId) => worldModel.segment(segmentId));
  return {
    algorithm: route.algorithm,
    distanceM: round(segments.reduce((sum, row) => sum + row.lengthM, 0), 6),
    segmentCount: segments.length,
    protectedSegmentCount: segments.filter((row) => row.laneType === 'protected').length,
    sharedSegmentCount: segments.filter((row) => row.laneType === 'shared').length,
    firstSegmentId: route.segmentIds[0] || null,
    lastSegmentId: route.segmentIds.at(-1) || null,
    evaluatedSegmentCount: route.evaluatedSegmentCount,
    visitedNodeCount: route.visitedNodeIds.length,
  };
}

function compareMission(row, mission) {
  const gold = row.gold;
  const requiredObligationIds = mission.obligations.filter((obligation) => obligation.required).map((obligation) => obligation.id);
  const checks = {
    originNodeId: mission.originNodeId === gold.originNodeId,
    destinationNodeId: mission.destinationNodeId === gold.destinationNodeId,
    constraints: stableJson(mission.constraints) === stableJson(gold.constraints),
    requiredObligationIds: stableJson(requiredObligationIds.sort()) === stableJson([...gold.requiredObligationIds].sort()),
  };
  return { pass: Object.values(checks).every(Boolean), checks };
}

function compareRoute(control, measured) {
  const checks = {
    algorithm: measured.algorithm === control.algorithm,
    distanceM: Math.abs(measured.distanceM - control.distanceM) <= 1e-6,
    segmentCount: measured.segmentCount === control.segmentCount,
    protectedSegmentCount: measured.protectedSegmentCount === control.protectedSegmentCount,
    sharedSegmentCount: measured.sharedSegmentCount === control.sharedSegmentCount,
    firstSegmentId: measured.firstSegmentId === control.firstSegmentId,
    lastSegmentId: measured.lastSegmentId === control.lastSegmentId,
  };
  return { pass: Object.values(checks).every(Boolean), checks };
}

function timed(callback) {
  const started = performance.now();
  const value = callback();
  return { value, durationMs: performance.now() - started };
}

async function benchmarkController(rows, repetitions, assets) {
  const sorted = [...rows].sort((left, right) => left.routeControl.segmentCount - right.routeControl.segmentCount);
  const selected = [sorted[0], sorted[Math.floor(sorted.length / 2)], sorted.at(-1)];
  const stepDurations = [];
  const journeys = [];
  for (let repetition = 0; repetition < repetitions; repetition += 1) {
    for (const row of selected) {
      const mission = missionApi.compileMission(row.sourceText, assets.world, assets.embodiments);
      const embodiment = assets.embodiments.find((candidate) => candidate.id === mission.embodimentId);
      const controller = controllerApi.createAutonomyController({
        world: assets.world,
        featureCatalog: assets.featureCatalog,
        occurrenceCatalog: assets.occurrenceCatalog,
        accessibilityIndex: assets.accessibilityIndex,
        routeAmenityIndex: assets.routeAmenityIndex,
        safetyHistoryIndex: assets.safetyHistoryIndex,
        embodiment,
        policy: assets.policy,
        mission,
      });
      const started = performance.now();
      let snapshot = controller.snapshot();
      while (snapshot.state.status === 'active') {
        const stepStart = performance.now();
        snapshot = await controller.step();
        stepDurations.push(performance.now() - stepStart);
      }
      const receipt = await controller.journeyReceipt();
      journeys.push({
        missionId: row.id,
        repetition,
        terminalState: receipt.terminalState,
        verificationPass: receipt.verification.pass,
        tickCount: receipt.finalState.tick,
        traceEntryCount: receipt.integrity.entryCount,
        durationMs: round(performance.now() - started, 4),
      });
    }
  }
  return {
    selectedMissionIds: selected.map((row) => row.id),
    repetitions,
    journeyCount: journeys.length,
    completedAndVerified: journeys.filter((row) => row.terminalState === 'completed' && row.verificationPass).length,
    totalTicks: stepDurations.length,
    stepLatencyMs: distribution(stepDurations),
    journeys,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const assets = loadAssets();
  const corpus = readJson('tools/samer/autonomy/public-navigation-missions-v2.json');
  const worldModel = worldApi.createWorldModel(assets.world);

  for (const row of corpus.missions) {
    const mission = missionApi.compileMission(row.sourceText, assets.world, assets.embodiments);
    routePlanner.planRoute(routeArgs(worldModel, mission, assets.policy, assets));
  }

  const compileDurations = [];
  const routeDurations = [];
  const accuracyRows = [];
  const routeWork = [];
  for (let repetition = 0; repetition < options.repetitions; repetition += 1) {
    for (const row of corpus.missions) {
      const compiled = timed(() => missionApi.compileMission(row.sourceText, assets.world, assets.embodiments));
      const planned = timed(() => routePlanner.planRoute(routeArgs(worldModel, compiled.value, assets.policy, assets)));
      compileDurations.push(compiled.durationMs);
      routeDurations.push(planned.durationMs);
      if (repetition === 0) {
        const measuredRoute = routeMetrics(planned.value, worldModel);
        accuracyRows.push({
          missionId: row.id,
          mission: compareMission(row, compiled.value),
          route: compareRoute(row.routeControl, measuredRoute),
          measuredRoute,
        });
        routeWork.push({
          missionId: row.id,
          segmentCount: measuredRoute.segmentCount,
          evaluatedSegmentCount: measuredRoute.evaluatedSegmentCount,
          visitedNodeCount: measuredRoute.visitedNodeCount,
        });
      }
    }
  }

  const controller = await benchmarkController(corpus.missions, options.controllerRepetitions, assets);
  const receipt = {
    schema: 'simulatte.autonomyDecisionStackBenchmark.v1',
    generatedAt: new Date().toISOString(),
    host: {
      platform: os.platform(),
      release: os.release(),
      arch: os.arch(),
      cpuModel: os.cpus()[0]?.model || null,
      logicalCpuCount: os.cpus().length,
      totalMemoryBytes: os.totalmem(),
      node: process.version,
    },
    identities: {
      commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(),
      corpus: { path: 'tools/samer/autonomy/public-navigation-missions-v2.json', sha256: hashFile('tools/samer/autonomy/public-navigation-missions-v2.json') },
      world: { id: assets.world.id, path: 'public/data/simulatte/worlds/nyc-core-autonomy-v1.json', sha256: hashFile('public/data/simulatte/worlds/nyc-core-autonomy-v1.json') },
      policy: { id: assets.policy.id, path: 'public/data/simulatte/policies/bet-selector-v1.json', sha256: hashFile('public/data/simulatte/policies/bet-selector-v1.json') },
      compiler: { path: 'public/simulatte/mission/mission-compiler.js', sha256: hashFile('public/simulatte/mission/mission-compiler.js') },
      router: { path: 'public/simulatte/world/route-planner.js', sha256: hashFile('public/simulatte/world/route-planner.js') },
      controller: { path: 'public/simulatte/runtime/autonomy-controller.js', sha256: hashFile('public/simulatte/runtime/autonomy-controller.js') },
    },
    workload: {
      missionCount: corpus.missions.length,
      compileAndRouteRepetitions: options.repetitions,
      totalCompileAndRouteOperations: corpus.missions.length * options.repetitions,
      controllerMissionSelection: 'minimum_median_max_route_segment_count',
      controllerRepetitions: options.controllerRepetitions,
    },
    accuracy: {
      missionExact: accuracyRows.filter((row) => row.mission.pass).length,
      routeExact: accuracyRows.filter((row) => row.route.pass).length,
      total: accuracyRows.length,
      rows: accuracyRows,
    },
    performance: {
      missionCompileLatencyMs: distribution(compileDurations),
      routePlanLatencyMs: distribution(routeDurations),
      controller,
    },
    efficiency: {
      evaluatedSegments: distribution(routeWork.map((row) => row.evaluatedSegmentCount)),
      visitedNodes: distribution(routeWork.map((row) => row.visitedNodeCount)),
      rows: routeWork,
    },
    claimBoundary: 'This diagnostic measures deterministic compiler, A* routing, and reference-controller behavior on the exposed 20-mission public corpus on the named host. It is not a sealed promotion result, a live-traffic claim, or physical-world autonomy evidence.',
  };
  fs.mkdirSync(path.dirname(options.output), { recursive: true });
  fs.writeFileSync(options.output, `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(JSON.stringify({
    output: path.relative(ROOT, options.output),
    missionExact: `${receipt.accuracy.missionExact}/${receipt.accuracy.total}`,
    routeExact: `${receipt.accuracy.routeExact}/${receipt.accuracy.total}`,
    compileP95Ms: receipt.performance.missionCompileLatencyMs.p95,
    routeP95Ms: receipt.performance.routePlanLatencyMs.p95,
    controllerStepP95Ms: receipt.performance.controller.stepLatencyMs.p95,
    controllerVerified: `${controller.completedAndVerified}/${controller.journeyCount}`,
  }, null, 2));
}

function distribution(values) {
  const finite = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (!finite.length) return { count: 0, min: null, p50: null, p95: null, p99: null, max: null, mean: null };
  const percentile = (fraction) => finite[Math.min(finite.length - 1, Math.ceil(finite.length * fraction) - 1)];
  return {
    count: finite.length,
    min: round(finite[0], 4),
    p50: round(percentile(0.5), 4),
    p95: round(percentile(0.95), 4),
    p99: round(percentile(0.99), 4),
    max: round(finite.at(-1), 4),
    mean: round(finite.reduce((sum, value) => sum + value, 0) / finite.length, 4),
  };
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function round(value, digits = 4) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exit(1);
});
