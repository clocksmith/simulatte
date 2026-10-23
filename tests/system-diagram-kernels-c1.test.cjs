const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const libraryApi = require('../public/simulatte/system-diagram/class-library.js');
const doc = require('../public/simulatte/system-diagram/diagram.js');
const engine = require('../public/simulatte/system-diagram/engine.js');
const kernels = require('../public/simulatte/system-diagram/kernels-all.js');
const config = require('../public/data/system-diagram/config.json');
const library = libraryApi.loadSync(path.join(root, 'public/data/system-diagram'));
const deps = { library, config, kernels };

// Terminal backend with deterministic service so routing effects dominate the measurements.
const BACKEND = { concurrency: 64, serviceMs: 5, serviceDist: 'constant', queueCapacity: 1000, rateLimitPerSec: 0 };

function diagram({ seed = 11, horizonSec = 60, nodes, edges, faults = [] }) {
  return {
    schema: doc.SCHEMA, id: 'c1', name: 'C1 kernel test', seed, run: { horizonSec },
    classes: [],
    nodes: nodes.map((n, i) => ({ id: n.id, classId: n.classId, label: n.id, x: i * 200, y: 0, params: n.params || {} })),
    edges: edges.map(([from, fromPort, to, toPort, params], i) => ({ id: `e${i + 1}`, from: { nodeId: from, portId: fromPort }, to: { nodeId: to, portId: toPort }, params: params || {} })),
    groups: [], notes: [],
    faults: faults.map((f, i) => ({ id: `f${i + 1}`, atSec: f.at, untilSec: f.until === undefined ? null : f.until, target: { kind: 'node', id: f.node }, type: f.type, params: f.params || {} })),
    view: { x: 0, y: 0, zoom: 1 },
  };
}

// Runs the diagram and returns observe() views at each requested time.
function run(input, times) {
  const compiled = doc.compile(doc.validate(input, library, config), library, config);
  let state = engine.initialize(compiled, deps);
  const views = {};
  for (const t of [...times].sort((a, b) => a - b)) {
    state = engine.advance(compiled, state, t, deps);
    views[t] = engine.observe(compiled, state, deps);
  }
  return { compiled, state, views, metrics: () => engine.metrics(compiled, state, deps) };
}
const arrivals = (view, id) => view.nodes[id].arrivals;
const logHas = (view, pattern) => view.log.some(entry => pattern.test(entry.message));

function lbDiagram(seed) {
  return diagram({
    seed, horizonSec: 30,
    nodes: [
      { id: 'users', classId: 'web-client', params: { ratePerSec: 120, retries: 0, timeoutMs: 2000 } },
      { id: 'lb', classId: 'load-balancer', params: { strategy: 'round-robin', retries: 1, ejectAfterErrors: 3, ejectSec: 60 } },
      { id: 'b1', classId: 'data-warehouse', params: BACKEND },
      { id: 'b2', classId: 'data-warehouse', params: BACKEND },
      { id: 'b3', classId: 'data-warehouse', params: BACKEND },
    ],
    edges: [['users', 'out', 'lb', 'in'], ['lb', 'backends', 'b1', 'in'], ['lb', 'backends', 'b2', 'in'], ['lb', 'backends', 'b3', 'in']],
    faults: [{ node: 'b3', type: 'crash', at: 10 }],
  });
}

test('load balancer spreads load evenly and ejects a crashed backend', () => {
  const { views } = run(lbDiagram(11), [9.9, 30]);
  const before = views[9.9], after = views[30];
  const counts = ['b1', 'b2', 'b3'].map(id => arrivals(before, id));
  const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
  assert.ok(mean > 300, `backends received ${counts}`);
  for (const c of counts) assert.ok(Math.abs(c - mean) / mean < 0.05, `round-robin spread ${counts}`);
  assert.ok(after.nodes.lb.detail.Ejections >= 1, JSON.stringify(after.nodes.lb.detail));
  assert.equal(after.nodes.lb.health, 'degraded');
  assert.ok(logHas(after, /Ejected backend/));
  // Retries on another backend hide the crash from clients apart from the detection window.
  assert.ok(after.global.failed <= 3, `client failures ${after.global.failed}`);
  const b3Late = arrivals(after, 'b3') - arrivals(before, 'b3');
  assert.ok(b3Late <= 5, `crashed backend kept receiving ${b3Late} requests`);
  assert.ok(arrivals(after, 'b1') - arrivals(before, 'b1') > 1200);
});

