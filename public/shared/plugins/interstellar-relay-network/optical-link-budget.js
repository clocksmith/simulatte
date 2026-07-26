(function attachOpticalLinkBudget(root, factory) {
  const api = factory();
  root.InterstellarOpticalLinkBudget = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createOpticalLinkBudgetModule() {
  const PLANCK = 6.62607015e-34;
  const LIGHT_SPEED = 299792458;
  function computeLinkBudget(distanceMeters, transceiver, options = {}) {
    if (!(distanceMeters > 0)) throw new Error('optical_link_distance_invalid');
    requireTransceiver(transceiver);
    const txPowerW = Number(transceiver.laserPowerW);
    const txApertureM = Number(transceiver.transmitApertureDiameterM);
    const rxApertureM = Number(transceiver.receiveApertureDiameterM);
    const wavelengthM = Number(transceiver.wavelengthNm) * 1e-9;
    const opticalEfficiency = Number(options.opticalEfficiency ?? transceiver.opticalEfficiency);
    const jitterArcsec = Number(options.pointingJitterArcsec ?? transceiver.pointingJitterArcsec);
    const photonsPerBit = Number(transceiver.requiredDetectedPhotonsPerInformationBit);
    const codeRate = Number(transceiver.codeRate);
    const backgroundPhotonRateHz = Number(transceiver.backgroundPhotonRateHz);
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
    const signalPhotonRate = Math.max(0, photonRate - backgroundPhotonRateHz);
    const physicalRateGbps = signalPhotonRate * codeRate / photonsPerBit / 1e9;
    const hardwareMaximumGbps = Number(transceiver.maxDataRateGbps);
    const achievableDataRateGbps = Math.max(0, Math.min(hardwareMaximumGbps, physicalRateGbps));
    const minimumOperationalGbps = Number(options.minimumOperationalGbps ?? transceiver.minimumOperationalGbps);
    const requiredPowerW = minimumOperationalGbps * 1e9 * photonsPerBit * photonEnergyJ / codeRate;
    const linkMarginDb = 10 * Math.log10(rxPowerW / requiredPowerW);
    const informationBitRate = achievableDataRateGbps * 1e9;
    const detectedPhotonsPerInformationBit = informationBitRate > 0 ? signalPhotonRate / informationBitRate : 0;
    const backgroundPhotonsPerInformationBit = informationBitRate > 0 ? backgroundPhotonRateHz / informationBitRate : Infinity;
    const estimatedBitErrorRate = informationBitRate > 0
      ? 0.5 * Math.exp(-Math.max(0, detectedPhotonsPerInformationBit - backgroundPhotonsPerInformationBit) / 2)
      : 0.5;
    const packetBits = Math.max(0, Number(options.packetBits || 0));
    const packetSuccessProbability = packetBits
      ? Math.exp(packetBits * Math.log1p(-Math.min(0.499999999, estimatedBitErrorRate)))
      : null;
    const efficiencyBounds = transceiver.opticalEfficiencyInterval || [opticalEfficiency, opticalEfficiency];
    const jitterFraction = Number(transceiver.pointingJitterUncertaintyPercent || 0) / 100;
    const lowerPower = linkPower({
      distanceMeters: Number(options.distanceUpperMeters || distanceMeters),
      txPowerW,
      txApertureM,
      rxApertureM,
      wavelengthM,
      opticalEfficiency: Number(efficiencyBounds[0]),
      jitterArcsec: jitterArcsec * (1 + jitterFraction),
      declaredAttenuation,
    });
    const upperPower = linkPower({
      distanceMeters: Number(options.distanceLowerMeters || distanceMeters),
      txPowerW,
      txApertureM,
      rxApertureM,
      wavelengthM,
      opticalEfficiency: Number(efficiencyBounds[1]),
      jitterArcsec: Math.max(0, jitterArcsec * (1 - jitterFraction)),
      declaredAttenuation,
    });
    const rateForPower = (power) => Math.max(
      0,
      Math.min(hardwareMaximumGbps, ((power / photonEnergyJ) - backgroundPhotonRateHz) * codeRate / photonsPerBit / 1e9),
    );
    return Object.freeze({
      schema: 'simulatte.opticalLinkBudget.v2', txPowerW, txApertureM, rxApertureM,
      wavelengthNm: wavelengthM * 1e9, opticalEfficiency, distanceMeters,
      freeSpaceLossDb: 10 * Math.log10(freeSpace), txGainDb: 10 * Math.log10(txGain), rxGainDb: 10 * Math.log10(rxGain),
      pointingLossDb: 10 * Math.log10(pointingLoss), declaredAttenuationDb: 10 * Math.log10(declaredAttenuation),
      rxPowerW, photonRate, signalPhotonRate, backgroundPhotonRateHz,
      requiredDetectedPhotonsPerInformationBit: photonsPerBit, codeRate,
      achievableDataRateGbps, hardwareMaximumGbps, minimumOperationalGbps, linkMarginDb,
      detectedPhotonsPerInformationBit, backgroundPhotonsPerInformationBit,
      estimatedBitErrorRate, packetSuccessProbability,
      energyPerInformationBitJ: informationBitRate > 0 ? txPowerW / informationBitRate : Infinity,
      method: 'diffraction-photon-budget-v2',
      modelReceipt: Object.freeze({
        modelId: 'diffraction-photon-budget-v2',
        parameterSourceIds: Object.freeze([`relay.hardware.archetypes.v2:${transceiver.id}`]),
        omissionIds: Object.freeze([
          'acquisition-not-modeled',
          'maintenance-not-modeled',
          'plasma-not-modeled',
          'detector-background-noise-incomplete',
          'retries-not-modeled',
          'infrastructure-not-observed',
          'continuous-contact-assumed',
        ]),
        reliabilityScope: Object.freeze({
          conditionalOn: Object.freeze(['continuous-contact-assumed', 'infrastructure-not-observed']),
          excludes: Object.freeze([
            'acquisition-not-modeled',
            'maintenance-not-modeled',
            'plasma-not-modeled',
            'detector-background-noise-incomplete',
            'retries-not-modeled',
          ]),
        }),
        parameters: Object.freeze({
          attenuationFactor: declaredAttenuation,
          packetBits,
          codeRate,
          requiredDetectedPhotonsPerInformationBit: photonsPerBit,
        }),
      }),
      evidenceReferences: Object.freeze([
        ...(options.sourceRowIds || []),
        `relay.hardware.archetypes.v2:${transceiver.id}`,
        'interstellar.relay.models.v1:diffraction-photon-budget-v2',
      ]),
      truth: Object.freeze({
        origin: 'modeled',
        temporalStatus: 'forecast',
        uncertainty: Object.freeze({
          kind: 'interval',
          value: Object.freeze({
            achievableDataRateGbps: Object.freeze([rateForPower(lowerPower), rateForPower(upperPower)]),
            sources: Object.freeze(['opticalEfficiencyInterval', 'pointingJitterUncertaintyPercent', 'astrometricDistanceInterval']),
            omissionIds: Object.freeze([
              'acquisition-not-modeled',
              'maintenance-not-modeled',
              'plasma-not-modeled',
              'detector-background-noise-incomplete',
              'retries-not-modeled',
              'infrastructure-not-observed',
              'continuous-contact-assumed',
            ]),
            continuousContactAssumed: true,
          }),
        }),
      }),
      claimBoundary: 'Idealized diffraction-limited optical link over governed astrometry and scenario terminals. Acquisition outages, maintenance, interstellar plasma, and complete detector noise are not modeled.',
    });
  }

  function linkPower({
    distanceMeters, txPowerW, txApertureM, rxApertureM, wavelengthM,
    opticalEfficiency, jitterArcsec, declaredAttenuation,
  }) {
    const txGain = Math.pow(Math.PI * txApertureM / wavelengthM, 2);
    const rxGain = Math.pow(Math.PI * rxApertureM / wavelengthM, 2);
    const freeSpace = Math.pow(wavelengthM / (4 * Math.PI * distanceMeters), 2);
    const jitterRad = jitterArcsec * Math.PI / (180 * 3600);
    const beamHalfAngleRad = 1.22 * wavelengthM / txApertureM;
    const pointingLoss = Math.exp(-2.77 * Math.pow(jitterRad / beamHalfAngleRad, 2));
    return txPowerW * opticalEfficiency * txGain * rxGain * freeSpace * pointingLoss * declaredAttenuation;
  }

  function requireTransceiver(value) {
    const required = [
      'id', 'laserPowerW', 'transmitApertureDiameterM', 'receiveApertureDiameterM',
      'wavelengthNm', 'pointingJitterArcsec', 'opticalEfficiency',
      'requiredDetectedPhotonsPerInformationBit', 'codeRate', 'backgroundPhotonRateHz',
      'maxDataRateGbps', 'minimumOperationalGbps',
    ];
    const missing = required.filter((key) => value?.[key] === undefined || value?.[key] === null);
    if (missing.length) throw new Error(`optical_link_transceiver_invalid: missing ${missing.join(',')}`);
  }
  return Object.freeze({ computeLinkBudget });
});
