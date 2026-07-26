(function attachInterstellarAdvancedChannels(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.InterstellarAdvancedChannels = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createInterstellarAdvancedChannels() {
  const LIGHT_SPEED_M_S = 299792458;
  const PC_METERS = 3.08567758149137e16;

  function evaluateChannel({
    mode,
    distancePc,
    packetBits,
    classicalLinkBudget,
    classicalLightTime,
    controls,
    catalog,
  }) {
    const declaration = catalog.channels.find((row) => row.id === mode);
    if (!declaration) throw channelError('interstellar_channel_mode_missing', mode);
    if (mode === 'classical-optical') {
      return commonReceipt({
        declaration,
        distancePc,
        latencySeconds: classicalLightTime.latencySeconds,
        effectiveDataRateGbps: classicalLinkBudget.achievableDataRateGbps,
        packetSuccessProbability: classicalLinkBudget.packetSuccessProbability,
        transmissionEnergyJ: packetBits * classicalLinkBudget.energyPerInformationBitJ,
        causalityStatus: 'light-speed-limited',
        constructibilityStatus: 'engineering-scenario',
        constraintReceipt: {
          opticalLinkMarginDb: classicalLinkBudget.linkMarginDb,
          finiteLightTimeModelId: classicalLightTime.modelReceipt.modelId,
        },
      });
    }
    if (mode === 'quantum-assisted') {
      const coherenceSeconds = controls.quantumMemoryCoherenceHours * 3600;
      const memorySurvival = Math.exp(-classicalLightTime.latencySeconds / Math.max(1, coherenceSeconds));
      const usableFidelity = controls.quantumInitialFidelity * memorySurvival;
      const capacityGain = 1 + ((declaration.maximumCapacityGainFactor - 1) * usableFidelity);
      return commonReceipt({
        declaration,
        distancePc,
        latencySeconds: classicalLightTime.latencySeconds,
        effectiveDataRateGbps: classicalLinkBudget.achievableDataRateGbps * capacityGain,
        packetSuccessProbability: classicalLinkBudget.packetSuccessProbability * usableFidelity,
        transmissionEnergyJ: packetBits * classicalLinkBudget.energyPerInformationBitJ
          + packetBits / Math.max(1, controls.entanglementPairRateHz) * declaration.entanglementSourcePowerW,
        causalityStatus: 'classical-message-required-no-ftl',
        constructibilityStatus: 'quantum-repeater-scenario',
        constraintReceipt: {
          classicalMessageLatencySeconds: classicalLightTime.latencySeconds,
          memorySurvival,
          usableFidelity,
          capacityGain,
          noSignalingSatisfied: true,
          teleportationClassicalBitsPerQubit: 2,
        },
      });
    }
    if (mode === 'traversable-wormhole') {
      const latencySeconds = controls.wormholeTraversalSeconds;
      return commonReceipt({
        declaration,
        distancePc,
        latencySeconds,
        effectiveDataRateGbps: controls.speculativeBandwidthGbps,
        packetSuccessProbability: controls.speculativeStabilityProbability,
        transmissionEnergyJ: declaration.declaredFormationEnergyJ,
        causalityStatus: latencySeconds < distancePc * PC_METERS / LIGHT_SPEED_M_S
          ? 'apparent-superluminal-causality-risk'
          : 'subluminal-parameterization',
        constructibilityStatus: 'unsupported-no-observed-infrastructure',
        constraintReceipt: {
          throatRadiusM: controls.wormholeThroatRadiusM,
          mouthSeparationPc: distancePc,
          weakEnergyConditionSatisfied: false,
          exoticStressEnergyRequired: true,
          fordRomanQuantumInequalitySatisfied: false,
          timeMachineConversionRisk: true,
        },
      });
    }
    if (mode === 'alcubierre-warp') {
      const latencySeconds = classicalLightTime.latencySeconds / controls.warpEffectiveSpeedC;
      return commonReceipt({
        declaration,
        distancePc,
        latencySeconds,
        effectiveDataRateGbps: controls.speculativeBandwidthGbps,
        packetSuccessProbability: controls.speculativeStabilityProbability,
        transmissionEnergyJ: declaration.declaredFormationEnergyJ,
        causalityStatus: controls.warpEffectiveSpeedC > 1
          ? 'apparent-superluminal-causality-risk'
          : 'subluminal-parameterization',
        constructibilityStatus: 'unsupported-no-known-generation-mechanism',
        constraintReceipt: {
          effectiveSpeedC: controls.warpEffectiveSpeedC,
          bubbleRadiusM: controls.warpBubbleRadiusM,
          originalMetricEnergyConditionSatisfied: false,
          negativeEnergyRequiredByDeclaredModel: true,
          horizonAndControlProblemResolved: false,
        },
      });
    }
    throw channelError('interstellar_channel_mode_unsupported', mode);
  }

  function commonReceipt({
    declaration,
    distancePc,
    latencySeconds,
    effectiveDataRateGbps,
    packetSuccessProbability,
    transmissionEnergyJ,
    causalityStatus,
    constructibilityStatus,
    constraintReceipt,
  }) {
    return deepFreeze({
      schema: 'simulatte.interstellarChannelReceipt.v1',
      mode: declaration.id,
      label: declaration.label,
      distancePc,
      latencySeconds,
      effectiveDataRateGbps,
      packetSuccessProbability: clamp(packetSuccessProbability, 0, 1),
      transmissionEnergyJ,
      causalityStatus,
      constructibilityStatus,
      constraintReceipt,
      citations: declaration.citations,
      truth: declaration.truth,
      claimBoundary: declaration.claimBoundary,
    });
  }

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, Number(value)));
  }
  function channelError(code, detail) {
    const error = new Error(`${code}: ${detail}`);
    error.code = code;
    return error;
  }
  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
  }

  return Object.freeze({ evaluateChannel });
});
