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
  assert.equal(families.size, 2);
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

test('declarative UI bounds and searches large option catalogs while retaining selected values', () => {
  const documentRef = fakeDocument();
  const inspector = new FakeNode('root', documentRef);
  const host = uiHost.createDeclarativeUiHost({ rootElement: inspector, onAction() {} });
  const options = Array.from({ length: 120 }, (_, index) => ({
    value: `star-${index}`,
    label: `Catalog star ${index}`,
  }));
  host.render([], [{
    pluginId: 'catalog-fixture',
    controls: { controls: [control('target', 'select', 'star-119', options)] },
    inspections: [],
  }]);

  const search = find(inspector, (node) => node.dataset?.pluginControlSearch === 'target');
  const select = find(inspector, (node) => node.dataset?.pluginControl === 'target');
  assert.ok(search);
  assert.equal(search.dataset.visibleOptionLimit, String(uiHost.LARGE_OPTION_VISIBLE_LIMIT));
  assert.equal(select.children.filter((option) => !option.hidden).length, 81);
  search.value = 'star 95';
  search.dispatch('input');
  assert.deepEqual(
    select.children.filter((option) => !option.hidden).map((option) => option.value),
    ['star-95', 'star-119'],
  );
});

test('declarative UI renders controls first without deleting dynamic evidence or provenance inspections', () => {
  const documentRef = fakeDocument();
  const roots = {
    inspector: new FakeNode('inspector', documentRef),
    map: new FakeNode('map', documentRef),
  };
  const host = uiHost.createDeclarativeUiHost({ rootElements: roots, onAction() {} });
  host.render([{
    pluginId: 'fixture',
    view: {
      slot: 'inspector',
      title: 'Legacy evidence',
      rows: [{ label: 'Exact allocations', value: '300 / 300 (100%)' }],
      fields: [],
      actions: [],
    },
  }], [{
    pluginId: 'fixture',
    controls: { controls: [control('days', 'number', 3)] },
    inspections: [{
      id: 'inspection:fixture',
      label: 'Detailed evidence',
      targetIds: [],
      fields: [{
        id: 'fulfilled',
        label: 'Fulfilled',
        value: 300,
        unit: 'items',
        provenance: {
          axes: {
            origin: 'simulated',
            temporalStatus: 'forecast',
            uncertainty: null,
          },
          evidenceRefs: [{ id: 'simulation:fixture' }],
        },
      }],
    }],
  }]);

  const inspectorFragment = roots.inspector.children[0];
  assert.equal(inspectorFragment.children[0].dataset.controlCount, '1');
  assert.equal(inspectorFragment.children[0].children[0].textContent, 'Controls (1)');
  assert.equal(inspectorFragment.children.length, 3);
  const allocation = find(roots.inspector, (node) => node.tagName === 'dd' && node.textContent === '300 / 300 (100%)');
  const inspection = find(roots.inspector, (node) => node.tagName === 'dd' && node.textContent === '300 items');
  assert.ok(allocation);
  assert.equal(inspection.dataset.origin, 'simulated');
  assert.equal(inspection.dataset.temporalStatus, 'forecast');
  assert.equal(inspection.dataset.evidenceIds, 'simulation:fixture');

  host.dispose();
  assert.deepEqual(roots.inspector.children, []);
  assert.deepEqual(roots.map.children, []);
  assert.deepEqual(host.values('fixture'), {});
});

test('declarative UI keeps dense parameter sets in one flat control panel', () => {
  const documentRef = fakeDocument();
  const inspector = new FakeNode('root', documentRef);
  const host = uiHost.createDeclarativeUiHost({ rootElement: inspector, onAction() {} });
  const controls = [
    control('demandScenario', 'select', 'peak', [{ value: 'peak', label: 'Peak' }]),
    control('failureIds', 'multiselect', ['cut-1'], [{ value: 'cut-1', label: 'Cut 1' }]),
    control('allocationPolicy', 'select', 'fair', [{ value: 'fair', label: 'Fair' }]),
    control('repairPriority', 'select', 'service', [{ value: 'service', label: 'Service' }]),
    control('repairResources', 'number', 2),
    control('ensembleSize', 'number', 8),
    control('excludedJurisdictions', 'multiselect', [], [{ value: 'none', label: 'None' }]),
  ];
  host.render([], [{
    pluginId: 'dense-fixture',
    controls: { controls },
    inspections: [],
  }]);

  const fields = find(inspector, (node) => node.className === 'plugin-controls');
  assert.ok(fields);
  assert.equal(fields.children.length, controls.length);
  assert.equal(find(inspector, (node) => node.className === 'plugin-control-groups'), null);
  assert.deepEqual(host.values('dense-fixture'), {
    demandScenario: 'peak',
    failureIds: ['cut-1'],
    allocationPolicy: 'fair',
    repairPriority: 'service',
    repairResources: 2,
    ensembleSize: 8,
    excludedJurisdictions: [],
  });
});

