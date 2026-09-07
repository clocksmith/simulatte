#!/usr/bin/env node
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { openBrowserAudit } from './simulatte/browser-session.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const manifest = require('../public/blank/app/runtime-script-manifest.js');
const contracts = require('../public/blank/pipeline/simulatte-phase-contracts.js');
const render = process.argv.includes('--render');
const out = path.join(root, 'artifacts/create-rearchitecture-baseline', render ? 'managed-render-browser' : 'worker-phase-browser');
const files = [...new Set([...manifest.browser, ...manifest.pipelineWorker,
  'app/workers/simulatte-pipeline-worker.js', 'app/workers/simulatte-worker-bootstrap.js',
  'app/runtime-script-manifest.js', '../../tools/audit-create-phase-worker.mjs'])].sort();
const sources = files.map(file => ({ file, sha256: crypto.createHash('sha256')
  .update(fs.readFileSync(path.resolve(root, 'public/blank', file))).digest('hex') }));
const sourceDigest = await contracts.artifactDigest(sources);
fs.mkdirSync(out, { recursive: true });
function retain(name, evidence) {
  const file = path.join(out, name);
  if (fs.existsSync(file)) {
    const identity = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    fs.renameSync(file, path.join(out, name.replace('.json', `.${identity}.json`)));
  }
  fs.writeFileSync(file, JSON.stringify(evidence, null, 2) + '\n');
}
const browser = await openBrowserAudit({ publicRoot: path.join(root, 'public'),
  chromePath: process.env.CHROME_PATH || '/snap/bin/chromium', webgpu: true,
  viewport: { width: 1440, height: 1000 }, commandTimeoutMs: 60000 });
const { client } = browser;

async function evaluate(expression) {
  const response = await client.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
  return response.result.value;
}

