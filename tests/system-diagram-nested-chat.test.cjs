'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const base = '../public/simulatte/system-diagram/';
const D = require(base + 'diagram.js'), E = require(base + 'engine.js'), R = require(base + 'runner.js');
const O = require(base + 'engine-observability.js'), N = require(base + 'engine-network.js');
const config = require('../public/data/system-diagram/config.json');
const library = require(base + 'class-library.js').loadSync(path.resolve(__dirname, '../public/data/system-diagram'));
const kernels = require(base + 'kernels-all.js'), deps = { library, config, kernels };
const fixture = () => structuredClone(require('../public/data/system-diagram/examples/nested-chat.json'));
function run(doc, until = doc.run.horizonSec) {
  const compiled = D.compile(doc, library, config), state = E.initialize(compiled, deps);
  E.advance(compiled, state, until, deps);
  assert.equal(state.error, null); assert.ok(O.reconcile(state)); N.reconcile(state);
  return { compiled, state, view: E.observe(compiled, state, deps) };
}
function delay(doc, ms) {
  doc.nodes.find(n => n.id === 'backend').overrides = {
    'generation-capacity/generation': { chunkDelayMs: ms },
    'generation-capacity/generation-b': { chunkDelayMs: ms },
  };
  return doc;
}
const demand = state => Object.values(state.observability.requests).map(r => ({ sourceId: r.sourceId, arrival: r.arrival, input: r.input }));

test('nested chat executes typed backend and generation definitions rather than a placeholder kernel', () => {
  const doc = fixture(), { compiled, state, view } = run(doc);
  assert.equal(doc.nodes.length, 2);
  assert.equal(D.subsystems.definition(doc, 'subsystem.chat-backend@1').nodes.find(n => n.id === 'generation-capacity').classId, 'subsystem.generation-capacity@1');
  assert.equal(compiled.nodes.length, 15);
  assert.ok(compiled.nodes.every(n => n.kernel !== 'subsystem'));
  assert.equal(view.global.offered, 8); assert.equal(view.global.completed, 7); assert.equal(view.global.failed, 1);
  assert.equal(view.global.effects, 6); assert.equal(state.kernel.client.chunks.length, 16);
  for (const n of compiled.nodes.filter(n => n.kernel === 'syntheticStream')) assert.ok(view.nodes[n.id].arrivals > 0);
  assert.deepEqual(D.portsForNode(doc.nodes.find(n => n.id === 'backend'), doc, library, config).map(p => [p.id, p.direction]), [['requests', 'in'], ['delivery', 'out']]);
});

test('nested generation overrides change modeled bottlenecks under identical offered demand', () => {
  const baseline = run(fixture()), slow = run(delay(fixture(), 3000));
  assert.deepEqual(demand(slow.state), demand(baseline.state));
  assert.equal(baseline.state.kernel.client.chunks.length, 16);
  assert.equal(slow.state.kernel.client.chunks.length, 0);
  assert.ok(slow.view.global.failedBy.timeout > 0);
  assert.ok(slow.view.global.completed < baseline.view.global.completed);
  assert.ok(slow.view.global.effects < baseline.view.global.effects);
  assert.ok(slow.view.global.retries > baseline.view.global.retries);
  assert.ok(slow.view.global.peakMemoryMiB > baseline.view.global.peakMemoryMiB);
  assert.equal(fixture().subsystems.find(d => d.id === 'generation-capacity').nodes.find(n => n.id === 'generation').params.chunkDelayMs, 120);
});

test('nested chat survives JSON checkpoint continuation and ignores presentation-only edits', () => {
  const doc = fixture(), complete = run(doc), split = run(doc, .42), restored = JSON.parse(JSON.stringify(split.state));
  E.advance(split.compiled, restored, doc.run.horizonSec, deps);
  assert.deepEqual(restored, complete.state);
  for (const graph of [doc, ...doc.subsystems]) {
    graph.nodes.forEach(n => { n.x += 17; n.y -= 9; });
    graph.groups.forEach(g => { g.collapsed = !g.collapsed; g.x += 13; });
  }
  doc.subsystems.find(d => d.id === 'chat-backend').notes.push({ id: 'annotation', text: 'Presentation only', x: 0, y: 0 });
  assert.deepEqual(D.compile(doc, library, config), complete.compiled);
});

test('publishing and upgrading a nested backend never mutates an accepted runner or replay', async () => {
  const doc = fixture(), runner = await R.create({ diagram: doc, ...deps });
  try {
    const before = structuredClone(runner.compiled);
    const revision = structuredClone(doc.subsystems.find(d => d.id === 'chat-backend'));
    revision.version = 2;
    revision.nodes.find(n => n.id === 'generation-capacity').overrides = { generation: { chunkDelayMs: 3000 }, 'generation-b': { chunkDelayMs: 3000 } };
    const published = D.subsystems.publish(doc, revision, library, config).diagram;
    assert.deepEqual(D.compile(published, library, config), before, 'publishing does not move pins');
    const upgraded = D.subsystems.upgrade(published, 'backend', 2, library, config).diagram;
    assert.notDeepEqual(D.compile(upgraded, library, config), before);
    assert.deepEqual(runner.compiled, before);
    await runner.advanceTo(doc.run.horizonSec);
    assert.equal(runner.view().global.completed, 7);
    assert.equal((await runner.verify()).status, 'match');
    assert.equal(R.replay(JSON.parse(JSON.stringify(runner.exportReplay())), deps).status, 'match');
    assert.ok(run(upgraded).view.global.completed < runner.view().global.completed);
  } finally { await runner.dispose(); }
});
