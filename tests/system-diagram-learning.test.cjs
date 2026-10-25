'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { getEventListeners } = require('node:events');
const source = fs.readFileSync(path.resolve(__dirname, '../public/simulatte/system-diagram/learning.js'), 'utf8');

// This DOM adapter proves event and element lifetimes, not browser layout or pixels.
class DomEvent {
  constructor(type, options = {}) { this.type = type; this.bubbles = Boolean(options.bubbles); this.target = null; }
}
class Element {
  constructor(tag, doc) {
    this.tagName = tag; this.ownerDocument = doc; this.parentElement = null; this.children = [];
    this.dataset = {}; this.attributes = {}; this.listeners = new Map(); this._text = ''; this.hidden = false; this.disabled = false;
    this.scrollTop = 0; this.scrollLeft = 0;
  }
  set textContent(value) { this.replaceChildren(); this._text = String(value); }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
  append(...children) { for (const child of children) { child.remove(); child.parentElement = this; this.children.push(child); } }
  replaceChildren(...children) { for (const child of [...this.children]) child.remove(); this._text = ''; this.append(...children); }
  remove() {
    if (!this.parentElement) return;
    if (this.contains(this.ownerDocument.activeElement)) this.ownerDocument.activeElement = this.ownerDocument.body;
    this.parentElement.children = this.parentElement.children.filter(child => child !== this); this.parentElement = null;
  }
  contains(node) { for (let at = node; at; at = at.parentElement) if (at === this) return true; return false; }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  getAttribute(key) { return this.attributes[key]; }
  closest(selector) {
    assert.equal(selector, 'button[data-learning-action]');
    for (let at = this; at; at = at.parentElement) if (at.tagName === 'button' && at.dataset.learningAction) return at;
    return null;
  }
  addEventListener(type, listener, options = {}) {
    if (options.signal?.aborted) return;
    const group = this.listeners.get(type) || new Set(); group.add(listener); this.listeners.set(type, group);
    options.signal?.addEventListener('abort', () => group.delete(listener), { once: true });
  }
  dispatchEvent(event) {
    if (!event.target) event.target = this;
    for (const listener of [...(this.listeners.get(event.type) || [])]) listener(event);
    if (event.bubbles) this.parentElement?.dispatchEvent(event);
    return true;
  }
  click() { if (!this.disabled) this.dispatchEvent(new DomEvent('click', { bubbles: true })); }
  focus() { this.ownerDocument.activeElement = this; }
}
function all(root, predicate) { return [root, ...root.children.flatMap(child => all(child, predicate))].filter(predicate); }
function action(root, type, value) { return all(root, row => row.dataset.learningAction === type && (value === undefined || row.dataset.learningValue === value))[0]; }
const data = () => ({ schema: 'simulatte.systemDiagramLearning.v1', journeys: [{ id: 'example', title: 'Example', question: 'Where is the record?', outcome: 'A durable row', failure: 'Crash the store', boundary: 'Synthetic only', steps: [{ label: 'Inspect store', classes: ['store'] }] }] });
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const settle = () => new Promise(resolve => setImmediate(resolve));
async function fixture(options = {}) {
  const controllers = [];
  class TrackedAbortController extends AbortController { constructor() { super(); controllers.push(this); } }
  const doc = { createElement: tag => new Element(tag, doc), defaultView: { Event: DomEvent } };
  doc.body = new Element('body', doc); doc.activeElement = doc.body;
  const host = new Element('section', doc); host.dataset.journeysSrc = '/journeys.json'; doc.body.append(host);
  const preset = new Element('select', doc); doc.getElementById = id => id === 'preset' ? preset : null;
  let pending = false, view = { t: 0, global: { completed: 1, failed: 0, inFlight: 0 }, nodes: { node: { health: 'ok', queue: 0, busy: 1, records: { values: options.rows || [{ id: 'one', value: 1 }] } } } };
  const subscribers = new Set();
  const model = {
    diagram: { id: options.custom ? 'custom' : 'example', classes: [], nodes: [{ id: 'node', label: 'Store', classId: 'store' }] },
    selection: { nodes: [], edges: [], groups: [], notes: [] },
    subscribe(listener) { subscribers.add(listener); return () => subscribers.delete(listener); },
    notify() { for (const listener of subscribers) listener(); },
    select(selection) { this.selection = { ...this.selection, ...selection }; this.notify(); }
  };
  const messages = [];
  const context = vm.createContext({ module: { exports: {} }, AbortController: TrackedAbortController, Event: DomEvent, fetch: options.fetch || (async () => ({ ok: true, json: async () => data() })) });
  vm.runInContext(source, context);
  const api = context.module.exports;
  const ui = api.create({ host, model, config: { examples: [{ id: 'example' }], claimBoundary: 'Custom diagrams are synthetic.' }, getView: () => view, isPending: () => pending, onMessage: (...args) => messages.push(args) });
  await settle();
  return { api, ui, host, doc, model, preset, controllers, subscribers, messages, view: () => view,
    tick(t, patch = {}) { view = { ...view, t, ...patch }; ui.render(view); },
    setPending(value) { pending = value; ui.render(view); }
  };
}

