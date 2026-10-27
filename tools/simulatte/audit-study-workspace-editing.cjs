'use strict';
// Text, connection and editing suites for the study workspace acceptance audit.
const {boot, record, near, META} = require('./audit-study-workspace.cjs');
const STAGE = '?problem=L034&approach=push&stage=3';

async function text(context) {
  const h = await boot(context, STAGE), page = h.page, [x, y] = await h.clearArea();
  const rect = await h.drawRect([x, y], [x + 220, y + 90]);
  await h.key('Enter'); await page.keyboard.type('Queue α → β'); await page.keyboard.press('Enter'); await page.keyboard.type('two  spaces kept'); await h.key('Escape');
  let label = (await h.elements()).find(e => e.containerId === rect.id);
  record('text', 'in-place multiline label with Unicode and whitespace', 'select a rectangle, Enter, type two lines, Escape', {originalText: label?.originalText}, label?.originalText === 'Queue α → β\ntwo  spaces kept');
  await h.select(rect.id); await h.key('Enter'); await page.keyboard.type(' plus a long tail that has to wrap inside the box'); await h.key(`${META}+Enter`);
  label = (await h.elements()).find(e => e.containerId === rect.id);
  record('text', 'long labels wrap inside their container; Cmd/Ctrl+Enter commits', 'append a long phrase, Cmd/Ctrl+Enter', {lines: label?.text.split('\n').length, typedLines: label?.originalText.split('\n').length, editing: (await h.state()).editing}, label && label.text.split('\n').length > label.originalText.split('\n').length && !(await h.state()).editing);
  await h.key(`${META}+z`); label = (await h.elements()).find(e => e.containerId === rect.id);
  record('text', 'an edit can be cancelled with undo', 'Cmd/Ctrl+Z after the edit', {originalText: label?.originalText}, label?.originalText === 'Queue α → β\ntwo  spaces kept');
  await h.select(rect.id); await page.click('.App-menu__left button.color-picker__button[title="#e03131"]').catch(() => {}); await page.waitForTimeout(100);
  const red = (await h.elements()).find(e => e.id === rect.id);
  record('text', 'contextual style changes the selection', 'select, click the red stroke swatch', {strokeColor: red.strokeColor}, red.strokeColor === '#e03131');
  const seed = red.seed; await h.key(`${META}+=`); await h.key(`${META}+=`); await h.blank(); await h.select(rect.id);
  const again = (await h.elements()).find(e => e.id === rect.id);
  record('text', 'hand-drawn appearance is stable across zoom and selection', 'zoom twice, reselect, compare the drawing seed', {seed: [seed, again.seed]}, seed === again.seed);
  await page.close();
}

