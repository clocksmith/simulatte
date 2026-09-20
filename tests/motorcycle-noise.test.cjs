const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const base = '../public/simulatte/motorcycle-noise/';
const scene = require(base + 'scene.js'), signal = require(base + 'signal.js'), propagation = require(base + 'propagation.js');
const control = require(base + 'control.js'), sensing = require(base + 'sensing.js'), simulation = require(base + 'simulation.js');
const records = require(base + 'records.js'), defaults = require(base + 'scenario.json');
const world = require('../public/shared/contracts/world-spec.js');
const params = edits => ({ ...structuredClone(defaults), ...edits });
const close = (a, b, tolerance = 1e-8) => assert.ok(Math.abs(a - b) <= tolerance, `${a} differs from ${b}`);

test('firing-event rate and crank timing distinguish four-stroke engine rhythms', () => {
  assert.equal(scene.firingRate(6000, 2), 100); assert.equal(scene.firingRate(6000, 4), 200);
  assert.notDeepEqual(scene.FIRING['twin-270'], scene.FIRING['twin-360']);
  const p = params(), sources = scene.sources(p);
  assert.notEqual(sources[0].phase, sources[1].phase);
  const wave = propagation.emissions(sources[0], p);
  close(signal.level(signal.energy(wave)), p.referenceDbZ);
  assert.notDeepEqual(wave.slice(0, 30), propagation.emissions(sources[1], p).slice(0, 30));
});

test('free-field pressure halves with distance; independent energies add 3.0103 dB', () => {
  const p = params({ reflectionOrder: 0, groundReflection: 0, airLoss: 0 });
  const source = { x: 0, y: 0, z: 1, speed: 0, acceleration: 0 }, path = propagation.definitions(p)[0];
  const a = propagation.pathAt(source, [10, 0, 1], 1, path, p, 'none'), b = propagation.pathAt(source, [20, 0, 1], 1, path, p, 'none');
  close(20 * Math.log10(a.gain / b.gain), 6.020599913279624);
  close(signal.combineLevels([80, 80]), 83.01029995663981);
  const s1 = Float64Array.from({ length: 8000 }, (_, i) => Math.sin(2 * Math.PI * 100 * i / 8000));
  const s2 = Float64Array.from({ length: 8000 }, (_, i) => Math.sin(2 * Math.PI * 200 * i / 8000));
  close(signal.level(signal.energy(Float64Array.from(s1, (v, i) => v + s2[i]))) - signal.level(signal.energy(s1)), 3.010299956639812);
});

test('an impulse cannot arrive before acoustic travel time', () => {
  const p = params({ reflectionOrder: 0, groundReflection: 0, airLoss: 0 });
  const impulse = new Float64Array(800); impulse[0] = 1;
  const source = { x: 0, y: 0, z: 1, speed: 0, acceleration: 0 };
  const received = propagation.receive([source], [impulse], [10, 0, 1], p);
  const first = received.findIndex(value => value !== 0);
  assert.ok(first / p.sampleRate >= 10 / p.soundSpeed);
  assert.ok(first / p.sampleRate < 10 / p.soundSpeed + 2 / p.sampleRate);
});

test('ground and parallel-wall image geometry match analytical path distances', () => {
  const p = params(), paths = propagation.definitions(p), source = { x: 0, y: 0, z: 1, speed: 0, acceleration: 0 };
  const ground = propagation.pathAt(source, [10, 0, 1], 1, paths.find(row => row.id === 'ground'), p, 'none');
  close(ground.distance, Math.sqrt(104));
  const wall = propagation.pathAt(source, [10, 0, 1], 1, paths.find(row => row.id === 'wall-1-1'), p, 'none');
  close(wall.distance, 26);
  assert.equal(propagation.barrierDetour([0, 0, 1], [0, 8, 3], 0.5), null);
  assert.ok(propagation.barrierDetour([0, 0, 1], [0, 8, 1], 2.5) > 8);
});

test('signed pressure interference follows phase error, with off-target amplification', () => {
  const n = 8000, frequency = 100, wave = Float64Array.from({ length: n }, (_, i) => Math.sin(2 * Math.PI * frequency * i / n));
  const inverse = Float64Array.from(wave, value => -value);
  close(signal.energy(Float64Array.from(wave, (v, i) => v + inverse[i])), 0);
  for (const phase of [Math.PI / 3, Math.PI / 2, Math.PI]) {
    const residual = Float64Array.from(wave, (v, i) => v - Math.sin(2 * Math.PI * frequency * i / n + phase));
    close(signal.energy(residual) / signal.energy(wave), 2 - 2 * Math.cos(phase));
  }
});

test('causal control cannot observe future reference or error microphone samples', () => {
  const p = params({ sensorNoisePa: 0, latencyMs: 1 });
  const a = Float64Array.from({ length: 1024 }, (_, i) => Math.sin(i * .1)), b = a.slice();
  b.fill(30, 512);
  const path = [{ delay: 5.2, gain: .5 }];
  const first = control.causal(a, a, path, p), second = control.causal(b, b, path, p);
  assert.deepEqual(first.command.slice(0, 512), second.command.slice(0, 512));
  assert.deepEqual(first.residual.slice(0, 512), second.residual.slice(0, 512));
  assert.equal(first.futureSamples, false);
  assert.ok(first.command.every(v => Math.abs(v) <= p.speakerLimitPa));
  assert.equal(control.ideal(a, path, p).futureSamples, true);
});

