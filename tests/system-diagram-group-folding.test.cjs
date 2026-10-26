'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const D = require('../public/simulatte/system-diagram/diagram.js');
const Editor = require('../public/simulatte/system-diagram/editor-model.js');
const Render = require('../public/simulatte/system-diagram/editor-canvas-render.js');
const Canvas = require('../public/simulatte/system-diagram/editor-canvas.js');
const config = require('../public/data/system-diagram/config.json');
const library = require('../public/simulatte/system-diagram/class-library.js').loadSync(path.resolve(__dirname, '../public/data/system-diagram'));
function diagram(schema = D.SCHEMA) {
  const node = (id, classId, x, y, groupId) => ({ id, classId, label: id, x, y, params: {}, ...(groupId ? { groupId } : {}) });
  const edge = (id, from, fromPort, to) => ({ id, from: { nodeId: from, portId: fromPort }, to: { nodeId: to, portId: 'in' }, params: {} });
  return { ...D.emptyDiagram(config), schema, run: { horizonSec: 4 }, nodes: [
    { ...node('source', 'web-client', 0, 40), params: { pattern: 'constant', ratePerSec: 2, maxRequests: 4, stopSec: 2 } },
    node('api', 'web-server', 260, 40, 'cluster'), node('worker', 'worker', 500, 40, 'cluster'),
    node('store', 'database', 840, 40, 'storage'), node('overlap', 'worker', 260, 160)
  ], groups: [
    { id: 'cluster', label: 'Compute cluster', kind: 'boundary', x: 230, y: 0, w: 500, h: 260 },
    { id: 'storage', label: 'Storage zone', kind: 'zone', x: 810, y: 0, w: 240, h: 200 }
  ], edges: [edge('incoming', 'source', 'out', 'api'), edge('internal', 'api', 'calls', 'worker'), edge('outgoing', 'worker', 'calls', 'store') ] };
}
const model = input => Editor.create({ diagram: input || diagram(), library, config });
function apply(m, command) { const result = m.apply(command); assert.equal(result.ok, true, result.error); return result; }
function fold(m, id = 'cluster', collapsed = true) { return apply(m, { type: 'setGroupCollapsed', id, collapsed }); }

test('fold state is versioned, round-trippable, undoable presentation with unchanged compiled identity', () => {
  for (const schema of [D.LEGACY_SCHEMA, D.ANNOTATED_SCHEMA, D.SCHEMA]) {
    const original = diagram(schema); if (schema === D.ANNOTATED_SCHEMA) original.edges[0].label = 'Send request';
    assert.deepEqual(D.validate(original, library, config), original);
    const m = model(original), compiled = D.compile(m.diagram, library, config), identity = m.executionIdentity();
    m.select({ nodes: ['worker'], edges: ['internal', 'incoming'] });
    assert.equal(fold(m).kind, 'layout'); assert.equal(m.diagram.schema, D.SCHEMA);
    assert.equal(m.diagram.groups[0].collapsed, true); assert.equal(m.executionIdentity(), identity);
    assert.deepEqual(D.compile(m.diagram, library, config), compiled);
    assert.deepEqual(m.selection, { nodes: [], edges: ['incoming'], groups: ['cluster'], notes: [] });
    const imported = model(JSON.parse(JSON.stringify(m.diagram)));
    assert.equal(imported.diagram.groups[0].collapsed, true);
    assert.equal(imported.executionIdentity(), identity);
    apply(m, { type: 'setView', view: { x: 40, y: 80, zoom: 1.5 } });
    assert.equal(m.undo().kind, 'layout'); assert.equal(m.diagram.groups[0].collapsed, undefined);
    assert.equal(m.diagram.schema, schema); assert.equal(m.diagram.view.zoom, 1.5);
    assert.equal(m.redo().kind, 'layout'); assert.equal(m.diagram.groups[0].collapsed, true);
    assert.equal(fold(m).unchanged, true); assert.deepEqual(m.selection.groups, ['cluster']);
    fold(m, 'cluster', false); m.select(['api']); apply(m, { type: 'setNodeParams', id: 'api', params: { concurrency: 3 } });
    assert.equal(m.diagram.nodes.find(n => n.id === 'api').params.concurrency, 3);
    assert.notEqual(m.executionIdentity(), identity, 'real component settings still change execution after expansion');
  }
});

