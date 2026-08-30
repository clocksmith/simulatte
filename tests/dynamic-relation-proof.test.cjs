const assert = require('node:assert');
const test = require('node:test');

const lab = require('../public/blank/pipeline/phase-05-simulation/simulatte-physics-model.js');
require('../public/blank/pipeline/phase-07-render/simulatte-webgpu-renderer.js');

const rendererScope = globalThis.SimulattePhaseModuleRegistry.family('webGpuRenderer');

test('dynamic relation proof binds a rendered process instead of endpoint presence alone', () => {
  const spec = lab.createSpecFromPrompt('warehouse robot arms sort parcels on conveyor belts', {
    allowPrototypeFallback: true,
  });
  const canvas = { width: 640, height: 360 };
  const input = lab.createRenderExecutionInput(spec, { t: 0 }, canvas);
  const relation = input.compositionLedger.obligations.find((row) => (
    (row.obligationId || row.id) === 'relation:entity-warehouse-robot-arms:network-flow:entity-parcels'
  ));

  assert.ok(relation);
  const relationId = relation.obligationId || relation.id;
  assert.ok(relation.visualEvidence.some((value) => /^phase6:(?:process|field):/.test(value)));

  const renderData = rendererScope.compileSceneRenderData(input.sceneRenderPacket);
  renderData.requireLivePixelSamples = true;
  const plan = rendererScope.phase7PixelReadbackPlan(renderData, input.sceneRenderPacket, input, canvas);
  const relationSamples = plan.samples.filter((row) => row.obligationId === relationId);

  assert.equal(plan.unmatchedObligationIds.includes(relationId), false);
  assert.ok(relationSamples.length >= 1);
  assert.ok(relationSamples.every((row) => /network|routing|constraint/.test(String(row.drawableId))));

  renderData.rendererConsumption.objectSubmissionConsumed = true;
  renderData.rendererConsumption.semanticCodesConsumed = true;
  renderData.rendererConsumption.objectPartCountConsumed = renderData.objectPartCount;
  const phase7 = lab.runPhase7RenderExecution(input, null, canvas, {
    ...renderData,
    rendered: true,
    renderCount: 1,
    frameMs: 1,
    pixelSamples: {
      schema: 'simulatte.phase7PixelSampleSet.v1',
      source: 'webgpu-texture-copy-readback',
      packetKey: renderData.packetKey,
      readbackSerial: 1,
      samples: plan.samples.map((sample) => ({ ...sample, rgba: [90, 170, 230, 255] })),
    },
  });
  const phase7Proof = phase7.artifact.renderExecution.visualObligationProof
    .find((row) => row.obligationId === relationId);
  const phase8Proof = lab.runPhase8SceneProof(phase7).artifact.sceneProof.settledObligations
    .find((row) => row.obligationId === relationId);

  assert.equal(phase7Proof.status, 'pass');
  assert.equal(phase8Proof.status, 'preserved');
  assert.ok(phase8Proof.evidence.includes('visualObligationProof'));
});

test('dynamic relation predicates bind the scene operator that visibly realizes them', () => {
  const cases = [
    {
      prompt: 'particle collider muon tracks collision plume through a detector slice with field lines and calorimeter heat',
      ids: ['relation:entity-muon-tracks:impact:environment-plume'],
    },
    {
      prompt: 'mangrove roots buffering storm surge while sediment settles in brackish tidal channels',
      ids: ['relation:medium-sediment:deposition:environment-tidal-channels'],
    },
    {
      prompt: 'planetary rings shepherd moon resonance sorting ice boulders into density waves and orbital gaps',
      ids: [
        'relation:entity-planetary-rings:shepherd:entity-ice-boulders',
        'relation:entity-moon:oscillation:entity-ice-boulders',
        'relation:entity-moon:network-flow:entity-ice-boulders',
      ],
    },
    {
      prompt: 'warehouse fire with smoke in concrete stairwell and renderer layers soot',
      ids: ['relation:entity-concrete-stairwell:deposition:medium-soot-deposit'],
    },
    {
      prompt: 'robot gripper twists a protein sample holder without molecular folding',
      ids: ['relation:entity-robot-gripper:rotate:entity-protein-sample-holder'],
    },
    {
      prompt: 'glacier calving into fjord with sea ice waves',
      ids: ['relation:entity-glacier:impact:environment-fjord'],
    },
    {
      prompt: 'forest fire jumps a road under wind shear',
      ids: ['relation:entity-fire-front:impact:entity-road'],
    },
  ];

  for (const { prompt, ids } of cases) {
    const spec = lab.createSpecFromPrompt(prompt, { allowPrototypeFallback: true });
    const input = lab.createRenderExecutionInput(spec, { t: 0 }, { width: 640, height: 360 });
    for (const id of ids) {
      const relation = input.compositionLedger.obligations.find((row) => (
        (row.obligationId || row.id) === id
      ));
      assert.ok(relation, `${prompt}: missing ${id}`);
      assert.equal(relation.status, 'preserved', `${prompt}: ${id} was not preserved`);
      assert.ok(
        relation.visualEvidence.some((value) => /^phase6:(?:process|field):/.test(value)),
        `${prompt}: ${id} lacks process or field evidence`
      );
    }
  }
});
