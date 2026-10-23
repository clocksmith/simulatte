const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const libraryApi = require('../public/simulatte/system-diagram/class-library.js');
const doc = require('../public/simulatte/system-diagram/diagram.js');
const engine = require('../public/simulatte/system-diagram/engine.js');
const runnerApi = require('../public/simulatte/system-diagram/runner.js');
const kernels = require('../public/simulatte/system-diagram/kernels-all.js');
const { contentHash } = require('../public/shared/core/simulation/multirate-coordinator.js');
const config = require('../public/data/system-diagram/config.json');
const library = libraryApi.loadSync(path.join(root, 'public/data/system-diagram'));
const deps = { library, config, kernels };

const node = (id, classId, params = {}, extra = {}) => ({ id, classId, label: id, x: 0, y: 0, params, ...extra });
const edge = (id, from, fromPort, to, toPort, params = {}) => ({ id, from: { nodeId: from, portId: fromPort }, to: { nodeId: to, portId: toPort }, params });
function diagram({ nodes, edges, faults = [], groups = [], seed = 11, horizonSec = 60 }) {
  return { schema: doc.SCHEMA, id: 'test', name: 'Test', seed, run: { horizonSec }, classes: [], nodes, edges, groups, notes: [], faults, view: { x: 0, y: 0, zoom: 1 } };
}
const compile = d => doc.compile(d, library, config);
function run(d, until, options = {}) {
  const compiled = compile(d), engineDeps = options.deps || deps;
  const state = engine.initialize(compiled, engineDeps);
  for (const [at, control] of options.controls || []) { engine.advance(compiled, state, at, engineDeps); engine.applyControl(compiled, state, control, engineDeps); }
  engine.advance(compiled, state, until, engineDeps);
  return { compiled, state, view: engine.observe(compiled, state, engineDeps), metrics: engine.metrics(compiled, state, engineDeps) };
}
// A registry facade that overrides selected kernels while reusing the real registrations.
function registryWith(overrides) {
  return { has: id => Boolean(overrides[id]) || kernels.has(id), get: id => overrides[id] || kernels.get(id) };
}

const webService = (seed = 11) => diagram({
  seed,
  nodes: [node('users', 'web-client', { ratePerSec: 80 }), node('api', 'web-server', { concurrency: 8 }), node('q', 'task-queue', { prefetch: 4 }), node('w', 'worker', { concurrency: 4, serviceMs: 20 }), node('db', 'database')],
  edges: [edge('e1', 'users', 'out', 'api', 'in', { latencyMs: 10, jitterMs: 4 }), edge('e2', 'api', 'calls', 'db', 'in'), edge('e3', 'api', 'calls', 'q', 'in', { probability: 0.4, order: 1 }), edge('e4', 'q', 'consumers', 'w', 'in'), edge('e5', 'w', 'calls', 'db', 'in', { op: 'write' })],
  faults: [{ id: 'f1', atSec: 10, untilSec: 15, target: { kind: 'node', id: 'db' }, type: 'slow', params: { factor: 4 } }],
});

test('same diagram and seed reproduce the metrics hash; a different seed changes it', () => {
  const a = run(webService(), 30), b = run(webService(), 30), c = run(webService(12), 30);
  assert.ok(a.metrics.completed > 1000);
  assert.equal(contentHash(a.metrics), contentHash(b.metrics));
  assert.equal(contentHash(a.state), contentHash(b.state));
  assert.notEqual(contentHash(a.metrics), contentHash(c.metrics));
});

test('advance composes: stepping through intermediate times, with JSON clones between, equals one step', () => {
  const compiled = compile(webService());
  const direct = engine.advance(compiled, engine.initialize(compiled, deps), 25, deps);
  let stepped = engine.initialize(compiled, deps);
  for (let t = 0.37; t < 25; t += 0.731) stepped = JSON.parse(JSON.stringify(engine.advance(compiled, stepped, t, deps)));
  engine.advance(compiled, stepped, 25, deps);
  assert.deepEqual(stepped, direct);
  assert.throws(() => engine.advance(compiled, stepped, 24, deps), /finite time >= state\.t/);
});

