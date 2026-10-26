'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const libraryApi = require('../public/simulatte/system-diagram/class-library.js');
const D = require('../public/simulatte/system-diagram/diagram.js');
const Editor = require('../public/simulatte/system-diagram/editor-model.js');
const Files = require('../public/simulatte/system-diagram/file-io.js');
const Glyphs = require('../public/simulatte/system-diagram/glyphs.js');
const config = require('../public/data/system-diagram/config.json');
const library = libraryApi.loadSync(path.join(root, 'public/data/system-diagram'));

function sample() {
  return {
    schema: D.SCHEMA, id: 'sample', name: 'Sample', seed: 7, run: { horizonSec: 60 },
    classes: [{ id: 'user.fast-api', label: 'Fast API', extends: 'web-server', defaults: { serviceMs: 2 } }],
    nodes: [
      { id: 'users', classId: 'web-client', label: 'Users', x: 0, y: 0, params: {} },
      { id: 'api', classId: 'user.fast-api', label: 'API', x: 240, y: 0, params: { concurrency: 4 }, groupId: 'zone-a' },
      { id: 'db', classId: 'database', label: 'DB', x: 480, y: 0, params: {} },
    ],
    edges: [
      { id: 'e1', from: { nodeId: 'users', portId: 'out' }, to: { nodeId: 'api', portId: 'in' }, params: {} },
      { id: 'e2', from: { nodeId: 'api', portId: 'calls' }, to: { nodeId: 'db', portId: 'in' }, params: {} },
    ],
    groups: [{ id: 'zone-a', label: 'Zone A', kind: 'zone', x: 200, y: -40, w: 260, h: 160 }],
    notes: [{ id: 'note-1', text: 'Hello', x: 0, y: 200 }],
    faults: [
      { id: 'f1', atSec: 10, untilSec: 20, target: { kind: 'node', id: 'db' }, type: 'slow', params: {} },
      { id: 'f2', atSec: 5, untilSec: null, target: { kind: 'edge', id: 'e2' }, type: 'partition', params: {} },
      { id: 'f3', atSec: 5, untilSec: 9, target: { kind: 'group', id: 'zone-a' }, type: 'outage', params: {} },
    ],
    view: { x: 0, y: 0, zoom: 1 },
  };
}
const make = (diagram = sample()) => Editor.create({ diagram, library, config });
const node = (m, id) => m.diagram.nodes.find(n => n.id === id);
function recorder(m) { const events = []; m.subscribe(e => events.push(e)); return events; }

