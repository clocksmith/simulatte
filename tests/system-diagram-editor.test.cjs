const assert = require('node:assert/strict');
const test = require('node:test');
const graph = require('../public/simulatte/distributed-repair/graph-document.js');
const runtime = require('../public/simulatte/distributed-repair/graph-runtime.js');
const sessions = require('../public/simulatte/distributed-repair/editor-session.js');

test('pending document edits and undo history never mutate accepted execution', () => {
  const session = sessions.create(graph.create()), accepted = session.accept(), engine = runtime.create(accepted);
  engine.runUntil(2); const before = engine.checkpoint();
  const id = session.document().nodes.find(n => n.classId === 'class-gpu').id;
  session.change(doc => { doc.nodes.find(n => n.id === id).overrides.serviceTime = 3; });
  assert.equal(session.dirty(), true); assert.deepEqual(session.accepted(), accepted); assert.deepEqual(engine.checkpoint(), before);
  session.undo(); assert.equal(session.dirty(), false); session.redo(); assert.equal(session.dirty(), true);
  assert.equal(graph.resolveNode(session.document(), id).properties.serviceTime, 3);
  session.undo(); session.change(doc => { doc.nodes.find(n => n.id === id).x += 20; }); assert.equal(session.canRedo(), false);
});

test('invalid connection and invalid class changes are atomic, preserving undo and run', () => {
  const session = sessions.create(graph.create()), original = session.document();
  const client = original.nodes.find(n => n.classId === 'class-client'), replica = original.nodes.find(n => n.classId === 'class-replica');
  assert.throws(() => session.change(doc => graph.connect(doc, { from: client.id, to: replica.id, fromPort: 'out', toPort: 'in', capacity: 1, latency: 0 })), /Incompatible/);
  assert.deepEqual(session.document(), original); assert.equal(session.canUndo(), false);
  assert.throws(() => session.change(doc => { doc.classes.find(c => c.id === 'class-gpu').defaults.concurrency = 0; }), /concurrency/);
  assert.deepEqual(session.document(), original);
});

test('save/load preserves class definitions, instance overrides and separately accepted replay', () => {
  const session = sessions.create(graph.create('collection')); session.accept();
  const engine = runtime.create(session.accepted()); engine.runUntil(3);
  session.change(doc => { doc.nodes.find(n => n.classId === 'class-cpu').overrides.concurrency = 1; });
  const document = JSON.parse(JSON.stringify(session.export({ time: 3, checkpoint: engine.checkpoint() })));
  const read = sessions.read(document); assert.notDeepEqual(read.document, read.accepted);
  const restored = runtime.create(read.accepted); restored.restore(read.checkpoint);
  assert.deepEqual(restored.snapshot(), engine.snapshot()); restored.runUntil(60); engine.runUntil(60); assert.deepEqual(restored.snapshot(), engine.snapshot());
  assert.equal(graph.resolveNode(read.document, read.document.nodes.find(n => n.classId === 'class-cpu')).properties.concurrency, 1);
});

test('blank authoring remains editable and execution fails with concrete missing source', () => {
  const session = sessions.create(graph.create('blank')); assert.equal(session.document().nodes.length, 0);
  assert.throws(() => session.accept(), /client|scheduler/);
  session.change(doc => graph.addNode(doc, 'class-client', 10, 20)); assert.equal(session.document().nodes.length, 1);
  session.undo(); assert.equal(session.document().nodes.length, 0);
});

test('session import rejects undeclared fields and impossible replay times', () => {
  const session = sessions.create(graph.create()); const value = session.export();
  assert.throws(() => sessions.read({ ...value, time: -1 }), /time/);
  assert.throws(() => sessions.read({ ...value, unknown: true }), /fields/);
  assert.deepEqual(sessions.read(session.document()).document, session.document());
});

test('restoring a separately accepted document preserves its exact revision and pending layout', () => {
  const original = graph.create(), session = sessions.create(original); session.accept();
  session.change(doc => { doc.nodes[0].x = 9000; }); const pending = session.document();
  session.replace(original); session.accept(); session.replace(pending);
  assert.deepEqual(session.accepted(), original); assert.deepEqual(session.document(), pending);
  assert.equal(session.dirty(), true); assert.equal(session.accepted().revision, 1);
});