test('an M/M/c station matches Erlang-C response time and utilization', () => {
  const lambda = 40, serviceSec = 0.05, c = 4, horizonSec = 600;
  const d = diagram({ horizonSec, seed: 3,
    nodes: [node('users', 'web-client', { ratePerSec: lambda, retries: 0, timeoutMs: 60000 }), node('svc', 'web-server', { concurrency: c, serviceMs: serviceSec * 1000, queueCapacity: 100000, responseKb: 0 })],
    edges: [edge('e1', 'users', 'out', 'svc', 'in', { latencyMs: 0 })] });
  const { state, view, metrics } = run(d, horizonSec);
  const a = lambda * serviceSec, mu = 1 / serviceSec;
  let sum = 0, fact = 1;
  for (let k = 0; k < c; k++) { if (k) fact *= k; sum += a ** k / fact; }
  const tail = a ** c / (fact * c) * (c / (c - a));
  const erlangC = tail / (sum + tail), expectedMs = (1 / mu + erlangC / (c * mu - lambda)) * 1000;
  assert.ok(Math.abs(metrics.latency.mean - expectedMs) / expectedMs < 0.06, `mean ${metrics.latency.mean} vs Erlang-C ${expectedMs}`);
  const utilization = state.st.svc.area / (c * horizonSec);
  assert.ok(Math.abs(utilization - a / c) < 0.03, `utilization ${utilization}`);
  // Little's law: mean jobs in service = throughput x mean service time.
  assert.ok(Math.abs(state.st.svc.area / horizonSec - (metrics.completed / horizonSec) * serviceSec) < 0.1);
  assert.equal(view.global.failed, 0);
});

test('lease expiry redelivers to a still-running consumer, duplicates work and dead-letters after maxReceives', () => {
  const d = diagram({ horizonSec: 30,
    nodes: [node('producer', 'burst-producer', { burstCount: 5, burstAtSec: 1 }), node('q', 'task-queue', { visibilityTimeoutMs: 100, maxReceives: 3, prefetch: 10, retryDelayMs: 0 }), node('w', 'worker', { concurrency: 10, serviceMs: 300, serviceDist: 'constant' }), node('dlq', 'dead-letter-queue')],
    edges: [edge('e1', 'producer', 'out', 'q', 'in'), edge('e2', 'q', 'consumers', 'w', 'in'), edge('e3', 'q', 'dlq', 'dlq', 'in')] });
  const { view } = run(d, 30);
  assert.equal(view.global.completed, 5, 'producers are acknowledged on enqueue');
  assert.equal(view.nodes.w.arrivals, 15, 'every message was delivered maxReceives times');
  assert.equal(view.nodes.w.served, 15, 'expired leases did not cancel running work');
  assert.equal(view.nodes.q.detail['lease expiries'], 15);
  assert.equal(view.nodes.q.detail.redeliveries, 10);
  assert.equal(view.nodes.q.detail['dead-lettered'], 5);
  assert.equal(view.nodes.dlq.detail['dead letters'], 5);
  assert.equal(view.global.wastedWork, 15, 'late consumer replies are wasted work');
  assert.ok(view.log.some(row => row.kind === 'dead-letter'));
});

test('dropped replies duplicate effects only when writes are not idempotent', () => {
  const build = classId => diagram({ horizonSec: 20,
    nodes: [node('users', 'api-consumer', { ratePerSec: 10, readFraction: 0, retries: 2, timeoutMs: 200, retryBackoffMs: 10 }), node('db', classId)],
    edges: [edge('e1', 'users', 'out', 'db', 'in')],
    faults: [{ id: 'f1', atSec: 0, untilSec: null, target: { kind: 'node', id: 'db' }, type: 'dropReplies', params: {} }] });
  const plain = run(build('database'), 20).view, idem = run(build('idempotent-store'), 20).view;
  for (const view of [plain, idem]) {
    assert.ok(view.global.failedBy.timeout > 100);
    assert.ok(view.global.attempts > view.global.offered * 2.5, 'each request made three attempts');
    assert.equal(view.global.retries, view.global.attempts - view.global.offered);
  }
  assert.ok(plain.global.duplicateEffects > 100);
  assert.equal(plain.nodes.db.detail['duplicate effects'], plain.global.duplicateEffects);
  assert.equal(idem.global.duplicateEffects, 0);
  assert.ok(idem.nodes.db.detail['suppressed duplicates'] > 100);
  // One effect per logical request that reached the store; requests still in flight may have committed already.
  assert.ok(idem.global.effects <= idem.global.offered && idem.global.effects >= idem.global.offered - idem.global.inFlight);
});

