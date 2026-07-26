import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawn } from 'node:child_process';
import { CdpClient, findChrome } from './run-browser-smoke.mjs';
import { createStaticSiteServer } from './static-site-server.mjs';
import { sha256Bytes } from './profile-evidence-contract.mjs';

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => server.listen(0, '127.0.0.1', resolve).once('error', reject));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitForDevtools(port, child) {
  for (let attempt = 0; attempt < 160; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Chrome exited before DevTools was ready with code ${child.exitCode}`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json`);
      if (response.ok) {
        const page = (await response.json()).find((row) => row.type === 'page');
        if (page) return page;
      }
    } catch {
      // Chrome has not opened the debugger port.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Chrome DevTools did not become ready on port ${port}`);
}

async function stopChild(child) {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 1000)),
  ]);
  if (child.exitCode === null) child.kill('SIGKILL');
}

function unfilterPng(raw, width, height, channels) {
  const stride = width * channels;
  const output = Buffer.alloc(stride * height);
  let inputOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[inputOffset++];
    for (let x = 0; x < stride; x += 1) {
      const byte = raw[inputOffset++];
      const left = x >= channels ? output[y * stride + x - channels] : 0;
      const up = y > 0 ? output[(y - 1) * stride + x] : 0;
      const upperLeft = y > 0 && x >= channels ? output[(y - 1) * stride + x - channels] : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = up;
      else if (filter === 3) predictor = Math.floor((left + up) / 2);
      else if (filter === 4) {
        const estimate = left + up - upperLeft;
        const leftDistance = Math.abs(estimate - left);
        const upDistance = Math.abs(estimate - up);
        const upperLeftDistance = Math.abs(estimate - upperLeft);
        predictor = leftDistance <= upDistance && leftDistance <= upperLeftDistance ? left : upDistance <= upperLeftDistance ? up : upperLeft;
      } else if (filter !== 0) {
        throw new Error(`profile_evidence_png_filter_unsupported: ${filter}`);
      }
      output[y * stride + x] = (byte + predictor) & 0xff;
    }
  }
  return output;
}

function inspectPng(buffer) {
  const signature = buffer.subarray(0, 8).toString('hex');
  if (signature !== '89504e470d0a1a0a') throw new Error('profile_evidence_screenshot_not_png');
  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = -1;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString('ascii');
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      if (data[8] !== 8) throw new Error(`profile_evidence_png_bit_depth_unsupported: ${data[8]}`);
      colorType = data[9];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    offset += length + 12;
  }
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
  if (!channels) throw new Error(`profile_evidence_png_color_type_unsupported: ${colorType}`);
  const pixels = unfilterPng(zlib.inflateSync(Buffer.concat(idat)), width, height, channels);
  const colors = new Set();
  let nonTransparent = 0;
  const xStep = Math.max(1, Math.floor(width / 16));
  const yStep = Math.max(1, Math.floor(height / 16));
  let sampleCount = 0;
  for (let y = Math.floor(yStep / 2); y < height; y += yStep) {
    for (let x = Math.floor(xStep / 2); x < width; x += xStep) {
      const start = (y * width + x) * channels;
      const sample = [...pixels.subarray(start, start + channels)];
      const alpha = channels === 4 ? sample[3] : 255;
      if (alpha > 0) nonTransparent += 1;
      colors.add(sample.join(','));
      sampleCount += 1;
    }
  }
  return {
    method: 'cdp-compositor-png-samples',
    width,
    height,
    sampleCount,
    nonTransparentSampleCount: nonTransparent,
    distinctColorCount: colors.size,
    status: nonTransparent === sampleCount && colors.size > 1 ? 'pass' : 'fail',
  };
}

