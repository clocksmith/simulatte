(function attachNycRealEstateForecastModel(root, factory) {
  const statistics = typeof module === 'object' && module.exports
    ? require('./forecast-statistics.js')
    : root.SimulatteNycRealEstateForecastStatistics;
  const sectors = typeof module === 'object' && module.exports
    ? require('./sector-model.js')
    : root.SimulatteNycRealEstateSectorModel;
  const api = factory(statistics, sectors);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteNycRealEstateForecastModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createNycRealEstateForecastModel(
  statistics,
  sectors
) {
  const {
    clamp,
    deepFreeze,
    gaussian,
    groupBy,
    percentile,
    rounded,
    seededRandom,
    stableIdentity,
    weightedMedian,
  } = statistics;
  const DAY_MS = 86400000;
  const YEAR_MS = Math.round(365.25 * DAY_MS);
  const OBSERVED_PRICE_END_YEAR = 2025;
  const HISTORICAL_DATA_END_YEAR = 2026;
  const SECTOR_IDS = Object.freeze(['all', 'tax-class-1', 'tax-class-2', 'tax-class-4']);

  function runScenario({ index, shard, governance, parameters }) {
    validateInputs(index, shard, governance, parameters);
    const normalizedParameters = sectors.normalizedParameters(parameters);
    const region = shard.region;
    const policy = governance.policies.find((row) => row.id === normalizedParameters.policyId);
    const priceSeries = derivePriceSeries(
      shard.saleSeries,
      normalizedParameters.regionId,
      normalizedParameters.sectorId
    );
    const developmentSeries = shard.developmentSeries;
    const historicalSites = shard.developmentSites;
    const capacitySites = shard.capacitySites;
    const sectorProfile = sectors.profileFor(normalizedParameters.sectorId);
    const selectedCandidates = sectors.selectCandidates(capacitySites, normalizedParameters.sectorId);
    const availability = {
      priceForecast: priceSeries.length >= governance.gates.minimumObservedPriceYears,
      developmentForecast: normalizedParameters.sectorId !== 'all' && selectedCandidates.length > 0,
      historicalBuildings: historicalSites.length > 0,
    };
    const exogenous = createExogenousDraws({
      parameters: normalizedParameters,
      capacitySites,
    });
    const backtest = evaluateBacktest(priceSeries, governance, normalizedParameters);
    const intervention = simulateForecast({
      priceSeries,
      capacitySites,
      parameters: normalizedParameters,
      policy,
      exogenous,
      availability,
    });
    const baselineParameters = {
      ...normalizedParameters,
      policyId: 'business-as-usual',
      zoningCapacityMultiplier: 1,
      affordableHousingSharePct: sectorProfile.allowsAffordableUnits ? 20 : 0,
    };
    const baseline = simulateForecast({
      priceSeries,
      capacitySites,
      parameters: baselineParameters,
      policy: governance.policies.find((row) => row.id === 'business-as-usual'),
      exogenous,
      availability,
    });
    const scenarioIdentity = stableIdentity({
      indexId: index.id,
      shardId: shard.id,
      parameters: normalizedParameters,
    });
    const snapshots = createSnapshots({
      region,
      priceSeries,
      developmentSeries,
      historicalSites,
      intervention,
      parameters: normalizedParameters,
      scenarioIdentity,
    });
    const events = snapshots.map((snapshot, sequence) => ({
      id: `nyc-real-estate:event:${scenarioIdentity}:${snapshot.year}`,
      sequence,
      simulationTimeMs: snapshot.simulationTimeMs,
      kind: snapshot.year <= OBSERVED_PRICE_END_YEAR
        ? 'nyc-real-estate.historical-year-replayed'
        : snapshot.year <= HISTORICAL_DATA_END_YEAR
          ? 'nyc-real-estate.current-snapshot-reached'
          : snapshot.price.status === 'forecast-refused'
            ? 'nyc-real-estate.forecast-year-refused'
            : 'nyc-real-estate.forecast-year-simulated',
      causationIds: sequence ? [`nyc-real-estate:event:${scenarioIdentity}:${snapshots[sequence - 1].year}`] : [],
      payload: {
        year: snapshot.year,
        phase: snapshot.phase,
        priceStatus: snapshot.price.status,
        activeProjects: snapshot.metrics.activeProjects,
        completedUnits: snapshot.metrics.cumulativeCompletedUnits,
        completedFloorAreaSquareFeet: snapshot.metrics.cumulativeCompletedFloorAreaSquareFeet,
        storyFocusId: snapshot.storyFocus?.id || null,
        refusalReasons: snapshot.refusalReasons,
      },
    }));
    snapshots.forEach((snapshot, index) => {
      snapshot.eventIds = [events[index].id];
    });
    const terminal = snapshots.at(-1);
    return deepFreeze({
      schema: 'simulatte.nycRealEstateScenarioResult.v1',
      scenarioIdentity,
      scenarioId: parameters.scenarioId,
      seed: parameters.seed,
      region,
      parameters: normalizedParameters,
      priceSeries,
      developmentSeries,
      historicalSites,
      capacitySites,
      coverage: {
        ...shard.coverage,
        availability,
        sectorId: normalizedParameters.sectorId,
      },
      sectorProfile: {
        id: sectorProfile.id,
        label: sectorProfile.label,
        developmentKind: sectorProfile.developmentKind,
        occupancyKind: sectorProfile.occupancyKind,
        capacityUnit: sectorProfile.capacityUnit,
        allowsAffordableUnits: sectorProfile.allowsAffordableUnits,
      },
      exogenousIdentity: exogenous.identity,
      backtest,
      forecasts: {
        baseline,
        intervention,
      },
      snapshots,
      events,
      comparison: comparisonReceipt(baseline, intervention, normalizedParameters, exogenous.identity),
      terminalMetrics: terminal.metrics,
      conservation: intervention.conservation,
      claimBoundary: governance.claimBoundary,
    });
  }

  function createSnapshots({
    region,
    priceSeries,
    developmentSeries,
    historicalSites,
    intervention,
    parameters,
    scenarioIdentity,
  }) {
    const observedPriceByYear = new Map(priceSeries.map((row) => [row.year, row]));
    const developmentByYear = new Map(developmentSeries.map((row) => [row.year, row]));
    const forecastByYear = new Map(intervention.years.map((row) => [row.year, row]));
    const firstYear = parameters.historicalStartYear;
    const rows = [];
    for (let year = firstYear; year <= parameters.forecastEndYear; year += 1) {
      const observedPrice = observedPriceByYear.get(year) || null;
      const forecast = forecastByYear.get(year) || null;
      const development = developmentByYear.get(year) || null;
      const historicalBuildingStates = historicalSites
        .map((site) => historicalSiteState(site, year))
        .filter(Boolean);
      const futureProjectStates = year > HISTORICAL_DATA_END_YEAR
        ? intervention.projects.map((project) => futureProjectState(project, year)).filter(Boolean)
        : [];
      const price = observedPrice
        ? {
          status: 'observed',
          p10Usd: observedPrice.medianPriceUsd,
          p50Usd: observedPrice.medianPriceUsd,
          p90Usd: observedPrice.medianPriceUsd,
          saleCount: observedPrice.saleCount,
          transferredUnits: observedPrice.transferredUnits,
          basis: observedPrice.basis,
        }
        : forecast?.priceStatus === 'simulated'
          ? {
            status: 'scenario-forecast',
            p10Usd: forecast.priceP10Usd,
            p50Usd: forecast.priceP50Usd,
            p90Usd: forecast.priceP90Usd,
            saleCount: null,
            transferredUnits: null,
            basis: 'conditional-ensemble-nominal-usd',
          }
          : year > HISTORICAL_DATA_END_YEAR
            ? {
              status: 'forecast-refused',
              p10Usd: null,
              p50Usd: null,
              p90Usd: null,
              saleCount: null,
              transferredUnits: null,
              basis: intervention.priceStatus,
            }
            : {
            status: 'not-observed',
            p10Usd: null,
            p50Usd: null,
            p90Usd: null,
            saleCount: null,
            transferredUnits: null,
            basis: 'no-governed-price-observation',
            };
      const completedProjects = futureProjectStates.filter((row) => row.stage === 'completed');
      const activeProjects = futureProjectStates.filter((row) => row.stage !== 'completed');
      const completedUnits = completedProjects.reduce((sum, row) => sum + row.units, 0);
      const affordableUnits = completedProjects.reduce((sum, row) => sum + row.affordableUnits, 0);
      const completedFloorAreaSquareFeet = completedProjects
        .reduce((sum, row) => sum + row.floorAreaSquareFeet, 0);
      const recordedCompletions = historicalBuildingStates
        .filter((row) => row.stage === 'completed').length;
      const milestoneEvents = storyEventsFor({
        year,
        historicalBuildingStates,
        futureProjectStates,
      });
      const storyFocus = milestoneEvents[0] || null;
      const refusalReasons = year > HISTORICAL_DATA_END_YEAR
        ? [
          ...(intervention.priceStatus === 'simulated' ? [] : [intervention.priceStatus]),
          ...(intervention.developmentStatus === 'simulated' ? [] : [intervention.developmentStatus]),
        ]
        : [];
      rows.push({
        id: `nyc-real-estate:snapshot:${scenarioIdentity}:${year}`,
        year,
        phase: year <= OBSERVED_PRICE_END_YEAR
          ? 'historical-replay'
          : year <= HISTORICAL_DATA_END_YEAR
            ? 'current-snapshot'
            : 'scenario-forecast',
        status: year === parameters.forecastEndYear ? 'settled' : 'running',
        simulationTimeMs: (year - firstYear) * YEAR_MS,
        price,
        development: {
          filingCount: development?.filingCount || 0,
          withdrawnFilingCount: development?.withdrawnFilingCount || 0,
          proposedZoningSquareFeet: development?.proposedZoningSquareFeet || 0,
        },
        historicalBuildingStates,
        futureProjectStates,
        milestoneEvents,
        storyFocus,
        refusalReasons,
        metrics: {
          medianPriceUsd: price.p50Usd,
          priceP10Usd: price.p10Usd,
          priceP90Usd: price.p90Usd,
          observedSaleCount: price.saleCount || 0,
          observedTransferredUnits: price.transferredUnits || 0,
          filingCount: development?.filingCount || 0,
          visibleHistoricalSites: historicalBuildingStates.length,
          recordedCompletedSites: recordedCompletions,
          activeProjects: activeProjects.length,
          completedProjects: completedProjects.length,
          cumulativeCompletedUnits: completedUnits,
          cumulativeAffordableUnits: affordableUnits,
          cumulativeCompletedFloorAreaSquareFeet: completedFloorAreaSquareFeet,
          visibleBuildingHeightM: rounded(
            [...historicalBuildingStates, ...futureProjectStates]
              .reduce((sum, row) => sum + row.visibleHeightM, 0),
            2
          ),
        },
        narrative: narrativeFor({
          region,
          year,
          price,
          development,
          activeProjects,
          completedProjects,
          refusalReasons,
          storyFocus,
        }),
        eventIds: [],
      });
    }
    return rows;
  }

  function derivePriceSeries(saleRows, regionId, sectorId) {
    const regionRows = saleRows.filter((row) => (
      row.regionId === regionId && (sectorId === 'all' || row.sectorId === sectorId)
    ));
    const byYear = groupBy(regionRows, (row) => row.year);
    return [...byYear.entries()].map(([year, rows]) => {
      if (sectorId !== 'all') {
        const row = rows[0];
        return {
          year,
          medianPriceUsd: row.medianPriceUsd,
          saleCount: row.saleCount,
          transferredUnits: row.transferredUnits,
          basis: row.priceBasis,
        };
      }
      return {
        year,
        medianPriceUsd: weightedMedian(
          rows.map((row) => ({ value: row.medianPriceUsd, weight: row.saleCount }))
        ),
        saleCount: rows.reduce((sum, row) => sum + row.saleCount, 0),
        transferredUnits: rows.reduce((sum, row) => sum + row.transferredUnits, 0),
        basis: 'derived-sale-count-weighted-median-of-tax-class-medians',
      };
    }).sort((left, right) => left.year - right.year);
  }

  function simulateForecast({
    priceSeries,
    capacitySites,
    parameters,
    policy,
    exogenous,
    availability,
  }) {
    const latestPrice = availability.priceForecast
      ? priceSeries.at(-1).medianPriceUsd
      : null;
    const momentumPct = availability.priceForecast ? historicalMomentum(priceSeries) : null;
    const candidates = availability.developmentForecast
      ? sectors.selectCandidates(capacitySites, parameters.sectorId)
      : [];
    const members = exogenous.members.map((draws) => simulateMember({
      latestPrice,
      momentumPct,
      candidates,
      parameters,
      policy,
      draws,
      availability,
    }));
    const years = [];
    for (let year = HISTORICAL_DATA_END_YEAR + 1; year <= parameters.forecastEndYear; year += 1) {
      const memberYears = members.map((member) => member.years.find((row) => row.year === year));
      const prices = memberYears.map((row) => row.priceUsd)
        .filter(Number.isFinite)
        .sort((left, right) => left - right);
      years.push({
        year,
        priceStatus: prices.length ? 'simulated' : 'refused-insufficient-price-history',
        priceP10Usd: prices.length ? rounded(percentile(prices, 0.1), 2) : null,
        priceP50Usd: prices.length ? rounded(percentile(prices, 0.5), 2) : null,
        priceP90Usd: prices.length ? rounded(percentile(prices, 0.9), 2) : null,
        activeProjectsP50: medianInteger(memberYears, 'activeProjects'),
        completedUnitsP50: medianInteger(memberYears, 'completedUnits'),
        completedFloorAreaSquareFeetP50: medianInteger(
          memberYears,
          'completedFloorAreaSquareFeet'
        ),
      });
    }
    const terminalMedianPrice = years.at(-1)?.priceP50Usd;
    const representative = members.slice().sort((left, right) => {
      if (!Number.isFinite(terminalMedianPrice)) return left.memberIndex - right.memberIndex;
      return Math.abs(left.years.at(-1).priceUsd - terminalMedianPrice)
        - Math.abs(right.years.at(-1).priceUsd - terminalMedianPrice);
    })[0];
    return {
      policyId: policy.id,
      exogenousIdentity: exogenous.identity,
      priceStatus: availability.priceForecast
        ? 'simulated'
        : 'refused-insufficient-price-history',
      developmentStatus: availability.developmentForecast
        ? 'simulated'
        : parameters.sectorId === 'all'
          ? 'refused-mixed-sector-development-unsupported'
          : 'refused-no-sector-capacity-candidates',
      years,
      projects: representative.projects,
      assumptions: {
        momentumPct,
        financingRatePct: parameters.financingRatePct,
        annualDemandGrowthPct: parameters.annualDemandGrowthPct,
        constructionCostIndex: parameters.constructionCostIndex,
        zoningCapacityMultiplier: parameters.zoningCapacityMultiplier,
        affordableHousingSharePct: parameters.affordableHousingSharePct,
        ensembleSize: members.length,
        exogenousIdentity: exogenous.identity,
        sectorId: parameters.sectorId,
      },
      conservation: representative.conservation,
    };
  }

  function simulateMember({
    latestPrice,
    momentumPct,
    candidates,
    parameters,
    policy,
    draws,
    availability,
  }) {
    const sectorProfile = sectors.profileFor(parameters.sectorId);
    const policyCapacity = parameters.zoningCapacityMultiplier * policy.zoningMultiplier;
    const ranked = candidates.map((candidate) => {
      const draw = draws.sites[candidate.site.id];
      const modeledCapacity = Math.max(
        1,
        Math.floor(candidate.capacityValue * policyCapacity * draw.capacityFactor)
      );
      const effectiveCapacity = parameters.sectorId === 'tax-class-1'
        ? Math.min(3, modeledCapacity)
        : modeledCapacity;
      const capacitySignal = Math.min(
        1.5,
        Math.log1p(effectiveCapacity) / (sectorProfile.capacityUnit === 'units' ? 5 : 12)
      );
      const financingPenalty = Math.max(0, parameters.financingRatePct - 4) * 0.055;
      const costPenalty = Math.max(0, parameters.constructionCostIndex - 90) * 0.0035;
      const demandSignal = parameters.annualDemandGrowthPct * 0.035;
      return {
        ...candidate,
        effectiveCapacity,
        effectiveUnits: sectorProfile.capacityUnit === 'units' ? effectiveCapacity : 0,
        effectiveFloorAreaSquareFeet: sectorProfile.capacityUnit === 'square feet'
          ? effectiveCapacity
          : Math.max(0, Math.floor(candidate.floorAreaSquareFeet * policyCapacity * draw.capacityFactor)),
        durationExtra: draw.durationExtra,
        score: capacitySignal
          + demandSignal
          + policy.startScoreOffset
          - financingPenalty
          - costPenalty
          + draw.scoreNoise,
      };
    }).sort((left, right) => right.score - left.score || left.site.id.localeCompare(right.site.id));
    const unstarted = [...ranked];
    const projects = [];
    const years = [];
    let price = latestPrice;
    for (let year = HISTORICAL_DATA_END_YEAR + 1; year <= parameters.forecastEndYear; year += 1) {
      const annualDraw = draws.years[year];
      const annualCapacity = availability.developmentForecast
        ? clamp(Math.round(
          1.4
          + parameters.annualDemandGrowthPct * 0.28
          + (policyCapacity - 1) * 1.8
          + policy.startScoreOffset * 3
          - Math.max(0, parameters.financingRatePct - 5.5) * 0.28
          - Math.max(0, parameters.constructionCostIndex - 100) * 0.025
          + annualDraw.capitalCycle
        ), 0, 5)
        : 0;
      let started = 0;
      while (started < annualCapacity && unstarted.length) {
        const candidate = unstarted.shift();
        if (candidate.score + (year - HISTORICAL_DATA_END_YEAR) * 0.018 < 0.2) continue;
        const size = sectorProfile.capacityUnit === 'units'
          ? candidate.effectiveCapacity
          : candidate.effectiveCapacity / 10000;
        const durationYears = clamp(
          2 + Math.floor(Math.log10(Math.max(10, size))) + candidate.durationExtra,
          2,
          5
        );
        const affordableUnits = sectorProfile.allowsAffordableUnits
          ? Math.min(
            candidate.effectiveUnits,
            Math.round(candidate.effectiveUnits * parameters.affordableHousingSharePct / 100)
          )
          : 0;
        projects.push({
          id: `project:${candidate.site.bbl}`,
          capacitySiteId: candidate.site.id,
          sourceRowIds: candidate.site.sourceRowIds,
          bbl: candidate.site.bbl,
          address: candidate.site.address,
          coordinates: candidate.site.coordinates,
          footprint: candidateFootprint(candidate.site),
          footprintOrigin: 'modeled-from-observed-lot-area',
          startYear: year,
          completionYear: year + durationYears,
          durationYears,
          units: candidate.effectiveUnits,
          affordableUnits,
          floorAreaSquareFeet: candidate.effectiveFloorAreaSquareFeet,
          occupancyKind: sectorProfile.occupancyKind,
          developmentKind: sectorProfile.developmentKind,
          sectorId: parameters.sectorId,
          heightM: estimatedHeight(candidate.site, policyCapacity, parameters.sectorId),
          startScore: rounded(candidate.score, 4),
        });
        started += 1;
      }
      const activeProjects = projects.filter((row) => year >= row.startYear && year < row.completionYear);
      const completed = projects.filter((row) => year >= row.completionYear);
      const completedUnits = completed.reduce((sum, row) => sum + row.units, 0);
      const completedFloorAreaSquareFeet = completed
        .reduce((sum, row) => sum + row.floorAreaSquareFeet, 0);
      const newlyCompletedSupply = sectors.completedSupply(projects, year, parameters.sectorId);
      const capacityScale = Math.max(
        sectorProfile.capacityUnit === 'units' ? 25 : 25000,
        ranked.reduce((sum, row) => sum + row.effectiveCapacity, 0) * 0.18
      );
      const supplyEffectPct = Math.min(3.5, newlyCompletedSupply / capacityScale * 2.4);
      const priceStep = availability.priceForecast
        ? advancePrice({
          price,
          momentumPct,
          parameters,
          policy,
          supplyEffectPct,
          shockZ: annualDraw.shockZ,
          year,
        })
        : { priceUsd: null, growthPct: null };
      price = priceStep.priceUsd;
      years.push({
        year,
        priceUsd: priceStep.priceUsd,
        growthPct: priceStep.growthPct,
        activeProjects: activeProjects.length,
        completedUnits,
        completedFloorAreaSquareFeet,
        newlyCompletedSupply,
      });
    }
    const completed = projects.filter((row) => row.completionYear <= parameters.forecastEndYear);
    const active = projects.filter((row) => row.completionYear > parameters.forecastEndYear);
    return {
      memberIndex: draws.memberIndex,
      years,
      projects,
      conservation: {
        candidateCount: candidates.length,
        unstartedCount: candidates.length - projects.length,
        activeCount: active.length,
        completedCount: completed.length,
        categoryCount: candidates.length,
        categoryConserved: candidates.length === (
          candidates.length - projects.length + active.length + completed.length
        ),
        modeledUnitCapacity: projects.reduce((sum, row) => sum + row.units, 0),
        completedUnits: completed.reduce((sum, row) => sum + row.units, 0),
        modeledFloorAreaSquareFeet: projects.reduce((sum, row) => sum + row.floorAreaSquareFeet, 0),
        completedFloorAreaSquareFeet: completed.reduce((sum, row) => sum + row.floorAreaSquareFeet, 0),
        unitsConserved: completed.every((row) => (
          row.units >= row.affordableUnits && row.affordableUnits >= 0
        )),
      },
    };
  }

  function createExogenousDraws({ parameters, capacitySites }) {
    const orderedSites = capacitySites.slice()
      .sort((left, right) => left.id.localeCompare(right.id));
    const members = Array.from({ length: 31 }, (_unused, memberIndex) => {
      const random = seededRandom(`${parameters.seed}:member:${memberIndex}`);
      const sites = Object.fromEntries(orderedSites.map((site) => [
        site.id,
        {
          capacityFactor: 0.52 + random() * 0.28,
          scoreNoise: (random() - 0.5) * 0.32,
          durationExtra: random() > 0.78 ? 1 : 0,
        },
      ]));
      const years = {};
      for (let year = HISTORICAL_DATA_END_YEAR + 1; year <= parameters.forecastEndYear; year += 1) {
        years[year] = {
          capitalCycle: (random() - 0.5) * 0.9,
          shockZ: gaussian(random),
        };
      }
      return { memberIndex, sites, years };
    });
    return {
      identity: stableIdentity({
        seed: parameters.seed,
        endYear: parameters.forecastEndYear,
        siteIds: orderedSites.map((row) => row.id),
        members,
      }),
      members,
    };
  }

  function advancePrice({
    price,
    momentumPct,
    parameters,
    policy,
    supplyEffectPct,
    shockZ,
    year,
  }) {
    const demandEffectPct = parameters.annualDemandGrowthPct * 0.62;
    const financingEffectPct = -(parameters.financingRatePct - 5.5) * 0.42;
    const costEffectPct = (parameters.constructionCostIndex - 100) * 0.012;
    const shockPct = shockZ * (1.8 + (year - HISTORICAL_DATA_END_YEAR) * 0.16);
    const growthPct = clamp(
      momentumPct * 0.42
      + demandEffectPct
      + financingEffectPct
      + costEffectPct
      + policy.priceGrowthOffsetPct
      - supplyEffectPct
      + shockPct,
      -15,
      18
    );
    return {
      priceUsd: rounded(Math.max(50000, price * (1 + growthPct / 100)), 2),
      growthPct: rounded(growthPct, 3),
    };
  }

  function medianInteger(rows, key) {
    const values = rows.map((row) => row[key]).sort((left, right) => left - right);
    return Math.round(percentile(values, 0.5));
  }

  function historicalSiteState(site, year) {
    const constructedYear = site.constructionYear;
    const milestoneYears = Object.fromEntries(site.milestones.map((row) => [row.kind, yearOf(row.date)]));
    const filedYear = milestoneYears.filed || constructedYear;
    const permitYear = milestoneYears['fully-permitted'] || milestoneYears.approved || filedYear;
    const completionYear = milestoneYears['final-certificate-of-occupancy']
      || milestoneYears['signed-off']
      || constructedYear;
    if (!filedYear || year < filedYear) return null;
    const fullHeight = Math.max(4, site.heightM || (site.proposedStories || 4) * 3.1);
    if (completionYear && year >= completionYear) {
      return {
        ...historicalEvidence(site),
        id: site.id,
        label: `${site.address || site.jobId || 'Recorded building'} · completed ${completionYear}`,
        footprint: site.footprint,
        footprintOrigin: site.footprintOrigin,
        stage: 'completed',
        stageOrigin: 'observed',
        visibleHeightM: fullHeight,
        targetHeightM: fullHeight,
        units: site.proposedUnits || 0,
        milestoneYear: completionYear,
      };
    }
    if (!permitYear || year < permitYear) {
      return {
        ...historicalEvidence(site),
        id: site.id,
        label: `${site.address || site.jobId || 'Recorded project'} · filing recorded`,
        footprint: site.footprint,
        footprintOrigin: site.footprintOrigin,
        stage: 'filed',
        stageOrigin: 'observed',
        visibleHeightM: 0.6,
        targetHeightM: fullHeight,
        units: site.proposedUnits || 0,
        milestoneYear: filedYear,
      };
    }
    if (!completionYear) {
      return {
        ...historicalEvidence(site),
        id: site.id,
        label: `${site.address || site.jobId || 'Recorded project'} · permit recorded, completion not observed`,
        footprint: site.footprint,
        footprintOrigin: site.footprintOrigin,
        stage: site.withdrawn ? 'withdrawn' : 'permitted-unresolved',
        stageOrigin: 'observed',
        visibleHeightM: site.withdrawn ? 0.35 : Math.min(fullHeight * 0.12, 4),
        targetHeightM: fullHeight,
        units: site.proposedUnits || 0,
        milestoneYear: permitYear,
      };
    }
    const progress = clamp((year + 1 - permitYear) / Math.max(1, completionYear - permitYear), 0.04, 0.96);
    const stage = progress < 0.2
      ? 'site-preparation'
      : progress < 0.42
        ? 'foundation'
        : progress < 0.78
          ? 'structure'
          : 'enclosure';
    const inferredMilestoneYear = stageStartYear(stage, permitYear, completionYear);
    return {
      ...historicalEvidence(site),
      id: site.id,
      label: `${site.address || site.jobId || 'Recorded project'} · ${stage.replaceAll('-', ' ')} inferred between recorded milestones`,
      footprint: site.footprint,
      footprintOrigin: site.footprintOrigin,
      stage,
      stageOrigin: 'modeled',
      visibleHeightM: Math.max(0.6, fullHeight * easeConstruction(progress)),
      targetHeightM: fullHeight,
      units: site.proposedUnits || 0,
      milestoneYear: inferredMilestoneYear,
    };
  }

  function historicalEvidence(site) {
    return {
      sourceKind: site.sourceKind,
      sourceRowIds: site.sourceRowIds || [],
      bbl: site.bbl,
      bin: site.bin,
      jobId: site.jobId,
      address: site.address,
      milestones: site.milestones,
      footprintOrigin: site.footprintOrigin,
      proposedUnits: site.proposedUnits,
      proposedStories: site.proposedStories,
      proposedZoningSquareFeet: site.proposedZoningSquareFeet,
      status: site.status || null,
      withdrawn: Boolean(site.withdrawn),
      limitation: 'Administrative milestones do not establish continuous physical construction progress.',
    };
  }

  function futureProjectState(project, year) {
    if (year < project.startYear) return null;
    if (year >= project.completionYear) {
      return {
        ...project,
        stage: 'completed',
        stageOrigin: 'simulated',
        progress: 1,
        visibleHeightM: project.heightM,
      };
    }
    const progress = clamp(
      (year + 0.75 - project.startYear) / project.durationYears,
      0.04,
      0.96
    );
    return {
      ...project,
      stage: progress < 0.2
        ? 'site-preparation'
        : progress < 0.42
          ? 'foundation'
          : progress < 0.78
            ? 'structure'
            : 'enclosure',
      stageOrigin: 'simulated',
      progress,
      visibleHeightM: Math.max(0.6, project.heightM * easeConstruction(progress)),
    };
  }

  function evaluateBacktest(series, governance) {
    const missingInputs = [
      'historical-capacity-snapshots',
      'historical-financing-series',
      'historical-construction-cost-series',
    ];
    return {
      status: series.length < governance.gates.minimumObservedPriceYears
        ? 'not-evaluated-insufficient-observed-price-years'
        : 'not-evaluated-missing-pipeline-history',
      evaluatedModel: 'nyc-real-estate-forecast-engine-v2',
      predictionCount: 0,
      mapePct: null,
      intervalCoveragePct: null,
      missingInputs,
      claim: 'Forecast skill is not reported because the published price-and-development pipeline cannot be reconstructed over the holdout years from the governed snapshot.',
    };
  }

  function comparisonReceipt(baseline, intervention, parameters, exogenousIdentity) {
    const baselineTerminal = baseline.years.at(-1);
    const interventionTerminal = intervention.years.at(-1);
    return {
      baselinePolicyId: baseline.policyId,
      interventionPolicyId: intervention.policyId,
      sharedSeed: parameters.seed,
      sharedRegionId: parameters.regionId,
      sharedSectorId: parameters.sectorId,
      sharedExogenousIdentity: exogenousIdentity,
      terminalYear: parameters.forecastEndYear,
      baseline: {
        medianPriceUsd: baselineTerminal?.priceP50Usd || null,
        completedUnits: baselineTerminal?.completedUnitsP50 || 0,
        completedFloorAreaSquareFeet:
          baselineTerminal?.completedFloorAreaSquareFeetP50 || 0,
      },
      intervention: {
        medianPriceUsd: interventionTerminal?.priceP50Usd || null,
        completedUnits: interventionTerminal?.completedUnitsP50 || 0,
        completedFloorAreaSquareFeet:
          interventionTerminal?.completedFloorAreaSquareFeetP50 || 0,
      },
    };
  }

  function historicalMomentum(series) {
    if (series.length < 2) return 1.5;
    const recent = series.slice(-Math.min(6, series.length));
    const years = Math.max(1, recent.at(-1).year - recent[0].year);
    const ratio = recent.at(-1).medianPriceUsd / Math.max(1, recent[0].medianPriceUsd);
    return clamp((ratio ** (1 / years) - 1) * 100, -3, 8);
  }

  function candidateFootprint(site) {
    const sideM = clamp(Math.sqrt(Math.max(900, site.lotAreaSquareFeet) * 0.092903), 12, 65);
    const latitude = site.coordinates[1];
    const latitudeDelta = sideM / 111320;
    const longitudeDelta = sideM / (111320 * Math.cos(latitude * Math.PI / 180));
    const [longitude] = site.coordinates;
    return [
      [longitude - longitudeDelta, latitude - latitudeDelta],
      [longitude + longitudeDelta, latitude - latitudeDelta],
      [longitude + longitudeDelta, latitude + latitudeDelta],
      [longitude - longitudeDelta, latitude + latitudeDelta],
      [longitude - longitudeDelta, latitude - latitudeDelta],
    ].map((point) => point.map((value) => rounded(value, 7)));
  }

  function estimatedHeight(site, capacityMultiplier, sectorId) {
    const floorArea = sectorId === 'tax-class-4'
      ? site.potentialCommercialFloorAreaSquareFeet * capacityMultiplier
      : site.potentialResidentialFloorAreaSquareFeet * capacityMultiplier;
    const stories = clamp(Math.ceil(floorArea / Math.max(900, site.lotAreaSquareFeet)), 2, 65);
    return rounded(stories * 3.15, 2);
  }

  function easeConstruction(progress) {
    if (progress < 0.18) return progress * 0.16;
    const normalized = (progress - 0.18) / 0.82;
    return 0.03 + normalized * normalized * (3 - 2 * normalized) * 0.97;
  }

  function storyEventsFor({ year, historicalBuildingStates, futureProjectStates }) {
    return [
      ...historicalBuildingStates
        .filter((row) => row.milestoneYear === year)
        .map((row) => ({
          id: `historical:${row.id}`,
          targetLayerId: `historical:${row.id}`,
          kind: row.stageOrigin === 'observed'
            ? `recorded-${row.stage}`
            : `inferred-${row.stage}`,
          label: row.label,
          priority: row.stage === 'completed' ? 100 : row.stageOrigin === 'observed' ? 90 : 70,
        })),
      ...futureProjectStates
        .filter((row) => row.startYear === year || row.completionYear === year)
        .map((row) => ({
          id: `future:${row.id}`,
          targetLayerId: `future:${row.id}`,
          kind: row.completionYear === year ? 'simulated-completion' : 'simulated-start',
          label: `${row.address} · ${row.completionYear === year ? 'modeled completion' : 'modeled start'}`,
          priority: row.completionYear === year ? 95 : 85,
        })),
    ].sort((left, right) => right.priority - left.priority || left.id.localeCompare(right.id));
  }

  function stageStartYear(stage, permitYear, completionYear) {
    const fraction = {
      'site-preparation': 0,
      foundation: 0.2,
      structure: 0.42,
      enclosure: 0.78,
    }[stage] || 0;
    return Math.ceil(permitYear + (completionYear - permitYear) * fraction);
  }

  function narrativeFor({
    region,
    year,
    price,
    development,
    activeProjects,
    completedProjects,
    refusalReasons,
    storyFocus,
  }) {
    if (year <= OBSERVED_PRICE_END_YEAR) {
      const priceText = price.status === 'observed'
        ? `${formatUsd(price.p50Usd)} recorded median across ${price.saleCount} sales`
        : 'no governed annual price observation';
      return `${region.label}, ${year}: ${priceText}; ${development?.filingCount || 0} new-building filings are in the aggregate record.`;
    }
    if (year === HISTORICAL_DATA_END_YEAR) {
      return `${region.label}, ${year}: current administrative and land-capacity snapshot; future buildings have not yet been asserted.`;
    }
    const priceText = price.status === 'scenario-forecast'
      ? `${formatUsd(price.p10Usd)} to ${formatUsd(price.p90Usd)} conditional price interval`
      : `price forecast refused (${refusalReasons.join(', ')})`;
    const focusText = storyFocus ? ` Focus: ${storyFocus.label}.` : '';
    return `${region.label}, ${year} scenario: ${activeProjects.length} projects active, ${completedProjects.length} complete, and ${priceText}.${focusText}`;
  }

  function validateInputs(index, shard, governance, parameters) {
    if (index?.schema !== 'simulatte.nycRealEstateRegionIndex.v1'
      || shard?.schema !== 'simulatte.nycRealEstateRegionShard.v1'
      || governance?.schema !== 'simulatte.nycRealEstateModelGovernance.v1') {
      throw modelError('nyc_real_estate_dataset_invalid', 'Required governed datasets are invalid');
    }
    if (!index.regions.some((row) => row.id === parameters.regionId)
      || shard.region?.id !== parameters.regionId) {
      throw modelError('nyc_real_estate_region_unknown', parameters.regionId);
    }
    if (!SECTOR_IDS.includes(parameters.sectorId)) {
      throw modelError('nyc_real_estate_sector_unknown', parameters.sectorId);
    }
    if (!governance.policies.some((row) => row.id === parameters.policyId)) {
      throw modelError('nyc_real_estate_policy_unknown', parameters.policyId);
    }
  }

  function yearOf(value) {
    const year = Number(String(value || '').slice(0, 4));
    return Number.isInteger(year) ? year : null;
  }

  function formatUsd(value) {
    return `$${Math.round(value || 0).toLocaleString()}`;
  }

  function modelError(code, message) {
    const error = new Error(`${code}: ${message}`);
    error.name = 'SimulatteNycRealEstateModelError';
    error.code = code;
    return error;
  }

  return Object.freeze({
    HISTORICAL_DATA_END_YEAR,
    OBSERVED_PRICE_END_YEAR,
    SECTOR_IDS,
    advancePrice,
    createExogenousDraws,
    derivePriceSeries,
    evaluateBacktest,
    futureProjectState,
    historicalMomentum,
    historicalSiteState,
    runScenario,
  });
});
