const WINDOW_KEY = '__simulatteBrowserMemoryWindowV1';
const DEFAULT_SAMPLE_INTERVAL_MS = 25;

export async function beginBrowserMemoryWindow(cdp, evaluate, options = {}) {
  const sampleIntervalMs = Number(options.sampleIntervalMs || DEFAULT_SAMPLE_INTERVAL_MS);
  if (!Number.isInteger(sampleIntervalMs) || sampleIntervalMs < 10) {
    throw new Error(`Browser memory sample interval is invalid: ${sampleIntervalMs}`);
  }
  await cdp.send('HeapProfiler.enable');
  await cdp.send('HeapProfiler.collectGarbage');
  const started = await evaluate(cdp, `(() => {
    const key = ${JSON.stringify(WINDOW_KEY)};
    const previous = globalThis[key];
    if (previous && previous.timer) clearInterval(previous.timer);
    const memory = performance && performance.memory;
    if (!memory || !Number.isFinite(Number(memory.usedJSHeapSize))) {
      globalThis[key] = { unavailable: true, timer: 0, samples: [] };
      return { available: false };
    }
    const startedAt = performance.now();
    const samples = [];
    const sample = (boundary = '') => {
      const current = performance.memory;
      const usedJsHeapBytes = Number(current && current.usedJSHeapSize);
      const totalJsHeapBytes = Number(current && current.totalJSHeapSize);
      if (!Number.isFinite(usedJsHeapBytes) || !Number.isFinite(totalJsHeapBytes)) return;
      samples.push({
        atMs: Number((performance.now() - startedAt).toFixed(3)),
        boundary,
        usedJsHeapBytes,
        totalJsHeapBytes,
      });
    };
    sample('window-start');
    const timer = setInterval(() => sample(''), ${sampleIntervalMs});
    globalThis[key] = { unavailable: false, timer, samples, sample, startedAt };
    return { available: true, initialUsedJsHeapBytes: samples[0].usedJsHeapBytes };
  })()`);
  if (!started?.available) throw new Error('Chrome did not expose precise performance.memory telemetry');
}

export async function endBrowserMemoryWindow(cdp, evaluate, options = {}) {
  const sampleIntervalMs = Number(options.sampleIntervalMs || DEFAULT_SAMPLE_INTERVAL_MS);
  await evaluate(cdp, `(() => {
    const state = globalThis[${JSON.stringify(WINDOW_KEY)}];
    if (!state || state.unavailable) return false;
    if (state.timer) clearInterval(state.timer);
    state.timer = 0;
    state.sample('window-end-before-gc');
    return true;
  })()`);
  await cdp.send('HeapProfiler.collectGarbage');
  return evaluate(cdp, `(() => {
    const key = ${JSON.stringify(WINDOW_KEY)};
    const state = globalThis[key];
    if (!state || state.unavailable || !Array.isArray(state.samples) || !state.samples.length) {
      delete globalThis[key];
      return { schema: 'simulatte.browserMemoryReceipt.v1', status: 'fail', reason: 'memory telemetry unavailable' };
    }
    state.sample('window-end');
    const samples = state.samples;
    const initial = samples[0];
    const final = samples[samples.length - 1];
    const peak = samples.reduce((best, row) => (
      row.usedJsHeapBytes > best.usedJsHeapBytes ? row : best
    ), samples[0]);
    const beforeGc = [...samples].reverse().find((row) => row.boundary === 'window-end-before-gc') || final;
    const receipt = {
      schema: 'simulatte.browserMemoryReceipt.v1',
      status: 'pass',
      basis: 'single-prompt-browser-execution-window',
      measurementMode: 'forced-gc-retained-heap-plus-periodic-observed-peak',
      sampleIntervalMs: ${sampleIntervalMs},
      sampleCount: samples.length,
      initialUsedJsHeapBytes: initial.usedJsHeapBytes,
      finalUsedJsHeapBytes: final.usedJsHeapBytes,
      finalBeforeGcUsedJsHeapBytes: beforeGc.usedJsHeapBytes,
      retainedDeltaBytes: final.usedJsHeapBytes - initial.usedJsHeapBytes,
      observedPeakUsedJsHeapBytes: peak.usedJsHeapBytes,
      observedPeakAtMs: peak.atMs,
      maximumTotalJsHeapBytes: Math.max(...samples.map((row) => row.totalJsHeapBytes)),
      boundarySamples: samples.filter((row) => row.boundary),
      physicalGpuMemory: {
        status: 'not-measured',
        reason: 'WebGPU does not expose physical driver allocation telemetry',
      },
    };
    delete globalThis[key];
    return receipt;
  })()`);
}

