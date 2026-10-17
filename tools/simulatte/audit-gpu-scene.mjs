import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { openBrowserAudit } from './browser-session.mjs';
import { sourceReceipt } from './runtime-audit-sources.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const liveBase=process.env.WORLD_AUDIT_BASE;
const output = root + (liveBase?'artifacts/world-ui-live':'artifacts/gpu-scene-first');
await fs.mkdir(output, { recursive: true });
const report = { source: await sourceReceipt(root),
  baseUrl: liveBase || 'local static server',
  boundary: `${liveBase?'Deployed URL':'Local static output'} in Chrome desktop and touch-emulated mobile. Automated interaction and layout evidence, not unfamiliar-user comprehension or physical-device qualification.`, cases: [] };
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
    await client.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, ...(key==='Enter'?{text:'\r',unmodifiedText:'\r'}:{}), windowsVirtualKeyCode: ({Enter:13,Tab:9,Escape:27,End:35,Home:36,ArrowDown:40,ArrowUp:38})[key] });
    await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: ({Enter:13,Tab:9,Escape:27,End:35,Home:36,ArrowDown:40,ArrowUp:38})[key] });
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
        await client.send('Page.navigate', { url: (liveBase||browser.host.baseUrl) + 'datacenter?frame=scene' });
        await until("globalThis.SimulatteActiveSession?.snapshot().preparation==='ready' && document.querySelector('[aria-label=\"Inspect a rack\"]')?.value===''");
        await delay(250);
        row.build = await evaluate("document.querySelector('meta[name=simulatte-build]').content");
        if(process.env.WORLD_AUDIT_BUILD)assert.equal(row.build,process.env.WORLD_AUDIT_BUILD);
        assert.equal(await evaluate('document.documentElement.dataset.theme'), theme);
        assert.equal(await evaluate('SimulatteActiveSession.snapshot().execution'), 'running');
        assert.deepEqual(await evaluate("[...document.querySelectorAll('.gpu-scene__header button')].filter(n=>n.getBoundingClientRect().height).map(n=>n.textContent.trim())"), ['•••']);
        assert.equal(await evaluate("document.querySelector('#pause-button').closest('.wui-dock')!==null"), true);
        assert.equal(await evaluate("[...document.querySelectorAll('.gpu-scene__header button,.gpu-scene__home')].filter(n=>n.getBoundingClientRect().height).every(n=>{const r=n.getBoundingClientRect();return r.height>=44&&r.width>=44})"), true);
        assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'), true);
        row.checks.push('Autoplay, identity/Menu top bar, compact action docks, no horizontal overflow');
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
        await until("document.querySelector('[data-wui=inspector]').dataset.placement");
        assert.equal(await evaluate("document.querySelector('[data-wui=inspector]').dataset.placement"), mobile ? 'sheet' : 'anchor');
        const clear = await evaluate(`(()=>{const c=document.querySelector('#overlay-canvas'),r=c.getBoundingClientRect(),p=document.querySelector('[data-wui=inspector]').getBoundingClientRect(),t=c.__simulatteObjectTargets().find(t=>t.id===${JSON.stringify(rack.id)});const b=t.bounds;const left=r.x+Math.min(...b.map(p=>p.x)),right=r.x+Math.max(...b.map(p=>p.x)),top=r.y+Math.min(...b.map(p=>p.y)),bottom=r.y+Math.max(...b.map(p=>p.y));return p.right<=left||p.left>=right||p.bottom<=top||p.top>=bottom})()`);
        if(!mobile)assert.equal(clear, true);
        assert.equal(await evaluate("document.querySelectorAll('[data-wui=inspector] [data-variant=primary]').length"),1);
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

        await click('[data-wui=inspector] .wui-disclosure > summary');
        await until("document.querySelector('[data-wui=inspector] .wui-disclosure').open");
        await delay(250);
        assert.equal(await evaluate("(()=>{const e=document.querySelector('[data-wui=inspector]'),r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight&&getComputedStyle(e).overflowY==='auto'})()"),true);
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
        await key('Escape');
        await until("document.querySelector('#decisions-drawer').getAttribute('aria-hidden')==='true'");
        assert.equal(await evaluate('document.activeElement.id'), 'decisions-button');
        await click('#camera-menu > summary');
        const observed = await evaluate('JSON.stringify(__simulattePluginPlatformV4.contributions[0].state)');
        await click('#camera-top');
        assert.equal(await evaluate('JSON.stringify(__simulattePluginPlatformV4.contributions[0].state)'), observed);
        if(mobile)await click('#camera-menu > summary');
        await click('#camera-reset');
        assert.equal(await evaluate('JSON.stringify(__simulattePluginPlatformV4.contributions[0].state)'), observed);
        if(mobile)await click('#decisions-button');
        await click('[aria-label^="Speed:"]');
        await key('End');await key('Enter');
        await until("SimulatteActiveSession.snapshot().lastOperation?.id==='speed'");
        assert.equal(await evaluate('SimulatteActiveSession.snapshot().execution'), 'paused');
        if(!mobile)await click('#decisions-button');
        await click('.gpu-scene__secondary > button');
        assert.notEqual(await evaluate('document.documentElement.dataset.themePreference'), 'system');
        await evaluate("SimulatteTheme.setPreference('system')");
        row.checks.push('Camera/Reset preserve paused execution; Speed and Appearance remain accessible');
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
    await client.send('Page.navigate', { url: (liveBase||browser.host.baseUrl) + 'datacenter' });
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
