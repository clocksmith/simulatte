const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const libraryApi = require('../public/simulatte/system-diagram/class-library.js');
const config = require('../public/data/system-diagram/config.json');
const controls = require('../public/simulatte/system-diagram/run-controls.js');
const overlay = require('../public/simulatte/system-diagram/overlay.js');
const metrics = require('../public/simulatte/system-diagram/metrics-panel.js');
const inspector = require('../public/simulatte/system-diagram/inspector.js');
const library = libraryApi.loadSync(path.join(root, 'public/data/system-diagram'));

function view(patch = {}) {
  return {
    t: 12, horizonSec: 120, done: false, error: null,
    global: { offered: 100, completed: 90, failed: 4, failedBy: { timeout: 3, rejected: 1 }, inFlight: 6, attempts: 110, retries: 10, effects: 40, duplicateEffects: 2, wastedWork: 1, cost: 0, throughput: 8.5, errorRate: 0.04, latency: { p50: 12, p95: 48, p99: 120, mean: 20 }, latencyWindow: { p50: 10, p95: 40, p99: 90 } },
    series: { bucketSec: 1, startSec: 0, offered: [], completed: [], failed: [], p95: [] },
    nodes: {}, edges: {}, transit: [], log: [],
    ...patch,
  };
}

test('clock text keeps a fixed width for a horizon and clamps to it', () => {
  const a = controls.formatClock(0, 120), b = controls.formatClock(119.94, 120), c = controls.formatClock(500, 120);
  assert.equal(a.length, b.length);
  assert.match(b, /119\.9 \/ 120 s$/);
  assert.match(c, /120\.0 \/ 120 s$/);
  assert.match(controls.formatClock(-3, 60), /0\.0 \/ 60 s$/);
});

test('speed labels and nearest speed follow config.playback.speeds', () => {
  const speeds = config.playback.speeds;
  assert.equal(controls.nearestSpeed(speeds, config.playback.defaultSpeed), config.playback.defaultSpeed);
  assert.equal(controls.nearestSpeed(speeds, 0.7), 0.5);
  assert.equal(controls.nearestSpeed(speeds, 1000), Math.max(...speeds));
  assert.equal(controls.formatSpeed(0.05), '0.05×');
  assert.equal(controls.formatSpeed(20), '20×');
  assert.throws(() => controls.nearestSpeed([], 1), /speeds/);
});

test('space toggles play only outside text entry and other controls', () => {
  const target = (tagName, extra = {}) => ({ nodeType: 1, tagName, isContentEditable: false, closest: () => null, ...extra });
  const key = (t, extra = {}) => ({ key: ' ', code: 'Space', target: t, ...extra });
  assert.equal(controls.shouldToggleOnKey(key(target('DIV'))), true);
  assert.equal(controls.shouldToggleOnKey(key(target('INPUT', { type: 'text' }))), false);
  assert.equal(controls.shouldToggleOnKey(key(target('TEXTAREA'))), false);
  assert.equal(controls.shouldToggleOnKey(key(target('DIV', { isContentEditable: true }))), false);
  assert.equal(controls.shouldToggleOnKey(key(target('SPAN', { closest: () => ({}) }))), false);
  assert.equal(controls.shouldToggleOnKey(key(target('DIV'), { repeat: true })), false);
  assert.equal(controls.shouldToggleOnKey({ key: 'Enter', target: target('DIV') }), false);
});

test('transit position runs requests forward and replies backward, clamped', () => {
  assert.equal(overlay.transitFraction(1.5, 1, 2, 'req'), 0.5);
  assert.equal(overlay.transitFraction(1.25, 1, 2, 'res'), 0.75);
  assert.equal(overlay.transitFraction(0, 1, 2, 'req'), 0);
  assert.equal(overlay.transitFraction(9, 1, 2, 'req'), 1);
  assert.equal(overlay.transitFraction(1, 1, 1, 'req'), 1);
});

test('every library payload type maps to one of the declared transit families', () => {
  const families = new Set(overlay.FAMILIES.map(f => f.id));
  assert.ok(families.size <= 3);
  for (const p of library.payloadTypes) assert.ok(families.has(overlay.payloadFamily(p.id)), p.id);
});

test('edge activity distinguishes idle, flowing, error and faulted links', () => {
  assert.equal(overlay.edgeActivity({ rate: 0, errorRate: 0, inTransit: 0, faults: [] }).state, 'idle');
  const slow = overlay.edgeActivity({ rate: 1, errorRate: 0, inTransit: 1, faults: [] });
  const fast = overlay.edgeActivity({ rate: 1000, errorRate: 0, inTransit: 9, faults: [] });
  assert.equal(slow.state, 'flowing');
  assert.ok(fast.width > slow.width);
  assert.equal(overlay.edgeActivity({ rate: 10, errorRate: overlay.EDGE_ERROR_RATE, inTransit: 0, faults: [] }).state, 'error');
  const cut = overlay.edgeActivity({ rate: 0, errorRate: 0, inTransit: 0, faults: ['partition'] });
  assert.equal(cut.state, 'faulted');
  assert.equal(cut.faulted, true);
});