test('invalid fold state, legacy unversioned fields and fabricated nested ownership reject atomically', () => {
  const m = model(); const before = m.diagram;
  for (const collapsed of [undefined, null, 1, 'true', {}, []]) {
    assert.equal(m.apply({ type: 'setGroupCollapsed', id: 'cluster', collapsed }).ok, false);
    assert.equal(m.diagram, before); assert.equal(m.canUndo(), false);
  }
  assert.equal(m.apply({ type: 'setGroupCollapsed', id: 'missing', collapsed: true }).ok, false);
  for (const schema of [D.LEGACY_SCHEMA, D.ANNOTATED_SCHEMA]) {
    const invalid = diagram(schema); invalid.groups[0].collapsed = true;
    assert.throws(() => D.validate(invalid, library, config), /declared field/);
  }
  const nested = diagram(); nested.groups[1].groupId = 'cluster';
  assert.throws(() => D.validate(nested, library, config), /declared field/);
});

test('fold projection contains only actual members, hides internal links and proxies original crossing endpoints', () => {
  const m = model(); fold(m); fold(m, 'storage');
  const view = Render.groupPresentation(m.diagram);
  assert.deepEqual(view.nodes.map(n => n.id), ['source', 'overlap'], 'geometric overlap does not invent membership');
  assert.deepEqual(view.edges.map(e => e.id), ['incoming', 'outgoing']);
  assert.deepEqual([...view.proxies.keys()].sort(), ['api.in', 'store.in', 'worker.calls']);
  assert.equal(view.proxies.get('api.in').nodeId, 'api'); assert.equal(view.proxies.get('api.in').portId, 'in');
  assert.equal(view.proxies.get('api.in').x, view.groups.get('cluster').box.x);
  assert.equal(view.proxies.get('worker.calls').x, view.groups.get('cluster').box.x + view.groups.get('cluster').box.w);
  assert.equal(view.proxies.get('store.in').groupId, 'storage');
  assert.equal(view.groups.get('cluster').members.length, 2);
  assert.equal(view.groups.get('cluster').box.w < m.diagram.groups[0].w, true);
  assert.equal(m.diagram.nodes.length, 5); assert.equal(m.diagram.edges.length, 3);
  const compiled = D.compile(m.diagram, library, config);
  apply(m, { type: 'moveItems', ids: ['cluster', 'api'], dx: 80, dy: 24 });
  assert.equal(m.diagram.nodes.find(n => n.id === 'api').x, 340);
  assert.equal(m.diagram.nodes.find(n => n.id === 'worker').x, 580);
  assert.deepEqual(D.compile(m.diagram, library, config), compiled);
  const moved = Render.groupPresentation(m.diagram);
  assert.equal(moved.proxies.get('api.in').x, view.proxies.get('api.in').x + 80);
  assert.equal(moved.proxies.get('worker.calls').y, view.proxies.get('worker.calls').y + 24);
  fold(m, 'cluster', false);
  assert.equal(Render.groupPresentation(m.diagram).edgeIds.has('internal'), true);
});

test('folded group duplication and deletion retain real members, port IDs and authored geometry', () => {
  const m = model(); fold(m); const before = m.diagram;
  const copy = apply(m, { type: 'duplicate', ids: ['cluster'], dx: 40, dy: 80 });
  const groupId = copy.created.find(id => m.itemType(id) === 'groups');
  assert.equal(m.diagram.groups.find(g => g.id === groupId).collapsed, true);
  const nodes = m.diagram.nodes.filter(n => n.groupId === groupId);
  assert.equal(nodes.length, 2);
  assert.equal(nodes[0].x, before.nodes[1].x + 40); assert.equal(nodes[1].y, before.nodes[2].y + 80);
  const edge = m.diagram.edges.find(e => nodes.some(n => n.id === e.from.nodeId));
  assert.equal(edge.from.portId, 'calls'); assert.equal(edge.to.portId, 'in');
  apply(m, { type: 'deleteItems', ids: [groupId] });
  assert.equal(m.diagram.nodes.length, 7); assert.equal(Render.groupPresentation(m.diagram).nodes.length, 5);
  assert.ok(nodes.every(n => !m.diagram.nodes.find(row => row.id === n.id).groupId));
});

