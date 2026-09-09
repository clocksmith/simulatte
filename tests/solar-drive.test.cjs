const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('../public/shared/core/simulation/solar-drive.js');
const program = require('../public/simulatte/solar-drive/program.js');
const world = require('../public/shared/contracts/world-spec.js');
const p = (changes = {}) => ({ ...program.create().params, ...changes });
const near = (actual, expected, tolerance = 0.001) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} differs from ${expected}`);

test('the original 5 kg ideal ring stores 100 kJ and exposes 75 kJ above half speed', () => {
  const params = p({ flywheelRadius: 0.5, flywheelInitialFraction: 1 });
  const state = model.initial(params), t = model.telemetry(params, state);
  near(state.flywheelJ, 100000); near(t.flywheelUsableWh, 75000 / 3600);
  near(t.rpm, 400 * 60 / (2 * Math.PI));
});

test('all three presets preserve incident energy through storage, motion, height, and losses', () => {
  for (const vehicle of ['bicycle', 'scooter', 'car']) {
    const spec = program.validate(program.create(vehicle));
    let state = model.initial(spec.params);
    for (let i = 0; i < 6000; i += 1) {
      state = model.step(spec.params, state);
      near(state.initialJ + state.ledger.incidentJ, model.storedEnergy(spec.params, state) + model.losses(state));
      assert.ok(state.batteryJ >= 0 && state.flywheelJ >= 0);
      assert.ok(state.batteryJ <= model.properties(spec.params).batteryMaxJ + 1e-5);
      assert.ok(state.flywheelJ <= model.properties(spec.params).rotorMaxJ + 1e-5);
    }
    assert.ok(state.distanceM > 500); assert.ok(state.ledger.tractionJ > 0);
  }
});

test('magnets do not move an empty vehicle in darkness on a level road', () => {
  const params = p({ irradiance: 0, batterySoc: 0, flywheelInitialFraction: 0, route: 'flat', grade: 0 });
  const state = model.run(params, 1000);
  near(state.distanceM, 0, 1e-6); near(state.batteryJ + state.flywheelJ, 0); near(state.residualJ, 0);
  assert.equal(state.status, 'energy-depleted'); assert.ok(state.flows.unservedAuxW > 0);
});

test('gravity is an explicit potential-energy exchange on a descent', () => {
  const params = p({ irradiance: 0, batterySoc: 0, flywheel: false, route: 'flat', grade: -10, targetKph: 20 });
  const state = model.run(params, 1200);
  assert.ok(state.elevationM < 0); assert.ok(state.speedMs > 0); near(state.residualJ, 0);
  assert.ok(-model.properties(params).massKg * 9.80665 * state.elevationM >= state.ledger.regenJ);
});

test('braking feeds auxiliaries and charges a battery in darkness', () => {
  const params = p({ irradiance: 0, flywheel: false, route: 'flat', targetKph: 0, batterySoc: 0.3 });
  let state = model.initial(params); state.speedMs = 10;
  const kineticJ = 0.5 * model.properties(params).effectiveMassKg * 100;
  state.initialJ += kineticJ;
  const before = state.batteryJ;
  for (let i = 0; i < 160; i += 1) state = model.step(params, state);
  assert.ok(state.ledger.regenJ > 0); assert.ok(state.batteryJ > before);
  assert.ok(state.ledger.regenJ < kineticJ); near(state.residualJ, 0);
});

test('full stores reject excess energy and friction brakes remain available', () => {
  const params = p({ route: 'flat', targetKph: 0, batterySoc: 1, flywheelInitialFraction: 1, irradiance: 1200 });
  let state = model.initial(params); state.speedMs = 10;
  state.initialJ += 0.5 * model.properties(params).effectiveMassKg * 100;
  for (let i = 0; i < 160; i += 1) state = model.step(params, state);
  assert.ok(state.ledger.frictionBrakeJ > 0); assert.ok(state.ledger.curtailedJ > 0); near(state.residualJ, 0);
});

test('sunlight and shade affect power while rotor removal removes mass and losses', () => {
  const params = p(), shaded = p({ shade: 0.9 }), empty = p({ flywheel: false });
  assert.ok(model.solar(shaded, 0).busW < model.solar(params, 0).busW * 0.15);
  near(model.properties(params).massKg - model.properties(empty).massKg, params.flywheelMass + params.housingKg);
  const state = model.run(empty, 100); near(state.flywheelJ, 0); near(state.ledger.parasiticJ, 0);
});

test('thermal cutoff prevents traction power and cooling permits recovery', () => {
  const params = p({ route: 'flat' });
  let state = model.initial(params); state.motorC = params.cutoffC + 5;
  const next = model.step(params, state);
  near(next.flows.driveW, 0); assert.ok(next.motorC < state.motorC);
});

test('halving the timestep converges on distance and stored energy', () => {
  const coarseP = p({ stepS: 0.05, route: 'flat' }), fineP = { ...coarseP, stepS: 0.025 };
  const coarse = model.run(coarseP, 2400), fine = model.run(fineP, 4800);
  assert.ok(Math.abs(coarse.distanceM - fine.distanceM) / fine.distanceM < 0.001);
  assert.ok(Math.abs(coarse.batteryJ - fine.batteryJ) / fine.batteryJ < 0.001);
});

test('WorldSpec edits preserve authorship, exact replay, and verified export/reimport', () => {
  const initial = program.create();
  const edited = program.edit(initial, { shade: 0.7 });
  assert.equal(edited.authorship.revision, 1); assert.notEqual(edited.contentHash, initial.contentHash);
  assert.ok(edited.authorship.patches.length > 0);
  const restored = program.validate(JSON.parse(world.serializeWorldSpec(edited)));
  assert.equal(restored.contentHash, edited.contentHash);
  const a = model.run(restored.params, 700), b = model.run(restored.params, 700);
  assert.deepEqual(a, b); assert.equal(program.receipt(restored, a).evidence.calibration, 'not-performed');
  restored.params.shade = 0;
  assert.throws(() => program.validate(restored), /contentHash/);
});

test('bad parameters and attempts to reinterpret component geometry refuse explicitly', () => {
  assert.throws(() => program.edit(program.create(), { flywheelTip: 10000 }), /solar_parameter_invalid/);
  assert.throws(() => program.edit(program.create(), { magicGain: 2 }), /solar_parameter_unknown/);
  const raw = JSON.parse(world.serializeWorldSpec(program.create())); raw.objects[0].label = 'Infinite energy';
  assert.throws(() => program.validate(world.finalizeWorldSpec(raw)), /component_contract/);
});


test('unsupported execution declarations refuse and receipts detach their state', () => {
  const spec = program.create();
  const changed = structuredClone(spec); changed.modules[0].version = '9.0.0';
  assert.throws(() => program.validate(world.finalizeWorldSpec(changed)), /solar_contract_not_supported/);
  const extra = structuredClone(spec); extra.contract = { inventedPhysics: true };
  assert.throws(() => program.validate(world.finalizeWorldSpec(extra)), /solar_field_not_supported/);
  const state = model.run(spec.params, 1200); near(state.timeS, 60, 1e-12);
  const receipt = program.receipt(spec, state); receipt.state.ledger.incidentJ = -1;
  assert.ok(state.ledger.incidentJ > 0);
});
