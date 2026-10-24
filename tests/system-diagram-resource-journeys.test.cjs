const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const base = '../public/simulatte/system-diagram/';
const library = require(base + 'class-library.js').loadSync(path.resolve(__dirname, '../public/data/system-diagram'));
const documentApi = require(base + 'diagram.js'), engine = require(base + 'engine.js'), core = require(base + 'engine-core.js');
const observability = require(base + 'engine-observability.js');
const config = require('../public/data/system-diagram/config.json');
const kernels = require(base + 'kernels-core.js');
const deps = { library, config, kernels };
function diagram() {
  const doc = documentApi.emptyDiagram(config); doc.seed = 42; doc.run.horizonSec = 15;
  doc.nodes = [{ id: 'source', classId: 'burst-producer', label: 'Source', x: 0, y: 0, params: { burstCount: 1, burstAtSec: 0, burstSpacingMs: 0, requestKb: 125, retries: 0, timeoutMs: 10000, readFraction: 0 } },
    { id: 'worker', classId: 'worker', label: 'Worker', x: 200, y: 0, params: { serviceMs: 0, serviceDist: 'constant', responseKb: 0, memoryPerRequestMiB: 0 } }];
  doc.edges = [{ id: 'link', from: { nodeId: 'source', portId: 'out' }, to: { nodeId: 'worker', portId: 'in' }, params: { bandwidthMbps: 1, latencyMs: 0 } }]; return doc;
}
function start(doc) { const compiled = documentApi.compile(doc, library, config); return { compiled, state: engine.initialize(compiled, deps) }; }
function advance(run, t) { engine.advance(run.compiled, run.state, t, deps); return engine.observe(run.compiled, run.state, deps); }
function completed(view) { return view.requests.map(r => r.completedAt).sort((a, b) => a - b); }
function close(actual, expected) { assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`); }

test('FIFO and fair bandwidth sharing consume the same finite link capacity with independently expected completion times', () => {
  const doc = diagram(); doc.nodes[0].params.burstCount = 2;
  const fifo = start(doc); const a = advance(fifo, 3); close(completed(a)[0], 1); close(completed(a)[1], 2);
  doc.edges[0].params.bandwidthSharing = 'fair'; const fair = start(doc); const b = advance(fair, 3);
  b.requests.forEach(r => close(r.completedAt, 2)); assert.equal(b.global.completed, 2);
  assert.ok(core.networkReconcile(fair.state)); close(fair.state.network.offeredKbit, fair.state.network.deliveredKbit);
});

test('live bandwidth and latency edits integrate remaining transfer work and fence old completion estimates', () => {
  const doc = diagram(), run = start(doc); advance(run, 0.5);
  engine.applyControl(run.compiled, run.state, { kind: 'setParams', target: { kind: 'edge', id: 'link' }, params: { bandwidthMbps: 2 } }, deps);
  const fast = advance(run, 2); close(fast.requests[0].completedAt, 0.75); assert.equal(fast.nodes.worker.arrivals, 1);
  doc.edges[0].params.latencyMs = 1000; const delayed = start(doc); advance(delayed, 1.25);
  engine.applyControl(delayed.compiled, delayed.state, { kind: 'setParams', target: { kind: 'edge', id: 'link' }, params: { latencyMs: 2000 } }, deps);
  const done = advance(delayed, 6); close(done.requests[0].completedAt, 4.75); assert.equal(done.nodes.worker.arrivals, 1);
});

test('shared half-duplex request/reply traffic contends for the same physical link budget', () => {
  const doc = diagram(); Object.assign(doc.nodes[0].params, { burstCount: 2, burstSpacingMs: 750 }); doc.nodes[1].params.responseKb = 125;
  const full = start(doc); const a = advance(full, 5); assert.deepEqual(completed(a), [2, 3]);
  doc.edges[0].params.duplex = 'shared'; const shared = start(doc); const b = advance(shared, 5); assert.deepEqual(completed(b), [3, 4]);
});

test('partitions drop in-progress transfers, and loss changes before completion affect actual outcomes', () => {
  const doc = diagram(); doc.nodes[0].params.timeoutMs = 2000;
  const run = start(doc); advance(run, 0.5); engine.applyControl(run.compiled, run.state, { kind: 'fault', target: { kind: 'edge', id: 'link' }, type: 'partition', params: {} }, deps);
  const a = advance(run, 3); assert.equal(a.nodes.worker.arrivals, 0); assert.equal(a.requests[0].status, 'timed-out'); assert.ok(core.networkReconcile(run.state)); close(run.state.network.droppedKbit, 1000);
  const loss = start(doc); advance(loss, 0.5); engine.applyControl(loss.compiled, loss.state, { kind: 'setParams', target: { kind: 'edge', id: 'link' }, params: { lossRate: 1 } }, deps);
  assert.equal(advance(loss, 3).nodes.worker.arrivals, 0); assert.ok(core.networkReconcile(loss.state));
});

test('memory pressure slows actual station work and stale estimates cannot complete it early', () => {
  const doc = diagram(); Object.assign(doc.nodes[0].params, { burstCount: 2, requestKb: 0 }); Object.assign(doc.nodes[1].params, { concurrency: 2, serviceMs: 1000, memoryPerRequestMiB: 1, memoryLimitMiB: 4, memoryPressureThreshold: 0.25, memoryThrashFactor: 5 });
  const run = start(doc), during = advance(run, 1.1); assert.equal(during.global.completed, 0); close(during.nodes.worker.detail['Memory slowdown'], 7 / 3);
  const done = advance(run, 3); done.requests.forEach(r => close(r.completedAt, 7 / 3)); assert.ok(observability.reconcile(run.state)); close(done.global.memoryMiB, 0);
});

test('GC pauses remaining work, reclaims only recorded garbage, and preserves bounded memory ownership', () => {
  const doc = diagram(); Object.assign(doc.nodes[0].params, { burstCount: 2, burstSpacingMs: 200, requestKb: 0 });
  Object.assign(doc.nodes[1].params, { concurrency: 1, serviceMs: 100, memoryPerRequestMiB: 1, memoryLimitMiB: 2, memoryPressureThreshold: 0.4, memoryGarbageFraction: 1, memoryGcPauseMs: 500, memoryGcCooldownMs: 1000 });
  const run = start(doc), paused = advance(run, 0.3); assert.equal(paused.nodes.worker.detail['GC paused'], true); assert.equal(paused.global.completed, 1);
  const done = advance(run, 2); close(done.requests[1].completedAt, 0.7); close(done.global.memoryMiB, 0); assert.ok(done.nodes.worker.detail['GC cycles'] >= 2);
  assert.ok(observability.reconcile(run.state)); const history = engine.inspect(run.compiled, run.state, done.requests[1].id, deps).history;
  assert.ok(history.some(e => e.kind === 'service-finished'));
});

test('OOM crash policy fails owned work, frees resources and recovers only on its declared timer', () => {
  const doc = diagram(); Object.assign(doc.nodes[0].params, { burstCount: 3, burstSpacingMs: 10, requestKb: 0 });
  Object.assign(doc.nodes[1].params, { concurrency: 1, serviceMs: 1000, memoryPerRequestMiB: 1, memoryLimitMiB: 1.5, memoryOomPolicy: 'crash', memoryOomRecoveryMs: 100 });
  const run = start(doc), crashed = advance(run, 0.05); assert.equal(crashed.nodes.worker.health, 'down'); assert.ok(crashed.requests.some(r => r.status === 'rejected')); assert.ok(crashed.requests.some(r => r.err === 'down')); close(crashed.global.memoryMiB, 0);
  const repaired = advance(run, 0.2); assert.equal(repaired.nodes.worker.health, 'ok'); assert.ok(repaired.nodes.worker.detail['OOM admissions'] > 0); assert.ok(observability.reconcile(run.state));
});

test('resource checkpoints preserve transfers, pressure, RNG, generations and exact continuation', () => {
  const doc = diagram(); Object.assign(doc.nodes[0].params, { burstCount: 2 }); doc.edges[0].params.bandwidthSharing = 'fair';
  const uninterrupted = start(doc); advance(uninterrupted, 4); const split = start(doc); advance(split, 0.3); const restored = { compiled: split.compiled, state: JSON.parse(JSON.stringify(split.state)) };
  advance(restored, 4); assert.deepEqual(restored.state, uninterrupted.state); assert.ok(core.networkReconcile(restored.state)); assert.ok(observability.reconcile(restored.state));
});

test('retry policies leave open-loop arrival and payload demand identical for the same seed', () => {
  const doc = diagram(); doc.nodes[0].classId = 'web-client'; doc.nodes[0].params = { pattern: 'poisson', maxRequests: 10, ratePerSec: 10, retries: 0, timeoutMs: 10, tokensMean: 50, keySpace: 10 };
  doc.faults = [{ id: 'offline', atSec: 0, untilSec: null, target: { kind: 'node', id: 'worker' }, type: 'crash', params: {} }];
  const a = start(doc); advance(a, 5); doc.nodes[0].params.retries = 3; const b = start(doc); advance(b, 5);
  const demand = s => s.observability.jobHistory.trim().split('\n').filter(Boolean).map(line => JSON.parse(line)).filter(j => j.nodeId === 'source').map(j => ({ born: j.born, key: j.msg.key, tokens: j.msg.tokens, op: j.msg.op, kb: j.msg.kb })).sort((x, y) => x.born - y.born);
  assert.deepEqual(demand(a.state), demand(b.state));
});

test('a modeled local commit with a failed acknowledgement stays explicitly unknown to its caller', () => {
  const doc = diagram(); doc.nodes[0].params.timeoutMs = 100; doc.nodes[1].classId = 'idempotent-store'; doc.nodes[1].params = { writeMs: 10, serviceDist: 'constant' };
  doc.faults = [{ id: 'lost-ack', atSec: 0, untilSec: null, target: { kind: 'node', id: 'worker' }, type: 'dropReplies', params: {} }];
  const run = start(doc), view = advance(run, 2); assert.equal(view.global.unknownEffects, 1); assert.equal(view.effects[0].acknowledgement, 'unknown');
  const info = engine.inspect(run.compiled, run.state, view.requests[0].id, deps);
  assert.ok(info.history.some(e => e.kind === 'effect-committed')); assert.ok(info.history.some(e => e.kind === 'reply-lost')); assert.equal(info.request.status, 'timed-out');
  assert.match(info.effects[0].claim, /does not prove production durability/);
});

test('generic pending records own real memory and remain inspectable after ingestion completes and through checkpoint continuation', () => {
  const doc = diagram(); const service = kernels.get('service');
  const retained = { ...service, onServed(ctx, job) { assert.equal(ctx.retain('pending-event', job.msg, { kind: 'waiting-for-pair', detail: 'Counterpart has not arrived' }), true); ctx.reply(job, { ok: true }); }, onControl(ctx, control) { if (control.kind !== 'redrive') return false; return ctx.releaseRetained('pending-event'); } };
  const custom = { ...deps, kernels: { has: id => kernels.has(id), get: id => id === 'service' ? retained : kernels.get(id) } }, compiled = documentApi.compile(doc, library, config), state = engine.initialize(compiled, custom);
  engine.advance(compiled, state, 2, custom); const view = engine.observe(compiled, state, custom);
  assert.equal(view.requests[0].status, 'completed'); assert.equal(view.requests[0].backgroundPending, 1); close(view.global.memoryMiB, 125 / 1024); assert.ok(observability.reconcile(state));
  const info = engine.inspect(compiled, state, view.requests[0].id, custom); assert.equal(info.blocker.kind, 'waiting-for-pair'); assert.equal(info.blocker.nodeId, 'worker');
  const restored = JSON.parse(JSON.stringify(state)), control = { kind: 'redrive', target: { kind: 'node', id: 'worker' } };
  engine.applyControl(compiled, state, control, custom); engine.applyControl(compiled, restored, control, custom); assert.deepEqual(restored, state); close(engine.observe(compiled, state, custom).global.memoryMiB, 0);
});

test('a successful idempotent retry confirms the original effect while preserving its lost acknowledgement history', () => {
  const doc = diagram(); Object.assign(doc.nodes[0].params, { requestKb: 0, timeoutMs: 100, retries: 1, retryBackoffMs: 10, retryJitter: false });
  doc.nodes[1].classId = 'idempotent-store'; doc.nodes[1].params = { writeMs: 10, serviceDist: 'constant' };
  doc.faults = [{ id: 'lost-first-ack', atSec: 0, untilSec: 0.05, target: { kind: 'node', id: 'worker' }, type: 'dropReplies', params: {} }];
  const run = start(doc); const before = advance(run, 0.105); assert.equal(before.global.unknownEffects, 1);
  const restored = { compiled: run.compiled, state: JSON.parse(JSON.stringify(run.state)) };
  const done = advance(run, 1); advance(restored, 1); assert.deepEqual(restored.state, run.state);
  assert.equal(done.effects.length, 1); assert.equal(done.global.unknownEffects, 0); assert.equal(done.effects[0].acknowledgement, 'received');
  const info = engine.inspect(run.compiled, run.state, done.requests[0].id, deps), effect = info.effects[0];
  assert.equal(info.attempts.find(a => a.id === effect.attemptId).status, 'failed');
  assert.equal(effect.confirmationEvidence.kind, 'idempotent-retry');
  assert.equal(info.attempts.find(a => a.id === effect.confirmationEvidence.attemptId).status, 'completed');
  assert.ok(info.history.some(e => e.kind === 'reply-lost')); assert.ok(info.history.some(e => e.id === effect.confirmationEvidence.eventId && e.kind === 'effect-suppressed'));
  doc.faults[0].untilSec = null; const unacknowledged = start(doc), lost = advance(unacknowledged, 1);
  assert.equal(lost.effects.length, 1); assert.equal(lost.global.unknownEffects, 1); assert.equal(lost.effects[0].confirmationEvidence, null);
  assert.ok(engine.inspect(unacknowledged.compiled, unacknowledged.state, lost.requests[0].id, deps).history.some(e => e.kind === 'effect-suppressed'));
});

test('acknowledged ingestion can independently miss its retained background deadline', () => {
  const doc = diagram(); Object.assign(doc.nodes[0].params, { requestKb: 0, deadlineMs: 100 });
  const service = kernels.get('service'), custom = { ...deps, kernels: { has: id => kernels.has(id), get: id => id === 'service' ? { ...service, onServed(ctx, job) { ctx.retain('pending', job.msg, { kind: 'waiting-for-pair', detail: 'Unfinished background reconciliation' }); ctx.reply(job, { ok: true }); } } : kernels.get(id) } };
  const compiled = documentApi.compile(doc, library, config), state = engine.initialize(compiled, custom);
  engine.advance(compiled, state, 0.05, custom); assert.equal(observability.view(state).backgroundDeadlineMisses, 0);
  engine.advance(compiled, state, 0.2, custom); const view = observability.view(state), r = view.requests[0];
  assert.equal(r.status, 'completed'); assert.equal(r.deadlineMissed, false); assert.equal(r.backgroundDeadlineMissed, true); assert.equal(view.backgroundDeadlineMisses, 1);
  assert.equal(engine.inspect(compiled, state, r.id, custom).request.backgroundDeadlineMissed, true);
  const restored = JSON.parse(JSON.stringify(state)); assert.deepEqual(observability.view(restored), view);
});
