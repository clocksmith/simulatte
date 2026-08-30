const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const pluginDir = path.join(ROOT, 'public/shared/plugins/gpu-supercluster');

const topologyApi = require(path.join(pluginDir, 'cluster-topology.js'));
const collectiveApi = require(path.join(pluginDir, 'collective-solver.js'));
const thermalApi = require(path.join(pluginDir, 'thermal-model.js'));
const receiptApi = require(path.join(pluginDir, 'receipt-factory.js'));
const controlsApi = require(path.join(pluginDir, 'cluster-controls.js'));
const pluginApi = require(path.join(pluginDir, 'index.js'));
const pluginContracts = require(path.join(ROOT, 'public/simulatte/platform/contracts/plugin-contracts.js'));
const v4Contracts = require(path.join(ROOT, 'public/simulatte/platform/contracts/plugin-v4-contracts.js'));
const manifest = require(path.join(pluginDir, 'plugin.json'));

test('gpu-supercluster topology generates 256 GPUs across 32 liquid-cooled racks', () => {
  const topology = topologyApi.buildClusterTopology({ totalGpus: 256, racks: 32 });
  assert.equal(topology.totalGpus, 256);
  assert.equal(topology.racksCount, 32);
  assert.equal(topology.racks.length, 32);
  assert.equal(topology.gpus.length, 256);
  assert.ok(topology.nvlinkCount > 0, 'Should generate intra-node NVLink mesh links');
  assert.ok(topology.infinibandCount > 0, 'Should generate inter-rack InfiniBand links');
});

test('collective solver calculates step times, MFU, and bandwidth bottlenecks for Ring and Tree AllReduce', () => {
  const ringResult = collectiveApi.solveCollectives({
    totalGpus: 256,
    tensorSizeGb: 14.2,
    algorithm: 'ring-allreduce',
    parallelism: { tensorParallel: 8, pipelineParallel: 4, dataParallel: 8 },
    nvlinkBandwidthGbps: 900,
    infinibandBandwidthGbps: 800,
  });

  assert.ok(ringResult.stepTimeMs > 0);
  assert.ok(ringResult.modelFlopsUtilization > 0 && ringResult.modelFlopsUtilization <= 100);
  assert.ok(ringResult.effectiveClusterTflops > 0);
  assert.equal(ringResult.algorithm, 'ring-allreduce');

  const treeResult = collectiveApi.solveCollectives({
    totalGpus: 256,
    tensorSizeGb: 14.2,
    algorithm: 'tree-allreduce',
    parallelism: { tensorParallel: 8, pipelineParallel: 4, dataParallel: 8 },
    nvlinkBandwidthGbps: 900,
    infinibandBandwidthGbps: 800,
  });

  assert.ok(treeResult.stepTimeMs > 0);
  assert.equal(treeResult.algorithm, 'tree-allreduce');
});

test('straggler node fault injection degrades MFU and increases barrier step time', () => {
  const baseline = collectiveApi.solveCollectives({
    totalGpus: 256,
    stragglerThrottlePercent: 0,
  });

  const degraded = collectiveApi.solveCollectives({
    totalGpus: 256,
    stragglerThrottlePercent: 50,
  });

  assert.ok(degraded.stepTimeMs > baseline.stepTimeMs, 'Straggler should increase total barrier step time');
  assert.ok(degraded.modelFlopsUtilization < baseline.modelFlopsUtilization, 'Straggler should reduce MFU');
  assert.ok(degraded.stragglerDelayMs > 0);
});

test('packet loss affects collective state and coolant controls use the declared 1000 L/min bound', () => {
  const baseline = collectiveApi.solveCollectives({ totalGpus: 256, linkPacketDropRate: 0 });
  const degraded = collectiveApi.solveCollectives({ totalGpus: 256, linkPacketDropRate: 0.1 });
  assert.ok(degraded.commTimeMs > baseline.commTimeMs);
  assert.ok(degraded.stepTimeMs > baseline.stepTimeMs);
  assert.equal(controlsApi.normalizeControls({ coolantFlowLpm: 900 }).coolantFlowLpm, 900);
  assert.equal(controlsApi.normalizeControls({ coolantFlowLpm: 1200 }).coolantFlowLpm, 1000);
});

