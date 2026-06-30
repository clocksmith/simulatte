#!/usr/bin/env node
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const DEFAULT_OUT_DIR = path.join(ROOT, 'artifacts', 'simulatte-intent-scene-audit');
const CHROME_CANDIDATES = [
  process.env.CHROME_BIN,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  'google-chrome',
  'chromium',
  'chromium-browser',
].filter(Boolean);

const CURATED_PROMPTS = Object.freeze([
  'particle collider muon tracks collision plume through a detector slice with field lines and calorimeter heat',
  'mangrove roots buffering storm surge while sediment settles in brackish tidal channels',
  'gut microbiome colonies exchanging metabolites through intestinal folds under immune sampling',
  'railway dispatch conflict resolution across signal blocks with delayed train agents and platform slots',
  'edge data center server racks recirculating heat between cooling aisles under controller limits',
  'city zoning shadow allocation between building masses with sunlight volumes and pedestrian comfort',
  'planetary rings shepherd moon resonance sorting ice boulders into density waves and orbital gaps',
  'sourdough fermentation gas bubbles growing through a dough matrix with gluten strands and acidity gradients',
]);

const BROAD_COVERAGE_PROMPTS = Object.freeze([
  'supercell thunderstorm grows hail under wind shear',
  'glacier calving into fjord with sea ice waves',
  'microgrid battery inverter stabilizes transformer overload',
  'warehouse robot arms sort parcels on conveyor belts',
  'injection molding line cools plastic through steel tooling',
  'qubit chip phase readout through microwave resonator',
  'compost heat oxygen water loop feeds greenhouse crops',
  'skateboard rider pumps a curved bowl with friction loss',
  'microfluidic droplets split at a glass channel junction',
  'bridge resonance under wind vortex shedding',
  'coral reef bleaching under warm acidic water',
  'forest fire jumps a road under wind shear',
]);

const GRAM_TOKENS = Object.freeze([
  'aurora', 'aquifer', 'auction', 'basalt', 'biofilm', 'bridge', 'carbon', 'cellular', 'chiplet', 'chloroplast',
  'cochlea', 'comet', 'compiler', 'coral', 'court', 'cryogenic', 'delta', 'detector', 'docking', 'drought',
  'eddy', 'enzyme', 'evacuation', 'exoplanet', 'fiber', 'forge', 'fracture', 'fungal', 'glacier', 'graphene',
  'groundwater', 'haptic', 'hydrogen', 'immune', 'insulin', 'jetstream', 'kelp', 'lattice', 'legal', 'liver',
  'magnetosphere', 'mangrove', 'memory', 'microfluidic', 'misinformation', 'molecule', 'neutrino', 'neuron', 'ocean',
  'orbital', 'pancreas', 'phloem', 'plankton', 'plasma', 'policy', 'porous', 'public-health', 'quantum', 'railway',
  'reaction', 'regolith', 'resonance', 'ribosome', 'seafloor', 'semiconductor', 'server', 'shadow', 'shipping', 'silk',
  'solar', 'sourdough', 'stormwater', 'submarine', 'synapse', 'termite', 'thermal', 'triage', 'turbine', 'urban',
  'vascular', 'vortex', 'wafer', 'warehouse', 'wildfire', 'zoning', 'attenuation', 'cascade', 'compression', 'diffusion',
  'entrainment', 'feedback', 'filtration', 'growth', 'ionization', 'oscillation', 'routing', 'shear', 'transduction', 'upwelling',
]);

const MIME = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.png': 'image/png',
  '.wasm': 'application/wasm',
});

