#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { openBrowserAudit } from './browser-session.mjs';

const TOOL_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(TOOL_DIR, '../..');
const PUBLIC = path.join(ROOT, 'public');
const DEFAULT_OUTPUT = path.join(ROOT, 'artifacts', 'recursive-reference-qualification', 'report.json');
const require = createRequire(import.meta.url);
const sceneApi = require('../../public/simulatte/world/recursive-world-scene.js');
const proofApi = require('../../public/simulatte/world/recursive-world-proof.js');

function parseArgs(argv) {
  const options = { chromePath: process.env.CHROME_PATH || '', output: DEFAULT_OUTPUT, headed: false, viewport: null };
  for (let index = 0; index < argv.length; index += 1) {
    const [key, inline] = argv[index].split('=');
    const value = () => inline ?? argv[++index];
    if (key === '--chrome') options.chromePath = path.resolve(value());
    else if (key === '--out') options.output = path.resolve(value());
    else if (key === '--viewport') options.viewport = parseViewport(value());
    else if (key === '--headed') options.headed = true;
    else if (key === '--help') {
      console.log('usage: node tools/simulatte/qualify-recursive-reference.mjs [--headed] [--viewport WIDTHxHEIGHT] [--chrome PATH] [--out FILE]');
      process.exit(0);
    } else throw new Error(`recursive_qualification_argument_unknown: ${key}`);
  }
  return options;
}

function parseViewport(value) {
  const match = /^(\d+)x(\d+)$/.exec(String(value));
  if (!match) throw new Error(`recursive_qualification_viewport_invalid: ${value}`);
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (width < 320 || height < 320) throw new Error(`recursive_qualification_viewport_too_small: ${value}`);
  return Object.freeze({ width, height });
}

function qualificationLaneId({ headed, viewport, platform = process.platform }) {
  const gpuBackend = platform === 'darwin' ? 'metal' : platform === 'linux' ? 'vulkan' : 'default';
  const viewportSuffix = viewport ? `-${viewport.width}x${viewport.height}` : '';
  return `${headed ? 'headed' : 'headless'}-chrome-${gpuBackend}-uncapped-120${viewportSuffix}`;
}

function publicBuildIdentity() {
  const entries = [
    path.join(PUBLIC, 'recursive-reference.html'),
    path.join(PUBLIC, 'simulatte', 'world'),
    path.join(PUBLIC, 'simulatte', 'runtime'),
    path.join(PUBLIC, 'simulatte', 'platform', 'transport'),
    path.join(PUBLIC, 'shared', 'contracts'),
    path.join(PUBLIC, 'shared', 'core', 'simulation'),
    path.join(PUBLIC, 'shared', 'plugins', 'subsea-network-global'),
    path.join(PUBLIC, 'shared', 'plugins', 'gpu-supercluster'),
    path.join(PUBLIC, 'data', 'subsea-network-global'),
  ];
  const files = [...new Set(entries.flatMap(walkFiles))].sort();
  const manifest = files.map((file) => {
    const body = fs.readFileSync(file);
    return { path: path.relative(ROOT, file), sha256: createHash('sha256').update(body).digest('hex') };
  });
  const digest = createHash('sha256');
  manifest.forEach((row) => digest.update(row.path).update('\0').update(row.sha256).update('\n'));
  return Object.freeze({ id: `recursive-public-sha256-${digest.digest('hex').slice(0, 16)}`, manifest });
}

function walkFiles(entry) {
  const info = fs.statSync(entry);
  if (info.isFile()) return [entry];
  return fs.readdirSync(entry, { withFileTypes: true }).flatMap((row) => walkFiles(path.join(entry, row.name)));
}

function validateLaneIdentity(result, expectedLaneId, expectedBrowserMode) {
  const identities = [result?.identity, result?.proof, result?.evidence?.performanceReceipt];
  if (identities.some((identity) => identity?.qualificationLaneId !== expectedLaneId)) {
    throw new Error('recursive_qualification_lane_identity_mismatch');
  }
  if (identities.some((identity) => identity?.browserMode !== expectedBrowserMode)) {
    throw new Error('recursive_qualification_browser_mode_mismatch');
  }
  const runtimeIdentity = result.identity;
  const proofIdentity = result.proof;
  const performanceIdentity = result.evidence.performanceReceipt;
  for (const key of ['buildId', 'runtimeId', 'deviceClass']) {
    if (proofIdentity[key] !== runtimeIdentity[key] || performanceIdentity[key] !== runtimeIdentity[key]) {
      throw new Error(`recursive_qualification_${key}_identity_mismatch`);
    }
  }
}