test('node counters show throughput and only meaningful latency, queue and errors', () => {
  assert.equal(overlay.counterText({ throughput: 12.4, served: 0, latency: { p95: 0 }, queue: 0, queueCapacity: 0 }), '12/s');
  const text = overlay.counterText({ throughput: 3, served: 5, latency: { p95: 38.2 }, queue: 4, queueCapacity: 100, errors: 1, rejected: 2 });
  assert.match(text, /p95 38ms/);
  assert.doesNotMatch(text, /q 4/);
  assert.match(overlay.counterText({ throughput: 1, served: 1, latency: { p95: 2400 } }), /p95 2\.4s/);
  assert.match(text, /err 3/);
});

test('metric tiles carry every SimMetric field with synthetic validity', () => {
  const tiles = metrics.tilesFor(view());
  for (const tile of tiles) for (const key of ['subject', 'value', 'unit', 'timeBasis', 'freshness', 'validity']) assert.notEqual(tile[key], null, `${tile.id}.${key}`);
  assert.deepEqual(tiles.filter(t => t.level === 'governing').map(t => t.id), ['throughput', 'p95', 'errorRate']);
  assert.ok(tiles.every(t => ['governing', 'supporting', 'detail'].includes(t.level)));
  assert.equal(tiles.find(t => t.id === 'p95').value, '48');
  assert.equal(tiles.find(t => t.id === 'errorRate').value, '4.0');
  assert.equal(tiles.find(t => t.id === 'throughput').validity, 'synthetic model');
  assert.equal(tiles.find(t => t.id === 'cost'), undefined);
});

test('metric tiles report missing latency samples, cost, completion and stopped runs honestly', () => {
  const empty = metrics.tilesFor(view({ global: { ...view().global, completed: 0, cost: 0.0123 } }));
  assert.equal(empty.find(t => t.id === 'p95').value, 'n/a');
  assert.equal(empty.find(t => t.id === 'p95').validity, 'no samples');
  assert.equal(empty.find(t => t.id === 'cost').unit, 'USD');
  const final = metrics.tilesFor(view({ done: true, error: 'maxInFlight exceeded' }));
  assert.ok(final.every(t => t.freshness === 'final'));
  assert.equal(final.find(t => t.id === 'throughput').validity, 'invalid');
});

test('series rows drop the partial trailing bucket and convert counts to rates', () => {
  const series = { bucketSec: 2, startSec: 10, offered: [4, 6, 8], completed: [2, 6, 8], failed: [0, 2, 0], p95: [10, 0, 30] };
  const rows = metrics.seriesRows(series, 15);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], { t: 12, offered: 2, completed: 1, failed: 0, p95: 10 });
  assert.equal(rows[1].p95, null);
  assert.equal(metrics.seriesRows(series, 16).length, 3);
});

test('chart scale and failure breakdown are readable', () => {
  assert.equal(metrics.niceMax(0), 1);
  assert.equal(metrics.niceMax(7.2), 10);
  assert.equal(metrics.niceMax(140), 200);
  assert.equal(metrics.failureBreakdown({ rejected: 1, timeout: 3, down: 0 }), 'timeout 3 · rejected 1');
});

test('node table sorts by utilization by default direction and breaks ties by id', () => {
  const v = view({ nodes: {
    b: { health: 'ok', utilization: 0.5, queue: 1, queueCapacity: 10, throughput: 3, served: 2, latency: { p95: 9 }, errors: 0, rejected: 0 },
    a: { health: 'down', utilization: 0.5, queue: 0, queueCapacity: 10, throughput: 0, served: 0, latency: { p95: 0 }, errors: 2, rejected: 1 },
    c: { health: 'busy', utilization: 0.9, queue: 9, queueCapacity: 10, throughput: 8, served: 5, latency: { p95: 30 }, errors: 0, rejected: 0 },
  } });
  const rows = metrics.nodeRows(v, id => id.toUpperCase());
  assert.deepEqual(metrics.sortNodeRows(rows, 'utilization', 'desc').map(r => r.id), ['c', 'a', 'b']);
  assert.deepEqual(metrics.sortNodeRows(rows, 'health', 'asc').map(r => r.id), ['a', 'c', 'b']);
  assert.equal(rows.find(r => r.id === 'a').p95, null);
  assert.equal(rows.find(r => r.id === 'a').errors, 3);
  assert.equal(rows.find(r => r.id === 'b').name, 'B');
});

