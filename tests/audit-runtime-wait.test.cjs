const assert = require('node:assert/strict');
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
