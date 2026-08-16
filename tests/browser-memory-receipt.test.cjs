const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

async function moduleApi() {
  return import(pathToFileURL(path.resolve(__dirname, '../tools/browser-memory-receipt.mjs')));
}

function receipt() {
  return {
    schema: 'simulatte.browserMemoryReceipt.v1',
    status: 'pass',
    basis: 'single-prompt-browser-execution-window',
    measurementMode: 'forced-gc-retained-heap-plus-periodic-observed-peak',
    sampleIntervalMs: 25,
    sampleCount: 5,
    initialUsedJsHeapBytes: 10_000_000,
    finalUsedJsHeapBytes: 11_000_000,
    finalBeforeGcUsedJsHeapBytes: 15_000_000,
    retainedDeltaBytes: 1_000_000,
    observedPeakUsedJsHeapBytes: 18_000_000,
    observedPeakAtMs: 125,
    maximumTotalJsHeapBytes: 32_000_000,
    boundarySamples: [
      { boundary: 'window-start', usedJsHeapBytes: 10_000_000 },
      { boundary: 'window-end-before-gc', usedJsHeapBytes: 15_000_000 },
      { boundary: 'window-end', usedJsHeapBytes: 11_000_000 },
    ],
    physicalGpuMemory: {
      status: 'not-measured',
      reason: 'WebGPU does not expose physical driver allocation telemetry',
    },
  };
}

test('browser memory receipt separates retained heap, observed peak, and unavailable GPU telemetry', async () => {
  const api = await moduleApi();
  const result = api.validateBrowserMemoryReceipt(receipt(), 64_000_000);
  assert.equal(result.pass, true);
  assert.equal(result.observation.status, 'pass');
  assert.equal(result.observation.retainedDeltaBytes, 1_000_000);
  assert.equal(result.observation.observedPeakUsedJsHeapBytes, 18_000_000);
  assert.equal(result.observation.physicalGpuMemoryStatus, 'not-measured');
});

test('browser memory receipt fails closed for missing boundaries and heap budget breaches', async () => {
  const api = await moduleApi();
  const candidate = receipt();
  candidate.boundarySamples.pop();
  candidate.observedPeakUsedJsHeapBytes = 65_000_000;
  const result = api.validateBrowserMemoryReceipt(candidate, 64_000_000);
  assert.equal(result.pass, false);
  assert.ok(result.failures.some((row) => row.includes('window-end')));
  assert.ok(result.failures.some((row) => row.includes('exceeded')));
});
