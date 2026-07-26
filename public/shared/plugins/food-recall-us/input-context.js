(function attachFoodRecallInputContext(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteFoodRecallInputContext = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createFoodRecallInputContext() {
  const DEFAULT_INSTANT = '2026-07-01T12:00:00.000Z';
  const OPTIONAL_CAPABILITY_ERRORS = new Set([
    'plugin_capability_provider_missing',
    'plugin_capability_implementation_missing',
  ]);

  function resolve({ sdk, model, scenario, environmentDataset }) {
    const origin = (model.facilitiesByKind.get(scenario.originFacilityKind) || [])[0] || null;
    const location = origin?.location || { longitude: -98.58, latitude: 39.83 };
    const instant = scenario.startInstant || DEFAULT_INSTANT;
    const weather = resolveWeather({ sdk, location, instant, origin, environmentDataset });
    const logistics = resolveLogistics({ sdk, scenario, origin });
    const refrigeration = resolveRefrigeration({ scenario, weather });
    return freeze({
      schema: 'simulatte.foodRecallInputContext.v1',
      instant,
      location,
      weather,
      logistics,
      refrigeration,
      engineInputs: {
        ambientTemperatureC: weather.airTemperatureC,
        logisticsDelayHours: logistics.transitDelayHoursPrior,
        logisticsAvailability: logistics.availabilityPrior,
        refrigerationSetpointC: refrigeration.setpointC,
        refrigerationTimeConstantHours: refrigeration.timeConstantHours,
        refrigerationFailureRateMultiplier: refrigeration.failureRateMultiplier,
      },
    });
  }

  function resolveWeather({ sdk, location, instant, origin, environmentDataset }) {
    const request = {
      schema: 'field.weather.request.v1',
      field: 'airTemperatureC',
      instant,
      longitude: location.longitude,
      latitude: location.latitude,
      purpose: 'food_cold_chain_ambient_temperature',
    };
    const capability = invokeOptional(sdk, 'field.weather.v1', request);
    const capabilityValue = finite(
      capability?.values?.airTemperatureC,
      capability?.airTemperatureC,
      capability?.value,
    );
    if (capabilityValue !== null) {
      return field({
        id: `weather:air-temperature:${safeId(origin?.id || 'national')}:${instant}`,
        value: capabilityValue,
        unit: capability?.units || 'degC',
        providerId: capability.providerId || 'field.weather.v1',
        sourceRowIds: capability.sourceRowIds || capability.sourceSnapshotIds || [],
        interpolation: capability.interpolation || capability.quality?.interpolation || 'provider_declared',
        origin: capability.truth?.origin || 'modeled',
        temporalStatus: capability.truth?.temporalStatus || 'snapshot',
        uncertainty: capability.truth?.uncertainty || capability.uncertainty || missing('provider did not declare uncertainty'),
        fallback: null,
        requested: request,
      });
    }
    if (sdk.environment?.sample) {
      const sample = sdk.environment.sample({
        instant,
        longitude: location.longitude,
        latitude: location.latitude,
        fields: ['airTemperatureC'],
      });
      return field({
        id: `environment:air-temperature:${safeId(origin?.id || 'national')}:${instant}`,
        value: sample.values.airTemperatureC,
        unit: 'degC',
        providerId: 'simulatte.environmentPort.v1',
        sourceRowIds: sample.sourceSnapshotIds || environmentDataset?.sourceSnapshotIds || [],
        interpolation: sample.quality?.interpolation || 'unknown',
        origin: sample.quality?.observed ? 'observed' : 'modeled',
        temporalStatus: 'snapshot',
        uncertainty: sample.quality?.uncertainty || missing('analytic environment field has no calibrated error interval'),
        fallback: capability.error || null,
        requested: request,
      });
    }
    const fallbackValue = Number(environmentDataset?.fallbackAirTemperatureC ?? 20);
    return field({
      id: 'environment:air-temperature:governed-default',
      value: fallbackValue,
      unit: 'degC',
      providerId: environmentDataset?.datasetId || 'plugin-authored-default',
      sourceRowIds: environmentDataset?.sourceSnapshotIds || [],
      interpolation: 'none',
      origin: 'scenario',
      temporalStatus: 'snapshot',
      uncertainty: missing('host weather and environment ports unavailable'),
      fallback: capability.error || 'environment_port_unavailable',
      requested: request,
    });
  }

  function resolveLogistics({ sdk, scenario, origin }) {
    const request = {
      schema: 'field.logistics-service.request.v1',
      commodityId: scenario.commodityId,
      originFacilityId: origin?.id || null,
      durationDays: scenario.durationDays,
      purpose: 'food_freight_transit_prior',
    };
    const capability = invokeOptional(sdk, 'field.logistics-service.v1', request);
    const delay = finite(capability?.transitDelayHoursPrior);
    const availability = finite(capability?.availabilityPrior, capability?.fulfillmentRate);
    if (delay !== null && availability !== null) {
      return field({
        id: `logistics:service:${safeId(capability.providerId || 'provider')}:${safeId(scenario.id)}`,
        value: capability.value ?? delay,
        unit: capability.units || 'provider_units',
        providerId: capability.providerId || 'field.logistics-service.v1',
        sourceRowIds: capability.sourceRowIds || [],
        interpolation: capability.interpolation || 'provider_declared',
        origin: capability.truth?.origin || 'modeled',
        temporalStatus: capability.truth?.temporalStatus || 'forecast',
        uncertainty: capability.truth?.uncertainty || capability.uncertainty || missing('provider did not declare uncertainty'),
        fallback: null,
        requested: request,
        transitDelayHoursPrior: Math.max(0, delay),
        availabilityPrior: clamp(availability, 0, 1),
      });
    }
    return field({
      id: `logistics:service:governed-default:${safeId(scenario.id)}`,
      value: 0,
      unit: 'hours',
      providerId: 'us.food.freight-corridors.v1',
      sourceRowIds: [],
      interpolation: 'none',
      origin: 'modeled',
      temporalStatus: 'forecast',
      uncertainty: missing('no active logistics capability; corridor means are used without a calibrated delay service'),
      fallback: capability.error || 'logistics_capability_unavailable',
      requested: request,
      transitDelayHoursPrior: 0,
      availabilityPrior: 1,
    });
  }

  function resolveRefrigeration({ scenario, weather }) {
    const failure = scenario.coldChainFailure || null;
    return field({
      id: `refrigeration:${safeId(scenario.id)}`,
      value: failure ? 1 : 0,
      unit: 'failure_scenario_boolean',
      providerId: 'food-recall-us',
      sourceRowIds: [],
      interpolation: 'hourly_first_order_response',
      origin: 'scenario',
      temporalStatus: 'forecast',
      uncertainty: missing('refrigeration response and failure parameters are illustrative priors'),
      fallback: null,
      requested: null,
      setpointC: Number(scenario.refrigeration?.setpointC ?? 3.5),
      timeConstantHours: Number(scenario.refrigeration?.timeConstantHours ?? 6),
      failureRateMultiplier: Number(scenario.refrigeration?.failureRateMultiplier ?? 1),
      forcedFailure: failure
        ? {
          ...failure,
          ambientTempC: Number(failure.ambientTempC ?? weather.airTemperatureC),
        }
        : null,
    });
  }

  function field(input) {
    return {
      ...input,
      fieldIdentity: input.id,
      timestamp: input.requested?.instant || null,
      truth: {
        origin: input.origin,
        temporalStatus: input.temporalStatus,
        uncertainty: input.uncertainty,
      },
      airTemperatureC: input.id.includes('air-temperature') ? input.value : undefined,
    };
  }

  function invokeOptional(sdk, capabilityId, request) {
    if (!sdk.capabilities?.invoke) return { error: 'capability_port_unavailable' };
    try {
      return sdk.capabilities.invoke(capabilityId, request) || {};
    } catch (error) {
      if (OPTIONAL_CAPABILITY_ERRORS.has(error?.code)) return { error: error.code };
      throw error;
    }
  }

  function finite(...values) {
    const value = values.find((row) => Number.isFinite(Number(row)));
    return value === undefined ? null : Number(value);
  }

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function missing(reason) {
    return { kind: 'missing', value: { reason } };
  }

  function safeId(value) {
    return String(value).replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  }

  function freeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.values(value).forEach(freeze);
    return Object.freeze(value);
  }

  return Object.freeze({ DEFAULT_INSTANT, resolve });
});
