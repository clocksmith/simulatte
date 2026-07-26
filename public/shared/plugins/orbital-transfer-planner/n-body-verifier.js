(function attachNBodyVerifier(root, factory) {
  const ephemeris = typeof module === 'object' && module.exports
    ? require('./ephemeris.js')
    : root.OrbitalTransferEphemeris;
  const api = factory(ephemeris);
  root.OrbitalTransferNBodyVerifier = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createNBodyVerifier(ephemeris) {
  const AU_KM = 149597870.7;
  const AU_DAY_TO_KM_S = AU_KM / 86400;
  const METHOD_ID = 'heliocentric-rk4-third-body-verifier-v1';

  function verifyCandidate({
    candidate,
    ephemerisDataset,
    gmData,
    departureBodyId,
    arrivalBodyId,
    stepDays = 0.5,
    positionToleranceKm = 1000000,
    velocityToleranceKmS = 0.5,
  }) {
    if (!candidate?.transfer?.departureVelocityAuD) {
      throw verificationError('n_body_candidate_invalid', 'Verification requires a converged Lambert candidate');
    }
    const perturbingBodyIds = Object.keys(gmData.bodies || {})
      .filter((id) => id !== 'sun' && id !== departureBodyId && id !== arrivalBodyId && ephemerisDataset.bodies?.[id])
      .sort();
    const propagated = propagate({
      initialPositionAu: candidate.trajectory[0],
      initialVelocityAuD: candidate.transfer.departureVelocityAuD,
      startDay: candidate.departureDay,
      durationDays: candidate.tofDays,
      stepDays,
      ephemerisDataset,
      gmData,
      perturbingBodyIds,
    });
    const target = ephemeris.getBodyState(ephemerisDataset, arrivalBodyId, candidate.arrivalDay);
    const positionErrorKm = magnitude(subtract(propagated.positionAu, target.positionAu)) * AU_KM;
    const velocityErrorKmS = magnitude(subtract(
      propagated.velocityAuD,
      candidate.transfer.arrivalVelocityAuD,
    )) * AU_DAY_TO_KM_S;
    const targetRelativeVelocityKmS = magnitude(subtract(
      propagated.velocityAuD,
      target.velocityAuD,
    )) * AU_DAY_TO_KM_S;
    const accepted = positionErrorKm <= positionToleranceKm
      && velocityErrorKmS <= velocityToleranceKmS;
    return freeze({
      schema: 'simulatte.orbitalNBodyVerificationReceipt.v1',
      methodId: METHOD_ID,
      integrator: 'classical_runge_kutta_4_fixed_step',
      forceModel: {
        centralBody: 'sun',
        perturbingBodyIds,
        heliocentricIndirectTerms: true,
        excludedEndpointBodies: [departureBodyId, arrivalBodyId],
        exclusionReason: 'candidate states begin and end at body centers; sphere-of-influence transitions are outside this screening model',
      },
      stepDays,
      stepCount: propagated.stepCount,
      startDay: candidate.departureDay,
      durationDays: candidate.tofDays,
      endpoint: {
        propagatedPositionAu: propagated.positionAu,
        targetPositionAu: target.positionAu,
        propagatedVelocityAuD: propagated.velocityAuD,
        lambertArrivalVelocityAuD: candidate.transfer.arrivalVelocityAuD,
        targetVelocityAuD: target.velocityAuD,
        positionErrorKm: number(positionErrorKm),
        velocityErrorKmS: number(velocityErrorKmS),
        targetRelativeVelocityKmS: number(targetRelativeVelocityKmS),
      },
      tolerance: { positionKm: positionToleranceKm, velocityKmS: velocityToleranceKmS },
      accepted,
      trajectory: propagated.trajectory,
      claimGate: accepted
        ? {
          status: 'verified_screening_approximation',
          allowed: ['deterministic mission-design screening', 'bounded force-model comparison'],
          blocked: ['validated flight path', 'navigation product', 'certification evidence', 'operational maneuver recommendation'],
        }
        : {
          status: 'approximation_only',
          allowed: ['deterministic two-body screening result with disclosed verification error'],
          blocked: ['validated flight path', 'navigation product', 'certification evidence', 'operational maneuver recommendation'],
        },
    });
  }

  function propagate({
    initialPositionAu,
    initialVelocityAuD,
    startDay,
    durationDays,
    stepDays,
    ephemerisDataset,
    gmData,
    perturbingBodyIds = [],
    sampleLimit = 128,
  }) {
    validateVector(initialPositionAu, 'initialPositionAu');
    validateVector(initialVelocityAuD, 'initialVelocityAuD');
    if (!(durationDays > 0) || !(stepDays > 0)) {
      throw verificationError('n_body_time_invalid', 'Propagation duration and step must be positive');
    }
    let position = initialPositionAu.slice();
    let velocity = initialVelocityAuD.slice();
    let elapsed = 0;
    let stepCount = 0;
    const estimatedSteps = Math.ceil(durationDays / stepDays);
    const sampleEvery = Math.max(1, Math.ceil(estimatedSteps / Math.max(2, sampleLimit - 1)));
    const trajectory = [{ day: startDay, positionAu: position.slice(), velocityAuD: velocity.slice() }];
    while (elapsed < durationDays - 1e-12) {
      const h = Math.min(stepDays, durationDays - elapsed);
      const day = startDay + elapsed;
      ({ position, velocity } = rk4Step({
        position,
        velocity,
        day,
        h,
        ephemerisDataset,
        gmData,
        perturbingBodyIds,
      }));
      elapsed += h;
      stepCount += 1;
      if (stepCount % sampleEvery === 0 || elapsed >= durationDays - 1e-12) {
        trajectory.push({
          day: startDay + elapsed,
          positionAu: position.slice(),
          velocityAuD: velocity.slice(),
        });
      }
    }
    return freeze({
      positionAu: position,
      velocityAuD: velocity,
      stepCount,
      trajectory,
    });
  }

  function rk4Step({ position, velocity, day, h, ephemerisDataset, gmData, perturbingBodyIds }) {
    const derivative = (statePosition, stateVelocity, offset) => ({
      position: stateVelocity,
      velocity: acceleration(
        statePosition,
        day + offset,
        ephemerisDataset,
        gmData,
        perturbingBodyIds,
      ),
    });
    const k1 = derivative(position, velocity, 0);
    const k2 = derivative(
      add(position, scale(k1.position, h / 2)),
      add(velocity, scale(k1.velocity, h / 2)),
      h / 2,
    );
    const k3 = derivative(
      add(position, scale(k2.position, h / 2)),
      add(velocity, scale(k2.velocity, h / 2)),
      h / 2,
    );
    const k4 = derivative(
      add(position, scale(k3.position, h)),
      add(velocity, scale(k3.velocity, h)),
      h,
    );
    return {
      position: add(position, scale(weighted(k1.position, k2.position, k3.position, k4.position), h / 6)),
      velocity: add(velocity, scale(weighted(k1.velocity, k2.velocity, k3.velocity, k4.velocity), h / 6)),
    };
  }

  function acceleration(position, day, ephemerisDataset, gmData, perturbingBodyIds) {
    const sunGm = gmData.bodies?.sun?.gmAuD2;
    if (!(sunGm > 0)) throw verificationError('n_body_sun_gm_missing', 'Solar gravitational parameter is required');
    const radius = magnitude(position);
    if (!(radius > 0)) throw verificationError('n_body_origin_singular', 'Spacecraft position is singular at the heliocentric origin');
    let result = scale(position, -sunGm / (radius ** 3));
    perturbingBodyIds.forEach((bodyId) => {
      const gm = gmData.bodies?.[bodyId]?.gmAuD2;
      if (!(gm > 0)) return;
      const body = ephemeris.getBodyState(ephemerisDataset, bodyId, day);
      const relative = subtract(body.positionAu, position);
      const relativeRadius = magnitude(relative);
      const bodyRadius = magnitude(body.positionAu);
      if (!(relativeRadius > 1e-9) || !(bodyRadius > 1e-9)) return;
      result = add(result, add(
        scale(relative, gm / (relativeRadius ** 3)),
        scale(body.positionAu, -gm / (bodyRadius ** 3)),
      ));
    });
    return result;
  }

  function weighted(k1, k2, k3, k4) {
    return k1.map((value, index) => value + 2 * k2[index] + 2 * k3[index] + k4[index]);
  }
  function add(left, right) { return left.map((value, index) => value + right[index]); }
  function subtract(left, right) { return left.map((value, index) => value - right[index]); }
  function scale(vector, factor) { return vector.map((value) => value * factor); }
  function magnitude(vector) { return Math.hypot(...vector); }
  function number(value) { return Number(value.toFixed(9)); }

  function validateVector(value, label) {
    if (!Array.isArray(value) || value.length !== 3 || value.some((row) => !Number.isFinite(row))) {
      throw verificationError('n_body_vector_invalid', `${label} must contain three finite values`);
    }
  }

  function verificationError(code, message) {
    const error = new Error(`${code}: ${message}`);
    error.name = 'OrbitalNBodyVerificationError';
    error.code = code;
    return error;
  }

  function freeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.values(value).forEach(freeze);
    return Object.freeze(value);
  }

  return Object.freeze({ AU_DAY_TO_KM_S, AU_KM, METHOD_ID, propagate, verifyCandidate });
});
