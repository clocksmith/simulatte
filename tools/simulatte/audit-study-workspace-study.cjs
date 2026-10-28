'use strict';
// Study progression, file round-trip and touch suites for the study workspace acceptance audit.
const fs = require('node:fs');
const {boot, record, near} = require('./audit-study-workspace.cjs');
const NEXT = '.sw-footer .sw-stepper button[aria-label="Next stage"]';
const view = h => h.page.evaluate(() => SimulatteStudyInspector.workspace().view);
// On a timeout, report what the page showed (view and any open dialog) instead of only the wait that failed.
const until = async (h, predicate, arg) => {
  try { return await h.page.waitForFunction(predicate, arg, {timeout: 15000}); }
  catch (error) {
    const seen = await h.page.evaluate(() => ({view: SimulatteStudyInspector.workspace()?.view, problem: SimulatteStudyInspector.workspace()?.document.problem.referenceId, dialogs: [...document.querySelectorAll('dialog[open]')].map(d => d.innerText.slice(0, 160)),
      next: (() => { const b = document.querySelector('.sw-footer .sw-stepper button[aria-label="Next stage"]'), r = b?.getBoundingClientRect(); return b && {disabled: b.disabled, x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), top: document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.className}; })()})).catch(() => null);
    if (process.env.STUDY_AUDIT_SHOTS) await h.page.screenshot({path: `${process.env.STUDY_AUDIT_SHOTS}/wait-timeout-${Date.now()}.png`}).catch(() => {});
    throw Error(`${error.message.split('\n')[0]} | page: ${JSON.stringify(seen)}`);
  }
};

