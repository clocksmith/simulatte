const test = require('node:test');
const assert = require('node:assert/strict');
const graph = require('../public/simulatte/distributed-repair/graph-document.js');
const runtime = require('../public/simulatte/distributed-repair/graph-runtime.js');
const worldSpec = require('../public/shared/contracts/world-spec.js');

function node(doc, type) { return doc.nodes.find(n => graph.resolveNode(doc, n).type === type); }
function line(types = ['client', 'cpu', 'database']) {
  const doc = graph.create('blank');
  types.forEach((type, i) => graph.addNode(doc, `class-${type}`, i * 240, 100));
  for (let i = 1; i < doc.nodes.length; i++) graph.connect(doc, { from: doc.nodes[i - 1].id, to: doc.nodes[i].id, fromPort: 'out', toPort: 'in', capacity: 100, latency: 0.01 });
  return doc;
}

test('RAG and collection presets execute every declared component with typed payload transformations', () => {
  const exercised = new Set();
  for (const name of ['rag', 'collection']) {
    const doc = graph.create(name), run = runtime.create(doc); run.runUntil(60);
    const s = run.snapshot();
    assert.equal(s.metrics.completed, doc.workload.count);
    assert.equal(s.metrics.effects, doc.workload.count * 2);
    for (const n of s.nodes) { assert.ok(n.completed > 0, `${name}/${n.id} must execute`); exercised.add(n.type); }
    assert.ok(s.events.some(e => e.kind === 'payload-transformed'));
    assert.equal(s.metrics.memoryMiB, 0);
    assert.equal(run.verify().status, 'match');
  }
  assert.deepEqual([...exercised].sort(), [...graph.TYPES].sort());
});

test('classes remain reusable defaults, while instance overrides survive class edits and duplication', () => {
  const doc = line(), cpu = node(doc, 'cpu'), secondId = graph.duplicate(doc, cpu.id);
  cpu.overrides.serviceTime = 2;
  doc.classes.find(c => c.id === cpu.classId).defaults.serviceTime = 0.8;
  assert.equal(graph.resolveNode(doc, cpu).properties.serviceTime, 2);
  assert.equal(graph.resolveNode(doc, secondId).properties.serviceTime, 0.8);
  const duplicateId = graph.duplicate(doc, cpu.id);
  assert.equal(graph.resolveNode(doc, duplicateId).properties.serviceTime, 2);
  graph.validate(doc);
  assert.throws(() => graph.validate(doc, { execution: true }), /Connect all/);
  graph.remove(doc, secondId); graph.remove(doc, duplicateId);
  const run = runtime.create(doc); run.runUntil(60);
  assert.ok(run.snapshot().attempts.filter(a => a.nodeId === cpu.id).every(a => a.serviceTime >= 1.8 && a.serviceTime <= 2.2));
});

test('blank drafts are editable; dangling, cyclic and incompatible execution refuses with a reason', () => {
  const doc = graph.create('blank'); graph.validate(doc);
  assert.throws(() => runtime.create(doc), /client or scheduler/);
  const client = graph.addNode(doc, 'class-client', 0, 0), replica = graph.addNode(doc, 'class-replica', 100, 0);
  assert.throws(() => graph.connect(doc, { from: client, to: replica, fromPort: 'out', toPort: 'in', capacity: 10, latency: 0 }), /Incompatible ports/);
  const cpu = graph.addNode(doc, 'class-cpu', 200, 0), cpu2 = graph.addNode(doc, 'class-cpu', 300, 0);
  graph.connect(doc, { from: cpu, to: cpu2, fromPort: 'out', toPort: 'in', capacity: 10, latency: 0 });
  assert.throws(() => graph.connect(doc, { from: cpu2, to: cpu, fromPort: 'out', toPort: 'in', capacity: 10, latency: 0 }), /Cyclic/);
  assert.throws(() => graph.connect(doc, { from: client, to: cpu, fromPort: 'in', toPort: 'out', capacity: 10, latency: 0 }), /output port/);
});

test('checkpoint restoration exactly matches uninterrupted execution including RNG, retries and ownership', () => {
  const doc = graph.create(), uninterrupted = runtime.create(doc), split = runtime.create(doc);
  uninterrupted.runUntil(60); split.runUntil(2.35);
  assert.ok(split.snapshot().metrics.memoryMiB > 0);
  const cp = JSON.parse(JSON.stringify(split.checkpoint())), restored = runtime.create(doc);
  restored.restore(cp); restored.runUntil(60);
  assert.deepEqual(restored.checkpoint(), uninterrupted.checkpoint());
  assert.equal(restored.verify().status, 'match');
  const changed = structuredClone(doc); changed.workload.seed++;
  assert.throws(() => runtime.create(changed).restore(cp), /another model/);
});

