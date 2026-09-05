const test = require('node:test');
const assert = require('node:assert/strict');
const lab = require('../public/blank/app/simulation/simulation-lab.js');
require('../public/blank/pipeline/phase-06-visual/simulatte-composition-graph.js');
const { phaseFamily } = require('./phase-module-fixture.cjs');
const visual = phaseFamily('compositionGraph');
const realization = require('../public/blank/pipeline/phase-07-render/simulatte-object-realization.js');
const parser = require('../public/simulatte/language/simulatte-universe-parser.js');

test('resting ball binds to a literal gray floor without inventing a resting object', () => {
  const spec = lab.createSpecFromPrompt('a red ball resting on a gray floor', {
    allowPrototypeFallback: true, deterministicRuntime: true, retrievalPhase: 'deterministic-local',
  });
  const language = spec.phaseArtifacts.phase2.artifact.languageGraph;
  const resting = language.spans.find(row => row.text === 'resting');
  assert.equal(resting.kind, 'process');
  const clause = language.clauses.find(row => row.verbSpanId === resting.id);
  assert.equal(language.spans.find(row => row.id === clause.subjectSpanId).text, 'ball');
  assert.equal(language.spans.find(row => row.id === clause.objectSpanId).text, 'floor');
  assert.equal(clause.process, 'spatial_constraint');
  assert.equal(clause.spatialRelation, 'on');
  const packet = spec.phaseArtifacts.phase6.artifact.visualCompile.sceneRenderPacket;
  assert.deepEqual(packet.entities.map(row => row.identity.type).sort(), ['ball', 'floor']);
  const floor = packet.entities.find(row => row.identity.type === 'floor');
  assert.equal(floor.geometry.program.grammarId, 'object-grammar.floor');
  assert.equal(floor.geometry.program.parts[0].fill, '#737b84');
  assert.equal(floor.geometry.program.literal, true);
  assert.equal(realization.objectRealizationForScenePacket(packet).realizedCount, 2);
  assert.equal(packet.receipts.framing.surfaceContacts.length, 1);
  assert.ok(Math.abs(packet.receipts.framing.surfaceContacts[0].clearanceAfter) < 0.01);
});

test('spatial verb parsing tolerates articles and color modifiers without consuming noun compounds', () => {
  for (const prompt of ['a ball hovering above a blue plane', 'a ball resting on the gray floor', 'a ball rests on a floor']) {
    const parsed = parser.parsePrompt(prompt);
    assert.equal(parsed.spans.filter(row => row.kind === 'process').length, 1, prompt);
    assert.equal(parsed.clauses.length, 1, prompt);
    const clause = parsed.clauses[0];
    assert.equal(parsed.spans.find(row => row.id === clause.subjectSpanId).text, 'ball');
  }
  const lamp = parser.parsePrompt('a red floor lamp');
  assert.equal(lamp.spans.some(row => row.text === 'floor'), false);
  assert.equal(lamp.spans.find(row => row.text === 'floor lamp').entityClass, 'lamp');
  const plural = parser.parsePrompt('dogs on a gray floor');
  assert.equal(plural.spans.find(row => row.text === 'dogs').kind, 'entity');
});

test('three red balls on a blue plane retain literal geometry and separate support contacts', () => {
  const spec = lab.createSpecFromPrompt('three red balls on a blue plane', {
    allowPrototypeFallback: true, deterministicRuntime: true, retrievalPhase: 'deterministic-local',
  });
  const packet = spec.phaseArtifacts.phase6.artifact.visualCompile.sceneRenderPacket;
  const balls = packet.entities.filter(row => row.identity.type === 'ball');
  const plane = packet.entities.find(row => row.identity.type === 'plane');
  assert.equal(balls.length, 3);
  assert.equal(plane.geometry.program.literal, true);
  assert.equal(plane.geometry.program.parts[0].fill, '#3688d8');
  for (const ball of balls) {
    assert.equal(ball.geometry.program.constructionReceipt.topologyTargetFit, true);
    assert.equal(ball.geometry.program.parts.length, 2);
    assert.equal(ball.geometry.program.parts[0].fill, '#ef3340');
    assert.equal(realization.objectTopologyVerified(ball.geometry.program), true);
  }
  assert.equal(realization.objectRealizationForScenePacket(packet).realizedCount, 4);
  const contacts = packet.receipts.framing.surfaceContacts;
  assert.deepEqual(contacts.map(row => row.sourceId).sort(), balls.map(row => row.id).sort());
  assert.ok(contacts.every(row => Math.abs(row.clearanceAfter) < 0.01));
  const bounds = balls.map(visual.sceneEntityVisibleBounds).sort((a, b) => a[0] - b[0]);
  assert.ok(bounds[0][0] + bounds[0][2] < bounds[1][0]);
  assert.ok(bounds[1][0] + bounds[1][2] < bounds[2][0]);
  assert.equal(new Set(balls.map(row => row.transform.position[1])).size, 1);
  assert.ok(balls.every(row => row.transform.scale[0] === row.transform.scale[1]));
  const before = JSON.stringify(packet.entities);
  visual.frameScenePacketEntities(packet.entities);
  assert.equal(JSON.stringify(packet.entities), before, 'framing must not mutate its input packet');
});

test('topology intervention uses the accepted identity without rewriting plural target provenance', () => {
  const construction = { targetEntryId: 'entity:balls', basisIds: ['ground.rolling-body'],
    sourceLabels: ['ball'], partHints: ['sphere body'], shapeHints: ['sphere'] };
  const prior = visual.constructionTopologySelectionForEvidence(construction, []);
  const corrected = visual.constructionTopologySelectionForEvidence(construction, [], { type: 'ball' });
  assert.equal(prior.targetFit, false);
  assert.equal(corrected.targetFit, true);
  assert.equal(construction.targetEntryId, 'entity:balls');
  const mismatch = visual.constructionTopologySelectionForEvidence({ ...construction, targetEntryId: 'entity:unknown' }, []);
  assert.equal(mismatch.targetFit, false);
});
