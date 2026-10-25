'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const D = require('../public/simulatte/system-diagram/diagram.js');
const Editor = require('../public/simulatte/system-diagram/editor-model.js');
const Palette = require('../public/simulatte/system-diagram/palette.js');
const Inspector = require('../public/simulatte/system-diagram/inspector.js');
const config = require('../public/data/system-diagram/config.json');
const library = require('../public/simulatte/system-diagram/class-library.js').loadSync(path.resolve(__dirname, '../public/data/system-diagram'));
const legacy = () => structuredClone(require('../public/data/system-diagram/examples/web-service.json'));
const editor = () => Editor.create({ diagram: legacy(), library, config });

test('legacy diagrams retain their exact schema for accepted replay identities', () => {
  const original = legacy();
  assert.equal(original.schema, D.LEGACY_SCHEMA);
  assert.deepEqual(D.validate(original, library, config), original);
  assert.equal(D.emptyDiagram(config).schema, D.SCHEMA);
  const invalid = legacy(); invalid.edges[0].label = 'Unversioned annotation';
  assert.throws(() => D.validate(invalid, library, config), /declared field/);
});

test('edge labels are validated authoring metadata and do not change execution', () => {
  const m = editor(), id = m.diagram.edges[0].id;
  const before = m.executionIdentity(), compiled = D.compile(m.diagram, library, config);
  const result = m.apply({ type: 'setEdgeLabel', id, label: 'Send task events' });
  assert.equal(result.ok, true); assert.equal(result.kind, 'label');
  assert.equal(m.diagram.schema, D.SCHEMA);
  assert.equal(m.diagram.edges[0].label, 'Send task events');
  assert.equal(m.executionIdentity(), before);
  assert.deepEqual(D.compile(m.diagram, library, config), compiled);
  const reimported = D.validate(JSON.parse(JSON.stringify(m.diagram)), library, config);
  assert.equal(reimported.edges[0].label, 'Send task events');
  assert.equal(m.undo().ok, true); assert.equal(m.diagram.schema, D.LEGACY_SCHEMA);
  assert.equal(m.diagram.edges[0].label, undefined);
  assert.equal(m.redo().ok, true); assert.equal(m.diagram.edges[0].label, 'Send task events');
  assert.equal(m.apply({ type: 'setEdgeLabel', id, label: '' }).ok, true);
  assert.equal(m.diagram.edges[0].label, undefined); assert.equal(m.executionIdentity(), before);
});

test('invalid annotations are rejected without changing the diagram or history', () => {
  const m = editor(), before = m.diagram, id = before.edges[0].id;
  for (const label of [undefined, false, 12, {}, [], 'x'.repeat(config.bounds.maxLabelLength + 1)]) {
    const result = m.apply({ type: 'setEdgeLabel', id, label });
    assert.equal(result.ok, false); assert.equal(m.diagram, before); assert.equal(m.canUndo(), false);
  }
  assert.equal(m.apply({ type: 'setEdgeLabel', id: 'missing', label: 'No edge' }).ok, false);
});

test('connect, reconnect and duplicate preserve authored connection labels', () => {
  const m = editor();
  const edge = m.diagram.edges[0];
  assert.equal(m.apply({ type: 'reconnect', id: edge.id, label: 'Task delivery' }).ok, true);
  assert.equal(m.diagram.edges[0].label, 'Task delivery');
  const duplicate = m.apply({ type: 'duplicate', ids: [edge.from.nodeId, edge.to.nodeId] });
  assert.equal(duplicate.ok, true);
  const copied = m.diagram.edges.find(e => e.id !== edge.id && e.label === 'Task delivery');
  assert.ok(copied); assert.notEqual(copied.from.nodeId, edge.from.nodeId); assert.notEqual(copied.to.nodeId, edge.to.nodeId);
  const fresh = Editor.create({ diagram: D.emptyDiagram(config), library, config });
  fresh.apply({ type: 'addNode', id: 'source', classId: 'web-client', x: 0, y: 0 });
  fresh.apply({ type: 'addNode', id: 'service', classId: 'web-server', x: 240, y: 0 });
  const connected = fresh.apply({ type: 'connect', from: { nodeId: 'source', portId: 'out' }, to: { nodeId: 'service', portId: 'in' }, label: 'HTTP requests' });
  assert.equal(connected.ok, true); assert.equal(fresh.diagram.edges[0].label, 'HTTP requests');
});

