'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const D = require('../public/simulatte/system-diagram/diagram.js');
const J = require('../public/simulatte/system-diagram/page-journeys.js');
const library = require('../public/simulatte/system-diagram/class-library.js').loadSync(path.resolve(__dirname, '../public/data/system-diagram'));
const config = require('../public/data/system-diagram/config.json');
const copy = value => JSON.parse(JSON.stringify(value));
function diagram() {
  return { ...D.emptyDiagram(config), seed: 42, run: { horizonSec: 4 }, nodes: [
    { id: 'users', classId: 'web-client', label: 'Users', x: 0, y: 0, params: { pattern: 'constant', ratePerSec: 1, maxRequests: 2 } },
    { id: 'api', classId: 'worker', label: 'Worker', x: 240, y: 0, params: { serviceMs: 10 } }
  ], edges: [{ id: 'wire', from: { nodeId: 'users', portId: 'out' }, to: { nodeId: 'api', portId: 'in' }, params: {} }],
  faults: [{ id: 'outage', atSec: 1, untilSec: 2, target: { kind: 'node', id: 'api' }, type: 'slow', params: { factor: 2 } }] };
}
function factory({ changeArrival = false, changeInput = false, diverged = false, stopped = false } = {}) {
  let live = 0, calls = 0; const log = [];
  return { log, live: () => live, create: async ({ diagram: doc }) => {
    assert.equal(live, 0, 'a comparison must never keep two runners alive'); live++; const number = ++calls; let time = 0;
    log.push(['create', number, copy(doc)]);
    return { advanceTo(t) { time = t; log.push(['advance', number, t]); }, inject(c) { log.push(['control', number, copy(c)]); },
      view() { return { t: time, error: stopped ? 'test event bound' : null, global: { offered: 2, completed: 2, failed: 0 }, nodes: {}, requests: [{ id: changeArrival && number === 2 ? 'changed-id' : 'request-1', sourceId: 'users', arrival: 0, deadline: null, payloadType: 'http', input: { kb: 1, tokens: 0, key: changeInput && number === 2 ? 'different' : 'same', op: 'write', fields: { synthetic: true } } }] }; },
      async verify() { return { status: diverged ? 'diverged' : 'match', metricsHash: 'metrics-' + number }; },
      program() { return { contentHash: 'world-' + number }; }, exportReplay() { return { schema: 'simulatte.systemDiagramReplay.v1', diagram: copy(doc), untilSec: time, controls: [] }; }, async dispose() { live--; log.push(['dispose', number]); }
    };
  } };
}
test('pair input contracts allow repair policy edits and reject changed demand or fault timing', () => {
  const baseline = diagram(), repair = copy(baseline); repair.nodes[1].params.serviceMs = 5; repair.nodes[1].x += 300;
  assert.doesNotThrow(() => J.pairInputs(baseline, repair, library, config));
  for (const mutate of [d => d.seed++, d => d.run.horizonSec++, d => d.nodes[0].params.ratePerSec++, d => d.faults[0].atSec += .1]) {
    const different = copy(repair); mutate(different);
    assert.throws(() => J.pairInputs(baseline, different, library, config), /identical seed, source definitions, horizon and scheduled faults/);
  }
  const resource = copy(baseline); resource.groups = [{ id: 'pool', kind: 'resource', label: 'Pool', x: 0, y: 0, w: 400, h: 200, capacity: 2 }];
  resource.faults = [{ id: 'invalid', atSec: 1, untilSec: 2, type: 'outage', target: { kind: 'group', id: 'pool' }, params: {} }];
  assert.throws(() => J.pairInputs(resource, resource, library, config), /zone or region/);
});
test('sequential comparison freezes inputs, proofs, arrivals and immutable records', async () => {
  const baseline = diagram(), repaired = copy(baseline); repaired.nodes[1].params.serviceMs = 5;
  const f = factory(), controls = [{ atSec: 2, kind: 'repair', target: { kind: 'node', id: 'api' } }];
  const pending = J.compare({ baseline, repaired, library, config, createRunner: f.create, controls });
  baseline.seed = 99; repaired.nodes[1].params.serviceMs = 100; controls[0].atSec = 3;
  const record = await pending;
  assert.equal(f.live(), 0); assert.equal(record.seed, 42); assert.equal(record.controls[0].atSec, 2);
  assert.equal(f.log.filter(row => row[0] === 'create')[1][2].nodes[1].params.serviceMs, 5);
  assert.deepEqual(f.log.filter(row => row[0] === 'control').map(row => row[2]), [{ kind: 'repair', target: { kind: 'node', id: 'api' } }, { kind: 'repair', target: { kind: 'node', id: 'api' } }]);
  assert.deepEqual(record.baseline.arrivals, record.repair.arrivals); assert.equal(Object.isFrozen(record.repair.requests[0]), true);
  assert.throws(() => { record.seed = 1; }, TypeError);
});
test('changed actual request IDs cannot masquerade as identical arrivals', async () => {
  const f = factory({ changeArrival: true });
  await assert.rejects(J.compare({ baseline: diagram(), repaired: diagram(), library, config, createRunner: f.create }), /Actual source request IDs, arrival times or payloads differ/);
  assert.equal(f.live(), 0); assert.equal(f.log.filter(row => row[0] === 'dispose').length, 2);
});
test('matching IDs and arrival times cannot hide changed workload content', async () => {
  const f = factory({ changeInput: true });
  await assert.rejects(J.compare({ baseline: diagram(), repaired: diagram(), library, config, createRunner: f.create }), /Actual source request IDs, arrival times or payloads differ/);
  assert.equal(f.live(), 0);
});
test('divergence, stopped runs and invalid control timing refuse with no leaked runner', async () => {
  for (const [options, reason] of [[{ diverged: true }, /replay diverged/], [{ stopped: true }, /comparison stopped/]]) {
    const f = factory(options); await assert.rejects(J.compare({ baseline: diagram(), repaired: diagram(), library, config, createRunner: f.create }), reason); assert.equal(f.live(), 0);
  }
  const f = factory(); await assert.rejects(J.compare({ baseline: diagram(), repaired: diagram(), library, config, createRunner: f.create, controls: [{ atSec: -1 }] }), /ordered logical times/); assert.equal(f.log.length, 0);
});
test('accepted checkpoint is taken before suspension and restored even when comparison refuses', async () => {
  const log = [], checkpoint = { t: 1.5, pending: ['delivery'], rng: 42 }; let restored = null;
  const current = { async checkpoint() { log.push('checkpoint'); return copy(checkpoint); }, async dispose() { log.push('dispose-current'); } };
  await assert.rejects(J.withSuspendedRun({ current, onSuspend() { log.push('suspend'); }, async action() { log.push('action'); throw Error('actual arrivals differ'); },
    async createReplacement() { log.push('create-replacement'); return { async restore(cp) { assert.deepEqual(cp, checkpoint); log.push('restore'); }, async dispose() { log.push('dispose-replacement'); } }; }, onRestore(runner) { restored = runner; log.push('publish-restored'); } }), /actual arrivals differ/);
  assert.ok(restored); assert.deepEqual(log, ['checkpoint', 'suspend', 'dispose-current', 'action', 'create-replacement', 'restore', 'publish-restored']);
});
test('failed restoration releases replacement and never publishes a false restored state', async () => {
  let disposed = false, published = false;
  await assert.rejects(J.withSuspendedRun({ current: { async checkpoint() { return {}; }, async dispose() {} }, async action() { return 'record'; },
    async createReplacement() { return { async restore() { throw Error('checkpoint mismatch'); }, async dispose() { disposed = true; } }; }, onRestore() { published = true; } }), /checkpoint mismatch/);
  assert.equal(disposed, true); assert.equal(published, false);
});
test('real coordinator runs pair a queued CPU/GPU store repair without changing arrivals', async () => {
  const runners = require('../public/simulatte/system-diagram/runner.js'), kernels = require('../public/simulatte/system-diagram/kernels-all.js');
  const baseline = D.emptyDiagram(config); baseline.seed = 42; baseline.run.horizonSec = 8;
  baseline.nodes = [
    { id: 'client', classId: 'web-client', label: 'Client', x: 0, y: 0, params: { pattern: 'constant', ratePerSec: 2, maxRequests: 6, stopSec: 3, readFraction: 0, payload: 'task' } },
    { id: 'queue', classId: 'task-queue', label: 'Queue', x: 240, y: 0, params: { visibilityTimeoutMs: 700, retryDelayMs: 100, maxReceives: 3 } },
    { id: 'cpu', classId: 'worker', label: 'CPU', x: 480, y: 0, params: { serviceMs: 100, concurrency: 1 }, groupId: 'pool' },
    { id: 'gpu', classId: 'gpu-worker', label: 'GPU', x: 720, y: 0, params: {}, groupId: 'pool' },
    { id: 'db', classId: 'database', label: 'Store', x: 960, y: 0, params: { idempotentWrites: false } }
  ];
  baseline.groups = [{ id: 'pool', label: 'Pool', kind: 'resource', capacity: 2, x: 460, y: -40, w: 460, h: 160 }];
  baseline.edges = [['client', 'out', 'queue', 'in'], ['queue', 'consumers', 'cpu', 'in'], ['cpu', 'calls', 'gpu', 'in'], ['gpu', 'calls', 'db', 'in']].map(([a, b, c, d], i) => ({ id: 'wire-' + i, from: { nodeId: a, portId: b }, to: { nodeId: c, portId: d }, params: {} }));
  baseline.faults = [{ id: 'store-down', atSec: .4, untilSec: 2.6, type: 'dropReplies', target: { kind: 'node', id: 'db' }, params: {} }, { id: 'network-down', atSec: 4, untilSec: 5, type: 'partition', target: { kind: 'edge', id: 'wire-3' }, params: {} }];
  const repaired = copy(baseline); repaired.nodes.at(-1).params.idempotentWrites = true;
  const comparison = await J.compare({ baseline, repaired, library, config, kernels, profileId: 'system-diagram-v1', createRunner: runners.create });
  assert.deepEqual(comparison.baseline.arrivals, comparison.repair.arrivals); assert.equal(comparison.baseline.metrics.offered, 6);
  assert.ok(comparison.baseline.metrics.duplicateEffects > 0); assert.equal(comparison.repair.metrics.duplicateEffects, 0);
  assert.ok(comparison.baseline.metrics.unknownEffects > 0, 'acknowledging a new non-idempotent write cannot confirm earlier unacknowledged effects');
  assert.equal(comparison.repair.metrics.unknownEffects, 0, 'successful suppressed retries explicitly confirm the original simulated commits');
  assert.ok(comparison.baseline.metricsHash && comparison.repair.metricsHash);
  assert.equal(runners.replay(comparison.baseline.replay, { library, config, kernels, profileId: 'system-diagram-v1' }).status, 'match');
  assert.equal(runners.replay(comparison.repair.replay, { library, config, kernels, profileId: 'system-diagram-v1' }).status, 'match');
});

test('comparison summary rows come only from the two verified runs', () => {
  const metrics = (completed, extra = {}) => ({ offered: 6, completed, failed: 6 - completed, retries: 1, duplicateEffects: 0, unknownEffects: 0, latency: { p95: 120.5 }, failedBy: {}, ...extra });
  const rows = J.summarize({ baseline: { metrics: metrics(4, { failedBy: { timeout: 2 } }) }, repair: { metrics: metrics(6, { latency: {} }) } });
  const row = key => rows.find(r => r.key === key);
  assert.deepEqual([row('completed').baseline, row('completed').repair], [4, 6]);
  assert.deepEqual([row('latency.p95').baseline, row('latency.p95').repair], [120.5, null], 'missing latency samples stay explicit');
  assert.deepEqual([row('failedBy.timeout').baseline, row('failedBy.timeout').repair], [2, 0]);
  assert.equal(rows.findIndex(r => r.key === 'latency.p95'), 3);
  assert.equal(row('peakMemoryMiB'), undefined, 'metrics absent from both runs are not invented');
});
