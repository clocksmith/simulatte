const assert = require('node:assert/strict');
const test = require('node:test');

const lab = require('../public/js/simulatte-physics-lab.js');

test('builder creates the solar magnetic perpetual motion machine from prompt', () => {
  const spec = lab.createSpecFromPrompt(
    'build a solar magnetic perpetual motion machine with a moving magnetic slider powered by the sun'
  );

  assert.equal(spec.templateId, 'custom-world');
  assert.equal(spec.name, 'Solar Magnetic Perpetual Motion Machine');
  assert.ok(spec.modules.includes('electromagnetism'));
  assert.ok(spec.modules.includes('solar'));
  assert.ok(spec.objects.some((object) => object.id === 'rotor-wheel'));
  assert.ok(spec.controls.some((control) => control[0] === 'sliderAmplitude'));
  assert.equal(spec.params.irradiance, 780);
  assert.equal(spec.params.sliderAmplitude, 0.42);
  assert.equal(spec.params.loadTorque, 0.16);
});

test('simulation specs export, import, and remix with lineage', () => {
  const spec = lab.createSpecFromPrompt('make a fluid vortex tank with turbulence and pressure');
  const restored = lab.deserializeSpec(lab.serializeSpec(spec));
  const remix = lab.remixSpec(restored, { name: 'Fluid Vortex Remix' });

  assert.equal(restored.templateId, 'custom-world');
  assert.ok(restored.modules.includes('fluid'));
  assert.equal(restored.name, spec.name);
  assert.equal(remix.templateId, 'custom-world');
  assert.equal(remix.remixOf, restored.id);
  assert.equal(remix.name, 'Fluid Vortex Remix');
});

test('builder composes hybrid worlds from multiple physical domains', () => {
  const spec = lab.createSpecFromPrompt('build a solar magnetic wheel in turbulent cooling fluid with catalyst chemistry');

  assert.equal(spec.templateId, 'custom-world');
  assert.ok(spec.modules.includes('electromagnetism'));
  assert.ok(spec.modules.includes('fluid'));
  assert.ok(spec.modules.includes('chemistry'));
  assert.ok(spec.controls.some((control) => control[0] === 'vortexStrength'));
  assert.ok(spec.controls.some((control) => control[0] === 'catalyst'));
  assert.ok(spec.objects.some((object) => object.id === 'catalyst-front'));
});

test('blank world is an empty construction plane, not a machine seed', () => {
  const spec = lab.createSpec('blank-world');
  const state = lab.stepSimulation(lab.createSimulationState(spec), spec, 1 / 60);
  const readouts = lab.readoutValues(state, spec);

  assert.equal(spec.templateId, 'blank-world');
  assert.equal(spec.modules.length, 0);
  assert.equal(spec.objects.length, 0);
  assert.deepEqual(Object.keys(readouts), ['modules', 'objects', 'forces', 'sources', 'sinks', 'canvas']);
  for (const value of Object.values(readouts)) {
    assert.ok(Number.isFinite(Number(value)), `blank readout ${value} should be finite`);
  }
});

test('flow seed remains visually and structurally separate from machine seed', () => {
  const flow = lab.createSpec('fluid-vortex');
  const machine = lab.createSpec('magnetic-wheel');

  assert.equal(flow.templateId, 'fluid-vortex');
  assert.ok(flow.modules.includes('fluid'));
  assert.ok(flow.objects.some((object) => object.id === 'fluid-particles'));
  assert.ok(!flow.modules.includes('electromagnetism'));
  assert.ok(machine.modules.includes('electromagnetism'));
});

test('all built-in templates step with finite readouts', () => {
  for (const template of lab.TEMPLATE_LIBRARY) {
    const spec = lab.createSpec(template.id);
    let state = lab.createSimulationState(spec);
    for (let i = 0; i < 120; i += 1) {
      state = lab.stepSimulation(state, spec, 1 / 60);
    }
    const readouts = lab.readoutValues(state, spec);
    assert.equal(Object.keys(readouts).length, template.readouts.length);
    for (const value of Object.values(readouts)) {
      assert.ok(Number.isFinite(Number(value)), `${template.id} readout ${value} should be finite`);
    }
  }
});

test('solar magnetic wheel advances with finite physical state', () => {
  let state = lab.createState();
  for (let i = 0; i < 240; i += 1) {
    state = lab.stepState(state, state.params, 1 / 60);
  }
  const ledger = lab.energyLedger(state);

  assert.ok(Number.isFinite(state.theta));
  assert.ok(Number.isFinite(state.omega));
  assert.ok(Number.isFinite(ledger.rpm));
  assert.ok(ledger.solarInputJ > 0);
  assert.ok(ledger.actuatorWorkJ >= 0);
  assert.ok(ledger.frictionLossJ >= 0);
});

test('zero sun prevents hidden actuator energy injection', () => {
  let state = lab.createState({ irradiance: 0, magneticStrength: 1.2, sliderAmplitude: 1 });
  for (let i = 0; i < 180; i += 1) {
    state = lab.stepState(state, state.params, 1 / 60);
  }
  const ledger = lab.energyLedger(state);

  assert.equal(ledger.solarInputJ, 0);
  assert.equal(ledger.actuatorWorkJ, 0);
  assert.equal(ledger.solarBufferJ, 0);
});

test('load output remains bounded by tracked input and stored motion', () => {
  let state = lab.createState({ irradiance: 900, loadTorque: 0.24 });
  for (let i = 0; i < 360; i += 1) {
    state = lab.stepState(state, state.params, 1 / 60);
  }
  const ledger = lab.energyLedger(state);
  const accountedEnergy =
    ledger.actuatorWorkJ +
    ledger.wheelKineticJ +
    ledger.frictionLossJ +
    ledger.generatorLossJ +
    ledger.solarBufferJ;

  assert.ok(ledger.loadOutputJ <= ledger.solarInputJ + accountedEnergy + 1e-6);
});
