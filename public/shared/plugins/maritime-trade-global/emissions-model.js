(function attachMaritimeEmissionsModel(root, factory) {
  const api = factory();
  root.MaritimeEmissionsModel = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createMaritimeEmissionsModel() {
  const DEFAULT_CO2_FACTOR = 3.114;
  function evaluate({ vessel, distanceNm, speedKnots, sailingDays, queueHours = 0, cargoTeu = null, emissionsFactors = null }) {
    if (!vessel || !(distanceNm >= 0) || !(speedKnots > 0) || !(sailingDays >= 0)) throw new Error('maritime_emissions_input_invalid');
    const designSpeed = vessel.designSpeedKnots || speedKnots;
    const speedRatio = speedKnots / designSpeed;
    const sailingFuelTons = (vessel.fuelConsTonsDay || 0) * Math.pow(speedRatio, 3) * sailingDays;
    const hotelFuelTonsDay = vessel.hotelFuelTonsDay || Math.max(1, (vessel.fuelConsTonsDay || 0) * 0.06);
    const queueFuelTons = hotelFuelTonsDay * queueHours / 24;
    const fuelTons = sailingFuelTons + queueFuelTons;
    const co2Factor = emissionsFactors?.co2TonsPerFuelTon || DEFAULT_CO2_FACTOR;
    const co2Tons = fuelTons * co2Factor;
    const teu = cargoTeu || vessel.teuCapacity || null;
    return Object.freeze({
      schema: 'simulatte.maritimeEmissionsResult.v1',
      sailingFuelTons, queueFuelTons, fuelTons, co2Tons,
      co2FactorTonsPerFuelTon: co2Factor,
      intensityGCo2PerTeuNm: teu && distanceNm ? co2Tons * 1e6 / (teu * distanceNm) : null,
      method: 'speed_cubed_sailing_plus_hotel_load_v1',
      assumptions: Object.freeze(['constant_service_speed','declared_vessel_archetype','no_wave_added_resistance_unless_scenario_multiplier']),
    });
  }
  return Object.freeze({ DEFAULT_CO2_FACTOR, evaluate });
});
