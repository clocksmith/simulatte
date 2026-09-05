import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { CdpClient } from './browser-harness.mjs';
import { createStaticSiteServer } from './static-site-server.mjs';
import { stopStaticServer } from '../audit-server-lifecycle.mjs';
import { captureChildProcessOutput } from '../audit-process-log.mjs';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const generatedProfiles = new Set();

export function findChrome(explicitPath = '') {
  const requested = explicitPath || process.env.CHROME_PATH || process.env.CHROME_BIN;
  const candidates = requested ? [requested] : [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    'google-chrome', 'chromium', 'chromium-browser',
  ];
  for (const candidate of candidates) {
    const paths = candidate.includes(path.sep) ? [path.resolve(candidate)]
      : String(process.env.PATH || '').split(path.delimiter).map((dir) => path.join(dir, candidate));
    for (const executable of paths) {
      try {
        fs.accessSync(executable, fs.constants.X_OK);
        if (fs.statSync(executable).isFile()) return executable;
      } catch { /* Try the next declared executable location. */ }
    }
  }
  throw new Error(`Chrome executable unavailable${requested ? `: ${requested}` : '; set CHROME_PATH or pass --chrome PATH'}`);
}

export function browserArguments({ profileDir, viewport, webgpu = false, linuxVulkan = true, preciseMemory = false, headed = false, args = [] }) {
  if (!profileDir || !viewport || !Number.isInteger(viewport.width) || !Number.isInteger(viewport.height)
      || viewport.width <= 0 || viewport.height <= 0) throw new Error('Browser profile and positive viewport are required');
  if (args.some((arg) => !arg.startsWith('--') || /^--(?:user-data-dir|remote-debugging-port|remote-debugging-pipe)(?:=|$)/.test(arg))) {
    throw new Error('Browser session owns profile and debugging arguments');
  }
  return [
    ...(headed ? [] : ['--headless=new']), '--remote-debugging-port=0', `--user-data-dir=${profileDir}`,
    '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
    ...(preciseMemory ? ['--enable-precise-memory-info'] : []),
    ...(webgpu ? ['--enable-unsafe-webgpu', ...(linuxVulkan && process.platform === 'linux'
      ? ['--use-angle=vulkan', '--enable-features=Vulkan', '--disable-vulkan-surface'] : [])] : []),
    `--window-size=${viewport.width},${viewport.height}`, ...args, 'about:blank',
  ];
}

function hasExited(child) {
  return !child || child.exitCode != null || child.signalCode != null || child.pid == null;
}

async function signalAndWait(child, signal, timeoutMs) {
  if (hasExited(child)) return true;
  return new Promise((resolve, reject) => {
    const finish = (value, error) => {
      clearTimeout(timer);
      child.removeListener('exit', exited);
      child.removeListener('error', failed);
      if (error) reject(error); else resolve(value);
    };
    const exited = () => finish(true);
    const failed = (error) => finish(false, error);
    const timer = setTimeout(() => finish(hasExited(child)), timeoutMs);
    child.once('exit', exited);
    child.once('error', failed);
    try { child.kill(signal); } catch (error) { failed(error); }
  });
}

export async function stopChild(child, graceMs = 2000) {
  if (await signalAndWait(child, 'SIGTERM', graceMs)) return;
  if (!await signalAndWait(child, 'SIGKILL', graceMs)) throw new Error('Browser did not exit after SIGKILL');
}

