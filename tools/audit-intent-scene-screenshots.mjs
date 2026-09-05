#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { withDeadline } from './audit-runtime-wait.mjs';
import { beginBrowserMemoryWindow, endBrowserMemoryWindow } from './browser-memory-receipt.mjs';
import {
  evaluateGoldVisualResults,
  loadGoldAdjudication,
  loadGoldSet,
} from './samer/gold-visual-evaluator.mjs';

import { openBrowserAudit } from './simulatte/browser-session.mjs';
import { prepareAuditOutput } from './audit-output.mjs';
import { setupPage, auditFailureState, promptDeadlineMs, evaluate } from './visual-audit-page.mjs';
import { runPrompt } from './visual-audit-run.mjs';
import { analyze, withAutoRating, webGpuValidationFailures } from './visual-audit-report.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const DEFAULT_OUT_DIR = path.join(ROOT, 'artifacts', 'simulatte-intent-scene-audit');
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
    machineOnlyGold: false,
    exactReplay: false,
    chromePath: '',
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
    else if (key === '--machine-only-gold') options.machineOnlyGold = true;
    else if (key === '--exact-replay') options.exactReplay = true;
    else if (key === '--chrome') options.chromePath = path.resolve(readValue() || '');
    else if (key === '--width') options.width = Math.max(320, Number(readValue() || options.width));
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
      console.log('usage: node tools/audit-intent-scene-screenshots.mjs [--url URL] [--chrome PATH] [--curated N] [--broad N] [--prompt TEXT] [--gold-set PATH] [--gold-adjudication PATH] [--machine-only-gold] [--exact-replay] [--four N] [--eighty N] [--seed N] [--out DIR] [--intent-mode local|model] [--timeout-ms N] [--prompt-timeout-ms N] [--frame-delay-ms N] [--profile-dir DIR] [--local-port PORT]');
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
  const prompts = buildAuditPrompts(options);
  if (!prompts.length) throw new Error('No audit prompts selected');
  const previousOutput = await prepareAuditOutput(options.outDir, [
    'simulatte.intentSceneScreenshotAudit.v1', 'simulatte.intentSceneScreenshotAuditFailure.v1',
  ]);
  const browser = await openBrowserAudit({
    ...options, publicRoot: PUBLIC_DIR, port: options.profileDir ? options.localPort : 0,
    viewport: { width: options.width, height: options.height }, preciseMemory: true,
    args: ['--disable-features=Translate,MediaRouter,OptimizationHints'],
  });
  const { client: cdp, chromePath, profileDir, host: local, processOutput: chromeProcessOutput } = browser;
  try {
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
      let memoryWindowOpen = false;
      let browserMemory = null;
      try {
        await beginBrowserMemoryWindow(cdp, evaluate);
        memoryWindowOpen = true;
        const result = await withDeadline(
          `visual audit prompt ${i + 1}/${prompts.length}`,
          () => runPrompt(cdp, prompts[i], i, options.outDir, promptOptions),
          deadlineMs,
          {
            describe: () => `stage=${active.stage}, stageElapsedMs=${active.elapsedMs}`,
            onTimeout: (error) => cdp.close(error),
          }
        );
        browserMemory = await endBrowserMemoryWindow(cdp, evaluate);
        memoryWindowOpen = false;
        results.push({ ...result, browserMemory });
      } catch (error) {
        if (cdp.closedError) throw error;
        if (memoryWindowOpen) {
          browserMemory = await endBrowserMemoryWindow(cdp, evaluate).catch(() => null);
          memoryWindowOpen = false;
        }
        const state = await auditFailureState(cdp);
        const message = error && error.message ? error.message : String(error);
        results.push({
          index: i + 1,
          kind: prompts[i].kind,
          prompt: prompts[i].prompt,
          goldRowId: prompts[i].goldRowId || '',
          auditError: message,
          auditFailureState: state,
          browserMemory,
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
        if (!options.machineOnlyGold) {
          for (const failure of row.human.failures) {
            analyzed.failures.push(`gold ${row.goldRowId}: ${failure}`);
          }
        }
      }
      analyzed.ok = analyzed.failures.length === 0;
      analyzed.goldGate = options.machineOnlyGold
        ? 'machine-phase8-pixel-and-scene-proof'
        : 'machine-and-human-recognizability';
    }
    const gpuValidationFailures = webGpuValidationFailures(browserEvents);
    if (gpuValidationFailures.length > 0) {
      analyzed.ok = false;
      analyzed.failures.push(...gpuValidationFailures.map((message) => `WebGPU validation: ${message}`));
    }
    const summary = withAutoRating(analyzed);
    const report = {
      schema: 'simulatte.intentSceneScreenshotAudit.v1',
      previousOutput,
      createdAt: new Date().toISOString(),
      chromePath,
      intentMode: options.intentMode,
      goldGate: options.machineOnlyGold
        ? 'machine-phase8-pixel-and-scene-proof'
        : 'machine-and-human-recognizability',
      target: options.url ? 'live-url' : 'local-public',
      exactReplay: options.exactReplay,
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
      previousOutput,
      createdAt: new Date().toISOString(),
      error: error && error.stack || String(error),
      page: await auditFailureState(cdp),
      browserEvents: cdp ? cdp.diagnostics() : [],
      chromeProcessLog: chromeProcessOutput.snapshot(),
    };
    await fs.writeFile(path.join(options.outDir, 'failure.json'), `${JSON.stringify(failure, null, 2)}\n`);
    throw error;
  } finally {
    await browser.close();
  }
}

function exitAfterOutputFlush() {
  const exitCode = Number(process.exitCode || 0);
  if (!process.stdout.writable) process.exit(exitCode);
  process.stdout.write('', () => process.exit(exitCode));
}

main().then(exitAfterOutputFlush).catch((err) => {
  console.error(err && err.stack || err);
  process.exit(1);
});
