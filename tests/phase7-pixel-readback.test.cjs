const assert = require('node:assert/strict');
const test = require('node:test');

const lab = require('../public/blank/pipeline/phase-05-simulation/simulatte-physics-model.js');
require('../public/blank/pipeline/phase-07-render/simulatte-webgpu-renderer.js');

const rendererScope = globalThis.__SimulatteWebGpuRendererRefactorScope;

function glacierReadbackFixture() {
  const spec = lab.createSpecFromPrompt('glacier calving into fjord with sea ice waves', {
    allowPrototypeFallback: true,
  });
  const input = lab.createRenderExecutionInput(spec, { t: 0 }, { width: 640, height: 360 });
  const packet = input.sceneRenderPacket;
  const renderData = rendererScope.compileSceneRenderData(packet, packet.sceneKind);
  renderData.requireLivePixelSamples = true;
  return { input, packet, renderData };
}

test('Phase 7 sparse readback covers every required construction obligation above the old cap', () => {
  const { input, packet, renderData } = glacierReadbackFixture();
  const plan = rendererScope.phase7PixelReadbackPlan(
    renderData,
    packet,
    input,
    { width: 640, height: 360 }
  );
  const requiredIds = rendererScope.phase7RequiredVisualObligationIds(input, packet);
  const sampledIds = new Set(plan.samples.map((row) => row.obligationId));

  assert.equal(plan.status, 'ready');
  assert.ok(plan.sampleCount > 32);
  assert.equal(plan.sampleCount, plan.requiredSampleCount);
  assert.equal(plan.requiredObligationCount, requiredIds.length);
  assert.deepEqual(plan.unmatchedObligationIds, []);
  assert.ok(requiredIds.every((id) => sampledIds.has(id)));
});

test('Phase 7 retries a failed contrast proof at most three times for the same packet', () => {
  const { input, packet, renderData } = glacierReadbackFixture();
  const first = rendererScope.phase7PixelReadbackPlan(
    renderData,
    packet,
    input,
    { width: 640, height: 360 }
  );
  renderData.livePixelSamples = {
    schema: 'simulatte.phase7PixelSampleSet.v1',
    packetKey: renderData.packetKey,
    samples: first.samples,
  };
  renderData.livePixelSamplesStatus = 'fail';
  renderData.livePixelReadbackAttemptCount = 2;
  assert.ok(rendererScope.phase7PixelReadbackPlan(
    renderData,
    packet,
    input,
    { width: 640, height: 360 }
  ));
  renderData.livePixelReadbackAttemptCount = 3;
  assert.equal(rendererScope.phase7PixelReadbackPlan(renderData, packet, input, { width: 640, height: 360 }), null);
});

test('Phase 7 samples the exact target entity before token-similar drawables', () => {
  const drawables = [
    { id: 'open-qubit-chip-1', label: 'qubit chip microwave signal', representedEntityIds: [] },
    { id: 'open-microwave-resonator-2', label: 'resonator', representedEntityIds: [] },
  ];
  const ranked = rendererScope.drawablesForPixelObligation(drawables, {
    id: 'visual:construction:resonator:topology',
    target: 'microwave resonator',
    targetIdentity: 'microwave-resonator',
    targetEntityId: 'open-microwave-resonator-2',
  });

  assert.equal(ranked[0].id, 'open-microwave-resonator-2');
});

test('Phase 7 reports readback capacity overflow instead of truncating proof', () => {
  const { input, packet, renderData } = glacierReadbackFixture();
  const visualObligations = Array.from({ length: 400 }, (_, index) => ({
    id: `visual:capacity:${index}`,
    obligationId: `visual:capacity:${index}`,
    kind: 'visual',
    required: true,
    target: 'glacier',
  }));
  const plan = rendererScope.phase7PixelReadbackPlan(
    renderData,
    packet,
    { ...input, visualObligations, compositionLedger: { obligations: [] } },
    { width: 640, height: 360 }
  );

  assert.equal(plan.status, 'sample-capacity-exceeded');
  assert.equal(plan.requiredSampleCount, 400);
  assert.equal(plan.sampleCount, 0);
  assert.equal(plan.unmatchedObligationIds.length, 400);
});
