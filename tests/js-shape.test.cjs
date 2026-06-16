const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const jsDir = path.join(root, 'public', 'js');

function jsFiles(dir) {
  return fs.readdirSync(dir)
    .filter((name) => name.endsWith('.js'))
    .map((name) => path.join(dir, name));
}

test('public javascript keeps lines below the repository ceiling', () => {
  for (const file of jsFiles(jsDir)) {
    const rel = path.relative(root, file);
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    lines.forEach((line, index) => {
      assert.ok(
        line.length <= 777,
        `${rel}:${index + 1} has ${line.length} characters`
      );
    });
  }
});

test('physics lab is split into catalog, model, renderer, and coordinator', () => {
  const expected = [
    'simulatte-physics-catalog.js',
    'simulatte-intent-classifier.js',
    'simulatte-composition-graph.js',
    'simulatte-world-plan.js',
    'simulatte-physics-model.js',
    'simulatte-physics-renderer.js',
    'simulatte-physics-lab.js',
  ];

  for (const name of expected) {
    assert.ok(fs.existsSync(path.join(jsDir, name)), `${name} should exist`);
  }

  const coordinatorLines = fs.readFileSync(
    path.join(jsDir, 'simulatte-physics-lab.js'),
    'utf8'
  ).split(/\r?\n/);
  assert.ok(coordinatorLines.length < 80);
});

test('physics visuals use material continuum paths instead of generic glyph particles', () => {
  const renderer = fs.readFileSync(
    path.join(jsDir, 'simulatte-physics-renderer.js'),
    'utf8'
  );
  const field = fs.readFileSync(
    path.join(jsDir, 'simulatte-particle-field.js'),
    'utf8'
  );

  assert.match(renderer, /function drawMaterialContinuumField/);
  assert.match(renderer, /function drawThermalContinuum/);
  assert.match(renderer, /function drawFluidContinuum/);
  assert.match(renderer, /function drawOpticalContinuum/);
  assert.doesNotMatch(renderer, /drawPrismaticParticleField/);
  assert.match(field, /const INSTANCE_STRIDE = 8/);
  assert.match(field, /function materialVisualClass/);
  assert.match(field, /@location\(6\) stretch/);
});
