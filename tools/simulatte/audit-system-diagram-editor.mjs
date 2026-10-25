import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { sourceReceipt } from './runtime-audit-sources.mjs';
import { openBrowserAudit } from './browser-session.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const liveUrl = process.env.SIMULATTE_AUDIT_URL || '';
const output = root + 'artifacts/system-diagram-editor' + (liveUrl ? '/live' : '');
await fs.mkdir(output, { recursive: true });

const report = {
  source: await sourceReceipt(root),
  boundary: `${liveUrl ? 'Live hosted' : 'Local'} isolated Chrome browser editing journey verification for System Diagram Editor: Preset -> edit -> connect -> group -> collapse -> expand -> edit subsystem -> publish -> explicitly upgrade instance -> undo/redo -> save -> reload -> export/import.`,
  ...(liveUrl ? {url: liveUrl} : {}),
  cases: []
};
if (liveUrl) report.source.boundary = 'Local comparison checkout; browser evidence below comes from the named live URL.';

const viewports = [{ width: 1440, height: 1000 }, { width: 390, height: 844 }];
const requestedWidth = process.env.SIMULATTE_AUDIT_WIDTH ? Number(process.env.SIMULATTE_AUDIT_WIDTH) : null;
if (requestedWidth !== null && !viewports.some(v => v.width === requestedWidth)) throw Error('Unsupported audit viewport');

