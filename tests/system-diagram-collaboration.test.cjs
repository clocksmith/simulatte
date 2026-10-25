const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const base = '../public/simulatte/system-diagram/';
const directory = path.resolve(__dirname, '../public/data/system-diagram');
const library = require(base + 'class-library.js').loadSync(directory);
const D = require(base + 'diagram.js'), E = require(base + 'engine.js'), kernels = require(base + 'kernels-all.js');
const O = require(base + 'engine-observability.js'), config = require('../public/data/system-diagram/config.json');
const deps = { library, config, kernels }, clone = value => JSON.parse(JSON.stringify(value));
const fixture = id => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/system-diagram', id + '.json'), 'utf8'));
function run(doc, until = doc.run.horizonSec) { const c = D.compile(doc, library, config), s = E.initialize(c, deps); E.advance(c, s, until, deps); assert.equal(s.error, null); const v = E.observe(c, s, deps); assert.ok(O.reconcile(s)); return { c, s, v }; }
function resume(doc, split) {
  const { c, s } = run(doc, split), restored = clone(s); E.advance(c, s, doc.run.horizonSec, deps); E.advance(c, restored, doc.run.horizonSec, deps);
  assert.deepEqual(restored, s); assert.deepEqual(run(doc).s, s); assert.ok(O.reconcile(s)); return { c, s, v: E.observe(c, s, deps) };
}
function params(doc, id, values) { Object.assign(doc.nodes.find(n => n.id === id).params, values); return doc; }
function socialOracle() {
  // Independently authored cohort: all 15 readers follow author 0, and each follows
  // the next two ordinary authors on a 15-person ring. Twelve posts rotate authors.
  const follows = [];
  for (let reader = 1; reader <= 15; reader++) { follows.push([`user-${reader}`, 'user-0']); for (let delta = 1; delta <= 2; delta++) follows.push([`user-${reader}`, `user-${1 + ((reader - 1 + delta) % 15)}`]); }
  const posts = Array.from({ length: 12 }, (_, i) => ({ id: `users:post-${i + 1}`, authorId: i % 3 === 0 ? 'user-0' : `user-${1 + i % 15}` }));
  const entries = posts.flatMap(post => follows.filter(([, author]) => author === post.authorId).map(([reader]) => `${reader}/${post.id}`)).sort();
  return { follows, posts, entries };
}

test('named task DAG joins both branches, reconciles a crash after effect, and journals observable status', () => {
  const { v, s } = resume(fixture('agent-trajectories'), .2);
  assert.equal(v.global.offered, 1); assert.equal(v.global.completed, 1); assert.equal(v.global.failed, 0);
  assert.equal(v.global.effects, 5); assert.equal(v.global.duplicateEffects, 0);
  assert.equal(v.nodes.research.detail.Reconciled, 1); assert.equal(v.nodes.tool.detail.effects, 1);
  assert.equal(v.nodes.dashboard.records.tasks.length, 4); assert.ok(v.nodes.dashboard.records.tasks.every(t => t.state === 'complete'));
  const events = v.nodes.dashboard.records.events, states = new Set(events.map(e => e.state));
  for (const state of ['queued', 'running', 'waiting', 'retry', 'complete']) assert.ok(states.has(state), state);
  assert.ok(events.some(e => e.taskId === 'research' && /crashed after effect/.test(e.step)));
  assert.ok(events.some(e => e.taskId === 'research' && /reconciled existing effect/.test(e.step)));
  const commit = id => Object.values(s.kernel[id].rows)[0].committedAt;
  assert.ok(commit('publish') > commit('research')); assert.ok(commit('publish') > commit('inspect'));
  assert.ok(events.some(e => e.taskId === 'publish' && e.step === 'join 1/2 dependencies'));
  assert.ok(v.attempts.some(a => a.status === 'failed')); assert.ok(v.requests.every(r => r.status !== 'in-flight'));
  assert.equal(v.effects.filter(e => !e.suppressed).length, 5);
});

test('removing the authored crash preserves outputs and removes reconciliation work', () => {
  const faulty = run(fixture('agent-trajectories')), doc = fixture('agent-trajectories'); doc.faults = [];
  const repaired = run(doc); assert.equal(repaired.v.global.effects, 5); assert.equal(repaired.v.nodes.research.detail.Reconciled, 0);
  assert.equal(repaired.v.global.completed, 1); assert.ok(repaired.v.global.latency.mean < faulty.v.global.latency.mean);
  assert.deepEqual(repaired.v.requests.map(r => r.input), faulty.v.requests.map(r => r.input));
});

