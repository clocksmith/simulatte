'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { placeInspector } = require('../public/shared/design/world-ui/components.js');

test('inspector stays in the scene and clear of the selected rack at edges and center', () => {
  const scene = { width: 1000, height: 700 }, panel = { width: 300, height: 220 };
  for (const x of [0, 30, 300, 500, 900, 980]) for (const y of [0, 30, 300, 600, 680]) {
    const rack = { left: x, right: x + 50, top: y, bottom: y + 60 };
    const p = placeInspector(scene, rack, panel);
    assert.ok(p, `space remains beside ${x},${y}`);
    assert.ok(p.x >= 16 && p.y >= 16);
    assert.ok(p.x + panel.width <= 984 && p.y + panel.height <= 684);
    assert.ok(p.x >= rack.right + 16 || p.x + panel.width <= rack.left - 16
      || p.y >= rack.bottom + 16 || p.y + panel.height <= rack.top - 16);
  }
});

test('mobile, offscreen selection, expanded details and an occupied scene dock outside the scene', () => {
  const scene = { width: 1000, height: 700 }, panel = { width: 300, height: 220 };
  const rack = { left: 450, right: 550, top: 300, bottom: 400 };
  assert.equal(placeInspector({ width: 390, height: 440 }, rack, panel), null);
  assert.equal(placeInspector(scene, null, panel), null);
  assert.equal(placeInspector(scene, { left: -100, right: -10, top: 20, bottom: 80 }, panel), null);
  assert.equal(placeInspector(scene, rack, { ...panel, height: 900 }), null);
  assert.equal(placeInspector(scene, { left: 10, right: 990, top: 10, bottom: 690 }, panel), null);
});
