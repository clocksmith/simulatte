const assert = require('node:assert/strict');
const test = require('node:test');

test('visual rubric accepts only packet layers that are bound to passed pixel obligations', async () => {
  const { renderedSignalEvidence } = await import('../tools/visual-rubric-evidence.mjs');
  const signal = {
    renderEvidence: {
      layerSlots: ['water-volume', 'flow-field'],
      proofTerms: ['swimming', 'wake ripples'],
    },
  };
  const result = {
    visualIRSceneRenderPacketLayers: ['water-volume', 'flow-field'],
    phase7VisualObligationProof: JSON.stringify([
      { obligationId: 'action:swimming', target: 'swimming', status: 'pass', pixelSatisfied: true },
      { obligationId: 'visual:wake-ripples', target: 'wake ripples', status: 'pass', pixelSatisfied: true },
    ]),
  };

  assert.deepEqual(renderedSignalEvidence(signal, result), {
    strength: 0.5,
    layerHits: ['water-volume', 'flow-field'],
    proofHits: ['action:swimming', 'visual:wake-ripples'],
    pixelBound: true,
  });
  assert.equal(renderedSignalEvidence(signal, {
    ...result,
    phase7VisualObligationProof: '[]',
  }).strength, 0);
  assert.equal(renderedSignalEvidence(signal, {
    ...result,
    visualIRSceneRenderPacketLayers: [],
  }).strength, 0);
});
