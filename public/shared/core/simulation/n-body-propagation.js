(function attachNBodyPropagation(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteNBodyPropagation = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createNBodyPropagation() {
  const METHOD_ID = 'shared-heliocentric-rk4-v1';

  function propagate({
    stateVector,
    startDay = 0,
    durationDays,
    stepDays,
    gmSunAuD2,
    sampleLimit = 256,
  }) {
    validateState(stateVector);
    if (!(durationDays >= 0) || !(stepDays > 0) || !(gmSunAuD2 > 0)) {
      throw propagationError('n_body_propagation_input_invalid', 'Duration, step, and solar GM must be valid');
    }
    let positionAu = [...stateVector.positionAu];
    let velocityAuD = [...stateVector.velocityAuD];
    let elapsed = 0;
    let stepCount = 0;
    const estimatedSteps = Math.max(1, Math.ceil(durationDays / stepDays));
    const sampleEvery = Math.max(1, Math.ceil(estimatedSteps / Math.max(2, sampleLimit - 1)));
    const trajectory = [{ day: startDay, positionAu: [...positionAu], velocityAuD: [...velocityAuD] }];
    let maximumEnergyDrift = 0;
    const initialEnergy = specificEnergy(positionAu, velocityAuD, gmSunAuD2);
    while (elapsed < durationDays - 1e-12) {
      const h = Math.min(stepDays, durationDays - elapsed);
      ({ positionAu, velocityAuD } = rk4(positionAu, velocityAuD, h, gmSunAuD2));
      elapsed += h;
      stepCount += 1;
      const drift = Math.abs(specificEnergy(positionAu, velocityAuD, gmSunAuD2) - initialEnergy);
      maximumEnergyDrift = Math.max(maximumEnergyDrift, drift);
      if (stepCount % sampleEvery === 0 || elapsed >= durationDays - 1e-12) {
        trajectory.push({ day: startDay + elapsed, positionAu: [...positionAu], velocityAuD: [...velocityAuD] });
      }
    }
    return deepFreeze({
      schema: 'simulatte.nBodyPropagationReceipt.v1',
      methodId: METHOD_ID,
      integrator: 'classical_runge_kutta_4_fixed_step',
      referenceCenter: 'Sun',
      referenceFrame: 'ICRF ecliptic approximation',
      timeScale: 'TDB day offset',
      startDay,
      durationDays,
      stepDays,
      stepCount,
      maximumSpecificEnergyDriftAu2D2: maximumEnergyDrift,
      endpoint: { positionAu, velocityAuD },
      trajectory,
      omissions: [
        'relativity',
        'nongravitational acceleration',
        'planetary third-body perturbations unless separately verified',
        'finite-body collision integration',
      ],
    });
  }

  function rk4(position, velocity, h, gm) {
    const derivative = (p, v) => ({ p: v, v: acceleration(p, gm) });
    const k1 = derivative(position, velocity);
    const k2 = derivative(add(position, scale(k1.p, h / 2)), add(velocity, scale(k1.v, h / 2)));
    const k3 = derivative(add(position, scale(k2.p, h / 2)), add(velocity, scale(k2.v, h / 2)));
    const k4 = derivative(add(position, scale(k3.p, h)), add(velocity, scale(k3.v, h)));
    return {
      positionAu: add(position, scale(weight(k1.p, k2.p, k3.p, k4.p), h / 6)),
      velocityAuD: add(velocity, scale(weight(k1.v, k2.v, k3.v, k4.v), h / 6)),
    };
  }

  function acceleration(position, gm) {
    const radius = Math.hypot(...position);
    if (!(radius > 1e-12)) throw propagationError('n_body_origin_singular', 'State is singular at the Sun');
    return scale(position, -gm / radius ** 3);
  }

  function specificEnergy(position, velocity, gm) {
    return 0.5 * velocity.reduce((sum, row) => sum + row * row, 0) - gm / Math.hypot(...position);
  }

  function earthState(day, gmSunAuD2) {
    const meanMotion = Math.sqrt(gmSunAuD2);
    const angle = meanMotion * day;
    return deepFreeze({
      positionAu: [Math.cos(angle), Math.sin(angle), 0],
      velocityAuD: [-meanMotion * Math.sin(angle), meanMotion * Math.cos(angle), 0],
    });
  }

  function weight(a, b, c, d) { return a.map((row, index) => row + 2 * b[index] + 2 * c[index] + d[index]); }
  function add(a, b) { return a.map((row, index) => row + b[index]); }
  function scale(a, factor) { return a.map((row) => row * factor); }
  function validateState(value) {
    for (const key of ['positionAu', 'velocityAuD']) {
      if (!Array.isArray(value?.[key]) || value[key].length !== 3 || value[key].some((row) => !Number.isFinite(row))) {
        throw propagationError('n_body_state_invalid', `${key} must have three finite components`);
      }
    }
  }
  function propagationError(code, message) {
    const error = new Error(`${code}: ${message}`);
    error.code = code;
    return error;
  }
  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
  }

  return Object.freeze({ METHOD_ID, earthState, propagate });
});
