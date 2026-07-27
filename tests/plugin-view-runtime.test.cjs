const assert = require('node:assert/strict');
const test = require('node:test');

const viewRuntimeApi = require('../public/simulatte/app/plugin-view-runtime.js');
const contracts = require('../public/simulatte/platform/contracts/plugin-v4-contracts.js');
const provenanceRegistry = require('../public/simulatte/platform/runtime/provenance-registry.js');

function contribution(pluginId, mode = 'overview', targetId = 'route') {
  return {
    pluginId,
    presentation: {
      viewIntents: [{
        schema: 'simulatte.viewIntent.v4',
        id: 'active-view',
        mode,
        targetIds: [targetId],
        reasonEventId: null,
        priority: 50,
        transition: 'ease',
      }],
    },
  };
}

function provenanceReceipt(pluginId, targetIds = ['route']) {
  const provenance = contracts.createProvenance({
    origin: 'simulated',
    temporalStatus: 'forecast',
    uncertainty: { kind: 'missing', value: { reason: 'test fixture uncertainty' } },
    evidenceRefs: [{
      id: `${pluginId}:model`,
      datasetId: `${pluginId}:dataset`,
      contentHash: 'a'.repeat(64),
    }],
  });
  const envelope = contracts.createProvenanceEnvelope({
    subjectId: `${pluginId}:model`,
    subjectKind: 'model',
    axes: {
      origin: 'simulated',
      temporalStatus: 'forecast',
      uncertainty: { kind: 'missing', value: { reason: 'test fixture uncertainty' } },
    },
    datasetIds: [`${pluginId}:dataset`],
    artifactSha256: 'a'.repeat(64),
    parentIds: [],
    scenarioEpoch: 'scenario:fixture',
    contentVersion: 'fixture-v1',
    license: { required: false, identifier: null },
  });
  return provenanceRegistry.createContributionProvenanceReceipt({
    schema: 'simulatte.pluginContribution.v4',
    pluginId,
    presentation: {
      schema: 'simulatte.pluginPresentation.v4',
      pluginId,
      coordinateSystem: 'local-m',
      epoch: null,
      layers: targetIds.map((targetId) => ({
        id: targetId,
        kind: 'point',
        label: targetId,
        geometry: { kind: 'point', coordinateSystem: 'local-m', coordinates: [[0, 0]] },
        quantity: null,
        role: 'primary',
        importance: 1,
        aggregationKey: null,
        temporal: null,
        provenance,
      })),
      viewIntents: [],
    },
    events: [],
    controls: { schema: 'simulatte.pluginControls.v4', controls: [], comparisons: [] },
    state: null,
    inspections: [],
    provenanceRecords: [{
      schema: 'simulatte.provenanceRecord.v4',
      id: `${pluginId}:model`,
      kind: 'model',
      datasetId: `${pluginId}:dataset`,
      contentHash: 'a'.repeat(64),
      parentIds: [],
      metadata: {},
      envelope,
    }],
  });
}

test('plugin view runtime applies declarative intents through renderer-owned camera targets', () => {
  const calls = [];
  const focusSelect = { value: '' };
  const coordinator = viewRuntimeApi.createCoordinator({
    renderer: {
      cameraTargets: () => [
        { id: 'plugin:fixture:active-view' },
        { id: 'plugin:fixture:route' },
      ],
      focusCameraTarget: (id) => calls.push(['focus', id]),
      setCameraMode: (mode) => calls.push(['mode', mode]),
    },
    focusSelect,
    onModeSelected: (mode) => calls.push(['selected', mode]),
  });
  const receipt = coordinator.sync([contribution('fixture')], [provenanceReceipt('fixture')]);
  assert.equal(receipt.state.decision.intentId, 'fixture:active-view');
  assert.deepEqual(receipt.provenance.resolvedTargetIds, ['route']);
  assert.equal(focusSelect.value, 'plugin:fixture:active-view');
  assert.deepEqual(calls, [
    ['focus', 'plugin:fixture:active-view'],
    ['mode', 'bird'],
    ['selected', 'bird'],
  ]);
});

test('overview frames the aggregate intent while follow targets the active subject', () => {
  const calls = [];
  const coordinator = viewRuntimeApi.createCoordinator({
    renderer: {
      cameraTargets: () => [
        { id: 'plugin:fixture:active-view' },
        { id: 'plugin:fixture:route' },
      ],
      focusCameraTarget: (id) => calls.push(['focus', id]),
      setCameraMode: (mode) => calls.push(['mode', mode]),
    },
  });
  coordinator.sync([contribution('fixture', 'overview')], [provenanceReceipt('fixture')]);
  coordinator.sync([contribution('fixture', 'follow')], [provenanceReceipt('fixture')]);
  assert.deepEqual(calls, [
    ['focus', 'plugin:fixture:active-view'],
    ['mode', 'bird'],
    ['focus', 'plugin:fixture:route'],
    ['mode', 'follow'],
  ]);
});

