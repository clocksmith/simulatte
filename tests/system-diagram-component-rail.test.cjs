'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Palette = require('../public/simulatte/system-diagram/palette.js');
const Editor = require('../public/simulatte/system-diagram/editor-model.js');
const D = require('../public/simulatte/system-diagram/diagram.js');
const config = require('../public/data/system-diagram/config.json');
const library = require('../public/simulatte/system-diagram/class-library.js').loadSync(path.resolve(__dirname, '../public/data/system-diagram'));

test('rail exposes nested saved definitions separately and inserts their executable graph', () => {
  const diagram = structuredClone(require('../public/data/system-diagram/examples/nested-chat.json'));
  const model = Editor.create({diagram, library, config});
  const rows = Palette.railClasses(model.diagram, library, config);
  assert.equal(rows.filter(c => c.kernel !== 'subsystem').length, library.classOrder.length);
  const backend = rows.find(c => c.id === 'subsystem.chat-backend@1');
  assert.equal(backend.kernel, 'subsystem');
  assert.equal(backend.componentCount, 11);
  assert.equal(backend.version, 1);
  const before = D.compile(model.diagram, library, config).nodes.length;
  const added = model.apply({type:'addNode', classId:backend.id, x:0, y:0});
  assert.equal(added.ok, true, added.error);
  assert.ok(D.compile(model.diagram, library, config).nodes.length > before);
  assert.equal(model.diagram.nodes.find(n => n.id === added.id).classId, backend.id);
});

test('blank documents do not acquire example definitions; saving a subsystem makes it discoverable', () => {
  const model = Editor.create({diagram:D.emptyDiagram(config), library, config});
  assert.equal(Palette.railClasses(model.diagram, library, config).filter(c => c.kernel === 'subsystem').length, 0);
  assert.equal(model.apply({type:'addNode', id:'worker', classId:'worker', x:0, y:0}).ok, true);
  const saved = model.apply({type:'saveSubsystem', nodeIds:['worker'], definitionId:'workers', label:'Workers'});
  assert.equal(saved.ok, true, saved.error);
  const rows = Palette.railClasses(model.diagram, library, config);
  assert.equal(rows.find(c => c.id === 'subsystem.workers@1').componentCount, 1);
  assert.equal(Palette.matchesClass(rows.find(c => c.id === 'subsystem.workers@1'), 'workers subsystem'), true);
});

// DOM adapter verifies controls and actions, not browser layout or pixels.
function railDom() {
  const elements = new Map();
  class Element {
    constructor(tag) { this.tagName = tag; this.ownerDocument = doc; this.children = []; this.dataset = {}; this.events = {}; this.value = ''; this.style = {}; this.classList = {add: (...names) => { this.className = [this.className || '', ...names].filter(Boolean).join(' '); }}; }
    set id(value) { this._id = value; elements.set(value, this); }
    get id() { return this._id; }
    get isConnected() { return this === doc.body || Boolean(this.parentElement?.isConnected); }
    append(...items) { for (const item of items) { item.remove(); item.parentElement = this; this.children.push(item); } }
    remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(c => c !== this); this.parentElement = null; }
    replaceChildren(...items) { for (const child of [...this.children]) child.remove(); this.append(...items); }
    before(item) { item.remove(); const parent = this.parentElement; item.parentElement = parent; parent.children.splice(parent.children.indexOf(this), 0, item); }
    setAttribute(key, value) { this[key] = String(value); }
    addEventListener(type, action) { this.events[type] = action; }
    getBoundingClientRect() { return {left:0,top:0,width:800,height:600}; }
  }
  const doc = {createElement: tag => new Element(tag), createElementNS: (_ns, tag) => new Element(tag), getElementById: id => elements.get(id)};
  doc.body = new Element('body');
  const el = (tag, className = '', text = '') => { const e = new Element(tag); e.className = className; e.textContent = text; return e; };
  const host = el('aside'); doc.body.append(host);
  for (const id of ['palette-search','capability-count','palette','diagram']) { const e = el('div'); e.id = id; host.append(e); }
  const field = (parent, _label, value, {id}) => { const wrap = el('label'), input = el('select'); input.id = id; input.value = value; wrap.append(input); parent.append(wrap); return input; };
  const ui = {SimButton: ({label, onAction}) => { const element = el('button', '', label); element.events.click = onAction; return {element}; }};
  const all = (e = host) => [e, ...e.children.flatMap(child => all(child))];
  return {doc, host, el, field, ui, all};
}

test('rail renders grouped controls, searches subsystems, inspects and refreshes after document replacement', () => {
  const dom = railDom(), inspected = [], inserted = [], managed = [];
  const model = Editor.create({diagram:structuredClone(require('../public/data/system-diagram/examples/nested-chat.json')), library, config});
  const rail = Palette.createRail({...dom, library, model, config, canvas:{dropClassAt: id => inserted.push(id)}, message:()=>{}, onInspect:id=>inspected.push(id), onManage:()=>managed.push(true)});
  rail.render();
  assert.match(dom.doc.getElementById('capability-count').textContent, /88 single nodes · 2 expandable subsystems/);
  const groups = dom.all().filter(e => e.tagName === 'details');
  assert.equal(groups[0].dataset.category, 'subsystems');
  groups[1].open = false; groups[1].events.toggle();
  dom.all().find(e => e.className === 'palette-inspect').events.click();
  assert.equal(inspected[0], 'subsystem.generation-capacity@1');
  dom.all().find(e => e.dataset.classId === 'subsystem.chat-backend@1').events.click();
  assert.equal(inserted[0], 'subsystem.chat-backend@1');
  dom.all().find(e => e.className === 'palette-manage').events.click();
  assert.equal(managed.length, 1);
  const search = dom.doc.getElementById('palette-search'); search.value = 'chat-backend'; search.events.input();
  assert.deepEqual(dom.all().filter(e => e.dataset.classId).map(e=>e.dataset.classId), ['subsystem.chat-backend@1']);
  search.value = ''; search.events.input();
  assert.equal(dom.all().find(e => e.tagName === 'details' && e.dataset.category === groups[1].dataset.category).open, false);
  assert.equal(model.replace(D.emptyDiagram(config)).ok, true); rail.render();
  assert.equal(dom.all().filter(e => e.className === 'palette-inspect').length, 0);
  assert.match(dom.all().find(e => e.className === 'palette-empty').textContent, /Save connected nodes/);
});
