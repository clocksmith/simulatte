const assert = require('node:assert/strict');
const test = require('node:test');

const camera = require('../public/simulatte/app/camera-controller.js');

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
