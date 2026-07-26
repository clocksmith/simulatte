(function attachLightTime(root, factory) {
  const api = factory();
  root.InterstellarLightTime = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createLightTimeModule() {
  const PC_TO_METERS = 3.08567758149137e16;
  const LIGHT_SPEED_MS = 299792458;
  const SECONDS_PER_YEAR = 86400 * 365.25;
  const LIGHT_SPEED_PC_YR = LIGHT_SPEED_MS * SECONDS_PER_YEAR / PC_TO_METERS;

  function computeOneWayLightTime(pos1Pc, pos2Pc, transmissionEpochIso = '2026-07-21T00:00:00Z') {
    const dx = pos2Pc[0] - pos1Pc[0];
    const dy = pos2Pc[1] - pos1Pc[1];
    const dz = pos2Pc[2] - pos1Pc[2];

    const distancePc = Math.hypot(dx, dy, dz);
    const distanceMeters = distancePc * PC_TO_METERS;
    const latencySeconds = distanceMeters / LIGHT_SPEED_MS;
    const latencyYears = latencySeconds / SECONDS_PER_YEAR;

    const txTime = new Date(transmissionEpochIso).getTime();
    const rxTime = txTime + Math.round(latencySeconds * 1000);

    return {
      transmissionEpochIso,
      arrivalEpochIso: new Date(rxTime).toISOString(),
      distancePc,
      distanceLy: distancePc * 3.26156,
      distanceMeters,
      latencySeconds,
      latencyYears,
      precision: 'finite_light_speed_c',
    };
  }

  function computeMovingTargetLightTime(fromState, toState, transmitOffsetSeconds = 0, transmissionEpochIso = '2026-07-25T00:00:00Z') {
    if (!fromState?.positionPc || !toState?.positionPc) throw new Error('moving_target_state_invalid');
    const transmitOffsetYears = transmitOffsetSeconds / SECONDS_PER_YEAR;
    const sourceAtTransmission = propagate(fromState, transmitOffsetYears);
    const targetAtTransmission = propagate(toState, transmitOffsetYears);
    const relative = targetAtTransmission.map((value, index) => value - sourceAtTransmission[index]);
    const targetVelocity = toState.velocityPcYr || [0, 0, 0];
    const a = dot(targetVelocity, targetVelocity) - (LIGHT_SPEED_PC_YR * LIGHT_SPEED_PC_YR);
    const b = 2 * dot(relative, targetVelocity);
    const c = dot(relative, relative);
    const discriminant = (b * b) - (4 * a * c);
    if (!(discriminant >= 0) || Math.abs(a) < 1e-20) throw new Error('moving_target_intercept_unsolved');
    const roots = [
      (-b + Math.sqrt(discriminant)) / (2 * a),
      (-b - Math.sqrt(discriminant)) / (2 * a),
    ].filter((value) => value > 0 && Number.isFinite(value));
    if (!roots.length) throw new Error('moving_target_intercept_not_future');
    const latencyYears = Math.min(...roots);
    const latencySeconds = latencyYears * SECONDS_PER_YEAR;
    const targetAtArrival = targetAtTransmission.map((value, index) => value + targetVelocity[index] * latencyYears);
    const distancePc = Math.hypot(...targetAtArrival.map((value, index) => value - sourceAtTransmission[index]));
    const txTime = Date.parse(transmissionEpochIso);
    return Object.freeze({
      transmissionEpochIso,
      arrivalEpochIso: new Date(txTime + latencySeconds * 1000).toISOString(),
      distancePc,
      distanceLy: distancePc * 3.261563777,
      distanceMeters: distancePc * PC_TO_METERS,
      latencySeconds,
      latencyYears,
      sourcePositionAtTransmissionPc: Object.freeze(sourceAtTransmission),
      targetPositionAtTransmissionPc: Object.freeze(targetAtTransmission),
      targetPositionAtArrivalPc: Object.freeze(targetAtArrival),
      precision: 'moving-target-finite-light-time-v2',
      modelReceipt: Object.freeze({
        modelId: 'finite-light-time-v2',
        equation: '|target(t + dt) - source(t)| = c * dt',
        parameters: Object.freeze({ transmitOffsetSeconds, lightSpeedMs: LIGHT_SPEED_MS }),
        omissionIds: Object.freeze(['plasma-not-modeled']),
      }),
    });
  }

  function propagate(state, deltaYears) {
    const velocity = state.velocityPcYr || [0, 0, 0];
    return state.positionPc.map((value, index) => value + velocity[index] * deltaYears);
  }
  function dot(left, right) { return left.reduce((sum, value, index) => sum + value * right[index], 0); }

  return Object.freeze({
    PC_TO_METERS,
    LIGHT_SPEED_MS,
    SECONDS_PER_YEAR,
    LIGHT_SPEED_PC_YR,
    computeOneWayLightTime,
    computeMovingTargetLightTime,
  });
});