test('flow ticks preserve focused controls and disclosure state without accumulating listeners', async () => {
  const f = await fixture(), tab = action(f.host, 'tab', 'records'), step = action(f.host, 'step', '0');
  const boundary = all(f.host, row => row.tagName === 'details')[0]; boundary.open = true; step.focus();
  const initial = getEventListeners(f.controllers[0].signal, 'abort').length;
  for (let t = 1; t <= 100; t++) f.tick(t);
  assert.equal(action(f.host, 'tab', 'records'), tab); assert.equal(action(f.host, 'step', '0'), step);
  assert.equal(f.doc.activeElement, step); assert.equal(boundary.open, true);
  assert.equal(getEventListeners(f.controllers[0].signal, 'abort').length, initial);
  assert.equal(initial, 1, 'only the delegated host listener uses an abort subscription');
  step.click(); assert.equal(f.model.selection.nodes[0], 'node'); assert.equal(f.doc.activeElement, step);
  f.ui.destroy(); assert.equal(f.subscribers.size, 0); assert.equal(f.host.children.length, 0);
  assert.equal(getEventListeners(f.controllers[0].signal, 'abort').length, 0);
});

test('walkthrough steps recognize derived user classes and do not select obsolete node IDs', async () => {
  const f = await fixture();
  f.model.diagram.classes = [{ id: 'user.parent', extends: 'store' }, { id: 'user.custom', extends: 'user.parent' }];
  f.model.diagram.nodes[0].classId = 'user.custom'; f.model.notify();
  const step = action(f.host, 'step', '0'); assert.equal(step.disabled, false); step.click();
  assert.deepEqual(Array.from(f.model.selection.nodes), ['node']);
  f.model.diagram.nodes = []; f.model.notify(); assert.equal(action(f.host, 'step', '0').disabled, true);
  step.click(); assert.deepEqual(Array.from(f.model.selection.nodes), ['node'], 'detached old buttons cannot dispatch to the host');
  f.ui.destroy();
});

test('record updates preserve table, pager focus, disclosure and scroll state, and paginate every row', async () => {
  const rows = Array.from({ length: 61 }, (_, id) => ({ id, value: id === 0 ? '<img src=x onerror=alert(1)>' : id }));
  const f = await fixture({ rows }); action(f.host, 'tab', 'records').click();
  const table = all(f.host, row => row.dataset.recordTable)[0], next = all(table, row => row.dataset.direction === '1')[0];
  const scroller = all(table, row => row.className === 'learning-table-scroll')[0];
  const cells = all(table, row => row.tagName === 'td'); assert.equal(cells.length, 50);
  assert.equal(cells[1].textContent, '<img src=x onerror=alert(1)>'); assert.equal(cells[1].children.length, 0);
  table.open = false; next.focus(); scroller.scrollTop = 70; scroller.scrollLeft = 90;
  rows[0].value = 'changed'; f.tick(1);
  assert.equal(all(f.host, row => row.dataset.recordTable)[0], table); assert.equal(table.open, false); assert.equal(f.doc.activeElement, next);
  assert.equal(scroller.scrollTop, 70); assert.equal(scroller.scrollLeft, 90); assert.match(table.textContent, /changed/);
  next.click(); assert.match(table.textContent, /Records 26–50 of 61/);
  next.click(); assert.match(table.textContent, /Records 51–61 of 61/); assert.equal(next.disabled, true);
  assert.equal(all(table, row => row.tagName === 'td').length, 22);
  action(f.host, 'tab', 'flow').click(); action(f.host, 'tab', 'records').click();
  assert.equal(all(f.host, row => row.dataset.recordTable)[0], table); assert.equal(table.open, false);
  f.ui.destroy();
});

test('record presentation only inspects the visible page, including heterogeneous later-page fields', async () => {
  let reads = 0;
  const rows = Array.from({ length: 3000 }, (_, id) => ({ id }));
  Object.defineProperty(rows[25], 'later', { enumerable: true, get() { reads++; return 'later page'; } });
  const f = await fixture({ rows });
  for (let t = 1; t < 10; t++) f.tick(t);
  assert.equal(reads, 0, 'flow ticks never enumerate or stringify record rows');
  action(f.host, 'tab', 'records').click(); assert.equal(reads, 0, 'page one never reads page two');
  const table = all(f.host, row => row.dataset.recordTable)[0]; all(table, row => row.dataset.direction === '1')[0].click();
  assert.ok(reads > 0); assert.ok(all(table, row => row.tagName === 'th').some(row => row.textContent === 'later'));
  assert.match(table.textContent, /later page/); f.ui.destroy();
});

