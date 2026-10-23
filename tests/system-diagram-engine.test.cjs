const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const library = require('../public/simulatte/system-diagram/class-library.js').loadSync(path.resolve(__dirname, '../public/data/system-diagram'));
const config = require('../public/data/system-diagram/config.json');
const diagram = require('../public/simulatte/system-diagram/diagram.js');
const kernels = require('../public/simulatte/system-diagram/kernels-core.js');
const engine = require('../public/simulatte/system-diagram/engine.js');
const core = require('../public/simulatte/system-diagram/engine-core.js');
const runner = require('../public/simulatte/system-diagram/runner.js');
const worldSpec = require('../public/shared/contracts/world-spec.js');
const deps = { library, config, kernels };
function sample() {
  const doc = diagram.emptyDiagram(config, 'Canonical executable system'); doc.run.horizonSec = 10;
  doc.nodes = [
    { id: 'users', classId: 'web-client', label: 'Users', x: 0, y: 0, params: { pattern: 'constant', ratePerSec: 2, maxRequests: 6, retries: 1, timeoutMs: 200, retryBackoffMs: 10, readFraction: 0 } },
    { id: 'api', classId: 'web-server', label: 'API', x: 200, y: 0, params: { serviceMs: 10, serviceDist: 'constant', concurrency: 2, callTimeoutMs: 100, retries: 0 } },
    { id: 'db', classId: 'database', label: 'DB', x: 400, y: 0, params: { writeMs: 10, serviceDist: 'constant', idempotentWrites: true } }
  ];
  doc.edges = [{ id: 'e1', from: { nodeId: 'users', portId: 'out' }, to: { nodeId: 'api', portId: 'in' }, params: {} }, { id: 'e2', from: { nodeId: 'api', portId: 'calls' }, to: { nodeId: 'db', portId: 'in' }, params: { op: 'write' } }];
  return doc;
}
function run(doc = sample(), until = doc.run.horizonSec, customDeps = deps) { const compiled = diagram.compile(doc, customDeps.library, customDeps.config), state = engine.initialize(compiled, customDeps); engine.advance(compiled, state, until, customDeps); return { compiled, state, view: engine.observe(compiled, state, customDeps) }; }

test('canonical core kernels execute source, service and database with immutable typed topology', () => {
  const { compiled, state, view } = run();
  assert.equal(view.global.offered, 6); assert.equal(view.global.completed, 6); assert.equal(view.global.failed, 0); assert.equal(view.global.effects, 6);
  assert.equal(view.global.attempts, 12); assert.equal(view.global.memoryMiB, 0); assert.ok(view.global.peakMemoryMiB > 0);
  assert.ok(core.attach(compiled, state, deps).reconcile());
  assert.ok(view.requests.every(r => r.status === 'completed' && r.blocker === null));
  assert.ok(Object.values(view.nodes).every(n => n.served > 0 || n.arrivals === 0));
});

test('pure segmented advance and JSON checkpoint clone preserve exact RNG, queued deliveries and effects', () => {
  const doc = sample(); doc.nodes[1].params.serviceDist = 'lognormal'; doc.nodes[1].params.serviceCv = 0.7;
  const a = run(doc), b = run(doc, 0.504), restored = JSON.parse(JSON.stringify(b.state));
  assert.ok(restored.events.length > 0); assert.ok(restored.global.memoryMiB > 0);
  engine.advance(b.compiled, restored, 10, deps); assert.deepEqual(restored, a.state);
  assert.ok(core.attach(b.compiled, restored, deps).reconcile());
});

test('slow faults recompute remaining service work and fence stale completions', () => {
  const doc = sample(); doc.nodes[0].params.maxRequests = 1; doc.nodes[1].params.serviceMs = 1000; doc.nodes[0].params.timeoutMs = 10000;
  doc.faults = [{ id: 'slow', atSec: 0.501, untilSec: 2.001, target: { kind: 'node', id: 'api' }, type: 'slow', params: { factor: 2 } }];
  const { state, view } = run(doc);
  assert.equal(view.global.completed, 1); const api = Object.values(state.jobs).find(j => j.nodeId === 'api');
  const finished = state.history.find(e => e.kind === 'service-finished' && e.jobId === api.id);
  assert.ok(finished.t > 1.001 && finished.t < 2.001, String(finished.t));
  assert.equal(state.history.filter(e => e.kind === 'service-finished' && e.jobId === api.id).length, 1);
});

