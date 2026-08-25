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
