#!/usr/bin/env node
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import { captureChildProcessOutput } from './audit-process-log.mjs';
import { auditPromptMatches, waitForCondition, withDeadline } from './audit-runtime-wait.mjs';
import { modelPreparationFailures } from './model-preparation-receipt.mjs';
import { renderedSignalEvidence } from './visual-rubric-evidence.mjs';
import {
  evaluateGoldVisualResults,
  loadGoldAdjudication,
  loadGoldSet,
} from './samer/gold-visual-evaluator.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const DEFAULT_OUT_DIR = path.join(ROOT, 'artifacts', 'simulatte-intent-scene-audit');
const MODEL_CONSENT_STORAGE_KEY = 'simulatte.neuralModels.consent.v1';
const MODEL_RUNTIME_LOCK = JSON.parse(await fs.readFile(path.join(PUBLIC_DIR, 'data/simulatte-embedder/model-runtime-lock.json'), 'utf8'));
const MODEL_CONSENT_GRANT = Object.freeze({
  schema: 'simulatte.neuralModelConsent.v1',
  enabled: true,
  bundleIdentity: [
    MODEL_RUNTIME_LOCK.id,
    MODEL_RUNTIME_LOCK.number,
    MODEL_RUNTIME_LOCK.doppler.package.version,
    MODEL_RUNTIME_LOCK.embedding.id,
    MODEL_RUNTIME_LOCK.embedding.manifestHash.hex,
    MODEL_RUNTIME_LOCK.reranker.model.id,
    MODEL_RUNTIME_LOCK.reranker.model.manifestHash.hex,
  ].join(':'),
  lockId: MODEL_RUNTIME_LOCK.id,
  lockNumber: MODEL_RUNTIME_LOCK.number,
  grantedAt: 'audit-authorized',
});
const require = createRequire(import.meta.url);
const phaseContracts = require('../public/blank/pipeline/simulatte-phase-contracts.js');
const EXPECTED_PHASE_OUTPUT_SCHEMAS = Object.freeze(Object.fromEntries(
  phaseContracts.phases
    .filter((row) => row.phase <= 7)
    .map((row) => [`phase${row.phase}`, row.outputSchema])
));
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

const VISUAL_RUBRIC_SIGNALS = Object.freeze([
  rubricSignal('thermal', /\b(heat|heats|thermal|temperature|cool|cools|cooling|coolant|steam|lava|hot|cold|melt|melts|freeze|freezes|fire|flame|smoke)\b/i, ['thermal', 'combustion', 'phase', 'emission'], ['visual.operator.heat-transfer.v1', 'visual.operator.thermal-combustion.v1', 'visual.operator.phase-transition.v1'], ['atomThermalPlume'], {
    layerSlots: ['thermal-field'],
    proofTerms: ['heat', 'thermal', 'fire', 'flame', 'smoke', 'melt', 'cool'],
  }),
  rubricSignal('fluid', /\b(flow|flows|flowing|advect|advects|airflow|pumps?|pressure drives?|velocity|turbulence|vortex|swim|swims|swimming|surge|upwelling|dispersion)\b/i, ['fluid', 'density', 'motion'], ['visual.operator.fluid-advection.v1'], ['atomFluidRibbons'], {
    layerSlots: ['water-volume', 'flow-field', 'bubble-volume'],
    proofTerms: ['swim', 'swimming', 'wake ripples', 'partial submersion', 'water', 'flow'],
  }),
  rubricSignal('stress', /\b(stress|strain|fracture|fractures|crack|cracks|impact|collision|collides?|buckling|contact force|deform|deforms|shear|torque|resonance|vortex shedding)\b/i, ['stress', 'constraint', 'motion'], ['visual.operator.stress-fracture.v1'], ['atomStressCracks']),
  rubricSignal('feedback', /\b(control|controller|feedback|sensor|setpoint|regulate|stabilize|stabilizes|actuator|valve|loop|throttle|inverter)\b/i, ['feedback', 'signal', 'instrument', 'measurement'], ['visual.operator.control-feedback.v1'], ['atomFeedbackArcs']),
  rubricSignal('orbital', /\b(orbit|orbits|orbiting|orbital resonance|gravity bends?|gravitational|trajectory|barycenter|accretion)\b/i, ['orbital', 'motion'], ['visual.operator.orbital-gravity.v1'], []),
  rubricSignal('electromagnetic', /\b(magnet|magnetic|electric|charge|current|voltage|coil|plasma|field|flux|transformer|grid|battery)\b/i, ['electromagnetic', 'emission', 'signal'], ['visual.operator.electromagnetic-field.v1'], []),
  rubricSignal('optical', /\b(light|laser|lens|prism|mirror|photon|caustic|refraction|interference|ray|spectral|thin film|soap film|iridescent|glass (?:refracts?|focuses?|splits?|scatters?))\b/i, ['optical', 'phase', 'emission', 'surface'], ['visual.operator.optical-ray.v1', 'visual.operator.thin-film-interference.v1'], []),
  rubricSignal('quantum', /\b(quantum|qubit|superconducting|microwave|resonator|spin|ion trap|readout)\b/i, ['quantum', 'measurement', 'instrument', 'signal'], ['visual.operator.quantum-phase-readout.v1'], ['atomQuantumFringes']),
  rubricSignal('acoustic', /\b(acoustic|sound|speaker|membrane|frequency|vibration|pressure ring|standing wave)\b/i, ['acoustic', 'motion'], ['visual.operator.acoustic-wave.v1'], []),
  rubricSignal('biological', /\b(growth|grow|grows|growing|germinate|germinates|sprout|sprouts|bloom|blooms|bleach|bleaches|bleaching|decay|fermentation|cell division|population expands?)\b/i, ['biological', 'density', 'surface'], ['visual.operator.biological-growth.v1'], []),
  rubricSignal('chemical', /\b(reaction|reacts?|diffusion|diffuses?|concentration gradient|corrodes?|oxidizes?|catalyzes?|fermentation|metabolites? (?:exchange|exchanges|exchanging))\b/i, ['chemical', 'density', 'phase'], ['visual.operator.chemical-diffusion.v1'], []),
  rubricSignal('network', /\b(routing|routes?|network flow|traffic flows?|queue grows?|dispatch|redistribute|redistributes|redistributing|packet travels?|loads? index|meters? intersection|stabilizes? (?:grid|load)|feedback amplifies?)\b/i, ['network', 'signal', 'constraint'], ['visual.operator.network-flow.v1'], ['atomNetworkPressure']),
  rubricSignal('granular', /\b(erosion|erodes?|sediment settles?|grains? flow|sandblasts?|avalanche|powder compacts?|hail grows?|debris flow)\b/i, ['granular', 'density', 'surface'], ['visual.operator.granular-erosion.v1'], []),
  rubricSignal('instrument', /\b(detector|sensor|readout|instrument|probe|meter|scope|camera|phototube|calorimeter|chip|chiplet|particle|collider|muon)\b/i, ['instrument', 'measurement', 'signal'], ['visual.operator.instrument-readout.v1', 'visual.operator.particle-track-detector.v1'], []),
  rubricSignal('robotic', /\b(contact force|gripper (?:grasps?|grips?|twists?|holds?)|robot (?:grasps?|grips?|twists?|holds?|pushes?)|pick and place)\b/i, ['robotic', 'feedback', 'constraint'], ['visual.operator.robot-contact.v1'], []),
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
const MODEL_RUNTIME_STALL_MS = 90000;
const CDP_COMMAND_TIMEOUT_MS = 60000;
const MODEL_PROMPT_DEADLINE_MULTIPLIER = 2;
const CLEAN_CANVAS_CAPTURE_SELECTORS = Object.freeze([
  '.prompt-dock',
  '#loading-canvas',
]);

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
    promptTimeoutMs: 0,
    frameDelayMs: 650,
    intentMode: 'model',
    url: '',
    profileDir: '',
    keepProfile: false,
    localPort: 4173,
    goldSetPath: '',
    goldAdjudicationPath: '',
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
    else if (key === '--gold-set') options.goldSetPath = path.resolve(readValue() || '');
    else if (key === '--gold-adjudication') options.goldAdjudicationPath = path.resolve(readValue() || '');
    else if (key === '--width') options.width = Math.max(640, Number(readValue() || options.width));
    else if (key === '--height') options.height = Math.max(480, Number(readValue() || options.height));
    else if (key === '--timeout-ms') options.timeoutMs = Math.max(1000, Number(readValue() || options.timeoutMs));
    else if (key === '--prompt-timeout-ms') options.promptTimeoutMs = Math.max(1000, Number(readValue() || 0));
    else if (key === '--frame-delay-ms') options.frameDelayMs = Math.max(120, Number(readValue() || options.frameDelayMs));
    else if (key === '--url') options.url = String(readValue() || '').trim();
    else if (key === '--profile-dir') {
      options.profileDir = path.resolve(readValue() || '');
      options.keepProfile = true;
    }
    else if (key === '--local-port') {
      const port = Number(readValue());
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error('--local-port must be an integer from 1 through 65535');
      }
      options.localPort = port;
    }
    else if (key === '--keep-profile') options.keepProfile = true;
    else if (key === '--intent-mode') {
      const mode = String(readValue() || '').trim().toLowerCase();
      options.intentMode = mode === 'model' ? 'model' : 'local';
    }
    else if (key === '--help') {
      console.log('usage: node tools/audit-intent-scene-screenshots.mjs [--url URL] [--curated N] [--broad N] [--prompt TEXT] [--gold-set PATH] [--gold-adjudication PATH] [--four N] [--eighty N] [--seed N] [--out DIR] [--intent-mode local|model] [--timeout-ms N] [--prompt-timeout-ms N] [--frame-delay-ms N] [--profile-dir DIR] [--local-port PORT]');
      process.exit(0);
    }
  }
  return options;
}

function rubricSignal(id, pattern, slots, mappingIds, wgslOperators, renderEvidence = null) {
  return Object.freeze({ id, pattern, slots, mappingIds, wgslOperators, renderEvidence });
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
  for (const row of options.goldSet && options.goldSet.rows || []) {
    prompts.push({ kind: 'gold', prompt: row.prompt, goldRowId: row.id });
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
  let nearWhite = 0;
  let edgeSamples = 0;
  let strongEdges = 0;
  const sampleRgb = [];
  const yStep = Math.max(1, Math.floor(height / 72));
  const xStep = Math.max(1, Math.floor(width / 96));
  for (let y = 0; y < height; y += yStep) {
    for (let x = 0; x < width; x += xStep) {
      const pixel = (y * width + x) * channels;
      const r = pixels[pixel];
      const g = pixels[pixel + 1];
      const b = pixels[pixel + 2];
      sampleRgb.push(r, g, b);
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      sum += luma;
      sumSq += luma * luma;
      if (Math.max(r, g, b) - Math.min(r, g, b) > 16) colored += 1;
      if (luma >= 245) nearWhite += 1;
      if (x + xStep < width && y + yStep < height) {
        const right = (y * width + x + xStep) * channels;
        const below = ((y + yStep) * width + x) * channels;
        const rightLuma = 0.2126 * pixels[right] + 0.7152 * pixels[right + 1] + 0.0722 * pixels[right + 2];
        const belowLuma = 0.2126 * pixels[below] + 0.7152 * pixels[below + 1] + 0.0722 * pixels[below + 2];
        if (Math.max(Math.abs(luma - rightLuma), Math.abs(luma - belowLuma)) >= 24) strongEdges += 1;
        edgeSamples += 1;
      }
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
    nearWhiteRatio: samples ? Number((nearWhite / samples).toFixed(4)) : 0,
    strongEdgeRatio: edgeSamples ? Number((strongEdges / edgeSamples).toFixed(4)) : 0,
    perceptualHash: differenceHash(pixels, width, height, channels),
    hash: (hash >>> 0).toString(16).padStart(8, '0'),
    sampleRgb,
  };
}

function sampledFrameDifference(left = null, right = null) {
  const a = left && left.sampleRgb || [];
  const b = right && right.sampleRgb || [];
  const length = Math.min(a.length, b.length);
  if (!length || length % 3 !== 0) return { meanAbsoluteDelta: 0, changedPixelRatio: 0 };
  let total = 0;
  let changed = 0;
  for (let offset = 0; offset < length; offset += 3) {
    const delta = (Math.abs(a[offset] - b[offset]) + Math.abs(a[offset + 1] - b[offset + 1]) +
      Math.abs(a[offset + 2] - b[offset + 2])) / 3;
    total += delta;
    if (delta >= 6) changed += 1;
  }
  const pixelCount = length / 3;
  return {
    meanAbsoluteDelta: Number((total / pixelCount).toFixed(4)),
    changedPixelRatio: Number((changed / pixelCount).toFixed(5)),
  };
}

function differenceHash(pixels, width, height, channels) {
  const columns = 9;
  const rows = 8;
  let value = 0n;
  for (let row = 0; row < rows; row += 1) {
    const y = Math.min(height - 1, Math.floor((row + 0.5) * height / rows));
    let previous = null;
    for (let column = 0; column < columns; column += 1) {
      const x = Math.min(width - 1, Math.floor((column + 0.5) * width / columns));
      const offset = (y * width + x) * channels;
      const luma = 0.2126 * pixels[offset] + 0.7152 * pixels[offset + 1] + 0.0722 * pixels[offset + 2];
      if (previous !== null) {
        value = (value << 1n) | (previous > luma ? 1n : 0n);
      }
      previous = luma;
    }
  }
  return value.toString(16).padStart(16, '0');
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

function startStaticServer(port = 0) {
  const server = createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    const pathname = decodeURIComponent(url.pathname || '/');
    const requested = pathname.endsWith('/') ? `${pathname}index.html` : pathname;
    const requestedPath = path.resolve(PUBLIC_DIR, `.${requested}`);
    const relativePath = path.relative(PUBLIC_DIR, requestedPath);
    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
      res.writeHead(403);
      res.end('forbidden');
      return;
    }
    fs.stat(requestedPath).then(async (fileStat) => {
      const fullPath = requestedPath;
      if (!fileStat.isFile()) {
        res.writeHead(404);
        res.end('not found');
        return;
      }
      res.writeHead(200, {
        'content-type': MIME[path.extname(fullPath)] || 'application/octet-stream',
        'cache-control': 'no-store',
      });
      createReadStream(fullPath).pipe(res);
    }).catch(() => {
      res.writeHead(404);
      res.end('not found');
    });
  });
  return new Promise((resolve, reject) => {
    server.listen(port, '127.0.0.1', () => resolve({ server, port: server.address().port }));
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
    this.diagnosticEvents = [];
    this.closedError = null;
    this.ws = new WebSocket(url);
    this.ready = new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve, { once: true });
      this.ws.addEventListener('error', reject, { once: true });
    });
    this.ws.addEventListener('message', (event) => this.handleMessage(event.data));
    this.ws.addEventListener('close', () => {
      this.failPending(this.closedError || new Error('CDP connection closed'));
    });
    this.ws.addEventListener('error', () => {
      this.failPending(this.closedError || new Error('CDP connection failed'));
    });
  }

  handleMessage(raw) {
    const message = JSON.parse(String(raw));
    if (message.id && this.pending.has(message.id)) {
      const { resolve, reject, timer } = this.pending.get(message.id);
      this.pending.delete(message.id);
      clearTimeout(timer);
      if (message.error) reject(new Error(`${message.error.message || 'CDP error'} ${JSON.stringify(message.error.data || '')}`));
      else resolve(message.result || {});
      return;
    }
    this.recordDiagnosticEvent(message);
    if (message.method && this.eventWaiters.has(message.method)) {
      const waiters = this.eventWaiters.get(message.method);
      this.eventWaiters.delete(message.method);
      for (const waiter of waiters) waiter.resolve(message.params || {});
    }
  }

  recordDiagnosticEvent(message) {
    const method = String(message && message.method || '');
    const params = message && message.params || {};
    const consoleType = String(params.type || '');
    const logLevel = String(params.entry && params.entry.level || '');
    const keep = method === 'Runtime.exceptionThrown' ||
      (method === 'Runtime.consoleAPICalled' && ['error', 'warning', 'assert'].includes(consoleType)) ||
      (method === 'Log.entryAdded' && ['error', 'warning'].includes(logLevel));
    if (!keep) return;
    this.diagnosticEvents.push({ method, params });
    if (this.diagnosticEvents.length > 50) this.diagnosticEvents.shift();
  }

  diagnostics() {
    return this.diagnosticEvents.slice();
  }

  async send(method, params = {}) {
    await this.ready;
    if (this.closedError || this.ws.readyState >= 2) {
      throw this.closedError || new Error(`CDP connection is closed before ${method}`);
    }
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (!this.pending.has(id)) return;
        this.pending.delete(id);
        reject(new Error(`CDP command timed out: ${method}`));
      }, CDP_COMMAND_TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.ws.send(JSON.stringify({ id, method, params }));
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error);
      }
    });
  }

  waitForEvent(method) {
    return new Promise((resolve, reject) => {
      const waiters = this.eventWaiters.get(method) || [];
      waiters.push({ resolve, reject });
      this.eventWaiters.set(method, waiters);
    });
  }

  failPending(error) {
    for (const { reject, timer } of this.pending.values()) {
      clearTimeout(timer);
      reject(error);
    }
    this.pending.clear();
    for (const waiters of this.eventWaiters.values()) {
      for (const waiter of waiters) waiter.reject(error);
    }
    this.eventWaiters.clear();
  }

  close(error = null) {
    this.closedError = error || this.closedError || new Error('CDP connection closed');
    this.failPending(this.closedError);
    if (this.ws.readyState < 2) this.ws.close();
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

async function hideCanvasOverlays(cdp) {
  return evaluate(cdp, `(() => {
    const selectors = ${JSON.stringify(CLEAN_CANVAS_CAPTURE_SELECTORS)};
    const rows = Array.from(new Set(selectors.flatMap((selector) => Array.from(document.querySelectorAll(selector)))));
    window.__simulatteAuditOverlayStyles = rows.map((node) => ({ node, cssText: node.style.cssText }));
    for (const node of rows) {
      node.style.setProperty('visibility', 'hidden', 'important');
      node.style.setProperty('pointer-events', 'none', 'important');
    }
    return rows.length;
  })()`);
}

async function restoreCanvasOverlays(cdp) {
  return evaluate(cdp, `(() => {
    const rows = Array.isArray(window.__simulatteAuditOverlayStyles)
      ? window.__simulatteAuditOverlayStyles
      : [];
    for (const row of rows) {
      if (row && row.node && row.node.style) row.node.style.cssText = row.cssText || '';
    }
    delete window.__simulatteAuditOverlayStyles;
    return rows.length;
  })()`);
}

async function captureCleanCanvasScreenshot(cdp, clip) {
  await hideCanvasOverlays(cdp);
  try {
    return await cdp.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false,
      fromSurface: true,
      clip,
    });
  } finally {
    await restoreCanvasOverlays(cdp);
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function promptDeadlineMs(options = {}) {
  if (Number(options.promptTimeoutMs || 0) > 0) return Number(options.promptTimeoutMs);
  if (options.intentMode === 'model') {
    return Number(options.timeoutMs || 0) + MODEL_RUNTIME_STALL_MS * MODEL_PROMPT_DEADLINE_MULTIPLIER;
  }
  return Number(options.timeoutMs || 0) * 4;
}

async function setupPage(cdp, url, width, height, timeoutMs, intentMode) {
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Log.enable');
  await cdp.send('Network.enable');
  await cdp.send('Network.clearBrowserCache');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Network.setBypassServiceWorker', { bypass: true });
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  });
  if (intentMode === 'model') {
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `localStorage.setItem(${JSON.stringify(MODEL_CONSENT_STORAGE_KEY)}, ${JSON.stringify(JSON.stringify(MODEL_CONSENT_GRANT))});`,
    });
  }
  const loaded = cdp.waitForEvent('Page.loadEventFired');
  await cdp.send('Page.navigate', { url });
  await loaded;
  await waitForCondition('Simulatte UI ready', () => evaluate(cdp, `(() => {
    if (window.SimulatteStartPhysicsLab && window.SimulattePhysicsLab && !window.SimulattePhysicsLab._browserLab) {
      window.SimulatteStartPhysicsLab();
    }
    const run = document.getElementById('build-lab');
    const runtime = document.getElementById('intent-runtime');
    const health = window.SimulatteIntentRuntimeHealth || (() => {
      try { return runtime && runtime.dataset.health ? JSON.parse(runtime.dataset.health) : null; }
      catch (_err) { return null; }
    })();
    const runtimeEvents = (window.__simulatteIntentRuntimeEvents || []).slice(-8);
    const blocking = runtime && runtime.dataset.blocking === 'true';
    return {
      ok: document.readyState === 'complete' &&
        !!document.getElementById('build-prompt') &&
        !!document.getElementById('physics-canvas') &&
        !!(window.SimulattePhysicsLab && window.SimulattePhysicsLab._browserLab) &&
        (!run || run.disabled === false || !blocking),
      labReady: !!(window.SimulattePhysicsLab && window.SimulattePhysicsLab._browserLab),
      runDisabled: run && run.disabled,
      runtimeState: runtime && runtime.dataset.state,
      runtimeBlocking: runtime && runtime.dataset.blocking,
      runtimePassive: runtime && runtime.dataset.passive,
      runtimeStage: runtime && runtime.dataset.stage,
      runtimeLastStage: runtime && runtime.dataset.lastStage,
      runtimeDetail: runtime && runtime.dataset.detail,
      runtimeHealth: health,
      runtimeEvents,
    };
  })()`), timeoutMs, {
    extendOnProgress: intentMode === 'model',
    stallTimeoutMs: MODEL_RUNTIME_STALL_MS,
  });
  await delay(300);
}

