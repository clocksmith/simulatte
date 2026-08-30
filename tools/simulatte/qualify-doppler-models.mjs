#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const TOOL_DIR = path.dirname(fileURLToPath(import.meta.url));
const TOOL_PATH = fileURLToPath(import.meta.url);
const ROOT = path.resolve(TOOL_DIR, '../..');
const LOCK_PATH = path.join(ROOT, 'public/data/simulatte-embedder/model-runtime-lock.json');
const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;

function parseArgs(argv) {
  const timestamp = new Date().toISOString().replace(/[-:.]/g, '');
  const options = {
    outDir: path.join(ROOT, 'artifacts', 'doppler-model-qualification', timestamp),
    profileRoot: path.join(ROOT, 'artifacts', 'doppler-model-profile'),
    chrome: process.env.CHROME_PATH || '',
    timeoutMs: DEFAULT_TIMEOUT_MS,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const [key, inline] = argv[index].split('=');
    const value = () => inline ?? argv[++index];
    if (key === '--out-dir') options.outDir = path.resolve(value());
    else if (key === '--profile-root') options.profileRoot = path.resolve(value());
    else if (key === '--chrome') options.chrome = path.resolve(value());
    else if (key === '--timeout-ms') options.timeoutMs = positiveInteger(value(), key);
    else if (key === '--help') {
      console.log('usage: node tools/simulatte/qualify-doppler-models.mjs [--out-dir DIR] [--profile-root DIR] [--chrome PATH] [--timeout-ms N]');
      process.exit(0);
    } else throw new Error(`unknown Doppler model qualification option: ${key}`);
  }
  return options;
}

