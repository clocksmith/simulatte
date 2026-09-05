const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');

test('command directory resolves aliases, rejects cycles, and never executes listed commands', async () => {
  const { commandInventory } = await import('../tools/commands.mjs');
  assert.equal(commandInventory({ run: 'node actual.mjs', old: 'npm run run --' }).find((row) => row.name === 'old').canonical, 'run');
  assert.throws(() => commandInventory({ a: 'npm run b', b: 'npm run a' }), /cycle/);
  assert.throws(() => commandInventory({ old: 'npm run absent' }), /Unknown/);
  const result = spawnSync(process.execPath, ['tools/commands.mjs', 'deploy', '--json'], {
    cwd: path.resolve(__dirname, '..'), encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.ok(JSON.parse(result.stdout).some((row) => row.name === 'deploy:hosting'));
});

test('package commands have one executable source per compatibility alias', async () => {
  const { commandInventory } = await import('../tools/commands.mjs');
  const rows = commandInventory(require('../package.json').scripts);
  const owners = new Map();
  for (const row of rows.filter((row) => row.name === row.canonical)) {
    assert.equal(owners.has(row.command), false, `${row.name} duplicates ${owners.get(row.command)}`);
    owners.set(row.command, row.name);
  }
  assert.equal(rows.find((row) => row.name === 'train:compile').canonical, 'compile:reviews');
});