test('declarative UI applies a complete typed control snapshot on change', async () => {
  const documentRef = fakeDocument();
  const inspector = new FakeNode('root', documentRef);
  const changes = [];
  const host = uiHost.createDeclarativeUiHost({
    rootElement: inspector,
    onAction() {},
    onControlChange(change) {
      changes.push(change);
    },
  });
  host.render([], [{
    pluginId: 'fixture',
    controls: {
      controls: [
        { ...control('people', 'number', 256), maximum: 1000 },
        control('enabled', 'toggle', true),
      ],
    },
    inspections: [],
  }]);

  const people = find(inspector, (node) => node.dataset?.pluginControl === 'people');
  people.value = '512';
  await people.dispatch('change');
  assert.deepEqual(changes, [{
    pluginId: 'fixture',
    controlId: 'people',
    values: { people: 512, enabled: true },
  }]);
  assert.equal(people.dataset.applyStatus, 'applied');

  assert.deepEqual(host.setValues('fixture', { people: 768 }), {
    people: 768,
    enabled: true,
  });
});

test('declarative UI restores the last applied value after a rejected control update', async () => {
  const documentRef = fakeDocument();
  const inspector = new FakeNode('root', documentRef);
  const host = uiHost.createDeclarativeUiHost({
    rootElement: inspector,
    onAction() {},
    async onControlChange() { throw new Error('fixture apply failure'); },
  });
  host.render([], [{
    pluginId: 'fixture',
    controls: { controls: [{ ...control('people', 'number', 256), maximum: 1000 }] },
    inspections: [],
  }]);

  const people = find(inspector, (node) => node.dataset?.pluginControl === 'people');
  people.value = '512';
  await people.dispatch('change');

  assert.equal(people.dataset.applyStatus, 'failed');
  assert.equal(people.value, '256');
  assert.deepEqual(host.values('fixture'), { people: 256 });
});

test('declarative UI removes values for controls no longer declared by a contribution', () => {
  const documentRef = fakeDocument();
  const inspector = new FakeNode('root', documentRef);
  const host = uiHost.createDeclarativeUiHost({ rootElement: inspector, onAction() {} });
  host.render([], [{
    pluginId: 'fixture',
    controls: { controls: [control('people', 'number', 256), control('policy', 'select', 'safe', [{ value: 'safe', label: 'Safe' }])] },
    inspections: [],
  }]);
  host.setValues('fixture', { people: 512, policy: 'safe' });
  host.render([], [{
    pluginId: 'fixture',
    controls: { controls: [control('people', 'number', 256)] },
    inspections: [],
  }]);

  assert.deepEqual(host.values('fixture'), { people: 512 });
});

test('declarative UI resets preserved controls when the scenario changes', () => {
  const documentRef = fakeDocument();
  const inspector = new FakeNode('root', documentRef);
  const host = uiHost.createDeclarativeUiHost({ rootElement: inspector, onAction() {} });
  const contribution = (people) => ({
    pluginId: 'fixture',
    controls: { controls: [control('people', 'number', people)] },
    inspections: [],
  });
  host.render([], [contribution(256)]);
  host.setValues('fixture', { people: 512 });

  host.resetValues('fixture');
  host.render([], [contribution(768)]);

  assert.deepEqual(host.values('fixture'), { people: 768 });
});

