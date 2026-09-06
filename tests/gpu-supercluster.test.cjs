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

test('GPU controls preserve zero faults, clamp physical bounds, and refuse malformed input', () => {
  assert.equal(controlsApi.normalizeControls({ tensorSizeGb: 0 }).tensorSizeGb, 0.1);
  assert.equal(controlsApi.normalizeControls({ tensorSizeGb: 1200 }).tensorSizeGb, 1000);
  assert.equal(controlsApi.normalizeControls({ coolantFlowLpm: 0 }).coolantFlowLpm, 10);
  assert.equal(controlsApi.normalizeControls({ stragglerThrottlePercent: 0 }).stragglerThrottlePercent, 0);
  for (const key of ['tensorSizeGb', 'stragglerThrottlePercent', 'coolantFlowLpm', 'linkPacketDropRate', 'cduFlowDegradationPercent']) {
    for (const value of [NaN, Infinity, 'invalid', '', null]) {
      assert.throws(() => controlsApi.normalizeControls({ [key]: value }), /gpu_control_invalid/);
    }
  }
});

test('pipeline time includes the full bubble share and throughput reconciles to work over time', () => {
  const result = collectiveApi.solveCollectives();
  const idealSeconds = 14.2e9 * 120000 / (256 * 1979 * 1e12);
  // PP=4, M=16: productive time occupies 16/19 of the pipeline schedule.
  assert.ok(Math.abs(result.computeTimeMs - idealSeconds * 19 / 16 * 1000) < 0.005);
  assert.ok(Math.abs(result.effectiveClusterTflops - (14.2e9 * 120000 / (result.stepTimeMs / 1000) / 1e12)) < 10);
  const single = collectiveApi.solveCollectives({ totalGpus: 1, parallelism: { tensorParallel: 1, pipelineParallel: 1, dataParallel: 1 } });
  assert.equal(single.modelFlopsUtilization, 100, 'an ideal no-communication fixture must not be clipped to 85%');
  assert.throws(() => collectiveApi.solveCollectives({ totalGpus: 128 }), /gpu_parallelism_must_match_cluster/);
});

test('default NVLink uses directional bits per second without changing explicit configured units', () => {
  const nominal = collectiveApi.solveCollectives();
  const slower = collectiveApi.solveCollectives({ nvlinkBandwidthGbps: 900 });
  const expectedTransferDifferenceMs = (2 * 7 / 8) * (14.2e9 / 32) * (1 / 112.5e9 - 1 / 450e9) * 1000;
  assert.ok(Math.abs((slower.commTimeMs - nominal.commTimeMs) - expectedTransferDifferenceMs) < 0.01);
});

test('coolant flow changes die temperature and thermal caps slow computation and conserve modeled heat', () => {
  const nominal = pluginApi.simulate();
  const reduced = pluginApi.simulate({ coolantFlowLpm: 40 });
  assert.ok(reduced.thermals.peakJunctionTempC > nominal.thermals.peakJunctionTempC);
  const hot = pluginApi.simulate({ coolantFlowLpm: 10, cduFlowDegradationPercent: 90 });
  assert.ok(hot.thermals.demandedPeakJunctionTempC > 80);
  assert.ok(hot.thermals.peakJunctionTempC <= 80);
  assert.ok(hot.thermals.thermalClockFraction < 1);
  assert.equal(hot.collectives.thermalClockFraction, hot.thermals.thermalClockFraction);
  assert.ok(hot.collectives.computeTimeMs > nominal.collectives.computeTimeMs);
  assert.ok(hot.collectives.effectiveClusterTflops < nominal.collectives.effectiveClusterTflops);
  assert.equal(hot.thermals.throttledGpuCount, 256);
  const heatKw = hot.thermals.effectiveFlowLpm / 60 * 4184 * hot.thermals.coolantDeltaTC / 1000;
  assert.ok(Math.abs(heatKw - hot.thermals.totalItPowerKw) < 0.1);
  const small = thermalApi.solveThermals({ totalGpus: 16, racksCount: 4, coolantFlowLpm: 10, gpuTdpW: 2000 });
  assert.equal(small.throttledGpuCount, 16);
  assert.ok(Math.abs(small.racks.reduce((sum, rack) => sum + rack.powerDrawKw, 0) - small.totalItPowerKw) < 0.1);
});

test('rack populations cannot silently drop GPUs or contradict the declared nodes', () => {
  assert.throws(() => topologyApi.buildClusterTopology({ totalGpus: 255, racks: 32 }), /even_rack_population/);
  assert.throws(() => topologyApi.buildClusterTopology({ totalGpus: 256, racks: 32, nodesPerRack: 8, gpusPerNode: 8 }), /node_population_mismatch/);
  const config = require(path.join(pluginDir, 'default-config.json'));
  assert.equal(config.racks * config.nodesPerRack * config.gpusPerNode, config.totalGpus);
});

