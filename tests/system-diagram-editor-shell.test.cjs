'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
require('../public/simulatte/system-diagram/editor-shell.js');
const Shell = globalThis.SimulatteSystemDiagramShell;

// DOM adapter verifies drawer and rail state transitions, not browser layout or pixels.
function shellDom({width}) {
  const listeners = [], byId = new Map(), bySelector = new Map(), stored = new Map(), rects = new Map();
  class Element {
    constructor(className = '') { this.className = className; this.dataset = {}; this.style = {setProperty: (k, v) => { this.style[k] = v; }}; this.attributes = {}; this.inert = false; this.open = false; this.children = []; }
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
  return {doc, dispatch, stored, palettePanel, propertiesPanel, id: name => byId.get(name)};
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
  expand(); dom.dispatch(dom.doc.querySelector('.canvas-panel'), 'pointerdown');
  assert.equal(api.getRailState().expanded, true, 'pressing a workspace control keeps it in place until it activates');
  dom.dispatch(dom.doc.querySelector('.canvas-panel'), 'click');
  assert.equal(api.getRailState().expanded, false, 'a tap on the run dock or task bar collapses the phone rail');
  assert.equal(dom.palettePanel.inert, false, 'the collapsed rail stays usable');
});

test('desktop dismissal keeps the persistent rail expanded', () => {
  const {dom, api, propertiesOpen} = shell(1440);
  assert.equal(api.getRailState().expanded, true);
  dom.dispatch(dom.id('properties-toggle'), 'click'); assert.equal(propertiesOpen(), true);
  dom.dispatch(dom.doc, 'keydown', {key: 'Escape'});
  assert.equal(propertiesOpen(), false);
  dom.dispatch(dom.id('diagram'), 'pointerdown'); dom.dispatch(dom.doc.querySelector('.canvas-panel'), 'click');
  assert.equal(api.getRailState().expanded, true);
  assert.equal(api.getRailState().width, 208);
});

test('an open drawer overlays a phone canvas instead of leaving Fit no usable width', () => {
  const phone = shell(390);
  phone.dom.dispatch(phone.dom.id('properties-toggle'), 'click'); phone.api.updateInsets();
  assert.equal(phone.propertiesOpen(), true);
  assert.equal(phone.insets().right, 12, 'a 310px drawer over a 334px canvas overlays it');
  assert.ok(334 - phone.insets().left - phone.insets().right >= 160);
  const desktop = shell(1440);
  desktop.dom.dispatch(desktop.dom.id('properties-toggle'), 'click'); desktop.api.updateInsets();
  assert.equal(desktop.insets().right, 322, 'wide canvases still reserve the drawer width');
});