test('crash refuses with down and resets in-flight work; repair restores service', () => {
  const d = diagram({ horizonSec: 20,
    nodes: [node('users', 'web-client', { ratePerSec: 50, retries: 0 }), node('api', 'web-server', { concurrency: 2, serviceMs: 30 })],
    edges: [edge('e1', 'users', 'out', 'api', 'in')],
    faults: [{ id: 'f1', atSec: 5, untilSec: 10, target: { kind: 'node', id: 'api' }, type: 'crash', params: {} }] });
  const compiled = compile(d), state = engine.initialize(compiled, deps);
  engine.advance(compiled, state, 7, deps);
  const during = engine.observe(compiled, state, deps);
  assert.equal(during.nodes.api.health, 'down');
  assert.deepEqual(during.nodes.api.faults, ['crash']);
  assert.ok(during.global.failedBy.down > 50);
  assert.equal(during.nodes.api.busy, 0);
  const completedAt7 = during.global.completed;
  engine.advance(compiled, state, 10, deps);
  const downAtRepair = engine.observe(compiled, state, deps).global.failedBy.down;
  engine.advance(compiled, state, 20, deps);
  const after = engine.observe(compiled, state, deps);
  assert.notEqual(after.nodes.api.health, 'down');
  assert.ok(after.global.completed - completedAt7 > 400);
  assert.equal(after.global.failedBy.down, downAtRepair, 'down failures stop once the node is repaired');
  assert.ok(after.log.some(row => row.kind === 'repair' && row.nodeId === 'api'));
});

test('a partitioned edge turns calls into timeouts and is visible on the edge', () => {
  const d = diagram({ horizonSec: 20,
    nodes: [node('users', 'web-client', { ratePerSec: 20, retries: 0, timeoutMs: 500 }), node('api', 'web-server')],
    edges: [edge('e1', 'users', 'out', 'api', 'in')],
    faults: [{ id: 'p1', atSec: 5, untilSec: 10, target: { kind: 'edge', id: 'e1' }, type: 'partition', params: {} }] });
  const compiled = compile(d), state = engine.initialize(compiled, deps);
  engine.advance(compiled, state, 9.5, deps);
  const view = engine.observe(compiled, state, deps);
  assert.deepEqual(view.edges.e1.faults, ['partition']);
  assert.ok(view.edges.e1.errorRate > 0.8, `windowed error rate ${view.edges.e1.errorRate}`);
  engine.advance(compiled, state, 20, deps);
  const final = engine.observe(compiled, state, deps);
  assert.ok(final.global.failedBy.timeout > 80 && final.global.failedBy.timeout < 120);
  assert.equal(final.global.failed, final.global.failedBy.timeout);
});

test('engine retries and kernel-declared retries count as attempts distinct from requests', () => {
  const d = diagram({ horizonSec: 30,
    nodes: [node('users', 'web-client', { ratePerSec: 20, retries: 3, retryBackoffMs: 5 }), node('api', 'third-party-api', { rateLimitPerSec: 0 })],
    edges: [edge('e1', 'users', 'out', 'api', 'in')],
    faults: [{ id: 'f1', atSec: 0, untilSec: null, target: { kind: 'node', id: 'api' }, type: 'errors', params: { rate: 0.5 } }] });
  const { view } = run(d, 30);
  assert.ok(view.global.offered > 500);
  assert.ok(view.global.attempts > view.global.offered * 1.6);
  assert.equal(view.global.retries, view.global.attempts - view.global.offered);
  assert.ok(view.global.failedBy.error < view.global.offered * 0.1, 'retries mask most errors');
  // A kernel issuing its own second call declares retryOf so the call counts as a retry.
  const service = kernels.get('service');
  const retrying = { ...service, onServed(ctx, job) { ctx.call(job, ctx.edges('calls')[0].id, {}, { timeoutMs: 1000, retryOf: 1 }); }, onResult(ctx, job, slot, result) { ctx.reply(job, { ok: result.ok, err: result.err }); } };
  const chain = diagram({ horizonSec: 10,
    nodes: [node('users', 'web-client', { ratePerSec: 10, retries: 0 }), node('api', 'web-server'), node('db', 'database')],
    edges: [edge('e1', 'users', 'out', 'api', 'in'), edge('e2', 'api', 'calls', 'db', 'in')] });
  const declared = run(chain, 10, { deps: { ...deps, kernels: registryWith({ service: retrying }) } }).view;
  assert.equal(declared.global.retries, declared.nodes.db.arrivals);
  assert.equal(declared.global.attempts, declared.global.offered + declared.nodes.db.arrivals);
});

