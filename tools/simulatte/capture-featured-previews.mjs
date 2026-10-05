import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { openBrowserAudit } from './browser-session.mjs';
import { sourceReceipt } from './runtime-audit-sources.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(import.meta.url);
const catalog = require('../../public/simulation-routes.js');
const output = root + 'public/simulation-previews';
await fs.mkdir(output, { recursive: true });
const browser = await openBrowserAudit({ publicRoot: root + 'public', viewport: { width: 1200, height: 800 },
  webgpu: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const { client } = browser;
const receipt = { capturedAt: new Date().toISOString(), sources: await sourceReceipt(root), captures: [] };
const evaluate = async expression => {
  const result = await client.send('Runtime.evaluate', { expression, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
};
try {
  await client.send('Page.enable'); await client.send('Runtime.enable');
  receipt.browser = await client.send('Browser.getVersion');
  for (const page of catalog.featured) {
    await client.send('Page.navigate', { url: browser.host.baseUrl.replace(/\/$/, '') + page.path });
    const deadline = Date.now() + 120000;
    let state;
    do {
      await new Promise(resolve => setTimeout(resolve, 200));
      state = await evaluate(`({ phase: document.body?.dataset.journeyPhase,
        motorcycle: document.getElementById('experience-message')?.textContent,
        ready: !document.getElementById('pause')?.disabled,
        error: globalThis.__simulatteLastFailError?.message })`);
      if (state.error || state.phase === 'failed') throw new Error(JSON.stringify(state));
      if (Date.now() > deadline) throw new Error('Preview did not become ready: ' + JSON.stringify(state));
    } while (page.profile ? !['running', 'completed'].includes(state.phase) : !state.ready);
    await new Promise(resolve => setTimeout(resolve, 1200));
    const clip = await evaluate(`(() => { const canvas = [...document.querySelectorAll('canvas')]
      .filter(c => c.checkVisibility() && c.getBoundingClientRect().width > 500)
      .sort((a,b) => b.getBoundingClientRect().width * b.getBoundingClientRect().height - a.getBoundingClientRect().width * a.getBoundingClientRect().height)[0];
      if (!canvas) throw new Error('Visible simulation canvas missing');
      const r = canvas.getBoundingClientRect(); return { x: Math.max(0,r.x), y: Math.max(0,r.y),
        width: Math.min(r.width,innerWidth-r.x), height: Math.min(r.height,innerHeight-r.y), scale: 1 }; })()`);
    const shot = await client.send('Page.captureScreenshot', { format: 'png', clip });
    const bytes = Buffer.from(shot.data, 'base64');
    await fs.writeFile(root + 'public' + page.previewAsset, bytes);
    receipt.captures.push({ path: page.path, profile: page.profile || null, asset: page.previewAsset,
      state, clip, sha256: crypto.createHash('sha256').update(bytes).digest('hex') });
    console.log('Captured ' + page.displayName);
  }
} finally {
  await browser.close();
  await fs.writeFile(output + '/capture-receipt.json', JSON.stringify(receipt, null, 2) + '\n');
}
