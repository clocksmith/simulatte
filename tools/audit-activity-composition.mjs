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
const out = path.join(root, 'artifacts/activity-composition');
const require = createRequire(import.meta.url);
const manifest = require('../public/blank/app/runtime-script-manifest.js');
const sources = [...new Set([...manifest.browser, ...manifest.pipelineWorker,
  ...manifest.libraryModules, ...manifest.libraryAssets, 'index.html', 'styles.css', 'app/runtime-script-manifest.js'])].sort();
const sourceHashes = Object.fromEntries(await Promise.all(sources.map(async file => [file,
  createHash('sha256').update(await fs.readFile(path.resolve(root, 'public/blank', file))).digest('hex')])));
const viewportArgument = process.argv.find(argument => argument.startsWith('--viewport='));
const viewports = [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]
  .filter(viewport => !viewportArgument || `${viewport.width}x${viewport.height}` === viewportArgument.slice(11));
assert.ok(viewports.length, 'Viewport must be 1440x1000 or 390x844');
await fs.mkdir(out, { recursive: true });
const rows = [];
if (viewportArgument) {
  const previous = await fs.readFile(path.join(out, 'report.json'), 'utf8').then(JSON.parse).catch(() => null);
  if (previous) {
    assert.deepEqual(previous.sourceHashes, sourceHashes, 'Saved evidence must bind these exact sources');
    rows.push(...previous.rows.filter(row => !viewports.some(viewport => viewport.width === row.viewport.width)));
  }
}
const snapshot = client => evaluate(client, `(() => {
  const lab = window.SimulattePhysicsLab._browserLab, spec = lab.getSpec(), state = lab.getState(), run = lab.getPipelineRun();
  const canvas = document.getElementById('physics-canvas');
  return { hash: spec?.contentHash, prompt: spec?.source.prompt, revision: spec?.authorship?.revision || 0,
    actions: spec?.activityProgram?.actions.map(row => ({ id: row.id, action: row.action, hand: row.hand, objectId: row.objectId, primitive: row.component.execution.primitive })),
    objects: spec?.activityProgram?.objects.map(row => ({ id: row.id, radius: row.radius, capabilities: row.capabilities, fields: row.authoringFields })),
    unsupported: spec?.activityProgram?.unsupported, time: state.activity?.time,
    end: Math.max(...(spec?.activityProgram?.actions.map(row => row.endSeconds) || [0])),
    proof: state.activity ? window.SimulattePhysicsModel.proveActivitySequence(spec.activityProgram, state.activity) : null,
    library: spec?.source.compilerConfig.activityComponentLibrary?.id,
    controller: window.SimulatteCreateController.snapshot().state, message: window.SimulatteCreateController.snapshot().message,
    status: document.querySelector('#create-activity-editor > [role="status"]')?.dataset.state,
    statusText: document.querySelector('#create-activity-editor > [role="status"]')?.textContent,
    verdict: canvas.dataset.sceneProofVerdict, failures: canvas.dataset.sceneProofRequiredFailures,
    execution: run && { revision: run.revision, status: run.status, outputs: run.attempts.at(-1)?.outputs.map(row => ({ phase: row.phase, binding: row.binding })) },
    fits: document.documentElement.scrollWidth <= innerWidth };
})()`);
async function waitAccepted(client, predicate) {
  return waitForCondition('accepted composition', async () => {
    const value = await snapshot(client);
    if (value.status === 'error') throw new Error(value.statusText);
    return { ...value, ok: value.execution?.status === 'completed' && predicate(value) };
  }, 60000);
}
async function importPayload(client, payloadExpression) {
  await evaluate(client, `(() => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([${payloadExpression}], 'composition.world.json', { type: 'application/json' }));
    const input = document.getElementById('world-spec-import-file');
    input.files = transfer.files; input.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
}
for (const viewport of viewports) {
  await fs.rm(path.join(out, `${viewport.width}x${viewport.height}-failure.json`), { force: true });
  const browser = await openBrowserAudit({ publicRoot: path.join(root, 'public'), viewport, webgpu: true });
  const families = [];
  try {
    await setupPage(browser.client, `${browser.host.baseUrl}blank/?auditNoInitial=1`, viewport.width, viewport.height, 30000, 'local');
    const cases = [
      { prompt: 'a person holds a ball in the left hand while walking', extension: false },
      { prompt: 'a person steady a book in the left hand while holding a phone in the right hand then places the book on a table with the left hand', extension: true },
    ];
    for (const fixture of cases) {
      console.log(`${viewport.width}x${viewport.height}: importing ${fixture.extension ? 'declared extension' : 'built-in composition'}`);
      await evaluate(browser.client, `(() => {
        const model = window.SimulattePhysicsModel;
        const component = structuredClone(model.activityCapabilityInventory().components.find(row => row.id === 'hold'));
        component.id = 'steady'; component.languageForms = ['steady'];
        const library = { schema: 'simulatte.activityComponentLibrary.v1', id: 'browser-composition.v1', components: [component] };
        const spec = model.createSpecFromPrompt(${JSON.stringify(fixture.prompt)}, { deterministicRuntime: true,
          ${fixture.extension ? 'activityComponentLibrary: library,' : ''} });
        window.activityCompositionAuditPayload = model.serializeSpec(spec, { retainPhaseSources: true });
      })()`);
      await importPayload(browser.client, 'window.activityCompositionAuditPayload');
      const initial = await waitAccepted(browser.client, value => value.prompt === fixture.prompt && value.revision === 0);
      assert.deepEqual(initial.unsupported, []);
      assert.ok(initial.objects.every(object => object.fields.length));
      if (fixture.extension) {
        assert.equal(initial.actions[0].action, 'steady');
        assert.equal(initial.actions[0].primitive, 'hold');
        assert.equal(initial.library, 'browser-composition.v1');
      }
      await evaluate(browser.client, `document.querySelector('.activity-timeline > button').click()`);
      const swapped = await waitAccepted(browser.client, value => value.revision === 1 && value.status === 'ready');
      assert.deepEqual(swapped.actions.map(row => row.id), initial.actions.map(row => row.id));
      assert.deepEqual(swapped.objects.map(row => row.id), initial.objects.map(row => row.id));
      assert.equal(swapped.actions[0].hand, 'right');
      await evaluate(browser.client, `(() => {
        const form = document.querySelector('.activity-object-editor form');
        const input = [...form.querySelectorAll('label')].find(row => row.textContent === 'Radius (m)').querySelector('input');
        input.value = '0.04'; form.requestSubmit();
      })()`);
      const revised = await waitAccepted(browser.client, value => value.revision === 2 && value.status === 'ready');
      console.log(`${viewport.width}x${viewport.height}: edits accepted; checking execution and pixels`);
      assert.equal(revised.objects[0].radius, 0.04);
      const completed = await waitForCondition('composition behavior and pixels', async () => {
        const value = await snapshot(browser.client);
        return { ...value, ok: value.time >= value.end && value.proof?.pass && value.verdict === 'pass' };
      }, 180000, { extendOnProgress: true, stallTimeoutMs: 60000, progressSignature: value => `${value.time}:${value.verdict}` });
      assert.equal(completed.fits, true);
      assert.equal(completed.execution.outputs.length, 8);
      await evaluate(browser.client, `window.activityCompositionAuditPayload = window.SimulattePhysicsModel.serializeSpec(window.SimulattePhysicsLab._browserLab.getSpec(), { retainPhaseSources: true })`);
      await importPayload(browser.client, 'window.activityCompositionAuditPayload');
      const roundTrip = await waitAccepted(browser.client, value => value.hash === completed.hash && value.execution.revision > completed.execution.revision);
      assert.deepEqual(roundTrip.actions, completed.actions);
      assert.equal(roundTrip.library, completed.library);
      families.push({ fixture, initial, revised, completed, roundTrip });
      console.log(`${viewport.width}x${viewport.height}: ${fixture.extension ? 'declared extension' : 'built-in composition'} passed`);
    }
    const shot = await browser.client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const screenshot = `${viewport.width}x${viewport.height}.png`;
    await fs.writeFile(path.join(out, screenshot), Buffer.from(shot.data, 'base64'));
    rows.push({ viewport, evidence: 'local browser WebGPU; mobile viewport is emulated', families, screenshot,
      screenshotHash: createHash('sha256').update(Buffer.from(shot.data, 'base64')).digest('hex') });
    await fs.writeFile(path.join(out, 'report.json'), JSON.stringify({ schema: 'simulatte.activityCompositionBrowserAudit.v1', sourceHashes, rows }, null, 2));
  } catch (error) {
    await fs.writeFile(path.join(out, `${viewport.width}x${viewport.height}-failure.json`), JSON.stringify({ error: error.message,
      snapshot: await snapshot(browser.client).catch(failure => ({ error: failure.message })), families }, null, 2));
    throw error;
  } finally { await browser.close(); }
}
