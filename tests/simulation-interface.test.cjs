const assert = require('node:assert/strict');
const test = require('node:test');
const cameras = require('../public/simulatte/app/camera-controller.js');
const initial = require('../public/simulatte/app/experience-camera.js');
const tiers = require('../public/simulatte/app/multi-tier-visualizer.js');
const presentation = require('../public/simulatte/app/tier-plugin-presentation.js');
const profiles = require('../public/simulatte/app/application-profile-select.js');
const shell = require('../public/simulatte/app/app-shell.js');

function state() {
  return { mode: 'overview', yaw: -0.72, pitch: 0.84, distance: 2400, followDistance: 62,
    orbitTarget: [4300, 350, -9200], focusId: 'plugin:fixture:network', focusHeading: null,
    targets: [{ id: 'route', kind: 'route', target: [0, 0, 0], distance: 9000 },
      { id: 'plugin:fixture:network', kind: 'plugin', target: [4300, 350, -9200], distance: 2400, viewMode: 'overview' }],
    pose: null, transition: null, transitionProgress: 1, lastFrameAt: null };
}

test('scenario selection never impersonates authored textbox input', () => {
  const prior = global.document;
  global.document = { body: { dataset: {} } };
  try {
    const node = () => ({ hidden: false, textContent: '' });
    const elements = { missionField: node(), scenarioField: node(), scenarioLabel: node(), scenarioDescription: node(),
      scenarioSeed: node(), missionInput: { value: 'previous authoring' }, shuffleLabel: node(), startLabel: node() };
    profiles.renderInteraction({ mode: 'playback', startLabel: 'Run', shuffleLabel: 'Next scenario' },
      { label: 'Structured route', description: 'Governed data', seed: 'fixed', missionText: 'Generated example text' }, elements);
    assert.equal(elements.missionInput.value, '');
    assert.equal(elements.missionField.hidden, true);
    assert.equal(elements.scenarioField.hidden, false);
    assert.equal(elements.scenarioDescription.textContent, 'Governed data');
  } finally { global.document = prior; }
});

test('profile defaults choose declared overview targets even without an explicit target ID', () => {
  const calls = [];
  assert.equal(initial.applyInitialCamera({ configuration: { initialMode: 'bird' },
    renderer: { cameraTargets: () => state().targets, resetCamera: (value) => calls.push(value) },
    onModeSelected: (value) => calls.push(value) }), true);
  assert.deepEqual(calls, [{ targetId: 'plugin:fixture:network', mode: 'overview' }, 'overview']);
});

test('reset view restores pose, zoom, and the non-origin target without changing simulation', () => {
  const camera = state();
  cameras.orbitCamera(camera, 80, 40);
  cameras.zoomCamera(camera, 300);
  cameras.resetCamera(camera, 'plugin:fixture:network', 'top', 100);
  assert.deepEqual(camera.orbitTarget, [4300, 350, -9200]);
  assert.equal(camera.distance, 2400);
  assert.equal(camera.followDistance, 62);
  assert.equal(camera.yaw, -0.72);
  assert.equal(camera.mode, 'top');
  assert.equal(camera.isManualFrame, false);
});

test('updated plugin targets do not undo manually explored framing', () => {
  const camera = state();
  cameras.orbitCamera(camera, 60, 0);
  cameras.zoomCamera(camera, 200);
  const before = { target: [...camera.orbitTarget], distance: camera.distance };
  cameras.replacePluginCameraTargets(camera, [{ ...camera.targets[1], target: [9999, 0, -9999], distance: 8000 }], 16);
  assert.deepEqual(camera.orbitTarget, before.target);
  assert.equal(camera.distance, before.distance);
});

test('narrow camera framing expands distance and clipping around the actual target', () => {
  const snapshot = { state: { position: { x: 0, y: 0 } } };
  const wide = cameras.advanceCamera(state(), snapshot, {}, 2, 0);
  const narrow = cameras.advanceCamera(state(), snapshot, {}, 0.5, 0);
  assert.deepEqual(narrow.target, wide.target);
  const distance = pose => Math.hypot(...pose.eye.map((value, i) => value - pose.target[i]));
  assert.ok(Math.abs(distance(narrow) / distance(wide) - 2) < 1e-8);
  assert.ok(narrow.eye[1] > narrow.target[1]);
  assert.ok(narrow.far > distance(narrow));
});

for (const system of ['wgs84', 'heliocentric-ecliptic-au', 'icrs-cartesian-pc', 'datacenter-cartesian-meters']) {
  for (const viewport of [{ width: 390, height: 360 }, { width: 1440, height: 600 }]) {
    test(`${system} framing is centered and bounded at ${viewport.width} pixels`, () => {
      const coordinates = system === 'wgs84' ? [[-100, 20, 0], [-20, 60, 0]] : [[20, 2, 0], [35, 12, 1]];
      const view = tiers.coordinateEvidenceView({ coordinates, coordinateSystem: system, ...viewport });
      const points = coordinates.map(point => presentation.projectPoint(point, system, { ...view, rotX: 0, rotY: 0 }));
      const centerX = (Math.min(...points.map(p => p.x)) + Math.max(...points.map(p => p.x))) / 2;
      const centerY = (Math.min(...points.map(p => p.y)) + Math.max(...points.map(p => p.y))) / 2;
      assert.ok(Math.abs(centerX - viewport.width / 2) < 1e-6);
      assert.ok(Math.abs(centerY - viewport.height / 2) < 1e-6);
      for (const point of points) {
        assert.ok(point.x >= 0 && point.x <= viewport.width);
        assert.ok(point.y >= 0 && point.y <= viewport.height);
      }
    });
  }
}

test('national framing uses viewport space, not obsolete mobile panel offsets', () => {
  const view = tiers.countryEvidenceView({ countryBounds: { minLon: -125, maxLon: -67, minLat: 24, maxLat: 49 },
    evidenceBounds: { minX: -120, maxX: -72, minY: 26, maxY: 47 }, width: 390, height: 360 });
  assert.ok(view.zoom > 0);
  assert.equal(view.panX, 195);
  assert.equal(view.panY, 180);
});

test('same-profile route edits serialize and only the newest result becomes canonical', async () => {
  const previous = global.document;
  global.document = { body: { dataset: {}, classList: { add() {}, remove() {} } }, getElementById: () => null, querySelectorAll: () => [] };
  let release, active = 0, peak = 0;
  const gate = new Promise(resolve => { release = resolve; });
  const canonical = [];
  const base = { tier: 'world', experience: 'fixture', world: 'earth', profile: 'fixture', camera: 'overview' };
  try {
    const app = shell.create({
      router: { hrefFor: value => JSON.stringify(value), canonicalize: value => canonical.push(value) },
      boot: async () => ({ ...base, dispose() {}, async updateRoute(route) {
        active++; peak = Math.max(peak, active);
        if (route.simulation.scenarioId === 'first') await gate;
        active--;
        return { simulation: route.simulation };
      } }),
      updateExperienceDocLink() {}, labelForProfile: value => value, tierLabels: { world: 'Planet' },
    });
    await app.renderRoute(base);
    const first = app.renderRoute({ ...base, simulation: { scenarioId: 'first' } });
    await new Promise(resolve => setImmediate(resolve));
    const last = app.renderRoute({ ...base, simulation: { scenarioId: 'last' } });
    release();
    await Promise.all([first, last]);
    assert.equal(peak, 1);
    assert.equal(canonical.at(-1).simulation.scenarioId, 'last');
    assert.equal(canonical.some(route => route.simulation?.scenarioId === 'first'), false);
  } finally { global.document = previous; }
});