test('journal reply loss duplicates delivery but not events, and checkpoint restore preserves its projection', () => {
  const doc = fixture('agent-trajectories'); doc.faults.push({ id: 'journal-reply-loss', atSec: 0, untilSec: .35, target: { kind: 'node', id: 'dashboard' }, type: 'dropReplies', params: {} });
  const { v } = resume(doc, .4), events = v.nodes.dashboard.records.events;
  assert.equal(events.length, new Set(events.map(e => e.id)).size); assert.ok(v.nodes.dashboard.detail['Duplicate status deliveries'] > 0);
  assert.ok(v.nodes.dashboard.records.tasks.every(t => t.state === 'complete')); assert.equal(v.nodes.research.detail['Status pending'], 0);
  // The delayed crash event has an earlier occurrence time, but cannot roll back
  // the latest projection when higher sequence numbers arrive first.
  for (const task of v.nodes.dashboard.records.tasks) assert.equal(task.sequence, Math.max(...events.filter(e => e.taskId === task.taskId).map(e => e.sequence)));
});

test('task cycles and unacknowledged dependency links fail closed before initialization', () => {
  const cycle = fixture('agent-trajectories'); cycle.edges.push({ id: 'cycle', from: { nodeId: 'publish', portId: 'next' }, to: { nodeId: 'plan', portId: 'in' }, params: {} });
  assert.throws(() => run(cycle), /dependency cycle/);
  const async = fixture('agent-trajectories'); async.edges.find(e => e.id === 'plan-research').params.mode = 'async'; assert.throws(() => run(async), /acknowledged sync/);
});

test('an unavailable prerequisite cannot commit the join task, and waiting dependencies time out visibly', () => {
  const doc = fixture('agent-trajectories'); doc.faults = [{ id: 'no-research', atSec: 0, untilSec: null, target: { kind: 'node', id: 'research' }, type: 'crash', params: {} }];
  params(doc, 'publish', { callTimeoutMs: 800 }); params(doc, 'inspect', { retries: 0, callTimeoutMs: 1500 });
  const { v } = run(doc); assert.equal(v.global.completed, 0); assert.equal(v.global.failed, 1); assert.equal(v.nodes.publish.detail['Committed effects'], 0);
  assert.ok(v.nodes.dashboard.records.events.some(e => e.taskId === 'publish' && e.state === 'failed' && e.step === 'timeout'));
});

test('social model follows an independent cohort oracle and eventually drains the delayed consumer', () => {
  const oracle = socialOracle(), { v, s } = resume(fixture('social-feed'), .9);
  assert.equal(v.nodes.posts.detail.Users, 16); assert.equal(v.nodes.posts.detail.Follows, 45); assert.equal(v.nodes.posts.detail.Posts, 12);
  assert.deepEqual(v.nodes.posts.records.follows.map(f => [f.followerId, f.authorId]).sort(), oracle.follows.sort());
  assert.deepEqual(v.nodes.timelines.records.entries.map(r => `${r.userId}/${r.postId}`).sort(), oracle.entries);
  assert.equal(oracle.entries.length, 76); assert.equal(v.nodes.timelines.detail['Unique recipient writes'], 76);
  assert.equal(v.global.effects, 88); assert.equal(v.global.duplicateEffects, 0); assert.equal(v.nodes.feed.detail['Feed reads'], 90);
  assert.ok(v.nodes.feed.detail['Stale feed reads'] > 0); assert.ok(v.nodes.feed.records.reads.slice(-15).every(r => !r.stale));
  assert.equal(s.kernel.queue.size, 0); assert.equal(v.nodes.deadletters.detail.retained, 0); assert.ok(v.nodes.queue.detail.redeliveries > 0);
  assert.equal(v.global.failed, 0); assert.equal(v.global.offered, 148, '1 user bootstrap + 45 follows + 12 posts + 90 reads');
});

