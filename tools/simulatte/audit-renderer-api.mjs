#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { openBrowserAudit } from './browser-session.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);
const args = process.argv.slice(2);
const out = path.resolve(args[0] || path.join(root, 'artifacts/renderer-api'));
const [width, height] = (args[1] || '1100x700').split('x').map(Number);
const observedSources = new Map();
const sourceConflicts = [];
const fileHash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function observeSource(file) {
  const hash = fileHash(file);
  if (observedSources.has(file) && observedSources.get(file) !== hash) sourceConflicts.push(path.relative(root, file));
  observedSources.set(file, hash);
}
for (const file of [fileURLToPath(import.meta.url), path.join(root, 'public/blank/app/runtime-script-manifest.js'), path.join(root, 'public/recursive-reference.html')]) observeSource(file);
const browser = await openBrowserAudit({
  publicRoot: path.join(root, 'public'), viewport: { width, height }, webgpu: true,
  mounts: [{ prefix: '/__renderer_tests/', root: path.join(root, 'tests/fixtures') }],
  onRequest: row => { if (row.status === 200 && row.file) observeSource(row.file); },
});
const errors = [];
let report;
try {
  const { client } = browser;
  client.on('Runtime.exceptionThrown', event => errors.push(event.exceptionDetails.exception?.description || event.exceptionDetails.text));
  await client.send('Runtime.enable');
  await client.send('Page.enable');
  await client.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 });
  const loaded = client.waitForEvent('Page.loadEventFired');
  await client.send('Page.navigate', { url: new URL('__renderer_tests/renderer-api.html', browser.host.baseUrl).href });
  await loaded;
  const manifest = require('../../public/blank/app/runtime-script-manifest.js');
  const modelEnd = manifest.browser.findIndex(file => file.endsWith('/simulatte-physics-model.js'));
  if (modelEnd < 0) throw new Error('Renderer audit requires the declared Create model entrypoint');
  const scripts = manifest.browser.slice(0, modelEnd + 1).map(file => path.posix.normalize(`/blank/${file}`));
  const recursiveHtml = fs.readFileSync(path.join(root, 'public/recursive-reference.html'), 'utf8');
  scripts.push(...[...recursiveHtml.matchAll(/<script src="([^"]+)"/g)].map(match => match[1]).filter(file => !file.endsWith('/recursive-reference-controller.js')));
  scripts.push('/simulatte/app/tier-registry.js', '/simulatte/app/tier-renderers.js', '/simulatte/app/tier-scene-renderer.js');
  const result = await client.send('Runtime.evaluate', {
    expression: `(${probe.toString()})(${JSON.stringify([...new Set(scripts)])})`, awaitPromise: true, returnByValue: true,
  });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  if (result.result.value.viewport.width !== width || result.result.value.viewport.height !== height) throw new Error('Renderer audit viewport does not match the requested dimensions');
  const metrics = await client.send('Page.getLayoutMetrics');
  const screenshots = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true,
    clip: { x: 0, y: 0, width: metrics.cssContentSize.width, height: metrics.cssContentSize.height, scale: 1 } });
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'renderers.png'), Buffer.from(screenshots.data, 'base64'));
  report = { schema: 'simulatte.renderer-api-browser-audit/v1', pass: errors.length === 0, viewport: { width, height },
    browser: await client.send('Browser.getVersion'), result: result.result.value, errors,
    claimBoundary: 'Local headless-browser API and pixel smoke; not deployment, visual adjudication, or performance qualification.' };
} catch (error) {
  report = { schema: 'simulatte.renderer-api-browser-audit/v1', pass: false, errors: [...errors, error.stack || String(error)] };
} finally {
  report.sources = [...observedSources].sort(([a], [b]) => a.localeCompare(b)).map(([file, sha256]) => {
    if (fileHash(file) !== sha256) sourceConflicts.push(path.relative(root, file));
    return { path: path.relative(root, file), sha256 };
  });
  if (sourceConflicts.length) {
    report.pass = false;
    report.errors.push(`Sources changed during capture: ${[...new Set(sourceConflicts)].join(', ')}`);
  }
  await browser.close();
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
}
console.log(JSON.stringify({ pass: report.pass, report: path.join(out, 'report.json'), errors: report.errors }));
if (!report.pass) process.exitCode = 1;

