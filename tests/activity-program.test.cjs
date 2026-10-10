const nodeTest = require('node:test');
// Yield between numerical cases so completed subtests reach the stall watchdog.
const test = (name, body) => nodeTest(name, async context => {
  await new Promise(setImmediate);
  return body(context);
});
const assert = require('node:assert/strict');
const lab = require('../public/blank/app/simulation/simulation-lab.js');
require('../public/blank/pipeline/phase-07-render/simulatte-webgpu-renderer.js');
const registry = globalThis.SimulattePhaseModuleRegistry;
const physics = registry.family('physicsModel');
const renderer = registry.family('webGpuRenderer');
const WALK = 'a person walking while holding a cup in the left hand';
const SIT = 'a person sits on a chair, holds a phone in the left hand, and drinks from a cup with the right hand';
const compile = prompt => lab.createSpecFromPrompt(prompt, { deterministicRuntime: true });
const walking = compile(WALK), sitting = compile(SIT);
test('validation detects nested changes in mutable and shallow-frozen imported programs', () => {
  for (const shallowFreeze of [false, true]) {
    const program = structuredClone(walking.activityProgram);
    if (shallowFreeze) Object.freeze(program);
    physics.validateActivityProgram(program);
    program.actors[0].height += 0.1;
    assert.throws(() => physics.validateActivityProgram(program), /identity/);
  }
});
test('fresh execution owns immutable frames and preserves earlier snapshots', () => {
  const first = lab.createSimulationState(walking);
  const snapshot = JSON.stringify(first.activity);
  const next = lab.stepSimulation(first, walking, 1 / 60);
  assert.equal(JSON.stringify(first.activity), snapshot);
  assert.equal(next.activity.history[0], first.activity.history[0]);
  assert.equal(Object.isFrozen(Object.values(next.activity.history[1].actors)[0].joints), true);
  assert.deepEqual(lab.stepSimulation(lab.createSimulationState(walking), walking, 1 / 60), next);
});
test('reused immutable proof prefixes cannot hide a changed earlier frame', () => {
  let state = lab.createSimulationState(walking);
  for (let i = 0; i < 4; i++) state = lab.stepSimulation(state, walking, 1 / 60);
  const original = lab.proveActivitySequence(walking.activityProgram, state.activity);
  const frame = structuredClone(state.activity.history[2]);
  Object.values(frame.actors)[0].massKg += 1;
  const activity = physics.phaseContracts.immutableArtifact({ ...state.activity,
    history: state.activity.history.map((row, index) => index === 2 ? frame : row) });
  const changed = lab.proveActivitySequence(walking.activityProgram, activity);
  assert.ok(original.metrics.massErrorKg < 1e-7);
  assert.ok(changed.metrics.massErrorKg >= 1);
  assert.ok(changed.violations.includes('liquid/body mass conservation failed'));
});
test('advancing JSON-restored activity takes immutable snapshots of the prior history', () => {
  const original = lab.createSimulationState(walking);
  const restored = JSON.parse(JSON.stringify(original));
  assert.equal(physics.phaseContracts.isOwnedSnapshot(restored.activity.history[0]), false);
  const next = lab.stepSimulation(restored, walking, 1 / 60);
  assert.ok(next.activity.history.every(physics.phaseContracts.isOwnedSnapshot));
  assert.deepEqual(next, lab.stepSimulation(original, walking, 1 / 60));
  const prior = next.activity.history[0];
  Object.values(restored.activity.history[0].actors)[0].massKg += 1;
  assert.deepEqual(prior, original.activity.history[0]);
  const later = lab.stepSimulation(next, walking, 1 / 60);
  assert.equal(later.activity.history[0], prior);
});
test('managed publication accepts explicitly absent optional proofs but preserves required receipt bindings', () => {
  const { managedProofReceiptForSpec: receipt } = require('../public/blank/app/prompt/prompt-controller-phase-dispatch.js');
  const spec = { contentHash: 'world', authorship: { revision: 2 }, determinism: { requiredClasses: [] }, safety: { status: 'not-declared' } };
  const frame = { simulationReproducibilityReceipt: null, safetyReceipt: null };
  assert.equal(receipt(frame, 'simulationReproducibilityReceipt', spec), null);
  assert.equal(receipt(frame, 'safetyReceipt', spec), null);
  assert.throws(() => receipt(frame, 'simulationReproducibilityReceipt', { ...spec, determinism: { requiredClasses: ['simulation-reproducible'] } }), /does not bind/);
  assert.throws(() => receipt({}, 'simulationReproducibilityReceipt', spec), /does not bind/);
  assert.throws(() => receipt({ intentReceipt: null }, 'intentReceipt', spec), /does not bind/);
  const bound = { worldSpecContentHash: 'world', worldSpecRevision: 2 };
  assert.equal(receipt({ intentReceipt: bound }, 'intentReceipt', spec), bound);
  for (const invalid of [{ ...bound, worldSpecContentHash: 'other' }, { ...bound, worldSpecRevision: 1 }]) {
    assert.throws(() => receipt({ simulationReproducibilityReceipt: invalid }, 'simulationReproducibilityReceipt', spec), /does not bind/);
  }
});
function run(spec, seconds = Math.max(0, ...spec.activityProgram.actions.map(row => row.endSeconds)), dt = 1 / 60) {
  let state = lab.createSimulationState(spec);
  for (let i = 0; i < Math.ceil(seconds / dt) + 1; i++) state = lab.stepSimulation(state, spec, dt);
  return state;
}
test('ordinary Create compilation preserves eight boundaries, hand spans, and coordinated actor identity', () => {
  for (const spec of [walking, sitting]) {
    assert.equal(Object.keys(spec.phaseArtifacts).length, 6);
    for (let phase = 1; phase <= 6; phase++) assert.equal(spec.phaseArtifacts[`phase${phase}`].phase, phase);
    const language = spec.phaseArtifacts.phase2.artifact.languageGraph;
    assert.ok(!language.spans.some(row => row.kind === 'entity' && /^(hand|walking|drinks)$/.test(row.text)));
    assert.equal(language.sourceText, spec.source.prompt);
    for (const request of language.activityRequests) {
      assert.equal(spec.source.prompt.slice(request.evidence.start, request.evidence.end), request.evidence.text);
      if (request.handEvidence) assert.match(spec.source.prompt.slice(request.handEvidence.start, request.handEvidence.end), /hand$/);
    }
    assert.ok(spec.activityProgram.actions.every(action => action.actorId === spec.activityProgram.actors[0].id));
    assert.equal(spec.interactionIR.schema, 'simulatte.interactionIR.v1');
    assert.equal(spec.activityProgram.schema, 'simulatte.activityProgram.v3');
    assert.equal(spec.renderProgram.sceneRenderPacket.activityBindings.programHash, spec.activityProgram.contentHash);
  }
});
test('walk and hold execute together: the cup follows the requested hand and stance feet stay planted', () => {
  const state = run(walking), proof = lab.proveActivitySequence(walking.activityProgram, state.activity);
  assert.equal(proof.pass, true, JSON.stringify(proof));
  const first = state.activity.history[0], last = state.activity.history.at(-1);
  const actorId = walking.activityProgram.actors[0].id, objectId = walking.activityProgram.objects[0].id;
  assert.ok(last.actors[actorId].joints.pelvis[0] > first.actors[actorId].joints.pelvis[0] + 1);
  for (const frame of state.activity.history) {
    assert.deepEqual(frame.objects[objectId].position, frame.actors[actorId].joints['left-hand']);
    assert.equal(frame.objects[objectId].owner.hand, 'left');
  }
  assert.equal(proof.metrics.footSlideMeters, 0);
  assert.equal(proof.coverage.forcesValidated, true);
});
test('sit, phone hold, and cup lift/tilt compose without changing handedness or seat support', () => {
  const state = run(sitting), proof = lab.proveActivitySequence(sitting.activityProgram, state.activity);
  assert.equal(proof.pass, true, JSON.stringify(proof));
  const phone = sitting.activityProgram.objects.find(row => row.kind === 'phone').id;
  const cup = sitting.activityProgram.objects.find(row => row.kind === 'cup').id;
  for (const frame of state.activity.history) {
    assert.equal(frame.objects[phone].owner.hand, 'left'); assert.equal(frame.objects[cup].owner.hand, 'right');
    assert.equal(frame.actors[sitting.activityProgram.actors[0].id].joints.pelvis[1], 0.45);
  }
  assert.ok(state.activity.history.some(frame => Math.abs(frame.objects[cup].rotation) > 0.6));
  assert.equal(proof.coverage.liquidTransferValidated, true);
});
test('conflicting simultaneous hands refuse both actions while retaining compatible walking', () => {
  const spec = compile('a person walking while holding a cup in the left hand and holding a phone in the left hand');
  assert.deepEqual(spec.activityProgram.actions.map(row => row.action), ['walk']);
  assert.equal(spec.activityProgram.unsupported.length, 2);
  assert.ok(spec.activityProgram.unsupported.every(row => row.reason === 'conflicting channel writers'));
  assert.equal(lab.proveActivitySequence(spec.activityProgram, run(spec).activity).pass, false);
});
test('explicit order executes after the predecessor; compatible simultaneity is preserved', () => {
  const spec = compile('a person walks for 2 seconds then holds a cup in the right hand for 2 seconds');
  assert.deepEqual(spec.activityProgram.actions.map(row => [row.action, row.startSeconds, row.endSeconds]), [['walk', 0, 2], ['hold', 2, 4]]);
  const state = run(spec), hold = spec.activityProgram.actions[1];
  const before = state.activity.history.find(frame => frame.time > 1 && frame.time < 2);
  assert.equal(before.actionStates[hold.id], 'pending'); assert.equal(before.objects[hold.objectId].owner, null);
  assert.equal(lab.proveActivitySequence(spec.activityProgram, state.activity).pass, true);
});

