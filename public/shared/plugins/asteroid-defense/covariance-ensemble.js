(function attachAsteroidCovarianceEnsemble(root, factory) {
  const nodeCrypto = typeof module === 'object' && module.exports ? require('node:crypto') : null;
  const api = factory(nodeCrypto);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteAsteroidCovarianceEnsemble = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createCovarianceEnsemble(nodeCrypto) {
  function generate({ fitReceipt, ensembleSize, seed }) {
    if (!fitReceipt.covarianceReceipt.positiveSemidefinite) {
      throw ensembleError('asteroid_covariance_not_psd', 'Covariance must be positive semidefinite');
    }
    const squareRoot = choleskyWithJitter(fitReceipt.covariance);
    const mean = [...fitReceipt.fittedState.positionAu, ...fitReceipt.fittedState.velocityAuD];
    const samples = [];
    const rejected = [];
    for (let index = 0; samples.length < ensembleSize && index < ensembleSize * 4; index += 1) {
      const normal = normalVector(`${seed}:orbit:${index}`, 6);
      const delta = squareRoot.matrix.map((row) => row.reduce((sum, value, column) => sum + value * normal[column], 0));
      const vector = mean.map((value, column) => value + delta[column]);
      if (!physical(vector)) {
        rejected.push({ index, reason: 'nonphysical_state' });
        continue;
      }
      samples.push({
        id: `orbit-clone-${String(samples.length + 1).padStart(3, '0')}`,
        sequenceIndex: index,
        state: { positionAu: vector.slice(0, 3), velocityAuD: vector.slice(3, 6) },
      });
    }
    while (samples.length < ensembleSize) {
      samples.push({
        id: `orbit-clone-${String(samples.length + 1).padStart(3, '0')}`,
        sequenceIndex: -1,
        state: { ...fitReceipt.fittedState, positionAu: [...fitReceipt.fittedState.positionAu], velocityAuD: [...fitReceipt.fittedState.velocityAuD] },
        fallback: 'fitted_mean_after_rejections',
      });
    }
    return deepFreeze({
      schema: 'simulatte.asteroidOrbitEnsembleReceipt.v1',
      covarianceIdentity: hash(fitReceipt.covariance),
      seed,
      ensembleSize,
      squareRootMethod: squareRoot.method,
      diagonalJitter: squareRoot.jitter,
      samples,
      rejected,
      sampleMeanResidualNorm: sampleMeanResidual(samples, mean),
    });
  }

  function choleskyWithJitter(matrix) {
    for (const jitter of [0, 1e-18, 1e-15, 1e-12, 1e-9]) {
      try {
        return { matrix: cholesky(matrix, jitter), jitter, method: jitter ? 'cholesky_with_declared_jitter' : 'cholesky' };
      } catch { /* try a declared larger jitter */ }
    }
    throw ensembleError('asteroid_covariance_square_root_failed', 'Cholesky failed with bounded jitter');
  }

  function cholesky(matrix, jitter) {
    const size = matrix.length;
    const result = Array.from({ length: size }, () => Array(size).fill(0));
    for (let i = 0; i < size; i += 1) {
      for (let j = 0; j <= i; j += 1) {
        let sum = matrix[i][j] + (i === j ? jitter : 0);
        for (let k = 0; k < j; k += 1) sum -= result[i][k] * result[j][k];
        if (i === j) {
          if (!(sum > 0)) throw new Error('not_positive_definite');
          result[i][j] = Math.sqrt(sum);
        } else result[i][j] = sum / result[j][j];
      }
    }
    return result;
  }

  function normalVector(seed, count) {
    const values = [];
    for (let index = 0; values.length < count; index += 1) {
      const u1 = Math.max(1e-12, unit(`${seed}:${index}:a`));
      const u2 = unit(`${seed}:${index}:b`);
      const radius = Math.sqrt(-2 * Math.log(u1));
      values.push(radius * Math.cos(2 * Math.PI * u2), radius * Math.sin(2 * Math.PI * u2));
    }
    return values.slice(0, count);
  }

  function physical(vector) {
    const radius = Math.hypot(...vector.slice(0, 3));
    const speed = Math.hypot(...vector.slice(3, 6));
    return Number.isFinite(radius) && Number.isFinite(speed) && radius > 0.2 && radius < 5 && speed < 0.08;
  }

  function sampleMeanResidual(samples, target) {
    const mean = Array(6).fill(0);
    samples.forEach((sample) => [...sample.state.positionAu, ...sample.state.velocityAuD]
      .forEach((value, index) => { mean[index] += value / samples.length; }));
    return Math.hypot(...mean.map((value, index) => value - target[index]));
  }

  function unit(seed) { return Number.parseInt(hash(seed).slice(0, 8), 16) / 0xffffffff; }
  function hash(value) {
    const text = typeof value === 'string' ? value : stable(value);
    if (nodeCrypto) return nodeCrypto.createHash('sha256').update(text).digest('hex');
    let result = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      result ^= text.charCodeAt(index);
      result = Math.imul(result, 16777619);
    }
    return result.toString(16).padStart(8, '0').repeat(8);
  }
  function stable(value) {
    if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
    if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
    return JSON.stringify(value);
  }
  function ensembleError(code, message) {
    const error = new Error(`${code}: ${message}`);
    error.code = code;
    return error;
  }
  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
  }

  return Object.freeze({ generate });
});
