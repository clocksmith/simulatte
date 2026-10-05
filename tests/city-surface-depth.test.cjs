const test = require('node:test');
const assert = require('node:assert/strict');
const math = require('../public/simulatte/app/webgpu-math.js');
const geometry = require('../public/simulatte/app/webgpu-geometry.js');

const depth = (matrix, distance) => Math.fround(math.transformPoint(matrix, [0, 0, -distance])[2]);

test('reversed floating-point perspective preserves centimetre separation across city camera distances', () => {
  const matrix = math.perspective(Math.PI / 3, 1, 0.1, 30000, true);
  assert.ok(Math.abs(depth(matrix, 0.1) - 1) < 1e-6);
  assert.ok(Math.abs(depth(matrix, 30000)) < 1e-6);
  for (const distance of [10, 100, 1000, 5000, 20000]) {
    assert.ok(depth(matrix, distance - 0.015) > depth(matrix, distance), `Surface separation at ${distance}m`);
  }
  const standard = math.perspective(Math.PI / 3, 1, 0.1, 30000);
  assert.equal(depth(standard, 5000 - 0.015), depth(standard, 5000), 'Original depth loses the surface separation');
});

test('minimap reversal preserves foreground ordering without changing the shadow projection default', () => {
  const reverse = math.orthographic(-100, 100, -100, 100, 1, 4000, true);
  const shadow = math.orthographic(-100, 100, -100, 100, 1, 4000);
  assert.ok(Math.abs(depth(reverse, 1) - 1) < 1e-6);
  assert.ok(Math.abs(depth(reverse, 4000)) < 1e-6);
  assert.ok(depth(reverse, 1799.985) > depth(reverse, 1800));
  assert.ok(depth(shadow, 1799.985) < depth(shadow, 1800));
});

test('sidewalk ribbons occupy only the two sides of a road, with continuous corner joins', () => {
  const triangles = [];
  const writer = { triangle: (...args) => triangles.push(args.slice(0, 3)) };
  geometry.addRibbon(writer, [{x:0,y:0},{x:0,y:10},{x:10,y:10}], 10, 0.165, [1,1,1,1], 0, 6);
  assert.equal(triangles.length, 8, 'Two strips on each segment');
  // First segment runs along Y: each triangle stays on a single side of the road.
  for (const triangle of triangles.slice(0,4)) {
    assert.ok(triangle.every(v => v[0] <= -3) || triangle.every(v => v[0] >= 3));
  }
  for (const triangle of triangles) for (const vertex of triangle) assert.ok(vertex.every(Number.isFinite));
});
