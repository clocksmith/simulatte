(function attachRadiation(root, factory) {
  const api = factory();
  root.OrbitalTransferRadiation = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createRadiationModule() {
  function computeExposure(tofDays, radiationSnapshot, shieldingGcm2 = 15) {
    const baselinePfu = radiationSnapshot?.baselineFluxPfu || 0.85;
    const attenuation = radiationSnapshot?.shieldingAttenuationFactor || 0.12;
    const baseDosage = baselinePfu * tofDays * (10 / shieldingGcm2) * attenuation;

    let flareExtra = 0;
    (radiationSnapshot?.flareEvents || []).forEach((flare) => {
      flareExtra += (flare.peakFluxPfu * (flare.durationHours / 24)) * (10 / shieldingGcm2) * attenuation;
    });

    return {
      shieldedProtonUnits: baseDosage + flareExtra,
      shieldingGcm2,
      baselineDosage: baseDosage,
      flareDosage: flareExtra
    };
  }

  return Object.freeze({ computeExposure });
});
