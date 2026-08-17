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
    const rThermalDieToFluid = baseThermalResistance * Math.pow(coolantFlowLpm / effectiveFlowLpm, 0.6);

    // Actual power dissipation per GPU based on compute load
    const activeGpuPowerW = gpuTdpW * Math.max(0.2, activeMfuFraction);
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
      const isThrottled = avgJunctionTemp >= 80.0;

      if (avgJunctionTemp > peakJunctionTempC) {
        peakJunctionTempC = avgJunctionTemp;
      }

      if (isThrottled) {
        throttledGpuCount += 8; // 8 GPUs per rack in this node
      }

      rackThermals.push(Object.freeze({
        rackIndex: r,
        avgTempC: Number(avgJunctionTemp.toFixed(1)),
        coolantInletC: Number(rackCoolantInlet.toFixed(1)),
        coolantOutletC: Number((rackCoolantInlet + coolantDeltaTC).toFixed(1)),
        powerDrawKw: Number(((activeGpuPowerW * 8) / 1000).toFixed(2)),
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
      racks: Object.freeze(rackThermals),
    });
  }

  return Object.freeze({ solveThermals });
});
