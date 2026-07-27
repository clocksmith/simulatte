const assert = require('node:assert/strict');
const test = require('node:test');

const camera = require('../public/simulatte/app/camera-controller.js');
const cityInterface = require('../public/simulatte/app/city-interface.js');
const webgpuRenderer = require('../public/simulatte/app/webgpu-renderer.js');

function cameraState() {
  return {
    mode: 'follow',
    yaw: -0.72,
    pitch: 0.84,
    distance: 150,
    followDistance: 62,
    orbitTarget: [0, 0, 0],
    focusId: 'plugin:sun-walker:sun-walker-actor',
    focusHeading: null,
    targets: [{
      id: 'route',
      kind: 'route',
      label: 'Full route',
      target: [0, 0, 0],
      distance: 700,
    }, {
      id: 'plugin:sun-walker:sun-walker-actor',
      kind: 'plugin',
      label: 'Walker',
      target: [100, 0, -200],
      distance: 150,
    }],
    pose: null,
    transition: null,
    transitionProgress: 1,
    lastFrameAt: null,
  };
}

const snapshot = {
  state: { position: { x: -900, y: -900 } },
  route: { segmentIds: ['unrelated-route'] },
};
const worldModel = {
  segment() {
    return { geometry: [{ x: -900, y: -900 }, { x: -800, y: -900 }] };
  },
};

test('plugin follow mode centers the camera on the moving plugin actor', () => {
  const state = cameraState();
  const pose = camera.advanceCamera(state, snapshot, worldModel, 1.5, 0);
  assert.ok(Math.abs(pose.target[0] - 100) < 32);
  assert.ok(Math.abs(pose.target[2] + 200) < 32);
  assert.ok(pose.eye[1] >= 18, 'Sun Walker follow mode must remain an elevated bird’s-eye view');

  camera.replacePluginCameraTargets(state, [{
    id: 'plugin:sun-walker:sun-walker-actor',
    kind: 'plugin',
    label: 'Walker',
    target: [112, 0, -205],
    distance: 150,
  }], 16);
  assert.ok(Math.abs(state.focusHeading - Math.atan2(5, 12)) < 1e-9);
  const moved = camera.advanceCamera(state, snapshot, worldModel, 1.5, 100);
  assert.ok(moved.target[0] > pose.target[0]);
});

test('POV mode uses the plugin actor rather than the hidden City journey state', () => {
  const state = cameraState();
  camera.setCameraMode(state, 'pov', 0);
  const pose = camera.advanceCamera(state, snapshot, worldModel, 1.5, 0);
  assert.equal(pose.mode, 'pov');
  assert.ok(Math.abs(pose.eye[0] - 100) < 1);
  assert.ok(Math.abs(pose.eye[2] + 200) < 1);
  assert.ok(pose.eye[1] < 2);
});

test('overview, free, and compare retain distinct camera modes and framing', () => {
  const overviewState = cameraState();
  camera.setCameraMode(overviewState, 'overview', 0);
  const overview = camera.advanceCamera(overviewState, snapshot, worldModel, 1.5, 0);
  const compareState = cameraState();
  camera.setCameraMode(compareState, 'compare', 0);
  const compare = camera.advanceCamera(compareState, snapshot, worldModel, 1.5, 0);
  const freeState = cameraState();
  camera.setCameraMode(freeState, 'free', 0);
  assert.equal(camera.orbitCamera(freeState, 12, -8), true);
  const free = camera.advanceCamera(freeState, snapshot, worldModel, 1.5, 0);
  assert.equal(overview.mode, 'overview');
  assert.equal(compare.mode, 'compare');
  assert.equal(free.mode, 'free');
  assert.ok(compare.fieldOfViewRadians > overview.fieldOfViewRadians);
  assert.ok(Math.hypot(...compare.eye) > Math.hypot(...overview.eye));
  assert.notDeepEqual(free.eye, overview.eye);
});

test('City camera buttons send the exact advertised modes and select semantic targets', () => {
  const previousDocument = global.document;
  const node = () => ({
    children: [],
    handlers: new Map(),
    classList: { toggle() {} },
    setAttribute() {},
    addEventListener(type, handler) { this.handlers.set(type, handler); },
    append(child) { this.children.push(child); },
    replaceChildren() { this.children.length = 0; },
  });
  global.document = { createElement: node };
  try {
    const elements = {
      cameraFollow: node(),
      cameraPov: node(),
      cameraBird: node(),
      cameraTop: node(),
      cameraFree: node(),
      cameraCompare: node(),
      cameraFocus: node(),
    };
    const calls = [];
    const targets = [
      { id: 'route', kind: 'route', label: 'Route' },
      { id: 'plugin:fixture:overview', kind: 'plugin', label: 'Overview', viewMode: 'overview', priority: 50 },
      { id: 'plugin:fixture:comparison', kind: 'plugin', label: 'Comparison', viewMode: 'compare', priority: 80 },
    ];
    cityInterface.wireCameraControls(elements, {
      cameraTargets: () => targets,
      focusCameraTarget: (id) => calls.push(['focus', id]),
      setCameraMode: (mode) => calls.push(['mode', mode]),
    }, new AbortController().signal);
    elements.cameraFree.handlers.get('click')();
    elements.cameraCompare.handlers.get('click')();
    assert.deepEqual(calls, [
      ['mode', 'free'],
      ['focus', 'plugin:fixture:comparison'],
      ['mode', 'compare'],
    ]);
    assert.equal(elements.cameraFocus.value, 'plugin:fixture:comparison');
  } finally {
    global.document = previousDocument;
  }
});

test('City plugin playback drives rendering from simulation time without mutating world state', () => {
  const worldSnapshot = {
    route: { segmentIds: [] },
    state: { simulatedTimeSeconds: 0, position: { x: 0, y: 0 } },
  };
  const advanced = webgpuRenderer.snapshotAtRenderTime(worldSnapshot, 120);
  assert.equal(advanced.state.simulatedTimeSeconds, 120);
  assert.equal(worldSnapshot.state.simulatedTimeSeconds, 0);
  assert.notEqual(advanced, worldSnapshot);
  assert.equal(webgpuRenderer.resolvedSimulationTimeSeconds({
    state: { simulatedTimeSeconds: 5 },
  }, 2), 5);
  assert.equal(webgpuRenderer.snapshotAtRenderTime(worldSnapshot, 0), worldSnapshot);
});
