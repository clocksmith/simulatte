const test = require('node:test');
const assert = require('node:assert/strict');
const lab = require('../public/blank/app/simulation/simulation-lab.js');
const physics = globalThis.SimulattePhaseModuleRegistry.family('physicsModel');
const policy = physics.activityCapabilityInventory().dynamics;
const compile = prompt => lab.createSpecFromPrompt(prompt, { deterministicRuntime: true });
const prompt = 'a person sits on a chair, holds a phone in the left hand, and drinks from a cup with the right hand';
const sitting = compile(prompt);
function run(spec, dt = 1 / 60) {
  let state = lab.createSimulationState(spec);
  for (let i = 0; i < Math.ceil(4 / dt) + 1; i++) state = lab.stepSimulation(state, spec, dt);
  return state;
}
function amended(program, change) {
  const copy = structuredClone(program); change(copy); copy.contentHash = physics.activityProgramHash(copy);
  physics.validateActivityProgram(copy); return copy;
}
function runProgram(program, dt = 1 / 60) {
  let state = physics.withActivityState({}, program);
  for (let i = 0; i < Math.ceil(4 / dt) + 1; i++) state = physics.stepActivityState(state, program, dt);
  return state;
}
test('stationary support and grip reactions match independent mg references', () => {
  const spec = compile('a person holds a phone in the left hand'), state = run(spec);
  const frame = state.activity.history[60], receipt = frame.dynamics;
  const dt = receipt.endTime - receipt.startTime, actor = spec.activityProgram.actors[0], object = spec.activityProgram.objects[0];
  assert.ok(Math.abs(receipt.objectImpulses[object.id].constraint[1] / dt - object.massKg * policy.gravityMetersPerSecondSquared) < 1e-10);
  assert.ok(Math.abs(receipt.actorImpulses[actor.id].support[1] / dt - (actor.massKg + object.massKg) * policy.gravityMetersPerSecondSquared) < 1e-10);
  assert.equal(lab.proveActivitySequence(spec.activityProgram, state.activity).coverage.forcesValidated, true);
});
test('finite-volume still water remains at rest and exactly conserves volume', () => {
  const c = { widthMeters: 1, heightMeters: 0.1, depthMeters: 0.2, fillFraction: 0.25 };
  const original = physics.createActivityLiquid(c, 16);
  let liquid = original;
  for (let i = 0; i < 100; i++) liquid = physics.stepActivityLiquid(liquid, c,
    { angleRadians: 0, acceleration: [0, 0], position: [0, 0], velocity: [0, 0], angularVelocity: 0, angularAcceleration: 0, mouth: null }, 0.01, policy);
  assert.deepEqual(liquid.depthMeters, original.depthMeters);
  assert.ok(liquid.dischargeSquareMetersPerSecond.every(q => q === 0));
  assert.equal(liquid.remainingVolumeCubicMeters, original.initialVolumeCubicMeters);
  assert.equal(liquid.spilledVolumeCubicMeters, 0);
});
function damBreak(cells) {
  const c = { widthMeters: 2, heightMeters: 1, depthMeters: 0.1, fillFraction: 0.05 };
  let liquid = physics.createActivityLiquid(c, cells);
  liquid.depthMeters = Array.from({ length: cells }, (_, i) => i < cells / 2 ? 0.1 : 0);
  const time = 0.15;
  liquid = physics.stepActivityLiquid(liquid, c,
    { angleRadians: 0, acceleration: [0, 0], position: [0, 0], velocity: [0, 0], angularVelocity: 0, angularAcceleration: 0, mouth: null }, time, policy);
  const waveSpeed = Math.sqrt(policy.gravityMetersPerSecondSquared * 0.1);
  const errors = liquid.depthMeters.map((h, i) => {
    const xi = ((i + 0.5) * c.widthMeters / cells - 1) / time;
    const reference = xi <= -waveSpeed ? 0.1 : xi >= 2 * waveSpeed ? 0 : (2 * waveSpeed - xi) ** 2 / (9 * policy.gravityMetersPerSecondSquared);
    return Math.abs(h - reference);
  });
  return { l1: errors.reduce((a, b) => a + b) / cells, liquid };
}
test('dry-bed dam break converges against the independent Ritter solution under grid refinement', () => {
  const rows = [32, 64, 128].map(damBreak);
  assert.ok(rows[1].l1 < rows[0].l1, JSON.stringify(rows.map(r => r.l1)));
  assert.ok(rows[2].l1 < rows[1].l1, JSON.stringify(rows.map(r => r.l1)));
  assert.ok(rows[2].l1 < 0.004);
  for (const row of rows) {
    assert.ok(row.liquid.depthMeters.every(h => h >= 0));
    assert.ok(row.liquid.maxCfl <= policy.cfl + 1e-9);
    assert.ok(Math.abs(row.liquid.initialVolumeCubicMeters - row.liquid.remainingVolumeCubicMeters) < 1e-12);
  }
});
test('tilted cup routes overflow through actual mouth contact, otherwise to spill', () => {
  const c = { widthMeters: 0.09, heightMeters: 0.117, depthMeters: 0.09, fillFraction: 0.55 };
  const environment = { angleRadians: 1.1, acceleration: [0, 0], position: [0, 0], velocity: [0, 0], angularVelocity: 0, angularAcceleration: 0, mouth: null };
  const spill = physics.stepActivityLiquid(physics.createActivityLiquid(c, 16), c, environment, 0.5, policy);
  const drink = physics.stepActivityLiquid(physics.createActivityLiquid(c, 16), c, { ...environment, mouth: [0, 0] }, 0.5, policy);
  assert.ok(spill.spilledVolumeCubicMeters > 0); assert.equal(spill.consumedVolumeCubicMeters, 0);
  assert.ok(drink.consumedVolumeCubicMeters > 0); assert.equal(drink.spilledVolumeCubicMeters, 0);
  assert.ok(Math.abs(drink.initialVolumeCubicMeters - drink.remainingVolumeCubicMeters - drink.consumedVolumeCubicMeters) < 1e-12);
});
const completed = run(sitting);
test('completed bounded activities settle only when other solvers and manipulation channels are idle', () => {
  assert.equal(lab.stepSimulation(completed, sitting, 1 / 60), completed);
  assert.throws(() => lab.stepSimulation(completed, sitting, NaN), /bounded finite step/);
  const moving = structuredClone(completed);
  const velocityId = sitting.solverGraph.steps.flatMap(row => row.reads).find(id => id.startsWith('velocity:'));
  moving.solverState.channels[velocityId] = { x: 0.2, y: 0 };
  const stepped = lab.stepSimulation(moving, sitting, 1 / 60);
  assert.ok(stepped.t > moving.t);
  assert.notDeepEqual(stepped.solverState.channels[velocityId], moving.solverState.channels[velocityId]);
  const independent = compile('a person walks while holding a cup beside a flowing river');
  assert.ok(independent.solverGraph.steps.some(row => row.operatorType === 'advection'));
  const world = run(independent), next = lab.stepSimulation(world, independent, 1 / 60);
  assert.ok(next.t > world.t);
  assert.equal(next.activity.time, world.activity.time);
});
test('composed drinking conserves water, carries its changing mass, and qualifies forces and liquid separately', () => {
  const proof = lab.proveActivitySequence(sitting.activityProgram, completed.activity);
  assert.equal(proof.pass, true, JSON.stringify(proof));
  assert.equal(proof.coverage.forcesValidated, true); assert.equal(proof.coverage.liquidTransferValidated, true);
  assert.ok(proof.metrics.consumedMassKg > 0); assert.equal(proof.metrics.spilledMassKg, 0);
  assert.ok(proof.metrics.massErrorKg < 1e-10); assert.ok(proof.metrics.momentumErrorKgMetersPerSecond < 1e-10);
  const actor = Object.values(completed.activity.actors)[0];
  assert.ok(Math.abs(actor.massKg - 70 - proof.metrics.consumedMassKg) < 1e-10);
});
test('force and liquid proofs reject missing, forged, nonfinite and unbalanced evidence', () => {
  const cup = sitting.activityProgram.objects.find(o => o.kind === 'cup').id;
  const changes = [a => { delete a.history[20].dynamics; }, a => { a.history[20].dynamics.programHash = 'foreign'; },
    a => { a.history[20].dynamics.objectImpulses[cup].constraint[0] += 1; },
    a => { a.history[20].objects[cup].liquid.depthMeters[0] += 0.005; },
    a => { a.history[20].objects[cup].liquid.spilledVolumeCubicMeters += 0.01; },
    a => { a.history[20].objects[cup].momentum[1] += 1; },
    a => { a.history[20].objects[cup].velocity[0] = NaN; },
    a => { a.history[20].objects[cup].liquid.maxCfl = 1; },
    a => { delete a.history[20].objects[cup].angularVelocity; },
    a => { delete Object.values(a.history[20].actors)[0].consumedMassKg; },
    a => { a.history[20].dynamics.objectImpulses[cup].angularConstraint += 1; },
    a => { const f = a.history.find(f => f.dynamics.liquidTransfers.length); f.dynamics.liquidTransfers[0].actorId = 'foreign'; },
    a => { const f = a.history.find(f => f.dynamics.liquidTransfers.length); f.dynamics.liquidTransfers[0].outlet[0] += 1; }];
  for (const change of changes) {
    const activity = structuredClone(completed.activity); change(activity);
    const proof = lab.proveActivitySequence(sitting.activityProgram, activity);
    assert.equal(proof.pass, false); assert.equal(proof.coverage.forcesValidated, false);
  }
});
test('declared grip and seat capacities reject mechanically impossible scenes', () => {
  for (const change of [p => { p.objects.find(o => o.kind === 'cup').gripForceLimitNewtons = 0.1; },
    p => { p.objects.find(o => o.kind === 'seat').supportCapacityNewtons = 10; }]) {
    const program = amended(sitting.activityProgram, change);
    const state = runProgram(program), proof = lab.proveActivitySequence(program, state.activity);
    assert.equal(proof.pass, false); assert.match(proof.violations.join(' '), /capacity/);
  }
});
test('new dynamics are bounded; old activity programs retain the old kinematic execution', () => {
  for (const change of [p => { p.dynamics.cfl = 1; }, p => { p.dynamics.liquidCells = 1024; },
    p => { p.objects[0].massKg = -1; }, p => { p.objects.find(o => o.kind === 'cup').liquidContainer.fillFraction = 2; }]) {
    assert.throws(() => amended(sitting.activityProgram, change));
  }
  const old = amended(sitting.activityProgram, p => {
    p.schema = 'simulatte.activityProgram.v1'; p.version = 1; delete p.dynamics;
  });
  const proof = lab.proveActivitySequence(old, runProgram(old).activity);
  assert.equal(proof.pass, true); assert.equal(proof.coverage.forcesValidated, false);
  assert.equal(proof.coverage.liquidTransferValidated, false);
});
test('requesting COSMI inference fails at Runtime without a silent procedural substitution', () => {
  assert.throws(() => lab.createSpecFromPrompt(prompt, { deterministicRuntime: true, activityMotionProvider: 'cosmi' }),
    error => error.code === 'COSMI_ARTIFACTS_UNAVAILABLE');
  assert.throws(() => physics.requireActivityMotionProvider('unknown'), /unavailable/);
});
test('water remains bound and volume-preserving without being counted as structural cup morphology', () => {
  require('../public/blank/pipeline/phase-07-render/simulatte-webgpu-renderer.js');
  const renderer = globalThis.SimulattePhaseModuleRegistry.family('webGpuRenderer');
  for (const spec of [sitting, lab.createSpecFromPrompt(prompt, { deterministicRuntime: true,
    constructionApproach: { schema: 'simulatte.constructionApproach.v2', id: 'prompt-obligation-coverage',
      seed: 1, attempt: 1, rejectedGrammarIds: ['object-grammar.cup'], failedObligationIds: ['entity:cup'] } })]) {
    const packet = spec.renderProgram.sceneRenderPacket, data = renderer.compileSceneRenderData(packet), state = run(spec);
    const cup = spec.activityProgram.objects.find(o => o.kind === 'cup');
    const cupRealization = data.objectRealization.rows.find(row => row.identityType === 'cup');
    assert.equal(cupRealization.morphologyQuality.pass, true);
    // The alternative constructive template has no qualified topology receipt.
    // Water must not manufacture semantic acceptance for that existing refusal.
    assert.equal(cupRealization.realized, spec === sitting);
    const applied = renderer.scenePacketActivityPartData(data.objectPartData, data.objectParts, packet, state);
    assert.equal(applied.receipt.consumed, true); assert.equal(applied.receipt.liquidPartCount, 16);
    let volume = 0;
    for (let i = 0; i < data.objectParts.length; i++) if (data.objectParts[i].constructionPartId.startsWith('liquid-cell-')) {
      const offset = i * renderer.GPU_OBJECT_PART_FLOATS, scale = packet.activityBindings.projection.scale;
      volume += applied.data[offset + 2] * applied.data[offset + 3] / (scale * scale) * cup.liquidContainer.depthMeters;
    }
    assert.ok(Math.abs(volume - state.activity.objects[cup.id].liquid.remainingVolumeCubicMeters) < 1e-10);
  }
});