test('outage interrupts attempts, stale completions are fenced and recovery causation is inspectable', () => {
  const doc = line(['client', 'rpc', 'database']), rpc = node(doc, 'rpc');
  Object.assign(rpc.overrides, { serviceTime: 1, failureAt: 0.5, recoveryAt: 1.5, retries: 5, retryDelay: 0.4 });
  doc.workload.count = 3;
  const run = runtime.create(doc); run.runUntil(60); const s = run.snapshot();
  assert.equal(s.metrics.completed, 3);
  assert.ok(s.attempts.some(a => a.nodeId === rpc.id && a.status === 'failed'));
  assert.ok(s.events.some(e => e.kind === 'node-recovered'));
  assert.equal(s.effects.length, 3);
  const info = run.inspect('request-1');
  assert.ok(info.history.some(e => e.kind === 'attempt-interrupted'));
  assert.ok(info.history.some(e => e.kind === 'retry-scheduled'));
  const byId = new Map(s.events.map(e => [e.id, e]));
  for (const e of s.events) for (const cause of e.causes) assert.ok(byId.has(cause) && byId.get(cause).time <= e.time);
});

test('admission memory and retry budgets keep rejected and unfinished work visible and resources reconcile', () => {
  const doc = line(['client', 'gpu', 'database']); doc.workload.count = 8; doc.workload.interval = 0.01;
  const gpu = node(doc, 'gpu'); Object.assign(gpu.overrides, { memoryLimitMiB: 65, retries: 0, serviceTime: 10 });
  const run = runtime.create(doc); run.runUntil(1);
  const early = run.snapshot(); assert.ok(early.metrics.rejected > 0); assert.ok(early.metrics.unfinished > 0);
  assert.equal(early.requests.length, 8); assert.ok(run.inspect(early.requests.find(r => r.status === 'rejected').id).history.some(e => e.kind === 'retry-budget-exhausted'));
  assert.equal(early.metrics.memoryMiB, early.nodes.reduce((sum, n) => sum + n.memoryMiB, 0));
  assert.ok(early.metrics.peakMemoryMiB >= early.metrics.memoryMiB); assert.ok(run.reconcile());
  run.runUntil(60); assert.equal(run.snapshot().metrics.memoryMiB, 0); assert.ok(run.reconcile());
});

test('cluster concurrency slots are shared across instances and affect actual completion times', () => {
  const doc = line(['client', 'cpu', 'database']), cpu = node(doc, 'cpu'), db = node(doc, 'database');
  doc.workload.count = 2; doc.workload.interval = 0.01; cpu.overrides.serviceTime = 1; db.overrides.serviceTime = 1;
  const ungrouped = runtime.create(doc); ungrouped.runUntil(60);
  doc.clusters.push({ id: 'cluster-test', label: 'Shared workers', capacity: 1 }); cpu.clusterId = 'cluster-test'; db.clusterId = 'cluster-test';
  const grouped = runtime.create(doc); grouped.runUntil(60);
  assert.ok(grouped.snapshot().requests.at(-1).completedAt > ungrouped.snapshot().requests.at(-1).completedAt);
  const attempts = grouped.snapshot().attempts.filter(a => [cpu.id, db.id].includes(a.nodeId));
  for (const a of attempts) for (const b of attempts) if (a.id !== b.id) assert.ok(a.finishedAt <= b.startedAt || b.finishedAt <= a.startedAt);
});

test('links serialize synthetic payloads and changing executable topology changes effects', () => {
  const doc = line(['client', 'cpu', 'database']); doc.workload.count = 2; doc.workload.interval = 0.01;
  doc.links[0].capacity = 1; doc.links[0].latency = 2;
  const slow = runtime.create(doc); slow.runUntil(60);
  const deliveries = slow.snapshot().events.filter(e => e.kind === 'link-delivered' && e.linkId === doc.links[0].id);
  assert.ok(deliveries[0].time >= 3); assert.ok(deliveries[1].time - deliveries[0].time >= 1 - 1e-9);
  const extra = graph.addNode(doc, 'class-replica', 500, 0);
  graph.connect(doc, { from: node(doc, 'database').id, to: extra, fromPort: 'out', toPort: 'in', capacity: 100, latency: 0.1 });
  const branched = runtime.create(doc); branched.runUntil(60);
  assert.equal(branched.snapshot().effects.length, slow.snapshot().effects.length * 2);
});

