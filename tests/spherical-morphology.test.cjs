const assert = require('node:assert/strict');
const test = require('node:test');
const lab = require('../public/blank/pipeline/phase-05-simulation/simulatte-physics-model.js');
const registry = require('../public/blank/app/runtime/phase-module-registry.js');
const morphology = registry.family('compositionGraph');

function sphereProgram() {
  const spec = lab.createSpecFromPrompt('a red sphere', { allowPrototypeFallback: true });
  return spec.renderProgram.sceneRenderPacket.entities[0].geometry.program;
}

test('sphere morphology follows its typed core and highlight after identity labels are removed', () => {
  const program = sphereProgram();
  assert.equal(program.constructionGraph.topologyId, 'spherical-body');
  assert.deepEqual(program.parts.map(part => part.visualFeatureClass), ['core', 'specular']);
  assert.equal(program.morphologyReceipt.pass, true);
});

test('sphere signature still requires an elliptical core, highlight, and matching topology', () => {
  const program = sphereProgram();
  const invalid = [
    program.parts.map(part => ({ ...part, constructionRole: 'detail' })),
    program.parts.map(part => ({ ...part, visualFeatureClass: 'core' })),
    program.parts.map(part => ({ ...part, contourProfile: 'rect' })),
  ];
  for (const parts of invalid) {
    assert.equal(morphology.objectMorphologyReceipt(parts, 'sphere', program).pass, false);
  }
  assert.equal(morphology.objectMorphologyReceipt(program.parts, 'sphere', {
    ...program, constructionReceipt: { ...program.constructionReceipt, topologyTargetFit: false },
  }).pass, false);
});
