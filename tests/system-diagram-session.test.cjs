const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const documents = require('../public/simulatte/system-diagram/diagram.js');
const models = require('../public/simulatte/system-diagram/editor-model.js');
const library = require('../public/simulatte/system-diagram/class-library.js').loadSync(path.resolve(__dirname, '../public/data/system-diagram'));
const config = require('../public/data/system-diagram/config.json');
function diagram() {
  const doc = documents.emptyDiagram(config, 'Editor contract');
  doc.nodes = [
    { id: 'client', classId: 'web-client', label: 'Client', x: 10, y: 20, params: {} },
    { id: 'api', classId: 'web-server', label: 'API', x: 260, y: 20, params: { concurrency: 4 } },
    { id: 'db', classId: 'database', label: 'Database', x: 500, y: 20, params: {} }
  ];
  doc.edges = [
    { id: 'client-api', from: { nodeId: 'client', portId: 'out' }, to: { nodeId: 'api', portId: 'in' }, params: {} },
    { id: 'api-db', from: { nodeId: 'api', portId: 'calls' }, to: { nodeId: 'db', portId: 'in' }, params: {} }
  ];
  return doc;
}
function model(doc = diagram(), overrides = {}) { return models.create({ diagram: doc, library, config: { ...config, ...overrides } }); }
function apply(m, cmd) { const result = m.apply(cmd); assert.equal(result.ok, true, result.error); return result; }

test('rejected commands and replacements leave document, selection and history atomic', () => {
  const m = model(); apply(m, { type: 'setNodeLabel', id: 'api', label: 'Renamed API' }); m.undo();
  const before = m.diagram, selection = m.selection;
  for (const command of [
    { type: 'setNodeParams', id: 'api', params: { concurrency: -1 } },
    { type: 'connect', from: { nodeId: 'client', portId: 'out' }, to: { nodeId: 'api', portId: 'in' } },
    { type: 'reconnect', id: 'api-db', to: { nodeId: 'missing', portId: 'in' } },
    { type: 'setPositions', positions: { api: { x: Infinity } } },
    { type: 'unsupported-command' }
  ]) { assert.equal(m.apply(command).ok, false); assert.deepEqual(m.diagram, before); assert.deepEqual(m.selection, selection); assert.equal(m.canRedo(), true); }
  assert.equal(m.replace({ ...before, undeclared: true }).ok, false); assert.deepEqual(m.diagram, before); assert.equal(m.canRedo(), true);
  assert.equal(m.redo().ok, true); assert.equal(m.diagram.nodes[1].label, 'Renamed API');
  const external = m.diagram; external.nodes[0].x = -100; assert.notEqual(m.diagram.nodes[0].x, -100, 'getter does not leak mutable document ownership');
});

test('class derivation preserves effective parameters and class edits respect instance overrides', () => {
  const m = model(); const before = documents.resolveNodeParams(m.diagram.nodes[1], m.diagram, library, config).values;
  const derived = apply(m, { type: 'deriveClass', nodeId: 'api', label: 'Reusable API' });
  assert.match(derived.id, /^user\./); assert.deepEqual(m.diagram.nodes[1].params, {});
  assert.deepEqual(documents.resolveNodeParams(m.diagram.nodes[1], m.diagram, library, config).values, before);
  apply(m, { type: 'updateUserClass', id: derived.id, patch: { defaults: { concurrency: 6 } } });
  assert.equal(documents.resolveNodeParams(m.diagram.nodes[1], m.diagram, library, config).values.concurrency, 6);
  apply(m, { type: 'setNodeParams', id: 'api', params: { concurrency: 3 } });
  apply(m, { type: 'updateUserClass', id: derived.id, patch: { defaults: { concurrency: 8 } } });
  assert.equal(documents.resolveNodeParams(m.diagram.nodes[1], m.diagram, library, config).values.concurrency, 3);
  apply(m, { type: 'setNodeParams', id: 'api', params: { concurrency: null } });
  assert.equal(documents.resolveNodeParams(m.diagram.nodes[1], m.diagram, library, config).values.concurrency, 8);
  assert.equal(m.apply({ type: 'deleteUserClass', id: derived.id }).ok, false);
  apply(m, { type: 'setNodeClass', id: 'api', classId: 'task-queue' });
  assert.deepEqual(m.diagram.edges.map(e => e.id), ['client-api'], 'changing kernel removes edges on obsolete ports');
  apply(m, { type: 'deleteUserClass', id: derived.id });
  assert.equal(m.diagram.classes.length, 0);
});