async function connections(context) {
  const h = await boot(context, STAGE), page = h.page, [x, y] = await h.clearArea();
  const a = await h.drawRect([x, y], [x + 120, y + 70]); await h.blank();
  const b = await h.drawRect([x + 320, y], [x + 440, y + 70]); await h.blank();
  const c = await h.drawRect([x + 320, y + 180], [x + 440, y + 250]); await h.blank();
  let before = await h.elements(), suggested = 0; await h.key('a');
  await h.drag([x + 124, y + 35], [x + 318, y + 35], {before: async () => { await page.mouse.move(x + 316, y + 35, {steps: 4}); suggested = (await h.state()).suggested; }});
  let arrow = (await h.newest(before))[0];
  record('connections', 'binding feedback and attachment', 'A, drag from one rectangle edge to another', {suggestedWhileDragging: suggested, start: arrow?.start === a.id, end: arrow?.end === b.id}, suggested > 0 && arrow?.start === a.id && arrow?.end === b.id);
  await h.blank(); before = await h.elements(); await h.key('a');
  await h.drag([x + 124, y + 60], [x + 318, y + 60], {mods: [META]});
  const free = (await h.newest(before))[0];
  record('connections', 'Cmd/Ctrl suppresses binding', 'A, Cmd-drag between the same edges', {start: free?.start, end: free?.end}, free && !free.start && !free.end);
  await h.blank(); await h.select(arrow.id);
  const endPoint = await h.toScreen([arrow.x + arrow.points.at(-1)[0], arrow.y + arrow.points.at(-1)[1]]);
  await h.drag(endPoint, [x + 380, y + 174]);   // just outside the third rectangle's top edge
  const rebound = (await h.elements()).find(e => e.id === arrow.id);
  record('connections', 'dragging an endpoint reroutes the connector', 'drag the arrow end onto a third rectangle', {end: rebound.end, expected: c.id}, rebound.end === c.id);
  await h.blank(); const mid = await h.toScreen([rebound.x + rebound.points.at(-1)[0] / 2, rebound.y + rebound.points.at(-1)[1] / 2]);
  await page.mouse.dblclick(...mid); await page.waitForTimeout(150); await page.keyboard.type('calls'); await h.key('Escape');
  const arrowLabel = (await h.elements()).find(e => e.containerId === arrow.id);
  record('connections', 'arrow labels stay with their connector', 'double-click the arrow, type, Escape', {label: arrowLabel?.originalText}, arrowLabel?.originalText === 'calls');
  // Typed ports: an arrow between two authored components becomes a semantic connection only for a matching contract.
  const h2 = await boot(context, '?problem=L034&approach=push&stage=8');
  const plan = await h2.page.evaluate(() => {
    const ws = SimulatteStudyInspector.workspace(), sol = ws.document.solutions.find(s => s.id === ws.view.solutionId), graph = sol.stages[ws.view.stageIndex].graph;
    const drawn = new Set(SimulatteStudyInspector.elements().filter(e => e.customData?.study?.role === 'node').map(e => e.customData.study.nodeId));
    const nodes = graph.nodes.filter(n => drawn.has(n.id)), pairs = [];
    for (const p of nodes) for (const q of nodes) if (p !== q) pairs.push([p.id, q.id, SimulatteStudyScene.portMatches(ws.document, graph, p.id, q.id)]);
    const good = pairs.find(([, , m]) => m.options.length), bad = pairs.find(([, , m]) => !m.options.length && !/different subsystems/.test(m.reason));
    return {good: good && good.slice(0, 2), bad: bad && [bad[0], bad[1], bad[2].reason]};
  });
  const connectBetween = async ([from, to]) => {
    const A = await h2.box(`study:n:${from}`), B = await h2.box(`study:n:${to}`), before2 = await h2.elements();
    const edgeOf = (r, other) => { const dx = other.c[0] - r.c[0], dy = other.c[1] - r.c[1], w = (r.z[0] - r.a[0]) / 2, hh = (r.z[1] - r.a[1]) / 2, t = Math.min(w / Math.abs(dx || 1e-6), hh / Math.abs(dy || 1e-6)); const side = Math.abs(dx) * hh >= Math.abs(dy) * w; return [r.c[0] + dx * t + (side ? Math.sign(dx) * 5 : 0), r.c[1] + dy * t + (side ? 0 : Math.sign(dy) * 5)]; };   // 5px outside the outline
    await h2.focusCanvas(); await h2.key('Escape'); await h2.key('a'); await h2.drag(edgeOf(A, B), edgeOf(B, A), {steps: 20});
    return (await h2.newest(before2)).find(e => e.type === 'arrow');
  };
  if (plan.good) {
    const drawn = await connectBetween(plan.good); await h2.openTab('Inspect');
    const options = await h2.page.$$eval('.sw-sidebar .sw-button.block', bs => bs.map(b => b.textContent));
    if (options.length) await h2.page.click('.sw-sidebar .sw-button.block');
    await h2.page.waitForTimeout(400);
    const connected = (await h2.elements()).find(e => e.id === drawn?.id);
    const overlay = await h2.page.evaluate(id => { const ws = SimulatteStudyInspector.workspace(); const sol = ws.document.solutions.find(s => s.id === ws.view.solutionId); return !!ws.overlays[sol.id]?.[sol.stages[ws.view.stageIndex].id]?.elements.some(e => e.id === id); }, drawn?.id);
    record('connections', 'compatible ports turn a drawn arrow into a typed connection', `draw ${plan.good.join(' → ')}, Inspect, choose the contract`, {bound: [drawn?.start, drawn?.end], options, connection: connected?.connection, savedInStageOverlay: overlay},
      !!drawn?.start && !!drawn?.end && options.length > 0 && !!connected?.connection?.contractId && overlay);
  } else record('connections', 'compatible ports turn a drawn arrow into a typed connection', 'find a compatible pair', 'no compatible pair drawn in this stage', false);
  if (plan.bad) {
    await h2.closeSidebar(); await h2.key('Escape');
    const drawn = await connectBetween(plan.bad); await h2.openTab('Inspect');
    const shown = await h2.page.$eval('.sw-sidebar', s => s.innerText);
    record('connections', 'incompatible ports are explained, not accepted', `draw ${plan.bad[0]} → ${plan.bad[1]}`, {bound: [drawn?.start, drawn?.end], explanation: shown.includes('No contract matches'), options: await h2.page.$$eval('.sw-sidebar .sw-button.block', bs => bs.length)},
      !!drawn?.start && shown.includes('No contract matches') && (await h2.page.$$eval('.sw-sidebar .sw-button.block', bs => bs.length)) === 0);
  }
  await h2.page.close(); await page.close();
}

