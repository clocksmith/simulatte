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

test('application interactions expose governed seeds without presenting mission prose as input', () => {
  const profile = JSON.parse(fs.readFileSync(require.resolve('../public/data/application-profiles/cable-trader-pickup-v1.json'), 'utf8'));
  assert.equal(contracts.validateProfile(profile), profile);
  const interaction = interactionApi.resolveInteraction(profile, {});
  assert.equal(interaction.mode, 'playback');
  assert.equal(interaction.defaultScenario.id, 'july-baseline');
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
  assert.deepEqual(compiled.counts, { plugins: 1, markers: 1, paths: 1, actors: 1, areas: 0, suns: 0, cameraTargets: 1, geoMarkers: 0, geoPaths: 0, geoAreas: 0, choropleths: 0 });
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
  assert.deepEqual(solarCompiled.counts, { plugins: 1, markers: 0, paths: 0, actors: 0, areas: 1, suns: 1, cameraTargets: 1, geoMarkers: 0, geoPaths: 0, geoAreas: 0, choropleths: 0 });
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
  const focusSelect = { value: 'route' };
  const applied = experienceCameraApi.applyInitialCamera({
    configuration: profile.camera,
    renderer: {
      cameraTargets: () => [{ id: 'plugin:cable-trader:network' }],
      focusCameraTarget: (id) => calls.push(['focus', id]),
      setCameraMode: (mode) => calls.push(['mode', mode]),
    },
    focusSelect,
    onModeSelected: (mode) => calls.push(['selected', mode]),
  });
  assert.equal(applied, true);
  assert.equal(focusSelect.value, 'plugin:cable-trader:network');
  assert.deepEqual(calls, [['focus', 'plugin:cable-trader:network'], ['mode', 'top'], ['selected', 'top']]);
  assert.equal(experienceCameraApi.runCameraMode(null), 'follow');
});

test('platform bootstrap has no named plugin import', () => {
  const source = fs.readFileSync(require.resolve('../public/simulatte/platform/bootstrap/application-loader.js'), 'utf8');
  assert.doesNotMatch(source, /(?:require\(['"][^'"]*\/plugins\/|SimulatteCooperativeContracts)/);
});

test('Main exposes governed profile selection and disposes plugins on teardown', () => {
  const main = fs.readFileSync(require.resolve('../public/simulatte/app/main.js'), 'utf8');
  const html = fs.readFileSync(require.resolve('../public/index.html'), 'utf8');
  assert.match(html, /id="application-profile"/);
  assert.match(html, /id="application-profile-trigger"[^>]*aria-haspopup="listbox"/);
  assert.match(html, /id="application-profile-options"[^>]*role="listbox"/);
  assert.match(html, /id="application-profile-trigger" class="select-trigger"[^>]*aria-label="Switch experience"/);
  assert.doesNotMatch(html, /id="application-profile-trigger"[^>]*sim-surface/);
  assert.doesNotMatch(html, /id="application-profile-options"[^>]*sim-popover/);
  assert.doesNotMatch(main, /APPLICATION_PROFILE_IDS|\.label = 'Applications'|\.label = 'Plugins'/);
  assert.match(html, /app\/application-profile-select\.js/);
  assert.match(main, /await extensions\.dispose\(\)/);
  assert.match(main, /addEventListener\('pagehide', \(\) => \{ void disposeApplication\(\); \}/);
  assert.match(main, /searchParams\.set\('profile', profileId\)/);
});