test('repeated locomotion accumulates while unqualified root and ownership transitions refuse', () => {
  const twice = compile('a person walks for 2 seconds then walks for 2 seconds');
  const final = run(twice), actor = twice.activityProgram.actors[0];
  assert.ok(Math.abs(final.activity.actors[actor.id].joints.pelvis[0] - actor.height * 0.2 * 4) < 1e-8);
  assert.equal(lab.proveActivitySequence(twice.activityProgram, final.activity).pass, true);
  for (const prompt of ['a person sits on a chair then walks',
    'a person holds a cup in the left hand then holds a phone in the left hand',
    'a person places a cup on a table']) {
    const spec = compile(prompt);
    assert.ok(spec.activityProgram.unsupported.length > 0, prompt);
    assert.equal(lab.proveActivitySequence(spec.activityProgram, run(spec).activity).pass, false);
  }
});
test('exact plural participants and unsupported seat affordances remain explicit refusals', () => {
  const plural = compile('two people walking while holding a cup');
  assert.equal(plural.universeGraph.nodes.find(row => /person/.test(row.canonicalId)).cardinality, 2);
  assert.equal(plural.activityProgram.actions.length, 0);
  assert.match(plural.activityProgram.unsupported[0].reason, /individually identified/);
  const invalidSeat = compile('a person sits on a cup');
  assert.equal(invalidSeat.activityProgram.actions.length, 0);
  assert.match(invalidSeat.activityProgram.unsupported[0].reason, /seat support/);
});
test('proof rejects detached contacts, wrong hands, missing objects, frozen walking, and forged timing', () => {
  const state = run(walking), cup = walking.activityProgram.objects[0].id;
  const actor = walking.activityProgram.actors[0].id;
  for (const corrupt of [
    activity => { activity.history[10].objects[cup].position[0] += 0.1; },
    activity => { activity.history[10].objects[cup].owner.hand = 'right'; },
    activity => { activity.history[10].objects[cup].owner = null; },
    activity => { delete activity.history[10].objects[cup]; },
    activity => { for (const frame of activity.history) frame.actors[actor].joints.pelvis = [0, 0.85]; },
    activity => { activity.history[10].actionStates[walking.activityProgram.actions[0].id] = 'completed'; },
  ]) {
    const activity = structuredClone(state.activity); corrupt(activity);
    assert.equal(lab.proveActivitySequence(walking.activityProgram, activity).pass, false);
  }
  assert.equal(lab.proveActivitySequence(walking.activityProgram, lab.createSimulationState(walking).activity).status, 'not-proven');
});
test('two fresh executions, timestep changes, and export/reimport retain program and motion identity', () => {
  const first = run(walking), second = run(walking);
  assert.deepEqual(first.activity, second.activity);
  const imported = lab.deserializeSpec(lab.serializeSpec(walking, { retainPhaseSources: true }));
  assert.equal(imported.activityProgram.contentHash, walking.activityProgram.contentHash);
  assert.equal(imported.contentHash, walking.contentHash);
  assert.deepEqual(run(imported).activity, first.activity);
  const coarse = run(walking, 4, 1 / 30);
  assert.equal(lab.proveActivitySequence(walking.activityProgram, coarse.activity).pass, true);
  for (const [id, actor] of Object.entries(first.activity.actors)) {
    assert.deepEqual(coarse.activity.actors[id].joints, actor.joints);
    assert.ok(coarse.activity.actors[id].velocity.every((v, i) => Math.abs(v - actor.velocity[i]) < 1e-10));
    assert.ok(coarse.activity.actors[id].momentum.every((v, i) => Math.abs(v - actor.momentum[i]) < 1e-9));
  }
  const corrupt = structuredClone(walking.activityProgram); corrupt.actions[0].hand = 'left';
  assert.throws(() => physics.validateActivityProgram(corrupt), /identity/);
});
test('authored body and chair edits recompile rig dimensions and retain user provenance', () => {
  const candidate = JSON.parse(lab.serializeSpec(sitting));
  const actor = candidate.universeGraph.nodes.find(row => /person/.test(row.canonicalId));
  const chair = candidate.universeGraph.nodes.find(row => /chair/.test(row.canonicalId));
  actor.params = { ...(actor.params || {}), height: 1.9 }; chair.params = { ...(chair.params || {}), seatHeight: 0.6, position: [0.9, 0.6] };
  const edited = lab.applyWorldSpecEdit(sitting, candidate, { rationale: 'Qualify different body height and chair geometry' });
  assert.equal(edited.activityProgram.actors[0].height, 1.9);
  assert.equal(edited.activityProgram.objects.find(row => row.kind === 'seat').seatHeight, 0.6);
  assert.notEqual(edited.activityProgram.contentHash, sitting.activityProgram.contentHash);
  assert.equal(edited.authorship.revision, 1);
  assert.equal(lab.proveActivitySequence(edited.activityProgram, run(edited).activity).pass, true);
});
test('active activity owns its participants: user mutation rejects while selection stays available', () => {
  const state = lab.createSimulationState(walking), id = walking.activityProgram.objects[0].id;
  const command = { actionId: 'grab', targetId: `target:${id}`, sequence: 1, point: [0.5, 0.5], delta: [0, 0] };
  const result = physics.applyInteractionCommands(state, walking.interactionIR, [command]);
  assert.equal(result.interaction.receipts.at(-1).status, 'rejected');
  assert.match(result.interaction.receipts.at(-1).reason, /activity owns/);
  const select = physics.applyInteractionCommands(state, walking.interactionIR, [{ ...command, actionId: 'select' }]);
  assert.equal(select.interaction.receipts.at(-1).status, 'applied');
});
test('Phase 7 binds all articulated parts and draws snapshot transforms without animation loops', () => {
  const packet = sitting.renderProgram.sceneRenderPacket, data = renderer.compileSceneRenderData(packet);
  const first = lab.createSimulationState(sitting), next = run(sitting, 2);
  const a = renderer.scenePacketInteractionPartData(data.objectPartData, data.objectParts, packet, first);
  const b = renderer.scenePacketInteractionPartData(data.objectPartData, data.objectParts, packet, next);
  assert.equal(b.activityReceipt.consumed, true);
  assert.notDeepEqual(a.data, b.data);
  for (let i = 0; i < data.objectParts.length; i++) {
    assert.equal(b.data[i * renderer.GPU_OBJECT_PART_FLOATS + 7], 0);
  }
  assert.notEqual(renderer.simulationEvidenceKey({ simulationState: first }), renderer.simulationEvidenceKey({ simulationState: next }));
});
test('placing a cup draws its bottom on the declared tabletop and support legs on the ground', () => {
  const spec=compile('a person holds a cup in the right hand for 2 seconds then places the cup on a table with the right hand for 2 seconds');
  const packet=spec.renderProgram.sceneRenderPacket, program=spec.activityProgram;
  const state={...lab.createSimulationState(spec),activity:physics.evaluateActivityFrame(program,4)};
  const data=renderer.compileSceneRenderData(packet);
  const applied=renderer.scenePacketInteractionPartData(data.objectPartData,data.objectParts,packet,state);
  data.objectParts=data.objectParts.map((part,i)=>{const offset=i*renderer.GPU_OBJECT_PART_FLOATS;
    return {...part,center:[applied.data[offset],applied.data[offset+1]],size:[applied.data[offset+2],applied.data[offset+3]],rotation:applied.data[offset+4]};});
  const proof=require('../public/blank/pipeline/phase-07-render/simulatte-render-proof.js');
  const relations=spec.phaseArtifacts.phase6.artifact.compositionLedger.obligations.filter(row=>/^relation:spatial:.*:on:/.test(row.id));
  assert.ok(relations.length>0);
  for(const row of relations)assert.equal(proof.visualObligationGeometrySatisfied('',{},row,packet,data),true);
  const support=program.objects.find(row=>row.kind==='support'),cup=program.objects.find(row=>row.kind==='cup');
  assert.equal(state.activity.objects[cup.id].position[1]-cup.liquidContainer.heightMeters/2,support.supportHeight);
  const tableId=packet.activityBindings.bindings.find(row=>row.participantId===support.id).entityId;
  const bottoms=data.objectParts.filter(part=>part.entityId===tableId).map(part=>part.center[1]+(Math.abs(Math.sin(part.rotation))*part.size[0]+Math.abs(Math.cos(part.rotation))*part.size[1])/2);
  assert.ok(Math.abs(Math.max(...bottoms)-packet.activityBindings.projection.origin[1])<1e-6);
});

