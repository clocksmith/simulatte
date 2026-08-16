const assert = require('node:assert/strict');
const test = require('node:test');

const lab = require('../public/blank/app/simulation/simulation-lab.js');
const controllerApi = require('../public/blank/app/prompt/world-spec-reconciliation-controller.js');

class FakeElement {
  constructor(id = '') {
    this.id = id;
    this.dataset = {};
    this.disabled = false;
    this.open = false;
    this.textContent = '';
    this.children = [];
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    const rows = this.listeners.get(type) || [];
    rows.push(listener);
    this.listeners.set(type, rows);
  }

  dispatchEvent(event) {
    event.preventDefault ||= () => { event.defaultPrevented = true; };
    (this.listeners.get(event.type) || []).forEach((listener) => listener(event));
  }

  click() {
    this.dispatchEvent({ type: 'click' });
  }

  append(...children) {
    this.children.push(...children);
  }

  replaceChildren(...children) {
    this.children = children;
  }

  showModal() {
    this.open = true;
  }

  close() {
    this.open = false;
  }

  setAttribute(name) {
    if (name === 'open') this.open = true;
  }

  removeAttribute(name) {
    if (name === 'open') this.open = false;
  }
}

function documentFixture() {
  const ids = [
    'world-spec-reconciliation-dialog',
    'world-spec-reconciliation-summary',
    'world-spec-reconciliation-conflicts',
    'world-spec-reconciliation-fields',
    'preserve-world-spec-overrides',
    'accept-recompiled-world-spec',
    'cancel-world-spec-reconciliation',
  ];
  const elements = new Map(ids.map((id) => [id, new FakeElement(id)]));
  return {
    elements,
    getElementById(id) { return elements.get(id) || null; },
    createElement() { return new FakeElement(); },
  };
}

function editedFixture() {
  const compiled = lab.createSpecFromPrompt('a red ball rests beside a blue wall', {
    allowPrototypeFallback: true,
    deterministicRuntime: true,
    retrievalPhase: 'deterministic-local',
  });
  const candidate = JSON.parse(lab.serializeSpec(compiled));
  candidate.params.energyInput = 1.25;
  const edited = lab.applyWorldSpecEdit(compiled, candidate, {
    rationale: 'Increase the applied energy',
  });
  return { compiled, edited };
}

test('the controller blocks replacement until an explicit preserve decision', async () => {
  const documentRoot = documentFixture();
  const { compiled, edited } = editedFixture();
  const pendingPlans = [];
  const controller = controllerApi.connect(documentRoot, {
    onPending: (plan) => pendingPlans.push(plan),
  });
  const pending = controller.resolve(edited, compiled);

  assert.equal(documentRoot.elements.get('world-spec-reconciliation-dialog').open, true);
  assert.equal(documentRoot.elements.get('world-spec-reconciliation-dialog').dataset.state, 'pending');
  assert.match(documentRoot.elements.get('world-spec-reconciliation-summary').textContent, /1 accepted edit/);
  assert.equal(pendingPlans.length, 1);
  assert.equal(controller.getLatestReceipt(), null);

  documentRoot.elements.get('preserve-world-spec-overrides').click();
  const result = await pending;
  assert.equal(result.worldSpec.params.energyInput, 1.25);
  assert.equal(result.receipt.decision, 'preserve-overrides');
  assert.equal(controller.getLatestReceipt(), result.receipt);
  assert.equal(documentRoot.elements.get('world-spec-reconciliation-dialog').open, false);
});

test('cancel retains the current artifact and fresh compilation requires its own decision', async () => {
  const documentRoot = documentFixture();
  const { compiled, edited } = editedFixture();
  const controller = controllerApi.connect(documentRoot);

  const cancelled = controller.resolve(edited, compiled);
  documentRoot.elements.get('cancel-world-spec-reconciliation').click();
  assert.equal(await cancelled, null);
  assert.equal(controller.getLatestReceipt(), null);

  const pendingFresh = controller.resolve(edited, compiled);
  documentRoot.elements.get('accept-recompiled-world-spec').click();
  const fresh = await pendingFresh;
  assert.equal(fresh.receipt.decision, 'accept-recompiled');
  assert.notEqual(fresh.worldSpec.params.energyInput, edited.params.energyInput);
  assert.equal(fresh.worldSpec.authorship.reconciliations.length, 1);
});
