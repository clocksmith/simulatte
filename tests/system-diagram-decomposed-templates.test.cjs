'use strict';
// Expanded public architectures are acceptance fixtures. Minimal protocol regressions
// intentionally retain their original graphs under fixtures/system-diagram.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const base = '../public/simulatte/system-diagram/';
const D = require(base + 'diagram.js'), E = require(base + 'engine.js');
const O = require(base + 'engine-observability.js'), N = require(base + 'engine-network.js');
const config = require('../public/data/system-diagram/config.json');
const library = require(base + 'class-library.js').loadSync(path.resolve(__dirname, '../public/data/system-diagram'));
const kernels = require(base + 'kernels-all.js'), deps = { library, config, kernels };
const names = ['chat-application', 'workspace-access', 'video-distribution', 'spark-job', 'agent-trajectories', 'social-feed'];
const fixture = id => structuredClone(require('../public/data/system-diagram/examples/' + id + '.json'));
function run(d, until = d.run.horizonSec) {
  const c = D.compile(d, library, config), s = E.initialize(c, deps); E.advance(c, s, until, deps);
  assert.equal(s.error, null); assert.ok(O.reconcile(s)); N.reconcile(s);
  const v = E.observe(c, s, deps);
  assert.equal(v.global.offered, v.global.completed + v.global.failed + v.global.inFlight);
  return { c, s, v };
}
function change(d, id, p) { Object.assign(d.nodes.find(n => n.id === id).params, p); return d; }
function crash(d, id, end = null) { d.faults = [{ id: 'test-outage', atSec: 0, untilSec: end, target: { kind: 'node', id }, type: 'crash', params: {} }]; return d; }
function signature(v, exclude) {
  return JSON.stringify({ global: v.global, peers: Object.fromEntries(Object.entries(v.nodes).filter(([id]) => id !== exclude).map(([id, n]) => [id, { arrivals: n.arrivals, served: n.served, records: n.records, detail: n.detail }])) });
}

for (const id of names) test(`${id}: grouped real nodes execute, retain exact checkpoint continuation, and ignore fold state`, () => {
  const d = fixture(id), complete = run(d), split = run(d, .42), restored = structuredClone(split.s);
  assert.ok(d.groups.length >= 3); assert.ok(d.groups.every(g => d.nodes.some(n => n.groupId === g.id)));
  assert.ok(d.nodes.length >= 12, 'meaningful decomposition is exercised by the behavioral assertions below, not node count alone');
  assert.ok(d.nodes.every(n => d.edges.some(e => e.from.nodeId === n.id || e.to.nodeId === n.id)));
  E.advance(split.c, split.s, d.run.horizonSec, deps); E.advance(split.c, restored, d.run.horizonSec, deps);
  assert.deepEqual(restored, split.s); assert.deepEqual(complete.s, split.s);
  const moved = structuredClone(d); moved.groups.forEach(g => { g.collapsed = !g.collapsed; g.x += 137; }); moved.nodes.forEach(n => { n.x -= 81; n.y += 29; });
  assert.deepEqual(D.compile(moved, library, config), complete.c, 'folding and coordinates cannot alter the accepted model');
  for (const n of d.nodes.filter(n => n.classId !== 'dead-letter-queue')) {
    const actual = complete.v.nodes[n.id];
    assert.ok(actual.arrivals > 0 || Object.keys(complete.s.kernel[n.id]).some(k => ['generated', 'phase', 'cohorts', 'emitted', 'followIndex'].includes(k)), `${n.id} executes, rather than decorating an expanded group`);
  }
});

