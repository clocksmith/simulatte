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
