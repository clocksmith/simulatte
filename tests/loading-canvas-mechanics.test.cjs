'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createController } = require('../public/app/loading/loading-canvas.js');

function fakeCanvas() {
  return {
    dataset: {},
    hidden: true,
    classList: {
      add() {},
      remove() {},
    },
    getContext() {
      return {};
    },
    getBoundingClientRect() {
      return { width: 640, height: 320 };
    },
  };
}

function controller(snakes) {
  const instance = createController(fakeCanvas());
  instance.board = {
    x: 0,
    y: 0,
    width: 640,
    height: 320,
    cell: 32,
    cols: 20,
    rows: 10,
  };
  instance.snakes = snakes;
  instance.nextSnakeId = 100;
  return instance;
}

function snake(id, points, direction = { x: 1, y: 0 }) {
  return {
    id,
    cells: points.map(([x, y]) => ({ x, y })),
    direction,
    colors: [id === 1 ? '#ff3f4f' : '#30c7f2'],
    growthEvery: 5,
    phase: 0,
    turnBias: 1,
    loopiness: 0.85,
  };
}

function occupancy(snakes) {
  const result = new Map();
  for (const row of snakes) {
    const head = row.cells[0];
    const length = row.cells.length;
    row.cells.forEach((cell, index) => {
      result.set(`${cell.x},${cell.y}`, { id: row.id, index, length, head });
    });
  }
  return result;
}

function drawFrom(snakes) {
  return new Map(snakes.map((row) => [
    row.id,
    row.cells.map((cell) => ({ x: cell.x, y: cell.y })),
  ]));
}

test('loading snake head-to-head collisions combine snakes', () => {
  const beforeA = snake(1, [[5, 5], [4, 5], [3, 5]]);
  const beforeB = snake(2, [[7, 5], [8, 5], [9, 5]], { x: -1, y: 0 });
  const afterA = snake(1, [[6, 5], [5, 5], [4, 5]]);
  const afterB = snake(2, [[6, 5], [7, 5], [8, 5]], { x: -1, y: 0 });
  const instance = controller([afterA, afterB]);

  instance.resolveCollisionPlans(
    [
      { snake: afterA, target: { x: 6, y: 5 }, actualTarget: { x: 6, y: 5 } },
      { snake: afterB, target: { x: 6, y: 5 }, actualTarget: { x: 6, y: 5 } },
    ],
    occupancy([beforeA, beforeB]),
    drawFrom([beforeA, beforeB])
  );

  assert.equal(instance.snakes.length, 1);
  assert.ok(instance.snakes[0].colors.includes('#ff3f4f'));
  assert.ok(instance.snakes[0].colors.includes('#30c7f2'));
});

test('loading snake head-to-body collisions absorb and remove the victim', () => {
  const beforeAttacker = snake(1, [[4, 5], [3, 5], [2, 5]]);
  const beforeVictim = snake(2, [[8, 5], [6, 5], [7, 5], [8, 6], [9, 6], [10, 6], [11, 6], [12, 6]], { x: -1, y: 0 });
  const afterAttacker = snake(1, [[6, 5], [4, 5], [3, 5]]);
  const afterVictim = snake(2, [[8, 5], [6, 5], [7, 5], [8, 6], [9, 6], [10, 6], [11, 6], [12, 6]], { x: -1, y: 0 });
  const instance = controller([afterAttacker, afterVictim]);
  const attackerLength = afterAttacker.cells.length;

  instance.resolveCollisionPlans(
    [{ snake: afterAttacker, target: { x: 6, y: 5 }, actualTarget: { x: 6, y: 5 } }],
    occupancy([beforeAttacker, beforeVictim]),
    drawFrom([beforeAttacker, beforeVictim])
  );

  assert.equal(instance.snakes.length, 1);
  assert.equal(instance.snakes[0].id, 1);
  assert.ok(instance.snakes[0].cells.length > attackerLength);
});

test('loading snake tail-quarter crossings do not destroy the crossed snake', () => {
  const beforeAttacker = snake(1, [[4, 5], [3, 5], [2, 5]]);
  const beforeVictim = snake(2, [[8, 5], [9, 5], [10, 5], [11, 5], [12, 5], [13, 5], [14, 5], [15, 5]], { x: -1, y: 0 });
  const afterAttacker = snake(1, [[14, 5], [4, 5], [3, 5]]);
  const afterVictim = snake(2, [[8, 5], [9, 5], [10, 5], [11, 5], [12, 5], [13, 5], [14, 5], [15, 5]], { x: -1, y: 0 });
  const instance = controller([afterAttacker, afterVictim]);

  instance.resolveCollisionPlans(
    [{ snake: afterAttacker, target: { x: 14, y: 5 }, actualTarget: { x: 14, y: 5 } }],
    occupancy([beforeAttacker, beforeVictim]),
    drawFrom([beforeAttacker, beforeVictim])
  );

  assert.equal(instance.snakes.length, 2);
  assert.ok(instance.snakes.some((row) => row.id === 1));
  assert.ok(instance.snakes.some((row) => row.id === 2));
});
