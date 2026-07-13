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
  const targetUrl = options.url || `http://127.0.0.1:${staticHost.port}/autonomy/`;
  const devtoolsPort = await freePort();
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'simulatte-autonomy-browser-'));
  const chrome = spawn(chromePath, [
    '--headless=new',
    '--disable-gpu',
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
    const evaluated = await client.send('Runtime.evaluate', {
      expression: browserJourneyExpression(),
      awaitPromise: true,
      returnByValue: true,
    });
    if (evaluated.exceptionDetails) throw new Error(evaluated.exceptionDetails.exception && evaluated.exceptionDetails.exception.description || evaluated.exceptionDetails.text);
    const browserVersion = await client.send('Browser.getVersion');
    const screenshot = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const result = evaluated.result.value;
    const pass = result.state === 'completed'
      && result.traceRows > 0
      && result.selectedRows === 1
      && result.editInvalidatedController
      && result.missionLockedDuringRun
      && !result.hasHorizontalOverflow
      && errors.length === 0
      && failedResponses.length === 0;
    const report = {
      schema: 'simulatte.autonomyBrowserSmoke.v1',
      pass,
      targetUrl,
      viewport: options.viewport,
      browser: { product: browserVersion.product, protocolVersion: browserVersion.protocolVersion, userAgent: browserVersion.userAgent },
      result,
      errors,
      failedResponses,
      requests: staticHost ? staticHost.requests : [],
      claimBoundary: 'This smoke proves the checked-in static browser journey executed in the named browser. It does not establish physical-world autonomy.',
    };
    if (!options.checkOnly) {
      fs.mkdirSync(options.outDir, { recursive: true });
      fs.writeFileSync(path.join(options.outDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
      fs.writeFileSync(path.join(options.outDir, 'journey.png'), Buffer.from(screenshot.data, 'base64'));
    }
    return report;
  } finally {
    if (client) client.close();
    await stopChild(chrome);
    if (staticHost) await new Promise((resolve) => staticHost.server.close(resolve));
    fs.rmSync(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  }
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
    const waitFor = async (predicate, limit = 30000) => {
      const started = performance.now();
      while (!predicate()) {
        if (performance.now() - started > limit) throw new Error('autonomy browser condition timeout');
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    };
    await waitFor(() => document.getElementById('runtime-status').dataset.kind === 'ready');
    const missionInput = document.getElementById('mission-input');
    missionInput.value += ' ';
    missionInput.dispatchEvent(new Event('input', { bubbles: true }));
    const editInvalidatedController = document.getElementById('export-button').disabled
      && document.getElementById('runtime-status').dataset.kind === 'changed';
    document.getElementById('start-button').click();
    const missionLockedDuringRun = missionInput.disabled;
    await waitFor(() => ['completed', 'failed'].includes(document.getElementById('metric-state').textContent));
    return {
      runtime: document.getElementById('runtime-status').textContent,
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
      editInvalidatedController,
      missionLockedDuringRun,
      canvasWidth: document.getElementById('autonomy-canvas').width,
      canvasHeight: document.getElementById('autonomy-canvas').height,
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      hasHorizontalOverflow: document.documentElement.scrollWidth > window.innerWidth
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

export { CdpClient, browserJourneyExpression, createStaticServer, findChrome, parseUrl, parseViewport, runBrowserSmoke };
