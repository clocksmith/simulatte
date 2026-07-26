(function attachAsteroidPlugin(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulattePluginAsteroidDefense = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createAsteroidPlugin(root) {
  const PLUGIN_ID = 'asteroid-defense';
  const DATASETS = Object.freeze({
    campaigns: 'asteroid-synthetic-observation-campaigns-v1',
    stations: 'asteroid-observer-stations-v1',
    forceModels: 'asteroid-force-models-v1',
    interventions: 'asteroid-intervention-archetypes-v1',
    execution: 'asteroid-execution-uncertainty-models-v1',
    policies: 'asteroid-decision-policies-v1',
    benchmarks: 'asteroid-historical-benchmark-cases-v1',
    jpl: 'asteroid-jpl-reference-snapshots-v1',
    governance: 'asteroid-model-governance-v1',
    provenance: 'asteroid-provenance-registry-v1',
  });

  function dep(globalName, path) {
    return typeof module === 'object' && module.exports ? require(path) : root[globalName];
  }

  async function activate({ sdk, config, scenario }) {
    const model = dep('SimulatteAsteroidModel', './asteroid-model.js');
    const presentationApi = dep('SimulatteAsteroidPresentation', './presentation.js');
    const v4Api = dep('SimulatteAsteroidV4', './v4-contribution.js');
    const comparisonApi = dep('SimulatteAsteroidComparison', './comparison-driver.js');
    if (!model?.runScenario || !presentationApi?.createSemanticPresentation
      || !v4Api?.createContribution || !comparisonApi?.runComparison) {
      throw pluginError('asteroid_plugin_dependency_missing', 'Asteroid runtime modules are incomplete');
    }
    const datasets = loadDatasets(sdk);
    let selectedScenario = normalizeScenario(scenario, config);
    let acceptedParameters = validateParameters({}, selectedScenario, config, datasets);
    let result = run(acceptedParameters);
    let comparison = null;
    sdk.state.register(reduce, initialState(result, acceptedParameters));
    appendScenarioReceipt(result);

    function run(parameters) {
      return model.runScenario({ datasets, config, scenario: parameters });
    }

    function setScenario(nextScenario) {
      selectedScenario = normalizeScenario(nextScenario, config);
      acceptedParameters = validateParameters({}, selectedScenario, config, datasets);
      result = run(acceptedParameters);
      comparison = null;
      sdk.events.propose({ pluginId: PLUGIN_ID, kind: `${PLUGIN_ID}.scenario-computed`, result, acceptedParameters });
      appendScenarioReceipt(result);
      return summary(result, acceptedParameters);
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
        acceptedParameters = validateParameters(context.values || {}, selectedScenario, config, datasets);
        result = run(acceptedParameters);
        comparison = null;
        sdk.events.propose({ pluginId: PLUGIN_ID, kind: `${PLUGIN_ID}.scenario-computed`, result, acceptedParameters });
        sdk.events.propose({ pluginId: PLUGIN_ID, kind: `${PLUGIN_ID}.playback-started` });
        appendScenarioReceipt(result);
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
      comparison = await comparisonApi.runComparison({
        datasets,
        config,
        scenario: state.acceptedParameters,
      });
      sdk.events.propose({ pluginId: PLUGIN_ID, kind: `${PLUGIN_ID}.comparison-computed`, comparison });
      sdk.receipts.append(comparison.comparisonExecutionReceipt);
      sdk.receipts.append({
        schema: 'simulatte.plugin.asteroidComparisonReceipt.v1',
        comparisonId: comparison.comparisonId,
        branchMetrics: comparison.branchMetrics,
        settlement: comparison.settlement,
        truth: truth('simulated', 'distribution', 'Synthetic common-truth comparison; not an operational risk estimate.'),
      });
      return {
        status: 'settled',
        comparisonId: comparison.comparisonId,
        comparisonBranches: comparison.branchMetrics,
        comparisonExecutionReceipt: comparison.comparisonExecutionReceipt,
      };
    }

    function contributeRequest({ sourceText, mission = null }) {
      if (!/\b(?:asteroid defense|planetary defense|orbit uncertainty|kinetic impactor|close approach)\b/i.test(sourceText || '')) return null;
      if (!mission) return { recognized: true, obligations: [], unresolved: [] };
      return {
        recognized: true,
        obligations: [
          { id: obligation('fit'), kind: 'orbit_fit_receipt', required: true },
          { id: obligation('covariance'), kind: 'covariance_validity', required: true },
          { id: obligation('blindness'), kind: 'hidden_truth_isolation', required: true },
          { id: obligation('claim'), kind: 'simulation_claim_boundary', required: true },
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
            obligationId: obligation('fit'),
            status: state.result.fitReceipt.converged ? 'settled' : 'unmet',
            evidence: {
              terminationReason: state.result.fitReceipt.terminationReason,
              residualRmsRad: state.result.fitReceipt.residualRmsRad,
            },
          },
          {
            obligationId: obligation('covariance'),
            status: state.result.fitReceipt.covarianceReceipt.positiveSemidefinite ? 'settled' : 'unmet',
            evidence: state.result.fitReceipt.covarianceReceipt,
          },
          {
            obligationId: obligation('blindness'),
            status: state.result.hiddenEvaluation.policyAccessible === false ? 'settled' : 'unmet',
            evidence: {
              hiddenTruthId: state.result.hiddenEvaluation.hiddenTruthId,
              hiddenTruthHash: state.result.hiddenEvaluation.hiddenTruthHash,
              policyAccessible: false,
            },
          },
          {
            obligationId: obligation('claim'),
            status: terminal && !state.result.settlement.probabilityClaimAllowed ? 'settled' : 'unmet',
            evidence: { claimBoundary: state.result.settlement.claimBoundary },
          },
        ],
        stateIdentity: `${state.result.scenarioIdentity}:${state.playback.cursor}:${state.playback.status}`,
        losses: terminal ? [] : [{ kind: 'playback_incomplete' }],
        truth: truth('derived', 'missing', 'Settlement validates the declared synthetic experiment only.'),
      };
    }

    function semanticPresentation() {
      const state = sdk.state.read();
      return presentationApi.createSemanticPresentation({
        result: state.result,
        snapshot: currentSnapshot(state),
        forceModel: datasets.forceModels.models[0],
      });
    }

    function present() { return presentationApi.adaptToV3(semanticPresentation()); }
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
      return [{
        slot: 'inspector',
        title: 'Asteroid defense experiment',
        rows: [
          { label: 'Synthetic campaign', value: state.acceptedParameters.observationCampaignId.replaceAll('-', ' ') },
          { label: 'Playback', value: `${state.playback.cursor} of ${state.result.snapshots.length - 1} · ${state.playback.status}` },
          { label: 'Observations', value: `${state.result.metrics.observationCount}` },
          { label: 'Fit residual', value: `${state.result.metrics.fitResidualRmsArcsec.toFixed(2)} arcsec` },
          { label: 'Baseline encounter screen', value: `${(state.result.metrics.baselineModeledScreeningFraction * 100).toFixed(1)}% of synthetic clones` },
          { label: 'Intervention encounter screen', value: `${(state.result.metrics.interventionModeledScreeningFraction * 100).toFixed(1)}% of synthetic clones` },
          { label: 'Applied policy', value: state.result.appliedInterventionId.replaceAll('-', ' ') },
        ],
        actions: [],
      }, {
        slot: 'hud',
        title: 'Scientific boundary',
        rows: [
          { label: 'Scenario', value: 'Observations, hidden orbit, follow-up budget, execution draws' },
          { label: 'Modeled', value: 'Two-body force model, orbit fit, covariance, interventions' },
          { label: 'Observed benchmark', value: 'Pinned JPL API identity and Apophis 2029 close-approach row only' },
          { label: 'Not claimed', value: 'Impact probability, current danger, Sentry reproduction, launch guidance' },
        ],
        actions: [],
      }];
    }

    function appendScenarioReceipt(runResult) {
      sdk.receipts.append({
        schema: 'simulatte.plugin.asteroidScenarioReceipt.v1',
        scenarioIdentity: runResult.scenarioIdentity,
        configurationIdentity: runResult.configurationIdentity,
        fit: {
          terminationReason: runResult.fitReceipt.terminationReason,
          residualRmsRad: runResult.fitReceipt.residualRmsRad,
          covariance: runResult.fitReceipt.covarianceReceipt,
        },
        ensemble: {
          covarianceIdentity: runResult.ensembleReceipt.covarianceIdentity,
          size: runResult.ensembleReceipt.ensembleSize,
          rejected: runResult.ensembleReceipt.rejected.length,
        },
        claimBoundary: runResult.claimBoundary,
        truth: truth('derived', 'distribution', 'Synthetic observations plus declared models.'),
      });
    }

    function appendSettlement(state) {
      sdk.receipts.append({
        ...state.result.settlement,
        schema: 'simulatte.plugin.asteroidSettlementReceipt.v1',
        scenarioIdentity: state.result.scenarioIdentity,
      });
    }

    function obligation(id) { return `${PLUGIN_ID}:${id}:${sdk.state.read().result.scenarioId}`; }

    return Object.freeze({
      id: PLUGIN_ID,
      capabilities: {
        'simulation.asteroid-defense.v1': (input = {}) => {
          const next = normalizeScenario(input.scenario || input, config);
          const parameters = validateParameters(input.values || input, next, config, datasets);
          return model.runScenario({ datasets, config, scenario: parameters });
        },
        'propagation.n-body.v1': (input) => dep('SimulatteNBodyPropagation', '../../core/simulation/n-body-propagation.js').propagate(input),
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
    const observationCampaignId = choose(values.observationCampaignId,
      selected.observationCampaignId || config.observationCampaignId,
      datasets.campaigns.campaigns.map((row) => row.id), 'observationCampaignId');
    const campaign = datasets.campaigns.campaigns.find((row) => row.id === observationCampaignId);
    return deepFreeze({
      id: observationCampaignId,
      scenarioId: observationCampaignId,
      seed: selected.seed || observationCampaignId,
      observationCampaignId,
      forceModelId: config.forceModelId,
      followUpPolicyId: choose(values.followUpPolicyId, selected.followUpPolicyId || config.followUpPolicyId,
        ['fixed-cadence', 'information-gain'], 'followUpPolicyId'),
      decisionPolicyId: choose(values.decisionPolicyId, selected.decisionPolicyId || config.decisionPolicyId,
        ['act-at-threshold', 'observe-then-decide'], 'decisionPolicyId'),
      interventionArchetypeId: choose(values.interventionArchetypeId,
        selected.interventionArchetypeId || config.interventionArchetypeId,
        datasets.interventions.archetypes.map((row) => row.id), 'interventionArchetypeId'),
      executionUncertaintyModelId: config.executionUncertaintyModelId,
      ensembleSize: number(values.ensembleSize, selected.ensembleSize ?? config.ensembleSize, 4, 64, true, 'ensembleSize'),
      observationBudget: number(values.observationBudget, selected.observationBudget ?? config.observationBudget,
        4, campaign.observations.length, true, 'observationBudget'),
      decisionThreshold: number(values.decisionThreshold, selected.decisionThreshold ?? config.decisionThreshold,
        0, 1, false, 'decisionThreshold'),
    });
  }

  function loadDatasets(sdk) {
    const dataReceipts = Object.values(DATASETS).map((datasetId) => {
      const receipt = sdk.datasets.receipt(datasetId);
      if (!receipt?.sha256) throw pluginError('asteroid_dataset_receipt_missing', datasetId);
      return Object.freeze({ datasetId, sha256: receipt.sha256, schemaId: receipt.schemaId });
    });
    return Object.freeze({
      ...Object.fromEntries(Object.entries(DATASETS).map(([key, id]) => [key, sdk.datasets.require(id)])),
      dataReceipts,
    });
  }

  function normalizeScenario(value, config) {
    if (typeof value === 'string') return { id: value, scenarioId: value, observationCampaignId: value, seed: value };
    const id = value?.observationCampaignId || value?.scenarioId || value?.id || config.observationCampaignId;
    return deepFreeze({ ...value, id, scenarioId: id, observationCampaignId: id, seed: value?.seed || id });
  }
  function reduce(state, event) {
    if (event.kind === `${PLUGIN_ID}.scenario-computed`) return initialState(event.result, event.acceptedParameters);
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
  function initialState(result, acceptedParameters) {
    return { result, acceptedParameters, playback: { status: 'ready', cursor: 0 }, comparison: null };
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
        mode: snapshot.status.includes('propagated') ? 'follow' : snapshot.status === 'settled' ? 'compare' : 'overview',
        targetIds: snapshot.status.includes('propagated') ? ['asteroid-encounter:orbit-clone-001'] : ['asteroid-representative-trajectory'],
        transitionReason: snapshot.eventIds.at(-1) ? `simulation_event:${snapshot.eventIds.at(-1)}` : 'scenario_ready',
        priority: 70,
        expiresAtEventId: null,
        mayInterruptManualOverride: false,
      }],
    };
  }
  function currentSnapshot(state) { return state.result.snapshots[state.playback.cursor]; }
  function summary(result, parameters) {
    return { scenarioId: result.scenarioId, scenarioIdentity: result.scenarioIdentity, acceptedParameters: parameters, totalSteps: result.snapshots.length - 1 };
  }
  function choose(value, fallback, allowed, label) {
    const selected = value === undefined || value === '' ? fallback : value;
    if (!allowed.includes(selected)) throw pluginError('asteroid_control_invalid', `${label}:${selected}`);
    return selected;
  }
  function number(value, fallback, minimum, maximum, integer, label) {
    const selected = value === undefined || value === '' ? fallback : Number(value);
    if (!Number.isFinite(selected) || selected < minimum || selected > maximum || (integer && !Number.isInteger(selected))) {
      throw pluginError('asteroid_control_invalid', `${label} must be ${minimum}..${maximum}`);
    }
    return selected;
  }
  function truth(origin, kind, interpretation) {
    return { origin, temporalStatus: 'forecast', uncertainty: { kind, value: { interpretation } } };
  }
  function pluginError(code, message) {
    const error = new Error(`${code}: ${message}`);
    error.name = 'SimulatteAsteroidPluginError';
    error.code = code;
    return error;
  }
  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
  }

  const datasetValidators = Object.freeze({
    'simulatte.asteroidSyntheticCampaigns.v1': (value) => rows(value, 'campaigns', 5),
    'simulatte.asteroidObserverStations.v1': (value) => rows(value, 'stations', 2),
    'simulatte.asteroidForceModels.v1': (value) => rows(value, 'models', 1),
    'simulatte.asteroidInterventionArchetypes.v1': (value) => rows(value, 'archetypes', 4),
    'simulatte.asteroidExecutionUncertainty.v1': (value) => rows(value, 'models', 1),
    'simulatte.asteroidDecisionPolicies.v1': (value) => rows(value, 'policies', 4),
    'simulatte.asteroidHistoricalBenchmarks.v1': (value) => rows(value, 'cases', 1),
    'simulatte.asteroidJplReferenceSnapshots.v1': (value) => rows(value, 'responses', 2),
    'simulatte.asteroidModelGovernance.v1': (value) => rows(value, 'algorithms', 4),
    'simulatte.asteroidProvenanceRegistry.v1': (value) => rows(value, 'records', 8),
  });
  function rows(value, key, minimum) {
    if (!Array.isArray(value?.[key]) || value[key].length < minimum) throw pluginError('asteroid_dataset_invalid', `${value?.id || key}:${key}`);
    return value;
  }
  return Object.freeze({ activate, datasetValidators });
});