test('resource groups compile shared slots separately from failure domains and retain legacy group shape', () => {
  const m = model(); const { id } = apply(m, { type: 'addGroup', kind: 'resource', label: 'Shared workers', nodeIds: ['api', 'db'], capacity: 3 });
  const compiled = documents.compile(m.diagram, library, config), group = compiled.groups.find(g => g.id === id);
  assert.equal(group.kind, 'resource'); assert.equal(group.capacity, 3); assert.deepEqual(group.nodeIds, ['api', 'db']);
  const before = m.diagram;
  assert.equal(m.apply({ type: 'addFault', fault: { atSec: 1, untilSec: 2, target: { kind: 'group', id }, type: 'outage', params: {} } }).ok, false);
  assert.deepEqual(m.diagram, before, 'resource contention does not imply correlated outage semantics');
  for (const capacity of [0, 65, 1.5, undefined]) {
    const broken = structuredClone(before); if (capacity === undefined) delete broken.groups[0].capacity; else broken.groups[0].capacity = capacity;
    assert.throws(() => documents.validate(broken, library, config), /capacity/);
  }
  apply(m, { type: 'updateGroup', id, patch: { kind: 'zone' } });
  assert.equal(Object.hasOwn(m.diagram.groups[0], 'capacity'), false);
  assert.equal(Object.hasOwn(documents.compile(m.diagram, library, config).groups[0], 'capacity'), false);
  apply(m, { type: 'addFault', fault: { atSec: 1, untilSec: 2, target: { kind: 'group', id }, type: 'outage', params: {} } });
  apply(m, { type: 'updateGroup', id, patch: { kind: 'resource', capacity: 2 } });
  assert.equal(m.diagram.faults.length, 0, 'converting a failure domain removes its now-inapplicable scheduled outages');
  const zone = structuredClone(m.diagram); zone.groups[0].kind = 'zone';
  assert.throws(() => documents.validate(zone, library, config), /declared field/);
});

test('duplicate keeps classes reusable, copies internal edges, and group movement moves each member once', () => {
  const m = model(); const { id: groupId } = apply(m, { type: 'addGroup', kind: 'resource', nodeIds: ['api', 'db'], capacity: 2 });
  const start = m.diagram; m.select({ groups: [groupId], nodes: ['api'] });
  apply(m, { type: 'moveItems', ids: [groupId, 'api'], dx: 30, dy: -10 });
  assert.equal(m.diagram.nodes.find(n => n.id === 'api').x, start.nodes.find(n => n.id === 'api').x + 30);
  assert.equal(m.diagram.nodes.find(n => n.id === 'db').x, start.nodes.find(n => n.id === 'db').x + 30);
  assert.equal(m.diagram.groups[0].x, start.groups[0].x + 30);
  const duplicated = apply(m, { type: 'duplicate', ids: [groupId], dx: 80, dy: 50 });
  assert.equal(m.diagram.nodes.length, 5); assert.equal(m.diagram.edges.length, 3); assert.equal(m.diagram.groups.length, 2);
  const copiedNodes = m.diagram.nodes.filter(n => duplicated.created.includes(n.id));
  assert.equal(copiedNodes.length, 2); assert.equal(m.diagram.edges.filter(e => duplicated.created.includes(e.id)).length, 1);
  const copy = copiedNodes[0]; assert.equal(copy.classId, 'web-server'); assert.notEqual(copy.groupId, groupId);
  assert.equal(new Set([...m.diagram.nodes, ...m.diagram.edges, ...m.diagram.groups].map(n => n.id)).size, 10);
  apply(m, { type: 'deleteItems', ids: [copy.groupId] });
  assert.equal(m.diagram.nodes.length, 5, 'removing a group ungroups nodes, rather than silently deleting them');
  assert.ok(m.diagram.nodes.filter(n => copiedNodes.some(copy => copy.id === n.id)).every(n => !n.groupId));
});

test('node deletion removes incident edges and faults and undo restores causal configuration', () => {
  const m = model(); apply(m, { type: 'addFault', fault: { atSec: 2, untilSec: 3, target: { kind: 'node', id: 'api' }, type: 'crash', params: {} } });
  const original = m.diagram; m.select({ nodes: ['api'] }); apply(m, { type: 'deleteItems', ids: ['api'] });
  assert.equal(m.diagram.nodes.length, 2); assert.equal(m.diagram.edges.length, 0); assert.equal(m.diagram.faults.length, 0);
  m.undo(); assert.deepEqual(m.diagram, original); assert.deepEqual(m.selection.nodes, [], 'undo preserves the current pruned selection');
  m.redo(); assert.equal(m.diagram.nodes.length, 2);
});

