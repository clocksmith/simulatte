#!/usr/bin/env node
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const TOOL_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(TOOL_DIR, '../..');
const PUBLIC = path.join(ROOT, 'public');
const DEFAULT_OUT = path.join(ROOT, 'artifacts', 'tier-browser-smoke');

const TIERS = [
  { tier: 'country', profileId: 'food-recall-us-v1', pluginId: 'food-recall-us' },
  { tier: 'world', profileId: 'maritime-trade-global-v1', pluginId: 'maritime-trade-global' },
  { tier: 'solar-system', profileId: 'orbital-transfer-planner-v1', pluginId: 'orbital-transfer-planner' },
  { tier: 'star-chart', profileId: 'interstellar-relay-network-v1', pluginId: 'interstellar-relay-network' },
];

function parseArgs(argv) {
  const options = { outDir: DEFAULT_OUT, checkOnly: false, chromePath: process.env.CHROME_PATH || '', baseUrl: '' };
  for (let index = 0; index < argv.length; index += 1) {
    const [key, inline] = argv[index].split('=');
    const value = () => inline ?? argv[++index];
    if (key === '--out') options.outDir = path.resolve(value());
    else if (key === '--chrome') options.chromePath = path.resolve(value());
    else if (key === '--url' || key === '--base-url') options.baseUrl = value();
    else if (key === '--check') options.checkOnly = true;
    else if (key === '--help') {
      console.log('usage: node tools/simulatte/run-tier-browser-smoke.mjs [--check] [--out DIR] [--chrome PATH] [--base-url URL]');
      process.exit(0);
    }
  }
  return options;
}

function resolveChromeExecutable(overridePath) {
  if (overridePath && fs.existsSync(overridePath)) return overridePath;
  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return '';
}

async function findAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });
}

function startStaticServer(port) {
  const server = http.createServer((req, res) => {
    const safeUrl = new URL(req.url, `http://127.0.0.1:${port}`);
    let filePath = path.join(PUBLIC, safeUrl.pathname);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }
    if (!fs.existsSync(filePath)) {
      // Mirror firebase.json rewrites: extensionless/unknown paths (the /tier/experience routes)
      // serve the SPA entry so client-side routing can boot; /blank/** serves its own entry.
      if (path.extname(safeUrl.pathname)) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
        return;
      }
      filePath = safeUrl.pathname.startsWith('/blank/')
        ? path.join(PUBLIC, 'blank', 'index.html')
        : path.join(PUBLIC, 'index.html');
    }
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      '.html': 'text/html; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.svg': 'image/svg+xml',
      '.wasm': 'application/wasm',
    };
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}

// Minimal Chrome DevTools Protocol client over the debugger WebSocket.
class CdpClient {
  constructor(url) { this.url = url; this.nextId = 1; this.pending = new Map(); this.listeners = new Map(); }
  async connect() {
    this.socket = new WebSocket(this.url);
    await new Promise((resolve, reject) => { this.socket.onopen = resolve; this.socket.onerror = reject; });
    this.socket.onmessage = ({ data }) => this.receive(JSON.parse(data));
  }
  receive(message) {
    if (message.id && this.pending.has(message.id)) {
      const pending = this.pending.get(message.id); this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(JSON.stringify(message.error))); else pending.resolve(message.result);
    }
    for (const listener of this.listeners.get(message.method) || []) listener(message.params);
  }
  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject }); this.socket.send(JSON.stringify({ id, method, params })); });
  }
  on(method, listener) { if (!this.listeners.has(method)) this.listeners.set(method, []); this.listeners.get(method).push(listener); }
  close() { try { this.socket.close(); } catch { /* already closed */ } }
}

