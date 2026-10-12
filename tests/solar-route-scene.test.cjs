const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function fixture() {
  const root = { earcut: () => [] }; vm.createContext(root);
  for (const file of ['geometry.js', 'route-scene.js']) vm.runInContext(fs.readFileSync(`public/simulatte/solar-drive/${file}`, 'utf8'), root);
  const data = { points: [], policy: { roadWidthM: 6 }, buildings: [{ id: 'distant', heightM: 80, groundElevationM: 0,
    footprint: [{ x: 80, y: -5 }, { x: 90, y: -5 }, { x: 90, y: 5 }, { x: 80, y: 5 }, { x: 80, y: -5 }] }] };
  const machine = { anchors: { solar: [0, 2, 0] }, instances: [{ mesh: 'box', group: 'solar', panelUv: [0, 1],
    matrix: root.SimulatteSolarGeometry.matrix([0, 2, 0]), color: [0.008, 0.025, 0.075, 0], material: [0.5, 0.13, 3, 1] }] };
  const environment = { point: { x: 0, y: 0, heading: 0, elevationM: 0 }, grade: 0, sunDirection: [0, 1, 0],
    routeId: 'fixture', timestamp: '2026-06-21T12:00:00Z', occluderIds: ['distant'], directFraction: 6 / 9,
    samples: Array.from({ length: 9 }, (_, i) => ({ state: i < 3 ? 'shade' : 'direct', occluderId: i < 3 ? 'distant' : null })) };
  return { root, scene: root.SimulatteSolarRideScene.create(data), machine, environment };
}
test('calculated distant shadow casters remain in the rendered scene', () => {
  const { scene, machine, environment } = fixture();
  const frame = scene.frame(machine, environment, { shade: 0, cloud: 0 });
  assert.ok(frame.instances.some(item => item.sourceId === 'distant'), 'The building causing panel shade must be retained');
});
test('panel shading carries sampled regions without changing the panel paint', () => {
  const { scene, machine, environment } = fixture();
  const frame = scene.frame(machine, environment, { shade: 0, cloud: 0 });
  const panel = frame.instances.find(item => item.group === 'solar');
  assert.deepEqual(Array.from(panel.color), machine.instances[0].color);
  assert.deepEqual(Array.from(panel.panelExposure), [8, 0, 1]);
  assert.equal(frame.route.directFraction, 6 / 9);
  environment.samples.forEach(sample => { sample.state = 'direct'; }); environment.directFraction = 1;
  const lit = scene.frame(machine, environment, { shade: 0, cloud: 0 }).instances.find(item => item.group === 'solar');
  assert.deepEqual(Array.from(lit.panelExposure), [1, 0, 1]);
  assert.deepEqual(Array.from(lit.color), Array.from(panel.color));
});
test('invalid panel samples cannot become plausible shading', () => {
  const { scene, machine, environment } = fixture(); environment.samples[0].state = 'unknown';
  assert.throws(() => scene.frame(machine, environment, { shade: 0, cloud: 0 }), /panel_exposure_invalid/);
});
