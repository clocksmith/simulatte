'use strict';
// Drives the study workspace in Chromium with mouse, keyboard and emulated touch, and records each
// acceptance check from docs/simulatte/study-workspace-acceptance.md as action, observation and result.
// Usage: LUCYD_PLAYWRIGHT_MODULE=/path/to/playwright node tools/simulatte/audit-study-workspace.cjs [--url URL] [--out FILE] [--suites a,b]
const fs = require('node:fs');
const path = require('node:path');
const {chromium, devices} = require(process.env.LUCYD_PLAYWRIGHT_MODULE || '@playwright/test');

const ROOT = path.resolve(__dirname, '../..');
const urlFlag = process.argv.indexOf('--url');
const BASE = urlFlag > 0 ? process.argv[urlFlag + 1] : 'http://127.0.0.1:4173/simulatte/system-diagram/study/';
const outFlag = process.argv.indexOf('--out');
const OUT = path.resolve(ROOT, outFlag > 0 ? process.argv[outFlag + 1] : 'artifacts/composable-study/workspace-acceptance.json');
const META = process.platform === 'darwin' ? 'Meta' : 'Control';
const rows = [], problems = [];
const record = (area, check, action, observed, pass) => { rows.push({area, check, action, observed, result: pass ? 'pass' : 'fail'}); console.log(`${pass ? 'PASS' : 'FAIL'}  ${area} · ${check}`); };
const near = (a, b, tolerance = 2) => Math.abs(a - b) <= tolerance;

