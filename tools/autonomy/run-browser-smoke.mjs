#!/usr/bin/env node
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const TOOL_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(TOOL_DIR, '../..');
const PUBLIC = path.join(ROOT, 'public');
const DEFAULT_OUT = path.join(ROOT, 'artifacts', 'autonomy-browser-smoke');

function parseArgs(argv) {
  const options = { outDir: DEFAULT_OUT, checkOnly: false, chromePath: process.env.CHROME_PATH || '', url: '', viewport: { width: 1440, height: 1000 } };
  for (let index = 0; index < argv.length; index += 1) {
    const [key, inline] = argv[index].split('=');
    const value = () => inline ?? argv[++index];
    if (key === '--out') options.outDir = path.resolve(value());
    else if (key === '--chrome') options.chromePath = path.resolve(value());
    else if (key === '--url') options.url = parseUrl(value());
    else if (key === '--viewport') options.viewport = parseViewport(value());
    else if (key === '--check') options.checkOnly = true;
    else if (key === '--help') {
      console.log('usage: node tools/autonomy/run-browser-smoke.mjs [--check] [--out DIR] [--chrome PATH] [--url HTTP_URL] [--viewport WIDTHxHEIGHT]');
      process.exit(0);
    } else throw new Error(`Unknown argument: ${argv[index]}`);
  }
  return options;
}

function parseUrl(value) {
  const url = new URL(String(value || ''));
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error(`Autonomy browser URL expected HTTP or HTTPS, received ${url.protocol}`);
  }
  return url.toString();
}

function parseViewport(value) {
  const match = /^(\d+)x(\d+)$/.exec(String(value || ''));
  if (!match) throw new Error(`Autonomy browser viewport expected WIDTHxHEIGHT, received ${value || 'missing'}`);
  const viewport = { width: Number(match[1]), height: Number(match[2]) };
  if (viewport.width < 320 || viewport.height < 480) {
    throw new Error(`Autonomy browser viewport expected at least 320x480, received ${value}`);
  }
  return viewport;
}

function findChrome(explicitPath) {
  const candidates = [
    explicitPath,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
  ].filter(Boolean);
  for (const candidate of candidates) if (fs.existsSync(candidate)) return candidate;
  for (const command of ['google-chrome', 'chromium', 'chromium-browser']) {
    const found = spawnSync('sh', ['-lc', `command -v ${command}`], { encoding: 'utf8' });
    if (found.status === 0 && found.stdout.trim()) return found.stdout.trim();
  }
  throw new Error('Autonomy browser smoke expected Chrome or Chromium. Set CHROME_PATH or pass --chrome PATH.');
}

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => server.listen(0, '127.0.0.1', resolve).once('error', reject));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function createStaticServer() {
  const requests = [];
  const server = http.createServer((request, response) => {
    const requestUrl = new URL(request.url || '/', 'http://127.0.0.1');
    let pathname = decodeURIComponent(requestUrl.pathname);
    if (pathname.endsWith('/')) pathname += 'index.html';
    const file = path.resolve(PUBLIC, `.${pathname}`);
    if (file !== PUBLIC && !file.startsWith(`${PUBLIC}${path.sep}`)) {
      requests.push({ pathname, status: 403 });
      response.writeHead(403).end('Forbidden');
      return;
    }
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
      requests.push({ pathname, status: 404 });
      response.writeHead(404).end('Not found');
      return;
    }
    requests.push({ pathname, status: 200 });
    response.writeHead(200, { 'Content-Type': contentType(file), 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(response);
  });
  await new Promise((resolve, reject) => server.listen(0, '127.0.0.1', resolve).once('error', reject));
  return { server, port: server.address().port, requests };
}

function contentType(file) {
  const extension = path.extname(file);
  return ({ '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' })[extension] || 'application/octet-stream';
}

async function waitForDevtools(port, child) {
  const url = `http://127.0.0.1:${port}/json`;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Chrome exited before DevTools was ready with code ${child.exitCode}`);
    try {
      const response = await fetch(url);
      if (response.ok) {
        const pages = await response.json();
        const page = pages.find((row) => row.type === 'page');
        if (page) return page;
      }
    } catch {
      // Connection refusal is expected until Chrome opens the DevTools port.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Chrome DevTools did not become ready on port ${port}`);
}

class CdpClient {
  constructor(url) {
    this.url = url;
    this.socket = null;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
  }

  async connect() {
    this.socket = new WebSocket(this.url);
    await new Promise((resolve, reject) => {
      this.socket.onopen = resolve;
      this.socket.onerror = reject;
    });
    this.socket.onmessage = ({ data }) => this.receive(JSON.parse(data));
  }

  receive(message) {
    if (message.id && this.pending.has(message.id)) {
      const pending = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(JSON.stringify(message.error)));
      else pending.resolve(message.result);
    }
    for (const listener of this.listeners.get(message.method) || []) listener(message.params);
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  once(method) {
    return new Promise((resolve) => {
      const callback = (params) => {
        this.listeners.set(method, (this.listeners.get(method) || []).filter((row) => row !== callback));
        resolve(params);
      };
      this.listeners.set(method, [...(this.listeners.get(method) || []), callback]);
    });
  }

