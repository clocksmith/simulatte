const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const api = require('../public/model-selection.js');
const config = JSON.parse(fs.readFileSync(path.join(root, 'public/data/pipeline-model-selection.json'), 'utf8'));
const lock = JSON.parse(fs.readFileSync(path.join(root, 'public/data/simulatte-embedder/model-runtime-lock.json'), 'utf8'));

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
  };
}

test('one configuration binds both surfaces to exact lock-supported options', () => {
  assert.equal(api.validateConfig(config, lock), true);
  assert.deepEqual(config.surfaces.map((surface) => surface.id), ['autonomy', 'blank']);
  const configuredTierIds = new Set(config.options
    .filter((option) => option.runtimeRef.kind === 'classification-tier')
    .map((option) => option.runtimeRef.id));
  const browserTierIds = lock.classification.tiers
    .filter((tier) => tier.availability === 'browser-ready')
    .map((tier) => tier.id);
  assert.deepEqual([...configuredTierIds].sort(), browserTierIds.sort());
  assert.equal(config.options.some((option) => option.runtimeRef.id === 'deberta-small-nli-classifier'), false);
  assert.equal(config.options.some((option) => option.runtimeRef.id === 'minilm-nli-classifier'), false);
});

test('Blank defaults are explicit and selectable alternatives resolve to runtime identities', () => {
  const state = api.createState(config, lock, 'blank', memoryStorage());
  assert.equal(api.selectedOption(state, 'bounded-classification').id, 'multinomial-nb-tfidf-head');
  assert.equal(api.selectedOption(state, 'open-vocabulary-retrieval').id, 'deterministic-tfidf-retrieval');
  api.setSelection(state, 'bounded-classification', 'linear-svc-tfidf-head');
  const result = api.receipt(state);
  assert.equal(result.selections.find((row) => row.slotId === 'bounded-classification').runtimeRef.id, 'linear-svc-tfidf-head');
  assert.equal(result.modelRuntimeLock.number, 12);
});

test('Qwen label classification selects its required Qwen retrieval lane', () => {
  const state = api.createState(config, lock, 'blank', memoryStorage());
  api.setSelection(state, 'bounded-classification', 'qwen-embedding-classifier-control');
  assert.equal(api.selectedOption(state, 'open-vocabulary-retrieval').id, 'qwen-embedding-retrieval');
  assert.equal(api.receipt(state).selections.filter((row) => row.kind === 'embedding-model').length, 2);
  api.setSelection(state, 'open-vocabulary-retrieval', 'deterministic-tfidf-retrieval');
  assert.equal(api.selectedOption(state, 'bounded-classification').id, 'multinomial-nb-tfidf-head');
});

test('unsupported runtime tiers fail config validation', () => {
  const invalid = structuredClone(config);
  invalid.options.push({
    id: 'deberta-invalid',
    label: 'DeBERTa invalid',
    kind: 'compact-model',
    requiresConsent: true,
    runtimeRef: { kind: 'classification-tier', id: 'deberta-small-nli-classifier' },
  });
  assert.throws(() => api.validateConfig(invalid, lock), /unavailable tier/);
});
