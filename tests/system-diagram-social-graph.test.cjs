const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const base = '../public/simulatte/system-diagram/';
const library = require(base + 'class-library.js').loadSync(path.resolve(__dirname, '../public/data/system-diagram'));
const config = require('../public/data/system-diagram/config.json'), kernels = require(base + 'kernels-all.js');
const D = require(base + 'diagram.js'), E = require(base + 'engine.js'), C = require(base + 'engine-core.js');
const O = require(base + 'engine-observability.js'), deps = { library, config, kernels };
const clone = value => JSON.parse(JSON.stringify(value));
const params = (doc, id, patch) => Object.assign(doc.nodes.find(node => node.id === id).params, patch);
function fixture() {
  const doc = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/system-diagram/social-feed.json'), 'utf8'));
  params(doc, 'posts', { graphMode: 'external' });
  doc.nodes.push({ id: 'graph', classId: 'social-graph-store', label: 'Users and follows', x: 270, y: -200, params: {} });
  doc.edges.push({ id: 'post-graph', from: { nodeId: 'posts', portId: 'graph' }, to: { nodeId: 'graph', portId: 'in' }, params: {} });
  return doc;
}
function start(doc = fixture(), dependencies = deps) {
  const compiled = D.compile(doc, library, config), state = E.initialize(compiled, dependencies);
  return { compiled, state, deps: dependencies };
}
function advance(run, time = 12) {
  E.advance(run.compiled, run.state, time, run.deps); assert.equal(run.state.error, null); assert.ok(O.reconcile(run.state));
  return E.observe(run.compiled, run.state, run.deps);
}
function manualDoc(mode = 'pull') {
  const doc = fixture(); doc.faults = [];
  params(doc, 'users', { userCount: 4, celebrityFollowers: 3, followsPerUser: 0, postCount: 0, readCount: 0, retries: 0 });
  params(doc, 'posts', { fanoutMode: mode, callTimeoutMs: 80, retries: 0 });
  params(doc, 'feed', { callTimeoutMs: 300, retries: 0 });
  return doc;
}
function issue(run, social, port = 'write') {
  const ctx = C.ctxOf(C.runtime(run.compiled, run.state, run.deps), 'users');
  const message = ctx.message({ ptype: 'json', kb: 1, op: port === 'read' ? 'read' : 'write', fields: { social } });
  ctx.beginRequest(message); const job = ctx.newJob(message); ctx.k.outstanding++;
  ctx.call(job, ctx.edges(port)[0].id, {}, { timeoutMs: 1000, slot: { kind: 'manual' } });
  const view = advance(run, run.state.t + .5);
  return { view, request: view.requests.find(request => request.id === message.trace) };
}
const post = (id, authorId = 'user-0') => ({ kind: 'post', post: { id, authorId, text: id, createdAt: 1 } });
const graphControl = (run, kind, type) => E.applyControl(run.compiled, run.state, { kind, target: { kind: 'node', id: 'graph' }, ...(type ? { type, params: {} } : {}) }, run.deps);

test('separate graph owns actual users and follows; post-store and timelines match an independent oracle', () => {
  const run = start(); advance(run, .6); const checkpoint = clone(run.state), view = advance(run);
  E.advance(run.compiled, checkpoint, 12, run.deps); assert.deepEqual(checkpoint, run.state);
  const replay = start(); advance(replay); assert.deepEqual(replay.state, run.state);
  assert.equal(view.global.completed, 148); assert.equal(view.global.failed, 0); assert.equal(view.global.effects, 88);
  assert.equal(view.nodes.graph.detail.Users, 16); assert.equal(view.nodes.graph.detail.Follows, 45);
  assert.equal(view.nodes.graph.detail['Graph reads'], 102); assert.equal(view.nodes.posts.detail['Graph requests'], 148);
  assert.equal(Object.hasOwn(run.state.kernel.posts, 'users'), false); assert.equal(Object.hasOwn(run.state.kernel.posts, 'follows'), false);
  const follows = [];
  for (let reader = 1; reader <= 15; reader++) {
    follows.push([`user-${reader}`, 'user-0']);
    for (let delta = 1; delta <= 2; delta++) follows.push([`user-${reader}`, `user-${1 + (reader - 1 + delta) % 15}`]);
  }
  assert.deepEqual(view.nodes.graph.records.follows.map(row => [row.followerId, row.authorId]).sort(), follows.sort());
  const posts = Array.from({ length: 12 }, (_, i) => ({ id: `users:post-${i + 1}`, authorId: i % 3 === 0 ? 'user-0' : `user-${1 + i % 15}` }));
  const expected = posts.flatMap(row => follows.filter(([, author]) => row.authorId === author).map(([reader]) => `${reader}/${row.id}`)).sort();
  assert.deepEqual(view.nodes.timelines.records.entries.map(row => `${row.userId}/${row.postId}`).sort(), expected);
  assert.ok(view.nodes.posts.records.posts.every(row => row.graphRevision === 46 && row.graphSnapshotAt >= row.createdAt));
  const original = clone(run.state); view.nodes.graph.records.users[0].userId = 'changed'; view.nodes.graph.records.follows[0].authorId = 'changed'; assert.deepEqual(run.state, original);
});