function harness(page) {
  const h = {page};
  h.state = () => page.evaluate(() => { const s = SimulatteStudyInspector.appState(); return {tool: s.activeTool.type, locked: s.activeTool.locked, zoom: s.zoom.value, scrollX: s.scrollX, scrollY: s.scrollY, offsetLeft: s.offsetLeft, offsetTop: s.offsetTop, width: s.width, height: s.height,
    selected: Object.keys(s.selectedElementIds).filter(k => s.selectedElementIds[k]), editing: s.editingTextElement?.id || null, suggested: (s.suggestedBindings || []).length, contextMenu: !!document.querySelector('.context-menu')}; });
  h.elements = () => page.evaluate(() => SimulatteStudyInspector.elements().map(e => ({id: e.id, type: e.type, x: e.x, y: e.y, width: e.width, height: e.height, angle: e.angle, text: e.text, originalText: e.originalText, containerId: e.containerId,
    groupIds: e.groupIds, points: e.points, backgroundColor:e.backgroundColor, seed: e.seed, strokeColor: e.strokeColor, start: e.startBinding?.elementId || null, end: e.endBinding?.elementId || null, role: e.customData?.study?.role || null, connection: e.customData?.studyConnection || null})));
  h.workspace = () => page.evaluate(() => SimulatteStudyInspector.workspace());
  h.toScreen = async ([x, y]) => { const s = await h.state(); return [(x + s.scrollX) * s.zoom + s.offsetLeft, (y + s.scrollY) * s.zoom + s.offsetTop]; };
  h.toScene = async ([x, y]) => { const s = await h.state(); return [(x - s.offsetLeft) / s.zoom - s.scrollX, (y - s.offsetTop) / s.zoom - s.scrollY]; };
  h.drag = async (a, z, {mods = [], steps = 12, button = 'left', before} = {}) => {
    for (const m of mods) await page.keyboard.down(m);
    await page.mouse.move(...a); await page.mouse.down({button});
    await page.mouse.move((a[0] + z[0]) / 2, (a[1] + z[1]) / 2, {steps});
    if (before) await before();
    await page.mouse.move(...z, {steps}); await page.mouse.up({button});
    for (const m of mods) await page.keyboard.up(m);
    await page.waitForTimeout(120);
  };
  h.key = async k => { await page.keyboard.press(k); await page.waitForTimeout(60); };
  // Canvas shortcuts only reach Excalidraw when focus is inside its container (not in our panels).
  h.focusCanvas = async () => { await page.evaluate(() => document.querySelector('.excalidraw')?.focus()); await page.waitForTimeout(30); };
  h.blank = async () => { await h.key('Escape'); const p = await h.emptyPoint(); await page.mouse.click(...p); await page.waitForTimeout(60); };
  // A screen point with no element under it, inside the canvas.
  h.emptyPoint = async () => {
    const all = await h.elements(), s = await h.state(), picked = all.filter(e => s.selected.includes(e.id));
    // Clicks inside the common bounds of a multi-selection keep it, so treat those bounds as occupied too.
    const els = picked.length > 1 ? all.concat([{x: Math.min(...picked.map(e => Math.min(e.x, e.x + e.width))), y: Math.min(...picked.map(e => Math.min(e.y, e.y + e.height))),
      width: Math.max(...picked.map(e => Math.max(e.x, e.x + e.width))) - Math.min(...picked.map(e => Math.min(e.x, e.x + e.width))), height: Math.max(...picked.map(e => Math.max(e.y, e.y + e.height))) - Math.min(...picked.map(e => Math.min(e.y, e.y + e.height)))}]) : all;
    // Only points where the interactive canvas itself is on top: never toolbars, panels or the sidebar.
    const onCanvas = await page.evaluate(([w, hh]) => { const out = []; for (let y = 140; y < hh - 140; y += 40) for (let x = 120; x < w - 120; x += 40) if (document.elementFromPoint(x, y)?.matches('canvas.interactive')) out.push([x, y]); return out; }, [s.width, s.height]);
    for (const [x, y] of onCanvas) {
      const [sx, sy] = await h.toScene([x, y]);
      const occupied = e => {
        if (e.points?.length > 1) return e.points.slice(1).some((p,i) => {
          const a=[e.x+e.points[i][0],e.y+e.points[i][1]],b=[e.x+p[0],e.y+p[1]],dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((sx-a[0])*dx+(sy-a[1])*dy)/(dx*dx+dy*dy||1)));
          return Math.hypot(sx-a[0]-t*dx,sy-a[1]-t*dy)<30;
        });
        const inside=sx>e.x-30&&sx<e.x+Math.abs(e.width)+30&&sy>e.y-30&&sy<e.y+Math.abs(e.height)+30;
        return inside && (e.role!=='boundary'||Math.min(Math.abs(sx-e.x),Math.abs(sx-e.x-e.width),Math.abs(sy-e.y),Math.abs(sy-e.y-e.height))<30);
      };
      if (!els.some(occupied)) return [x, y];
    }
    return [s.width - 150, s.height - 150];
  };
  // Scroll until a 760x420 screen area holds no elements, so drawing tests never touch authored shapes.
  h.clearArea = async () => {
    for (let i = 0; i < 12; i++) {
      const els = await h.elements(), s = await h.state(), [x0, y0] = await h.toScene([260, 200]), [x1, y1] = await h.toScene([1020, 620]);
      if (!els.some(e => e.x < x1 && e.x + Math.abs(e.width) > x0 && e.y < y1 && e.y + Math.abs(e.height) > y0)) return [260, 200];
      await page.mouse.move(700, 450); await page.mouse.wheel(1400, 0); await page.waitForTimeout(80);
      if (s.zoom !== 1) await h.key(`${META}+0`);
    }
    throw Error('could not find an empty drawing area');
  };
  h.reveal = async id => {
    await h.focusCanvas();
    for(let i=0;i<16;i++){
      const box=await h.box(id),s=await h.state();
      if(box.c[0]>120&&box.c[0]<s.width-120&&box.c[1]>180&&box.c[1]<s.height-160)return;
      const dx=Math.max(-s.width/3,Math.min(s.width/3,s.width/2-box.c[0])),dy=Math.max(-s.height/3,Math.min(s.height/3,s.height/2-box.c[1]));
      await h.drag([s.width/2,s.height/2],[s.width/2+dx,s.height/2+dy],{mods:['Space'],steps:5});
    }
    throw Error('Could not pan component into view: '+id);
  };
  h.newest = async before => (await h.elements()).filter(e => !before.some(b => b.id === e.id));
  h.box = async id => { const e = (await h.elements()).find(x => x.id === id); const a = await h.toScreen([e.x, e.y]), z = await h.toScreen([e.x + e.width, e.y + e.height]); return {e, a, z, c: [(a[0] + z[0]) / 2, (a[1] + z[1]) / 2]}; };
  h.drawRect = async (a, z) => { const before = await h.elements(); await h.key('r'); await h.drag(a, z); return (await h.newest(before))[0]; };
  h.select = async id => { const {a, c} = await h.box(id); const el = (await h.elements()).find(e => e.id === id); await page.mouse.click(el.role === 'node' || el.type !== 'rectangle' ? c[0] : a[0] + 1, el.role === 'node' || el.type !== 'rectangle' ? c[1] : c[1]); await page.waitForTimeout(80); };
  h.openTab = async tab => {
    if (!await page.$('.sw-sidebar')) { await page.click('.sw-trigger'); await page.waitForTimeout(200); }
    await page.click(`.sw-sidebar [role="tab"]:has-text("${tab}")`).catch(async () => page.click(`.sw-sidebar button:has-text("${tab}")`));
    await page.waitForTimeout(150);
  };
  h.closeSidebar = async () => { if (await page.$('.sw-sidebar')) { await page.click('.sidebar__close'); await page.waitForTimeout(150); } };
  return h;
}

