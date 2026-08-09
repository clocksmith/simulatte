import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawn } from 'node:child_process';
import { CdpClient, findChrome } from './run-browser-smoke.mjs';
import { encodeRgbaPng } from './profile-evidence-png.mjs';
import { removeGeneratedProfileDirectory, stopChild } from './profile-evidence-process.mjs';
import { createStaticSiteServer } from './static-site-server.mjs';
import {
  canonicalJson,
  pluginPlaybackIdentity,
  sha256Bytes,
} from './profile-evidence-contract.mjs';

function serializedIdentity(value) {
  const content = JSON.stringify(value);
  return {
    contentSha256: sha256Bytes(content),
    byteLength: Buffer.byteLength(content),
  };
}

function compactResultIdentity(result) {
  if (!result || typeof result !== 'object') return null;
  return {
    schema: result.schema || null,
    id: result.id || null,
    scenarioId: result.scenarioId || result.scenario?.id || null,
    scenarioSeed: result.seed || result.scenario?.seed || null,
    scenarioIdentity: result.scenarioIdentity || null,
    status: result.status || null,
  };
}

function compactEventReference(event) {
  const identity = serializedIdentity(event);
  return {
    schema: 'simulatte.profileEvidenceEventRef.v1',
    originalSchema: event?.schema || null,
    id: event?.id || null,
    pluginId: event?.pluginId || null,
    kind: event?.kind || event?.event || null,
    sequence: Number.isFinite(event?.sequence) ? event.sequence : null,
    simulationTimeMs: Number.isFinite(event?.simulationTimeMs) ? event.simulationTimeMs : null,
    result: compactResultIdentity(event?.result),
    ...identity,
  };
}

function compactRunReceiptReference(receipt) {
  if (!receipt || typeof receipt !== 'object') return null;
  if (receipt.schema === 'simulatte.profileEvidenceRunReceiptRef.v1') return receipt;
  const restorationIdentity = pluginPlaybackIdentity(receipt);
  const events = receipt.pluginRuntime?.events || receipt.runtime?.events || [];
  const pluginReceipts = receipt.pluginRuntime?.pluginReceipts || receipt.runtime?.pluginReceipts || [];
  return {
    schema: 'simulatte.profileEvidenceRunReceiptRef.v1',
    originalSchema: receipt.schema || null,
    profileId: receipt.profileId || null,
    tier: receipt.tier || null,
    ownerPluginId: receipt.ownerPluginId || null,
    scenario: {
      id: receipt.scenario?.id || null,
      seed: receipt.scenario?.seed || null,
    },
    status: receipt.actionResult?.status || receipt.status || null,
    scenarioIdentity: receipt.actionResult?.scenarioIdentity || null,
    settlements: receipt.settlements || null,
    eventCount: Array.isArray(events) ? events.length : 0,
    pluginReceiptCount: Array.isArray(pluginReceipts) ? pluginReceipts.length : 0,
    restorationIdentity,
    restorationIdentitySha256: restorationIdentity
      ? sha256Bytes(canonicalJson(restorationIdentity))
      : null,
    ...serializedIdentity(receipt),
  };
}

function compactCapturedEvidence(captured) {
  return {
    ...captured,
    runtime: {
      ...captured.runtime,
      runReceipt: compactRunReceiptReference(captured.runtime?.runReceipt),
    },
    evidence: {
      ...captured.evidence,
      events: (captured.evidence?.events || []).map(compactEventReference),
    },
  };
}

async function withTimeout(promise, limitMs, label) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error(`profile evidence host timeout at ${label} after ${limitMs}ms`)),
      limitMs,
    );
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timeoutId);
  }
}

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

