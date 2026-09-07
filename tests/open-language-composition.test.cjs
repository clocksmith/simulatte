const assert = require('node:assert/strict');
const test = require('node:test');
const { lab, phaseFamily } = require('./physics-lab-fixture.cjs');
const parser = require('../public/simulatte/language/simulatte-universe-parser.js');
const rigid = require('../public/blank/pipeline/phase-05-simulation/solvers/simulatte-solver-rigid-body-2d.js');

function compile(prompt) {
  return lab.createSpecFromPrompt(prompt, { deterministicRuntime: true });
}
function packet(spec) { return spec.renderProgram.sceneRenderPacket; }
function entity(spec, identity) { return packet(spec).entities.find((row) => row.identity.type === identity); }

test('directed spatial phrases preserve both nouns, colors, and argument order', () => {
  for (const [left, right] of [['ball', 'cube'], ['cube', 'ball'], ['chair', 'dog'], ['cat', 'pendulum']]) {
    const spec = compile(`a red ${left} to the left of a blue ${right}`);
    assert.ok(entity(spec, left).transform.position[0] < entity(spec, right).transform.position[0]);
    for (const [identity, color] of [[left, '#ef3340'], [right, '#3688d8']]) {
      assert.ok(entity(spec, identity).geometry.program.parts.some((part) => part.fill === color));
    }
    assert.ok(packet(spec).compositionLedger.obligations.some((row) =>
      row.id === `relation:spatial:entity-${left}:left-of:entity-${right}` && row.status === 'preserved'));
    assert.equal(spec.phaseArtifacts.phase2.artifact.sceneLanguageGraph.concepts.some((row) => row.id === 'concept:left'), false);
  }
  const right = compile('a red cube to the right of a blue ball');
  assert.ok(entity(right, 'cube').transform.position[0] > entity(right, 'ball').transform.position[0]);
});

test('part cardinality changes one owner geometry, without creating extra owners', () => {
  for (const [owner, count] of [['chair', 3], ['chair', 4], ['table', 5], ['dog', 3]]) {
    const spec = compile(`a ${count}-legged brass ${owner} beneath a glass sphere`);
    const ownerEntity = entity(spec, owner);
    assert.equal(packet(spec).entities.filter((row) => row.identity.type === owner).length, 1);
    assert.equal(ownerEntity.geometry.program.parts.filter((part) => part.promptPartId).length, count);
    assert.equal(packet(spec).entities.some((row) => /legged|brass/.test(row.identity.type)), false);
    assert.ok(ownerEntity.transform.position[1] > entity(spec, 'sphere').transform.position[1]);
    const obligation = packet(spec).compositionLedger.obligations.find((row) => row.constraintKind === 'count');
    assert.equal(obligation.expectedCount, count);
    assert.equal(obligation.status, 'preserved');
    assert.ok(ownerEntity.geometry.program.promptPropertyBindings.some((row) =>
      row.propertyKind === 'count' && row.value === count && row.matchedPartIds.length === count));
  }
});

test('novel nouns remain required and unknown actions request retrieval', () => {
  const spec = compile('a quuxophone deflecting a pluvimeter');
  const phase2 = spec.phaseArtifacts.phase2.artifact;
  for (const label of ['quuxophone', 'pluvimeter']) {
    assert.ok(phase2.sceneLanguageGraph.entities.some((row) => row.id === `entity:${label}` && row.required));
    assert.ok(phase2.queryPlan.slots.some((row) => row.entryId === `entity:${label}` && row.required));
  }
  assert.equal(phase2.queryPlan.slots.find((row) => row.entryId === 'action:deflecting').modelEvidenceRequired, true);
  assert.ok(packet(spec).compositionLedger.obligations.some((row) => row.required && row.status !== 'preserved'));
  assert.deepEqual(parser.parsePrompt('球と立方体').tokens.map((row) => row.text), ['球と立方体']);
});

test('qualifying observables and materials do not become spurious actions', () => {
  const heat = parser.parsePrompt('a kettle transferring heat to water');
  assert.ok(heat.clauses.some((row) => row.process === 'heat_transfer' && row.processQualifierSpanId));
  const charge = parser.parsePrompt('a magnetic field deflecting charged particles');
  assert.deepEqual(charge.spans.filter((row) => row.kind === 'process').map((row) => row.text), ['deflecting']);
  const chair = parser.parsePrompt('a three-legged brass chair');
  assert.equal(chair.spans.some((row) => row.kind === 'process'), false);
  assert.ok(chair.clauses.some((row) => row.process === 'part_composition'));
});

