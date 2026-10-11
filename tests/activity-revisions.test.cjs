const test = require('node:test');
const assert = require('node:assert/strict');
const lab = require('../public/blank/app/simulation/simulation-lab.js');
const physics = globalThis.SimulattePhaseModuleRegistry.family('physicsModel');
const prompt = 'a person sits on a chair, holds a phone in the left hand, drinks from a cup with the right hand then places the cup on a table with the right hand then stands';
const original = lab.createSpecFromPrompt(prompt, { deterministicRuntime: true });
const revise = (spec, change) => lab.applyWorldSpecEdit(spec, physics.prepareActivityRevision(spec, change), { rationale: 'Activity revision regression' });
const action = (spec, verb) => spec.activityProgram.actions.find(row => row.action === verb);
const object = (spec, kind) => spec.activityProgram.objects.find(row => row.kind === kind);

test('the complete activity retains one cup through drinking, placement, and standing', () => {
  assert.deepEqual(original.activityProgram.actions.map(row => row.action), ['sit', 'hold', 'drink', 'place', 'stand']);
  assert.equal(action(original, 'drink').objectId, action(original, 'place').objectId);
  assert.deepEqual(physics.activityRevisionRequirements(original.activityProgram), []);
});

test('revisions supply authored graph changes without duplicating compiler artifacts', () => {
  const candidate = physics.prepareActivityRevision(original, { swapHands: true });
  assert.deepEqual(Object.keys(candidate), ['universeGraph']);
  assert.notEqual(candidate.universeGraph, original.universeGraph);
});

test('decimal durations retain their schedule across predecessor arithmetic', () => {
  let edited = revise(original, { actionId: action(original, 'drink').id, changes: { durationSeconds: 3.2 } });
  edited = revise(edited, { actionId: action(edited, 'place').id, changes: { durationSeconds: 4.1 } });
  assert.equal(action(edited, 'place').startSeconds, 3.2);
  assert.ok(Math.abs(action(edited, 'stand').startSeconds - 7.3) < 1e-9);
});

test('hand swaps regenerate channels, attachment joints and default support placement with stable identities', () => {
  const edited = revise(original, { swapHands: true });
  for (const verb of ['hold', 'drink', 'place']) {
    const before = action(original, verb), after = action(edited, verb);
    assert.equal(after.id, before.id);
    assert.equal(after.actorId, before.actorId);
    assert.equal(after.objectId, before.objectId);
    assert.equal(after.hand, before.hand === 'left' ? 'right' : 'left');
    assert.ok(after.writes.includes(`${after.actorId}:${after.hand}-hand`));
    assert.ok(after.joints.includes(`${after.hand}-hand`));
    assert.equal(after.authorship.authority, 'userOverride');
    assert.ok(after.authorship.patchIds.length);
  }
  assert.deepEqual(physics.activityRevisionRequirements(edited.activityProgram), []);
  assert.ok(object(edited, 'support').position[0] < object(edited, 'seat').position[0]);
  const frame = physics.evaluateActivityFrame(edited.activityProgram, 1);
  assert.equal(frame.objects[object(edited, 'cup').id].owner.hand, 'left');
  assert.equal(frame.objects[object(edited, 'phone').id].owner.hand, 'right');
  assert.equal(original.activityProgram.actions.find(row => row.action === 'drink').hand, 'right');
});

test('repeated geometry, fill and timing edits preserve prior authored choices and unaffected identities', () => {
  let edited = revise(original, { swapHands: true });
  edited = revise(edited, { objectId: object(edited, 'seat').id, changes: { seatHeight: 0.55 } });
  edited = revise(edited, { objectId: object(edited, 'cup').id, changes: { liquidFillFraction: 0.7 } });
  edited = revise(edited, { objectId: object(edited, 'support').id, changes: { position: [-0.05, 0.75] } });
  edited = revise(edited, { actionId: action(edited, 'drink').id, changes: { durationSeconds: 5 } });
  assert.equal(edited.authorship.revision, 5);
  assert.equal(action(edited, 'drink').hand, 'left');
  assert.equal(object(edited, 'seat').seatHeight, 0.55);
  assert.equal(object(edited, 'cup').liquidContainer.fillFraction, 0.7);
  assert.deepEqual(object(edited, 'support').position, [-0.05, 0.75]);
  assert.equal(action(edited, 'place').startSeconds, 5);
  assert.equal(action(edited, 'stand').startSeconds, 9);
  assert.equal(action(edited, 'hold').durationSeconds, action(original, 'hold').durationSeconds);
  assert.deepEqual(edited.activityProgram.objects.map(row => row.id), original.activityProgram.objects.map(row => row.id));
  assert.deepEqual(physics.activityRevisionRequirements(edited.activityProgram), []);
  assert.equal(edited.universeGraph.activityGraph.actions.find(row => row.action === 'drink').hand, 'left');
  const imported = lab.deserializeSpec(lab.serializeSpec(edited, { retainPhaseSources: true }));
  assert.equal(imported.contentHash, edited.contentHash);
  assert.equal(imported.activityProgram.contentHash, edited.activityProgram.contentHash);
  assert.deepEqual(physics.evaluateActivityFrame(imported.activityProgram, 8), physics.evaluateActivityFrame(edited.activityProgram, 8));
});