async function waitForReloadedDocument(client, previousTimeOrigin) {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    try {
      const evaluated = await client.send('Runtime.evaluate', {
        expression: 'performance.timeOrigin',
        returnByValue: true,
      });
      const currentTimeOrigin = evaluated.result?.value;
      if (Number.isFinite(currentTimeOrigin) && currentTimeOrigin !== previousTimeOrigin) return currentTimeOrigin;
    } catch {
      // The previous execution context is expected to disappear during reload.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('profile evidence host timeout at page-reload-document');
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

function inspectPng(buffer, method) {
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
    method,
    width,
    height,
    sampleCount,
    nonTransparentSampleCount: nonTransparent,
    distinctColorCount: colors.size,
    status: nonTransparent === sampleCount && colors.size > 1 ? 'pass' : 'fail',
  };
}

function browserProbeExpression(run) {
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
    const governedRoute = globalThis.location
      ? globalThis.SimulatteRouter?.parsePath(globalThis.location.pathname, globalThis.location.search)
      : null;
    if (globalThis.location && (governedRoute?.experience !== ${JSON.stringify(run.profileId)}
      || governedRoute?.simulation?.scenarioId !== ${JSON.stringify(run.seedId)}
      || governedRoute?.simulation?.seed !== ${JSON.stringify(run.seed)})) {
      throw new Error('profile evidence governed URL mismatch: ' + JSON.stringify(governedRoute));
    }
    const renderCanvas = document.getElementById(${JSON.stringify(run.tier === 'city' ? 'autonomy-canvas' : 'overlay-canvas')});
    const navigation = performance.getEntriesByType('navigation')[0];
    const coldStartup = { status: 'pass', basis: 'navigation-to-ready', durationMs: performance.now(), responseEndMs: Number(navigation?.responseEnd || 0) };
    let firstMeaningfulFrame = null;
    const servedVersionResponse = await fetch('/version.json', { cache: 'no-store' });
    if (!servedVersionResponse.ok) throw new Error('profile evidence served build identity unavailable');
    const servedVersion = await servedVersionResponse.json();
    const deployment = {
      status: typeof servedVersion?.build === 'string' && servedVersion.build ? 'pass' : 'fail',
      servedBuildId: servedVersion?.build || null,
      pageUrl: location.href,
      route: location.pathname,
      versionUrl: new URL('/version.json', location.href).toString(),
    };
    const expectedSeed = ${JSON.stringify(run.seed)};
    const seedText = () => document.getElementById('scenario-seed')?.textContent || '';
    await waitFor(
      () => seedText().includes(expectedSeed)
        && !document.getElementById('start-button')?.disabled,
      'governed-seed expected=' + expectedSeed + ' actual=' + seedText(),
      5000
    );
    const performanceWindowBasis = 'selected-governed-seed-ready-to-lifecycle-camera-settled';
    const captureStartedAt = performance.now();
    const performanceMarks = [{ label: 'window-start', atMs: captureStartedAt }];
    const markPerformance = (label) => performanceMarks.push({ label, atMs: performance.now() });
    const longTasks = [];
    let longTaskSupported = typeof PerformanceObserver === 'function' && PerformanceObserver.supportedEntryTypes?.includes('longtask');
    const longTaskObserver = longTaskSupported ? new PerformanceObserver((list) => {
      list.getEntries().forEach((entry) => longTasks.push({ startTime: entry.startTime, duration: entry.duration }));
    }) : null;
    try { longTaskObserver?.observe({ type: 'longtask' }); } catch { longTaskSupported = false; }
    const frameTimes = [];
    let frameSamplerActive = true;
    let frameSamplerId = 0;
    const sampleFrame = (atMs) => {
      if (!frameSamplerActive) return;
      if (frameTimes.length < 8192) frameTimes.push(atMs);
      frameSamplerId = requestAnimationFrame(sampleFrame);
    };
    frameSamplerId = requestAnimationFrame(sampleFrame);
    const memorySamples = [];
    const sampleMemory = () => {
      const memory = performance.memory;
      if (!memory) return;
      const usedJsHeapBytes = Number(memory.usedJSHeapSize);
      const totalJsHeapBytes = Number(memory.totalJSHeapSize);
      if (Number.isFinite(usedJsHeapBytes) && Number.isFinite(totalJsHeapBytes)) {
        memorySamples.push({ atMs: performance.now(), usedJsHeapBytes, totalJsHeapBytes });
      }
    };
    sampleMemory();
    const memorySamplerId = setInterval(sampleMemory, 25);
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
    const commitTimelineTerminal = async (label, recordLifecycle = false) => {
      const timeline = document.getElementById('playback-timeline');
      await waitFor(
        () => timeline
          && !timeline.hidden
          && Number.isInteger(Number(timeline.max))
          && Number(timeline.max) > 0,
        label + '-timeline-ready',
        10000
      );
      timeline.value = timeline.max;
      timeline.dispatchEvent(new Event('change', { bubbles: true }));
      markPerformance(label + '-seek');
      await waitFor(
        () => document.body.dataset.journeyPhase === 'completed'
          || ((document.getElementById('runtime-status')?.textContent || '').includes('End preview')
            && Number(timeline.value) === Number(timeline.max)),
        label + '-terminal-preview',
        45000
      );
      markPerformance(label + '-terminal-preview');
      if (recordLifecycle) lifecycle.push('seek', 'terminal-preview');
      if (document.body.dataset.journeyPhase !== 'completed') {
        const commit = document.getElementById('resume-button');
        if (!commit || commit.hidden || commit.disabled) {
          throw new Error('profile evidence terminal commit control unavailable at ' + label);
        }
        commit.click();
        markPerformance(label + '-terminal-commit');
        if (recordLifecycle) lifecycle.push('terminal-commit');
      }
      await waitFor(() => document.body.dataset.journeyPhase === 'completed', label + '-terminal-commit', 45000);
      markPerformance(label + '-completed');
    };
    const readyFrameCount = Number(renderCanvas?.dataset.frameCount || 0);
    const firstMeaningfulFrameStartedAt = performance.now();
    markPerformance('start-action');
    document.getElementById('start-button').click();
    await waitFor(() => {
      const platform = globalThis.__simulattePluginPlatformV4;
      const renderAdvanced = Number(renderCanvas?.dataset.frameCount || 0) > readyFrameCount;
      return renderAdvanced && Array.isArray(platform?.contributions) && platform.contributions.length > 0;
    }, 'first-meaningful-frame');
    const firstMeaningfulFramePageAt = performance.now();
    firstMeaningfulFrame = {
      status: 'pass',
      atMs: firstMeaningfulFramePageAt - firstMeaningfulFrameStartedAt,
      navigationAtMs: firstMeaningfulFramePageAt,
      basis: 'start-action-to-new-governed-frame',
      frameCount: Number(renderCanvas?.dataset.frameCount || 0),
      renderSignal: ${JSON.stringify(run.tier === 'city')} ? 'city-canvas-frame' : 'tier-canvas2d-frame',
      contributionCount: globalThis.__simulattePluginPlatformV4?.contributions?.length || 0,
      semanticLayerCount: (globalThis.__simulattePluginPlatformV4?.contributions || [])
        .reduce((sum, row) => sum + (row?.presentation?.layers?.length || 0), 0),
      compositorReceiptCount: globalThis.__simulattePluginPlatformV4?.compositor?.length || 0,
    };
    markPerformance('first-meaningful-frame');
    const pause = document.getElementById('pause-button');
    if (pause && !pause.hidden && !pause.disabled) {
      await new Promise((resolve) => setTimeout(resolve, 25));
      pause.click();
      lifecycle.push('pause');
      markPerformance('pause');
      const resume = document.getElementById('resume-button');
      if (resume && !resume.hidden && !resume.disabled) {
        resume.click();
        lifecycle.push('resume');
        markPerformance('resume');
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
        markPerformance('step');
      }
      if (resume && !resume.hidden && !resume.disabled) {
        resume.click();
        if (!lifecycle.includes('resume')) lifecycle.push('resume');
        markPerformance('resume-after-step');
      }
    }
    const hasProgressiveTimeline = !document.getElementById('playback-timeline-control')?.hidden
      && Number(document.getElementById('playback-timeline')?.max || 0) > 0;
    if (hasProgressiveTimeline) await commitTimelineTerminal('settlement', true);
    const settlementStartedAt = performance.now();
    while (!['completed', 'failed'].includes(document.body.dataset.journeyPhase)) {
      progressiveStates.push({
        phase: document.body.dataset.journeyPhase,
        tick: Number(document.getElementById('metric-tick')?.textContent || 0),
        atMs: performance.now(),
      });
      if (performance.now() - settlementStartedAt > 45000) {
        throw new Error('profile evidence timeout at settlement phase='
          + (document.body.dataset.journeyPhase || 'missing')
          + ' status=' + (document.getElementById('runtime-status')?.textContent || 'missing')
          + ' clock=' + JSON.stringify(globalThis.__simulattePluginPlatformV4?.clock || null)
          + ' playback=' + JSON.stringify(globalThis.__simulattePluginRunReceipt || null));
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    lifecycle.push('settle');
    markPerformance('settled');
    progressiveStates.push({
      phase: document.body.dataset.journeyPhase,
      tick: Number(document.getElementById('metric-tick')?.textContent || 0),
      atMs: performance.now(),
    });
    const canonicalize = (value) => {
      if (Array.isArray(value)) return value.map(canonicalize);
      if (!value || typeof value !== 'object') return value;
      return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
    };
    const sha256Text = async (content) => {
      const bytes = new TextEncoder().encode(content);
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    };
    const sha256Value = async (value) => sha256Text(JSON.stringify(canonicalize(value)) + '\\n');
    const currentRunReceipt = () => globalThis.__simulatteTierRunReceipt
      || globalThis.__simulattePluginRunReceipt
      || null;
    const replayIdentity = (receipt) => receipt?.schema === 'simulatte.pluginPlaybackRunReceipt.v1'
      ? {
          schema: receipt.schema,
          ownerPluginId: receipt.ownerPluginId,
          scenario: receipt.scenario,
          parameterValues: receipt.parameterValues,
          interventions: receipt.interventions,
          actionResult: receipt.actionResult,
          settlements: receipt.settlements,
          comparisonExecutionReceipts: receipt.comparisonExecutionReceipts,
          clock: receipt.clock,
        }
      : {
          schema: receipt?.schema,
          tier: receipt?.tier,
          profileId: receipt?.profileId,
          scenario: receipt?.scenario,
          parameterValues: receipt?.parameterValues,
          actionResult: receipt?.actionResult,
          settlement: receipt?.settlement,
        };
    const replayBeforeIdentity = replayIdentity(currentRunReceipt());
    let replayAfterIdentity = null;
    const replay = document.getElementById('replay-button');
    if (replay && !replay.hidden && !replay.disabled) {
      markPerformance('replay-action');
      replay.click();
      await waitFor(() => document.body.dataset.journeyPhase !== 'completed', 'replay-started');
      const replayHasTimeline = !document.getElementById('playback-timeline-control')?.hidden
        && Number(document.getElementById('playback-timeline')?.max || 0) > 0;
      if (replayHasTimeline) await commitTimelineTerminal('replay');
      else await waitFor(() => document.body.dataset.journeyPhase === 'completed', 'replay');
      replayAfterIdentity = replayIdentity(currentRunReceipt());
      lifecycle.push('replay');
      markPerformance('replay-completed');
    }
    await waitFor(() => {
      const transition = document.getElementById('autonomy-canvas')?.dataset.cameraTransition;
      return !transition || transition === 'settled';
    }, 'camera-settled', 5000);
    markPerformance('camera-settled');
    const performanceCompletedAt = performance.now();
    longTaskObserver?.takeRecords().forEach((entry) => longTasks.push({ startTime: entry.startTime, duration: entry.duration }));
    longTaskObserver?.disconnect();
    frameSamplerActive = false;
    cancelAnimationFrame(frameSamplerId);
    clearInterval(memorySamplerId);
    sampleMemory();
    const frameIntervalEntries = frameTimes.slice(1).map((value, index) => ({
      startTime: frameTimes[index],
      endTime: value,
      duration: value - frameTimes[index],
    }));
    const frameIntervals = frameIntervalEntries.map((entry) => entry.duration);
    const sortedFrameIntervals = [...frameIntervals].sort((left, right) => left - right);
    const percentile = (values, fraction) => values.length
      ? values[Math.min(values.length - 1, Math.floor((values.length - 1) * fraction))]
      : null;
    const usedHeapValues = memorySamples.map((row) => row.usedJsHeapBytes);
    const replayBeforeSha256 = await sha256Value(replayBeforeIdentity);
    const replayAfterSha256 = replayAfterIdentity ? await sha256Value(replayAfterIdentity) : null;
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
    const compactRunReceipt = async (receipt) => {
      if (!receipt || typeof receipt !== 'object') return null;
      const content = JSON.stringify(receipt);
      const restorationIdentity = receipt.schema === 'simulatte.pluginPlaybackRunReceipt.v1'
        && receipt.actionResult?.status === 'settled'
        && receipt.ownerPluginId
        && receipt.scenario?.id
        && receipt.scenario?.seed
        && Array.isArray(receipt.settlements)
        && receipt.settlements.length > 0
        ? {
            ownerPluginId: receipt.ownerPluginId,
            scenarioId: receipt.scenario.id,
            seed: receipt.scenario.seed,
            currentStep: receipt.actionResult.currentStep,
            totalSteps: receipt.actionResult.totalSteps,
            settlementSha256: await sha256Value(receipt.settlements),
            clock: {
              timelineId: receipt.clock?.state?.timelineId || null,
              timelineEventCount: receipt.clock?.timeline?.eventCount ?? null,
              currentMs: receipt.clock?.state?.currentMs ?? null,
              cursor: receipt.clock?.state?.cursor ?? null,
            },
          }
        : null;
      return {
        schema: 'simulatte.profileEvidenceRunReceiptRef.v1',
        originalSchema: receipt.schema || null,
        profileId: receipt.profileId || null,
        tier: receipt.tier || null,
        ownerPluginId: receipt.ownerPluginId || null,
        scenario: {
          id: receipt.scenario?.id || null,
          seed: receipt.scenario?.seed || null,
        },
        status: receipt.actionResult?.status || receipt.status || null,
        scenarioIdentity: receipt.actionResult?.scenarioIdentity || null,
        settlements: receipt.settlements || null,
        eventCount: Array.isArray(receipt.runtime?.events || receipt.pluginRuntime?.events)
          ? (receipt.runtime?.events || receipt.pluginRuntime?.events).length
          : 0,
        pluginReceiptCount: Array.isArray(receipt.runtime?.pluginReceipts || receipt.pluginRuntime?.pluginReceipts)
          ? (receipt.runtime?.pluginReceipts || receipt.pluginRuntime?.pluginReceipts).length
          : 0,
        restorationIdentity,
        restorationIdentitySha256: restorationIdentity ? await sha256Value(restorationIdentity) : null,
        contentSha256: await sha256Text(content),
        byteLength: new TextEncoder().encode(content).byteLength,
      };
    };
    const compactedRunReceipt = await compactRunReceipt(runReceipt);
    const canvas = renderCanvas;
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
    const interactionCoverage = {
      expected: ${JSON.stringify(run.interactionPath)},
      observed: lifecycle,
      missing: ${JSON.stringify(run.interactionPath)}.filter((step) => !lifecycle.includes(step)),
    };
    return {
      runtime: {
        path: native ? 'native-v4' : contributionSources.some((row) => row.source === 'legacy-adapter') ? 'legacy-adapter' : 'unproven-v4',
        profileId: ${JSON.stringify(run.profileId)},
        platformReceipt: platformReceipt ? {
          schema: platformReceipt.schema || null,
          id: platformReceipt.id || null,
          provenanceReceiptCount: Array.isArray(platformReceipt.provenanceReceipts)
            ? platformReceipt.provenanceReceipts.length
            : 0,
        } : null,
        clockReceipt: platform?.clock || null,
        viewReceipt: platform?.view || null,
        compositorReceipts: Array.isArray(platform?.compositor) ? platform.compositor : [],
        datasetEvidence,
        runReceipt: compactedRunReceipt,
        contributionSources,
      },
      evidence: {
        controls,
        events,
        progressiveStates,
        comparisons,
        settlements,
        replay: {
          attempted: Boolean(replay),
          beforeSha256: replayBeforeSha256,
          afterSha256: replayAfterSha256,
          deterministic: Boolean(replayAfterSha256 && replayAfterSha256 === replayBeforeSha256),
        },
        deployment,
        interactionCoverage,
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
          frameCount: Number(renderCanvas?.dataset.frameCount || progressiveStates.length),
          elapsedMs: performanceCompletedAt - captureStartedAt,
          basis: 'governed-lifecycle-after-ready',
          windowBasis: performanceWindowBasis,
          coldStartup,
          firstMeaningfulFrame,
          framePacing: {
            basis: performanceWindowBasis,
            status: frameIntervals.length > 1 ? 'pass' : 'fail',
            sampleCount: frameIntervals.length,
            p50Ms: percentile(sortedFrameIntervals, 0.5),
            p95Ms: percentile(sortedFrameIntervals, 0.95),
            maxMs: sortedFrameIntervals.at(-1) ?? null,
            over50MsCount: frameIntervals.filter((value) => value > 50).length,
            worstIntervals: frameIntervalEntries
              .sort((left, right) => right.duration - left.duration)
              .slice(0, 20),
          },
          memory: {
            basis: performanceWindowBasis,
            status: usedHeapValues.length ? 'pass' : 'fail',
            sampleCount: usedHeapValues.length,
            initialUsedJsHeapBytes: usedHeapValues[0] ?? null,
            finalUsedJsHeapBytes: usedHeapValues.at(-1) ?? null,
            peakUsedJsHeapBytes: usedHeapValues.length ? Math.max(...usedHeapValues) : null,
            finalTotalJsHeapBytes: memorySamples.at(-1)?.totalJsHeapBytes ?? null,
          },
          longTasks: {
            basis: performanceWindowBasis,
            status: longTaskSupported ? 'pass' : 'unsupported',
            sampleCount: longTasks.length,
            totalMs: longTasks.reduce((sum, row) => sum + row.duration, 0),
            maxMs: Math.max(0, ...longTasks.map((row) => row.duration)),
            entries: [...longTasks]
              .sort((left, right) => right.duration - left.duration)
              .slice(0, 20),
          },
          marks: performanceMarks,
          rendererCpu: renderCanvas?.__simulatteRenderReceipt?.().renderCpu || null,
        },
      },
      integrity: {
        status: document.body.dataset.journeyPhase === 'completed' ? 'pass' : 'contradictory',
        contradictions: document.body.dataset.journeyPhase === 'completed' ? [] : ['runtime_failed'],
      },
    };
  })()`;
}

function governedRunUrl(baseUrl, run) {
  const url = new URL(run.route, baseUrl);
  url.searchParams.set('scenario', run.seedId);
  url.searchParams.set('seed', run.seed);
  return url;
}

async function captureBrowserRun({ chromePath, baseUrl, run, sourceIdentity, claims, outputDirectory }) {
  const renderCanvasId = run.tier === 'city' ? 'autonomy-canvas' : 'overlay-canvas';
  const debugPort = await freePort();
  const profileDirectory = fs.mkdtempSync(path.join(os.tmpdir(), `simulatte-profile-evidence-${run.profileId}-`));
  const chrome = spawn(chromePath, [
    '--headless=new',
    '--enable-unsafe-webgpu',
    ...(process.platform === 'linux' ? ['--use-angle=vulkan', '--enable-features=Vulkan', '--disable-vulkan-surface'] : []),
    '--enable-precise-memory-info',
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
    const url = governedRunUrl(baseUrl, run);
    const loaded = client.once('Page.loadEventFired');
    await withTimeout(client.send('Page.navigate', { url: url.toString() }), 30000, 'page-navigate');
    await withTimeout(loaded, 30000, 'page-load');
    const evaluated = await withTimeout(client.send('Runtime.evaluate', {
      expression: browserProbeExpression(run),
      awaitPromise: true,
      returnByValue: true,
    }), 180000, 'browser-probe');
    if (evaluated.exceptionDetails) throw new Error(evaluated.exceptionDetails.exception?.description || evaluated.exceptionDetails.text);
    const browserVersion = await withTimeout(client.send('Browser.getVersion'), 10000, 'browser-version');
    const gpu = await withTimeout(client.send('Runtime.evaluate', {
      expression: `(() => {
        const receipt = document.getElementById(${JSON.stringify(renderCanvasId)})?.__simulatteRenderReceipt?.();
        return receipt?.adapter ? { available: true, ...receipt.adapter } : { available: false, rendererBackend: receipt?.backend || null };
      })()`,
      returnByValue: true,
    }), 10000, 'gpu-identity');
    const screenshotResult = await withTimeout(
      client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }),
      30000,
      'screenshot',
    );
    const pageScreenshot = Buffer.from(screenshotResult.data, 'base64');
    const pageScreenshotSha256 = sha256Bytes(pageScreenshot);
    const pageScreenshotDirectory = path.join(outputDirectory, 'screenshots', 'page', 'sha256');
    fs.mkdirSync(pageScreenshotDirectory, { recursive: true });
    const pageScreenshotPath = path.join(pageScreenshotDirectory, `${pageScreenshotSha256}.png`);
    if (!fs.existsSync(pageScreenshotPath)) fs.writeFileSync(pageScreenshotPath, pageScreenshot);
    const captured = compactCapturedEvidence(evaluated.result.value);
    const renderCapture = await withTimeout(client.send('Runtime.evaluate', {
      expression: `(async () => {
        const capture = document.getElementById(${JSON.stringify(renderCanvasId)})?.__simulatteCaptureRenderPixels;
        return typeof capture === 'function' ? capture() : null;
      })()`,
      awaitPromise: true,
      returnByValue: true,
    }), 30000, 'render-pixel-readback');
    if (renderCapture.exceptionDetails) {
      throw new Error(renderCapture.exceptionDetails.exception?.description || renderCapture.exceptionDetails.text);
    }
    const renderPixels = renderCapture.result.value;
    if (!renderPixels) throw new Error('profile_evidence_render_readback_unavailable');
    const beforeReloadOrigin = await withTimeout(client.send('Runtime.evaluate', {
      expression: 'performance.timeOrigin',
      returnByValue: true,
    }), 10000, 'reload-origin');
    await withTimeout(client.send('Page.reload', { ignoreCache: false }), 30000, 'page-reload');
    await waitForReloadedDocument(client, beforeReloadOrigin.result.value);
    const beforeRunReceipt = captured.runtime.runReceipt;
    const reload = await withTimeout(client.send('Runtime.evaluate', {
      expression: `(async () => {
        const beforeReceipt = ${JSON.stringify(beforeRunReceipt)};
        const isPluginPlayback = beforeReceipt?.originalSchema === 'simulatte.pluginPlaybackRunReceipt.v1'
          || beforeReceipt?.schema === 'simulatte.pluginPlaybackRunReceipt.v1';
        const receipt = () => isPluginPlayback
          ? globalThis.__simulattePluginRunReceipt || null
          : globalThis.__simulatteTierRunReceipt || null;
        const phase = () => document.body?.dataset.journeyPhase || 'loading';
        const pixelsReady = () => typeof document.getElementById(${JSON.stringify(renderCanvasId)})?.__simulatteCaptureRenderPixels === 'function';
        const started = performance.now();
        while (!receipt() || phase() !== 'completed' || !pixelsReady()) {
          if (phase() === 'failed') break;
          if (performance.now() - started > 45000) break;
          await new Promise((resolve) => setTimeout(resolve, 25));
        }
        const afterReceipt = receipt();
        const beforeScenario = beforeReceipt?.scenario || null;
        const afterScenario = afterReceipt?.scenario || null;
        const restored = Boolean(afterReceipt && phase() === 'completed' && pixelsReady());
        const failure = globalThis.__simulatteLastFailError || null;
        const failureEvents = [...(globalThis.__simulatteAutonomyRuntimeEvents || [])]
          .filter((row) => row.level === 'error' || row.event === 'runtime.failed')
          .slice(-4)
          .map((row) => ({ event: row.event, details: row.details || null }));
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
          failure,
          failureEvents,
          reason: restored ? null : (afterReceipt && phase() === 'completed' ? 'render_readback_not_restored' : 'terminal_receipt_not_restored'),
        };
      })()`,
      awaitPromise: true,
      returnByValue: true,
    }), 60000, 'reload-restoration');
    if (reload.exceptionDetails) {
      throw new Error(reload.exceptionDetails.exception?.description || reload.exceptionDetails.text);
    }
    const reloadEvidence = reload.result.value;
    if (reloadEvidence.kind === 'plugin-playback') {
      reloadEvidence.beforeReceipt = compactRunReceiptReference(reloadEvidence.beforeReceipt);
      reloadEvidence.afterReceipt = compactRunReceiptReference(reloadEvidence.afterReceipt);
    }
    captured.evidence.reload = reloadEvidence;
    if (reload.result.value.restored) captured.evidence.lifecycle.push('reload');
    else {
      captured.integrity.status = 'contradictory';
      captured.integrity.contradictions.push(reload.result.value.reason);
    }
    const screenshot = encodeRgbaPng(renderPixels);
    const screenshotSha256 = sha256Bytes(screenshot);
    const screenshotDirectory = path.join(outputDirectory, 'screenshots', 'canvas', 'sha256');
    fs.mkdirSync(screenshotDirectory, { recursive: true });
    const screenshotPath = path.join(screenshotDirectory, `${screenshotSha256}.png`);
    if (!fs.existsSync(screenshotPath)) fs.writeFileSync(screenshotPath, screenshot);
    captured.evidence.interactionCoverage = {
      expected: run.interactionPath,
      observed: captured.evidence.lifecycle,
      missing: run.interactionPath.filter((step) => !captured.evidence.lifecycle.includes(step)),
    };
    captured.evidence.console = consoleRows;
    captured.evidence.consoleErrors = consoleErrors;
    captured.evidence.pageScreenshot = {
      sha256: pageScreenshotSha256,
      path: path.relative(outputDirectory, pageScreenshotPath),
      byteLength: pageScreenshot.length,
      pageUrl: captured.evidence.deployment?.pageUrl || null,
    };
    captured.evidence.screenshot = {
      kind: renderPixels.sourceBackend === 'webgpu' ? 'webgpu-canvas-readback' : 'canvas2d-canvas-readback',
      sha256: screenshotSha256,
      path: path.relative(outputDirectory, screenshotPath),
      byteLength: screenshot.length,
      width: renderPixels?.width || null,
      height: renderPixels?.height || null,
      sourceFormat: renderPixels?.sourceFormat || null,
      sourceBackend: renderPixels?.sourceBackend || null,
      sourceFrameCount: renderPixels?.sourceFrameCount ?? null,
      buildId: sourceIdentity.build.buildId,
      servedBuildId: captured.evidence.deployment?.servedBuildId || null,
      pageUrl: captured.evidence.deployment?.pageUrl || null,
    };
    const pixelMethod = renderPixels.sourceBackend === 'webgpu'
      ? 'webgpu-texture-readback-png-samples'
      : 'canvas2d-image-data-png-samples';
    captured.evidence.pixelReadback = { ...inspectPng(screenshot, pixelMethod), sha256: screenshotSha256 };
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
        comparisonMode: run.comparisonMode,
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
    if (client) {
      try {
        await withTimeout(client.send('Browser.close'), 5000, 'browser-close');
      } catch {
        // Chrome can close the protocol socket before acknowledging Browser.close.
      }
      await client.close();
    }
    await stopChild(chrome);
    const cleanup = await removeGeneratedProfileDirectory(profileDirectory);
    if (!cleanup.removed) console.warn(`PROFILE-EVIDENCE cleanup=deferred path=${cleanup.path} error=${cleanup.error}`);
  }
}

async function createEvidenceServer(publicRoot) {
  const server = createStaticSiteServer({ publicRoot });
  await new Promise((resolve, reject) => server.listen(0, '127.0.0.1', resolve).once('error', reject));
  return { server, baseUrl: `http://127.0.0.1:${server.address().port}/` };
}

export {
  browserProbeExpression,
  captureBrowserRun,
  compactCapturedEvidence,
  compactEventReference,
  compactRunReceiptReference,
  createEvidenceServer,
  findChrome,
  governedRunUrl,
  inspectPng,
  waitForReloadedDocument,
};