async function probe(scripts) {
  for (const src of scripts) await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src; script.onload = resolve; script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.append(script);
  });
  const check = (value, message) => { if (!value) throw new Error(message); };
  const canvasFor = name => {
    const section = document.createElement('section'), label = document.createElement('h2'), canvas = document.createElement('canvas');
    label.textContent = name; canvas.width = 320; canvas.height = 240;
    section.append(label, canvas); document.querySelector('main').append(section);
    return canvas;
  };
  const pixelSummary = async canvas => {
    const blob = await new Promise(resolve => canvas.toBlob(resolve));
    check(blob, 'Canvas capture failed');
    const bitmap = await createImageBitmap(blob);
    const view = new OffscreenCanvas(bitmap.width, bitmap.height), ctx = view.getContext('2d');
    ctx.drawImage(bitmap, 0, 0); bitmap.close();
    const bytes = ctx.getImageData(0, 0, view.width, view.height).data;
    const colors = new Set();
    for (let i = 0; i < bytes.length; i += 4) colors.add(`${bytes[i]},${bytes[i + 1]},${bytes[i + 2]},${bytes[i + 3]}`);
    check(colors.size > 1, 'Renderer produced only one pixel color');
    // Preserve the captured image for the screenshot after GPU disposal.
    const image = document.createElement('img');
    image.src = URL.createObjectURL(blob); image.alt = canvas.previousElementSibling.textContent;
    image.style.width = 'min(320px, calc(100vw - 32px))'; image.style.height = '240px';
    await image.decode(); canvas.hidden = true; canvas.after(image);
    return { width: view.width, height: view.height, distinctColors: colors.size, pngBytes: blob.size };
  };
  const sessions = [];
  try {
    const adapter = await navigator.gpu.requestAdapter();
    check(adapter, 'WebGPU adapter unavailable');
    const info = adapter.info;
    const device = { vendor: info.vendor, architecture: info.architecture, device: info.device, description: info.description, isFallbackAdapter: adapter.isFallbackAdapter };
    const createCanvas = canvasFor('Create WebGPU');
    const model = SimulattePhysicsModel;
    // Exercise rendering with an explicit offline fixture, not model qualification.
    const spec = model.createSpecFromPrompt('a solar magnetic wheel turns', { allowPrototypeFallback: true });
    const input = model.createRenderExecutionInput(spec, model.createSimulationState(spec), createCanvas);
    const create = SimulatteWebGpuRenderer.createSession({ canvas: createCanvas }); sessions.push(create);
    await create.ready;
    create.setScene(input); create.render({ timeMs: 16 });
    check(create.receipt()?.phase === 7 || create.receipt()?.schema?.includes('phase7'), 'Create did not return phase-7 evidence');
    const createResult = { backend: create.backend, inputSource: 'explicit-offline-prototype-fixture', receiptSchema: create.receipt().schema, pixels: await pixelSummary(createCanvas) };

    const tierCanvas = canvasFor('Tier Canvas2D');
    const tier = SimulatteTierSceneRenderer.createSession({ canvas: tierCanvas }); sessions.push(tier);
    await tier.ready;
    tier.setScene({ tier: 'solar-system', data: {}, view: { zoom: 1, panX: 160, panY: 120 } });
    tier.render();
    const tierResult = { backend: tier.backend, receipt: tier.receipt(), pixels: await pixelSummary(tierCanvas) };

    const fetchJson = async url => { const response = await fetch(url); check(response.ok, `Failed data ${url}`); return response.json(); };
    const names = { fcc: 'fcc-cable-license-register-2025-v1', landings: 'landing-points-governed-v1', topology: 'cable-corridors-modeled-v1',
      capacities: 'capacity-scenarios-v1', demands: 'demand-scenarios-v1', repairs: 'repair-resources-v1', governance: 'model-governance-v1', provenance: 'provenance-registry-v1' };
    const datasets = Object.fromEntries(await Promise.all(Object.entries(names).map(async ([key, name]) => [key, await fetchJson(`/data/subsea-network-global/${name}.json`)])));
    const reference = SimulatteEarthVirginiaDatacenterReference.createReferenceWorld({ datasets,
      subseaConfig: await fetchJson('/shared/plugins/subsea-network-global/default-config.json'), gpuConfig: await fetchJson('/shared/plugins/gpu-supercluster/default-config.json') });
    await reference.coordinator.runUntil(3900);
    const worldSpec = structuredClone(reference.worldSpec);
    worldSpec.renderProgram.schema = 'simulatte.recursive-render-program/v2';
    worldSpec.renderProgram.meshes = [{ id: 'sail', positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], material: { color: [0, 1, 1, 1] } }];
    worldSpec.renderProgram.representations[0].primitives.push({ id: 'sail', kind: 'mesh', meshId: 'sail', center: [0, 0, 0], size: [1e7, 1e7, 1e7] });
    const scene = SimulatteRecursiveWorldScene.compileScene(worldSpec);
    const recursiveCanvas = canvasFor('Recursive WebGPU + mesh');
    const recursive = SimulatteRecursiveWorldWebGpuRenderer.createSession({ canvas: recursiveCanvas, scene }); sessions.push(recursive);
    await recursive.ready;
    const receipt = recursive.render({ observation: reference.coordinator.observePorts(), timeMs: 0 });
    const capture = await recursive.capture();
    check(capture.pixelByteLength > 0 && receipt.instanceCount === 7, 'Recursive custom-mesh execution/capture failed');
    const recursiveResult = { backend: recursive.backend, receipt, capture, pixels: await pixelSummary(recursiveCanvas) };
    for (const session of sessions) {
      await session.dispose();
      let rejected = false;
      try { session.render({}); } catch (error) { rejected = error.code === 'renderer_disposed'; }
      check(rejected, `${session.backend} accepted work after disposal`);
    }
    return { viewport: { width: innerWidth, height: innerHeight }, device, create: createResult, tier: tierResult, recursive: recursiveResult, disposal: 'passed' };
  } finally { await Promise.all(sessions.map(session => session.dispose())); }
}