async function editing(context) {
  const h = await boot(context, STAGE), page = h.page, [x, y] = await h.clearArea();
  let r = await h.drawRect([x, y], [x + 100, y + 60]);
  const count = async () => (await h.elements()).length;
  let n = await count(); await h.key(`${META}+c`); await page.mouse.move(x + 300, y + 200); await h.key(`${META}+v`); await page.waitForTimeout(150);
  record('editing', 'copy and paste', 'Cmd/Ctrl+C, Cmd/Ctrl+V', {before: n, after: await count()}, (await count()) === n + 1);
  n = await count(); let before = await h.elements(); await h.key(`${META}+x`); const cut = await count(); await h.key(`${META}+v`); await page.waitForTimeout(150);
  const pasted = (await h.newest(before))[0];
  record('editing', 'cut and paste', 'Cmd/Ctrl+X, Cmd/Ctrl+V', {before: n, afterCut: cut, afterPaste: await count()}, cut === n - 1 && (await count()) === n && !!pasted);
  r = pasted || r;
  await h.blank(); await h.select(r.id); n = await count(); before = await h.elements(); await h.key(`${META}+d`);
  const dup = (await h.newest(before))[0];
  record('editing', 'duplicate', 'Cmd/Ctrl+D', {before: n, after: await count(), selectedIsCopy: (await h.state()).selected[0] === dup?.id}, (await count()) === n + 1 && (await h.state()).selected[0] === dup?.id);
  await h.key('Delete');
  record('editing', 'delete removes the selection', 'Delete the selected copy', {copyPresent: (await h.elements()).some(e => e.id === dup?.id), originalPresent: (await h.elements()).some(e => e.id === r.id)}, !(await h.elements()).some(e => e.id === dup?.id) && (await h.elements()).some(e => e.id === r.id));
  await h.blank(); await h.select(r.id); n = await count(); const box = await h.box(r.id);
  await h.drag([box.a[0] + 1, box.c[1]], [box.a[0] + 1, box.c[1] + 120], {mods: ['Alt']});
  const els = await h.elements(), original = els.find(e => e.id === r.id);
  record('editing', 'Alt/Option-drag duplicates', 'Alt-drag the rectangle 120 down', {before: n, after: els.length, copyLeftAtOrigin: els.some(e => e.id !== r.id && e.type === 'rectangle' && near(e.x, r.x, 1) && near(e.y, r.y, 1)), originalMoved: near(original.y - r.y, 120, 3)}, els.length === n + 1);
  await h.key(`${META}+z`);
  await h.blank(); await h.select(r.id); await h.key('Delete'); const gone = !(await h.elements()).some(e => e.id === r.id);
  await h.key(`${META}+z`); const back = (await h.elements()).some(e => e.id === r.id); await h.key(`${META}+Shift+z`); const redone = !(await h.elements()).some(e => e.id === r.id); await h.key(`${META}+z`);
  record('editing', 'undo and redo', 'Delete, undo, redo, undo', {deleted: gone, undone: back, redone, restored: (await h.elements()).some(e => e.id === r.id)}, gone && back && redone && (await h.elements()).some(e => e.id === r.id));
  const [gx, gy] = await h.clearArea(); const g1 = await h.drawRect([gx, gy], [gx + 100, gy + 60]); await h.blank(); const s2 = await h.drawRect([gx + 150, gy], [gx + 250, gy + 60]); await h.blank();
  await h.drag([gx - 20, gy - 20], [gx + 270, gy + 80]); await h.key(`${META}+g`);
  let g = (await h.elements()).filter(e => e.id === g1.id || e.id === s2.id).map(e => e.groupIds.join());
  const grouped = !!g[0] && g[0] === g[1]; await h.key(`${META}+Shift+g`);
  g = (await h.elements()).filter(e => e.id === g1.id || e.id === s2.id).map(e => e.groupIds.length);
  record('editing', 'group and ungroup', 'marquee two rectangles, Cmd/Ctrl+G, Cmd/Ctrl+Shift+G', {grouped, groupsAfterUngroup: g}, grouped && g.every(v => v === 0));
  // Layer order on two fresh overlapping rectangles: A drawn first sits below B.
  const [lx, ly] = await h.clearArea(); await h.blank();
  const A = await h.drawRect([lx, ly], [lx + 120, ly + 80]); await h.blank(); const B = await h.drawRect([lx + 60, ly + 40], [lx + 180, ly + 120]); await h.blank();
  const index = async id => (await h.elements()).findIndex(e => e.id === id);
  await page.mouse.click(lx + 1, ly + 20); const picked = (await h.state()).selected[0] === A.id, i0 = await index(A.id);
  await h.key(`${META}+]`); const forward = await index(A.id); await h.key(`${META}+[`); const backward = await index(A.id);
  record('editing', 'layer order: bring forward and send backward', 'select the lower rectangle, Cmd/Ctrl+], then Cmd/Ctrl+[', {selected: picked, index: [i0, forward, backward], aboveB: forward > await index(B.id)}, picked && forward > i0 && backward === i0);
  const menu = async label => { await page.mouse.click(lx + 1, ly + 20, {button: 'right'}); await page.waitForTimeout(300); await page.click(`.context-menu .context-menu-item:has-text("${label}")`); await page.waitForTimeout(150); };
  await menu('Bring to front'); const atFront = (await h.elements()).at(-1)?.id === A.id; await menu('Send to back'); const atBack = (await h.elements())[0]?.id === A.id;
  record('editing', 'layer order: bring to front and send to back', 'right-click → Bring to front, then Send to back', {front: atFront, back: atBack}, atFront && atBack);
  await h.blank(); await page.mouse.click(lx + 1, ly + 20); const before3 = await index(A.id); await h.key(`${META}+Alt+]`);
  record('editing', 'Help-listed Cmd+Option+] brings to front', 'press Cmd/Ctrl+Option+] with the rectangle selected', {indexBefore: before3, indexAfter: await index(A.id), last: (await h.elements()).length - 1}, (await index(A.id)) === (await h.elements()).length - 1);
  await h.key(`${META}+Alt+[`);
  record('editing', 'Help-listed Cmd+Option+[ sends to back', 'press Cmd/Ctrl+Option+[ with the same rectangle selected', {indexAfter: await index(A.id)}, (await index(A.id)) === 0);
  // Grouping authored components is a drawing convenience: the authored document and subsystems stay unchanged.
  const h2 = await boot(context, STAGE), published = JSON.stringify((await h2.workspace()).document);
  const nodes = (await h2.elements()).filter(e => e.role === 'node').slice(0, 2);
  await h2.select(nodes[0].id); const b2 = await h2.box(nodes[1].id); await h2.page.keyboard.down('Shift'); await h2.page.mouse.click(...b2.c); await h2.page.keyboard.up('Shift');
  await h2.key(`${META}+g`); await h2.page.waitForTimeout(500);
  const ws = await h2.workspace(), sol = ws.document.solutions.find(s => s.id === ws.view.solutionId), overlay = ws.overlays[sol.id]?.[sol.stages[ws.view.stageIndex].id];
  const fields = Object.values(overlay?.patches || {}).flatMap(p => Object.keys(p));
  record('editing', 'grouping does not invent subsystem ownership', 'group two authored components', {authoredUnchanged: JSON.stringify(ws.document) === published, overlayFields: [...new Set(fields)]}, JSON.stringify(ws.document) === published && fields.length > 0 && fields.every(f => f === 'groupIds'));
  await h2.page.close(); await page.close();
}

module.exports = {text, connections, editing};
