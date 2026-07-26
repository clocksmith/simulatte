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
        const phase = document.body?.dataset.journeyPhase;
        const runtimeStatus = document.getElementById('runtime-status');
        if (phase === 'failed' || runtimeStatus?.dataset.kind === 'error') {
          const event = [...(globalThis.__simulatteAutonomyRuntimeEvents || [])]
            .reverse()
            .find((row) => row.level === 'error' || row.event === 'runtime.failed');
          const failure = globalThis.__simulatteLastFailError || null;
          throw new Error('profile evidence runtime failed at ' + label + ': '
            + (event?.details?.message || runtimeStatus?.textContent || 'unknown runtime error')
            + (failure ? ' evidence=' + JSON.stringify(failure) : ''));
        }
        if (performance.now() - started > limit) {
          const recentEvents = [...(globalThis.__simulatteAutonomyRuntimeEvents || [])]
            .slice(-3)
            .map((row) => row.event + ':' + JSON.stringify(row.details || {}))
            .join('|');
          throw new Error('profile evidence timeout at ' + label
            + ' phase=' + (document.body?.dataset.journeyPhase || 'missing')
            + ' status=' + (runtimeStatus?.textContent || 'missing')
            + ' clock=' + JSON.stringify(globalThis.__simulattePluginPlatformV4?.clock || null)
            + ' tier=' + JSON.stringify(globalThis.__simulatteTierRunState || null)
            + ' events=' + (recentEvents || 'none'));
        }
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    };
    await waitFor(() => document.body?.dataset.journeyPhase === 'ready', 'ready');
    const expectedSeed = ${JSON.stringify(run.seed)};
    const seedText = () => document.getElementById('scenario-seed')?.textContent || '';
    for (let index = 0; index < ${seedIndex}; index += 1) {
      const previous = seedText();
      document.getElementById('shuffle-button').click();
      await waitFor(() => seedText() !== previous, 'seed-change');
      await waitFor(
        () => document.body.dataset.journeyPhase === 'ready'
          && !document.getElementById('shuffle-button')?.disabled
          && !document.getElementById('start-button')?.disabled,
        'scenario-controls-ready',
        10000
      );
    }
    await waitFor(
      () => seedText().includes(expectedSeed),
      'governed-seed expected=' + expectedSeed + ' actual=' + seedText(),
      5000
    );
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
      const resume = document.getElementById('resume-button');
      if (resume && !resume.hidden && !resume.disabled) {
        resume.click();
        lifecycle.push('resume');
        if (!pause.hidden && !pause.disabled) pause.click();
      }
      const step = document.getElementById('step-button');
      if (step && !step.hidden && !step.disabled) {
        const previousStepStatus = document.getElementById('runtime-status')?.textContent || '';
        const previousEmittedCount = Number(globalThis.__simulattePluginPlatformV4?.clock?.emittedCount || 0);
        const previousClockCursor = Number(globalThis.__simulattePluginPlatformV4?.clock?.state?.cursor || 0);
        const previousTierStepCount = Number(globalThis.__simulatteTierRunState?.stepCount || 0);
        step.click();
        await waitFor(
          () => document.body.dataset.journeyPhase === 'completed'
            || Number(globalThis.__simulattePluginPlatformV4?.clock?.emittedCount || 0) > previousEmittedCount
            || Number(globalThis.__simulattePluginPlatformV4?.clock?.state?.cursor || 0) > previousClockCursor
            || Number(globalThis.__simulatteTierRunState?.stepCount || 0) > previousTierStepCount
            || (document.getElementById('runtime-status')?.textContent || '') !== previousStepStatus,
          'step-completed',
          10000
        );
        lifecycle.push('step');
      }
      if (resume && !resume.hidden && !resume.disabled) {
        resume.click();
        if (!lifecycle.includes('resume')) lifecycle.push('resume');
      }
    }
    const started = performance.now();
    while (!['completed', 'failed'].includes(document.body.dataset.journeyPhase)) {
      progressiveStates.push({
        phase: document.body.dataset.journeyPhase,
        tick: Number(document.getElementById('metric-tick')?.textContent || 0),
        atMs: performance.now(),
      });
      if (performance.now() - started > 45000) {
        throw new Error('profile evidence timeout at settlement phase='
          + (document.body.dataset.journeyPhase || 'missing')
          + ' status=' + (document.getElementById('runtime-status')?.textContent || 'missing')
          + ' clock=' + JSON.stringify(globalThis.__simulattePluginPlatformV4?.clock || null)
          + ' playback=' + JSON.stringify(globalThis.__simulattePluginRunReceipt || null));
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    lifecycle.push('settle');
    progressiveStates.push({
      phase: document.body.dataset.journeyPhase,
      tick: Number(document.getElementById('metric-tick')?.textContent || 0),
      atMs: performance.now(),
    });
    const replay = document.getElementById('replay-button');
    if (replay && !replay.hidden && !replay.disabled) {
      replay.click();
      await waitFor(() => document.body.dataset.journeyPhase !== 'completed', 'replay-started');
      await waitFor(() => document.body.dataset.journeyPhase === 'completed', 'replay');
      lifecycle.push('replay');
    }
    await waitFor(() => {
      const transition = document.getElementById('autonomy-canvas')?.dataset.cameraTransition;
      return !transition || transition === 'settled';
    }, 'camera-settled', 5000);
    const tierReceipt = globalThis.__simulatteTierRunReceipt || null;
    const pluginRunReceipt = globalThis.__simulattePluginRunReceipt || null;
    const runReceipt = tierReceipt || pluginRunReceipt;
    const platform = globalThis.__simulattePluginPlatformV4 || null;
    const runtimeReceipt = tierReceipt?.pluginRuntime || pluginRunReceipt?.runtime || null;
    const contributions = platform?.contributions || [];
    const platformReceipt = platform?.receipt || platform || null;
    const contributionSources = platform?.contributionSources || [];
    const datasetEvidence = (platformReceipt?.provenanceReceipts || [])
      .flatMap((receipt) => receipt?.envelopes || [])
      .filter((envelope) => envelope?.subjectKind === 'dataset')
      .flatMap((envelope) => (envelope.datasetIds || []).map((id) => ({
        id,
        subjectId: envelope.subjectId || null,
        artifactSha256s: envelope.artifactSha256s || [],
        contentVersions: envelope.contentVersions || [],
      })));
    const native = contributionSources.length === ${run.pluginIds.length}
      && contributionSources.every((row) => row.source === 'native-v4')
      && ${JSON.stringify(run.pluginIds)}.every((id) => contributionSources.some((row) => row.pluginId === id));
    const events = runtimeReceipt?.events
      || contributions.flatMap((row) => row.events || [])
      || globalThis.__simulatteAutonomyRuntimeEvents
      || [];
    const collectExecutionReceipts = (value, output = [], depth = 0) => {
      if (!value || depth > 8) return output;
      if (value.schema === 'simulatte.comparisonExecutionReceipt.v4') {
        output.push(value);
        return output;
      }
      if (Array.isArray(value)) {
        value.forEach((row) => collectExecutionReceipts(row, output, depth + 1));
      } else if (typeof value === 'object') {
        Object.values(value).forEach((row) => collectExecutionReceipts(row, output, depth + 1));
      }
      return output;
    };
    const comparisons = collectExecutionReceipts([
      runReceipt?.actionResult || null,
      runReceipt?.comparisonExecutionReceipt || null,
      runtimeReceipt?.pluginReceipts || null,
      globalThis.__simulatteComparisonExecutionReceipts || null,
    ]);
    const settlements = tierReceipt?.settlement
      ? (Array.isArray(tierReceipt.settlement) ? tierReceipt.settlement.flat() : [tierReceipt.settlement])
      : pluginRunReceipt?.settlements || [];
    const canvas = document.getElementById('autonomy-canvas');
    const canvasRect = canvas?.getBoundingClientRect() || null;
    const visibleRect = (element) => {
      if (!element) return null;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      if (
        style.display === 'none'
        || style.visibility === 'hidden'
        || Number(style.opacity) === 0
        || rect.width <= 0
        || rect.height <= 0
      ) return null;
      return {
        id: element.id || element.className || element.tagName.toLowerCase(),
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      };
    };
    const overlays = [
      visibleRect(document.querySelector('.visualizer-hud')),
      visibleRect(document.getElementById('plugin-map-ui')),
      visibleRect(document.getElementById('plugin-hud-ui')),
    ].filter(Boolean);
    const clippedArea = (rect, bounds) => {
      if (!bounds) return 0;
      const width = Math.max(0, Math.min(rect.x + rect.width, bounds.right) - Math.max(rect.x, bounds.left));
      const height = Math.max(0, Math.min(rect.y + rect.height, bounds.bottom) - Math.max(rect.y, bounds.top));
      return width * height;
    };
    const canvasArea = canvasRect ? canvasRect.width * canvasRect.height : 0;
    const overlayAreas = overlays.map((rect) => clippedArea(rect, canvasRect));
    const viewDecision = platform?.view?.state?.decision || null;
    const sourceIntentId = viewDecision?.intentId?.startsWith(viewDecision.source + ':')
      ? viewDecision.intentId.slice(viewDecision.source.length + 1)
      : null;
    const expectedFocusId = ${JSON.stringify(run.tier === 'city')} && sourceIntentId && ['overview', 'compare'].includes(viewDecision.mode)
      ? 'plugin:' + viewDecision.source + ':' + sourceIntentId
      : null;
    return {
      runtime: {
        path: native ? 'native-v4' : contributionSources.some((row) => row.source === 'legacy-adapter') ? 'legacy-adapter' : 'unproven-v4',
        profileId: ${JSON.stringify(run.profileId)},
        platformReceipt,
        clockReceipt: platform?.clock || null,
        viewReceipt: platform?.view || null,
        compositorReceipts: Array.isArray(platform?.compositor) ? platform.compositor : [],
        datasetEvidence,
        runReceipt,
        contributionSources,
      },
      evidence: {
        controls,
        events,
        progressiveStates,
        comparisons,
        settlements,
        reload: null,
        lifecycle,
        visual: {
          schema: 'simulatte.renderedEvidence.v1',
          canvas: canvasRect ? {
            x: canvasRect.x,
            y: canvasRect.y,
            width: canvasRect.width,
            height: canvasRect.height,
          } : null,
          overlays,
          obstructionRatio: canvasArea > 0
            ? overlayAreas.reduce((sum, area) => sum + area, 0) / canvasArea
            : 1,
          largestOverlayRatio: canvasArea > 0
            ? Math.max(0, ...overlayAreas) / canvasArea
            : 1,
          camera: {
            mode: canvas?.dataset.cameraMode || null,
            focusId: canvas?.dataset.cameraFocus || null,
            transition: canvas?.dataset.cameraTransition || null,
            expectedFocusId,
          },
        },
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
    const beforeRunReceipt = captured.runtime.runReceipt;
    const reload = await client.send('Runtime.evaluate', {
      expression: `(async () => {
        const beforeReceipt = ${JSON.stringify(beforeRunReceipt)};
        const isPluginPlayback = beforeReceipt?.schema === 'simulatte.pluginPlaybackRunReceipt.v1';
        const receipt = () => isPluginPlayback
          ? globalThis.__simulattePluginRunReceipt || null
          : globalThis.__simulatteTierRunReceipt || null;
        const started = performance.now();
        while (!receipt() || document.body.dataset.journeyPhase !== 'completed') {
          const phase = document.body.dataset.journeyPhase;
          if (phase === 'failed') break;
          if (performance.now() - started > 45000) break;
          await new Promise((resolve) => setTimeout(resolve, 25));
        }
        const afterReceipt = receipt();
        const beforeScenario = beforeReceipt?.scenario || null;
        const afterScenario = afterReceipt?.scenario || null;
        const restored = Boolean(afterReceipt && document.body.dataset.journeyPhase === 'completed');
        return {
          attempted: true,
          kind: isPluginPlayback ? 'plugin-playback' : 'tier-run',
          restored,
          beforeReceipt: isPluginPlayback ? beforeReceipt : null,
          afterReceipt: isPluginPlayback ? afterReceipt : null,
          beforeScenarioId: beforeScenario?.id || null,
          afterScenarioId: afterScenario?.id || null,
          beforeSeed: beforeScenario?.seed || null,
          afterSeed: afterScenario?.seed || null,
          reason: restored ? null : 'terminal_receipt_not_restored',
        };
      })()`,
      awaitPromise: true,
      returnByValue: true,
    });
    captured.evidence.reload = reload.result.value;
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
    if (client) await client.close();
    await stopChild(chrome);
    fs.rmSync(profileDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  }
}

async function createEvidenceServer(publicRoot) {
  const server = createStaticSiteServer({ publicRoot });
  await new Promise((resolve, reject) => server.listen(0, '127.0.0.1', resolve).once('error', reject));
  return { server, baseUrl: `http://127.0.0.1:${server.address().port}/` };
}

export { browserProbeExpression, captureBrowserRun, createEvidenceServer, findChrome, inspectPng };