try {
  await Promise.all([client.send('Page.enable'), client.send('Runtime.enable')]);
  const loaded = client.once('Page.loadEventFired');
  await client.send('Page.navigate', { url: new URL('blank/?auditNoInitial=1', browser.host.baseUrl).toString() });
  await loaded;
  const result = await evaluate(`(async () => {
    const contracts = SimulattePhaseContracts;
    const runner = SimulattePhaseRunner;
    const model = SimulattePhysicsModel;
    const render = ${render};
    const canvas = document.createElement('canvas');
    canvas.id = 'managed-render-audit';
    canvas.style.cssText = 'position:fixed;inset:0;width:640px;height:480px;z-index:100000;background:white';
    if (render) document.body.append(canvas);
    const graphics = render ? SimulatteWebGpuRenderer.create(canvas) : null;
    if (render && !graphics) throw new Error('Actual WebGPU renderer required');
    const client = SimulattePromptControllerWorkers.createPipelineCompiler(document);
    if (!client) throw new Error('Real browser Worker required');
    const options = { deterministicRuntime: true };
    const contentDigest = await contracts.artifactDigest(options);
    const sourceDigest = ${JSON.stringify(sourceDigest)};
    const request = { request: { kind: 'prompt', text: 'two cats' }, configuration: options, authoredInputs: [], retryPolicy: null };
    const receipt = window.__phaseWorkerAudit = { outputs: [], cancelled: false, recovered: false };
    const policy = { schema: 'simulatte.phaseRunPolicy.v1', id: 'worker-browser-component-v1',
      maxInputBytes: 10000, maxEvidenceBytes: 20000000,
      phases: Array.from({ length: 8 }, (_, i) => ({ phase: i + 1, maxDurationMs: 30000,
        maxArtifactBytes: 5000000, maxResidentBytes: 67108864 })) };
    const descriptor = (id, digest) => ({ id, contentDigest: digest,
      residentBytes: 100, capabilities: ['local-component-audit'] });
    const instance = runner.create({ phases: runner.localPhaseAdapters(model, { workerResourceId: 'pipeline-worker' }),
      policy, producer: { id: 'create-worker-source-closure', buildDigest: sourceDigest },
      onPublish: output => receipt.outputs.push(output) });
    try {
      await instance.run(request, { resources: {
        'compiler-options': { descriptor: { ...descriptor('compiler-options', contentDigest), kind: 'artifact' }, handle: options },
        'pipeline-worker': { descriptor: descriptor('pipeline-worker', sourceDigest), handle: client },
        renderer: { descriptor: { ...descriptor('renderer', sourceDigest), residentBytes: render ? 67108864 : 100 }, handle: graphics || {
          renderPhase: (previous, invocation) => model.runPhase7RenderExecution(previous, invocation.simulationSnapshot, null, {}),
        } },
      }, invocationForPhase: phase => {
        if (phase !== 7) return {};
        let state = { t: 0 };
        if (render) {
          const program = model.projectWorldSpec(Object.fromEntries(receipt.outputs.map(output => ['phase' + output.phase, output])));
          state = model.stepState(model.createState(program), program, 1 / 60);
        }
        return { simulationSnapshot: state, frame: { index: 1, simulationTime: state.t },
          viewport: { width: 640, height: 480 } };
      } });
      const spec = model.projectWorldSpec(Object.fromEntries(receipt.outputs.slice(0, 6).map(output => ['phase' + output.phase, output])));
      receipt.worldSpecHash = spec.contentHash;
      receipt.synchronousHash = model.createSpecFromPrompt('two cats', options).contentHash;
      receipt.catCount = spec.renderProgram.sceneRenderPacket.entities.filter(row => row.identity.type === 'cat').length;
      const abort = new AbortController();
      const pending = client.runPhase(2, { previous: receipt.outputs[0], invocation: {} }, {}, { signal: abort.signal });
      abort.abort();
      try { await pending; } catch (error) { receipt.cancelled = error.name === 'AbortError'; }
      const recovered = await client.compile('three cats', options);
      receipt.recovered = recovered.renderProgram.sceneRenderPacket.entities.filter(row => row.identity.type === 'cat').length === 3;
      if (render) {
        const output = receipt.outputs[6];
        const invocation = output.artifact.renderExecution.frameInvocation;
        receipt.gpuInvocationMatches = output.binding.invocationDigest === await contracts.artifactDigest(invocation);
        const cancel = new AbortController();
        const pendingFrame = graphics.renderPhase(receipt.outputs[5], invocation, cancel.signal);
        await Promise.resolve();
        cancel.abort();
        receipt.cancelledGpuEvidenceCleared = graphics.phase7Output === null;
        try { await pendingFrame; } catch (error) { receipt.gpuCancelled = error.code === 'SIMULATTE_PIPELINE_ABORTED'; }
        const resumed = await graphics.renderPhase(receipt.outputs[5], invocation);
        receipt.gpuRecovered = resumed.artifact.renderExecution.gpuCompletion.status === 'completed';
        receipt.gpuFrame = resumed.artifact.renderExecution.frame;
        receipt.gpuDeviceClass = resumed.artifact.renderExecution.optimization.deviceClass;
        receipt.rendererSettledPhase8 = Boolean(graphics.phase8Output);
      }
      return receipt;
    } finally { instance.dispose(); client.cancel(); if (!render) graphics?.dispose(); }
  })()`);
  assert.deepEqual(result.outputs.map(output => output.phase), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(result.catCount, 2);
  assert.equal(result.worldSpecHash, result.synchronousHash);
  assert.equal(result.cancelled, true);
  assert.equal(result.recovered, true);
  if (render) {
    assert.equal(result.outputs[6].artifact.renderExecution.pixelAudit.status, 'pass');
    assert.equal(result.outputs[7].artifact.sceneProof.verdict, 'pass');
    for (const key of ['gpuInvocationMatches', 'cancelledGpuEvidenceCleared', 'gpuCancelled', 'gpuRecovered']) assert.equal(result[key], true, key);
    assert.equal(result.rendererSettledPhase8, false);
    const screenshot = await client.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    const bytes = Buffer.from(screenshot.data, 'base64');
    fs.writeFileSync(path.join(out, 'frame.png'), bytes);
    result.screenshotSha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  } else assert.notEqual(result.outputs[7].artifact.sceneProof.verdict, 'pass');
  retain('receipt.json', { schema: 'simulatte.workerPhaseBrowserAudit.v1',
    capturedAt: new Date().toISOString(), layer: render ? 'actual-browser-worker-renderer-integration' : 'actual-browser-worker-component',
    qualifiedForCreate: false, graphicsEvidence: render ? 'declared-frame WebGPU submission, readback and scene settlement' : 'diagnostic-only; no pixels submitted by this probe',
    residencyEvidence: 'Declared component resource budgets; physical GPU allocation is not measured. No model/graphics co-residency qualification.',
    sourceDigest, sources, result });
  console.log(JSON.stringify({ status: 'pass', output: path.relative(root, out), phases: 8,
    layer: render ? 'actual-browser-worker-renderer-integration' : 'actual-browser-worker-component', graphicsEvidence: render ? 'verified-frame' : 'not-proven' }));
} catch (error) {
  const failure = { capturedAt: new Date().toISOString(), sourceDigest, sources, error: error.stack };
  try { failure.partial = await evaluate('window.__phaseWorkerAudit || null'); }
  catch (captureError) { failure.captureError = captureError.message; }
  retain('failure.json', failure);
  throw error;
} finally {
  await browser.close();
}
