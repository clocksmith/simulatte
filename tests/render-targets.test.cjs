const test = require('node:test');
const assert = require('node:assert/strict');
const targets = require('../public/shared/render/render-targets.js');
const descriptor = { width: 640, height: 480, sampleCount: 1, colorFormat: 'bgra8unorm', depthFormat: 'depth24plus', usage: 16, label: 'test' };
function device() {
  return { limits: { maxTextureDimension2D: 2048 }, allocations: [], createTexture(info) {
    const resource = { info, destroyed: 0, destroy() { this.destroyed++; } };
    this.allocations.push(resource);
    return resource;
  } };
}
test('attachments reuse only compatible device and descriptors and dispose once', () => {
  const gpu = device();
  const first = targets.resize(null, gpu, descriptor);
  assert.equal(targets.resize(first, gpu, { ...descriptor }), first);
  const second = targets.resize(first, gpu, { ...descriptor, width: 800 });
  assert.equal(first.disposed, true);
  first.destroy();
  assert.equal(first.depth.destroyed, 1);
  const third = targets.resize(second, device(), { ...descriptor, width: 800 });
  assert.notEqual(third, second);
  assert.equal(second.disposed, true);
  third.destroy();
});
test('failed resize cleans partial allocation without invalidating live attachments', () => {
  const gpu = device();
  const first = targets.resize(null, gpu, descriptor);
  const allocate = gpu.createTexture;
  gpu.createTexture = function(info) {
    if (info.format === 'depth24plus') throw new Error('allocation failed');
    return allocate.call(this, info);
  };
  assert.throws(() => targets.resize(first, gpu, { ...descriptor, width: 800 }), /allocation failed/);
  assert.equal(first.disposed, false);
  assert.equal(gpu.allocations.at(-1).destroyed, 1);
  assert.throws(() => targets.resize(first, gpu, { ...descriptor, width: 4096 }), /descriptor_invalid/);
});

test('Create replaces disposed or previous-device targets even when canvas size is unchanged', () => {
  require('../public/blank/pipeline/phase-07-render/simulatte-webgpu-renderer.js');
  const { phaseFamily } = require('./phase-module-fixture.cjs');
  const resize = phaseFamily('webGpuRenderer').WebGpuRenderer.prototype.resize;
  const previousWindow = global.window;
  global.window = { devicePixelRatio: 1 };
  try {
    const renderer = { device: device(), maxDpr: 2, quality: 1,
      canvas: { getBoundingClientRect: () => ({ width: 640, height: 480 }) } };
    resize.call(renderer);
    const first = renderer.renderTargets;
    resize.call(renderer);
    assert.equal(renderer.renderTargets, first);
    first.destroy();
    resize.call(renderer);
    assert.notEqual(renderer.renderTargets, first);
    const second = renderer.renderTargets;
    renderer.device = device();
    resize.call(renderer);
    assert.equal(second.disposed, true);
    assert.equal(renderer.renderTargets.device, renderer.device);
    renderer.renderTargets.destroy();
  } finally {
    if (previousWindow === undefined) delete global.window;
    else global.window = previousWindow;
  }
});
