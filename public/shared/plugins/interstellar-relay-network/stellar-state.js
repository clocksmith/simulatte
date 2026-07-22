(function attachStellarState(root, factory) {
  const api = factory();
  root.InterstellarStellarState = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createStellarStateModule() {
  const MAS_TO_RAD = Math.PI / (180 * 3600 * 1000);
  const KM_S_TO_PC_YR = 1.0227121650537077e-6;

  function convertEquatorialToCartesianPc(star, targetEpochYears = 2026.5) {
    if (!star) throw stellarError('stellar_state_missing', 'Stellar state conversion requires a star object');
    if (star.sourceId === 'gaia-sol' || star.parallaxMas === 0) {
      return Object.freeze({ schema: 'simulatte.stellarState.v1', sourceId: star.sourceId, name: star.name || 'Sol', epochYear: targetEpochYears, positionPc: Object.freeze([0,0,0]), velocityPcYr: Object.freeze([0,0,0]), hasRadialVelocity: true, distancePc: 0, propagation: 'solar_origin' });
    }
    if (!(star.parallaxMas > 0) || !Number.isFinite(star.raDeg) || !Number.isFinite(star.decDeg)) {
      throw stellarError('stellar_astrometry_invalid', `Star ${star.sourceId || 'unknown'} has invalid RA, DEC, or parallax`, { sourceId: star.sourceId || null });
    }
    const distancePc = 1000 / star.parallaxMas;
    const ra = star.raDeg * Math.PI / 180;
    const dec = star.decDeg * Math.PI / 180;
    const cosDec = Math.cos(dec);
    const sinDec = Math.sin(dec);
    const cosRa = Math.cos(ra);
    const sinRa = Math.sin(ra);
    const radialUnit = [cosDec*cosRa, cosDec*sinRa, sinDec];
    const raUnit = [-sinRa, cosRa, 0];
    const decUnit = [-sinDec*cosRa, -sinDec*sinRa, cosDec];
    const position = radialUnit.map((value) => value * distancePc);
    const pmRa = Number(star.pmRaMasYr || 0) * MAS_TO_RAD;
    const pmDec = Number(star.pmDecMasYr || 0) * MAS_TO_RAD;
    const tangential = radialUnit.map((_, index) => distancePc * (pmRa * raUnit[index] + pmDec * decUnit[index]));
    const hasRadialVelocity = Number.isFinite(star.radialVelocityKmS);
    const radialSpeedPcYr = hasRadialVelocity ? star.radialVelocityKmS * KM_S_TO_PC_YR : 0;
    const velocity = tangential.map((value, index) => value + radialSpeedPcYr * radialUnit[index]);
    const dtYears = targetEpochYears - Number(star.referenceEpochYear || 2016.0);
    const propagated = position.map((value, index) => value + velocity[index] * dtYears);
    return Object.freeze({
      schema: 'simulatte.stellarState.v1', sourceId: star.sourceId, name: star.name || star.sourceId,
      epochYear: targetEpochYears, positionPc: Object.freeze(propagated), velocityPcYr: Object.freeze(velocity),
      hasRadialVelocity, distancePc, propagation: 'linear_space_motion_v1',
      astrometricQuality: Object.freeze({ parallaxMas: star.parallaxMas, parallaxErrorMas: star.parallaxErrorMas ?? null, radialVelocityMissing: !hasRadialVelocity }),
    });
  }
  function stellarError(code, message, evidence = null) { const error = new Error(`${code}: ${message}`); error.name = 'InterstellarStellarStateError'; error.code = code; error.evidence = evidence; return error; }
  return Object.freeze({ MAS_TO_RAD, KM_S_TO_PC_YR, convertEquatorialToCartesianPc, stellarError });
});