test('live setParams changes station concurrency mid-run and calls onParams', () => {
  const d = diagram({ horizonSec: 30,
    nodes: [node('users', 'web-client', { ratePerSec: 20, retries: 0, timeoutMs: 60000 }), node('api', 'web-server', { concurrency: 1, serviceMs: 100, serviceDist: 'constant', queueCapacity: 100000 })],
    edges: [edge('e1', 'users', 'out', 'api', 'in')] });
  const compiled = compile(d), state = engine.initialize(compiled, deps);
  engine.advance(compiled, state, 10, deps);
  const before = engine.observe(compiled, state, deps);
  assert.equal(before.nodes.api.capacity, 1);
  assert.ok(before.nodes.api.queue > 50);
  engine.applyControl(compiled, state, { kind: 'setParams', target: { kind: 'node', id: 'api' }, params: { concurrency: 4 } }, deps);
  assert.equal(engine.observe(compiled, state, deps).nodes.api.busy, 4, 'queued work starts on the new workers at once');
  engine.advance(compiled, state, 30, deps);
  const after = engine.observe(compiled, state, deps);
  assert.equal(after.nodes.api.capacity, 4);
  assert.equal(after.nodes.api.queue, 0);
  assert.ok(after.nodes.api.throughput > 15);
  assert.throws(() => engine.applyControl(compiled, state, { kind: 'setParams', target: { kind: 'node', id: 'api' }, params: { concurrency: 0 } }, deps), /integer in \[1, 100000\]/);
  assert.throws(() => engine.applyControl(compiled, state, { kind: 'setParams', target: { kind: 'node', id: 'api' }, params: { bogus: 1 } }, deps), /declared parameter/);
  const seen = [];
  const endpoint = kernels.get('endpoint');
  const watched = registryWith({ endpoint: { ...endpoint, onParams(ctx, keys) { seen.push([ctx.nodeId, keys, ctx.p.rateBurst]); } } });
  const ep = diagram({ horizonSec: 5, nodes: [node('users', 'web-client'), node('ext', 'third-party-api')], edges: [edge('e1', 'users', 'out', 'ext', 'in')] });
  run(ep, 5, { deps: { ...deps, kernels: watched }, controls: [[2, { kind: 'setParams', target: { kind: 'node', id: 'ext' }, params: { rateBurst: 3 } }]] });
  assert.deepEqual(seen, [['ext', ['rateBurst'], 3]]);
});

test('a declared down bypass forwards arrivals to a crashed node downstream and relays replies', () => {
  const service = kernels.get('service');
  const bypassing = registryWith({ service: { ...service, bypass: { port: 'calls', param: 'blockingCalls' } } });
  const d = diagram({ horizonSec: 20,
    nodes: [node('users', 'web-client', { ratePerSec: 20, retries: 0 }), node('front', 'web-server'), node('origin', 'database')],
    edges: [edge('e1', 'users', 'out', 'front', 'in'), edge('e2', 'front', 'calls', 'origin', 'in')],
    faults: [{ id: 'f1', atSec: 5, untilSec: 10, target: { kind: 'node', id: 'front' }, type: 'crash', params: {} }] });
  const relayed = run(d, 20, { deps: { ...deps, kernels: bypassing } }).view, plain = run(d, 20).view;
  assert.ok(relayed.nodes.front.detail.bypassed > 80);
  assert.ok((relayed.global.failedBy.down || 0) <= 2, 'only jobs in flight at the crash instant reply down');
  assert.ok(plain.global.failedBy.down > 80);
  const badDecl = registryWith({ service: { ...service, bypass: { port: 'calls', param: 'retries' } } });
  assert.throws(() => run(d, 1, { deps: { ...deps, kernels: badDecl } }), /boolean parameter of kernel service/);
});