function parseArgs(argv) {
  const options = {
    curated: CURATED_PROMPTS.length,
    broad: 0,
    prompts: [],
    four: 10,
    eighty: 2,
    seed: 29062026,
    outDir: DEFAULT_OUT_DIR,
    width: 1440,
    height: 1040,
    timeoutMs: 10000,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const [key, inline] = arg.split('=');
    const readValue = () => inline ?? argv[++i];
    if (key === '--curated') options.curated = Math.max(0, Number(readValue() || 0));
    else if (key === '--broad') options.broad = Math.max(0, Number(readValue() || 0));
    else if (key === '--prompt') options.prompts.push(String(readValue() || '').trim());
    else if (key === '--four') options.four = Math.max(0, Number(readValue() || 0));
    else if (key === '--eighty') options.eighty = Math.max(0, Number(readValue() || 0));
    else if (key === '--seed') options.seed = Number(readValue() || options.seed);
    else if (key === '--out') options.outDir = path.resolve(readValue() || options.outDir);
    else if (key === '--width') options.width = Math.max(640, Number(readValue() || options.width));
    else if (key === '--height') options.height = Math.max(480, Number(readValue() || options.height));
    else if (key === '--timeout-ms') options.timeoutMs = Math.max(1000, Number(readValue() || options.timeoutMs));
    else if (key === '--help') {
      console.log('usage: node tools/audit-intent-scene-screenshots.mjs [--curated N] [--broad N] [--prompt TEXT] [--four N] [--eighty N] [--seed N] [--out DIR]');
      process.exit(0);
    }
  }
  return options;
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function buildAuditPrompts(options) {
  const rng = mulberry32(options.seed);
  const prompts = [];
  for (const prompt of CURATED_PROMPTS.slice(0, options.curated)) {
    prompts.push({ kind: 'curated', prompt });
  }
  for (const prompt of BROAD_COVERAGE_PROMPTS.slice(0, options.broad)) {
    prompts.push({ kind: 'broad', prompt });
  }
  for (const prompt of options.prompts.filter(Boolean)) {
    prompts.push({ kind: 'custom', prompt });
  }
  for (let i = 0; i < options.four; i += 1) {
    prompts.push({ kind: 'random-4gram', prompt: randomGram(4, rng) });
  }
  for (let i = 0; i < options.eighty; i += 1) {
    prompts.push({ kind: 'random-80gram', prompt: randomGram(80, rng) });
  }
  return prompts;
}

function randomGram(count, rng) {
  const words = [];
  let previous = '';
  for (let i = 0; i < count; i += 1) {
    let word = previous;
    while (word === previous) word = GRAM_TOKENS[Math.floor(rng() * GRAM_TOKENS.length) % GRAM_TOKENS.length];
    words.push(word);
    previous = word;
  }
  return words.join(' ');
}

function sha256Hex(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function pngVisualStats(bytes) {
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes || []);
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (buffer.length < signature.length || !buffer.subarray(0, signature.length).equals(signature)) {
    return null;
  }
  let offset = signature.length;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat = [];
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString('ascii');
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > buffer.length) break;
    const data = buffer.subarray(dataStart, dataEnd);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset = dataEnd + 4;
  }
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
  if (!width || !height || bitDepth !== 8 || !channels || !idat.length) return null;
  const inflated = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = Buffer.alloc(stride * height);
  let inputOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[inputOffset++];
    const row = pixels.subarray(y * stride, (y + 1) * stride);
    const previous = y > 0 ? pixels.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x += 1) {
      const raw = inflated[inputOffset++];
      const left = x >= channels ? row[x - channels] : 0;
      const up = previous ? previous[x] : 0;
      const upLeft = previous && x >= channels ? previous[x - channels] : 0;
      let value = raw;
      if (filter === 1) value = raw + left;
      else if (filter === 2) value = raw + up;
      else if (filter === 3) value = raw + Math.floor((left + up) / 2);
      else if (filter === 4) value = raw + paeth(left, up, upLeft);
      row[x] = value & 255;
    }
  }
  let hash = 2166136261;
  let samples = 0;
  let sum = 0;
  let sumSq = 0;
  let colored = 0;
  const yStep = Math.max(1, Math.floor(height / 72));
  const xStep = Math.max(1, Math.floor(width / 96));
  for (let y = 0; y < height; y += yStep) {
    for (let x = 0; x < width; x += xStep) {
      const pixel = (y * width + x) * channels;
      const r = pixels[pixel];
      const g = pixels[pixel + 1];
      const b = pixels[pixel + 2];
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      sum += luma;
      sumSq += luma * luma;
      if (Math.max(r, g, b) - Math.min(r, g, b) > 16) colored += 1;
      hash ^= r + (g << 8) + (b << 16) + samples;
      hash = Math.imul(hash, 16777619) >>> 0;
      samples += 1;
    }
  }
  const mean = samples ? sum / samples : 0;
  const variance = samples ? Math.max(0, sumSq / samples - mean * mean) : 0;
  return {
    width,
    height,
    sampleCount: samples,
    lumaMean: Number(mean.toFixed(3)),
    lumaStd: Number(Math.sqrt(variance).toFixed(3)),
    coloredRatio: samples ? Number((colored / samples).toFixed(4)) : 0,
    hash: (hash >>> 0).toString(16).padStart(8, '0'),
  };
}

