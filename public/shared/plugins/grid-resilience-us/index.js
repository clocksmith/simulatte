(function attachGridPlugin(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulattePluginGridResilienceUs = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createGridPlugin(root) {
  const PLUGIN_ID = 'grid-resilience-us';
  const DATASETS = Object.freeze({
    eiaDemand: 'grid-eia-balancing-authority-hourly-v1',
    eiaGeneration: 'grid-eia-generation-mix-hourly-v1',
    noaaStations: 'grid-noaa-weather-stations-v1',
    noaaWeather: 'grid-noaa-weather-observations-v1',
    topology: 'grid-regional-interface-scenarios-v1',
    resources: 'grid-resource-archetypes-v1',
    storage: 'grid-storage-archetypes-v1',
    disturbances: 'grid-disturbance-scenarios-v1',
    restoration: 'grid-restoration-resources-v1',
    governance: 'grid-model-governance-v1',
    provenance: 'grid-provenance-registry-v1',
  });

  function dep(globalName, path) {
    return typeof module === 'object' && module.exports ? require(path) : root[globalName];
  }

  async function activate({ sdk, config, scenario }) {
    const model = dep('SimulatteGridDispatchModel', './dispatch-model.js');
    const presentationApi = dep('SimulatteGridPresentation', './presentation.js');
    const v4Api = dep('SimulatteGridV4', './v4-contribution.js');
    const comparisonApi = dep('SimulatteGridComparison', './comparison-driver.js');
    if (!model?.runScenario || !presentationApi?.createSemanticPresentation
      || !v4Api?.createContribution || !comparisonApi?.runComparison) {
      throw pluginError('grid_plugin_dependency_missing', 'Grid runtime modules are incomplete');
    }
    const datasets = loadDatasets(sdk);
    let selectedScenario = normalizeScenario(scenario, config);
    let acceptedParameters = validateParameters({}, selectedScenario, config, datasets);
    let result = run(acceptedParameters);
    let ensemble = model.runEnsemble({ datasets, config, scenario: acceptedParameters });
    let comparison = null;
    let comparisonCache = null;
    sdk.state.register(reduce, initialState(result, ensemble, acceptedParameters));
    appendRunReceipts(result, ensemble);

    function run(parameters) {
      return model.runScenario({ datasets, config, scenario: parameters });
    }

    function setScenario(nextScenario) {
      selectedScenario = normalizeScenario(nextScenario, config);
      const nextParameters = validateParameters({}, selectedScenario, config, datasets);
      const preparation = prepareScenario(nextParameters);
      comparison = null;
      sdk.events.propose({
        pluginId: PLUGIN_ID,
        kind: `${PLUGIN_ID}.scenario-computed`,
        result,
        ensemble,
        acceptedParameters,
        preparation,
      });
      appendRunReceipts(result, ensemble);
      return summary(result, acceptedParameters);
    }

    function prepareScenario(nextParameters) {
      const preparation = sameExecutionParameters(acceptedParameters, nextParameters) ? 'reused' : 'computed';
      acceptedParameters = nextParameters;
      if (preparation === 'computed') {
        result = run(acceptedParameters);
        ensemble = model.runEnsemble({ datasets, config, scenario: acceptedParameters });
      }
      return preparation;
    }

    function handleAction(actionId, context = {}) {
      if (actionId === 'scenario.run') return playback(context);
      if (actionId === 'counterfactual.compare') return compare();
      return { status: 'refused', reason: 'unknown_action', actionId };
    }

    function playback(context) {
      const phase = context.values?.phase;
      if (phase === 'start') {
        selectedScenario = normalizeScenario(context.scenario || selectedScenario, config);
        const nextParameters = validateParameters(context.values || {}, selectedScenario, config, datasets);
        const preparation = prepareScenario(nextParameters);
        comparison = null;
        sdk.events.propose({
          pluginId: PLUGIN_ID,
          kind: `${PLUGIN_ID}.scenario-computed`,
          result,
          ensemble,
          acceptedParameters,
          preparation,
        });
        sdk.events.propose({ pluginId: PLUGIN_ID, kind: `${PLUGIN_ID}.playback-started`, acceptedParameters });
        appendRunReceipts(result, ensemble);
        return playbackResult(sdk.state.read());
      }
      if (phase === 'step') {
        const state = sdk.state.read();
        if (state.playback.status !== 'running') {
          return state.playback.status === 'settled'
            ? playbackResult(state)
            : { status: 'refused', reason: 'playback_not_running' };
        }
        const cursor = Math.min(state.result.snapshots.length - 1, state.playback.cursor + 1);
        sdk.events.propose({ pluginId: PLUGIN_ID, kind: `${PLUGIN_ID}.playback-advanced`, cursor });
        const next = sdk.state.read();
        if (next.playback.status === 'settled') appendSettlement(next);
        return playbackResult(next);
      }
      return { status: 'refused', reason: 'scenario_phase_invalid', phase };
    }

    async function compare() {
      const state = sdk.state.read();
      const parameterIdentity = executionParameterIdentity(state.acceptedParameters);
      const preparation = comparisonCache?.parameterIdentity === parameterIdentity ? 'reused' : 'computed';
      comparison = preparation === 'reused'
        ? comparisonCache.comparison
        : await comparisonApi.runComparison({
          datasets,
          config,
          scenario: state.acceptedParameters,
        });
      comparisonCache = { parameterIdentity, comparison };
      sdk.events.propose({
        pluginId: PLUGIN_ID,
        kind: `${PLUGIN_ID}.comparison-computed`,
        comparison,
        preparation,
      });
      sdk.receipts.append(comparison.comparisonExecutionReceipt);
      sdk.receipts.append({
        schema: 'simulatte.plugin.gridComparisonReceipt.v1',
        comparisonId: comparison.comparisonId,
        branchMetrics: comparison.branchMetrics,
        settlement: comparison.settlement,
        truth: truth('simulated', 'forecast', 'distribution', 'Shared declared scenario; not an operating forecast.'),
      });
      return {
        status: 'settled',
        comparisonId: comparison.comparisonId,
        comparisonBranches: comparison.branchMetrics,
        comparisonExecutionReceipt: comparison.comparisonExecutionReceipt,
        comparisonPreparation: preparation,
      };
    }

    function contributeRequest({ sourceText, mission = null }) {
      if (!/\b(?:grid resilience|electric grid|dispatch|reserve margin|load shedding|generator outage)\b/i.test(sourceText || '')) return null;
      if (!mission) return { recognized: true, obligations: [], unresolved: [] };
      return {
        recognized: true,
        obligations: [
          { id: obligation('balance'), kind: 'energy_balance', required: true },
          { id: obligation('truth'), kind: 'truth_boundary', required: true },
          { id: obligation('settlement'), kind: 'terminal_settlement', required: true },
        ],
        unresolved: [],
      };
    }

    function settle() {
      const state = sdk.state.read();
      const terminal = state.playback.status === 'settled'
        && state.playback.cursor === state.result.snapshots.length - 1;
      return {
        obligationResults: [
          {
            obligationId: obligation('balance'),
            status: state.result.settlement.valid ? 'settled' : 'unmet',
            evidence: { maximumBalanceResidualMw: state.result.settlement.maximumBalanceResidualMw },
          },
          {
            obligationId: obligation('truth'),
            status: /not AC power flow/.test(state.result.claimBoundary) ? 'settled' : 'unmet',
            evidence: { claimBoundary: state.result.claimBoundary },
          },
          {
            obligationId: obligation('settlement'),
            status: terminal ? 'settled' : 'unmet',
            evidence: { currentStep: state.playback.cursor, totalSteps: state.result.snapshots.length - 1 },
          },
        ],
        stateIdentity: `${state.result.scenarioIdentity}:${state.playback.cursor}:${state.playback.status}`,
        losses: terminal ? [] : [{ kind: 'playback_incomplete' }],
        truth: truth('derived', 'forecast', 'missing', 'Exact validation for declared aggregate inputs only.'),
      };
    }

    function semanticPresentation() {
      const state = sdk.state.read();
      return presentationApi.createSemanticPresentation({
        datasets,
        result: state.result,
        snapshot: currentSnapshot(state),
      });
    }

    function present() {
      return presentationApi.adaptToV3(semanticPresentation());
    }

    function contributeV4() {
      const state = sdk.state.read();
      return v4Api.createContribution({
        datasets,
        config,
        result: state.result,
        snapshot: currentSnapshot(state),
        comparison: state.comparison,
      });
    }

    function view() {
      const state = sdk.state.read();
      const snapshot = currentSnapshot(state);
      const totals = gridTotals(snapshot);
      const constrained = [...snapshot.regions]
        .sort((left, right) => right.unservedMw - left.unservedMw
          || left.reserveMarginRatio - right.reserveMarginRatio)[0];
      const latestEvent = state.result.events.find((row) => row.id === snapshot.eventIds.at(-1));
      return [{
        slot: 'inspector',
        title: 'Grid resilience experiment',
        rows: [
          { label: 'Disturbance', value: state.acceptedParameters.disturbanceScenarioId.replaceAll('-', ' ') },
          { label: 'Playback', value: `${state.playback.cursor} of ${state.result.snapshots.length - 1} · ${state.playback.status}` },
          { label: 'Operating hour', value: snapshot.hour < 0 ? 'Ready' : `${snapshot.period} · hour ${snapshot.hour + 1}` },
          { label: 'Current event', value: latestEvent?.kind.replaceAll('.', ' ') || 'Dispatch inputs prepared' },
          { label: 'Demand / served', value: `${Math.round(totals.demandMw).toLocaleString()} / ${Math.round(totals.servedMw).toLocaleString()} MW` },
          { label: 'Generation / imports', value: `${Math.round(totals.generationMw).toLocaleString()} / ${Math.round(totals.importsMw).toLocaleString()} MW` },
          { label: 'Storage / response', value: `${Math.round(totals.storageDischargeMw).toLocaleString()} / ${Math.round(totals.demandResponseMw).toLocaleString()} MW` },
          { label: 'Charging / spill', value: `${Math.round(totals.storageChargeMw).toLocaleString()} / ${Math.round(totals.spilledGenerationMw).toLocaleString()} MW` },
          { label: 'Unserved now', value: `${Math.round(totals.unservedMw).toLocaleString()} MW` },
          {
            label: 'Binding region',
            value: constrained
              ? `${constrained.label}: ${Math.round(constrained.unservedMw)} MW unserved · ${(constrained.reserveMarginRatio * 100).toFixed(1)}% reserve margin`
              : 'None',
          },
          { label: 'Active failures', value: snapshot.activeFailureIds.join(', ') || 'None' },
          ...(state.playback.status === 'settled' ? [
            { label: 'Modeled unserved energy', value: `${Math.round(state.result.metrics.modeledUnservedEnergyMwh).toLocaleString()} MWh` },
            { label: 'Minimum reserve margin', value: `${(state.result.metrics.minimumReserveMarginRatio * 100).toFixed(1)}%` },
            { label: 'Ensemble', value: `${state.acceptedParameters.ensembleSize} declared seeds · scenario variance` },
          ] : []),
        ],
        actions: [],
      }];
    }

    function appendRunReceipts(runResult, ensembleResult) {
      sdk.receipts.append({
        schema: 'simulatte.plugin.gridScenarioReceipt.v1',
        scenarioIdentity: runResult.scenarioIdentity,
        configurationIdentity: runResult.configurationIdentity,
        observedRowIds: runResult.events.flatMap((row) => row.payload.observedRowIds || []),
        claimBoundary: runResult.claimBoundary,
        truth: truth('derived', 'forecast', 'distribution', 'Observed inputs plus modeled and scenario parents.'),
      });
      sdk.receipts.append(ensembleResult);
    }

    function appendSettlement(state) {
      sdk.receipts.append({
        ...state.result.settlement,
        schema: 'simulatte.plugin.gridSettlementReceipt.v1',
        scenarioIdentity: state.result.scenarioIdentity,
      });
    }

    function obligation(kind) {
      return `${PLUGIN_ID}:${kind}:${sdk.state.read().result.scenarioId}`;
    }

    return Object.freeze({
      id: PLUGIN_ID,
      capabilities: {
        'simulation.grid-resilience.v1': (input = {}) => {
          const next = normalizeScenario(input.scenario || input, config);
          const parameters = validateParameters(input.values || input, next, config, datasets);
          return model.runScenario({ datasets, config, scenario: parameters });
        },
      },
      contributeRequest,
      contributeV4,
      handleAction,
      present,
      semanticPresentation,
      setScenario,
      settle,
      view,
    });
  }

  function validateParameters(values, selected, config, datasets) {
    const disturbanceScenarioId = selectValue(values.disturbanceScenarioId, selected.disturbanceScenarioId || config.disturbanceScenarioId,
      datasets.disturbances.scenarios.map((row) => row.id), 'disturbanceScenarioId');
    const dispatchPolicyId = selectValue(values.dispatchPolicyId, selected.dispatchPolicyId || config.dispatchPolicyId,
      ['economic-order', 'resilience-weighted'], 'dispatchPolicyId');
    const reservePolicyId = selectValue(values.reservePolicyId, selected.reservePolicyId || config.reservePolicyId,
      ['fixed-reserve', 'adaptive-reserve'], 'reservePolicyId');
    const storagePolicyId = selectValue(values.storagePolicyId, selected.storagePolicyId || config.storagePolicyId,
      ['immediate-support', 'reserve-preserving'], 'storagePolicyId');
    const restorationPolicyId = selectValue(values.restorationPolicyId, selected.restorationPolicyId || config.restorationPolicyId,
      ['nearest-first', 'dependency-aware', 'service-impact-first'], 'restorationPolicyId');
    const sheddingPriorities = arrayValue(values.sheddingPriorities, selected.sheddingPriorities || config.sheddingPriorities, 'sheddingPriorities');
    const regionIds = new Set(datasets.topology.regions.map((row) => row.id));
    if (sheddingPriorities.some((row) => !regionIds.has(row))) throw pluginError('grid_control_invalid', 'Unknown shedding priority region');
    return deepFreeze({
      id: disturbanceScenarioId,
      scenarioId: disturbanceScenarioId,
      seed: selected.seed || disturbanceScenarioId,
      disturbanceScenarioId,
      dispatchPolicyId,
      reservePolicyId,
      storagePolicyId,
      restorationPolicyId,
      demandResponseMaximumFraction: numberValue(values.demandResponseMaximumFraction,
        selected.demandResponseMaximumFraction ?? config.demandResponseMaximumFraction, 0, 0.2, false, 'demandResponseMaximumFraction'),
      emissionsPriceUsdPerTon: numberValue(values.emissionsPriceUsdPerTon,
        selected.emissionsPriceUsdPerTon ?? config.emissionsPriceUsdPerTon, 0, 250, false, 'emissionsPriceUsdPerTon'),
      sheddingPriorities,
      restorationCrewCount: numberValue(values.restorationCrewCount,
        selected.restorationCrewCount ?? config.restorationCrewCount, 1, datasets.restoration.crews.length, true, 'restorationCrewCount'),
      ensembleSize: numberValue(values.ensembleSize,
        selected.ensembleSize ?? config.ensembleSize, 1, config.ensembleSeeds.length, true, 'ensembleSize'),
    });
  }

  function loadDatasets(sdk) {
    const dataReceipts = Object.values(DATASETS).map((datasetId) => {
      const receipt = sdk.datasets.receipt(datasetId);
      if (!receipt?.sha256) throw pluginError('grid_dataset_receipt_missing', datasetId);
      return Object.freeze({ datasetId, sha256: receipt.sha256, schemaId: receipt.schemaId });
    });
    return Object.freeze({
      ...Object.fromEntries(Object.entries(DATASETS).map(([key, id]) => [key, sdk.datasets.require(id)])),
      dataReceipts,
    });
  }

  function normalizeScenario(value, config) {
    if (typeof value === 'string') return { id: value, scenarioId: value, disturbanceScenarioId: value, seed: value };
    const id = value?.disturbanceScenarioId || value?.scenarioId || value?.id || config.disturbanceScenarioId;
    return deepFreeze({ ...value, id, scenarioId: id, disturbanceScenarioId: id, seed: value?.seed || id });
  }

  function reduce(state, event) {
    if (event.kind === `${PLUGIN_ID}.scenario-computed`) return initialState(event.result, event.ensemble, event.acceptedParameters);
    if (event.kind === `${PLUGIN_ID}.playback-started`) return { ...state, playback: { status: 'running', cursor: 0 } };
    if (event.kind === `${PLUGIN_ID}.playback-advanced`) return {
      ...state,
      playback: {
        status: event.cursor === state.result.snapshots.length - 1 ? 'settled' : 'running',
        cursor: event.cursor,
      },
    };
    if (event.kind === `${PLUGIN_ID}.comparison-computed`) return { ...state, comparison: event.comparison };
    return state;
  }

  function initialState(result, ensemble, acceptedParameters) {
    return { result, ensemble, acceptedParameters, playback: { status: 'ready', cursor: 0 }, comparison: null };
  }

  function sameExecutionParameters(left, right) {
    return executionParameterIdentity(left) === executionParameterIdentity(right);
  }

  function executionParameterIdentity(value) {
    return JSON.stringify(value || null);
  }

  function playbackResult(state) {
    const snapshot = currentSnapshot(state);
    return {
      status: state.playback.status === 'settled' ? 'settled' : 'running',
      currentStep: state.playback.cursor,
      totalSteps: state.result.snapshots.length - 1,
      simulationTimeMs: snapshot.simulationTimeMs,
      scenarioIdentity: state.result.scenarioIdentity,
      acceptedParameters: state.acceptedParameters,
      viewIntents: [{
        schema: 'simulatte.viewIntent.v4',
        mode: state.playback.status === 'settled' ? 'compare' : 'overview',
        targetIds: snapshot.regions.filter((row) => row.unservedMw > 0).map((row) => `grid-region:${row.id}`),
        transitionReason: snapshot.eventIds.at(-1) ? `simulation_event:${snapshot.eventIds.at(-1)}` : 'scenario_ready',
        priority: 60,
        expiresAtEventId: null,
        mayInterruptManualOverride: false,
      }],
    };
  }

  function currentSnapshot(state) { return state.result.snapshots[state.playback.cursor]; }
  function gridTotals(snapshot) {
    return snapshot.regions.reduce((totals, region) => ({
      demandMw: totals.demandMw + (region.grossDemandMw || 0),
      servedMw: totals.servedMw + (region.servedMw || 0),
      generationMw: totals.generationMw + (region.generationMw || 0),
      importsMw: totals.importsMw + Math.max(0, region.importsMw || 0),
      storageDischargeMw: totals.storageDischargeMw + (region.storageDischargeMw || 0),
      storageChargeMw: totals.storageChargeMw + (region.storageChargeMw || 0),
      spilledGenerationMw: totals.spilledGenerationMw + (region.spilledGenerationMw || 0),
      demandResponseMw: totals.demandResponseMw + (region.demandResponseMw || 0),
      unservedMw: totals.unservedMw + (region.unservedMw || 0),
    }), {
      demandMw: 0,
      servedMw: 0,
      generationMw: 0,
      importsMw: 0,
      storageDischargeMw: 0,
      storageChargeMw: 0,
      spilledGenerationMw: 0,
      demandResponseMw: 0,
      unservedMw: 0,
    });
  }
  function summary(result, parameters) {
    return { scenarioId: result.scenarioId, scenarioIdentity: result.scenarioIdentity, acceptedParameters: parameters, totalSteps: result.snapshots.length - 1 };
  }
  function selectValue(value, fallback, allowed, label) {
    const selected = value === undefined || value === '' ? fallback : value;
    if (!allowed.includes(selected)) throw pluginError('grid_control_invalid', `${label}:${selected}`);
    return selected;
  }
  function arrayValue(value, fallback, label) {
    const selected = value === undefined ? fallback : value;
    if (!Array.isArray(selected) || !selected.length || new Set(selected).size !== selected.length) {
      throw pluginError('grid_control_invalid', `${label} must be a non-empty unique array`);
    }
    return [...selected];
  }
  function numberValue(value, fallback, min, max, integer, label) {
    const selected = value === undefined || value === '' ? fallback : Number(value);
    if (!Number.isFinite(selected) || selected < min || selected > max || (integer && !Number.isInteger(selected))) {
      throw pluginError('grid_control_invalid', `${label} must be ${min}..${max}`);
    }
    return selected;
  }
  function truth(origin, temporalStatus, kind, interpretation) {
    return { origin, temporalStatus, uncertainty: { kind, value: { interpretation } } };
  }
  function pluginError(code, message) {
    const error = new Error(`${code}: ${message}`);
    error.name = 'SimulatteGridPluginError';
    error.code = code;
    return error;
  }
  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
  }

  const datasetValidators = Object.freeze({
    'simulatte.gridEiaBalancingAuthorityHourly.v1': (value) => requireRows(value, 'rows', 96),
    'simulatte.gridEiaGenerationMixHourly.v1': (value) => requireRows(value, 'rows', 100),
    'simulatte.gridNoaaWeatherStations.v1': (value) => requireRows(value, 'stations', 4),
    'simulatte.gridNoaaWeatherObservations.v1': (value) => requireRows(value, 'observations', 4),
    'simulatte.gridRegionalInterfaceScenarios.v1': (value) => requireRows(value, 'interfaces', 4),
    'simulatte.gridResourceArchetypes.v1': (value) => requireRows(value, 'blocks', 8),
    'simulatte.gridStorageArchetypes.v1': (value) => requireRows(value, 'storage', 4),
    'simulatte.gridDisturbanceScenarios.v1': (value) => requireRows(value, 'scenarios', 5),
    'simulatte.gridRestorationResources.v1': (value) => requireRows(value, 'tasks', 1),
    'simulatte.gridModelGovernance.v1': (value) => requireRows(value, 'algorithms', 1),
    'simulatte.gridProvenanceRegistry.v1': (value) => requireRows(value, 'records', 8),
  });
  function requireRows(value, key, minimum) {
    if (!Array.isArray(value?.[key]) || value[key].length < minimum) throw pluginError('grid_dataset_invalid', `${value?.id || key}:${key}`);
    return value;
  }

  return Object.freeze({ activate, datasetValidators });
});
