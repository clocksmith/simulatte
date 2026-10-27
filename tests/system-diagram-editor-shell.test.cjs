'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
require('../public/simulatte/system-diagram/editor-shell.js');
const Shell = globalThis.SimulatteSystemDiagramShell;

// DOM adapter verifies drawer and rail state transitions, not browser layout or pixels.
function shellDom({width}) {
  const listeners = [], byId = new Map(), bySelector = new Map(), stored = new Map(), rects = new Map();
  class Element {
    constructor(className = '') { this.className = className; this.dataset = {}; this.style = {setProperty: (k, v) => { this.style[k] = v; }}; this.attributes = {}; this.inert = false; this.open = false; this.children = []; this.classes = new Set(); this.captured = new Set(); }
    get classList() { return {add: (...names) => names.forEach(n => this.classes.add(n)), contains: n => this.classes.has(n)}; }
    setPointerCapture(id) { this.captured.add(id); }
    hasPointerCapture(id) { return this.captured.has(id); }
    releasePointerCapture(id) { this.captured.delete(id); }
    remove() {}
    setAttribute(key, value) { this.attributes[key] = String(value); }
    getAttribute(key) { return this.attributes[key] ?? null; }
    addEventListener(type, fn, options = {}) { listeners.push({target: this, type, fn, capture: Boolean(options.capture)}); }
    append(...items) { this.children.push(...items); }
    querySelector(selector) { return this.children.find(child => child.matches?.(selector)) || null; }
    closest() { return null; }
    focus() { doc.activeElement = this; }
    getBoundingClientRect() { return rects.get(this) || {left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0}; }
  }
  const make = (className, id) => { const e = new Element(className); if (id) byId.set(id, e); return e; };
  const doc = {
    activeElement: null,
    body: make('body'),
    createElement: () => make(''),
    getElementById: id => byId.get(id) || null,
    querySelector: selector => bySelector.get(selector) || null,
    addEventListener: (type, fn, options = {}) => listeners.push({target: doc, type, fn, capture: Boolean(options.capture)}),
  };
  const closeButton = () => { const b = make(''); b.matches = s => s === '[data-close-drawer]'; return b; };
  const palettePanel = make('palette-panel'), propertiesPanel = make('properties-panel');
  palettePanel.append(closeButton()); propertiesPanel.append(closeButton());
  bySelector.set('.palette-panel', palettePanel); bySelector.set('.properties-panel', propertiesPanel);
  for (const selector of ['.editor-layout', '.canvas-panel', '.app-header']) bySelector.set(selector, make(selector.slice(1)));
  for (const id of ['palette-toggle', 'properties-toggle', 'diagram', 'preset']) make('', id);
  const rail = width <= 700 ? 56 : 208;
  rects.set(byId.get('diagram'), {left: rail, top: 52, right: width, bottom: 844, width: width - rail, height: 792});
  rects.set(palettePanel, {left: 0, top: 52, right: rail, bottom: 844, width: rail, height: 792});
  rects.set(propertiesPanel, {left: width - 310, top: 52, right: width, bottom: 844, width: 310, height: 792});
  const menu = make('', 'workspace-menu'); menu.append(Object.assign(make(''), {matches: s => s === 'summary'}));
  make('', 'document-panel').append(Object.assign(make(''), {matches: s => s === 'summary'}));
  const win = {
    innerWidth: width,
    matchMedia: () => ({matches: width <= 700, addEventListener: (type, fn, options) => listeners.push({target: 'media', type, fn, options})}),
    localStorage: {getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value)},
    addEventListener: () => {},
    ResizeObserver: class { observe() {} disconnect() {} },
    MutationObserver: class { observe() {} disconnect() {} },
  };
  doc.defaultView = win;
  function dispatch(target, type, event = {}) {
    const full = {preventDefault() {}, stopPropagation() {}, target: {closest: () => null}, ...event};
    for (const row of listeners.filter(l => l.target === target && l.type === type)) row.fn(full);
  }
  const resizer = side => bySelector.get('.editor-layout').children.find(e => e.dataset.side === side);
  return {doc, dispatch, stored, palettePanel, propertiesPanel, resizer, id: name => byId.get(name)};
}

