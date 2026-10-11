const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('../public/blank/pipeline/phase-05-simulation/simulatte-physics-model.js');
const scope = globalThis.SimulattePhaseModuleRegistry.family('physicsModel');
const library = (...components) => ({ schema: 'simulatte.activityComponentLibrary.v1', id: 'composition-extension-test', components });
const extension = (id, primitive = 'hold') => {
  const component = structuredClone(model.activityCapabilityInventory().components.find(row => row.id === primitive));
  component.id = id; component.languageForms = [id];
  return component;
};
const compile = (prompt, components = []) => model.createSpecFromPrompt(prompt, { deterministicRuntime: true,
  ...(components.length ? { activityComponentLibrary: library(...components) } : {}) });

test('a declared component reaches language, grounding, executable motion and proof without a new action case', () => {
  const spec = compile('a person steady a book in the left hand while walking', [extension('steady')]);
  assert.deepEqual(spec.activityProgram.actions.map(row => row.action), ['steady', 'walk']);
  assert.equal(spec.activityProgram.actions[0].component.execution.primitive, 'hold');
  assert.equal(spec.activityProgram.unsupported.length, 0);
  assert.equal(spec.phaseArtifacts.phase1.artifact.runtimeContext.activityCapabilities.componentLibrary.id, 'composition-extension-test');
  let state = model.createSimulationState(spec);
  for (let frame = 0; frame < 240; frame++) state = model.stepSimulation(state, spec, 1 / 60);
  const proof = model.proveActivitySequence(spec.activityProgram, state.activity);
  assert.equal(proof.pass, true, JSON.stringify(proof));
  assert.equal(state.activity.objects[spec.activityProgram.objects[0].id].owner.hand, 'left');
  assert.equal(model.createSemanticProofReceiptForSpec(spec).status, 'pass');
  const replayed = model.createSpecFromPrompt(spec.source.prompt, spec.source.compilerConfig);
  assert.equal(replayed.contentHash, spec.contentHash, 'independent compilation retains the admitted library');
});

test('a component can be reused across objects and composed with a release through declared relationships', () => {
  for (const noun of ['book', 'ball', 'phone']) {
    const spec = compile(`a person steady a ${noun} in the right hand then places the ${noun} on a table with the right hand`, [extension('steady')]);
    assert.equal(spec.activityProgram.unsupported.length, 0);
    const actions = spec.activityProgram.actions;
    assert.equal(actions[0].objectId, actions[1].objectId);
    const owner = spec.activityProgram.relationships.final.find(row => row.key === `${actions[0].objectId}:owner`);
    assert.equal(owner.value, null);
    assert.ok(spec.activityProgram.relationships.transitions.some(row => row.actionId === actions[1].id && row.value === null));
    const frame = model.evaluateActivityFrame(spec.activityProgram, 8);
    assert.equal(frame.objects[actions[0].objectId].supportObjectId, actions[1].supportObjectId);
  }
});

test('shared requirements conflict independently of occupied hands and never rewrite overlap into sequence', () => {
  const first = extension('steady'), second = extension('balance');
  first.contract.requirements = [{ key: '{actorId}:attention', value: 'object:{objectId}' }];
  second.contract.requirements = [{ key: '{actorId}:attention', value: 'object:{objectId}' }];
  const spec = compile('a person steady a book in the left hand while balance a phone in the right hand', [first, second]);
  assert.equal(spec.activityProgram.actions.length, 0);
  assert.ok(spec.activityProgram.unsupported.every(row => /shared interaction requirements/.test(row.reason)));
  assert.ok(spec.universeGraph.activityGraph.actions.every(row => row.startSeconds === 0));
});

test('grip sharing cannot waive an unrelated head channel conflict', () => {
  const inventory = model.activityCapabilityInventory();
  const bind = id => {
    const action = { action: id, actorId: 'person', objectId: 'vessel', hand: 'right',
      component: structuredClone(inventory.components.find(row => row.id === id)) };
    action.component.contract.resources.push({ kind: 'channel', key: '{actorId}:head' });
    Object.assign(action, scope.bindActivityResources(action)); return action;
  };
  assert.equal(scope.activityCompositionConflict(bind('hold'), bind('drink')).reason, 'conflicting channel writers');
});

