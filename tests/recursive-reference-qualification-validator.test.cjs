const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const test = require('node:test');

const validatorPromise = import(pathToFileURL(path.join(__dirname, '../tools/simulatte/qualify-recursive-reference.mjs')).href);

function laneResult() {
  const identity = {
    buildId: 'build-v1',
    runtimeId: 'runtime-v1',
    deviceClass: 'device-v1',
    qualificationLaneId: 'headed-lane-v1',
    browserMode: 'headed',
  };
  return {
    identity: { ...identity },
    proof: { ...identity },
    evidence: { performanceReceipt: { ...identity } },
  };
}

function performanceReceipt(overrides = {}) {
  return {
    targetFramesPerSecond: 120,
    frameBudgetMilliseconds: 1000 / 120,
    sampleCount: 240,
    compositorSampleCount: 240,
    cpuSampleCount: 240,
    gpuCompletionSampleCount: 240,
    medianFrameMilliseconds: 2,
    p95FrameMilliseconds: 3,
    compositorMedianFrameMilliseconds: 2,
    compositorP95FrameMilliseconds: 3,
    cpuMedianFrameMilliseconds: 0,
    cpuP95FrameMilliseconds: 1,
    gpuCompletionMedianMilliseconds: 1,
    gpuCompletionP95Milliseconds: 2,
    refreshEstimateHz: 500,
    ...overrides,
  };
}

test('qualification lane identity must match the harness across runtime, proof, and performance evidence', async () => {
  const { validateLaneIdentity } = await validatorPromise;
  assert.doesNotThrow(() => validateLaneIdentity(laneResult(), 'headed-lane-v1', 'headed'));
  for (const mutate of [
    (value) => { value.identity.qualificationLaneId = 'substituted'; },
    (value) => { value.proof.browserMode = 'headless'; },
    (value) => { value.evidence.performanceReceipt.qualificationLaneId = 'other-lane'; },
  ]) {
    const value = laneResult();
    mutate(value);
    assert.throws(() => validateLaneIdentity(value, 'headed-lane-v1', 'headed'), /recursive_qualification_(lane_identity|browser_mode)_mismatch/);
  }
});

test('qualification performance aggregates retain zero and reject null or incoherent values', async () => {
  const { validatePerformanceAggregates } = await validatorPromise;
  assert.doesNotThrow(() => validatePerformanceAggregates(performanceReceipt()));
  assert.throws(() => validatePerformanceAggregates(performanceReceipt({ cpuMedianFrameMilliseconds: null })), /performance_non_finite/);
  assert.throws(() => validatePerformanceAggregates(performanceReceipt({ medianFrameMilliseconds: 1 })), /aggregate_incoherent/);
  assert.throws(() => validatePerformanceAggregates(performanceReceipt({ gpuCompletionSampleCount: 239 })), /sample_count_incoherent/);
});

test('qualification lane identity names the effective platform GPU backend', async () => {
  const { qualificationLaneId } = await validatorPromise;
  assert.equal(qualificationLaneId({ headed: true, viewport: null, platform: 'darwin' }), 'headed-chrome-metal-uncapped-120');
  assert.equal(
    qualificationLaneId({ headed: false, viewport: { width: 390, height: 844 }, platform: 'linux' }),
    'headless-chrome-vulkan-uncapped-120-390x844'
  );
  assert.equal(qualificationLaneId({ headed: false, viewport: null, platform: 'win32' }), 'headless-chrome-default-uncapped-120');
});