function positiveInteger(value, label) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${label} expected a positive integer`);
  return parsed;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function run(command, args, options = {}) {
  try {
    return execFileSync(command, args, {
      cwd: options.cwd || ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (error) {
    const detail = String(error?.stderr || error?.message || error).trim();
    throw new Error(`${command} ${args.join(' ')} failed: ${detail}`);
  }
}

function locateChrome(explicitPath = '') {
  const candidates = [
    explicitPath,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean);
  const chrome = candidates.find((candidate) => {
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return true;
    } catch (_error) {
      return false;
    }
  });
  if (!chrome) throw new Error('Chrome or Chromium executable not found; pass --chrome PATH');
  return chrome;
}

export function validateSourcePin(lock, root = ROOT) {
  const development = lock?.doppler?.development || {};
  if (development.kind !== 'sibling-git-archive') {
    throw new Error('Doppler model qualification requires doppler.development.kind=sibling-git-archive');
  }
  if (!/^[0-9a-f]{40}$/i.test(String(development.gitSha || ''))) {
    throw new Error('Doppler model qualification requires a full source Git SHA');
  }
  const sourceRoot = path.resolve(root, String(development.workspacePath || ''));
  if (!fs.existsSync(path.join(sourceRoot, '.git'))) {
    throw new Error(`pinned Doppler source repository is unavailable at ${sourceRoot}`);
  }
  const head = run('git', ['rev-parse', 'HEAD'], { cwd: sourceRoot });
  if (head !== development.gitSha) {
    throw new Error(`Doppler source HEAD ${head} differs from pinned commit ${development.gitSha}`);
  }
  const status = run('git', ['status', '--porcelain=v1'], { cwd: sourceRoot });
  if (status) throw new Error('pinned Doppler source worktree must be clean for qualification');
  const sourceEntryPath = path.join(sourceRoot, 'src/index.js');
  const vendorEntryPath = path.join(root, 'public/vendor/doppler/src/index.js');
  const sourceEntrySha256 = sha256File(sourceEntryPath);
  const vendorEntrySha256 = sha256File(vendorEntryPath);
  if (sourceEntrySha256 !== vendorEntrySha256) {
    throw new Error('vendored Doppler entrypoint differs from the pinned sibling source');
  }
  return { sourceRoot, head, sourceEntryPath, sourceEntrySha256, vendorEntrySha256 };
}

function assertModelRun(report, workload, expectedModelId) {
  if (!report || report.modelId !== expectedModelId) {
    throw new Error(`${workload} verifier returned the wrong model identity`);
  }
  if (report.workload !== workload || Number(report.failed) !== 0 || Number(report.passed) < 1) {
    throw new Error(`${workload} verifier did not pass its workload checks`);
  }
  const adapterInfo = report.deviceInfo?.adapterInfo;
  if (!adapterInfo?.description) {
    throw new Error(`${workload} verifier did not report a physical adapter identity`);
  }
  const adapterIdentity = JSON.stringify(adapterInfo).toLowerCase();
  if (/swiftshader|llvmpipe|software rasterizer|basic render driver/.test(adapterIdentity)) {
    throw new Error(`${workload} verifier reported a software adapter`);
  }
  const output = report.output || {};
  if (output.mode !== workload || output.semantic?.passed !== true) {
    throw new Error(`${workload} verifier did not pass its semantic oracle`);
  }
  if (workload === 'embedding') {
    if (Number(output.embeddingDim) < 1 || output.finiteRatio !== 1 || Number(output.l2Norm) <= 0) {
      throw new Error('embedding verifier returned an invalid vector');
    }
  } else {
    const ranking = Array.isArray(output.ranking) ? output.ranking : [];
    if (!ranking.length || ranking[0].index !== 0) {
      throw new Error('reranker verifier did not select the expected document');
    }
    if (ranking.some((row) => row.scoringPath !== 'prefix-selected-token-logits')) {
      throw new Error('reranker verifier used an unexpected scoring path');
    }
  }
}

export function summarizeModelResult(envelope, workload, model) {
  if (envelope?.ok !== true) throw new Error(`${workload} browser command did not return success`);
  const report = envelope.result || envelope;
  assertModelRun(report, workload, model.id);
  const output = report.output;
  return {
    workload,
    modelId: report.modelId,
    manifestSha256: model.manifestHash.hex,
    sourceRevision: model.source.revision,
    sizeBytes: Number(model.source.sizeBytes),
    passed: Number(report.passed),
    failed: Number(report.failed),
    skipped: Number(report.skipped),
    cacheMode: report.cacheMode,
    loadMode: report.loadMode,
    deviceInfo: report.deviceInfo,
    output: workload === 'embedding'
      ? {
          dimensions: Number(output.embeddingDim),
          finiteRatio: Number(output.finiteRatio),
          l2Norm: Number(output.l2Norm),
          semanticPassed: output.semantic.passed,
          retrievalTop1Accuracy: Number(output.semantic.retrievalTop1Acc),
        }
      : {
          documentCount: Number(output.documentCount),
          topDocumentIndex: Number(output.topDocument.index),
          semanticPassed: output.semantic.passed,
          pairAccuracy: Number(output.semantic.pairAcc),
          scoringPaths: [...new Set(output.ranking.map((row) => row.scoringPath))],
        },
  };
}

function runtimeConfigFor(lock, workload) {
  if (workload === 'embedding') {
    const config = structuredClone(lock.embedding.runtimeConfig);
    config.inference.prompt = 'GPU server cooling system';
    return config;
  }
  const config = structuredClone(lock.reranker.runtimeConfig);
  config.inference.rerank = {
    query: 'Which document describes a GPU server cooling system?',
    documents: [
      'A data center rack recirculates heat through liquid cooling loops.',
      'A violin rests on a wooden stool in a quiet room.',
      'Mangrove roots trap sediment along a tidal shoreline.',
    ],
  };
  return config;
}

async function executeModel(runBrowserCommandInNode, lock, workload, options, sourceRoot) {
  const model = workload === 'embedding' ? lock.embedding : lock.reranker.model;
  const raw = await runBrowserCommandInNode({
    command: 'verify',
    workload,
    modelId: model.id,
    modelUrl: model.defaultModelBaseUrl,
    runtimeConfig: runtimeConfigFor(lock, workload),
    captureOutput: true,
  }, {
    staticRootDir: sourceRoot,
    executablePath: options.chrome,
    userDataDir: path.join(options.profileRoot, workload),
    timeoutMs: options.timeoutMs,
  });
  return { raw, summary: summarizeModelResult(raw, workload, model) };
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  options.chrome = locateChrome(options.chrome);
  const lock = readJson(LOCK_PATH);
  const source = validateSourcePin(lock);
  fs.mkdirSync(options.outDir, { recursive: true });
  fs.mkdirSync(options.profileRoot, { recursive: true });
  const runnerPath = path.join(source.sourceRoot, 'src/tooling/node-browser-command-runner.js');
  const { runBrowserCommandInNode } = await import(pathToFileURL(runnerPath).href);
  const completed = [];
  for (const workload of ['embedding', 'rerank']) {
    const result = await executeModel(runBrowserCommandInNode, lock, workload, options, source.sourceRoot);
    const rawPath = path.join(options.outDir, `${workload}.raw.json`);
    writeJson(rawPath, result.raw);
    completed.push({ ...result.summary, rawPath: path.relative(options.outDir, rawPath), rawSha256: sha256File(rawPath) });
  }
  const receipt = {
    schema: 'simulatte.dopplerModelQualification.v1',
    createdAt: new Date().toISOString(),
    status: 'pass',
    promotionEligible: false,
    modelRuntimeLock: {
      id: lock.id,
      number: Number(lock.number),
      sha256: sha256File(LOCK_PATH),
    },
    qualificationTool: {
      path: path.relative(ROOT, TOOL_PATH),
      sha256: sha256File(TOOL_PATH),
    },
    dopplerSource: {
      gitSha: source.head,
      entrypointSha256: source.sourceEntrySha256,
      vendorEntrypointSha256: source.vendorEntrySha256,
      packageIntegrity: lock.doppler.package.integrity,
      packageShasum: lock.doppler.package.shasum,
    },
    host: {
      platform: os.platform(),
      release: os.release(),
      arch: os.arch(),
      node: process.version,
      chrome: run(options.chrome, ['--version']),
    },
    models: completed,
    claimBoundary: 'This receipt proves exact pinned-source Doppler browser WebGPU execution and semantic smoke checks for the named embedding and reranking artifacts on the reported adapter. It does not promote the reranker into Simulatte policy, establish application-level quality, or authorize a deployment.',
  };
  const receiptPath = path.join(options.outDir, 'receipt.json');
  writeJson(receiptPath, receipt);
  console.log(JSON.stringify({ receiptPath, ...receipt }, null, 2));
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    console.error(error?.stack || error);
    process.exit(1);
  });
}