async function auditFailureState(cdp) {
  if (!cdp) return null;
  try {
    return await evaluate(cdp, `(() => {
      const runtime = document.getElementById('intent-runtime');
      const canvas = document.getElementById('physics-canvas');
      const lab = window.SimulattePhysicsLab && window.SimulattePhysicsLab._browserLab;
      const spec = lab && typeof lab.getSpec === 'function' ? lab.getSpec() : null;
      const artifacts = spec && spec.phaseArtifacts || {};
      const phase6 = artifacts.phase6 && artifacts.phase6.artifact || {};
      const visualCompile = phase6.visualCompile || {};
      const canvasDiagnostics = canvas && canvas.dataset
        ? Object.fromEntries(Object.entries(canvas.dataset).filter(([key]) =>
          /^(?:renderer|renderCount|scene|phase7|phase8|webgpu|audit|error|failed)/i.test(key)))
        : {};
      return {
        url: location.href,
        runtime: runtime && runtime.dataset ? { ...runtime.dataset } : {},
        canvas: canvasDiagnostics,
        labReady: Boolean(lab),
        spec: spec ? {
          name: spec.name || '',
          templateId: spec.templateId || '',
          phaseSchemas: Object.fromEntries(Object.entries(artifacts).map(([key, value]) => [key, value && value.schema || ''])),
          phase6SceneKind: visualCompile.sceneRenderPacket && visualCompile.sceneRenderPacket.sceneKind || '',
          phase6RenderPacketSchema: visualCompile.sceneRenderPacket && visualCompile.sceneRenderPacket.schema || '',
        } : null,
      };
    })()`);
  } catch (error) {
    return { captureError: error && error.message ? error.message : String(error) };
  }
}