test('action order edits resolve forward references and refuse cycles without changing other timing', () => {
  const standId = action(original, 'stand').id;
  const next = revise(original, { actionId: action(original, 'hold').id, changes: { afterActionId: standId } });
  assert.equal(action(next, 'hold').startSeconds, action(next, 'stand').endSeconds);
  assert.equal(action(next, 'drink').startSeconds, 0);
  const cycle = revise(original, { actionId: action(original, 'drink').id, changes: { afterActionId: standId } });
  assert.ok(cycle.activityProgram.unsupported.some(row => /cyclic/.test(row.reason)));
  assert.deepEqual(cycle.activityProgram.actions.map(row => row.action), ['sit', 'hold']);
});

test('removing a needed support preserves the requirement and refuses its dependent action', () => {
  const removed = revise(original, { objectId: object(original, 'support').id, remove: true });
  assert.ok(removed.activityProgram.unsupported.some(row => row.id === action(original, 'place').id && /placement surface/.test(row.reason)));
  assert.ok(removed.activityProgram.unsupported.some(row => row.id === action(original, 'stand').id && /predecessor/.test(row.reason)));
  assert.ok(!removed.activityProgram.objects.some(row => row.kind === 'support'));
});

test('hand conflicts, missing liquid, and unreachable supports yield specific unresolved requirements', () => {
  const conflict = revise(original, { actionId: action(original, 'drink').id, changes: { hand: 'left' } });
  assert.ok(physics.activityRevisionRequirements(conflict.activityProgram).some(row => /channel writers/.test(row.reason)));
  const empty = revise(original, { objectId: object(original, 'cup').id, changes: { liquidFillFraction: 0 } });
  assert.ok(physics.activityRevisionRequirements(empty.activityProgram).some(row => /requires liquid/.test(row.reason)));
  const distant = revise(original, { objectId: object(original, 'support').id, changes: { position: [10, 0.75] } });
  assert.ok(physics.activityRevisionRequirements(distant.activityProgram).some(row => /unreachable/.test(row.reason)));
});

test('a fast prescribed lift is refused before execution loses effective normal gravity', () => {
  const fast = revise(original, { actionId: action(original, 'drink').id, changes: { durationSeconds: 3 } });
  assert.ok(physics.activityRevisionRequirements(fast.activityProgram).some(row => /positive effective normal gravity/.test(row.reason)));
  let state = physics.withActivityState({ solverState: { channels: {} } }, fast.activityProgram);
  assert.throws(() => {
    for (let i = 0; i < 45; i++) state = physics.stepActivityState(state, fast.activityProgram, 1 / 60);
  }, /positive effective normal gravity/);
});

test('declared capabilities govern eligibility even when the object name suggests a familiar prop', () => {
  const disabled = revise(original, { objectId: object(original, 'cup').id, changes: { activityCapabilities: ['graspable-object'] } });
  assert.ok(disabled.activityProgram.unsupported.some(row => /liquid-container/.test(row.reason)));
  const graph = structuredClone(original.universeGraph);
  const cup = graph.nodes.find(row => row.id === object(original, 'cup').id);
  cup.label = 'Unfamiliar vessel'; cup.visualArchetype = 'unfamiliar-vessel';
  cup.params = { ...cup.params, activityCapabilities: ['graspable-object', 'liquid-container'] };
  const compiled = physics.compileActivityProgram(graph.activityGraph, graph);
  assert.ok(compiled.actions.some(row => row.action === 'drink'));
  assert.equal(compiled.objects.find(row => row.id === cup.id).kind, 'cup');
  assert.equal(compiled.objects.find(row => row.id === cup.id).capabilityProvenance.authority, 'userOverride');
  assert.throws(() => revise(original, { objectId: object(original, 'cup').id, changes: { activityCapabilities: ['teleport'] } }), /Invalid activity capabilities/);
});

test('unfamiliar placement arguments retain source binding and require a support capability', () => {
  const spec = lab.createSpecFromPrompt('a person holds a cup in the right hand then places the cup on a cube with the right hand', { deterministicRuntime: true });
  const request = spec.phaseArtifacts.phase2.artifact.languageGraph.activityRequests.find(row => row.action === 'place');
  const surface = spec.universeGraph.nodes.find(row => row.spanId === request.supportSpanId);
  assert.equal(surface.label, 'Cube');
  assert.ok(spec.activityProgram.unsupported.some(row => /qualified support surface/.test(row.reason)));
  for (const text of ['a person walking while carrying a phone in the left hand', 'a person holds a ball in the right hand']) {
    assert.equal(lab.createSpecFromPrompt(text, { deterministicRuntime: true }).activityProgram.unsupported.length, 0);
  }
});

test('the revision command cannot inject an alternate provider or fabricated action evidence', () => {
  assert.throws(() => physics.prepareActivityRevision(original, { actionId: action(original, 'drink').id, changes: { component: {} } }), /Unsupported activity action edit/);
  assert.throws(() => physics.prepareActivityRevision(original, { actionId: 'foreign', changes: { hand: 'left' } }), /Unknown activity action/);
});

test('regrounding retains the declared component qualification restriction', () => {
  const graph = structuredClone(original.universeGraph.activityGraph);
  graph.capabilities.components.find(row => row.id === 'place').execution.supported = false;
  const grounded = physics.reconcileActivityGraph(graph, original.universeGraph);
  assert.ok(grounded.unsupported.some(row => row.id === action(original, 'place').id && /not qualified/.test(row.reason)));
});
