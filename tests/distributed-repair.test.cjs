const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('../public/simulatte/distributed-repair/model.js');
const architecture = require('../public/simulatte/distributed-repair/architecture.js');
const runners = require('../public/simulatte/distributed-repair/runner.js');
const coordinator = require('../public/shared/core/simulation/multirate-coordinator.js');
function engine(policy) { return coordinator.createCoordinator({ id: 'test', worldSpecContentHash: `world:${policy}`, modules: [model.moduleRecord(policy, 42)], ports: [], couplingPlan: { schema: 'simulatte.couplingPlan.v1', id: 'test', edges: [], coupledSolvers: [] } }); }
function reconcile(s) {
  const m = model.metrics(s);
  assert.equal(m.offered, m.completed + m.rejected + m.deadLetter + m.unfinished);
  assert.equal(m.memory, m.retained); assert.equal(m.allocated - m.released, m.memory);
  assert.ok(Math.abs(m.gpuWork - s.attempts.reduce((sum, a) => sum + a.performed, 0)) < 1e-9);
  for (const a of s.attempts) { const r = s.requests.find(r => r.id === a.requestId); assert.ok(Math.abs(a.performed + a.gpuRemaining - r.work * a.route.nodeIds.filter(id => s.architecture.nodes.find(n => n.id === id).type === 'gpu').length) < 1e-9); assert.ok(a.memory >= 0); }
}
test('first GPU completion, failed commit, lease expiry and duplicate delivery are causal model records', () => {
  const s = model.advance(model.initialize('baseline', 42), 12), info = model.inspect(s, 'request-1');
  const kinds = info.history.map(e => e.kind);
  for (const kind of ['gpu-completed', 'store-disabled', 'acknowledgement-failed', 'lease-expired']) assert.ok(kinds.includes(kind), kind);
  assert.ok(info.attempts.length > 1); assert.equal(info.effects.length, 0);
  assert.ok(info.history.find(e => e.kind === 'gpu-completed').time < info.history.find(e => e.kind === 'store-disabled').time);
  const failed = info.history.find(e => e.kind === 'acknowledgement-failed');
  assert.ok(failed.causes.every(id => info.history.some(e => e.id === id)));
  reconcile(s);
});
test('paired policies keep the same arrivals and faults; rejected/unfinished/deadlines stay visible', () => {
  const baseline = model.advance(model.initialize('baseline', 42), 40), bounded = model.advance(model.initialize('bounded', 42), 40);
  assert.deepEqual(baseline.source, bounded.source);
  assert.deepEqual(baseline.history.filter(e => ['store-disabled', 'store-restored', 'gpu-capacity-changed'].includes(e.kind)).map(e => [e.time, e.kind]), bounded.history.filter(e => ['store-disabled', 'store-restored', 'gpu-capacity-changed'].includes(e.kind)).map(e => [e.time, e.kind]));
  const a = model.metrics(baseline), b = model.metrics(bounded);
  assert.ok(a.unfinished > 0 && b.rejected > 0 && a.deadlineMisses > 0 && b.deadlineMisses > 0);
  assert.ok(b.peakMemory < a.peakMemory); assert.ok(b.completed > 0);
  assert.ok(bounded.history.some(e => e.kind === 'acknowledgement-lost'));
  assert.ok(bounded.history.some(e => e.kind === 'commit-deduplicated'));
  for (const r of bounded.requests) assert.ok(bounded.effects.filter(e => e.requestId === r.id).length <= 1);
  for (const r of bounded.requests.filter(r => r.status === 'rejected')) assert.equal(model.inspect(bounded, r.id).history.at(-1).kind, 'admission-rejected');
  reconcile(baseline); reconcile(bounded);
});
test('exact JSON checkpoint restoration and replay include pending resource work, leases, retries and RNG', async () => {
  for (const policy of ['baseline', 'bounded']) {
    const full = engine(policy); await full.runUntil(10);
    const point = JSON.parse(JSON.stringify(await full.checkpoint()));
    assert.ok(point.states['distributed-repair'].pending.length > 0);
    assert.ok(point.states['distributed-repair'].attempts.some(a => a.remaining > 0));
    await full.runUntil(32);
    const restored = engine(policy); await restored.restore(point); await restored.runUntil(32);
    assert.deepEqual(await restored.checkpoint(), await full.checkpoint());
    assert.equal((await full.replay()).status, 'match');
    reconcile((await full.checkpoint()).states['distributed-repair']);
  }
});
test('capacity changes recompute outstanding work and stale generation completions cannot finish it', () => {
  const s = model.advance(model.initialize('baseline', 42), 1.02);
  const a = s.attempts[0]; const initialGeneration = a.generation;
  s.pending.push({ id: ++s.sequence, at: 1.03, kind: 'finish', attemptId: a.id, generation: initialGeneration - 1 }); s.pending.sort((a, b) => a.at - b.at || a.id - b.id);
  const next = model.advance(s, 2);
  assert.equal(next.history.some(e => e.kind === 'gpu-completed'), false); reconcile(next);
  const faster = architecture.initial(); faster.nodes.find(n => n.type === 'gpu').capacity = 2; faster.clusters[0].capacity = 2;
  const fast = model.advance(model.initialize('baseline', 42, faster), 3);
  assert.ok(fast.history.some(e => e.kind === 'gpu-completed'));
});
test('authoring parallel routes and shared clusters changes execution; unsupported/disconnected connections reject', () => {
  const graph = architecture.initial(), cpu = architecture.addNode(graph, 'cpu'), gpu = architecture.addNode(graph, 'gpu');
  assert.throws(() => architecture.validate(graph), /Disconnected/);
  assert.throws(() => architecture.connect(graph, 'store-4', 'source-1', 100, 0), /Invalid connection/);
  architecture.connect(graph, 'source-1', cpu, 100, 0.1); architecture.connect(graph, cpu, gpu, 100, 0.1); architecture.connect(graph, gpu, 'store-4', 100, 0.1);
  architecture.group(graph, ['gpu-3', gpu], 2); architecture.validate(graph);
  const s = model.advance(model.initialize('baseline', 42, graph), 10);
  assert.ok(s.attempts.some(a => a.route.nodeIds.includes(gpu)));
  const slow = structuredClone(graph); slow.clusters.at(-1).capacity = 0.1;
  const constrained = model.advance(model.initialize('baseline', 42, slow), 10);
  assert.ok(model.metrics(constrained).gpuWork < model.metrics(s).gpuWork);
  const changed = structuredClone(graph); changed.links[0].latency = 2;
  assert.notDeepEqual(model.advance(model.initialize('baseline', 42, changed), 10).history, s.history);
  architecture.remove(graph, gpu); architecture.remove(graph, cpu); architecture.validate(graph);
  assert.equal(graph.links.some(l => l.from === gpu || l.to === gpu), false);
});
test('runner checkpoint restore, repair control replay and immutable accepted architecture', async () => {
  const graph = architecture.initial(), runner = await runners.create('bounded', 42, graph);
  graph.nodes[1].capacity = 1000;
  await runner.runUntil(10); const saved = await runner.checkpoint();
  assert.equal(runner.snapshot().state.architecture.nodes[1].capacity, 1);
  await runner.repair(); await runner.runUntil(20); const repaired = runner.snapshot();
  assert.equal((await runner.verify()).status, 'match');
  await runner.restore(saved); assert.equal(runner.snapshot().time, 10); assert.equal(runner.snapshot().state.store, false);
  await runner.repair(); await runner.runUntil(20); assert.deepEqual(runner.snapshot(), repaired);
});