test('chat has independent stream cursor, real replica routing, durable persistence and client receipt', () => {
  const { v, s } = run(fixture('chat-application'));
  assert.equal(v.global.completed, 7); assert.equal(v.global.failed, 1); assert.equal(v.global.effects, 6);
  assert.equal(s.kernel.client.chunks.length, 16);
  assert.ok(v.nodes.generation.arrivals > 0 && v.nodes['generation-b'].arrivals > 0);
  assert.ok(v.nodes.stream.arrivals > 0 && v.nodes.conversations.arrivals > 0 && v.nodes.identity.arrivals > 0);
  assert.equal(s.kernel.conversations.users.length, 0); assert.equal(s.kernel.conversations.conversations.length, 0);
  const blocked = run(crash(fixture('chat-application'), 'stream'));
  assert.equal(blocked.s.kernel.client.chunks.length, 0);
  assert.ok(blocked.v.global.completed < v.global.completed);
});

test('workspace atomic writes and leased journal effects have distinct owners and failure states', () => {
  const baseline = run(fixture('workspace-access'));
  assert.equal(baseline.v.global.completed, 9); assert.equal(baseline.v.global.failed, 5);
  assert.equal(baseline.v.nodes.activity.detail.applied, 6); assert.equal(baseline.v.global.effects, 12);
  const d = crash(fixture('workspace-access'), 'activity-worker'); change(d, 'activity-queue', { maxReceives: 1, retryDelayMs: 10 });
  const failed = run(d); assert.equal(failed.v.global.completed, 9, 'journal failure does not undo committed task commands');
  assert.equal(failed.v.nodes.activity.detail.applied, 0); assert.ok(failed.v.nodes.deadletters.detail.retained > 0);
  assert.equal(failed.v.global.effects, 6, 'atomic record effects remain distinct from absent journal applications');
});

test('video regions conserve end-user bytes independently from hierarchy copies and require actual manifests', () => {
  const { s, v } = run(fixture('video-distribution'));
  const viewers = [s.kernel.viewers, s.kernel['viewers-east']];
  assert.equal(viewers.reduce((n, k) => n + k.completedViewers, 0), 3000);
  assert.equal(viewers.reduce((n, k) => n + k.deliveredSegments, 0), 24000);
  assert.equal(viewers.reduce((n, k) => n + k.peerKiB + k.cdnKiB, 0), 3000 * 8 * 256);
  assert.equal(s.kernel.origin.originKiB, 8 * 256); assert.equal(s.kernel.manifest.reads, 2);
  assert.ok(s.kernel.cdn.hits > 0 && s.kernel['cdn-east'].hits > 0);
  const d = crash(fixture('video-distribution'), 'manifest'); d.nodes.filter(n => n.classId === 'video-viewers').forEach(n => Object.assign(n.params, { timeoutMs: 100, retries: 0 }));
  const unavailable = run(d); assert.equal(unavailable.v.nodes.origin.arrivals, 0); assert.equal(unavailable.s.kernel.viewers.completedViewers, 0);
  assert.equal(unavailable.s.kernel.viewers.failedViewers + unavailable.s.kernel['viewers-east'].failedViewers, 3000);
  assert.equal(v.global.inFlight, 0);
});

test('separate Spark dataset, map CPUs, shuffle stores and reduce CPUs compute independent URL counts', () => {
  const d = fixture('spark-job'), { s, v } = run(d);
  const expected = Array.from({ length: 12 }, (_, i) => ({ url: `/url-${i}`, count: i ? (i <= 2 ? 39 : 38) : 780 })).sort((a, b) => a.url.localeCompare(b.url));
  assert.equal(s.kernel.driver.phase, 'completed'); assert.deepEqual(s.kernel.driver.output, expected);
  assert.equal(s.kernel.input.reads, 1); assert.ok(s.kernel.driver.recomputed > 0); assert.ok(s.kernel['shuffle-a'].lostBlocks > 0);
  for (const letter of 'abc') {
    assert.equal(s.kernel['executor-' + letter].reduces, 0); assert.equal(Object.keys(s.kernel['executor-' + letter].blocks).length, 0);
    assert.equal(s.kernel['reduce-' + letter].maps, 0); assert.ok(s.kernel['reduce-' + letter].reduces > 0);
  }
  for (const map of Object.values(s.kernel.driver.maps)) for (const b of map.blocks) assert.ok(/^shuffle-[abc]$/.test(b.storage), 'receipts name the actual independent block owner');
  assert.equal(v.nodes.results.detail.writes, 1);
  const noInput = run(crash(fixture('spark-job'), 'input')); assert.equal(noInput.s.kernel.driver.phase, 'failed'); assert.equal(noInput.v.nodes.results.arrivals, 0);
  const noShuffle = fixture('spark-job'); noShuffle.edges = noShuffle.edges.filter(e => !e.id.startsWith('shuffle-')); change(noShuffle, 'driver', { maxAttempts: 2 });
  const missing = run(noShuffle); assert.equal(missing.s.kernel.driver.phase, 'failed'); assert.equal(missing.v.nodes.results.arrivals, 0);
});