test('pursuit and avoidance compile the declared subject and target', () => {
  for (const [subject, verb, target, mode] of [
    ['dog', 'chasing', 'cat', 'seek'], ['cat', 'chasing', 'dog', 'seek'],
    ['cube', 'following', 'ball', 'seek'], ['chair', 'avoiding', 'dog', 'flee'],
  ]) {
    const spec = compile(`a ${subject} ${verb} a ${target}`);
    const step = spec.solverGraph.steps.find((row) => row.operatorType === 'directed_motion');
    assert.ok(step);
    assert.ok(step.outputs.every((id) => id.endsWith(`-${subject}`)));
    assert.ok(step.params.targetChannel.endsWith(`-${target}`));
    assert.equal(step.params.mode, mode);
    assert.equal(spec.solverGraph.steps.some((row) => row.operatorType === 'interaction_kinematics' &&
      row.outputs.some((id) => step.outputs.includes(id))), false);
    assert.ok(entity(spec, subject).stateBindings.simulationOperator);
    assert.ok(packet(spec).interactionProgram.mappings.some((row) => row.positionProjection?.space === 'normalized-solver-to-canvas'));
  }
});

test('directed motion responds to target changes, respects speed, and rejects invalid state', () => {
  const step = { operatorType: 'directed_motion', outputs: ['position:agent', 'velocity:agent'],
    params: { targetChannel: 'position:target', mode: 'seek', maxSpeed: 0.24, maxAcceleration: 0.6, stoppingDistance: 0.18 } };
  const initial = { 'position:agent': { x: 0.2, y: 0.5 }, 'velocity:agent': { x: 0, y: 0 }, 'position:target': { x: 0.8, y: 0.5 } };
  const run = (mode) => {
    const channels = structuredClone(initial);
    for (let i = 0; i < 100; i++) rigid.step({ channels, step: { ...step, params: { ...step.params, mode } }, dt: 0.01 });
    return channels;
  };
  const seek = run('seek'), flee = run('flee');
  assert.ok(seek['position:agent'].x > initial['position:agent'].x);
  assert.ok(flee['position:agent'].x < initial['position:agent'].x);
  assert.deepEqual(seek['position:target'], initial['position:target']);
  assert.deepEqual(seek, run('seek'));
  seek['position:target'] = { x: 0.1, y: 0.5 };
  for (let i = 0; i < 150; i++) rigid.step({ channels: seek, step, dt: 0.01 });
  assert.ok(seek['velocity:agent'].x <= 0);
  assert.ok(Math.hypot(seek['velocity:agent'].x, seek['velocity:agent'].y) <= step.params.maxSpeed + 1e-12);
  assert.throws(() => rigid.step({ channels: initial, step, dt: NaN }), /finite positive/);
  assert.throws(() => rigid.step({ channels: {}, step, dt: 0.01 }), /target position/);
});

test('slot-bound semantic candidates survive vocabulary differences and reject wrong bindings', () => {
  const phase = phaseFamily('physicsModel');
  const slot = { slotId: 'slot.action.deflecting', entryId: 'action:deflecting', slotRole: 'action' };
  const row = { slotId: slot.slotId, entryId: slot.entryId, vectorHash: 'sha256:fixture', candidates: [
    { candidateId: 'lorentz-force', label: 'Lorentz force', modelEvaluated: true, modelScore: 0.84 },
    { candidateId: 'wrong-target', entryId: 'entity:dog', label: 'deflecting', modelEvaluated: true, modelScore: 0.9 },
  ] };
  assert.deepEqual(phase.phase3ModelRowsForSlot(slot, { bySlot: [row] }).map((row) => row.id), ['lorentz-force']);
  assert.deepEqual(phase.phase3ModelRowsForSlot(slot, { bySlot: [{ ...row, entryId: 'entity:dog' }] }), []);
  assert.deepEqual(phase.phase3ModelRowsForSlot(slot, { bySlot: [{ ...row, vectorHash: '' }] }), []);
});
