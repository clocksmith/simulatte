'use strict';
// Canvas gesture suites for the study workspace acceptance audit (see audit-study-workspace.cjs).
const {boot, record, near, META} = require('./audit-study-workspace.cjs');
const STAGE = '?problem=L034&approach=push&stage=3';
const firstNode = els => els.find(e => e.role === 'node');

async function layout(context) {
  const h = await boot(context, STAGE), page = h.page;
  const canvas = await page.$eval('canvas.interactive', c => { const r = c.getBoundingClientRect(); return {x: r.x, y: r.y, width: r.width, height: r.height}; });
  record('open canvas', 'canvas fills the window', 'measure the interactive canvas at 1440x900', canvas, canvas.x === 0 && canvas.y === 0 && canvas.width === 1440 && canvas.height === 900);
  const controls = await page.evaluate(() => ({toolbar: !!document.querySelector('.App-toolbar'), menu: !!document.querySelector('.main-menu-trigger'), undo: !!document.querySelector('[aria-label="Undo"]'), redo: !!document.querySelector('[aria-label="Redo"]'),
    zoom: !!document.querySelector('.zoom-actions'), pickers: !!document.querySelector('.sw-pickers'), stepper: !!document.querySelector('.sw-stepper'), sidebarOpen: !!document.querySelector('.sw-sidebar')}));
  record('open canvas', 'floating tool, menu, history, zoom and study controls', 'query the controls', controls, controls.toolbar && controls.menu && controls.undo && controls.redo && controls.zoom && controls.pickers && controls.stepper);
  record('open canvas', 'no permanent navigation columns', 'load a stage without opening study notes', {sidebarOpen: controls.sidebarOpen}, !controls.sidebarOpen);
  const before = await page.evaluate(() => !!document.querySelector('.selected-shape-actions'));
  await h.select(firstNode(await h.elements()).id);
  const after = await page.evaluate(() => !!document.querySelector('.selected-shape-actions'));
  record('open canvas', 'properties appear for a selection only', 'compare the left panel before and after selecting a component', {before, after}, !before && after);
  await h.blank();
  await page.click('.sw-trigger'); await page.waitForTimeout(250);
  const ws = await h.workspace(), stage = ws.document.solutions.find(s => s.id === ws.view.solutionId).stages[ws.view.stageIndex];
  const sidebar = await page.evaluate(() => { const s = document.querySelector('.sw-sidebar'); const r = s?.getBoundingClientRect(); return s ? {width: Math.round(r.width), text: s.innerText} : null; });
  record('open canvas', 'study notes open on demand, at most 360px wide', 'press Study', {width: sidebar?.width, showsQuestion: !!sidebar?.text.includes(stage.question)}, !!sidebar && sidebar.width <= 360 && sidebar.text.includes(stage.question));
  await h.closeSidebar();
  await page.close();
}