// This adapter tests SVG structure and event routing, not browser layout, pointer geometry or pixels.
class Element {
  constructor(tag, doc) {
    this.tagName = tag; this.ownerDocument = doc; this.attributes = {}; this.dataset = {}; this.children = [];
    this.parentElement = null; this.listeners = new Map(); this.textContent = ''; this.style = { setProperty() {} };
    this.classes = new Set(); this.classList = { add: (...keys) => keys.forEach(k => this.classes.add(k)), remove: (...keys) => keys.forEach(k => this.classes.delete(k)), toggle: (k, on) => on ? this.classes.add(k) : this.classes.delete(k), contains: k => this.classes.has(k) };
  }
  set className(value) { this.setAttribute('class', value); }
  setAttribute(key, value) {
    this.attributes[key] = String(value);
    if (key === 'class') this.classes = new Set(String(value).split(/\s+/));
    if (key.startsWith('data-')) this.dataset[key.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = String(value);
  }
  getAttribute(key) { return this.attributes[key]; }
  removeAttribute(key) { delete this.attributes[key]; if (key.startsWith('data-')) delete this.dataset[key.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())]; }
  append(...children) { for (const child of children) { child.remove(); child.parentElement = this; this.children.push(child); } }
  prepend(child) { child.remove(); child.parentElement = this; this.children.unshift(child); }
  after(child) { child.remove(); child.parentElement = this.parentElement; this.parentElement.children.splice(this.parentElement.children.indexOf(this) + 1, 0, child); }
  replaceChildren(...children) { for (const child of [...this.children]) child.remove(); this.append(...children); }
  remove() {
    if (!this.parentElement) return;
    if (this.contains(this.ownerDocument.activeElement)) this.ownerDocument.activeElement = this.ownerDocument.body;
    this.parentElement.children = this.parentElement.children.filter(child => child !== this); this.parentElement = null;
  }
  get firstChild() { return this.children[0]; }
  get isConnected() { return this.ownerDocument.body.contains(this); }
  contains(node) { for (let at = node; at; at = at.parentElement) if (at === this) return true; return false; }
  matches(selector) { return selector.split(',').some(s => s.trim().startsWith('.') ? this.classes.has(s.trim().slice(1)) : this.tagName === s.trim()); }
  closest(selector) { for (let at = this; at; at = at.parentElement) if (at.matches(selector)) return at; return null; }
  querySelector(selector) { for (const child of this.children) { if (child.matches(selector)) return child; const found = child.querySelector(selector); if (found) return found; } return null; }
  getComputedTextLength() { return this.textContent.length * 6; }
  getTotalLength() { return 100; }
  getPointAtLength(distance) { return { x: distance, y: 0 }; }
  getBoundingClientRect() { return { x: 0, y: 0, left: 0, top: 0, width: 1200, height: 800 }; }
  addEventListener(type, listener, options = {}) {
    const list = this.listeners.get(type) || []; list.push({ listener, signal: options.signal }); this.listeners.set(type, list);
  }
  dispatch(event) { for (const row of this.listeners.get(event.type) || []) if (!row.signal?.aborted) row.listener(event); }
  focus() { this.ownerDocument.activeElement = this; }
  select() {}
  setPointerCapture() {}
}
function dom() {
  const frames = new Map(); let next = 0;
  const doc = { createElementNS: (_ns, tag) => new Element(tag, doc), createElement: tag => new Element(tag, doc), elementFromPoint: () => doc.hit || null };
  doc.body = new Element('body', doc); doc.activeElement = doc.body;
  doc.defaultView = { requestAnimationFrame: fn => { frames.set(++next, fn); return next; }, cancelAnimationFrame: id => frames.delete(id), setTimeout: () => ++next, clearTimeout() {}, matchMedia: () => ({ matches: false }) };
  doc.flush = () => { const pending = [...frames.values()]; frames.clear(); for (const fn of pending) fn(); };
  return doc;
}
function renderer(m) {
  const doc = dom(), layers = Object.fromEntries(['nodes', 'edges', 'groups', 'notes'].map(k => [k, doc.createElement('g')]));
  const r = Render.create({ doc, model: m, library, config, layers, arrowId: 'arrow', arrowSelectedId: 'selected' }); r.render(); return r;
}
function canvas(m = model()) {
  const doc = dom(), host = doc.createElement('div'); doc.body.append(host);
  const canvas = Canvas.create({ host, model: m, library, config });
  return { doc, host, canvas, model: m };
}
function event(type, target, values = {}) { return { type, target, key: '', pointerId: 1, pointerType: 'mouse', button: 0, clientX: 0, clientY: 0, timeStamp: 100, preventDefault() {}, stopPropagation() {}, ...values }; }
function tap(fixture, target, point, values = {}) {
  fixture.doc.hit = target;
  fixture.canvas.svg.dispatch(event('pointerdown', target, { clientX: point.x, clientY: point.y, ...values }));
  fixture.canvas.svg.dispatch(event('pointerup', target, { clientX: point.x, clientY: point.y, ...values }));
}

