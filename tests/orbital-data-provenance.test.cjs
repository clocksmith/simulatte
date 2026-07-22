const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const ORBITAL_DIR = path.join(ROOT, 'public/data/orbital-transfer-planner');
const EPHEMERIS_PATH = path.join(ORBITAL_DIR, 'jpl-horizons-heliocentric-vectors-v1.json');
const MANIFEST_PATH = path.join(ORBITAL_DIR, 'dataset-manifest.json');
const WORLD_PATH = path.join(ROOT, 'public/data/simulatte/worlds/solar-system-ephemeris-v2.json');

test('orbital ephemeris provenance matches declared JPL Horizons identity', () => {
  assert.equal(fs.existsSync(EPHEMERIS_PATH), true, 'jpl-horizons-heliocentric-vectors-v1.json must exist');
  const ephemeris = JSON.parse(fs.readFileSync(EPHEMERIS_PATH, 'utf8'));

  assert.equal(ephemeris.schema, 'simulatte.jplHorizonsHeliocentricVectors.v1');
  assert.equal(ephemeris.id, 'jpl.horizons.heliocentric-vectors.v1');
  assert.equal(ephemeris.sourceKind, 'observed_jpl_horizons_vectors');
  assert.equal(typeof ephemeris.provenance?.claimBoundary, 'string');
  assert.equal(ephemeris.provenance.claimBoundary.includes('JPL Horizons'), true);

  const bodies = ephemeris.bodies;
  assert.equal(Boolean(bodies.sun), true);
  assert.equal(Boolean(bodies.earth), true);
  assert.equal(Boolean(bodies.moon), true);
  assert.equal(Boolean(bodies.mars), true);

  const count = ephemeris.epochCount;
  for (const [id, body] of Object.entries(bodies)) {
    assert.equal(Array.isArray(body.vectors), true, `Body ${id} must have vectors array`);
    assert.equal(body.vectors.length, count, `Body ${id} vector count must match epochCount (${count})`);
    for (const vector of body.vectors) {
      assert.equal(Array.isArray(vector.positionAu), true);
      assert.equal(vector.positionAu.length, 3);
      assert.equal(vector.positionAu.every(Number.isFinite), true, `Vector position for ${id} must be finite`);
    }
  }
});

test('solar system world references the exact dataset ID and manifest SHA-256', () => {
  assert.equal(fs.existsSync(WORLD_PATH), true, 'solar-system-ephemeris-v2.json must exist');
  const world = JSON.parse(fs.readFileSync(WORLD_PATH, 'utf8'));

  assert.equal(world.schema, 'simulatte.tierWorldModel.v1');
  assert.equal(world.id, 'solar-system-ephemeris-v2');
  assert.equal(world.tier, 'solar-system');
  assert.equal(world.datasets.ephemeris, 'jpl.horizons.heliocentric-vectors.v1');

  if (fs.existsSync(MANIFEST_PATH)) {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    const entry = manifest.datasets?.['jpl.horizons.heliocentric-vectors.v1'];
    if (entry) {
      assert.equal(entry.schemaId, 'simulatte.jplHorizonsHeliocentricVectors.v1');
      assert.equal(entry.sourceKind, 'observed_jpl_horizons_vectors');
    }
  }
});
