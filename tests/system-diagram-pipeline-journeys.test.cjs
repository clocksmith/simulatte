'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const library = require('../public/simulatte/system-diagram/class-library.js').loadSync(path.resolve(__dirname, '../public/data/system-diagram'));
const documents = require('../public/simulatte/system-diagram/diagram.js');
const engine = require('../public/simulatte/system-diagram/engine.js');
const runnerApi = require('../public/simulatte/system-diagram/runner.js');
const kernels = require('../public/simulatte/system-diagram/kernels-all.js');
const memory = require('../public/simulatte/system-diagram/engine-observability.js');
const config = require('../public/data/system-diagram/config.json');
const deps = { library, config, kernels }, clone = v => structuredClone(v);
const node = (id, classId, params = {}) => ({ id, classId, label: id, x: 0, y: 0, params });
const edge = (id, from, port, to) => ({ id, from: { nodeId: from, portId: port }, to: { nodeId: to, portId: 'in' }, params: { latencyMs: 0, bandwidthMbps: 1000000 } });
const example = id => clone(require('../public/data/system-diagram/examples/' + id + '.json'));
function diagram(nodes, edges, faults = []) { return { ...documents.emptyDiagram(config, 'Pipeline test'), id: 'pipeline-test', seed: 19, run: { horizonSec: 30 }, nodes, edges, faults }; }
function run(d, until = 30, override = null) {
  const c = documents.compile(d, library, config), dep = override ? { ...deps, kernels: { has: id => id === 'eventSource' || kernels.has(id), get: id => id === 'eventSource' ? override : kernels.get(id) } } : deps;
  const s = engine.initialize(c, dep); engine.advance(c, s, until, dep); memory.reconcile(s);
  return { c, s, view: engine.observe(c, s, dep), dep };
}
const event = (id, sequence, patch = {}) => ({ id, schemaVersion: 1, eventTimeSec: sequence / 10, entityId: 'entity', sequence, valid: true, approved: true, side: 'none', amount: 1, lineage: ['source'], ...patch });
// An independent explicit trace fixture exercises the actual pipeline kernels through ctx, not their helper algorithms.
function explicit(records) {
  return { id: 'eventSource', station: null,
    start(ctx) { records.forEach((record, i) => ctx.wake(record.at ?? i / 10, { i })); },
    onWake(ctx, { i }) { const record = records[i], msg = ctx.message({ ptype: 'event', kb: record.kb ?? 1, op: 'write', fields: { event: record.event } }); ctx.beginRequest(msg); const job = ctx.newJob(msg); if (ctx.call(job, ctx.edges('out')[0].id, {}, { timeoutMs: 25000, retries: 0 }) === null) { ctx.endRequest(msg, { ok: true }); ctx.reply(job, { ok: true }); } },
    onResult(ctx, job, slot, result) { ctx.endRequest(job.msg, { ok: result.ok, ...(result.ok ? {} : { err: result.err }) }); ctx.reply(job, { ok: result.ok, ...(result.ok ? {} : { err: result.err }) }); }
  };
}
function flow(stage, params = {}, source = {}, faults = []) {
  return diagram([node('source', 'event-source', { count: 1, retries: 0, callTimeoutMs: 25000, ...source }), node('stage', stage, { retries: 0, callTimeoutMs: 10000, ...params }), node('store', 'idempotent-store', { writeMs: 1, serviceDist: 'constant' }), node('quarantine', 'event-quarantine')], [edge('input', 'source', 'out', 'stage'), edge('output', 'stage', 'accepted', 'store'), edge('invalid', 'stage', 'quarantine', 'quarantine')], faults);
}