test('retrieved concepts without source spans cannot become phantom activity participants', () => {
  const retrieval = walking.phaseArtifacts.phase3.artifact.retrievalRerankResult.activityRetrieval;
  const graph = { ...walking.universeGraph, nodes: [
    { id: 'unbound-retrieved-concept', spanId: null, label: 'Holding' }, ...walking.universeGraph.nodes,
  ] };
  const activity = physics.groundActivityGraph(retrieval, graph);
  assert.equal(activity.actions.find(row => row.action === 'walk').objectId, null);
  const program = physics.compileActivityProgram(activity, graph);
  assert.deepEqual(program.objects.map(row => row.id), walking.activityProgram.objects.map(row => row.id));
  const missingActor = structuredClone(retrieval);
  missingActor.candidates[0].request.actorSpanId = null;
  const refused = physics.groundActivityGraph(missingActor, graph);
  assert.ok(refused.unsupported.some(row => row.reason === 'missing supported actor'));
});

test('intent receipts bind supported source activities and retain activity refusals', () => {
  const proof = require('../public/shared/contracts/world-proof-intent.js');
  const requirements = walking.phaseArtifacts.phase2.artifact.intentRequirements;
  const artifact = structuredClone(walking.phaseArtifacts.phase4.artifact);
  artifact.groundedIntent.acceptedGraph.edges = [];
  const settle = input => proof.createIntentSettlementLedger(requirements, input);
  const accepted = settle(artifact);
  assert.equal(accepted.lostCount, 0);
  assert.ok(accepted.settlements.filter(row => ['action', 'relation'].includes(row.kind))
    .every(row => row.status === 'accepted' && row.evidenceIds.some(id => id.startsWith('activity:'))));
  const walk = artifact.groundedIntent.activityGraph.actions.find(row => row.action === 'walk');
  for (const mutate of [row => { row.actorId = 'foreign-actor'; }, row => { row.component.execution.supported = false; },
    row => { row.component.id = 'drink'; }, row => { row.action = 'drink'; },
    row => { row.sourceEvidence.verbSpanId = 'foreign-span'; }]) {
    const invalid = structuredClone(artifact);
    mutate(invalid.groundedIntent.activityGraph.actions.find(row => row.action === 'walk'));
    assert.ok(settle(invalid).lostCount > 0);
  }
  artifact.groundedIntent.activityGraph.unsupported.push({ id: walk.id, reason: 'conflicting channel writers', evidence: walk.sourceEvidence });
  const refused = settle(artifact);
  assert.ok(refused.settlements.filter(row => row.sourceSpanIds.includes(walk.sourceEvidence.verbSpanId))
    .every(row => row.status === 'explicitly-refused'));
});

