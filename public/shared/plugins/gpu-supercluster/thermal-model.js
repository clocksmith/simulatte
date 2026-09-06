(function attachThermalModel(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteThermalModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createThermalModel() {
  function solveThermals({
    totalGpus = 256,
    racksCount = 32,
    gpuTdpW = 700,
    coolantInletTempC = 22.0,
    coolantFlowLpm = 120.0,
    ambientAirTempC = 24.0,
    cduFlowDegradationPercent = 0,
    activeMfuFraction = 0.55,
  } = {}) {
    // Water thermal capacity: Cp = 4184 J / (kg * K), density = 1 kg / L
    const effectiveFlowLpm = Math.max(10, coolantFlowLpm * (1 - cduFlowDegradationPercent / 100));
    const flowKgPerSec = (effectiveFlowLpm / 60) * 1.0;
    const cpWater = 4184;

    // Thermal resistance from GPU die junction to cooling fluid (C/W), scaled by convective flow velocity
    const baseThermalResistance = 0.075; // Nominal microchannel coldplate resistance at full flow
    // The nominal reference stays fixed as the user changes pump flow.
    const rThermalDieToFluid = baseThermalResistance * Math.pow(120 / effectiveFlowLpm, 0.6);

    // Actual power dissipation per GPU based on compute load
    const demandedGpuPowerW = gpuTdpW * Math.max(0.2, activeMfuFraction);
    const demandedDeltaTC = demandedGpuPowerW * totalGpus / (flowKgPerSec * cpWater);
    const rackBaseTemp = (r) => coolantInletTempC + Math.floor(r / 8) * 1.5;
    const demandedRise = (r) => demandedGpuPowerW * rThermalDieToFluid
      + demandedDeltaTC * (cduFlowDegradationPercent / 100) * ((r + 1) / racksCount);
    // A modeled uniform clock/power cap keeps the hottest die at 80 C.
    // This is a linear scenario policy, not a calibrated hardware controller.
    const thermalClockFraction = Math.max(0.01, Math.min(1, ...Array.from({ length: racksCount }, (_, r) =>
      (80 - rackBaseTemp(r)) / demandedRise(r))));
    const activeGpuPowerW = demandedGpuPowerW * thermalClockFraction;
    const totalClusterItPowerKw = (activeGpuPowerW * totalGpus) / 1000;

    // Total facility heat absorbed by coolant loop
    const totalHeatW = activeGpuPowerW * totalGpus;
    const coolantDeltaTC = totalHeatW / (flowKgPerSec * cpWater);
    const coolantOutletTempC = coolantInletTempC + coolantDeltaTC;

    const rackThermals = [];
    let peakJunctionTempC = 0;
    let throttledGpuCount = 0;

    for (let r = 0; r < racksCount; r++) {
      // Thermal variation across rows and fluid loop path
      const rowIndex = Math.floor(r / 8);
      const loopHeatFactor = coolantDeltaTC * (cduFlowDegradationPercent / 100) * ((r + 1) / racksCount);
      const rackCoolantInlet = coolantInletTempC + (rowIndex * 1.5) + loopHeatFactor;

      const avgJunctionTemp = rackCoolantInlet + (activeGpuPowerW * rThermalDieToFluid);
      const isThrottled = thermalClockFraction < 1;

      if (avgJunctionTemp > peakJunctionTempC) {
        peakJunctionTempC = avgJunctionTemp;
      }

      if (isThrottled) {
        throttledGpuCount += totalGpus / racksCount;
      }

      rackThermals.push(Object.freeze({
        rackIndex: r,
        avgTempC: Number(avgJunctionTemp.toFixed(1)),
        coolantInletC: Number(rackCoolantInlet.toFixed(1)),
        coolantOutletC: Number((rackCoolantInlet + coolantDeltaTC).toFixed(1)),
        powerDrawKw: Number(((activeGpuPowerW * totalGpus / racksCount) / 1000).toFixed(2)),
        isThrottled,
      }));
    }

    // Cooling Infrastructure Power & PUE calculation
    // Base cooling overhead + pump power + chiller load
    const coolingOverheadKw = (effectiveFlowLpm * 0.08) + (totalClusterItPowerKw * (coolantDeltaTC > 15 ? 0.12 : 0.06));
    const totalFacilityPowerKw = totalClusterItPowerKw + coolingOverheadKw + 15.0; // +15kW lighting/aux
    const pue = totalFacilityPowerKw / (totalClusterItPowerKw || 1);

    return Object.freeze({
      totalGpus,
      racksCount,
      totalItPowerKw: Number(totalClusterItPowerKw.toFixed(1)),
      totalFacilityPowerKw: Number(totalFacilityPowerKw.toFixed(1)),
      coolingOverheadKw: Number(coolingOverheadKw.toFixed(1)),
      pue: Number(pue.toFixed(3)),
      coolantInletTempC: Number(coolantInletTempC.toFixed(1)),
      coolantOutletTempC: Number(coolantOutletTempC.toFixed(1)),
      coolantDeltaTC: Number(coolantDeltaTC.toFixed(2)),
      effectiveFlowLpm: Number(effectiveFlowLpm.toFixed(1)),
      peakJunctionTempC: Number(peakJunctionTempC.toFixed(1)),
      throttledGpuCount,
      thermalClockFraction,
      demandedPeakJunctionTempC: Math.max(...Array.from({ length: racksCount }, (_, r) => rackBaseTemp(r) + demandedRise(r))),
      racks: Object.freeze(rackThermals),
    });
  }

  return Object.freeze({ solveThermals });
});
