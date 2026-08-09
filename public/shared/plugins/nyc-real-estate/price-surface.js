(function attachNycRealEstatePriceSurface(root, factory) {
  const model = typeof module === 'object' && module.exports
    ? require('./forecast-model.js')
    : root.SimulatteNycRealEstateForecastModel;
  const statistics = typeof module === 'object' && module.exports
    ? require('./forecast-statistics.js')
    : root.SimulatteNycRealEstateForecastStatistics;
  const api = factory(model, statistics);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteNycRealEstatePriceSurface = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createNycRealEstatePriceSurface(
  model,
  statistics
) {
  const ENSEMBLE_SIZE = 31;

  function runSurface({ surface, governance, parameters }) {
    validateInputs(surface, governance, parameters);
    const policy = governance.policies.find((row) => row.id === parameters.policyId);
    const regionTimelines = surface.regions.map((region) => regionTimeline({
      region,
      governance,
      parameters,
      policy,
    }));
    const years = [];
    for (let year = parameters.historicalStartYear; year <= parameters.forecastEndYear; year += 1) {
      const regions = regionTimelines.map((timeline) => timeline.rowsByYear.get(year));
      const finitePrices = regions
        .map((row) => row.p50Usd)
        .filter(Number.isFinite)
        .sort((left, right) => left - right);
      years.push(statistics.deepFreeze({
        year,
        regions,
        domainUsd: finitePrices.length
          ? [
            statistics.rounded(statistics.percentile(finitePrices, 0.05), 2),
            statistics.rounded(statistics.percentile(finitePrices, 0.95), 2),
          ]
          : null,
        availableRegionCount: finitePrices.length,
        missingRegionCount: regions.length - finitePrices.length,
      }));
    }
    return statistics.deepFreeze({
      schema: 'simulatte.nycRealEstatePriceSurfaceResult.v1',
      id: `nyc-real-estate-price-surface-result:${statistics.stableIdentity({
        surfaceId: surface.id,
        parameters,
      })}`,
      surfaceId: surface.id,
      parameters,
      ensembleSize: ENSEMBLE_SIZE,
      years,
      claimBoundary: 'Neighborhood forecasts are deterministic price-only scenarios with zero neighborhood development-supply effect. They are not parcel appraisals, observations, or guarantees.',
    });
  }

  function regionTimeline({ region, governance, parameters, policy }) {
    const series = model.derivePriceSeries(region.saleSeries, region.id, parameters.sectorId);
    const observedByYear = new Map(series.map((row) => [row.year, row]));
    const supported = series.length >= governance.gates.minimumObservedPriceYears;
    const rowsByYear = new Map();
    for (let year = parameters.historicalStartYear; year <= model.OBSERVED_PRICE_END_YEAR; year += 1) {
      const observed = observedByYear.get(year);
      rowsByYear.set(year, surfaceRow(region, year, observed
        ? {
          status: 'observed',
          p10Usd: observed.medianPriceUsd,
          p50Usd: observed.medianPriceUsd,
          p90Usd: observed.medianPriceUsd,
          saleCount: observed.saleCount,
          transferredUnits: observed.transferredUnits,
          basis: observed.basis,
        }
        : missingPrice('missing-governed-observation')));
    }
    rowsByYear.set(
      model.HISTORICAL_DATA_END_YEAR,
      surfaceRow(region, model.HISTORICAL_DATA_END_YEAR, missingPrice('missing-governed-current-price'))
    );
    const futureRows = forecastRows({ series, supported, region, parameters, policy });
    futureRows.forEach((row) => rowsByYear.set(row.year, surfaceRow(region, row.year, row)));
    return { rowsByYear };
  }

  function forecastRows({ series, supported, region, parameters, policy }) {
    if (!supported) {
      return futureYears(parameters).map((year) => ({
        year,
        ...missingPrice('refused-insufficient-price-history'),
      }));
    }
    const regionParameters = {
      ...parameters,
      seed: `${parameters.seed}:price-surface:${region.id}`,
    };
    const momentumPct = model.historicalMomentum(series);
    // The price-only surface never consumes site capacity or capital-cycle
    // draws. Generate only the declared shock stream instead of constructing
    // and hashing the full forecast-model member objects for all 262 regions.
    // The discarded capital draw is still consumed so the seeded stream remains
    // byte-for-byte compatible with createExogenousDraws.
    const memberPrices = Array.from({ length: ENSEMBLE_SIZE }, (_unused, memberIndex) => {
      const random = statistics.seededRandom(`${regionParameters.seed}:member:${memberIndex}`);
      const shockByYear = new Map();
      futureYears(parameters).forEach((year) => {
        random();
        shockByYear.set(year, statistics.gaussian(random));
      });
      let price = series.at(-1).medianPriceUsd;
      return futureYears(parameters).map((year) => {
        const next = model.advancePrice({
          price,
          momentumPct,
          parameters: regionParameters,
          policy,
          supplyEffectPct: 0,
          shockZ: shockByYear.get(year),
          year,
        });
        price = next.priceUsd;
        return price;
      });
    });
    return futureYears(parameters).map((year, yearIndex) => {
      const prices = memberPrices
        .map((rows) => rows[yearIndex])
        .sort((left, right) => left - right);
      return {
        year,
        status: 'scenario-forecast',
        p10Usd: statistics.rounded(statistics.percentile(prices, 0.1), 2),
        p50Usd: statistics.rounded(statistics.percentile(prices, 0.5), 2),
        p90Usd: statistics.rounded(statistics.percentile(prices, 0.9), 2),
        saleCount: null,
        transferredUnits: null,
        basis: 'deterministic-31-member-price-only-scenario',
      };
    });
  }

  function futureYears(parameters) {
    const years = [];
    for (let year = model.HISTORICAL_DATA_END_YEAR + 1; year <= parameters.forecastEndYear; year += 1) {
      years.push(year);
    }
    return years;
  }

  function surfaceRow(region, year, price) {
    return statistics.deepFreeze({
      regionId: region.id,
      label: region.label,
      boroughId: region.boroughId,
      boroughLabel: region.boroughLabel,
      centroid: region.centroid,
      polygon: region.polygon,
      year,
      ...price,
    });
  }

  function missingPrice(reason) {
    return {
      status: reason,
      p10Usd: null,
      p50Usd: null,
      p90Usd: null,
      saleCount: null,
      transferredUnits: null,
      basis: null,
    };
  }

  function validateInputs(surface, governance, parameters) {
    if (surface?.schema !== 'simulatte.nycRealEstateCitySurface.v1'
      || !Array.isArray(surface.regions)
      || surface.regions.length !== 262) {
      throw surfaceError('nyc_real_estate_city_surface_invalid', 'Expected 262 governed neighborhood regions');
    }
    if (governance?.schema !== 'simulatte.nycRealEstateModelGovernance.v1') {
      throw surfaceError('nyc_real_estate_surface_governance_invalid', 'Model governance is required');
    }
    if (!governance.policies.some((row) => row.id === parameters.policyId)) {
      throw surfaceError('nyc_real_estate_surface_policy_unknown', parameters.policyId);
    }
    if (!model.SECTOR_IDS.includes(parameters.sectorId)) {
      throw surfaceError('nyc_real_estate_surface_sector_unknown', parameters.sectorId);
    }
  }

  function surfaceError(code, message) {
    const error = new Error(`${code}: ${message}`);
    error.name = 'SimulatteNycRealEstatePriceSurfaceError';
    error.code = code;
    return error;
  }

  return Object.freeze({ ENSEMBLE_SIZE, runSurface });
});