function paeth(left, up, upLeft) {
  const p = left + up - upLeft;
  const pa = Math.abs(p - left);
  const pb = Math.abs(p - up);
  const pc = Math.abs(p - upLeft);
  if (pa <= pb && pa <= pc) return left;
  if (pb <= pc) return up;
  return upLeft;
}

function slug(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'intent';
}

async function existsExecutable(candidate) {
  if (candidate.includes('/')) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch (_err) {
      return null;
    }
  }
  const paths = String(process.env.PATH || '').split(path.delimiter);
  for (const dir of paths) {
    const full = path.join(dir, candidate);
    try {
      await fs.access(full);
      return full;
    } catch (_err) {}
  }
  return null;
}

async function resolveChrome() {
  for (const candidate of CHROME_CANDIDATES) {
    const executable = await existsExecutable(candidate);
    if (executable) return executable;
  }
  throw new Error('No Chrome-compatible executable found. Set CHROME_BIN to enable screenshot auditing.');
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
    server.on('error', reject);
  });
}

function startStaticServer() {
  const server = createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    const requested = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const fullPath = path.resolve(PUBLIC_DIR, `.${requested}`);
    if (!fullPath.startsWith(PUBLIC_DIR)) {
      res.writeHead(403);
      res.end('forbidden');
      return;
    }
    fs.stat(fullPath).then((stat) => {
      if (!stat.isFile()) {
        res.writeHead(404);
        res.end('not found');
        return;
      }
      res.writeHead(200, { 'content-type': MIME[path.extname(fullPath)] || 'application/octet-stream' });
      createReadStream(fullPath).pipe(res);
    }).catch(() => {
      res.writeHead(404);
      res.end('not found');
    });
  });
  return new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
    server.on('error', reject);
  });
}

class CdpClient {
  constructor(url) {
    if (typeof WebSocket !== 'function') {
      throw new Error('Node WebSocket is unavailable; use Node 22 or newer for screenshot auditing.');
    }
    this.nextId = 1;
    this.pending = new Map();
    this.eventWaiters = new Map();
    this.ws = new WebSocket(url);
    this.ready = new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve, { once: true });
      this.ws.addEventListener('error', reject, { once: true });
    });
    this.ws.addEventListener('message', (event) => this.handleMessage(event.data));
  }

  handleMessage(raw) {
    const message = JSON.parse(String(raw));
    if (message.id && this.pending.has(message.id)) {
      const { resolve, reject } = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) reject(new Error(`${message.error.message || 'CDP error'} ${JSON.stringify(message.error.data || '')}`));
      else resolve(message.result || {});
      return;
    }
    if (message.method && this.eventWaiters.has(message.method)) {
      const waiters = this.eventWaiters.get(message.method);
      this.eventWaiters.delete(message.method);
      for (const resolve of waiters) resolve(message.params || {});
    }
  }

  async send(method, params = {}) {
    await this.ready;
    const id = this.nextId++;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (!this.pending.has(id)) return;
        this.pending.delete(id);
        reject(new Error(`CDP command timed out: ${method}`));
      }, 60000).unref?.();
    });
  }

  waitForEvent(method) {
    return new Promise((resolve) => {
      const waiters = this.eventWaiters.get(method) || [];
      waiters.push(resolve);
      this.eventWaiters.set(method, waiters);
    });
  }

  close() {
    this.ws.close();
  }
}

async function waitForJson(url, timeoutMs = 10000) {
  const started = Date.now();
  let lastError = null;
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
      lastError = new Error(`${url} returned ${response.status}`);
    } catch (err) {
      lastError = err;
    }
    await delay(120);
  }
  throw lastError || new Error(`Timed out waiting for ${url}`);
}