test('a browser-adjusted touch target cannot steal a visible node body for a nearby port', () => {
  const m=model();apply(m,{type:'setPositions',positions:{source:{x:260,y:0},api:{x:260,y:220}}});
  const f=canvas(m),p=f.canvas.portPosition('api','in');assert.equal(p.side,'top');
  f.canvas.setView({x:0,y:0,zoom:1});f.doc.flush();
  const body=f.canvas.nodeElement('api').querySelector('.sd-node-body'),port=f.canvas.nodeElement('api').querySelector('.sd-port-hit');
  f.doc.hit=body;const v=f.canvas.getView(),point={clientX:(p.x-v.x)*v.zoom,clientY:(p.y+14-v.y)*v.zoom,pointerType:'touch'};
  f.canvas.svg.dispatch(event('pointerdown',port,point));f.canvas.svg.dispatch(event('pointerup',port,point));
  assert.equal(JSON.parse(f.host.dataset.inputReceipt).hit.type,'node');assert.deepEqual(f.model.selection.nodes,['api']);
  assert.equal(f.host.classList.contains('is-connecting'),false);f.canvas.dispose();
});

test('SVG folding removes hidden draw and overlay targets, preserves crossing path IDs and restores editable nodes', () => {
  const m = model(), r = renderer(m), internal = r.items.edges.get('internal').path;
  const from = r.portPosition('api', 'in'); fold(m); r.render();
  assert.equal(r.items.nodes.has('api'), false); assert.equal(r.items.nodes.has('worker'), false);
  assert.equal(r.items.nodes.has('overlap'), true); assert.equal(r.items.edges.has('internal'), false);
  assert.equal(internal.parentElement.parentElement, null, 'internal edge leaves the SVG tree');
  assert.equal(r.nodeBox('api'), null); assert.equal(r.portPosition('api', 'calls'), null);
  assert.notDeepEqual(r.portPosition('api', 'in'), from);
  assert.match(r.items.edges.get('incoming').el.getAttribute('aria-label'), /source.out to api.in/);
  assert.equal(r.items.groups.get('cluster').toggle.getAttribute('aria-expanded'), 'false');
  assert.equal(r.items.groups.get('cluster').summary.textContent, '2 components inside');
  assert.equal(r.portElement('api', 'in').dataset.nodeId, 'api');
  assert.equal(r.portElement('api', 'in').dataset.port, 'in');
  const oldPath = r.items.edges.get('outgoing').path.getAttribute('d');
  apply(m, { type: 'moveItems', ids: ['cluster'], dx: 80, dy: 24 }); r.render();
  assert.notEqual(r.items.edges.get('outgoing').path.getAttribute('d'), oldPath);
  fold(m, 'cluster', false); r.render();
  assert.ok(r.items.nodes.has('api')); assert.ok(r.items.edges.has('internal'));
  assert.equal(r.items.groups.get('cluster').portEls.size, 0);
  assert.equal(r.nodeBox('api').x, 340); assert.equal(r.items.nodes.get('api').el.getAttribute('tabindex'), '0');
});