test('search matches purpose, category and identity with case-insensitive multi-term queries', () => {
  const klass = D.resolveClass('task-queue', legacy(), library, config);
  assert.equal(Palette.matchesClass(klass, 'LEASES redelivery', 'Queues and messaging'), true);
  assert.equal(Palette.matchesClass(klass, 'messaging task', 'Queues and messaging'), true);
  assert.equal(Palette.matchesClass(klass, '  TASK-QUEUE  ', 'Queues and messaging'), true);
  assert.equal(Palette.matchesClass(klass, 'lease database', 'Queues and messaging'), false);
  assert.equal(Palette.matchesClass(klass, ''), true);
});

test('progressive disclosure retains every setting and override without changing its value', () => {
  for (const kernel of Object.values(library.kernels)) {
    const values = Object.fromEntries(Object.entries(kernel.params).map(([key, spec]) => [key, spec.default]));
    const sources = Object.fromEntries(Object.keys(kernel.params).map(key => [key, 'instance']));
    const grouped = Inspector.paramRows(kernel.params, values, sources, { maxBasic: 6 });
    assert.ok(grouped.basic.length <= 6, kernel.id);
    const rows = [...grouped.basic, ...grouped.advanced];
    assert.equal(new Set(rows.map(r => r.key)).size, Object.keys(kernel.params).length, kernel.id);
    assert.deepEqual(Object.fromEntries(rows.map(r => [r.key, r.value])), values);
    assert.ok(rows.every(r => r.overridden));
  }
  const eventSource = Inspector.paramRows(library.kernels.eventSource.params, {}, {}, { maxBasic: 6 });
  assert.equal(eventSource.basic.length, 6);
  assert.ok(eventSource.advanced.some(r => r.key === 'deadlineMs'));
});

// A minimal SVG element adapter checks renderer output contracts, not browser pixels or layout.
function svgDocument() {
  const doc = { createElementNS: (_ns, tag) => new SvgNode(tag, doc) };
  return doc;
}
class SvgNode {
  constructor(tag, doc) {
    this.tagName = tag; this.ownerDocument = doc; this.attributes = {}; this.dataset = {}; this.children = []; this.textContent = '';
    this.classes = new Set();
    this.classList = { toggle: (key, on) => on ? this.classes.add(key) : this.classes.delete(key) };
  }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  getAttribute(key) { return this.attributes[key]; }
  append(...items) { for (const item of items) { item.parent = this; this.children.push(item); } }
  replaceChildren(...items) { this.children = []; this.append(...items); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(n => n !== this); }
  get firstChild() { return this.children[0]; }
  getComputedTextLength() { return this.textContent.length * 6; }
}