test('every command reports its change kind and notifies subscribers', () => {
  const m = make(), events = recorder(m);
  const cases = [
    [{ type: 'addNode', classId: 'cache', x: 16, y: 320 }, 'structure'],
    [{ type: 'moveItems', ids: ['users'], dx: 8, dy: 8 }, 'layout'],
    [{ type: 'setPositions', positions: { users: { x: 40, y: 40 } } }, 'layout'],
    [{ type: 'setNodeLabel', id: 'users', label: 'Visitors' }, 'label'],
    [{ type: 'setNodeParams', id: 'db', params: { connections: 2 } }, 'params'],
    [{ type: 'setEdgeParams', id: 'e1', params: { latencyMs: 30 } }, 'params'],
    [{ type: 'setNodeGroup', id: 'db', groupId: 'zone-a' }, 'structure'],
    [{ type: 'addGroup', kind: 'region', x: 0, y: 0, w: 100, h: 100 }, 'structure'],
    [{ type: 'updateGroup', id: 'zone-a', patch: { label: 'Zone east' } }, 'label'],
    [{ type: 'updateGroup', id: 'zone-a', patch: { w: 300 } }, 'layout'],
    [{ type: 'addNote', text: 'n', x: 0, y: 0 }, 'label'],
    [{ type: 'updateNote', id: 'note-1', patch: { x: 50 } }, 'layout'],
    [{ type: 'updateNote', id: 'note-1', patch: { text: 'Bye' } }, 'label'],
    [{ type: 'addFault', fault: { atSec: 1, untilSec: 2, target: { kind: 'node', id: 'users' }, type: 'crash', params: {} } }, 'faults'],
    [{ type: 'updateFault', id: 'f1', patch: { atSec: 12 } }, 'faults'],
    [{ type: 'removeFault', id: 'f1' }, 'faults'],
    [{ type: 'addUserClass', label: 'Slow DB', extends: 'database', defaults: { readMs: 50 } }, 'classes'],
    [{ type: 'updateUserClass', id: 'user.fast-api', patch: { defaults: { serviceMs: 3 } } }, 'classes'],
    [{ type: 'setMeta', patch: { name: 'Renamed' } }, 'label'],
    [{ type: 'setMeta', patch: { seed: 9 } }, 'meta'],
    [{ type: 'setMeta', patch: { horizonSec: 30 } }, 'meta'],
    [{ type: 'deriveClass', nodeId: 'db' }, 'structure'],
    [{ type: 'setNodeClass', id: 'users', classId: 'mobile-client' }, 'structure'],
    [{ type: 'duplicate', ids: ['users'] }, 'structure'],
    [{ type: 'deleteItems', ids: ['note-1'] }, 'structure'],
  ];
  for (const [command, kind] of cases) {
    const result = m.apply(command);
    assert.equal(result.ok, true, `${command.type}: ${result.error}`);
    assert.equal(result.kind, kind, command.type);
    assert.equal(events.at(-1).kind, kind, command.type);
    assert.equal(events.at(-1).command, command);
    assert.equal(events.at(-1).diagram, m.diagram);
  }
  assert.equal(events.length, cases.length);
  assert.doesNotThrow(() => D.validate(m.diagram, library, config));
});

test('view and selection changes notify without entering history', () => {
  const m = make(), events = recorder(m);
  assert.equal(m.apply({ type: 'setView', view: { x: 10, y: -5, zoom: 2 } }).kind, 'view');
  assert.deepEqual(m.diagram.view, { x: 10, y: -5, zoom: 2 });
  assert.equal(m.apply({ type: 'setView', view: { zoom: 99 } }).ok, false);
  assert.equal(m.select({ nodes: ['api', 'missing'] }).kind, 'selection');
  assert.deepEqual(m.selection.nodes, ['api']);
  m.select({ nodes: ['db'] }, { additive: true });
  assert.deepEqual(m.selection.nodes, ['api', 'db']);
  m.select({ nodes: ['api'] }, { toggle: true });
  assert.deepEqual(m.selection.nodes, ['db']);
  m.select(['e1', 'zone-a']);
  assert.deepEqual(m.selection, { nodes: [], edges: ['e1'], groups: ['zone-a'], notes: [] });
  assert.deepEqual(events.map(e => e.kind), ['view', 'selection', 'selection', 'selection', 'selection']);
  assert.equal(m.canUndo(), false);
});