async function connectToPage(debugPort) {
  const version = await waitForJson(`http://127.0.0.1:${debugPort}/json/version`);
  if (!version.Browser) throw new Error('Chrome DevTools endpoint did not expose a browser version');
  const targets = await waitForJson(`http://127.0.0.1:${debugPort}/json/list`);
  const page = targets.find((target) => target.type === 'page' && target.webSocketDebuggerUrl) || targets.find((target) => target.webSocketDebuggerUrl);
  if (!page) throw new Error('No Chrome page target found for screenshot audit');
  return new CdpClient(page.webSocketDebuggerUrl);
}

async function evaluate(cdp, expression, options = {}) {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise: options.awaitPromise === true,
    returnByValue: true,
    userGesture: true,
  });
  if (result.exceptionDetails) {
    throw new Error(`Runtime evaluation failed: ${JSON.stringify(result.exceptionDetails)}`);
  }
  return result.result ? result.result.value : undefined;
}

async function waitForCondition(label, fn, timeoutMs) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeoutMs) {
    last = await fn().catch((err) => ({ error: err.message }));
    if (last && last.ok) return last;
    await delay(120);
  }
  throw new Error(`Timed out waiting for ${label}: ${JSON.stringify(last)}`);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function forceLocalIntentScript() {
  return `
(() => {
  let storedEmbedder = null;
  Object.defineProperty(window, 'SimulatteIntentEmbedder', {
    configurable: true,
    get() { return storedEmbedder; },
    set(value) {
      if (value && typeof value === 'object') {
        value.create = () => null;
      }
      storedEmbedder = value;
    },
  });
})();`;
}

async function setupPage(cdp, url, width, height, timeoutMs) {
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: forceLocalIntentScript() });
  const loaded = cdp.waitForEvent('Page.loadEventFired');
  await cdp.send('Page.navigate', { url });
  await loaded;
  await waitForCondition('Simulatte UI ready', () => evaluate(cdp, `(() => ({
    ok: document.readyState === 'complete' && !!document.getElementById('build-prompt') && !!document.getElementById('physics-canvas')
  }))()`), timeoutMs);
  await delay(300);
}

