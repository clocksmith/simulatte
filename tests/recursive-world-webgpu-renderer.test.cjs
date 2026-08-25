const assert = require('node:assert/strict');
const test = require('node:test');

const referenceApi = require('../public/simulatte/world/earth-virginia-datacenter-reference.js');
const contracts = require('../public/shared/contracts/multiscale-contracts.js');
const sceneApi = require('../public/simulatte/world/recursive-world-scene.js');
const viewApi = require('../public/simulatte/world/recursive-world-view.js');
const rendererApi = require('../public/simulatte/world/recursive-world-webgpu-renderer.js');

function loadInputs() {
  const load = (name) => require(`../public/data/subsea-network-global/${name}.json`);
  return {
    datasets: {
      fcc: load('fcc-cable-license-register-2025-v1'),
      landings: load('landing-points-governed-v1'),
      topology: load('cable-corridors-modeled-v1'),
      capacities: load('capacity-scenarios-v1'),
      demands: load('demand-scenarios-v1'),
      repairs: load('repair-resources-v1'),
      governance: load('model-governance-v1'),
      provenance: load('provenance-registry-v1'),
    },
    subseaConfig: require('../public/shared/plugins/subsea-network-global/default-config.json'),
    gpuConfig: require('../public/shared/plugins/gpu-supercluster/default-config.json'),
  };
}

test('scene compiler resolves nested frames and emits stable instanced geometry', () => {
  const reference = referenceApi.createReferenceWorld(loadInputs());
  const scene = sceneApi.compileScene(reference.worldSpec);
  assert.equal(scene.instances.length, 6);
  assert.deepEqual(scene.groups.map((group) => [group.meshKind, group.instanceCount]), [['box', 5], ['sphere', 1]]);
  const facility = contracts.wgs84ToEcef([39.0438, -77.4874, 100]);
  const gpu = sceneApi.transformPoint(scene.frameTransforms['virginia-gpu-0001-local-meters'], [0, 0, 0]);
  assert.ok(gpu.every((value, index) => Math.abs(value - facility[index] - (index === 2 ? 1.1 : 0)) < 1e-8));
  assert.equal(scene.baseInstanceData.length, scene.instances.length * sceneApi.INSTANCE_FLOATS);
});

test('frame state derives visual metrics only from published coordinator outputs', async () => {
  const reference = referenceApi.createReferenceWorld(loadInputs());
  await reference.coordinator.runUntil(3900);
  const scene = sceneApi.compileScene(reference.worldSpec);
  const observation = reference.coordinator.observePorts();
  const frame = sceneApi.buildFrameState(scene, observation);
  assert.equal(frame.logicalTime, 3900);
  assert.equal(frame.metrics['subsea-capacity'].value, observation.records['subsea.mid-atlantic.delivered-gbps'].value);
  assert.equal(frame.metrics['cluster-temperature'].value, observation.records['gpu-cluster.peak-junction-temperature-c'].value);
  assert.notEqual(frame.instanceData, scene.baseInstanceData);
  assert.throws(
    () => sceneApi.buildFrameState(scene, { ...observation, records: {} }),
    (error) => error.code === 'recursive_scene_observation_missing'
  );
});

test('view controller uses the selected nested target as a floating origin', () => {
  const reference = referenceApi.createReferenceWorld(loadInputs());
  const scene = sceneApi.compileScene(reference.worldSpec);
  const view = viewApi.createViewController(scene, { initialTargetId: 'facility' });
  const facility = view.sample({ nowMs: 0, aspect: 16 / 9 });
  const anchor = contracts.wgs84ToEcef([39.0438, -77.4874, 100]);
  assert.ok(facility.floatingOrigin.every((value, index) => Math.abs(value - anchor[index] - (index === 2 ? 12 : 0)) < 1e-8));
  view.focus('gpu', { startedAtMs: 100, durationMs: 0 });
  const gpu = view.sample({ nowMs: 100, aspect: 16 / 9 });
  assert.ok(gpu.floatingOrigin.every((value, index) => Math.abs(value - anchor[index] - (index === 2 ? 1.1 : 0)) < 1e-8));
  assert.equal(gpu.distanceMeters, 0.8);
});

test('WebGPU adapter submits instanced groups and emits a bounded frame receipt', async () => {
  const reference = referenceApi.createReferenceWorld(loadInputs());
  await reference.coordinator.runUntil(3900);
  const scene = sceneApi.compileScene(reference.worldSpec);
  const fake = fakeGpu();
  const canvas = {
    width: 1,
    height: 1,
    clientWidth: 800,
    clientHeight: 450,
    toBlob(callback) { callback(new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/png' })); },
  };
  const renderer = await rendererApi.createRenderer({
    canvas,
    scene,
    device: fake.device,
    context: fake.context,
    now: fake.now,
    initialTargetId: 'earth',
    buildId: 'test-build',
    runtimeId: 'test-runtime',
    deviceClass: 'webgpu:test-device',
  });
  const receipt = renderer.render({ observation: reference.coordinator.observePorts(), nowMs: 0 });
  assert.equal(receipt.instanceCount, 6);
  assert.equal(receipt.drawCount, 2);
  assert.equal(receipt.frameBudgetClaimed, false);
  assert.equal(receipt.gpuTimingAvailable, false);
  assert.match(receipt.contentHash, /^fnv1a32:[0-9a-f]{8}$/);
  assert.deepEqual(fake.draws.map((row) => row.slice(0, 2)), [[36, 5], [1728, 1]]);
  assert.equal(fake.submissions, 1);
  assert.equal(await renderer.waitForSubmittedWork(), 0.25);
  assert.equal(fake.completions, 1);
  const visual = await renderer.captureVisualEvidence(receipt);
  assert.equal(visual.source, 'browser-webgpu');
  assert.match(visual.pixelEvidenceHash, /^sha256:[0-9a-f]{64}$/);
  assert.equal(visual.pixelByteLength, 4);
  renderer.dispose();
});

function fakeGpu() {
  const draws = [];
  const writes = [];
  let submissions = 0;
  let completions = 0;
  let clock = 0;
  const buffer = () => ({ destroy() {} });
  const pass = {
    setPipeline() {},
    setBindGroup() {},
    setVertexBuffer() {},
    draw(...args) { draws.push(args); },
    end() {},
  };
  const device = {
    queue: {
      writeBuffer(...args) { writes.push(args); },
      submit() { submissions += 1; },
      async onSubmittedWorkDone() { completions += 1; },
    },
    createShaderModule(value) { return value; },
    createBindGroupLayout(value) { return value; },
    createPipelineLayout(value) { return value; },
    createRenderPipeline(value) { return value; },
    createBuffer: buffer,
    createBindGroup(value) { return value; },
    createTexture() { return { createView() { return {}; }, destroy() {} }; },
    createCommandEncoder() { return { beginRenderPass() { return pass; }, finish() { return {}; } }; },
  };
  const context = { configure() {}, getCurrentTexture() { return { createView() { return {}; } }; } };
  return {
    device,
    context,
    draws,
    writes,
    get submissions() { return submissions; },
    get completions() { return completions; },
    now() { clock += 0.25; return clock; },
  };
}