test('synthetic healthcare ingestion distinguishes schema, approval, ordering, duplicates and retained exceptions', () => {
  const { c, s, view } = run(example('healthcare-ingestion'));
  assert.equal(view.global.offered, 12); assert.equal(view.global.completed, 4); assert.equal(view.global.failed, 8);
  assert.equal(s.kernel.schema.quarantined, 6); assert.equal(s.kernel.approval.denied, 1);
  assert.equal(s.kernel['identity-ledger'].committed, 3); assert.equal(s.kernel['identity-ledger'].duplicates, 1); assert.equal(s.kernel['identity-ledger'].outOfOrder, 1);
  assert.equal(s.kernel.quarantine.records.length, 8); assert.equal(view.global.duplicateEffects, 0);
  assert.ok(view.requests.filter(r => r.status === 'failed').every(r => r.backgroundPending > 0 && r.retainedMiB > 0));
  const record = s.kernel.quarantine.records.find(r => r.event); assert.ok(record.event.lineage.includes('schema'));
  const info = engine.inspect(c, s, record.requestId, deps); assert.ok(info.blockers.some(b => b.kind === 'quarantined-event')); assert.ok(info.history.some(e => e.kind === 'retained-payload'));
});

test('paired-record reconciliation commits matching scalar pairs once and retains both mismatched inputs', () => {
  const { s, view } = run(example('finance-reconciliation')), ledger = s.kernel.reconciliation;
  assert.equal(ledger.reconciled, 4); assert.equal(ledger.mismatches, 2); assert.equal(Object.values(ledger.pairs).filter(p => !p.committed).length, 2);
  assert.equal(view.global.completed, 10); assert.equal(view.global.failed, 2); assert.equal(view.global.duplicateEffects, 0);
  assert.equal(Object.keys(s.observability.retained.reconciliation).length, 4); assert.equal(s.kernel.exceptions.records.length, 2);
  assert.ok(view.requests.some(r => r.status === 'completed' && r.backgroundPending > 0 && r.blockers.some(b => b.kind === 'awaiting-counterpart')), 'ingestion acknowledgement does not hide unfinished reconciliation');
  assert.ok(view.global.memoryMiB > 6, 'retained scalar payloads and declared record allocations remain in the resource ledger');
});

test('lakehouse pattern models schema evolution, late-data rejection, aggregation, spill and logical checkpoint offsets', () => {
  const { s, view } = run(example('lakehouse-late-data')), w = s.kernel['event-time'], shuffle = s.kernel.shuffle;
  assert.equal(view.global.offered, 20); assert.equal(view.global.completed, 15); assert.equal(view.global.failedBy.dropped, 5);
  assert.equal(w.accepted, 15); assert.equal(w.late, 5); assert.equal(w.schemaRejected, 0); assert.ok(s.kernel.events.emitted.some(e => e.schemaVersion === 2));
  assert.equal(Object.values(w.windows).reduce((n, row) => n + row.count, 0), 15); assert.equal(Object.values(w.windows).reduce((n, row) => n + row.sum, 0), 1500);
  assert.equal(shuffle.completed, 15); assert.equal(shuffle.checkpoints, 5); assert.equal(shuffle.checkpoint.completed, 15); assert.ok(shuffle.spillKb > 0);
  assert.ok(shuffle.peakBufferKb <= 512); assert.equal(shuffle.bufferKb, 0); assert.deepEqual(shuffle.reservations, {});
  assert.equal(s.kernel['late-data'].records.length, 5); assert.equal(view.global.duplicateEffects, 0);
});

test('distinct logical duplicate deliveries keep stable event identity and produce one effect per event at each sink', () => {
  const { s, view } = run(flow('event-ledger', { mode: 'idempotent' }, { count: 6, duplicateEvery: 2 }));
  assert.equal(view.global.offered, 6); assert.equal(view.global.completed, 6); assert.equal(s.kernel.stage.committed, 3); assert.equal(s.kernel.stage.duplicates, 3);
  assert.equal(view.global.effects, 6, 'three ledger effects and three backend effects'); assert.equal(view.global.duplicateEffects, 0);
  assert.equal(view.nodes.store.detail['suppressed duplicates'], 3);
});