test('lost acknowledgements retry duplicate work, suppress duplicate commits and preserve late outcomes', () => {
  const doc = sample(); doc.nodes[0].params.maxRequests = 1; doc.nodes[0].params.timeoutMs = 100; doc.nodes[0].params.retries = 2; doc.nodes[1].params.callTimeoutMs = 500;
  doc.faults = [{ id: 'lost', atSec: 0, untilSec: 0.15, target: { kind: 'node', id: 'db' }, type: 'dropReplies', params: {} }];
  const { state, compiled, view } = run(doc);
  assert.ok(view.global.retries > 0); assert.equal(view.global.effects, 1); assert.ok(view.global.duplicateEffects > 0);
  assert.ok(view.global.wastedWork > 0);
  const info = engine.inspect(compiled, state, view.requests[0].id, deps);
  assert.ok(info.history.some(e => e.kind === 'effect-committed'));
  assert.ok(info.history.some(e => e.kind === 'reply-lost'));
  assert.ok(info.attempts.length > 2);
});

test('queue visibility leases redeliver and dead-letter messages without hiding producer completion', () => {
  const doc = sample(); doc.nodes[0].params.maxRequests = 1; doc.nodes[0].params.timeoutMs = 1000;
  doc.nodes.splice(1, 0, { id: 'q', classId: 'task-queue', label: 'Queue', x: 100, y: 0, params: { visibilityTimeoutMs: 50, maxReceives: 3, retryDelayMs: 5, prefetch: 1 } });
  doc.nodes.push({ id: 'dlq', classId: 'dead-letter-queue', label: 'Dead letters', x: 200, y: 200, params: {} });
  doc.edges[0].to.nodeId = 'q'; doc.edges.push({ id: 'work', from: { nodeId: 'q', portId: 'consumers' }, to: { nodeId: 'api', portId: 'in' }, params: {} }, { id: 'dead', from: { nodeId: 'q', portId: 'dlq' }, to: { nodeId: 'dlq', portId: 'in' }, params: {} });
  doc.faults = [{ id: 'lost', atSec: 0, untilSec: null, target: { kind: 'node', id: 'db' }, type: 'dropReplies', params: {} }];
  const { view, state } = run(doc);
  assert.equal(view.global.completed, 1); assert.equal(view.global.effects, 1); assert.ok(view.nodes.q.detail.Deliveries >= 3);
  assert.equal(view.nodes.dlq.detail.Retained, 1); assert.equal(view.requests[0].backgroundPending, 1);
  assert.ok(view.requests[0].retainedMiB > 0); assert.ok(state.history.some(e => e.kind === 'dead-letter'));
  assert.equal(view.nodes.api.heldMiB, 0);
});

test('rejected and unfinished requests remain visible; memory and shared slot resources reconcile', () => {
  const doc = sample(); doc.nodes[0].params.ratePerSec = 100; doc.nodes[0].params.maxRequests = 10; doc.nodes[0].params.retries = 0;
  Object.assign(doc.nodes[1].params, { serviceMs: 500, concurrency: 1, queueCapacity: 0, memoryPerRequestMiB: 1, memoryLimitMiB: 2 });
  const { view, compiled, state } = run(doc, 0.1);
  assert.ok(view.global.failed > 0); assert.ok(view.global.inFlight > 0); assert.equal(view.requests.length, 10);
  assert.ok(view.requests.some(r => r.status === 'rejected')); assert.ok(view.requests.some(r => r.status === 'in-flight'));
  assert.equal(view.global.memoryMiB, Object.values(view.nodes).reduce((sum, n) => sum + n.heldMiB, 0));
  assert.ok(core.attach(compiled, state, deps).reconcile());
});

test('cycles stop at declared hop bound, and zero-time wake loops refuse visibly', () => {
  const doc = sample(); doc.nodes[0].params.maxRequests = 1; doc.nodes[1].params.serviceMs = 0; doc.nodes[1].params.retries = 0;
  doc.nodes[2].classId = 'web-server'; doc.nodes[2].params = { serviceMs: 0, serviceDist: 'constant', retries: 0 };
  doc.edges[1].params = {}; doc.edges.push({ id: 'back', from: { nodeId: 'db', portId: 'calls' }, to: { nodeId: 'api', portId: 'in' }, params: {} });
  const result = run(doc); assert.ok(result.view.global.failed > 0); assert.ok(Object.values(result.state.attempts).some(a => a.err === 'hop-limit'));
  const loopKernel = { station: null, init: () => ({}), start: ctx => ctx.wake(0, {}), onWake: ctx => ctx.wake(0, {}) };
  const small = structuredClone(config); small.engine.maxSameTimeEvents = 10;
  const looping = run(doc, 1, { ...deps, config: small, kernels: { get: () => loopKernel } });
  assert.match(looping.view.error, /Zero-time event bound/); assert.ok(looping.state.events.length > 0);
});