test('exceeding maxInFlight stops the run with a visible error instead of dropping work', () => {
  const tight = { ...config, engine: { ...config.engine, maxInFlight: 50 } };
  const d = diagram({ horizonSec: 30,
    nodes: [node('users', 'web-client', { ratePerSec: 500, timeoutMs: 60000 }), node('api', 'web-server', { concurrency: 1, serviceMs: 100, queueCapacity: 100000 })],
    edges: [edge('e1', 'users', 'out', 'api', 'in')] });
  const compiled = doc.compile(d, library, tight), tightDeps = { ...deps, config: tight };
  const state = engine.initialize(compiled, tightDeps);
  engine.advance(compiled, state, 10, tightDeps);
  const view = engine.observe(compiled, state, tightDeps);
  assert.match(view.error, /maxInFlight bound: expected at most 50/);
  assert.equal(view.done, true);
  assert.ok(view.log.some(row => row.kind === 'error'));
  const frozen = contentHash(engine.metrics(compiled, state, tightDeps).nodes);
  engine.advance(compiled, state, 20, tightDeps);
  assert.equal(contentHash(engine.metrics(compiled, state, tightDeps).nodes), frozen, 'no events run after the bound stops the run');
});

test('an unregistered kernel fails closed and names the kernel', () => {
  const missing = { has: id => id !== 'database' && kernels.has(id), get: id => kernels.get(id) };
  assert.throws(() => run(webService(), 1, { deps: { ...deps, kernels: missing } }), /node db\.kernel: expected a kernel registered .* received "database"/);
});

test('runner display preview equals the coordinator, verify matches and the replay document round-trips', async () => {
  const runner = await runnerApi.create({ diagram: webService(), library, config, kernels, profileId: 'system-diagram' });
  for (let t = 0; t < 12; t += 1 / 30) runner.advanceTo(t);
  await runner.pump(5);
  const crash = runner.inject({ kind: 'fault', target: { kind: 'node', id: 'w' }, type: 'crash' });
  assert.equal(crash.atSec, runner.time());
  assert.throws(() => runner.inject({ kind: 'fault', target: { kind: 'node', id: 'users' }, type: 'slow' }), /fault supported by kernel source/);
  runner.advanceTo(14.123);
  runner.inject({ kind: 'repair', target: { kind: 'node', id: 'w' } });
  runner.inject({ kind: 'setParams', target: { kind: 'edge', id: 'e1' }, params: { latencyMs: 40 } });
  runner.advanceTo(99);
  assert.equal(runner.time(), 60, 'advanceTo clamps to the horizon');
  assert.equal((await runner.sync()).status, 'match');
  const verified = await runner.verify();
  assert.equal(verified.status, 'match');
  assert.equal(verified.ledger, 'match');
  assert.ok(verified.rounds >= 120);
  const spec = runner.program();
  assert.equal(spec.params.seed, 11);
  assert.equal(spec.params.profileId, 'system-diagram');
  assert.equal(spec.params.libraryVersion, library.version);
  const replay = JSON.parse(JSON.stringify(runner.exportReplay()));
  assert.equal(replay.controls.length, 3);
  assert.equal(replay.metricsHash, verified.metricsHash);
  const checked = runnerApi.replay(replay, { ...deps, profileId: 'system-diagram' });
  assert.equal(checked.status, 'match');
  assert.equal(checked.worldSpecMatch, true);
  assert.equal(runnerApi.replay({ ...replay, metricsHash: 'fnv1a32:00000000' }, deps).status, 'diverged');
  const cp = await runner.checkpoint();
  await runner.restore(cp);
  assert.equal((await runner.sync()).status, 'match');
  await runner.dispose();
});