function validatePerformanceAggregates(performance) {
  const medians = [performance.compositorMedianFrameMilliseconds, performance.cpuMedianFrameMilliseconds, performance.gpuCompletionMedianMilliseconds];
  const p95s = [performance.compositorP95FrameMilliseconds, performance.cpuP95FrameMilliseconds, performance.gpuCompletionP95Milliseconds];
  const counts = [performance.compositorSampleCount, performance.cpuSampleCount, performance.gpuCompletionSampleCount];
  const numeric = [
    performance.targetFramesPerSecond, performance.frameBudgetMilliseconds, performance.sampleCount, ...counts,
    performance.medianFrameMilliseconds, performance.p95FrameMilliseconds, ...medians, ...p95s,
    performance.refreshEstimateHz,
  ];
  if (numeric.some((value) => !Number.isFinite(value))) throw new Error('recursive_qualification_performance_non_finite');
  if (medians.some((value, index) => value < 0 || value > p95s[index]) || p95s.some((value) => value < 0)) {
    throw new Error('recursive_qualification_performance_distribution_invalid');
  }
  if (performance.medianFrameMilliseconds !== Math.max(...medians) || performance.p95FrameMilliseconds !== Math.max(...p95s)) {
    throw new Error('recursive_qualification_performance_aggregate_incoherent');
  }
  if (counts.some((value) => !Number.isInteger(value) || value < performance.sampleCount) || performance.sampleCount !== Math.min(...counts)) {
    throw new Error('recursive_qualification_performance_sample_count_incoherent');
  }
  return { medians, p95s };
}

function validateResult(result, errors, expectedBuildId, expectedLaneId, expectedBrowserMode) {
  if (errors.length) throw new Error(`recursive_qualification_browser_errors: ${errors.join(' | ')}`);
  if (!result || result.visibilityState !== 'visible') throw new Error('recursive_qualification_page_not_visible');
  if (result.identity?.buildId !== expectedBuildId) throw new Error('recursive_qualification_build_identity_mismatch');
  validateLaneIdentity(result, expectedLaneId, expectedBrowserMode);
  const expectedTargets = ['earth', 'facility', 'rack', 'node', 'gpu', 'earth'];
  if (JSON.stringify(result.navigation?.map((row) => row.targetId)) !== JSON.stringify(expectedTargets)) {
    throw new Error('recursive_qualification_navigation_incomplete');
  }
  if (result.navigation.some((row) => !row.frameReceipt?.contentHash || sceneApi.contentHash(row.frameReceipt) !== row.frameReceipt.contentHash)) {
    throw new Error('recursive_qualification_navigation_receipt_invalid');
  }
  if (result.proof?.verdict !== 'pass') {
    const classes = Object.fromEntries(Object.entries(result.proof?.proofClasses || {}).map(([id, value]) => [id, value.status]));
    throw new Error(`recursive_qualification_proof_${result.proof?.verdict || 'missing'}: ${JSON.stringify(classes)}`);
  }
  proofApi.validateProof(result.proof);
  const performance = result.evidence?.performanceReceipt;
  if (performance?.status !== 'pass') throw new Error(`recursive_qualification_performance_${performance?.status || 'missing'}`);
  if (performance.contentHash !== result.proof.proofClasses.performance.evidence[0]) {
    throw new Error('recursive_qualification_performance_hash_unbound');
  }
  const hashed = [result.proof, performance, result.evidence.visualReceipt, result.evidence.residencyReceipt, result.evidence.workerParityReceipt];
  if (hashed.some((value) => !value?.contentHash || sceneApi.contentHash(value) !== value.contentHash)) {
    throw new Error('recursive_qualification_content_hash_invalid');
  }
  const budget = performance.frameBudgetMilliseconds;
  const { p95s } = validatePerformanceAggregates(performance);
  if (!Number.isFinite(budget) || budget <= 0 || p95s.some((value) => value > budget)) {
    throw new Error('recursive_qualification_frame_budget_exceeded');
  }
  return result;
}

