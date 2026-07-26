const assert = require('node:assert/strict');
const test = require('node:test');

const uiHost = require('../public/simulatte/platform/ui-host/declarative-ui-host.js');

class FakeNode {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName;
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.dataset = {};
    this.listeners = new Map();
    this.value = '';
    this.checked = false;
    this.selected = false;
    this.multiple = false;
  }

  append(...nodes) {
    this.children.push(...nodes);
  }

  replaceChildren(...nodes) {
    this.children = nodes;
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  dispatch(type) {
    return this.listeners.get(type)?.();
  }

  get selectedOptions() {
    return this.children.filter((node) => node.selected);
  }
}

function fakeDocument() {
  const documentRef = {
    createElement: (tagName) => new FakeNode(tagName, documentRef),
    createDocumentFragment: () => new FakeNode('#fragment', documentRef),
  };
  return documentRef;
}

function find(node, predicate) {
  if (predicate(node)) return node;
  for (const child of node.children || []) {
    const found = find(child, predicate);
    if (found) return found;
  }
  return null;
}

function control(id, kind, value, options = null) {
  return {
    id,
    label: id,
    kind,
    value,
    options,
    minimum: kind === 'number' ? 0 : null,
    maximum: kind === 'number' ? 10 : null,
    step: kind === 'number' ? 1 : null,
    provenance: {},
  };
}

test('declarative UI renders v4 experiment controls and returns typed edited values', () => {
  const documentRef = fakeDocument();
  const inspector = new FakeNode('root', documentRef);
  const host = uiHost.createDeclarativeUiHost({ rootElement: inspector, onAction() {} });
  const contribution = {
    pluginId: 'fixture',
    controls: {
      controls: [
        control('days', 'number', 3),
        control('enabled', 'toggle', true),
        control('departureAt', 'datetime-local', '2026-07-19T17:00'),
        control('policy', 'select', 'balanced', [
          { value: 'balanced', label: 'Balanced' },
          { value: 'fast', label: 'Fast' },
        ]),
        control('families', 'multiselect', ['usb-c'], [
          { value: 'usb-c', label: 'USB-C' },
          { value: 'hdmi', label: 'HDMI' },
        ]),
      ],
    },
    inspections: [],
  };
  host.render([], [contribution]);

  const days = find(inspector, (node) => node.dataset?.pluginControl === 'days');
  days.value = '7';
  days.dispatch('change');
  const enabled = find(inspector, (node) => node.dataset?.pluginControl === 'enabled');
  enabled.checked = false;
  enabled.dispatch('change');
  const policy = find(inspector, (node) => node.dataset?.pluginControl === 'policy');
  policy.value = 'fast';
  policy.dispatch('change');
  const families = find(inspector, (node) => node.dataset?.pluginControl === 'families');
  families.children.forEach((option) => { option.selected = option.value === 'hdmi'; });
  families.dispatch('change');
  const departureAt = find(inspector, (node) => node.dataset?.pluginControl === 'departureAt');
  departureAt.value = '2026-07-20T09:30';
  departureAt.dispatch('change');

  assert.deepEqual(host.values('fixture'), {
    days: 7,
    enabled: false,
    departureAt: '2026-07-20T09:30',
    policy: 'fast',
    families: ['hdmi'],
  });
  host.render([], [contribution]);
  assert.deepEqual(host.values('fixture'), {
    days: 7,
    enabled: false,
    departureAt: '2026-07-20T09:30',
    policy: 'fast',
    families: ['hdmi'],
  });
});