test('acknowledged follow/unfollow mutations govern both publish recipients and current feed visibility', () => {
  const run = start(manualDoc()); advance(run, 1);
  assert.equal(issue(run, { kind: 'follow', followerId: 'user-1', authorId: 'user-2' }).request.status, 'completed');
  const revision = run.state.kernel.graph.revision;
  issue(run, { kind: 'follow', followerId: 'user-1', authorId: 'user-2' }); assert.equal(run.state.kernel.graph.revision, revision);
  issue(run, post('visible', 'user-2'));
  const stored = Object.values(run.state.kernel.posts.posts)[0]; assert.deepEqual(stored.recipients, ['user-1']); assert.equal(stored.graphRevision, revision);
  let result = issue(run, { kind: 'feed', userId: 'user-1' }, 'read'); assert.deepEqual(result.view.nodes.feed.records.reads.at(-1).postIds, ['visible']);
  issue(run, { kind: 'unfollow', followerId: 'user-1', authorId: 'user-2' });
  issue(run, post('not-visible', 'user-2'));
  result = issue(run, { kind: 'feed', userId: 'user-1' }, 'read'); assert.deepEqual(result.view.nodes.feed.records.reads.at(-1).postIds, []);
  assert.deepEqual(Object.values(run.state.kernel.posts.posts)[1].recipients, []);
  assert.deepEqual(stored.recipients, ['user-1'], 'committed post audience is an immutable publication snapshot');
  const before = clone(run.state.kernel.graph.follows);
  assert.equal(issue(run, { kind: 'follow', followerId: 'user-99', authorId: 'user-2' }).request.status, 'failed');
  assert.equal(issue(run, post('unknown-author', 'user-99')).request.status, 'failed');
  assert.equal(issue(run, { kind: 'feed', userId: 'user-99' }, 'read').request.status, 'failed');
  assert.deepEqual(run.state.kernel.graph.follows, before); assert.equal(Object.keys(run.state.kernel.posts.posts).length, 2);
});

test('graph outage rejects publishing, following and feed reads without fabricating recipients or losing durable graph state', () => {
  const run = start(manualDoc()); advance(run, 1); issue(run, post('before-outage'));
  const graph = clone(run.state.kernel.graph); graphControl(run, 'fault', 'crash');
  assert.equal(issue(run, post('during-outage')).request.status, 'failed');
  assert.equal(issue(run, { kind: 'follow', followerId: 'user-1', authorId: 'user-2' }).request.status, 'failed');
  let result = issue(run, { kind: 'feed', userId: 'user-1' }, 'read'); assert.equal(result.request.status, 'failed');
  assert.equal(Object.keys(run.state.kernel.posts.posts).length, 1); assert.equal(result.view.nodes.feed.records.reads.length, 0);
  assert.deepEqual(run.state.kernel.graph, graph); assert.equal(result.view.nodes.posts.detail['Graph failures'], 3);
  graphControl(run, 'repair'); issue(run, post('after-repair'));
  result = issue(run, { kind: 'feed', userId: 'user-1' }, 'read'); assert.equal(result.request.status, 'completed');
  assert.deepEqual(result.view.nodes.feed.records.reads.at(-1).postIds.sort(), ['after-repair', 'before-outage']);
});

test('lost graph replies retain real follow state but cannot authorize an unacknowledged post or feed', () => {
  const run = start(manualDoc()); advance(run, 1); graphControl(run, 'fault', 'dropReplies');
  assert.equal(issue(run, { kind: 'follow', followerId: 'user-1', authorId: 'user-2' }).request.status, 'timed-out');
  assert.ok(run.state.kernel.graph.follows.some(row => row.followerId === 'user-1' && row.authorId === 'user-2'));
  const revision = run.state.kernel.graph.revision;
  assert.equal(issue(run, post('unacknowledged')).request.status, 'timed-out'); assert.equal(Object.keys(run.state.kernel.posts.posts).length, 0);
  assert.equal(issue(run, { kind: 'feed', userId: 'user-1' }, 'read').request.status, 'timed-out');
  graphControl(run, 'repair'); issue(run, { kind: 'follow', followerId: 'user-1', authorId: 'user-2' });
  assert.equal(run.state.kernel.graph.revision, revision); assert.equal(run.state.kernel.graph.duplicates, 1);
  assert.equal(issue(run, post('acknowledged', 'user-2')).request.status, 'completed');
  assert.deepEqual(Object.values(run.state.kernel.posts.posts)[0].recipients, ['user-1']);
});

