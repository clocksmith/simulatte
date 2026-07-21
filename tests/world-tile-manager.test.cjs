const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');

const tiles = require('../public/simulatte/world/world-tile-manager.js');

function bytes(value) {
  return new TextEncoder().encode(JSON.stringify(value));
}

function sha(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function entry(id, value) {
  const body = bytes(value);
  return { id, url: `memory://${id}`, sha256: sha(body), body };
}

test('tile activation is atomic and a failed replacement preserves the active resource', async () => {
  const first = entry('tile-a', { id: 'first', seams: ['x'] });
  const replacement = entry('tile-a', { id: 'replacement', seams: ['x'] });
  replacement.url = 'memory://tile-a-v2';
  const corrupt = { ...replacement, sha256: '0'.repeat(64) };
  const disposed = [];
  const manager = tiles.createWorldTileManager({
    fetchBytes: async (url) => (url === first.url ? first.body : replacement.body),
    hashBytes: async (value) => sha(value),
    upload: async (decoded) => ({ resource: { value: decoded }, gpuBytes: 16 }),
    dispose: (resource) => disposed.push(resource.value.id),
    maximumCpuBytes: 1024,
    maximumGpuBytes: 1024,
    now: (() => { let value = 0; return () => ++value; })(),
  });
  await manager.requestTile(first, { pin: true });
  assert.equal(manager.activeResource('tile-a').value.id, 'first');
  await assert.rejects(() => manager.requestTile(corrupt), (error) => error.code === 'tile_hash_mismatch');
  assert.equal(manager.activeResource('tile-a').value.id, 'first');
  assert.deepEqual(disposed, []);
  await manager.requestTile(replacement);
  assert.equal(manager.activeResource('tile-a').value.id, 'replacement');
  assert.deepEqual(disposed, ['first']);
});

test('tile sets activate together and LRU eviction respects route pins and budgets', async () => {
  const rows = [entry('a', { id: 'a' }), entry('b', { id: 'b' }), entry('c', { id: 'c' })];
  const byUrl = new Map(rows.map((row) => [row.url, row.body]));
  const manager = tiles.createWorldTileManager({
    fetchBytes: async (url) => byUrl.get(url),
    hashBytes: async (value) => sha(value),
    upload: async (decoded) => ({ resource: decoded, gpuBytes: 10 }),
    maximumCpuBytes: rows[0].body.byteLength * 2,
    maximumGpuBytes: 20,
    now: (() => { let value = 10; return () => ++value; })(),
  });
  await manager.requestSet(rows.slice(0, 2), { pinIds: ['a'] });
  await manager.requestTile(rows[2]);
  const snapshot = manager.snapshot();
  assert.deepEqual(snapshot.activeTiles.map((row) => row.id), ['a', 'c']);
  assert.deepEqual(snapshot.pinnedTileIds, ['a']);
  assert.ok(snapshot.events.some((row) => row.phase === 'tile_set_activated' && row.evictedIds.includes('b')));
});