test('declarative UI rejects undeclared control values instead of dispatching stale schema fields', () => {
  const documentRef = fakeDocument();
  const inspector = new FakeNode('root', documentRef);
  const host = uiHost.createDeclarativeUiHost({ rootElement: inspector, onAction() {} });
  host.render([], [{
    pluginId: 'fixture',
    controls: { controls: [control('people', 'number', 256)] },
    inspections: [],
  }]);

  assert.throws(
    () => host.setValues('fixture', { missingControl: 1 }),
    (error) => error.code === 'plugin_ui_control_unknown'
  );
});

test('declarative UI reports rejected actions and restores the control surface', async () => {
  const documentRef = fakeDocument();
  const inspector = new FakeNode('root', documentRef);
  const failures = [];
  const host = uiHost.createDeclarativeUiHost({
    rootElement: inspector,
    async onAction() { throw new Error('fixture action failure'); },
    onError(error, context) { failures.push({ message: error.message, ...context }); },
  });
  host.render([{
    pluginId: 'fixture',
    view: {
      slot: 'inspector',
      title: 'Fixture',
      rows: [],
      fields: [],
      actions: [{ id: 'fixture.retry', label: 'Retry' }],
    },
  }]);

  const button = find(inspector, (node) => node.tagName === 'button');
  await button.dispatch('click');

  assert.equal(button.disabled, false);
  assert.equal(button.dataset.actionStatus, 'failed');
  assert.deepEqual(failures, [{ message: 'fixture action failure', actionId: 'fixture.retry', pluginId: 'fixture' }]);
});

test('declarative UI formats structured inspection values as readable stable JSON', () => {
  assert.equal(
    uiHost.formatFieldValue({ z: 2, a: { value: 1 } }, null),
    '{\n  "a": {\n    "value": 1\n  },\n  "z": 2\n}'
  );
  assert.equal(uiHost.formatFieldValue(['north', 'south'], null), 'north, south');
  assert.equal(uiHost.formatFieldValue(null, 'MW'), 'Not available MW');
});

test('declarative UI lazily hydrates object-specific inspections', () => {
  const documentRef = fakeDocument();
  const inspector = new FakeNode('root', documentRef);
  const host = uiHost.createDeclarativeUiHost({ rootElement: inspector, onAction() {} });
  const inspection = (index) => ({
    id: `inspection:${index}`,
    label: `Inspection ${index}`,
    targetIds: [`target:${index}`],
    fields: [{
      id: 'value',
      label: 'Value',
      value: index,
      unit: 'items',
      provenance: {
        axes: { origin: 'observed', temporalStatus: 'snapshot', uncertainty: null },
        evidenceRefs: [],
      },
    }],
  });
  host.render([], [{
    pluginId: 'fixture',
    controls: { controls: [] },
    inspections: [0, 1, 2, 3].map(inspection),
  }]);
  const fourth = inspector.children[0].children[3];

  assert.equal(find(fourth, (node) => node.tagName === 'dd'), null);
  fourth.open = true;
  fourth.dispatch('toggle');
  assert.equal(find(fourth, (node) => node.tagName === 'dd').textContent, '3 items');
});

test('declarative UI bounds initial inspection DOM and hydrates the remainder on demand', () => {
  const documentRef = fakeDocument();
  const inspector = new FakeNode('root', documentRef);
  const host = uiHost.createDeclarativeUiHost({ rootElement: inspector, onAction() {} });
  const inspections = Array.from({ length: 262 }, (_, index) => ({
    id: `inspection:${index}`,
    label: `Inspection ${index}`,
    targetIds: [`target:${index}`],
    fields: [{
      id: 'value',
      label: 'Value',
      value: index,
      unit: 'items',
      provenance: {
        axes: { origin: 'observed', temporalStatus: 'snapshot', uncertainty: null },
        evidenceRefs: [],
      },
    }],
  }));
  host.render([], [{
    pluginId: 'fixture',
    controls: { controls: [] },
    inspections,
  }]);

  const fragment = inspector.children[0];
  assert.equal(fragment.children.length, uiHost.INITIAL_INSPECTION_COUNT + 1);
  const deferred = fragment.children.at(-1);
  assert.equal(deferred.dataset.deferredInspectionCount, '250');
  assert.equal(find(deferred, (node) => node.textContent === 'Inspection 261'), null);

  deferred.open = true;
  deferred.dispatch('toggle');
  assert.ok(find(deferred, (node) => node.textContent === 'Inspection 261'));
  assert.equal(deferred.children.length, 251);
});
