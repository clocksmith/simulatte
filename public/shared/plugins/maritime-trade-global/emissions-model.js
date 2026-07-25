(function attachMaritimeEmissionsModel(root, factory) {
  const api = factory();
  root.MaritimeEmissionsModel = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createMaritimeEmissionsModel() {
  const GRAMS_PER_TON = 1e6;

  function evaluate({
    vessel,
    distanceNm,
    speedKnots,
    sailingDays,
    queueHours = 0,
    cargoTeu,
    model,
  }) {
    if (!vessel
      || !(distanceNm >= 0)
      || !(speedKnots > 0)
      || !(sailingDays >= 0)
      || !(queueHours >= 0)
      || !(cargoTeu > 0)
      || !model?.speedPower
      || !model?.fuel) {
      throw new Error('maritime_emissions_input_invalid');
    }
    const exponent = Number(model.speedPower.exponent);
    const referenceLoadFraction = Number(model.speedPower.referenceLoadFraction);
    const serviceSpeedKnots = Number(vessel.serviceSpeedKn);
    const mainEnginePowerKw = Number(vessel.mainEnginePowerKw);
    const specificFuelConsumption = Number(vessel.sfocGPerKwh);
    const loadFraction = referenceLoadFraction * Math.pow(speedKnots / serviceSpeedKnots, exponent);
    const cappedLoadFraction = Math.max(0, Math.min(1.2, loadFraction));
    const sailingHours = sailingDays * 24;
    const sailingFuelTons = mainEnginePowerKw * cappedLoadFraction * sailingHours * specificFuelConsumption / GRAMS_PER_TON;
    const queuePowerKw = mainEnginePowerKw * Number(model.idleQueueLoadFraction);
    const queueFuelTons = queuePowerKw * queueHours * specificFuelConsumption / GRAMS_PER_TON;
    const fuelTons = sailingFuelTons + queueFuelTons;
    const fuelId = model.fuel.defaultFuel;
    const factorKey = `${fuelId}Co2eFactorTPerT`;
    const co2Factor = Number(model.fuel[factorKey]);
    if (!(co2Factor > 0)) throw new Error(`maritime_emissions_factor_missing: ${factorKey}`);
    const co2Tons = fuelTons * co2Factor;
    const intensityGCo2PerTeuNm = distanceNm > 0 ? co2Tons * GRAMS_PER_TON / (cargoTeu * distanceNm) : null;
    const sensitivity = Object.freeze({
      minimumCo2Tons: co2Tons * 0.8,
      maximumCo2Tons: co2Tons * 1.2,
      basis: 'Declared ±20% archetype sensitivity; not a vessel-specific confidence interval.',
    });
    return Object.freeze({
      schema: 'simulatte.maritimeEmissionsResult.v2',
      sailingFuelTons,
      queueFuelTons,
      fuelTons,
      co2Tons,
      cargoTeu,
      co2FactorTonsPerFuelTon: co2Factor,
      intensityGCo2PerTeuNm,
      method: 'speed_power_engine_load_plus_auxiliary_queue_v2',
      equations: Object.freeze([
        'propulsionLoad = referenceLoad × (speed / serviceSpeed)^exponent',
        'fuel = power × load × hours × SFOC',
        'CO2e = fuel × fuelCarbonFactor',
        'intensity = CO2e / (cargoTEU × distanceNM)',
      ]),
      parameters: Object.freeze({
        exponent,
        referenceLoadFraction,
        mainEnginePowerKw,
        specificFuelConsumptionGPerKwh: specificFuelConsumption,
        queueLoadFraction: Number(model.idleQueueLoadFraction),
        fuelId,
      }),
      truth: truth('modeled', 'forecast', {
        kind: 'interval',
        value: sensitivity,
      }),
      evidenceRefs: Object.freeze([
        `row:maritime-vessel-archetypes-v1:${vessel.id}`,
        `row:maritime-emissions-model-v1:${model.version}`,
        'source:imo-fourth-ghg-study',
        'model:maritime-emissions-v2',
      ]),
      assumptions: Object.freeze([
        'constant leg speed',
        'clean-hull archetype',
        'no vessel-specific weather resistance',
        'no cargo mass correction beyond declared TEU',
      ]),
    });
  }

  function truth(origin, temporalStatus, uncertainty) {
    return Object.freeze({ origin, temporalStatus, uncertainty: Object.freeze(uncertainty) });
  }

  return Object.freeze({ evaluate });
});
