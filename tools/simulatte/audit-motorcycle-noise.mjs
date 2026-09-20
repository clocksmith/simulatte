import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createAuditHost, launchBrowser } from './browser-session.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const output = path.join(root, 'artifacts/motorcycle-noise', new Date().toISOString().replace(/[:.]/g, '-'));
await fs.mkdir(output, { recursive: true });
const files = await fs.readdir(path.join(root, 'public/simulatte/motorcycle-noise'));
const sources = Object.fromEntries(await Promise.all(files.map(async file => [file, createHash('sha256').update(await fs.readFile(path.join(root, 'public/simulatte/motorcycle-noise', file))).digest('hex')])));
const report = { schema: 'simulatte.motorcycleNoiseBrowserAudit.v1', sources, cases: [],
  scope: 'Local desktop/mobile browser behavior, signed replay and screenshots; no physical acoustic validation.', pass: false };
const host = await createAuditHost({ publicRoot: path.join(root, 'public') });
try {
  for (const viewport of [{ width: 1440, height: 1050 }, { width: 390, height: 844 }]) {
    const row = { viewport, errors: [], checks: [], pass: false }; report.cases.push(row);
    let browser;
    try {
      browser = await launchBrowser({ viewport });
      const client = browser.client;
      client.on('Runtime.exceptionThrown', event => row.errors.push(event.exceptionDetails.exception?.description || event.exceptionDetails.text));
      await client.send('Page.enable'); await client.send('Runtime.enable');
      await client.send('Emulation.setDeviceMetricsOverride', { ...viewport, deviceScaleFactor: 1, mobile: viewport.width < 600 });
      const evaluate = async (fn, arg) => {
        const result = await client.send('Runtime.evaluate', { expression: `(${fn.toString()})(${JSON.stringify(arg) ?? ''})`, awaitPromise: true, returnByValue: true, userGesture: true });
        if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
        return result.result.value;
      };
      await client.send('Page.navigate', { url: host.baseUrl });
      row.checks.push(await evaluate(async () => {
        const deadline = performance.now() + 15000;
        while (!document.querySelector('.home-noise-action')) {
          if (performance.now() > deadline) throw new Error('Main chooser entry missing');
          await new Promise(resolve => setTimeout(resolve, 50));
        }
        await document.fonts.ready;
        const entry = document.querySelector('.home-noise-action');
        if (!entry.href.endsWith('/simulatte/motorcycle-noise/')) throw new Error('Main chooser route differs');
        return { mainEntry: entry.textContent, visible: entry.getBoundingClientRect().top < innerHeight };
      }));
      const home = await client.send('Page.captureScreenshot', { format: 'png' });
      await fs.writeFile(path.join(output, `${viewport.width}-main.png`), Buffer.from(home.data, 'base64'));
      await client.send('Page.navigate', { url: host.baseUrl + 'simulatte/motorcycle-noise/' });
      const ready = async () => evaluate(async () => {
        const deadline = performance.now() + 45000;
        while (document.body?.dataset.state !== 'ready') {
          if (document.querySelector('#status')?.dataset.error === 'true') throw new Error(document.querySelector('#status').textContent);
          if (performance.now() > deadline) throw new Error('Simulation did not settle');
          await new Promise(resolve => setTimeout(resolve, 50));
        }
        return { hash: motorcycleNoiseState.spec.contentHash, attenuation: motorcycleNoiseState.record.attenuation,
          overflow: document.documentElement.scrollWidth > innerWidth, model: motorcycleNoiseState.record.modelId };
      });
      const initial = await ready(); if (initial.overflow) throw new Error('Horizontal overflow'); row.checks.push({ initial });
      await evaluate(() => document.fonts.ready.then(() => true));
      const capture = async name => { const shot = await client.send('Page.captureScreenshot', { format: 'png' });
        const file = `${viewport.width}-${name}.png`; await fs.writeFile(path.join(output, file), Buffer.from(shot.data, 'base64')); return file; };
      row.screenshot = await capture('barrier');
      row.checks.push(await evaluate(async () => {
        document.querySelector('#listen').click(); await new Promise(resolve => setTimeout(resolve, 100));
        if (document.querySelector('#listen').textContent !== 'Stop audio') throw new Error('Explicit audio playback failed');
        document.querySelector('#listen').click(); document.querySelector('#play').click();
        await new Promise(resolve => setTimeout(resolve, 100)); document.querySelector('#play').click();
        const signed = await MotorcycleRecords.sign(motorcycleNoiseState.spec, motorcycleNoiseState.record);
        const verified = await MotorcycleRecords.verify(signed);
        const file = new File([JSON.stringify(signed)], 'simulation.json', { type: 'application/json' }), transfer = new DataTransfer();
        transfer.items.add(file); const input = document.querySelector('#import'); input.files = transfer.files; input.dispatchEvent(new Event('change'));
        const deadline = performance.now() + 5000;
        while (!document.querySelector('#record-status').textContent.includes('Program verified')) {
          if (performance.now() > deadline) throw new Error('Signed file import failed'); await new Promise(resolve => setTimeout(resolve, 10));
        }
        document.querySelector('#run').click();
        return { audio: 'explicit fixed-gain playback', replayHash: verified.spec.contentHash };
      }));
      const replay = await ready(); if (replay.hash !== initial.hash || replay.attenuation !== initial.attenuation) throw new Error('Replay differs');
      await evaluate(() => {
        const form = document.querySelector('#controls'); form.elements.mitigation.value = 'active'; form.elements.controller.value = 'ideal';
        form.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('#run').click();
      });
      const active = await ready(); row.checks.push({ active });
      row.checks.push(await evaluate(() => {
        const r = motorcycleNoiseState.record;
        if (motorcycleNoiseState.spec.authorship.revision < 1) throw new Error('Scenario edit lost authorship');
        if (!r.controller.futureSamples || !r.localGrid.length) throw new Error('Ideal control or local measurements missing');
        document.querySelector('[data-map=local]').click();
        return { offTarget: r.offTarget, localSamples: r.localGrid.length, idealLabel: document.querySelector('#mode-note').textContent };
      }));
      row.localScreenshot = await capture('local-control');
      await evaluate(() => {
        const form = document.querySelector('#controls'); form.elements.controller.value = 'causal'; form.dispatchEvent(new Event('input', { bubbles: true }));
        document.querySelector('#run').click(); document.querySelector('#cancel').click();
        if (document.body.dataset.state !== 'cancelled' || !document.querySelector('#export').disabled) throw new Error('Cancellation published a result');
        document.querySelector('#run').click();
      });
      row.checks.push({ causal: await ready() });
      row.checks.push(await evaluate(() => {
        if (motorcycleNoiseState.record.controller.futureSamples) throw new Error('Causal control received future data');
        const before = motorcycleNoiseState.spec.params.receiver;
        document.querySelector('#street').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        if (!document.querySelector('#export').disabled || document.querySelector('#before').textContent !== '—') throw new Error('Receiver change retained stale output');
        return { receiverEdited: true, previousReceiver: before, cancelledWithoutPublication: true };
      }));
      await evaluate(() => {
        const form = document.querySelector('#controls');
        form.elements.duration.value = '1.1'; form.elements.count.value = '1'; form.elements.sensorNoisePa.value = '0.0035';
        form.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('#run').click();
        if (document.body.dataset.state !== 'running') throw new Error('Fractional settings blocked by native form steps');
      });
      row.checks.push({ fractionalSettings: await ready() });
      if (row.errors.length) throw new Error(row.errors.join('\n')); row.pass = true;
    } catch (error) { row.error = error.stack || error.message; }
    finally { await browser?.close(); }
  }
  report.pass = report.cases.every(row => row.pass);
} finally {
  await host.close(); await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
}
console.log(JSON.stringify({ pass: report.pass, output, cases: report.cases.map(row => ({ viewport: row.viewport, pass: row.pass, error: row.error })) }, null, 2));
if (!report.pass) process.exitCode = 1;
