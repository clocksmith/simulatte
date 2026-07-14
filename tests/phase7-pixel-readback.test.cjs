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

test('Phase 7 action proof samples the relation owner instead of a nearby object', () => {
  const spec = lab.createSpecFromPrompt('airplane flying over trees', { allowPrototypeFallback: true });
  const input = lab.createRenderExecutionInput(spec, { t: 0 }, { width: 640, height: 360 });
  const renderData = rendererScope.compileSceneRenderData(input.sceneRenderPacket);
  renderData.requireLivePixelSamples = true;
  const actions = input.visualObligations.filter((row) => ['action:flying', 'action:motion'].includes(row.obligationId));
  assert.ok(actions.every((row) => row.evidence.includes('phase6:entity:prompt-body-airplane')));
  assert.ok(actions.every((row) => row.evidence.every((id) => !id.includes('tree'))));
  const plan = rendererScope.phase7PixelReadbackPlan(renderData, input.sceneRenderPacket, input, { width: 640, height: 360 });
  for (const action of actions) {
    const samples = plan.samples.filter((row) => row.obligationId === action.obligationId);
    assert.equal(samples.length, 1);
    assert.equal(samples[0].drawableId, 'prompt-body-airplane');
  }
  const proofApi = require('../public/blank/pipeline/phase-07-render/simulatte-render-proof.js');
  const flying = actions.find((row) => row.obligationId === 'action:flying');
  const wrong = proofApi.renderObligationProof(input.sceneRenderPacket, [flying], null, true, {
    ...renderData,
    pixelSamples: { samples: [{ obligationId: flying.obligationId, drawableId: 'surface-tree-1:instance:1', rgba: [80, 160, 220, 255] }] },
  })[0];
  assert.equal(wrong.pixelProof.visibleCount, 0);
  assert.equal(wrong.status, 'fail');
});

test('Phase 7 count proof requires every declared visible instance', () => {
  const spec = lab.createSpecFromPrompt('5 cats in a galaxy', { allowPrototypeFallback: true });
  const input = lab.createRenderExecutionInput(spec, { t: 0 }, { width: 640, height: 360 });
  const renderData = rendererScope.compileSceneRenderData(input.sceneRenderPacket);
  const count = input.visualObligations.find((row) => row.constraintKind === 'count' && row.targetIdentity === 'cat');
  const proofApi = require('../public/blank/pipeline/phase-07-render/simulatte-render-proof.js');
  const proof = proofApi.renderObligationProof(input.sceneRenderPacket, [count], null, true, {
    ...renderData,
    requireLivePixelSamples: true,
    pixelSamples: { samples: [{ obligationId: count.obligationId, drawableId: 'surface-cat-1:instance:1', rgba: [80, 160, 220, 255] }] },
  })[0];
  assert.equal(proof.pixelProof.expectedCount, 5);
  assert.equal(proof.pixelProof.visibleCount, 1);
  assert.equal(proof.status, 'fail');
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

test('Phase 7 proves through only when final projected source geometry crosses the target', () => {
  const proofApi = require('../public/blank/pipeline/phase-07-render/simulatte-render-proof.js');
  const obligation = {
    id: 'relation:spatial:environment-plume:through:entity-detector-slice',
    obligationId: 'relation:spatial:environment-plume:through:entity-detector-slice',
    kind: 'relation', required: true, status: 'preserved',
  };
  const packet = {
    entities: [
      { id: 'plume-a', identity: { type: 'plume' }, representedEntityIds: ['environment:plume'] },
      { id: 'detector-a', identity: { type: 'instrument' }, representedEntityIds: ['entity:detector-slice'] },
    ],
    compositionLedger: { obligations: [obligation] },
  };
  const pixelSamples = { samples: [
    { id: 'source-pixel', obligationId: obligation.id, rgba: [90, 140, 180, 255] },
    { id: 'target-pixel', obligationId: obligation.id, rgba: [120, 170, 200, 255] },
  ] };
  const renderData = {
    requireLivePixelSamples: true,
    pixelSamples,
    cameraState: {},
    objectParts: [
      { entityId: 'plume-a', center: [0.5, 0.5], size: [0.2, 0.12], depth: 0.5 },
      { entityId: 'detector-a', center: [0.5, 0.5], size: [0.5, 0.4], depth: 0.5 },
    ],
  };
  const crossing = proofApi.renderObligationProof(packet, [], packet.compositionLedger, true, renderData)[0];
  assert.equal(crossing.status, 'pass');
  renderData.objectParts[0].center = [0.9, 0.1];
  const missing = proofApi.renderObligationProof(packet, [], packet.compositionLedger, true, renderData)[0];
  assert.equal(missing.geometrySatisfied, false);
  assert.equal(missing.status, 'fail');
});

test('Phase 6 lays out containment, entry, and between relations for final part geometry', () => {
  const proofApi = require('../public/blank/pipeline/phase-07-render/simulatte-render-proof.js');
  const cases = [
    ['mangrove roots buffering storm surge while sediment settles in brackish tidal channels',
      ['relation:spatial:medium-sediment:in:environment-tidal-channels']],
    ['edge data center server racks recirculating heat between cooling aisles under controller limits',
      ['relation:spatial:entity-server-racks:between:entity-cooling-aisles']],
    ['city zoning shadow allocation between building masses with sunlight volumes and pedestrian comfort',
      ['relation:spatial:entity-city-zoning:between:entity-building']],
    ['planetary rings shepherd moon resonance sorting ice boulders into density waves and orbital gaps', [
      'relation:spatial:entity-ice-boulders:into:entity-density-waves',
      'relation:spatial:entity-ice-boulders:into:entity-orbital-gaps',
    ]],
    ['warehouse fire with smoke in concrete stairwell and renderer layers soot',
      ['relation:spatial:entity-smoke-cloud:in:entity-concrete-stairwell']],
    ['glacier calving into fjord with sea ice waves',
      ['relation:spatial:entity-glacier:into:environment-fjord']],
  ];
  for (const [prompt, expectedIds] of cases) {
    const spec = lab.createSpecFromPrompt(prompt, { allowPrototypeFallback: true });
    const packet = spec.renderProgram.sceneRenderPacket;
    const renderData = rendererScope.compileSceneRenderData(packet, packet.sceneKind);
    const proofs = new Map(proofApi.renderObligationProof(
      packet, [], spec.renderProgram.visualIR.compositionLedger, true, renderData
    ).map((row) => [row.obligationId, row]));
    for (const id of expectedIds) {
      assert.equal(proofs.get(id)?.packetSatisfied, true, `${prompt} should preserve ${id}`);
      assert.equal(proofs.get(id)?.geometrySatisfied, true, `${prompt} should visibly place ${id}`);
    }
    for (const target of packet.entities.filter((row) => row.layoutRelationRoles?.includes('between:target'))) {
      const roles = new Set(target.geometry.program.parts.map((row) => row.spatialRole));
      assert.ok(roles.has('between-left-flank') && roles.has('between-right-flank'));
    }
  }
});
