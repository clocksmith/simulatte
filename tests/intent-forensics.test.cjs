const assert = require('node:assert/strict');
const test = require('node:test');

const lab = require('../public/blank/app/simulation/simulation-lab.js');
const forensics = require('../public/blank/pipeline/phase-04-grounded-intent/simulatte-intent-forensics.js');

test('intent forensics emits retrieval-grounded causal brief', () => {
  const brief = forensics.buildIntentForensics({
    prompt: 'lava heats rain into steam while wind bends ash over a basalt delta',
    evidenceRows: [
      { id: 'material.lava', label: 'lava', indexName: 'materials', score: 0.94, primitiveHints: ['rock', 'heat-transfer'], operatorHints: ['heat_transfer'] },
      { id: 'environment.rain', label: 'rain', indexName: 'concepts', score: 0.89, primitiveHints: ['water', 'particle-set'], operatorHints: ['advection'] },
      { id: 'relation.lava-heats-rain', label: 'lava heats rain droplets', indexName: 'causalRelations', score: 0.91, primitiveHints: ['heat-transfer', 'phase-change'], operatorHints: ['heat_transfer', 'phase_transition'] },
      { id: 'field.wind', label: 'wind', indexName: 'concepts', score: 0.77, primitiveHints: ['air', 'fluid-advection'], operatorHints: ['advection'] },
    ],
  });

  assert.equal(brief.schema, 'simulatte.intentBrief.v1');
  assert.ok(brief.retrievedEvidence.length >= 4);
  assert.equal(brief.languageEvidence.schema, 'simulatte.languageEvidence.v1');
  assert.ok(brief.languageEvidence.spans.length >= 1);
  assert.ok(brief.activationCloud.length >= 1);
  assert.equal(brief.groundedInterpretation.schema, 'simulatte.groundedInterpretation.v1');
  assert.ok(brief.causalGraph.some((edge) => edge.operatorType === 'heat_transfer'));
  assert.ok(brief.assumptions.some((row) => row.id === 'assumption.rain-is-water'));
  assert.ok(brief.visualIntent.affordances.length >= 1);
  assert.ok(brief.intentFrames.some((row) => row.id === 'frame.causal-mechanism'));
  assert.ok(brief.evidenceBindings.some((row) => row.kind === 'causal-edge'));
  assert.ok(Array.isArray(brief.coverageGaps));
  assert.equal(brief.visualIntent.renderMode, 'semantic-3d-procedural');
  assert.equal(brief.validation.valid, true);
});

test('intent forensics grounds sparse prompts into explicit semantic roles', () => {
  const brief = forensics.buildIntentForensics({
    prompt: 'microgrid battery inverter stabilizes transformer overload with feedback sensors',
    evidenceRows: [
      { id: 'relation.microgrid-control', label: 'inverter stabilizes transformer load', indexName: 'causalRelations', score: 0.82, operatorHints: ['network_flow'] },
    ],
  });

  assert.ok(brief.promptSignals.some((row) => row.id === 'signal.control-loop'));
  assert.ok(brief.entities.some((row) => row.id === 'entity.transformer'));
  assert.ok(brief.entities.some((row) => row.id === 'entity.inverter'));
  assert.ok(brief.phenomena.some((row) => row.id === 'phenomenon.feedback-control'));
  assert.ok(brief.intentFrames.some((row) => row.id === 'frame.closed-loop-control'));
  assert.ok(brief.evidenceBindings.length >= 1);
});

test('compiled prompt carries intent brief into PhysicsIR and VisualIR receipts', () => {
  const spec = lab.createSpecFromPrompt('lava heats rain into steam while wind bends ash over a basalt delta', {
    allowPrototypeFallback: true,
  });

  assert.equal(spec.intent.intentBrief.schema, 'simulatte.intentBrief.v1');
  assert.equal(spec.intent.intentBrief.languageEvidence.schema, 'simulatte.languageEvidence.v1');
  assert.ok(spec.intent.intentBrief.activationCloud.length >= 1);
  assert.equal(spec.intent.intentBrief.groundedInterpretation.schema, 'simulatte.groundedInterpretation.v1');
  assert.ok(spec.intent.intentBrief.causalGraph.length >= 1);
  assert.ok(spec.intent.intentBrief.visualIntent.affordances.length >= 1);
  assert.ok(spec.universeGraph.intentBrief.causalEdgeCount >= 1);
  assert.ok(spec.physicalSpec.receipt.intentEvidenceCount >= 1);
  assert.ok(spec.physicalSpec.receipt.causalAffordanceCount >= 1);
  assert.ok(spec.physicalSpec.receipt.intentBrief.causalEdgeCount >= 1);
  assert.ok(spec.physicalSpec.receipt.intentBrief.causalAffordanceCount >= 1);
  assert.ok(spec.physicsIR.receipt.exact.some((row) => row.evidence && row.evidence.length));
  assert.ok(spec.renderProgram.visualIR.causalAffordances.length >= 1);
  assert.ok(spec.renderProgram.visualIR.operators.some((row) => row.id === 'causal-affordance-program'));
  assert.ok(spec.renderProgram.visualIR.geometry.some((row) => (
    row.evidence || []
  ).some((item) => String(item).startsWith('causal-affordance:'))));
  assert.ok(spec.renderProgram.visualIR.motion.some((row) => (
    row.evidence || []
  ).some((item) => String(item).startsWith('causal-affordance:'))));
  assert.ok(spec.renderProgram.visualIR.materials.some((row) => (
    row.evidence || []
  ).some((item) => String(item).startsWith('causal-affordance:'))));
  const visualReceipts = spec.renderProgram.visualIR.receipts;
  assert.ok(
    Array.isArray(visualReceipts)
      ? visualReceipts.some((row) => row.schema === 'simulatte.visualIntentBriefReceipt.v1')
      : visualReceipts.intentBrief
  );
});

test('unsupported intent records negative knowledge and degradation', () => {
  const brief = forensics.buildIntentForensics({
    prompt: 'simulate exact quantum many body wavefunction consciousness in a lava storm',
    evidenceRows: [
      { id: 'material.lava', label: 'lava', indexName: 'materials', score: 0.9, primitiveHints: ['rock'], operatorHints: ['heat_transfer'] },
    ],
  });

  assert.ok(brief.unsupported.some((row) => row.id === 'unsupported.full-quantum-many-body'));
  assert.ok(brief.unsupported.some((row) => row.id === 'unsupported.consciousness'));
  assert.ok(brief.degradedTo.length >= 1);
  assert.ok(brief.negativeKnowledge.every((row) => row.policy === 'do-not-invent-primitive'));
});