async function run() {
  const options = parseArgs(process.argv.slice(2));
  const launchFlags = [
    ...(process.platform === 'darwin' ? ['--use-angle=metal'] : []),
    '--disable-gpu-vsync', '--disable-frame-rate-limit',
    '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
  ];
  const browser = await openBrowserAudit({ ...options, publicRoot: PUBLIC, webgpu: true, args: launchFlags });
  const { client, chromePath, host: { port: sitePort } } = browser;
  const buildIdentity = publicBuildIdentity();
  const buildId = buildIdentity.id;
  const laneId = qualificationLaneId(options);
  const route = new URL(`http://127.0.0.1:${sitePort}/recursive-reference.html`);
  route.searchParams.set('build', buildId);
  route.searchParams.set('qualificationLane', laneId);
  route.searchParams.set('browserMode', options.headed ? 'headed' : 'headless');
  const browserErrors = [];
  try {
    await client.send('Runtime.enable');
    await client.send('Page.enable');
    if (options.viewport) {
      await client.send('Emulation.setDeviceMetricsOverride', {
        width: options.viewport.width,
        height: options.viewport.height,
        deviceScaleFactor: 1,
        mobile: options.viewport.width <= 480,
        screenWidth: options.viewport.width,
        screenHeight: options.viewport.height,
      });
    }
    client.on('Runtime.exceptionThrown', (params) => browserErrors.push(params?.exceptionDetails?.exception?.description || params?.exceptionDetails?.text || 'exception'));
    client.on('Runtime.consoleAPICalled', (params) => {
      if (params?.type !== 'error') return;
      browserErrors.push((params.args || []).map((arg) => arg.value || arg.description || '').filter(Boolean).join(' '));
    });
    const loaded = client.once('Page.loadEventFired');
    await client.send('Page.navigate', { url: route.toString() });
    await loaded;
    const evaluated = await client.send('Runtime.evaluate', {
      expression: `(async () => {
        const bootDeadline = performance.now() + 30000;
        while (!window.__SIMULATTE_RECURSIVE_REFERENCE__ && performance.now() < bootDeadline) {
          await new Promise((resolve) => setTimeout(resolve, 25));
        }
        if (!window.__SIMULATTE_RECURSIVE_REFERENCE__) throw new Error('recursive_reference_boot_timeout');
        const runtime = await window.__SIMULATTE_RECURSIVE_REFERENCE__.ready;
        const deadline = performance.now() + 120000;
        let snapshot = runtime.snapshot();
        while (!snapshot.proof && performance.now() < deadline) {
          await new Promise((resolve) => setTimeout(resolve, 25));
          snapshot = runtime.snapshot();
        }
        const navigation = [];
        for (const targetId of ['earth', 'facility', 'rack', 'node', 'gpu', 'earth']) {
          document.querySelector('[data-target="' + targetId + '"]').click();
          await new Promise((resolve) => setTimeout(resolve, 800));
          snapshot = runtime.snapshot();
          navigation.push({ targetId: snapshot.frameReceipt?.targetId || null, frameReceipt: snapshot.frameReceipt || null });
        }
        return {
          identity: runtime.identity,
          proof: snapshot.proof,
          evidence: snapshot.evidence,
          observation: snapshot.observation,
          frameReceipt: snapshot.frameReceipt,
          navigation,
          visibilityState: document.visibilityState,
          runtimeStatus: document.getElementById('runtime-status')?.textContent || '',
          canvas: { width: document.getElementById('recursive-world-canvas')?.width || 0, height: document.getElementById('recursive-world-canvas')?.height || 0 },
        };
      })()`,
      awaitPromise: true,
      returnByValue: true,
    });
    if (evaluated.exceptionDetails) throw new Error(evaluated.exceptionDetails.exception?.description || evaluated.exceptionDetails.text);
    const rawResult = evaluated.result.value;
    let result;
    try {
      result = validateResult(rawResult, browserErrors, buildId, laneId, options.headed ? 'headed' : 'headless');
    } catch (error) {
      const failureReport = {
        schema: 'simulatte.recursive-browser-qualification/v1',
        status: 'fail',
        capturedAt: new Date().toISOString(),
        buildId,
        buildManifest: buildIdentity.manifest,
        laneId,
        browserMode: options.headed ? 'headed' : 'headless',
        requestedViewport: options.viewport,
        chromePath,
        launchFlags: browser.launchArguments,
        browserErrors,
        chromeDiagnostics: browser.processOutput.snapshot().stderr.tail.split('\n').filter(Boolean),
        error: error.message,
        result: rawResult,
      };
      fs.mkdirSync(path.dirname(options.output), { recursive: true });
      fs.writeFileSync(options.output, `${JSON.stringify(failureReport, null, 2)}\n`);
      throw new Error(`${error.message}; report=${options.output}`);
    }
    const report = {
      schema: 'simulatte.recursive-browser-qualification/v1',
      status: 'pass',
      capturedAt: new Date().toISOString(),
      buildId,
      buildManifest: buildIdentity.manifest,
      laneId,
      browserMode: options.headed ? 'headed' : 'headless',
      requestedViewport: options.viewport,
      chromePath,
      chromeVersion: (await client.send('Browser.getVersion')).product,
      launchFlags: browser.launchArguments,
      host: { platform: os.platform(), architecture: os.arch(), release: os.release(), cpu: os.cpus()[0]?.model || 'unreported', memoryBytes: os.totalmem() },
      route: route.toString(),
      browserErrors,
      chromeDiagnostics: browser.processOutput.snapshot().stderr.tail.split('\n').filter(Boolean),
      result,
    };
    fs.mkdirSync(path.dirname(options.output), { recursive: true });
    fs.writeFileSync(options.output, `${JSON.stringify(report, null, 2)}\n`);
    const performance = result.evidence.performanceReceipt;
    console.log(`RECURSIVE-QUALIFICATION status=pass lane=${laneId} build=${buildId} p95=${performance.p95FrameMilliseconds.toFixed(3)}ms proof=${result.proof.contentHash} output=${options.output}`);
  } finally {
    await browser.close();
  }
}

export { qualificationLaneId, validateLaneIdentity, validatePerformanceAggregates, validateResult };

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
