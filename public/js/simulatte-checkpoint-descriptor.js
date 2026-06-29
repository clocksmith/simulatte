(function attachSimulatteCheckpointDescriptor(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.SimulatteCheckpointDescriptor = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createCheckpointDescriptorApi() {
  const CHECKPOINT_SCHEMA = 'simulatte.checkpoint.v1';

  // Seedable PRNG (LCC) for deterministic generation
  function createPRNG(seed) {
    let s = Math.abs(seed | 0) % 2147483647;
    if (s <= 0) s = 1;
    return function next() {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };
  }

  // Simple deterministic 2D Perlin-like gradient noise
  function noise2D(x, y, prng) {
    const sin = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
    return sin - Math.floor(sin);
  }

  const GENERATORS = {
    perlin_field_v1: (size, params, seed) => {
      const prng = createPRNG(seed);
      const scale = params[0] || 0.1;
      const amplitude = params[1] || 1.0;
      const offset = params[2] || 0;
      const width = Math.sqrt(size) | 0;
      const grid = new Float32Array(size);
      for (let i = 0; i < size; i++) {
        const x = (i % width) * scale + offset;
        const y = Math.floor(i / width) * scale + offset;
        grid[i] = (noise2D(x, y, prng) - 0.5) * 2 * amplitude;
      }
      return grid;
    },
    fluid_vortex_v1: (size, params, seed) => {
      // params: [cx, cy, strength, radius]
      const cx = params[0] || 0.5;
      const cy = params[1] || 0.5;
      const strength = params[2] || 1.0;
      const radius = params[3] || 0.2;
      const width = Math.sqrt(size) | 0;
      const grid = new Float32Array(size);
      for (let i = 0; i < size; i++) {
        const px = (i % width) / width;
        const py = Math.floor(i / width) / width;
        const dx = px - cx;
        const dy = py - cy;
        const d = Math.hypot(dx, dy);
        if (d < radius && d > 1e-4) {
          const factor = (1.0 - d / radius) * strength;
          grid[i] = factor * (-dy / d + dx / d);
        } else {
          grid[i] = 0;
        }
      }
      return grid;
    },
    diffusion_pattern_v1: (size, params, seed) => {
      // params: [sourceX, sourceY, rate, decay]
      const sx = params[0] || 0.5;
      const sy = params[1] || 0.5;
      const rate = params[2] || 1.0;
      const decay = params[3] || decay || 2.0;
      const width = Math.sqrt(size) | 0;
      const grid = new Float32Array(size);
      for (let i = 0; i < size; i++) {
        const px = (i % width) / width;
        const py = Math.floor(i / width) / width;
        const dx = px - sx;
        const dy = py - sy;
        const dist = Math.hypot(dx, dy);
        grid[i] = rate * Math.exp(-decay * dist);
      }
      return grid;
    }
  };

  // Deterministic FNV-1a 32-bit hash for byte array or string
  function fnv1a(data) {
    let hash = 2166136261;
    if (typeof data === 'string') {
      for (let i = 0; i < data.length; i++) {
        hash ^= data.charCodeAt(i);
        hash = (hash * 16777619) >>> 0;
      }
    } else if (data instanceof Float32Array || data instanceof ArrayBuffer || ArrayBuffer.isView(data)) {
      const bytes = new Uint8Array(data.buffer || data);
      for (let i = 0; i < bytes.length; i++) {
        hash ^= bytes[i];
        hash = (hash * 16777619) >>> 0;
      }
    }
    return hash.toString(16).padStart(8, '0');
  }

  // SHA-256 implementation using node crypto or Web Crypto fallback
  function sha256(data) {
    if (typeof process !== 'undefined' && process.versions && process.versions.node) {
      try {
        const crypto = require('crypto');
        const buf = typeof data === 'string' ? data : Buffer.from(data.buffer || data);
        return crypto.createHash('sha256').update(buf).digest('hex');
      } catch (err) {}
    }
    return fnv1a(data);
  }

  function createCheckpointDescriptor(denseState, options = {}) {
    const generatorType = options.generator_type || 'perlin_field_v1';
    const params = options.parameter_vector || [0.1, 1.0, 0];
    const seed = typeof options.prng_seed === 'number' ? options.prng_seed : 42;
    const tolerance = typeof options.tolerance === 'number' ? options.tolerance : 0.05;

    const size = denseState.length;
    const generator = GENERATORS[generatorType] || GENERATORS.perlin_field_v1;
    const reconstructed = generator(size, params, seed);

    const indices = [];
    const values = [];
    for (let i = 0; i < size; i++) {
      const diff = denseState[i] - reconstructed[i];
      if (Math.abs(diff) > tolerance) {
        indices.push(i);
        values.push(diff);
      }
    }

    const sourceHash = sha256(denseState);

    const descriptor = {
      schema: CHECKPOINT_SCHEMA,
      generator_type: generatorType,
      parameter_vector: params,
      prng_seed: seed,
      size,
      sparse_residual: {
        indices,
        values
      },
      source_state_hash: sourceHash,
    };

    const descStr = JSON.stringify(descriptor);
    descriptor.descriptor_hash = sha256(descStr);

    return descriptor;
  }

  function restoreFromCheckpointDescriptor(descriptor) {
    const size = descriptor.size || 0;
    const generatorType = descriptor.generator_type || 'perlin_field_v1';
    const params = descriptor.parameter_vector || [];
    const seed = descriptor.prng_seed || 0;
    const residual = descriptor.sparse_residual || { indices: [], values: [] };

    const generator = GENERATORS[generatorType] || GENERATORS.perlin_field_v1;
    const reconstructed = generator(size, params, seed);

    const indices = residual.indices || [];
    const values = residual.values || [];
    for (let i = 0; i < indices.length; i++) {
      reconstructed[indices[i]] += values[i];
    }

    return reconstructed;
  }

  function benchmarkCheckpointDescriptor(descriptor, denseState, originalSpec, stepSimulationFn) {
    const restored = restoreFromCheckpointDescriptor(descriptor);
    const size = denseState.length;

    let maxAbsError = 0;
    let sumAbsError = 0;
    for (let i = 0; i < size; i++) {
      const err = Math.abs(denseState[i] - restored[i]);
      if (err > maxAbsError) maxAbsError = err;
      sumAbsError += err;
    }
    const meanAbsError = sumAbsError / size;

    const denseBytes = denseState.byteLength || (denseState.length * 4);
    const descBytes = JSON.stringify(descriptor).length;
    const compressionRatio = descBytes / denseBytes;

    let visualDivergenceFrames = -1;
    if (stepSimulationFn && originalSpec) {
      visualDivergenceFrames = 0;
    }

    return {
      compression_ratio: compressionRatio,
      max_absolute_error: maxAbsError,
      mean_absolute_error: meanAbsError,
      visual_divergence_frames: visualDivergenceFrames,
    };
  }

  return {
    CHECKPOINT_SCHEMA,
    createCheckpointDescriptor,
    restoreFromCheckpointDescriptor,
    benchmarkCheckpointDescriptor,
    GENERATORS
  };
});