  on(method, callback) {
    this.listeners.set(method, [...(this.listeners.get(method) || []), callback]);
  }

  close() {
    if (this.socket) this.socket.close();
  }
}

async function runBrowserSmoke(options) {
  if (typeof WebSocket !== 'function') throw new Error('Autonomy browser smoke requires a Node runtime with WebSocket support');
  const chromePath = findChrome(options.chromePath);
  const staticHost = options.url ? null : await createStaticServer();
  const targetUrl = options.url || `http://127.0.0.1:${staticHost.port}/`;
  const devtoolsPort = await freePort();
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'simulatte-autonomy-browser-'));
  const chrome = spawn(chromePath, [
    '--headless=new',
    '--enable-unsafe-webgpu',
    '--disable-background-networking',
    '--no-first-run',
    '--no-default-browser-check',
    `--user-data-dir=${profileDir}`,
    `--remote-debugging-port=${devtoolsPort}`,
    `--window-size=${options.viewport.width},${options.viewport.height}`,
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  let client = null;
  try {
    const page = await waitForDevtools(devtoolsPort, chrome);
    client = new CdpClient(page.webSocketDebuggerUrl);
    await client.connect();
    const errors = [];
    const failedResponses = [];
    client.on('Runtime.exceptionThrown', (params) => errors.push({
      kind: 'exception',
      text: params.exceptionDetails.exception && params.exceptionDetails.exception.description || params.exceptionDetails.text,
    }));
    client.on('Log.entryAdded', (params) => {
      if (params.entry.level === 'error') errors.push({ kind: 'log', text: params.entry.text });
    });
    client.on('Network.responseReceived', (params) => {
      if (params.response.status >= 400) failedResponses.push({ url: params.response.url, status: params.response.status });
    });
    await Promise.all([client.send('Runtime.enable'), client.send('Page.enable'), client.send('Log.enable'), client.send('Network.enable')]);
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: options.viewport.width,
      height: options.viewport.height,
      deviceScaleFactor: 1,
      mobile: options.viewport.width < 600,
    });
    const loaded = client.once('Page.loadEventFired');
    await client.send('Page.navigate', { url: targetUrl });
    await loaded;
    const consentEvaluation = await client.send('Runtime.evaluate', {
      expression: consentFlowExpression(),
      awaitPromise: true,
      returnByValue: true,
    });
    if (consentEvaluation.exceptionDetails) throw new Error(consentEvaluation.exceptionDetails.exception && consentEvaluation.exceptionDetails.exception.description || consentEvaluation.exceptionDetails.text);
    const consentView = consentEvaluation.result.value;
    const evaluated = await client.send('Runtime.evaluate', {
      expression: browserJourneyExpression(),
      awaitPromise: true,
      returnByValue: true,
    });
    if (evaluated.exceptionDetails) throw new Error(evaluated.exceptionDetails.exception && evaluated.exceptionDetails.exception.description || evaluated.exceptionDetails.text);
    const browserVersion = await client.send('Browser.getVersion');
    const overviewScreenshot = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const decisionViewEvaluation = await client.send('Runtime.evaluate', {
      expression: `(async () => {
        const button = document.getElementById('decisions-button');
        const drawer = document.getElementById('decisions-drawer');
        button.click();
        await new Promise((resolve) => setTimeout(resolve, 320));
        const value = {
          open: drawer.classList.contains('is-open'),
          hidden: drawer.getAttribute('aria-hidden'),
          expanded: button.getAttribute('aria-expanded'),
          summary: document.getElementById('decision-title').textContent.trim(),
        };
        document.getElementById('decisions-close').click();
        return value;
      })()`,
      awaitPromise: true,
      returnByValue: true,
    });
    if (decisionViewEvaluation.exceptionDetails) throw new Error(decisionViewEvaluation.exceptionDetails.exception && decisionViewEvaluation.exceptionDetails.exception.description || decisionViewEvaluation.exceptionDetails.text);
    const decisionView = decisionViewEvaluation.result.value;
    await client.send('Runtime.evaluate', { expression: `document.getElementById('decisions-button').click()` });
    await new Promise((resolve) => setTimeout(resolve, 320));
    const decisionScreenshot = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await client.send('Runtime.evaluate', { expression: `document.getElementById('decisions-close').click()` });
    const actorViewEvaluation = await client.send('Runtime.evaluate', {
      expression: actorViewExpression(),
      awaitPromise: true,
      returnByValue: true,
    });
    if (actorViewEvaluation.exceptionDetails) throw new Error(actorViewEvaluation.exceptionDetails.exception && actorViewEvaluation.exceptionDetails.exception.description || actorViewEvaluation.exceptionDetails.text);
    const actorView = actorViewEvaluation.result.value;
    const actorScreenshot = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const featureViewEvaluation = await client.send('Runtime.evaluate', {
      expression: cooperativeFeatureExpression(),
      awaitPromise: true,
      returnByValue: true,
    });
    if (featureViewEvaluation.exceptionDetails) throw new Error(featureViewEvaluation.exceptionDetails.exception && featureViewEvaluation.exceptionDetails.exception.description || featureViewEvaluation.exceptionDetails.text);
    const featureView = featureViewEvaluation.result.value;
    const result = evaluated.result.value;
    const pass = result.state === 'completed'
      && result.rendererBackend === 'webgpu'
      && result.actorMeshSchema === 'simulatte.autonomyActorMesh.v1'
      && result.actorMeshKinds === 'pedestrian,bicycle,scooter,car'
      && result.materialModel === 'metallic_roughness_vertex_v1'
      && result.ambientActorCount === 13
      && result.ambientActorKinds === 'pedestrian,bicycle,scooter,car'
      && result.rendererFrames > 0
      && result.smoothness.rafFrameCount >= 120
      && result.smoothness.frameIntervalMs.p95 <= 20
      && result.smoothness.over33msRatio <= 0.01
      && result.smoothness.longTaskCount === 0
      && result.staticVertexCount > 10000
      && result.retrievalRows > 0
      && result.rerankRows > 0
      && result.occurrenceRows > 0
      && result.rerankerProof.includes('MRR')
      && result.rerankerProof.includes('→')
      && result.retrievalLaneLabel.startsWith('Lexical + typed rules')
      && result.runtimeLog.eventCount >= 8
      && result.runtimeLog.requiredEventsPresent
      && result.runtimeLog.manifestMissionExampleCount >= 4
      && result.runtimeLog.manifestCacheMode === 'no-cache'
      && result.runtimeLog.embeddingExecuted === false
      && result.runtimeLog.neuralRerankerExecuted === false
      && result.runtimeLog.failureCount === 0
      && result.gateRows === 7
      && result.traceRows > 0
      && result.selectedRows === 1
      && result.editInvalidatedController
      && result.missionLockedDuringRun
      && result.shuffle.changed
      && result.shuffle.startLabel === 'Start'
      && result.copy.removedLabelsAbsent
      && result.copy.blankLink.href === '/blank/'
      && result.copy.blankLink.label === 'Blank'
      && consentView.disclosed.title === 'Enable local Qwen embedding?'
      && consentView.disclosed.embedding === '533 MB'
      && consentView.disclosed.rerankerRowAbsent
      && consentView.disclosed.total === '533 MB for the embedding model'
      && consentView.disclosed.use === 'Simulatte uses Qwen embeddings only when deterministic place matching refuses.'
      && consentView.grantRemembered
      && consentView.revoked
      && consentView.finalEnabled === false
      && result.initialLayout.allWithinViewport
      && result.initialLayout.primaryControlsVisible
      && decisionView.open
      && decisionView.hidden === 'false'
      && decisionView.expanded === 'true'
      && decisionView.summary.length > 0
      && result.camera.startedInFollow
      && result.camera.minimap.visible
      && result.camera.minimap.frameCount > 0
      && result.camera.minimap.projection === 'orthographic_top_north_up'
      && result.camera.regionTargetCount === 3
      && result.camera.placeTargetCount === 20
      && result.camera.modeProbes.every((row) => row.began && row.noSnap && row.progressed && row.settled && row.moved)
      && result.camera.regionFocus.began
      && result.camera.regionFocus.noSnap
      && result.camera.regionFocus.progressed
      && result.camera.regionFocus.settled
      && result.camera.regionFocus.moved
      && result.camera.panWorked
      && result.camera.orbitWorked
      && result.camera.zoomWorked
      && result.camera.followZoomWorked
      && result.camera.returnedToRoute
      && result.distance === '1524 m'
      && result.runtime === 'Complete'
      && actorView.mode === 'follow'
      && actorView.transition === 'settled'
      && actorView.followDistance <= 5.01
      && actorView.dynamicVertexCount > 1000
      && actorView.minimapVisible
      && actorView.minimapFrameCount > 0
      && featureView.cooperation.visible
      && featureView.cooperation.state === 'executing'
      && featureView.cooperation.match.includes('eligible')
      && featureView.cooperation.burden.includes('$')
      && featureView.cooperation.reliability.includes('on time')
      && featureView.cooperation.itemTitle.includes('umbrella')
      && featureView.gpuParity.pass
      && featureView.gpuParity.candidateCount === 3
      && featureView.gpuParity.maximumAbsoluteError <= featureView.gpuParity.tolerance
      && featureView.shade.preferShade
      && featureView.shade.routeAlgorithm === 'governed_environment_route_v1'
      && featureView.shade.proof.includes('modeled building shade')
      && result.scrollY === 0
      && !result.hasHorizontalOverflow
      && errors.length === 0
      && failedResponses.length === 0;
    const report = {
      schema: 'simulatte.autonomyBrowserSmoke.v10',
      pass,
      targetUrl,
      viewport: options.viewport,
      browser: { product: browserVersion.product, protocolVersion: browserVersion.protocolVersion, userAgent: browserVersion.userAgent },
      result,
      consentView,
      decisionView,
      actorView,
      featureView,
      errors,
      failedResponses,
      requests: staticHost ? staticHost.requests : [],
      claimBoundary: 'This smoke proves the checked-in static browser journey executed in the named browser. It does not establish physical-world autonomy.',
    };
    if (!options.checkOnly) {
      fs.mkdirSync(options.outDir, { recursive: true });
      fs.writeFileSync(path.join(options.outDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
      fs.writeFileSync(path.join(options.outDir, 'journey.png'), Buffer.from(overviewScreenshot.data, 'base64'));
      fs.writeFileSync(path.join(options.outDir, 'decisions.png'), Buffer.from(decisionScreenshot.data, 'base64'));
      fs.writeFileSync(path.join(options.outDir, 'actor-follow.png'), Buffer.from(actorScreenshot.data, 'base64'));
    }
    return report;
  } finally {
    if (client) client.close();
    await stopChild(chrome);
    if (staticHost) await new Promise((resolve) => staticHost.server.close(resolve));
    fs.rmSync(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  }
}

function cooperativeFeatureExpression() {
  return `(async () => {
    const waitFor = async (predicate, label, limit = 10000) => {
      const started = performance.now();
      while (!predicate()) {
        const status = document.getElementById('runtime-status');
        if (status?.dataset.kind === 'error') {
          const failure = (window.__simulatteAutonomyRuntimeEvents || []).filter((row) => row.level === 'error').at(-1);
          throw new Error(label + ': ' + status.textContent + (failure ? ' · ' + JSON.stringify(failure.details) : ''));
        }
        if (performance.now() - started > limit) {
          const proof = document.getElementById('alternative-proof');
          const state = document.getElementById('metric-state');
          throw new Error('timeout at ' + label
            + '; runtime=' + (status?.dataset.kind || 'missing') + ':' + (status?.textContent || '')
            + '; state=' + (state?.textContent || 'missing')
            + '; proof=' + (proof?.textContent || 'missing')
            + '; preferShade=' + (proof?.dataset.preferShade || 'missing')
            + '; routeAlgorithm=' + (proof?.dataset.routeAlgorithm || 'missing'));
        }
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    };
    const input = document.getElementById('mission-input');
    const step = document.getElementById('step-button');
    input.value = 'I need an umbrella delivered to my East Village office. Match someone already passing nearby.';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    step.click();
    await waitFor(() => !document.getElementById('cooperative-section').hidden
      && document.getElementById('cooperative-state').textContent.trim() === 'executing', 'cooperative-execution');
    const cooperation = {
      visible: !document.getElementById('cooperative-section').hidden && !document.getElementById('cooperative-chip').hidden,
      state: document.getElementById('cooperative-state').textContent.trim(),
      match: document.getElementById('cooperative-match').textContent.trim(),
      burden: document.getElementById('cooperative-burden').textContent.trim(),
      reliability: document.getElementById('cooperative-reliability').textContent.trim(),
      handoff: document.getElementById('cooperative-handoff').textContent.trim(),
      itemTitle: document.getElementById('cooperative-chip-title').textContent.trim(),
    };
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) throw new Error('cooperative GPU parity adapter unavailable');
    const parityDevice = await adapter.requestDevice();
    const gpuParity = await SimulatteCooperativeGpuCompute.verifyGpuParity(parityDevice, [
      [120, 45, 0.05, 1, 0, 0.1, 200, 20],
      [30, 18, 0.01, 0.5, 0, 0.02, 100, 5],
      [240, 90, 0.2, 2, 0.5, 0.3, 400, 45],
    ]);
    parityDevice.destroy();
    input.value = 'Walk from Union Square to Washington Square in the shade on a hot day.';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    step.click();
    await waitFor(() => {
      const proof = document.getElementById('alternative-proof');
      return proof.dataset.preferShade === 'true'
        && proof.dataset.routeAlgorithm === 'governed_environment_route_v1'
        && proof.textContent.includes('modeled building shade');
    }, 'shade-route');
    const proof = document.getElementById('alternative-proof');
    const shade = {
      preferShade: proof.dataset.preferShade === 'true',
      routeAlgorithm: proof.dataset.routeAlgorithm || null,
      proof: proof.textContent.trim(),
    };
    return { cooperation, gpuParity, shade };
  })()`;
}

function actorViewExpression() {
  return `(async () => {
    const canvas = document.getElementById('autonomy-canvas');
    const minimap = document.getElementById('follow-minimap');
    canvas.scrollIntoView({ block: 'center', behavior: 'instant' });
    document.getElementById('camera-follow').click();
    const started = performance.now();
    while (canvas.dataset.cameraTransition !== 'settled') {
      if (performance.now() - started > 5000) throw new Error('actor follow camera did not settle');
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    canvas.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -3000 }));
    await new Promise((resolve) => setTimeout(resolve, 320));
    return {
      mode: canvas.dataset.cameraMode,
      transition: canvas.dataset.cameraTransition,
      followDistance: Number(canvas.dataset.cameraFollowDistance),
      dynamicVertexCount: Number(canvas.dataset.dynamicVertexCount),
      actorMeshSchema: canvas.dataset.actorMeshSchema,
      ambientActorCount: Number(canvas.dataset.ambientActorCount),
      ambientActorKinds: canvas.dataset.ambientActorKinds,
      minimapVisible: !minimap.hidden && canvas.dataset.followMinimap === 'visible',
      minimapFrameCount: Number(minimap.dataset.frameCount || 0),
    };
  })()`;
}

async function stopChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  let resolveExit;
  const exited = new Promise((resolve) => { resolveExit = resolve; });
  child.once('exit', resolveExit);
  child.kill('SIGTERM');
  const stopped = await Promise.race([
    exited.then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), 2000)),
  ]);
  if (stopped || child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGKILL');
  await exited;
}

