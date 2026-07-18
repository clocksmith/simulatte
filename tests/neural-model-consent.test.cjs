const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const consent = require('../public/neural-model-consent.js');
const lock = JSON.parse(fs.readFileSync(path.join(root, 'public/data/simulatte-embedder/model-runtime-lock.json'), 'utf8'));

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

test('neural consent summary binds only enabled Qwen models and Doppler', () => {
  const bundle = consent.summarizeLock(lock);
  assert.equal(bundle.embedding.id, lock.embedding.id);
  assert.equal(bundle.reranker, null);
  assert.equal(bundle.embedding.bytes, 558475264);
  assert.equal(bundle.totalBytes, 558475264);
  assert.match(bundle.identity, /0\.4\.9/);
  assert.equal(bundle.embedding.size, '533 MB');
});

test('consent is exact-lock-bound and revocable', () => {
  const storage = memoryStorage();
  const bundle = consent.summarizeLock(lock);
  assert.equal(consent.readGrant(storage, bundle), false);
  consent.writeGrant(storage, bundle);
  assert.equal(consent.readGrant(storage, bundle), true);
  assert.equal(consent.readGrant(storage, { ...bundle, identity: `${bundle.identity}:changed` }), false);
  consent.revokeGrant(storage);
  assert.equal(consent.readGrant(storage, bundle), false);
});

test('invalid runtime locks fail closed', () => {
  assert.throws(() => consent.summarizeLock({ schema: 'simulatte.modelRuntimeLock.v1' }), /missing the pinned Qwen embedding identity/);
  assert.throws(() => consent.summarizeLock({ schema: 'wrong' }), /Invalid Simulatte model runtime lock/);
});
