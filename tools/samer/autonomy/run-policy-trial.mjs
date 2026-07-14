#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const TOOL_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(TOOL_DIR, '../../..');
const DEFAULT_CONTRACT = path.join(TOOL_DIR, 'autonomy-policy-contract.json');
const DEFAULT_SCENARIOS = path.join(TOOL_DIR, 'public-navigation-scenarios-v1.json');
const require = createRequire(import.meta.url);
const contracts = require('../../../public/contracts/contract-validator.js');
const missionApi = require('../../../public/mission/mission-compiler.js');
const controllerApi = require('../../../public/runtime/autonomy-controller.js');
const receipts = require('../../../public/runtime/canonical-receipts.js');
const EXPECTED_RUNTIME_SOURCE_PATHS = Object.freeze([
  'public/contracts/contract-validator.js',
  'public/mission/capability-matrix.js',
  'public/mission/mission-compiler.js',
  'public/world/world-model.js',
  'public/world/route-planner.js',
  'public/world/region-pack-merger.js',
  'public/runtime/canonical-receipts.js',
  'public/runtime/feature-retrieval.js',
  'public/runtime/occurrence-engine.js',
  'public/runtime/observation-builder.js',
  'public/runtime/reference-dynamics.js',
  'public/runtime/bet-proposer.js',
  'public/runtime/safety-gate.js',
  'public/runtime/bet-selector.js',
  'public/runtime/bet-settlement.js',
  'public/runtime/autonomy-controller.js',
  'public/verifier/journey-verifier.js',
  'tools/samer/autonomy/run-policy-trial.mjs',
]);