test('pull and hybrid preserve followed post identities while changing fanout amplification and staleness', () => {
  const push = run(fixture('social-feed')), pullDoc = params(fixture('social-feed'), 'posts', { fanoutMode: 'pull' }), hybridDoc = params(fixture('social-feed'), 'posts', { fanoutMode: 'hybrid' });
  const pull = run(pullDoc), hybrid = run(hybridDoc), oracle = socialOracle();
  assert.equal(pull.v.nodes.timelines.detail['Unique recipient writes'], 0); assert.equal(pull.v.nodes.feed.detail['Stale feed reads'], 0);
  assert.equal(pull.v.nodes.posts.detail['Pull posts'], 12); assert.equal(hybrid.v.nodes.posts.detail['Pull posts'], 4); assert.equal(hybrid.v.nodes.posts.detail['Push posts'], 8);
  assert.equal(hybrid.v.nodes.timelines.detail['Unique recipient writes'], 16, '8 ordinary posts times 2 followers');
  assert.ok(hybrid.v.nodes.feed.detail['Missing post observations'] < push.v.nodes.feed.detail['Missing post observations']);
  for (const view of [push.v, pull.v, hybrid.v]) for (const read of view.nodes.feed.records.reads.slice(-15)) {
    const expected = oracle.entries.filter(id => id.startsWith(read.userId + '/')).map(id => id.slice(read.userId.length + 1)).sort();
    assert.deepEqual([...read.postIds].sort(), expected); assert.deepEqual([...read.expectedPostIds].sort(), expected);
  }
  assert.deepEqual(push.v.nodes.posts.records.posts.map(p => [p.id, p.authorId, p.createdAt]), pull.v.nodes.posts.records.posts.map(p => [p.id, p.authorId, p.createdAt]));
  assert.throws(() => E.applyControl(push.c, push.s, { kind: 'setParams', target: { kind: 'node', id: 'posts' }, params: { fanoutMode: 'pull' } }, deps), /immutable parameter/);
});

test('lost timeline acknowledgements and fanout redelivery suppress recipient/post effects', () => {
  const doc = fixture('social-feed'); doc.faults = [{ id: 'timeline-replies', atSec: .25, untilSec: 1.3, target: { kind: 'node', id: 'timelines' }, type: 'dropReplies', params: {} }];
  params(doc, 'fanout', { callTimeoutMs: 300, retries: 3 }); params(doc, 'queue', { visibilityTimeoutMs: 600, maxReceives: 20 });
  const { v, s } = resume(doc, .7);
  assert.equal(v.nodes.timelines.detail['Unique recipient writes'], 76); assert.ok(v.nodes.timelines.detail['Duplicate recipient attempts'] > 0);
  assert.equal(v.global.duplicateEffects, 0); assert.equal(s.kernel.queue.size, 0); assert.equal(v.nodes.deadletters.detail.retained, 0);
});

test('repairing a live consumer restores queued fanout without changing authored posts', () => {
  const doc = fixture('social-feed'); doc.faults[0].untilSec = null;
  const { c, s, v } = run(doc, 1); assert.ok(v.nodes.queue.queue > 0); assert.equal(v.nodes.timelines.detail['Timeline entries'], 0);
  const checkpoint = clone(s), control = { kind: 'repair', target: { kind: 'node', id: 'fanout' } };
  E.applyControl(c, s, control, deps); E.applyControl(c, checkpoint, control, deps); E.advance(c, s, 12, deps); E.advance(c, checkpoint, 12, deps);
  assert.deepEqual(checkpoint, s); const end = E.observe(c, s, deps); assert.equal(end.nodes.timelines.detail['Timeline entries'], 76); assert.equal(end.nodes.queue.queue, 0); assert.ok(end.nodes.feed.records.reads.slice(-15).every(r => !r.stale));
});

test('bounded timeline storage rejects excess entries rather than pretending the feed is complete', () => {
  const doc = params(fixture('social-feed'), 'timelines', { maxRecords: 10 }); params(doc, 'queue', { maxReceives: 3 }); doc.faults = [];
  const { v } = run(doc); assert.equal(v.nodes.timelines.detail['Timeline entries'], 10); assert.ok(v.nodes.timelines.detail['record capacity rejections'] > 0);
  assert.ok(v.nodes.deadletters.detail.retained > 0); assert.ok(v.nodes.feed.records.reads.slice(-15).some(r => r.stale));
});

test('observed records are detached plain rows and do not mutate authoritative state', () => {
  const { c, s, v } = run(fixture('social-feed')), before = clone(s);
  for (const node of Object.values(v.nodes)) for (const rows of Object.values(node.records || {})) assert.ok(rows.every(r => r && typeof r === 'object' && !Array.isArray(r)));
  v.nodes.posts.records.users[0].userId = 'changed'; v.nodes.feed.records.reads[0].postIds.push('forged');
  assert.deepEqual(s, before); assert.notEqual(E.observe(c, s, deps).nodes.posts.records.users[0].userId, 'changed');
});