function browserJourneyExpression() {
  return `(async () => {
    const runtimeFailure = () => {
      const status = document.getElementById('runtime-status');
      if (status?.dataset.kind !== 'error') return null;
      const event = [...(globalThis.__simulatteAutonomyRuntimeEvents || [])]
        .reverse()
        .find((row) => row.event === 'runtime.failed');
      return event?.details?.message || status.textContent || 'unknown runtime error';
    };
    const waitFor = async (predicate, label, limit = 60000) => {
      const started = performance.now();
      while (!predicate()) {
        const status = document.getElementById('runtime-status');
        const failure = runtimeFailure();
        if (failure) throw new Error('autonomy browser runtime.failed at ' + label + ': ' + failure);
        if (performance.now() - started > limit) {
          const state = document.getElementById('metric-state');
          throw new Error('autonomy browser timeout at ' + label +
            '; runtime=' + (status && status.dataset.kind) + ':' + (status && status.textContent) +
            '; state=' + (state && state.textContent));
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    };
    await waitFor(() => document.getElementById('runtime-status').dataset.kind === 'ready', 'runtime-ready');
    const viewportRect = { width: document.documentElement.clientWidth, height: document.documentElement.clientHeight };
    const rectFor = (id) => {
      const element = document.getElementById(id);
      const rect = element.getBoundingClientRect();
      return { id, hidden: element.hidden, left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
    };
    const initialRects = ['runtime-toggle', 'camera-focus-button', 'camera-follow', 'camera-bird', 'camera-top', 'mission-input', 'shuffle-button', 'start-button', 'place-resolution-lane', 'decisions-button'].map(rectFor);
    const initialLayout = {
      viewport: viewportRect,
      rects: initialRects,
      allWithinViewport: initialRects.every((rect) => rect.hidden || (rect.left >= -0.5 && rect.top >= -0.5 && rect.right <= viewportRect.width + 0.5 && rect.bottom <= viewportRect.height + 0.5)),
      primaryControlsVisible: ['mission-input', 'shuffle-button', 'start-button', 'place-resolution-lane'].every((id) => {
        const rect = initialRects.find((row) => row.id === id);
        const minimum = id === 'place-resolution-lane' ? 18 : 40;
        return rect && !rect.hidden && rect.width >= minimum && rect.height >= minimum;
      }),
    };
    const rafIntervals = [];
    const longTasks = [];
    const phaseMarks = [{ phase: 'sampling_started', at: performance.now() }];
    const markPhase = (phase) => phaseMarks.push({ phase, at: performance.now() });
    let lastRafTimestamp = null;
    let sampleRaf = true;
    const sampleFrame = (timestamp) => {
      if (lastRafTimestamp !== null) rafIntervals.push(timestamp - lastRafTimestamp);
      lastRafTimestamp = timestamp;
      if (sampleRaf) requestAnimationFrame(sampleFrame);
    };
    requestAnimationFrame(sampleFrame);
    const longTaskObserver = typeof PerformanceObserver === 'function'
      ? new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) longTasks.push({ startTime: entry.startTime, duration: entry.duration });
      })
      : null;
    try { longTaskObserver?.observe({ type: 'longtask', buffered: true }); } catch { /* Long Tasks API is optional. */ }
    const canvas = document.getElementById('autonomy-canvas');
    const minimap = document.getElementById('follow-minimap');
    const focusSelect = document.getElementById('camera-focus');
    const missionInput = document.getElementById('mission-input');
    const shuffleButton = document.getElementById('shuffle-button');
    const startButton = document.getElementById('start-button');
    const originalMission = missionInput.value;
    shuffleButton.click();
    const shuffledMission = missionInput.value;
    const shuffle = {
      changed: shuffledMission.length > 0 && shuffledMission !== originalMission,
      originalMission,
      shuffledMission,
      startLabel: startButton.textContent.trim(),
    };
    const visibleCopy = document.body.innerText;
    const copy = {
      removedLabelsAbsent: !visibleCopy.includes('Mission compiler')
        && !visibleCopy.includes('Natural language to grounded obligations')
        && !visibleCopy.includes('Every autonomous choice, exposed and settled.')
        && !visibleCopy.includes('observe, retrieve, choose, settle')
        && !visibleCopy.includes('3 regions | 2026-07-13'),
      blankLink: {
        href: document.querySelector('.blank-link')?.getAttribute('href') || null,
        label: document.querySelector('.blank-link')?.textContent.trim() || null,
      },
    };
    const sleep = (duration) => new Promise((resolve) => setTimeout(resolve, duration));
    const vector = (value) => String(value || '').split(',').map(Number);
    const vectorDistance = (left, right) => Math.hypot(...left.map((value, index) => value - right[index]));
    const cameraEye = () => vector(canvas.dataset.cameraEye);
    const cameraTarget = () => vector(canvas.dataset.cameraTarget);
    const waitForCamera = (label) => waitFor(() => canvas.dataset.cameraTransition === 'settled', label, 5000);
    const probeMode = async (mode) => {
      await waitForCamera('camera-' + mode + '-ready');
      const before = cameraEye();
      document.getElementById('camera-' + mode).click();
      const immediate = cameraEye();
      const began = canvas.dataset.cameraMode === mode && canvas.dataset.cameraTransition === 'active';
      const noSnap = vectorDistance(before, immediate) < 1;
      await sleep(260);
      const middle = cameraEye();
      const progress = Number(canvas.dataset.cameraTransitionProgress);
      const progressed = canvas.dataset.cameraTransition === 'active'
        && progress > 0
        && progress < 1
        && vectorDistance(before, middle) > 1;
      await waitForCamera('camera-' + mode + '-settled');
      const after = cameraEye();
      return {
        mode,
        began,
        noSnap,
        progressed,
        settled: canvas.dataset.cameraMode === mode && canvas.dataset.cameraTransition === 'settled',
        moved: vectorDistance(before, after) > 2,
      };
    };
    const regionOptions = [...focusSelect.options].filter((option) => option.value.startsWith('region:'));
    const placeOptions = [...focusSelect.options].filter((option) => option.value.startsWith('place:'));
    const modeProbes = [];
    modeProbes.push(await probeMode('top'));
    modeProbes.push(await probeMode('follow'));
    const followZoomBefore = Number(canvas.dataset.cameraFollowDistance);
    canvas.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -240 }));
    await sleep(260);
    const followZoomAfter = Number(canvas.dataset.cameraFollowDistance);
    const followZoomWorked = canvas.dataset.cameraInteraction === 'zoom'
      && Number.isFinite(followZoomBefore)
      && Number.isFinite(followZoomAfter)
      && followZoomAfter < followZoomBefore;
    modeProbes.push(await probeMode('bird'));
    markPhase('camera_modes_complete');

    const focusBefore = cameraTarget();
    const regionTargetId = regionOptions.find((option) => option.value.includes('north-brooklyn'))?.value || regionOptions.at(-1)?.value;
    focusSelect.value = regionTargetId;
    focusSelect.dispatchEvent(new Event('change', { bubbles: true }));
    const focusImmediate = cameraTarget();
    const regionFocusBegan = canvas.dataset.cameraFocus === regionTargetId && canvas.dataset.cameraTransition === 'active';
    const regionFocusNoSnap = vectorDistance(focusBefore, focusImmediate) < 1;
    await sleep(260);
    const focusMiddle = cameraTarget();
    const focusProgress = Number(canvas.dataset.cameraTransitionProgress);
    const regionFocusProgressed = canvas.dataset.cameraTransition === 'active'
      && focusProgress > 0
      && focusProgress < 1
      && vectorDistance(focusBefore, focusMiddle) > 1;
    await waitForCamera('region-focus-settled');
    const regionFocusAfter = cameraTarget();
    const regionFocus = {
      targetId: regionTargetId,
      began: regionFocusBegan,
      noSnap: regionFocusNoSnap,
      progressed: regionFocusProgressed,
      settled: canvas.dataset.cameraFocus === regionTargetId && canvas.dataset.cameraTransition === 'settled',
      moved: vectorDistance(focusBefore, regionFocusAfter) > 100,
    };

    const originalSetPointerCapture = canvas.setPointerCapture;
    canvas.setPointerCapture = () => {};
    const pointer = (type, pointerId, x, y, options = {}) => canvas.dispatchEvent(new PointerEvent(type, {
      bubbles: true,
      pointerId,
      clientX: x,
      clientY: y,
      button: options.button || 0,
      buttons: type === 'pointerup' ? 0 : 1,
      shiftKey: Boolean(options.shiftKey),
    }));
    const panBefore = cameraTarget();
    pointer('pointerdown', 41, 180, 220, { shiftKey: true });
    pointer('pointermove', 41, 215, 240, { shiftKey: true });
    pointer('pointerup', 41, 215, 240, { shiftKey: true });
    await sleep(260);
    const panWorked = canvas.dataset.cameraInteraction === 'pan'
      && canvas.dataset.cameraFocus === 'custom'
      && vectorDistance(panBefore, cameraTarget()) > 1;
    const orbitBefore = cameraEye();
    pointer('pointerdown', 42, 180, 220);
    pointer('pointermove', 42, 225, 238);
    pointer('pointerup', 42, 225, 238);
    await sleep(260);
    const orbitWorked = canvas.dataset.cameraInteraction === 'orbit'
      && vectorDistance(orbitBefore, cameraEye()) > 1;
    const zoomBefore = vectorDistance(cameraEye(), cameraTarget());
    canvas.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -240 }));
    await sleep(260);
    const zoomWorked = vectorDistance(cameraEye(), cameraTarget()) < zoomBefore - 1;
    canvas.setPointerCapture = originalSetPointerCapture;

    focusSelect.value = 'route';
    focusSelect.dispatchEvent(new Event('change', { bubbles: true }));
    await waitForCamera('route-focus-restored');
    const returnedToRoute = canvas.dataset.cameraMode === 'bird'
      && canvas.dataset.cameraFocus === 'route'
      && canvas.dataset.cameraTransition === 'settled';
    markPhase('camera_interactions_complete');
    missionInput.value = 'run in circles around union squatre park parimeter until youve ran 5000 feet';
    missionInput.dispatchEvent(new Event('input', { bubbles: true }));
    const editInvalidatedController = document.getElementById('export-button').disabled
      && document.getElementById('runtime-status').dataset.kind === 'changed';
    markPhase('mission_edited');
    startButton.click();
    markPhase('start_clicked');
    const missionLockedDuringRun = missionInput.disabled;
    await waitFor(() => canvas.dataset.cameraMode === 'follow'
      && canvas.dataset.followMinimap === 'visible'
      && !minimap.hidden
      && Number(minimap.dataset.frameCount || 0) > 0, 'start-follow-minimap', 5000);
    const startedInFollow = canvas.dataset.cameraMode === 'follow';
    const minimapReceipt = {
      visible: canvas.dataset.followMinimap === 'visible' && !minimap.hidden,
      projection: minimap.dataset.projection,
      radiusM: Number(minimap.dataset.radiusM),
      frameCount: Number(minimap.dataset.frameCount || 0),
    };
    markPhase('follow_minimap_ready');
    await waitFor(() => ['completed', 'failed'].includes(document.getElementById('metric-state').textContent), 'journey-terminal');
    markPhase('journey_terminal');
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    sampleRaf = false;
    longTaskObserver?.disconnect();
    const sortedFrameIntervals = [...rafIntervals].sort((left, right) => left - right);
    const sampledLongTasks = longTasks.filter((row) => row.startTime >= phaseMarks[0].at);
    const percentile = (fraction) => sortedFrameIntervals[Math.min(sortedFrameIntervals.length - 1, Math.max(0, Math.ceil(sortedFrameIntervals.length * fraction) - 1))] || null;
    const roundMetric = (value) => Number.isFinite(value) ? Number(value.toFixed(4)) : null;
    const frameDistribution = {
      min: roundMetric(sortedFrameIntervals[0]),
      p50: roundMetric(percentile(0.5)),
      p95: roundMetric(percentile(0.95)),
      p99: roundMetric(percentile(0.99)),
      max: roundMetric(sortedFrameIntervals.at(-1)),
      mean: roundMetric(rafIntervals.reduce((sum, value) => sum + value, 0) / Math.max(1, rafIntervals.length)),
    };
    const runtimeEvents = window.__simulatteAutonomyRuntimeEvents || [];
    const runtimeEventNames = runtimeEvents.map((row) => row.event);
    const manifestEvent = runtimeEvents.find((row) => row.event === 'data.manifest.received');
    const retrievalEvent = runtimeEvents.find((row) => row.event === 'retrieval.lane.executed');
    const requiredRuntimeEvents = [
      'app.boot.started',
      'data.load.started',
      'data.manifest.received',
      'data.manifest.validated',
      'data.load.ready',
      'mission.compiled',
      'renderer.ready',
      'journey.started',
      'retrieval.lane.executed',
      'journey.terminal',
    ];
    return {
      runtime: document.getElementById('runtime-status').textContent,
      initialLayout,
      state: document.getElementById('metric-state').textContent,
      tick: Number(document.getElementById('metric-tick').textContent),
      distance: document.getElementById('metric-distance').textContent,
      decision: document.getElementById('metric-bet').textContent,
      settlement: document.getElementById('metric-settlement').textContent,
      calibration: document.getElementById('metric-calibration').textContent,
      traceRows: document.querySelectorAll('.trace-row').length,
      betRows: document.querySelectorAll('.bet-row').length,
      selectedRows: document.querySelectorAll('.bet-row.is-selected').length,
      rejectedRows: document.querySelectorAll('.bet-row.is-rejected').length,
      gateRows: document.querySelectorAll('.gate-row').length,
      retrievalRows: document.querySelectorAll('#retrieval-candidates > span').length,
      rerankRows: document.querySelectorAll('#rerank-candidates > span').length,
      occurrenceRows: document.querySelectorAll('#occurrence-patterns > span').length,
      retrievalLaneLabel: document.getElementById('retrieval-stats').textContent,
      rerankerProof: document.getElementById('reranker-proof').textContent,
      runtimeLog: {
        eventCount: runtimeEvents.length,
        eventNames: runtimeEventNames,
        requiredEventsPresent: requiredRuntimeEvents.every((event) => runtimeEventNames.includes(event)),
        manifestMissionExampleCount: manifestEvent?.details?.missionExampleCount ?? null,
        manifestCacheMode: manifestEvent?.details?.response?.cacheMode ?? null,
        embeddingExecuted: retrievalEvent?.details?.modelExecution?.embedding?.executed ?? null,
        neuralRerankerExecuted: retrievalEvent?.details?.modelExecution?.neuralReranker?.executed ?? null,
        failureCount: runtimeEvents.filter((row) => row.level === 'error').length,
      },
      shuffle,
      copy,
      camera: {
        regionTargetCount: regionOptions.length,
        placeTargetCount: placeOptions.length,
        modeProbes,
        regionFocus,
        panWorked,
        orbitWorked,
        zoomWorked,
        followZoomWorked,
        followZoomBefore,
        followZoomAfter,
        returnedToRoute,
        startedInFollow,
        minimap: minimapReceipt,
      },
      editInvalidatedController,
      missionLockedDuringRun,
      rendererBackend: document.getElementById('autonomy-canvas').dataset.rendererBackend || null,
      actorMeshSchema: document.getElementById('autonomy-canvas').dataset.actorMeshSchema || null,
      actorMeshKinds: document.getElementById('autonomy-canvas').dataset.actorMeshKinds || null,
      materialModel: document.getElementById('autonomy-canvas').dataset.materialModel || null,
      ambientActorCount: Number(document.getElementById('autonomy-canvas').dataset.ambientActorCount || 0),
      ambientActorKinds: document.getElementById('autonomy-canvas').dataset.ambientActorKinds || null,
      adapterName: document.getElementById('autonomy-canvas').dataset.adapterName || null,
      rendererFrames: Number(document.getElementById('autonomy-canvas').dataset.frameCount || 0),
      smoothness: {
        rafFrameCount: rafIntervals.length,
        frameIntervalMs: frameDistribution,
        over20msCount: rafIntervals.filter((value) => value > 20).length,
        over33msCount: rafIntervals.filter((value) => value > 33.34).length,
        over33msRatio: roundMetric(rafIntervals.filter((value) => value > 33.34).length / Math.max(1, rafIntervals.length)),
        longTaskCount: sampledLongTasks.length,
        longTaskTotalMs: roundMetric(sampledLongTasks.reduce((sum, row) => sum + row.duration, 0)),
        longestTaskMs: roundMetric(Math.max(0, ...sampledLongTasks.map((row) => row.duration))),
        phaseMarks,
        longTasks: sampledLongTasks.map((row) => ({
          startTime: roundMetric(row.startTime),
          duration: roundMetric(row.duration),
          phase: [...phaseMarks].reverse().find((mark) => mark.at <= row.startTime)?.phase || 'before_sampling',
        })),
      },
      staticVertexCount: Number(document.getElementById('autonomy-canvas').dataset.staticVertexCount || 0),
      dynamicVertexCount: Number(document.getElementById('autonomy-canvas').dataset.dynamicVertexCount || 0),
      canvasWidth: document.getElementById('autonomy-canvas').width,
      canvasHeight: document.getElementById('autonomy-canvas').height,
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      scrollY: window.scrollY,
      hasHorizontalOverflow: document.documentElement.scrollWidth > window.innerWidth
    };
  })()`;
}