test('independent node RNG streams and layout-independent compilation preserve simulation output', () => {
  const doc = sample(), a = run(doc); doc.nodes.forEach(n => { n.x += 1000; n.y += 1000; }); doc.view.zoom = 2;
  const b = run(doc); assert.deepEqual(a.state, b.state);
  const broken = { ...deps, kernels: { get: () => { throw Error('Kernel unavailable'); } } };
  assert.throws(() => run(doc, 1, broken), /Kernel unavailable/);
});

test('coordinator runner verifies exact preview, records live controls, restores and replays program-bound state', async () => {
  const doc = sample(), a = await runner.create({ diagram: doc, ...deps });
  worldSpec.validateWorldSpec(a.program()); a.advanceTo(0.5);
  a.inject({ kind: 'fault', target: { kind: 'node', id: 'db' }, type: 'slow', params: { factor: 3 } });
  a.advanceTo(0.75); const checkpoint = await a.checkpoint(); a.advanceTo(5); const uninterrupted = a.view();
  await a.restore(JSON.parse(JSON.stringify(checkpoint))); a.advanceTo(5);
  assert.deepEqual(a.view(), uninterrupted); assert.equal((await a.verify()).status, 'match');
  assert.equal(a.controls().length, 1); const replay = a.exportReplay(); const result = await runner.replay(replay, deps);
  assert.equal(result.status, 'match'); assert.equal(result.metricsHash, replay.metricsHash);
  const forged = structuredClone(checkpoint); forged.display.nodes.db.rng++;
  await assert.rejects(a.restore(forged), /causal state/); assert.deepEqual(a.view(), uninterrupted);
  await a.dispose();
});

test('repeated verification and a new live control at the restored timestamp preserve coordinator round boundaries', async () => {
  const run = await runner.create({ diagram: sample(), ...deps }); run.advanceTo(1.25); const cp = await run.checkpoint();
  run.advanceTo(2.25); await run.restore(cp);
  assert.equal((await run.verify()).status, 'match'); assert.equal((await run.verify()).status, 'match');
  run.inject({ kind: 'fault', target: { kind: 'node', id: 'db' }, type: 'slow', params: { factor: 2 } });
  assert.equal((await run.verify()).status, 'match');
  run.inject({ kind: 'repair', target: { kind: 'node', id: 'db' } });
  assert.equal((await run.verify()).status, 'match');
  await run.dispose();
});

test('edge call multiplicity and optional probability change actual work and effects', () => {
  const doc = sample(); doc.nodes[0].params.maxRequests = 1; doc.nodes[2].params.idempotentWrites = false; doc.edges[1].params.callsPerRequest = 3;
  const repeated = run(doc); assert.equal(repeated.view.global.effects, 3); assert.equal(repeated.view.global.attempts, 4);
  doc.edges[1].params.probability = 0; const skipped = run(doc);
  assert.equal(skipped.view.global.effects, 0); assert.equal(skipped.view.global.attempts, 1); assert.equal(skipped.view.global.completed, 1);
  doc.nodes[0].params.ratePerSec = 0; assert.equal(run(doc).view.global.offered, 0);
});

test('full causal history remains inspectable beyond the capped notable-event log', () => {
  const doc = sample(); doc.nodes[0].params.maxRequests = 20; doc.nodes[0].params.ratePerSec = 10;
  const { compiled, state, view } = run(doc);
  assert.equal(view.log.length, config.engine.logCapacity); assert.ok(state.history.length > view.log.length);
  const info = engine.inspect(compiled, state, view.requests[0].id, deps);
  assert.ok(info.history.some(e => e.kind === 'request-arrived'));
  assert.ok(info.history.some(e => e.kind === 'request-completed'));
  assert.ok(!view.log.some(e => e.id === info.history[0].id));
});