test('effect and acknowledgement remain distinct across the worker crash window', () => {
  const { c, s, v } = run(fixture('agent-trajectories'), .2), effect = v.effects.find(e => e.nodeId === 'research');
  assert.equal(effect.requestId, v.requests[0].id); assert.equal(effect.acknowledgement, 'unknown'); assert.equal(v.global.unknownEffects, 1);
  assert.equal(v.global.completed, 0); assert.equal(v.nodes.research.detail['Committed effects'], 1);
  E.advance(c, s, 12, deps); const end = E.observe(c, s, deps), reconciled = end.effects.find(e => e.id === effect.id);
  assert.equal(reconciled.acknowledgement, 'received'); assert.ok(reconciled.confirmationEvidence); assert.equal(end.global.unknownEffects, 0);
});

test('source recovery during relationship setup preserves confirmed follows and retries uncertain ones', () => {
  const doc = fixture('social-feed'); doc.faults = [{ id: 'setup-crash', atSec: .1, untilSec: .3, target: { kind: 'node', id: 'users' }, type: 'crash', params: {} }];
  const { v } = resume(doc, .2); assert.equal(v.nodes.posts.detail.Follows, 45); assert.equal(v.nodes.posts.detail.Posts, 12);
  assert.equal(v.nodes.feed.detail['Feed reads'], 90); assert.equal(v.nodes.timelines.detail['Timeline entries'], 76); assert.equal(v.global.inFlight, 0);
  assert.deepEqual(v.nodes.posts.records.follows.map(f => [f.followerId, f.authorId]).sort(), socialOracle().follows.sort());
});

test('follow and unfollow operations change current feed visibility without duplicating relations', () => {
  const core = require(base + 'engine-core.js'), doc = fixture('social-feed'); doc.faults = [];
  params(doc, 'users', { postCount: 3, readCount: 0 }); params(doc, 'posts', { fanoutMode: 'pull' }); const { c, s } = run(doc, 1);
  function issue(envelope, port) {
    const ctx = core.ctxOf(core.runtime(c, s, deps), 'users'), msg = ctx.message({ ptype: 'json', kb: 1, op: port === 'read' ? 'read' : 'write', fields: { social: envelope } });
    ctx.beginRequest(msg); const job = ctx.newJob(msg); ctx.k.outstanding++;
    ctx.call(job, ctx.edges(port)[0].id, {}, { timeoutMs: 2000, slot: { kind: 'manual' } }); E.advance(c, s, s.t + .1, deps);
  }
  issue({ kind: 'follow', followerId: 'user-0', authorId: 'user-2' }, 'write');
  issue({ kind: 'follow', followerId: 'user-0', authorId: 'user-2' }, 'write');
  issue({ kind: 'feed', userId: 'user-0' }, 'read');
  let v = E.observe(c, s, deps); assert.equal(v.nodes.posts.detail.Follows, 46); assert.deepEqual(v.nodes.feed.records.reads.at(-1).postIds, ['users:post-2']);
  issue({ kind: 'unfollow', followerId: 'user-0', authorId: 'user-2' }, 'write'); issue({ kind: 'feed', userId: 'user-0' }, 'read');
  v = E.observe(c, s, deps); assert.equal(v.nodes.posts.detail.Follows, 45); assert.deepEqual(v.nodes.feed.records.reads.at(-1).postIds, []);
  issue({ kind: 'follow', followerId: 'not-a-user', authorId: 'user-2' }, 'write'); v = E.observe(c, s, deps); assert.equal(v.nodes.posts.detail.Follows, 45); assert.equal(v.requests.at(-1).status, 'failed');
});

test('retrying an already completed task reconciles a lost success acknowledgement without another effect', () => {
  const doc = fixture('agent-trajectories'); doc.faults = [{ id: 'lost-success', atSec: 0, untilSec: .6, target: { kind: 'node', id: 'research' }, type: 'dropReplies', params: {} }];
  const { c, s, v } = run(doc, 4.1); assert.equal(v.effects.find(e => e.nodeId === 'research').acknowledgement, 'unknown');
  E.advance(c, s, 12, deps); const end = E.observe(c, s, deps);
  assert.equal(end.global.completed, 1); assert.equal(end.global.effects, 5); assert.equal(end.global.duplicateEffects, 0);
  assert.equal(end.effects.find(e => e.nodeId === 'research').acknowledgement, 'received'); assert.equal(end.nodes.research.detail.Reconciled, 1);
});