test('invalid commands leave document, selection and history unchanged', () => {
  const m = make(), events = recorder(m);
  m.select({ nodes: ['api'] });
  const before = m.diagram, selected = m.selection;
  const invalid = [
    { type: 'addNode', classId: 'no-such-class', x: 0, y: 0 },
    { type: 'addNode', classId: 'cache', x: Number.NaN, y: 0 },
    { type: 'setNodeParams', id: 'api', params: { concurrency: -1 } },
    { type: 'setNodeParams', id: 'api', params: { bogus: 1 } },
    { type: 'setNodeLabel', id: 'nope', label: 'x' },
    { type: 'connect', from: { nodeId: 'db', portId: 'in' }, to: { nodeId: 'api', portId: 'in' } },
    { type: 'connect', from: { nodeId: 'users', portId: 'out' }, to: { nodeId: 'api', portId: 'in' } },
    { type: 'connect', from: { nodeId: 'api', portId: 'calls' }, to: { nodeId: 'api', portId: 'in' } },
    { type: 'setEdgeParams', id: 'e1', params: { latencyMs: -5 } },
    { type: 'setNodeGroup', id: 'api', groupId: 'missing' },
    { type: 'updateGroup', id: 'zone-a', patch: { kind: 'boundary' } },
    { type: 'updateGroup', id: 'zone-a', patch: { w: 0 } },
    { type: 'addFault', fault: { atSec: 1, untilSec: 2, target: { kind: 'node', id: 'users' }, type: 'slow', params: {} } },
    { type: 'updateFault', id: 'f1', patch: { untilSec: 1 } },
    { type: 'deleteUserClass', id: 'user.fast-api' },
    { type: 'addUserClass', label: 'Bad', extends: 'database', defaults: { readMs: -1 } },
    { type: 'setMeta', patch: { seed: -1 } },
    { type: 'setMeta', patch: { horizonSec: 1 } },
    { type: 'deleteItems', ids: ['api', 'ghost'] },
    { type: 'moveItems', ids: ['e1'], dx: 1, dy: 1 },
    { type: 'setPositions', positions: { api: { x: 1, y: 2, w: 3 } } },
    { type: 'duplicate', ids: [] },
    { type: 'noSuchCommand' },
    { type: 'replace', diagram: { schema: 'wrong' } },
  ];
  for (const command of invalid) {
    const result = m.apply(command);
    assert.equal(result.ok, false, command.type);
    assert.equal(typeof result.error, 'string');
    assert.equal(m.diagram, before, command.type);
    assert.equal(m.selection, selected, command.type);
  }
  assert.equal(events.length, 1);
  assert.equal(m.canUndo(), false);
});

test('the document is frozen so callers cannot bypass commands', () => {
  const m = make();
  assert.throws(() => { m.diagram.nodes[0].x = 5; }, TypeError);
  assert.throws(() => { m.diagram.nodes.push({}); }, TypeError);
});

test('deleting a node cascades its edges and faults and reports what was removed', () => {
  const m = make();
  m.select({ nodes: ['api', 'db'], edges: ['e1'] });
  const result = m.apply({ type: 'deleteItems', ids: ['api'] });
  assert.equal(result.ok, true);
  assert.deepEqual(result.removed, { nodes: ['api'], edges: ['e1', 'e2'], groups: [], notes: [], faults: ['f2'] });
  assert.deepEqual(m.diagram.edges, []);
  assert.deepEqual(m.diagram.faults.map(f => f.id), ['f1', 'f3']);
  assert.deepEqual(m.selection, { nodes: ['db'], edges: [], groups: [], notes: [] });
  const group = m.apply({ type: 'deleteItems', ids: ['zone-a'] });
  assert.deepEqual(group.removed.faults, ['f3']);
  assert.equal(m.apply({ type: 'deleteItems', ids: [] }).ok, false);
});

test('deleting a group keeps its member nodes and clears their membership', () => {
  const m = make();
  m.apply({ type: 'deleteItems', ids: ['zone-a'] });
  assert.equal(Object.hasOwn(node(m, 'api'), 'groupId'), false);
  assert.ok(node(m, 'api'));
});

test('moving a group moves its member nodes once even when they are also selected', () => {
  const m = make();
  m.apply({ type: 'moveItems', ids: ['zone-a', 'api', 'note-1'], dx: 16, dy: -8 });
  assert.deepEqual([node(m, 'api').x, node(m, 'api').y], [256, -8]);
  assert.deepEqual([m.diagram.groups[0].x, m.diagram.groups[0].y], [216, -48]);
  assert.deepEqual([node(m, 'users').x, m.diagram.notes[0].x], [0, 16]);
});