test('circuit breaker opens under a failing dependency, fails fast and closes after repair', () => {
  const input = diagram({
    horizonSec: 30,
    nodes: [
      { id: 'users', classId: 'web-client', params: { ratePerSec: 50, retries: 0, timeoutMs: 2000 } },
      { id: 'cb', classId: 'circuit-breaker', params: { minRequests: 10, windowSec: 2, openSec: 1, halfOpenProbes: 3, failureThreshold: 0.5, callTimeoutMs: 500 } },
      { id: 'dep', classId: 'data-warehouse', params: BACKEND },
    ],
    edges: [['users', 'out', 'cb', 'in'], ['cb', 'protected', 'dep', 'in']],
    faults: [{ node: 'dep', type: 'errors', at: 5, until: 15, params: { rate: 1 } }],
  });
  const { views } = run(input, [4.9, 7, 14.9, 17, 25]);
  assert.equal(views[4.9].nodes.cb.detail.State, 'closed');
  assert.ok(['open', 'degraded'].includes(views[7].nodes.cb.health), views[7].nodes.cb.health);
  assert.ok(logHas(views[7], /Circuit opened/));
  const offered = views[14.9].global.offered - views[7].global.offered;
  const reached = arrivals(views[14.9], 'dep') - arrivals(views[7], 'dep');
  assert.ok(reached < offered * 0.25, `dependency saw ${reached} of ${offered} requests while open`);
  assert.ok((views[14.9].global.failedBy['circuit-open'] || 0) > 200);
  assert.equal(views[25].nodes.cb.detail.State, 'closed');
  assert.ok(logHas(views[25], /Circuit closed/));
  // The circuit stays open for at most openSec after repair, then probes close it.
  const lateFailed = views[25].global.failed - views[17].global.failed;
  assert.ok(lateFailed === 0, `failures after the circuit closed ${lateFailed}`);
});

function retryStorm(retryBudget) {
  return diagram({
    horizonSec: 20,
    nodes: [
      { id: 'users', classId: 'web-client', params: { ratePerSec: 100, retries: 0, timeoutMs: 10000 } },
      { id: 'retry', classId: 'retry-policy', params: { maxAttempts: 5, attemptTimeoutMs: 200, backoffMs: 5, retryBudget } },
      { id: 'dep', classId: 'data-warehouse', params: BACKEND },
    ],
    edges: [['users', 'out', 'retry', 'in'], ['retry', 'target', 'dep', 'in']],
    faults: [{ node: 'dep', type: 'errors', at: 0, params: { rate: 1 } }],
  });
}

test('retry budget limits a retry storm against a failing dependency', () => {
  const bounded = run(retryStorm(0.2), [20]).views[20];
  const unbounded = run(retryStorm(20), [20]).views[20];
  const ratio = v => arrivals(v, 'dep') / arrivals(v, 'retry');
  assert.ok(ratio(bounded) <= 1.25, `bounded amplification ${ratio(bounded)}`);
  assert.ok(ratio(unbounded) >= 4.5, `unbounded amplification ${ratio(unbounded)}`);
  assert.ok(bounded.nodes.retry.detail['Budget exhausted'] > 1000);
  assert.equal(unbounded.nodes.retry.detail['Budget exhausted'], 0);
});

test('sticky failover switches after repeated primary failures and fails back later', () => {
  const input = diagram({
    horizonSec: 30,
    nodes: [
      { id: 'users', classId: 'web-client', params: { ratePerSec: 50, retries: 0, timeoutMs: 2000 } },
      { id: 'switch', classId: 'failover-switch', params: { detectAfterFailures: 3, failbackSec: 10 } },
      { id: 'primary', classId: 'data-warehouse', params: BACKEND },
      { id: 'standby', classId: 'data-warehouse', params: BACKEND },
    ],
    edges: [['users', 'out', 'switch', 'in'], ['switch', 'primary', 'primary', 'in'], ['switch', 'fallback', 'standby', 'in']],
    faults: [{ node: 'primary', type: 'crash', at: 5, until: 12 }],
  });
  const { views } = run(input, [4.9, 8, 16, 25]);
  assert.equal(arrivals(views[4.9], 'standby'), 0);
  assert.equal(views[8].nodes.switch.detail.Active, 'fallback');
  assert.ok(logHas(views[8], /Switched to fallback/));
  assert.ok(views[8].global.failed <= 5, `detection window failures ${views[8].global.failed}`);
  assert.equal(views[16].nodes.switch.detail.Active, 'primary');
  assert.equal(views[16].nodes.switch.detail.Switches, 2);
  assert.ok(logHas(views[16], /Switched to primary/));
  assert.equal(arrivals(views[25], 'standby'), arrivals(views[16], 'standby'));
  assert.ok(arrivals(views[25], 'primary') > arrivals(views[16], 'primary') + 300);
});