test('parameter parsing rejects out-of-range and malformed values instead of clamping', () => {
  const spec = library.kernels.service.params.concurrency;
  assert.deepEqual(inspector.parseParam(spec, '12'), { ok: true, value: 12 });
  assert.equal(inspector.parseParam(spec, '1.5').ok, false);
  assert.equal(inspector.parseParam(spec, String(spec.max + 1)).ok, false);
  assert.equal(inspector.parseParam(spec, '').ok, false);
  const number = library.kernels.service.params.errorRate;
  assert.deepEqual(inspector.parseParam(number, '0.25'), { ok: true, value: 0.25 });
  assert.match(inspector.parseParam(number, '2').error, /0 to 1 fraction/);
  const enumSpec = library.kernels.service.params.serviceDist;
  assert.equal(inspector.parseParam(enumSpec, 'lognormal').ok, true);
  assert.equal(inspector.parseParam(enumSpec, 'gamma').ok, false);
  assert.equal(inspector.parseParam(library.kernels.service.params.blockingCalls, false).value, false);
});

test('parameter rows group basic and advanced specs and label value sources', () => {
  const doc = { classes: [{ id: 'user.fast-api', label: 'Fast API', extends: 'web-server', defaults: {} }] };
  const specs = library.kernels.service.params;
  const values = Object.fromEntries(Object.entries(specs).map(([k, s]) => [k, s.default]));
  const sources = Object.fromEntries(Object.keys(specs).map(k => [k, 'kernel']));
  sources.concurrency = 'instance'; sources.serviceMs = 'user.fast-api';
  const rows = inspector.paramRows(specs, values, sources);
  assert.ok(rows.basic.some(r => r.key === 'concurrency' && r.overridden));
  assert.ok(rows.advanced.every(r => r.spec.group === 'advanced'));
  assert.equal(rows.basic.length + rows.advanced.length, Object.keys(specs).length);
  assert.equal(inspector.sourceLabel('instance', doc, library), 'This node');
  assert.equal(inspector.sourceLabel('kernel', doc, library), 'Default');
  assert.equal(inspector.sourceLabel('user.fast-api', doc, library), 'Fast API');
  assert.equal(inspector.sourceLabel('web-server', doc, library), library.classes['web-server'].label);
  assert.equal(inspector.sourceLabel('edge', doc, library), 'This edge');
});

test('fault actions follow kernel fault lists and kernel restrictions', () => {
  const replicated = inspector.nodeFaultTypes(library, 'replicatedDb').map(f => f.id);
  assert.ok(replicated.includes('failLeader') && replicated.includes('failReplica'));
  const service = inspector.nodeFaultTypes(library, 'service').map(f => f.id);
  assert.deepEqual(service, [...library.kernels.service.faults]);
  assert.ok(!service.includes('failLeader'));
  assert.deepEqual(inspector.targetFaultTypes(library, 'edge').map(f => f.id), ['partition', 'degrade']);
  assert.deepEqual(inspector.targetFaultTypes(library, 'group').map(f => f.id), ['outage']);
});

test('selection mode and fault summaries describe what the inspector shows', () => {
  const empty = { nodes: [], edges: [], groups: [], notes: [] };
  assert.equal(inspector.selectionMode(empty).mode, 'diagram');
  assert.deepEqual(inspector.selectionMode({ ...empty, edges: ['e1'] }), { mode: 'edge', id: 'e1', count: 1 });
  assert.equal(inspector.selectionMode({ ...empty, nodes: ['a'], groups: ['g'] }).mode, 'multiple');
  const doc = { nodes: [{ id: 'cache', label: 'Cache' }], groups: [], classes: [] };
  assert.equal(inspector.faultSummary({ type: 'crash', atSec: 30, untilSec: 45, target: { kind: 'node', id: 'cache' } }, doc, library), 'Crash on Cache, 30–45 s');
  assert.equal(inspector.faultSummary({ type: 'partition', atSec: 5, untilSec: null, target: { kind: 'edge', id: 'e1' } }, doc, library), 'Partition link on e1, from 5 s');
  assert.deepEqual(inspector.classUsage({ nodes: [{ classId: 'user.a' }], classes: [{ id: 'user.b', extends: 'user.a' }] }, 'user.a'), { nodes: 1, children: 1 });
});

test('folded component summaries count jobs and health without double-counting logical requests', () => {
  const summary = overlay.groupSummary(['a', 'b', 'a'], {
    a: { health: 'busy', queue: 2, busy: 1, completed: 100, faults: [] },
    b: { health: 'ok', queue: 3, busy: 0, completed: 100, faults: ['dropReplies'] }
  });
  assert.equal(summary.components, 2); assert.equal(summary.queued, 5);
  assert.equal(summary.unhealthy, 1); assert.equal(summary.busy, 1);
  assert.equal(summary.health, 'degraded'); assert.equal(summary.completed, undefined);
  assert.match(summary.detail, /not unique end-to-end requests/);
  const incomplete = overlay.groupSummary(['missing', 'a'], { a: { health: 'ok', queue: NaN, busy: -1 } });
  assert.equal(incomplete.health, 'unknown'); assert.equal(incomplete.missing, 1);
  assert.equal(incomplete.queued, 0); assert.equal(incomplete.busy, 0);
});