async function progression(context) {
  const h = await boot(context, ''), page = h.page;
  const refs = await page.$$eval('select[aria-label="Problem"] option', os => os.map(o => o.value));
  await h.openTab('Stage'); await page.click('.sidebar__dock'); await page.waitForTimeout(200);   // docked, so stepping does not close it
  const failures = [], unstable = [], unmarked = [], summaries = [];
  let checked = 0;
  for (const ref of refs) {
    await page.selectOption('select[aria-label="Problem"]', ref);
    await until(h, r => SimulatteStudyInspector.workspace()?.document.problem.referenceId === r, ref);
    const solutions = await page.evaluate(() => SimulatteStudyInspector.workspace().document.solutions.map(s => ({id: s.id, stages: s.stages.length})));
    for (const solution of solutions) {
      await page.selectOption('select[aria-label="Approach"]', solution.id);
      await until(h, id => SimulatteStudyInspector.workspace().view.solutionId === id, solution.id);
      // Re-selecting the current approach keeps its stage, so step back with the real control to stage 1.
      while ((await view(h)).stageIndex > 0) { const at = (await view(h)).stageIndex; await page.click('.sw-footer .sw-stepper button[aria-label="Previous stage"]'); await until(h, n => SimulatteStudyInspector.workspace().view.stageIndex === n, at - 1); }
      let previous = null;
      for (let i = 0; i < solution.stages; i++) {
        if (i) { await page.click(NEXT); await until(h, n => SimulatteStudyInspector.workspace().view.stageIndex === n, i); }
        await page.waitForTimeout(40);
        const r = await page.evaluate(() => {
          const ws = SimulatteStudyInspector.workspace(), sol = ws.document.solutions.find(s => s.id === ws.view.solutionId), stage = sol.stages[ws.view.stageIndex];
          const els = SimulatteStudyInspector.elements(), role = e => e.customData?.study?.role;
          const drawnNodes = els.filter(e => role(e) === 'node' || role(e) === 'boundary').map(e => e.customData.study.nodeId).sort();
          const drawnEdges = els.filter(e => role(e) === 'edge').map(e => e.customData.study.edgeId).sort();
          const added = els.filter(e => role(e) === 'node' && ['added', 'merged'].includes(e.customData.study.change)).filter(e => e.strokeColor !== '#1971c2' && e.strokeColor !== '#2f9e44').map(e => e.id);
          const section = [...document.querySelectorAll('.sw-sidebar .sw-section')].find(s => s.querySelector('h3')?.textContent === 'Changes in this stage');
          return {stage: stage.id, title: stage.title, nodes: drawnNodes, edges: drawnEdges, expectedNodes: stage.graph.nodes.map(n => n.id).sort(), expectedEdges: stage.graph.edges.map(e => e.id).sort(), operations: stage.operations.length,
            summaryItems: section ? section.querySelectorAll('li').length : -1, questionShown: document.querySelector('.sw-sidebar')?.innerText.includes(stage.question), stepper: document.querySelector('.sw-footer .sw-stage-title')?.textContent || '',
            positions: Object.fromEntries(els.filter(e => role(e) === 'node').map(e => [e.customData.study.nodeId, [e.x, e.y, e.customData.study.change]])), added};
        });
        checked++;
        if (JSON.stringify(r.nodes) !== JSON.stringify(r.expectedNodes) || JSON.stringify(r.edges) !== JSON.stringify(r.expectedEdges) || !r.stepper.includes(r.title)) failures.push(`${ref}/${solution.id}/${r.stage}`);
        if (r.summaryItems !== r.operations || !r.questionShown) summaries.push(`${ref}/${solution.id}/${r.stage}: ${r.summaryItems}/${r.operations}${r.questionShown ? '' : ' question missing'}`);
        if (r.added.length) unmarked.push(`${ref}/${r.stage}: ${r.added.join(',')}`);
        if (previous) for (const [id, [x, y, change]] of Object.entries(r.positions)) if (previous[id] && !change && (previous[id][0] !== x || previous[id][1] !== y)) unstable.push(`${ref}/${r.stage}/${id}`);
        previous = r.positions;
      }
    }
  }
  record('study progression', 'every stage draws exactly its authored graph', `step through all ${refs.length} problems, both approaches, every stage`, {stagesChecked: checked, mismatches: failures.slice(0, 10)}, checked > 0 && !failures.length);
  record('study progression', 'unchanged components keep their position and identity between stages', 'compare consecutive stages', {moved: unstable.slice(0, 10)}, !unstable.length);
  record('study progression', 'additions and merges are marked', 'check the stroke of added and merged components', {unmarked: unmarked.slice(0, 10)}, !unmarked.length);
  record('study progression', 'change summary lists every operation and the question is shown', 'read the Stage tab on every stage', {mismatches: summaries.slice(0, 10)}, !summaries.length);
  // Collapse and expand a subsystem from the Inspect tab.
  const h2 = await boot(context, '?problem=L034&approach=push&stage=3');
  const bounds = await h2.box('study:b:system'); await h2.page.mouse.click(bounds.c[0], bounds.a[1] + 1); await h2.openTab('Inspect');   // top edge, clear of connectors
  await h2.page.click('.sw-sidebar button:has-text("Collapse subsystem")'); await h2.page.waitForTimeout(200);
  const collapsed = (await h2.elements()).map(e => e.id);
  await h2.closeSidebar(); await h2.select('study:n:system'); await h2.openTab('Inspect');
  await h2.page.click('.sw-sidebar button:has-text("Expand subsystem")'); await h2.page.waitForTimeout(200);
  const expanded = (await h2.elements()).map(e => e.id);
  record('study progression', 'a subsystem collapses to its boundary and expands to its internals', 'select the boundary, Inspect, Collapse, then Expand', {collapsedHasBox: collapsed.includes('study:n:system'), collapsedHidesChildren: !collapsed.includes('study:n:api'), expandedShowsChildren: expanded.includes('study:n:api') && expanded.includes('study:b:system')},
    collapsed.includes('study:n:system') && !collapsed.includes('study:n:api') && expanded.includes('study:n:api'));
  await h2.page.close(); await page.close();
  // Quick repeated clicks: each lands on the same fixed button and advances exactly one stage.
  const h3 = await boot(context, '?problem=L001&approach=dedicated&stage=1');
  const at = await h3.page.$eval(NEXT, el => { const r = el.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
  for (let i = 0; i < 4; i++) await h3.page.mouse.click(...at);
  await h3.page.waitForTimeout(600); const reached = (await view(h3)).stageIndex + 1;
  // A slow problem load must not undo a later choice: delay one problem file, switch to it, then switch away at once.
  await h3.page.route('**/composable-solutions/l005.json', async route => { await new Promise(r => setTimeout(r, 1500)); await route.continue(); });
  await h3.page.selectOption('select[aria-label="Problem"]', 'L005'); await h3.page.selectOption('select[aria-label="Problem"]', 'L007');
  await h3.page.waitForTimeout(2500);
  const settled = await h3.page.evaluate(() => SimulatteStudyInspector.workspace().document.problem.referenceId);
  record('study progression', 'a slow problem load never overrides a later choice', 'delay L005, choose L005 then L007 immediately', {shown: settled}, settled === 'L007');
  record('study progression', 'rapid Next clicks advance one stage each', 'click Next four times at one spot without waiting', {reachedStage: reached, expected: 5}, reached === 5);
  await h3.page.close();
}

async function files(context) {
  const h = await boot(context, '?problem=L034&approach=push&stage=2'), page = h.page;
  await page.evaluate(() => localStorage.clear()); await page.reload({waitUntil: 'networkidle'}); await until(h, () => SimulatteStudyInspector.ready());
  const move = async (id, dx, dy) => { const b = await h.box(id), zoom=(await h.state()).zoom; await h.drag(b.c, [b.c[0] + dx*zoom, b.c[1] + dy*zoom]); await page.waitForTimeout(700); };
  const nodeAt = async () => (await h.elements()).find(e => e.role === 'node' && e.id === 'study:n:client');
  const original = await nodeAt(); await move(original.id, 80, 40);
  await page.click(NEXT); await until(h, () => SimulatteStudyInspector.workspace().view.stageIndex === 2);
  const nextStage = await nodeAt();
  await page.click('.sw-footer .sw-stepper button[aria-label="Previous stage"]'); await until(h, () => SimulatteStudyInspector.workspace().view.stageIndex === 1);
  const back = await nodeAt(), badge = !!await page.$('.sw-footer .sw-pill');
  record('import/export', 'an edit stays with its stage only', 'move a component on stage 2, visit stage 3, return', {stage3Unmoved: near(nextStage.x, original.x, 0.5), stage2Kept: near(back.x - original.x, 80, 2), editedBadge: badge}, near(nextStage.x, original.x, 0.5) && near(back.x - original.x, 80, 2) && badge);
  // Navigation clears the canvas undo history: undo must never pull another stage's scene into this one.
  const sceneBefore = JSON.stringify((await h.elements()).map(e => [e.id, e.x, e.y])); await h.blank(); await h.key(process.platform === 'darwin' ? 'Meta+z' : 'Control+z'); await page.waitForTimeout(600);
  const sceneAfter = JSON.stringify((await h.elements()).map(e => [e.id, e.x, e.y])), kept = (await nodeAt()).x;
  record('import/export', 'undo after changing stage stays within the stage', 'edit stage 2, go to stage 3 and back, press undo', {sceneUnchanged: sceneBefore === sceneAfter, editKept: near(kept - original.x, 80, 2)}, sceneBefore === sceneAfter && near(kept - original.x, 80, 2));
  await page.selectOption('select[aria-label="Approach"]', 'lease-poll'); await until(h, () => SimulatteStudyInspector.workspace().view.solutionId === 'lease-poll');
  await page.click(NEXT); await until(h, () => SimulatteStudyInspector.workspace().view.stageIndex === 1);
  await move('study:n:client', -60, 70);
  let ws = await h.workspace();
  record('import/export', 'each approach keeps independent stage edits', 'edit stage 2 of both approaches', {overlays: Object.fromEntries(Object.entries(ws.overlays).map(([k, v]) => [k, Object.keys(v)]))}, ws.overlays.push?.['push-s2'] && ws.overlays['lease-poll']?.['lease-poll-s2'] && Object.keys(ws.overlays.push).length === 1);
  const status = await page.$eval('.sw-save', s => s.textContent);
  await page.reload({waitUntil: 'networkidle'}); await until(h, () => SimulatteStudyInspector.ready());
  const restored = await h.workspace();
  record('import/export', 'autosave reports status and restores after reload', 'read the save status, reload the page', {status, restoredOverlays: JSON.stringify(restored.overlays) === JSON.stringify(ws.overlays)}, /^Saved in this browser at/.test(status) && JSON.stringify(restored.overlays) === JSON.stringify(ws.overlays));
  ws = restored; await h.openTab('File');
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('.sw-sidebar button:has-text("Export workspace")')]);
  const exported = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
  record('import/export', 'export writes the authored document, every stage edit and the view', 'File → Export workspace', {file: download.suggestedFilename(), equal: JSON.stringify(exported) === JSON.stringify(await h.workspace())}, JSON.stringify(exported) === JSON.stringify(await h.workspace()));
  const [authoredDownload] = await Promise.all([page.waitForEvent('download'), page.click('.sw-sidebar button:has-text("Export authored document only")')]);
  const authored = fs.readFileSync(await authoredDownload.path(), 'utf8');
  const sameAsPublished = await page.evaluate(async text => SimulatteComposableStudy.same(JSON.parse(text), await (await fetch('../../../data/system-diagram/composable-solutions/l034.json')).json()), authored);
  record('import/export', 'the authored document exports unchanged', 'File → Export authored document only', {sameAsPublished}, sameAsPublished);
  const extended = {...exported, extensions: {futureTool: {kept: true}}};
  await page.setInputFiles('input[type=file]', {name: 'round-trip.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(extended))});
  await page.waitForSelector('dialog[open]'); const preview = await page.$eval('dialog[open]', d => d.innerText);
  await page.click('dialog[open] button:has-text("Replace current workspace")'); await page.waitForTimeout(400);
  const reimported = await h.workspace();
  record('import/export', 'reimport previews, then restores everything including unknown fields', 'import the export with an extra extension field, confirm', {previewNamesProblem: preview.includes('L034'), previewCountsEdits: /2 edited stages/.test(preview), equal: JSON.stringify(reimported) === JSON.stringify(extended)},
    preview.includes('L034') && JSON.stringify(reimported) === JSON.stringify(extended));
  const bad = structuredClone(extended); bad.overlays.push['no-such-stage'] = {patches: {}, removed: [], elements: []};
  const beforeBad = JSON.stringify(await h.workspace());
  await page.setInputFiles('input[type=file]', {name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(bad))});
  await page.waitForSelector('dialog[open]'); const error = await page.$eval('dialog[open]', d => d.innerText);
  await page.click('dialog[open] button:has-text("Close")');
  record('import/export', 'an invalid import names the location and keeps current work', 'import a file whose overlay names a missing stage', {message: error.split('\n').slice(0, 3).join(' '), unchanged: JSON.stringify(await h.workspace()) === beforeBad}, /overlays\.push\.no-such-stage/.test(error) && JSON.stringify(await h.workspace()) === beforeBad);
  await h.closeSidebar(); await page.click('.sw-footer .sw-pill');
  ws = await h.workspace();
  record('import/export', 'resetting a stage removes only that stage overlay', 'press Edited · reset on lease-poll stage 2', {overlays: Object.fromEntries(Object.entries(ws.overlays).map(([k, v]) => [k, Object.keys(v)]))}, !ws.overlays['lease-poll'] && !!ws.overlays.push?.['push-s2']);
  await images(h); await largeScene(h);
  await page.close();
}

// An inserted image keeps its pixels through stage navigation and export/reimport.
function png(size = 16) {   // a small valid PNG built here, so the fixture needs no binary file
  const crc = buf => { let c = ~0; for (const b of buf) { c ^= b; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return ~c >>> 0; };
  const chunk = (type, data) => { const t = Buffer.from(type), len = Buffer.alloc(4), sum = Buffer.alloc(4); len.writeUInt32BE(data.length); sum.writeUInt32BE(crc(Buffer.concat([t, data]))); return Buffer.concat([len, t, data, sum]); };
  const header = Buffer.alloc(13); header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 2;
  const rows = Buffer.concat(Array.from({length: size}, (_, y) => Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({length: size}, (_, x) => [x * 16, y * 16, 128]).flat())])));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', require('node:zlib').deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
}
const PNG = png();
async function images(h) {
  const page = h.page; await h.closeSidebar(); const at = await h.emptyPoint();
  // Excalidraw's image tool uses the File System Access picker, which scripted Chromium cannot answer;
  // dropping a real PNG file onto the canvas exercises the same insertion and file storage.
  await page.evaluate(([x, y, b64]) => {
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0)), data = new DataTransfer();
    data.items.add(new File([bytes], 'pixel.png', {type: 'image/png'}));
    const target = document.elementFromPoint(x, y);
    for (const type of ['dragover', 'drop']) target.dispatchEvent(new DragEvent(type, {bubbles: true, cancelable: true, clientX: x, clientY: y, dataTransfer: data}));
  }, [at[0], at[1], PNG.toString('base64')]);
  await page.waitForTimeout(1200);
  const image = (await h.elements()).find(e => e.type === 'image');
  await page.click('.sw-footer .sw-stepper button[aria-label="Next stage"]'); await page.waitForTimeout(300);
  await page.click('.sw-footer .sw-stepper button[aria-label="Previous stage"]'); await page.waitForTimeout(500);
  const back = (await h.elements()).find(e => e.id === image?.id), ws = await h.workspace(), sol = ws.view.solutionId, stage = ws.document.solutions.find(s => s.id === sol).stages[ws.view.stageIndex].id;
  const fileId = await page.evaluate(id => SimulatteStudyInspector.elements().find(e => e.id === id)?.fileId, image?.id);
  const stored = ws.overlays[sol]?.[stage]?.files?.[fileId];
  record('import/export', 'an inserted image survives stage navigation and is saved with the stage', 'drop a PNG file on the canvas, go to the next stage and back', {placed: !!image, back: !!back, fileStored: !!stored?.dataURL}, !!image && !!back && !!stored?.dataURL?.startsWith('data:image/png'));
  await h.openTab('File');
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('.sw-sidebar button:has-text("Export workspace")')]);
  const text = fs.readFileSync(await download.path(), 'utf8');
  await page.evaluate(() => localStorage.clear()); await page.reload({waitUntil: 'networkidle'}); await until(h, () => SimulatteStudyInspector.ready());
  await page.setInputFiles('input[type=file]', {name: 'with-image.json', mimeType: 'application/json', buffer: Buffer.from(text)});
  await page.waitForSelector('dialog[open]'); await page.click('dialog[open] button:has-text("Replace current workspace")'); await page.waitForTimeout(600);
  const restored = await page.evaluate(id => { const e = SimulatteStudyInspector.elements().find(x => x.id === id); return e ? {type: e.type, status: e.status, fileId: e.fileId} : null; }, image?.id);
  const loaded = await page.evaluate(id => SimulatteStudyInspector.files().includes(id), fileId);
  record('import/export', 'an image round-trips through export and reimport', 'export, clear browser storage, reimport', {restored, fileDataLoaded: loaded}, restored?.type === 'image' && restored.fileId === fileId && loaded);
  await h.closeSidebar();
}