test('model-selected participant aliases retain attachment and obligation bindings', () => {
  const visual = registry.family('compositionGraph');
  const packet = structuredClone(walking.renderProgram.sceneRenderPacket);
  const objectId = walking.activityProgram.objects[0].id;
  const cup = packet.entities.find(entity => entity.physicalRef === objectId || entity.sourceIds?.includes(objectId));
  cup.id = 'model-selected-cup'; cup.physicalRef = 'model-selected-cup'; cup.sourceIds = [];
  cup.representedEntityIds = [objectId];
  visual.bindActivityVisualProgram({ sceneRenderPacket: packet }, walking.activityProgram);
  assert.deepEqual(packet.activityBindings.missingParticipantIds, []);
  assert.ok(packet.activityBindings.bindings.some(row => row.participantId === objectId && row.entityId === cup.id));
  const ledger = visual.bindActivityVisualLedger(walking.phaseArtifacts.phase6.artifact.compositionLedger, walking.activityProgram, packet);
  const hold = ledger.obligations.find(row => row.activityBinding?.participantIds.includes(objectId));
  assert.ok(hold.activityBinding.packetEntityIds.includes(cup.id));
  const data = renderer.compileSceneRenderData(packet);
  const applied = renderer.scenePacketActivityPartData(data.objectPartData, data.objectParts, packet, run(walking));
  assert.equal(applied.receipt.consumed, true);
});