test('independent shuffle storage survives map CPU loss and refuses a wrong storage receipt', () => {
  const d = fixture('spark-job'); d.faults = [];
  const before = run(d, .5), stored = Object.keys(before.s.kernel['shuffle-a'].blocks).length; assert.ok(stored > 0);
  E.applyControl(before.c, before.s, { kind: 'fault', type: 'crash', target: { kind: 'node', id: 'executor-a' }, params: {} }, deps);
  assert.equal(Object.keys(before.s.kernel['shuffle-a'].blocks).length, stored);
  const broken = new Map(kernels.ids().map(id => [id, kernels.get(id)])), original = broken.get('sparkBlockStore');
  broken.set('sparkBlockStore', { ...original, onServed(ctx, job) { original.onServed({ ...ctx, reply(j, result) { if (job.msg.fields.spark.kind === 'fetch' && result.fields?.sparkBlock) result.fields.sparkBlock.storage = 'forged-store'; return ctx.reply(j, result); } }, job); } });
  const custom = { ...deps, kernels: { get: id => broken.get(id), has: id => broken.has(id) } }, c = D.compile(change(d, 'driver', { maxAttempts: 2 }), library, config), s = E.initialize(c, custom);
  E.advance(c, s, 30, custom); assert.equal(s.kernel.driver.phase, 'failed'); assert.deepEqual(s.kernel.driver.output, []);
});

test('agent DAG waits for real verified-research and constraint predecessors before publishing', () => {
  const { s, v } = run(fixture('agent-trajectories'));
  assert.equal(v.global.completed, 1); assert.equal(v.global.effects, 11); assert.equal(v.global.duplicateEffects, 0);
  assert.equal(v.nodes.research.detail.Reconciled, 1); assert.equal(v.nodes.dashboard.records.tasks.length, 7);
  assert.ok(v.nodes.dashboard.records.tasks.every(r => r.state === 'complete'));
  const at = id => Object.values(s.kernel[id].rows)[0].committedAt;
  assert.ok(at('synthesize') > at('verify-sources') && at('synthesize') > at('inspect'));
  assert.ok(at('publish') > at('review'));
  const missing = run(crash(fixture('agent-trajectories'), 'verify-sources')); assert.equal(missing.v.nodes.publish.detail['Committed effects'], 0);
});

test('social graph, post authority and delayed materialization preserve exact follower identities', () => {
  const { v, s } = run(fixture('social-feed'));
  assert.equal(v.global.completed, 148); assert.equal(v.global.failed, 0);
  assert.equal(v.nodes.graph.detail.Users, 16); assert.equal(v.nodes.graph.detail.Follows, 45); assert.equal(v.nodes.posts.detail.Posts, 12);
  assert.equal(v.nodes.timelines.detail['Unique recipient writes'], 76); assert.equal(v.nodes.feed.detail['Feed reads'], 90);
  assert.ok(v.nodes.feed.detail['Stale feed reads'] > 0); assert.ok(v.nodes.feed.records.reads.slice(-15).every(r => !r.stale));
  assert.equal(s.kernel.posts.users, undefined, 'separate graph is not a cosmetic copy beside embedded user authority');
  const d = crash(fixture('social-feed'), 'fanout'); change(d, 'queue', { maxReceives: 1 }); const lost = run(d);
  assert.ok(lost.v.nodes.deadletters.detail.retained > 0); assert.equal(lost.v.nodes.timelines.detail['Unique recipient writes'], 0);
});