export async function removeTemporaryDirectory(directory) {
  const resolved = path.resolve(directory);
  if (!generatedProfiles.has(resolved)) throw new Error(`Browser cleanup refuses an unowned directory: ${resolved}`);
  await fs.promises.rm(resolved, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  generatedProfiles.delete(resolved);
}

// Compatibility for older callers that created their own temporary profiles.
export async function removeLegacyProfile(directory, prefix) {
  const resolved = path.resolve(directory);
  if (!prefix?.startsWith('simulatte-') || path.dirname(resolved) !== path.resolve(os.tmpdir())
      || !path.basename(resolved).startsWith(prefix)) throw new Error(`Browser cleanup target invalid: ${resolved}`);
  await fs.promises.rm(resolved, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  return { removed: true, path: resolved };
}

export async function waitForBrowserPage({ profileDir, child, timeoutMs = 10000, fetchImpl = fetch, getSpawnError = () => null }) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    if (getSpawnError()) throw getSpawnError();
    if (hasExited(child)) throw new Error(`Chrome exited before DevTools was ready (code ${child?.exitCode}, signal ${child?.signalCode})`);
    try {
      const port = Number((await fs.promises.readFile(path.join(profileDir, 'DevToolsActivePort'), 'utf8')).split('\n')[0]);
      if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid DevToolsActivePort');
      const response = await fetchImpl(`http://127.0.0.1:${port}/json/list`, {
        signal: AbortSignal.timeout(Math.max(1, Math.min(1000, deadline - Date.now()))),
      });
      if (response.ok) {
        const page = (await response.json()).find((row) => row.type === 'page' && row.webSocketDebuggerUrl);
        if (page) return page;
      }
    } catch (error) { lastError = error; }
    await delay(Math.min(50, Math.max(0, deadline - Date.now())));
  }
  throw new Error(`Chrome DevTools readiness timed out after ${timeoutMs}ms`, { cause: lastError });
}

export async function launchBrowser(options = {}) {
  const chromePath = findChrome(options.chromePath);
  const profileDir = options.profileDir ? path.resolve(options.profileDir)
    : await fs.promises.mkdtemp(path.join(os.tmpdir(), 'simulatte-browser-'));
  if (!options.profileDir) generatedProfiles.add(profileDir);
  const viewport = options.viewport || { width: 1440, height: 1000 };
  let child = null;
  let client = null;
  let processOutput = null;
  let spawnError = null;
  let closing = null;
  const close = () => closing ||= (async () => {
    const errors = [];
    try { await client?.close(); } catch (error) { errors.push(error); }
    let stopped = false;
    try { await stopChild(child); stopped = true; } catch (error) { errors.push(error); }
    if (stopped && !options.profileDir && !options.keepProfile) {
      try { await removeTemporaryDirectory(profileDir); } catch (error) { errors.push(error); }
    }
    if (errors.length) throw new AggregateError(errors, 'Browser cleanup failed');
  })();
  try {
    await fs.promises.mkdir(profileDir, { recursive: true });
    // Persistent profiles may retain the previous process's debugging port.
    await fs.promises.rm(path.join(profileDir, 'DevToolsActivePort'), { force: true });
    const launchArguments = Object.freeze(browserArguments({ ...options, profileDir, viewport }));
    child = spawn(chromePath, launchArguments, { stdio: ['ignore', 'pipe', 'pipe'] });
    child.on('error', (error) => { spawnError = error; });
    processOutput = captureChildProcessOutput(child);
    const page = await waitForBrowserPage({ profileDir, child, timeoutMs: options.startupTimeoutMs || 10000, getSpawnError: () => spawnError });
    client = new CdpClient(page.webSocketDebuggerUrl, { timeoutMs: options.commandTimeoutMs || 60000 });
    await client.connect();
    return Object.freeze({ client, child, chromePath, profileDir, viewport, launchArguments, processOutput, close });
  } catch (error) {
    error.browserProcessLog = processOutput?.snapshot();
    try { await close(); } catch (cleanupError) { throw new AggregateError([error, cleanupError], 'Browser startup and cleanup failed'); }
    throw error;
  }
}

export async function createAuditHost({ publicRoot, url = '', port = 0, ...serverOptions }) {
  if (url) {
    const target = new URL(url);
    if (!['http:', 'https:'].includes(target.protocol)) throw new Error('Browser audit URL must use HTTP or HTTPS');
    return { server: null, port: 0, baseUrl: target.toString(), requests: [], close: async () => {} };
  }
  const requests = [];
  const server = createStaticSiteServer({ ...serverOptions, publicRoot,
    onRequest: (request) => { requests.push(request); serverOptions.onRequest?.(request); },
  });
  await new Promise((resolve, reject) => server.listen(port, '127.0.0.1', resolve).once('error', reject));
  return { server, port: server.address().port, baseUrl: `http://127.0.0.1:${server.address().port}/`, requests,
    close: () => stopStaticServer(server) };
}

export async function openBrowserAudit(options) {
  const host = await createAuditHost(options);
  try {
    const browser = await launchBrowser(options);
    let closing = null;
    return { ...browser, host, close: () => closing ||= (async () => {
      try { await browser.close(); } finally { await host.close(); }
    })() };
  } catch (error) { await host.close(); throw error; }
}