test('graph blackholes settle bounded failures and release all parent jobs and prepared reads', () => {
  const run = start(manualDoc()); advance(run, 1); graphControl(run, 'fault', 'blackhole');
  issue(run, post('blackhole')); issue(run, { kind: 'feed', userId: 'user-1' }, 'read'); advance(run, 5);
  assert.equal(Object.keys(run.state.kernel.posts.posts).length, 0); assert.deepEqual(run.state.kernel.posts.readJobs, {});
  assert.equal(Object.keys(run.state.calls).length, 0); assert.equal(Object.keys(run.state.jobs).length, 0);
});

test('record capacity rejects excess graph mutations without changing authoritative relations', () => {
  const doc = manualDoc(); params(doc, 'graph', { maxRecords: 7 }); const run = start(doc); advance(run, 1);
  assert.equal(run.state.kernel.graph.users.length, 4); assert.equal(run.state.kernel.graph.follows.length, 3);
  assert.equal(issue(run, { kind: 'follow', followerId: 'user-1', authorId: 'user-2' }).request.status, 'rejected');
  assert.equal(run.state.kernel.graph.follows.length, 3); assert.equal(run.state.kernel.graph.revision, 4);
  assert.equal(issue(run, { kind: 'follow', followerId: 'user-1', authorId: 'user-0' }).request.status, 'completed');
  issue(run, { kind: 'unfollow', followerId: 'user-1', authorId: 'user-0' });
  assert.equal(issue(run, { kind: 'follow', followerId: 'user-1', authorId: 'user-2' }).request.status, 'completed');
  assert.equal(run.state.kernel.graph.follows.length, 3);
});

test('invalid acknowledged graph responses fail closed before post effects', () => {
  for (const invalid of [{ recipients: ['user-1', 'user-1'] }, { recipients: ['invented'] }, { recipients: ['user-0'] }, { authorId: 'user-99' }, { revision: -1 }, { snapshotAt: 1000 }, { kind: 'bootstrap' }]) {
    const original = kernels.get('socialGraph'), broken = { ...original, onServed(ctx, job) {
      const e = job.msg.fields.social;
      if (e.kind !== 'recipients') { original.onServed(ctx, job); return; }
      ctx.reply(job, { ok: true, fields: { social: { kind: 'recipients', authorId: e.authorId, recipients: ['user-1'], revision: ctx.k.revision, snapshotAt: ctx.t, ...invalid } } });
    } };
    const run = start(manualDoc(), { ...deps, kernels: { has: id => kernels.has(id), get: id => id === 'socialGraph' ? broken : kernels.get(id) } }); advance(run, 1);
    assert.equal(issue(run, post('forged')).request.status, 'failed'); assert.equal(Object.keys(run.state.kernel.posts.posts).length, 0);
  }
});

test('malformed followed-author replies cannot expose cached or pulled feed records', () => {
  const original = kernels.get('socialGraph'), broken = { ...original, onServed(ctx, job) {
    const e = job.msg.fields.social;
    if (e.kind !== 'following') { original.onServed(ctx, job); return; }
    ctx.reply(job, { ok: true, fields: { social: { kind: 'following', userId: 'user-2', authorIds: ['user-0'], revision: ctx.k.revision, snapshotAt: ctx.t } } });
  } };
  const run = start(manualDoc(), { ...deps, kernels: { has: id => kernels.has(id), get: id => id === 'socialGraph' ? broken : kernels.get(id) } }); advance(run, 1);
  issue(run, post('stored'));
  assert.equal(issue(run, { kind: 'feed', userId: 'user-1' }, 'read').request.status, 'failed');
  assert.equal(run.state.kernel.feed.reads.length, 0); assert.deepEqual(run.state.kernel.posts.readJobs, {});
});

test('conflicting bootstrap cannot replace live users or relations', () => {
  const run = start(manualDoc()); advance(run, 1); const original = clone(run.state.kernel.graph);
  assert.equal(issue(run, { kind: 'bootstrap', users: ['user-0', 'user-1'], follows: [] }).request.status, 'failed');
  assert.deepEqual(run.state.kernel.graph.users, original.users); assert.deepEqual(run.state.kernel.graph.follows, original.follows);
  assert.equal(run.state.kernel.graph.revision, original.revision);
});