test('A-weighting and Fast time weighting measure a known 1 kHz pressure', () => {
  close(signal.aWeight(1000), 1, .002);
  const sr = 8000, wave = Float64Array.from({ length: sr }, (_, i) => Math.SQRT2 * signal.P0 * 1e4 * Math.sin(2 * Math.PI * 1000 * i / sr));
  const m = signal.measure(wave, sr);
  close(m.laeq, 80, .03); close(m.lafmax, 80, .04); close(m.duration, 1);
});

test('path refinement converges for moving sources and frame rate is absent from execution', () => {
  const p = params({ duration: 1, count: 1, acceleration: .5 }), sources = scene.sources(p), waves = sources.map(s => propagation.emissions(s, p));
  const results = [128, 64, 32, 16].map(step => propagation.receive(sources, waves, p.receiver, { ...p, pathStepSamples: step }));
  const error = (a, b) => Math.sqrt(signal.energy(Float64Array.from(a, (v, i) => v - b[i])));
  assert.ok(error(results[2], results[3]) < error(results[0], results[1]));
  assert.ok(error(results[2], results[3]) / Math.sqrt(signal.energy(results[3])) < .005);
  assert.doesNotMatch(fs.readFileSync(require.resolve(base + 'simulation.js'), 'utf8'), /requestAnimationFrame|Date\.now|performance\.now/);
});

test('silent or indistinguishable sensor observations abstain', () => {
  const positions = sensing.microphones(), silence = positions.map(() => new Float64Array(256));
  assert.equal(sensing.localize(silence, positions, 8000, 343).status, 'unresolved');
  const location = { point: [0, 0, .7] }, tracks = ['a', 'b'].map(id => ({ id, position: [0, 0, .7], velocity: [0, 0, 0] }));
  assert.equal(sensing.associate(location, tracks, positions[0], 343).status, 'unresolved');
  const delay = Math.hypot(...positions[0].map((v, i) => v - location.point[i])) / 343;
  const track = { id: 'moving', position: [10 * delay, 0, .7], velocity: [10, 0, 0] };
  assert.equal(sensing.associate(location, [track], positions[0], 343).trackId, 'moving');
});

test('plate recognition reads pixels and abstains when information is lost', () => {
  const truth = '519206', original = sensing.plateImage(truth);
  const good = sensing.degradePlate(original, params({ plateNoise: 0 }));
  assert.equal(sensing.readPlate(good).text, truth);
  const unreadable = sensing.degradePlate(original, params({ platePixels: 12, plateBlur: 4 }));
  assert.equal(sensing.readPlate(unreadable).text, null);
  assert.equal(sensing.readPlate({ width: 96, height: 28, pixels: new Float64Array(96 * 28).fill(.5) }).status, 'unreadable');
});

test('WorldSpec round trip replays exact results and rejects hidden or oversized controls', async () => {
  const spec = scene.create(params({ count: 1, duration: 1, gridColumns: 5, gridRows: 3, mitigation: 'none' }));
  const first = simulation.run(spec), replay = simulation.run(scene.validate(world.parseWorldSpec(world.serializeWorldSpec(spec))));
  assert.deepEqual(first.record, replay.record); assert.deepEqual(first.baseline, replay.baseline);
  close(first.record.attenuation, 0);
  assert.throws(() => scene.create(params({ disableEngine: true })), /fields/);
  assert.throws(() => scene.create(params({ count: 100 })), /count/);
  assert.throws(() => scene.create(params({ sampleRate: 10000 })), /solver/);
  const signed = await records.sign(spec, first.record);
  assert.equal((await records.verify(signed)).spec.contentHash, spec.contentHash);
  signed.payload.record.result.laeq += 1;
  await assert.rejects(records.verify(signed), /digest mismatch/);
});

test('GCC-PHAT locates a resolvable source from delayed observations alone', () => {
  const rng = signal.random(37), wave = Float64Array.from({ length: 2048 }, () => rng() * 2 - 1);
  const truth = [2, 0, .7], positions = sensing.microphones();
  const observations = positions.map(p => {
    const delay = Math.hypot(...p.map((v, i) => v - truth[i])) * 8000 / 343;
    return Float64Array.from(wave, (_, i) => signal.sample(wave, i - delay));
  });
  const estimate = sensing.localize(observations, positions, 8000, 343);
  assert.equal(estimate.status, 'located'); assert.deepEqual(estimate.point, truth);
});

test('scenario edits retain provenance and imported programs replay without resetting authorship', () => {
  const initial = scene.create(params());
  const edited = scene.edit(initial, params({ seed: 42, count: 4, mitigation: 'active' }));
  assert.equal(edited.authorship.revision, 1); assert.ok(edited.authorship.patches.length > 0);
  assert.equal(edited.determinism.seed, 42); assert.equal(edited.objects.length, 4);
  const imported = scene.validate(world.parseWorldSpec(world.serializeWorldSpec(edited)));
  assert.equal(world.canonicalJson(scene.edit(imported, imported.params)), world.canonicalJson(edited));
  assert.equal(scene.edit(edited, { ...edited.params, rpm: 3000 }).authorship.revision, 2);
});