test('crawler spawns actual bounded tasks, database deduplicates logical request effects', () => {
  const doc = graph.create('collection'); doc.workload.count = 2;
  const run = runtime.create(doc); run.runUntil(60); const s = run.snapshot(), cpu = node(doc, 'cpu');
  assert.equal(s.attempts.filter(a => a.nodeId === cpu.id).length, 4);
  assert.ok(s.events.some(e => e.kind === 'effect-deduplicated'));
  assert.equal(s.effects.filter(e => e.nodeId === node(doc, 'database').id).length, 2);
  assert.equal(s.metrics.completed, 2);
});

test('seeded runs reproduce exactly, while a different seed changes declared service jitter', () => {
  const doc = line(), a = runtime.create(doc), b = runtime.create(doc); a.runUntil(20); b.runUntil(20);
  assert.deepEqual(a.checkpoint(), b.checkpoint());
  doc.workload.seed++; const c = runtime.create(doc); c.runUntil(20);
  assert.notDeepEqual(a.snapshot().attempts.map(t => t.serviceTime), c.snapshot().attempts.map(t => t.serviceTime));
});

test('checkpoint import refuses forged causal state without changing the current run', () => {
  const run = runtime.create(graph.create()); run.runUntil(2.4);
  const before = run.checkpoint(), forged = structuredClone(before);
  forged.state.pending[0].kind = 'arbitrary-execution';
  assert.throws(() => run.restore(forged), /causal state/);
  assert.deepEqual(run.checkpoint(), before);
  const forgedRng = structuredClone(before); forgedRng.state.rng++;
  assert.throws(() => run.restore(forgedRng), /causal state/);
  const reordered = Object.fromEntries(Object.entries(before).reverse());
  run.restore(reordered); assert.deepEqual(run.checkpoint(), before);
});

test('partial branch rejection preserves committed effects and visible causal request history', () => {
  const doc = line(); doc.workload.count = 2;
  const gpuId = graph.addNode(doc, 'class-gpu', 400, 300);
  graph.connect(doc, { from: node(doc, 'cpu').id, to: gpuId, fromPort: 'out', toPort: 'in', capacity: 100, latency: 0 });
  doc.nodes.find(n => n.id === gpuId).overrides = { memoryLimitMiB: 1, retries: 0 };
  const run = runtime.create(doc); run.runUntil(60); const s = run.snapshot();
  assert.equal(s.metrics.rejected, 2); assert.equal(s.metrics.effects, 2); assert.equal(s.metrics.unfinished, 0);
  const info = run.inspect('request-1');
  assert.equal(info.request.status, 'rejected'); assert.equal(info.effects.length, 1);
  assert.ok(info.history.some(e => e.kind === 'effect-committed'));
  assert.ok(info.history.some(e => e.kind === 'retry-budget-exhausted' && e.detail === 'memory-limit'));
  assert.equal(info.blocker, null); assert.deepEqual(info.blockers, []);
});

test('execution validates payload provenance through preserve stages and uses actual records for blockers', () => {
  const doc = line(['client', 'cpu']);
  const replica = graph.addNode(doc, 'class-replica', 500, 100);
  graph.connect(doc, { from: node(doc, 'cpu').id, to: replica, fromPort: 'out', toPort: 'in', capacity: 100, latency: 0 });
  graph.validate(doc);
  assert.throws(() => runtime.create(doc), /Incompatible executable payload/);
  const valid = graph.create(), run = runtime.create(valid); run.runUntil(2.4);
  for (const r of run.snapshot().requests) {
    const info = run.inspect(r.id);
    if (info.blocker?.kind === 'service') assert.equal(info.attempts.find(a => a.id === info.blocker.attemptId).status, 'active');
    for (const b of info.blockers) if (b.eventId) assert.ok(info.history.some(e => e.id === b.eventId));
  }
});

test('domain execution binds a deterministic WorldSpec to accepted document, model, seed and assumptions', () => {
  const doc = graph.create(), run = runtime.create(doc), spec = run.program();
  worldSpec.validateWorldSpec(spec);
  assert.deepEqual(spec.params.document, doc);
  assert.equal(spec.params.documentIdentity, graph.identity(doc));
  assert.equal(spec.params.model, runtime.MODEL);
  assert.equal(spec.params.seed, doc.workload.seed);
  assert.equal(spec.params.profileId, 'system-diagram-v1');
  assert.deepEqual(spec.params.assumptions, run.snapshot().assumptions);
  assert.equal(spec.contentHash, run.snapshot().worldSpecContentHash);
  assert.deepEqual(runtime.program(doc), spec);
  assert.ok(spec.unsupportedRequirements.some(r => r.id === 'production-fidelity'));
  doc.nodes[0].label = 'Different authored client';
  assert.notEqual(runtime.program(doc).contentHash, spec.contentHash);
  assert.notEqual(runtime.program(doc, 'alternate-system-diagram').contentHash, runtime.program(doc).contentHash);
  assert.deepEqual(run.program(), spec);
});