function dbDiagram(params, faults) {
  return diagram({
    horizonSec: 30,
    nodes: [
      { id: 'users', classId: 'web-client', params: { ratePerSec: 200, readFraction: 0.5, keySpace: 20, zipfS: 0, retries: 0, timeoutMs: 5000 } },
      { id: 'db', classId: params.replication === 'quorum' ? 'quorum-db' : 'replicated-db', params },
    ],
    edges: [['users', 'out', 'db', 'in']],
    faults,
  });
}

test('async replication produces stale follower reads; leader failure elects and loses unreplicated writes', () => {
  const input = dbDiagram({ replication: 'async', readFrom: 'followers', replicationLagMs: 300, electionMs: 2000 }, [{ node: 'db', type: 'failLeader', at: 10 }]);
  const { views } = run(input, [9.9, 11, 20]);
  assert.ok(views[9.9].nodes.db.detail['Stale reads'] > 50, JSON.stringify(views[9.9].nodes.db.detail));
  assert.equal(views[9.9].nodes.db.detail.Leader, 'replica 0');
  assert.equal(views[11].nodes.db.health, 'electing');
  assert.ok((views[11].global.failedBy.unavailable || 0) > 50);
  const after = views[20].nodes.db.detail;
  assert.match(after.Leader, /^replica [12]$/);
  assert.ok(after['Lost writes'] > 0, JSON.stringify(after));
  assert.ok(logHas(views[20], /promoted to leader; [1-9]\d* acknowledged writes? lost/));
  const late = views[20].global.failedBy.unavailable - views[11].global.failedBy.unavailable;
  assert.ok(late < (views[11].global.failedBy.unavailable || 0), 'writes resume after the election');
});

test('quorum replication does not lose acknowledged writes on leader failure', () => {
  const input = dbDiagram({ replication: 'quorum', writeQuorum: 2, readQuorum: 2, readFrom: 'any', replicationLagMs: 300, interReplicaMs: 2, electionMs: 2000 }, [{ node: 'db', type: 'failLeader', at: 10 }]);
  const { views } = run(input, [11, 20]);
  assert.equal(views[11].nodes.db.health, 'electing');
  const detail = views[20].nodes.db.detail;
  assert.match(detail.Leader, /^replica [12]$/);
  assert.equal(detail['Lost writes'], 0);
  assert.equal(detail['Stale reads'], 0);
});

function cacheDiagram(zipfS, faults, cacheParams = {}) {
  return diagram({
    horizonSec: 40,
    nodes: [
      { id: 'users', classId: 'web-client', params: { ratePerSec: 200, readFraction: 1, keySpace: 2000, zipfS, retries: 0, timeoutMs: 2000 } },
      { id: 'cache', classId: 'cache', params: { capacityKeys: 200, ttlSec: 0, ...cacheParams } },
      { id: 'origin', classId: 'data-warehouse', params: BACKEND },
    ],
    edges: [['users', 'out', 'cache', 'in'], ['cache', 'origin', 'origin', 'in']],
    faults,
  });
}

test('cache hit ratio rises with key skew and a cache crash sends load to the origin', () => {
  const uniform = run(cacheDiagram(0, []), [20]).views[20].nodes.cache.detail;
  const skewed = run(cacheDiagram(1.2, []), [20]).views[20].nodes.cache.detail;
  assert.ok(uniform['Hit ratio'] < 0.15, `uniform ${uniform['Hit ratio']}`);
  assert.ok(skewed['Hit ratio'] > 0.5, `skewed ${skewed['Hit ratio']}`);
  assert.ok(skewed.Evictions > 0);
  const { views } = run(cacheDiagram(1.2, [{ node: 'cache', type: 'crash', at: 20, until: 22 }]), [19, 20, 22, 23]);
  const steady = arrivals(views[20], 'origin') - arrivals(views[19], 'origin');
  const cold = arrivals(views[23], 'origin') - arrivals(views[22], 'origin');
  assert.ok(cold > steady * 1.5, `origin load after restart ${cold} versus steady ${steady}`);
  assert.equal(views[22].nodes.cache.detail.Flushes, 1);
  assert.ok(logHas(views[22], /contents flushed/));
  const during = arrivals(views[22], 'origin') - arrivals(views[20], 'origin');
  assert.ok(during > 2 * 200 * 0.8, `failOpen forwards crashed-cache traffic to the origin: ${during}`);
  const openDown = views[22].global.failedBy.down || 0;
  assert.ok(views[22].nodes.cache.detail.bypassed > 0 || views[22].nodes.cache.detail.Bypassed > 0, JSON.stringify(views[22].nodes.cache.detail));
  const closed = run(cacheDiagram(1.2, [{ node: 'cache', type: 'crash', at: 20, until: 22 }], { failOpen: false }), [22]).views[22];
  assert.ok(closed.global.failedBy.down > 300, `without failOpen callers see down: ${JSON.stringify(closed.global.failedBy)}`);
  assert.ok(openDown * 10 < closed.global.failedBy.down, `with failOpen only work in flight at the crash fails: ${openDown}`);
});

