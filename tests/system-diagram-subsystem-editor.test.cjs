'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const D = require('../public/simulatte/system-diagram/diagram.js');
const E = require('../public/simulatte/system-diagram/editor-model.js');
const UI = require('../public/simulatte/system-diagram/subsystem-editor.js');
const config = require('../public/data/system-diagram/config.json');
const library = require('../public/simulatte/system-diagram/class-library.js').loadSync(path.resolve(__dirname, '../public/data/system-diagram'));
function model() {
  const diagram = D.emptyDiagram(config);
  diagram.nodes = [{ id: 'worker', classId: 'worker', label: 'Worker', x: 0, y: 0, params: { concurrency: 2 } }];
  return E.create({ diagram, library, config });
}
function apply(m, command) { const result = m.apply(command); assert.equal(result.ok, true, result.error); return result; }
function save(m) { return apply(m, { type: 'saveSubsystem', nodeIds: ['worker'], definitionId: 'workers', label: 'Workers' }); }

test('editor captures, inserts, overrides and nests real definitions with transactional undo/redo', () => {
  const m = model(), original = m.diagram;
  const first = save(m); assert.equal(m.diagram.nodes.length, 1); assert.equal(m.diagram.subsystems.length, 1);
  const second = apply(m, { type: 'insertSubsystem', definitionId: 'workers', version: 1, x: 240, y: 0 });
  apply(m, { type: 'setSubsystemOverrides', id: second.id, overrides: { worker: { concurrency: 4 } } });
  assert.deepEqual(D.compile(m.diagram, library, config).nodes.map(n => n.params.concurrency), [2, 4]);
  const nested = apply(m, { type: 'saveSubsystem', nodeIds: [first.id, second.id], definitionId: 'fleet', label: 'Fleet' });
  assert.equal(D.compile(m.diagram, library, config).composition.instances.length, 3);
  assert.equal(m.diagram.nodes[0].id, nested.id);
  for (let i = 0; i < 4; i++) assert.equal(m.undo().ok, true);
  assert.deepEqual(m.diagram, original);
  for (let i = 0; i < 4; i++) assert.equal(m.redo().ok, true);
  assert.equal(D.compile(m.diagram, library, config).nodes.length, 2);
});

test('invalid overrides, immutable library conflicts and incompatible upgrades fail atomically', () => {
  const m = model(), saved = save(m), before = m.diagram;
  assert.equal(m.apply({ type: 'setSubsystemOverrides', id: saved.id, overrides: { absent: { concurrency: 2 } } }).ok, false);
  assert.equal(m.diagram, before);
  const imported = D.clone({ classes: before.classes, subsystems: before.subsystems }); imported.subsystems[0].label = 'Conflicting content';
  assert.equal(m.apply({ type: 'importSubsystemLibrary', library: imported }).ok, false); assert.equal(m.diagram, before);
  assert.equal(m.apply({ type: 'upgradeSubsystem', id: saved.id, version: 99 }).ok, false); assert.equal(m.diagram, before);
});

test('detached visual definition draft cancels cleanly and publishes without rewriting pinned instances', () => {
  const m = model(), first = save(m), session = UI.createSession(m, library, config), parent = m.diagram;
  session.open('subsystem.workers@1'); assert.equal(session.depth, 1); assert.equal(m.diagram.nodes[0].id, 'worker');
  apply(m, { type: 'setNodeParams', id: 'worker', params: { concurrency: 9 } });
  session.cancel(); assert.equal(session.depth, 0); assert.deepEqual(m.diagram, parent); assert.equal(m.canUndo(), true); assert.deepEqual(m.selection.nodes, [first.id]);
  session.open('subsystem.workers@1'); apply(m, { type: 'setNodeParams', id: 'worker', params: { concurrency: 7 } });
  const definition = session.publish(session.active.ports);
  assert.equal(definition.version, 2); assert.equal(m.diagram.nodes[0].classId, 'subsystem.workers@1');
  assert.equal(D.compile(m.diagram, library, config).nodes[0].params.concurrency, 2);
  assert.equal(m.undo().ok, true); assert.equal(m.diagram.subsystems.length, 1); assert.equal(m.redo().ok, true);
  apply(m, { type: 'upgradeSubsystem', id: first.id, version: 2 });
  assert.equal(D.compile(m.diagram, library, config).nodes[0].params.concurrency, 7);
});

