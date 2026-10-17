import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { openBrowserAudit } from './browser-session.mjs';
import { sourceReceipt } from './runtime-audit-sources.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const output = root + 'artifacts/gpu-scene-first';
await fs.mkdir(output, { recursive: true });
const report = { source: await sourceReceipt(root),
  boundary: 'Local Chrome desktop and touch-emulated mobile. Automated interaction and layout evidence, not unfamiliar-user comprehension or physical-device qualification.', cases: [] };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
  const mobile = viewport.width < 700;
  const browser = await openBrowserAudit({ publicRoot: root + 'public', viewport, webgpu: true });
  const client = browser.client;
  const evaluate = async expression => {
    const result = await client.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  const until = async expression => {
    const deadline = Date.now() + 20000;
    while (!await evaluate(expression)) { if (Date.now() > deadline) throw Error('Timed out: ' + expression); await delay(100); }
  };
  const key = async (key, code = key) => {
    await client.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code });
    await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code });
  };
  const pointClick = async point => {
    if (mobile) {
      await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
      await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
      await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 });
    }
  };
  const click = async selector => {
    const point = await evaluate(`(async()=>{const n=document.querySelector(${JSON.stringify(selector)});if(!n||n.disabled)throw Error('Unavailable: '+${JSON.stringify(selector)});n.scrollIntoView({block:'nearest'});await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);const r=n.getBoundingClientRect();if(!r.width||!r.height)throw Error('Hidden control');return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    await pointClick(point);
  };
  const capture = async (row, name) => {
    const file = `${mobile ? 'mobile' : 'desktop'}-${row.theme}-${name}.png`;
    const bytes = Buffer.from((await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })).data, 'base64');
    await fs.writeFile(output + '/' + file, bytes);
    row.screenshots.push({ file, sha256: createHash('sha256').update(bytes).digest('hex') });
  };
  try {
    await client.send('Page.enable'); await client.send('Runtime.enable');
    await client.send('Emulation.setDeviceMetricsOverride', { ...viewport, deviceScaleFactor: 1, mobile });
    await client.send('Emulation.setTouchEmulationEnabled', { enabled: mobile });
    for (const theme of ['light', 'dark']) {
      const row = { viewport, theme, checks: [], screenshots: [] }; report.cases.push(row);
      try {
        await client.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme }, { name: 'prefers-reduced-motion', value: 'reduce' }] });
        await client.send('Page.navigate', { url: browser.host.baseUrl + 'datacenter?frame=scene' });
        await until("globalThis.SimulatteActiveSession?.snapshot().preparation==='ready' && document.querySelector('[aria-label=\"Inspect a rack\"]')?.value===''");
        await delay(250);
        row.build = await evaluate("document.querySelector('meta[name=simulatte-build]').content");
        assert.equal(await evaluate('document.documentElement.dataset.theme'), theme);
        assert.equal(await evaluate('SimulatteActiveSession.snapshot().execution'), 'running');
        assert.deepEqual(await evaluate("[...document.querySelectorAll('.gpu-scene__header button')].filter(n=>n.getBoundingClientRect().height).map(n=>n.textContent.trim())"), ['Pause', 'Menu']);
        assert.equal(await evaluate("Math.abs(document.querySelector('#pause-button').getBoundingClientRect().top-document.querySelector('#decisions-button').getBoundingClientRect().top)<2"), true);
        assert.equal(await evaluate("[...document.querySelectorAll('.gpu-scene__header button,.gpu-scene__home')].filter(n=>n.getBoundingClientRect().height).every(n=>{const r=n.getBoundingClientRect();return r.height>=44&&r.width>=44})"), true);
        assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'), true);
        row.checks.push('Autoplay, only Pause/Menu, no horizontal overflow');
        await capture(row, 'opening');

        await click('#pause-button'); await until("SimulatteActiveSession.snapshot().execution==='paused'");
        assert.equal(await evaluate("getComputedStyle(document.querySelector('#resume-button')).color===getComputedStyle(document.querySelector('#decisions-button')).color"), true);
        const before = await evaluate('JSON.stringify(__simulattePluginPlatformV4.contributions[0].state)');
        const camera = await evaluate('JSON.stringify(__simulattePluginPlatformV4.view)');
        const rack = await evaluate(`(()=>{const c=document.querySelector('#overlay-canvas'),r=c.getBoundingClientRect();const t=c.__simulatteObjectTargets().find(t=>t.id.startsWith('rack:')&&t.points[0].x>30&&t.points[0].x<r.width-30&&t.points[0].y>30&&t.points[0].y<r.height-30);return{id:t.id,x:r.x+t.points[0].x,y:r.y+t.points[0].y}})()`);
        await pointClick({ x: rack.x, y: rack.y });
        await until(`document.querySelector('[aria-label="Inspect a rack"]').value===${JSON.stringify(rack.id)}`);
        assert.equal(await evaluate('JSON.stringify(__simulattePluginPlatformV4.contributions[0].state)'), before);
        assert.equal(await evaluate('JSON.stringify(__simulattePluginPlatformV4.view)'), camera);
        await until("document.querySelector('.sim-object-inspector').dataset.placement");
        assert.equal(await evaluate("document.querySelector('.sim-object-inspector').dataset.placement"), mobile ? 'dock' : 'anchor');
        const clear = await evaluate(`(()=>{const c=document.querySelector('#overlay-canvas'),r=c.getBoundingClientRect(),p=document.querySelector('.sim-object-inspector').getBoundingClientRect(),t=c.__simulatteObjectTargets().find(t=>t.id===${JSON.stringify(rack.id)});const b=t.bounds;const left=r.x+Math.min(...b.map(p=>p.x)),right=r.x+Math.max(...b.map(p=>p.x)),top=r.y+Math.min(...b.map(p=>p.y)),bottom=r.y+Math.max(...b.map(p=>p.y));return p.right<=left||p.left>=right||p.bottom<=top||p.top>=bottom})()`);
        assert.equal(clear, true);
        row.checks.push('Pointer/touch rack selection preserves paused state and camera; inspector clears selected rack');
        await click('[data-object-action=straggler]');
        await until("document.querySelector('[data-object-action=straggler]').textContent==='Restore rack'");
        const generation = await evaluate('SimulatteActiveSession.snapshot().generation');
        await click('#resume-button');
        await until(`__simulattePluginPlatformV4.contributions[0].objects.find(o=>o.id===${JSON.stringify(rack.id)}).relatedIds.length>0`);
        await click('#pause-button'); await until("SimulatteActiveSession.snapshot().execution==='paused'");
        row.measurements = await evaluate("document.querySelector('#experience-summary-stats').innerText");
        row.dependentRacks = await evaluate(`__simulattePluginPlatformV4.contributions[0].objects.find(o=>o.id===${JSON.stringify(rack.id)}).relatedIds`);
        assert.match(row.measurements, /Productive compute share/);
        assert.notEqual(await evaluate("document.querySelector('[data-measure-label=\"Waiting added by actions\"] dd').textContent"), '0 rack-ms');
        await capture(row, 'slowed');
        await click('[data-object-action=straggler]');
        await until("document.querySelector('[data-object-action=straggler]').textContent==='Slow rack'");
        assert.equal(await evaluate('SimulatteActiveSession.snapshot().generation'), generation);
        row.checks.push('Live slow/restore, dependent racks and measured wait, no restart');

        await click('.sim-object-inspector .gpu-scene__section > summary');
        await click('.sim-object-inspector .gpu-scene__section > details:last-child > summary');
        await until("document.querySelector('.sim-object-inspector .gpu-scene__section > details:last-child').open");
        await delay(250);
        assert.equal(await evaluate("document.querySelector('.sim-object-inspector').dataset.placement"), 'dock');
        assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'), true);
        await capture(row, 'details');
        await click('[aria-label="Close inspector"]');
        assert.equal(await evaluate('document.activeElement.id'), 'overlay-canvas');
        row.checks.push('Expanded details remain accessible outside scene; closing returns canvas focus');
        await click('#decisions-button');
        await until("document.activeElement.id==='decisions-close'");
        await key('Tab');
        assert.equal(await evaluate("document.querySelector('#decisions-drawer').contains(document.activeElement)"), true);
        await capture(row, 'menu');
        await click('#camera-menu > summary');
        const observed = await evaluate('JSON.stringify(__simulattePluginPlatformV4.contributions[0].state)');
        await click('#camera-top');
        assert.equal(await evaluate('JSON.stringify(__simulattePluginPlatformV4.contributions[0].state)'), observed);
        await click('#camera-reset');
        assert.equal(await evaluate('JSON.stringify(__simulattePluginPlatformV4.contributions[0].state)'), observed);
        await evaluate("(()=>{const s=document.querySelector('#playback-speed');s.value='2';s.dispatchEvent(new Event('change',{bubbles:true}))})()");
        await until("SimulatteActiveSession.snapshot().lastOperation?.id==='speed'");
        assert.equal(await evaluate('SimulatteActiveSession.snapshot().execution'), 'paused');
        await click('.gpu-scene__secondary > button:not([aria-pressed])');
        assert.notEqual(await evaluate('document.documentElement.dataset.themePreference'), 'system');
        await evaluate("SimulatteTheme.setPreference('system')");
        row.checks.push('Camera/Reset preserve paused execution; Speed and Appearance remain available in Menu');
        await key('Escape');
        await until("document.querySelector('#decisions-drawer').getAttribute('aria-hidden')==='true'");
        assert.equal(await evaluate('document.activeElement.id'), 'decisions-button');
        await click('#decisions-button'); await until("document.activeElement.id==='decisions-close'");
        await evaluate(`(()=>{const s=document.querySelector('[aria-label="Inspect a rack"]');s.focus();s.value=${JSON.stringify(rack.id)};s.dispatchEvent(new Event('change',{bubbles:true}))})()`);
        await until("document.activeElement.dataset.objectAction==='straggler'");
        assert.equal(await evaluate("document.querySelector('#decisions-drawer').getAttribute('aria-hidden')"), 'true');
        row.checks.push('Drawer keyboard containment/Escape/return focus; non-spatial rack selector focuses action');
        await click('#decisions-button'); await until("document.activeElement.id==='decisions-close'");
        await click('[data-scene-command=replay]');
        await until("SimulatteActiveSession.snapshot().lastOperation?.id==='replay' && !SimulatteActiveSession.snapshot().pending.length");
        assert.equal(await evaluate('SimulatteActiveSession.snapshot().lastOperation.status'), 'success');
        await click('[data-scene-command=restart]');
        await until("SimulatteActiveSession.snapshot().lastOperation?.id==='restart' && !SimulatteActiveSession.snapshot().pending.length");
        assert.equal(await evaluate('SimulatteActiveSession.snapshot().lastOperation.status'), 'success');
        row.checks.push('Replay and Restart execute through existing session operations');
        row.pass = true;
      } catch (error) { row.error = error.stack; row.pass = false; await capture(row, 'failure'); }
      console.log(`${mobile ? 'mobile' : 'desktop'} ${theme}: ${row.pass ? 'PASS' : row.error}`);
    }
    await client.send('Page.navigate', { url: browser.host.baseUrl + 'datacenter' });
    await until("document.body?.dataset.experienceUi==='unified' && globalThis.SimulatteActiveSession?.snapshot().preparation==='ready'");
    assert.equal(await evaluate("document.querySelectorAll('[data-frame-control]').length"), 7);
    report.cases.push({ viewport, route: '/datacenter', pass: true, checks: ['Current seven-slot comparison frame retained'] });
  } finally {
    await browser.close();
    // Chrome helpers can retain inherited pipes after the browser exits. Release
    // this audit's readers after browser/server cleanup has settled.
    browser.child.stdout?.destroy(); browser.child.stderr?.destroy();
    await fs.writeFile(output + '/report.json', JSON.stringify(report, null, 2) + '\n');
  }
}
if (report.cases.some(row => !row.pass)) process.exitCode = 1;
