const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = '../public/simulatte/system-diagram/';
const library = require(root + 'class-library.js').loadSync(path.resolve(__dirname, '../public/data/system-diagram'));
const documentApi = require(root + 'diagram.js'), engine = require(root + 'engine.js'), runner = require(root + 'runner.js');
const observability = require(root + 'engine-observability.js'), kernels = require(root + 'kernels-all.js');
const config = require('../public/data/system-diagram/config.json'), deps = { library, config, kernels };
function sample() {
  const doc = documentApi.emptyDiagram(config); doc.run.horizonSec = 8;
  doc.nodes = [{ id: 'client', classId: 'web-client', label: 'Client', x: 0, y: 0, params: { pattern: 'constant', maxRequests: 4, ratePerSec: 2, readFraction: 0, retries: 2, timeoutMs: 100 } },
    { id: 'worker', classId: 'worker', label: 'Worker', x: 200, y: 0, params: { serviceMs: 10, serviceDist: 'constant', callTimeoutMs: 100 } },
    { id: 'db', classId: 'idempotent-store', label: 'Database', x: 400, y: 0, params: { writeMs: 10, serviceDist: 'constant' } }];
  doc.edges = [{ id: 'a', from: { nodeId: 'client', portId: 'out' }, to: { nodeId: 'worker', portId: 'in' }, params: {} }, { id: 'b', from: { nodeId: 'worker', portId: 'calls' }, to: { nodeId: 'db', portId: 'in' }, params: { op: 'write' } }]; return doc;
}
function run(doc, until = 8) { const compiled = documentApi.compile(doc, library, config), state = engine.initialize(compiled, deps); engine.advance(compiled, state, until, deps); return { compiled, state, view: engine.observe(compiled, state, deps) }; }

test('request, attempt and committed effect records survive beyond the notable log ring', () => {
  const doc = sample(); doc.nodes[0].params.maxRequests = 25; doc.nodes[0].params.ratePerSec = 10;
  const result = run(doc), info = engine.inspect(result.compiled, result.state, result.view.requests[0].id, deps);
  assert.equal(result.view.requests.length, 25); assert.equal(result.view.effects.length, 25); assert.ok(result.view.attempts.length >= 50);
  assert.equal(info.request.status, 'completed'); assert.ok(info.history.some(e => e.kind === 'request-arrived')); assert.ok(info.history.some(e => e.kind === 'effect-committed'));
  assert.ok(info.history.some(e => e.kind === 'request-completed')); assert.ok(info.attempts.length >= 2); assert.equal(info.effects.length, 1);
  assert.ok(result.state.observability.sequence > result.view.log.length);
});

test('memory admission rejects visibly and the ledger reconciles every active allocation', () => {
  const doc = sample(); Object.assign(doc.nodes[0].params, { maxRequests: 10, ratePerSec: 100, retries: 0 });
  Object.assign(doc.nodes[1].params, { serviceMs: 1000, memoryPerRequestMiB: 1, memoryLimitMiB: 1.01, concurrency: 1 });
  const result = run(doc, 0.05);
  assert.ok(result.view.requests.some(r => r.status === 'rejected')); assert.ok(result.view.requests.some(r => r.status === 'in-flight'));
  assert.equal(result.view.global.memoryMiB, Object.values(result.view.nodes).reduce((sum, n) => sum + n.heldMiB, 0));
  assert.ok(result.view.global.peakMemoryMiB >= result.view.global.memoryMiB); assert.ok(observability.reconcile(result.state));
});

test('durable queue and dead-letter payloads retain accounted memory after producer acknowledgement', () => {
  const doc = sample(); doc.nodes[0].params.maxRequests = 1;
  doc.nodes.push({ id: 'q', classId: 'task-queue', label: 'Queue', x: 100, y: 100, params: { visibilityTimeoutMs: 20, maxReceives: 2 } }, { id: 'dlq', classId: 'dead-letter-queue', label: 'Dead letters', x: 100, y: 200, params: {} });
  doc.edges[0].to.nodeId = 'q'; doc.edges.push({ id: 'work', from: { nodeId: 'q', portId: 'consumers' }, to: { nodeId: 'worker', portId: 'in' }, params: {} }, { id: 'dead', from: { nodeId: 'q', portId: 'dlq' }, to: { nodeId: 'dlq', portId: 'in' }, params: {} });
  doc.faults = [{ id: 'store-down', atSec: 0.015, untilSec: 2, target: { kind: 'node', id: 'db' }, type: 'dropReplies', params: {} }];
  const result = run(doc), row = result.view.requests[0], info = engine.inspect(result.compiled, result.state, row.id, deps);
  assert.equal(row.status, 'completed'); assert.ok(row.backgroundPending > 0); assert.ok(row.retainedMiB > 0); assert.ok(result.view.nodes.dlq.heldMiB > 0);
  assert.ok(result.view.nodes.q.detail.redeliveries > 0); assert.equal(result.view.effects.length, 1);
  assert.ok(info.history.some(e => e.kind === 'reply-lost')); assert.ok(info.history.some(e => e.kind === 'effect-suppressed')); assert.ok(info.history.some(e => e.kind === 'dead-letter-retained'));
  assert.ok(info.blockers.every(b => b.nodeId)); assert.ok(observability.reconcile(result.state));
});

test('coordinator preview and strict checkpoint restoration reproduce full state and repeated same-time controls', async () => {
  const run = await runner.create({ diagram: sample(), ...deps, profileId: 'system-diagram-v1' });
  assert.equal((await run.verify()).status, 'match'); run.advanceTo(0.65); const cp = await run.checkpoint(); run.advanceTo(2); const final = run.view();
  await run.restore(JSON.parse(JSON.stringify(cp))); run.advanceTo(2); assert.deepEqual(run.view(), final);
  await run.restore(cp); assert.equal((await run.verify()).status, 'match'); assert.equal((await run.verify()).status, 'match');
  run.inject({ kind: 'fault', target: { kind: 'node', id: 'db' }, type: 'slow', params: { factor: 2 } }); assert.equal((await run.verify()).status, 'match');
  run.inject({ kind: 'repair', target: { kind: 'node', id: 'db' } }); assert.equal((await run.verify()).status, 'match');
  const before = run.view(), forged = structuredClone(cp); forged.display.observability.sequence++;
  await assert.rejects(run.restore(forged), /exact seeded causal state/); assert.deepEqual(run.view(), before);
  const info = run.inspect(run.view().requests[0].id); assert.ok(info.history.length > 0); await run.dispose();
});
