(function attachPatchedConic(root, factory) {
  const api = factory();
  root.OrbitalTransferPatchedConic = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createPatchedConicModule() {
  const AU_DAY_TO_KM_S = 149597870.7 / 86400;

  function evaluatePatchedConic({ departureState, arrivalState, lambert, departureBody = null, arrivalBody = null, parkingAltitudeKm = 200 }) {
    const departureVinfAuD = subtract(lambert.departureVelocityAuD, departureState.velocityAuD);
    const arrivalVinfAuD = subtract(lambert.arrivalVelocityAuD, arrivalState.velocityAuD);
    const departureVinfKmS = magnitude(departureVinfAuD) * AU_DAY_TO_KM_S;
    const arrivalVinfKmS = magnitude(arrivalVinfAuD) * AU_DAY_TO_KM_S;
    const departureBurnKmS = parkingBurn(departureVinfKmS, departureBody, parkingAltitudeKm);
    const arrivalBurnKmS = parkingBurn(arrivalVinfKmS, arrivalBody, parkingAltitudeKm);
    return Object.freeze({
      schema: 'simulatte.patchedConicTransfer.v1',
      departureVinfKmS,
      arrivalVinfKmS,
      departureBurnKmS,
      arrivalBurnKmS,
      totalDeltaVKmS: departureBurnKmS + arrivalBurnKmS,
      parkingAltitudeKm,
      method: departureBody?.radiusKm && arrivalBody?.radiusKm ? 'patched_conic_parking_orbits_v1' : 'heliocentric_v_infinity_sum_v1',
      claimBoundary: 'Two-body Lambert transfer with patched-conic endpoint estimates; excludes finite burns, plane-change coupling, n-body perturbations, navigation margins, and operational constraints.',
    });
  }

  function parkingBurn(vinfKmS, body, altitudeKm) {
    if (!body || !(body.gmM3S2 > 0) || !(body.radiusKm > 0)) return vinfKmS;
    const muKm3S2 = body.gmM3S2 / 1e9;
    const radiusKm = body.radiusKm + altitudeKm;
    const circular = Math.sqrt(muKm3S2 / radiusKm);
    const hyperbolicPeriapsis = Math.sqrt(vinfKmS * vinfKmS + 2 * muKm3S2 / radiusKm);
    return Math.max(0, hyperbolicPeriapsis - circular);
  }

  function subtract(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function magnitude(v) { return Math.hypot(v[0], v[1], v[2]); }
  return Object.freeze({ AU_DAY_TO_KM_S, evaluatePatchedConic, parkingBurn });
});