async function drawing(context) {
  const h = await boot(context, STAGE), page = h.page, [x, y] = await h.clearArea();
  let before = await h.elements(); let preview = null;
  await h.key('r');
  await h.drag([x, y], [x + 160, y + 90], {before: async () => { preview = (await h.newest(before)).map(e => ({type: e.type, width: Math.round(e.width), height: Math.round(e.height)})); }});
  let created = await h.newest(before), s = await h.state();
  record('drawing', 'rectangle previews during the drag and commits on release', 'R, then drag 160x90', {duringDrag: preview, committed: created.map(e => [e.type, Math.round(e.width), Math.round(e.height)]), toolAfter: s.tool, selected: s.selected.length},
    preview?.length === 1 && preview[0].width > 0 && created.length === 1 && near(created[0].width, 160) && s.tool === 'selection' && s.selected[0] === created[0].id);
  await h.blank(); before = await h.elements(); await h.key('r'); await h.drag([x + 220, y], [x + 340, y + 60], {mods: ['Shift']});
  created = await h.newest(before);
  record('drawing', 'Shift constrains proportions', 'R, Shift-drag 120x60', created.map(e => [Math.round(e.width), Math.round(e.height)]), created.length === 1 && near(created[0].width, created[0].height));
  await h.blank(); before = await h.elements(); await h.key('p'); await h.drag([x + 400, y], [x + 520, y + 70], {steps: 15});
  created = await h.newest(before);
  record('drawing', 'freehand stroke follows the pointer', 'P, drag in 30 steps', created.map(e => [e.type, e.points?.length]), created.length === 1 && created[0].type === 'freedraw' && created[0].points.length >= 10);
  for (const [key, type] of [['l', 'line'], ['a', 'arrow']]) {
    await h.blank(); before = await h.elements(); await h.key(key);
    const base = type === 'line' ? y + 150 : y + 260;
    for (const [dx, dy] of [[0, 0], [120, -40], [260, 20]]) { await page.mouse.click(x + dx, base + dy); await page.waitForTimeout(60); }
    await h.key('Escape'); created = await h.newest(before); s = await h.state();
    record('drawing', `multipoint ${type} by successive clicks`, `${key.toUpperCase()}, click three points, Escape`, {created: created.map(e => [e.type, e.points?.length]), toolAfter: s.tool}, created.length === 1 && created[0].type === type && created[0].points.length === 3 && s.tool === 'selection');
  }
  await h.blank(); before = await h.elements(); await h.key('q'); await h.key('r');
  await h.drag([x + 400, y + 150], [x + 460, y + 190]); await h.drag([x + 480, y + 150], [x + 540, y + 190]);
  created = await h.newest(before); s = await h.state();
  record('drawing', 'Q keeps the tool active between shapes', 'Q, R, draw twice', {created: created.length, tool: s.tool, locked: s.locked}, created.length === 2 && s.tool === 'rectangle' && s.locked);
  await h.key('q'); await h.key('Escape'); await h.key('v');
  before = await h.elements(); await h.key('r');
  await page.mouse.move(x + 600, y + 150); await page.mouse.down(); await page.mouse.move(x + 660, y + 200, {steps: 6});
  await page.keyboard.press('Escape'); await page.mouse.up(); await page.waitForTimeout(150);
  created = await h.newest(before); s = await h.state();
  record('drawing', 'Escape during a drag leaves no stuck gesture', 'R, start a drag, Escape, release', {created: created.map(e => [Math.round(e.width), Math.round(e.height)]), tool: s.tool, editing: s.editing}, !s.editing && created.every(e => e.width > 0 && e.height > 0));
  await page.close();
}

