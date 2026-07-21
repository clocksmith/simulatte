#!/usr/bin/env node
// Browser performance measurement for the place-resolution cascade, gated by
// the declared budgets in
// public/data/simulatte/policies/resolution-performance-budgets-v1.json.
//
// Lanes:
//   default_lexical  the shipped path; asserts zero model bytes and zero
//                    model executions at the network and stats layers
//   hybrid_optin     cold navigation (fresh profile) then warm reload;
//                    records load durations, tier stats, and violations
//
// The hybrid lane runs only when a local model source is available
// (--model-base-url, or an auto-detected sibling doppler artifact matching
// the model lock). A gate run never downloads the remote model.
//
// Performance receipts are evidence snapshots: numbers vary run to run, so
// --check re-measures and applies the hard budgets instead of byte-comparing
// a committed file. Write mode stores the receipt beside the accuracy
// evidence for the same population.
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const TOOL_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(TOOL_DIR, '../..');
const PUBLIC = path.join(ROOT, 'public');
const FIXTURES = path.join(TOOL_DIR, 'fixtures');
const OUTPUT = path.join(ROOT, 'public/data/simulatte/evidence/resolution-performance-v1.json');
const FILES = Object.freeze({
  budgets: 'public/data/simulatte/policies/resolution-performance-budgets-v1.json',
  corpus: 'tools/samer/simulatte/place-resolution-probes-v1.json',
  world: 'public/data/simulatte/worlds/nyc-core-autonomy-v1.json',
  embodiment: 'public/data/simulatte/embodiments/delivery-bike-v1.json',
  embeddingIndex: 'public/data/simulatte/place-embedding-index-v1.json',
  modelLock: 'public/data/simulatte-embedder/model-runtime-lock.json',
  fixture: 'tools/simulatte/fixtures/resolution-bench.html',
  resolver: 'public/simulatte/runtime/neural-place-resolver.js',
  resolutionCore: 'public/simulatte/runtime/neural-place-resolution-core.js',
  missionCompiler: 'public/simulatte/mission/mission-compiler.js',
});

function parseArgs(argv) {
  const options = {
    lanes: ['default_lexical', 'hybrid_optin'],
    repetitions: 5,
    chromePath: process.env.CHROME_PATH || '',
    modelBaseUrl: '',
    out: OUTPUT,
    check: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const next = () => String(argv[++index] || '');
    if (flag === '--lane') options.lanes = [next()];
    else if (flag === '--repetitions') options.repetitions = Math.max(1, Math.floor(Number(next())));
    else if (flag === '--chrome') options.chromePath = next();
    else if (flag === '--model-base-url') options.modelBaseUrl = next();
    else if (flag === '--out') options.out = path.resolve(ROOT, next());
    else if (flag === '--check') options.check = true;
    else throw new Error(`unknown argument: ${flag}`);
  }
  return options;
}

function findChrome(explicitPath) {
  const candidates = [
    explicitPath,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error('Chrome not found: pass --chrome or set CHROME_PATH');
}

function detectLocalModelDir(modelLock) {
  const modelId = modelLock?.embedding?.id;
  if (!modelId) return null;
  const candidate = path.resolve(ROOT, '../doppler/models/local', modelId);
  return fs.existsSync(path.join(candidate, 'manifest.json')) && fs.existsSync(path.join(candidate, 'shard_00000.bin')) ? candidate : null;
}

function contentType(file) {
  const extension = path.extname(file);
  return ({
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.wgsl': 'text/plain; charset=utf-8',
  })[extension] || 'application/octet-stream';
}

// Byte-range parsing mirrors tools/serve-local.mjs. Doppler reads shard
// tensors with ranged requests; a server that answers ranges with full 200
// bodies amplifies a 533 MB artifact into tens of gigabytes of transfer,
// which the modelDownloadBytes budget correctly rejects.
function parseByteRange(rangeHeader, size) {
  const raw = String(rangeHeader || '').trim();
  if (!raw) return null;
  const match = /^bytes=(\d*)-(\d*)$/i.exec(raw);
  if (!match) return { invalid: true };
  const hasStart = match[1] !== '';
  const hasEnd = match[2] !== '';
  if (!hasStart && !hasEnd) return { invalid: true };
  let start;
  let end;
  if (!hasStart) {
    const suffixLength = Number(match[2]);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return { invalid: true };
    start = Math.max(0, size - suffixLength);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = hasEnd ? Number(match[2]) : size - 1;
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || start >= size) {
    return { invalid: true };
  }
  return { start, end: Math.min(end, size - 1) };
}

async function createServer(mounts) {
  const server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url || '/', 'http://127.0.0.1').pathname);
    for (const mount of mounts) {
      if (!pathname.startsWith(mount.prefix)) continue;
      let relative = pathname.slice(mount.prefix.length) || 'index.html';
      if (relative.endsWith('/')) relative += 'index.html';
      const file = path.resolve(mount.dir, `.${path.sep}${relative}`);
      if (file !== mount.dir && !file.startsWith(`${mount.dir}${path.sep}`)) break;
      if (!fs.existsSync(file) || !fs.statSync(file).isFile()) break;
      const size = fs.statSync(file).size;
      const headers = { 'Content-Type': contentType(file), 'Cache-Control': 'no-store', 'Accept-Ranges': 'bytes' };
      const range = parseByteRange(request.headers.range, size);
      if (range && range.invalid) {
        response.writeHead(416, { ...headers, 'Content-Range': `bytes */${size}` }).end();
        return;
      }
      if (range) {
        response.writeHead(206, {
          ...headers,
          'Content-Length': String(range.end - range.start + 1),
          'Content-Range': `bytes ${range.start}-${range.end}/${size}`,
        });
        fs.createReadStream(file, { start: range.start, end: range.end }).pipe(response);
        return;
      }
      response.writeHead(200, { ...headers, 'Content-Length': String(size) });
      fs.createReadStream(file).pipe(response);
      return;
    }
    response.writeHead(404).end('Not found');
  });
  await new Promise((resolve, reject) => server.listen(0, '127.0.0.1', resolve).once('error', reject));
  return { server, port: server.address().port };
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const probe = http.createServer();
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    }).once('error', reject);
  });
}