// Each boot starts from empty browser storage unless `keep` is set, so one suite's autosaved edits never shape another's.
async function boot(context, query = '', {keep = false} = {}) {
  const page = await context.newPage();
  page.on('pageerror', e => problems.push(`pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') problems.push(`console: ${m.text().slice(0, 200)}`); });
  page.on('response', r => { if (r.status() >= 400) problems.push(`HTTP ${r.status()} ${r.url()}`); });
  // Network errors while loading a remote host are retried and reported; they are not product results.
  const load = async step => { for (let attempt = 1; ; attempt++) { try { return await step(); } catch (error) { if (attempt === 3 || !/net::|Timeout/.test(error.message)) throw error; problems.push(`retried navigation: ${error.message.split('\n')[0]}`); await page.waitForTimeout(3000 * attempt); } } };
  await load(() => page.goto(BASE + query, {waitUntil: 'networkidle'}));
  if (!keep) { await page.evaluate(() => localStorage.clear()); await load(() => page.reload({waitUntil: 'networkidle'})); }
  await page.waitForFunction(() => globalThis.SimulatteStudyInspector?.ready(), null, {timeout: 20000});
  await page.waitForTimeout(400);
  return harness(page);
}

module.exports = {harness, boot, record, near, rows, problems, META, BASE};
if (require.main === module) {
  (async () => {
    const browser = await chromium.launch();
    const started = new Date().toISOString();
    try {
      const desktop = await browser.newContext({viewport: {width: 1440, height: 900}, acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write']});
      const gestures = require('./audit-study-workspace-gestures.cjs'), study = require('./audit-study-workspace-study.cjs');
      const only = process.argv.includes('--suites') ? process.argv[process.argv.indexOf('--suites') + 1].split(',') : null;
      const pick = suites => suites.filter(suite => !only || only.includes(suite.name));
      for (const suite of pick([gestures.layout, gestures.drawing, gestures.focus, gestures.selection, gestures.transforms, gestures.camera, gestures.text, gestures.connections, gestures.editing, study.progression, study.files])) {
        try { await suite(desktop); } catch (error) { record(suite.name, 'suite completed', 'run the suite', error.stack.split('\n').slice(0, 3).join(' | '), false); }
      }
      const phone = await browser.newContext({...devices['iPhone 13'], acceptDownloads: true});
      if (pick([study.touch]).length) try { await study.touch(phone); } catch (error) { record('touch', 'suite completed', 'run the suite', error.stack.split('\n').slice(0, 3).join(' | '), false); }
    } catch (error) { record('harness', 'audit completed', 'run every suite', error.stack.split('\n').slice(0, 3).join(' | '), false); }
    const version = browser.version(); await browser.close();
    const summary = {checks: rows.length, passed: rows.filter(r => r.result === 'pass').length, failed: rows.filter(r => r.result === 'fail').length};
    const report = {schema: 'simulatte.studyWorkspaceAcceptance.v1', started, url: BASE, browser: `chromium ${version}`, viewports: {desktop: '1440x900', phone: 'iPhone 13 emulation (touch)'},
      scope: 'Scripted browser interaction on one machine. Emulated touch is not a physical device; visual quality is judged separately.', summary, pageProblems: [...new Set(problems)], rows};
    fs.mkdirSync(path.dirname(OUT), {recursive: true}); fs.writeFileSync(OUT, JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(summary), path.relative(ROOT, OUT));
    process.exitCode = summary.failed || problems.length ? 1 : 0;
  })();
}