test('activity bindings project through VisualIR and independently require every participant pixel', () => {
  const proof = require('../public/blank/pipeline/phase-07-render/simulatte-render-proof.js');
  const input = lab.createRenderExecutionInput(walking, run(walking), { width: 640, height: 640 });
  const packet = input.sceneRenderPacket, data = renderer.compileSceneRenderData(packet);
  const applied = renderer.scenePacketInteractionPartData(data.objectPartData, data.objectParts, packet, input.simulationState);
  data.activityVisualReceipt = applied.activityReceipt;
  data.requireLivePixelSamples = true;
  const row = input.visualObligations.find(row => row.activityBinding?.participantIds.length === 2);
  assert.ok(row);
  const v = walking.renderProgram.visualIR;
  assert.equal(v.camera.projection, packet.camera.projection);
  assert.deepEqual(v.activityBindings, packet.activityBindings);
  assert.ok(v.geometry.filter(row => row.activityBinding).every(row => row.program.parts.length > 0));
  const plan = renderer.phase7PixelReadbackPlan(data, packet, input, { width: 640, height: 640 });
  const samples = plan.samples.filter(sample => sample.obligationId === row.obligationId)
    .map(sample => ({ ...sample, rgba: [80, 160, 220, 255] }));
  const setSamples = samples => { data.pixelSamples = { schema: 'simulatte.phase7PixelSampleSet.v1',
    source: 'phase7-test-readback', packetKey: data.packetKey, readbackSerial: 1, samples }; };
  setSamples(samples);
  assert.equal(proof.renderObligationProof(packet, [row], null, true, data)[0].pass, true);
  setSamples([samples[0], { ...samples[0], id: 'duplicate' }]);
  assert.equal(proof.renderObligationProof(packet, [row], null, true, data)[0].pass, false);
  setSamples(samples); data.activityVisualReceipt = null;
  assert.equal(proof.renderObligationProof(packet, [row], null, true, data)[0].pass, false);
  const brokenPacket = structuredClone(packet); brokenPacket.activityBindings.programHash = 'wrong-program';
  data.activityVisualReceipt = applied.activityReceipt;
  assert.equal(proof.renderObligationProof(brokenPacket, [row], null, true, data)[0].pass, false);
});

