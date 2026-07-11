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
    colors: [id === 1 ? '#ff9fbd' : '#9bdcff'],
    growthEvery: 5,
    phase: 0,
    turnBias: 1,
    loopiness: 0.85,
    straightRunLeft: 0,
    rectangularity: 0.82,
    visited: new Set(points.map(([x, y]) => `${x},${y}`)),
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
  assert.ok(instance.snakes[0].colors.includes('#ff9fbd'));
  assert.ok(instance.snakes[0].colors.includes('#9bdcff'));
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
  assert.equal(instance.exitSnakes.length, 1);
  assert.deepEqual(instance.exitSnakes[0].cells[0], { x: 8, y: 5 });
});

test('loading snake tail-end collisions absorb the crossed snake', () => {
  const beforeAttacker = snake(1, [[4, 5], [3, 5], [2, 5]]);
  const beforeVictim = snake(2, [[8, 5], [9, 5], [10, 5], [11, 5], [12, 5], [13, 5], [14, 5], [15, 5]], { x: -1, y: 0 });
  const afterAttacker = snake(1, [[15, 5], [4, 5], [3, 5]]);
  const afterVictim = snake(2, [[8, 5], [9, 5], [10, 5], [11, 5], [12, 5], [13, 5], [14, 5], [15, 5]], { x: -1, y: 0 });
  const instance = controller([afterAttacker, afterVictim]);
  const attackerLength = afterAttacker.cells.length;

  instance.resolveCollisionPlans(
    [{ snake: afterAttacker, target: { x: 15, y: 5 }, actualTarget: { x: 15, y: 5 } }],
    occupancy([beforeAttacker, beforeVictim]),
    drawFrom([beforeAttacker, beforeVictim])
  );

  assert.equal(instance.snakes.length, 1);
  assert.equal(instance.snakes[0].id, 1);
  assert.ok(instance.snakes[0].cells.length > attackerLength);
  assert.equal(instance.exitSnakes.length, 1);
  assert.deepEqual(instance.exitSnakes[0].cells[0], { x: 8, y: 5 });
});

test('loading snake stalls instead of crossing its own body', () => {
  const row = snake(1, [
    [5, 5], [6, 5], [6, 6], [5, 6], [4, 6], [4, 5], [4, 4], [5, 4],
  ]);
  const before = row.cells.map((cell) => ({ ...cell }));
  const instance = controller([row]);
  instance.enforcePopulation = () => {};

  instance.advanceSwarm(200, 164);

  assert.deepEqual(row.cells, before);
  assert.equal(new Set(row.cells.map((cell) => `${cell.x},${cell.y}`)).size, row.cells.length);
});

test('loading snake rectangular cadence keeps straight orthogonal runs', () => {
  const row = snake(1, [[6, 5], [5, 5], [4, 5], [3, 5]]);
  row.growthEvery = 100;
  row.straightRunLeft = 3;
  row.rectangularity = 1;
  const instance = controller([row]);
  instance.enforcePopulation = () => {};
  instance.rng = () => 0.99;

  instance.advanceSwarm(200, 164);
  instance.advanceSwarm(400, 164);

  assert.deepEqual(row.direction, { x: 1, y: 0 });
  assert.deepEqual(row.cells[0], { x: 8, y: 5 });
  assert.equal(row.straightRunLeft, 1);
  assert.equal(row.visited.has('8,5'), true);
});

test('loading snake density starts sparse and increases with progress', () => {
  const instance = controller([]);

  instance.progress = 0;
  instance.stageCode = 0.94;
  instance.indeterminate = false;
  assert.equal(instance.targetSnakeCount(), 2);
  assert.equal(instance.targetSnakeLength(), 8);
  instance.resetSwarm();
  assert.equal(instance.snakes.length, 2);

  instance.progress = 1;
  instance.enforcePopulation();
  assert.equal(instance.targetSnakeCount(), 16);
  assert.equal(instance.targetSnakeLength(), 64);
  assert.equal(instance.snakes.length, 16);
});

test('loading snake velocity scales from half speed to four times speed with progress', () => {
  const instance = controller([]);
  instance.stageCode = 0.94;
  instance.indeterminate = false;

  instance.progress = 0;
  assert.equal(instance.targetSpeedMultiplier(), 0.5);
  assert.equal(instance.targetStepMs(), 520);

  instance.progress = 0.5;
  assert.equal(instance.targetSpeedMultiplier(), 2.25);
  assert.equal(instance.targetStepMs(), 260 / 2.25);

  instance.progress = 1;
  assert.equal(instance.targetSpeedMultiplier(), 4);
  assert.equal(instance.targetStepMs(), 65);
});

test('loading snake spawn appears as a grid spiral before normal travel', () => {
  const instance = controller([]);
  instance.frameNow = 512;

  assert.equal(instance.spawnSnake(12, instance.frameNow), true);

  const row = instance.snakes[0];
  const directions = [];
  for (let index = 1; index < row.cells.length; index += 1) {
    directions.push({
      x: row.cells[index].x - row.cells[index - 1].x,
      y: row.cells[index].y - row.cells[index - 1].y,
    });
  }
  const directionKeys = new Set(directions.map((direction) => `${direction.x},${direction.y}`));

  assert.equal(row.enterStartedAt, 512);
  assert.ok(directionKeys.size >= 3);
});