function shell(width) {
  const dom = shellDom({width});
  const insets = [];
  const api = Shell.create({canvas: {setInsets: value => insets.push(value)}, document: dom.doc});
  const expand = () => { if (!api.getRailState().expanded) dom.dispatch(dom.id('palette-toggle'), 'click'); };
  const propertiesOpen = () => dom.id('properties-toggle').getAttribute('aria-expanded') === 'true';
  return {dom, api, expand, propertiesOpen, insets: () => insets.at(-1)};
}

test('phone dismissal collapses an expanded rail so the canvas is never fully covered', () => {
  const {dom, api, expand, propertiesOpen} = shell(390);
  assert.equal(api.getRailState().width, 56, 'phones start collapsed');
  expand(); assert.equal(api.getRailState().width, 208);
  dom.dispatch(dom.doc, 'keydown', {key: 'Escape'});
  assert.equal(api.getRailState().expanded, false, 'Escape collapses the phone rail');
  assert.equal(dom.doc.activeElement, dom.id('palette-toggle'));
  assert.equal(JSON.parse(dom.stored.get('simulatte.lucyd.componentRail.v1')).expanded, false);

  expand(); dom.dispatch(dom.id('properties-toggle'), 'click');
  assert.equal(propertiesOpen(), true);
  assert.equal(api.getRailState().expanded, false, 'opening Properties collapses the phone rail');

  expand(); assert.equal(propertiesOpen(), false, 'expanding the rail closes Properties');
  dom.dispatch(dom.id('diagram'), 'pointerdown');
  assert.equal(api.getRailState().expanded, false, 'a canvas tap collapses the phone rail');
  expand(); dom.dispatch(dom.doc.querySelector('.canvas-panel'), 'click');
  assert.equal(api.getRailState().expanded, true, 'run dock controls sit above the overlay, so using them leaves it open');
  dom.dispatch(dom.doc, 'keydown', {key: 'Escape'}); assert.equal(api.getRailState().expanded, false);
  assert.equal(dom.palettePanel.inert, false, 'the collapsed rail stays usable');
  expand(); dom.dispatch(dom.palettePanel, 'click', {target: {closest: selector => selector === '.palette-item' ? {} : null}});
  assert.equal(api.getRailState().expanded, false, 'picking a component on a phone collapses the overlay so the new part is visible');
});

test('desktop rails persist through Escape and canvas taps until their own toggle collapses them', () => {
  const {dom, api, propertiesOpen} = shell(1440);
  assert.equal(api.getRailState().expanded, true);
  dom.dispatch(dom.id('properties-toggle'), 'click'); assert.equal(propertiesOpen(), true);
  dom.dispatch(dom.doc, 'keydown', {key: 'Escape'});
  dom.dispatch(dom.id('diagram'), 'pointerdown'); dom.dispatch(dom.doc.querySelector('.canvas-panel'), 'click');
  assert.equal(propertiesOpen(), true); assert.equal(api.getRailState().expanded, true);
  assert.equal(api.getRailState().width, 208); assert.equal(api.getRailState('right').width, 340);
  dom.dispatch(dom.id('properties-toggle'), 'click');
  assert.equal(propertiesOpen(), false); assert.equal(dom.propertiesPanel.inert, true, 'collapsed properties content is not focusable');
  assert.equal(JSON.parse(dom.stored.get('simulatte.lucyd.propertiesRail.v1')).expanded, false);
});

test('both rails share one toggle, resizer and two-state component, mirrored by side', () => {
  const {dom, api} = shell(1440), layout = dom.doc.querySelector('.editor-layout');
  const left = dom.id('palette-toggle'), right = dom.id('properties-toggle');
  assert.ok(left.classList.contains('lucyd-rail-toggle') && right.classList.contains('lucyd-rail-toggle'));
  assert.deepEqual([left.textContent, left.getAttribute('aria-label')], ['‹', 'Collapse component library']);
  assert.deepEqual([right.textContent, right.getAttribute('aria-label')], ['‹', 'Expand properties']);
  assert.equal(dom.resizer('right').getAttribute('aria-label'), 'Resize properties'); assert.equal(dom.resizer('right').hidden, true);
  assert.equal(layout.style['--lucyd-properties-rail-width'], '56px', 'collapsed properties keep a 56px strip like components');
  dom.dispatch(right, 'click');
  assert.deepEqual([right.textContent, right.getAttribute('aria-label'), right.getAttribute('aria-expanded')], ['›', 'Collapse properties', 'true']);
  assert.equal(layout.style['--lucyd-properties-rail-width'], '340px'); assert.equal(dom.doc.body.dataset.propertiesExpanded, 'true');
  dom.dispatch(left, 'click');
  assert.deepEqual([left.textContent, left.getAttribute('aria-label')], ['›', 'Expand component library']); assert.equal(layout.style['--lucyd-rail-width'], '56px');
});

