import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { openBrowserAudit } from './browser-session.mjs';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const registry = require('../../public/simulatte/app/world-runtime-script-manifest.js');
const profiles = Object.keys(registry.profilePlugins).map(id => {
  const profile = JSON.parse(fs.readFileSync(path.join(root, 'public/data/application-profiles', `${id}.json`), 'utf8'));
  return { id, tier: profile.tier || 'city', scenarioCount: profile.seeds.length };
});
const selected = process.argv.includes('--profile') ? profiles.filter(row => row.id === process.argv[process.argv.indexOf('--profile') + 1]) : profiles;
if (!selected.length) throw new Error('No registered profile selected');
const output = path.resolve(root, process.env.SIMULATTE_UI_AUDIT_OUT || 'artifacts/interface-repair/after');
fs.mkdirSync(output, { recursive: true });
const software = process.argv.includes('--software');
const vulkan = process.argv.includes('--vulkan');
if (software && vulkan) throw new Error('Choose either --software or --vulkan');
const report = { schema: 'simulatte.simulationInterfaceAudit.v1', startedAt: new Date().toISOString(),
  evidence: 'Local browser UI, DOM geometry, renderer receipts, and screenshots; not scientific or deployed validation',
  softwareRequested: software, vulkanRequested: vulkan, profiles: [], recovery: null, failures: [] };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const browser = await openBrowserAudit({ publicRoot: path.join(root, 'public'), viewport: { width: 1440, height: 1000 },
  webgpu: true, linuxVulkan: vulkan, headed: process.env.SIMULATTE_UI_HEADED === '1',
  args: ['--no-sandbox', '--disable-dev-shm-usage', ...(vulkan ? ['--disable-vulkan-surface'] : []), ...(software ? ['--use-angle=swiftshader', '--use-webgpu-adapter=swiftshader', '--enable-unsafe-swiftshader'] : [])] });
const { client } = browser;
let consoleEvents = [];
client.on('Runtime.exceptionThrown', row => consoleEvents.push({ type: 'exception', message: row.exceptionDetails?.exception?.description || row.exceptionDetails?.text }));
client.on('Runtime.consoleAPICalled', row => {
  if (['error', 'warning', 'assert'].includes(row.type)) consoleEvents.push({ type: row.type, message: row.args.map(arg => arg.value ?? arg.description).join(' ') });
});
async function evaluate(expression) {
  const result = await client.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}
