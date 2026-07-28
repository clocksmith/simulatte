(function attachNycRealEstateComparison(root, factory) {
  const comparisonApi = typeof module === 'object' && module.exports
    ? require('../../../simulatte/platform/core/simulation/comparison-execution.js')
    : root.SimulatteComparisonExecution;
  const contracts = typeof module === 'object' && module.exports
    ? require('../../../simulatte/platform/contracts/plugin-v4-contracts.js')
    : root.SimulattePluginV4Contracts;
  const builder = typeof module === 'object' && module.exports
    ? require('../../core/simulation/plugin-v4-builder.js')
    : root.SimulattePluginV4Builder;
  const v4Api = typeof module === 'object' && module.exports
    ? require('./v4-contribution.js')
    : root.SimulatteNycRealEstateV4;
  const nodeCrypto = typeof module === 'object' && module.exports ? require('node:crypto') : null;
  const api = factory(comparisonApi, contracts, builder, v4Api, nodeCrypto);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteNycRealEstateComparison = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createNycRealEstateComparison(
  comparisonApi,
  contracts,
  builder,
  v4Api,
  nodeCrypto
) {
  const PLUGIN_ID = 'nyc-real-estate';
  const ROLES = Object.freeze(['baseline', 'intervention']);

  async function runComparison({ result, dataReceipts }) {
    const branches = result.forecasts;
    assertSharedExogenous(branches, result);
    const hiddenValue = {
      exogenousIdentity: result.exogenousIdentity,
      seed: result.seed,
      regionId: result.region.id,
    };
    const hiddenHash = await sha256(hiddenValue);
    const inputHash = await sha256({
      scenarioId: result.scenarioId,
      seed: result.seed,
      regionId: result.region.id,
      sectorId: result.parameters.sectorId,
      financingRatePct: result.parameters.financingRatePct,
      annualDemandGrowthPct: result.parameters.annualDemandGrowthPct,
      constructionCostIndex: result.parameters.constructionCostIndex,
      forecastEndYear: result.parameters.forecastEndYear,
      datasets: dataReceipts.map((row) => [row.datasetId, row.sha256]),
    });
    const startingIdentity = {
      schema: 'simulatte.comparisonStartingIdentity.v4',
      scenarioId: result.scenarioId,
      seed: result.seed,
      inputHash,
      datasetHashes: dataReceipts.map((row) => ({ id: row.datasetId, sha256: row.sha256 })),
      modelHashes: Object.entries(v4Api.MODEL_HASHES)
        .map(([id, sha256Value]) => ({ id: `${PLUGIN_ID}:model:${id}`, sha256: sha256Value })),
      hiddenTruth: {
        id: `${PLUGIN_ID}:exogenous:${hiddenHash.slice(0, 20)}`,
        sha256: hiddenHash,
      },
    };
    const evidenceCatalog = createEvidenceCatalog(dataReceipts, result);
    const requiredEvidenceIds = evidenceCatalog.map((row) => row.id);
    const comparisonId = `${PLUGIN_ID}:comparison:${inputHash.slice(0, 24)}`;
    const configurations = {
      baseline: branchConfiguration(branches.baseline),
      intervention: branchConfiguration(branches.intervention),
    };
    const configurationHashes = Object.fromEntries(await Promise.all(ROLES.map(async (role) => [
      role,
      await sha256(configurations[role]),
    ])));
    const execution = comparisonApi.createComparisonExecution({
      id: comparisonId,
      synchronizationPolicy: 'lockstep',
      startingIdentity,
      observableInput: {
        regionId: result.region.id,
        sectorId: result.parameters.sectorId,
        seed: result.seed,
        firstForecastYear: branches.baseline.years[0]?.year || null,
        terminalYear: result.parameters.forecastEndYear,
        metricSchema: Object.keys(publicMetrics(branches.baseline, result.parameters.forecastEndYear)).sort(),
      },
      hiddenTruth: {
        id: startingIdentity.hiddenTruth.id,
        sha256: hiddenHash,
        value: hiddenValue,
      },
      branches: Object.fromEntries(ROLES.map((role) => [role, {
        id: `${comparisonId}:${role}`,
        configuration: configurations[role],
        configurationHash: configurationHashes[role],
        createPolicy: (context) => Object.freeze({ decide: () => context.configuration }),
        createSimulation: () => branchDriver({
          role,
          forecast: branches[role],
          startingIdentity,
          evidenceCatalog,
          comparisonId,
          terminalYear: result.parameters.forecastEndYear,
        }),
      }])),
      evidenceCatalog,
      requiredEvidenceIds,
    });
    execution.step(branches.baseline.years.length);
    const settlement = execution.settle();
    return deepFreeze({
      schema: 'simulatte.nycRealEstateComparisonRun.v1',
      comparisonId,
      sharedExogenousIdentity: result.exogenousIdentity,
      configurations,
      branchMetrics: Object.fromEntries(ROLES.map((role) => [
        role,
        publicMetrics(branches[role], result.parameters.forecastEndYear),
      ])),
      branchEvidence: Object.fromEntries(ROLES.map((role) => [role, {
        policyId: branches[role].policyId,
        projects: branches[role].projects,
        priceStatus: branches[role].priceStatus,
        developmentStatus: branches[role].developmentStatus,
        terminal: branches[role].years.at(-1),
      }])),
      settlement,
      comparisonExecutionReceipt: execution.receipt(),
    });
  }

  function branchDriver({
    role,
    forecast,
    startingIdentity,
    evidenceCatalog,
    comparisonId,
    terminalYear,
  }) {
    let cursor = -1;
    const evidenceIds = evidenceCatalog.map((row) => row.id);
    const provenance = contracts.createProvenance({
      origin: 'simulated',
      temporalStatus: 'forecast',
      uncertainty: {
        kind: 'distribution',
        value: { interpretation: 'Branches share the exact exogenous ensemble draw identity.' },
      },
      evidenceRefs: evidenceCatalog.map((row) => builder.evidence(row)),
    });
    const observation = () => {
      const year = cursor < 0 ? null : forecast.years[cursor];
      return {
        cursor: cursor + 1,
        simulationTimeMs: (cursor + 1) * 31557600000,
        status: cursor === forecast.years.length - 1 ? 'terminal' : 'running',
        calendarYear: year?.year || 2026,
        priceForecastAvailable: forecast.priceStatus === 'simulated',
        developmentForecastAvailable: forecast.developmentStatus === 'simulated',
      };
    };
    return Object.freeze({
      startingIdentity: () => startingIdentity,
      observe: observation,
      advance(request) {
        if (request.action.policyId !== forecast.policyId) {
          throw comparisonError('nyc_real_estate_comparison_policy_mismatch', role);
        }
        cursor += 1;
        const year = forecast.years[cursor];
        const terminal = cursor === forecast.years.length - 1;
        return {
          schema: 'simulatte.comparisonBranchTransition.v4',
          simulationTimeMs: (cursor + 1) * 31557600000,
          status: terminal ? 'terminal' : 'running',
          events: [builder.event({
            id: `${PLUGIN_ID}:${role}:forecast-year:${year.year}`,
            pluginId: PLUGIN_ID,
            sequence: cursor,
            simulationTimeMs: (cursor + 1) * 31557600000,
            kind: `${PLUGIN_ID}.comparison-year-simulated`,
            causationIds: cursor
              ? [`${PLUGIN_ID}:${role}:forecast-year:${forecast.years[cursor - 1].year}`]
              : [],
            correlationId: comparisonId,
            payload: {
              year: year.year,
              priceStatus: year.priceStatus,
              activeProjects: year.activeProjectsP50,
            },
            provenance,
          })],
          metrics: metricRows(yearMetrics(year, forecast), provenance),
          evidenceIds,
          observation: observation(),
        };
      },
      settle() {
        if (cursor !== forecast.years.length - 1) {
          throw comparisonError('nyc_real_estate_comparison_branch_unsettled', role);
        }
        return {
          schema: 'simulatte.comparisonBranchSettlement.v4',
          status: 'settled',
          metrics: metricRows(publicMetrics(forecast, terminalYear), provenance),
          evidenceIds,
        };
      },
    });
  }

  function branchConfiguration(forecast) {
    return {
      policyId: forecast.policyId,
      zoningCapacityMultiplier: forecast.assumptions.zoningCapacityMultiplier,
      affordableHousingSharePct: forecast.assumptions.affordableHousingSharePct,
    };
  }

  function yearMetrics(year, forecast) {
    return {
      priceForecastAvailable: forecast.priceStatus === 'simulated' ? 1 : 0,
      developmentForecastAvailable: forecast.developmentStatus === 'simulated' ? 1 : 0,
      activeProjects: year.activeProjectsP50,
      completedUnits: year.completedUnitsP50,
      completedFloorAreaSquareFeet: year.completedFloorAreaSquareFeetP50,
      ...(year.priceStatus === 'simulated' ? { medianSalePriceUsd: year.priceP50Usd } : {}),
    };
  }

  function publicMetrics(forecast, terminalYear) {
    const completed = forecast.projects.filter((row) => row.completionYear <= terminalYear);
    const terminal = forecast.years.at(-1);
    return {
      priceForecastAvailable: forecast.priceStatus === 'simulated' ? 1 : 0,
      developmentForecastAvailable: forecast.developmentStatus === 'simulated' ? 1 : 0,
      modeledProjectCount: forecast.projects.length,
      completedUnits: completed.reduce((sum, row) => sum + row.units, 0),
      affordableUnits: completed.reduce((sum, row) => sum + row.affordableUnits, 0),
      completedFloorAreaSquareFeet: completed.reduce(
        (sum, row) => sum + row.floorAreaSquareFeet,
        0
      ),
      ...(terminal?.priceStatus === 'simulated'
        ? { medianSalePriceUsd: terminal.priceP50Usd }
        : {}),
    };
  }

  function metricRows(values, provenance) {
    return Object.entries(values).map(([id, value]) => ({
      id,
      value,
      unit: id.endsWith('Usd')
        ? 'nominal USD'
        : id.includes('FloorArea')
          ? 'square feet'
          : id.includes('Available')
            ? 'state'
            : id.includes('Units')
              ? 'units'
              : 'projects',
      provenance,
    }));
  }

  function createEvidenceCatalog(receipts, result) {
    const datasets = receipts.map((receipt) => builder.datasetRecord(
      receipt.datasetId,
      receipt,
      {
        contentVersion: '2026-07-27',
        kind: 'governed NYC administrative or model input',
      }
    ));
    const lineage = (id) => ({
      axes: {
        origin: 'modeled',
        temporalStatus: 'forecast',
        uncertainty: {
          kind: 'distribution',
          value: { interpretation: 'Conditional ensemble, not calibrated market probability.' },
        },
      },
      contentVersion: id,
      scenarioEpoch: `scenario:${result.scenarioIdentity}`,
      license: { required: false, identifier: null },
    });
    return [
      ...datasets,
      ...Object.entries(v4Api.MODEL_HASHES).map(([id, contentHash]) => builder.modelRecord({
        id: `${PLUGIN_ID}:model:${id}`,
        datasetId: 'nyc-real-estate-model-governance-v1',
        contentHash,
        parentIds: datasets.map((row) => row.id),
        lineage: lineage(id),
      })),
    ];
  }

  function assertSharedExogenous(branches, result) {
    if (!result.exogenousIdentity
      || branches.baseline.exogenousIdentity !== result.exogenousIdentity
      || branches.intervention.exogenousIdentity !== result.exogenousIdentity) {
      throw comparisonError(
        'nyc_real_estate_comparison_starting_identity_mismatch',
        'Baseline and intervention do not share the exact exogenous draw identity'
      );
    }
    if (branches.baseline.years.length !== branches.intervention.years.length
      || branches.baseline.years.some((row, index) => (
        row.year !== branches.intervention.years[index].year
      ))) {
      throw comparisonError(
        'nyc_real_estate_comparison_clock_mismatch',
        'Baseline and intervention forecast years differ'
      );
    }
  }

  async function sha256(value) {
    const text = canonical(value);
    if (nodeCrypto) return nodeCrypto.createHash('sha256').update(text).digest('hex');
    const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(digest)]
      .map((row) => row.toString(16).padStart(2, '0'))
      .join('');
  }

  function canonical(value) {
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
    if (value && typeof value === 'object') {
      return `{${Object.keys(value).sort().map((key) => (
        `${JSON.stringify(key)}:${canonical(value[key])}`
      )).join(',')}}`;
    }
    return JSON.stringify(value);
  }

  function comparisonError(code, message) {
    const error = new Error(`${code}: ${message}`);
    error.code = code;
    return error;
  }

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
  }

  return Object.freeze({ runComparison });
});
