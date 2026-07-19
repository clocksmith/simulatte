(function attachCooperativeGpuCompute(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteCooperativeGpuCompute = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createP2pDeliveryGpuCompute() {
  const FEATURE_COUNT = 8;
  const WORKGROUP_SIZE = 64;
  const DEFAULT_WEIGHTS = Object.freeze([0.004, 1, 300, 30, 50, 100, -1, 1.5]);
  const SHADER = `
struct Params {
  candidateCount: u32,
  featureCount: u32,
  _padding0: u32,
  _padding1: u32,
}

@group(0) @binding(0) var<storage, read> features: array<f32>;
@group(0) @binding(1) var<storage, read> weights: array<f32>;
@group(0) @binding(2) var<storage, read_write> scores: array<f32>;
@group(0) @binding(3) var<uniform> params: Params;

@compute @workgroup_size(${WORKGROUP_SIZE})
fn scoreCandidates(@builtin(global_invocation_id) invocation: vec3<u32>) {
  let candidate = invocation.x;
  if (candidate >= params.candidateCount) { return; }
  var score = 0.0;
  for (var feature = 0u; feature < params.featureCount; feature += 1u) {
    score += features[candidate * params.featureCount + feature] * weights[feature];
  }
  scores[candidate] = score;
}
`;

  function scoreCandidatesCpu(featureRows, weights = DEFAULT_WEIGHTS) {
    const features = flattenFeatures(featureRows);
    const weightValues = validateWeights(weights);
    const scores = new Float32Array(featureRows.length);
    for (let candidate = 0; candidate < featureRows.length; candidate += 1) {
      let score = Math.fround(0);
      for (let feature = 0; feature < FEATURE_COUNT; feature += 1) {
        const product = Math.fround(features[candidate * FEATURE_COUNT + feature] * weightValues[feature]);
        score = Math.fround(score + product);
      }
      scores[candidate] = score;
    }
    return scores;
  }

  async function scoreCandidatesGpu(device, featureRows, weights = DEFAULT_WEIGHTS) {
    if (!device || typeof device.createComputePipeline !== 'function') throw computeError('webgpu_device_required');
    const features = flattenFeatures(featureRows);
    const weightValues = validateWeights(weights);
    if (!featureRows.length) return new Float32Array();
    const buffers = [];
    device.pushErrorScope?.('validation');
    try {
      const module = device.createShaderModule({ label: 'cooperative-opportunity-score-shader', code: SHADER });
      const compilation = await module.getCompilationInfo?.();
      const errors = compilation?.messages?.filter((row) => row.type === 'error') || [];
      if (errors.length) throw computeError('wgsl_invalid', errors.map((row) => row.message).join('; '));
      const pipeline = device.createComputePipeline({
        label: 'cooperative-opportunity-score-pipeline',
        layout: 'auto',
        compute: { module, entryPoint: 'scoreCandidates' },
      });
      const featureBuffer = uploadBuffer(device, features, GPUBufferUsage.STORAGE, 'cooperative-score-features');
      const weightBuffer = uploadBuffer(device, weightValues, GPUBufferUsage.STORAGE, 'cooperative-score-weights');
      const scoreBuffer = device.createBuffer({
        label: 'cooperative-score-output',
        size: featureRows.length * 4,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
      });
      const readback = device.createBuffer({
        label: 'cooperative-score-readback',
        size: featureRows.length * 4,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
      });
      const params = new Uint32Array([featureRows.length, FEATURE_COUNT, 0, 0]);
      const paramsBuffer = uploadBuffer(device, params, GPUBufferUsage.UNIFORM, 'cooperative-score-params');
      buffers.push(featureBuffer, weightBuffer, scoreBuffer, readback, paramsBuffer);
      const bindGroup = device.createBindGroup({
        label: 'cooperative-opportunity-score-bind-group',
        layout: pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: featureBuffer } },
          { binding: 1, resource: { buffer: weightBuffer } },
          { binding: 2, resource: { buffer: scoreBuffer } },
          { binding: 3, resource: { buffer: paramsBuffer } },
        ],
      });
      const encoder = device.createCommandEncoder({ label: 'cooperative-opportunity-score-command' });
      const pass = encoder.beginComputePass({ label: 'cooperative-opportunity-score-pass' });
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.dispatchWorkgroups(Math.ceil(featureRows.length / WORKGROUP_SIZE));
      pass.end();
      encoder.copyBufferToBuffer(scoreBuffer, 0, readback, 0, featureRows.length * 4);
      device.queue.submit([encoder.finish()]);
      await readback.mapAsync(GPUMapMode.READ);
      const scores = new Float32Array(readback.getMappedRange().slice(0));
      readback.unmap();
      const validationError = await device.popErrorScope?.();
      if (validationError) throw computeError('webgpu_validation_failed', validationError.message);
      return scores;
    } catch (error) {
      await device.popErrorScope?.().catch?.(() => null);
      throw error;
    } finally {
      buffers.forEach((buffer) => buffer.destroy());
    }
  }

  async function verifyGpuParity(device, featureRows, weights = DEFAULT_WEIGHTS, tolerance = 0.0001) {
    const cpu = scoreCandidatesCpu(featureRows, weights);
    const gpu = await scoreCandidatesGpu(device, featureRows, weights);
    const errors = [...cpu].map((value, index) => Math.abs(value - gpu[index]));
    const maximumAbsoluteError = errors.length ? Math.max(...errors) : 0;
    return {
      schema: 'simulatte.cooperativeGpuParityReceipt.v1',
      implementation: 'opportunity_weighted_sum_wgsl_v1',
      candidateCount: featureRows.length,
      featureCount: FEATURE_COUNT,
      dispatchCount: featureRows.length ? 1 : 0,
      readbackCount: featureRows.length ? 1 : 0,
      tolerance,
      maximumAbsoluteError,
      pass: maximumAbsoluteError <= tolerance && cpu.length === gpu.length,
      claimBoundary: 'Parity covers deterministic opportunity score numerics only. JavaScript retains language, policy, consent, graph construction, and authorization decisions.',
    };
  }

  async function scoreCandidates({ device, featureRows, weights = DEFAULT_WEIGHTS, minimumGpuCandidates = 512, forceGpu = false }) {
    const useGpu = Boolean(device && (forceGpu || featureRows.length >= minimumGpuCandidates));
    const scores = useGpu
      ? await scoreCandidatesGpu(device, featureRows, weights)
      : scoreCandidatesCpu(featureRows, weights);
    return {
      scores,
      receipt: {
        schema: 'simulatte.cooperativeScoreExecutionReceipt.v1',
        backend: useGpu ? 'webgpu' : 'cpu_reference',
        candidateCount: featureRows.length,
        gpuThreshold: minimumGpuCandidates,
        dispatchCount: useGpu && featureRows.length ? 1 : 0,
        synchronousReadbackInAnimationLoop: false,
      },
    };
  }

  function flattenFeatures(featureRows) {
    const values = new Float32Array(featureRows.length * FEATURE_COUNT);
    featureRows.forEach((row, rowIndex) => {
      if (!Array.isArray(row) && !(row instanceof Float32Array)) throw computeError('feature_row_invalid');
      if (row.length !== FEATURE_COUNT) throw computeError('feature_count_invalid');
      row.forEach((value, featureIndex) => {
        if (!Number.isFinite(value)) throw computeError('feature_value_invalid');
        values[rowIndex * FEATURE_COUNT + featureIndex] = value;
      });
    });
    return values;
  }

  function validateWeights(weights) {
    if ((!Array.isArray(weights) && !(weights instanceof Float32Array)) || weights.length !== FEATURE_COUNT) throw computeError('weight_count_invalid');
    const values = new Float32Array(weights);
    if ([...values].some((value) => !Number.isFinite(value))) throw computeError('weight_value_invalid');
    return values;
  }

  function uploadBuffer(device, data, usage, label) {
    const buffer = device.createBuffer({ label, size: Math.max(4, data.byteLength), usage: usage | GPUBufferUsage.COPY_DST });
    if (data.byteLength) device.queue.writeBuffer(buffer, 0, data);
    return buffer;
  }

  function computeError(code, detail = '') {
    const error = new Error(`${code}${detail ? `: ${detail}` : ''}`);
    error.code = code;
    return error;
  }

  return {
    DEFAULT_WEIGHTS,
    FEATURE_COUNT,
    SHADER,
    scoreCandidates,
    scoreCandidatesCpu,
    scoreCandidatesGpu,
    verifyGpuParity,
  };
});
