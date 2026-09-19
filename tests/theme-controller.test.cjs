const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const SOURCE = fs.readFileSync(path.join(__dirname, '../public/shared/design/theme-controller.js'), 'utf8');

function fixture({ stored = null, systemDark = false } = {}) {
  const values = new Map(stored ? [['simulatte.theme.v1', stored]] : []);
  const mediaListeners = [];
  const windowListeners = new Map();
  const buttonListeners = new Map();
  const attributes = new Map();
  const label = { textContent: '' };
  const button = {
    title: '',
    addEventListener(type, listener) { buttonListeners.set(type, listener); },
    setAttribute(name, value) { attributes.set(name, value); },
  };
  const control = {
    dataset: {},
    querySelector(selector) { return selector === 'button' ? button : label; },
  };
  const media = {
    matches: systemDark,
    addEventListener(type, listener) { if (type === 'change') mediaListeners.push(listener); },
  };
  const documentElement = { dataset: {}, style: {} };
  const document = {
    documentElement,
    readyState: 'complete',
    querySelectorAll: () => [control],
    dispatchEvent() {},
  };
  class CustomEvent {
    constructor(type, options) { this.type = type; this.detail = options.detail; }
  }
  const context = {
    document,
    CustomEvent,
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    },
    matchMedia: () => media,
    requestAnimationFrame: (callback) => callback(),
    addEventListener: (type, listener) => windowListeners.set(type, listener),
  };
  vm.runInNewContext(SOURCE, context);
  return { attributes, button, buttonListeners, context, control, documentElement, label, media, mediaListeners, values, windowListeners };
}

test('theme defaults to the live system preference without creating an override', () => {
  const f = fixture({ systemDark: true });
  assert.equal(f.documentElement.dataset.themePreference, 'system');
  assert.equal(f.documentElement.dataset.theme, 'dark');
  assert.equal(f.documentElement.style.colorScheme, 'dark');
  assert.equal(f.values.has('simulatte.theme.v1'), false);
  assert.equal(f.label.textContent, 'System');
  assert.match(f.attributes.get('aria-label'), /Switch to Light/);

  f.media.matches = false;
  f.mediaListeners[0]();
  assert.equal(f.documentElement.dataset.theme, 'light');
});

test('control cycles system, light, dark and back to system with bounded persistence', () => {
  const f = fixture();
  const click = f.buttonListeners.get('click');
  click();
  assert.equal(f.context.SimulatteTheme.getPreference(), 'light');
  assert.equal(f.values.get('simulatte.theme.v1'), 'light');
  click();
  assert.equal(f.context.SimulatteTheme.getPreference(), 'dark');
  assert.equal(f.values.get('simulatte.theme.v1'), 'dark');
  click();
  assert.equal(f.context.SimulatteTheme.getPreference(), 'system');
  assert.equal(f.values.has('simulatte.theme.v1'), false);
});

test('stored and cross-tab preferences are normalized and applied', () => {
  const f = fixture({ stored: 'dark', systemDark: false });
  assert.equal(f.documentElement.dataset.theme, 'dark');
  f.windowListeners.get('storage')({ key: 'simulatte.theme.v1', newValue: 'light' });
  assert.equal(f.documentElement.dataset.themePreference, 'light');
  assert.equal(f.documentElement.dataset.theme, 'light');
  f.windowListeners.get('storage')({ key: 'simulatte.theme.v1', newValue: 'invalid' });
  assert.equal(f.documentElement.dataset.themePreference, 'system');
});