test('thermal model solves coolant delta-T, PUE, and triggers thermal throttling under reduced flow', () => {
  const nominal = thermalApi.solveThermals({
    totalGpus: 256,
    racksCount: 32,
    coolantFlowLpm: 120,
    cduFlowDegradationPercent: 0,
  });

  assert.ok(nominal.pue >= 1.05 && nominal.pue <= 1.35);
  assert.ok(nominal.coolantDeltaTC > 0);
  assert.equal(nominal.throttledGpuCount, 0);

  const degraded = thermalApi.solveThermals({
    totalGpus: 256,
    racksCount: 32,
    coolantFlowLpm: 120,
    cduFlowDegradationPercent: 75,
  });

  assert.ok(degraded.peakJunctionTempC > nominal.peakJunctionTempC, 'CDU degradation should increase peak junction temp');
  assert.ok(degraded.throttledGpuCount > 0, 'Severe flow degradation should trigger thermal throttling');
});

test('gpu-supercluster plugin produces deterministic simulation and valid receipts', async () => {
  const result = pluginApi.simulate({
    totalGpus: 256,
    racks: 32,
  });

  assert.ok(result.topology);
  assert.ok(result.collectives);
  assert.ok(result.thermals);
  assert.ok(result.receipt);
  assert.equal(result.receipt.schema, 'simulatte.gpuSuperclusterReceipt.v1');
  assert.equal(result.receipt.modelReceipts.length, 2);
  assert.deepEqual(pluginApi.simulate({ totalGpus: 256, racks: 32 }).receipt, result.receipt);

  const presentation = result.createSemanticPresentation({ progress: 0.5 });
  assert.equal(presentation.schema, 'simulatte.semanticPresentation.v4-draft');
  assert.equal(presentation.layers.length, 3);
});

test('gpu-supercluster activates as a native v4 plugin with deterministic playback and comparison', async () => {
  const registrations = [];
  const instance = await pluginApi.activate({
    sdk: { state: { register: (...args) => registrations.push(args) } },
    config: require(path.join(pluginDir, 'default-config.json')),
    scenario: { id: 'straggler-fault-injection', seed: 'supercluster-straggler-002' },
  });

  pluginContracts.validatePluginInstance('gpu-supercluster', instance, manifest);
  assert.equal(registrations.length, 1);
  const ready = instance.contributeV4();
  v4Contracts.validateContribution(ready, 'GPU Supercluster ready contribution');
  assert.equal(ready.state.status, 'ready');
  assert.equal(instance.settle().status, 'not_settled');

  const started = instance.handleAction('scenario.run', {
    values: { phase: 'start', linkPacketDropRate: 0.01, coolantFlowLpm: 900 },
  });
  assert.equal(started.status, 'running');
  assert.equal(started.mode, 'deterministic-result-replay');
  assert.equal(started.resultAuthority, 'recomputed-on-playback-start');
  assert.equal(started.receipt.seed, 'supercluster-straggler-002');
  const applied = instance.contributeV4();
  const controls = new Map(applied.controls.controls.map((control) => [control.id, control]));
  assert.equal(controls.get('linkPacketDropRate').value, 0.01);
  assert.equal(controls.get('coolantFlowLpm').value, 900);
  const fields = new Map(applied.inspections[0].fields.map((field) => [field.id, field]));
  assert.equal(fields.get('scenario-seed').value, 'supercluster-straggler-002');
  assert.equal(fields.get('packet-drop').value, 1);
  assert.equal(fields.get('coolant-flow').value, 900);
  let terminal;
  for (let step = 0; step < 4; step += 1) {
    terminal = instance.handleAction('scenario.run', { values: { phase: 'step' } });
  }
  assert.equal(terminal.status, 'settled');
  const settled = instance.contributeV4();
  v4Contracts.validateContribution(settled, 'GPU Supercluster settled contribution');
  assert.equal(settled.events.length, 4);
  assert.equal(settled.state.status, 'settled');

  const comparison = instance.handleAction('counterfactual.compare');
  assert.equal(comparison.status, 'settled');
  assert.ok(comparison.comparisonBranches.baseline.stepTimeMs > 0);
  assert.ok(comparison.comparisonBranches.intervention.stepTimeMs > 0);
  assert.equal(instance.settle().status, 'settled');
  assert.deepEqual(instance.settle().obligationResults, []);

  const [reduce, initialState] = registrations[0];
  assert.doesNotThrow(() => structuredClone(initialState));
  assert.equal(initialState.result.createSemanticPresentation, undefined);
  assert.equal(initialState.result.createContribution, undefined);
  const updatedState = reduce(initialState, {
    type: 'update-controls',
    controls: { linkPacketDropRate: 0.01 },
  });
  assert.doesNotThrow(() => structuredClone(updatedState));
});