function parseArgs(argv) {
  const options = { contractPath: DEFAULT_CONTRACT, scenarioPath: DEFAULT_SCENARIOS, outDir: '', checkOnly: false };
  for (let index = 0; index < argv.length; index += 1) {
    const [key, inline] = argv[index].split('=');
    const value = () => inline ?? argv[++index];
    if (key === '--contract') options.contractPath = path.resolve(value());
    else if (key === '--scenarios') options.scenarioPath = path.resolve(value());
    else if (key === '--out') options.outDir = path.resolve(value());
    else if (key === '--check') options.checkOnly = true;
    else if (key === '--help') {
      console.log('usage: node tools/samer/autonomy/run-policy-trial.mjs [--check] [--contract PATH] [--scenarios PATH] [--out DIR]');
      process.exit(0);
    } else throw new Error(`Unknown argument: ${argv[index]}`);
  }
  return options;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function readAssets() {
  return {
    world: readJson(path.join(ROOT, 'public/data/autonomy/worlds/nyc-training-corridor-v1.json')),
    featureCatalog: readJson(path.join(ROOT, 'public/data/autonomy/feature-cards-v1.json')),
    embodiment: readJson(path.join(ROOT, 'public/data/autonomy/embodiments/delivery-bike-v1.json')),
    policy: readJson(path.join(ROOT, 'public/data/autonomy/policies/bet-selector-v1.json')),
  };
}

function validateTrialContract(contract, scenarios, scenarioBytes) {
  if (contract.schema !== 'simulatte.samerAutonomyContract.v1') {
    throw new Error(`Autonomy SAME-R contract expected simulatte.samerAutonomyContract.v1, received ${contract.schema || 'missing'}`);
  }
  if (scenarios.schema !== 'simulatte.autonomyScenarioSet.v1' || scenarios.id !== contract.budget.scenarioSetId) {
    throw new Error(`Scenario set expected ${contract.budget.scenarioSetId}, received ${scenarios.id || 'missing'}`);
  }
  const scenarioHash = digest(scenarioBytes);
  if (scenarioHash !== contract.causalContract.population.sha256) {
    throw new Error(`Scenario set SHA-256 expected ${contract.causalContract.population.sha256}, received ${scenarioHash}`);
  }
  const expectedLanes = [
    ['anchor', 'anchor', 'progress_only'],
    ['targeted', 'targeted', 'evidence_scored'],
    ['seeded_control', 'control', 'seeded_eligible'],
  ];
  if (!Array.isArray(contract.lanes) || contract.lanes.length !== expectedLanes.length) {
    throw new Error('Autonomy SAME-R contract requires three declared lanes');
  }
  expectedLanes.forEach(([id, role, approach], index) => {
    const lane = contract.lanes[index] || {};
    if (lane.id !== id || lane.role !== role || lane.selectionApproach !== approach) {
      throw new Error(`Lane ${index} expected ${id}/${role}/${approach}, received ${lane.id}/${lane.role}/${lane.selectionApproach}`);
    }
  });
  const expectedCandidateOrder = ['emergency_stop', 'wait', 'yield', 'proceed', 'accelerate', 'reroute'];
  if (contract.matchedOperationDetails.evaluationOrder !== 'scenario_then_lane_then_repetition') {
    throw new Error(`Autonomy SAME-R evaluation order expected scenario_then_lane_then_repetition, received ${contract.matchedOperationDetails.evaluationOrder || 'missing'}`);
  }
  if (!sameRows(contract.matchedOperationDetails.candidateOrder, expectedCandidateOrder)) {
    throw new Error('Autonomy SAME-R candidate order differs from the governed proposer order');
  }
  if (contract.matchedOperationDetails.modelIdentity !== null || contract.matchedOperationDetails.adapterIdentity !== null) {
    throw new Error('Autonomy SAME-R deterministic policy contract expected explicit null model and adapter identities');
  }
  if (!sameRows(contract.matchedOperationDetails.runtimeSourcePaths, EXPECTED_RUNTIME_SOURCE_PATHS)) {
    throw new Error('Autonomy SAME-R runtime source paths differ from the executable decision loop');
  }
  const metric = contract.causalContract.primaryMetric;
  if (metric.type !== 'derived_from_deterministic_trace' || metric.formula !== 'scenarioEvaluationPass ? 1 - (tickCount / maximumTicksPerJourney * 0.1) : 0') {
    throw new Error('Autonomy SAME-R primary metric derivation is missing or changed');
  }
  const expectedGuardrails = ['zero_safety_violations', 'all_required_obligations_pass', 'receipt_chain_verified', 'deterministic_repetitions', 'declared_budget_saturated', 'scenario_expectations'];
  if (!sameRows(contract.causalContract.blockingGuardrails, expectedGuardrails)) {
    throw new Error('Autonomy SAME-R blocking guardrails differ from the runner checks');
  }
  const metricIds = contract.metrics.map((row) => row.id);
  if (new Set(metricIds).size !== metricIds.length || !metricIds.includes(metric.id)) {
    throw new Error('Autonomy SAME-R metrics must be unique and include the primary metric');
  }
  if (scenarios.rows.length !== contract.budget.scenarioCount) {
    throw new Error(`Scenario count expected ${contract.budget.scenarioCount}, received ${scenarios.rows.length}`);
  }
  const runCount = contract.lanes.length * scenarios.rows.length * contract.budget.repetitionsPerLane;
  if (runCount !== contract.budget.maximumRuns) {
    throw new Error(`Run budget expected ${contract.budget.maximumRuns}, declared matrix requires ${runCount}`);
  }
  return scenarioHash;
}

function validateAssets(assets) {
  contracts.validateFeatureCatalog(assets.featureCatalog);
  contracts.validateWorld(assets.world, assets.featureCatalog);
  contracts.validateEmbodiment(assets.embodiment);
  contracts.validatePolicy(assets.policy);
}

function applyWorldMutations(baseWorld, mutations) {
  const world = structuredClone(baseWorld);
  for (const mutation of mutations || []) {
    if (mutation.kind === 'signal_phase') {
      const signal = world.signals.find((row) => row.id === mutation.targetId);
      if (!signal) throw new Error(`Scenario mutation expected signal ${mutation.targetId}`);
      signal.phaseOffsetTicks = integerValue(mutation.value, mutation.targetId);
    } else if (mutation.kind === 'actor_interval') {
      const actor = world.actors.find((row) => row.id === mutation.targetId);
      if (!actor) throw new Error(`Scenario mutation expected actor ${mutation.targetId}`);
      [actor.activeFromTick, actor.activeUntilTick] = intervalValue(mutation.value, mutation.targetId);
    } else if (mutation.kind === 'disruption_interval') {
      const disruption = world.disruptions.find((row) => row.id === mutation.targetId);
      if (!disruption) throw new Error(`Scenario mutation expected disruption ${mutation.targetId}`);
      [disruption.activeFromTick, disruption.activeUntilTick] = intervalValue(mutation.value, mutation.targetId);
    } else throw new Error(`Unknown world mutation kind ${mutation.kind || 'missing'}`);
  }
  return world;
}

function integerValue(value, targetId) {
  if (!Number.isInteger(value)) throw new Error(`Scenario mutation ${targetId} expected an integer value`);
  return value;
}

function intervalValue(value, targetId) {
  if (!Array.isArray(value) || value.length !== 2 || !value.every(Number.isInteger) || value[1] <= value[0]) {
    throw new Error(`Scenario mutation ${targetId} expected [startTick, endTick] with end greater than start`);
  }
  return value;
}

function policyForLane(basePolicy, lane, contract) {
  const policy = structuredClone(basePolicy);
  policy.id = `${basePolicy.id}-${lane.id}`;
  policy.selection = { approach: lane.selectionApproach, seed: lane.seed };
  policy.runtime.maximumTicks = contract.budget.maximumTicksPerJourney;
  policy.runtime.maximumCandidatesPerTick = contract.budget.maximumCandidatesPerTick;
  contracts.validatePolicy(policy);
  return policy;
}

async function runJourney({ scenario, lane, contract, assets }) {
  const world = applyWorldMutations(assets.world, scenario.worldMutations);
  contracts.validateWorld(world, assets.featureCatalog);
  const policy = policyForLane(assets.policy, lane, contract);
  const mission = missionApi.compileMission(scenario.prompt, world, assets.embodiment);
  const controller = controllerApi.createAutonomyController({
    world,
    featureCatalog: assets.featureCatalog,
    embodiment: assets.embodiment,
    policy,
    mission,
  });
  await controller.run(contract.budget.maximumTicksPerJourney);
  const receipt = await controller.journeyReceipt();
  const evaluation = evaluateScenario(receipt, scenario, contract.budget);
  return { receipt, evaluation };
}

function evaluateScenario(receipt, scenario, budget) {
  const tickRows = receipt.trace.map((row) => row.payload).filter((row) => row.schema === 'simulatte.autonomyTickReceipt.v2');
  const signalGateCount = countBlockingGate(tickRows, 'signal_compliance');
  const pedestrianGateCount = countBlockingGate(tickRows, 'pedestrian_clearance');
  const safetyViolationCount = receipt.verification.violations.length;
  const requiredPass = receipt.verification.obligations.filter((row) => row.required).every((row) => row.pass);
  const checks = [
    check('completion', !scenario.expectations.requiresCompletion || receipt.terminalState === 'completed', { terminalState: receipt.terminalState }),
    check('route_revisions', receipt.verification.metrics.routeRevisionCount >= scenario.expectations.minimumRouteRevisions, {
      expectedMinimum: scenario.expectations.minimumRouteRevisions,
      actual: receipt.verification.metrics.routeRevisionCount,
    }),
    check('signal_gates', signalGateCount >= scenario.expectations.minimumSignalGates, {
      expectedMinimum: scenario.expectations.minimumSignalGates,
      actual: signalGateCount,
    }),
    check('pedestrian_gates', pedestrianGateCount >= scenario.expectations.minimumPedestrianGates, {
      expectedMinimum: scenario.expectations.minimumPedestrianGates,
      actual: pedestrianGateCount,
    }),
    check('safety_violations', safetyViolationCount <= scenario.expectations.maximumSafetyViolations, {
      expectedMaximum: scenario.expectations.maximumSafetyViolations,
      actual: safetyViolationCount,
    }),
    check('required_obligations', requiredPass, {
      failedIds: receipt.verification.obligations.filter((row) => row.required && !row.pass).map((row) => row.id),
    }),
    check('integrity', receipt.verification.integrityPass === true, { terminalHash: receipt.integrity.terminalHash }),
  ];
  const pass = checks.every((row) => row.pass);
  const tickCount = receipt.verification.metrics.tickCount;
  return {
    schema: 'simulatte.autonomyScenarioEvaluation.v1',
    scenarioId: scenario.id,
    pass,
    checks,
    metrics: {
      safetyAdjustedCompletionScore: pass ? round(1 - tickCount / budget.maximumTicksPerJourney * 0.1) : 0,
      completed: receipt.terminalState === 'completed',
      requiredObligationPassRate: rate(receipt.verification.obligations.filter((row) => row.required && row.pass).length, receipt.verification.obligations.filter((row) => row.required).length),
      safetyViolationCount,
      tickCount,
      betWinRate: rate(receipt.verification.metrics.wonBetCount, receipt.verification.metrics.wonBetCount + receipt.verification.metrics.lostBetCount),
      signalGateCount,
      pedestrianGateCount,
    },
  };
}

function countBlockingGate(ticks, checkId) {
  return ticks.filter((tick) => tick.bets.some((row) => row.gate.blockingCheckIds.includes(checkId))).length;
}

function isSaturated(history, budget) {
  if (!history || !history.length) return false;
  const last = history.at(-1);
  const terminal = ['completed', 'failed', 'budget_exhausted', 'safety_violation', 'route_not_found', 'no_safe_action'].includes(last.terminalState);
  return terminal || Number(last.tickCount || 0) >= budget.maximumTicksPerJourney;
}

async function runTrial(contract, scenarios, assets, scenarioHash) {
  const runtimeSourceIdentity = hashRuntimeSources(contract.matchedOperationDetails.runtimeSourcePaths);
  const runsByLane = new Map(contract.lanes.map((lane) => [lane.id, []]));
  const executionSequence = [];
  for (const scenario of scenarios.rows) {
    for (const lane of contract.lanes) {
      for (let repetition = 0; repetition < contract.budget.repetitionsPerLane; repetition += 1) {
        executionSequence.push({ scenarioId: scenario.id, laneId: lane.id, repetition });
        const { receipt, evaluation } = await runJourney({ scenario, lane, contract, assets });
        runsByLane.get(lane.id).push({
          scenarioId: scenario.id,
          repetition,
          terminalState: receipt.terminalState,
          terminalHash: receipt.integrity.terminalHash,
          tickCount: receipt.verification.metrics.tickCount,
          saturated: isSaturated([{ terminalState: receipt.terminalState, tickCount: receipt.verification.metrics.tickCount }], contract.budget),
          evaluation,
        });
      }
    }
  }
  const lanes = contract.lanes.map((lane) => summarizeLane(lane, runsByLane.get(lane.id), scenarios, contract));
  const qualified = lanes.filter((lane) => lane.guardrails.pass)
    .sort((left, right) => right.metrics.safetyAdjustedCompletionScore - left.metrics.safetyAdjustedCompletionScore || left.id.localeCompare(right.id));
  return {
    schema: 'simulatte.samerAutonomyReport.v1',
    experimentId: contract.experimentId,
    contractHash: digest(canonicalJson(contract)),
    scenarioSetHash: scenarioHash,
    inputs: {
      worldHash: digest(canonicalJson(assets.world)),
      featureCatalogHash: digest(canonicalJson(assets.featureCatalog)),
      embodimentHash: digest(canonicalJson(assets.embodiment)),
      basePolicyHash: digest(canonicalJson(assets.policy)),
      runtimeSourceIdentity,
    },
    execution: {
      order: contract.matchedOperationDetails.evaluationOrder,
      sequence: executionSequence,
    },
    lanes,
    diagnosticSelection: qualified.length ? {
      status: 'diagnostic_leader_only',
      laneId: qualified[0].id,
      primaryMetric: qualified[0].metrics.safetyAdjustedCompletionScore,
    } : { status: 'no_qualified_lane', laneId: null, primaryMetric: null },
    promotion: {
      status: 'blocked',
      reasons: ['public_diagnostic_population', 'sealed_scenario_set_missing', 'physical_world_evidence_missing'],
    },
    claimBoundary: 'This report compares deterministic browser policies on public synthetic scenarios. It does not promote a policy or establish physical-world autonomy.',
  };
}

function summarizeLane(lane, runs, scenarios, contract) {
  const deterministic = scenarios.rows.every((scenario) => {
    const hashes = runs.filter((run) => run.scenarioId === scenario.id).map((run) => run.terminalHash);
    return hashes.length === contract.budget.repetitionsPerLane && hashes.every((hash) => hash === hashes[0]);
  });
  const evaluations = runs.map((run) => run.evaluation);
  const allSaturated = runs.every((run) => run.saturated);
  const zeroSafety = evaluations.every((row) => row.metrics.safetyViolationCount === 0);
  const allRequired = evaluations.every((row) => row.metrics.requiredObligationPassRate === 1);
  const allScenarioChecks = evaluations.every((row) => row.pass);
  const guardrailChecks = [
    check('zero_safety_violations', zeroSafety, {}),
    check('all_required_obligations_pass', allRequired, {}),
    check('receipt_chain_verified', evaluations.every((row) => row.checks.find((item) => item.id === 'integrity').pass), {}),
    check('deterministic_repetitions', deterministic, {}),
    check('declared_budget_saturated', allSaturated, {}),
    check('scenario_expectations', allScenarioChecks, {}),
  ];
  return {
    id: lane.id,
    role: lane.role,
    selectionApproach: lane.selectionApproach,
    seed: lane.seed,
    runs,
    guardrails: { pass: guardrailChecks.every((row) => row.pass), checks: guardrailChecks },
    metrics: {
      safetyAdjustedCompletionScore: mean(evaluations.map((row) => row.metrics.safetyAdjustedCompletionScore)),
      missionCompletionRate: rate(evaluations.filter((row) => row.metrics.completed).length, evaluations.length),
      requiredObligationPassRate: mean(evaluations.map((row) => row.metrics.requiredObligationPassRate)),
      safetyViolationCount: evaluations.reduce((sum, row) => sum + row.metrics.safetyViolationCount, 0),
      meanTickCount: mean(evaluations.map((row) => row.metrics.tickCount)),
      betWinRate: mean(evaluations.map((row) => row.metrics.betWinRate)),
    },
  };
}

function check(id, pass, evidence) {
  return { id, pass: Boolean(pass), evidence };
}

function rate(numerator, denominator) {
  return denominator ? round(numerator / denominator) : 0;
}

function mean(values) {
  return values.length ? round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;
}

function round(value) {
  return Number(value.toFixed(9));
}

function sameRows(left, right) {
  return Array.isArray(left) && left.length === right.length && left.every((row, index) => row === right[index]);
}

function canonicalJson(value) {
  return receipts.canonicalJson(value);
}

function digest(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function hashRuntimeSources(relativePaths) {
  const files = relativePaths.map((relativePath) => {
    const file = path.resolve(ROOT, relativePath);
    const withinRoot = path.relative(ROOT, file);
    if (withinRoot.startsWith('..') || path.isAbsolute(withinRoot)) {
      throw new Error(`Autonomy SAME-R runtime source path leaves repository: ${relativePath}`);
    }
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
      throw new Error(`Autonomy SAME-R runtime source does not exist: ${relativePath}`);
    }
    return { path: relativePath, sha256: digest(fs.readFileSync(file)) };
  });
  return {
    algorithm: 'sha256_raw_bytes',
    files,
    aggregateSha256: digest(canonicalJson(files)),
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const contract = readJson(options.contractPath);
  const scenarioBytes = fs.readFileSync(options.scenarioPath);
  const scenarios = JSON.parse(scenarioBytes);
  const assets = readAssets();
  const scenarioHash = validateTrialContract(contract, scenarios, scenarioBytes);
  validateAssets(assets);
  const report = await runTrial(contract, scenarios, assets, scenarioHash);
  report.executionEnvironment = {
    nodeVersion: process.version,
    platform: process.platform,
    architecture: process.arch,
  };
  report.invocation = {
    executable: process.execPath,
    cwd: process.cwd(),
    argv: process.argv.slice(1),
  };
  if (!options.checkOnly) {
    const outDir = options.outDir || path.join(ROOT, 'artifacts', 'samer-autonomy');
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  }
  const laneText = report.lanes.map((lane) => `${lane.id}=${lane.guardrails.pass ? 'pass' : 'reject'}:${lane.metrics.safetyAdjustedCompletionScore}`).join(' ');
  console.log(`AUTONOMY-SAME-R ${laneText} selection=${report.diagnosticSelection.status}:${report.diagnosticSelection.laneId || 'none'} promotion=${report.promotion.status}`);
  if (report.lanes.every((lane) => !lane.guardrails.pass)) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error && error.stack || error);
    process.exit(1);
  });
}

export {
  applyWorldMutations,
  evaluateScenario,
  hashRuntimeSources,
  isSaturated,
  policyForLane,
  runJourney,
  runTrial,
  summarizeLane,
  validateTrialContract,
};
