(function attachOpticalLinkBudget(root, factory) {
  const api = factory();
  root.InterstellarOpticalLinkBudget = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createOpticalLinkBudgetModule() {
  const PLANCK = 6.62607015e-34;
  const LIGHT_SPEED = 299792458;
  function computeLinkBudget(distanceMeters, transceiver, options = {}) {
    if (!(distanceMeters > 0)) throw new Error('optical_link_distance_invalid');
    const txPowerW = Number(transceiver?.laserPowerW || 250000);
    const txApertureM = Number(transceiver?.transmitApertureDiameterM || transceiver?.apertureDiameterM || 10);
    const rxApertureM = Number(transceiver?.receiveApertureDiameterM || transceiver?.apertureDiameterM || 10);
    const wavelengthM = Number(transceiver?.wavelengthNm || 1550) * 1e-9;
    const opticalEfficiency = Number(transceiver?.opticalEfficiency || 0.55);
    const jitterArcsec = Number(transceiver?.pointingJitterArcsec || 0.002);
    const photonsPerBit = Number(transceiver?.requiredPhotonsPerBit || options.requiredPhotonsPerBit || 20);
    const declaredAttenuation = Number(options.attenuationFactor ?? 1);
    const txGain = Math.pow(Math.PI * txApertureM / wavelengthM, 2);
    const rxGain = Math.pow(Math.PI * rxApertureM / wavelengthM, 2);
    const freeSpace = Math.pow(wavelengthM / (4 * Math.PI * distanceMeters), 2);
    const jitterRad = jitterArcsec * Math.PI / (180 * 3600);
    const beamHalfAngleRad = 1.22 * wavelengthM / txApertureM;
    const pointingLoss = Math.exp(-2.77 * Math.pow(jitterRad / beamHalfAngleRad, 2));
    const rxPowerW = txPowerW * opticalEfficiency * txGain * rxGain * freeSpace * pointingLoss * declaredAttenuation;
    const photonEnergyJ = PLANCK * LIGHT_SPEED / wavelengthM;
    const photonRate = rxPowerW / photonEnergyJ;
    const physicalRateGbps = photonRate / photonsPerBit / 1e9;
    const hardwareMaximumGbps = Number(transceiver?.maxDataRateGbps || Infinity);
    const achievableDataRateGbps = Math.max(0, Math.min(hardwareMaximumGbps, physicalRateGbps));
    const minimumOperationalGbps = Number(options.minimumOperationalGbps || transceiver?.minimumOperationalGbps || 0.1);
    const requiredPowerW = minimumOperationalGbps * 1e9 * photonsPerBit * photonEnergyJ;
    const linkMarginDb = 10 * Math.log10(rxPowerW / requiredPowerW);
    return Object.freeze({
      schema: 'simulatte.opticalLinkBudget.v1', txPowerW, txApertureM, rxApertureM,
      wavelengthNm: wavelengthM * 1e9, opticalEfficiency, distanceMeters,
      freeSpaceLossDb: 10 * Math.log10(freeSpace), txGainDb: 10 * Math.log10(txGain), rxGainDb: 10 * Math.log10(rxGain),
      pointingLossDb: 10 * Math.log10(pointingLoss), declaredAttenuationDb: 10 * Math.log10(declaredAttenuation),
      rxPowerW, photonRate, requiredPhotonsPerBit: photonsPerBit,
      achievableDataRateGbps, hardwareMaximumGbps, minimumOperationalGbps, linkMarginDb,
      method: 'diffraction_limited_optical_link_photon_budget_v1',
      claimBoundary: 'Idealized diffraction-limited optical link with declared efficiency and pointing loss; excludes unmodeled acquisition, coding, background, dust, plasma, maintenance, and infrastructure feasibility.',
    });
  }
  return Object.freeze({ computeLinkBudget });
});