for (const viewport of viewports.filter(v => requestedWidth === null || v.width === requestedWidth)) {
  const browser = await openBrowserAudit({ publicRoot: root + 'public', url: liveUrl, viewport });
  const client = browser.client, errors = [], networkFailures = [], blockedExternal = [];
  const row = { viewport, checks: {}, errors, networkFailures, blockedExternal, screenshots: [] };
  report.cases.push(row);

  client.on('Runtime.exceptionThrown', e => errors.push(e.exceptionDetails?.exception?.description || e.exceptionDetails?.text));
  client.on('Network.responseReceived', e => { if (e.response.status >= 400) networkFailures.push(`${e.response.status} ${e.response.url}`); });
  client.on('Fetch.requestPaused', async e => {
    if (e.request.url.startsWith(browser.host.baseUrl)) await client.send('Fetch.continueRequest', { requestId: e.requestId });
    else {
      blockedExternal.push(new URL(e.request.url).origin);
      await client.send('Fetch.failRequest', { requestId: e.requestId, errorReason: 'BlockedByClient' });
    }
  });

  const evaluate = async expression => {
    const r = await client.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  const delay = ms => new Promise(r => setTimeout(r, ms));
  const until = async (expr, timeout = 30000) => {
    const end = Date.now() + timeout;
    while (!await evaluate(expr)) {
      if (Date.now() > end) throw Error('Timed out: ' + expr);
      await delay(60);
    }
  };
  const doc = () => evaluate('SimulatteSystemDiagramEditor.document()');

  async function reveal(selector) {
    const controls = await evaluate(`(() => {
      const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return [];
      const panel = e.closest('.palette-panel,.properties-panel');
      if (panel?.inert) return [panel.classList.contains('palette-panel') ? '#palette-toggle' : '#properties-toggle'];
      const controls = !panel && !e.closest('.drawer-toggle') ? [...document.querySelectorAll('.drawer-toggle[aria-expanded="true"]')].map(b => '#' + b.id) : [];
      const menu = e.closest('#document-menu,#edit-menu,#document-panel');
      if (menu && !menu.open && e.tagName !== 'SUMMARY') controls.push('#' + menu.id + ' > summary');
      return controls;
    })()`);
    for (const control of controls) await tapAt(await point(control));
    if (controls.length) await evaluate(`Promise.all([...document.querySelectorAll('.palette-panel,.properties-panel')].flatMap(p => p.getAnimations()).map(a => a.finished.catch(() => {})))`);
  }

  async function point(selector, { ratioX = .5, ratioY = .5, scroll = true } = {}) {
    await reveal(selector);
    return evaluate(`(async () => {
      const e = document.querySelector(${JSON.stringify(selector)});
      if (!e) throw Error('Missing: ' + ${JSON.stringify(selector)});
      ${scroll ? "if (!e.closest('#diagram')) e.scrollIntoView({block:'center',inline:'center'}); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));" : ''}
      const b = e.getBoundingClientRect();
      return { x: b.x + b.width * ${ratioX}, y: b.y + b.height * ${ratioY} };
    })()`);
  }

  async function inputPoint(p) {
    const v = await evaluate('({x:visualViewport.offsetLeft,y:visualViewport.offsetTop})');
    return { x: p.x - v.x, y: p.y - v.y };
  }

  async function tapAt(p, modifiers = 0) {
    p = await inputPoint(p);
    assert.ok(p.x >= 0 && p.y >= 0 && p.x < viewport.width && p.y < viewport.height, `Point outside viewport ${JSON.stringify(p)}`);
    if (viewport.width < 700 && !modifiers) {
      await client.send('Input.synthesizeTapGesture', { ...p, duration: 30, gestureSourceType: 'touch' });
    } else {
      await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...p, button: 'left', clickCount: 1, modifiers });
      await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...p, button: 'left', clickCount: 1, modifiers });
    }
    await delay(60);
  }

  async function click(selector, options) {
    await tapAt(await point(selector, options));
  }

  async function button(label) {
    const before = await evaluate('Number(document.body.dataset.operationSequence || 0)');
    const selector = await evaluate(`(() => {
      const b = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === ${JSON.stringify(label)} && !b.disabled);
      if (!b || b.disabled) throw Error('Missing enabled visible button ' + ${JSON.stringify(label)});
      b.dataset.auditButton = 'active';
      return '[data-audit-button="active"]';
    })()`);
    row.lastAction = { button: label };
    await click(selector);
    await until(`Number(document.body.dataset.operationSequence || 0) > ${before}`);
    await evaluate(`document.querySelector('[data-audit-button="active"]')?.removeAttribute('data-audit-button')`);
  }

  async function set(id, value, { operation = false } = {}) {
    await reveal('#' + id);
    const before = await evaluate('Number(document.body.dataset.operationSequence || 0)');
    await evaluate(`(() => {
      const e = document.getElementById(${JSON.stringify(id)});
      if (!e) throw Error('Missing field ' + ${JSON.stringify(id)});
      e.value = ${JSON.stringify(String(value))};
      e.dispatchEvent(new Event('input', { bubbles: true }));
      e.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    if (operation) await until(`Number(document.body.dataset.operationSequence || 0) > ${before}`);
    await delay(60);
  }

  async function drag(a, b, { touch = viewport.width < 700 } = {}) {
    a = await inputPoint(a); b = await inputPoint(b);
    row.lastAction = { drag: { from: a, to: b, touch } };
    if (touch) {
      await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...a, id: 1 }] });
      for (let i = 1; i <= 10; i++) {
        await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: a.x + (b.x - a.x) * i / 10, y: a.y + (b.y - a.y) * i / 10, id: 1 }] });
        await delay(25);
      }
      await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...a });
      await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...a, button: 'left', clickCount: 1 });
      for (let i = 1; i <= 10; i++) {
        await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: a.x + (b.x - a.x) * i / 10, y: a.y + (b.y - a.y) * i / 10, button: 'left', buttons: 1 });
        await delay(25);
      }
      await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...b, button: 'left', clickCount: 1 });
    }
    await delay(120);
  }

  async function shot(name) {
    const r = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const filename = `${viewport.width}-${name}.png`;
    await fs.writeFile(output + '/' + filename, Buffer.from(r.data, 'base64'));
    row.screenshots.push(filename);
  }

  function nodeSelector(id) { return `.sd-node[data-node-id="${id}"]`; }
  async function selectNode(id) {
    let p = await point(nodeSelector(id) + ' .sd-node-body', { ratioY: .2, scroll: false });
    if (p.x < 0 || p.x > viewport.width || p.y < 0 || p.y > viewport.height) {
      await button('Fit');
      p = await point(nodeSelector(id) + ' .sd-node-body', { ratioY: .2, scroll: false });
    }
    await tapAt(p);
  }
  async function portPoint(id, portId) { return point(`[data-port-id="${portId}"][data-node-id="${id}"]`, { scroll: false }); }

  async function checkPortAnchors() {
    const attachments = await evaluate(`(() => {
      const diagram=SimulatteSystemDiagramEditor.document();
      return [...document.querySelectorAll('.sd-edge')].map(group => {
        const edge=diagram.edges.find(e=>e.id===group.dataset.edgeId), path=group.querySelector('.sd-edge-line');
        return ['from','to'].map((side,i)=>{
          const end=edge[side], dot=document.querySelector('[data-port-id="'+CSS.escape(end.portId)+'"][data-node-id="'+CSS.escape(end.nodeId)+'"]').parentElement.querySelector('.sd-port-dot');
          const matrix=dot.getScreenCTM(), radius=Number(dot.getAttribute('r'));
          const expected=new DOMPoint(i ? -radius : radius,0).matrixTransform(matrix);
          const actual=path.getPointAtLength(i ? path.getTotalLength() : 0).matrixTransform(path.getScreenCTM());
          return {edge:edge.id,side,error:Math.hypot(expected.x-actual.x,expected.y-actual.y)};
        });
      }).flat();
    })()`);
    assert.ok(attachments.length, 'visible edges have port anchors');
    for (const end of attachments) assert.ok(end.error < .1, `${end.edge}.${end.side} attaches to the port boundary: ${end.error}px`);
  }

  try {
    await client.send('Page.enable'); await client.send('Runtime.enable'); await client.send('Network.enable');
    await client.send('Fetch.enable', { patterns: [{ urlPattern: 'http://*', requestStage: 'Request' }, { urlPattern: 'https://*', requestStage: 'Request' }] });
    await client.send('Emulation.setDeviceMetricsOverride', { ...viewport, deviceScaleFactor: 1, mobile: viewport.width < 700 });
    await client.send('Emulation.setTouchEmulationEnabled', { enabled: viewport.width < 700 });

    // Navigate to editor
    await client.send('Page.navigate', { url: liveUrl ? new URL('/system-diagram', liveUrl).href : browser.host.baseUrl + '/simulatte/system-diagram/' });
    await until(`document.body.dataset.editorReady === 'true'`);
    assert.equal(await evaluate('document.title'), 'System Diagram Editor · Simulatte World');
    row.checks.titleAndReady = true;
    row.build = await evaluate('document.querySelector(\'meta[name="simulatte-build"]\').content');
    const surface = await evaluate(`(() => {const r=document.getElementById('diagram').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};})()`);
    assert.deepEqual(surface, {x:0,y:0,...viewport}, 'drawing owns the whole viewport');
    row.checks.fullViewport = true;
    assert.ok(await evaluate(`document.querySelector('.workspace-toolbar').getBoundingClientRect().bottom < ${viewport.width < 700 ? 160 : 145}`), 'floating HUD stays compact');
    const beforeDrawer = await evaluate('SimulatteSystemDiagramEditor.viewport()');
    await click('#palette-toggle');
    assert.equal(await evaluate('document.getElementById("palette-drawer").inert'), false);
    await evaluate(`Promise.all(document.getElementById('palette-drawer').getAnimations().map(a=>a.finished))`);
    assert.ok(await evaluate(`(() => {const r=document.querySelector('#palette-drawer .panel-heading').getBoundingClientRect();return Boolean(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('#palette-drawer'));})()`), 'component drawer paints above the HUD');
    await shot('00-components-drawer');
    await client.send('Input.dispatchKeyEvent', {type:'keyDown',key:'Escape',code:'Escape'});
    await client.send('Input.dispatchKeyEvent', {type:'keyUp',key:'Escape',code:'Escape'});
    assert.equal(await evaluate('document.getElementById("palette-drawer").inert'), true);
    await click('#properties-toggle');
    await evaluate(`Promise.all(document.getElementById('properties-drawer').getAnimations().map(a=>a.finished))`);
    assert.ok(await evaluate(`(() => {const r=document.querySelector('#properties-drawer .panel-heading').getBoundingClientRect();return Boolean(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('#properties-drawer'));})()`), 'properties drawer paints above the HUD');
    await shot('00-properties-drawer');
    await tapAt({x:2,y:viewport.height*.8});
    assert.equal(await evaluate('document.getElementById("properties-drawer").inert'), true);
    assert.deepEqual(await evaluate('SimulatteSystemDiagramEditor.viewport()'), beforeDrawer, 'drawers never move diagram coordinates');
    row.checks.drawerDismissalAndStableCamera = true;

    // 1. PRESET: load starter preset
    await set('preset', 'web-service', { operation: true });
    const initialDoc = await doc();
    assert.ok(initialDoc.nodes.length >= 3, 'preset loads components');
    row.checks.presetLoaded = true;
    await shot('01-preset');

    // 2. EDIT: add component from palette, move coordinates, edit parameters
    const initialCount = initialDoc.nodes.length;
    await set('palette-search', 'Worker');
    const paletteItem = '.palette-item[data-class-id="worker"]';
    await click(paletteItem);
    const afterAdd = await doc();
    assert.equal(afterAdd.nodes.length, initialCount + 1, 'component added to diagram');
    const addedNode = afterAdd.nodes.at(-1);
    const addedId = addedNode.id;

    // Move node and verify coordinates
    const movePoint = await point(nodeSelector(addedId) + ' .sd-node-body', { ratioY: .2 });
    await drag(movePoint, { x: movePoint.x + 30, y: movePoint.y + 30 });
    const movedDoc = await doc();
    const movedNode = movedDoc.nodes.find(n => n.id === addedId);
    assert.ok(movedNode.x !== addedNode.x || movedNode.y !== addedNode.y, 'node moved to new coordinates');
    row.checks.nodeEditAndCoordinates = true;
    await shot('02-edited');

    // 3. CONNECT: connect worker output to added node input
    const edgeCountBefore = movedDoc.edges.length;
    await button('Fit');
    if (viewport.width < 700) {
      await click(`[data-port-id="calls"][data-node-id="worker"]`);
      await click(`[data-port-id="in"][data-node-id="${addedId}"]`);
    } else {
      await drag(await portPoint('worker', 'calls'), await portPoint(addedId, 'in'));
    }
    const connectedDoc = await doc();
    assert.equal(connectedDoc.edges.length, edgeCountBefore + 1, 'new edge added');
    const newEdge = connectedDoc.edges.find(e => e.from.nodeId === 'worker' && e.to.nodeId === addedId);
    assert.ok(newEdge, 'connection created between worker and added node');
    assert.equal(newEdge.from.portId, 'calls');
    assert.equal(newEdge.to.portId, 'in');
    row.checks.exactConnectionEndpoints = true;
    await checkPortAnchors();
    row.checks.portBoundaryAttachments = true;

    // 4. GROUP: select multiple nodes and cluster into a group
    await button('Select multiple');
    await selectNode('worker');
    await selectNode(addedId);
    await button('Group');
    await button('Select multiple');
    const groupedDoc = await doc();
    assert.ok(groupedDoc.groups.length >= 1, 'group created');
    const createdGroup = groupedDoc.groups.at(-1);
    assert.equal(groupedDoc.nodes.find(n => n.id === addedId).groupId, createdGroup.id, 'added node is in group');
    row.checks.groupClustered = true;
    await shot('03-grouped');

    // 5. COLLAPSE: collapse the group
    await click(`[data-group-id="${createdGroup.id}"] .sd-group-toggle`);
    const collapsedDoc = await doc();
    assert.equal(collapsedDoc.groups.find(g => g.id === createdGroup.id).collapsed, true, 'group collapsed');
    assert.equal(await evaluate(`document.querySelector('.sd-node[data-node-id="${addedId}"]') === null`), true, 'member nodes hidden when collapsed');
    row.checks.groupCollapsed = true;
    await checkPortAnchors();
    row.checks.foldedPortBoundaryAttachments = true;
    await shot('04-collapsed');

    // 6. EXPAND: expand the group back
    await click(`[data-group-id="${createdGroup.id}"] .sd-group-toggle`);
    const expandedDoc = await doc();
    assert.equal(expandedDoc.groups.find(g => g.id === createdGroup.id).collapsed, false, 'group expanded');
    assert.equal(await evaluate(`document.querySelector('.sd-node[data-node-id="${addedId}"]') !== null`), true, 'member nodes visible when expanded');
    const restoredMember = expandedDoc.nodes.find(n => n.id === addedId);
    assert.equal(restoredMember.x, movedNode.x, 'exact coordinates preserved across collapse/expand');
    row.checks.groupExpandedAndCoordinatesPreserved = true;
    await checkPortAnchors();
    await shot('05-expanded');

    // 7. EDIT SUBSYSTEM: save selection as subsystem, open detached editor
    await selectNode(addedId);
    await set('subsystem-name', 'Process Unit');
    await button('Save selection as subsystem');
    const subDoc = await doc();
    const subInstance = subDoc.nodes.find(n => n.classId?.startsWith('subsystem.process-unit@1'));
    assert.ok(subInstance, 'subsystem instance created at v1');

    // Open detached subsystem definition editor
    await selectNode(subInstance.id);
    await button('Inspect / edit subsystem');
    assert.ok(await evaluate('Boolean(SimulatteSystemDiagramEditor.subsystemEditor?.session?.active)'), 'detached subsystem editing active');
    const draftBeforeEdit = await doc();
    assert.notEqual(draftBeforeEdit.id, subDoc.id, 'canvas shows detached draft diagram');
    row.checks.detachedSubsystemEditorOpened = true;
    await shot('06-subsystem-draft');

    // 8. PUBLISH: publish new version v2
    await button('Publish new version');
    assert.equal(await evaluate('Boolean(SimulatteSystemDiagramEditor.subsystemEditor?.session?.active)'), false, 'subsystem editing session closed');
    const afterPublish = await doc();
    const publishedDef = afterPublish.subsystems.find(s => s.id === 'process-unit' && s.version === 2);
    assert.ok(publishedDef, 'version 2 published in parent document');
    // Existing instance must remain pinned to v1 until explicit upgrade
    const pinnedInstance = afterPublish.nodes.find(n => n.id === subInstance.id);
    assert.equal(pinnedInstance.classId, 'subsystem.process-unit@1', 'instance remains pinned to v1');
    row.checks.publishedVersionPinned = true;

    // 9. EXPLICITLY UPGRADE INSTANCE
    await selectNode(pinnedInstance.id);
    await set('subsystem-version', '2');
    await button('Upgrade instance');
    const upgradedDoc = await doc();
    assert.equal(upgradedDoc.nodes.find(n => n.id === pinnedInstance.id).classId, 'subsystem.process-unit@2', 'instance upgraded to v2');
    row.checks.explicitInstanceUpgrade = true;
    await shot('07-upgraded');

    // 10. UNDO / REDO
    await button('Undo');
    const undoneDoc = await doc();
    assert.equal(undoneDoc.nodes.find(n => n.id === pinnedInstance.id).classId, 'subsystem.process-unit@1', 'undo restores pinned v1');
    await button('Redo');
    const redoneDoc = await doc();
    assert.equal(redoneDoc.nodes.find(n => n.id === pinnedInstance.id).classId, 'subsystem.process-unit@2', 'redo restores upgraded v2');
    row.checks.undoRedoIntegrity = true;

    // 11. SAVE: save diagram to local storage
    await button('Save');
    const savedView = await evaluate('SimulatteSystemDiagramEditor.viewport()');
    assert.equal(await evaluate(`document.getElementById('revision').textContent`), 'Saved');
    row.checks.savedToStorage = true;
    await shot('08-saved');

    // 12. RELOAD: verify recovery from storage
    const loaded = client.once('Page.loadEventFired');
    await client.send('Page.reload'); await loaded;
    await until(`document.body.dataset.editorReady === 'true'`);
    assert.deepEqual((await doc()).nodes, redoneDoc.nodes, 'browser reload automatically restores the saved architecture');
    assert.deepEqual(await evaluate('SimulatteSystemDiagramEditor.viewport()'), savedView, 'browser reload restores the saved camera');
    await button('Load');
    const reloadedDoc = await doc();
    assert.equal(reloadedDoc.nodes.length, redoneDoc.nodes.length, 'reloaded document component count matches');
    assert.equal(reloadedDoc.nodes.find(n => n.id === pinnedInstance.id).classId, 'subsystem.process-unit@2', 'reloaded instance preserves v2');
    row.checks.reloadRecovery = true;
    await shot('09-reloaded');

    // 13. EXPORT / IMPORT: round-trip through JSON
    await click('#document-panel>summary');
    await button('Show JSON');
    const jsonText = await evaluate(`document.getElementById('document').value`);
    assert.ok(jsonText.includes('process-unit'), 'exported JSON contains subsystem definition');
    await button('Import JSON');
    const importedDoc = await doc();
    assert.deepEqual(importedDoc.nodes.map(n => n.id), reloadedDoc.nodes.map(n => n.id), 'imported nodes match reloaded document');
    row.checks.jsonExportImport = true;
    await shot('10-exported');

    row.pass = true;
    console.log(`${viewport.width}: all 13 editing journey checks passed successfully`);
  } catch (error) {
    row.pass = false;
    row.error = error.stack;
    row.diagnostic = await evaluate(`({view:SimulatteSystemDiagramEditor.viewport(), diagram:SimulatteSystemDiagramEditor.document(), scroll:{x:scrollX,y:scrollY,canvas:document.getElementById('diagram').scrollLeft}, fit:[...document.querySelectorAll('#view-actions button')].map(e=>({label:e.textContent,rect:e.getBoundingClientRect().toJSON()}))})`);
    await shot('failure');
    throw error;
  } finally {
    await fs.writeFile(output + '/browser.json', JSON.stringify(report, null, 2) + '\n');
    await browser.close();
  }
}

console.log(JSON.stringify(report, null, 2));
