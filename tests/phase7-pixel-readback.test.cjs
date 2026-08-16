const assert = require('node:assert/strict');
const test = require('node:test');

const lab = require('../public/blank/pipeline/phase-05-simulation/simulatte-physics-model.js');
require('../public/blank/pipeline/phase-07-render/simulatte-webgpu-renderer.js');
const { phaseFamily } = require('./phase-module-fixture.cjs');

const rendererScope = phaseFamily('webGpuRenderer');

function pixelSampleSet(renderData, samples, source = 'phase7-test-readback') {
  return {
    schema: 'simulatte.phase7PixelSampleSet.v1',
    source,
    packetKey: renderData.packetKey,
    readbackSerial: 1,
    samples,
  };
}

function markSemanticSubmissionConsumed(renderData) {
  renderData.rendererConsumption.objectSubmissionConsumed = true;
  renderData.rendererConsumption.semanticCodesConsumed = true;
  renderData.rendererConsumption.objectPartCountConsumed = renderData.objectPartCount;
  return renderData;
}

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

test('Phase 7 snapshots supplied pixel evidence without coercion or mutable references', () => {
  const { renderData } = glacierReadbackFixture();
  const source = pixelSampleSet(renderData, [{
    id: 'hidden-sample',
    visible: false,
    rgba: [0, 0, 0, 0],
  }]);
  const snapshot = rendererScope.immutableRenderEvidence(source);
  source.samples[0].visible = true;
  source.samples[0].rgba[3] = 255;

  assert.equal(snapshot.samples[0].visible, false);
  assert.equal(snapshot.samples[0].rgba[3], 0);
  assert.ok(Object.isFrozen(snapshot));
  assert.ok(Object.isFrozen(snapshot.samples));
  assert.ok(Object.isFrozen(snapshot.samples[0].rgba));
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

test('Phase 7 color proof samples distinct bound parts instead of one occludable entity center', () => {
  const spec = lab.createSpecFromPrompt('yellow excavator beside a glass greenhouse', {
    allowPrototypeFallback: true,
  });
  const input = lab.createRenderExecutionInput(spec, { t: 0 }, { width: 390, height: 844 });
  const renderData = rendererScope.compileSceneRenderData(input.sceneRenderPacket);
  renderData.requireLivePixelSamples = true;
  const color = input.visualObligations.find((row) => (
    row.obligationId === 'visual:prompt-property-excavator-color-#f4d03f'
  ));
  const plan = rendererScope.phase7PixelReadbackPlan(
    renderData,
    input.sceneRenderPacket,
    input,
    { width: 390, height: 844 }
  );
  const samples = plan.samples.filter((row) => row.obligationId === color.obligationId);

  assert.equal(samples.length, 4);
  assert.equal(new Set(samples.map((row) => row.constructionPartId)).size, 4);
  assert.ok(samples.every((row) => row.drawableId === 'surface-excavator-1'));
  assert.ok(samples.some((row) => ['panel', 'appendage'].includes(row.constructionRole)));
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
    pixelSamples: pixelSampleSet(renderData, [
      { obligationId: flying.obligationId, drawableId: 'surface-tree-1:instance:1', rgba: [80, 160, 220, 255] },
    ]),
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
    pixelSamples: pixelSampleSet(renderData, [
      { obligationId: count.obligationId, drawableId: 'surface-cat-1:instance:1', rgba: [80, 160, 220, 255] },
    ]),
  })[0];
  assert.equal(proof.pixelProof.expectedCount, 5);
  assert.equal(proof.pixelProof.visibleCount, 1);
  assert.equal(proof.status, 'fail');
});

test('Phase 7 does not certify required visuals without live pixel readback', () => {
  const spec = lab.createSpecFromPrompt('a dog', { allowPrototypeFallback: true });
  const input = lab.createRenderExecutionInput(spec, { t: 0 }, { width: 640, height: 360 });
  const dog = input.visualObligations.find((row) => row.obligationId === 'entity:dog');
  const renderData = rendererScope.compileSceneRenderData(input.sceneRenderPacket);
  const proofApi = require('../public/blank/pipeline/phase-07-render/simulatte-render-proof.js');
  const proof = proofApi.renderObligationProof(input.sceneRenderPacket, [dog], input.compositionLedger, true, renderData)[0];

  assert.equal(proof.pixelSatisfied, false);
  assert.equal(proof.pixelProof.reason, 'required visual obligation has no live pixel readback');
  assert.equal(proof.status, 'fail');
});