for (const classId of ['event-ledger', 'event-window']) test(classId + ' re-forwards after lost sink acknowledgements without committing or aggregating twice', () => {
  const d = flow(classId, { callTimeoutMs: 80, retries: 0 }, { count: 1, callTimeoutMs: 500, retries: 3, retryBackoffMs: 100 }, [{ id: 'lost-ack', atSec: 0, untilSec: .35, target: { kind: 'node', id: 'store' }, type: 'dropReplies', params: {} }]);
  const { s, view } = run(d); assert.equal(view.global.completed, 1); assert.equal(view.global.failed, 0); assert.ok(view.global.retries >= 2); assert.equal(view.global.duplicateEffects, 0);
  assert.ok(view.nodes.store.detail['suppressed duplicates'] >= 2); assert.equal(s.kernel.stage.duplicates, 2);
  if (classId === 'event-window') { assert.equal(s.kernel.stage.accepted, 1); assert.equal(Object.values(s.kernel.stage.windows)[0].count, 1); assert.equal(view.global.effects, 1); }
  else { assert.equal(s.kernel.stage.committed, 1); assert.equal(view.global.effects, 2); }
});

test('explicit sequence ordering quarantines a gap while later expected records can still commit', () => {
  const records = [event('one', 1), event('gap', 3), event('two', 2)].map(event => ({ event }));
  const { s, view } = run(flow('event-ledger', { mode: 'ordered', ordering: 'strict' }), 30, explicit(records));
  assert.equal(s.kernel.stage.committed, 2); assert.equal(s.kernel.stage.outOfOrder, 1); assert.equal(view.global.completed, 2); assert.equal(view.global.failed, 1);
  assert.equal(s.kernel.quarantine.records[0].event.id, 'gap');
});

test('watermark allows an explicit late revision but quarantines records beyond allowed lateness', () => {
  const records = [event('a', 1, { eventTimeSec: .1 }), event('b', 2, { eventTimeSec: 1.2 }), event('c', 3, { eventTimeSec: .8, schemaVersion: 2 }), event('d', 4, { eventTimeSec: 0 })].map(event => ({ event }));
  const { s, view } = run(flow('event-window', { windowSec: 1, watermarkLagSec: 0, allowedLateSec: .5 }), 30, explicit(records));
  assert.equal(s.kernel.stage.accepted, 3); assert.equal(s.kernel.stage.late, 1); const revised = s.kernel.stage.windows['entity:0']; assert.equal(revised.count, 2); assert.equal(revised.revisions, 1); assert.equal(revised.sum, 2); assert.equal(view.global.failedBy.dropped, 1);
});

test('malformed records are explicitly quarantined rather than acquiring plausible defaults', () => {
  const bad = event('bad', 1); bad.undeclared = true;
  const { s, view } = run(flow('schema-validator'), 30, explicit([{ event: bad }]));
  assert.equal(view.global.failedBy.invalid, 1); assert.equal(s.kernel.quarantine.records.length, 1); assert.equal(s.kernel.quarantine.records[0].event, null); assert.match(s.kernel.quarantine.records[0].reason, /Malformed/);
});

test('a committed pair is immutable; a conflicting later side is quarantined without altering historical amounts', () => {
  const records = [event('left', 1, { side: 'left', amount: 100 }), event('right', 1, { side: 'right', amount: 100 }), event('conflict', 1, { side: 'right', amount: 101 })].map(event => ({ event }));
  const { s, view } = run(flow('event-ledger', { mode: 'reconcile' }), 30, explicit(records));
  assert.equal(s.kernel.stage.pairs.entity.right.amount, 100); assert.equal(s.kernel.stage.pairs.entity.committed, true); assert.equal(s.kernel.stage.committed, 1); assert.equal(s.kernel.stage.mismatches, 1);
  assert.equal(view.global.completed, 2); assert.equal(view.global.failed, 1); assert.equal(view.global.effects, 2); assert.equal(Object.keys(s.observability.retained.stage).length, 0); assert.equal(s.kernel.quarantine.records[0].event.id, 'conflict');
});

test('a corrected unmatched counterpart releases pending payloads and commits once while preserving the prior exception', () => {
  const records = [event('left', 1, { side: 'left', amount: 100 }), event('wrong', 1, { side: 'right', amount: 101 }), event('repair', 1, { side: 'right', amount: 100 })].map(event => ({ event }));
  const { s, view } = run(flow('event-ledger', { mode: 'reconcile' }), 30, explicit(records));
  assert.equal(s.kernel.stage.reconciled, 1); assert.equal(s.kernel.stage.pairs.entity.right.eventId, 'repair'); assert.equal(Object.keys(s.observability.retained.stage).length, 0); assert.equal(s.kernel.quarantine.records.length, 1); assert.equal(view.global.failed, 1);
});