test('rate limiter queues overflow and releases it at the token rate', () => {
  const input = diagram({
    horizonSec: 10,
    nodes: [
      { id: 'users', classId: 'web-client', params: { ratePerSec: 100, retries: 0, timeoutMs: 20000 } },
      { id: 'limit', classId: 'rate-limiter', params: { ratePerSec: 20, burst: 5, overflow: 'queue', queueCapacity: 50 } },
      { id: 'dep', classId: 'data-warehouse', params: BACKEND },
    ],
    edges: [['users', 'out', 'limit', 'in'], ['limit', 'out', 'dep', 'in']],
  });
  const view = run(input, [10]).views[10];
  const admitted = arrivals(view, 'dep');
  assert.ok(admitted >= 200 && admitted <= 206, `admitted ${admitted} at 20/s plus a burst of 5`);
  assert.equal(view.nodes.limit.detail['Peak queued'], 50);
  assert.ok(view.global.failedBy['rate-limited'] > 600);
});

test('quorum writes are unavailable when the write quorum cannot be met', () => {
  const input = dbDiagram({ replication: 'quorum', writeQuorum: 2, readQuorum: 1, readFrom: 'leader' }, [
    { node: 'db', type: 'failReplica', at: 5, until: 15, params: { index: 1 } },
    { node: 'db', type: 'failReplica', at: 5, until: 15, params: { index: 2 } },
  ]);
  const { views } = run(input, [4.9, 14.9, 15, 25]);
  assert.equal(views[4.9].global.failedBy.unavailable, undefined);
  assert.equal(views[14.9].nodes.db.detail['Replicas up'], '1/3');
  assert.equal(views[14.9].nodes.db.health, 'degraded');
  const during = views[15].global.failedBy.unavailable;
  assert.ok(during > 800, `unavailable writes ${during}`);
  assert.equal(views[25].global.failedBy.unavailable, during);
});

function mixedDiagram(seed) {
  return diagram({
    seed, horizonSec: 20,
    nodes: [
      { id: 'users', classId: 'web-client', params: { ratePerSec: 150, readFraction: 0.7, keySpace: 200, zipfS: 1, retries: 0, timeoutMs: 5000 } },
      { id: 'limit', classId: 'rate-limiter', params: { ratePerSec: 120, burst: 10, overflow: 'queue', queueCapacity: 100 } },
      { id: 'retry', classId: 'retry-policy', params: { maxAttempts: 3, attemptTimeoutMs: 300, retryBudget: 0.5 } },
      { id: 'cache', classId: 'cdn-edge', params: { capacityKeys: 50, ttlSec: 2 } },
      { id: 'db', classId: 'quorum-db', params: { interReplicaMs: 5 } },
    ],
    edges: [['users', 'out', 'limit', 'in'], ['limit', 'out', 'retry', 'in'], ['retry', 'target', 'cache', 'in'], ['cache', 'origin', 'db', 'in']],
    faults: [{ node: 'db', type: 'errors', at: 4, until: 6, params: { rate: 0.5 } }, { node: 'db', type: 'failLeader', at: 8, until: 12 }, { node: 'cache', type: 'crash', at: 14, until: 15 }],
  });
}

test('same seed reproduces metrics exactly, a JSON clone of mid-run state continues identically, and a different seed differs', () => {
  for (const make of [lbDiagram, mixedDiagram]) {
    const a = run(make(5), [20]);
    const b = run(make(5), [20]);
    const c = run(make(6), [20]);
    assert.deepEqual(a.metrics(), b.metrics());
    assert.deepEqual(a.views[20].nodes, b.views[20].nodes);
    assert.notDeepEqual(a.metrics(), c.metrics());
  }
  const input = mixedDiagram(9);
  const compiled = doc.compile(doc.validate(input, library, config), library, config);
  const straight = engine.advance(compiled, engine.initialize(compiled, deps), 20, deps);
  let resumed = engine.advance(compiled, engine.initialize(compiled, deps), 8.5, deps);
  resumed = engine.advance(compiled, JSON.parse(JSON.stringify(resumed)), 20, deps);
  assert.deepEqual(engine.metrics(compiled, resumed, deps), engine.metrics(compiled, straight, deps));
  assert.deepEqual(resumed.kernel, straight.kernel);
  const view = engine.observe(compiled, straight, deps);
  assert.ok(view.nodes.cache.detail.Coalesced > 0 && view.nodes.retry.detail.Retries > 0 && view.nodes.db.detail.Elections === 1);
});
