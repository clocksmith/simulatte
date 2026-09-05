#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openBrowserAudit } from './simulatte/browser-session.mjs';
import { prepareAuditOutput } from './audit-output.mjs';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outAt = process.argv.indexOf('--out');
const out = path.resolve(outAt >= 0 ? process.argv[outAt + 1] : path.join(project, 'artifacts/data-workbench'));
const previousOutput = await prepareAuditOutput(out, ['simulatte.workbenchBrowserAudit.v1']);
const browser = await openBrowserAudit({ publicRoot: path.join(project, 'public') });
const { client: cdp, host: { server } } = browser;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const errors = [];
const report = { schema: 'simulatte.workbenchBrowserAudit.v1', previousOutput, cases: [], errors, pass: false };
try {
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
  cdp.on('Runtime.exceptionThrown', (event) => errors.push(event.exceptionDetails));
  const evaluate = async (expression) => {
    const value = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (value.exceptionDetails) throw new Error(JSON.stringify(value.exceptionDetails));
    return value.result.value;
  };
  const wait = async (expression, timeout = 15000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) { if (await evaluate(expression)) return; await delay(50); }
    throw new Error(`Timed out: ${expression}; ${await evaluate('document.getElementById("data-status")?.textContent')}`);
  };
  const click = (id) => evaluate(`document.getElementById(${JSON.stringify(id)}).click()`);
  for (const [width, height] of [[1440, 1000], [390, 844]]) {
    const name = `${width}x${height}`;
    const downloadDir = path.join(out, name); await fs.mkdir(downloadDir, { recursive: true });
    await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDir });
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 500 });
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/` });
    await wait('Boolean(window.SimulatteDataWorkbench)');
    assert.equal(await evaluate('Boolean(window.SimulatteAutonomyApp)'), false, 'Data start must not boot profile runtime');
    assert.equal(await evaluate('document.getElementById("data-page").hidden'), true, 'The data form must not replace the simulation home');
    assert.equal(await evaluate('document.querySelectorAll("#simulation-home .hex-satellite").length'), 6);
    assert.equal(await evaluate('document.getElementById("simulation-home").hidden'), false);
    await evaluate(`Promise.all(document.getAnimations().filter(animation => animation.effect.getTiming().iterations !== Infinity).map(animation => animation.finished))`);
    const homeLayout = await evaluate(`(() => { const home = document.getElementById('simulation-home'); return { width: home.clientWidth, scrollWidth: home.scrollWidth, opacity: getComputedStyle(document.querySelector('.hex-constellation-container')).opacity }; })()`);
    assert.ok(homeLayout.scrollWidth <= homeLayout.width + 1, 'Simulation home must not overflow horizontally');
    assert.equal(homeLayout.opacity, '1', 'Capture the settled home, not its entrance animation');
    const homeShot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    await fs.writeFile(path.join(out, `home-${name}.png`), Buffer.from(homeShot.data, 'base64'));
    await click('open-data');
    await wait('!document.getElementById("data-page").hidden');
    await click('data-sample'); await wait('!document.getElementById("data-prepare-panel").hidden');
    await click('data-prepare'); await click('data-run');
    await wait('Boolean(window.SimulatteDataWorkbench.getResult())');
    const initial = await evaluate('window.SimulatteDataWorkbench.getResult().frames.at(-1).points');
    assert.deepEqual(initial[0], { id: 'a', label: 'Alpha', x: 10, y: 4 });
    await evaluate(`(() => { const frames = SimulatteDataWorkbench.getResult().frames; const canvas = document.getElementById('data-canvas'); const rect = canvas.getBoundingClientRect(); const project = SimulattePointSceneView.projection(SimulattePointSceneView.bounds(frames), rect.width, rect.height); const point = project(frames.at(-1).points[0]); canvas.dispatchEvent(new MouseEvent('click', {clientX:rect.left+point.x,clientY:rect.top+point.y})); })()`);
    assert.equal(await evaluate('document.getElementById("data-selection").textContent'), 'a: x=10, y=4');
    await evaluate(`document.getElementById('data-step').value = '0'; document.getElementById('data-step').dispatchEvent(new Event('input'));`);
    assert.equal(await evaluate('document.getElementById("data-selection").textContent'), 'a: x=0, y=0');
    await evaluate(`(() => { const editor = document.getElementById('data-editor'); const value = JSON.parse(editor.value); value.objects[0].vx = 2; editor.value = JSON.stringify(value); editor.dispatchEvent(new Event('input', {bubbles:true})); })()`);
    assert.equal(await evaluate('document.getElementById("data-run").disabled'), true);
    await click('data-apply'); await click('data-run');
    await wait('Boolean(window.SimulatteDataWorkbench.getResult())');
    assert.equal(await evaluate('window.SimulatteDataWorkbench.getComparison().changed'), 1);
    await click('data-replay'); await wait('document.getElementById("data-workbench").dataset.replay === "pass"');
    const receipt = await evaluate('window.SimulatteDataWorkbench.getResult().receipt');
    await click('data-export');
    let exported;
    for (let attempt = 0; attempt < 60 && !exported; attempt += 1) {
      exported = (await fs.readdir(downloadDir)).find((file) => file.endsWith('.world.json'));
      if (!exported) await delay(50);
    }
    assert.ok(exported, 'Actual program download missing');
    const downloaded = await fs.readFile(path.join(downloadDir, exported), 'utf8');
    assert.equal(JSON.parse(downloaded).authorship.revision, 1);
    await evaluate(`(() => { const file = new File([${JSON.stringify(downloaded)}], 'reimport.world.json', {type:'application/json'}); const transfer = new DataTransfer(); transfer.items.add(file); const input = document.getElementById('data-file'); input.files = transfer.files; input.dispatchEvent(new Event('change')); })()`);
    await wait('Boolean(window.SimulatteDataWorkbench.getSpec()) && !document.getElementById("data-run").disabled');
    await click('data-run'); await wait('Boolean(window.SimulatteDataWorkbench.getResult())');
    assert.equal(await evaluate('window.SimulatteDataWorkbench.getResult().receipt.outputSha256'), receipt.outputSha256);
    await evaluate(`document.getElementById('data-step').value = '0'; document.getElementById('data-step').dispatchEvent(new Event('input')); document.getElementById('data-canvas').scrollIntoView({block:'center'});`);
    await delay(100);
    const layout = await evaluate(`(() => { const host = document.getElementById('world-tiers-landing-page'); const canvas = document.getElementById('data-canvas'); const rect = canvas.getBoundingClientRect(); return {width:host.clientWidth, scrollWidth:host.scrollWidth, canvas:rect.toJSON(), pointCount:canvas.dataset.pointCount, backend:canvas.dataset.rendererBackend, step:canvas.dataset.step, smallButtons:[...host.querySelectorAll('button, select, summary')].filter(e=>e.getClientRects().length && e.getBoundingClientRect().height<44).map(e=>e.id), build:document.querySelector('meta[name="simulatte-build"]').content}; })()`);
    assert.ok(layout.scrollWidth <= layout.width + 1, 'Horizontal overflow');
    assert.ok(layout.canvas.width > 200 && layout.canvas.height >= 300);
    assert.deepEqual(layout.smallButtons, []);
    assert.equal(layout.backend, 'canvas2d'); assert.equal(layout.pointCount, '3'); assert.equal(layout.step, '0');
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    await fs.writeFile(path.join(out, `${name}.png`), Buffer.from(shot.data, 'base64'));
    await evaluate(`document.getElementById('data-input').value = 'x,x\\n1,2'`);
    await click('data-read'); await wait('document.getElementById("data-workbench").dataset.state === "error"');
    assert.equal(await evaluate('document.getElementById("data-run").disabled'), true);
    await click('data-sample'); await wait('!document.getElementById("data-prepare-panel").hidden');
    await click('data-prepare'); await click('data-run'); await click('data-cancel');
    await delay(100);
    assert.equal(await evaluate('window.SimulatteDataWorkbench.getResult()'), null);
    await click('data-run'); await wait('Boolean(window.SimulatteDataWorkbench.getResult())');
    report.cases.push({ name, layout, receipt, exported, edit: 'pass', replay: 'pass', reimport: 'pass', malformedRecovery: 'pass', cancellation: 'pass' });
    console.log(`${name}: import/edit/run/replay/export/reimport/recovery/cancellation passed`);
  }
  await evaluate(`location.hash = ''`);
  await wait('!document.getElementById("simulation-home").hidden');
  await evaluate(`document.querySelector('.tier-card[data-tier="city"]').focus()`);
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await wait('Boolean(window.SimulatteAutonomyApp)', 30000);
  await wait('document.getElementById("world-tiers-landing-page").classList.contains("hidden")', 30000);
  report.profileRuntime = { lazyLoaded: true, route: await evaluate('location.pathname') };
  assert.equal(errors.length, 0, JSON.stringify(errors));
  report.pass = true;
} catch (error) {
  report.failure = error.stack;
  process.exitCode = 1;
  console.error(error);
} finally {
  await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  await browser.close();
}
