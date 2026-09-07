const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

test('editor audit retains page evidence and screenshot identity without replacing the failure', async () => {
  const { retainEditorFailure } = await import('../tools/audit-world-spec-editor.mjs');
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'simulatte-editor-failure-'));
  const screenshot = Buffer.from('screenshot fixture');
  const error = new Error('critical proof did not settle');
  const auditReceipt = { auditTiming: { durationMs: 21000 }, sceneProofVerdict: 'pass' };
  const boundary = { id: 'unchanged-acceptance', maximumAuditDurationMs: 20000 };
  const page = { spec: { contentHash: 'fixture' }, canvas: { sceneProofVerdict: 'pending' } };
  const client = { diagnostics: () => [{ method: 'Runtime.exceptionThrown' }],
    async send(method) {
      if (method === 'Runtime.evaluate') return { result: { value: page } };
      if (method === 'Page.captureScreenshot') return { data: screenshot.toString('base64') };
      throw new Error(`Unexpected request ${method}`);
    } };
  try {
    const receipt = await retainEditorFailure(client, {outDir, viewport:{width:390,height:844}}, error, { auditReceipt, boundary });
    assert.deepEqual(receipt.auditReceipt, auditReceipt);
    assert.deepEqual(receipt.boundary, boundary);
    auditReceipt.auditTiming.durationMs = 0;
    assert.equal(receipt.auditReceipt.auditTiming.durationMs, 21000);
    assert.equal(receipt.error.message, error.message);
    assert.deepEqual(receipt.page, page);
    assert.equal(receipt.screenshotSha256, crypto.createHash('sha256').update(screenshot).digest('hex'));
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(outDir,'390x844-failure.json'))), receipt);
    assert.deepEqual(receipt.captureErrors, []);
  } finally { fs.rmSync(outDir, {recursive:true,force:true}); }
});

test('a lost browser still leaves the original failure and capture errors on disk', async () => {
  const { retainEditorFailure } = await import('../tools/audit-world-spec-editor.mjs');
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'simulatte-editor-failure-'));
  try {
    const client = { diagnostics: () => [], send: async () => {throw new Error('Browser disconnected');} };
    const receipt = await retainEditorFailure(client, {outDir,viewport:{width:390,height:844}}, new Error('device lost'));
    assert.equal(receipt.error.message, 'device lost');
    assert.deepEqual(receipt.captureErrors.map(row=>row.boundary), ['page-state','screenshot']);
    assert.ok(fs.existsSync(path.join(outDir,'390x844-failure.json')));
  } finally { fs.rmSync(outDir,{recursive:true,force:true}); }
});