// A stage holding thousands of learner elements stays responsive to import, navigation and dragging.
async function largeScene(h) {
  const page = h.page, ws = await h.workspace(), sol = ws.view.solutionId, stage = ws.document.solutions.find(s => s.id === sol).stages[ws.view.stageIndex].id;
  const elements = Array.from({length: 2000}, (_, i) => ({id: `bulk-${i}`, type: 'rectangle', x: 2000 + (i % 50) * 60, y: (Math.floor(i / 50)) * 50, width: 40, height: 30, angle: 0, strokeColor: '#1e1e1e', backgroundColor: 'transparent', fillStyle: 'solid', strokeWidth: 1, strokeStyle: 'solid', roughness: 1, opacity: 100,
    groupIds: [], frameId: null, roundness: null, seed: i + 1, version: 1, versionNonce: i + 1, isDeleted: false, boundElements: [], updated: 1, link: null, locked: false}));
  const big = {...ws, overlays: {...ws.overlays, [sol]: {...(ws.overlays[sol] || {}), [stage]: {patches: {}, removed: [], elements}}}};
  await page.setInputFiles('input[type=file]', {name: 'large.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(big))});
  await page.waitForSelector('dialog[open]'); let t = Date.now();
  await page.click('dialog[open] button:has-text("Replace current workspace")');
  await until(h, () => SimulatteStudyInspector.elements().length > 2000); const importMs = Date.now() - t;
  t = Date.now(); await page.click('.sw-footer .sw-stepper button[aria-label="Next stage"]'); await until(h, n => SimulatteStudyInspector.workspace().view.stageIndex === n, ws.view.stageIndex + 1); const awayMs = Date.now() - t;
  t = Date.now(); await page.click('.sw-footer .sw-stepper button[aria-label="Previous stage"]'); await until(h, () => SimulatteStudyInspector.elements().length > 2000); const backMs = Date.now() - t;
  const node = (await h.elements()).find(e => e.role === 'node'); await h.reveal(node.id); const box = await h.box(node.id);
  t = Date.now(); await h.drag(box.c, [box.c[0] + 40, box.c[1] + 30], {steps: 20}); const dragMs = Date.now() - t;
  const moved = (await h.elements()).find(e => e.id === node.id);
  record('performance', 'a stage with 2,000 learner elements stays usable', 'import a workspace with 2,000 rectangles on one stage, step away and back, drag a component', {importMs, stepAwayMs: awayMs, stepBackMs: backMs, dragMs, moved: !near(moved.x, node.x, 0.5)},
    importMs < 4000 && awayMs < 2000 && backMs < 4000 && dragMs < 4000 && !near(moved.x, node.x, 0.5));
}

async function touch(context) {
  const h = await boot(context, '?problem=L034&approach=push&stage=3'), page = h.page, cdp = await context.newCDPSession(page);
  const touches = async (type, points) => cdp.send('Input.dispatchTouchEvent', {type, touchPoints: points.map(([x, y], id) => ({x, y, id}))});
  const swipe = async (from, to, steps = 10) => { await touches('touchStart', from); for (let i = 1; i <= steps; i++) await touches('touchMove', from.map((p, k) => [p[0] + (to[k][0] - p[0]) * i / steps, p[1] + (to[k][1] - p[1]) * i / steps])); await touches('touchEnd', []); await page.waitForTimeout(200); };
  const reach = await page.evaluate(() => { const v = [innerWidth, innerHeight], inView = s => [...document.querySelectorAll(s)].some(n => { const r = n.getBoundingClientRect(); return r.width > 0 && r.left >= 0 && r.top >= 0 && r.right <= v[0] && r.bottom <= v[1]; });
    return {tools: inView('[data-testid="toolbar-rectangle"]'), undo: inView('[aria-label="Undo"]'), menu: inView('.main-menu-trigger'), nothingClipped: ![...document.querySelectorAll('.sw-top, .sw-trigger')].some(n => n.getBoundingClientRect().right > v[0])}; });
  record('touch', 'controls are reachable on a phone', 'iPhone 13 emulation: tools, undo and menu inside the viewport, nothing clipped', reach, Object.values(reach).every(Boolean));
  await page.tap('.main-menu-trigger'); await page.waitForTimeout(250); await page.tap('text=Study notes and stages'); await page.waitForTimeout(400);
  const mobileStepper = '.sw-sidebar .sw-mobile-only .sw-stepper button[aria-label="Next stage"]';
  const visible = await page.$eval('.sw-sidebar .sw-mobile-only', el => getComputedStyle(el).display !== 'none').catch(() => false);
  if (visible) { await page.tap(mobileStepper); await page.waitForTimeout(300); }
  const stage = (await view(h)).stageIndex;
  record('touch', 'problem, approach and stage controls work by tap', 'Menu → Study notes and stages, tap Next in the sidebar', {sidebarControlsVisible: visible, stageIndex: stage}, visible && stage === 3);
  await page.tap('.sidebar__close'); await page.waitForTimeout(250);
  const empty = await h.emptyPoint(), before = JSON.stringify((await h.elements()).map(e => [e.id, e.x, e.y])), s0 = await h.state();
  await swipe([empty], [[empty[0] - 80, empty[1] - 60]]);
  const s1 = await h.state(), after = JSON.stringify((await h.elements()).map(e => [e.id, e.x, e.y]));
  record('touch', 'a one-finger drag on empty canvas never creates or moves shapes', 'swipe empty canvas with the selection tool', {elementsUnchanged: before === after, scrolled: [Math.round(s1.scrollX - s0.scrollX), Math.round(s1.scrollY - s0.scrollY)]}, before === after);
  const z0 = (await h.state()).zoom, count = (await h.elements()).length, c = [195, 420];
  await swipe([[c[0] - 30, c[1]], [c[0] + 30, c[1]]], [[c[0] - 110, c[1]], [c[0] + 110, c[1]]], 12);
  const z1 = (await h.state()).zoom;
  record('touch', 'pinch zooms without drawing', 'two-finger pinch outwards', {zoom: [+z0.toFixed(3), +z1.toFixed(3)], elementsAdded: (await h.elements()).length - count}, z1 > z0 * 1.2 && (await h.elements()).length === count);
  await page.tap('label:has([data-testid="toolbar-rectangle"])'); await page.waitForTimeout(150); const tool = (await h.state()).tool;
  const area = await h.emptyPoint(), beforeDraw = await h.elements();
  await swipe([area], [[area[0] + 70, area[1] + 50]]);
  const drawn = (await h.newest(beforeDraw))[0];
  record('touch', 'a touch drag draws with the chosen tool', 'tap Rectangle, drag with one finger', {tool, drawn: drawn && [drawn.type, Math.round(drawn.width), Math.round(drawn.height)]}, tool === 'rectangle' && drawn?.type === 'rectangle');
  if (drawn) {
    const box = await h.box(drawn.id), w0 = drawn.width, zoom = (await h.state()).zoom;
    await swipe([[box.z[0] + 8, box.z[1] + 8]], [[box.z[0] + 48, box.z[1] + 38]]);
    const resized = (await h.elements()).find(e => e.id === drawn.id);
    record('touch', 'resize handles are usable while zoomed', `drag the corner handle by touch at zoom ${zoom.toFixed(2)}`, {width: [Math.round(w0), Math.round(resized.width)]}, resized.width > w0 + 5);
  }
  // A trusted touch cancellation mid-gesture (the browser takes over the touch) must leave nothing half-drawn or stuck.
  await page.tap('label:has([data-testid="toolbar-rectangle"])'); await page.waitForTimeout(100);
  const spot = await h.emptyPoint(), beforeCancel = await h.elements();
  await touches('touchStart', [spot]); for (let i = 1; i <= 6; i++) await touches('touchMove', [[spot[0] + i * 8, spot[1] + i * 6]]); await touches('touchCancel', []); await page.waitForTimeout(250);
  const leftover = await h.newest(beforeCancel), afterCancel = await h.state();
  const probe = await h.emptyPoint(); await touches('touchStart', [probe]); await touches('touchEnd', []); await page.waitForTimeout(200);
  const settled = await h.state();
  record('touch', 'a cancelled touch leaves no phantom or stuck gesture', 'Rectangle, touch-drag, then touchcancel, then tap empty canvas', {leftover: leftover.map(e => [e.type, Math.round(e.width), Math.round(e.height)]), toolAfterCancel: afterCancel.tool, selectedAfterTap: settled.selected.length},
    leftover.every(e => e.width > 2 && e.height > 2) && settled.selected.length === 0);
  await page.close();
}

module.exports = {progression, files, touch};
