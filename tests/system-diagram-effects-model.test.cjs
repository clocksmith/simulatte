'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../public/simulatte/system-diagram/effects-model.js');

// A straight 100-unit path sampled every 10 units, shaped like overlay path samples.
const line = {length: 100, count: 10, xs: Float64Array.from({length: 11}, (_, i) => i * 10), ys: new Float64Array(11)};
const sampleFor = id => (id === 'e1' ? {d: 'M0 0 L100 0', sample: line} : null);
const palette = {request: [0, 0, 1], message: [1, 0.5, 0], language: [1, 0, 0.5], danger: [1, 0, 0], flow: [0, 1, 0], warn: [1, 1, 0]};

function particles(transit, t, limit = 20) {
  const out = M.particleBuffers(limit), count = M.writeParticles(out, {t, transit, sampleFor, palette});
  return {count, out, at: i => ({x: out.position[i * 3], y: out.position[i * 3 + 1], size: out.size[i], alpha: out.alpha[i], shape: out.shape[i], tint: [...out.tint.subarray(i * 3, i * 3 + 3)]})};
}

test('particles sit where the engine places each message, with trails behind its direction of travel', () => {
  const nearStart = particles([{edgeId: 'e1', t0: 0, t1: 2, kind: 'req', ptype: 'http'}], 1);
  assert.equal(nearStart.count, 5, 'trail points before the start of the path are dropped');
  const request = particles([{edgeId: 'e1', t0: 0, t1: 2, kind: 'req', ptype: 'http'}], 1.5);
  assert.equal(request.at(0).x, 75); assert.equal(request.at(0).y, -0); assert.equal(request.at(0).shape, 0);
  assert.deepEqual(request.at(0).tint, palette.request);
  assert.equal(request.count, 1 + M.TRAIL.steps);
  for (let i = 1; i < request.count; i++) { assert.ok(request.at(i).x < request.at(i - 1).x, 'request trails lie upstream'); assert.ok(request.at(i).alpha < request.at(i - 1).alpha); }
  const response = particles([{edgeId: 'e1', t0: 0, t1: 2, kind: 'res', ptype: 'task'}], 0.5);
  assert.equal(response.at(0).x, 75, 'responses travel back along the path'); assert.equal(response.at(0).shape, 1);
  assert.deepEqual(response.at(0).tint, palette.message);
  assert.ok(response.at(1).x > response.at(0).x, 'response trails lie downstream');
});

test('failed messages use the danger color and missing paths draw nothing', () => {
  const failed = particles([{edgeId: 'e1', t0: 0, t1: 1, kind: 'req', ptype: 'json', ok: false}, {edgeId: 'missing', t0: 0, t1: 1, kind: 'req'}], 0.75);
  assert.deepEqual(failed.at(0).tint, palette.danger);
  assert.equal(failed.count, 1 + M.TRAIL.steps);
});

test('effects are a pure function of simulation time, so a paused run stands still', () => {
  const transit = [{edgeId: 'e1', t0: 0, t1: 3, kind: 'req', ptype: 'event'}, {edgeId: 'e1', t0: 1, t1: 2, kind: 'res', ptype: 'text'}];
  const a = particles(transit, 1.5), b = particles(transit, 1.5), c = particles(transit, 1.6);
  assert.deepEqual([...a.out.position.subarray(0, a.count * 3)], [...b.out.position.subarray(0, b.count * 3)]);
  assert.notDeepEqual([...a.out.position.subarray(0, a.count * 3)], [...c.out.position.subarray(0, c.count * 3)]);
});

test('the particle buffer never exceeds its capacity', () => {
  const transit = Array.from({length: 50}, (_, i) => ({edgeId: 'e1', t0: 0, t1: 10, kind: 'req', ptype: 'http', id: i}));
  const limited = particles(transit, 5, 3);
  assert.equal(limited.count, 3 * (M.TRAIL.steps + 1));
});

test('connection flow skips idle edges and speeds up with the observed message rate', () => {
  const flows = M.edgeFlows({e1: {rate: 0, inTransit: 0}, e2: {rate: 4}}, id => (id === 'e2' ? {d: 'x', sample: line} : null));
  assert.deepEqual(flows.map(f => f.id), ['e2']);
  const [slow] = M.edgeFlows({e1: {rate: 1}}, sampleFor), [fast] = M.edgeFlows({e1: {rate: 100}}, sampleFor), [failing] = M.edgeFlows({e1: {rate: 10, errorRate: 0.5}}, sampleFor);
  assert.ok(fast.speed > slow.speed); assert.ok(fast.halfWidth > slow.halfWidth);
  assert.equal(failing.state, 'error');
  const [faulted] = M.edgeFlows({e1: {rate: 1, faults: ['partition']}}, sampleFor);
  assert.equal(faulted.faulted, true);
});

test('a ribbon wraps the sampled path with two vertices per sample and increasing distance', () => {
  const r = M.ribbon(line, 3);
  assert.equal(r.position.length, 11 * 2 * 3); assert.equal(r.index.length, 10 * 6);
  assert.deepEqual([r.position[1], r.position[4]], [3, -3], 'left and right edges sit half a width either side, with y flipped');
  for (let i = 2; i < r.along.length; i += 2) assert.ok(r.along[i] > r.along[i - 2]);
  assert.equal(r.length, 100); assert.deepEqual([...new Set(r.side)], [-1, 1]);
});

test('failure bursts come from rising error counts and newly active faults, and expire in simulation time', () => {
  assert.deepEqual(M.nodeEvents(null, {a: {errors: 3}}, 1), [], 'the first view has nothing to compare against');
  const events = M.nodeEvents({a: {errors: 1, rejected: 0}, b: {faults: []}, c: {errors: 2}}, {a: {errors: 1, rejected: 2}, b: {faults: ['crash']}, c: {errors: 2}}, 4);
  assert.deepEqual(events, [{id: 'a', kind: 'failure', at: 4}, {id: 'b', kind: 'fault', at: 4}]);
  assert.equal(M.livePulses(events, 4 + M.PULSE.durationSec / 2).length, 2);
  assert.equal(M.livePulses(events, 4 + M.PULSE.durationSec + 0.01).length, 0);
  assert.equal(M.livePulses(events, 3).length, 0, 'restarting earlier drops future bursts');
});

test('queue glow saturates logarithmically and faults always glow', () => {
  const glows = M.nodeGlows({idle: {queue: 0}, short: {queue: 1}, long: {queue: 1000}, down: {queue: 0, health: 'down', faults: []}});
  assert.deepEqual(glows.map(g => g.id), ['down', 'long', 'short']);
  const by = Object.fromEntries(glows.map(g => [g.id, g]));
  assert.ok(by.short.queue > 0 && by.short.queue < by.long.queue); assert.equal(by.long.queue, 1); assert.equal(by.down.faulted, true);
});

test('colors parse from the design tokens the SVG overlay uses', () => {
  assert.deepEqual(M.parseColor('#fff'), [1, 1, 1]);
  assert.deepEqual(M.parseColor(' #2a78d6 ').map(v => Math.round(v * 255)), [42, 120, 214]);
  assert.deepEqual(M.parseColor('rgb(255, 0, 51)').map(v => Math.round(v * 255)), [255, 0, 51]);
  assert.throws(() => M.parseColor('color-mix(in srgb, red, blue)'), /Unsupported effect color/);
  assert.ok(M.luminance([1, 1, 1]) > 0.5 && M.luminance([0.1, 0.1, 0.1]) < 0.5);
});