for (const id of names) test(`${id}: every ordinary component has a consequential independent crash boundary`, () => {
  const d = fixture(id); d.faults = []; const baseline = run(d);
  for (const n of d.nodes.filter(n => n.classId !== 'dead-letter-queue')) {
    const failed = run(crash(structuredClone(d), n.id));
    assert.notEqual(signature(failed.v, n.id), signature(baseline.v, n.id), `${n.id} affects downstream work or upstream delivery, not only its own display state`);
  }
});


test('concurrent external shuffle writes reserve real capacity and pay disk spill before acknowledgement', () => {
  const d = fixture('spark-job'); d.faults = [];
  const remove = ['executor-c', 'shuffle-b', 'shuffle-c', 'reduce-b', 'reduce-c'];
  d.nodes = d.nodes.filter(n => !remove.includes(n.id));
  d.edges = d.edges.filter(e => !remove.includes(e.from.nodeId) && (!remove.includes(e.to.nodeId) || e.id === 'map-storage-b'));
  d.edges.find(e => e.id === 'map-storage-b').to.nodeId = 'shuffle-a';
  change(d, 'input', { recordCount: 384, mapPartitions: 2, recordKiB: 4 });
  change(d, 'driver', { recordCount: 384, mapPartitions: 2, reducePartitions: 1, recordKiB: 4, parallelTasks: 2 });
  change(d, 'shuffle-a', { shuffleBufferMiB: 1, spillMiBps: 1, serviceMs: 1, concurrency: 2 });
  const initial = run(d, 0); assert.deepEqual(initial.s.kernel.driver.inputs, [], 'separate input is unavailable until an acknowledged read');
  const { s } = run(d);
  assert.equal(s.kernel.driver.phase, 'completed'); assert.equal(s.kernel['shuffle-a'].residentKiB, 1024); assert.equal(s.kernel['shuffle-a'].spillKiB, 512);
  const times = Object.values(s.kernel.driver.tasks).filter(t => t.kind === 'map').map(t => t.completedAt);
  assert.ok(Math.max(...times) - Math.min(...times) >= .49, 'second concurrent 768 KiB block must flush 512 KiB at 1 MiB/s');
  assert.deepEqual(s.kernel['shuffle-a'].pendingStores, {});
});

test('malformed separate Spark input fails closed without manufacturing driver partitions', () => {
  const d = fixture('spark-job'); d.faults = [];
  const original = kernels.get('sparkInput'), custom = { ...deps, kernels: { has: id => kernels.has(id), get: id => id === 'sparkInput' ? { ...original, onServed(ctx, job) { ctx.reply(job, { ok: true, fields: { sparkInput: [null, null, null, null, null, null] } }); } } : kernels.get(id) } };
  const c = D.compile(d, library, config), s = E.initialize(c, custom); E.advance(c, s, 30, custom);
  assert.equal(s.error, null); assert.equal(s.kernel.driver.phase, 'failed'); assert.deepEqual(s.kernel.driver.inputs, []); assert.deepEqual(s.kernel.driver.output, []);
});

for (const [id, edgeId, reason] of [
  ['video-distribution', 'playback-manifest', /required manifest authority/],
  ['spark-job', 'input-request', /external input authority/],
  ['spark-job', 'map-storage-a', /external shuffle storage/],
]) test(`${id}: removing ${edgeId} refuses instead of activating a bundled substitute`, () => {
  const d = fixture(id); d.edges = d.edges.filter(e => e.id !== edgeId); assert.throws(() => run(d), reason);
});
