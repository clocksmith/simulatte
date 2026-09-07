const assert = require('node:assert/strict');
const test = require('node:test');
const model = require('../public/blank/pipeline/phase-05-simulation/simulatte-physics-model.js');
require('../public/blank/pipeline/phase-07-render/simulatte-webgpu-renderer.js');
const { phaseFamily } = require('./phase-module-fixture.cjs');
const scope = phaseFamily('webGpuRenderer');

function fixture() {
  const spec = model.createSpecFromPrompt('a red ball', { deterministicRuntime: true });
  const state = { t: 1, solverState: { executionReceipt: {
    status: 'pass', finiteChannels: true, expectedOperatorIds: [], executedOperatorIds: [],
    missingOperatorIds: [], frame: 1,
  } } };
  const canvas = { width: 640, height: 360, dataset: {} };
  const input = model.createRenderExecutionInput(spec, state, canvas);
  const renderer = Object.assign(Object.create(scope.WebGpuRenderer.prototype), {
    canvas, renderInputSerial: 0, pixelReadbackGeneration: 0, pixelReadbackSerial: 0,
    pendingPixelReadbackPacketKey: '', renderCount: 1, lastFrameMs: 2,
    errorLog: [], webgpuOptimizationReceipt: () => ({ deviceClass: 'test-component' }),
    applyRenderData() {}, settleSceneProof() {},
  });
  renderer.setRenderExecutionInput(input);
  return { renderer, input, state };
}

test('published Phase 7 evidence cannot change when live state or frame counters advance', () => {
  const { renderer, state } = fixture();
  const first = renderer.refreshPhase7Output(1, 2);
  const retained = JSON.stringify(first);
  state.solverState.executionReceipt.frame = 2;
  renderer.refreshPhase7Output(2, 9);
  assert.equal(JSON.stringify(first), retained);
  assert.ok(Object.isFrozen(first.artifact.renderExecution.simulationReceipt));
});

test('replacing input with the same packet invalidates its pending pixels and published evidence', () => {
  const { renderer, input } = fixture();
  const generation = renderer.pixelReadbackGeneration;
  renderer.renderData.livePixelSamples = { old: true };
  renderer.canvas.__simulattePixelSamples = renderer.renderData.livePixelSamples;
  renderer.refreshPhase7Output();
  renderer.phase8Output = { stale: true };
  renderer.setRenderExecutionInput({ ...input, simulationState: { t: 9 } });
  assert.ok(renderer.pixelReadbackGeneration > generation);
  assert.equal(renderer.renderData.livePixelSamples, undefined);
  assert.equal(renderer.canvas.__simulattePixelSamples, undefined);
  assert.equal(renderer.phase7Output, null);
  assert.equal(renderer.phase8Output, null);
  assert.equal(renderer.canvas.dataset.sceneProofFinal, 'false');
});

function readbackFixture(renderer) {
  const mapped = new Uint8Array(256);
  mapped.set([210, 40, 40, 255]);
  let release;
  return { release: () => release(), readback: {
    serial: 1, generation: renderer.pixelReadbackGeneration, packetKey: renderer.renderData.packetKey,
    bytesPerRow: 256,
    plan: { samples: [{ id: 'sample', x: 1, y: 1 }], requiredSampleCount: 1,
      requiredObligationCount: 1, unmatchedObligationIds: [] },
    buffer: { mapAsync: () => new Promise(resolve => { release = resolve; }),
      getMappedRange: () => mapped.buffer, unmap() {}, destroy() {} },
  } };
}

test('delayed texture readback proves the submitted state and viewport, not newer mutable inputs', async t => {
  const { renderer, state } = fixture();
  const originalMapMode = global.GPUMapMode;
  global.GPUMapMode = { READ: 1 };
  t.after(() => { global.GPUMapMode = originalMapMode; });
  const { readback, release } = readbackFixture(renderer);
  renderer.renderData.rendererConsumption.cameraConsumed = true;
  let settled = 0;
  renderer.settleSceneProof = () => {
    settled++;
    assert.equal(renderer.renderData.livePixelSamplesStatus,
      renderer.phase7Output.artifact.renderExecution.pixelAudit.status);
  };
  renderer.schedulePixelReadback(readback, 1, 2);
  await new Promise(setImmediate);
  state.solverState.executionReceipt.frame = 99;
  state.solverState.executionReceipt.status = 'fail';
  renderer.renderData.rendererConsumption.cameraConsumed = false;
  release();
  await renderer.pendingPixelReadbackPromise;
  const execution = renderer.phase7Output.artifact.renderExecution;
  assert.equal(execution.simulationReceipt.frame, 1);
  assert.equal(execution.simulationReceipt.status, 'pass');
  assert.equal(execution.renderCount, 1);
  assert.deepEqual(execution.canvas, { width: 640, height: 360 });
  assert.ok(Object.isFrozen(execution));
  assert.equal(execution.rendererConsumption.cameraConsumed, true);
  assert.equal(settled, 1);
  assert.equal(execution.frame.simulationSnapshot.t, 1);
  assert.equal(execution.frame.readbackSerial, 1);
});

test('replacement, resize and disposal prevent late texture readback publication', async t => {
  const originalMapMode = global.GPUMapMode;
  global.GPUMapMode = { READ: 1 };
  t.after(() => { global.GPUMapMode = originalMapMode; });
  for (const invalidate of [
    (renderer, input) => renderer.setRenderExecutionInput({ ...input }),
    renderer => { renderer.canvas.width = 390; },
    renderer => renderer.dispose(),
  ]) {
    const { renderer, input } = fixture();
    const { readback, release } = readbackFixture(renderer);
    let publications = 0;
    renderer.settleSceneProof = () => { publications++; };
    renderer.schedulePixelReadback(readback, 1, 2);
    await new Promise(setImmediate);
    invalidate(renderer, input);
    release();
    await renderer.pendingPixelReadbackPromise;
    assert.equal(publications, 0);
    assert.equal(renderer.phase7Output, null);
    assert.equal(renderer.canvas.__simulattePixelSamples, undefined);
  }
});

test('frame snapshots separate typed numeric state from runtime canvas handles', () => {
  const { renderer, state } = fixture();
  state.values = new Float32Array([1, 2]);
  renderer.canvas.runtimeHandle = () => { throw new Error('not artifact data'); };
  const frame = scope.capturePixelReadbackFrame(renderer, 1, 2);
  state.values[0] = 10;
  assert.deepEqual(frame.input.simulationState.values, [1, 2]);
  assert.deepEqual(frame.input.canvas, { width: 640, height: 360 });
  assert.ok(Object.isFrozen(frame.input.simulationState.values));
});