test('POV intents remain distinct from elevated follow navigation', () => {
  const calls = [];
  const coordinator = viewRuntimeApi.createCoordinator({
    renderer: {
      cameraTargets: () => [
        { id: 'plugin:fixture:active-view' },
        { id: 'plugin:fixture:route' },
      ],
      focusCameraTarget: (id) => calls.push(['focus', id]),
      setCameraMode: (mode) => calls.push(['mode', mode]),
    },
  });
  coordinator.sync([contribution('fixture', 'pov')], [provenanceReceipt('fixture')]);
  assert.deepEqual(calls, [
    ['focus', 'plugin:fixture:route'],
    ['mode', 'pov'],
  ]);
});

test('synchronization reapplies an unchanged semantic decision after renderer state refresh', () => {
  const calls = [];
  const camera = { mode: 'bird', focusId: 'route' };
  const coordinator = viewRuntimeApi.createCoordinator({
    renderer: {
      cameraTargets: () => [
        { id: 'plugin:fixture:active-view' },
        { id: 'plugin:fixture:route' },
      ],
      focusCameraTarget: (id) => {
        camera.focusId = id;
        calls.push(['focus', id]);
      },
      setCameraMode: (mode) => {
        camera.mode = mode;
        calls.push(['mode', mode]);
      },
      cameraState: () => ({ ...camera }),
    },
  });
  const active = contribution('fixture', 'overview');
  const provenance = provenanceReceipt('fixture');
  coordinator.sync([active], [provenance]);
  camera.focusId = 'route';
  coordinator.sync([active], [provenance]);
  assert.deepEqual(calls, [
    ['focus', 'plugin:fixture:active-view'],
    ['focus', 'plugin:fixture:active-view'],
  ]);
});

test('manual camera authority persists while domain intents continue changing', () => {
  const calls = [];
  const coordinator = viewRuntimeApi.createCoordinator({
    renderer: {
      cameraTargets: () => [{ id: 'plugin:fixture:route' }],
      focusCameraTarget: (id) => calls.push(['focus', id]),
      setCameraMode: (mode) => calls.push(['mode', mode]),
    },
  });
  coordinator.sync([contribution('fixture')]);
  coordinator.setManualOverride({ mode: 'free', targetIds: [] });
  calls.length = 0;
  coordinator.sync([contribution('fixture', 'follow')]);
  assert.equal(coordinator.hasManualOverride(), true);
  assert.deepEqual(calls, []);
  coordinator.releaseManualOverride();
  assert.deepEqual(calls, [
    ['focus', 'plugin:fixture:route'],
    ['mode', 'follow'],
  ]);
});

test('renderer bird and top controls become semantic overview overrides', () => {
  const coordinator = viewRuntimeApi.createCoordinator({
    renderer: {
      cameraTargets: () => [],
      focusCameraTarget() {},
      setCameraMode() {},
    },
  });
  assert.equal(coordinator.setManualOverride({ mode: 'bird' }).decision.mode, 'overview');
  assert.equal(coordinator.setManualOverride({ mode: 'top' }).decision.mode, 'overview');
});

test('same-named intents from different plugins remain independently addressable', () => {
  const coordinator = viewRuntimeApi.createCoordinator({
    renderer: {
      cameraTargets: () => [
        { id: 'plugin:alpha:route' },
        { id: 'plugin:beta:route' },
      ],
      focusCameraTarget() {},
      setCameraMode() {},
    },
  });
  const receipt = coordinator.sync([
    contribution('alpha'),
    contribution('beta', 'compare'),
  ], [
    provenanceReceipt('alpha'),
    provenanceReceipt('beta'),
  ]);
  assert.deepEqual(
    receipt.candidates.map((row) => row.id).sort(),
    ['alpha:active-view', 'beta:active-view']
  );
});

test('plugin view runtime rejects camera targets without canonical provenance', () => {
  const coordinator = viewRuntimeApi.createCoordinator({
    renderer: {
      cameraTargets: () => [],
      focusCameraTarget() {},
      setCameraMode() {},
    },
  });
  assert.throws(
    () => coordinator.sync([contribution('fixture', 'overview', 'unbound')], [provenanceReceipt('fixture')]),
    { code: 'view_director_target_provenance_missing' },
  );
});
