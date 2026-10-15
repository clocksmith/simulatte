const assert = require('node:assert/strict');
const test = require('node:test');

const renderers = require('../public/simulatte/app/tier-renderers.js');

test('country agents interpolate toward their resolved outbound node', () => {
  const arcs = [];
  const context = {
    beginPath() {},
    arc(x, y, radius) { arcs.push({ x, y, radius }); },
    fill() {},
    fillText() {},
    lineTo() {},
    moveTo() {},
    setLineDash() {},
    stroke() {},
  };
  const data = {
    agents: [{ color: '#fff', node: 0, progress: 0, routeCursor: 0, speed: 0.5 }],
    links: [{ source: 0, target: 1 }],
    nodes: [
      { city: { name: 'A' }, lat: 0, lon: 0, type: 'hub' },
      { city: { name: 'B' }, lat: 10, lon: 20, type: 'city' },
    ],
  };

  assert.doesNotThrow(() => renderers.drawCountry({
    ctx: context,
    data,
    panX: 0,
    panY: 0,
    projectCountryPoint: (lon, lat) => ({ x: lon, y: lat }),
    zoom: 1,
  }));
  assert.deepEqual(arcs.at(-1), { x: 10, y: 5, radius: 4.5 });
});

test('native astronomy scenes do not draw incompatible legacy sky positions underneath', () => {
  const ctx = new Proxy({}, { get() { throw new Error('Legacy coordinate drawing must not run'); } });
  renderers.drawStarChart({ ctx, nativeCoordinateSystems: ['icrs-cartesian-pc'] });
  renderers.drawSolarSystem({ ctx, nativeCoordinateSystems: ['heliocentric-ecliptic-au'] });
});

test('native astronomy scenes draw the whole catalog on the ICRS display surface', () => {
  const projections = [];
  const ctx = new Proxy({ arc() {} }, { get: (target, key) => target[key] || (() => {}), set: () => true });
  const data = [
    { properName: 'Sol', ra: 0, dec: 0, distancePc: 0, magnitude: -26.7, spectralType: 'G2V' },
    { properName: 'Sirius', ra: 6.752481, dec: -16.716116, distancePc: 2.6371, magnitude: -1.44, spectralType: 'A0m' },
    { properName: 'Vega', ra: 18.61564, dec: 38.783692, distancePc: 7.6787, magnitude: 0.03, spectralType: 'A0V' },
  ];
  const drawn = renderers.drawStarChart({ ctx, data, nativeCoordinateSystems: ['icrs-cartesian-pc'],
    projectCoordinatePoint(position, system, options) {
      projections.push({ position, system, options });
      return { x: position[0], y: position[1], depth: position[2], scale: 1 };
    } });
  assert.equal(drawn, 2);
  assert.ok(projections.every((row) => row.system === 'icrs-cartesian-pc' && row.options.icrsLayer === 'catalog'));
  const sirius = projections[0].position;
  assert.ok(Math.abs(Math.hypot(...sirius) - 2.6371) < 1e-9);
  assert.ok(sirius[2] < 0, 'Sirius is south of the celestial equator');
});