test('setNodeParams patches overrides and null resets an override to the class default', () => {
  const m = make();
  m.apply({ type: 'setNodeParams', id: 'api', params: { serviceMs: 7 } });
  assert.deepEqual(node(m, 'api').params, { concurrency: 4, serviceMs: 7 });
  m.apply({ type: 'setNodeParams', id: 'api', params: { concurrency: null } });
  assert.deepEqual(node(m, 'api').params, { serviceMs: 7 });
  assert.equal(D.resolveNodeParams(node(m, 'api'), m.diagram, library, config).sources.concurrency, 'web-server');
});

test('connect returns the new edge id, selects it and reports payload warnings', () => {
  const m = make();
  m.apply({ type: 'addNode', classId: 'embedder', x: 0, y: 400, id: 'emb' });
  const result = m.apply({ type: 'connect', from: { nodeId: 'users', portId: 'out' }, to: { nodeId: 'db', portId: 'in' } });
  assert.equal(result.ok, true);
  assert.equal(result.id, 'edge-1');
  assert.deepEqual(m.selection.edges, ['edge-1']);
  const mismatch = m.apply({ type: 'connect', from: { nodeId: 'users', portId: 'out' }, to: { nodeId: 'emb', portId: 'in' } });
  assert.equal(mismatch.ok, true);
  assert.match(mismatch.warning || '', /expects/);
});

test('addNode allocates class-based ids, default labels and selects the node', () => {
  const m = make();
  const result = m.apply({ type: 'addNode', classId: 'user.fast-api', x: 8, y: 8, groupId: 'zone-a' });
  assert.equal(result.id, 'fast-api-1');
  assert.equal(node(m, 'fast-api-1').label, 'Fast API');
  assert.equal(node(m, 'fast-api-1').groupId, 'zone-a');
  assert.deepEqual(m.selection.nodes, ['fast-api-1']);
});

test('setNodeClass keeps valid overrides and drops edges the new kernel cannot serve', () => {
  const m = make();
  const result = m.apply({ type: 'setNodeClass', id: 'api', classId: 'website' });
  assert.equal(result.ok, true);
  assert.deepEqual(result.removedEdges, ['e2']);
  assert.deepEqual(m.diagram.edges.map(e => e.id), ['e1']);
  assert.ok(!m.diagram.faults.some(f => f.id === 'f2'));
});

test('undo and redo restore documents, keep the camera and bound history', () => {
  const m = make();
  m.apply({ type: 'setNodeLabel', id: 'api', label: 'One' });
  m.apply({ type: 'setNodeLabel', id: 'api', label: 'Two' });
  m.apply({ type: 'setView', view: { x: 100, y: 100, zoom: 1.5 } });
  const events = recorder(m);
  assert.equal(m.undo().kind, 'label');
  assert.equal(node(m, 'api').label, 'One');
  assert.deepEqual(m.diagram.view, { x: 100, y: 100, zoom: 1.5 });
  assert.equal(events.at(-1).command.type, 'undo');
  m.undo();
  assert.equal(node(m, 'api').label, 'API');
  assert.equal(m.canUndo(), false);
  assert.equal(m.undo().ok, false);
  m.redo();
  assert.equal(node(m, 'api').label, 'One');
  m.apply({ type: 'setNodeLabel', id: 'api', label: 'Branch' });
  assert.equal(m.canRedo(), false);

  const small = Editor.create({ diagram: sample(), library, config: { ...config, editor: { ...config.editor, historyLimit: 3 } } });
  for (let i = 0; i < 6; i++) small.apply({ type: 'moveItems', ids: ['users'], dx: 8, dy: 0 });
  let undone = 0; while (small.undo().ok) undone++;
  assert.equal(undone, 3);
  assert.equal(small.diagram.nodes[0].x, 24);
});