async function waitForDevtools(port, child) {
  const url = `http://127.0.0.1:${port}/json`;
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Chrome exited before DevTools was ready with code ${child.exitCode}`);
    try {
      const response = await fetch(url);
      if (response.ok) {
        const page = (await response.json()).find((row) => row.type === 'page');
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

async function removeProfileDirectory(profileDir, attempts = 20) {
  let failure = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      fs.rmSync(profileDir, { recursive: true, force: true, maxRetries: 2, retryDelay: 50 });
      return;
    } catch (error) {
      failure = error;
      if (!['ENOTEMPTY', 'EBUSY', 'EPERM'].includes(error?.code) || attempt === attempts - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, 100 + attempt * 25));
    }
  }
  if (failure) throw failure;
}

function percentile(values, fraction) {
  if (!values.length) return null;
  const sorted = values.slice().sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1);
  return sorted[Math.max(0, index)];
}

function round(value) {
  return value === null || value === undefined ? null : Number(Number(value).toFixed(3));
}

function partitionLongTasks(pageResult) {
  const marks = Object.fromEntries((pageResult.phaseMarks || []).map((row) => [row.name, row.atMs]));
  const loadStart = marks.model_load_start ?? null;
  const loadEnd = marks.model_load_end ?? null;
  let duringLoad = 0;
  let excludingLoad = 0;
  for (const task of pageResult.longTasks || []) {
    const inLoad = loadStart !== null && loadEnd !== null && task.startMs >= loadStart && task.startMs <= loadEnd;
    if (inLoad) duringLoad = Math.max(duringLoad, task.durationMs);
    else excludingLoad = Math.max(excludingLoad, task.durationMs);
  }
  return { maxLongTaskMsDuringLoad: round(duringLoad), maxLongTaskMsExcludingLoad: round(excludingLoad) };
}

function hybridViolations(pageResult) {
  const rows = pageResult.hybridResults || [];
  return {
    mustRefuseViolations: rows.filter((row) => row.outcome === 'resolve' && row.goldOutcome === 'refuse').length,
    wrongPlaceResolutions: rows.filter((row) =>
      row.outcome === 'resolve' && row.goldOutcome === 'resolve' && row.nodeId !== row.goldNodeId
    ).length,
  };
}

function evaluateHardBudgets(laneId, laneBudgets, measured, checks) {
  for (const [budgetId, budget] of Object.entries(laneBudgets || {})) {
    if (budget.mode !== 'hard') continue;
    const value = measured[budgetId];
    let pass;
    if ('equals' in budget) pass = value === budget.equals;
    else pass = typeof value === 'number' && value <= budget.max;
    checks.push({ lane: laneId, budget: budgetId, mode: 'hard', value: value ?? null, limit: budget.max ?? budget.equals, pass });
  }
}

async function runLane(client, config) {
  const network = { modelBytes: 0, dopplerBytes: 0, otherBytes: 0, requests: 0 };
  const onLoadingFinished = new Map();
  client.on('Network.responseReceived', (params) => {
    onLoadingFinished.set(params.requestId, params.response.url);
  });
  client.on('Network.loadingFinished', (params) => {
    const url = onLoadingFinished.get(params.requestId) || '';
    const bytes = Number(params.encodedDataLength || 0);
    network.requests += 1;
    if (url.includes('/__models/')) network.modelBytes += bytes;
    else if (url.includes('/vendor/doppler/')) network.dopplerBytes += bytes;
    else network.otherBytes += bytes;
  });
  const loaded = client.once('Page.loadEventFired');
  await client.send('Page.navigate', { url: config.pageUrl });
  await loaded;
  const evaluated = await client.send('Runtime.evaluate', {
    expression: `window.__SIMULATTE_BENCH__.runBench(${JSON.stringify(config.benchConfig)})`,
    awaitPromise: true,
    returnByValue: true,
    timeout: 600000,
  });
  if (evaluated.exceptionDetails) {
    throw new Error(evaluated.exceptionDetails.exception?.description || evaluated.exceptionDetails.text);
  }
  return { pageResult: evaluated.result.value, network };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const readJson = (file) => JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
  const budgets = readJson(FILES.budgets);
  const corpus = readJson(FILES.corpus);
  const modelLock = readJson(FILES.modelLock);

  const mounts = [
    { prefix: '/__bench/', dir: FIXTURES },
    { prefix: '/', dir: PUBLIC },
  ];
  let modelBaseUrl = options.modelBaseUrl;
  let localModelDir = null;
  if (!modelBaseUrl) {
    localModelDir = detectLocalModelDir(modelLock);
    if (localModelDir) {
      mounts.unshift({ prefix: '/__models/', dir: path.dirname(localModelDir) });
      modelBaseUrl = `/__models/${path.basename(localModelDir)}`;
    }
  }
  const hybridRequested = options.lanes.includes('hybrid_optin');
  const hybridAvailable = Boolean(modelBaseUrl);

  const staticHost = await createServer(mounts);
  const devtoolsPort = await freePort();
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'simulatte-resolution-perf-'));
  const chrome = spawn(findChrome(options.chromePath), [
    '--headless=new',
    '--enable-unsafe-webgpu',
    '--disable-background-networking',
    '--no-first-run',
    '--no-default-browser-check',
    `--user-data-dir=${profileDir}`,
    `--remote-debugging-port=${devtoolsPort}`,
    '--window-size=1440,1000',
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  const lanes = {};
  const checks = [];
  const skipped = [];
  let client = null;
  try {
    const page = await waitForDevtools(devtoolsPort, chrome);
    client = new CdpClient(page.webSocketDebuggerUrl);
    await client.connect();
    await Promise.all([
      client.send('Runtime.enable'),
      client.send('Page.enable'),
      client.send('Network.enable'),
    ]);
    const base = `http://127.0.0.1:${staticHost.port}`;
    const pageUrl = `${base}/__bench/resolution-bench.html`;
    const commonConfig = {
      probes: corpus.probes,
      worldPath: `/${FILES.world.replace('public/', '')}`,
      embodimentPath: `/${FILES.embodiment.replace('public/', '')}`,
      embeddingIndexPath: `/${FILES.embeddingIndex.replace('public/', '')}`,
      modelLockPath: `/${FILES.modelLock.replace('public/', '')}`,
      repetitions: options.repetitions,
    };

    if (options.lanes.includes('default_lexical')) {
      const { pageResult, network } = await runLane(client, {
        pageUrl,
        benchConfig: { ...commonConfig, lane: 'default_lexical' },
      });
      const longTasks = partitionLongTasks(pageResult);
      const measured = {
        modelDownloadBytes: network.modelBytes,
        modelExecutions: pageResult.resolverStats?.tiers?.embedding?.queryCount || 0,
        endToEndP50Ms: round(percentile(pageResult.compileMs, 0.5)),
        endToEndP95Ms: round(percentile(pageResult.compileMs, 0.95)),
        maxLongTaskMs: longTasks.maxLongTaskMsExcludingLoad,
      };
      lanes.default_lexical = { measured, network, unresolvedCount: pageResult.unresolvedCount, memory: pageResult.memory };
      evaluateHardBudgets('default_lexical', budgets.lanes.default_lexical.budgets, measured, checks);
    }

    if (hybridRequested && hybridAvailable) {
      const cold = await runLane(client, {
        pageUrl,
        benchConfig: { ...commonConfig, lane: 'hybrid_optin', modelBaseUrl },
      });
      const warm = await runLane(client, {
        pageUrl,
        benchConfig: { ...commonConfig, lane: 'hybrid_optin', modelBaseUrl, repetitions: 1 },
      });
      const stats = cold.pageResult.resolverStats || {};
      const longTasks = partitionLongTasks(cold.pageResult);
      const violations = hybridViolations(cold.pageResult);
      const measured = {
        modelExecutionsOnDeterministicHits: stats.deterministicHitModelExecutions ?? null,
        mustRefuseViolations: violations.mustRefuseViolations,
        wrongPlaceResolutions: violations.wrongPlaceResolutions,
        embeddingExecutedObserved: stats.embeddingExecuted === true,
        modelDownloadBytes: cold.network.modelBytes,
        coldModelLoadMs: round(stats.loadDurationsMs?.[0] ?? null),
        warmModelLoadMs: round(warm.pageResult.resolverStats?.loadDurationsMs?.[0] ?? null),
        tierTypoP95Ms: round(stats.tiers?.extendedTypo?.maxMs ?? null),
        tierEmbeddingP95Ms: round(stats.tiers?.embedding?.maxMs ?? null),
        endToEndP50Ms: round(percentile(cold.pageResult.compileMs, 0.5)),
        endToEndP95Ms: round(percentile(cold.pageResult.compileMs, 0.95)),
        maxLongTaskMsExcludingLoad: longTasks.maxLongTaskMsExcludingLoad,
        maxLongTaskMsDuringLoad: longTasks.maxLongTaskMsDuringLoad,
        peakJsHeapBytes: cold.pageResult.memory?.usedJsHeapBytes ?? null,
      };
      lanes.hybrid_optin = {
        measured,
        cascade: {
          lexicalResolved: corpus.probes.length - cold.pageResult.unresolvedCount,
          extendedTypoResolved: stats.tiers?.extendedTypo?.resolved ?? 0,
          embeddingResolved: stats.tiers?.embedding?.resolved ?? 0,
          embeddingRefused: stats.tiers?.embedding?.refused ?? 0,
        },
        coldNetwork: cold.network,
        warmNetwork: warm.network,
        readiness: cold.pageResult.resolverReadiness,
      };
      evaluateHardBudgets('hybrid_optin', budgets.lanes.hybrid_optin.budgets, measured, checks);
    } else if (hybridRequested) {
      skipped.push({ lane: 'hybrid_optin', reason: 'no local model source: pass --model-base-url or provide the sibling doppler artifact' });
    }
  } finally {
    client?.close();
    await stopChild(chrome);
    await new Promise((resolve) => staticHost.server.close(resolve));
    await removeProfileDirectory(profileDir);
  }

  const accepted = checks.every((row) => row.pass) && checks.length > 0;
  const hashFile = (file) => crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, file))).digest('hex');
  const receipt = {
    schema: 'simulatte.resolutionPerformanceEvaluation.v1',
    id: 'resolution-performance-v1',
    measuredAt: new Date().toISOString(),
    population: { id: corpus.id, probeCount: corpus.probes.length, repetitions: options.repetitions },
    budgets: { id: budgets.id, sha256: hashFile(FILES.budgets) },
    identities: Object.fromEntries(Object.entries(FILES).map(([key, file]) => [key, { path: file, sha256: hashFile(file) }])),
    modelSource: modelBaseUrl ? (localModelDir ? 'sibling_doppler_local' : 'explicit_base_url') : 'unavailable',
    lanes,
    skippedLanes: skipped,
    hardChecks: checks,
    accepted,
    claimBoundary: 'Performance numbers are evidence snapshots for this host and build; only hard-mode budget checks gate. Recorded metrics inform future budget promotion and carry no pass or fail meaning here.',
  };
  if (!options.check) {
    fs.mkdirSync(path.dirname(options.out), { recursive: true });
    fs.writeFileSync(options.out, `${JSON.stringify(receipt, null, 2)}\n`);
  }
  console.log(`PLACE-PERF accepted=${accepted} checks=${checks.filter((row) => row.pass).length}/${checks.length} lanes=${Object.keys(lanes).join('+') || 'none'} skipped=${skipped.length} mode=${options.check ? 'check' : 'write'} output=${options.check ? '(not written)' : path.relative(ROOT, options.out)}`);
  for (const row of checks.filter((check) => !check.pass)) {
    console.error(`PLACE-PERF-FAIL lane=${row.lane} budget=${row.budget} value=${row.value} limit=${row.limit}`);
  }
  if (!accepted) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error && error.stack || error);
    process.exit(1);
  });
}

export { evaluateHardBudgets, hybridViolations, parseByteRange, partitionLongTasks, percentile, removeProfileDirectory, stopChild };
