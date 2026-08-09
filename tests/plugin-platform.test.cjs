const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const contracts = require('../public/simulatte/platform/contracts/plugin-contracts.js');
const catalogApi = require('../public/simulatte/platform/data-catalog/immutable-data-catalog.js');
const runtimeApi = require('../public/simulatte/platform/plugin-host/plugin-runtime.js');
const presentationApi = require('../public/simulatte/app/plugin-presentation.js');
const experienceCameraApi = require('../public/simulatte/app/experience-camera.js');
const interactionApi = require('../public/simulatte/app/application-profile-select.js');

function manifest(overrides = {}) {
  return {
    schema: 'simulatte.pluginManifest.v1',
    id: 'fixture-plugin',
    version: '1.0.0',
    sdkVersion: 1,
    entry: { path: './index.js', integrity: `sha384-${'a'.repeat(96)}`, globalFactory: 'FixturePlugin' },
    resources: [
      { path: './config.schema.json', integrity: `sha384-${'b'.repeat(96)}` },
      { path: './default-config.json', integrity: `sha384-${'c'.repeat(96)}` },
    ],
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
          contributeRequest: () => ({ recognized: true, obligations: [], unresolved: [] }),
          settle: () => ({ obligationResults: [], stateIdentity: null, losses: [], count: sdk.state.read().count }),
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

test('data catalog lazily loads only declared hash-pinned shards and reuses the verified result', async () => {
  const reference = {
    id: 'fixture-region-a-v1',
    regionId: 'region-a',
    path: 'regions/region-a.json',
    schemaId: 'fixture.regionShard.v1',
    sha256: 'a'.repeat(64),
    byteCount: 42,
  };
  const calls = [];
  const dataCatalog = catalogApi.createDataCatalog([{
    id: 'fixture-index-v1',
    value: { id: 'fixture-index-v1', shards: [reference] },
    receipt: { sha256: 'b'.repeat(64) },
  }], {
    async loadShard(request) {
      calls.push(request);
      return {
        value: { id: reference.id, schema: reference.schemaId, rows: [1, 2, 3] },
        sha256: reference.sha256,
        receipt: { cacheMode: 'cold', transferredBytes: reference.byteCount },
      };
    },
  });
  const view = dataCatalog.createView([{ id: 'fixture-index-v1', required: true }]);
  const first = await view.loadShard('fixture-index-v1', 'region-a');
  const second = await view.loadShard('fixture-index-v1', reference.id);
  assert.equal(calls.length, 1);
  assert.equal(first, second);
  assert.equal(first.receipt.schema, 'simulatte.datasetShardLoadReceipt.v1');
  assert.equal(first.receipt.sha256, reference.sha256);
  await assert.rejects(
    view.loadShard('fixture-index-v1', 'region-b'),
    /data_catalog_shard_undeclared/
  );
  await assert.rejects(
    dataCatalog.createView([]).loadShard('fixture-index-v1', 'region-a'),
    /data_catalog_access_undeclared/
  );
});

test('application interactions expose governed seeds without presenting mission prose as input', () => {
  const profile = JSON.parse(fs.readFileSync(require.resolve('../public/data/application-profiles/cable-trader-pickup-v1.json'), 'utf8'));
  assert.equal(contracts.validateProfile(profile), profile);
  const interaction = interactionApi.resolveInteraction(profile, {});
  assert.equal(interaction.mode, 'playback');
  assert.equal(interaction.defaultScenario.id, 'everyday-exchange');
  assert.equal(interaction.scenarios.length, 4);
  assert.notEqual(interactionApi.nextScenario(interaction, interaction.defaultScenario.id).seed, interaction.defaultScenario.seed);
});

test('plugin runtime forwards scenario changes through the generic lifecycle', async () => {
  const seen = [];
  const row = {
    manifest: manifest({ extensionPoints: [] }),
    configs: { 'fixture-default-v1': { schema: 'fixture.config.v1', id: 'fixture-default-v1' } },
    factory: { async activate({ scenario }) { seen.push(scenario.seed); return { id: 'fixture-plugin', setScenario(next) { seen.push(next.seed); }, dispose() {} }; } },
  };
  const profile = { schema: 'simulatte.applicationProfile.v1', id: 'fixture-profile-v1', plugins: [{ id: 'fixture-plugin', configId: 'fixture-default-v1' }], routeObjective: {} };
  const dataCatalog = catalogApi.createDataCatalog([{ id: 'fixture-data-v1', value: { answer: 42 } }]);
  const runtime = await runtimeApi.createPluginRuntime({ registry: { entry: () => row }, profile, scenario: { seed: 'first' }, dataCatalog, corePorts: { ui: Object.freeze({ slot: 'inspector' }) } });
  await runtime.setScenario({ seed: 'second' });
  assert.deepEqual(seen, ['first', 'second']);
  assert.equal(runtime.runtimeReceipt().scenario.seed, 'second');
});

test('plugin runtime clones action and capability results before exposing them', async () => {
  const pluginOutput = { nested: { value: 'original' } };
  const row = {
    manifest: manifest({ extensionPoints: [] }),
    configs: { 'fixture-default-v1': { id: 'fixture-default-v1' } },
    factory: {
      async activate() {
        return {
          id: 'fixture-plugin',
          capabilities: { 'fixture.capability.v1': () => pluginOutput },
          handleAction: () => pluginOutput,
        };
      },
    },
  };
  const profile = { schema: 'simulatte.applicationProfile.v1', id: 'immutable-plugin-output-v1', plugins: [{ id: 'fixture-plugin', configId: 'fixture-default-v1' }], routeObjective: {} };
  const dataCatalog = catalogApi.createDataCatalog([{ id: 'fixture-data-v1', value: {} }]);
  const runtime = await runtimeApi.createPluginRuntime({ registry: { entry: () => row }, profile, dataCatalog, corePorts: { ui: Object.freeze({ slot: 'inspector' }) } });
  const capabilityResult = runtime.invoke('fixture.capability.v1', {});
  const actionResult = await runtime.dispatchAction('fixture-plugin', 'fixture.action', {});
  pluginOutput.nested.value = 'mutated-by-plugin';
  assert.equal(capabilityResult.nested.value, 'original');
  assert.equal(actionResult.nested.value, 'original');
  assert.equal(Object.isFrozen(capabilityResult.nested), true);
  assert.equal(Object.isFrozen(actionResult.nested), true);
});

test('plugin runtime disposes activated plugins when a later activation fails', async () => {
  let alphaDisposed = 0;
  const rows = new Map([
    ['alpha', {
      manifest: manifest({ id: 'alpha', extensionPoints: [], provides: [] }),
      configs: { default: { id: 'default' } },
      factory: { async activate() { return { id: 'alpha', dispose() { alphaDisposed += 1; } }; } },
    }],
    ['beta', {
      manifest: manifest({ id: 'beta', extensionPoints: [], provides: [] }),
      configs: { default: { id: 'default' } },
      factory: { async activate() { throw new Error('beta activation failed'); } },
    }],
  ]);
  const profile = { schema: 'simulatte.applicationProfile.v1', id: 'activation-cleanup-v1', plugins: [{ id: 'alpha', configId: 'default' }, { id: 'beta', configId: 'default' }], routeObjective: {} };
  const dataCatalog = catalogApi.createDataCatalog([{ id: 'fixture-data-v1', value: {} }]);
  await assert.rejects(runtimeApi.createPluginRuntime({ registry: { entry: (id) => rows.get(id) }, profile, dataCatalog, corePorts: { ui: Object.freeze({ slot: 'inspector' }) } }), /beta activation failed/);
  assert.equal(alphaDisposed, 1);
});

test('plugin runtime disposes every plugin and reports disposal failures', async () => {
  const calls = [];
  const rows = new Map(['alpha', 'beta'].map((id) => [id, {
    manifest: manifest({ id, extensionPoints: [], provides: [] }),
    configs: { default: { id: 'default' } },
    factory: {
      async activate() {
        return {
          id,
          dispose() {
            calls.push(id);
            if (id === 'beta') throw new Error('beta disposal failed');
          },
        };
      },
    },
  }]));
  const profile = { schema: 'simulatte.applicationProfile.v1', id: 'dispose-all-v1', plugins: [{ id: 'alpha', configId: 'default' }, { id: 'beta', configId: 'default' }], routeObjective: {} };
  const dataCatalog = catalogApi.createDataCatalog([{ id: 'fixture-data-v1', value: {} }]);
  const runtime = await runtimeApi.createPluginRuntime({ registry: { entry: (id) => rows.get(id) }, profile, dataCatalog, corePorts: { ui: Object.freeze({ slot: 'inspector' }) } });
  await assert.rejects(runtime.dispose(), (error) => error.code === 'plugin_runtime_dispose_failed');
  assert.deepEqual(calls, ['beta', 'alpha']);
});

test('plugin runtime owns an immutable scenario snapshot', async () => {
  const sourceScenario = { id: 'source', seed: 'original' };
  const row = {
    manifest: manifest({ extensionPoints: [] }),
    configs: { 'fixture-default-v1': { id: 'fixture-default-v1' } },
    factory: { async activate() { return { id: 'fixture-plugin' }; } },
  };
  const profile = { schema: 'simulatte.applicationProfile.v1', id: 'scenario-snapshot-v1', plugins: [{ id: 'fixture-plugin', configId: 'fixture-default-v1' }], routeObjective: {} };
  const dataCatalog = catalogApi.createDataCatalog([{ id: 'fixture-data-v1', value: {} }]);
  const runtime = await runtimeApi.createPluginRuntime({ registry: { entry: () => row }, profile, scenario: sourceScenario, dataCatalog, corePorts: { ui: Object.freeze({ slot: 'inspector' }) } });
  sourceScenario.seed = 'mutated-outside-runtime';
  assert.equal(runtime.runtimeReceipt().scenario.seed, 'original');
});

test('plugin runtime rolls back applied scenario changes after a plugin rejects one', async () => {
  const alphaScenarios = [];
  const betaScenarios = [];
  const rows = new Map([
    ['alpha', {
      manifest: manifest({ id: 'alpha', extensionPoints: [], provides: [] }),
      configs: { default: { id: 'default' } },
      factory: { async activate() { return { id: 'alpha', setScenario(next) { alphaScenarios.push(next.seed); } }; } },
    }],
    ['beta', {
      manifest: manifest({ id: 'beta', extensionPoints: [], provides: [] }),
      configs: { default: { id: 'default' } },
      factory: { async activate() { return { id: 'beta', setScenario(next) { betaScenarios.push(next.seed); if (next.seed === 'rejected') throw new Error('scenario rejected'); } }; } },
    }],
  ]);
  const profile = { schema: 'simulatte.applicationProfile.v1', id: 'scenario-rollback-v1', plugins: [{ id: 'alpha', configId: 'default' }, { id: 'beta', configId: 'default' }], routeObjective: {} };
  const dataCatalog = catalogApi.createDataCatalog([{ id: 'fixture-data-v1', value: {} }]);
  const runtime = await runtimeApi.createPluginRuntime({ registry: { entry: (id) => rows.get(id) }, profile, scenario: { seed: 'accepted' }, dataCatalog, corePorts: { ui: Object.freeze({ slot: 'inspector' }) } });
  await assert.rejects(runtime.setScenario({ seed: 'rejected' }), /scenario rejected/);
  assert.deepEqual(alphaScenarios, ['rejected', 'accepted']);
  assert.deepEqual(betaScenarios, ['rejected', 'accepted']);
  assert.equal(runtime.runtimeReceipt().scenario.seed, 'accepted');
});

test('plugin runtime serializes overlapping scenario changes', async () => {
  let releaseFirst;
  const firstScenarioGate = new Promise((resolve) => { releaseFirst = resolve; });
  const seen = [];
  const row = {
    manifest: manifest({ extensionPoints: [] }),
    configs: { 'fixture-default-v1': { id: 'fixture-default-v1' } },
    factory: {
      async activate() {
        return {
          id: 'fixture-plugin',
          async setScenario(next) {
            seen.push(`${next.seed}:start`);
            if (next.seed === 'first') await firstScenarioGate;
            seen.push(`${next.seed}:end`);
          },
        };
      },
    },
  };
  const profile = { schema: 'simulatte.applicationProfile.v1', id: 'scenario-queue-v1', plugins: [{ id: 'fixture-plugin', configId: 'fixture-default-v1' }], routeObjective: {} };
  const dataCatalog = catalogApi.createDataCatalog([{ id: 'fixture-data-v1', value: {} }]);
  const runtime = await runtimeApi.createPluginRuntime({ registry: { entry: () => row }, profile, scenario: { seed: 'initial' }, dataCatalog, corePorts: { ui: Object.freeze({ slot: 'inspector' }) } });
  const first = runtime.setScenario({ seed: 'first' });
  await Promise.resolve();
  const second = runtime.setScenario({ seed: 'second' });
  releaseFirst();
  await Promise.all([first, second]);
  assert.deepEqual(seen, ['first:start', 'first:end', 'second:start', 'second:end']);
  assert.equal(runtime.runtimeReceipt().scenario.seed, 'second');
});

test('plugin runtime rejects public work after disposal instead of reading cleared instances', async () => {
  const row = {
    manifest: manifest({ extensionPoints: [] }),
    configs: { 'fixture-default-v1': { id: 'fixture-default-v1' } },
    factory: { async activate() { return { id: 'fixture-plugin', dispose() {} }; } },
  };
  const profile = { schema: 'simulatte.applicationProfile.v1', id: 'disposed-runtime-v1', plugins: [{ id: 'fixture-plugin', configId: 'fixture-default-v1' }], routeObjective: {} };
  const dataCatalog = catalogApi.createDataCatalog([{ id: 'fixture-data-v1', value: {} }]);
  const runtime = await runtimeApi.createPluginRuntime({ registry: { entry: () => row }, profile, scenario: { seed: 'initial' }, dataCatalog, corePorts: { ui: Object.freeze({ slot: 'inspector' }) } });
  await runtime.dispose();
  assert.throws(() => runtime.views({}), (error) => error.code === 'plugin_runtime_disposed');
  await assert.rejects(runtime.setScenario({ seed: 'phantom' }), (error) => error.code === 'plugin_runtime_disposed');
  assert.equal(runtime.runtimeReceipt().scenario.seed, 'initial');
});

test('plugin runtime disposal is idempotent for overlapping callers', async () => {
  let disposeCalls = 0;
  const row = {
    manifest: manifest({ extensionPoints: [] }),
    configs: { 'fixture-default-v1': { id: 'fixture-default-v1' } },
    factory: { async activate() { return { id: 'fixture-plugin', async dispose() { disposeCalls += 1; } }; } },
  };
  const profile = { schema: 'simulatte.applicationProfile.v1', id: 'idempotent-dispose-v1', plugins: [{ id: 'fixture-plugin', configId: 'fixture-default-v1' }], routeObjective: {} };
  const dataCatalog = catalogApi.createDataCatalog([{ id: 'fixture-data-v1', value: {} }]);
  const runtime = await runtimeApi.createPluginRuntime({ registry: { entry: () => row }, profile, dataCatalog, corePorts: { ui: Object.freeze({ slot: 'inspector' }) } });
  await Promise.all([runtime.dispose(), runtime.dispose()]);
  assert.equal(disposeCalls, 1);
});

test('plugin runtime completes queued scenario work before disposal closes plugins', async () => {
  let releaseScenario;
  let markScenarioStart;
  const scenarioStarted = new Promise((resolve) => { markScenarioStart = resolve; });
  const scenarioGate = new Promise((resolve) => { releaseScenario = resolve; });
  const calls = [];
  const row = {
    manifest: manifest({ extensionPoints: [] }),
    configs: { 'fixture-default-v1': { id: 'fixture-default-v1' } },
    factory: {
      async activate() {
        return {
          id: 'fixture-plugin',
          async setScenario(next) {
            calls.push(`scenario:${next.seed}:start`);
            markScenarioStart();
            await scenarioGate;
            calls.push(`scenario:${next.seed}:end`);
          },
          dispose() { calls.push('dispose'); },
        };
      },
    },
  };
  const profile = { schema: 'simulatte.applicationProfile.v1', id: 'dispose-after-scenario-v1', plugins: [{ id: 'fixture-plugin', configId: 'fixture-default-v1' }], routeObjective: {} };
  const dataCatalog = catalogApi.createDataCatalog([{ id: 'fixture-data-v1', value: {} }]);
  const runtime = await runtimeApi.createPluginRuntime({ registry: { entry: () => row }, profile, dataCatalog, corePorts: { ui: Object.freeze({ slot: 'inspector' }) } });
  const setting = runtime.setScenario({ seed: 'queued' });
  await scenarioStarted;
  const disposing = runtime.dispose();
  await assert.rejects(runtime.setScenario({ seed: 'after-dispose' }), (error) => error.code === 'plugin_runtime_disposed');
  assert.deepEqual(calls, ['scenario:queued:start']);
  releaseScenario();
  await Promise.all([setting, disposing]);
  assert.deepEqual(calls, ['scenario:queued:start', 'scenario:queued:end', 'dispose']);
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

test('request contributions reject fields outside the versioned host contract', () => {
  const valid = {
    recognized: true,
    obligations: [{ id: 'fixture-plugin:result', kind: 'fixture_result', required: true }],
    unresolved: [],
    executableSourceText: 'Walk from A to B',
    missionPatch: { routeOverride: { segmentIds: ['segment-a'], selectionId: 'selection-a', objective: 4, algorithm: 'fixture_v1' } },
  };
  assert.equal(contracts.validateRequestContribution('fixture-plugin', valid), valid);
  assert.throws(
    () => contracts.validateRequestContribution('fixture-plugin', { ...valid, privatePayload: { accepted: true } }),
    /plugin_contract_keys_invalid/
  );
});

test('plugin UI contract reserves map overlays for interaction and rejects duplicate HUD surfaces', () => {
  const contribution = { slot: 'hud', title: 'Truth boundary', rows: [], actions: [] };
  assert.throws(
    () => contracts.validateUiContribution('fixture-plugin', contribution),
    /plugin_ui_slot_invalid/
  );
});

test('legacy numeric UI fields retain finite bounds for v4 normalization', () => {
  const contribution = {
    slot: 'inspector',
    title: 'Bounded parameters',
    rows: [],
    fields: [{
      id: 'cargo',
      label: 'Cargo',
      type: 'number',
      value: 4000,
      minimum: 100,
      maximum: 24000,
      step: 100,
    }],
    actions: [],
  };
  assert.equal(contracts.validateUiContribution('fixture-plugin', contribution), contribution);
  assert.throws(
    () => contracts.validateUiContribution('fixture-plugin', {
      ...contribution,
      fields: [{
        id: 'policy',
        label: 'Policy',
        type: 'select',
        value: 'fast',
        minimum: 0,
        options: [{ value: 'fast', label: 'Fast' }],
      }],
    }),
    /plugin_ui_field_bounds_unexpected/
  );
});

test('plugin presentation is validated and compiled into namespaced renderer data', () => {
  const contribution = {
    schema: 'simulatte.pluginPresentation.v1',
    markers: [{ id: 'hub', label: 'Hub', nodeId: 'node-a', tone: 'amber', heightM: 32, radiusM: 3, intensity: 1.2 }],
    paths: [{ id: 'journey', label: 'Journey', segmentIds: ['segment-a'], tone: 'cyan', widthM: 4, intensity: 1 }],
    actors: [{ id: 'carrier', label: 'Carrier', kind: 'bicycle', segmentIds: ['segment-a'], tone: 'green', speedMps: 5, phaseOffsetM: 2, isSelected: true }],
    cameraTargets: [{ id: 'network', label: 'Network', nodeIds: ['node-a'], segmentIds: ['segment-a'], distanceM: 700 }],
  };
  assert.equal(contracts.validatePresentationContribution('fixture-plugin', contribution), contribution);
  const worldModel = {
    node: (id) => id === 'node-a' ? { position: { x: 4, y: 8 } } : null,
    segment: (id) => id === 'segment-a' ? { geometry: [{ x: 4, y: 8 }, { x: 14, y: 18 }] } : null,
  };
  const compiled = presentationApi.compile([{ pluginId: 'fixture-plugin', presentation: contribution }], worldModel);
  assert.equal(compiled.markers[0].id, 'plugin:fixture-plugin:hub');
  assert.equal(compiled.actors[0].points.length, 2);
  assert.equal(compiled.cameraTargets[0].kind, 'plugin');
  assert.deepEqual(compiled.counts, { plugins: 1, markers: 1, paths: 1, actors: 1, areas: 0, suns: 0, cameraTargets: 1, geoMarkers: 0, geoPaths: 0, geoAreas: 0, choropleths: 0, labels: 0 });
  assert.throws(() => contracts.validatePresentationContribution('fixture-plugin', { ...contribution, actors: [{ ...contribution.actors[0], kind: 'spaceship' }] }), /plugin_actor_kind_invalid/);

  const solar = {
    schema: 'simulatte.pluginPresentation.v2',
    markers: [],
    paths: [],
    actors: [],
    areas: [{ id: 'shadow', label: 'Building shadow', points: [{ x: 4, y: 8 }, { x: 14, y: 8 }, { x: 14, y: 18 }], tone: 'shade', heightM: 0.72, intensity: 0.08 }],
    sun: { id: 'sun', label: 'Modeled sun', azimuthDegrees: 140, elevationDegrees: 62, anchorSegmentIds: ['segment-a'], distanceM: 420, radiusM: 24, intensity: 2 },
    cameraTargets: [{ id: 'shade', label: 'Shade', nodeIds: [], segmentIds: ['segment-a'], distanceM: 880 }],
  };
  contracts.validatePresentationContribution('fixture-plugin', solar);
  const solarCompiled = presentationApi.compile([{ pluginId: 'fixture-plugin', presentation: solar }], worldModel);
  assert.equal(solarCompiled.areas.length, 1);
  assert.equal(solarCompiled.sun.pluginId, 'fixture-plugin');
  assert.equal(solarCompiled.sun.directionToSun.length, 3);
  assert.deepEqual(solarCompiled.counts, { plugins: 1, markers: 0, paths: 0, actors: 0, areas: 1, suns: 1, cameraTargets: 1, geoMarkers: 0, geoPaths: 0, geoAreas: 0, choropleths: 0, labels: 0 });
});

test('experience camera configuration targets only an active plugin', () => {
  const profile = {
    schema: 'simulatte.applicationProfile.v1',
    id: 'cable-experience-v1',
    plugins: [{ id: 'cable-trader', configId: 'default' }],
    routeObjective: { travelSeconds: 1 },
    camera: { initialMode: 'top', runMode: 'top', pluginId: 'cable-trader', targetId: 'network' },
  };
  assert.equal(contracts.validateProfile(profile), profile);
  assert.throws(() => contracts.validateProfile({ ...profile, camera: { ...profile.camera, pluginId: 'sun-walker' } }), /application_profile_camera_plugin_inactive/);
  const calls = [];
  const applied = experienceCameraApi.applyInitialCamera({
    configuration: profile.camera,
    renderer: {
      cameraTargets: () => [{ id: 'plugin:cable-trader:network' }],
      focusCameraTarget: (id) => calls.push(['focus', id]),
      setCameraMode: (mode) => calls.push(['mode', mode]),
    },
    onModeSelected: (mode) => calls.push(['selected', mode]),
  });
  assert.equal(applied, true);
  assert.deepEqual(calls, [['focus', 'plugin:cable-trader:network'], ['mode', 'top'], ['selected', 'top']]);
  assert.equal(experienceCameraApi.runCameraMode(null), 'follow');
  assert.equal(experienceCameraApi.runCameraMode({ runMode: 'bird' }), 'overview');
});

test('application profiles declare when plugin evidence owns the visible world detail', () => {
  const profile = require('../public/data/application-profiles/nyc-development-atlas-v1.json');
  const bulkProfile = require('../public/data/application-profiles/neighborhood-bulk-pool-v1.json');
  assert.equal(contracts.validateProfile(profile), profile);
  assert.equal(contracts.validateProfile(bulkProfile), bulkProfile);
  assert.equal(profile.experience.worldDetail, 'plugin-owned');
  assert.equal(bulkProfile.experience.worldDetail, 'plugin-owned');
  assert.deepEqual(profile.experience.performanceBudget, {
    firstMeaningfulFrameMs: 250,
    p95FrameMs: 350,
    peakHeapMiB: 192,
  });
  assert.throws(
    () => contracts.validateProfile({
      ...profile,
      experience: { ...profile.experience, worldDetail: 'approximate' },
    }),
    /application_profile_experience_world_detail_invalid/
  );
  assert.throws(
    () => contracts.validateProfile({
      ...profile,
      experience: { ...profile.experience, performanceBudget: { ...profile.experience.performanceBudget, p95FrameMs: 0 } },
    }),
    /application_profile_experience_performance_budget_invalid/
  );
});

test('every connected application profile declares an explicit performance budget', () => {
  const expectedBudgets = {
    'asteroid-defense-v1': [2250, 4250, 192],
    'cable-trader-pickup-v1': [250, 750, 480],
    'food-recall-us-v1': [250, 250, 64],
    'grid-resilience-us-v1': [250, 250, 96],
    'interstellar-relay-network-v1': [250, 250, 64],
    'maritime-trade-global-v1': [250, 250, 96],
    'neighborhood-bulk-pool-v1': [250, 250, 448],
    'nyc-development-atlas-v1': [250, 350, 192],
    'orbital-transfer-planner-v1': [500, 500, 96],
    'subsea-network-global-v1': [500, 500, 64],
    'sun-walker-v1': [750, 1750, 512],
  };
  for (const [profileId, [firstMeaningfulFrameMs, p95FrameMs, peakHeapMiB]] of Object.entries(expectedBudgets)) {
    const profile = require(`../public/data/application-profiles/${profileId}.json`);
    assert.equal(contracts.validateProfile(profile), profile);
    assert.deepEqual(profile.experience.performanceBudget, {
      firstMeaningfulFrameMs,
      p95FrameMs,
      peakHeapMiB,
    });
  }
});

test('platform bootstrap has no named plugin import', () => {
  const source = fs.readFileSync(require.resolve('../public/simulatte/platform/bootstrap/application-loader.js'), 'utf8');
  assert.doesNotMatch(source, /(?:require\(['"][^'"]*\/plugins\/|SimulatteCooperativeContracts)/);
});

test('Main exposes governed profile selection and disposes plugins on teardown', () => {
  const main = fs.readFileSync(require.resolve('../public/simulatte/app/main.js'), 'utf8');
  const support = fs.readFileSync(require.resolve('../public/simulatte/app/main-support.js'), 'utf8');
  const html = fs.readFileSync(require.resolve('../public/index.html'), 'utf8');
  const styles = fs.readFileSync(require.resolve('../public/styles.css'), 'utf8');
  assert.match(html, /id="application-profile"/);
  assert.match(html, /id="application-profile-trigger"[^>]*aria-haspopup="listbox"/);
  assert.match(html, /id="application-profile-options"[^>]*role="listbox"/);
  assert.match(html, /id="application-profile-trigger" class="select-trigger"[^>]*aria-label="Switch experience"/);
  assert.doesNotMatch(html, /id="application-profile-trigger"[^>]*sim-surface/);
  assert.doesNotMatch(html, /id="application-profile-options"[^>]*sim-popover/);
  assert.doesNotMatch(styles, /\.world-explorer \.mission-dock/);
  assert.doesNotMatch(styles, /\.world-explorer #decisions-button/);
  assert.doesNotMatch(html, /plugin-hud-ui/);
  assert.doesNotMatch(styles, /plugin-hud/);
  assert.doesNotMatch(main, /pluginHudUi/);
  assert.match(html, /id="decisions-button"[^>]*>Controls<\/button>/);
  assert.ok(
    html.indexOf('id="plugin-inspector"') < html.indexOf('id="journey-section"'),
    'experiment controls must precede generic journey evidence'
  );
  assert.doesNotMatch(main, /APPLICATION_PROFILE_IDS|\.label = 'Applications'|\.label = 'Plugins'/);
  assert.match(html, /app\/application-profile-select\.js/);
  assert.match(main, /resource:\s*'plugin-runtime'/);
  assert.match(main, /resource:\s*'plugin-ui'/);
  assert.match(main, /mountLifecycleApi\.disposeAll/);
  assert.match(support, /on\(window, 'pagehide', \(\) => \{ void dispose\(\); \}/);
  assert.match(main, /navigate:\s*hooks\.navigate/);
  assert.match(support, /navigate\?\.\(\{ tier: 'city', experience: profileId \}\)/);
  assert.ok(
    main.indexOf('experienceCameraApi.applyInitialCamera') < main.indexOf('pluginViewRuntime.sync'),
    'the declarative View Director must arbitrate after legacy profile camera initialization'
  );
});