test('persisted ownership prevents a sequential second actor from acquiring an unreleased object', () => {
  const component = model.activityCapabilityInventory().components.find(row => row.id === 'hold');
  const actions = [{ id: 'first', actorId: 'a', objectId: 'item', hand: 'left', startSeconds: 0, endSeconds: 1, timing: {}, component, sourceEvidence: {} },
    { id: 'second', actorId: 'b', objectId: 'item', hand: 'right', startSeconds: 1, endSeconds: 2, timing: { after: 'first' }, component, sourceEvidence: {} }];
  const unsupported = [];
  const compiled = scope.compileActivityRelationships(actions, [{ id: 'item', capabilities: ['graspable-object'] },
    { id: 'a', capabilities: [] }, { id: 'b', capabilities: [] }], unsupported);
  assert.deepEqual(compiled.actions.map(row => row.id), ['first']);
  assert.match(unsupported[0].reason, /previous owner/);
});

test('actor requirements use the same participant capability check as object requirements', () => {
  const component = extension('steady');
  component.contract.participants[0].capabilities = ['simulatte.planar-human.v1'];
  assert.equal(compile('a person steady a book', [component]).activityProgram.unsupported.length, 0);
  component.contract.participants[0].capabilities = ['unqualified-flight'];
  const refused = compile('a person steady a book', [component]);
  assert.equal(refused.activityProgram.actions.length, 0);
  assert.match(refused.activityProgram.unsupported[0].reason, /unqualified-flight/);
});

test('capability declarations generate the same editable fields for unfamiliar objects', () => {
  const inventory = model.activityCapabilityInventory();
  const object = { id: 'unknown', kind: 'unfamiliar', radius: 0.1, position: [0, 0.7], supportHeight: 0.7, capabilities: ['support-surface'] };
  object.authoringFields = scope.activityObjectAuthoringFields(object, inventory);
  assert.deepEqual(object.authoringFields.map(row => row.key), ['radius', 'position', 'supportHeight']);
  assert.deepEqual(model.activityObjectRevisionChanges(object, { 'position:0': '2', 'supportHeight:': '0.9' }),
    { position: [2, 0.9], supportHeight: 0.9 });
  assert.throws(() => model.activityObjectRevisionChanges(object, { 'unsupported:': 3 }), /Undeclared/);
});

test('extension contracts cannot invent motion or discard a provider ownership obligation', () => {
  const unavailable = extension('steady'); unavailable.execution.primitive = 'teleport';
  assert.throws(() => model.activityCapabilityInventory(library(unavailable)), /Invalid activity component contract/);
  const unowned = extension('steady'); unowned.contract.exit = [];
  assert.throws(() => model.activityCapabilityInventory(library(unowned)), /qualified motion provider/);
  const ambiguous = extension('steady'); ambiguous.languageForms = ['hold'];
  assert.throws(() => model.activityCapabilityInventory(library(ambiguous)), /Ambiguous/);
  const unbound = extension('steady'); unbound.contract.requirements = [{ key: '{actorId}:gaze', value: '{missing}' }];
  assert.throws(() => model.activityCapabilityInventory(library(unbound)), /binding template/);
  const noHand = extension('steady'); noHand.contract.parameters = [];
  assert.throws(() => model.activityCapabilityInventory(library(noHand)), /binding template/);
});

test('relationship proof observes executed state instead of trusting declared final facts', () => {
  const spec = compile('a person steady a ball in the left hand', [extension('steady')]);
  const frame = structuredClone(model.evaluateActivityFrame(spec.activityProgram, 4));
  assert.deepEqual(scope.activityRelationshipViolations(spec.activityProgram, frame), []);
  frame.objects[spec.activityProgram.objects[0].id].owner = null;
  assert.ok(scope.activityRelationshipViolations(spec.activityProgram, frame).some(row => row.includes(':owner')));
});

test('an imported library requalifies at Runtime and survives authored revision and exact identity export', async () => {
  const spec = compile('a person steady a ball in the left hand', [extension('steady')]);
  const revised = model.applyWorldSpecEdit(spec, model.prepareActivityRevision(spec, { swapHands: true }));
  const authored = await model.createAuthoredPhaseResources(revised, { deterministicRuntime: true }, { recompile: true });
  assert.equal(authored.request.configuration.activityComponentLibrary.components[0].id, 'steady');
  assert.equal(model.runPhase1RuntimeGate(spec.source.prompt, authored.request.configuration).artifact.runtimeContext.activityCapabilities.components.at(-1).id, 'steady');
  assert.equal(revised.activityProgram.actions[0].hand, 'right');
  assert.equal(model.deserializeSpec(model.serializeSpec(revised, { retainPhaseSources: true })).activityProgram.contentHash, revised.activityProgram.contentHash);
});
