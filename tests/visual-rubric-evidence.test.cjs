const assert = require('node:assert/strict');
const test = require('node:test');

test('generic scene names do not reject complete geometry or excuse missing geometry', async () => {
  const { visualRubricForResult } = await import('../tools/visual-audit-report.mjs');
  const result = {
    rendererSceneKind: 'generic', lumaStd: 40, coloredRatio: 0.4, visualIRGraphicsAtomCount: 1,
    visualIRGraphicsLanguageSignals: ['ball', 'floor', 'red', 'gray', 'resting', 'on'],
    phase7RendererConsumption: { normalShading: true, materialCountConsumed: 2,
      cameraConsumed: true, lightCountConsumed: 1, depthEnabled: true },
    webgpuObjectRealization: { entityCount: 2, realizedCount: 2,
      topologyVerifiedCount: 2, semanticFitCount: 2, framingPass: true },
  };
  const complete = visualRubricForResult(result, 'a red ball resting on a gray floor');
  assert.equal(complete.policy, 'bound-geometry-v2');
  assert.equal(complete.pass, true);
  assert.equal(complete.recognizabilityStatus, 'human-adjudication-required');
  const missing = visualRubricForResult({
    ...result, webgpuObjectRealization: { ...result.webgpuObjectRealization, realizedCount: 0, topologyVerifiedCount: 0 },
  }, 'a red ball resting on a gray floor');
  assert.equal(missing.pass, false);
  assert.ok(missing.score < complete.score);
});

test('phase rail inspection opens the control and restores closed and scrolled state', async () => {
  const { inspectPhaseRail } = await import('../tools/visual-audit-page.mjs');
  const vm = require('node:vm');
  const menu = { open: false, querySelector: () => ({ click: () => { menu.open = !menu.open; } }) };
  const panel = { scrollTop: 10 };
  const rect = { left: 0, top: 400, right: 300, bottom: 500, width: 300, height: 100 };
  const rail = { scrollIntoView: () => { panel.scrollTop = 50; },
    getBoundingClientRect: () => { assert.equal(menu.open, true); return rect; },
    checkVisibility: () => menu.open, querySelectorAll: () => Array(8) };
  const document = {
    getElementById: (id) => ({ 'run-details-menu': menu, 'phase-details': { textContent: 'input abc output def' },
      'physics-canvas': { getBoundingClientRect: () => ({ ...rect, top: 0, bottom: 300, height: 300 }) } })[id],
    querySelector: (selector) => selector === '.physics-panel' ? panel : rail,
  };
  const cdp = { send: async (_method, { expression }) => ({ result: { value: vm.runInNewContext(expression, { document }) } }) };
  const inspected = await inspectPhaseRail(cdp);
  assert.equal(inspected.inspected, true);
  assert.equal(inspected.visible, true);
  assert.equal(inspected.buttonCount, 8);
  assert.equal(inspected.canvasOverlapRatio, 0);
  assert.equal(menu.open, false);
  assert.equal(panel.scrollTop, 10);
});

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