test('shuffle station rejection releases every reserved resident buffer and a crash fences pending completions', () => {
  const d = flow('shuffle-spill', { bufferMiB: .5, concurrency: 1, queueCapacity: 0, serviceMs: 100, serviceDist: 'constant', shuffleMiBps: 1, spillMiBps: 1 }, { count: 10, intervalMs: 1, payloadKb: 1024, retries: 0 });
  d.faults.push({ id: 'spill-crash', atSec: .2, untilSec: .5, target: { kind: 'node', id: 'stage' }, type: 'crash', params: {} });
  const { s, view } = run(d); assert.equal(s.kernel.stage.bufferKb, 0); assert.deepEqual(s.kernel.stage.reservations, {}); assert.equal(s.kernel.stage.completed, 0); assert.equal(view.global.completed, 0); assert.equal(view.global.failed, 10); assert.equal(view.nodes.stage.detail['Held MiB'], 0);
});

test('quarantine capacity and volatile crash loss remain visible instead of leaking retained payloads', () => {
  const d = flow('schema-validator', {}, { count: 3, invalidEvery: 1 }); d.nodes.find(n => n.id === 'quarantine').params.maxRecords = 1;
  d.faults.push({ id: 'quarantine-crash', atSec: 1, untilSec: 2, target: { kind: 'node', id: 'quarantine' }, type: 'crash', params: {} });
  const { s, view } = run(d); assert.equal(s.kernel.quarantine.records.length, 1); assert.equal(s.kernel.quarantine.overflow, 2); assert.equal(s.kernel.quarantine.lost, 1); assert.equal(s.kernel.quarantine.records[0].lost, true); assert.equal(s.kernel.quarantine.records[0].event, null); assert.equal(view.global.memoryMiB, 0); assert.equal(view.global.failed, 3);
});

for (const id of ['healthcare-ingestion', 'finance-reconciliation', 'lakehouse-late-data']) test(id + ' exact JSON checkpoint restoration equals uninterrupted state and causal records', () => {
  const d = example(id), direct = run(d), state = engine.initialize(direct.c, deps);
  engine.advance(direct.c, state, .35, deps); const restored = JSON.parse(JSON.stringify(state)); engine.advance(direct.c, restored, 30, deps);
  assert.deepEqual(restored, direct.s); assert.deepEqual(engine.observe(direct.c, restored, deps), direct.view); memory.reconcile(restored);
});

test('coordinator checkpoint retains unmatched records, causal blockers and seeded replay exactly', async () => {
  const runner = await runnerApi.create({ diagram: example('finance-reconciliation'), ...deps });
  try { runner.advanceTo(.25); const checkpoint = await runner.checkpoint(); runner.advanceTo(30); const completed = runner.view(); await runner.restore(checkpoint); runner.advanceTo(30); assert.deepEqual(runner.view(), completed); assert.equal((await runner.verify()).status, 'match'); assert.ok(completed.requests.some(r => r.backgroundPending > 0)); }
  finally { await runner.dispose(); }
});

test('event source crash accounts interrupted requests and resumes one fenced schedule after recovery', () => {
  const d = flow('event-ledger', { serviceMs: 400, serviceDist: 'constant' }, { count: 5, intervalMs: 100, retries: 0 });
  d.faults.push({ id: 'source-crash', atSec: .05, untilSec: .25, target: { kind: 'node', id: 'source' }, type: 'crash', params: {} });
  const { s, view } = run(d), source = s.kernel.source;
  assert.equal(source.generated, 5); assert.equal(source.completed + source.failed + source.outstanding, source.generated); assert.equal(source.outstanding, 0);
  assert.equal(source.failed, 1); assert.equal(view.global.offered, 5); assert.equal(view.global.completed, 4); assert.equal(view.global.failed, 1);
  assert.equal(new Set(source.emitted.map(e => e.id)).size, 5, 'recovery does not leave a duplicate source wake schedule');
});
