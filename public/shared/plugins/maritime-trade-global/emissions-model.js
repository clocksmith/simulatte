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
    calibration,
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
    const sensitivityDefinition = calibration?.emissionsSensitivity;
    if (!sensitivityDefinition || sensitivityDefinition.status !== 'declared_engineering_sensitivity') {
      throw new Error('maritime_emissions_sensitivity_definition_missing');
    }
    const baseline = calculate({
      vessel,
      distanceNm,
      speedKnots,
      sailingDays,
      queueHours,
      cargoTeu,
      model,
    });
    const cases = sensitivityDefinition.cases.map((definition) => {
      const evaluated = calculate({
        vessel: {
          ...vessel,
          mainEnginePowerKw: Number(vessel.mainEnginePowerKw) * Number(definition.mainEnginePowerMultiplier),
          sfocGPerKwh: Number(vessel.sfocGPerKwh) * Number(definition.specificFuelConsumptionMultiplier),
        },
        distanceNm,
        speedKnots,
        sailingDays,
        queueHours,
        cargoTeu,
        model: {
          ...model,
          speedPower: {
            ...model.speedPower,
            exponent: definition.speedPowerExponent,
            referenceLoadFraction: Number(model.speedPower.referenceLoadFraction)
              * Number(definition.referenceLoadFractionMultiplier),
          },
          idleQueueLoadFraction: Number(model.idleQueueLoadFraction)
            * Number(definition.queueLoadFractionMultiplier),
        },
      });
      return Object.freeze({
        id: definition.id,
        co2Tons: evaluated.co2Tons,
        fuelTons: evaluated.fuelTons,
        intensityGCo2PerTeuNm: evaluated.intensityGCo2PerTeuNm,
        parameters: Object.freeze({
          speedPowerExponent: definition.speedPowerExponent,
          referenceLoadFractionMultiplier: definition.referenceLoadFractionMultiplier,
          mainEnginePowerMultiplier: definition.mainEnginePowerMultiplier,
          specificFuelConsumptionMultiplier: definition.specificFuelConsumptionMultiplier,
          queueLoadFractionMultiplier: definition.queueLoadFractionMultiplier,
        }),
      });
    });
    const co2Values = [baseline.co2Tons, ...cases.map((row) => row.co2Tons)];
    const parameterSensitivity = Object.freeze({
      schema: 'simulatte.maritimeEmissionsParameterSensitivity.v1',
      id: sensitivityDefinition.id,
      kind: 'parameter_sensitivity',
      method: sensitivityDefinition.method,
      baselineCo2Tons: baseline.co2Tons,
      minimumCo2Tons: Math.min(...co2Values),
      maximumCo2Tons: Math.max(...co2Values),
      cases: Object.freeze(cases),
      probability: null,
      confidenceLevel: null,
      samplingDistribution: null,
      interpretation: sensitivityDefinition.interpretation.warning,
      evidenceRefs: Object.freeze([
        'dataset:maritime.calibration.artifacts.v1',
        `row:maritime.calibration.artifacts.v1:${sensitivityDefinition.id}`,
        'source:imo-fourth-ghg-study',
      ]),
    });
    return Object.freeze({
      schema: 'simulatte.maritimeEmissionsResult.v3',
      ...baseline,
      method: 'speed_power_engine_load_plus_auxiliary_queue_v2',
      equations: Object.freeze([
        'propulsionLoad = referenceLoad × (speed / serviceSpeed)^exponent',
        'fuel = power × load × hours × SFOC',
        'CO2e = fuel × fuelCarbonFactor',
        'intensity = CO2e / (cargoTEU × distanceNM)',
      ]),
      parameterSensitivity,
      truth: truth('modeled', 'forecast', {
        kind: 'missing',
        value: {
          reason: 'No probabilistic emissions uncertainty model is calibrated; see parameterSensitivity for deterministic engineering cases.',
        },
      }),
      evidenceRefs: Object.freeze([
        `row:maritime-vessel-archetypes-v1:${vessel.id}`,
        `row:maritime-emissions-model-v1:${model.version}`,
        `row:maritime.calibration.artifacts.v1:${sensitivityDefinition.id}`,
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

  function calculate({
    vessel,
    distanceNm,
    speedKnots,
    sailingDays,
    queueHours,
    cargoTeu,
    model,
  }) {
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
    return {
      sailingFuelTons,
      queueFuelTons,
      fuelTons,
      co2Tons,
      cargoTeu,
      co2FactorTonsPerFuelTon: co2Factor,
      intensityGCo2PerTeuNm,
      parameters: Object.freeze({
        exponent,
        referenceLoadFraction,
        mainEnginePowerKw,
        specificFuelConsumptionGPerKwh: specificFuelConsumption,
        queueLoadFraction: Number(model.idleQueueLoadFraction),
        fuelId,
      }),
    };
  }

  function truth(origin, temporalStatus, uncertainty) {
    return Object.freeze({ origin, temporalStatus, uncertainty: Object.freeze(uncertainty) });
  }

  return Object.freeze({ evaluate });
});