function browserProbeExpression(run, seedIndex) {
  return `(async () => {
    const waitFor = async (predicate, label, limit = 45000) => {
      const started = performance.now();
      while (!predicate()) {
        if (performance.now() - started > limit) throw new Error('profile evidence timeout at ' + label);
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    };
    await waitFor(() => document.body?.dataset.journeyPhase === 'ready', 'ready');
    const expectedSeed = ${JSON.stringify(run.seed)};
    const seedText = () => document.getElementById('scenario-seed')?.textContent || '';
    for (let index = 0; index < ${seedIndex}; index += 1) {
      document.getElementById('shuffle-button').click();
      const previous = seedText();
      await waitFor(() => seedText() !== previous, 'seed-change');
    }
    await waitFor(() => seedText().includes(expectedSeed), 'governed-seed');
    const controls = Array.from(document.querySelectorAll('button, input, select, [role="button"]')).map((element) => ({
      id: element.id || element.name || element.dataset.actionId || element.getAttribute('aria-label') || element.textContent?.trim(),
      kind: element.tagName.toLowerCase(),
      value: element.value ?? element.getAttribute('aria-checked') ?? null,
      disabled: Boolean(element.disabled || element.getAttribute('aria-disabled') === 'true'),
      hidden: Boolean(element.hidden),
    })).filter((row) => row.id);
    const lifecycle = ['boot', 'select-seed', 'start'];
    const progressiveStates = [{
      phase: document.body.dataset.journeyPhase,
      tick: Number(document.getElementById('metric-tick')?.textContent || 0),
      atMs: performance.now(),
    }];
    document.getElementById('start-button').click();
    const pause = document.getElementById('pause-button');
    if (pause && !pause.hidden && !pause.disabled) {
      await new Promise((resolve) => setTimeout(resolve, 25));
      pause.click();
      lifecycle.push('pause');
      const step = document.getElementById('step-button');
      if (step && !step.hidden && !step.disabled) {
        step.click();
        lifecycle.push('step');
      }
      const resume = document.getElementById('resume-button');
      if (resume && !resume.hidden && !resume.disabled) {
        resume.click();
        lifecycle.push('resume');
      }
    }
    const started = performance.now();
    while (!['completed', 'failed'].includes(document.body.dataset.journeyPhase)) {
      progressiveStates.push({
        phase: document.body.dataset.journeyPhase,
        tick: Number(document.getElementById('metric-tick')?.textContent || 0),
        atMs: performance.now(),
      });
      if (performance.now() - started > 45000) throw new Error('profile evidence timeout at settlement');
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    lifecycle.push('settle');
    progressiveStates.push({
      phase: document.body.dataset.journeyPhase,
      tick: Number(document.getElementById('metric-tick')?.textContent || 0),
      atMs: performance.now(),
    });
    const tierReceipt = globalThis.__simulatteTierRunReceipt || null;
    const pluginRunReceipt = globalThis.__simulattePluginRunReceipt || null;
    const runReceipt = tierReceipt || pluginRunReceipt;
    const platform = globalThis.__simulattePluginPlatformV4 || null;
    const runtimeReceipt = tierReceipt?.pluginRuntime || pluginRunReceipt?.runtime || null;
    const contributions = platform?.contributions || [];
    const platformReceipt = platform?.receipt || platform || null;
    const contributionSources = platform?.contributionSources || [];
    const native = contributionSources.length === ${run.pluginIds.length}
      && contributionSources.every((row) => row.source === 'native-v4')
      && ${JSON.stringify(run.pluginIds)}.every((id) => contributionSources.some((row) => row.pluginId === id));
    const events = runtimeReceipt?.events
      || contributions.flatMap((row) => row.events || [])
      || globalThis.__simulatteAutonomyRuntimeEvents
      || [];
    const comparisons = contributions.flatMap((row) => row.controls?.comparisons || [])
      .concat(runReceipt?.actionResult?.comparisons || runReceipt?.actionResult?.comparison ? [runReceipt.actionResult.comparisons || runReceipt.actionResult.comparison].flat() : []);
    const settlements = tierReceipt?.settlement
      || pluginRunReceipt?.settlements
      || (document.getElementById('metric-settlement')?.textContent ? [{ summary: document.getElementById('metric-settlement').textContent }] : []);
    const replay = document.getElementById('replay-button');
    if (replay && !replay.hidden && !replay.disabled) {
      replay.click();
      await waitFor(() => document.body.dataset.journeyPhase === 'completed', 'replay');
      lifecycle.push('replay');
    }
    return {
      runtime: {
        path: native ? 'native-v4' : contributionSources.some((row) => row.source === 'legacy-adapter') ? 'legacy-adapter' : 'unproven-v4',
        profileId: ${JSON.stringify(run.profileId)},
        platformReceipt,
        runReceipt,
        contributionSources,
      },
      evidence: {
        controls,
        events,
        progressiveStates,
        comparisons,
        settlements,
        lifecycle,
        performance: {
          frameCount: Number(document.getElementById('autonomy-canvas')?.dataset.frameCount || progressiveStates.length),
          elapsedMs: performance.now() - started,
        },
      },
      integrity: {
        status: document.body.dataset.journeyPhase === 'completed' ? 'pass' : 'contradictory',
        contradictions: document.body.dataset.journeyPhase === 'completed' ? [] : ['runtime_failed'],
      },
    };
  })()`;
}

