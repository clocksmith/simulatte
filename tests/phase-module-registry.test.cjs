const test = require('node:test');
const assert = require('node:assert/strict');

const registryPath = require.resolve('../public/blank/app/runtime/phase-module-registry.js');

function freshRegistry() {
  delete require.cache[registryPath];
  return require(registryPath);
}

test('phase module registry rejects duplicate export ownership', () => {
  const registry = freshRegistry();
  registry.define('visual', 'selection', { select: () => 'selection' });

  assert.throws(
    () => registry.define('visual', 'layout', { select: () => 'layout' }),
    /export collision.*visual\.select.*layout.*selection/
  );
  assert.equal(registry.ownerOf('visual', 'select'), 'selection');
});

test('phase module registry verifies required exports at finalization', () => {
  const registry = freshRegistry();
  registry.define('render', 'renderer', { create: () => ({}) });
  registry.requireExports('render', ['create', 'readPixels']);

  assert.throws(
    () => registry.finalize('render'),
    /missing required exports: readPixels/
  );
});

test('phase module registry returns one frozen finalized facade', () => {
  const registry = freshRegistry();
  const create = () => ({});
  registry.define('render', 'renderer', { create });

  const first = registry.finalize('render', { requiredExports: ['create'] });
  const second = registry.finalize('render');

  assert.equal(first, second);
  assert.equal(first.create, create);
  assert.equal(Object.isFrozen(first), true);
  assert.throws(
    () => registry.define('render', 'late-module', { late: true }),
    /already finalized/
  );
});