test('the browser reports sequence proof as final only after behavior settles', () => {
  const target = { canvas: { dataset: {} }, renderData: {}, sceneRenderPacket: {},
    phase8Output: { artifact: { sceneProof: { activityProof: { coverage: { complete: false }, unsupported: [] } } } } };
  assert.equal(renderer.notifyRendererSceneProof(target).final, false);
  target.phase8Output.artifact.sceneProof.activityProof.coverage.complete = true;
  assert.equal(renderer.notifyRendererSceneProof(target).final, true);
  target.phase8Output.artifact.sceneProof.activityProof.coverage.complete = false;
  target.phase8Output.artifact.sceneProof.activityProof.unsupported = [{ reason: 'unsupported hand conflict' }];
  assert.equal(renderer.notifyRendererSceneProof(target).final, true);
});

test('Scene Proof rejects drawing receipts from another program or sequence time', () => {
  const state = run(walking), packet = walking.renderProgram.sceneRenderPacket;
  const data = renderer.compileSceneRenderData(packet);
  const applied = renderer.scenePacketInteractionPartData(data.objectPartData, data.objectParts, packet, state);
  const phase7 = lab.runPhase7RenderExecution(walking.phaseArtifacts.phase6, state, { width: 640, height: 640 },
    { rendered: true, renderCount: 1, activityVisualReceipt: applied.activityReceipt });
  const fixture = structuredClone(phase7);
  // These are synthetic receipt fixtures; actual GPU acceptance is in the browser audit.
  const rows = fixture.artifact.compositionLedger.obligations.filter(row => row.activityBinding);
  fixture.artifact.renderExecution.visualObligationProof = rows.map(row => ({ obligationId: row.id, status: 'pass' }));
  const settle = input => lab.runPhase8SceneProof(input).artifact.sceneProof;
  const valid = settle(fixture);
  assert.ok(rows.every(row => valid.settledObligations.find(result => result.obligationId === row.id).status === 'preserved'));
  for (const change of [receipt => { receipt.programHash = 'wrong'; }, receipt => { receipt.time -= 1; }]) {
    const corrupt = structuredClone(fixture); change(corrupt.artifact.renderExecution.activityEvidence.visualReceipt);
    const failed = settle(corrupt);
    assert.ok(failed.requiredFailures.some(row => row.obligationId === 'activity:sequence'));
    assert.ok(rows.every(row => failed.settledObligations.find(result => result.obligationId === row.id).status === 'not-proven'));
  }
});

