const test = require('node:test');
const assert = require('node:assert/strict');
const api = require('../public/shared/render/renderer-session.js');
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
function fixture(extra = {}) {
  let disposed = 0;
  const receipt = Object.freeze({ schema: 'test.frame.v1', proof: 'not-proven' });
  const adapter = { render: value => value, receipt: () => receipt, dispose() { disposed++; }, ...extra };
  return { adapter, receipt, get disposed() { return disposed; } };
}
test('sessions expose one checked API without rewriting scene input or native receipts', async () => {
  const f = fixture();
  const session = api.create({ backend: 'test', capabilities: ['render', 'receipt'], initialize: () => f.adapter });
  assert.throws(() => session.render({}), { code: 'renderer_initializing' });
  assert.equal(await session.ready, session);
  const frame = { exactInputHash: 'unchanged' };
  assert.equal(session.render(frame), frame);
  assert.equal(session.receipt(), f.receipt);
  assert.throws(() => session.pick({ x: 1, y: 1 }), { code: 'renderer_operation_unsupported' });
  await session.dispose();
  await session.dispose();
  assert.equal(f.disposed, 1);
  assert.throws(() => session.render(frame), { code: 'renderer_disposed' });
});
test('disposal during initialization settles readiness and releases a late adapter', async () => {
  const init = deferred();
  const f = fixture();
  const session = api.create({ backend: 'test', capabilities: ['render', 'receipt'], initialize: () => init.promise });
  await Promise.resolve();
  await session.dispose();
  await assert.rejects(session.ready, { code: 'renderer_disposed' });
  init.resolve(f.adapter);
  await new Promise(setImmediate);
  assert.equal(f.disposed, 1);
});
test('capture cannot publish after disposal and device failure invalidates further calls', async () => {
  const capture = deferred();
  const f = fixture({ capture: () => capture.promise });
  let fail;
  const session = api.create({ backend: 'test', capabilities: ['render', 'receipt', 'capture'], initialize: options => { fail = options.fail; return f.adapter; } });
  await session.ready;
  const output = session.capture();
  fail(new Error('device lost'));
  assert.equal(session.status().state, 'failed');
  assert.throws(() => session.render({}), { code: 'renderer_failed' });
  capture.resolve('obsolete pixels');
  await assert.rejects(output, { code: 'renderer_result_stale' });
  await session.dispose();
  assert.equal(f.disposed, 1);
});
test('aborted construction never acquires resources and malformed adapters fail readiness', async () => {
  assert.throws(() => api.create({ backend: 'test', initialize() {}, capabilities: {} }), { code: 'renderer_adapter_invalid' });
  const controller = new AbortController(); controller.abort();
  let called = false;
  const cancelled = api.create({ backend: 'test', capabilities: ['render', 'receipt'], signal: controller.signal, initialize() { called = true; } });
  await assert.rejects(cancelled.ready, { code: 'renderer_disposed' });
  assert.equal(called, false);
  const f = fixture({ render: null });
  const invalid = api.create({ backend: 'test', capabilities: ['render', 'receipt'], initialize: () => f.adapter });
  await assert.rejects(invalid.ready, { code: 'renderer_adapter_invalid' });
  assert.equal(f.disposed, 1);
});