async function snapshot() {
  return evaluate(`(() => {
    if (!document.body || !document.getElementById('application-profile')) return { phase: 'loading', loading: true };
    const visible = element => Boolean(element && !element.hidden && element.getClientRects().length && element.checkVisibility({ visibilityProperty: true, opacityProperty: true }));
    const canvas = document.getElementById('overlay-canvas');
    const active = visible(canvas) ? canvas : document.getElementById('autonomy-canvas');
    const receipt = active?.__simulatteRenderReceipt?.() || null;
    return { phase: document.body.dataset.journeyPhase, loading: document.body.dataset.routeLoading || null,
      profile: document.getElementById('application-profile').value,
      status: document.getElementById('runtime-status').textContent.trim(),
      statusVisible: visible(document.getElementById('runtime-status')) && document.getElementById('runtime-status').getBoundingClientRect().width > 4 && getComputedStyle(document.getElementById('runtime-status')).clipPath === 'none',
      parameters: Object.fromEntries((globalThis.__simulattePluginPlatformV4?.contributions || []).map(c => [c.pluginId, Object.fromEntries(c.controls.controls.map(row => [row.id, row.value]))])),
      error: globalThis.__simulatteLastFailError?.message || null,
      input: document.getElementById('mission-input').value,
      inputVisible: visible(document.getElementById('mission-input')),
      scene: active?.getBoundingClientRect().toJSON(), backend: receipt?.backend || null,
      adapter: receipt?.adapter || null, frames: receipt?.frameCount || Number(active?.dataset.frameCount || 0),
      camera: active?.dataset.cameraView || JSON.stringify({ eye: active?.dataset.cameraEye, target: active?.dataset.cameraTarget }),
      mode: active?.dataset.viewMode || active?.dataset.cameraMode,
      progress: Number(document.getElementById('playback-timeline').value),
      total: Number(document.getElementById('playback-timeline').max),
      width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth,
      dock: document.getElementById('sim-mission-dock').getBoundingClientRect().toJSON(),
      canPause: visible(document.getElementById('pause-button')) && !document.getElementById('pause-button').disabled,
      canReset: visible(document.getElementById('reset-button')) && !document.getElementById('reset-button').disabled,
      ownerIds: [...new Set([...document.querySelectorAll('[data-plugin-control]')].map(e => e.closest('[data-plugin-id]').dataset.pluginId))],
      buttons: [...document.querySelectorAll('.simulation-stage button')].filter(visible).map(e => ({ id: e.id, disabled: e.disabled, title: e.title, text: e.textContent.trim() })),
    };
  })()`);
}
async function navigate(url) {
  const loaded = client.waitForEvent('Page.domContentEventFired');
  await client.send('Page.navigate', { url });
  await loaded;
}
async function waitFor(predicate, label, timeoutMs = 65000) {
  const deadline = Date.now() + timeoutMs;
  let state;
  do {
    state = await snapshot();
    if (state.error || state.phase === 'failed') throw new Error(`${label}: ${state.error || state.status}`);
    if (predicate(state)) return state;
    await delay(100);
  } while (Date.now() < deadline);
  throw new Error(`${label} timed out: ${JSON.stringify(state)}`);
}
async function click(selector) {
  const rect = await evaluate(`(() => { const e = document.querySelector(${JSON.stringify(selector)});
    if (!e || e.disabled || !e.checkVisibility({ visibilityProperty: true, opacityProperty: true })) throw Error('Unavailable control: '+${JSON.stringify(selector)});
    e.scrollIntoView({ block: 'center', behavior: 'instant' }); const r=e.getBoundingClientRect();
    const x=r.x+r.width/2,y=r.y+r.height/2;
    if (!e.contains(document.elementFromPoint(x,y))) throw Error('Obscured control: '+${JSON.stringify(selector)});
    return {x,y}; })()`);
  await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...rect, button: 'left', clickCount: 1 });
  await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...rect, button: 'left', clickCount: 1 });
}
async function key(key, code = key) {
  await client.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code });
  await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code });
}
async function screenshot(name) {
  await evaluate('window.scrollTo(0,0)');
  const metrics = await client.send('Page.getLayoutMetrics');
  const size = metrics.cssContentSize || metrics.contentSize;
  const image = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true,
    clip: { x: 0, y: 0, width: Math.min(size.width, 1600), height: Math.min(size.height, 4000), scale: 1 } });
  const file = path.join(output, `${name}.png`);
  fs.writeFileSync(file, Buffer.from(image.data, 'base64'));
  return path.relative(root, file);
}
function check(condition, message) { if (!condition) throw new Error(message); }
async function exercise(row, viewport) {
  consoleEvents = [];
  const result = { profileId: row.id, viewport, checks: [], screenshots: [] };
  try {
    await client.send('Emulation.setDeviceMetricsOverride', { ...viewport, deviceScaleFactor: 1, mobile: viewport.width < 700 });
    await client.send('Emulation.setTouchEmulationEnabled', { enabled: viewport.width < 700, maxTouchPoints: 2 });
    await navigate(`${browser.host.baseUrl}${row.tier}/${row.id}`);
    await waitFor(s => !s.loading && s.phase === 'ready' && s.profile === row.id && s.frames > 0, 'initial frame');
    await delay(1500);
    const ready = await snapshot();
    result.initial = ready;
    check(!ready.inputVisible && ready.input === '', 'Scenario selection populated or displayed prompt input');
    check(ready.statusVisible, 'Runtime status label is visually hidden');
    check(ready.scrollWidth <= viewport.width + 1, 'Horizontal page overflow');
    check(Math.abs(ready.scene.x - (viewport.width - ready.scene.right)) < 2, 'Unequal viewport gutters');
    check(ready.scene.height >= 300 && ready.dock.top >= ready.scene.bottom, 'Viewport or controls overlap');
    result.checks.push('initial frame', 'centered viewport', 'no prompt autofill', 'non-overlapping controls', 'visible status label');
    result.screenshots.push(await screenshot(`${row.id}-${viewport.width}-ready`));

    const canvasSelector = row.tier === 'city' ? '#autonomy-canvas' : '#overlay-canvas';
    await click(canvasSelector);
    check(await evaluate(`document.activeElement === document.querySelector('${canvasSelector}')`), 'Pointer did not focus the simulation canvas');
    await delay(600);
    const beforeKey = await snapshot();
    await key('ArrowRight');
    await delay(600);
    const explored = await snapshot();
    check(explored.camera !== beforeKey.camera, 'Keyboard exploration did not move the camera');
    await click('#camera-reset');
    await delay(1100);
    const restored = await snapshot();
    check(restored.mode === 'overview' || restored.mode === 'bird', 'Reset view did not restore profile overview');
    check(restored.progress === ready.progress, 'Reset view changed simulation progress');
    result.checks.push('keyboard camera', 'reset view without simulation reset');

    const resizedWidth = viewport.width < 700 ? 520 : 1000;
    await client.send('Emulation.setDeviceMetricsOverride', { ...viewport, width: resizedWidth, deviceScaleFactor: 1, mobile: viewport.width < 700 });
    await delay(600);
    const resized = await snapshot();
    check(resized.profile === row.id && resized.progress === restored.progress && resized.frames > 0, 'Live resize lost simulation state');
    check(resized.scrollWidth <= resizedWidth + 1 && Math.abs(resized.scene.x - (resizedWidth - resized.scene.right)) < 2, 'Live resize broke viewport alignment');
    await client.send('Emulation.setDeviceMetricsOverride', { ...viewport, deviceScaleFactor: 1, mobile: viewport.width < 700 });
    await delay(600);
    result.checks.push('live resize preserves simulation state');

    if (viewport.width < 700) {
      const point = await evaluate(`(() => {const e=document.querySelector('${canvasSelector}');e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
      await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...point, id: 1 }] });
      await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: point.x + 36, y: point.y + 18, id: 1 }] });
      await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await delay(300);
      check((await snapshot()).mode === 'free', 'Touch exploration was not retained');
      await click('#camera-reset');
      result.checks.push('touch camera');
    }
    await click('#start-button');
    let run = await waitFor(s => s.canPause || s.phase === 'completed', 'run');
    if (run.canPause) {
      await click('#pause-button');
      run = await waitFor(s => s.phase === 'paused' || s.phase === 'completed', 'pause');
      if (run.phase === 'paused') {
        const before = run.progress; await delay(400);
        check((await snapshot()).progress === before, 'Simulation advanced while paused');
        result.checks.push('pause stops simulation progress');
      }
    }
    result.run = run;
    result.checks.push('run');
    await click('#experience-summary > summary');
    result.screenshots.push(await screenshot(`${row.id}-${viewport.width}-result`));
    if (run.canReset) {
      await click('#reset-button');
      await waitFor(s => !s.loading && s.phase === 'ready' && s.progress === 0 && ready.ownerIds.every(id => s.ownerIds.includes(id)), 'reset simulation with restored controls');
      result.checks.push('reset simulation');
    }
    await click('#decisions-button');
    await delay(100);
    check(await evaluate(`document.getElementById('decisions-drawer').getAttribute('aria-hidden')==='false'`), 'Inspector did not open');
    const mutation = await evaluate(`(() => {
      const input=[...document.querySelectorAll('[data-plugin-control]')].find(e=>e.checkVisibility({ visibilityProperty: true, opacityProperty: true }) && (e.type==='number'||e.type==='range'||e.tagName==='SELECT'&&!e.multiple&&e.options.length>1));
      if(!input)return null;
      const before=input.value;
      if(input.tagName==='SELECT')input.selectedIndex=(input.selectedIndex+1)%input.options.length;
      else {const step=Number(input.step)||1;const value=Number(input.value);input.value=String(input.max!==''&&value+step>Number(input.max)?value-step:value+step);}
      const result={id:input.dataset.pluginControl,owner:input.closest('[data-plugin-id]').dataset.pluginId,before,after:input.value};
      input.focus();input.dispatchEvent(new Event('change',{bubbles:true}));return result;
    })()`);
    check(Boolean(mutation), 'No editable declared parameter');
    await waitFor(s => !s.loading && s.phase === 'ready' && String(s.parameters[mutation.owner]?.[mutation.id]) === mutation.after, 'apply parameter');
    await delay(400);
    const bound = await evaluate(`(() => {const m=${JSON.stringify(mutation)};return globalThis.__simulattePluginPlatformV4?.contributions.find(c=>c.pluginId===m.owner)?.controls.controls.find(c=>c.id===m.id)?.value;})()`);
    check(String(bound) === mutation.after, 'Parameter DOM and simulation contribution disagree');
    result.parameter = mutation;
    result.checks.push('parameter applies to running contract');
    const applySelector = 'button[data-plugin-action$=".configuration.apply"]';
    if (await evaluate(`Boolean(document.querySelector('${applySelector}'))`)) {
      const draft = await evaluate(`(() => {
        const first=${JSON.stringify(mutation.id)};
        const input=[...document.querySelectorAll('[data-plugin-control]')].find(e=>e.dataset.pluginControl!==first && e.checkVisibility({ visibilityProperty: true, opacityProperty: true }) && e.tagName==='SELECT' && !e.multiple && e.options.length>1);
        if(!input)throw Error('No configuration draft control');
        const before=input.value;input.selectedIndex=(input.selectedIndex+1)%input.options.length;
        const result={id:input.dataset.pluginControl,owner:input.closest('[data-plugin-id]').dataset.pluginId,before,after:input.value};
        input.dispatchEvent(new Event('change',{bubbles:true}));return result;
      })()`);
      await delay(100);
      check(await evaluate(`document.getElementById('start-button').disabled`), 'Unapplied configuration did not block Run');
      const beforeApply = await evaluate(`globalThis.__simulattePluginPlatformV4.contributions.find(c=>c.pluginId===${JSON.stringify(draft.owner)}).controls.controls.find(c=>c.id===${JSON.stringify(draft.id)}).value`);
      check(String(beforeApply) === draft.before, 'Draft changed the running simulation before Apply');
      await click(applySelector);
      await waitFor(s => !s.loading && s.phase === 'ready' && String(s.parameters[draft.owner]?.[draft.id]) === draft.after, 'explicit configuration apply');
      const afterApply = await evaluate(`globalThis.__simulattePluginPlatformV4.contributions.find(c=>c.pluginId===${JSON.stringify(draft.owner)}).controls.controls.find(c=>c.id===${JSON.stringify(draft.id)}).value`);
      check(String(afterApply) === draft.after, 'Apply did not bind configuration');
      result.configuration = draft;
      result.checks.push('explicit draft and configuration apply');
    }
    await key('Escape');
    check(await evaluate(`document.activeElement.id==='decisions-button' && document.getElementById('decisions-drawer').inert`), 'Inspector focus did not return');
    result.checks.push('inspector keyboard and focus return');
    if (row.scenarioCount > 1) {
      await evaluate(`(() => {const e=document.getElementById('scenario-select');e.selectedIndex=e.options.length-1;e.dispatchEvent(new Event('change',{bubbles:true}));e.selectedIndex=0;e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      await waitFor(s => !s.loading && s.phase === 'ready', 'rapid scenario selection');
      const scenario = await evaluate(`({selected:document.getElementById('scenario-select').value,first:document.getElementById('scenario-select').options[0].value,url:new URL(location.href).searchParams.get('scenario')})`);
      check(scenario.selected === scenario.first, 'A stale scenario update won the race');
      result.checks.push('rapid scenario selection');
    }
    result.final = await snapshot();
    check(!result.final.error && result.final.input === '', 'Final state contains an error or generated prompt');
    result.pass = true;
  } catch (error) {
    result.pass = false; result.error = error.message;
    report.failures.push(`${row.id} ${viewport.width}: ${error.message}`);
    try { result.screenshots.push(await screenshot(`${row.id}-${viewport.width}-failure`)); } catch (captureError) { result.captureError = captureError.message; }
  }
  result.console = [...consoleEvents];
  const unhandled = consoleEvents.filter(event => event.type === 'exception');
  if (unhandled.length && result.pass) {
    result.pass = false; result.error = unhandled.map(row => row.message).join('\n');
    report.failures.push(`${row.id} ${viewport.width}: unhandled browser exception`);
  }
  console.log(JSON.stringify({ profile: row.id, width: viewport.width, pass: result.pass, checks: result.checks, error: result.error }));
  return result;
}
try {
  await client.send('Page.enable'); await client.send('Runtime.enable'); await client.send('Network.enable');
  await client.send('Network.setCacheDisabled', { cacheDisabled: true });
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    for (const row of selected) {
      report.profiles.push(await exercise(row, viewport));
      fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
    }
  }
  // A failed selected-profile acquisition must be visible, then recover on a fresh selection.
  const remove = client.on('Fetch.requestPaused', event => {
    void client.send('Fetch.failRequest', { requestId: event.requestId, errorReason: 'Failed' });
  });
  await client.send('Fetch.enable', { patterns: [{ urlPattern: '*application-profiles/gpu-supercluster-v1.json*', requestStage: 'Request' }] });
  await navigate(`${browser.host.baseUrl}datacenter/gpu-supercluster-v1`);
  await delay(2500);
  const failure = await snapshot();
  await client.send('Fetch.disable'); remove();
  await navigate(`${browser.host.baseUrl}datacenter/gpu-supercluster-v1`);
  const recovered = await waitFor(s => !s.loading && s.phase === 'ready' && s.profile === 'gpu-supercluster-v1', 'failed load recovery');
  report.recovery = { failureObserved: failure.phase === 'failed' || Boolean(failure.error), recovered: recovered.phase === 'ready' };
  if (!report.recovery.failureObserved) report.failures.push('Injected acquisition failure was not surfaced');
  report.pass = report.failures.length === 0;
} catch (error) { report.failures.push(error.message); report.pass = false; }
finally {
  report.browser = { executable: browser.chromePath, arguments: browser.launchArguments, process: browser.processOutput.snapshot() };
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  await browser.close();
}
console.log(JSON.stringify({ pass: report.pass, failures: report.failures, report: path.relative(root, path.join(output, 'report.json')) }, null, 2));
if (!report.pass) process.exitCode = 1;
