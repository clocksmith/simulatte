import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {sourceReceipt} from './runtime-audit-sources.mjs';
import {openBrowserAudit} from './browser-session.mjs';

// Compares frame pacing of the SVG run overlay and the optional three.js effects layer on one synthetic
// stress diagram. Headless Chrome may rasterize WebGL in software, so the GL renderer string is recorded;
// emulated phones throttle the CPU only and are not physical-device or GPU measurements.
const root = fileURLToPath(new URL('../../', import.meta.url));
const output = root + 'artifacts/system-diagram-effects';
const sampleMs = Number(process.env.SIMULATTE_BENCH_MS || 5000);
await fs.mkdir(output, {recursive: true});
const report = {source: await sourceReceipt(root), boundary: 'Synthetic stress diagram at the transit render limit; desktop and CPU-throttled 390px emulation in headless Chrome. Frame pacing only, not physical phone GPU performance or human perception.', sampleMs, cases: []};
const settings = [
  {label: 'desktop', viewport: {width: 1440, height: 900}, cpuThrottle: 1},
  {label: 'phone-4x-cpu', viewport: {width: 390, height: 844}, cpuThrottle: 4},
];

// Six independent high-rate chains over slow links keep several hundred messages in flight.
const stressDocument = `(() => {
  const doc = structuredClone(SimulatteSystemDiagramEditor.document());
  doc.name = 'Effects stress'; doc.run.horizonSec = 60; doc.nodes = []; doc.edges = []; doc.groups = []; doc.faults = [];
  for (let i = 0; i < 6; i++) {
    const y = i * 160, source = 'source-' + i, worker = 'worker-' + i, store = 'store-' + i;
    doc.nodes.push({id: source, classId: 'web-client', label: 'Clients ' + (i + 1), x: 0, y, params: {pattern: 'constant', ratePerSec: 120, maxRequests: 100000, payload: ['http', 'task', 'json'][i % 3]}});
    doc.nodes.push({id: worker, classId: 'worker', label: 'Workers ' + (i + 1), x: 420, y, params: {concurrency: 512, serviceMs: 5}});
    doc.nodes.push({id: store, classId: 'database', label: 'Store ' + (i + 1), x: 840, y, params: {}});
    doc.edges.push({id: 'in-' + i, from: {nodeId: source, portId: 'out'}, to: {nodeId: worker, portId: 'in'}, params: {latencyMs: 400}});
    doc.edges.push({id: 'out-' + i, from: {nodeId: worker, portId: 'calls'}, to: {nodeId: store, portId: 'in'}, params: {latencyMs: 300}});
  }
  const result = SimulatteSystemDiagramEditor.model.replace(doc);
  if (!result.ok) throw Error(result.error);
  SimulatteSystemDiagramEditor.canvas.fit();
  return doc.nodes.length;
})()`;
const measure = `(async () => {
  const e = SimulatteSystemDiagramEditor, c = e.playback.controller, diagram = document.getElementById('diagram');
  const frames = [], transit = [], particles = [], simulateMs = [], tick = c.tick;
  c.tick = elapsed => { const start = performance.now(); try { return tick(elapsed); } finally { simulateMs.push(performance.now() - start); } };
  await new Promise(resolve => { let last = null; const end = performance.now() + ${sampleMs};
    const tick = now => { if (last !== null) frames.push(now - last); last = now; transit.push(c.view()?.transit?.length || 0); particles.push(Number(diagram.dataset.effectsParticles || 0));
      if (now < end) requestAnimationFrame(tick); else resolve(); };
    requestAnimationFrame(tick); });
  c.tick = tick;
  const sorted = [...frames].sort((a, b) => a - b), q = p => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  const mean = list => list.reduce((s, v) => s + v, 0) / Math.max(1, list.length);
  // Drawing alone: the run is paused on a busy frame and the camera pans, so every frame redraws the same run view.
  c.pause(); const drawMs = [], drawFrames = [], view = e.canvas.getView();
  await new Promise(resolve => { let last = null, i = 0; const end = performance.now() + ${Math.round(sampleMs / 2)};
    const tickDraw = now => { if (last !== null) drawFrames.push(now - last); last = now; const start = performance.now();
      e.canvas.setView({...view, x: view.x + Math.sin(i++ / 10) * 40}, {commit: false}); e.playback.refresh(); drawMs.push(performance.now() - start);
      if (now < end) requestAnimationFrame(tickDraw); else resolve(); };
    requestAnimationFrame(tickDraw); });
  const drawSorted = [...drawMs].sort((a, b) => a - b);
  let gl = null; const canvas = document.querySelector('.sd-effects-canvas');
  if (canvas) { const ctx = canvas.getContext('webgl2'), info = ctx?.getExtension('WEBGL_debug_renderer_info'); gl = info ? ctx.getParameter(info.UNMASKED_RENDERER_WEBGL) : ctx?.getParameter(ctx.RENDERER) || null; }
  return {frames: frames.length, fps: Math.round(1000 / mean(frames) * 10) / 10, p50Ms: Math.round(q(0.5) * 10) / 10, p95Ms: Math.round(q(0.95) * 10) / 10, maxMs: Math.round(sorted.at(-1) * 10) / 10,
    simulateMeanMs: Math.round(mean(simulateMs) * 10) / 10, drawMeanMs: Math.round(mean(drawMs) * 100) / 100, drawP95Ms: Math.round(drawSorted[Math.floor(0.95 * (drawSorted.length - 1))] * 100) / 100, drawFps: Math.round(1000 / mean(drawFrames) * 10) / 10,
    over33Ms: frames.filter(f => f > 33.4).length, meanTransit: Math.round(mean(transit)), meanParticles: Math.round(mean(particles)), simTime: Math.round(c.state().time * 100) / 100,
    effects: diagram.dataset.effects || 'svg', effectsReason: diagram.dataset.effectsReason || null, gl};
})()`;

