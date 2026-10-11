import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { openBrowserAudit } from './simulatte/browser-session.mjs';
import { setupPage, evaluate } from './visual-audit-page.mjs';
import { waitForCondition } from './audit-runtime-wait.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'artifacts/activity-revisions');
const require = createRequire(import.meta.url);
const manifest = require('../public/blank/app/runtime-script-manifest.js');
const sources = [...new Set([...manifest.browser, ...manifest.pipelineWorker,
  ...manifest.libraryModules, ...manifest.libraryAssets, 'index.html', 'styles.css', 'app/runtime-script-manifest.js'])].sort();
const sourceHashes = Object.fromEntries(await Promise.all(sources.map(async file => [file,
  createHash('sha256').update(await fs.readFile(path.resolve(root, 'public/blank', file))).digest('hex')])));
const prompt = 'a person sits on a chair, holds a phone in the left hand, drinks from a cup with the right hand then places the cup on a table with the right hand then stands';
const rows = [];
const viewportArgument = process.argv.find(argument => argument.startsWith('--viewport='));
const viewports = [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]
  .filter(viewport => !viewportArgument || `${viewport.width}x${viewport.height}` === viewportArgument.slice('--viewport='.length));
assert.ok(viewports.length, 'Viewport must be 1440x1000 or 390x844');
await fs.mkdir(out, { recursive: true });
if (viewportArgument) {
  const previous = await fs.readFile(path.join(out, 'report.json'), 'utf8').then(JSON.parse).catch(() => null);
  if (previous) {
    assert.equal(previous.prompt, prompt);
    assert.deepEqual(previous.sourceHashes, sourceHashes, 'Saved evidence must use these exact runtime sources');
    rows.push(...previous.rows.filter(row => !viewports.some(viewport => viewport.width === row.viewport.width)));
  }
}
const snapshot = (client, full = false) => evaluate(client, `(() => {
  const lab = window.SimulattePhysicsLab._browserLab, spec = lab.getSpec();
  return { spec: ${full ? 'spec' : '{ contentHash: spec.contentHash, source: spec.source, authorship: spec.authorship, activityProgram: spec.activityProgram }'},
    state: ${full ? '(() => { const state = lab.getState(), activity = state.activity; return { solverFrame: state.solverState?.frame, activity: { time: activity.time, actors: activity.actors, objects: activity.objects, dynamics: activity.dynamics, retainedSamples: activity.history.length } }; })()' : '{ activity: { time: lab.getState().activity?.time } }'},
    sequenceProof: ${full ? 'window.SimulattePhysicsModel.proveActivitySequence(spec.activityProgram, lab.getState().activity)' : 'null'},
    controller: { state: window.SimulatteCreateController.snapshot().state, message: window.SimulatteCreateController.snapshot().message },
    status: document.querySelector('#create-activity-editor > [role="status"]')?.textContent,
    statusState: document.querySelector('#create-activity-editor > [role="status"]')?.dataset.state,
    verdict: document.getElementById('physics-canvas').dataset.sceneProofVerdict,
    failures: document.getElementById('physics-canvas').dataset.sceneProofRequiredFailures,
    execution: (() => { const run = lab.getPipelineRun(); return run && { status: run.status, attempts: run.attempts.map(row => ({ error: row.error, outputs: row.outputs.map(output => ({ phase: output.phase, binding: output.binding })) })) }; })(), fits: document.documentElement.scrollWidth <= innerWidth };
})()`);
async function waitEdit(client, revision) {
  const result = await waitForCondition('activity revision publication', async () => {
    const value = await snapshot(client);
    return { ok: value.statusState === 'error' || value.spec.authorship.revision === revision && value.statusState === 'ready',
      error: value.statusState === 'error' ? value.status : null,
      revision: value.spec.authorship.revision, status: value.status, state: value.controller.state };
  }, 60000);
  if (result.error) throw new Error(result.error);
  return result;
}
async function pickObject(client, kind) {
  await evaluate(client, `(() => {
    const spec = window.SimulattePhysicsLab._browserLab.getSpec();
    const select = document.querySelector('.activity-object-editor > label select');
    select.value = spec.activityProgram.objects.find(row => row.kind === ${JSON.stringify(kind)}).id;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
}
async function changeObject(client, kind, label, value, revision) {
  await pickObject(client, kind);
  await evaluate(client, `(() => {
    const form = document.querySelector('.activity-object-editor form');
    const input = [...form.querySelectorAll('label')].find(row => row.textContent === ${JSON.stringify(label)}).querySelector('input');
    input.value = ${JSON.stringify(value)};
    if (!form.checkValidity()) throw new Error('Object form rejects its current values: ' + [...form.querySelectorAll('input')].filter(input => !input.validity.valid).map(input => input.parentElement.textContent + ': ' + input.validationMessage).join('; '));
    form.requestSubmit();
  })()`);
  await waitEdit(client, revision);
}
async function changeDrinkDuration(client, seconds) {
  await evaluate(client, `(() => {
    const details = [...document.querySelectorAll('.activity-timeline details')].find(row => row.querySelector('summary').textContent.includes(' · drink · '));
    details.open = true;
    const form = details.querySelector('form');
    [...form.querySelectorAll('label')].find(row => row.textContent === 'Duration (s)').querySelector('input').value = ${JSON.stringify(seconds)};
    if (!form.checkValidity()) throw new Error('Action form rejects its current values');
    form.requestSubmit();
  })()`);
}
for (const viewport of viewports) {
  await fs.rm(path.join(out, `${viewport.width}x${viewport.height}-failure.json`), { force: true });
  const browser = await openBrowserAudit({ publicRoot: path.join(root, 'public'), viewport, webgpu: true });
  try {
    await setupPage(browser.client, `${browser.host.baseUrl}blank/?auditNoInitial=1`, viewport.width, viewport.height, 30000, 'local');
    await evaluate(browser.client, `(() => {
      const input = document.getElementById('build-prompt'); input.value = ${JSON.stringify(prompt)};
      input.dispatchEvent(new Event('input', { bubbles: true })); document.getElementById('build-lab').click();
    })()`);
    await waitForCondition('editable activity', async () => {
      const value = await snapshot(browser.client);
      return { ok: value.spec.source.prompt === prompt && value.spec.activityProgram?.actions.length === 5 &&
        value.controller.state !== 'active', state: value.controller.state, message: value.controller.message };
    }, 60000);
    const first = await snapshot(browser.client);
    assert.equal(first.spec.activityProgram.unsupported.length, 0);
    const identities = first.spec.activityProgram.objects.map(row => row.id);
    await evaluate(browser.client, `document.querySelector('.activity-timeline > button').click()`);
    await waitEdit(browser.client, 1);
    await changeObject(browser.client, 'seat', 'Seat height (m)', 0.55, 2);
    await changeObject(browser.client, 'cup', 'Cup fill (%)', 70, 3);
    await changeObject(browser.client, 'support', 'Position X (m)', -0.05, 4);
    await changeDrinkDuration(browser.client, 5);
    await waitEdit(browser.client, 5);
    const accepted = await snapshot(browser.client);
    assert.equal(accepted.spec.activityProgram.actions.find(row => row.action === 'drink').hand, 'left');
    assert.equal(accepted.spec.activityProgram.objects.find(row => row.kind === 'seat').seatHeight, 0.55);
    assert.equal(accepted.spec.activityProgram.objects.find(row => row.kind === 'cup').liquidContainer.fillFraction, 0.7);
    assert.equal(accepted.spec.activityProgram.actions.find(row => row.action === 'place').startSeconds, 5);
    assert.deepEqual(accepted.spec.activityProgram.objects.map(row => row.id), identities);
    assert.equal(accepted.fits, true);
    assert.equal(accepted.execution.attempts.at(-1).outputs.length, 8);
    // Observe the accepted execution through its complete behavior and drawing proof.
    await waitForCondition('revised sequence and pixels', async () => {
      const value = await snapshot(browser.client);
      const end = Math.max(...value.spec.activityProgram.actions.map(row => row.endSeconds));
      return { ok: value.state.activity.time >= end && value.verdict === 'pass',
        time: value.state.activity.time, end, verdict: value.verdict, failures: value.failures };
    }, 180000, { extendOnProgress: true, stallTimeoutMs: 90000,
      progressSignature: value => `${value.time}:${value.verdict}:${value.failures}` });
    const complete = await snapshot(browser.client, true);
    assert.equal(complete.sequenceProof.pass, true);
    assert.equal(complete.sequenceProof.coverage.forcesValidated, true);
    assert.equal(complete.sequenceProof.coverage.liquidTransferValidated, true);
    const shot = await browser.client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const screenshot = `${viewport.width}x${viewport.height}.png`;
    await fs.writeFile(path.join(out, screenshot), Buffer.from(shot.data, 'base64'));
    await changeDrinkDuration(browser.client, 3);
    await waitForCondition('fast liquid trajectory is refused before drawing', async () => {
      const value = await snapshot(browser.client);
      return { ok: value.statusState === 'error', status: value.status };
    }, 60000);
    const fastRejected = await snapshot(browser.client);
    assert.equal(fastRejected.spec.contentHash, complete.spec.contentHash);
    assert.match(fastRejected.status, /positive effective normal gravity/);
    assert.equal(fastRejected.execution.attempts.at(-1).outputs.length, 6);
    await pickObject(browser.client, 'support');
    await evaluate(browser.client, `document.querySelector('.activity-object-editor > button').click()`);
    await waitForCondition('unsupported revision keeps the accepted world', async () => {
      const value = await snapshot(browser.client);
      return { ok: value.statusState === 'error', status: value.status };
    }, 60000);
    const rejected = await snapshot(browser.client);
    assert.equal(rejected.spec.contentHash, complete.spec.contentHash);
    assert.match(rejected.status, /placement surface/);
    assert.equal(rejected.execution.status, 'failed');
    assert.equal(rejected.execution.attempts.at(-1).outputs.length, 6);
    const roundtrip = await evaluate(browser.client, `(() => {
      const api = window.SimulattePhysicsModel, spec = window.SimulattePhysicsLab._browserLab.getSpec();
      const imported = api.deserializeSpec(api.serializeSpec(spec, { retainPhaseSources: true }));
      return { world: imported.contentHash, activity: imported.activityProgram.contentHash };
    })()`);
    assert.equal(roundtrip.world, complete.spec.contentHash);
    assert.equal(roundtrip.activity, complete.spec.activityProgram.contentHash);
    rows.push({ viewport, evidence: 'local browser WebGPU; mobile viewport is emulated', screenshot,
      screenshotHash: createHash('sha256').update(Buffer.from(shot.data, 'base64')).digest('hex'),
      accepted: complete, fastRejected, rejected, roundtrip });
    await fs.writeFile(path.join(out, 'report.json'), JSON.stringify({ schema: 'simulatte.activityRevisionBrowserAudit.v1',
      sourceHashes, prompt, rows }, null, 2));
    console.log(JSON.stringify({ viewport, revision: 5, verdict: complete.verdict, unsupportedPreservedPrevious: true }));
  } catch (error) {
    await fs.writeFile(path.join(out, `${viewport.width}x${viewport.height}-failure.json`), JSON.stringify({
      error: error.message, diagnostics: await snapshot(browser.client).catch(() => null) }, null, 2));
    throw error;
  } finally { await browser.close(); }
}

for (const [file, hash] of Object.entries(sourceHashes)) {
  assert.equal(createHash('sha256').update(await fs.readFile(path.resolve(root, 'public/blank', file))).digest('hex'), hash, `Audit source changed: ${file}`);
}