async function captureBrowserRun({ chromePath, baseUrl, run, sourceIdentity, claims, outputDirectory, seedIndex }) {
  const debugPort = await freePort();
  const profileDirectory = fs.mkdtempSync(path.join(os.tmpdir(), `simulatte-profile-evidence-${run.profileId}-`));
  const chrome = spawn(chromePath, [
    '--headless=new',
    '--enable-unsafe-webgpu',
    '--disable-background-networking',
    '--no-first-run',
    '--no-default-browser-check',
    `--user-data-dir=${profileDirectory}`,
    `--remote-debugging-port=${debugPort}`,
    `--window-size=${run.viewport.width},${run.viewport.height}`,
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  let client = null;
  const consoleRows = [];
  const consoleErrors = [];
  try {
    const page = await waitForDevtools(debugPort, chrome);
    client = new CdpClient(page.webSocketDebuggerUrl);
    await client.connect();
    await Promise.all([client.send('Runtime.enable'), client.send('Page.enable'), client.send('Log.enable')]);
    client.on('Runtime.consoleAPICalled', (params) => {
      const row = { type: params.type, values: (params.args || []).map((arg) => arg.value || arg.description || '').filter(Boolean) };
      consoleRows.push(row);
      if (params.type === 'error') consoleErrors.push(row);
    });
    client.on('Runtime.exceptionThrown', (params) => consoleErrors.push({
      type: 'exception',
      values: [params.exceptionDetails?.exception?.description || params.exceptionDetails?.text || 'unknown exception'],
    }));
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: run.viewport.width,
      height: run.viewport.height,
      deviceScaleFactor: 1,
      mobile: run.viewport.width < 600,
    });
    const url = new URL(run.route, baseUrl);
    const loaded = client.once('Page.loadEventFired');
    await client.send('Page.navigate', { url: url.toString() });
    await loaded;
    const evaluated = await client.send('Runtime.evaluate', {
      expression: browserProbeExpression(run, seedIndex),
      awaitPromise: true,
      returnByValue: true,
    });
    if (evaluated.exceptionDetails) throw new Error(evaluated.exceptionDetails.exception?.description || evaluated.exceptionDetails.text);
    const browserVersion = await client.send('Browser.getVersion');
    const gpu = await client.send('Runtime.evaluate', {
      expression: `(async () => {
        if (!navigator.gpu) return { available: false };
        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) return { available: false };
        const info = adapter.info || {};
        return { available: true, vendor: info.vendor || null, architecture: info.architecture || null, device: info.device || null, description: info.description || null };
      })()`,
      awaitPromise: true,
      returnByValue: true,
    });
    const screenshotResult = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const screenshot = Buffer.from(screenshotResult.data, 'base64');
    const screenshotSha256 = sha256Bytes(screenshot);
    const screenshotDirectory = path.join(outputDirectory, 'screenshots', 'sha256');
    fs.mkdirSync(screenshotDirectory, { recursive: true });
    const screenshotPath = path.join(screenshotDirectory, `${screenshotSha256}.png`);
    if (!fs.existsSync(screenshotPath)) fs.writeFileSync(screenshotPath, screenshot);
    const captured = evaluated.result.value;
    const reloaded = client.once('Page.loadEventFired');
    await client.send('Page.reload', { ignoreCache: false });
    await reloaded;
    const reload = await client.send('Runtime.evaluate', {
      expression: `(async () => {
        const started = performance.now();
        while (!['ready', 'completed', 'failed'].includes(document.body.dataset.journeyPhase)) {
          if (performance.now() - started > 45000) return { restored: false, reason: 'reload_timeout' };
          await new Promise((resolve) => setTimeout(resolve, 25));
        }
        const tier = globalThis.__simulatteTierRunReceipt || null;
        const platform = globalThis.__simulattePluginPlatformV4 || null;
        const seed = tier?.scenario?.seed || platform?.scenario?.seed || null;
        return {
          restored: document.body.dataset.journeyPhase === 'completed' && seed === ${JSON.stringify(run.seed)},
          reason: document.body.dataset.journeyPhase === 'completed' ? 'scenario_identity_mismatch' : 'terminal_receipt_not_restored',
        };
      })()`,
      awaitPromise: true,
      returnByValue: true,
    });
    if (reload.result.value.restored) captured.evidence.lifecycle.push('reload');
    else {
      captured.integrity.status = 'contradictory';
      captured.integrity.contradictions.push(reload.result.value.reason);
    }
    captured.evidence.console = consoleRows;
    captured.evidence.consoleErrors = consoleErrors;
    captured.evidence.screenshot = {
      sha256: screenshotSha256,
      path: path.relative(outputDirectory, screenshotPath),
      byteLength: screenshot.length,
    };
    captured.evidence.pixelReadback = { ...inspectPng(screenshot), sha256: screenshotSha256 };
    return {
      schema: 'simulatte.profileEvidenceReceipt.v1',
      capturedAt: new Date().toISOString(),
      run: {
        id: run.id,
        profileId: run.profileId,
        seedId: run.seedId,
        seed: run.seed,
        viewportId: run.viewport.id,
        interactionPath: run.interactionPath,
      },
      sourceIdentity,
      browser: {
        product: browserVersion.product,
        protocolVersion: browserVersion.protocolVersion,
        userAgent: browserVersion.userAgent,
        gpu: gpu.result.value,
      },
      ...captured,
      claims: claims.map((claim) => ({ id: claim.id, sentence: claim.sentence })),
    };
  } finally {
    if (client) client.close();
    await stopChild(chrome);
    fs.rmSync(profileDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  }
}

async function createEvidenceServer(publicRoot) {
  const server = createStaticSiteServer({ publicRoot });
  await new Promise((resolve, reject) => server.listen(0, '127.0.0.1', resolve).once('error', reject));
  return { server, baseUrl: `http://127.0.0.1:${server.address().port}/` };
}

export { captureBrowserRun, createEvidenceServer, findChrome, inspectPng };
