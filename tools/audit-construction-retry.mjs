#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import contracts from '../public/blank/pipeline/simulatte-phase-contracts.js';
import { fileURLToPath } from 'node:url';
import { openBrowserAudit } from './simulatte/browser-session.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.resolve(process.argv[2] || 'artifacts/construction-retry');
const width = Number(process.argv[3] || 1440);
const viewport = { width, height: width < 600 ? 844 : 1000 };
fs.mkdirSync(out, { recursive: true });
const browser = await openBrowserAudit({ publicRoot: path.join(root, 'public'),
  chromePath: process.env.CHROME_PATH || '/snap/bin/chromium', webgpu: true, viewport });
const { client } = browser;
const receipt = { schema: 'simulatte.constructionRetryBrowserAudit.v1', capturedAt: new Date().toISOString(),
  viewport, faultInjection: 'One synthetic Phase 8 cat loss over an actual GPU frame; natural proof observation is intercepted.',
  status: 'running', errors: [] };
async function evaluate(expression) {
  const result = await client.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}
try {
  await client.send('Runtime.enable');
  await client.send('Page.enable');
  client.on('Runtime.exceptionThrown', event => receipt.errors.push(event.exceptionDetails.exception?.description || event.exceptionDetails.text));
  await client.send('Page.addScriptToEvaluateOnNewDocument', { source: `
    Object.defineProperty(window, 'SimulattePromptProofSession', { configurable: true,
      set(api) { Object.defineProperty(window, 'SimulattePromptProofSession', { configurable: true, value: {
        ...api, create(options) { const session = api.create(options); window.__retryFixtureSession = session;
          return { ...session, observe(report) { window.__retryFixtureReport = report; } }; }
      } }); }
    });
  ` });
  await client.send('Emulation.setDeviceMetricsOverride', { ...viewport, deviceScaleFactor: 1, mobile: width < 600 });
  const loaded = client.once('Page.loadEventFired');
  await client.send('Page.navigate', { url: new URL('blank/?auditNoInitial=1', browser.host.baseUrl).toString() });
  await loaded;
  receipt.result = await evaluate(`(async () => {
    const wait = async read => {
      const start = performance.now();
      while (!read()) { if (performance.now() - start > 20000) throw new Error('Construction fixture wait exceeded 20000ms');
        await new Promise(resolve => setTimeout(resolve, 40)); }
      return read();
    };
    if (!window.SimulattePhysicsLab?._browserLab) window.SimulatteStartPhysicsLab();
    const lab = await wait(() => window.SimulattePhysicsLab?._browserLab);
    const input = document.getElementById('build-prompt'); input.value = 'a red cat';
    input.dispatchEvent(new Event('input', { bubbles: true })); document.getElementById('build-lab').click();
    await wait(() => lab.getPipelineRun()?.status === 'completed' && lab.getSpec().source.prompt === 'a red cat');
    const before = lab.getSpec(); const priorRun = lab.getPipelineRun();
    await wait(() => window.__retryFixtureReport?.final === true &&
      window.__retryFixtureReport.phase7Output.artifact.renderExecution.worldProofBinding?.worldSpec.contentHash === before.contentHash);
    const report = structuredClone(window.__retryFixtureReport);
    report.phase8Output.artifact.sceneProof.verdict = 'fail';
    report.phase8Output.artifact.sceneProof.settledObligations = [{ obligationId: 'entity:cat', status: 'lost', required: true }];
    window.__retryFixtureSession.observe(report);
    await wait(() => lab.getPipelineRun()?.revision > priorRun.revision && lab.getPipelineRun()?.status === 'completed' &&
      lab.getSpec().contentHash !== before.contentHash);
    const after = lab.getSpec(); const run = lab.getPipelineRun();
    const canvas = document.getElementById('physics-canvas');
    const grammar = spec => spec.renderProgram.sceneRenderPacket.entities.find(row => row.identity.type === 'cat').geometry.program.grammarId;
    return { runtimeSourceDigest: document.querySelector('meta[name="simulatte-runtime-source"]').content,
      before: { contentHash: before.contentHash, grammar: grammar(before) },
      after: { contentHash: after.contentHash, grammar: grammar(after) },
      run, report, renderCount: Number(canvas.dataset.renderCount), renderer: canvas.dataset.renderer };
  })()`);
  const { result } = receipt;
  assert.equal(result.run.status, 'completed');
  assert.deepEqual(result.run.attempts.map(row => row.outputs.map(output => output.phase)), [[1, 2, 3, 4, 5, 6, 7, 8]]);
  assert.equal(result.run.attempts[0].request.retryPolicy.id, 'construction-search-v1');
  const attempt = result.run.attempts[0];
  assert.equal(attempt.request.retryPolicy.failureEvidenceDigest, await contracts.artifactDigest(result.report.phase8Output));
  assert.equal(attempt.request.retryPolicy.renderEvidenceDigest, await contracts.artifactDigest(result.report.phase7Output));
  assert.equal(result.run.producer.buildDigest, result.runtimeSourceDigest);
  let previous = contracts.createRequestEnvelope(attempt.request);
  for (const output of attempt.outputs) {
    await contracts.validateBoundOutput(output, { previous,
      invocation: output.phase === 7 ? output.artifact.renderExecution.frameInvocation : {} }, {
      revision: attempt.outputs[0].binding.revision,
      producer: { ...result.run.producer, requestRevision: result.run.revision },
      dependencies: output.binding.dependencies,
    });
    previous = output;
  }
  receipt.independentBindings = 'Eight predecessor, artifact, invocation, dependency, revision, and producer digests verified';
  assert.notEqual(result.before.grammar, result.after.grammar);
  assert.equal(result.run.attempts[0].outputs[6].artifact.renderExecution.rendered, true);
  assert.equal(result.run.worldSpecContentHash, result.after.contentHash);
  assert.equal(receipt.errors.length, 0);
  receipt.status = 'pass';
} catch (error) {
  receipt.status = 'fail'; receipt.error = error.stack;
  receipt.page = await evaluate(`({run: window.SimulattePhysicsLab?._browserLab?.getPipelineRun(),
    status: document.getElementById('physics-canvas')?.dataset})`).catch(() => null);
  process.exitCode = 1;
} finally {
  const shot = await client.send('Page.captureScreenshot', { format: 'png' }).catch(() => null);
  if (shot) fs.writeFileSync(path.join(out, `${width}.png`), Buffer.from(shot.data, 'base64'));
  fs.writeFileSync(path.join(out, `${width}.json`), `${JSON.stringify(receipt, null, 2)}\n`);
  await browser.close();
}
console.log(JSON.stringify({ status: receipt.status, error: receipt.error || null, artifact: path.join(out, `${width}.json`) }));