test('SVG renderer updates edge annotations, accessible full text and midpoint when nodes move', () => {
  const Render = require('../public/simulatte/system-diagram/editor-canvas-render.js');
  const m = editor(), id = m.diagram.edges[0].id, doc = svgDocument();
  const layers = Object.fromEntries(['nodes', 'edges', 'groups', 'notes'].map(key => [key, doc.createElementNS('', 'g')]));
  const render = Render.create({ doc, model: m, library, config, layers, arrowId: 'arrow', arrowSelectedId: 'selected' });
  render.render();
  const edge = render.items.edges.get(id); assert.equal(edge.label.textContent, '');
  const text = '<script>annotation is text, not executable HTML</script>';
  assert.equal(m.apply({ type: 'setEdgeLabel', id, label: text }).ok, true); render.render();
  assert.ok(edge.label.textContent.endsWith('…')); assert.ok(edge.title.textContent.includes(text));
  assert.ok(edge.el.getAttribute('aria-label').includes(text)); assert.equal(edge.label.children.length, 0);
  const x = Number(edge.label.getAttribute('x'));
  const to = m.diagram.edges[0].to.nodeId;
  m.apply({ type: 'moveItems', ids: [to], dx: 80, dy: 16 }); render.render();
  assert.equal(Number(edge.label.getAttribute('x')), x + 40);
  m.apply({ type: 'setEdgeLabel', id, label: 'Task events' }); render.render();
  assert.equal(edge.label.textContent, 'Task events');
  m.apply({ type: 'setEdgeLabel', id, label: null }); render.render(); assert.equal(edge.label.textContent, '');
  m.apply({ type: 'deleteItems', ids: [id] }); render.render(); assert.equal(render.items.edges.has(id), false);
});

function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function guardedRead(guard, read, accept) {
  const token = guard.begin();
  return read.then(value => guard.commit(token, () => accept(value)));
}

test('latest document read wins regardless of whether starter A or B resolves first', async () => {
  for (const first of ['A', 'B']) {
    const m = editor(), guard = Editor.createLoadGuard(m), a = deferred(), b = deferred(), accepted = [];
    const accept = name => { const next = legacy(); next.name = name; assert.equal(m.replace(next).ok, true); accepted.push(name); };
    const readA = guardedRead(guard, a.promise, accept), readB = guardedRead(guard, b.promise, accept);
    (first === 'A' ? a : b).resolve(first); await Promise.resolve();
    (first === 'A' ? b : a).resolve(first === 'A' ? 'B' : 'A');
    assert.equal(await readA, 'superseded'); assert.equal(await readB, 'applied');
    assert.equal(m.diagram.name, 'B'); assert.deepEqual(accepted, ['B']); guard.dispose();
  }
});

test('pending file read cannot overwrite newer canvas edits, labels or undo history', async () => {
  for (const command of [
    { type: 'moveItems', ids: ['clients'], dx: 8, dy: 0 },
    { type: 'setNodeLabel', id: 'clients', label: 'My sources' },
    { type: 'addNode', classId: 'worker', x: 240, y: 300 },
  ]) {
    const m = editor(), guard = Editor.createLoadGuard(m), file = deferred();
    let accepted = false;
    const read = guardedRead(guard, file.promise, () => { accepted = true; m.replace(D.emptyDiagram(config)); });
    assert.equal(m.apply(command).ok, true); const newer = m.diagram;
    file.resolve('{}'); assert.equal(await read, 'edited'); assert.equal(accepted, false);
    assert.equal(m.diagram, newer); assert.equal(m.canUndo(), true); guard.dispose();
  }
});

test('selection and viewport changes do not cancel reads, but a later import supersedes a starter', async () => {
  const m = editor(), guard = Editor.createLoadGuard(m), preset = deferred(), file = deferred();
  const starter = guardedRead(guard, preset.promise, () => { throw Error('Stale starter must never apply'); });
  const imported = guardedRead(guard, file.promise, () => { const next = legacy(); next.name = 'Imported'; m.replace(next); });
  m.select({ nodes: ['clients'] }); m.apply({ type: 'setView', view: { x: 20, y: 30, zoom: 0.8 } });
  file.resolve('{}'); assert.equal(await imported, 'applied');
  preset.resolve(legacy()); assert.equal(await starter, 'superseded'); assert.equal(m.diagram.name, 'Imported');
  const token = guard.begin(); guard.dispose(); assert.equal(guard.commit(token, () => { throw Error('Disposed read'); }), 'superseded'); assert.throws(() => guard.begin(), /disposed/);
});
