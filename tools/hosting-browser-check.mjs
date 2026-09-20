import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { launchBrowser } from './simulatte/browser-session.mjs';

export async function verifyHostingBrowser({ surface, baseUrl, expectedBuild, viewport, outDir, chromePath }) {
  const result = { surface, baseUrl, expectedBuild, viewport, pass: false, errors: [], failedResources: [] };
  let browser;
  try {
    browser = await launchBrowser({ chromePath, viewport, webgpu: true, commandTimeoutMs: 60000 });
    const { client } = browser;
    const requests = new Map();
    result.browser = (await client.send('Browser.getVersion')).product;
    client.on('Runtime.exceptionThrown', event => result.errors.push(event.exceptionDetails.exception?.description || event.exceptionDetails.text));
    client.on('Network.responseReceived', ({ response }) => {
      if (response.status >= 400 && new URL(response.url).origin === new URL(baseUrl).origin) result.failedResources.push({ url: response.url, status: response.status });
    });
    client.on('Network.requestWillBeSent', ({ requestId, request }) => requests.set(requestId, request.url));
    client.on('Network.loadingFinished', ({ requestId }) => requests.delete(requestId));
    client.on('Network.loadingFailed', ({ requestId, errorText }) => {
      const url = requests.get(requestId); requests.delete(requestId);
      if (url && new URL(url).origin === new URL(baseUrl).origin) result.failedResources.push({ url, error: errorText });
    });
    await client.send('Page.enable'); await client.send('Runtime.enable'); await client.send('Network.enable');
    await client.send('Emulation.setDeviceMetricsOverride', { ...viewport, deviceScaleFactor: 1, mobile: viewport.width < 600 });
    const loaded = client.once('Page.loadEventFired');
    const navigation = await client.send('Page.navigate', { url: baseUrl });
    if (navigation.errorText) throw new Error(navigation.errorText);
    await loaded;
    const evaluated = await client.send('Runtime.evaluate', { awaitPromise: true, returnByValue: true,
      expression: `(${probePage.toString()})(${JSON.stringify(surface)},${JSON.stringify(expectedBuild)})` });
    if (evaluated.exceptionDetails) throw new Error(evaluated.exceptionDetails.exception?.description || evaluated.exceptionDetails.text);
    result.observation = evaluated.result.value;
    result.pass = result.observation.pass && !result.errors.length && !result.failedResources.length;
  } catch (error) { result.errors.push(error.message); }
  finally {
    if (browser) {
      try {
        const screenshot = await browser.client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
        const bytes = Buffer.from(screenshot.data, 'base64');
        const filename = `${surface}-${viewport.width}x${viewport.height}.png`;
        await fs.writeFile(path.join(outDir, filename), bytes);
        result.screenshot = { path: filename, sha256: createHash('sha256').update(bytes).digest('hex') };
      } catch (error) { result.errors.push('Screenshot capture failed: ' + error.message); result.pass = false; }
    }
    try { await browser?.close(); } catch (error) { result.errors.push(error.message); result.pass = false; }
    result.pass = result.pass && !result.errors.length && !result.failedResources.length;
  }
  return result;
}

// Executed in the page. This verifies startup and controls, not simulation correctness.
async function probePage(surface, expectedBuild) {
  const waitFor = async (label, predicate) => {
    const deadline = performance.now() + 20000;
    while (!predicate()) {
      if (performance.now() > deadline) throw new Error(`Timed out waiting for ${label}`);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  };
  const visible = node => !!node && node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0
    && getComputedStyle(node).visibility !== 'hidden';
  const selectors = surface === 'world' ? ['#hex-center-create', '.hex-satellite'] : ['#build-prompt', '#build-lab', '#shuffle-prompt'];
  const deadline = performance.now() + 15000;
  while (!selectors.every(selector => visible(document.querySelector(selector)))) {
    if (performance.now() > deadline) throw new Error('Required product controls did not become visible');
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const checks = { build: document.querySelector('meta[name="simulatte-build"]')?.content === expectedBuild,
    horizontalFit: document.documentElement.scrollWidth <= innerWidth + 1 };
  const controls = [];
  for (const node of document.querySelectorAll(surface === 'world' ? '#hex-center-create, .hex-satellite' : '#build-prompt, #build-lab, #shuffle-prompt')) {
    node.scrollIntoView({ block: 'center' });
    const rect = node.getBoundingClientRect();
    const target = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    controls.push({ name: node.getAttribute('aria-label') || node.textContent.trim(),
      reachable: !!target && (target === node || node.contains(target)), width: rect.width, height: rect.height });
  }
  checks.controlsReachable = controls.length > 0 && controls.every(control => control.reachable);
  let execution;
  if (surface === 'world') {
    checks.simulationsVisible = document.querySelectorAll('.hex-satellite').length === 6;
    checks.createLink = document.querySelector('#hex-center-create')?.href === 'https://create.simulatte.world/';
  } else {
    await waitFor('Create runtime', () => window.SimulattePhysicsLab?._browserLab
      && document.querySelector('#intent-runtime')?.dataset.state === 'ready');
    const lab = window.SimulattePhysicsLab._browserLab;
    const prompt = 'a red ball';
    const input = document.querySelector('#build-prompt');
    const canvas = document.querySelector('#physics-canvas');
    const beforeRenderCount = Number(canvas.dataset.renderCount || 0);
    input.value = prompt;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('#build-lab').click();
    await waitFor('Create execution', () => ['completed', 'failed'].includes(lab.getPipelineRun()?.status));
    const run = lab.getPipelineRun();
    checks.executionCompleted = run.status === 'completed';
    if (checks.executionCompleted) await waitFor('Create frame', () => Number(canvas.dataset.renderCount || 0) > beforeRenderCount);
    const spec = lab.getSpec();
    checks.promptCompiled = spec?.schema === 'simulatte.worldSpec.v1' && spec.source?.prompt === prompt;
    checks.frameRendered = Number(canvas.dataset.renderCount || 0) > beforeRenderCount;
    execution = { prompt, status: run.status, revision: run.revision, worldSpecContentHash: run.worldSpecContentHash,
      renderCount: Number(canvas.dataset.renderCount || 0),
      runtime: run.attempts.at(-1)?.outputs.find(output => output.phase === 1)?.artifact?.runtimeContext?.runtimeMode };
    const tools = document.querySelector('#create-tools');
    if (tools) tools.open = true;
    const panel = document.querySelector('#world-proof-panel');
    panel.querySelector('summary').click(); checks.inspectorOpens = panel.open;
    panel.querySelector('summary').click(); checks.inspectorCloses = !panel.open;
    if (tools) tools.open = false;
  }
  scrollTo(0, 0);
  return { checks, controls, execution, pass: Object.values(checks).every(Boolean), title: document.title, url: location.href };
}
