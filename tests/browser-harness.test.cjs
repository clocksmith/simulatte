const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');

class Socket extends EventTarget {
  constructor() {
    super(); this.readyState = 0; this.messages = [];
    queueMicrotask(() => { this.readyState = 1; this.dispatchEvent(new Event('open')); });
  }
  send(value) { this.messages.push(JSON.parse(value)); }
  message(value) { this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(value) })); }
  close() { this.readyState = 3; this.dispatchEvent(new Event('close')); }
}

test('shared CDP client preserves command, event, connection, and diagnostics interfaces', async () => {
  const { CdpClient } = await import('../tools/simulatte/browser-harness.mjs');
  const client = new CdpClient('test', { WebSocketImpl: Socket, timeoutMs: 100 });
  await client.connect();
  const command = client.send('Runtime.evaluate');
  await new Promise((resolve) => setImmediate(resolve));
  client.ws.message({ id: client.ws.messages[0].id, result: { value: 42 } });
  assert.deepEqual(await command, { value: 42 });
  let count = 0;
  const remove = client.on('Page.ready', () => { count += 1; });
  const event = client.once('Page.ready');
  client.ws.message({ method: 'Page.ready', params: { ready: true } });
  assert.deepEqual(await event, { ready: true });
  remove(); client.ws.message({ method: 'Page.ready' });
  assert.equal(count, 1);
  for (let index = 0; index < 60; index += 1) client.ws.message({ method: 'Runtime.exceptionThrown', params: { index } });
  assert.equal(client.diagnostics().length, 50);
  await client.close(); await client.close();
});

test('CDP commands and event waiters time out or reject on disconnect instead of hanging', async () => {
  const { CdpClient } = await import('../tools/simulatte/browser-harness.mjs');
  const client = new CdpClient('test', { WebSocketImpl: Socket, timeoutMs: 20 });
  await client.ready;
  await assert.rejects(client.send('no-response'), /command timed out/);
  await assert.rejects(client.waitForEvent('missing-event'), /event timed out/);
  const pending = assert.rejects(client.send('disconnected'), /closed/);
  const event = assert.rejects(client.waitForEvent('never'), /closed/);
  await new Promise((resolve) => setImmediate(resolve));
  await client.close(); await pending; await event;
  assert.equal(client.pending.size, 0); assert.equal(client.eventWaiters.size, 0);
  await assert.rejects(client.send('after-close'), /closed/);
});

test('browser arguments retain explicit GPU, memory, and headed lanes without profile overrides', async () => {
  const { browserArguments, findChrome } = await import('../tools/simulatte/browser-session.mjs');
  const options = { profileDir: '/test-profile', viewport: { width: 390, height: 844 } };
  const plain = browserArguments(options);
  assert.ok(plain.includes('--remote-debugging-port=0'));
  assert.ok(!plain.includes('--enable-unsafe-webgpu'));
  const gpu = browserArguments({ ...options, webgpu: true, preciseMemory: true, headed: true });
  assert.ok(gpu.includes('--enable-unsafe-webgpu'));
  assert.ok(gpu.includes('--enable-precise-memory-info'));
  assert.ok(!gpu.includes('--headless=new'));
  const native = browserArguments({ ...options, webgpu: true, linuxVulkan: false });
  assert.ok(native.includes('--enable-unsafe-webgpu'));
  assert.ok(!native.includes('--use-angle=vulkan'));
  assert.throws(() => browserArguments({ ...options, args: ['--user-data-dir=/unowned'] }), /session owns/);
  assert.throws(() => findChrome('/definitely-missing/chrome'), /Chrome executable unavailable/);
});

test('browser shutdown escalates and waits, including synchronous exit events', async () => {
  const { stopChild } = await import('../tools/simulatte/browser-session.mjs');
  const child = new EventEmitter();
  Object.assign(child, { pid: 123, exitCode: null, signalCode: null });
  const signals = [];
  child.kill = (signal) => {
    signals.push(signal);
    if (signal === 'SIGKILL') { child.signalCode = signal; child.emit('exit', null, signal); }
  };
  await stopChild(child, 5);
  await stopChild(child, 5);
  assert.deepEqual(signals, ['SIGTERM', 'SIGKILL']);
  assert.equal(child.listenerCount('exit'), 0);
  assert.equal(child.listenerCount('error'), 0);
});

test('browser readiness binds the generated port, rejects early exit and cleans only owned profiles', async () => {
  const { waitForBrowserPage, removeTemporaryDirectory, removeLegacyProfile } = await import('../tools/simulatte/browser-session.mjs');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'simulatte-browser-fixture-'));
  try {
    fs.writeFileSync(path.join(directory, 'DevToolsActivePort'), '41234\n/browser/test\n');
    const child = { pid: 123, exitCode: null, signalCode: null };
    const page = await waitForBrowserPage({ profileDir: directory, child, fetchImpl: async (url, options) => {
      assert.equal(url, 'http://127.0.0.1:41234/json/list');
      assert.ok(options.signal);
      return { ok: true, json: async () => [{ type: 'page', webSocketDebuggerUrl: 'ws://page' }] };
    } });
    assert.equal(page.webSocketDebuggerUrl, 'ws://page');
    await assert.rejects(waitForBrowserPage({ profileDir: directory, child: { ...child, exitCode: 1 } }), /exited before DevTools/);
    await assert.rejects(removeTemporaryDirectory(directory), /unowned directory/);
    await assert.rejects(removeLegacyProfile(path.dirname(directory), 'simulatte-browser-'), /cleanup target invalid/);
    assert.ok(fs.existsSync(directory));
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('audit host closes its listener when browser startup fails', async () => {
  const { openBrowserAudit, createAuditHost } = await import('../tools/simulatte/browser-session.mjs');
  const publicRoot = path.resolve(__dirname, '../public');
  await assert.rejects(openBrowserAudit({ publicRoot, chromePath: '/missing/chrome' }), /unavailable/);
  const host = await createAuditHost({ publicRoot });
  const response = await fetch(new URL('version.json', host.baseUrl));
  assert.equal(response.status, 200);
  await response.text();
  await host.close(); await host.close();
  assert.equal(host.server.listening, false);
});

test('audit output retains previous evidence and refuses to overwrite unrecognized work', async () => {
  const { prepareAuditOutput } = await import('../tools/audit-output.mjs');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'simulatte-audit-output-test-'));
  const output = path.join(directory, 'current');
  const schemas = ['simulatte.testAudit.v1'];
  try {
    assert.equal(await prepareAuditOutput(output, schemas), null);
    fs.writeFileSync(path.join(output, 'notes.txt'), 'active work');
    await assert.rejects(prepareAuditOutput(output, schemas), /unrecognized files/);
    assert.equal(fs.readFileSync(path.join(output, 'notes.txt'), 'utf8'), 'active work');
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ schema: schemas[0], pass: false }));
    const previous = await prepareAuditOutput(output, schemas);
    assert.equal(JSON.parse(fs.readFileSync(path.join(previous, 'report.json'))).pass, false);
    assert.equal(fs.readFileSync(path.join(previous, 'notes.txt'), 'utf8'), 'active work');
    assert.deepEqual(fs.readdirSync(output), []);
    await assert.rejects(prepareAuditOutput(path.parse(output).root, schemas), /filesystem root/);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