test('graph route rejects async acknowledgements, wrong terminals and divergent graph authorities', () => {
  const async = fixture(); async.edges.find(edge => edge.id === 'post-graph').params.mode = 'async'; assert.throws(() => start(async), /synchronous|acknowledged sync/);
  const wrong = fixture(); wrong.edges.find(edge => edge.id === 'post-graph').to.nodeId = 'timelines'; assert.throws(() => start(wrong), /socialGraph/);
  const routed = fixture(); routed.nodes.push({ id: 'graph-gateway', classId: 'microservice', label: 'Graph gateway', x: 0, y: 0, params: {} });
  routed.edges.find(edge => edge.id === 'post-graph').to.nodeId = 'graph-gateway';
  routed.edges.push({ id: 'gateway-graph', from: { nodeId: 'graph-gateway', portId: 'calls' }, to: { nodeId: 'graph', portId: 'in' }, params: {} });
  const view = advance(start(routed)); assert.equal(view.global.completed, 148); assert.equal(view.nodes.graph.detail.Follows, 45);
  const split = fixture(); split.nodes.push({ id: 'graph-lb', classId: 'load-balancer', label: 'Graph router', x: 0, y: 0, params: {} }, { id: 'other-graph', classId: 'social-graph-store', label: 'Independent graph', x: 0, y: 0, params: {} });
  split.edges.find(edge => edge.id === 'post-graph').to.nodeId = 'graph-lb';
  for (const id of ['graph', 'other-graph']) split.edges.push({ id: `route-${id}`, from: { nodeId: 'graph-lb', portId: 'backends' }, to: { nodeId: id, portId: 'in' }, params: {} });
  assert.throws(() => start(split), /one authoritative protocol endpoint/);
});

test('external graph mode rejects deleted dependencies instead of seeding legacy users', () => {
  const doc = fixture(); doc.nodes = doc.nodes.filter(node => node.id !== 'graph'); doc.edges = doc.edges.filter(edge => edge.id !== 'post-graph');
  assert.throws(() => start(doc), /posts\.graph requires a connected external socialGraph\.in authority; legacy bundled state is disabled/);
  const missingEdge = fixture(); missingEdge.edges = missingEdge.edges.filter(edge => edge.id !== 'post-graph');
  assert.throws(() => start(missingEdge), /graph/);
  const publicDoc = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../public/data/system-diagram/examples/social-feed.json'), 'utf8'));
  publicDoc.edges = publicDoc.edges.filter(edge => edge.from.nodeId !== 'posts' || edge.from.portId !== 'graph');
  assert.throws(() => start(publicDoc), /posts\.graph requires a connected external socialGraph/);
  const run = start(); advance(run, 1);
  assert.throws(() => E.applyControl(run.compiled, run.state, { kind: 'setParams', target: { kind: 'node', id: 'posts' }, params: { graphMode: 'legacy-compatible' } }, run.deps), /immutable parameter/);
  const kernel = kernels.get('socialStore'), isolated = kernel.init({ p: { graphMode: 'external' }, edges: () => [] });
  assert.equal(isolated.graphBacked, true); assert.equal(Object.hasOwn(isolated, 'users'), false); assert.equal(Object.hasOwn(isolated, 'follows'), false);
});

test('graph and social replies charge exact UTF-8 bytes in decimal kilobytes', () => {
  let response;
  const graph = kernels.get('socialGraph'), graphCtx = { k: graph.init(), p: { maxRecords: 10, responseKb: 2 }, t: 1.5, reply: (_, value) => { response = value; } };
  graph.onServed(graphCtx, { msg: { fields: { social: { kind: 'bootstrap', users: ['user-0', 'user-1'], follows: [] } } } });
  assert.equal(response.kb, 2 + Buffer.byteLength(JSON.stringify(response.fields.social), 'utf8') / 1000);
  const timeline = kernels.get('socialTimeline'), timelineCtx = { k: timeline.init(), p: { responseKb: 3 }, reply: (_, value) => { response = value; } };
  timelineCtx.k.entries.example = { userId: 'user-1', post: { id: 'unicode', authorId: 'user-0', text: 'Caf\u00e9 \u2603', createdAt: 0 } };
  timeline.onServed(timelineCtx, { msg: { fields: { social: { kind: 'feed', userId: 'user-1' } } } });
  const wire = JSON.stringify(response.fields.social); assert.ok(Buffer.byteLength(wire, 'utf8') > wire.length);
  assert.equal(response.kb, 3 + Buffer.byteLength(wire, 'utf8') / 1000);
});
