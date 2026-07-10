const assert = require('node:assert/strict');
const test = require('node:test');

test('test process watchdog passes active children and terminates silent children', async () => {
  const { runCommandWithWatchdog } = await import('../tools/test-file-watchdog.mjs');
  const active = await runCommandWithWatchdog({
    command: process.execPath,
    args: ['-e', "console.log('first'); setTimeout(() => console.log('second'), 20)"],
    stallTimeoutMs: 200,
    terminationGraceMs: 20,
  });
  assert.equal(active.status, 'passed');
  assert.match(active.stdout, /first/);
  assert.match(active.stdout, /second/);

  const silent = await runCommandWithWatchdog({
    command: process.execPath,
    args: ['-e', 'setInterval(() => {}, 1000)'],
    stallTimeoutMs: 30,
    terminationGraceMs: 20,
  });
  assert.equal(silent.status, 'stalled');
  assert.ok(['SIGTERM', 'SIGKILL'].includes(silent.signal));
});
