const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const tierApi = require('../public/simulatte/app/tier-scene-renderer.js');
const createApi = require('../public/blank/pipeline/phase-07-render/simulatte-webgpu-renderer.js');

test('Tier drawing works without a controller, network, HUD, or animation loop', async () => {
  const calls = [];
  const ctx = Object.fromEntries(['clearRect', 'fillRect', 'save', 'restore', 'beginPath', 'arc', 'fill'].map(name => [name, (...args) => calls.push([name, ...args])]));
  ctx.getImageData = (x, y, width, height) => ({ data: new Uint8ClampedArray(width * height * 4) });
  const canvas = { width: 100, height: 100, getContext: type => type === '2d' ? ctx : null };
  const session = tierApi.createSession({ canvas });
  await session.ready;
  assert.throws(() => session.render(), /tier_scene_missing/);
  assert.throws(() => session.setScene({ tier: 'unknown' }), /tier_scene_invalid/);
  session.setScene({ tier: 'solar-system', data: {}, view: { width: 100, height: 100, zoom: 1, panX: 50, panY: 50 } });
  session.resize({ width: 200, height: 120 });
  session.setCamera({ zoom: 2, panX: 60 });
  session.render();
  assert.deepEqual(calls.find(row => row[0] === 'clearRect'), ['clearRect', 0, 0, 200, 120]);
  assert.equal(calls.find(row => row[0] === 'arc')[1], 60);
  assert.equal(session.receipt().frameCount, 1);
  assert.equal(session.capture().rgbaBytes.length, 200 * 120 * 4);
  assert.throws(() => session.setCamera({ zoom: 0 }), /tier_camera_invalid/);
  assert.throws(() => session.resize({ width: -1, height: 10 }), /tier_viewport_invalid/);
  assert.throws(() => session.pick({ x: 0, y: 0 }), { code: 'renderer_operation_unsupported' });
  await session.dispose();
  assert.throws(() => session.render(), { code: 'renderer_disposed' });
});

test('Create session preserves the exact phase-6 input, phase-7 output, and pick coordinates', async () => {
  const input = { schema: 'simulatte.renderExecutionInput.v1', contentHash: 'exact-input' };
  const output = { schema: 'phase7-output', evidence: 'not-visual-proof' };
  const calls = [];
  let disposed = false;
  const renderer = {
    initPromise: Promise.resolve(), isReady: () => !disposed, phase7Output: output,
    setRenderExecutionInput: value => calls.push(['scene', value]),
    render: (value, timeMs) => calls.push(['render', value, timeMs]),
    pick: (x, y) => [x, y], resize: () => calls.push(['resize']),
    dispose: () => { disposed = true; },
  };
  const session = createApi.createSession({ renderer });
  await session.ready;
  session.setScene(input);
  session.render({ scene: input, timeMs: 123 });
  assert.equal(calls[0][1], input);
  assert.equal(calls[1][1], input);
  assert.equal(calls[1][2], 123);
  assert.equal(session.receipt(), output);
  assert.deepEqual(session.pick({ x: 2, y: 3 }), [2, 3]);
  assert.throws(() => session.capture(), { code: 'renderer_operation_unsupported' });
  renderer.onFailure(new Error('lost test device'));
  assert.equal(session.status().state, 'failed');
  assert.equal(disposed, true);
});

test('Create lifecycle destroys a device acquired after disposal', async () => {
  let finishRequest;
  let destroyed = 0;
  const scope = {
    webGpuDeviceClass: () => 'test',
    requestWebGpuDevice: () => new Promise(resolve => { finishRequest = resolve; }),
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../public/blank/pipeline/phase-07-render/simulatte-webgpu-renderer-lifecycle.js'), 'utf8'), {
    SimulattePhaseModuleRegistry: { family: () => scope, define: (family, file, values) => Object.assign(scope, values) },
    navigator: { gpu: { requestAdapter: async () => ({}) } },
  });
  const renderer = new scope.WebGpuRendererLifecycle();
  renderer.pixelReadbackGeneration = 0;
  const pending = renderer.init();
  await new Promise(setImmediate);
  renderer.dispose();
  finishRequest({ device: { destroy() { destroyed++; } } });
  await pending;
  assert.equal(destroyed, 1);
  assert.equal(renderer.ready, false);
  assert.equal(renderer.pixelReadbackGeneration, 1);
});
