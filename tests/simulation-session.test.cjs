const test = require('node:test');
const assert = require('node:assert/strict');
const api = require('../public/shared/contracts/simulation-session.js');

test('session keeps preparation, execution, rendering, and measurement independent', () => {
  const session = api.create({ id: 'fixture', capabilities: { camera: true } });
  assert.equal(session.snapshot().visibleStatus, 'Waiting for input');
  session.update({ preparation: 'ready', execution: 'running' });
  assert.equal(session.snapshot().visibleStatus, 'Preparing', 'running model alone does not prove presentation');
  session.update({ rendering: 'ready', measurement: 'stale' });
  assert.equal(session.snapshot().visibleStatus, 'Running');
  assert.equal(session.snapshot().measurement, 'stale');
  session.update({ rendering: 'recovering' });
  assert.equal(session.snapshot().visibleStatus, 'Recovering');
  session.update({ rendering: 'failed', execution: 'paused' });
  assert.equal(session.snapshot().visibleStatus, 'Needs attention');
  session.dispose();
});

test('operations declare their consequences and unavailable actions cannot run', async () => {
  const calls = [];
  const session = api.create({ id: 'fixture', capabilities: { liveActions: true }, operations: [
    { id: 'focus', category: 'observation', target: 'rack', perform: value => calls.push(['focus', value]) },
    { id: 'slow', category: 'live', target: 'rack', perform: value => calls.push(['slow', value]) },
    { id: 'configure', category: 'scenario', target: 'cluster', requiresRestart: true,
      perform: value => calls.push(['configure', value]) },
    { id: 'rewrite', category: 'authoring', requiresCompile: true, available: () => false,
      perform: () => assert.fail('unavailable authoring ran') },
  ] });
  assert.deepEqual(session.snapshot().operations.map(row => row.category),
    ['observation', 'live', 'scenario', 'authoring']);
  assert.equal(session.snapshot().operations[2].requiresRestart, true);
  await session.invoke('focus', 'R1');
  await session.invoke('slow', 95);
  await session.invoke('configure', { cooling: 20 });
  assert.deepEqual(calls, [['focus', 'R1'], ['slow', 95], ['configure', { cooling: 20 }]]);
  await assert.rejects(session.invoke('rewrite', 'new program'), /unavailable/);
  session.dispose();
  await assert.rejects(session.invoke('slow', 0), /disposed/);
  assert.throws(() => api.operation({ id: 'wrong', category: 'scenario', perform() {} }), /restart/);
  assert.throws(() => api.operation({ id: 'wrong', category: 'live', requiresRestart: true, perform() {} }), /restart/);
  assert.throws(() => api.operation({ id: 'wrong', category: 'execution', available: true, perform() {} }), /availability/);
});


test('superseded asynchronous commands cancel immediately and cannot commit stale state', async () => {
  let release, value = null;
  const session = api.create({ id: 'race', capabilities: {}, operations: [
    { id: 'replace', category: 'scenario', requiresRestart: true, perform: async (input, operation) => {
      if (input === 'old') await new Promise(resolve => { release = resolve; });
      operation.commit(() => { value = input; });
    } },
    { id: 'fail', category: 'execution', perform: () => { throw new Error('model failure'); } },
  ] });
  const first = session.invoke('replace', 'old');
  const rejected = assert.rejects(first, { name: 'AbortError' });
  await Promise.resolve();
  assert.equal(session.snapshot().pending[0].status, 'pending');
  await session.invoke('replace', 'new');
  await rejected;
  release();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(value, 'new');
  assert.equal(session.snapshot().lastOperation.status, 'success');
  assert.equal(session.snapshot().pending.length, 0);
  await assert.rejects(session.invoke('fail'), /model failure/);
  assert.equal(session.snapshot().lastOperation.status, 'failed');
});

test('disposal cancels work even when a provider never resolves', async () => {
  const session = api.create({ id: 'dispose', capabilities: {}, operations: [
    { id: 'wait', category: 'execution', perform: () => new Promise(() => {}) },
  ] });
  const pending = session.invoke('wait');
  const rejection = assert.rejects(pending, { name: 'AbortError' });
  await Promise.resolve();
  session.dispose();
  await rejection;
});
