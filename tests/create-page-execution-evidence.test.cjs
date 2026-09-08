const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');

test('historical page chains validate independently and reject altered artifacts, invocations, and provenance', async () => {
  const { validateCreatePageExecutions } = await import('../tools/create-page-execution-evidence.mjs');
  const bytes = fs.readFileSync(path.join(__dirname,
    '../artifacts/create-rearchitecture-baseline/page-dispatch-editor-import-boundary/1440x1000-failure.json'));
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),
    '215bfb9f51dff3705370dc47cd5c6f7a3cca99f493a3847c56229b5a1e6b8201',
    'historical failure fixture is immutable and does not qualify current runtime performance');
  const receipt = JSON.parse(bytes).auditReceipt;
  await validateCreatePageExecutions(receipt);
  const phase8 = receipt.pipelineExecutions.compiled.attempts[0].outputs[7];
  const verdict = phase8.artifact.sceneProof.verdict;
  phase8.artifact.sceneProof.verdict = 'forged';
  await assert.rejects(validateCreatePageExecutions(receipt), /mismatch|invalid/i);
  phase8.artifact.sceneProof.verdict = verdict;
  const frame = receipt.pipelineExecutions.compiled.attempts[0].outputs[6].artifact.renderExecution.frameInvocation;
  frame.viewport.width += 1;
  await assert.rejects(validateCreatePageExecutions(receipt), /mismatch/);
  frame.viewport.width -= 1;
  receipt.pipelineExecutions.imported.attempts[0].sourceMode = 'prompt';
  await assert.rejects(validateCreatePageExecutions(receipt), /misidentified/);
  receipt.pipelineExecutions.imported.attempts[0].sourceMode = 'authored';
  receipt.runtimeSourceDigest = `sha256:${'0'.repeat(64)}`;
  await assert.rejects(validateCreatePageExecutions(receipt), /identity mismatch/);
});

test('page execution evidence validates replayed boundary presence and rejects malformed records', async () => {
  const { validateCreatePageExecutions } = await import('../tools/create-page-execution-evidence.mjs');
  const bytes = fs.readFileSync(path.join(__dirname,
    '../artifacts/create-rearchitecture-baseline/page-dispatch-editor-import-boundary/1440x1000-failure.json'));
  const receipt = JSON.parse(bytes).auditReceipt;

  receipt.pipelineExecutions.replayed = { schema: 'invalid' };
  await assert.rejects(validateCreatePageExecutions(receipt), /replayed: application execution identity mismatch/);

  delete receipt.pipelineExecutions.replayed;
  receipt.pipelineExecutions.extra = { schema: 'simulatte.createPageExecution.v1' };
  await assert.rejects(validateCreatePageExecutions(receipt), /must retain every execution boundary/);
});