async function runPrompt(cdp, entry, index, outDir, timeoutMs) {
  const prompt = entry.prompt;
  const label = `${String(index + 1).padStart(2, '0')}-${entry.kind}-${slug(prompt)}`;
  await evaluate(cdp, `(() => {
    const input = document.getElementById('build-prompt');
    const run = document.getElementById('build-lab');
    if (!input || !run) return { ok: false, reason: 'missing prompt controls' };
    input.value = ${JSON.stringify(prompt)};
    input.dispatchEvent(new Event('input', { bubbles: true }));
    run.click();
    return { ok: true };
  })()`);
  await waitForCondition(`intent ready for ${label}`, () => evaluate(cdp, `(() => {
    const node = document.getElementById('intent-runtime');
    const run = document.getElementById('build-lab');
    return { ok: !!node && node.dataset.state === 'ready' && (!run || run.disabled === false), state: node && node.dataset.state, disabled: run && run.disabled };
  })()`), timeoutMs);
  await delay(700);
  const diagnostics = await evaluate(cdp, `(() => {
    const canvas = document.getElementById('physics-canvas');
    const fieldCanvas = document.getElementById('field-canvas');
    const runtime = document.getElementById('intent-runtime');
    const message = document.getElementById('intent-runtime-message');
    const preview = document.getElementById('spec-preview');
    const ctx = canvas && canvas.getContext('2d', { willReadFrequently: true });
    const width = canvas ? canvas.width : 0;
    const height = canvas ? canvas.height : 0;
    let hash = 2166136261;
    let samples = 0;
    let sum = 0;
    let sumSq = 0;
    let colored = 0;
    if (ctx && width && height) {
      const data = ctx.getImageData(0, 0, width, height).data;
      const yStep = Math.max(1, Math.floor(height / 72));
      const xStep = Math.max(1, Math.floor(width / 96));
      for (let y = 0; y < height; y += yStep) {
        for (let x = 0; x < width; x += xStep) {
          const offset = (y * width + x) * 4;
          const r = data[offset];
          const g = data[offset + 1];
          const b = data[offset + 2];
          const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          sum += luma;
          sumSq += luma * luma;
          if (Math.max(r, g, b) - Math.min(r, g, b) > 16) colored += 1;
          hash ^= r + (g << 8) + (b << 16) + samples;
          hash = Math.imul(hash, 16777619) >>> 0;
          samples += 1;
        }
      }
    }
    const mean = samples ? sum / samples : 0;
    const variance = samples ? Math.max(0, sumSq / samples - mean * mean) : 0;
    let parsed = null;
    let modelSpec = null;
    const previewText = preview ? preview.textContent || '' : '';
    try { parsed = JSON.parse(previewText); } catch (_err) {}
    try {
      if (window.SimulattePhysicsModel && typeof window.SimulattePhysicsModel.createSpecFromPrompt === 'function') {
        modelSpec = window.SimulattePhysicsModel.createSpecFromPrompt(${JSON.stringify(prompt)}, { allowPrototypeFallback: true });
      }
    } catch (_err) {}
    const previewProgram = parsed && parsed.renderProgram || null;
    const modelProgram = modelSpec && modelSpec.renderProgram || null;
    const program = previewProgram || modelProgram || null;
    const rendererPlan = program && program.rendererPlan || null;
    const visualIR = program && program.visualIR || null;
    const specForIntent = modelSpec || parsed || null;
    const intentBrief = specForIntent && specForIntent.intent && specForIntent.intent.intentBrief || null;
    const physicalReceipt = specForIntent && specForIntent.physicalSpec && specForIntent.physicalSpec.receipt || {};
    const visualIRArrayCount = (key) => (
      visualIR && Array.isArray(visualIR[key]) ? visualIR[key].length : 0
    );
    const intentBriefArrayCount = (key) => (
      intentBrief && Array.isArray(intentBrief[key]) ? intentBrief[key].length : 0
    );
    return {
      runtimeState: runtime ? runtime.dataset.state || '' : '',
      runtimeMessage: message ? message.textContent || '' : '',
      canvasWidth: width,
      canvasHeight: height,
      physicsCanvasRenderer: canvas && canvas.dataset ? canvas.dataset.renderer || '' : '',
      physicsCanvasRendererStatus: canvas && canvas.dataset ? canvas.dataset.rendererStatus || '' : '',
      physicsCanvasSceneKind: canvas && canvas.dataset ? canvas.dataset.sceneKind || '' : '',
      physicsCanvasSceneId: canvas && canvas.dataset ? canvas.dataset.sceneId || '' : '',
      physicsCanvasRenderCount: canvas && canvas.dataset ? canvas.dataset.renderCount || '' : '',
      physicsCanvasLastFrameMs: canvas && canvas.dataset ? canvas.dataset.lastFrameMs || '' : '',
      fieldCanvasRenderer: fieldCanvas && fieldCanvas.dataset ? fieldCanvas.dataset.renderer || '' : '',
      fieldCanvasRendererStatus: fieldCanvas && fieldCanvas.dataset ? fieldCanvas.dataset.rendererStatus || '' : '',
      canvasRect: canvas ? (() => {
        const rect = canvas.getBoundingClientRect();
        return {
          x: Number(rect.x.toFixed(2)),
          y: Number(rect.y.toFixed(2)),
          width: Number(rect.width.toFixed(2)),
          height: Number(rect.height.toFixed(2)),
        };
      })() : null,
      sampleCount: samples,
      sampleSource: samples ? 'canvas-2d' : 'none',
      lumaMean: Number(mean.toFixed(3)),
      lumaStd: Number(Math.sqrt(variance).toFixed(3)),
      coloredRatio: samples ? Number((colored / samples).toFixed(4)) : 0,
      canvasHash: (hash >>> 0).toString(16).padStart(8, '0'),
      specId: parsed && parsed.id || modelSpec && modelSpec.id || '',
      templateId: parsed && parsed.templateId || modelSpec && modelSpec.templateId || '',
      rendererSceneKind: rendererPlan && rendererPlan.sceneKind || '',
      visualIRSceneKind: visualIR && visualIR.sceneKind || '',
      visualIRCamera: visualIR && visualIR.camera && visualIR.camera.mode || '',
      visualIREntityCount: visualIRArrayCount('entities'),
      visualIRMaterialCount: visualIRArrayCount('materials'),
      visualIRFieldCount: visualIRArrayCount('fields'),
      visualIRProcessCount: visualIRArrayCount('processes'),
      visualIROperatorCount: visualIRArrayCount('operators'),
      visualIRReceiptCount: visualIRArrayCount('receipts'),
      visualIRCausalAffordanceCount: visualIRArrayCount('causalAffordances'),
      intentBriefSchema: intentBrief && intentBrief.schema || '',
      intentBriefEvidenceCount: intentBriefArrayCount('retrievedEvidence'),
      intentBriefCausalEdgeCount: intentBriefArrayCount('causalGraph'),
      intentBriefAssumptionCount: intentBriefArrayCount('assumptions'),
      intentBriefUnsupportedCount: intentBriefArrayCount('unsupported'),
      intentBriefDegradedCount: intentBriefArrayCount('degradedTo'),
      physicalReceiptIntentEvidenceCount: physicalReceipt.intentEvidenceCount || 0,
      physicalReceiptCausalEdgeCount: physicalReceipt.causalEdgeCount || 0,
      physicalReceiptCausalAffordanceCount: physicalReceipt.causalAffordanceCount || 0,
      physicalReceiptAssumptionCount: physicalReceipt.assumptionCount || 0,
      physicalReceiptUnsupportedCount: physicalReceipt.unsupportedCount || 0,
      physicalReceiptDegradedCount: physicalReceipt.degradedCount || 0,
      intentBriefAffordanceCount: intentBrief &&
        intentBrief.visualIntent &&
        Array.isArray(intentBrief.visualIntent.affordances)
        ? intentBrief.visualIntent.affordances.length
        : 0,
      previewLength: previewText.length,
    };
  })()`);
  const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false, fromSurface: true });
  const file = `${label}.png`;
  const bytes = Buffer.from(screenshot.data, 'base64');
  await fs.writeFile(path.join(outDir, file), bytes);
  let canvasScreenshot = '';
  let canvasStats = null;
  if (diagnostics.canvasRect && diagnostics.canvasRect.width > 0 && diagnostics.canvasRect.height > 0) {
    try {
      const clip = {
        x: Math.max(0, diagnostics.canvasRect.x),
        y: Math.max(0, diagnostics.canvasRect.y),
        width: Math.max(1, diagnostics.canvasRect.width),
        height: Math.max(1, diagnostics.canvasRect.height),
        scale: 1,
      };
      const clipped = await cdp.send('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: false,
        fromSurface: true,
        clip,
      });
      const clipBytes = Buffer.from(clipped.data, 'base64');
      canvasScreenshot = `${label}.canvas.png`;
      await fs.writeFile(path.join(outDir, canvasScreenshot), clipBytes);
      canvasStats = pngVisualStats(clipBytes);
    } catch (_err) {
      canvasStats = null;
    }
  }
  const finalDiagnostics = { ...diagnostics };
  if (!finalDiagnostics.sampleCount && canvasStats && canvasStats.sampleCount) {
    finalDiagnostics.sampleSource = 'canvas-screenshot';
    finalDiagnostics.sampleCount = canvasStats.sampleCount;
    finalDiagnostics.lumaMean = canvasStats.lumaMean;
    finalDiagnostics.lumaStd = canvasStats.lumaStd;
    finalDiagnostics.coloredRatio = canvasStats.coloredRatio;
    finalDiagnostics.canvasHash = canvasStats.hash;
  }
  finalDiagnostics.readableCanvasSampleCount = diagnostics.sampleCount;
  finalDiagnostics.canvasScreenshot = canvasScreenshot;
  finalDiagnostics.canvasScreenshotHash = canvasScreenshot ? sha256Hex(await fs.readFile(path.join(outDir, canvasScreenshot))) : '';
  if (canvasStats) {
    finalDiagnostics.canvasScreenshotWidth = canvasStats.width;
    finalDiagnostics.canvasScreenshotHeight = canvasStats.height;
    finalDiagnostics.canvasScreenshotLumaStd = canvasStats.lumaStd;
    finalDiagnostics.canvasScreenshotColoredRatio = canvasStats.coloredRatio;
    finalDiagnostics.canvasScreenshotSampleCount = canvasStats.sampleCount;
  }
  return {
    index: index + 1,
    kind: entry.kind,
    prompt,
    screenshot: file,
    screenshotHash: sha256Hex(bytes),
    ...finalDiagnostics,
  };
}