test('either rail resizes from its inner edge up to 360 pixels within the viewport', () => {
  const {dom, api} = shell(1440), key = (side, k) => dom.dispatch(dom.resizer(side), 'keydown', {key: k});
  key('left', 'End'); assert.equal(api.getRailState().width, 360); key('left', 'Home'); assert.equal(api.getRailState().width, 160);
  key('left', 'ArrowRight'); assert.equal(api.getRailState().width, 170, 'ArrowRight moves the left edge toward the canvas');
  dom.dispatch(dom.id('properties-toggle'), 'click');
  key('right', 'End'); assert.equal(api.getRailState('right').width, 360);
  key('right', 'ArrowLeft'); assert.equal(api.getRailState('right').width, 360, 'the cap holds');
  key('right', 'ArrowRight'); assert.equal(api.getRailState('right').width, 350, 'ArrowRight moves the right edge away from the canvas');
  const drag = (side, x) => { const r = dom.resizer(side); dom.dispatch(r, 'pointerdown', {pointerId: 1, clientX: x}); dom.dispatch(r, 'pointerup', {pointerId: 1, clientX: x}); };
  drag('right', 1200); assert.equal(api.getRailState('right').width, 240, 'right width is measured from the viewport edge');
  drag('right', 900); assert.equal(api.getRailState('right').width, 360);
  drag('left', 500); assert.equal(api.getRailState().width, 360);
  const narrow = shell(1024); narrow.dom.dispatch(narrow.dom.resizer('left'), 'keydown', {key: 'End'}); narrow.dom.dispatch(narrow.dom.id('properties-toggle'), 'click');
  narrow.dom.dispatch(narrow.dom.resizer('right'), 'keydown', {key: 'End'});
  assert.equal(narrow.api.getRailState('right').width, 1024 - 360 - 320, 'both rails leave at least 320px of canvas');
});

test('phone rails overlay exclusively and keep insets fixed so Fit keeps usable width', () => {
  const phone = shell(390), layout = phone.dom.doc.querySelector('.editor-layout');
  phone.dom.dispatch(phone.dom.id('properties-toggle'), 'click'); phone.api.updateInsets();
  assert.equal(phone.propertiesOpen(), true);
  assert.equal(layout.style['--lucyd-properties-rail-width'], '56px'); assert.equal(layout.style['--lucyd-properties-width'], '294px', 'phone overlays stay within the viewport');
  assert.deepEqual([phone.insets().left, phone.insets().right], [12, 12]);
  phone.expand(); assert.equal(phone.propertiesOpen(), false, 'expanding components collapses the properties overlay');
  phone.dom.dispatch(phone.dom.id('properties-toggle'), 'click'); assert.equal(phone.api.getRailState().expanded, false);
  phone.dom.dispatch(phone.dom.doc, 'keydown', {key: 'Escape'}); assert.equal(phone.propertiesOpen(), false);
  assert.equal(phone.dom.doc.activeElement, phone.dom.id('properties-toggle'));
  const desktop = shell(1440);
  desktop.dom.dispatch(desktop.dom.id('properties-toggle'), 'click'); desktop.api.updateInsets();
  assert.equal(desktop.insets().right, 12, 'the desktop properties rail takes layout space instead of insetting the canvas');
});
test('expanded phone rail overlays a stable compact workspace at 390 and 320 pixels',()=>{
 for(const width of [390,320]){
  const {dom,api,expand,insets}=shell(width),layout=dom.doc.querySelector('.editor-layout');
  expand();assert.equal(layout.style['--lucyd-rail-width'],'56px');assert.equal(layout.style['--lucyd-palette-width'],'208px');assert.equal(insets().left,12);
  api.updateInsets();assert.equal(api.getRailState().expanded,true,'layout updates preserve explicit expansion');
  dom.dispatch(dom.doc,'keydown',{key:'Escape'});assert.equal(layout.style['--lucyd-rail-width'],'56px');assert.equal(layout.style['--lucyd-palette-width'],'56px');assert.equal(dom.doc.activeElement,dom.id('palette-toggle'));
 }
});