test('each retried incomplete join gets a bounded timeout and cannot leave orphaned jobs', () => {
  const doc = fixture('agent-trajectories'); doc.faults[0].atSec = 0; doc.faults[0].untilSec = null;
  params(doc, 'publish', { callTimeoutMs: 100 }); params(doc, 'inspect', { callTimeoutMs: 300, retries: 2, retryBackoffMs: 50 }); params(doc, 'plan', { callTimeoutMs: 1500, retries: 0 });
  const { v, s } = resume(doc, .5);
  assert.equal(v.global.failed, 1); assert.equal(Object.keys(s.calls).length, 0); assert.equal(Object.keys(s.jobs).length, 0);
  assert.ok(Object.values(s.kernel.publish.rows).every(r => r.waiters.length === 0 && r.status === 'failed'));
  assert.equal(v.nodes.dashboard.records.tasks.find(r => r.taskId === 'publish').state, 'failed');
});

test('temporary engine service errors do not wedge task ownership after the worker job settles', () => {
  const doc = fixture('agent-trajectories'); doc.faults = [{ id: 'temporary-errors', atSec: 0, untilSec: .2, target: { kind: 'node', id: 'plan' }, type: 'errors', params: { rate: 1 } }];
  params(doc, 'requests', { timeoutMs: 500, retries: 2, retryBackoffMs: 250 });
  const { v, s } = resume(doc, .15); assert.equal(v.global.completed, 1); assert.equal(v.global.failed, 0); assert.equal(v.global.effects, 5);
  assert.equal(Object.keys(s.jobs).length, 0); assert.equal(Object.keys(s.calls).length, 0); assert.ok(Object.values(s.kernel.plan.rows).every(r => r.complete && !r.active && r.waiters.length === 0));
});

test('pull materialization incurs declared service work and larger post-store reply transfers', () => {
  function scenario(mode, perPostReadMs) { const doc = fixture('social-feed'); doc.faults = []; return params(doc, 'posts', { fanoutMode: mode, perPostReadMs }); }
  const push = run(scenario('push', 2)), pull = run(scenario('pull', 2)), freePull = run(scenario('pull', 0));
  const latency = v => v.attempts.filter(a => a.edgeId === 'load-followed-posts').reduce((total, a) => total + a.finishedAt - a.startedAt, 0);
  const bits = s => Object.values(s.observability.requests).flatMap(r => r.history.trim().split('\n').filter(Boolean).map(JSON.parse)).filter(e => e.kind === 'network-enqueued' && e.detail.startsWith('load-followed-posts: ')).reduce((total, e) => total + Number(e.detail.match(/: ([\d.]+) Kbit/)[1]), 0);
  assert.equal(push.v.nodes.posts.detail['Pulled post rows'], 0); assert.ok(pull.v.nodes.posts.detail['Pulled post rows'] > 0);
  assert.ok(latency(pull.v) - latency(freePull.v) >= pull.v.nodes.posts.detail['Pulled post rows'] * .002 - .001);
  assert.ok(bits(pull.s) > bits(push.s), 'actual pulled post bodies consume additional bandwidth');
  assert.equal(bits(pull.s), bits(freePull.s)); assert.equal(push.v.nodes.posts.detail['Oracle post checks'], pull.v.nodes.posts.detail['Oracle post checks'], 'the diagnostic expected-ID oracle is not the modeled query cost');
});

test('source memory rejection settles local counters instead of creating phantom outstanding requests', () => {
  const doc = fixture('social-feed'); doc.faults = []; params(doc, 'users', { memoryLimitMiB: .5, memoryPerRequestMiB: 1, memoryOomPolicy: 'reject' });
  const { s, v } = run(doc); assert.equal(v.global.offered, 1); assert.equal(v.global.failed, 1); assert.equal(v.requests[0].status, 'rejected');
  assert.equal(v.nodes.users.detail['Outstanding requests'], 0); assert.equal(v.nodes.users.detail.Failed, 1); assert.equal(Object.keys(s.jobs).length, 0); assert.equal(Object.keys(s.calls).length, 0);
});

test('failed store read service releases prepared diagnostic snapshots after its bounded cleanup', () => {
  const doc = fixture('social-feed'); doc.faults = [{ id: 'read-errors', atSec: 2, untilSec: 11, target: { kind: 'node', id: 'posts' }, type: 'errors', params: { rate: 1 } }];
  doc.run.horizonSec = 16; const { s } = run(doc); assert.equal(Object.keys(s.kernel.posts.readJobs).length, 0);
});