async function focus(context) {
  const h = await boot(context, STAGE), page = h.page;
  const keys = [['v', 'selection'], ['r', 'rectangle'], ['d', 'diamond'], ['o', 'ellipse'], ['a', 'arrow'], ['l', 'line'], ['p', 'freedraw'], ['t', 'text'], ['e', 'eraser'], ['h', 'hand'], ['1', 'selection'], ['2', 'rectangle'], ['3', 'diamond'], ['4', 'ellipse'], ['5', 'arrow'], ['6', 'line'], ['7', 'freedraw'], ['8', 'text'], ['0', 'eraser']];
  const observed = {};
  for (const [key] of keys) { await h.key('Escape'); await h.key('v'); await h.key(key); observed[key] = (await h.state()).tool; }
  record('shortcuts', 'tool keys select their tools', 'press each tool key on the canvas (9 opens the OS image picker and is not pressed)', observed, keys.every(([k, t]) => observed[k] === t));
  await h.key('Escape'); await h.key('v');
  await page.focus('.sw-pickers select'); await page.keyboard.press('r'); await page.keyboard.press('e'); await page.waitForTimeout(80);
  let s = await h.state();
  record('shortcuts', 'typing in a study control does not switch tools', 'focus the problem picker, type r and e', {tool: s.tool}, s.tool === 'selection');
  await h.blank(); const node = firstNode(await h.elements()); await h.select(node.id); await h.key('Enter');
  await page.keyboard.type('re'); s = await h.state();
  const editing = s.editing; await h.key('Escape');
  const label = (await h.elements()).find(e => e.containerId === node.id);
  record('shortcuts', 'typing in a label does not switch tools', 'select a component, Enter, type r and e, Escape', {toolWhileTyping: s.tool, editing: !!editing, label: label?.originalText}, s.tool === 'selection' && !!editing && /re$/.test(label?.originalText || ''));
  await h.key(`${META}+z`);
  await page.setInputFiles('input[type=file]', {name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{')});
  await page.waitForSelector('dialog[open]'); await page.keyboard.press('r'); await page.keyboard.press('Delete'); await page.waitForTimeout(80);
  s = await h.state(); const count = (await h.elements()).length;
  await page.click('dialog[open] button:has-text("Close")');
  record('shortcuts', 'an open dialog suppresses drawing and delete shortcuts', 'open the import error dialog, press r and Delete', {tool: s.tool, elementsUnchanged: count === (await h.elements()).length}, s.tool === 'selection' && count === (await h.elements()).length);
  await page.close();
}

async function selection(context) {
  const h = await boot(context, STAGE), page = h.page;
  const nodes = (await h.elements()).filter(e => e.role === 'node');
  await h.select(nodes[0].id); let s = await h.state();
  record('selection', 'click selects a component', 'click a component', s.selected, s.selected.length === 1 && s.selected[0] === nodes[0].id);
  const b = await h.box(nodes[1].id); await page.keyboard.down('Shift'); await page.mouse.click(...b.c); await page.keyboard.up('Shift'); s = await h.state();
  record('selection', 'Shift-click adds to the selection', 'Shift-click a second component', s.selected, s.selected.includes(nodes[0].id) && s.selected.includes(nodes[1].id));
  await h.blank(); s = await h.state();
  record('selection', 'clicking empty canvas clears the selection', 'click empty canvas', s.selected, s.selected.length === 0);
  const edge = (await h.elements()).find(e => e.role === 'edge' && Math.hypot(e.width, e.height) > 120);
  const mid = await h.toScreen([edge.x + edge.points.at(-1)[0] * 0.25, edge.y + edge.points.at(-1)[1] * 0.25]);
  await page.mouse.click(mid[0] + 4, mid[1] + 4); s = await h.state();
  record('selection', 'connectors have forgiving hit targets', 'click 4px off a connector line', {selected: s.selected, edge: edge.id}, s.selected.includes(edge.id));
  await h.blank(); await h.select(nodes[0].id); const at = (await h.box(nodes[0].id)).c;
  await page.mouse.click(...at, {button: 'right'}); await page.waitForTimeout(350); s = await h.state();
  const moved = (await h.elements()).find(e => e.id === nodes[0].id);
  record('selection', 'right-click opens contextual actions without moving anything', 'right-click a component', {menu: s.contextMenu, unmoved: near(moved.x, nodes[0].x, 0.01) && near(moved.y, nodes[0].y, 0.01)}, s.contextMenu && near(moved.x, nodes[0].x, 0.01));
  await h.key('Escape');
  const [x, y] = await h.clearArea();
  const r1 = await h.drawRect([x, y], [x + 80, y + 60]); await h.blank(); const r2 = await h.drawRect([x + 140, y], [x + 220, y + 60]); await h.blank();
  await h.drag([x - 30, y - 30], [x + 250, y + 90]); s = await h.state();
  record('selection', 'marquee selects enclosed elements', 'drag a box around two rectangles', s.selected, s.selected.includes(r1.id) && s.selected.includes(r2.id) && s.selected.length === 2);
  await h.key(`${META}+g`); await h.blank();
  await page.mouse.click(x + 1, y + 30); s = await h.state();
  const grouped = s.selected.length;
  await h.blank(); await page.keyboard.down(META); await page.mouse.click(x + 1, y + 30); await page.keyboard.up(META); s = await h.state();
  record('selection', 'Cmd/Ctrl-click selects inside a group', 'group two rectangles, click one, then Cmd-click it', {plainClickSelects: grouped, deepSelect: s.selected}, grouped === 2 && s.selected.length === 1 && s.selected[0] === r1.id);
  await h.blank(); await h.key(`${META}+a`); s = await h.state();
  const all = (await h.elements()).filter(e => !e.containerId).length;
  record('selection', 'keyboard select-all', 'Cmd/Ctrl+A', {selected: s.selected.length, selectable: all}, s.selected.length >= all - 1);
  await page.close();
}

async function transforms(context) {
  const h = await boot(context, STAGE), page = h.page, [x, y] = await h.clearArea();
  const rect = await h.drawRect([x, y], [x + 200, y + 100]);
  const handle = async (id, corner) => { const {a, z} = await h.box(id); return corner === 'se' ? [z[0] + 6, z[1] + 6] : corner === 'e' ? [z[0] + 6, (a[1] + z[1]) / 2] : [(a[0] + z[0]) / 2, a[1] - 22]; };
  const get = async id => (await h.elements()).find(e => e.id === id);
  await h.drag(await handle(rect.id, 'se'), (await handle(rect.id, 'se')).map((v, i) => v + [80, 40][i]));
  let e = await get(rect.id);
  record('transforms', 'corner handle resizes', 'drag the bottom-right handle by (80, 40)', [Math.round(e.width), Math.round(e.height)], near(e.width, 280, 3) && near(e.height, 140, 3));
  await h.key(`${META}+z`); e = await get(rect.id);
  record('transforms', 'a resize undoes as one step', 'Cmd/Ctrl+Z once', [Math.round(e.width), Math.round(e.height)], near(e.width, 200, 1) && near(e.height, 100, 1));
  await h.select(rect.id); const se = await handle(rect.id, 'se');
  await h.drag(se, [se[0] + 100, se[1] + 10], {mods: ['Shift']}); e = await get(rect.id);
  record('transforms', 'Shift keeps proportions while resizing', 'Shift-drag the corner by (100, 10)', [Math.round(e.width), Math.round(e.height)], near(e.width / e.height, 2, 0.03));
  await h.key(`${META}+z`); await h.select(rect.id); const before = await get(rect.id), east = await handle(rect.id, 'e');
  await h.drag(east, [east[0] + 40, east[1]], {mods: ['Alt']}); e = await get(rect.id);
  record('transforms', 'Alt/Option resizes around the centre', 'Alt-drag the right handle by 40', {x: Math.round(e.x - before.x), width: Math.round(e.width - before.width)}, near(e.width - before.width, 80, 3) && near(e.x - before.x, -40, 3));
  await h.key(`${META}+z`); await h.select(rect.id); const top = await handle(rect.id, 'rot');
  await h.drag(top, [top[0] + 120, top[1] + 60]); e = await get(rect.id);
  record('transforms', 'rotation handle rotates', 'drag the handle above the top centre', {angle: +e.angle.toFixed(3)}, Math.abs(e.angle) > 0.1);
  await h.key(`${META}+z`); await h.select(rect.id); const top2 = await handle(rect.id, 'rot');
  await h.drag(top2, [top2[0] + 130, top2[1] + 40], {mods: ['Shift']}); e = await get(rect.id);
  const step = Math.PI / 12, snapped = Math.abs(e.angle / step - Math.round(e.angle / step)) < 0.01;
  record('transforms', 'Shift snaps rotation to 15 degree steps', 'Shift-drag the rotation handle', {degrees: +(e.angle * 180 / Math.PI).toFixed(2)}, snapped && Math.abs(e.angle) > 0.1);
  await h.key(`${META}+z`); await h.blank();
  const other = await h.drawRect([x + 300, y], [x + 400, y + 100]); await h.blank();
  await h.drag([x - 30, y - 30], [x + 430, y + 130]);
  const pair = [await get(rect.id), await get(other.id)], groupHandle = [(await h.box(other.id)).z[0] + 6, (await h.box(other.id)).z[1] + 6];
  await h.drag(groupHandle, [groupHandle[0] + 100, groupHandle[1] + 25]);
  const scaled = [await get(rect.id), await get(other.id)];
  record('transforms', 'multi-selection resizes around shared bounds', 'marquee two rectangles, drag the shared corner', scaled.map((s, i) => +(s.width / pair[i].width).toFixed(3)), scaled.every((s, i) => s.width > pair[i].width + 5) && near(scaled[0].width / pair[0].width, scaled[1].width / pair[1].width, 0.02));
  await h.blank();
  const page2 = await boot(context, STAGE), node = (await page2.elements()).find(el => el.role === 'node' && el.id === 'study:n:client') || firstNode(await page2.elements());
  const label = (await page2.elements()).find(el => el.containerId === node.id), arrows = (await page2.elements()).filter(el => el.start === node.id || el.end === node.id);
  const nb = await page2.box(node.id), zoom = (await page2.state()).zoom; await page2.drag([nb.c[0], nb.c[1]], [nb.c[0] + 60, nb.c[1] + 90]);
  const after = await page2.elements(), movedNode = after.find(el => el.id === node.id), movedLabel = after.find(el => el.id === label.id), movedArrows = arrows.map(a => after.find(el => el.id === a.id));
  const want = [60 / zoom, 90 / zoom];
  record('transforms', 'bound labels and connectors follow a moved component', 'drag a component by (60, 90) screen pixels', {nodeDelta: [Math.round(movedNode.x - node.x), Math.round(movedNode.y - node.y)], labelDelta: [Math.round(movedLabel.x - label.x), Math.round(movedLabel.y - label.y)], arrowsUpdated: movedArrows.filter((a, i) => a.x !== arrows[i].x || a.y !== arrows[i].y || JSON.stringify(a.points) !== JSON.stringify(arrows[i].points)).length, arrows: arrows.length},
    near(movedNode.x - node.x, want[0], 3) && near(movedLabel.x - label.x, movedNode.x - node.x, 1) && near(movedLabel.y - label.y, movedNode.y - node.y, 1) && arrows.length > 0 && movedArrows.every((a, i) => a.x !== arrows[i].x || a.y !== arrows[i].y || JSON.stringify(a.points) !== JSON.stringify(arrows[i].points)));
  await page2.page.close(); await page.close();
}

async function camera(context) {
  const h = await boot(context, STAGE), page = h.page;
  const snapshot = async () => (await h.elements()).map(e => [e.id, e.x, e.y]).join();
  const shapes = await snapshot();
  await h.key('h'); let s0 = await h.state(); const p = await h.emptyPoint(); await h.drag(p, [p[0] - 120, p[1] - 60]); let s = await h.state();
  const z = s0.zoom, moved = (a, b) => [Math.round((b.scrollX - a.scrollX) * z), Math.round((b.scrollY - a.scrollY) * z)];
  record('camera', 'hand tool pans the camera only', 'H, drag (-120, -60); scroll is in scene units, shown here times zoom', {screenScroll: moved(s0, s), zoom: z, tool: s.tool, elementsUnchanged: shapes === await snapshot()}, near(moved(s0, s)[0], -120, 2) && near(moved(s0, s)[1], -60, 2) && shapes === await snapshot());
  await h.key('r'); s0 = await h.state(); const q = await h.emptyPoint();   // the rectangle tool opens the style panel, so pick the point again
  await page.keyboard.down('Space'); await h.drag(q, [q[0] + 100, q[1] + 40]); await page.keyboard.up('Space'); s = await h.state();
  record('camera', 'Space-drag pans and restores the previous tool', 'R, hold Space, drag (100, 40), release', {screenScroll: moved(s0, s), toolAfter: s.tool, elementsUnchanged: shapes === await snapshot()}, near(moved(s0, s)[0], 100, 2) && s.tool === 'rectangle' && shapes === await snapshot());
  await h.key('Escape'); await h.key('v'); s0 = await h.state(); await h.drag(p, [p[0] - 90, p[1] + 30], {button: 'middle'}); s = await h.state();
  record('camera', 'middle-button drag pans', 'middle-drag (-90, 30)', {screenScroll: moved(s0, s)}, near(moved(s0, s)[0], -90, 2) && near(moved(s0, s)[1], 30, 2));
  const focal = [500, 420], before = await h.toScene(focal), zoomBefore = (await h.state()).zoom;
  await page.mouse.move(...focal); await page.keyboard.down(META); await page.mouse.wheel(0, -300); await page.keyboard.up(META); await page.waitForTimeout(150);
  s = await h.state(); const afterPt = await h.toScene(focal);
  record('camera', 'zoom keeps the point under the pointer fixed', 'Cmd/Ctrl+wheel at (500, 420)', {zoom: [+zoomBefore.toFixed(3), +s.zoom.toFixed(3)], drift: [+(afterPt[0] - before[0]).toFixed(2), +(afterPt[1] - before[1]).toFixed(2)]}, s.zoom > zoomBefore && Math.hypot(afterPt[0] - before[0], afterPt[1] - before[1]) < 1);
  await h.key(`${META}+0`); const z0 = (await h.state()).zoom; await h.key(`${META}+=`); const zin = (await h.state()).zoom; await h.key(`${META}+-`); await h.key(`${META}+-`); const zout = (await h.state()).zoom;
  record('camera', 'keyboard zoom in, out and reset', 'Cmd/Ctrl+0, +, -, -', {reset: z0, zoomIn: zin, zoomOut: zout}, z0 === 1 && zin > 1 && zout < 1);
  await h.key('Shift+1'); s = await h.state(); const els = await h.elements();
  const inView = await Promise.all(els.filter(e => !e.containerId).map(async e => { const a = await h.toScreen([e.x, e.y]), z = await h.toScreen([e.x + e.width, e.y + e.height]); return Math.min(a[0], z[0]) >= -2 && Math.min(a[1], z[1]) >= -2 && Math.max(a[0], z[0]) <= s.width + 2 && Math.max(a[1], z[1]) <= s.height + 2; }));
  record('camera', 'Shift+1 fits all elements', 'Shift+1', {zoom: +s.zoom.toFixed(3), allVisible: inView.every(Boolean)}, inView.every(Boolean));
  const target = firstNode(els); await h.select(target.id); await h.key('Shift+2'); s = await h.state();
  const fit = await h.box(target.id), visible = fit.a[0] >= 0 && fit.a[1] >= 0 && fit.z[0] <= s.width && fit.z[1] <= s.height;
  record('camera', 'Shift+2 fits the selection', 'select a component, Shift+2', {centre: fit.c.map(Math.round), visible, zoom: +s.zoom.toFixed(3)}, visible && near(fit.c[0], s.width / 2, 40));
  await h.blank(); await h.key(`${META}+a`); await h.key('Delete'); await h.key('Shift+1'); s = await h.state();
  record('camera', 'fitting an empty scene keeps a stable view', 'delete everything, Shift+1', {zoom: s.zoom, scroll: [s.scrollX, s.scrollY]}, Number.isFinite(s.zoom) && s.zoom > 0 && Number.isFinite(s.scrollX) && Number.isFinite(s.scrollY));
  await h.key(`${META}+z`); record('camera', 'camera moves do not take undo steps', 'delete, fit, then one undo restores the deleted scene', {restored: (await h.elements()).length === els.length}, (await h.elements()).length === els.length);
  await page.close();
}

module.exports = Object.assign(module.exports, {layout, drawing, focus, selection, transforms, camera, STAGE, firstNode});
Object.assign(module.exports, require('./audit-study-workspace-editing.cjs'));