test('continuous drags coalesce into one history entry keyed by gesture', () => {
  const m = make();
  for (let i = 1; i <= 20; i++) m.apply({ type: 'setPositions', positions: { users: { x: i * 8, y: 0 } }, coalesce: 'drag-1' });
  m.apply({ type: 'setNodeGroup', id: 'users', groupId: 'zone-a', coalesce: 'drag-1' });
  for (let i = 1; i <= 5; i++) m.apply({ type: 'setPositions', positions: { db: { x: 480 + i * 8, y: 0 } }, coalesce: 'drag-2' });
  assert.equal(node(m, 'users').x, 160);
  const second = m.undo();
  assert.equal(second.kind, 'layout');
  assert.equal(node(m, 'db').x, 480);
  const first = m.undo();
  assert.equal(first.kind, 'structure', 'coalesced entries report the strongest kind');
  assert.equal(node(m, 'users').x, 0);
  assert.equal(Object.hasOwn(node(m, 'users'), 'groupId'), false);
  assert.equal(m.canUndo(), false);
  m.redo();
  assert.equal(node(m, 'users').x, 160);
  assert.equal(node(m, 'users').groupId, 'zone-a');
  for (let i = 0; i < 2; i++) m.apply({ type: 'setPositions', positions: { users: { x: 0, y: 0 } }, coalesce: 'drag-1' });
  m.undo();
  assert.equal(node(m, 'users').x, 160, 'a stale gesture key after undo or redo starts a new entry');
});

test('commands that change nothing do not add history or notify', () => {
  const m = make(), events = recorder(m);
  const result = m.apply({ type: 'setPositions', positions: { users: { x: 0, y: 0 } } });
  assert.equal(result.ok, true);
  assert.equal(result.unchanged, true);
  assert.equal(events.length, 0);
  assert.equal(m.canUndo(), false);
});

test('user classes cannot be deleted while referenced, and editing defaults reaches instances', () => {
  const m = make();
  const added = m.apply({ type: 'addUserClass', label: 'Slow DB', extends: 'database', defaults: { readMs: 50 }, glyph: 'warehouse' });
  assert.equal(added.id, 'user.slow-db');
  const child = m.apply({ type: 'addUserClass', label: 'Slower DB', extends: 'user.slow-db', defaults: {} });
  m.apply({ type: 'setNodeClass', id: 'db', classId: 'user.slower-db' });
  assert.match(m.apply({ type: 'deleteUserClass', id: 'user.slow-db' }).error, /extended by user.slower-db/);
  assert.match(m.apply({ type: 'deleteUserClass', id: child.id }).error, /used by node db/);
  m.apply({ type: 'updateUserClass', id: 'user.slow-db', patch: { defaults: { readMs: 80 }, glyph: null } });
  const resolved = D.resolveNodeParams(node(m, 'db'), m.diagram, library, config);
  assert.equal(resolved.values.readMs, 80);
  assert.equal(resolved.sources.readMs, 'user.slow-db');
  assert.equal(m.diagram.classes.find(k => k.id === 'user.slow-db').glyph, undefined);
  m.apply({ type: 'setNodeClass', id: 'db', classId: 'database' });
  assert.equal(m.apply({ type: 'deleteUserClass', id: child.id }).ok, true);
  assert.equal(m.apply({ type: 'deleteUserClass', id: 'user.slow-db' }).ok, true);
  assert.equal(m.apply({ type: 'updateUserClass', id: 'user.fast-api', patch: { id: 'user.x' } }).ok, false);
});

test('deriveClass moves instance overrides into a new user class without changing resolved values', () => {
  const m = make();
  const before = D.resolveNodeParams(node(m, 'api'), m.diagram, library, config).values;
  const result = m.apply({ type: 'deriveClass', nodeId: 'api', label: 'Tuned API' });
  assert.equal(result.ok, true);
  assert.equal(result.id, 'user.tuned-api');
  assert.equal(node(m, 'api').classId, 'user.tuned-api');
  assert.deepEqual(node(m, 'api').params, {});
  assert.deepEqual(D.resolveNodeParams(node(m, 'api'), m.diagram, library, config).values, before);
  m.undo();
  assert.equal(node(m, 'api').classId, 'user.fast-api');
  assert.equal(m.diagram.classes.length, 1);
});