test('custom diagrams expose records and stable activity controls, but never mix pending semantics with accepted state', async () => {
  const f = await fixture({ custom: true });
  action(f.host, 'tab', 'records').click(); const table = all(f.host, row => row.dataset.recordTable)[0]; assert.ok(table);
  const records = table.parentElement.parentElement; assert.equal(records.hidden, false);
  f.setPending(true); assert.equal(records.hidden, true); f.setPending(false); assert.equal(records.hidden, false);
  action(f.host, 'tab', 'activity').click(); const select = action(f.host, 'node', 'node'); select.focus();
  for (let t = 1; t <= 20; t++) f.tick(t, { nodes: { node: { ...f.view().nodes.node, queue: t } } });
  assert.equal(action(f.host, 'node', 'node'), select); assert.equal(f.doc.activeElement, select); assert.match(select.parentElement.textContent, /20 queued/);
  select.click(); assert.equal(f.model.selection.nodes[0], 'node'); assert.match(f.host.textContent, /Custom diagrams are synthetic/);
  f.ui.destroy();
});

test('disposed asynchronous metadata never remounts controls or reports a late failure', async () => {
  const payload = deferred();
  const f = await fixture({ fetch: async () => ({ ok: true, json: () => payload.promise }) });
  f.ui.destroy(); payload.resolve(data()); await settle();
  assert.equal(f.host.children.length, 0); assert.equal(f.messages.length, 0); assert.equal(f.subscribers.size, 0);
  assert.equal(f.controllers[0].signal.aborted, true);
  f.tick(1); assert.equal(f.host.children.length, 0);
});

test('metadata failure leaves custom inspection available and reports the failure once', async () => {
  const f = await fixture({ custom: true, fetch: async () => ({ ok: false, status: 503 }) });
  assert.equal(f.messages.length, 1); assert.match(f.host.textContent, /Walkthrough unavailable/);
  action(f.host, 'tab', 'records').click(); assert.ok(all(f.host, row => row.dataset.recordTable).length);
  f.ui.destroy();
});

test('example choice dispatches the owning document event and metadata rejects invalid steps', async () => {
  const f = await fixture(); let changes = 0; f.preset.addEventListener('change', () => { changes++; });
  action(f.host, 'example', 'example').click(); assert.equal(f.preset.value, 'example'); assert.equal(changes, 1);
  for (const bad of [null, {}, { label: 'bad', classes: [] }]) {
    const invalid = data(); invalid.journeys[0].steps = [bad]; assert.throws(() => f.api.validate(invalid), /invalid step/);
  }
  f.ui.destroy();
});

test('walkthrough and activity reveal real members of folded groups before selecting them', async () => {
  const f = await fixture();
  f.model.diagram.groups = [{ id: 'backend', collapsed: true }, { id: 'other', collapsed: true }];
  f.model.diagram.nodes[0].groupId = 'backend';
  const commands = [];
  f.model.apply = command => {
    commands.push(command);
    assert.equal(command.type, 'setGroupCollapsed');
    f.model.diagram.groups.find(group => group.id === command.id).collapsed = command.collapsed;
    f.model.notify();
    return { ok: true, kind: 'layout' };
  };
  action(f.host, 'step', '0').click();
  assert.equal(commands.length, 1); assert.equal(commands[0].id, 'backend');
  assert.equal(f.model.diagram.groups[0].collapsed, false);
  assert.equal(f.model.diagram.groups[1].collapsed, true);
  assert.deepEqual(Array.from(f.model.selection.nodes), ['node']);
  f.model.diagram.groups[0].collapsed = true;
  action(f.host, 'tab', 'activity').click(); action(f.host, 'node', 'node').click();
  assert.equal(commands.length, 2); assert.equal(f.model.diagram.groups[0].collapsed, false);
  f.ui.destroy();
});

test('a refused group expansion reports the error without selecting an invisible node', async () => {
  const f = await fixture();
  f.model.diagram.groups = [{ id: 'backend', collapsed: true }];
  f.model.diagram.nodes[0].groupId = 'backend';
  f.model.apply = () => ({ ok: false, error: 'Invalid group state' });
  action(f.host, 'step', '0').click();
  assert.equal(f.model.selection.nodes.length, 0);
  assert.equal(f.messages[0][0], 'Invalid group state');
  f.ui.destroy();
});
