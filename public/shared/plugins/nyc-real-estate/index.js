(function attachNycRealEstatePlugin(root, factory) {
  const model = typeof module === 'object' && module.exports
    ? require('./forecast-model.js')
    : root.SimulatteNycRealEstateForecastModel;
  const v4Api = typeof module === 'object' && module.exports
    ? require('./v4-contribution.js')
    : root.SimulatteNycRealEstateV4;
  const comparisonApi = typeof module === 'object' && module.exports
    ? require('./comparison-driver.js')
    : root.SimulatteNycRealEstateComparison;
  const api = factory(model, v4Api, comparisonApi);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulattePluginNycRealEstate = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createNycRealEstatePlugin(
  model,
  v4Api,
  comparisonApi
) {
  const PLUGIN_ID = 'nyc-real-estate';
  const DATASETS = Object.freeze({
    index: 'nyc-real-estate-region-index-2026-v1',
    governance: 'nyc-real-estate-model-governance-v1',
  });
  const SCENARIO_DEFAULTS = Object.freeze({
    'greenpoint-history-and-growth': Object.freeze({
      regionId: 'BK0101',
      sectorId: 'tax-class-2',
      policyId: 'business-as-usual',
      financingRatePct: 5.5,
      annualDemandGrowthPct: 1.5,
      constructionCostIndex: 100,
      zoningCapacityMultiplier: 1,
      affordableHousingSharePct: 20,
    }),
    'long-island-city-capacity-expansion': Object.freeze({
      regionId: 'QN0201',
      sectorId: 'tax-class-2',
      policyId: 'zoning-capacity-expansion',
      financingRatePct: 5.25,
      annualDemandGrowthPct: 2.25,
      constructionCostIndex: 104,
      zoningCapacityMultiplier: 1.35,
      affordableHousingSharePct: 25,
    }),
    'mott-haven-affordability': Object.freeze({
      regionId: 'BX0101',
      sectorId: 'tax-class-2',
      policyId: 'affordability-first',
      financingRatePct: 5,
      annualDemandGrowthPct: 2,
      constructionCostIndex: 98,
      zoningCapacityMultiplier: 1.2,
      affordableHousingSharePct: 50,
    }),
    'soho-financing-squeeze': Object.freeze({
      regionId: 'MN0201',
      sectorId: 'tax-class-4',
      policyId: 'high-rate-squeeze',
      financingRatePct: 9,
      annualDemandGrowthPct: -0.5,
      constructionCostIndex: 118,
      zoningCapacityMultiplier: 0.8,
      affordableHousingSharePct: 15,
    }),
  });

  async function activate({ sdk, config, scenario }) {
    requireDependencies();
    const fixedDatasets = loadFixedDatasets(sdk);
    let selectedScenario = normalizeScenario(scenario, config);
    let acceptedParameters = validateParameters({}, selectedScenario, config, fixedDatasets);
    let datasets = await loadRegionData(sdk, fixedDatasets, acceptedParameters.regionId);
    let result = run(acceptedParameters);
    sdk.state.register(reduce, initialState(result, acceptedParameters));
    appendScenarioReceipt(result, acceptedParameters);

    function run(parameters) {
      return model.runScenario({
        index: datasets.index,
        shard: datasets.shard,
        governance: datasets.governance,
        parameters,
      });
    }

    async function recompute(values, nextScenario) {
      acceptedParameters = validateParameters(values, nextScenario, config, fixedDatasets);
      datasets = await loadRegionData(sdk, fixedDatasets, acceptedParameters.regionId);
      result = run(acceptedParameters);
      sdk.events.propose({
        pluginId: PLUGIN_ID,
        kind: `${PLUGIN_ID}.scenario-computed`,
        result,
        acceptedParameters,
      });
      appendScenarioReceipt(result, acceptedParameters);
      return result;
    }

    async function setScenario(nextScenario) {
      selectedScenario = normalizeScenario(nextScenario, config);
      await recompute({}, selectedScenario);
      return scenarioSummary(result);
    }

    async function handleAction(actionId, context = {}) {
      if (actionId === 'scenario.run') return runPlayback(context);
      if (actionId === 'counterfactual.compare') return compareCounterfactual(context.values?.comparisonId);
      return { status: 'refused', reason: 'unknown_action', actionId };
    }

    async function runPlayback(context) {
      const phase = context.values?.phase;
      if (phase === 'start') {
        selectedScenario = normalizeScenario(context.scenario || selectedScenario, config);
        await recompute(context.values || {}, selectedScenario);
        sdk.events.propose({
          pluginId: PLUGIN_ID,
          kind: `${PLUGIN_ID}.playback-started`,
          acceptedParameters,
        });
        return playbackResult(sdk.state.read());
      }
      if (phase === 'step') {
        const state = sdk.state.read();
        if (state.playback.status !== 'running') {
          return state.playback.status === 'settled'
            ? playbackResult(state)
            : { status: 'refused', reason: 'playback_not_running' };
        }
        const cursor = Math.min(
          state.result.snapshots.length - 1,
          state.playback.cursor + 1
        );
        sdk.events.propose({
          pluginId: PLUGIN_ID,
          kind: `${PLUGIN_ID}.playback-advanced`,
          cursor,
        });
        const next = sdk.state.read();
        if (next.playback.status === 'settled') appendSettlementReceipt(next);
        return playbackResult(next);
      }
      return { status: 'refused', reason: 'scenario_phase_invalid', phase };
    }

    async function compareCounterfactual(requestedComparisonId = 'business-as-usual-vs-selected-policy') {
      if (requestedComparisonId !== 'business-as-usual-vs-selected-policy') {
        throw pluginError('nyc_real_estate_comparison_unknown', requestedComparisonId);
      }
      const state = sdk.state.read();
      const comparison = await comparisonApi.runComparison({
        result: state.result,
        dataReceipts: datasets.dataReceipts,
      });
      sdk.events.propose({
        pluginId: PLUGIN_ID,
        kind: `${PLUGIN_ID}.comparison-computed`,
        comparisonId: requestedComparisonId,
        comparison,
      });
      sdk.receipts.append(comparison.comparisonExecutionReceipt);
      sdk.receipts.append({
        schema: 'simulatte.plugin.nycRealEstateComparisonReceipt.v1',
        comparisonId: requestedComparisonId,
        scenarioIdentity: state.result.scenarioIdentity,
        sharedConfiguration: {
          regionId: state.result.region.id,
          sectorId: state.result.parameters.sectorId,
          seed: state.result.seed,
          terminalYear: state.result.parameters.forecastEndYear,
          exogenousIdentity: comparison.sharedExogenousIdentity,
        },
        branches: comparison.branchMetrics,
        policies: comparison.configurations,
        executionReceiptId: comparison.comparisonExecutionReceipt.id,
        truth: truth(
          'simulated',
          'forecast',
          distribution('Branches share datasets, region, property class, seed, clock, and exact exogenous draws.')
        ),
      });
      return deepFreeze({
        status: 'settled',
        comparisonId: requestedComparisonId,
        comparisonBranches: comparison.branchMetrics,
        comparisonExecutionReceipt: comparison.comparisonExecutionReceipt,
        branchEvidence: comparison.branchEvidence,
      });
    }

    function contributeRequest({ sourceText, mission = null }) {
      if (!/\b(?:nyc|new york city|real estate|property prices?|development|construction replay|zoning|housing forecast)\b/i.test(sourceText || '')) {
        return null;
      }
      if (!mission) return { recognized: true, obligations: [], unresolved: [] };
      const scenarioId = sdk.state.read().result.scenarioId;
      return {
        recognized: true,
        obligations: [
          { id: `${PLUGIN_ID}:history:${scenarioId}`, kind: 'administrative-history-replay', required: true },
          { id: `${PLUGIN_ID}:construction:${scenarioId}`, kind: 'construction-stage-visualization', required: true },
          { id: `${PLUGIN_ID}:forecast:${scenarioId}`, kind: 'conditional-price-and-development-ensemble', required: true },
          { id: `${PLUGIN_ID}:truth:${scenarioId}`, kind: 'observed-modeled-simulated-boundary', required: true },
        ],
        unresolved: [],
      };
    }

    function settle() {
      const state = sdk.state.read();
      const terminalSnapshot = currentSnapshot(state);
      const terminal = state.playback.status === 'settled'
        && state.playback.cursor === state.result.snapshots.length - 1
        && terminalSnapshot.status === 'settled';
      const forecastRows = state.result.forecasts.intervention.years
        .filter((row) => row.priceStatus === 'simulated');
      const intervalOrder = forecastRows.every((row) => (
        Number.isFinite(row.priceP10Usd)
        && row.priceP10Usd <= row.priceP50Usd
        && row.priceP50Usd <= row.priceP90Usd
      ));
      const refusalPreserved = state.result.forecasts.intervention.priceStatus !== 'simulated'
        ? state.result.forecasts.intervention.years.every((row) => (
          row.priceP10Usd === null && row.priceP50Usd === null && row.priceP90Usd === null
        ))
        : true;
      const conservation = state.result.conservation;
      const truthBoundary = datasets.index.truth.origin === 'derived'
        && datasets.shard.truth.origin === 'observed'
        && datasets.governance.truth.origin === 'modeled';
      return {
        obligationResults: [
          {
            obligationId: `${PLUGIN_ID}:history:${state.result.scenarioId}`,
            status: terminal && state.result.snapshots.some((row) => row.phase === 'historical-replay')
              ? 'settled'
              : 'unmet',
            evidence: {
              firstYear: state.result.snapshots[0].year,
              lastObservedPriceYear: model.OBSERVED_PRICE_END_YEAR,
              observedPriceYears: state.result.priceSeries.length,
              retainedHistoricalSites: state.result.historicalSites.length,
            },
          },
          {
            obligationId: `${PLUGIN_ID}:construction:${state.result.scenarioId}`,
            status: terminal && conservation.categoryConserved && conservation.unitsConserved
              ? 'settled'
              : 'unmet',
            evidence: conservation,
          },
          {
            obligationId: `${PLUGIN_ID}:forecast:${state.result.scenarioId}`,
            status: terminal && intervalOrder && refusalPreserved ? 'settled' : 'unmet',
            evidence: {
              ensembleSize: 31,
              terminalYear: terminalSnapshot.year,
              intervalOrder,
              refusalPreserved,
              priceStatus: state.result.forecasts.intervention.priceStatus,
              developmentStatus: state.result.forecasts.intervention.developmentStatus,
              backtest: state.result.backtest,
            },
          },
          {
            obligationId: `${PLUGIN_ID}:truth:${state.result.scenarioId}`,
            status: truthBoundary ? 'settled' : 'unmet',
            evidence: {
              regionIndexOrigin: datasets.index.truth.origin,
              regionShardOrigin: datasets.shard.truth.origin,
              modelOrigin: datasets.governance.truth.origin,
              claimBoundary: state.result.claimBoundary,
            },
          },
        ],
        stateIdentity: `${state.result.scenarioIdentity}:step-${state.playback.cursor}:${state.playback.status}`,
        losses: terminal ? [] : [{
          kind: 'playback_incomplete',
          currentStep: state.playback.cursor,
          totalSteps: state.result.snapshots.length - 1,
        }],
        truth: truth(
          'derived',
          'forecast',
          distribution('Settlement proves deterministic scenario execution and declared invariants, not forecast correctness.')
        ),
      };
    }

    function view() {
      const state = sdk.state.read();
      const snapshot = currentSnapshot(state);
      return [{
        slot: 'inspector',
        title: 'NYC Development Atlas',
        rows: [
          { label: 'Neighborhood', value: `${state.result.region.label}, ${state.result.region.boroughLabel}` },
          { label: 'Year', value: `${snapshot.year} · ${snapshot.phase.replaceAll('-', ' ')}` },
          { label: 'Playback', value: `${state.playback.cursor} of ${state.result.snapshots.length - 1} · ${state.playback.status}` },
          { label: 'What changed', value: snapshot.narrative },
          { label: 'Property class', value: state.acceptedParameters.sectorId.replaceAll('-', ' ') },
          { label: 'Policy', value: state.acceptedParameters.policyId.replaceAll('-', ' ') },
          { label: 'Median price', value: snapshot.price.p50Usd === null ? 'Not observed' : formatUsd(snapshot.price.p50Usd) },
          { label: 'Price interval', value: snapshot.price.status === 'scenario-forecast' ? `${formatUsd(snapshot.price.p10Usd)} to ${formatUsd(snapshot.price.p90Usd)}` : snapshot.price.status.replaceAll('-', ' ') },
          { label: 'Recorded filings', value: snapshot.metrics.filingCount.toLocaleString() },
          { label: 'Scenario pipeline', value: `${snapshot.metrics.activeProjects} active · ${snapshot.metrics.completedProjects} complete` },
          {
            label: state.result.sectorProfile.capacityUnit === 'square feet'
              ? 'Scenario floor area'
              : 'Scenario units',
            value: state.result.sectorProfile.capacityUnit === 'square feet'
              ? `${snapshot.metrics.cumulativeCompletedFloorAreaSquareFeet.toLocaleString()} square feet complete`
              : `${snapshot.metrics.cumulativeCompletedUnits.toLocaleString()} complete${state.result.sectorProfile.allowsAffordableUnits ? ` · ${snapshot.metrics.cumulativeAffordableUnits.toLocaleString()} affordable` : ''}`,
          },
          { label: 'Price coverage', value: state.result.forecasts.intervention.priceStatus.replaceAll('-', ' ') },
          { label: 'Development coverage', value: state.result.forecasts.intervention.developmentStatus.replaceAll('-', ' ') },
          { label: 'Validation', value: state.result.backtest.status.replaceAll('-', ' ') },
          { label: 'Loaded region data', value: `${Math.round((datasets.shardReceipt.byteCount || 0) / 1024).toLocaleString()} KiB · ${datasets.shardReceipt.cacheMode || 'loaded'}` },
        ],
        fields: [],
        actions: [],
      }];
    }

    function contributeV4() {
      const state = sdk.state.read();
      return v4Api.createContribution({
        datasets,
        dataReceipts: datasets.dataReceipts,
        result: state.result,
        snapshot: currentSnapshot(state),
        comparison: state.comparison?.comparison || null,
      });
    }

    function appendScenarioReceipt(value, parameters) {
      sdk.receipts.append({
        schema: 'simulatte.plugin.nycRealEstateScenarioReceipt.v1',
        scenarioIdentity: value.scenarioIdentity,
        scenarioId: value.scenarioId,
        seed: value.seed,
        acceptedParameters: parameters,
        datasetIdentities: Object.fromEntries(
          datasets.dataReceipts.map((row) => [row.datasetId, row.sha256])
        ),
        backtest: value.backtest,
        terminalMetrics: value.terminalMetrics,
        conservation: value.conservation,
        claimBoundary: value.claimBoundary,
        truth: truth(
          'simulated',
          'forecast',
          distribution('Thirty-one deterministic members conditional on declared controls and source snapshots.')
        ),
      });
    }

    function appendSettlementReceipt(state) {
      sdk.receipts.append({
        schema: 'simulatte.plugin.nycRealEstateSettlementReceipt.v1',
        scenarioIdentity: state.result.scenarioIdentity,
        status: 'settled',
        terminalSnapshotId: currentSnapshot(state).id,
        acceptedParameters: state.acceptedParameters,
        comparison: state.comparison?.comparison?.branchMetrics || null,
        conservation: state.result.conservation,
        backtest: state.result.backtest,
        truth: truth(
          'simulated',
          'forecast',
          distribution('Terminal scenario is reproducible but does not predict a parcel or guarantee a market outcome.')
        ),
      });
    }

    const capabilities = Object.freeze({
      'simulation.nyc-development-atlas.v1': async (input = {}) => {
        const nextScenario = normalizeScenario(input.scenario || input, config);
        const parameters = validateParameters(input.values || input, nextScenario, config, fixedDatasets);
        const capabilityDatasets = await loadRegionData(
          sdk,
          fixedDatasets,
          parameters.regionId
        );
        return model.runScenario({
          index: capabilityDatasets.index,
          shard: capabilityDatasets.shard,
          governance: capabilityDatasets.governance,
          parameters,
        });
      },
    });

    return Object.freeze({
      id: PLUGIN_ID,
      capabilities,
      contributeRequest,
      contributeV4,
      handleAction,
      setScenario,
      settle,
      view,
    });
  }

  function validateParameters(values, selectedScenario, config, datasets) {
    const defaults = {
      ...config,
      ...(SCENARIO_DEFAULTS[selectedScenario.scenarioId] || {}),
    };
    const regionId = textControl(values.regionId, defaults.defaultRegionId || defaults.regionId, 'regionId');
    requireKnown(regionId, new Set(datasets.index.regions.map((row) => row.id)), 'regionId');
    const sectorId = textControl(values.sectorId, defaults.defaultSectorId || defaults.sectorId, 'sectorId');
    requireKnown(sectorId, new Set(model.SECTOR_IDS), 'sectorId');
    const policyId = textControl(values.policyId, defaults.policyId, 'policyId');
    requireKnown(policyId, new Set(datasets.governance.policies.map((row) => row.id)), 'policyId');
    const allowsAffordableUnits = sectorId === 'tax-class-2';
    return deepFreeze({
      id: selectedScenario.scenarioId,
      scenarioId: selectedScenario.scenarioId,
      seed: selectedScenario.seed,
      regionId,
      sectorId,
      historicalStartYear: numberControl(values.historicalStartYear, defaults.historicalStartYear, 2010, 2020, true, 'historicalStartYear'),
      forecastEndYear: numberControl(values.forecastEndYear, defaults.forecastEndYear, 2030, 2040, true, 'forecastEndYear'),
      policyId,
      financingRatePct: numberControl(values.financingRatePct, defaults.financingRatePct, 2, 12, false, 'financingRatePct'),
      annualDemandGrowthPct: numberControl(values.annualDemandGrowthPct, defaults.annualDemandGrowthPct, -3, 6, false, 'annualDemandGrowthPct'),
      constructionCostIndex: numberControl(values.constructionCostIndex, defaults.constructionCostIndex, 75, 175, false, 'constructionCostIndex'),
      zoningCapacityMultiplier: numberControl(values.zoningCapacityMultiplier, defaults.zoningCapacityMultiplier, 0.5, 2, false, 'zoningCapacityMultiplier'),
      affordableHousingSharePct: allowsAffordableUnits
        ? numberControl(values.affordableHousingSharePct, defaults.affordableHousingSharePct, 0, 100, false, 'affordableHousingSharePct')
        : 0,
    });
  }

  function loadFixedDatasets(sdk) {
    const dataReceipts = Object.values(DATASETS).map((datasetId) => {
      const receipt = sdk.datasets.receipt(datasetId);
      if (!receipt?.sha256) throw pluginError('nyc_real_estate_dataset_receipt_missing', datasetId);
      return Object.freeze({ datasetId, sha256: receipt.sha256, schemaId: receipt.schemaId });
    });
    return deepFreeze({
      index: sdk.datasets.require(DATASETS.index),
      governance: sdk.datasets.require(DATASETS.governance),
      dataReceipts,
    });
  }

  async function loadRegionData(sdk, fixedDatasets, regionId) {
    const loaded = await sdk.datasets.loadShard(DATASETS.index, regionId);
    const shard = validateRegionShard(loaded.value);
    if (shard.region.id !== regionId || loaded.receipt.regionId !== regionId) {
      throw pluginError(
        'nyc_real_estate_region_shard_mismatch',
        `${regionId} resolved to ${shard.region.id}`
      );
    }
    const shardReceipt = Object.freeze({
      ...loaded.receipt,
      datasetId: shard.id,
      schemaId: shard.schema,
    });
    return deepFreeze({
      ...fixedDatasets,
      shard,
      shardReceipt,
      dataReceipts: [...fixedDatasets.dataReceipts, shardReceipt],
    });
  }

  function normalizeScenario(value, config) {
    if (typeof value === 'string') return deepFreeze({ id: value, scenarioId: value, seed: value });
    const scenarioId = value?.scenarioId || value?.id || config.defaultScenarioId;
    return deepFreeze({
      ...value,
      id: scenarioId,
      scenarioId,
      seed: value?.seed || scenarioId,
    });
  }

  function initialState(result, acceptedParameters) {
    return {
      result,
      acceptedParameters,
      playback: { status: 'ready', cursor: 0 },
      comparison: null,
    };
  }

  function reduce(state, event) {
    if (event.kind === `${PLUGIN_ID}.scenario-computed`) {
      return {
        result: event.result,
        acceptedParameters: event.acceptedParameters,
        playback: { status: 'ready', cursor: 0 },
        comparison: null,
      };
    }
    if (event.kind === `${PLUGIN_ID}.playback-started`) {
      return { ...state, playback: { status: 'running', cursor: 0 } };
    }
    if (event.kind === `${PLUGIN_ID}.playback-advanced`) {
      const finalCursor = state.result.snapshots.length - 1;
      return {
        ...state,
        playback: {
          status: event.cursor === finalCursor ? 'settled' : 'running',
          cursor: event.cursor,
        },
      };
    }
    if (event.kind === `${PLUGIN_ID}.comparison-computed`) {
      return {
        ...state,
        comparison: {
          comparisonId: event.comparisonId,
          comparison: event.comparison,
        },
      };
    }
    return state;
  }

  function playbackResult(state) {
    const snapshot = currentSnapshot(state);
    return deepFreeze({
      status: state.playback.status === 'settled' ? 'settled' : 'running',
      currentStep: state.playback.cursor,
      totalSteps: state.result.snapshots.length - 1,
      simulationTimeMs: snapshot.simulationTimeMs,
      calendarYear: snapshot.year,
      scenarioIdentity: state.result.scenarioIdentity,
      acceptedParameters: state.acceptedParameters,
      metrics: snapshot.metrics,
    });
  }

  function currentSnapshot(state) {
    return state.result.snapshots[state.playback.cursor];
  }

  function scenarioSummary(result) {
    return deepFreeze({
      scenarioId: result.scenarioId,
      scenarioIdentity: result.scenarioIdentity,
      regionId: result.region.id,
      eventCount: result.events.length,
      totalSteps: result.snapshots.length - 1,
    });
  }

  function validateRegionIndex(value) {
    if (value?.schema !== 'simulatte.nycRealEstateRegionIndex.v1'
      || !Array.isArray(value.regions) || value.regions.length !== 262
      || !Array.isArray(value.shards) || value.shards.length !== value.regions.length
      || value.shards.some((row) => !row.regionId || !row.sha256 || !row.byteCount)) {
      throw pluginError('nyc_real_estate_region_index_invalid', 'NYC region index is incomplete');
    }
    return value;
  }

  function validateRegionShard(value) {
    if (value?.schema !== 'simulatte.nycRealEstateRegionShard.v1'
      || !value.region?.id
      || !Array.isArray(value.region.polygon) || value.region.polygon.length < 4
      || !Array.isArray(value.saleSeries)
      || !Array.isArray(value.developmentSeries)
      || !Array.isArray(value.developmentSites)
      || !Array.isArray(value.capacitySites)
      || value.capacitySites.some((row) => (
        !Array.isArray(row.coordinates) || row.coordinates.length !== 2
      ))) {
      throw pluginError('nyc_real_estate_region_shard_invalid', 'NYC region shard is incomplete');
    }
    return value;
  }

  function validateGovernance(value) {
    if (value?.schema !== 'simulatte.nycRealEstateModelGovernance.v1'
      || !Array.isArray(value.policies) || value.policies.length < 4
      || value.priceModel?.ensembleSize !== 31
      || !value.gates || !value.claimBoundary) {
      throw pluginError('nyc_real_estate_governance_invalid', 'Model governance is incomplete');
    }
    return value;
  }

  const datasetValidators = Object.freeze({
    'simulatte.nycRealEstateRegionIndex.v1': validateRegionIndex,
    'simulatte.nycRealEstateModelGovernance.v1': validateGovernance,
  });

  function textControl(value, fallback, label) {
    const selected = value === undefined || value === null || value === '' ? fallback : value;
    if (typeof selected !== 'string' || !selected) {
      throw pluginError('nyc_real_estate_control_invalid', `${label} must be non-empty text`);
    }
    return selected;
  }

  function numberControl(value, fallback, minimum, maximum, integer, label) {
    const selected = value === undefined || value === null || value === '' ? fallback : Number(value);
    if (!Number.isFinite(selected) || selected < minimum || selected > maximum
      || (integer && !Number.isInteger(selected))) {
      throw pluginError(
        'nyc_real_estate_control_invalid',
        `${label} must be ${integer ? 'an integer' : 'a number'} from ${minimum} to ${maximum}`
      );
    }
    return selected;
  }

  function requireKnown(value, allowed, label) {
    if (!allowed.has(value)) {
      throw pluginError('nyc_real_estate_control_invalid', `${label} contains unknown value ${value}`);
    }
  }

  function requireDependencies() {
    if (!model?.runScenario || !v4Api?.createContribution || !comparisonApi?.runComparison) {
      throw pluginError('nyc_real_estate_dependency_missing', 'NYC Development Atlas runtime modules are incomplete');
    }
  }

  function truth(origin, temporalStatus, uncertainty) {
    return deepFreeze({ origin, temporalStatus, uncertainty });
  }

  function distribution(interpretation) {
    return { kind: 'distribution', value: { interpretation } };
  }

  function formatUsd(value) {
    return `$${Math.round(value || 0).toLocaleString()}`;
  }

  function pluginError(code, message) {
    const error = new Error(`${code}: ${message}`);
    error.name = 'SimulatteNycRealEstatePluginError';
    error.code = code;
    return error;
  }

  function deepFreeze(value, seen = new Set()) {
    if (!value || typeof value !== 'object' || seen.has(value) || Object.isFrozen(value)) return value;
    seen.add(value);
    Object.values(value).forEach((row) => deepFreeze(row, seen));
    return Object.freeze(value);
  }

  return Object.freeze({
    DATASETS,
    SCENARIO_DEFAULTS,
    activate,
    datasetValidators,
    validateGovernance,
    validateRegionIndex,
    validateRegionShard,
  });
});
