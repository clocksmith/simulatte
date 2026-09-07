const assert = require('node:assert/strict');
const test = require('node:test');
const model = require('../public/blank/pipeline/phase-05-simulation/simulatte-physics-model.js');
const inputs = require('../public/blank/pipeline/phase-07-render/simulatte-render-execution-input.js');
require('../public/blank/pipeline/phase-07-render/simulatte-webgpu-renderer.js');
const contracts = require('../public/blank/pipeline/simulatte-phase-contracts.js');
const { phaseFamily } = require('./phase-module-fixture.cjs');
const scope = phaseFamily('webGpuRenderer');
let spec;
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function fixture() {
  spec ||= model.createSpecFromPrompt('two cats', { deterministicRuntime: true });
  const fence = deferred(), mapped = deferred();
  const calls = [];
  const renderer = Object.assign(Object.create(scope.WebGpuRenderer.prototype), {
    initPromise: Promise.resolve(), ready: true, disposed: false,
    device: { limits: { maxTextureDimension2D: 1024 }, queue: { onSubmittedWorkDone: () => fence.promise }, destroy() {} },
    canvas: { width: 640, height: 360, dataset: {} }, renderInputSerial: 0,
    pixelReadbackGeneration: 0, pendingPixelReadbackPacketKey: '', renderCount: 0, lastFrameMs: 0,
    phase7Output: null, phase8Output: null,
    applyRenderData() {}, webgpuOptimizationReceipt: () => ({ deviceClass: 'component-fake-device' }),
    render(input, timeMs) {
      calls.push({ input, timeMs });
      this.canvas.width = this.phaseInvocation.invocation.viewport.width;
      this.canvas.height = this.phaseInvocation.invocation.viewport.height;
      this.renderData.requireLivePixelSamples = false;
      this.refreshPhase7Output(++this.renderCount, 1);
      this.pendingPixelReadbackPromise = mapped.promise;
      return true;
    },
  });
  const invocation = { simulationSnapshot: { t: 0.25 }, frame: { index: 42, simulationTime: 0.25 }, viewport: { width: 300, height: 200 } };
  return { renderer, invocation, previous: spec.phaseArtifacts.phase6, fence, mapped, calls };
}

test('managed Phase 7 consumes explicit state and viewport and waits for both GPU and mapping completion', async () => {
  const { renderer, invocation, previous, fence, mapped, calls } = fixture();
  let settled = false;
  const pending = renderer.renderPhase(previous, invocation).then(value => { settled = true; return value; });
  await new Promise(setImmediate);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].timeMs, 250);
  assert.deepEqual(calls[0].input.simulationState, { t: 0.25 });
  assert.deepEqual(calls[0].input.canvas, { width: 300, height: 200 });
  assert.ok(Object.isFrozen(calls[0].input.simulationState));
  assert.equal(renderer.phase8Output, null, 'Phase 8 belongs to the runner');
  invocation.simulationSnapshot.t = 99;
  fence.resolve(); await new Promise(setImmediate);
  assert.equal(settled, false);
  mapped.resolve();
  const output = await pending;
  assert.equal(output.artifact.renderExecution.frameInvocation.simulationSnapshot.t, 0.25);
  assert.equal(output.artifact.renderExecution.frameInvocation.frame.index, 42);
  assert.equal(output.artifact.renderExecution.gpuCompletion.status, 'completed');
  assert.equal(output.receipts.at(-1).invocationDigest,
    await contracts.artifactDigest(output.artifact.renderExecution.frameInvocation));
  assert.equal(renderer.phaseInvocation, null);
  assert.equal(model.createRenderExecutionInput, inputs.createRenderExecutionInput);
});

test('cancellation clears evidence but retains ownership until in-flight GPU work settles', async () => {
  const { renderer, invocation, previous, fence, mapped } = fixture();
  const abort = new AbortController();
  const pending = renderer.renderPhase(previous, invocation, abort.signal);
  await new Promise(setImmediate);
  abort.abort();
  assert.equal(renderer.phase7Output, null);
  assert.ok(renderer.phaseInvocation);
  await assert.rejects(renderer.renderPhase(previous, invocation), { code: 'SIMULATTE_RENDER_BUSY' });
  assert.throws(() => renderer.setSpec({}), { code: 'SIMULATTE_RENDER_BUSY' });
  fence.resolve(); await new Promise(setImmediate);
  assert.ok(renderer.phaseInvocation);
  mapped.resolve();
  await assert.rejects(pending, { code: 'SIMULATTE_PIPELINE_ABORTED' });
  assert.equal(renderer.phase7Output, null);
  assert.equal(renderer.phaseInvocation, null);
});

test('invalid predecessor, malformed invocation, contradictory time and texture exhaustion submit no work', async () => {
  const { renderer, invocation, previous, calls } = fixture();
  for (const [source, value, pattern] of [
    [{ ...previous, phase: 5 }, invocation, /predecessor/],
    [previous, { ...invocation, hidden: true }, /undeclared/],
    [previous, { ...invocation, simulationSnapshot: { t: 7 } }, /contradicts/],
    [previous, { ...invocation, viewport: { width: 2048, height: 200 } }, /texture limit/],
  ]) await assert.rejects(renderer.renderPhase(source, value), pattern);
  assert.equal(calls.length, 0);
  assert.equal(renderer.phaseInvocation, null);
});

test('device loss and viewport corruption cannot produce a completed phase', async () => {
  for (const kind of ['device', 'viewport', 'dispose']) {
    const { renderer, invocation, previous, fence, mapped } = fixture();
    const pending = renderer.renderPhase(previous, invocation);
    await new Promise(setImmediate);
    if (kind === 'device') renderer.ready = false;
    if (kind === 'viewport') renderer.canvas.width = 1;
    if (kind === 'dispose') renderer.dispose();
    fence.resolve(); mapped.resolve();
    await assert.rejects(pending, /device|viewport|disposed/i);
    assert.equal(renderer.phase7Output, null);
    assert.equal(renderer.phase8Output, null);
  }
});