for (const setting of settings) {
  for (const renderer of ['svg', 'webgl']) {
    const browser = await openBrowserAudit({publicRoot: root + 'public', viewport: setting.viewport});
    const client = browser.client, errors = [], row = {setting: setting.label, renderer, viewport: setting.viewport, cpuThrottle: setting.cpuThrottle, errors};
    report.cases.push(row);
    client.on('Runtime.exceptionThrown', e => errors.push(e.exceptionDetails?.exception?.description || e.exceptionDetails?.text));
    const evaluate = async expression => { const r = await client.send('Runtime.evaluate', {expression, awaitPromise: true, returnByValue: true}); if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
    const until = async (expression, timeout = 30000) => { const end = Date.now() + timeout; while (!await evaluate(expression)) { if (Date.now() > end) throw Error('Timed out: ' + expression); await new Promise(r => setTimeout(r, 60)); } };
    try {
      await client.send('Page.enable'); await client.send('Runtime.enable');
      await client.send('Emulation.setDeviceMetricsOverride', {...setting.viewport, deviceScaleFactor: setting.viewport.width < 700 ? 2 : 1, mobile: setting.viewport.width < 700});
      await client.send('Page.navigate', {url: browser.host.baseUrl + 'system-diagram' + (renderer === 'webgl' ? '?renderer=webgl' : '')});
      await until(`document.body.dataset.editorReady === 'true'`);
      row.nodes = await evaluate(stressDocument);
      await evaluate(`(async () => { const c = SimulatteSystemDiagramEditor.playback.controller; c.setSpeed(1); await c.play(); })()`);
      if (renderer === 'webgl') await until(`['webgl', 'svg-fallback'].includes(document.getElementById('diagram').dataset.effects)`);
      await until(`(SimulatteSystemDiagramEditor.playback.controller.view()?.transit?.length || 0) > 300`, 60000);
      await client.send('Emulation.setCPUThrottlingRate', {rate: setting.cpuThrottle});
      Object.assign(row, await evaluate(measure));
      await client.send('Emulation.setCPUThrottlingRate', {rate: 1});
      if (renderer === 'webgl') assert.equal(row.effects, 'webgl', row.effectsReason || 'WebGL effects did not activate');
      assert.deepEqual(errors, []);
      row.pass = true;
      console.log(`${setting.label} ${renderer}: playing ${row.fps} fps (simulation ${row.simulateMeanMs} ms/frame); drawing only ${row.drawFps} fps, ${row.drawMeanMs} ms mean, p95 ${row.drawP95Ms} ms; ~${row.meanTransit} in flight${row.gl ? `, GL ${row.gl}` : ''}`);
    } catch (error) { row.pass = false; row.error = error.stack; throw error; }
    finally { await fs.writeFile(output + '/benchmark.json', JSON.stringify(report, null, 2) + '\n'); await browser.close(); }
  }
}