export function validateBrowserMemoryReceipt(receipt, maximumObservedJsHeapBytes) {
  const maximum = Number(maximumObservedJsHeapBytes);
  const failures = [];
  if (receipt?.schema !== 'simulatte.browserMemoryReceipt.v1') failures.push('memory receipt schema is invalid');
  if (receipt?.status !== 'pass') failures.push(`memory receipt status was ${receipt?.status || 'missing'}`);
  if (receipt?.basis !== 'single-prompt-browser-execution-window') failures.push('memory receipt basis is invalid');
  if (receipt?.measurementMode !== 'forced-gc-retained-heap-plus-periodic-observed-peak') {
    failures.push('memory receipt measurement mode is invalid');
  }
  if (!Number.isInteger(receipt?.sampleIntervalMs) || receipt.sampleIntervalMs < 10) {
    failures.push('memory receipt sample interval is invalid');
  }
  if (!Number.isInteger(receipt?.sampleCount) || receipt.sampleCount < 3) failures.push('memory receipt has too few samples');
  for (const field of [
    'initialUsedJsHeapBytes', 'finalUsedJsHeapBytes', 'finalBeforeGcUsedJsHeapBytes',
    'retainedDeltaBytes', 'observedPeakUsedJsHeapBytes', 'observedPeakAtMs', 'maximumTotalJsHeapBytes',
  ]) {
    if (!Number.isFinite(Number(receipt?.[field]))) failures.push(`memory receipt ${field} is invalid`);
  }
  if (Number(receipt?.observedPeakUsedJsHeapBytes) < Number(receipt?.initialUsedJsHeapBytes) ||
      Number(receipt?.observedPeakUsedJsHeapBytes) < Number(receipt?.finalUsedJsHeapBytes) ||
      Number(receipt?.maximumTotalJsHeapBytes) < Number(receipt?.observedPeakUsedJsHeapBytes)) {
    failures.push('memory receipt peak ordering is invalid');
  }
  const boundaries = Array.isArray(receipt?.boundarySamples) ? receipt.boundarySamples : [];
  for (const boundary of ['window-start', 'window-end-before-gc', 'window-end']) {
    if (!boundaries.some((row) => row?.boundary === boundary && Number.isFinite(Number(row.usedJsHeapBytes)))) {
      failures.push(`memory receipt is missing ${boundary}`);
    }
  }
  if (!Number.isFinite(maximum) || maximum <= 0) failures.push('memory budget is invalid');
  if (Number(receipt?.observedPeakUsedJsHeapBytes) > maximum) failures.push('observed JavaScript heap exceeded the declared budget');
  if (receipt?.physicalGpuMemory?.status !== 'not-measured' || !String(receipt?.physicalGpuMemory?.reason || '')) {
    failures.push('memory receipt must state the physical GPU telemetry limit');
  }
  return {
    pass: failures.length === 0,
    failures,
    observation: {
      status: failures.length === 0 ? 'pass' : 'fail',
      maximumObservedJsHeapBytes: maximum,
      initialUsedJsHeapBytes: finiteOrNull(receipt?.initialUsedJsHeapBytes),
      finalUsedJsHeapBytes: finiteOrNull(receipt?.finalUsedJsHeapBytes),
      retainedDeltaBytes: finiteOrNull(receipt?.retainedDeltaBytes),
      observedPeakUsedJsHeapBytes: finiteOrNull(receipt?.observedPeakUsedJsHeapBytes),
      sampleCount: Number.isInteger(receipt?.sampleCount) ? receipt.sampleCount : 0,
      physicalGpuMemoryStatus: String(receipt?.physicalGpuMemory?.status || 'missing'),
    },
  };
}

function finiteOrNull(value) {
  return Number.isFinite(Number(value)) ? Number(value) : null;
}