test('nested definition navigation and invalid port publication retain the active draft', () => {
  const m = model(), first = save(m);
  apply(m, { type: 'saveSubsystem', nodeIds: [first.id], definitionId: 'outer', label: 'Outer' });
  const parent = m.diagram, session = UI.createSession(m, library, config);
  session.open('subsystem.outer@1'); const outer = m.diagram;
  session.open('subsystem.workers@1'); assert.equal(session.depth, 2);
  assert.throws(() => session.publish([{ id: 'broken', label: 'broken', direction: 'in', target: { nodeId: 'missing', portId: 'in' } }]), /missing/);
  assert.equal(session.depth, 2); assert.equal(m.diagram.nodes[0].id, 'worker');
  session.cancel(); assert.deepEqual(m.diagram, outer); session.cancel(); assert.deepEqual(m.diagram, parent);
});

test('portable library imports into another diagram without replacing existing graph', () => {
  const source = model(); save(source); const target = model();
  apply(target, { type: 'importSubsystemLibrary', library: { classes: source.diagram.classes, subsystems: source.diagram.subsystems } });
  assert.equal(target.diagram.nodes[0].id, 'worker');
  apply(target, { type: 'insertSubsystem', definitionId: 'workers', version: 1, x: 200, y: 50 });
  assert.equal(D.compile(target.diagram, library, config).nodes.length, 2);
  const before = target.diagram;
  const again = apply(target, { type: 'importSubsystemLibrary', library: { classes: source.diagram.classes, subsystems: source.diagram.subsystems } });
  assert.equal(again.unchanged, true); assert.equal(target.diagram, before);
});

test('composite live projection lists real internal paths without changing global metrics or claiming aggregate latency', () => {
  const m = model(), saved = save(m), compiled = D.compile(m.diagram, library, config), id = compiled.nodes[0].id;
  const view = { global: { completed: 3 }, nodes: { [id]: { health: 'down', busy: 2, queue: 3 } } };
  const projected = UI.projectState(view, compiled.composition), state = projected.nodes[saved.id];
  assert.equal(projected.global, view.global); assert.equal(Object.keys(view.nodes).length, 1);
  assert.equal(state.health, 'down'); assert.equal(state.busy, 2); assert.equal(state.queue, 3);
  assert.match(state.detail.worker, /2 busy; 3 queued/); assert.equal(state.latency, undefined);
  view.nodes[id].health = 'busy'; assert.equal(UI.projectState(view, compiled.composition).nodes[saved.id].health, 'busy');
});


test('publishing detached user class edits snapshots only the new version and leaves unrelated root class defaults intact', () => {
  const m = model(); save(m);
  apply(m, { type: 'addUserClass', id: 'user.shared', label: 'Shared', extends: 'worker', defaults: { concurrency: 3 } });
  apply(m, { type: 'addNode', id: 'unrelated', classId: 'user.shared', x: 400, y: 0 });
  const session = UI.createSession(m, library, config); session.open('subsystem.workers@1');
  apply(m, { type: 'setNodeClass', id: 'worker', classId: 'user.shared' });
  apply(m, { type: 'setNodeParams', id: 'worker', params: { concurrency: null } });
  apply(m, { type: 'updateUserClass', id: 'user.shared', patch: { defaults: { concurrency: 9 } } });
  session.publish(session.active.ports);
  assert.equal(m.diagram.classes[0].defaults.concurrency, 3);
  assert.equal(m.diagram.subsystems.find(d => d.version === 2).nodes[0].params.concurrency, 9);
  assert.equal(D.compile(m.diagram, library, config).nodes.find(n => n.id === 'unrelated').params.concurrency, 3);
});
