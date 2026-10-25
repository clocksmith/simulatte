const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const base = '../public/simulatte/system-diagram/';
const library = require(base + 'class-library.js').loadSync(path.resolve(__dirname, '../public/data/system-diagram'));
const D = require(base + 'diagram.js'), E = require(base + 'engine.js'), O = require(base + 'engine-observability.js'), core = require(base + 'engine-core.js');
const kernels = require(base + 'kernels-all.js'); require(base + 'kernels-replication.js');
const config = require('../public/data/system-diagram/config.json'), deps = { library, config, kernels }, clone = x => JSON.parse(JSON.stringify(x));
function fixture() {
  const d = D.emptyDiagram(config); d.seed = 42; d.run.horizonSec = 2;
  d.nodes = [
    { id: 'client', classId: 'burst-producer', label: 'Client', x: 0, y: 0, params: { burstCount: 1, burstAtSec: 0, requestKb: 0, readFraction: 0, retries: 0, timeoutMs: 1000 } },
    { id: 'leader', classId: 'database-leader', label: 'Leader', x: 200, y: 0, params: { writeQuorum: 2, timeoutMs: 100, retryIntervalMs: 200, maxAttempts: 2 } },
    { id: 'follower', classId: 'database-replica', label: 'Follower', x: 400, y: 0, params: {} },
  ];
  d.edges = [
    { id: 'request', from: { nodeId: 'client', portId: 'out' }, to: { nodeId: 'leader', portId: 'in' }, params: { latencyMs: 0, bandwidthMbps: 1000 } },
    { id: 'replication', from: { nodeId: 'leader', portId: 'replicate' }, to: { nodeId: 'follower', portId: 'replica' }, params: { latencyMs: 0, bandwidthMbps: 1000 } },
  ]; return d;
}
function start(d) { const c = D.compile(d, library, config); return { c, s: E.initialize(c, deps) }; }
function advance(r, t) { E.advance(r.c, r.s, t, deps); return E.observe(r.c, r.s, deps); }
function fault(d, target, type, untilSec = null) { d.faults = [{ id: 'fault', atSec: 0, untilSec, target, type, params: {} }]; }
function close(a, b) { assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`); }

test('authored replica links carry real network work and acknowledgements independently of local commits', () => {
  const d = fixture(), r = start(d), v = advance(r, 1);
  assert.equal(v.global.completed, 1); assert.equal(v.global.effects, 1, 'physical replica applies are not separate logical application effects');
  assert.equal(v.nodes.leader.detail['Local writes'], 1); assert.equal(v.nodes.follower.detail['Applied copies'], 1);
  close(v.requests[0].completedAt, 0.02); assert.equal(v.nodes.leader.detail['Pending replication'], 0); close(v.global.memoryMiB, 0);
  assert.ok(core.networkReconcile(r.s)); assert.ok(O.reconcile(r.s));
});

test('partition blocks the authored follower receipt; bounded retries repair the same write without changing demand', () => {
  const d = fixture(); Object.assign(d.nodes[1].params, { timeoutMs: 20, retryIntervalMs: 100, maxAttempts: 1 });
  fault(d, { kind: 'edge', id: 'replication' }, 'partition', 0.05);
  const a = start(d), failed = advance(a, 1); assert.equal(failed.global.failed, 1); assert.equal(failed.nodes.leader.detail['Local writes'], 1); assert.equal(failed.nodes.follower.detail['Applied copies'], 0);
  assert.equal(failed.nodes.leader.detail['Exhausted outbox'], 1); assert.ok(failed.requests[0].backgroundPending > 0);
  d.nodes[1].params.maxAttempts = 2; const b = start(d), repaired = advance(b, 1);
  assert.equal(repaired.global.completed, 1); assert.equal(repaired.nodes.follower.detail['Applied copies'], 1); close(repaired.requests[0].completedAt, 0.14);
  assert.deepEqual(failed.requests.map(r => r.input), repaired.requests.map(r => r.input)); assert.ok(O.reconcile(b.s));
});

test('lost follower acknowledgements redeliver without a second follower apply or local application effect', () => {
  const d = fixture(); fault(d, { kind: 'node', id: 'follower' }, 'dropReplies', 0.08);
  const r = start(d), before = advance(r, 0.2); assert.equal(before.nodes.follower.detail['Applied copies'], 1); assert.equal(before.global.completed, 0);
  const cp = clone(r.s), done = advance(r, 1), restored = { c: r.c, s: cp }; advance(restored, 1); assert.deepEqual(restored.s, r.s);
  assert.equal(done.global.completed, 1); assert.equal(done.nodes.follower.detail['Applied copies'], 1); assert.equal(done.nodes.follower.detail['Duplicate deliveries'], 1); assert.equal(done.global.effects, 1);
  const history = E.inspect(r.c, r.s, done.requests[0].id, deps).history; assert.ok(history.some(e => e.kind === 'reply-lost')); assert.ok(history.filter(e => e.kind === 'call-attempt').length >= 3);
});

test('local acknowledgement remains available during follower outage while unfinished replication remains visible', () => {
  const d = fixture(); d.nodes[1].params.writeQuorum = 1; fault(d, { kind: 'node', id: 'follower' }, 'crash', null);
  const r = start(d), v = advance(r, 1); assert.equal(v.global.completed, 1); close(v.requests[0].completedAt, 0.01);
  assert.equal(v.nodes.leader.detail['Exhausted outbox'], 1); assert.ok(E.inspect(r.c, r.s, v.requests[0].id, deps).blockers.some(b => b.kind === 'replication-outbox'));
  assert.ok(O.reconcile(r.s));
});

test('fixed leader recovery fences stale callbacks and resumes durable outbox under the same designated role', () => {
  const d = fixture(); d.nodes[0].params.retries = 1; d.nodes[0].params.retryBackoffMs = 10; d.nodes[0].params.retryJitter = false;
  d.faults = [{ id: 'leader-crash', atSec: 0.015, untilSec: 0.1, target: { kind: 'node', id: 'leader' }, type: 'crash', params: {} }];
  const r = start(d); advance(r, 0.05); const cp = clone(r.s); const v = advance(r, 2), restored = { c: r.c, s: cp }; advance(restored, 2); assert.deepEqual(restored.s, r.s);
  assert.equal(v.nodes.leader.detail.Role, 'leader'); assert.equal(v.nodes.leader.detail['Local writes'], 1); assert.equal(v.nodes.follower.detail['Applied copies'], 1); assert.ok(O.reconcile(r.s));
});

test('unsupported replica topology fails closed and invalid live role changes preserve the accepted run', () => {
  const cases = [
    d => { d.nodes[2].params.role = 'leader'; },
    d => { d.edges[1].to.portId = 'in'; },
    d => { d.edges[1].params.mode = 'async'; },
    d => { d.nodes[1].params.writeQuorum = 3; },
    d => { d.edges.push({ ...clone(d.edges[1]), id: 'duplicate' }); },
    d => { d.edges.push({ id: 'cycle', from: { nodeId: 'follower', portId: 'replicate' }, to: { nodeId: 'leader', portId: 'replica' }, params: {} }); },
  ];
  for (const mutate of cases) { const d = fixture(); mutate(d); assert.throws(() => start(d)); }
  const r = start(fixture()); advance(r, 0.005); const accepted = clone(r.s);
  assert.throws(() => E.applyControl(r.c, r.s, { kind: 'setParams', target: { kind: 'node', id: 'follower' }, params: { role: 'leader' } }, deps));
  assert.deepEqual(r.s, accepted);
});

test('follower version fencing rejects old epochs and acknowledges duplicate or reordered versions without reapplying', () => {
  const kernel = kernels.get('linkedReplica'), k = kernel.init(), replies = [], counts = {};
  const ctx = { k, nodeId: 'follower', edge() { return { from: 'leader', fromPort: 'replicate', to: 'follower', toPort: 'replica' }; }, p: { role: 'follower', maxRecords: 10 }, release() {}, reply(job, result) { replies.push(result); }, count(key) { counts[key] = (counts[key] || 0) + 1; } };
  const deliver = (epoch, seq) => kernel.onServed(ctx, { from: { edgeId: 'replication', nodeId: 'leader' }, msg: { key: 1, fields: { linkedReplication: { leader: 'leader', epoch, seq } } } });
  deliver(2, 5); deliver(2, 5); deliver(2, 3); deliver(1, 9);
  assert.equal(k.applied, 1); assert.equal(k.duplicates, 2); assert.equal(k.stale, 1); assert.equal(counts['replica-applies'], 1);
  assert.deepEqual(replies.map(r => r.ok), [true, true, true, false]); assert.equal(k.versions['[1]'].seq, 5);
});

test('majority acknowledgements count distinct follower nodes while all-copy policy waits for the unavailable node', () => {
  const d = fixture(); d.nodes.push({ id: 'second', classId: 'database-replica', label: 'Second follower', x: 400, y: 200, params: {} });
  d.edges.push({ id: 'second-copy', from: { nodeId: 'leader', portId: 'replicate' }, to: { nodeId: 'second', portId: 'replica' }, params: { latencyMs: 0 } });
  fault(d, { kind: 'node', id: 'follower' }, 'crash');
  const majority = start(d), a = advance(majority, 1); assert.equal(a.global.completed, 1); assert.equal(a.nodes.second.detail['Applied copies'], 1); assert.equal(a.nodes.follower.detail['Applied copies'], 0);
  d.nodes[1].params.writeQuorum = 3; const all = start(d), b = advance(all, 1); assert.equal(b.global.failed, 1); assert.equal(b.global.effects, 1); assert.equal(b.nodes.leader.detail['Exhausted outbox'], 1);
});

test('unacknowledged replication owns retained payload bytes and survives restoration exactly', () => {
  const d = fixture(); d.nodes[0].params.requestKb = 128; fault(d, { kind: 'edge', id: 'replication' }, 'partition');
  const r = start(d); advance(r, 0.8); const cp = clone(r.s); const a = advance(r, 1.5), restored = { c: r.c, s: cp }; advance(restored, 1.5);
  // Retain the decimal 128 kB payload (128000 bytes) plus the leader's 1 MiB allocation.
  assert.deepEqual(restored.s, r.s); assert.equal(a.global.failed, 1); close(a.global.memoryMiB, 1 + 128000 / (1024 * 1024));
  assert.equal(E.inspect(r.c, r.s, a.requests[0].id, deps).blockers.filter(b => b.kind === 'replication-outbox').length, 1); assert.ok(O.reconcile(r.s));
});

 test('replica service honors modeled slowdown and isolated roles remain immutable during a run', () => {
  const d = fixture(); d.faults = [{ id: 'slow-leader', atSec: 0, untilSec: null, target: { kind: 'node', id: 'leader' }, type: 'slow', params: { factor: 2 } }];
  const r = start(d), v = advance(r, 1); close(v.requests[0].completedAt, 0.03);
  const isolated = fixture(); isolated.nodes = [isolated.nodes[2]]; isolated.edges = []; const solo = start(isolated), before = clone(solo.s);
  assert.throws(() => E.applyControl(solo.c, solo.s, { kind: 'setParams', target: { kind: 'node', id: 'follower' }, params: { role: 'leader' } }, deps), /immutable/);
  assert.deepEqual(solo.s, before);
});

test('reusing an idempotency key with conflicting key or payload rejects before another local version or outbox exists', () => {
  for (const conflict of ['key', 'payload']) {
    const d = fixture(); Object.assign(d.nodes[0].params, { burstCount: 2, burstSpacingMs: 50 });
    const source = kernels.get('source'), custom = { ...deps, kernels: { has: id => kernels.has(id), get: id => id === 'source' ? { ...source, onWake(ctx, wake) {
      const wrapped = { ...ctx, message(fields) { return ctx.message({ ...fields, idem: 'same-key', key: conflict === 'key' ? ctx.k.generated : 1, fields: conflict === 'payload' && ctx.k.generated > 1 ? { content: 'changed' } : {} }); } };
      return source.onWake(wrapped, wake);
    } } : kernels.get(id) } };
    const c = D.compile(d, library, config), s = E.initialize(c, custom); E.advance(c, s, 1, custom); const v = E.observe(c, s, custom);
    assert.equal(v.global.completed, 1); assert.equal(v.global.failed, 1); assert.equal(v.requests[1].status, 'rejected');
    assert.equal(v.global.effects, 1); assert.equal(v.nodes.leader.detail['Local writes'], 1); assert.equal(v.nodes.follower.detail['Applied copies'], 1);
    assert.equal(Object.keys(s.kernel.leader.rows).length, 1); assert.ok(O.reconcile(s));
  }
});


test('lowering live write quorum acknowledges an already committed waiter immediately without hiding the retained copy', () => {
  const d = fixture(); Object.assign(d.nodes[1].params, { timeoutMs: 1000 }); d.nodes[0].params.timeoutMs = 500;
  fault(d, { kind: 'edge', id: 'replication' }, 'partition');
  const r = start(d); const before = advance(r, 0.05); assert.equal(before.global.completed, 0); assert.equal(before.nodes.leader.detail['Local writes'], 1);
  E.applyControl(r.c, r.s, { kind: 'setParams', target: { kind: 'node', id: 'leader' }, params: { writeQuorum: 1 } }, deps);
  const cp = clone(r.s), after = advance(r, 0.1); assert.equal(after.global.completed, 1); close(after.requests[0].completedAt, 0.05);
  assert.equal(after.nodes.leader.detail['Pending replication'], 1); assert.ok(after.requests[0].backgroundPending > 0);
  const restored = { c: r.c, s: cp }; advance(restored, 0.1); assert.deepEqual(restored.s, r.s); assert.ok(O.reconcile(r.s));
});

test('client payload cannot inject a replication envelope through the ordinary follower client port', () => {
  const d = fixture(); d.edges[0].to = { nodeId: 'follower', portId: 'in' };
  const source = kernels.get('source'), custom = { ...deps, kernels: { has: id => kernels.has(id), get: id => id === 'source' ? { ...source, onWake(ctx, wake) {
    const wrapped = { ...ctx, message(fields) { return ctx.message({ ...fields, fields: { linkedReplication: { leader: 'foreign-leader', epoch: 99, seq: 99 } } }); } };
    source.onWake(wrapped, wake);
  } } : kernels.get(id) } };
  const c = D.compile(d, library, config), s = E.initialize(c, custom); E.advance(c, s, 1, custom); const v = E.observe(c, s, custom);
  assert.equal(v.global.failed, 1); assert.equal(v.nodes.follower.detail['Applied copies'], 0); assert.equal(v.global.effects, 0);
  assert.deepEqual(s.kernel.follower.versions, {}); assert.deepEqual(s.kernel.follower.epochs, {});
});


test('accepted retry budget increases resume exhausted outbox using only newly available attempts', () => {
  const d = fixture(); Object.assign(d.nodes[1].params, { timeoutMs: 20, maxAttempts: 1 });
  fault(d, { kind: 'edge', id: 'replication' }, 'partition', 0.05);
  const r = start(d), failed = advance(r, 0.1); assert.equal(failed.global.failed, 1); assert.equal(failed.nodes.leader.detail['Exhausted outbox'], 1);
  E.applyControl(r.c, r.s, { kind: 'setParams', target: { kind: 'node', id: 'leader' }, params: { maxAttempts: 2 } }, deps);
  const cp = clone(r.s), done = advance(r, 0.2), restored = { c: r.c, s: cp }; advance(restored, 0.2); assert.deepEqual(restored.s, r.s);
  assert.equal(done.nodes.follower.detail['Applied copies'], 1); assert.equal(done.nodes.leader.detail['Pending replication'], 0); assert.equal(done.global.failed, 1, 'previously failed logical request is not rewritten');
  assert.equal(Object.values(r.s.kernel.leader.rows)[0].attempts.replication, 2); assert.ok(O.reconcile(r.s));
});


test('unrelated live parameter edits preserve the already scheduled replication retry backoff', () => {
  const d = fixture(); Object.assign(d.nodes[1].params, { timeoutMs: 20, retryIntervalMs: 100, maxAttempts: 2 });
  fault(d, { kind: 'edge', id: 'replication' }, 'partition', 0.05);
  const r = start(d); advance(r, 0.04);
  E.applyControl(r.c, r.s, { kind: 'setParams', target: { kind: 'node', id: 'leader' }, params: { applyMs: 25 } }, deps);
  const waiting = advance(r, 0.12); assert.equal(waiting.global.completed, 0); assert.equal(waiting.nodes.follower.detail['Applied copies'], 0);
  assert.equal(Object.values(r.s.kernel.leader.rows)[0].attempts.replication, 1);
  const done = advance(r, 0.2); assert.equal(done.global.completed, 1); close(done.requests[0].completedAt, 0.14);
  assert.equal(Object.values(r.s.kernel.leader.rows)[0].attempts.replication, 2);
});