test('stage chains are executable beyond one inference layout and invalid model parameters fail closed', () => {
  const graph = architecture.initial();
  architecture.remove(graph, 'gpu-3');
  architecture.connect(graph, 'cpu-2', 'store-4', 10, 0.2);
  architecture.validate(graph);
  const s = model.advance(model.initialize('bounded', 42, graph), 5);
  assert.ok(s.history.some(e => e.kind === 'cpu-completed'));
  assert.equal(s.history.some(e => e.kind === 'gpu-started'), false);
  reconcile(s);
  const config = structuredClone(require('../public/data/distributed-repair/config.json'));
  config.resources.leaseSeconds = false;
  assert.throws(() => model.initialize('baseline', 42, graph, config), /Invalid resources/);
  const cyclic = architecture.initial(), cpu = architecture.addNode(cyclic, 'cpu');
  architecture.connect(cyclic, 'cpu-2', cpu, 100, 0); architecture.connect(cyclic, cpu, 'cpu-2', 100, 0);
  assert.throws(() => architecture.validate(cyclic), /Cyclic/);
});

test('observation frequency does not change the event trace or resource trajectory', async () => {
  const sampled = await runners.create('bounded'), direct = await runners.create('bounded');
  for (const time of [0.3, 0.8, 1.7, 3.07, 5.1, 10.3]) await sampled.runUntil(time);
  await direct.runUntil(10.3);
  assert.deepEqual(await sampled.checkpoint(), await direct.checkpoint());
  assert.equal(sampled.snapshot().state.time, 10.3);
  assert.deepEqual(sampled.snapshot(), direct.snapshot());
});

test('accepted runs bind a validated WorldSpec and checkpoints reject a different architecture', async () => {
  const specApi = require('../public/shared/contracts/world-spec.js');
  const graph = architecture.initial(), first = await runners.create('bounded', 42, graph);
  specApi.validateWorldSpec(first.program());
  assert.equal(first.program().params.architecture.revision, graph.revision);
  const saved = await first.checkpoint();
  graph.nodes.find(n => n.type === 'gpu').capacity = 2;
  const second = await runners.create('bounded', 42, graph);
  assert.notEqual(first.program().contentHash, second.program().contentHash);
  await assert.rejects(second.restore(saved), { code: 'multirate_checkpoint_world_mismatch' });
});

test('retry exhaustion is a visible dead-letter outcome with reconciled retained resources', () => {
  const config = structuredClone(require('../public/data/distributed-repair/config.json'));
  config.policies.bounded.retryBudget = 1;
  const state = model.advance(model.initialize('bounded', 42, architecture.initial(), config), 40);
  const dead = state.requests.filter(r => r.status === 'dead-letter'); assert.ok(dead.length > 0);
  for (const request of dead) assert.ok(model.inspect(state, request.id).history.some(e => e.kind === 'retry-budget-exhausted'));
  reconcile(state);
});
