import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { sourceReceipt } from './runtime-audit-sources.mjs';
import { openBrowserAudit } from './browser-session.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const output = root + 'artifacts/system-diagram-subsystems';
await fs.mkdir(output, { recursive: true });
const report = {
  source: await sourceReceipt(root),
  boundary: 'Local browser interaction and screenshot evidence for versioned subsystem composition. Synthetic simulation only; not deployment, production capacity or human visual acceptance.',
  cases: [],
};
const widths = process.env.SIMULATTE_AUDIT_WIDTH ? [Number(process.env.SIMULATTE_AUDIT_WIDTH)] : [1440, 390];
assert.ok(widths.every(width => [1440, 390].includes(width)), 'Supported widths: 1440, 390');
for (const width of widths) {
  const viewport = { width, height: width === 390 ? 844 : 1000 };
  const row = { viewport, checks: {}, errors: [], networkFailures: [], screenshots: [] };
  report.cases.push(row);
  let browser;
  try {
    browser = await openBrowserAudit({ publicRoot: root + 'public', viewport });
    const client = browser.client;
    client.on('Runtime.exceptionThrown', event => row.errors.push(event.exceptionDetails?.exception?.description || event.exceptionDetails?.text));
    client.on('Network.responseReceived', event => { if (event.response.status >= 400) row.networkFailures.push(`${event.response.status} ${event.response.url}`); });
    client.on('Fetch.requestPaused', async event => {
      if (event.request.url.startsWith(browser.host.baseUrl)) await client.send('Fetch.continueRequest', { requestId: event.requestId });
      else await client.send('Fetch.failRequest', { requestId: event.requestId, errorReason: 'BlockedByClient' });
    });
    const evaluate = async expression => {
      const result = await client.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    };
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
    const until = async (expression, timeout = 15000) => {
      const end = Date.now() + timeout;
      while (!await evaluate(expression)) { if (Date.now() > end) throw Error(`Timed out: ${expression}`); await delay(60); }
    };
    const doc = () => evaluate('SimulatteSystemDiagramEditor.document()');
    async function set(id, value) {
      await evaluate(`(() => { const input = document.getElementById(${JSON.stringify(id)}); if (!input) throw Error('Missing field: ' + ${JSON.stringify(id)}); input.value = ${JSON.stringify(String(value))}; input.dispatchEvent(new Event('input', {bubbles:true})); input.dispatchEvent(new Event('change', {bubbles:true})); })()`);
      await delay(50);
    }
    async function key(key, code, windowsVirtualKeyCode, modifiers = 0) {
      await client.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode, modifiers });
      await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode, modifiers });
      await delay(50);
    }
    async function focus(selector) {
      await evaluate(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) throw Error('Missing selector: ' + ${JSON.stringify(selector)}); e.scrollIntoView({block:'center', inline:'center'}); e.focus(); })()`);
    }
    async function click(selector) {
      const point = await evaluate(`(async () => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) throw Error('Missing selector: ' + ${JSON.stringify(selector)}); e.scrollIntoView({block:'center', inline:'center'}); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); const b=e.getBoundingClientRect(); return {x:b.x+b.width/2-visualViewport.offsetLeft,y:b.y+b.height/2-visualViewport.offsetTop}; })()`);
      assert.ok(point.x >= 0 && point.x < width && point.y >= 0 && point.y < viewport.height, `Offscreen click ${selector}: ${JSON.stringify(point)}`);
      if (width === 390) await client.send('Input.synthesizeTapGesture', { ...point, duration: 30, gestureSourceType: 'touch' });
      else {
        await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
        await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 });
      }
      await delay(60);
    }
    async function button(label) {
      row.lastAction = label;
      // Rail sections such as Subsystem tools start collapsed; expand the owning section as a person would.
      if (await evaluate(`(() => { const b = [...document.querySelectorAll('#palette-drawer button')].find(b => b.textContent === ${JSON.stringify(label)}); return Boolean(b && document.body.dataset.paletteExpanded !== 'true'); })()`)) await click('#palette-toggle');
      if (await evaluate(`(() => { const b = [...document.querySelectorAll('#properties-drawer button')].find(b => b.textContent === ${JSON.stringify(label)}); return Boolean(b && document.getElementById('properties-drawer').inert); })()`)) await click('#properties-toggle');
      await evaluate(`(() => { const b = [...document.querySelectorAll('#palette-drawer button')].find(b => b.textContent === ${JSON.stringify(label)}); const d = b?.closest('details:not([open])'); if (d) d.open = true; })()`);
      await evaluate(`(()=>{const m=document.getElementById('workspace-menu'),b=[...document.querySelectorAll('#workspace-menu button')].find(b=>b.textContent===${JSON.stringify(label)});if(b&&!b.getClientRects().length&&m&&!m.open){m.open=true;m.dataset.auditOpened='1';}})()`);
      const before = await evaluate('Number(document.body.dataset.operationSequence || 0)');
      await evaluate(`(() => { const b = [...document.querySelectorAll('button')].find(b => b.textContent === ${JSON.stringify(label)} && b.getClientRects().length && !b.disabled); if (!b) throw Error('Missing enabled button: ' + ${JSON.stringify(label)}); b.dataset.subsystemAudit = 'active'; })()`);
      await evaluate(`document.querySelector('[data-subsystem-audit="active"]').scrollIntoView({block:'center',behavior:'instant'})`);
      await click('[data-subsystem-audit="active"]');
      await until(`Number(document.body.dataset.operationSequence || 0) > ${before}`);
      await evaluate(`document.querySelector('[data-subsystem-audit="active"]')?.removeAttribute('data-subsystem-audit')`);
      await evaluate(`(()=>{const m=document.getElementById('workspace-menu');if(m?.dataset.auditOpened){m.open=false;delete m.dataset.auditOpened;}})()`);
    }
    async function select(id) { await focus(`.sd-node[data-node-id="${id}"]`); await key('Enter', 'Enter', 13); assert.deepEqual(await evaluate('SimulatteSystemDiagramEditor.selection().nodes'), [id]); }
    async function shot(name) {
      assert.equal(await evaluate('innerWidth'), width, 'Layout viewport must match the requested audit width');
      assert.ok(await evaluate('document.documentElement.scrollWidth') <= width, 'Document must fit the requested audit width');
      const result = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      const filename = `${width}-${name}.png`; await fs.writeFile(output + '/' + filename, Buffer.from(result.data, 'base64')); row.screenshots.push(filename);
    }
    await client.send('Page.enable'); await client.send('Runtime.enable'); await client.send('Network.enable');
    await client.send('Fetch.enable', { patterns: [{ urlPattern: 'http://*', requestStage: 'Request' }, { urlPattern: 'https://*', requestStage: 'Request' }] });
    await client.send('Emulation.setDeviceMetricsOverride', { ...viewport, deviceScaleFactor: 1, mobile: width === 390 });
    await client.send('Emulation.setTouchEmulationEnabled', { enabled: width === 390 });
    await client.send('Page.navigate', { url: new URL('/system-diagram', browser.host.baseUrl).href });
    await until(`document.body?.dataset.editorReady === 'true'`);
    await set('preset', 'blank'); await until('SimulatteSystemDiagramEditor.document().nodes.length === 0');
    await click('.palette-item[data-class-id="web-client"]');
    const clientId = (await doc()).nodes[0].id;
    await click('.palette-item[data-class-id="web-server"]');
    const serverId = (await doc()).nodes.find(node => node.id !== clientId).id;
    await select(serverId);
    for (let i = 0; i < 4; i++) await key('ArrowRight', 'ArrowRight', 39, 8);
    await button('Fit');
    await focus(`[data-node-id="${clientId}"][data-port-id="out"]`); await key('Enter', 'Enter', 13);
    await focus(`[data-node-id="${serverId}"][data-port-id="in"]`); await key('Enter', 'Enter', 13);
    assert.equal((await doc()).edges.length, 1); row.checks.drawNamedConnection = true;
    await select(serverId); await set('subsystem-name', 'Backend'); await button('Save selection as subsystem');
    let current = await doc();
    assert.equal(current.schema, 'simulatte.systemDiagram.v4');
    const firstId = current.nodes.find(node => node.classId === 'subsystem.backend@1').id;
    assert.equal(current.subsystems[0].nodes[0].id, serverId);
    assert.ok(current.subsystems[0].ports.some(port => port.direction === 'in'));
    assert.equal(current.edges[0].to.nodeId, firstId); row.checks.captureRewiresBoundary = true;
    await button('Undo'); assert.ok((await doc()).nodes.some(node => node.id === serverId));
    await button('Redo'); assert.ok((await doc()).nodes.some(node => node.id === firstId)); row.checks.captureUndoRedo = true;
    await button('Insert subsystem'); current = await doc();
    const secondId = current.nodes.find(node => node.classId === 'subsystem.backend@1' && node.id !== firstId).id;
    assert.ok(secondId); row.checks.reusePinnedDefinition = true;
    await select(firstId); await button('Expand subsystem');
    assert.ok((await doc()).nodes.some(node => node.id === serverId));
    await select(serverId); await set('property-serviceMs', 30); await button('Apply overrides');
    await button('Fit'); await shot('definition-draft');
    await button('Publish new version'); current = await doc();
    assert.deepEqual(current.nodes.filter(node => [firstId, secondId].includes(node.id)).map(node => node.classId), ['subsystem.backend@1', 'subsystem.backend@1']);
    assert.equal(current.subsystems.find(definition => definition.version === 2).nodes[0].params.serviceMs, 30);
    row.checks.publishPreservesPinnedInstances = true;
    await select(firstId); await set('subsystem-version', '2'); await button('Upgrade instance');
    assert.equal((await doc()).nodes.find(node => node.id === firstId).classId, 'subsystem.backend@2');
    assert.equal((await doc()).nodes.find(node => node.id === secondId).classId, 'subsystem.backend@1'); row.checks.explicitUpgrade = true;
    const beforeCancel = await doc();
    await button('Expand subsystem'); await select(serverId); await set('property-serviceMs', 50); await button('Apply overrides'); await button('Cancel definition edits');
    // Cancel deliberately re-fits the camera; the claim is that no definition or graph edit survives.
    assert.deepEqual({ ...await doc(), view: null }, { ...beforeCancel, view: null }); row.checks.cancelDetachedDraft = true;
    await select(firstId); await set('subsystem-overrides', JSON.stringify({ [serverId]: { concurrency: 3 } })); await button('Apply subsystem overrides');
    assert.equal((await doc()).nodes.find(node => node.id === firstId).overrides[serverId].concurrency, 3); row.checks.instanceOverrides = true;
    await set('subsystem-name', 'Nested backend'); await button('Save selection as subsystem'); current = await doc();
    const nested = current.subsystems.find(definition => definition.id === 'nested-backend');
    assert.ok(nested.nodes.some(node => node.classId === 'subsystem.backend@2'));
    assert.equal(current.nodes.filter(node => node.classId === 'subsystem.nested-backend@1').length, 1); row.checks.nesting = true;
    await button('Fit'); await shot('nested-architecture');
    const runState = 'SimulatteSystemDiagramEditor.playback.controller.state()';
    await click('[data-run-command="toggle"]'); await until(`${runState}.running`);
    await click('[data-run-command="toggle"]'); await until(`!${runState}.running`);
    assert.ok(await evaluate(`${runState}.accepted`)); await click('[data-run-command="step"]');
    await click('.sd-run-more > summary'); await click('[data-run-command="verify"]');
    await until(`/Replay match/.test(document.getElementById('editor-status').textContent)`); row.checks.nestedRunReplay = true;
    await button('Copy library JSON');
    const portable = JSON.parse(await evaluate(`document.getElementById('subsystem-library-json').value`));
    const beforeConflict = await doc(), conflicting = structuredClone(portable); conflicting.subsystems[0].label += ' conflict';
    await set('subsystem-library-json', JSON.stringify(conflicting)); await button('Import library JSON');
    assert.deepEqual(await doc(), beforeConflict);
    assert.equal(await evaluate(`document.getElementById('editor-status').dataset.error`), 'true'); row.checks.conflictingImportIsAtomic = true;
    // Re-choosing the active preset is a no-op, and leaving edited work asks first; this journey discards it.
    for (const preset of ['web-service', 'blank']) {
      await set('preset', preset);
      if (await evaluate(`!document.getElementById('unsaved-dialog').hidden`)) await click('#unsaved-discard');
      await until(`SimulatteSystemDiagramEditor.document().nodes.length ${preset === 'blank' ? '=== 0' : '> 0'}`);
    }
    await set('subsystem-library-json', JSON.stringify(portable)); await button('Import library JSON');
    await set('subsystem-library', 'subsystem.nested-backend@1'); await button('Insert subsystem');
    assert.equal((await doc()).nodes[0].classId, 'subsystem.nested-backend@1'); row.checks.crossDiagramLibraryReuse = true;
    await button('Fit'); await shot('portable-library');
    assert.ok(await evaluate('document.documentElement.scrollWidth') <= width, 'Document must fit the requested audit width');
    assert.deepEqual(row.errors, []); assert.deepEqual(row.networkFailures, []); row.pass = true;
    console.log(`${width}: ${Object.keys(row.checks).length} subsystem browser checks passed`);
  } catch (error) {
    row.pass = false; row.error = error.stack;
    if (error.browserProcessLog) row.browserProcessLog = error.browserProcessLog;
    if (browser) {
      try {
        const capture = await browser.client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
        const filename = `${width}-failure.png`; await fs.writeFile(output + '/' + filename, Buffer.from(capture.data, 'base64')); row.screenshots.push(filename);
      } catch (captureError) { row.captureError = captureError.message; }
    }
    throw error;
  } finally {
    await fs.writeFile(output + '/browser.json', JSON.stringify(report, null, 2) + '\n');
    await browser?.close();
  }
}
console.log(JSON.stringify(report, null, 2));
