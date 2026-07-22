(function attachStellarState(root, factory) {
  const api = factory();
  root.InterstellarStellarState = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createStellarStateModule() {
  function convertEquatorialToCartesianPc(star, targetEpochYears = 2026.5) {
    if (!star) throw new Error('Stellar state conversion requires a star object');

    // Sol is origin
    if (star.sourceId === 'gaia-sol' || star.parallaxMas === 0) {
      return { sourceId: star.sourceId, name: star.name, positionPc: [0, 0, 0], hasRadialVelocity: true };
    }

    const distPc = 1000.0 / star.parallaxMas;
    const raRad = (star.raDeg * Math.PI) / 180.0;
    const decRad = (star.decDeg * Math.PI) / 180.0;

    // Unit direction vector
    const uX = Math.cos(decRad) * Math.cos(raRad);
    const uY = Math.cos(decRad) * Math.sin(raRad);
    const uZ = Math.sin(decRad);

    const xPc = distPc * uX;
    const yPc = distPc * uY;
    const zPc = distPc * uZ;

    // Proper motion & radial velocity propagation if epoch offset
    const dtYears = targetEpochYears - 2016.0;
    const hasRv = typeof star.radialVelocityKmS === 'number' && !Number.isNaN(star.radialVelocityKmS);

    // Convert proper motion from mas/yr to rad/yr
    const masToRad = Math.PI / (180.0 * 3600.0 * 1000.0);
    const pmRaRad = (star.pmRaMasYr || 0) * masToRad;
    const pmDecRad = (star.pmDecMasYr || 0) * masToRad;

    // Tangential velocities in pc/yr (1 km/s = 1.0227e-6 pc/yr)
    const kmSToPcYr = 1.0227121655e-6;
    const vX = (-uY * pmRaRad - uZ * Math.cos(raRad) * pmDecRad) * distPc + (hasRv ? uX * star.radialVelocityKmS * kmSToPcYr * 31557600 : 0);
    const vY = (uX * pmRaRad - uZ * Math.sin(raRad) * pmDecRad) * distPc + (hasRv ? uY * star.radialVelocityKmS * kmSToPcYr * 31557600 : 0);
    const vZ = (Math.cos(decRad) * pmDecRad) * distPc + (hasRv ? uZ * star.radialVelocityKmS * kmSToPcYr * 31557600 : 0);

    return {
      sourceId: star.sourceId,
      name: star.name,
      positionPc: [xPc + vX * dtYears, yPc + vY * dtYears, zPc + vZ * dtYears],
      velocityPcYr: [vX, vY, vZ],
      hasRadialVelocity: hasRv,
      distancePc: distPc
    };
  }

  return Object.freeze({ convertEquatorialToCartesianPc });
});