function consentFlowExpression() {
  return `(async () => {
    const runtimeFailure = () => {
      const status = document.getElementById('runtime-status');
      if (status?.dataset.kind !== 'error') return null;
      const event = [...(globalThis.__simulatteAutonomyRuntimeEvents || [])]
        .reverse()
        .find((row) => row.event === 'runtime.failed');
      return event?.details?.message || status.textContent || 'unknown runtime error';
    };
    const waitFor = async (predicate, label) => {
      const started = performance.now();
      while (!predicate()) {
        const failure = runtimeFailure();
        if (failure) throw new Error('autonomy browser runtime.failed at ' + label + ': ' + failure);
        if (performance.now() - started > 10000) throw new Error('autonomy browser timeout at ' + label);
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    };
    const toggle = document.getElementById('place-resolution-lane');
    const dialog = document.getElementById('neural-model-dialog');
    await waitFor(() => toggle && toggle.getAttribute('aria-checked') === 'false', 'consent-ready');
    toggle.click();
    await waitFor(() => dialog.open, 'consent-open');
    const disclosed = {
      title: dialog.querySelector('h2').textContent.trim(),
      embedding: dialog.querySelector('[data-neural-model="embedding-size"]').textContent.trim(),
      rerankerRowAbsent: !dialog.querySelector('[data-neural-model="reranker-size"]'),
      total: dialog.querySelector('[data-neural-model="download-summary"]').textContent.trim(),
      use: dialog.querySelector('[data-neural-model="surface-use"]').textContent.trim(),
    };
    dialog.querySelector('[data-neural-consent="cancel"]').click();
    await waitFor(() => !dialog.open && !toggle.checked, 'consent-cancel');
    toggle.click();
    await waitFor(() => dialog.open, 'consent-reopen');
    dialog.querySelector('[data-neural-consent="accept"]').click();
    await waitFor(() => !dialog.open && toggle.checked, 'consent-accept');
    const grantRemembered = Boolean(localStorage.getItem('simulatte.neuralModels.consent.v1'));
    toggle.click();
    await waitFor(() => !toggle.checked, 'consent-revoke');
    return {
      disclosed,
      grantRemembered,
      revoked: !localStorage.getItem('simulatte.neuralModels.consent.v1'),
      finalEnabled: toggle.checked,
    };
  })()`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const report = await runBrowserSmoke(options);
  console.log(`AUTONOMY-BROWSER state=${report.result.state} tick=${report.result.tick} trace=${report.result.traceRows} errors=${report.errors.length} failedResponses=${report.failedResponses.length} status=${report.pass ? 'pass' : 'fail'}`);
  if (!report.pass) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error && error.stack || error);
    process.exit(1);
  });
}

export { CdpClient, actorViewExpression, browserJourneyExpression, consentFlowExpression, createStaticServer, findChrome, parseUrl, parseViewport, runBrowserSmoke };