test('duplicate copies nodes, internal edges and whole groups and selects the copies', () => {
  const m = make();
  m.select({ nodes: ['users', 'api'] });
  const result = m.apply({ type: 'duplicate' });
  assert.equal(result.ok, true);
  assert.equal(m.diagram.nodes.length, 5);
  const copies = result.created;
  assert.equal(copies.length, 3);
  const edge = m.diagram.edges.find(e => e.id === copies[2]);
  assert.deepEqual([edge.from.nodeId, edge.to.nodeId], [copies[0], copies[1]]);
  assert.equal(node(m, copies[1]).groupId, 'zone-a');
  assert.deepEqual(m.selection.nodes, copies.slice(0, 2));
  assert.equal(node(m, copies[0]).x, config.editor.grid * 3);
  const group = m.apply({ type: 'duplicate', ids: ['zone-a'] });
  const newGroup = group.created[0];
  assert.equal(m.diagram.groups.length, 2);
  assert.ok(m.diagram.nodes.some(n => n.groupId === newGroup && n.classId === 'user.fast-api'));
});

test('replace loads a new document, clears history and selection, and rejects invalid input', () => {
  const m = make(), events = recorder(m);
  m.apply({ type: 'setNodeLabel', id: 'api', label: 'x' });
  m.select({ nodes: ['api'] });
  const result = m.replace(D.emptyDiagram(config));
  assert.equal(result.kind, 'load');
  assert.equal(m.diagram.nodes.length, 0);
  assert.equal(m.canUndo(), false);
  assert.deepEqual(m.selection.nodes, []);
  assert.equal(events.at(-1).kind, 'load');
  assert.equal(m.replace({}).ok, false);
});

test('issues() reports unconnected required ports of the current document', () => {
  const m = make();
  m.apply({ type: 'addNode', classId: 'task-queue', x: 0, y: 500 });
  assert.ok(m.issues().some(w => w.kind === 'unconnected-port'));
});

test('autosave survives missing or throwing storage and round-trips documents', () => {
  const throwing = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() { throw new Error('denied'); } };
  const broken = Files.autosave(config, throwing);
  assert.equal(broken.save(sample()), false);
  assert.equal(broken.load(), null);
  assert.equal(broken.clear(), false);
  assert.equal(Files.autosave(config, null).load(), null);
  const map = new Map();
  const storage = { getItem: k => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: k => map.delete(k) };
  const store = Files.autosave(config, storage);
  assert.equal(store.save(sample()), true);
  assert.ok(map.has(config.editor.autosaveKey));
  assert.deepEqual(store.load(), sample());
  map.set(config.editor.autosaveKey, '{not json');
  assert.equal(store.load(), null);
  assert.equal(store.clear(), true);
  assert.equal(store.load(), null);
  assert.equal(Files.fileName({ name: 'Web service: v2!', id: 'web' }), 'web-service-v2.json');
});

test('every glyph id used by the class library has a drawn glyph', () => {
  const missing = Object.values(library.classes).map(k => k.glyph).filter(id => !Glyphs.has(id));
  assert.deepEqual(missing, []);
  assert.ok(Glyphs.path('unknown-glyph').length > 0, 'unknown ids fall back to a generic glyph');
});


test('fitted camera below ordinary zoom remains valid and survives browser storage', () => {
  const model = Editor.create({diagram: sample(), library, config});
  const view = {x: -9239, y: -16365, zoom: 0.02640845070422535};
  D.validate({...model.diagram, view}, library, config);
  assert.equal(model.apply({type: 'setView', view}).ok, true);
  const storage = new Map();
  const files = Files.autosave(config, {getItem: k => storage.get(k), setItem: (k, v) => storage.set(k, v)});
  assert.equal(files.save(model.diagram), true);
  const restored = Editor.create({diagram: files.loadRecord().diagram, library, config});
  assert.deepEqual(restored.diagram.view, view);
  assert.equal(model.apply({type: 'setView', view: {zoom: config.editor.fitMinZoom / 2}}).ok, false);
});