test('Phase 7 absence proof binds the compiled semantic submission to current texture readback', () => {
  const spec = lab.createSpecFromPrompt('a dog but no cat', { allowPrototypeFallback: true });
  const input = lab.createRenderExecutionInput(spec, { t: 0 }, { width: 640, height: 360 });
  const absence = input.visualObligations.find((row) => row.constraintKind === 'absence' && row.targetIdentity === 'cat');
  assert.ok(absence, 'required cat absence reaches Phase 7');
  assert.equal(absence.targetSemanticCode, 2);
  const renderData = markSemanticSubmissionConsumed(
    rendererScope.compileSceneRenderData(input.sceneRenderPacket)
  );
  renderData.requireLivePixelSamples = true;
  const plan = rendererScope.phase7PixelReadbackPlan(renderData, input.sceneRenderPacket, input, { width: 640, height: 360 });
  const samples = plan.samples.filter((row) => row.obligationId === absence.obligationId);
  assert.equal(samples.length, 0);
  assert.ok(!plan.unmatchedObligationIds.includes(absence.obligationId));

  const proofApi = require('../public/blank/pipeline/phase-07-render/simulatte-render-proof.js');
  const currentSamples = pixelSampleSet(renderData, plan.samples.map((sample) => ({
    ...sample,
    rgba: [80, 160, 220, 255],
  })), 'webgpu-texture-copy-readback');
  const proven = proofApi.renderObligationProof(input.sceneRenderPacket, [absence], input.compositionLedger, true, {
    ...renderData,
    pixelSamples: currentSamples,
  })[0];
  assert.equal(proven.packetSatisfied, true);
  assert.equal(proven.pixelProof.detector.status, 'pass');
  assert.equal(proven.pixelProof.detector.inspectedRegion, 'full-canvas-render-submission');
  assert.equal(proven.pixelProof.detector.readbackSerial, 1);
  assert.equal(proven.status, 'pass');

  const forbiddenPacket = structuredClone(input.sceneRenderPacket);
  const forbiddenEntity = structuredClone(forbiddenPacket.entities.find((row) => row.identity.type === 'dog'));
  forbiddenEntity.id = 'forbidden-cat';
  forbiddenEntity.label = 'cat';
  forbiddenEntity.identity = { ...forbiddenEntity.identity, type: 'cat', label: 'cat', sourceLabel: 'cat' };
  forbiddenEntity.renderCodes = { ...forbiddenEntity.renderCodes, semanticCode: absence.targetSemanticCode };
  forbiddenPacket.entities.push(forbiddenEntity);
  const forbiddenRenderData = markSemanticSubmissionConsumed(
    rendererScope.compileSceneRenderData(forbiddenPacket)
  );
  forbiddenRenderData.requireLivePixelSamples = true;
  const forbiddenPlan = rendererScope.phase7PixelReadbackPlan(
    forbiddenRenderData, forbiddenPacket, input, { width: 640, height: 360 }
  );
  const forbiddenIdentity = proofApi.renderObligationProof(forbiddenPacket, [absence], input.compositionLedger, true, {
    ...forbiddenRenderData,
    pixelSamples: pixelSampleSet(forbiddenRenderData, forbiddenPlan.samples.map((sample) => ({
      ...sample,
      rgba: [80, 160, 220, 255],
    })), 'webgpu-texture-copy-readback'),
  })[0];
  assert.equal(forbiddenIdentity.packetSatisfied, false);
  assert.equal(forbiddenIdentity.pixelProof.detector.status, 'fail');
  assert.equal(forbiddenIdentity.status, 'fail');

  const stale = proofApi.renderObligationProof(input.sceneRenderPacket, [absence], input.compositionLedger, true, {
    ...renderData,
    pixelSamples: { ...currentSamples, packetKey: `${renderData.packetKey}:stale` },
  })[0];
  assert.match(stale.pixelProof.reason, /scene-packet-binding/);
  assert.equal(stale.status, 'fail');

  const truncated = proofApi.renderObligationProof(input.sceneRenderPacket, [absence], input.compositionLedger, true, {
    ...renderData,
    objectPartTruncated: true,
    pixelSamples: currentSamples,
  })[0];
  assert.match(truncated.pixelProof.reason, /object-part-submission-complete/);
  assert.equal(truncated.status, 'fail');

  const tamperedVector = new Float32Array(renderData.objectPartData);
  tamperedVector[12] = absence.targetSemanticCode;
  const forbiddenCode = proofApi.renderObligationProof(input.sceneRenderPacket, [absence], input.compositionLedger, true, {
    ...renderData,
    objectPartData: tamperedVector,
    pixelSamples: currentSamples,
  })[0];
  assert.equal(forbiddenCode.pixelProof.detector.status, 'fail');
  assert.ok(forbiddenCode.pixelProof.detector.checks.some((row) => (
    row.id === 'forbidden-semantic-codes' && row.pass === false
  )));
  assert.equal(forbiddenCode.status, 'fail');
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
  const renderData = {
    packetKey: `test:relation:${proofApi.scenePacketRenderEvidenceHash(packet)}`,
    requireLivePixelSamples: true,
    cameraState: {},
    objectParts: [
      { entityId: 'plume-a', center: [0.5, 0.5], size: [0.2, 0.12], depth: 0.5 },
      { entityId: 'detector-a', center: [0.5, 0.5], size: [0.5, 0.4], depth: 0.5 },
    ],
  };
  const pixelSamples = pixelSampleSet(renderData, [
    { id: 'source-pixel', obligationId: obligation.id, rgba: [90, 140, 180, 255] },
    { id: 'target-pixel', obligationId: obligation.id, rgba: [120, 170, 200, 255] },
  ]);
  Object.assign(renderData, {
    pixelSamples,
  });
  const crossing = proofApi.renderObligationProof(packet, [], packet.compositionLedger, true, renderData)[0];
  assert.equal(crossing.status, 'pass');
  renderData.objectParts[0].center = [0.9, 0.1];
  const missing = proofApi.renderObligationProof(packet, [], packet.compositionLedger, true, renderData)[0];
  assert.equal(missing.geometrySatisfied, false);
  assert.equal(missing.status, 'fail');
});

