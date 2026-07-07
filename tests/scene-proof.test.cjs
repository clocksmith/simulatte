const assert = require('node:assert');
const test = require('node:test');

const lab = require('../public/pipeline/phase-05-simulation/simulatte-physics-model.js');
const sceneProof = require('../public/pipeline/phase-08-scene-proof/simulatte-scene-proof.js');

function renderedPhase7(prompt) {
  const spec = lab.createSpecFromPrompt(prompt, { allowPrototypeFallback: true });
  const renderExecutionInput = lab.createRenderExecutionInput(spec, { t: 0 }, { width: 640, height: 360 });
  return lab.runPhase7RenderExecution(renderExecutionInput, null, { width: 640, height: 360 }, {
    rendered: true,
    renderCount: 3,
    frameMs: 1.5,
    pixelAudit: { schema: 'simulatte.phase7PixelAudit.v1', status: 'pass' },
  });
}

test('scene proof settles every ledger obligation into a terminal status', () => {
  const phase7 = renderedPhase7('dogs and cats swimming in a lake');
  const phase8 = lab.runPhase8SceneProof(phase7);

  assert.equal(phase8.schema, 'simulatte.phase8.output.v2');
  assert.equal(phase8.phase, 8);
  assert.equal(phase8.inputSchema, 'simulatte.phase7.output.v2');
  assert.equal(lab.validatePhase8SceneProof(phase8), phase8);

  const proof = phase8.artifact.sceneProof;
  assert.equal(proof.schema, 'simulatte.sceneProof.v1');
  assert.equal(proof.rendered, true);
  assert.ok(proof.settledObligations.length >= 1);
  for (const row of proof.settledObligations) {
    assert.ok(sceneProof.SETTLED_STATUSES.includes(row.status), `${row.obligationId} has terminal status`);
    assert.ok(row.reason.length > 0);
  }
  assert.equal(
    proof.summary.obligationCount,
    proof.summary.preservedCount + proof.summary.lostCount +
      proof.summary.unsupportedCount + proof.summary.notProvenCount
  );

  const entityRows = proof.settledObligations.filter((row) => row.kind === 'entity');
  assert.ok(entityRows.some((row) => row.target === 'dog' && row.status === 'preserved'));
  assert.ok(entityRows.some((row) => row.target === 'cat' && row.status === 'preserved'));
  assert.notEqual(proof.verdict, 'not-proven');

  const ledger = phase8.artifact.compositionLedger;
  assert.equal(ledger.currentPhase, 8);
  assert.ok(ledger.phaseDeltas.some((row) => row.phase === 8 && row.receiptId === 'phase8-scene-proof'));
  assert.equal(phase8.receipts[0].id, 'phase8-scene-proof');
  assert.equal(phase8.receipts[0].verdict, proof.verdict);
});

test('scene proof fails closed when a required entity never rendered', () => {
  const phase7 = renderedPhase7('dogs and cats swimming in a lake');
  const strippedPacketSummary = (phase7.artifact.renderExecution.packetIdentitySummary || [])
    .filter((identity) => !/dog/i.test(identity));
  const tampered = {
    ...phase7,
    artifact: {
      ...phase7.artifact,
      renderExecution: {
        ...phase7.artifact.renderExecution,
        packetIdentitySummary: strippedPacketSummary,
        visualObligationProof: [],
      },
    },
  };
  const phase8 = lab.runPhase8SceneProof(tampered);
  const proof = phase8.artifact.sceneProof;
  const dogRow = proof.settledObligations.find((row) => row.kind === 'entity' && row.target === 'dog');
  assert.ok(dogRow, 'dog entity obligation settled');
  assert.equal(dogRow.status, 'lost');
  assert.equal(proof.verdict, 'fail');
  assert.ok(proof.summary.requiredLostIds.includes(dogRow.obligationId));
  assert.ok(phase8.artifact.compositionLedger.losses.some((row) => row.entryId === dogRow.obligationId));
});

test('scene proof reports not-proven without a rendered frame and rejects wrong inputs', () => {
  const spec = lab.createSpecFromPrompt('dogs and cats swimming in a lake', { allowPrototypeFallback: true });
  const renderExecutionInput = lab.createRenderExecutionInput(spec, { t: 0 }, { width: 8, height: 8 });
  const unrendered = lab.runPhase7RenderExecution(renderExecutionInput, null, null, {
    rendered: false,
    renderCount: 0,
  });
  const phase8 = lab.runPhase8SceneProof(unrendered);
  assert.equal(phase8.artifact.sceneProof.verdict, 'not-proven');
  assert.ok(phase8.artifact.sceneProof.settledObligations.every((row) => row.status === 'not-proven'));

  assert.throws(
    () => sceneProof.settleSceneProof(spec.phaseArtifacts.phase6),
    /Phase 8 input expected simulatte\.phase7\.output\.v2/
  );
  assert.throws(
    () => sceneProof.settleSceneProof(null),
    /Phase 8 input expected simulatte\.phase7\.output\.v2/
  );
});
