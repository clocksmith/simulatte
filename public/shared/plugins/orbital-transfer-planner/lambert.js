(function attachLambert(root, factory) {
  const api = factory();
  root.OrbitalTransferLambert = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createLambertModule() {
  function solveLambert(r1Vec, r2Vec, tofDays, muAu3D2, options = {}) {
    validateVector(r1Vec, 'r1');
    validateVector(r2Vec, 'r2');
    if (!(tofDays > 0) || !(muAu3D2 > 0)) throw lambertError('lambert_input_invalid', 'Lambert time of flight and gravitational parameter must be positive');
    const r1 = magnitude(r1Vec);
    const r2 = magnitude(r2Vec);
    const cosDelta = clamp(dot(r1Vec, r2Vec) / (r1 * r2), -1, 1);
    const crossZ = cross(r1Vec, r2Vec)[2];
    let sinDelta = Math.sqrt(Math.max(0, 1 - cosDelta * cosDelta));
    if (options.prograde !== false && crossZ < 0) sinDelta = -sinDelta;
    if (options.prograde === false && crossZ >= 0) sinDelta = -sinDelta;
    const denominator = 1 - cosDelta;
    if (Math.abs(denominator) < 1e-14 || Math.abs(sinDelta) < 1e-14) {
      throw lambertError('lambert_geometry_singular', 'Lambert endpoints are collinear or coincident', { cosDelta, sinDelta });
    }
    const A = sinDelta * Math.sqrt((r1 * r2) / denominator);
    const targetSeconds = tofDays;
    const maxIterations = options.maxIterations || 96;
    const toleranceDays = options.toleranceDays || 1e-8;
    const bracket = findBracket(A, r1, r2, muAu3D2, targetSeconds);
    if (!bracket) throw lambertError('lambert_no_root', 'No single-revolution Lambert root was found for the requested transfer', { tofDays });
    let [low, high] = bracket;
    let z = (low + high) / 2;
    let evaluation = null;
    let iterations = 0;
    for (; iterations < maxIterations; iterations += 1) {
      z = (low + high) / 2;
      evaluation = evaluateTime(z, A, r1, r2, muAu3D2);
      if (!evaluation.valid) {
        low = z;
        continue;
      }
      const residual = evaluation.timeDays - targetSeconds;
      if (Math.abs(residual) <= toleranceDays) break;
      const lowEval = evaluateTime(low, A, r1, r2, muAu3D2);
      const lowResidual = lowEval.valid ? lowEval.timeDays - targetSeconds : -Infinity;
      if (Number.isFinite(lowResidual) && Math.sign(lowResidual) === Math.sign(residual)) low = z;
      else high = z;
    }
    if (!evaluation?.valid) throw lambertError('lambert_solution_invalid', 'Lambert root produced no valid geometry');
    const y = evaluation.y;
    const f = 1 - y / r1;
    const g = A * Math.sqrt(y / muAu3D2);
    const gDot = 1 - y / r2;
    if (Math.abs(g) < 1e-14) throw lambertError('lambert_g_singular', 'Lambert solution produced a singular g coefficient');
    const departureVelocityAuD = scale(subtract(r2Vec, scale(r1Vec, f)), 1 / g);
    const arrivalVelocityAuD = scale(subtract(scale(r2Vec, gDot), r1Vec), 1 / g);
    return Object.freeze({
      schema: 'simulatte.lambertSolution.v1',
      converged: Math.abs(evaluation.timeDays - targetSeconds) <= toleranceDays,
      prograde: options.prograde !== false,
      iterations,
      timeOfFlightDays: tofDays,
      residualDays: evaluation.timeDays - targetSeconds,
      z,
      departureVelocityAuD: Object.freeze(departureVelocityAuD),
      arrivalVelocityAuD: Object.freeze(arrivalVelocityAuD),
      geometry: Object.freeze({ r1Au: r1, r2Au: r2, transferAngleRadians: Math.atan2(sinDelta, cosDelta), A }),
      algorithm: 'universal-variable-single-revolution-v1',
    });
  }

  function findBracket(A, r1, r2, mu, target) {
    const min = -4 * Math.PI * Math.PI + 1e-5;
    const max = 4 * Math.PI * Math.PI - 1e-5;
    const samples = 512;
    let previous = null;
    for (let index = 0; index <= samples; index += 1) {
      const z = min + (max - min) * index / samples;
      const row = evaluateTime(z, A, r1, r2, mu);
      if (!row.valid) continue;
      const residual = row.timeDays - target;
      if (Math.abs(residual) < 1e-12) return [z - 1e-10, z + 1e-10];
      if (previous && Math.sign(previous.residual) !== Math.sign(residual)) return [previous.z, z];
      previous = { z, residual };
    }
    return null;
  }

  function evaluateTime(z, A, r1, r2, mu) {
    const C = stumpffC(z);
    const S = stumpffS(z);
    if (!(C > 0)) return { valid: false };
    const y = r1 + r2 + A * (z * S - 1) / Math.sqrt(C);
    if (!(y > 0)) return { valid: false };
    const x = Math.sqrt(y / C);
    const timeDays = (x * x * x * S + A * Math.sqrt(y)) / Math.sqrt(mu);
    return { valid: Number.isFinite(timeDays) && timeDays > 0, timeDays, y, C, S };
  }

  function stumpffC(z) {
    if (z > 1e-8) return (1 - Math.cos(Math.sqrt(z))) / z;
    if (z < -1e-8) return (Math.cosh(Math.sqrt(-z)) - 1) / (-z);
    return 0.5 - z / 24 + z * z / 720 - z * z * z / 40320;
  }
  function stumpffS(z) {
    if (z > 1e-8) { const s = Math.sqrt(z); return (s - Math.sin(s)) / (s * s * s); }
    if (z < -1e-8) { const s = Math.sqrt(-z); return (Math.sinh(s) - s) / (s * s * s); }
    return 1 / 6 - z / 120 + z * z / 5040 - z * z * z / 362880;
  }
  function validateVector(value, label) { if (!Array.isArray(value) || value.length !== 3 || value.some((row) => !Number.isFinite(row))) throw lambertError('lambert_vector_invalid', `${label} expected three finite components`); }
  function magnitude(v) { return Math.hypot(v[0], v[1], v[2]); }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function subtract(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function scale(v, k) { return [v[0] * k, v[1] * k, v[2] * k]; }
  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function lambertError(code, message, evidence = null) { const error = new Error(`${code}: ${message}`); error.name = 'OrbitalLambertError'; error.code = code; error.evidence = evidence; return error; }
  return Object.freeze({ solveLambert, stumpffC, stumpffS, lambertError });
});