async function runPrompt(cdp, entry, index, outDir, options) {
  const timeoutMs = options.timeoutMs;
  const frameDelayMs = options.frameDelayMs;
  const prompt = entry.prompt;
  const label = `${String(index + 1).padStart(2, '0')}-${entry.kind}-${slug(prompt)}`;
  const auditStartedAt = Date.now();
  const auditStages = [];
  let activeStage = { id: 'configure', startedAt: auditStartedAt };
  const markStage = (id) => {
    const now = Date.now();
    auditStages.push({ id: activeStage.id, durationMs: now - activeStage.startedAt });
    activeStage = { id, startedAt: now };
    options.onAuditStage?.({
      schema: 'simulatte.visualAuditProgress.v1',
      promptIndex: index + 1,
      promptCount: options.promptCount || 0,
      prompt,
      stage: id,
      elapsedMs: now - auditStartedAt,
    });
  };
  let expectedRenderInputSerial = 0;
  let consentDeclinedBeforeRun = false;
  await evaluate(cdp, `(() => {
    const canvas = document.getElementById('physics-canvas');
    if (canvas && canvas.dataset) {
      canvas.dataset.auditRequirePixelProof = 'true';
      canvas.dataset.auditFreezeFrame = 'false';
    }
    return Boolean(canvas);
  })()`);
  markStage('runtime-wait');
  if (options.intentMode !== 'model' && index === 0) {
    await waitForCondition('Blank Qwen consent control ready', () => evaluate(cdp, `(() => {
      const toggle = document.getElementById('blank-neural-models');
      const dialog = document.getElementById('neural-model-dialog');
      return {
        ok: !!toggle && !!dialog && !toggle.checked && toggle.getAttribute('aria-checked') === 'false',
        checked: toggle && toggle.checked,
        ariaChecked: toggle && toggle.getAttribute('aria-checked'),
        dialogOpen: dialog && dialog.open,
      };
    })()`), timeoutMs);
    await evaluate(cdp, `(() => {
      document.getElementById('blank-neural-models').click();
      return true;
    })()`);
    await waitForCondition('Blank Qwen consent dialog open', () => evaluate(cdp, `(() => {
      const dialog = document.getElementById('neural-model-dialog');
      return { ok: !!dialog && dialog.open, dialogOpen: dialog && dialog.open };
    })()`), timeoutMs);
    await evaluate(cdp, `(() => {
      const cancel = document.querySelector('#neural-model-dialog [data-neural-consent="cancel"]');
      if (!cancel) return false;
      cancel.click();
      return true;
    })()`);
    await waitForCondition('Blank deterministic mode retained after declining Qwen', () => evaluate(cdp, `(() => {
      const toggle = document.getElementById('blank-neural-models');
      const dialog = document.getElementById('neural-model-dialog');
      return {
        ok: !!toggle && !!dialog && !dialog.open && !toggle.checked && toggle.getAttribute('aria-checked') === 'false',
        checked: toggle && toggle.checked,
        ariaChecked: toggle && toggle.getAttribute('aria-checked'),
        dialogOpen: dialog && dialog.open,
      };
    })()`), timeoutMs);
    consentDeclinedBeforeRun = true;
  }
  const promptBaseline = await evaluate(cdp, `(() => {
      const input = document.getElementById('build-prompt');
      if (!input) return { ok: false, reason: 'missing prompt input' };
      const canvas = document.getElementById('physics-canvas');
      const lab = window.SimulattePhysicsLab && window.SimulattePhysicsLab._browserLab;
      const spec = lab && typeof lab.getSpec === 'function' ? lab.getSpec() : null;
      const phase2 = spec && spec.phaseArtifacts && spec.phaseArtifacts.phase2 || null;
      input.value = ${JSON.stringify(prompt)};
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return {
        ok: true,
        sceneId: canvas && canvas.dataset ? canvas.dataset.sceneId || '' : '',
        renderInputSerial: Number(canvas && canvas.dataset && canvas.dataset.renderInputSerial || 0),
        compiledPrompt: phase2 && phase2.artifact && phase2.artifact.languageGraph &&
          phase2.artifact.languageGraph.sourceText || '',
      };
    })()`);
    await waitForCondition(`run button ready for ${label}`, () => evaluate(cdp, `(() => {
      const run = document.getElementById('build-lab');
      const node = document.getElementById('intent-runtime');
      const health = window.SimulatteIntentRuntimeHealth || (() => {
        try { return node && node.dataset.health ? JSON.parse(node.dataset.health) : null; }
        catch (_err) { return null; }
      })();
      return {
        ok: !!run && run.disabled === false && (!node || node.dataset.blocking !== 'true'),
        state: node && node.dataset.state,
        stageId: node && node.dataset.stage,
        lastStage: node && node.dataset.lastStage,
        pipelineStep: node && node.dataset.pipelineStep,
        progress: node && node.dataset.progress,
        detail: node && node.dataset.detail,
        blocking: node && node.dataset.blocking,
        passive: node && node.dataset.passive,
        disabled: run && run.disabled,
        runtimeHealth: health,
        runtimeEvents: (window.__simulatteIntentRuntimeEvents || []).slice(-8),
      };
    })()`), timeoutMs, { extendOnProgress: true, stallTimeoutMs: MODEL_RUNTIME_STALL_MS });
    await evaluate(cdp, `(() => {
      const run = document.getElementById('build-lab');
      if (!run) return { ok: false, reason: 'missing run control' };
      run.click();
      return { ok: true };
    })()`);
    markStage('intent-compile');
    const readyState = await waitForCondition(`intent ready for ${label}`, () => evaluate(cdp, `(() => {
      const node = document.getElementById('intent-runtime');
      const run = document.getElementById('build-lab');
      const message = document.getElementById('intent-runtime-message');
      const stage = document.getElementById('intent-runtime-stage');
      const canvas = document.getElementById('physics-canvas');
      const lab = window.SimulattePhysicsLab && window.SimulattePhysicsLab._browserLab;
      const spec = lab && typeof lab.getSpec === 'function' ? lab.getSpec() : null;
      const phase2 = spec && spec.phaseArtifacts && spec.phaseArtifacts.phase2 || null;
      const phase6 = spec && spec.phaseArtifacts && spec.phaseArtifacts.phase6 || null;
      const phase6Ready = phase6 && phase6.schema === 'simulatte.phase6.output.v2';
      const sceneVisible = canvas && canvas.dataset && canvas.dataset.sceneVisible === 'true';
      const sceneId = canvas && canvas.dataset ? canvas.dataset.sceneId || '' : '';
      const renderInputSerial = Number(canvas && canvas.dataset && canvas.dataset.renderInputSerial || 0);
      const compiledPrompt = phase2 && phase2.artifact && phase2.artifact.languageGraph &&
        phase2.artifact.languageGraph.sourceText || '';
      const normalizePrompt = (value) => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
      const promptMatches = normalizePrompt(compiledPrompt) === normalizePrompt(${JSON.stringify(prompt)});
      const renderInputAdvanced = renderInputSerial > ${Number(promptBaseline && promptBaseline.renderInputSerial || 0)};
      const health = window.SimulatteIntentRuntimeHealth || (() => {
        try { return node && node.dataset.health ? JSON.parse(node.dataset.health) : null; }
        catch (_err) { return null; }
      })();
      return {
        ok: !!node && node.dataset.state === 'ready' && (!run || run.disabled === false) &&
          phase6Ready && sceneVisible && promptMatches && renderInputAdvanced,
        state: node && node.dataset.state,
        stageId: node && node.dataset.stage,
        lastStage: node && node.dataset.lastStage,
        pipelineStep: node && node.dataset.pipelineStep,
        progress: node && node.dataset.progress,
        detail: node && node.dataset.detail,
        blocking: node && node.dataset.blocking,
        passive: node && node.dataset.passive,
        modelId: node && node.dataset.modelId,
        cacheMode: node && node.dataset.cacheMode,
        cacheWorker: node && node.dataset.cacheWorker,
        resourceKind: node && node.dataset.resourceKind,
        resourceFile: node && node.dataset.resourceFile,
        completedBytes: node && node.dataset.completedBytes,
        totalBytes: node && node.dataset.totalBytes,
        traceId: node && node.dataset.traceId,
        rankId: node && node.dataset.rankId,
        providerReady: node && node.dataset.providerReady,
        reuse: node && node.dataset.reuse,
        cacheHitCount: node && node.dataset.cacheHitCount,
        cacheMissCount: node && node.dataset.cacheMissCount,
        message: message && message.textContent,
        phaseLabel: stage && stage.textContent,
        renderer: canvas && canvas.dataset && canvas.dataset.renderer,
        rendererStatus: canvas && canvas.dataset && canvas.dataset.rendererStatus,
        sceneVisible,
        sceneId,
        renderInputSerial,
        renderInputAdvanced,
        compiledPrompt,
        promptMatches,
        phase6Schema: phase6 && phase6.schema || '',
        compiledSpecName: spec && spec.name || '',
        disabled: run && run.disabled,
        runtimeHealth: health,
        runtimeEvents: (window.__simulatteIntentRuntimeEvents || []).slice(-8),
      };
    })()`), timeoutMs, { extendOnProgress: true, stallTimeoutMs: MODEL_RUNTIME_STALL_MS });
  expectedRenderInputSerial = Number(readyState && readyState.renderInputSerial || 0);
  markStage('scene-proof');
  await delay(frameDelayMs);
  const settledProof = await waitForCondition(`pixel and scene proof settled for ${label}`, () => evaluate(cdp, `(() => {
    const canvas = document.getElementById('physics-canvas');
    const lab = window.SimulattePhysicsLab && window.SimulattePhysicsLab._browserLab;
    const spec = lab && typeof lab.getSpec === 'function' ? lab.getSpec() : null;
    const phase2 = spec && spec.phaseArtifacts && spec.phaseArtifacts.phase2 || null;
    const compiledPrompt = phase2 && phase2.artifact && phase2.artifact.languageGraph &&
      phase2.artifact.languageGraph.sourceText || '';
    const normalizePrompt = (value) => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
    const promptMatches = normalizePrompt(compiledPrompt) === normalizePrompt(${JSON.stringify(prompt)});
    const sceneId = canvas && canvas.dataset ? canvas.dataset.sceneId || '' : '';
    const renderInputSerial = Number(canvas && canvas.dataset && canvas.dataset.renderInputSerial || 0);
    const renderInputMatches = ${expectedRenderInputSerial} ? renderInputSerial >= ${expectedRenderInputSerial} : true;
    const sceneProofVerdict = canvas && canvas.dataset ? canvas.dataset.sceneProofVerdict || '' : '';
    const pixelReadback = canvas && canvas.dataset ? canvas.dataset.phase7PixelReadback || '' : '';
    const pixelProof = canvas && canvas.dataset ? canvas.dataset.phase7PixelProofStatus || '' : '';
    const rendered = Number(canvas && canvas.dataset && canvas.dataset.renderCount || 0);
    const terminalSceneProof = ['pass', 'fail', 'not-proven', 'error'].includes(sceneProofVerdict);
    const terminalPixelReadback = ['pass', 'fail', 'not-proven', 'error'].includes(pixelReadback);
    const terminalPixelProof = ['pass', 'fail', 'not-proven', 'error'].includes(pixelProof);
    const required = Number(canvas && canvas.dataset && canvas.dataset.phase7PixelRequiredObligationCount || 0);
    const sampled = Number(canvas && canvas.dataset && canvas.dataset.phase7PixelSampledObligationCount || 0);
    return {
      ok: promptMatches && renderInputMatches && rendered >= 3 && terminalSceneProof &&
        terminalPixelReadback && terminalPixelProof && required >= 1,
      renderCount: rendered,
      sceneId,
      renderInputSerial,
      expectedRenderInputSerial: ${expectedRenderInputSerial},
      renderInputMatches,
      compiledPrompt,
      promptMatches,
      sceneProofVerdict,
      phase7PixelReadback: pixelReadback,
      phase7PixelProofStatus: pixelProof,
      phase7PixelRequiredObligationCount: required,
      phase7PixelSampledObligationCount: sampled,
      phase7PixelVisibleSampleCount: Number(canvas && canvas.dataset && canvas.dataset.phase7PixelVisibleSampleCount || 0),
      phase7PixelMinContrast: Number(canvas && canvas.dataset && canvas.dataset.phase7PixelMinContrast || 0),
      phase7VisualObligationProof: canvas && canvas.dataset && canvas.dataset.phase7VisualObligationProof || '',
      phase7PassedVisualObligationIds: canvas && canvas.dataset &&
        canvas.dataset.phase7PassedVisualObligationIds || '',
      phase7PixelAuditChecks: canvas && canvas.dataset && canvas.dataset.phase7PixelAuditChecks || '',
    };
  })()`), timeoutMs, {
    extendOnProgress: true,
    stallTimeoutMs: MODEL_RUNTIME_STALL_MS,
    progressSignature: (value) => JSON.stringify({
      sceneProofVerdict: value && value.sceneProofVerdict || '',
      phase7PixelReadback: value && value.phase7PixelReadback || '',
      phase7PixelProofStatus: value && value.phase7PixelProofStatus || '',
      sampled: value && value.phase7PixelSampledObligationCount || 0,
    }),
    describeLast: (value) => ({
      renderCount: value && value.renderCount || 0,
      sceneId: value && value.sceneId || '',
      renderInputMatches: value && value.renderInputMatches === true,
      renderInputSerial: value && value.renderInputSerial || 0,
      expectedRenderInputSerial: value && value.expectedRenderInputSerial || 0,
      promptMatches: value && value.promptMatches === true,
      sceneProofVerdict: value && value.sceneProofVerdict || '',
      phase7PixelReadback: value && value.phase7PixelReadback || '',
      phase7PixelProofStatus: value && value.phase7PixelProofStatus || '',
      requiredObligations: value && value.phase7PixelRequiredObligationCount || 0,
      sampledObligations: value && value.phase7PixelSampledObligationCount || 0,
    }),
  });
  markStage('diagnostics');
  const diagnostics = await evaluate(cdp, `(() => {
    const canvas = document.getElementById('physics-canvas');
    const fieldCanvas = document.getElementById('field-canvas');
    const runtime = document.getElementById('intent-runtime');
    const message = document.getElementById('intent-runtime-message');
    const runtimeHealth = window.SimulatteIntentRuntimeHealth || (() => {
      try { return runtime && runtime.dataset.health ? JSON.parse(runtime.dataset.health) : null; }
      catch (_err) { return null; }
    })();
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
    let browserSpec = null;
    const previewText = preview ? preview.textContent || '' : '';
    try { parsed = JSON.parse(previewText); } catch (_err) {}
    try {
      const browserLab = window.SimulattePhysicsLab && window.SimulattePhysicsLab._browserLab;
      browserSpec = browserLab && typeof browserLab.getSpec === 'function' ? browserLab.getSpec() : null;
    } catch (_err) {}
    try {
      if (!browserSpec && window.SimulattePhysicsModel && typeof window.SimulattePhysicsModel.createSpecFromPrompt === 'function') {
        modelSpec = window.SimulattePhysicsModel.createSpecFromPrompt(${JSON.stringify(prompt)}, { deterministicRuntime: true });
      }
    } catch (_err) {}
    const specForIntent = browserSpec || modelSpec || parsed || null;
    const phaseArtifacts = specForIntent && specForIntent.phaseArtifacts || {};
    const compiledPrompt = phaseArtifacts.phase2 && phaseArtifacts.phase2.artifact &&
      phaseArtifacts.phase2.artifact.languageGraph &&
      phaseArtifacts.phase2.artifact.languageGraph.sourceText || '';
    const compiledSourcePromptHash = phaseArtifacts.phase2 && phaseArtifacts.phase2.artifact &&
      phaseArtifacts.phase2.artifact.sceneLanguageGraph &&
      phaseArtifacts.phase2.artifact.sceneLanguageGraph.sourcePromptHash || '';
    const phaseArtifactSchemas = Object.fromEntries(Array.from({ length: 6 }, (_, index) => {
      const key = 'phase' + (index + 1);
      return [key, phaseArtifacts[key] && phaseArtifacts[key].schema || ''];
    }));
    phaseArtifactSchemas.phase7 = canvas && canvas.dataset ? canvas.dataset.phase7Output || '' : '';
    const phase6VisualCompile = phaseArtifacts.phase6 &&
      phaseArtifacts.phase6.artifact &&
      phaseArtifacts.phase6.artifact.visualCompile || null;
    const phase1RuntimeContext = phaseArtifacts.phase1 &&
      phaseArtifacts.phase1.artifact &&
      phaseArtifacts.phase1.artifact.runtimeContext || {};
    const promptRuntimeReceipt = phase1RuntimeContext.promptRuntimeReceipt || {};
    const phase3Retrieval = phaseArtifacts.phase3 &&
      phaseArtifacts.phase3.artifact &&
      phaseArtifacts.phase3.artifact.retrievalRerankResult || {};
    const phase4AcceptedGraph = phaseArtifacts.phase4 &&
      phaseArtifacts.phase4.artifact &&
      phaseArtifacts.phase4.artifact.groundedIntent &&
      phaseArtifacts.phase4.artifact.groundedIntent.acceptedGraph || {};
    const phase5SimulationCompile = phaseArtifacts.phase5 &&
      phaseArtifacts.phase5.artifact &&
      phaseArtifacts.phase5.artifact.simulationCompile || {};
    const phase5PhysicsIR = phase5SimulationCompile.physicsIR || {};
    const phase5SolverGraph = phase5SimulationCompile.solverGraph || {};
    const phase5RenderIR = phase5SimulationCompile.renderIR || {};
    const phase3RerankReceipt = phase3Retrieval.rerankReceipt || {};
    const sourceRerankReceipt = phase3RerankReceipt.source || {};
    const slotRetrieval = phase3Retrieval.slotRetrieval || {};
    const promptRerankScoringPaths = sourceRerankReceipt.scoringPaths || [];
    const slotRerankScoringPaths = slotRetrieval.rerankScoringPaths || [];
    const rendererPlan = phase6VisualCompile && phase6VisualCompile.rendererPlan || null;
    const visualIR = phase6VisualCompile && phase6VisualCompile.visualIR || null;
    const sceneRenderPacket = phase6VisualCompile && phase6VisualCompile.sceneRenderPacket || null;
    const phase6CompositionLedger = phase6VisualCompile && phase6VisualCompile.compositionLedger || {};
    const graphicsAtoms = visualIR && visualIR.graphicsAtoms || {};
    const atomUniforms = graphicsAtoms && graphicsAtoms.uniforms || {};
    const intentBrief = specForIntent && specForIntent.intent && specForIntent.intent.intentBrief || null;
    const physicalReceipt = specForIntent && specForIntent.physicalSpec && specForIntent.physicalSpec.receipt || {};
    const rendererConsumption = (() => {
      try { return canvas && canvas.dataset.phase7RendererConsumption ? JSON.parse(canvas.dataset.phase7RendererConsumption) : null; }
      catch (_err) { return null; }
    })();
    const objectRealization = (() => {
      try { return canvas && canvas.dataset.webgpuObjectRealization ? JSON.parse(canvas.dataset.webgpuObjectRealization) : null; }
      catch (_err) { return null; }
    })();
    const phase7PixelSamples = (() => {
      const source = canvas && canvas.__simulattePixelSamples || null;
      const proof = window.SimulatteRenderProof;
      const rows = proof && typeof proof.normalizePhase7PixelSamples === 'function'
        ? proof.normalizePhase7PixelSamples(source)
        : source && Array.isArray(source.samples) ? source.samples : [];
      return rows.slice(0, 64).map((row) => ({
        id: row.id || '',
        obligationId: row.obligationId || '',
        drawableId: row.drawableId || '',
        constructionRole: row.constructionRole || '',
        constructionPartId: row.constructionPartId || '',
        rgba: Array.isArray(row.rgba) ? row.rgba.slice(0, 4) : [],
        contrast: Number(row.contrast || 0),
        visible: row.visible === true,
        x: Number(row.x || 0),
        y: Number(row.y || 0),
      }));
    })();
    const visualIRArrayCount = (key) => (
      visualIR && Array.isArray(visualIR[key]) ? visualIR[key].length : 0
    );
    const intentBriefArrayCount = (key) => (
      intentBrief && Array.isArray(intentBrief[key]) ? intentBrief[key].length : 0
    );
    const constructionAuditSummary = (row = {}) => {
      const hypotheses = Array.isArray(row.constructionHypotheses) ? row.constructionHypotheses : [];
      const selected = row.construction || hypotheses[0] || null;
      return {
        selectedTargetEntryId: selected && selected.targetEntryId || '',
        selectedSourceCardIds: selected && selected.sourceCardIds || [],
        hypothesisCount: hypotheses.length,
        hypotheses: hypotheses.map((hypothesis) => ({
          hypothesisId: hypothesis.hypothesisId || '',
          rank: Number(hypothesis.hypothesisRank || 0),
          targetEntryId: hypothesis.targetEntryId || '',
          sourceCardIds: hypothesis.sourceCardIds || [],
          candidateId: hypothesis.provenance && hypothesis.provenance.candidateId || '',
          modelEvaluated: hypothesis.provenance && hypothesis.provenance.modelEvaluated === true,
          rerankEvaluated: hypothesis.provenance && hypothesis.provenance.rerankEvaluated === true,
          literalSlotMatch: hypothesis.provenance && hypothesis.provenance.literalSlotMatch === true,
          exactTargetMatch: hypothesis.provenance && hypothesis.provenance.exactTargetMatch === true,
        })),
      };
    };
    const canonicalBrowserJson = (value) => {
      const sort = (item) => {
        if (Array.isArray(item)) return item.map(sort);
        if (!item || typeof item !== 'object') return item;
        return Object.fromEntries(Object.keys(item).sort().map((key) => [key, sort(item[key])]));
      };
      return JSON.stringify(sort(value));
    };
    return {
      buildId: document.querySelector('meta[name="simulatte-build"]')?.content || '',
      runtimeState: runtime ? runtime.dataset.state || '' : '',
      renderInputSerial: Number(canvas && canvas.dataset && canvas.dataset.renderInputSerial || 0),
      compiledPrompt,
      compiledSourcePromptHash,
      sceneRenderPacketCanonicalJson: sceneRenderPacket ? canonicalBrowserJson(sceneRenderPacket) : '',
      runtimeStage: runtime ? runtime.dataset.stage || '' : '',
      runtimeLastStage: runtime ? runtime.dataset.lastStage || '' : '',
      runtimePipelineStep: runtime ? runtime.dataset.pipelineStep || '' : '',
      runtimeBlocking: runtime ? runtime.dataset.blocking || '' : '',
      runtimePassive: runtime ? runtime.dataset.passive || '' : '',
      runtimeDetail: runtime ? runtime.dataset.detail || '' : '',
      runtimeMessage: message ? message.textContent || '' : '',
      runtimeHealth,
      runtimeEvents: (window.__simulatteIntentRuntimeEvents || []).slice(-12),
      runtimeProgressLogs: (window.__simulatteRuntimeProgressLogs || []).slice(-2048),
      runtimePerformanceLogs: (window.__simulatteRuntimePerformanceLogs || []).slice(-120),
      runtimeModelId: runtime ? runtime.dataset.modelId || '' : '',
      runtimeCacheMode: runtime ? runtime.dataset.cacheMode || '' : '',
      runtimeCacheWorker: runtime ? runtime.dataset.cacheWorker || '' : '',
      runtimeCacheBackends: runtime ? runtime.dataset.cacheBackends || '' : '',
      runtimeResourceKind: runtime ? runtime.dataset.resourceKind || '' : '',
      runtimeResourceFile: runtime ? runtime.dataset.resourceFile || '' : '',
      runtimeCompletedBytes: runtime ? Number(runtime.dataset.completedBytes || 0) : 0,
      runtimeTotalBytes: runtime ? Number(runtime.dataset.totalBytes || 0) : 0,
      runtimeTraceId: runtime ? runtime.dataset.traceId || '' : '',
      runtimeRankId: runtime ? runtime.dataset.rankId || '' : '',
      runtimeReuse: runtime ? runtime.dataset.reuse || '' : '',
      runtimeProviderReady: runtime ? runtime.dataset.providerReady || '' : '',
      runtimeCacheHitCount: runtime ? Number(runtime.dataset.cacheHitCount || 0) : 0,
      runtimeCacheMissCount: runtime ? Number(runtime.dataset.cacheMissCount || 0) : 0,
      runtimeCachedSpanCount: runtime ? Number(runtime.dataset.cachedSpanCount || 0) : 0,
      phase1RuntimeMode: phase1RuntimeContext.runtimeMode || '',
      phase1DeterministicReady: phase1RuntimeContext.deterministicReady === true,
      phase1NoFallback: phase1RuntimeContext.noFallback === true,
      phase1RuntimeModelId: phase1RuntimeContext.modelId || '',
      modelExecutionReceipt: promptRuntimeReceipt.schema ? {
        schema: 'simulatte.modelExecutionAuditReceipt.v1',
        promptRuntimeSchema: promptRuntimeReceipt.schema || '',
        ready: promptRuntimeReceipt.ready === true,
        noFallback: promptRuntimeReceipt.noFallback === true,
        providerReady: promptRuntimeReceipt.providerReady === true,
        providerBackend: promptRuntimeReceipt.providerBackend || '',
        cachePrefetch: promptRuntimeReceipt.cachePrefetch === true,
        cacheMode: promptRuntimeReceipt.cacheMode || '',
        cacheVerified: promptRuntimeReceipt.cacheVerified === true,
        embeddingCacheState: promptRuntimeReceipt.embeddingCacheState || '',
        rerankerCacheState: promptRuntimeReceipt.rerankerCacheState || '',
        modelPreparation: promptRuntimeReceipt.modelPreparation || null,
        modelRuntimeLock: promptRuntimeReceipt.modelRuntimeLock || null,
        embeddingModelId: promptRuntimeReceipt.modelId || '',
        embeddingModelHash: promptRuntimeReceipt.modelHash || '',
        embeddingDim: Number(promptRuntimeReceipt.embeddingDim || 0),
        embeddingProbe: promptRuntimeReceipt.embeddingProbe === true,
        embeddingProbeCount: Number(promptRuntimeReceipt.probeCount || 0),
        embeddingProbeDim: Number(promptRuntimeReceipt.probeEmbeddingDim || 0),
        embeddingStabilitySimilarity: Number(promptRuntimeReceipt.stabilitySimilarity || 0),
        embeddingDistinctProbePairs: Number(promptRuntimeReceipt.distinctProbePairs || 0),
        rerankerId: promptRuntimeReceipt.reranker || '',
        rerankerModelId: promptRuntimeReceipt.rerankerModelId || '',
        rerankerModelHash: promptRuntimeReceipt.rerankerModelHash || '',
        rerankerRequired: promptRuntimeReceipt.rerankerRequired === true,
        rerankerReady: promptRuntimeReceipt.rerankerReady === true,
        rerankerStatus: promptRuntimeReceipt.rerankerStatus || '',
        rerankerBackend: promptRuntimeReceipt.rerankerBackend || '',
        rerankerProbeCount: Number(promptRuntimeReceipt.rerankerProbeCount || 0),
        rerankerProbeCandidateCount: Number(promptRuntimeReceipt.rerankerProbeCandidateCount || 0),
        rerankerProbeOutputCount: Number(promptRuntimeReceipt.rerankerProbeOutputCount || 0),
        phase3Rerank: {
          schema: sourceRerankReceipt.schema || phase3RerankReceipt.sourceSchema || '',
          model: sourceRerankReceipt.model || phase3RerankReceipt.sourceModelId || '',
          modelReady: sourceRerankReceipt.modelReady === true,
          modelRequired: sourceRerankReceipt.modelRequired === true,
          modelStatus: sourceRerankReceipt.modelStatus || '',
          modelBackend: sourceRerankReceipt.modelBackend || phase3RerankReceipt.sourceBackend || '',
          candidateInputCount: Number(sourceRerankReceipt.modelCandidateInputCount || 0),
          candidateOutputCount: Number(sourceRerankReceipt.modelCandidateOutputCount || 0),
          candidateInputs: sourceRerankReceipt.modelCandidateInputs || [],
          candidateOutputs: sourceRerankReceipt.modelCandidateOutputs || [],
          candidateSelectionMode: sourceRerankReceipt.candidateSelectionMode || '',
          candidateBudgetPolicy: sourceRerankReceipt.candidateBudgetPolicy || '',
          evidenceCandidateCount: Number(sourceRerankReceipt.evidenceCandidateCount || 0),
          evidenceGroupCount: Number(sourceRerankReceipt.evidenceGroupCount || 0),
          adaptiveCandidateBudget: Number(sourceRerankReceipt.adaptiveCandidateBudget || 0),
          promptScoringPaths: promptRerankScoringPaths,
          promptSelectedTokenLogitCount: Number(sourceRerankReceipt.selectedTokenLogitCount || 0),
          promptSelectedTokenExecutionCount: Number(sourceRerankReceipt.selectedTokenExecutionCount || 0),
          promptScoreCacheHitCount: Number(sourceRerankReceipt.scoreCacheHitCount || 0),
          promptPrefixKvReuseCount: Number(sourceRerankReceipt.prefixKvReuseCount || 0),
          promptPrefixStateReuseCount: Number(sourceRerankReceipt.prefixStateReuseCount || 0),
          promptMinimumPrefixTokenCount: Number(sourceRerankReceipt.minimumPrefixTokenCount || 0),
          promptPrefixPreparationDurationMs: Number(sourceRerankReceipt.prefixPreparationDurationMs || 0),
          promptPrefixTokenizationDurationMs: Number(sourceRerankReceipt.prefixTokenizationDurationMs || 0),
          promptPrefixResetDurationMs: Number(sourceRerankReceipt.prefixResetDurationMs || 0),
          promptPrefixPrimingDurationMs: Number(sourceRerankReceipt.prefixPrimingDurationMs || 0),
          promptRerankCallDurationMs: Number(sourceRerankReceipt.rerankCallDurationMs || 0),
          promptUnattributedRerankDurationMs: Number(sourceRerankReceipt.unattributedRerankDurationMs || 0),
          promptTotalExecutionDurationMs: Number(sourceRerankReceipt.totalExecutionDurationMs || 0),
          promptMeanExecutionDurationMs: Number(sourceRerankReceipt.meanExecutionDurationMs || 0),
          promptMaximumExecutionDurationMs: Number(sourceRerankReceipt.maximumExecutionDurationMs || 0),
          slotRerankCallCount: Number(phase3RerankReceipt.slotRerankCallCount || slotRetrieval.rerankCallCount || 0),
          slotCandidateInputCount: Number(slotRetrieval.rerankCandidateInputCount || 0),
          slotCandidateOutputCount: Number(slotRetrieval.rerankCandidateOutputCount || 0),
          slotScoringPaths: slotRerankScoringPaths,
          slotSelectedTokenLogitCount: Number(slotRetrieval.selectedTokenLogitCount || 0),
          slotSelectedTokenExecutionCount: Number(slotRetrieval.selectedTokenExecutionCount || 0),
          slotScoreCacheHitCount: Number(slotRetrieval.scoreCacheHitCount || 0),
          slotPrefixKvReuseCount: Number(slotRetrieval.prefixKvReuseCount || 0),
          slotPrefixStateReuseCount: Number(slotRetrieval.prefixStateReuseCount || 0),
          slotMinimumPrefixTokenCount: Number(slotRetrieval.minimumPrefixTokenCount || 0),
          slotPrefixPreparationDurationMs: Number(slotRetrieval.prefixPreparationDurationMs || 0),
          slotPrefixTokenizationDurationMs: Number(slotRetrieval.prefixTokenizationDurationMs || 0),
          slotPrefixResetDurationMs: Number(slotRetrieval.prefixResetDurationMs || 0),
          slotPrefixPrimingDurationMs: Number(slotRetrieval.prefixPrimingDurationMs || 0),
          slotRerankCallDurationMs: Number(slotRetrieval.rerankCallDurationMs || 0),
          slotUnattributedRerankDurationMs: Number(slotRetrieval.unattributedRerankDurationMs || 0),
          slotTotalExecutionDurationMs: Number(slotRetrieval.totalExecutionDurationMs || 0),
          slotMaximumExecutionDurationMs: Number(slotRetrieval.maximumExecutionDurationMs || 0),
          scoringPaths: [...new Set([...promptRerankScoringPaths, ...slotRerankScoringPaths])].sort(),
          embeddedSlotCount: Number(phase3RerankReceipt.embeddedSlotCount || slotRetrieval.embeddedSlotCount || 0),
          promptEmbeddingSlotCount: Number(
            phase3RerankReceipt.promptEmbeddingSlotCount || slotRetrieval.promptEmbeddingSlotCount || 0
          ),
          modelEvidenceSlotCount: Number(
            phase3RerankReceipt.modelEvidenceSlotCount || slotRetrieval.modelEvidenceSlotCount || 0
          ),
          slotEmbeddingDurationMs: Number(
            phase3RerankReceipt.slotEmbeddingDurationMs || slotRetrieval.slotEmbeddingDurationMs || 0
          ),
        },
      } : null,
      phase3MissingRequiredSlots: (phase3Retrieval.missingRequiredSlots || []).map((row) => ({
        slotId: row.slotId || '',
        entryId: row.entryId || '',
        reason: row.reason || '',
      })),
      phase3SlotEvidence: (phase3Retrieval.slotEvidence || []).map((row) => ({
        slotId: row.slotId || '',
        entryId: row.entryId || '',
        status: row.status || '',
        acceptedCount: Number(row.acceptedCount || 0),
        acceptedCandidateIds: row.acceptedCandidateIds || [],
      })),
      phase3SlotCandidates: (slotRetrieval.bySlot || []).map((row) => ({
        slotId: row.slotId || '',
        slotRole: row.slotRole || '',
        required: row.required !== false,
        skipReason: row.receipt && row.receipt.skipReason || '',
        localGeometryGrammarId: row.receipt && row.receipt.localGeometryGrammarId || '',
        candidates: (row.candidates || []).slice(0, 8).map((candidate) => ({
          id: candidate.candidateId || candidate.primitiveId || candidate.id || '',
          type: candidate.candidateType || '',
          score: Number(candidate.score || 0),
          embeddingScore: Number(candidate.modelScore || 0),
          lexicalScore: Number(candidate.lexicalScore || 0),
          rerankScore: Number(candidate.modelRerankScore || 0),
          rerankRank: Number(candidate.modelRerankRank || 0),
          rerankRankScore: Number(candidate.modelRerankRankScore || 0),
          rerankBandScore: Number(candidate.modelRerankBandScore || 0),
          rerankEvaluated: candidate.modelRerankEvaluated === true,
          modelEvaluated: candidate.modelEvaluated === true,
          constructionEvidence: candidate.constructionEvidence === true,
          literalSlotMatch: candidate.literalSlotMatch === true,
          supportOnly: candidate.supportOnly === true,
          localGeometryGrammarId: candidate.localGeometryGrammarId || '',
        })),
      })),
      phase4AcceptedNodeIdentities: (phase4AcceptedGraph.nodes || []).map((row) => ({
        id: row.id || '',
        canonicalId: row.canonicalId || '',
        label: row.label || '',
        indexName: row.indexName || '',
        semanticType: row.semanticType || '',
        supportOnly: row.supportOnly === true,
        directlyGrounded: row.directlyGrounded === true,
        construction: constructionAuditSummary(row),
      })),
      phase4AcceptedEdges: (phase4AcceptedGraph.edges || []).map((row) => ({
        id: row.id || '',
        source: row.source || row.from || '',
        target: row.target || row.to || '',
        processId: row.processId || '',
        operatorType: row.operatorType || '',
        causalRuleId: row.provenance && row.provenance.causalRuleId || '',
        causal: row.causal === true,
      })),
      intentBriefCausalGraph: (intentBrief && intentBrief.causalGraph || []).map((row) => ({
        id: row.id || '',
        ruleId: row.ruleId || '',
        sourceRef: row.sourceRef || '',
        targetRef: row.targetRef || '',
        sourceLabel: row.sourceLabel || '',
        targetLabel: row.targetLabel || '',
        processId: row.processId || '',
        operatorType: row.operatorType || '',
        groundingPolicy: row.groundingPolicy || null,
        groundingPolicyEvidence: row.groundingPolicyEvidence || null,
      })),
      phase4Canonicalization: phase4AcceptedGraph.canonicalization || null,
      phase4ConstructionReceipt: phase4AcceptedGraph.constructionReceipt || null,
      phase4CandidateMatchReceipt: phase4AcceptedGraph.candidateMatchReceipt || null,
      phase5EntityIdentities: (phase5PhysicsIR.entities || []).map((row) => ({
        id: row.id || '',
        canonicalId: row.canonicalId || '',
        label: row.label || row.name || '',
        sourceKind: row.sourceKind || '',
        semanticType: row.semanticType || row.type || '',
        supportOnly: row.supportOnly === true,
        construction: constructionAuditSummary(row),
      })),
      phase5OperatorTypes: (phase5PhysicsIR.operators || []).map((row) => row.type || '').filter(Boolean),
      phase5SolverSteps: (phase5SolverGraph.steps || []).map((row) => ({
        id: row.id || '',
        operatorType: row.operatorType || '',
        solverId: row.solverId || '',
        reads: row.reads || row.inputs || [],
        writes: row.writes || row.outputs || [],
      })),
      phase5RenderIRObjects: (phase5RenderIR.objects || []).map((row) => ({
        id: row.id || '',
        label: row.label || '',
        semanticRef: row.semanticRef || '',
        physicalRef: row.physicalRef || '',
        directlyGrounded: row.directlyGrounded === true,
        glyph: row.glyph || '',
      })),
      phase6VisualAcceptance: (phase6VisualCompile && phase6VisualCompile.visualAcceptance || []).map((row) => ({
        id: row.id || '',
        sourceKind: row.sourceKind || '',
        phrase: row.phrase || '',
        status: row.status || '',
        reason: row.reason || '',
        promptGrounded: row.promptGrounded === true,
        supportOnly: row.supportOnly === true,
      })),
      phase6CompositionObligations: (phase6CompositionLedger.obligations || []).map((row) => ({
        id: row.id || row.obligationId || '',
        kind: row.kind || '',
        target: row.target || '',
        required: row.required === true,
        status: row.status || '',
        visualEvidence: row.visualEvidence || [],
      })),
      sceneRenderPacketSurfaceContacts: sceneRenderPacket && sceneRenderPacket.receipts &&
        sceneRenderPacket.receipts.framing && Array.isArray(sceneRenderPacket.receipts.framing.surfaceContacts)
        ? sceneRenderPacket.receipts.framing.surfaceContacts.map((row) => ({
          constraintId: row.constraintId || '',
          sourceId: row.sourceId || '',
          targetId: row.targetId || '',
          clearanceBefore: Number(row.clearanceBefore || 0),
          clearanceAfter: Number(row.clearanceAfter || 0),
        }))
        : [],
      sceneRenderPacketGraspContacts: sceneRenderPacket && sceneRenderPacket.receipts &&
        sceneRenderPacket.receipts.framing && Array.isArray(sceneRenderPacket.receipts.framing.graspContacts)
        ? sceneRenderPacket.receipts.framing.graspContacts.map((row) => ({
          constraintId: row.constraintId || '',
          sourceId: row.sourceId || '',
          targetId: row.targetId || '',
          sourcePartIds: row.sourcePartIds || [],
          targetPartId: row.targetPartId || '',
          endpointDistanceAfter: Number(row.endpointDistanceAfter || 0),
        }))
        : [],
      sceneRenderPacketIdentities: (sceneRenderPacket && sceneRenderPacket.entities || []).map((row) => ({
        id: row.id || '',
        label: row.label || '',
        type: row.identity && row.identity.type || '',
        sourceLabel: row.identity && row.identity.sourceLabel || '',
        layerSlot: row.layerSlot || '',
        animationKind: row.animation && row.animation.kind || '',
        animationSpeed: Number(row.animation && row.animation.speed || 0),
        animationAmplitude: Number(row.animation && row.animation.amplitude || 0),
        animationPhase: Number(row.animation && row.animation.phase || 0),
        grammarId: row.geometry && row.geometry.program && row.geometry.program.grammarId || '',
        literal: row.geometry && row.geometry.program && row.geometry.program.literal === true,
        unsupportedIdentity: row.geometry && row.geometry.program && row.geometry.program.unsupportedIdentity === true,
        partCount: row.geometry && row.geometry.program && Array.isArray(row.geometry.program.parts)
          ? row.geometry.program.parts.length : 0,
        propertyBindings: row.geometry && row.geometry.program && row.geometry.program.promptPropertyBindings || [],
      })),
      canvasWidth: width,
      canvasHeight: height,
      physicsCanvasRenderer: canvas && canvas.dataset ? canvas.dataset.renderer || '' : '',
      physicsCanvasRendererStatus: canvas && canvas.dataset ? canvas.dataset.rendererStatus || '' : '',
      physicsCanvasSceneKind: canvas && canvas.dataset ? canvas.dataset.sceneKind || '' : '',
      physicsCanvasSceneId: canvas && canvas.dataset ? canvas.dataset.sceneId || '' : '',
      physicsCanvasSceneMix: canvas && canvas.dataset ? canvas.dataset.sceneMix || '' : '',
      physicsCanvasSceneMixSlots: canvas && canvas.dataset ? canvas.dataset.sceneMixSlots || '' : '',
      phase7Input: canvas && canvas.dataset ? canvas.dataset.phase7Input || '' : '',
      phase7RenderExecutionInput: canvas && canvas.dataset
        ? canvas.dataset.phase7Input === 'simulatte.renderExecutionInput.v1'
          ? canvas.dataset.phase7Input
          : canvas.dataset.renderExecutionInput || ''
        : '',
      renderExecutionInput: canvas && canvas.dataset ? canvas.dataset.renderExecutionInput || '' : '',
      phase7SceneRenderPacketInput: canvas && canvas.dataset
        ? canvas.dataset.phase7SceneRenderPacketInput ||
          (canvas.dataset.phase7Input === 'simulatte.sceneRenderPacket.v1' ? canvas.dataset.phase7Input : '')
        : '',
      phase7Output: canvas && canvas.dataset ? canvas.dataset.phase7Output || '' : '',
      phase7OutputInput: canvas && canvas.dataset ? canvas.dataset.phase7OutputInput || '' : '',
      phase8Output: canvas && canvas.dataset ? canvas.dataset.phase8Output || '' : '',
      sceneProofVerdict: canvas && canvas.dataset ? canvas.dataset.sceneProofVerdict || '' : '',
      sceneProofError: canvas && canvas.dataset ? canvas.dataset.sceneProofError || '' : '',
      sceneProofLostCount: canvas && canvas.dataset ? canvas.dataset.sceneProofLostCount || '0' : '0',
      sceneProofNotProvenCount: canvas && canvas.dataset ? canvas.dataset.sceneProofNotProvenCount || '0' : '0',
      sceneProofRequiredLostIds: canvas && canvas.dataset ? canvas.dataset.sceneProofRequiredLostIds || '[]' : '[]',
      sceneProofRequiredNotProvenIds: canvas && canvas.dataset
        ? canvas.dataset.sceneProofRequiredNotProvenIds || '[]'
        : '[]',
      sceneProofRequiredFailures: canvas && canvas.dataset
        ? canvas.dataset.sceneProofRequiredFailures || '[]'
        : '[]',
      phase7RenderData: canvas && canvas.dataset ? canvas.dataset.phase7RenderData || '' : '',
      phase7RenderDataKey: canvas && canvas.dataset ? canvas.dataset.phase7RenderDataKey || '' : '',
      phase7RenderPath: canvas && canvas.dataset ? canvas.dataset.phase7RenderPath || '' : '',
      phase7RendererConsumption: rendererConsumption,
      webgpuObjectRealization: objectRealization,
      phase7CameraConsumed: rendererConsumption && rendererConsumption.cameraConsumed === true,
      phase7LightCountConsumed: Number(rendererConsumption && rendererConsumption.lightCountConsumed || 0),
      phase7MaterialCountConsumed: Number(rendererConsumption && rendererConsumption.materialCountConsumed || 0),
      phase7DepthEnabled: rendererConsumption && rendererConsumption.depthEnabled === true,
      phase7NormalShading: rendererConsumption && rendererConsumption.normalShading === true,
      phase7ConstructionProgramCount: Number(rendererConsumption && rendererConsumption.constructionProgramCount || 0),
      phase7ModelEvaluatedConstructionCount: Number(rendererConsumption && rendererConsumption.modelEvaluatedConstructionCount || 0),
      phase7InputVisualObligationCount: canvas && canvas.dataset
        ? Number(canvas.dataset.phase7InputVisualObligationCount || 0)
        : 0,
      phase7PixelReadback: canvas && canvas.dataset ? canvas.dataset.phase7PixelReadback || '' : '',
      phase7PixelReadbackMessage: canvas && canvas.dataset ? canvas.dataset.phase7PixelReadbackMessage || '' : '',
      phase7PixelReadbackPlan: canvas && canvas.dataset ? canvas.dataset.phase7PixelReadbackPlan || '' : '',
      phase7LivePixelSamplesRequired: canvas && canvas.dataset ? canvas.dataset.phase7LivePixelSamplesRequired || '' : '',
      phase7RequiredVisualObligationCount: canvas && canvas.dataset
        ? Number(canvas.dataset.phase7RequiredVisualObligationCount || 0)
        : 0,
      phase7PixelProofStatus: canvas && canvas.dataset ? canvas.dataset.phase7PixelProofStatus || '' : '',
      phase7PixelSampleCount: canvas && canvas.dataset ? Number(canvas.dataset.phase7PixelSampleCount || 0) : 0,
      phase7PixelVisibleSampleCount: canvas && canvas.dataset ? Number(canvas.dataset.phase7PixelVisibleSampleCount || 0) : 0,
      phase7PixelMinContrast: canvas && canvas.dataset ? Number(canvas.dataset.phase7PixelMinContrast || 0) : 0,
      phase7PixelSampledObligationCount: canvas && canvas.dataset ? Number(canvas.dataset.phase7PixelSampledObligationCount || 0) : 0,
      phase7PixelRequiredObligationCount: canvas && canvas.dataset ? Number(canvas.dataset.phase7PixelRequiredObligationCount || 0) : 0,
      phase7PixelSampledObligations: canvas && canvas.dataset ? canvas.dataset.phase7PixelSampledObligations || '' : '',
      phase7PixelSamples,
      webgpuOptimizationPath: canvas && canvas.dataset ? canvas.dataset.webgpuOptimizationPath || '' : '',
      webgpuFeatureFlags: canvas && canvas.dataset ? canvas.dataset.webgpuFeatureFlags || '' : '',
      webgpuSceneInstanceCapacity: canvas && canvas.dataset ? Number(canvas.dataset.webgpuSceneInstanceCapacity || 0) : 0,
      webgpuSceneInstanceCount: canvas && canvas.dataset ? Number(canvas.dataset.webgpuSceneInstanceCount || 0) : 0,
      webgpuStorageBytes: canvas && canvas.dataset ? Number(canvas.dataset.webgpuStorageBytes || 0) : 0,
      phaseArtifactSchemas,
      sceneRenderPacket: canvas && canvas.dataset ? canvas.dataset.sceneRenderPacket || '' : '',
      sceneRenderEntityCount: canvas && canvas.dataset ? Number(canvas.dataset.sceneRenderEntityCount || 0) : 0,
      sceneRenderFieldCount: canvas && canvas.dataset ? Number(canvas.dataset.sceneRenderFieldCount || 0) : 0,
      sceneRenderEffectCount: canvas && canvas.dataset ? Number(canvas.dataset.sceneRenderEffectCount || 0) : 0,
      sceneRenderSpatialHash: canvas && canvas.dataset ? canvas.dataset.sceneRenderSpatialHash || '' : '',
      sceneObjectUniforms: canvas && canvas.dataset ? canvas.dataset.sceneObjectUniforms || '' : '',
      sceneObjectIdentities: canvas && canvas.dataset ? canvas.dataset.sceneObjectIdentities || '' : '',
      sceneRenderPacketEntities: (sceneRenderPacket && sceneRenderPacket.entities || []).map((row) => ({
        id: row.id || '',
        label: row.label || '',
        identity: row.identity && row.identity.type || '',
        directlyGrounded: row.directlyGrounded === true,
        supportOnly: row.supportOnly === true,
        representedEntityIds: (row.representedEntityIds || []).slice(0, 12),
        position: row.transform && row.transform.position || [],
        scale: row.transform && row.transform.scale || [],
        grammarId: row.geometry && row.geometry.program && row.geometry.program.grammarId || '',
      })),
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
      visualIRRenderInstanceCount: visualIRArrayCount('renderInstances'),
      visualIRRejectedRowCount: visualIRArrayCount('rejectedRows'),
      visualIRReceiptCount: visualIRArrayCount('receipts'),
      visualIRCausalAffordanceCount: visualIRArrayCount('causalAffordances'),
      visualIRSceneRenderPacketSchema: sceneRenderPacket && sceneRenderPacket.schema || '',
      visualIRSceneRenderPacketCompiler: sceneRenderPacket && sceneRenderPacket.compiler || '',
      visualIREnvironmentProgram: sceneRenderPacket && sceneRenderPacket.environmentProgram &&
        sceneRenderPacket.environmentProgram.kind || '',
      visualIRSceneRenderPacketEntityCount: sceneRenderPacket && Array.isArray(sceneRenderPacket.entities)
        ? sceneRenderPacket.entities.length
        : 0,
      visualIRSceneRenderPacketFieldCount: sceneRenderPacket && Array.isArray(sceneRenderPacket.fields)
        ? sceneRenderPacket.fields.length
        : 0,
      visualIRSceneRenderPacketEffectCount: sceneRenderPacket && Array.isArray(sceneRenderPacket.effects)
        ? sceneRenderPacket.effects.length
        : 0,
      phase6VisualObligationCount: phase6VisualCompile && Array.isArray(phase6VisualCompile.visualObligations)
        ? phase6VisualCompile.visualObligations.length
        : 0,
      phase6VisualObligationIds: phase6VisualCompile && Array.isArray(phase6VisualCompile.visualObligations)
        ? phase6VisualCompile.visualObligations.map((row) => row.obligationId || row.id || '').filter(Boolean)
        : [],
      visualIRSceneRenderPacketLayers: sceneRenderPacket ? Array.from(new Set([
        ...((sceneRenderPacket.entities || []).map((row) => row.layerSlot)),
        ...((sceneRenderPacket.fields || []).map((row) => row.layerSlot)),
        ...((sceneRenderPacket.effects || []).map((row) => row.layerSlot)),
      ].filter(Boolean))).slice(0, 24) : [],
      visualIRSceneRenderPacketIdentities: sceneRenderPacket ? Array.from(new Set(
        (sceneRenderPacket.entities || [])
          .map((row) => row && row.identity && (row.identity.label || row.identity.type))
          .filter(Boolean)
      )).slice(0, 32) : [],
      visualIRAcceptedRenderInstances: (visualIR && Array.isArray(visualIR.renderInstances) ? visualIR.renderInstances : [])
        .filter((row) => row.status !== 'rejected')
        .length,
      visualIRRenderInstanceSlots: (visualIR && Array.isArray(visualIR.renderInstances) ? visualIR.renderInstances : [])
        .map((row) => row.layerSlot)
        .filter(Boolean)
        .slice(0, 24),
      visualIRRejectedRows: (visualIR && Array.isArray(visualIR.rejectedRows) ? visualIR.rejectedRows : [])
        .map((row) => ({
          id: row.id || '',
          sourceKind: row.sourceKind || '',
          reason: row.reason || '',
        }))
        .slice(0, 16),
      visualIRGraphicsAtomCount: ['geometry', 'fields', 'materials', 'processes', 'motion', 'camera']
        .reduce((sum, key) => sum + (Array.isArray(graphicsAtoms[key]) ? graphicsAtoms[key].length : 0), 0),
      visualIRGraphicsMappingIds: (graphicsAtoms.mappings || []).map((row) => row.id).slice(0, 12),
      visualIRGraphicsCompiler: graphicsAtoms.compiler || '',
      visualIRGraphicsUniformSlots: Object.entries(atomUniforms.bySlot || {})
        .filter((entry) => Number(entry[1]) > 0)
        .map((entry) => entry[0]),
      visualIRGraphicsUniformValues: Object.fromEntries(Object.entries(atomUniforms.bySlot || {})
        .filter((entry) => Number(entry[1]) > 0)
        .map((entry) => [entry[0], Number(Number(entry[1]).toFixed(3))])),
      visualIRGraphicsWgslOperators: (graphicsAtoms.wgslOperators || []).slice(0, 16),
      visualIRGraphicsLanguageSignals: (graphicsAtoms.languageSignals || []).map((row) => ({
        id: row.id || '',
        kind: row.kind || '',
        text: row.text || '',
        slots: row.slots || []
      })).slice(0, 24),
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
  markStage('viewport-screenshot');
  const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false, fromSurface: true });
  const file = `${label}.png`;
  const bytes = Buffer.from(screenshot.data, 'base64');
  await fs.writeFile(path.join(outDir, file), bytes);
  let canvasScreenshot = '';
  let canvasScreenshotLater = '';
  let canvasStats = null;
  let canvasStatsLater = null;
  let canvasScreenshotHash = '';
  let canvasScreenshotLaterHash = '';
  let canvasPerceptualHash = '';
  let canvasPerceptualHashLater = '';
  let canvasDiversityScreenshot = '';
  let canvasDiversityScreenshotLater = '';
  let canvasDiversityPerceptualHash = '';
  let canvasDiversityPerceptualHashLater = '';
  if (diagnostics.canvasRect && diagnostics.canvasRect.width > 0 && diagnostics.canvasRect.height > 0) {
    markStage('temporal-canvas-capture');
    try {
      const clip = {
        x: Math.max(0, diagnostics.canvasRect.x),
        y: Math.max(0, diagnostics.canvasRect.y),
        width: Math.max(1, diagnostics.canvasRect.width),
        height: Math.max(1, diagnostics.canvasRect.height),
        scale: 1,
      };
      const clipped = await captureCleanCanvasScreenshot(cdp, clip);
      const clipBytes = Buffer.from(clipped.data, 'base64');
      canvasScreenshot = `${label}.canvas.png`;
      await fs.writeFile(path.join(outDir, canvasScreenshot), clipBytes);
      canvasStats = pngVisualStats(clipBytes);
      canvasScreenshotHash = sha256Hex(clipBytes);
      await delay(frameDelayMs);
      const clippedLater = await captureCleanCanvasScreenshot(cdp, clip);
      const clipBytesLater = Buffer.from(clippedLater.data, 'base64');
      canvasScreenshotLater = `${label}.canvas-late.png`;
      await fs.writeFile(path.join(outDir, canvasScreenshotLater), clipBytesLater);
      canvasStatsLater = pngVisualStats(clipBytesLater);
      canvasScreenshotLaterHash = sha256Hex(clipBytesLater);
      canvasPerceptualHash = canvasStats && canvasStats.perceptualHash || '';
      canvasPerceptualHashLater = canvasStatsLater && canvasStatsLater.perceptualHash || '';
    } catch (_err) {
      canvasStats = null;
      canvasStatsLater = null;
    }
  }
  if (diagnostics.canvasRect && diagnostics.canvasRect.width > 0 && diagnostics.canvasRect.height > 0) {
    markStage('frozen-canvas-capture');
    try {
      await evaluate(cdp, `(() => {
        const canvas = document.getElementById('physics-canvas');
        if (!canvas || !canvas.dataset) return false;
        canvas.dataset.auditFreezeFrame = 'true';
        return true;
      })()`);
      await delay(Math.max(80, Math.min(frameDelayMs, 240)));
      const clip = {
        x: Math.max(0, diagnostics.canvasRect.x),
        y: Math.max(0, diagnostics.canvasRect.y),
        width: Math.max(1, diagnostics.canvasRect.width),
        height: Math.max(1, diagnostics.canvasRect.height),
        scale: 1,
      };
      const frozen = await captureCleanCanvasScreenshot(cdp, clip);
      const frozenBytes = Buffer.from(frozen.data, 'base64');
      canvasDiversityScreenshot = `${label}.canvas-diversity.png`;
      await fs.writeFile(path.join(outDir, canvasDiversityScreenshot), frozenBytes);
      canvasDiversityPerceptualHash = pngVisualStats(frozenBytes)?.perceptualHash || '';
      await delay(Math.max(80, Math.min(frameDelayMs, 240)));
      const frozenLater = await captureCleanCanvasScreenshot(cdp, clip);
      const frozenLaterBytes = Buffer.from(frozenLater.data, 'base64');
      canvasDiversityScreenshotLater = `${label}.canvas-diversity-late.png`;
      await fs.writeFile(path.join(outDir, canvasDiversityScreenshotLater), frozenLaterBytes);
      canvasDiversityPerceptualHashLater = pngVisualStats(frozenLaterBytes)?.perceptualHash || '';
    } catch (_err) {
      canvasDiversityPerceptualHash = '';
      canvasDiversityPerceptualHashLater = '';
    } finally {
      await evaluate(cdp, `(() => {
        const canvas = document.getElementById('physics-canvas');
        if (canvas && canvas.dataset) canvas.dataset.auditFreezeFrame = 'false';
      })()`);
    }
  }
  markStage('analyze');
  const sceneRenderPacketCanonicalJson = diagnostics.sceneRenderPacketCanonicalJson || '';
  delete diagnostics.sceneRenderPacketCanonicalJson;
  const finalDiagnostics = { ...diagnostics, ...settledProof };
  finalDiagnostics.promptSha256 = sha256Hex(prompt);
  finalDiagnostics.sceneRenderPacketSha256 = sceneRenderPacketCanonicalJson
    ? sha256Hex(sceneRenderPacketCanonicalJson)
    : '';
  finalDiagnostics.sceneRenderPacketHashKind = 'sha256:canonical-json-recursive-key-sort-v1';
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
  finalDiagnostics.canvasScreenshotLater = canvasScreenshotLater;
  finalDiagnostics.canvasScreenshotHash = canvasScreenshotHash;
  finalDiagnostics.canvasScreenshotLaterHash = canvasScreenshotLaterHash;
  finalDiagnostics.canvasPerceptualHash = canvasPerceptualHash;
  finalDiagnostics.canvasPerceptualHashLater = canvasPerceptualHashLater;
  finalDiagnostics.canvasDiversityScreenshot = canvasDiversityScreenshot;
  finalDiagnostics.canvasDiversityScreenshotLater = canvasDiversityScreenshotLater;
  finalDiagnostics.canvasDiversityPerceptualHash = canvasDiversityPerceptualHash;
  finalDiagnostics.canvasDiversityPerceptualHashLater = canvasDiversityPerceptualHashLater;
  finalDiagnostics.canvasDiversityHashKind = 'audit:visual-clean-canvas-dhash-64';
  finalDiagnostics.consentDeclinedBeforeRun = consentDeclinedBeforeRun;
  finalDiagnostics.canvasDiversityFrameStable = Boolean(canvasDiversityPerceptualHash &&
    canvasDiversityPerceptualHash === canvasDiversityPerceptualHashLater);
  finalDiagnostics.canvasFrameHashChanged = Boolean(canvasScreenshotHash && canvasScreenshotLaterHash && canvasScreenshotHash !== canvasScreenshotLaterHash);
  if (canvasStats) {
    finalDiagnostics.canvasScreenshotWidth = canvasStats.width;
    finalDiagnostics.canvasScreenshotHeight = canvasStats.height;
    finalDiagnostics.canvasScreenshotLumaStd = canvasStats.lumaStd;
    finalDiagnostics.canvasScreenshotColoredRatio = canvasStats.coloredRatio;
    finalDiagnostics.canvasScreenshotSampleCount = canvasStats.sampleCount;
    finalDiagnostics.canvasScreenshotNearWhiteRatio = canvasStats.nearWhiteRatio;
    finalDiagnostics.canvasScreenshotStrongEdgeRatio = canvasStats.strongEdgeRatio;
  }
  if (canvasStats && canvasStatsLater) {
    const frameDifference = sampledFrameDifference(canvasStats, canvasStatsLater);
    finalDiagnostics.canvasFrameSampleHashChanged = canvasStats.hash !== canvasStatsLater.hash;
    finalDiagnostics.canvasFrameLumaMeanDelta = Number(Math.abs(canvasStats.lumaMean - canvasStatsLater.lumaMean).toFixed(3));
    finalDiagnostics.canvasFrameLumaStdDelta = Number(Math.abs(canvasStats.lumaStd - canvasStatsLater.lumaStd).toFixed(3));
    finalDiagnostics.canvasFrameColoredRatioDelta = Number(Math.abs(canvasStats.coloredRatio - canvasStatsLater.coloredRatio).toFixed(4));
    finalDiagnostics.canvasFrameMeanAbsolutePixelDelta = frameDifference.meanAbsoluteDelta;
    finalDiagnostics.canvasFrameChangedPixelRatio = frameDifference.changedPixelRatio;
  }
  finalDiagnostics.visualRubric = visualRubricForResult(finalDiagnostics, prompt);
  markStage('complete');
  const auditCompletedAt = Date.now();
  const auditTiming = {
    schema: 'simulatte.visualAuditTiming.v1',
    durationMs: auditCompletedAt - auditStartedAt,
    stages: [...auditStages, { id: activeStage.id, durationMs: auditCompletedAt - activeStage.startedAt }],
  };
  return {
    index: index + 1,
    kind: entry.kind,
    goldRowId: entry.goldRowId || '',
    prompt,
    screenshot: file,
    screenshotHash: sha256Hex(bytes),
    auditTiming,
    ...finalDiagnostics,
  };
}

function visualRubricForResult(result, prompt) {
  const expectedSignals = expectedVisualSignals(prompt);
  const uniformSlots = new Set(array(result.visualIRGraphicsUniformSlots));
  const mappingIds = new Set(array(result.visualIRGraphicsMappingIds));
  const wgslOperators = new Set(array(result.visualIRGraphicsWgslOperators));
  const languageSignals = array(result.visualIRGraphicsLanguageSignals)
    .flatMap((row) => [row.id, row.kind, row.text, ...array(row.slots)])
    .map((value) => String(value || '').toLowerCase());
  const matchedSignals = [];
  const missingSignals = [];
  for (const signal of expectedSignals) {
    const slotHits = signal.slots.filter((slot) => uniformSlots.has(slot));
    const mappingHits = signal.mappingIds.filter((id) => mappingIds.has(id));
    const wgslHits = signal.wgslOperators.filter((id) => wgslOperators.has(id));
    const languageHits = languageSignals.filter((value) => value.includes(signal.id)).slice(0, 3);
    const renderedEvidence = renderedSignalEvidence(signal, result);
    const strength = Math.min(1, slotHits.length * 0.45 + mappingHits.length * 0.4 +
      wgslHits.length * 0.3 + languageHits.length * 0.2 + renderedEvidence.strength);
    const row = {
      id: signal.id,
      strength: Number(strength.toFixed(3)),
      slotHits,
      mappingHits,
      wgslHits,
      languageHits,
      renderedEvidence,
    };
    if (strength >= 0.35) matchedSignals.push(row);
    else missingSignals.push(row);
  }
  const expectedCount = expectedSignals.length;
  const coverage = expectedCount ? matchedSignals.length / expectedCount : 1;
  const contrast = clamp01((Number(result.lumaStd || 0) - 8) / 36);
  const color = clamp01((Number(result.coloredRatio || 0) - 0.035) / 0.24);
  const atomRichness = clamp01(Number(result.visualIRGraphicsAtomCount || 0) / Math.max(8, expectedCount * 5));
  const representation = representationQualityForResult(result, expectedCount);
  const dynamicMagnitude = Math.max(
    clamp01(Number(result.canvasFrameLumaMeanDelta || 0) / 0.6),
    clamp01(Number(result.canvasFrameLumaStdDelta || 0) / 0.6),
    clamp01(Number(result.canvasFrameColoredRatioDelta || 0) / 0.006),
    clamp01(Number(result.canvasFrameMeanAbsolutePixelDelta || 0) / 3),
    clamp01(Number(result.canvasFrameChangedPixelRatio || 0) / 0.04)
  );
  const dynamic = dynamicMagnitude >= 0.18 ? 1 : 0;
  const dynamicRequired = promptRequiresVisibleDynamics(prompt);
  const dynamicPass = dynamicRequired ? dynamic : 1;
  const genericPenalty = /^(generic|literal-composite|blank)$/.test(String(result.rendererSceneKind || result.visualIRSceneKind || '')) ? 0.18 : 0;
  const score = Math.max(0, Math.round(100 * (
    coverage * 0.42 +
    dynamicPass * 0.16 +
    representation.quality * 0.18 +
    atomRichness * 0.1 +
    contrast * 0.07 +
    color * 0.07 -
    genericPenalty
  )));
  return {
    schema: 'simulatte.visualPromptRubric.v1',
    score,
    pass: score >= 72 &&
      coverage >= 0.66 &&
      dynamicPass > 0 &&
      representation.quality >= 0.5 &&
      representation.structuralProgramFit >= 0.75 &&
      representation.framing >= 0.75 &&
      missingSignals.length <= Math.max(1, Math.floor(expectedCount / 3)),
    expectedCount,
    coverage: Number(coverage.toFixed(3)),
    representationQuality: Number(representation.quality.toFixed(3)),
    representationQualityScope: 'render-contract-and-pixel-presence',
    recognizabilityStatus: 'human-adjudication-required',
    representation,
    dynamic: Boolean(dynamic),
    dynamicRequired,
    dynamicPass: Boolean(dynamicPass),
    dynamicMagnitude: Number(dynamicMagnitude.toFixed(3)),
    atomRichness: Number(atomRichness.toFixed(3)),
    contrast: Number(contrast.toFixed(3)),
    color: Number(color.toFixed(3)),
    expectedSignals: expectedSignals.map((row) => row.id),
    matchedSignals,
    missingSignals: missingSignals.map((row) => row.id),
  };
}

function promptRequiresVisibleDynamics(prompt = '') {
  return /\b(swim|swims|swimming|fly|flies|flying|orbit|orbits|orbiting|flow|flows|float|floats|floating|run|runs|running|move|moves|moving|spin|spins|rotate|rotates|rotating|fall|falls|falling|melt|melts|melting|grow|grows|growing|jump|jumps|crash|crashes|collide|collides|wave|waves|waving|pulse|pulses|pulsing|play|plays|playing|carve|carves|carving|sort|sorts|sorting|route|routes|routing)\b/i.test(prompt);
}

function representationQualityForResult(result, expectedCount) {
  const sceneKind = String(result.rendererSceneKind || result.visualIRSceneKind || '');
  const languageSignalCount = array(result.visualIRGraphicsLanguageSignals).length;
  const consumption = result.phase7RendererConsumption || {};
  const realization = result.webgpuObjectRealization || {};
  const entityCount = Math.max(1, Number(realization.entityCount || result.visualIRSceneRenderPacketEntityCount || 0));
  const requiredRelations = array(result.phase6CompositionObligations)
    .filter((row) => row.required === true && row.kind === 'relation');
  const surfaceContacts = array(result.sceneRenderPacketSurfaceContacts);
  const graspContacts = array(result.sceneRenderPacketGraspContacts);
  const provenRelations = requiredRelations.filter((row) => (
    row.status === 'preserved' && array(row.visualEvidence).length > 0 &&
    (!String(row.id || '').startsWith('relation:spatial:') ||
      array(row.visualEvidence).includes(`layout-relation:${row.id}`)) &&
    (!/^relation:spatial:[^:]+:(?:on|onto|seated-on|supports):/.test(String(row.id || '')) ||
      surfaceContacts.some((contact) => (
        contact.constraintId === row.id && contact.clearanceAfter >= -0.02 && contact.clearanceAfter <= 0.01
      ))) &&
    (!/^relation:[^:]+:(?:hold|holds|holding|grasp|grasps|grasping|carry|carries|carrying|clutch|clutches|clutching):/.test(String(row.id || '')) ||
      graspContacts.some((contact) => (
        contact.constraintId === row.id && array(contact.sourcePartIds).length > 0 &&
        contact.targetPartId && contact.endpointDistanceAfter <= 0.015
      )))
  ));
  const dimensions = {
    realizedGeometry: clamp01(Number(realization.realizedCount || 0) / entityCount),
    constructiveGrounding: clamp01(Number(consumption.modelEvaluatedConstructionCount || 0) / entityCount),
    structuralProgramFit: Math.min(
      clamp01(Number(realization.topologyVerifiedCount || 0) / entityCount),
      clamp01(Number(realization.semanticFitCount || 0) / entityCount)
    ),
    framing: realization.framingPass === true
      ? 1
      : clamp01(Number(realization.projectedArea || 0) / Math.min(0.16, entityCount * 0.045)),
    materialResponse: consumption.normalShading === true
      ? clamp01(Number(consumption.materialCountConsumed || 0) / entityCount) : 0,
    cameraResponse: consumption.cameraConsumed === true ? 1 : 0,
    lightResponse: Number(consumption.lightCountConsumed || 0) > 0 && consumption.normalShading === true ? 1 : 0,
    depthResponse: consumption.depthEnabled === true ? 1 : 0,
    spatialRelations: requiredRelations.length ? provenRelations.length / requiredRelations.length : 1,
    sceneSpecificity: sceneKind && !/^(generic|literal-composite|blank|mechanical|custom-world)$/.test(sceneKind) ? 1 : 0,
    promptBinding: clamp01(languageSignalCount / Math.max(6, expectedCount * 3)) *
      clamp01(Number(realization.realizedCount || 0) / entityCount),
  };
  const quality = (
    dimensions.realizedGeometry * 0.14 +
    dimensions.constructiveGrounding * 0.08 +
    dimensions.structuralProgramFit * 0.18 +
    dimensions.framing * 0.15 +
    dimensions.materialResponse * 0.09 +
    dimensions.cameraResponse * 0.08 +
    dimensions.lightResponse * 0.07 +
    dimensions.depthResponse * 0.07 +
    dimensions.spatialRelations * 0.07 +
    dimensions.sceneSpecificity * 0.035 +
    dimensions.promptBinding * 0.035
  );
  return {
    schema: 'simulatte.visualRepresentationQuality.v1',
    quality: Number(quality.toFixed(3)),
    scope: 'render-contract-and-pixel-presence',
    recognizabilityStatus: 'not-measured-by-machine-rubric',
    ...Object.fromEntries(Object.entries(dimensions).map(([key, value]) => [key, Number(value.toFixed(3))])),
  };
}

function expectedVisualSignals(prompt) {
  const text = positiveLanguageText(prompt);
  return VISUAL_RUBRIC_SIGNALS.filter((signal) => signal.pattern.test(text));
}

function positiveLanguageText(value = '') {
  const word = "[a-z0-9]+(?:[-'][a-z0-9]+)*";
  const stop = '(?:and|with|while|where|when|because|but|however|though|although|unless|inside|outside|near|around|between|against|across|during|through|then|so)';
  const negated = new RegExp(`\\b(?:no|not|never|none|without|cannot|can't|wont|won't|avoid|exclude|except)\\b(?:\\s+(?:a|an|the|any))?(?:\\s+(?!\\b${stop}\\b)${word}){1,6}`, 'gi');
  return String(value || '').toLowerCase().replace(negated, ' ').replace(/\s+/g, ' ').trim();
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function parseJsonArray(value) {
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value || '[]'));
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function phase3ConstructionGate(result = {}) {
  const constructionRoles = new Set(['actor', 'concept', 'object', 'part', 'environment']);
  const slotEntryIds = new Map(array(result.phase3SlotEvidence).map((row) => [row.slotId, row.entryId]));
  const realizedIdentities = array(result.sceneRenderPacketIdentities);
  const requiredSlots = array(result.phase3SlotCandidates).filter((slot) => (
    slot.required !== false && constructionRoles.has(String(slot.slotRole || ''))
  ));
  const rows = requiredSlots.map((slot) => {
    const localGeometryGrammarId = String(slot.localGeometryGrammarId ||
      array(slot.candidates).find((candidate) => candidate.localGeometryGrammarId)?.localGeometryGrammarId || '');
    const targetId = constructionIdentityKey(slotEntryIds.get(slot.slotId) || slot.slotId);
    const realizedLocal = realizedIdentities.some((identity) => (
      [identity.type, identity.sourceLabel, identity.label]
        .some((value) => constructionIdentityKey(value) === targetId) &&
      identity.literal === true && identity.unsupportedIdentity !== true &&
      Number(identity.partCount || 0) >= 2 && /^object-grammar\.(?!object$)[a-z0-9.-]+$/.test(String(identity.grammarId || ''))
    ));
    const localProven = /^object-grammar\.(?!object$)[a-z0-9.-]+$/.test(localGeometryGrammarId) || realizedLocal;
    const modelEvaluated = array(slot.candidates).some((candidate) => (
      candidate.modelEvaluated === true && candidate.constructionEvidence === true
    ));
    return { slotId: slot.slotId || '', localGeometryGrammarId, realizedLocal, localProven, modelEvaluated };
  });
  return {
    requiredCount: rows.length,
    localProvenCount: rows.filter((row) => row.localProven).length,
    modelRequiredCount: rows.filter((row) => !row.localProven && row.modelEvaluated).length,
    missingSlots: rows.filter((row) => !row.localProven && !row.modelEvaluated),
  };
}

function constructionIdentityKey(value = '') {
  return String(value || '').toLowerCase().replace(/^(?:actor|concept|entity|environment|object|part|slot)[.:]/, '')
    .replace(/_/g, '-').replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
}

function analyze(results, options = {}) {
  const failures = [];
  const perceptualHashes = new Map();
  for (const result of results) {
    if (result.auditError) {
      result.visualRubric = {
        score: 0,
        pass: false,
        expectedSignals: [],
        missingSignals: ['audit-completion'],
        dynamicRequired: false,
        dynamic: false,
        representationQuality: 0,
      };
      failures.push(`${result.index}: prompt audit failed: ${result.auditError}`);
      continue;
    }
    const rubric = result.visualRubric || visualRubricForResult(result, result.prompt);
    result.visualRubric = rubric;
    if (!auditPromptMatches(result.prompt, result.compiledPrompt)) {
      failures.push(`${result.index}: compiled prompt does not match submitted prompt`);
    }
    if (options.intentMode === 'model') {
      for (const failure of modelPreparationFailures(result.modelExecutionReceipt)) {
        failures.push(`${result.index}: ${failure}`);
      }
    }
    const matchReceipt = result.phase4CandidateMatchReceipt || {};
    const expectedPairEvaluations = Number(matchReceipt.nodeCount || 0) *
      Number(matchReceipt.candidateRowCount || 0);
    if (matchReceipt.schema !== 'simulatte.groundingCandidateMatchReceipt.v1' ||
        matchReceipt.policy !== 'exact-identity-or-unqualified-label-overlap') {
      failures.push(`${result.index}: Phase 4 candidate-match receipt is missing or uses an unknown policy`);
    }
    if (Number(matchReceipt.nodeCount || 0) !== array(result.phase4AcceptedNodeIdentities).length) {
      failures.push(`${result.index}: Phase 4 candidate-match node count does not match accepted identities`);
    }
    if (Number(matchReceipt.pairEvaluationCount || 0) !== expectedPairEvaluations ||
        Number(matchReceipt.matchedRowCount || 0) > expectedPairEvaluations ||
        Number(matchReceipt.scanPasses || 0) !== 1) {
      failures.push(`${result.index}: Phase 4 candidate matching did not use one bounded node-candidate scan`);
    }
    if (result.runtimeState !== 'ready') failures.push(`${result.index}: runtime not ready`);
    if (!result.canvasWidth || !result.canvasHeight) failures.push(`${result.index}: missing canvas`);
    const phase7Input = result.phase7RenderExecutionInput || result.phase7Input || result.renderExecutionInput || '';
    const scenePacketInput = result.phase7SceneRenderPacketInput || '';
    if (result.renderExecutionInput !== 'simulatte.renderExecutionInput.v1') {
      failures.push(`${result.index}: Phase 7 renderExecutionInput dataset is ${result.renderExecutionInput || 'missing'}, expected simulatte.renderExecutionInput.v1`);
    }
    if (phase7Input !== 'simulatte.renderExecutionInput.v1') {
      failures.push(`${result.index}: Phase 7 input is ${phase7Input || 'missing'}, expected simulatte.renderExecutionInput.v1`);
    }
    if (scenePacketInput !== 'simulatte.sceneRenderPacket.v1') {
      failures.push(`${result.index}: Phase 7 sceneRenderPacket input is ${scenePacketInput || 'missing'}, expected simulatte.sceneRenderPacket.v1`);
    }
    if (result.phase7Output !== 'simulatte.phase7.output.v2') {
      failures.push(`${result.index}: Phase 7 output envelope missing`);
    }
    if (result.phase7RenderData !== 'simulatte.phase7.compactRenderData.v1') {
      failures.push(`${result.index}: Phase 7 render data receipt missing`);
    }
    if (result.phase7RenderPath !== 'depth-lit-storage-object-parts-with-uniform-fallback') {
      failures.push(`${result.index}: Phase 7 render data path is ${result.phase7RenderPath || 'missing'}`);
    }
    const consumption = result.phase7RendererConsumption || {};
    if (consumption.schema !== 'simulatte.phase7RendererConsumption.v1') {
      failures.push(`${result.index}: Phase 7 renderer-consumption receipt missing`);
    }
    if (consumption.cameraConsumed !== true) failures.push(`${result.index}: compiled camera was not consumed`);
    if (Number(consumption.lightCountConsumed || 0) < 1) failures.push(`${result.index}: compiled lights were not consumed`);
    if (Number(consumption.materialCountConsumed || 0) < 1) failures.push(`${result.index}: compiled materials were not consumed`);
    if (consumption.depthEnabled !== true) failures.push(`${result.index}: depth execution is not enabled`);
    if (consumption.normalShading !== true) failures.push(`${result.index}: material lighting does not use surface normals`);
    const constructionGate = phase3ConstructionGate(result);
    for (const slot of constructionGate.missingSlots) {
      failures.push(`${result.index}: required construction slot ${slot.slotId} has neither a proven local grammar nor model-evaluated construction evidence`);
    }
    if (options.intentMode === 'model' && constructionGate.modelRequiredCount > 0 &&
        Number(consumption.modelEvaluatedConstructionCount || 0) < 1) {
      failures.push(`${result.index}: model-evaluated construction evidence did not reach Phase 7`);
    }
    for (const slot of array(result.phase3SlotCandidates)) {
      if (slot.skipReason === 'exact-construction-scored-by-prompt-embedding') {
        const construction = array(slot.candidates).filter((candidate) => candidate.constructionEvidence === true);
        if (!construction.length || construction.some((candidate) => (
          candidate.modelEvaluated !== true || candidate.literalSlotMatch !== true
        ))) {
          failures.push(`${result.index}: exact construction slot ${slot.slotId} lacks literal prompt-embedding evidence`);
        }
        if (construction.some((candidate) => candidate.rerankEvaluated === true)) {
          failures.push(`${result.index}: exact construction slot ${slot.slotId} ran a redundant slot reranker`);
        }
      }
      for (const candidate of array(slot.candidates)) {
        if (candidate.type === 'prompt-literal' && candidate.modelEvaluated !== true &&
            Number(candidate.embeddingScore || 0) !== 0) {
          failures.push(`${result.index}: local prompt literal ${candidate.id} carries a fabricated model score`);
        }
      }
    }
    if (result.phase7PixelReadback !== 'pass') {
      failures.push(`${result.index}: Phase 7 pixel readback is ${result.phase7PixelReadback || 'missing'}${result.phase7PixelReadbackMessage ? `: ${result.phase7PixelReadbackMessage}` : ''}`);
    }
    if (result.phase7PixelProofStatus !== 'pass') {
      failures.push(`${result.index}: Phase 7 pixel proof status is ${result.phase7PixelProofStatus || 'missing'}`);
    }
    if (result.phase7PixelRequiredObligationCount < 1) {
      failures.push(`${result.index}: Phase 7 pixel proof has no required visual obligations`);
    }
    if (result.phase7PixelSampledObligationCount !== result.phase7PixelRequiredObligationCount) {
      failures.push(`${result.index}: Phase 7 pixel proof sampled ${result.phase7PixelSampledObligationCount}/${result.phase7PixelRequiredObligationCount} required obligations`);
    }
    if (result.webgpuOptimizationPath !== 'background-plus-instanced-object-parts') {
      failures.push(`${result.index}: WebGPU optimization path is ${result.webgpuOptimizationPath || 'missing'}`);
    }
    if (result.webgpuSceneInstanceCapacity < 1) {
      failures.push(`${result.index}: WebGPU scene instance capacity is missing`);
    } else if (result.webgpuSceneInstanceCount > result.webgpuSceneInstanceCapacity) {
      failures.push(`${result.index}: WebGPU scene instances overflow capacity ` +
        `${result.webgpuSceneInstanceCount}/${result.webgpuSceneInstanceCapacity}`);
    }
    if (result.webgpuSceneInstanceCount < 1) {
      failures.push(`${result.index}: WebGPU object-part instance path is empty`);
    }
	    if (result.webgpuStorageBytes < 3000) {
	      failures.push(`${result.index}: WebGPU scene storage receipt is missing`);
	    }
    if (result.phase8Output !== 'simulatte.phase8.output.v2') {
      failures.push(`${result.index}: Phase 8 output is ${result.phase8Output || 'missing'}${result.sceneProofError ? `: ${result.sceneProofError}` : ''}`);
    }
    if (result.sceneProofVerdict !== 'pass') {
      const requiredFailures = parseJsonArray(result.sceneProofRequiredFailures);
      const failureSummary = requiredFailures.map((row) => (
        `${row.obligationId || 'unknown'} (${row.reason || row.status || 'failed'})`
      )).join(', ');
      failures.push(`${result.index}: Scene Proof verdict is ${result.sceneProofVerdict || 'missing'}` +
        `${result.sceneProofError ? `: ${result.sceneProofError}` : ''}` +
        `${failureSummary ? `: ${failureSummary}` : ''}`);
    }
	    for (const [key, expectedSchema] of Object.entries(EXPECTED_PHASE_OUTPUT_SCHEMAS)) {
	      if (!result.phaseArtifactSchemas || result.phaseArtifactSchemas[key] !== expectedSchema) {
	        failures.push(`${result.index}: ${key} artifact schema is ${result.phaseArtifactSchemas && result.phaseArtifactSchemas[key] || 'missing'}, expected ${expectedSchema}`);
	      }
	    }
    if (result.phaseArtifactSchemas && result.phaseArtifactSchemas.phase6 === 'simulatte.phase6.output.v2' &&
      result.visualIRSceneRenderPacketSchema !== 'simulatte.sceneRenderPacket.v1') {
      failures.push(`${result.index}: Phase 6 visualCompile sceneRenderPacket missing`);
    }
    if (result.lumaStd < 8) failures.push(`${result.index}: low visual contrast std=${result.lumaStd}`);
    if (result.coloredRatio < 0.035) failures.push(`${result.index}: low color diversity ratio=${result.coloredRatio}`);
    if (!rubric.pass) {
      failures.push(`${result.index}: visual rubric failed score=${rubric.score} coverage=${rubric.coverage} missing=${rubric.missingSignals.join(',') || 'none'} dynamic=${rubric.dynamic}`);
    }
    const requiredEntityCount = array(result.phase6CompositionObligations).filter((row) => (
      row.required === true && ['entity', 'object'].includes(row.kind) && row.status !== 'lost'
    )).length;
    const minimumEntityCount = Math.max(1, requiredEntityCount);
    if (result.visualIREntityCount < minimumEntityCount) {
      failures.push(`${result.index}: VisualIR has ${result.visualIREntityCount}/${minimumEntityCount} required entities`);
    }
    const requiredEnvironments = array(result.phase6CompositionObligations).filter((row) => (
      row.required === true && row.kind === 'environment' && row.status !== 'lost'
    ));
    const visualProofByObligation = new Map(parseJsonArray(result.phase7VisualObligationProof)
      .map((row) => [row.obligationId, row]));
    const passedVisualObligationIds = new Set(String(result.phase7PassedVisualObligationIds || '')
      .split(',').map((id) => id.trim()).filter(Boolean));
    const visibleEnvironmentProof = requiredEnvironments.length > 0 && requiredEnvironments.every((row) => {
      const proof = visualProofByObligation.get(row.id);
      return passedVisualObligationIds.has(row.id) ||
        Boolean(proof && proof.status === 'pass' && proof.pixelSatisfied === true);
    });
    if (requiredEnvironments.length && !result.visualIREnvironmentProgram && !visibleEnvironmentProof) {
      failures.push(`${result.index}: required environment has neither a rendered program nor live pixel proof`);
    }
    if (rubric.expectedCount > 0 && result.visualIRProcessCount < 1) {
      failures.push(`${result.index}: VisualIR has no process for an expected visual signal`);
    }
    const minimumRenderInstanceCount = Math.max(
      1,
      requiredEntityCount + Number(requiredEnvironments.length > 0)
    );
    if (result.visualIRRenderInstanceCount < minimumRenderInstanceCount) {
      failures.push(
        `${result.index}: VisualIR has ${result.visualIRRenderInstanceCount}/${minimumRenderInstanceCount} required render instances`
      );
    }
    if (result.visualIRReceiptCount < 4) failures.push(`${result.index}: VisualIR has too few receipts`);
    if (!result.visualIRGraphicsCompiler) failures.push(`${result.index}: VisualIR missing graphics atom compiler`);
    if (rubric.expectedCount > 0 && !(result.visualIRGraphicsUniformSlots || []).length &&
      rubric.missingSignals.length > 0) {
      failures.push(`${result.index}: VisualIR missing graphics atom uniform slots`);
    }
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
    if (!result.canvasDiversityPerceptualHash) {
      failures.push(`${result.index}: frozen clean-canvas perceptual hash missing`);
    } else if (result.canvasDiversityFrameStable !== true) {
      failures.push(`${result.index}: frozen clean-canvas perceptual hash is not frame-stable`);
    } else {
      const duplicate = perceptualHashes.get(result.canvasDiversityPerceptualHash);
      if (duplicate) failures.push(`${result.index}: duplicate frozen clean-canvas perceptual hash with ${duplicate}`);
      perceptualHashes.set(result.canvasDiversityPerceptualHash, result.index);
    }
  }
  const broadResults = results.filter((result) => result.kind === 'broad');
  const broadSceneCount = new Set(broadResults.map((result) => result.rendererSceneKind).filter(Boolean)).size;
  if (broadResults.length >= 4 && broadSceneCount < Math.min(8, broadResults.length)) {
    failures.push(`broad prompts collapsed into ${broadSceneCount} scene kinds`);
  }
  return {
    ok: failures.length === 0,
    failures,
    promptCount: results.length,
    screenshotCount: results.filter((result) => result.screenshotHash).length,
    uniqueCanvasHashes: new Set(results.map((result) => result.canvasHash)).size,
    uniqueScreenshotHashes: new Set(results.map((result) => result.screenshotHash)).size,
    uniqueCanvasPerceptualHashes: new Set(results.map((result) => result.canvasPerceptualHash).filter(Boolean)).size,
    minCanvasPerceptualHashDistance: minPerceptualHashDistance(results),
    uniqueCanvasDiversityPerceptualHashes: new Set(results.map((result) => result.canvasDiversityPerceptualHash).filter(Boolean)).size,
    minCanvasDiversityPerceptualHashDistance: minPerceptualHashDistance(results, 'canvasDiversityPerceptualHash'),
    perceptualHashCalibration: perceptualHashCalibration(results),
    sceneKinds: [...new Set(results.map((result) => result.rendererSceneKind).filter(Boolean))].sort(),
    visualIRSceneKinds: [...new Set(results.map((result) => result.visualIRSceneKind).filter(Boolean))].sort(),
    visualIRCameras: [...new Set(results.map((result) => result.visualIRCamera).filter(Boolean))].sort(),
    graphicsAtoms: {
      totalAtoms: results.reduce((sum, result) => sum + (result.visualIRGraphicsAtomCount || 0), 0),
      mappingIds: [...new Set(results.flatMap((result) => result.visualIRGraphicsMappingIds || []))].sort(),
      uniformSlots: [...new Set(results.flatMap((result) => result.visualIRGraphicsUniformSlots || []))].sort(),
      wgslOperators: [...new Set(results.flatMap((result) => result.visualIRGraphicsWgslOperators || []))].sort(),
    },
    visualRubric: {
      scope: 'machine-structural-and-pixel-presence',
      recognizabilityStatus: 'human-adjudication-required',
      averageScore: Number((results.reduce((sum, result) => sum + (result.visualRubric ? result.visualRubric.score : 0), 0) / Math.max(1, results.length)).toFixed(2)),
      passCount: results.filter((result) => result.visualRubric && result.visualRubric.pass).length,
      failCount: results.filter((result) => result.visualRubric && !result.visualRubric.pass).length,
      expectedSignals: [...new Set(results.flatMap((result) => result.visualRubric ? result.visualRubric.expectedSignals : []))].sort(),
      missingSignals: [...new Set(results.flatMap((result) => result.visualRubric ? result.visualRubric.missingSignals : []))].sort(),
      dynamicFailures: results
        .filter((result) => result.visualRubric && result.visualRubric.dynamicRequired && !result.visualRubric.dynamic)
        .map((result) => result.index),
      representationFailures: results
        .filter((result) => result.visualRubric && Number(result.visualRubric.representationQuality || 0) < 0.5)
        .map((result) => result.index),
      averageRepresentationQuality: Number((results.reduce((sum, result) => {
        return sum + (result.visualRubric ? Number(result.visualRubric.representationQuality || 0) : 0);
      }, 0) / Math.max(1, results.length)).toFixed(3)),
    },
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

function browserDiagnosticText(event = {}) {
  const params = event.params || {};
  const consoleText = (params.args || []).map((arg) => arg.value || arg.description || '').join(' ');
  return [consoleText, params.entry && params.entry.text || '', params.exceptionDetails && params.exceptionDetails.text || '']
    .filter(Boolean)
    .join(' ');
}

function webGpuValidationFailures(events = []) {
  return events.map(browserDiagnosticText).filter((message) => (
    /GPUValidationError|Invalid CommandBuffer|associated with \[Device\].*cannot be used|CreateBindGroup.*invalid|device lost/i
      .test(message)
  ));
}

function promptNeedsCausalGraph(prompt) {
  return /\b(heat|heats|cool|cools|melt|melts|freeze|freezes|drive|drives|push|pushes|pull|pulls|erode|erodes|collide|collides|impact|fracture|diffuse|diffuses|flow|flows|orbit|orbits|feedback|load|loads|pressure|wave|waves|burn|burns|grow|grows|stabilize|stabilizes)\b/i
    .test(String(prompt || ''));
}

function withAutoRating(summary) {
  const promptCount = Math.max(1, Number(summary.promptCount || summary.screenshotCount || 0));
  const rubric = summary.visualRubric || {};
  const causal = summary.causalRequirements || {};
  const passRate = Number(rubric.passCount || 0) / promptCount;
  const sceneDiversity = Math.min(1, (summary.sceneKinds || []).length / promptCount);
  const screenshotDiversity = Math.min(1, Number(summary.uniqueScreenshotHashes || 0) / promptCount);
  const canvasDiversity = Math.min(1, Number(summary.uniqueCanvasDiversityPerceptualHashes || 0) / promptCount);
  const representationQuality = clamp01(Number(rubric.averageRepresentationQuality || 0));
  const causalCoverage = causal.promptCount
    ? 1 - ((causal.promptsMissingAffordances || []).length / Math.max(1, causal.promptCount))
    : 1;
  const failurePenalty = Math.min(0.35, (summary.failures || []).length * 0.035);
  const dynamicPenalty = Math.min(0.2, (rubric.dynamicFailures || []).length * 0.05);
  const representationPenalty = Math.min(0.18, (rubric.representationFailures || []).length * 0.045);
  const missingPenalty = Math.min(0.2, (rubric.missingSignals || []).length * 0.04);
  const score = Math.round(100 * clamp01(
    Number(rubric.averageScore || 0) / 100 * 0.5 +
    passRate * 0.24 +
    representationQuality * 0.14 +
    causalCoverage * 0.12 -
    failurePenalty -
    dynamicPenalty -
    representationPenalty -
    missingPenalty
  ));
  return {
    ...summary,
    autoRating: {
      schema: 'simulatte.liveVisualAutoRating.v1',
      scope: 'machine-structural-and-pixel-presence',
      recognizabilityVerified: false,
      humanAdjudicationRequired: true,
      score,
      grade: gradeForScore(score),
      verdict: summary.ok && score >= 85 ? 'pass' : 'fail',
      promptCount,
      passRate: Number(passRate.toFixed(3)),
      sceneDiversity: Number(sceneDiversity.toFixed(3)),
      screenshotDiversity: Number(screenshotDiversity.toFixed(3)),
      canvasDiversity: Number(canvasDiversity.toFixed(3)),
      diversityTelemetryOnly: true,
      causalCoverage: Number(causalCoverage.toFixed(3)),
      failureCount: (summary.failures || []).length,
      dynamicFailureCount: (rubric.dynamicFailures || []).length,
      representationFailureCount: (rubric.representationFailures || []).length,
      averageRepresentationQuality: Number(rubric.averageRepresentationQuality || 0),
      missingSignals: rubric.missingSignals || [],
    },
  };
}

function minPerceptualHashDistance(results = [], key = 'canvasPerceptualHash') {
  const hashes = results
    .map((result) => ({ index: result.index, hash: String(result[key] || '') }))
    .filter((row) => row.hash.length === 16);
  let minimum = null;
  for (let left = 0; left < hashes.length; left += 1) {
    for (let right = left + 1; right < hashes.length; right += 1) {
      const distance = perceptualHashDistance(hashes[left].hash, hashes[right].hash);
      if (!Number.isFinite(distance) || (minimum && distance >= minimum.distance)) continue;
      minimum = { left: hashes[left].index, right: hashes[right].index, bits: perceptualHashBits(hashes[left].hash, hashes[right].hash), distance: Number(distance.toFixed(4)) };
    }
  }
  return minimum;
}

function perceptualHashCalibration(results = []) {
  const hashBits = 64;
  const bitMargin = 1;
  const rows = (results || []).filter((result) => (
    /^[0-9a-f]{16}$/i.test(String(result.canvasDiversityPerceptualHash || '')) &&
    /^[0-9a-f]{16}$/i.test(String(result.canvasDiversityPerceptualHashLater || ''))
  ));
  const temporalBits = rows.map((result) => perceptualHashBits(
    result.canvasDiversityPerceptualHash,
    result.canvasDiversityPerceptualHashLater
  ));
  const maxTemporalBits = temporalBits.length ? Math.max(...temporalBits) : null;
  const minimum = minPerceptualHashDistance(rows, 'canvasDiversityPerceptualHash');
  const floorBits = Number.isFinite(maxTemporalBits) ? maxTemporalBits + bitMargin : null;
  return {
    schema: 'simulatte.cleanCanvasPerceptualHashCalibration.v1',
    hashKind: 'audit:visual-clean-canvas-dhash-64',
    hashBits,
    promptCount: (results || []).length,
    usablePromptCount: rows.length,
    bitMargin,
    maxTemporalBits,
    maxTemporalDistance: Number.isFinite(maxTemporalBits) ? Number((maxTemporalBits / hashBits).toFixed(4)) : null,
    minPairwiseBits: minimum && minimum.bits || null,
    minPairwiseDistance: minimum && minimum.distance || null,
    closestPair: minimum ? { left: minimum.left, right: minimum.right } : null,
    recommendedHashFloorBits: floorBits,
    recommendedHashFloor: Number.isFinite(floorBits) ? Number((floorBits / hashBits).toFixed(4)) : null,
    calibrated: Boolean(floorBits && minimum && minimum.bits > floorBits && rows.length === (results || []).length),
  };
}

function perceptualHashDistance(left = '', right = '') {
  if (!/^[0-9a-f]{16}$/i.test(left) || !/^[0-9a-f]{16}$/i.test(right)) return NaN;
  return perceptualHashBits(left, right) / 64;
}

function perceptualHashBits(left = '', right = '') {
  if (!/^[0-9a-f]{16}$/i.test(left) || !/^[0-9a-f]{16}$/i.test(right)) return NaN;
  let value = BigInt(`0x${left}`) ^ BigInt(`0x${right}`);
  let bits = 0;
  while (value) {
    bits += Number(value & 1n);
    value >>= 1n;
  }
  return bits;
}

function gradeForScore(score) {
  if (score >= 94) return 'A';
  if (score >= 86) return 'B';
  if (score >= 76) return 'C';
  if (score >= 66) return 'D';
  return 'F';
}

function auditPageUrl(options, port) {
  const raw = options.url || `http://127.0.0.1:${port}/blank/`;
  const url = new URL(raw);
  if (!url.pathname || url.pathname === '/') url.pathname = '/index.html';
  if (options.intentMode !== 'model') {
    url.searchParams.set('auditNoInitial', '1');
  }
  return url.toString();
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  options.goldSet = options.goldSetPath ? loadGoldSet(options.goldSetPath) : null;
  options.goldAdjudication = options.goldAdjudicationPath
    ? loadGoldAdjudication(options.goldAdjudicationPath)
    : null;
  const chromePath = await resolveChrome();
  const prompts = buildAuditPrompts(options);
  if (!prompts.length) throw new Error('No audit prompts selected');
  await fs.rm(options.outDir, { recursive: true, force: true });
  await fs.mkdir(options.outDir, { recursive: true });
  const local = options.url
    ? { server: null, port: 0 }
    : await startStaticServer(options.profileDir ? options.localPort : 0);
  const debugPort = await freePort();
  const profileDir = options.profileDir || await fs.mkdtemp(path.join(os.tmpdir(), 'simulatte-chrome-profile-'));
  await fs.mkdir(profileDir, { recursive: true });
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
  const chromeProcessOutput = captureChildProcessOutput(chrome);
  let cdp = null;
  try {
    cdp = await connectToPage(debugPort);
    const pageUrl = auditPageUrl(options, local.port);
    await setupPage(cdp, pageUrl, options.width, options.height, options.timeoutMs, options.intentMode);
    const results = [];
    for (let i = 0; i < prompts.length; i += 1) {
      const active = { stage: 'queued', elapsedMs: 0 };
      const onAuditStage = (event) => {
        active.stage = event.stage;
        active.elapsedMs = event.elapsedMs;
        console.log(JSON.stringify(event));
      };
      const promptOptions = { ...options, promptCount: prompts.length, onAuditStage };
      const deadlineMs = promptDeadlineMs(promptOptions);
      try {
        results.push(await withDeadline(
          `visual audit prompt ${i + 1}/${prompts.length}`,
          () => runPrompt(cdp, prompts[i], i, options.outDir, promptOptions),
          deadlineMs,
          {
            describe: () => `stage=${active.stage}, stageElapsedMs=${active.elapsedMs}`,
            onTimeout: (error) => cdp.close(error),
          }
        ));
      } catch (error) {
        if (cdp.closedError) throw error;
        const state = await auditFailureState(cdp);
        const message = error && error.message ? error.message : String(error);
        results.push({
          index: i + 1,
          kind: prompts[i].kind,
          prompt: prompts[i].prompt,
          goldRowId: prompts[i].goldRowId || '',
          auditError: message,
          auditFailureState: state,
        });
        console.error(JSON.stringify({
          schema: 'simulatte.visualAuditPromptFailure.v1',
          promptIndex: i + 1,
          promptCount: prompts.length,
          prompt: prompts[i].prompt,
          stage: active.stage,
          error: message,
        }));
      }
      console.log(`${i + 1}/${prompts.length} ${prompts[i].kind} ${results[results.length - 1].canvasHash} ${results[results.length - 1].rendererSceneKind || 'scene'}`);
    }
    const browserEvents = cdp.diagnostics();
    const analyzed = analyze(results, options);
    const goldEvaluation = evaluateGoldVisualResults(results, options.goldSet, options.goldAdjudication);
    if (goldEvaluation) {
      analyzed.goldEvaluation = goldEvaluation;
      for (const row of goldEvaluation.rows) {
        for (const failure of row.machine.failures) {
          analyzed.failures.push(`gold ${row.goldRowId}: ${failure.id}: ${failure.reason}`);
        }
        for (const failure of row.human.failures) {
          analyzed.failures.push(`gold ${row.goldRowId}: ${failure}`);
        }
      }
      analyzed.ok = analyzed.failures.length === 0;
    }
    const gpuValidationFailures = webGpuValidationFailures(browserEvents);
    if (gpuValidationFailures.length > 0) {
      analyzed.ok = false;
      analyzed.failures.push(...gpuValidationFailures.map((message) => `WebGPU validation: ${message}`));
    }
    const summary = withAutoRating(analyzed);
    const report = {
      schema: 'simulatte.intentSceneScreenshotAudit.v1',
      createdAt: new Date().toISOString(),
      chromePath,
      intentMode: options.intentMode,
      target: options.url ? 'live-url' : 'local-public',
      url: pageUrl,
      profileDir,
      profilePersistent: Boolean(options.profileDir || options.keepProfile),
      promptDeadlineMs: promptDeadlineMs(options),
      chromeProcessLog: chromeProcessOutput.snapshot(),
      promptCounts: {
        curated: prompts.filter((prompt) => prompt.kind === 'curated').length,
        broad: prompts.filter((prompt) => prompt.kind === 'broad').length,
        custom: prompts.filter((prompt) => prompt.kind === 'custom').length,
        gold: prompts.filter((prompt) => prompt.kind === 'gold').length,
        random4gram: prompts.filter((prompt) => prompt.kind === 'random-4gram').length,
        random80gram: prompts.filter((prompt) => prompt.kind === 'random-80gram').length,
      },
      browserEvents,
      gpuValidationFailures,
      summary,
      results,
    };
    await fs.writeFile(path.join(options.outDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify({ outDir: options.outDir, ...summary }, null, 2));
    if (!summary.ok) process.exitCode = 1;
  } catch (error) {
    const failure = {
      schema: 'simulatte.intentSceneScreenshotAuditFailure.v1',
      createdAt: new Date().toISOString(),
      error: error && error.stack || String(error),
      page: await auditFailureState(cdp),
      browserEvents: cdp ? cdp.diagnostics() : [],
      chromeProcessLog: chromeProcessOutput.snapshot(),
    };
    await fs.writeFile(path.join(options.outDir, 'failure.json'), `${JSON.stringify(failure, null, 2)}\n`);
    throw error;
  } finally {
    if (cdp) cdp.close();
    chrome.kill('SIGTERM');
    if (local.server) local.server.close();
    if (!options.profileDir && !options.keepProfile) {
      await fs.rm(profileDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

main().catch((err) => {
  console.error(err && err.stack || err);
  process.exit(1);
});