function analyze(results) {
  const failures = [];
  const screenshotHashes = new Map();
  for (const result of results) {
    if (result.runtimeState !== 'ready') failures.push(`${result.index}: runtime not ready`);
    if (!result.canvasWidth || !result.canvasHeight) failures.push(`${result.index}: missing canvas`);
    if (result.lumaStd < 8) failures.push(`${result.index}: low visual contrast std=${result.lumaStd}`);
    if (result.coloredRatio < 0.035) failures.push(`${result.index}: low color diversity ratio=${result.coloredRatio}`);
    if (result.visualIROperatorCount < 5) failures.push(`${result.index}: VisualIR has too few operators`);
    if (result.visualIREntityCount < 2) failures.push(`${result.index}: VisualIR has too few entities`);
    if (result.visualIRProcessCount < 2) failures.push(`${result.index}: VisualIR has too few processes`);
    if (result.visualIRReceiptCount < 4) failures.push(`${result.index}: VisualIR has too few receipts`);
    if (result.kind === 'curated' && result.intentBriefSchema !== 'simulatte.intentBrief.v1') {
      failures.push(`${result.index}: curated prompt missing intent brief`);
    }
    if (result.kind === 'curated' && result.intentBriefEvidenceCount < 1) {
      failures.push(`${result.index}: curated prompt has no retrieved intent evidence`);
    }
    const needsCausalGraph = promptNeedsCausalGraph(result.prompt);
    if (result.kind === 'curated' && needsCausalGraph && result.intentBriefCausalEdgeCount < 1) {
      failures.push(`${result.index}: curated prompt has no causal intent edges`);
    }
    if (result.kind === 'curated' && needsCausalGraph && result.visualIRCausalAffordanceCount < 1) {
      failures.push(`${result.index}: curated VisualIR has no causal affordances`);
    }
    if (result.kind === 'curated' && /^(generic|literal-composite)$/.test(result.rendererSceneKind)) {
      failures.push(`${result.index}: curated prompt fell into ${result.rendererSceneKind}`);
    }
    if (result.kind === 'curated' && /^(generic|literal-composite)$/.test(result.visualIRSceneKind)) {
      failures.push(`${result.index}: curated VisualIR fell into ${result.visualIRSceneKind}`);
    }
    if (result.kind === 'broad' && /^(generic|literal-composite)$/.test(result.rendererSceneKind)) {
      failures.push(`${result.index}: broad prompt fell into ${result.rendererSceneKind}`);
    }
    if (result.kind === 'broad' && /^(generic|literal-composite)$/.test(result.visualIRSceneKind)) {
      failures.push(`${result.index}: broad VisualIR fell into ${result.visualIRSceneKind}`);
    }
    const duplicate = screenshotHashes.get(result.screenshotHash);
    if (duplicate) failures.push(`${result.index}: duplicate screenshot hash with ${duplicate}`);
    screenshotHashes.set(result.screenshotHash, result.index);
  }
  const broadResults = results.filter((result) => result.kind === 'broad');
  const broadSceneCount = new Set(broadResults.map((result) => result.rendererSceneKind).filter(Boolean)).size;
  if (broadResults.length >= 4 && broadSceneCount < Math.min(8, broadResults.length)) {
    failures.push(`broad prompts collapsed into ${broadSceneCount} scene kinds`);
  }
  return {
    ok: failures.length === 0,
    failures,
    screenshotCount: results.length,
    uniqueCanvasHashes: new Set(results.map((result) => result.canvasHash)).size,
    uniqueScreenshotHashes: new Set(results.map((result) => result.screenshotHash)).size,
    sceneKinds: [...new Set(results.map((result) => result.rendererSceneKind).filter(Boolean))].sort(),
    visualIRSceneKinds: [...new Set(results.map((result) => result.visualIRSceneKind).filter(Boolean))].sort(),
    visualIRCameras: [...new Set(results.map((result) => result.visualIRCamera).filter(Boolean))].sort(),
    intentBriefs: {
      totalEvidence: results.reduce((sum, result) => sum + (result.intentBriefEvidenceCount || 0), 0),
      totalCausalEdges: results.reduce((sum, result) => sum + (result.intentBriefCausalEdgeCount || 0), 0),
      totalAffordances: results.reduce((sum, result) => sum + (result.intentBriefAffordanceCount || 0), 0),
      totalDegraded: results.reduce((sum, result) => sum + (result.intentBriefDegradedCount || 0), 0),
    },
    physicalReceipts: {
      totalIntentEvidence: results.reduce((sum, result) => sum + (result.physicalReceiptIntentEvidenceCount || 0), 0),
      totalCausalEdges: results.reduce((sum, result) => sum + (result.physicalReceiptCausalEdgeCount || 0), 0),
      totalCausalAffordances: results.reduce((sum, result) => sum + (result.physicalReceiptCausalAffordanceCount || 0), 0),
      totalAssumptions: results.reduce((sum, result) => sum + (result.physicalReceiptAssumptionCount || 0), 0),
      totalUnsupported: results.reduce((sum, result) => sum + (result.physicalReceiptUnsupportedCount || 0), 0),
      totalDegraded: results.reduce((sum, result) => sum + (result.physicalReceiptDegradedCount || 0), 0),
    },
    causalRequirements: {
      promptCount: results.filter((result) => promptNeedsCausalGraph(result.prompt)).length,
      promptsMissingAffordances: results
        .filter((result) => promptNeedsCausalGraph(result.prompt) && result.visualIRCausalAffordanceCount < 1)
        .map((result) => result.index),
    },
    templateIds: [...new Set(results.map((result) => result.templateId).filter(Boolean))].sort(),
  };
}

