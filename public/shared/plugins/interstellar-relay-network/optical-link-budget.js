(function attachOpticalLinkBudget(root, factory) {
  const api = factory();
  root.InterstellarOpticalLinkBudget = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createOpticalLinkBudgetModule() {
  function computeLinkBudget(distMeters, transceiver) {
    const powerW = transceiver?.laserPowerW || 250000;
    const apertureM = transceiver?.apertureDiameterM || 10.0;
    const wavelengthM = (transceiver?.wavelengthNm || 1550) * 1e-9;
    const jitterArcsec = transceiver?.pointingJitterArcsec || 0.002;

    // Free space path loss: (lambda / (4 * pi * d))^2
    const fspl = Math.pow(wavelengthM / (4 * Math.PI * distMeters), 2);

    // Transmitter gain: (pi * D / lambda)^2
    const gt = Math.pow((Math.PI * apertureM) / wavelengthM, 2);

    // Receiver gain: (pi * D / lambda)^2
    const gr = Math.pow((Math.PI * apertureM) / wavelengthM, 2);

    // Pointing loss penalty
    const jitterRad = (jitterArcsec * Math.PI) / (180.0 * 3600.0);
    const beamHalfAngleRad = (1.22 * wavelengthM) / apertureM;
    const pointingLoss = Math.exp(-2.77 * Math.pow(jitterRad / beamHalfAngleRad, 2));

    const rxPowerW = powerW * gt * gr * fspl * pointingLoss;
    const maxRateGbps = transceiver?.maxDataRateGbps || 1000;
    const achievableGbps = Math.min(maxRateGbps, Math.max(0.001, (rxPowerW / 1e-9) * maxRateGbps));

    return {
      txPowerW: powerW,
      apertureDiameterM: apertureM,
      wavelengthNm: transceiver?.wavelengthNm || 1550,
      fsplDb: 10 * Math.log10(fspl),
      gtDb: 10 * Math.log10(gt),
      grDb: 10 * Math.log10(gr),
      pointingLossDb: 10 * Math.log10(pointingLoss),
      rxPowerW,
      achievableDataRateGbps: achievableGbps
    };
  }

  return Object.freeze({ computeLinkBudget });
});
