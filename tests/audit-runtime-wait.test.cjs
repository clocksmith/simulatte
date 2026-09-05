const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('model readiness extends while meaningful loader progress changes', async () => {
  const { waitForCondition } = await import('../tools/audit-runtime-wait.mjs');
  let call = 0;
  const result = await waitForCondition('progressing model', async () => {
    call += 1;
    return {
      ok: call === 4,
      runtimeHealth: {
        stage: 'runtime.reranker.load',
        message: `Layer ${call}/4`,
      },
    };
  }, 1, {
    extendOnProgress: true,
    stallTimeoutMs: 20,
    pollIntervalMs: 1,
  });

  assert.equal(result.ok, true);
  assert.equal(call, 4);
});

test('model readiness fails when only elapsed display text changes', async () => {
  const { waitForCondition } = await import('../tools/audit-runtime-wait.mjs');
  let call = 0;
  await assert.rejects(() => waitForCondition('stalled model', async () => {
    call += 1;
    return {
      ok: false,
      runtimeHealth: {
        stage: 'runtime.reranker.load',
        message: 'Layer 7/28',
        displayLine: `Loading reranker ${call}`,
        silenceMs: call,
      },
    };
  }, 1, {
    extendOnProgress: true,
    stallTimeoutMs: 8,
    pollIntervalMs: 1,
  }), /Timed out waiting for stalled model/);

  assert.ok(call > 1);
});

test('waitForCondition uses a compact caller-owned timeout description', async () => {
  const { waitForCondition } = await import('../tools/audit-runtime-wait.mjs');
  await assert.rejects(() => waitForCondition('pixel proof', async () => ({
    ok: false,
    status: 'fail',
    phase7VisualObligationProof: 'x'.repeat(8000),
  }), 5, {
    pollIntervalMs: 1,
    describeLast: (value) => ({ status: value.status }),
  }), (error) => {
    assert.match(error.message, /pixel proof: \{"status":"fail"\}/);
    assert.doesNotMatch(error.message, /xxxxxxxx/);
    return true;
  });
});

test('audit prompt identity ignores presentation whitespace but rejects stale artifacts', async () => {
  const { auditPromptMatches } = await import('../tools/audit-runtime-wait.mjs');

  assert.equal(auditPromptMatches(
    'warehouse robot arms sort parcels',
    '  warehouse   robot arms sort parcels  '
  ), true);
  assert.equal(auditPromptMatches(
    'warehouse robot arms sort parcels',
    'warehouse fire with smoke'
  ), false);
  assert.equal(auditPromptMatches('', ''), false);
});

test('audit task deadline fails closed with the active stage', async () => {
  const { withDeadline } = await import('../tools/audit-runtime-wait.mjs');
  let timeoutError = null;
  await assert.rejects(() => withDeadline('prompt capture', () => new Promise(() => {}), 5, {
    describe: () => 'stage=canvas-screenshot',
    onTimeout: (error) => { timeoutError = error; },
  }), (error) => {
    assert.equal(error.code, 'AUDIT_DEADLINE_EXCEEDED');
    assert.match(error.message, /stage=canvas-screenshot/);
    return true;
  });
  assert.equal(timeoutError && timeoutError.code, 'AUDIT_DEADLINE_EXCEEDED');
});

test('child process logs are drained into bounded diagnostic tails', async () => {
  const { PassThrough } = require('node:stream');
  const { captureChildProcessOutput } = await import('../tools/audit-process-log.mjs');
  const child = { stdout: new PassThrough(), stderr: new PassThrough() };
  const capture = captureChildProcessOutput(child, { maxCharacters: 1024 });
  child.stdout.write('x'.repeat(1400));
  child.stderr.write(`prefix-${'y'.repeat(1200)}-failure`);
  await new Promise((resolve) => setImmediate(resolve));
  const snapshot = capture.snapshot();

  assert.equal(snapshot.schema, 'simulatte.auditChildProcessLog.v1');
  assert.equal(snapshot.stdout.tail.length, 1024);
  assert.equal(snapshot.stdout.truncated, true);
  assert.equal(snapshot.stderr.truncated, true);
  assert.match(snapshot.stderr.tail, /-failure$/);
});

test('audit static server teardown closes retained keep-alive connections', async () => {
  const http = require('node:http');
  const { once } = require('node:events');
  const { stopStaticServer } = await import('../tools/audit-server-lifecycle.mjs');
  const server = http.createServer((_request, response) => {
    response.writeHead(200, { connection: 'keep-alive', 'content-type': 'text/plain' });
    response.end('ok');
  });
  server.keepAliveTimeout = 60000;
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const agent = new http.Agent({ keepAlive: true });
  const response = await new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: server.address().port, agent }, resolve).on('error', reject);
  });
  response.resume();
  await once(response, 'end');

  await stopStaticServer(server);

  assert.equal(server.listening, false);
  agent.destroy();
});

test('visual audit CLI flushes output and terminates after owned-resource cleanup', () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, '../tools/audit-intent-scene-screenshots.mjs'),
    'utf8'
  );

  assert.match(source, /await browser\.close\(\)/);
  assert.match(source, /process\.stdout\.write\('', \(\) => process\.exit\(exitCode\)\)/);
  assert.match(source, /main\(\)\.then\(exitAfterOutputFlush\)/);
});