function promptNeedsCausalGraph(prompt) {
  return /\b(heat|heats|cool|cools|melt|melts|freeze|freezes|drive|drives|push|pushes|pull|pulls|erode|erodes|collide|collides|impact|fracture|diffuse|diffuses|flow|flows|orbit|orbits|feedback|load|loads|pressure|wave|waves|burn|burns|grow|grows|stabilize|stabilizes)\b/i
    .test(String(prompt || ''));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const chromePath = await resolveChrome();
  const prompts = buildAuditPrompts(options);
  if (!prompts.length) throw new Error('No audit prompts selected');
  await fs.rm(options.outDir, { recursive: true, force: true });
  await fs.mkdir(options.outDir, { recursive: true });
  const { server, port } = await startStaticServer();
  const debugPort = await freePort();
  const profileDir = await fs.mkdtemp(path.join(os.tmpdir(), 'simulatte-chrome-profile-'));
  const chrome = spawn(chromePath, [
    '--headless=new',
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-features=Translate,MediaRouter,OptimizationHints',
    `--window-size=${options.width},${options.height}`,
    'about:blank',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  let cdp = null;
  try {
    cdp = await connectToPage(debugPort);
    await setupPage(cdp, `http://127.0.0.1:${port}/index.html`, options.width, options.height, options.timeoutMs);
    const results = [];
    for (let i = 0; i < prompts.length; i += 1) {
      results.push(await runPrompt(cdp, prompts[i], i, options.outDir, options.timeoutMs));
      console.log(`${i + 1}/${prompts.length} ${prompts[i].kind} ${results[results.length - 1].canvasHash} ${results[results.length - 1].rendererSceneKind || 'scene'}`);
    }
    const summary = analyze(results);
    const report = {
      schema: 'simulatte.intentSceneScreenshotAudit.v1',
      createdAt: new Date().toISOString(),
      chromePath,
      url: `http://127.0.0.1:${port}/index.html`,
      promptCounts: {
        curated: prompts.filter((prompt) => prompt.kind === 'curated').length,
        broad: prompts.filter((prompt) => prompt.kind === 'broad').length,
        custom: prompts.filter((prompt) => prompt.kind === 'custom').length,
        random4gram: prompts.filter((prompt) => prompt.kind === 'random-4gram').length,
        random80gram: prompts.filter((prompt) => prompt.kind === 'random-80gram').length,
      },
      summary,
      results,
    };
    await fs.writeFile(path.join(options.outDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify({ outDir: options.outDir, ...summary }, null, 2));
    if (!summary.ok) process.exitCode = 1;
  } finally {
    if (cdp) cdp.close();
    chrome.kill('SIGTERM');
    server.close();
    await fs.rm(profileDir, { recursive: true, force: true }).catch(() => {});
  }
}

main().catch((err) => {
  console.error(err && err.stack || err);
  process.exit(1);
});