test('rack visuals retain exact model temperatures and PUE remains a ratio', () => {
  const result = pluginApi.simulate({ coolantFlowLpm: 40 });
  const contribution = result.createContribution();
  const racks = contribution.presentation.layers.filter((layer) => layer.id.startsWith('rack:'));
  assert.equal(racks.length, 32);
  for (const [index, rack] of racks.entries()) {
    assert.equal(rack.quantity.value, result.thermals.racks[index].avgTempC);
    assert.equal(rack.aggregationKey, null);
  }
  const format = require('../public/simulatte/app/experience-presentation.js').formatMeasure;
  assert.equal(format(contribution.state.measures.find(row => row.kind === 'cooling-pue')), `${result.thermals.pue}×`);
  assert.equal(format({ value: 0.25, unit: 'probability' }), '25%');
});

test('GPU model provenance binds the source bytes used by the simulation', () => {
  const crypto = require('node:crypto');
  const records = pluginApi.simulate().createContribution().provenanceRecords;
  for (const [name, file] of [['topology', 'cluster-topology.js'], ['collectives', 'collective-solver.js'], ['thermals', 'thermal-model.js']]) {
    const record = records.find((row) => row.id === `gpu-supercluster:model:${name}-v1`);
    assert.equal(record.contentHash, crypto.createHash('sha256').update(fs.readFileSync(path.join(pluginDir, file))).digest('hex'));
  }
});

test('rack glyph drawing uses model values unchanged across render calls', () => {
  const renderer = require('../public/simulatte/app/tier-renderers.js');
  const calls = [];
  const ctx = { save() {}, restore() {}, fillRect: (...args) => calls.push(['fill', ...args]), strokeRect() {}, fillText: (...args) => calls.push(['text', ...args]) };
  const marker = { quantityKind: 'modeled-rack-temperature', quantityValue: 0, label: 'R1-1 · 0°C' };
  assert.equal(renderer.drawDatacenterMarker(ctx, { x: 100, y: 100 }, marker, 20), true);
  const first = structuredClone(calls); calls.length = 0;
  renderer.drawDatacenterMarker(ctx, { x: 100, y: 100 }, marker, 20);
  assert.deepEqual(calls, first);
  assert.ok(calls.some(row => row[0] === 'text' && row[1] === '0°C'));
  assert.equal(calls.filter(row => row[0] === 'fill').length, 9);
});

test('datacenter overview fits the model coordinates inside the exposed canvas at both widths', () => {
  const camera = require('../public/simulatte/app/multi-tier-visualizer.js');
  const projection = require('../public/simulatte/app/tier-plugin-presentation.js');
  const coordinates = topologyApi.buildClusterTopology().racks.map(rack => [rack.xM, rack.yM, rack.zM]);
  for (const [width, height] of [[1440, 1000], [390, 844]]) {
    const view = camera.coordinateEvidenceView({ coordinates, coordinateSystem: 'datacenter-cartesian-meters', width, height });
    const points = coordinates.map(point => projection.projectPoint(point, 'datacenter-cartesian-meters', view));
    assert.ok(points.every(point => point.x > 20 && point.x < width - 20));
    if (width === 390) assert.ok(points.every(point => point.y >= 350 && point.y <= 570));
    else assert.ok(points.every(point => point.x > 250 && point.y > 200 && point.y < 800));
  }
});

test('playback explanation follows the emitted stage rather than advancing one chapter ahead', () => {
  const presentation = require('../public/simulatte/app/experience-presentation.js');
  const profile = require('../public/data/application-profiles/gpu-supercluster-v1.json');
  const result = pluginApi.simulate();
  const summary = presentation.summarize({ profile, contributions: [result.createContribution(1)], runState: 'paused', playback: { currentStep: 1, totalSteps: 4 } });
  assert.equal(summary.stageLabel, 'Forward computation');
  assert.equal(summary.narrative, profile.experience.stages[0].narrative);
});

test('host refreshes cached GPU contributions after private control and playback mutations', async () => {
  const host = require('../public/simulatte/platform/plugin-host/plugin-runtime.js');
  const catalog = require('../public/simulatte/platform/data-catalog/immutable-data-catalog.js');
  const config = require(path.join(pluginDir, 'default-config.json'));
  const row = { manifest, configs: { [config.id]: config }, factory: pluginApi };
  const profile = require('../public/data/application-profiles/gpu-supercluster-v1.json');
  const runtime = await host.createPluginRuntime({ registry: { entry: () => row }, profile, dataCatalog: catalog.createDataCatalog([]), corePorts: { clock: {}, worldQuery: {}, routing: {}, ui: {} } });
  try {
    const before = runtime.platformV4({});
    assert.equal(before.contributions[0].controls.controls.find(c => c.id === 'coolantFlowLpm').value, 120);
    await runtime.dispatchAction('gpu-supercluster', 'scenario.run', { values: { phase: 'start', coolantFlowLpm: 40 } });
    const after = runtime.platformV4({});
    assert.equal(after.contributions[0].controls.controls.find(c => c.id === 'coolantFlowLpm').value, 40);
    assert.notEqual(after, before);
    await runtime.dispatchAction('gpu-supercluster', 'scenario.run', { values: { phase: 'step' } });
    assert.equal(runtime.platformV4({}).contributions[0].events.length, 1);
  } finally { await runtime.dispose(); }
});
