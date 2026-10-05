import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { openBrowserAudit } from './browser-session.mjs';
import { sourceReceipt } from './runtime-audit-sources.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(import.meta.url);
const catalog = require('../../public/simulation-routes.js');
const output = root + 'artifacts/2026-10-04-catalog/qualification-verified';
await fs.mkdir(output, { recursive: true });
const browser = await openBrowserAudit({ publicRoot: root + 'public', webgpu: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const { client } = browser;
const report = { sources: await sourceReceipt(root), cases: [], errors: [] };
const evaluate = async expression => {
  const result = await client.send('Runtime.evaluate', { expression, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
};
const wait = async (expression, label, limit = 120000) => {
  const deadline = Date.now() + limit;
  while (Date.now() < deadline) {
    const value = await evaluate(expression);
    if (value) return value;
    const error = await evaluate('globalThis.__simulatteLastFailError?.message || document.body?.dataset.runtimeError');
    if (error) throw new Error(error);
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error('Timed out at ' + label);
};
async function settle() {
  const progressive = await evaluate("!document.getElementById('pause-button').hidden && Number(document.getElementById('playback-timeline').max) > 0");
  if (progressive) {
    await evaluate("document.getElementById('pause-button').click()");
    await wait("['paused','completed'].includes(document.body.dataset.journeyPhase)", 'pause-before-end-preview');
    if (await evaluate("document.body.dataset.journeyPhase === 'paused'")) {
      await evaluate("(() => { const timeline = document.getElementById('playback-timeline'); timeline.value = timeline.max; timeline.dispatchEvent(new Event('change', { bubbles: true })); })()");
      await wait("document.body.dataset.journeyPhase === 'paused' && document.getElementById('playback-timeline').value === document.getElementById('playback-timeline').max && document.getElementById('runtime-status').textContent.startsWith('End preview') && !document.getElementById('resume-button').disabled", 'terminal-preview-ready');
      await evaluate("document.getElementById('resume-button').click()");
    }
  }
  await wait("document.body.dataset.journeyPhase === 'completed'", 'run-completion');
  return progressive ? 'terminal preview followed by resumed settlement' : 'ordinary settlement';
}
try {
  await client.send('Page.enable'); await client.send('Runtime.enable');
  client.on('Runtime.exceptionThrown', event => report.errors.push(event.exceptionDetails));
  report.browser = await client.send('Browser.getVersion');
  for (const route of ['/grid', '/subsea', '/orbital', '/interstellar', '/simulatte/solar-drive/index.html']) {
    const page = catalog.forPath(route);
    for (const [width, height] of [[1440,1000], [390,844]]) {
      const row = { route, profile: page.profile || null, viewport: { width, height }, pass: false };
      report.cases.push(row);
      try {
        await client.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 });
        await client.send('Page.navigate', { url: browser.host.baseUrl.replace(/\/$/, '') + route });
        if (!page.profile) {
          await wait("document.getElementById('gpu-status')?.dataset.state === 'ready'", 'solar-renderer');
          await evaluate("document.getElementById('run').click()");
          await wait("document.getElementById('clock')?.textContent !== '00:00'", 'solar-progress');
          await evaluate("document.getElementById('run').click(); document.getElementById('replay').click()");
          await wait("document.body.dataset.replay === 'pass'", 'solar-replay');
          row.replay = 'pass';
          row.measures = await evaluate("document.getElementById('run-state').textContent");
          await evaluate("document.querySelector('[data-component=\"battery\"]').click()");
          row.objectAction = await evaluate("document.querySelector('[data-component=\"battery\"]')?.getAttribute('aria-pressed')");
          assert.equal(row.objectAction, 'true');
        } else {
          await wait(`document.getElementById('application-profile')?.value === ${JSON.stringify(page.profile)} && ['running','completed'].includes(document.body.dataset.journeyPhase)`, 'opening');
          assert.equal(await evaluate("document.getElementById('decisions-button').getAttribute('aria-expanded')"), 'false');
          row.opening = await evaluate('document.body.dataset.journeyPhase');
          row.completion = await settle();
          row.measures = await evaluate("({ text: document.getElementById('experience-summary-stats')?.innerText, quantities: globalThis.__simulattePluginPlatformV4?.contributions.flatMap(c => c.state.measures) })");
          assert.ok(row.measures.text?.trim());
          assert.ok(row.measures.quantities?.some(m => Number.isFinite(m.value) && m.unit));
          await evaluate("document.getElementById('camera-free').click()");
          assert.equal(await evaluate("document.getElementById('camera-free').getAttribute('aria-pressed')"), 'true');
          await evaluate("document.getElementById('camera-reset').click()");
          row.camera = 'free and reset controls respond';
          await evaluate(`(() => { const select = document.querySelector('select[aria-label="Inspect object"]');
            if (!select || select.options.length < 2) throw new Error('Selectable object missing');
            const objects = globalThis.__simulattePluginPlatformV4.contributions.flatMap(c => c.objects);
            const target = objects.find(o => o.actions.some(a => a.available) && [...select.options].some(option => option.value === o.id));
            if (!target) throw new Error('Selectable domain action missing');
            select.value = target.id; select.dispatchEvent(new Event('change', { bubbles: true })); })()`);
          await wait("document.querySelector('.sim-object-actions button')?.textContent", 'object-actions');
          row.selectedObject = await evaluate("document.querySelector('select[aria-label=\"Inspect object\"]').value");
          await evaluate(`(() => { const button = [...document.querySelectorAll('.sim-object-actions button')].find(b => !b.disabled && b.textContent !== 'Focus object');
            if (!button) throw new Error('Domain object action missing'); button.click(); })()`);
          row.objectAction = await wait("(() => { const text = document.querySelector('.sim-object-inspector [role=status]')?.textContent; if (text && text !== 'Pending') return text; return [...document.querySelectorAll('canvas')].some(c => c.__simulattePreview?.()) ? 'Alternative drawn' : null; })()", 'object-action');
          assert.ok(/Applied|Alternative|dismissed|restart|accepted/i.test(row.objectAction), row.objectAction);
          row.actionCompletion = await settle();
          await evaluate("document.getElementById('decisions-button').click()");
          await wait("!document.getElementById('replay-profile-world-spec')?.disabled", 'replay-control');
          row.beforeReplay = await evaluate("JSON.parse(document.getElementById('profile-world-proof').textContent).createdAt");
          await evaluate("document.getElementById('replay-profile-world-spec').click()");
          row.replay = await wait(`(() => { try { const proof = JSON.parse(document.getElementById('profile-world-proof').textContent);
            return proof.createdAt !== ${JSON.stringify(row.beforeReplay)} && proof.proofClasses.replay.status === 'pass' ? proof.proofClasses.replay.status : null; } catch { return null; } })()`, 'exact-replay-proof');
        }
        assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth'), false);
        const shot = await client.send('Page.captureScreenshot', { format: 'png' });
        row.screenshot = `${page.profile || 'solar-drive'}-${width}.png`;
        await fs.writeFile(output + '/' + row.screenshot, Buffer.from(shot.data, 'base64'));
        row.pass = true;
      } catch (error) { row.failure = error.stack; }
      console.log(JSON.stringify({ route, width, pass: row.pass, failure: row.failure }));
      await fs.writeFile(output + '/browser.json', JSON.stringify(report, null, 2) + '\n');
    }
  }
} finally {
  await browser.close();
  await fs.writeFile(output + '/browser.json', JSON.stringify(report, null, 2) + '\n');
}
if (report.errors.length || report.cases.some(row => !row.pass)) process.exitCode = 1;