test('a complete walk, sit, drink, place/release, stand chain retains one cup and passes force/liquid proof',()=>{
 const prompt='a person walks for 2 seconds then sits on a chair for 2 seconds then drinks from a cup with the right hand for 4 seconds then places the cup on a table with the right hand for 2 seconds then stands for 2 seconds';
 const spec=compile(prompt),program=spec.activityProgram;
 assert.deepEqual(program.actions.map(row=>row.action),['walk','sit','drink','place','stand']);
 assert.equal(program.unsupported.length,0);
 assert.equal(program.objects.filter(row=>row.kind==='cup').length,1);
 assert.equal(spec.universeGraph.nodes.filter(row=>row.visualArchetype==='cup').length,1);
 assert.ok(!spec.universeGraph.nodes.some(row=>row.unresolved));
 const state=run(spec),proof=lab.proveActivitySequence(program,state.activity);
 assert.equal(proof.pass,true,JSON.stringify(proof));
 assert.equal(proof.coverage.forcesValidated,true);assert.equal(proof.coverage.liquidTransferValidated,true);
 const place=program.actions.find(row=>row.action==='place'),cup=program.objects.find(row=>row.kind==='cup');
 const before=state.activity.history.find(frame=>frame.time>place.startSeconds&&frame.time<place.releaseSeconds);
 assert.equal(before.objects[cup.id].owner.hand,'right');
 const released=state.activity.history.find(frame=>frame.time>place.releaseSeconds);
 assert.equal(released.objects[cup.id].owner,null);assert.equal(released.objects[cup.id].supportObjectId,place.supportObjectId);
 assert.deepEqual(state.activity.objects[cup.id].position,released.objects[cup.id].position,'Standing must not move the released cup');
 assert.equal(state.activity.actors[program.actors[0].id].supportObjectId,null);
 const imported=lab.deserializeSpec(lab.serializeSpec(spec,{retainPhaseSources:true}));
 assert.equal(imported.activityProgram.contentHash,program.contentHash);
 assert.deepEqual(run(imported).activity,state.activity);
 for(const corrupt of [a=>{a.history.at(-1).objects[cup.id].supportObjectId=null;},a=>{a.history.at(-1).objects[cup.id].position[1]+=.1;}]){
   const copy=structuredClone(state.activity);corrupt(copy);assert.equal(lab.proveActivitySequence(program,copy).pass,false);
 }
});

test('complete transition histories stay available past the former 1024-frame truncation',()=>{
 const spec=compile('a person walks for 4 seconds then sits on a chair for 4 seconds then holds a phone in the right hand for 4 seconds then places the phone on a table with the right hand for 4 seconds then stands for 4 seconds');
 const state=run(spec);
 assert.ok(state.activity.history.length>1024);assert.equal(state.activity.historyTruncated,false);
 assert.equal(lab.proveActivitySequence(spec.activityProgram,state.activity).pass,true);
 const stand=spec.activityProgram.actions.at(-1),samples=state.activity.history.filter(frame=>frame.time>=stand.startSeconds);
 assert.ok(samples.at(-1).actors[stand.actorId].joints.pelvis[1]>samples[0].actors[stand.actorId].joints.pelvis[1]+.1);
});
