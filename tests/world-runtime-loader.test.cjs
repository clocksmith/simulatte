const test = require('node:test');
const assert = require('node:assert/strict');

const manifest = require('../public/simulatte/app/world-runtime-script-manifest.js');
const registry = require('../public/simulatte/platform/plugin-host/generated-plugin-registry.js');

test('World runtime selections load only the chosen profile plugin bundle', async () => {
  const appended = [];
  const previousDocument = global.document;
  const previousBtoa = global.btoa;
  global.btoa = (value) => Buffer.from(value, 'binary').toString('base64');
  global.document = {
    baseURI: 'https://simulatte.test/',
    querySelector: () => ({ content: 'test-build' }),
    createElement: () => {
      const listeners = new Map();
      return {
        addEventListener(type, listener) { listeners.set(type, listener); },
        dispatch(type) { listeners.get(type)?.(); },
      };
    },
    head: {
      appendChild(script) {
        appended.push(script);
        queueMicrotask(() => script.dispatch('load'));
      },
    },
  };
  global.SimulatteWorldRuntimeScriptManifest = manifest;
  global.SimulatteGeneratedPluginRegistry = registry;
  delete require.cache[require.resolve('../public/simulatte/app/world-runtime-loader.js')];
  const loader = require('../public/simulatte/app/world-runtime-loader.js');

  try {
    const result = await loader.loadSelectedProduct({ profileId: 'food-recall-us-v1' });
    assert.deepEqual(result.pluginIds, ['food-recall-us']);
    assert.ok(result.scripts.every((path) => path.startsWith('shared/plugins/food-recall-us/')));
    assert.equal(appended.length, result.scripts.length);
    assert.ok(appended.every((script) => script.integrity.startsWith('sha384-')));
    assert.ok(appended.every((script) => script.crossOrigin === 'anonymous'));
    assert.ok(appended.every((script) => !script.src.includes('neural-place')));
  } finally {
    global.document = previousDocument;
    global.btoa = previousBtoa;
  }
});

test('World optional model scripts remain outside every pre-consent selection', () => {
  assert.equal(manifest.tierDefaultProfile.city, 'sun-walker-v1');
  assert.equal('simulatte-world-v1' in manifest.profilePlugins, false);
  assert.deepEqual(manifest.pluginIdsForSelection({ tierId: 'city' }), ['sun-walker']);
  for (const profileId of Object.keys(manifest.profilePlugins)) {
    const selected = manifest.forSelection({ profileId });
    assert.ok(manifest.stages.optionalModel.every((path) => !selected.includes(path)));
  }
  const consented = manifest.forSelection({ profileId: 'sun-walker-v1', includeOptionalModel: true });
  assert.ok(manifest.stages.optionalModel.every((path) => consented.includes(path)));
});

test('World dynamic runtime loader loads selected runtime scripts', async () => {
  const appended = [];
  const previousDocument = global.document;
  global.document = {
    baseURI: 'https://simulatte.test/',
    querySelector: () => ({ content: 'test-build' }),
    createElement: () => {
      const listeners = new Map();
      return {
        addEventListener(type, listener) { listeners.set(type, listener); },
        dispatch(type) { listeners.get(type)?.(); },
      };
    },
    head: {
      appendChild(script) {
        appended.push(script);
        queueMicrotask(() => script.dispatch('load'));
      },
    },
  };
  global.SimulatteWorldRuntimeScriptManifest = manifest;
  global.SimulatteGeneratedPluginRegistry = registry;
  delete require.cache[require.resolve('../public/simulatte/app/world-runtime-loader.js')];
  const loader = require('../public/simulatte/app/world-runtime-loader.js');

  try {
    const result = await loader.loadSelectedRuntime();
    assert.ok(Array.isArray(result.scripts));
    assert.equal(appended.length, result.scripts.length);
  } finally {
    global.document = previousDocument;
  }
});