test('semantic identity excludes labels/layout/notes/view while retaining executable changes', () => {
  const m = model(), semantic = m.executionIdentity();
  apply(m, { type: 'setPositions', positions: { api: { x: 310, y: 240 } } });
  apply(m, { type: 'setNodeLabel', id: 'api', label: 'Readable label' });
  apply(m, { type: 'addNote', text: 'Local design annotation', x: 0, y: 0 });
  apply(m, { type: 'setMeta', patch: { name: 'Different title', description: 'A description' } });
  apply(m, { type: 'setView', view: { x: 20, y: 10, zoom: 1.5 } });
  assert.equal(m.executionIdentity(), semantic);
  const beforeParams = m.executionIdentity(); apply(m, { type: 'setEdgeParams', id: 'api-db', params: { latencyMs: 400 } }); assert.notEqual(m.executionIdentity(), beforeParams);
  m.undo(); assert.equal(m.executionIdentity(), semantic); assert.deepEqual(m.diagram.view, { x: 20, y: 10, zoom: 1.5 }, 'undo leaves camera navigation independent');
  apply(m, { type: 'setMeta', patch: { seed: 17 } }); assert.notEqual(m.executionIdentity(), semantic);
});

test('view and selection are outside bounded history and rejected edits do not notify subscribers', () => {
  const m = model(diagram(), { editor: { ...config.editor, historyLimit: 2 } }), events = [], off = m.subscribe(event => events.push(event.kind));
  m.select({ nodes: ['api', 'missing'] }); m.select({ nodes: ['db'] }, { additive: true }); assert.deepEqual(m.selection.nodes, ['api', 'db']); assert.equal(m.canUndo(), false);
  apply(m, { type: 'setView', view: { x: 1, y: 1, zoom: 1 } }); assert.equal(m.canUndo(), false);
  apply(m, { type: 'setNodeLabel', id: 'api', label: 'One' }); apply(m, { type: 'setNodeLabel', id: 'api', label: 'Two' }); apply(m, { type: 'setNodeLabel', id: 'api', label: 'Three' });
  assert.equal(m.undo().ok, true); assert.equal(m.undo().ok, true); assert.equal(m.undo().ok, false); assert.equal(m.diagram.nodes[1].label, 'One');
  const n = events.length; assert.equal(m.apply({ type: 'setNodeParams', id: 'api', params: { bogus: true } }).ok, false); assert.equal(events.length, n);
  off(); apply(m, { type: 'setNodeLabel', id: 'api', label: 'No notification' }); assert.equal(events.length, n);
});


test('reconnection preserves edge identity and patches parameters atomically with null reset', () => {
  const m = model(), original = m.diagram;
  const changed = apply(m, { type: 'reconnect', id: 'client-api', to: { nodeId: 'db', portId: 'in' }, params: { latencyMs: 80, bandwidthMbps: 25 } });
  assert.equal(changed.id, 'client-api'); assert.equal(m.diagram.edges.length, original.edges.length);
  assert.equal(m.diagram.edges[0].to.nodeId, 'db'); assert.deepEqual(m.diagram.edges[0].params, { latencyMs: 80, bandwidthMbps: 25 });
  const before = m.diagram; const selected = m.selection;
  assert.equal(m.apply({ type: 'reconnect', id: 'client-api', to: { nodeId: 'db', portId: 'in' }, params: { bandwidthMbps: -1 } }).ok, false);
  assert.equal(m.diagram, before); assert.equal(m.selection, selected);
  apply(m, { type: 'reconnect', id: 'client-api', params: { latencyMs: null } });
  assert.deepEqual(m.diagram.edges[0].params, { bandwidthMbps: 25 });
  m.undo(); assert.deepEqual(m.diagram.edges[0].params, { latencyMs: 80, bandwidthMbps: 25 });
  m.undo(); assert.deepEqual(m.diagram, original);
});

test('frozen accepted snapshot stays detached from pending edits and replace clears history by contract', () => {
  const m = model(), accepted = structuredClone(m.diagram), identity = m.executionIdentity();
  apply(m, { type: 'setNodeParams', id: 'api', params: { serviceMs: 40 } });
  assert.notEqual(m.executionIdentity(), identity);
  assert.deepEqual(accepted.nodes.find(n => n.id === 'api').params, { concurrency: 4 });
  assert.ok(Object.isFrozen(m.diagram)); assert.ok(Object.isFrozen(m.diagram.nodes[0].params));
  assert.equal(m.replace(accepted).ok, true); assert.equal(m.executionIdentity(), identity); assert.equal(m.canUndo(), false); assert.equal(m.canRedo(), false);
});
