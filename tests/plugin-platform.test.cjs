const test = require('node:test');
const assert = require('node:assert/strict');

const contracts = require('../public/platform/contracts/plugin-contracts.js');
const catalogApi = require('../public/platform/data-catalog/immutable-data-catalog.js');
const runtimeApi = require('../public/platform/plugin-host/plugin-runtime.js');

function manifest(overrides = {}) {
  return {
    schema: 'simulatte.pluginManifest.v1',
    id: 'fixture-plugin',
    version: '1.0.0',
    sdkVersion: 1,
    entry: { path: './index.js', integrity: `sha384-${'a'.repeat(96)}`, globalFactory: 'FixturePlugin' },
    permissions: ['receipts.append.v1', 'state.reduce.v1', 'events.propose.v1', 'ui.inspector.v1'],
    datasets: [{ id: 'fixture-data-v1', required: true }],
    provides: ['fixture.capability.v1'],
    consumes: [],
    extensionPoints: ['request', 'settlement', 'ui'],
    receiptSchemas: ['simulatte.plugin.fixtureReceipt.v1'],
    configSchema: './config.schema.json',
    defaultConfig: './default-config.json',
    ...overrides,
  };
}

test('plugin runtime activates a least-authority fixture, sequences state, contributes UI, and disposes', async () => {
  let disposed = false;
  const row = {
    manifest: manifest(),
    configs: { 'fixture-default-v1': { schema: 'fixture.config.v1', id: 'fixture-default-v1' } },
    factory: {
      async activate({ sdk }) {
        assert.deepEqual(Object.keys(sdk).sort(), ['datasets', 'events', 'pluginId', 'receipts', 'schema', 'sdkVersion', 'state', 'ui']);
        assert.equal(sdk.datasets.require('fixture-data-v1').answer, 42);
        sdk.state.register((state, event) => ({ count: state.count + event.amount }), { count: 0 });
        sdk.events.propose({ pluginId: 'fixture-plugin', kind: 'fixture-plugin.incremented', amount: 2 });
        sdk.receipts.append({ schema: 'simulatte.plugin.fixtureReceipt.v1', result: 'activated' });
        return {
          id: 'fixture-plugin',
          contributeRequest: () => ({ recognized: true, obligations: [] }),
          settle: () => ({ count: sdk.state.read().count }),
          view: () => ({ slot: 'inspector', title: 'Fixture', rows: [{ label: 'Count', value: '2' }], actions: [] }),
          dispose() { disposed = true; },
        };
      },
    },
  };
  const registry = { entry: (id) => id === 'fixture-plugin' ? row : null };
  const profile = { schema: 'simulatte.applicationProfile.v1', id: 'fixture-profile-v1', plugins: [{ id: 'fixture-plugin', configId: 'fixture-default-v1' }], routeObjective: { travelSeconds: 1 } };
  const dataCatalog = catalogApi.createDataCatalog([{ id: 'fixture-data-v1', value: { answer: 42 } }]);
  const runtime = await runtimeApi.createPluginRuntime({ registry, profile, dataCatalog, corePorts: { ui: Object.freeze({ slot: 'inspector' }) } });
  assert.deepEqual(runtime.activePluginIds, ['fixture-plugin']);
  assert.equal((await runtime.contributeRequest({ sourceText: 'test' }))[0].recognized, true);
  assert.equal((await runtime.settle({}))[0].count, 2);
  assert.equal(runtime.views({})[0].view.title, 'Fixture');
  assert.equal(runtime.runtimeReceipt().pluginReceipts.length, 1);
  await runtime.dispose();
  assert.equal(disposed, true);
});

test('plugin contracts reject undeclared authority and capability cycles fail before activation', async () => {
  assert.throws(() => contracts.validateManifest(manifest({ permissions: ['fetch.anything'] })), /plugin_permission_unknown/);
  const rows = new Map([
    ['alpha', { manifest: manifest({ id: 'alpha', provides: ['alpha.v1'], consumes: [{ id: 'beta.v1', required: true }] }), configs: { default: { id: 'default' } }, factory: { activate() { throw new Error('must not activate'); } } }],
    ['beta', { manifest: manifest({ id: 'beta', provides: ['beta.v1'], consumes: [{ id: 'alpha.v1', required: true }] }), configs: { default: { id: 'default' } }, factory: { activate() { throw new Error('must not activate'); } } }],
  ]);
  const profile = { schema: 'simulatte.applicationProfile.v1', id: 'cycle-v1', plugins: [{ id: 'alpha', configId: 'default' }, { id: 'beta', configId: 'default' }], routeObjective: {} };
  const dataCatalog = catalogApi.createDataCatalog([{ id: 'fixture-data-v1', value: {} }]);
  await assert.rejects(runtimeApi.createPluginRuntime({ registry: { entry: (id) => rows.get(id) }, profile, dataCatalog }), /plugin_capability_cycle/);
});
