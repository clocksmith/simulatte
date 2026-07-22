(function attachInterstellarPropagation(root, factory) {
  const api = factory();
  root.InterstellarRelayPropagation = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createPropagationModule() {
  function computeLinkBudget(distPc, transceiver, dustDataset) {
    const pcToMeters = 3.08567758149137e16;
    const distanceMeters = distPc * pcToMeters;
    const lightSpeedMs = 299792458;
    const latencySeconds = distanceMeters / lightSpeedMs;
    const latencyYears = latencySeconds / (86400 * 365.25);

    const apertureM = transceiver?.apertureDiameterM || 5.0;
    const wavelengthM = (transceiver?.wavelengthNm || 1550) * 1e-9;
    const powerW = (transceiver?.laserPowerKw || 50) * 1e3;

    // Free space path loss / diffraction beam waist
    const beamRadiusAtTarget = (1.22 * wavelengthM * distanceMeters) / apertureM;
    const rxArea = Math.PI * Math.pow(apertureM / 2, 2);
    const beamArea = Math.PI * Math.pow(beamRadiusAtTarget, 2);
    const geometricEfficiency = Math.min(1.0, rxArea / beamArea);

    const extinctionMag = distPc * (dustDataset?.extinctionMagPerPc || 0.0002);
    const dustAttenuationFactor = Math.pow(10, -0.4 * extinctionMag);

    const rxPowerW = powerW * geometricEfficiency * dustAttenuationFactor;
    const dataRateGbps = Math.max(0.001, (transceiver?.peakDataRateGbps || 100) * (rxPowerW / 1e-6));

    return {
      distancePc: distPc,
      distanceLy: distPc * 3.26156,
      latencyYears,
      rxPowerW,
      dataRateGbps: Math.min(transceiver?.peakDataRateGbps || 100, dataRateGbps)
    };
  }

  return Object.freeze({ computeLinkBudget });
});