test('mouse, touch and keyboard fold buttons use the same undoable presentation command', () => {
  const f = canvas(); const group = () => f.canvas.layers.groups.children.find(g => g.dataset.id === 'cluster');
  for (const pointerType of ['mouse', 'touch']) {
    const toggle = group().querySelector('.sd-group-toggle');
    tap(f, toggle, { x: 710, y: 10 }, { pointerType });
    assert.equal(f.model.diagram.groups[0].collapsed, true);
    assert.equal(f.doc.activeElement, toggle); assert.equal(f.canvas.nodeElement('api'), null);
    f.host.dispatch(event('keydown', toggle, { key: 'Enter' }));
    assert.equal(f.model.diagram.groups[0].collapsed, false); assert.ok(f.canvas.nodeElement('api'));
  }
  const tab = group().querySelector('.sd-group-tab'); tab.focus();
  f.host.dispatch(event('keydown', tab, { key: 'e' })); assert.equal(f.model.diagram.groups[0].collapsed, true);
  f.host.dispatch(event('keydown', f.doc.activeElement, { key: 'z', ctrlKey: true }));
  assert.equal(f.model.diagram.groups[0].collapsed, false);
  f.canvas.dispose();
});

test('folded crossing ports can reconnect to real endpoints and never hit invisible member bodies', () => {
  const f = canvas(); fold(f.model);
  const proxy = f.canvas.layers.groups.children.find(g => g.dataset.id === 'cluster').querySelector('.sd-proxy-port');
  const p = f.canvas.portPosition('api', 'in');
  tap(f, proxy, p);
  const receipt = JSON.parse(f.host.dataset.inputReceipt);
  assert.equal(receipt.hit.type, 'port'); assert.equal(receipt.hit.id, 'api'); assert.equal(receipt.hit.portId, 'in');
  assert.equal(f.host.classList.contains('is-connecting'), true); f.canvas.cancelConnect();
  f.model.select(['incoming']);
  const handle = f.canvas.layers.interaction.children.find(el => el.dataset.reconnect === 'incoming' && el.dataset.side === 'to');
  assert.ok(handle); tap(f, handle, { x: p.x - 16, y: p.y });
  const target = f.canvas.nodeElement('overlap').querySelector('.sd-port');
  tap(f, target, f.canvas.portPosition('overlap', 'in'), { timeStamp: 500 });
  assert.equal(f.model.diagram.edges.find(e => e.id === 'incoming').to.nodeId, 'overlap');
  assert.equal(f.model.diagram.edges.find(e => e.id === 'incoming').from.nodeId, 'source');
  f.doc.hit = f.canvas.svg;
  tap(f, f.canvas.svg, { x: 600, y: 60 }, { timeStamp: 1000 });
  assert.equal(JSON.parse(f.host.dataset.inputReceipt).hit.type, 'empty', 'hidden worker body does not intercept input');
  f.canvas.dispose();
});

test('fit ignores concealed geometry and dragging a folded group moves all authored members together', () => {
  const f = canvas(); apply(f.model, { type: 'setPositions', positions: { worker: { x: 9000 } } });
  fold(f.model); const fit = f.canvas.fit(); assert.ok(fit.zoom > .8, 'hidden x=9000 is excluded from fit');
  f.canvas.setView({ x: 0, y: 0, zoom: 1 }); f.doc.flush();
  const tab = f.canvas.layers.groups.children.find(g => g.dataset.id === 'cluster').querySelector('.sd-group-tab');
  f.doc.hit = tab; f.canvas.svg.dispatch(event('pointerdown', tab, { clientX: 250, clientY: 10 }));
  f.canvas.svg.dispatch(event('pointermove', tab, { clientX: 330, clientY: 34 }));
  f.canvas.svg.dispatch(event('pointerup', tab, { clientX: 330, clientY: 34 }));
  assert.equal(f.model.diagram.nodes.find(n => n.id === 'worker').x, 9082);
  assert.equal(f.model.diagram.nodes.find(n => n.id === 'api').x, 342);
  assert.equal(f.model.diagram.groups[0].x, 312);
  assert.deepEqual(f.model.selection.groups, ['cluster']);
  f.canvas.dispose();
});

test('folding and layout preserve deterministic simulation metrics and replay', async () => {
  const runners = require('../public/simulatte/system-diagram/runner.js');
  const kernels = require('../public/simulatte/system-diagram/kernels-all.js');
  const m = model(); const original = m.diagram;
  fold(m); fold(m, 'storage'); apply(m, { type: 'moveItems', ids: ['cluster'], dx: 80, dy: 24 });
  const outcomes = [];
  for (const input of [original, m.diagram]) {
    const runner = await runners.create({ diagram: input, library, config, kernels });
    try { runner.advanceTo(4); const proof = await runner.verify(); assert.equal(proof.status, 'match'); outcomes.push({ compiled: runner.compiled, metrics: runner.view().global, hash: proof.metricsHash }); }
    finally { await runner.dispose(); }
  }
  assert.deepEqual(outcomes[0], outcomes[1]);
});