async function waitForDevtools(port, child) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Chrome exited before DevTools was ready (code ${child.exitCode})`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json`);
      if (response.ok) { const page = (await response.json()).find((row) => row.type === 'page'); if (page) return page; }
    } catch { /* debugger port not open yet */ }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Chrome DevTools did not become ready on port ${port}`);
}

// In-page probe: current runtime status plus the tier run receipt, which is set only
// when Start dispatches scenario.run and settlement completes.
const STATE_PROBE = `(() => {
  const receipt = window.__simulatteTierRunReceipt || null;
  const text = document.body ? document.body.innerText : '';
  const match = text.match(/\\b(Loading experience|Ready|Running scenario|Complete|Stopped)\\b/);
  return {
    status: match ? match[1] : '',
    receipt: receipt ? { actionStatus: receipt.actionResult && receipt.actionResult.status, obligations: (receipt.settlement && receipt.settlement[0] && receipt.settlement[0].obligationResults || []).length } : null,
  };
})()`;

async function waitFor(probe, predicate, label, timeoutMs) {
  const started = Date.now();
  for (;;) {
    const state = await probe();
    if (state.status === 'Stopped') throw new Error(`${label}: runtime error (Stopped)`);
    if (predicate(state)) return state;
    if (Date.now() - started > timeoutMs) throw new Error(`${label}: timeout after ${timeoutMs}ms (status=${state.status || 'unknown'})`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

// Boot a tier, wait for Ready, click Start, and require a settled run receipt.
async function auditTier(chromePath, baseUrl, item) {
  const report = { tier: item.tier, profileId: item.profileId, pluginId: item.pluginId, pass: false, status: null, receipt: null, errors: [] };
  const debugPort = await findAvailablePort();
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), `simulatte-tier-${item.tier}-`));
  const chrome = spawn(chromePath, ['--headless=new', '--enable-unsafe-webgpu', '--disable-background-networking', '--no-first-run', '--no-default-browser-check', `--user-data-dir=${profileDir}`, `--remote-debugging-port=${debugPort}`, '--window-size=1440,1000', 'about:blank'], { stdio: ['ignore', 'ignore', 'ignore'] });
  let client = null;
  try {
    const page = await waitForDevtools(debugPort, chrome);
    client = new CdpClient(page.webSocketDebuggerUrl);
    await client.connect();
    await client.send('Runtime.enable');
    await client.send('Page.enable');
    client.on('Runtime.exceptionThrown', (params) => report.errors.push(params?.exceptionDetails?.exception?.description || params?.exceptionDetails?.text || 'exception'));
    const url = new URL(baseUrl); url.pathname = `/${item.tier}/${item.profileId}`; url.search = '';
    await client.send('Page.navigate', { url: url.toString() });
    const probe = async () => (await client.send('Runtime.evaluate', { expression: STATE_PROBE, returnByValue: true })).result.value;
    await waitFor(probe, (state) => state.status === 'Ready', 'tier-ready', 45000);
    await client.send('Runtime.evaluate', { expression: `const b = document.getElementById('start-button'); b && b.click();` });
    const final = await waitFor(probe, (state) => Boolean(state.receipt) && state.status === 'Complete', 'tier-complete', 45000);
    report.status = final.status;
    report.receipt = final.receipt;
    if (final.receipt.actionStatus !== 'settled') throw new Error(`action status ${final.receipt.actionStatus}`);
    report.pass = report.errors.length === 0;
  } catch (error) {
    report.errors.unshift(error.message);
  } finally {
    if (client) client.close();
    chrome.kill();
  }
  return report;
}

async function runTierBrowserSmoke() {
  const options = parseArgs(process.argv.slice(2));
  fs.mkdirSync(options.outDir, { recursive: true });

  const chromePath = resolveChromeExecutable(options.chromePath);
  if (!chromePath) {
    console.log('TIER-SMOKE status=skipped reason=chrome_executable_not_found');
    fs.writeFileSync(path.join(options.outDir, 'report.json'), JSON.stringify({ status: 'skipped', reason: 'chrome_executable_not_found' }, null, 2));
    process.exit(options.checkOnly ? 1 : 0);
  }

  let server = null;
  if (!options.baseUrl) {
    const port = await findAvailablePort();
    server = await startStaticServer(port);
    options.baseUrl = `http://127.0.0.1:${port}/`;
  }

  const reports = [];
  for (const item of TIERS) {
    console.log(`TIER-SMOKE testing tier=${item.tier} profile=${item.profileId}...`);
    const report = await auditTier(chromePath, options.baseUrl, item);
    console.log(`TIER-SMOKE tier=${item.tier} status=${report.pass ? 'pass' : 'fail'}${report.pass ? ` obligations=${report.receipt.obligations}` : ` reason=${report.errors[0] || 'unknown'}`}`);
    reports.push(report);
  }

  const passed = reports.filter((row) => row.pass).length;
  const allPass = passed === TIERS.length;
  fs.writeFileSync(path.join(options.outDir, 'report.json'), JSON.stringify({ timestamp: new Date().toISOString(), pass: allPass, totalTiers: TIERS.length, passedTiers: passed, reports }, null, 2));
  if (server) server.close();

  console.log(`TIER-SMOKE status=${allPass ? 'pass' : 'fail'} total=${TIERS.length} passed=${passed}`);
  process.exit(allPass ? 0 : 1);
}

runTierBrowserSmoke().catch((err) => {
  console.error(`TIER-SMOKE status=failed reason=${err.message}`);
  process.exit(1);
});