test('Phase 7 rejects pixel evidence captured for a different scene packet', () => {
  const spec = lab.createSpecFromPrompt('a dog', { allowPrototypeFallback: true });
  const canvas = { width: 640, height: 360 };
  const input = lab.createRenderExecutionInput(spec, { t: 0 }, canvas);
  const oldRenderData = rendererScope.compileSceneRenderData(input.sceneRenderPacket);
  oldRenderData.requireLivePixelSamples = true;
  const oldPlan = rendererScope.phase7PixelReadbackPlan(
    oldRenderData, input.sceneRenderPacket, input, canvas
  );
  const staleSamples = pixelSampleSet(oldRenderData, oldPlan.samples.map((sample) => ({
    ...sample,
    rgba: [80, 160, 220, 255],
  })));
  const currentPacket = JSON.parse(JSON.stringify(input.sceneRenderPacket));
  currentPacket.entities[0].transform.position[0] += 0.25;
  const currentInput = { ...input, sceneRenderPacket: currentPacket };
  const currentRenderData = rendererScope.compileSceneRenderData(currentPacket);
  currentRenderData.requireLivePixelSamples = true;
  currentRenderData.pixelSamples = staleSamples;

  assert.notEqual(currentRenderData.packetKey, staleSamples.packetKey);
  assert.ok(rendererScope.phase7PixelReadbackPlan(currentRenderData, currentPacket, currentInput, canvas));
  const phase7 = lab.runPhase7RenderExecution(currentInput, null, canvas, {
    ...currentRenderData,
    rendered: true,
    renderCount: 1,
  });
  const execution = phase7.artifact.renderExecution;
  assert.equal(execution.pixelAudit.pixelSampleBinding.status, 'fail');
  assert.equal(execution.pixelAudit.pixelSampleBinding.reason, 'pixel samples are stale for the current render data');
  assert.ok(execution.visualObligationProof.every((row) => row.status === 'fail'));
  const phase8 = lab.runPhase8SceneProof(phase7);
  assert.equal(phase8.artifact.sceneProof.verdict, 'fail');
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