test('folded live overlays aggregate real component state and clear hidden paths, expanded or pending status', () => {
  const previous = globalThis.SimulatteSystemDiagramOverlay;
  globalThis.SimulatteSystemDiagramOverlay = require('../public/simulatte/system-diagram/overlay.js');
  const f = canvas();
  const nodeView = (queue, health = 'ok') => ({ health, queue, queueCapacity: 10, busy: 0, throughput: 1, served: 1, utilization: .2, latency: { p95: 1 }, errors: 0, rejected: 0, faults: [] });
  const view = { t: .5, nodes: { source: nodeView(0), api: nodeView(2), worker: nodeView(3, 'down'), store: nodeView(0), overlap: nodeView(0) },
    edges: Object.fromEntries(['incoming', 'internal', 'outgoing'].map(id => [id, { rate: 2, inTransit: 1, errorRate: 0, faults: [] }])),
    transit: ['incoming', 'internal', 'outgoing'].map(edgeId => ({ edgeId, t0: 0, t1: 1, kind: 'req', ptype: 'http' })) };
  const marks = () => f.canvas.layers.overlay.querySelector('.sd-run-edges').children;
  const dots = () => f.canvas.layers.overlay.querySelector('.sd-run-transit').children.filter(dot => dot.getAttribute('display') !== 'none');
  try {
    f.canvas.setState(view); assert.equal(marks().length, 3); assert.equal(dots().length, 3);
    const hiddenNode = f.canvas.nodeElement('api'); fold(f.model);
    const group = f.canvas.groupElement('cluster'), slot = group.querySelector('.sd-group-status');
    assert.deepEqual(f.canvas.foldedGroups(), [{ id: 'cluster', members: ['api', 'worker'] }]);
    assert.equal(marks().length, 2); assert.equal(dots().length, 2);
    assert.equal(hiddenNode.isConnected, false); assert.equal(hiddenNode.getAttribute('data-health'), undefined);
    assert.equal(slot.querySelector('text').textContent, '5 queued jobs · 1 unhealthy');
    assert.equal(group.getAttribute('data-health'), 'degraded');
    assert.match(slot.querySelector('title').textContent, /not unique end-to-end requests/);
    const proxy = group.querySelector('.sd-proxy-port').querySelector('.sd-port-hit'); proxy.focus();
    f.canvas.setState(view); f.canvas.render();
    assert.equal(f.doc.activeElement, proxy, 'unchanged fold rendering and run ticks retain the active proxy');
    const recovered = structuredClone(view); recovered.nodes.worker.health = 'ok'; recovered.nodes.worker.queue = 0;
    f.canvas.setState(recovered); assert.equal(group.getAttribute('data-health'), 'ok'); assert.equal(slot.querySelector('text').textContent, '2 queued jobs · 0 unhealthy');
    const missing = structuredClone(recovered); delete missing.nodes.worker; f.canvas.setState(missing);
    assert.equal(group.getAttribute('data-health'), 'unknown'); assert.match(slot.querySelector('text').textContent, /1 unobserved/);
    f.canvas.setState(recovered, { pending: true }); assert.equal(slot.children.length, 0); assert.equal(group.getAttribute('data-health'), undefined);
    f.canvas.setState(recovered); assert.equal(slot.children.length, 2);
    fold(f.model, 'cluster', false); assert.equal(slot.children.length, 0); assert.equal(group.getAttribute('data-health'), undefined);
    assert.equal(marks().length, 3); assert.equal(dots().length, 3); assert.ok(f.canvas.nodeElement('api').querySelector('.sd-run-counters'));
    fold(f.model); f.canvas.setState(null); assert.equal(slot.children.length, 0); assert.equal(group.getAttribute('data-health'), undefined);
    assert.equal(f.canvas.layers.overlay.children.length, 0);
  } finally { f.canvas.dispose(); globalThis.SimulatteSystemDiagramOverlay = previous; }
});
