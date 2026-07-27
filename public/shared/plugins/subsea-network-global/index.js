(function attachSubseaNetworkPlugin(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulattePluginSubseaNetworkGlobal = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createSubseaNetworkPlugin(root) {
  const PLUGIN_ID = 'subsea-network-global';
  const DATASETS = Object.freeze({
    fcc: 'subsea-fcc-cable-license-register-2025-v1',
    landings: 'subsea-landing-points-governed-v1',
    topology: 'subsea-cable-corridors-modeled-v1',
    capacities: 'subsea-capacity-scenarios-v1',
    demands: 'subsea-demand-scenarios-v1',
    repairs: 'subsea-repair-resources-v1',
    governance: 'subsea-model-governance-v1',
    provenance: 'subsea-provenance-registry-v1',
  });

  function dep(globalName, path) {
    return typeof module === 'object' && module.exports ? require(path) : root[globalName];
  }

  async function activate({ sdk, config, profile, scenario }) {
    const model = dep('SimulatteSubseaNetworkModel', './network-model.js');
    const presentationApi = dep('SimulatteSubseaPresentation', './presentation.js');
    const v4Api = dep('SimulatteSubseaV4', './v4-contribution.js');
    const comparisonApi = dep('SimulatteSubseaComparison', './comparison-driver.js');
    if (!model?.runScenario || !presentationApi?.createSemanticPresentation
      || !v4Api?.createContribution || !comparisonApi?.runComparison) {
      throw pluginError('subsea_plugin_dependency_missing', 'Subsea runtime modules are incomplete');
    }
    const datasets = loadDatasets(sdk);
    let selectedScenario = normalizeScenario(scenario, config);
    let acceptedParameters = validateParameters({}, selectedScenario, config, datasets);
    let result = run(acceptedParameters);
    let ensemble = model.runEnsemble({ datasets, config, scenario: acceptedParameters });
    let comparison = null;
    sdk.state.register(reduce, initialState(result, ensemble, acceptedParameters));
    appendScenarioReceipts(result, ensemble, acceptedParameters);

    function run(parameters) {
      return model.runScenario({ datasets, config, scenario: parameters });
    }

    function setScenario(nextScenario) {
      selectedScenario = normalizeScenario(nextScenario, config);
      acceptedParameters = validateParameters({}, selectedScenario, config, datasets);
      result = run(acceptedParameters);
      ensemble = model.runEnsemble({ datasets, config, scenario: acceptedParameters });
      comparison = null;
      sdk.events.propose({
        pluginId: PLUGIN_ID,
        kind: `${PLUGIN_ID}.scenario-computed`,
        scenarioId: result.scenarioId,
        acceptedParameters,
        result,
        ensemble,
      });
      appendScenarioReceipts(result, ensemble, acceptedParameters);
      return scenarioSummary(result, acceptedParameters);
    }

    function handleAction(actionId, context = {}) {
      if (actionId === 'scenario.run') return runPlayback(context);
      if (actionId === 'counterfactual.compare') return compareCounterfactual();
      return { status: 'refused', reason: 'unknown_action', actionId };
    }

    function runPlayback(context) {
      const phase = context.values?.phase;
      if (phase === 'start') {
        selectedScenario = normalizeScenario(context.scenario || selectedScenario, config);
        acceptedParameters = validateParameters(context.values || {}, selectedScenario, config, datasets);
        result = run(acceptedParameters);
        ensemble = model.runEnsemble({ datasets, config, scenario: acceptedParameters });
        comparison = null;
        sdk.events.propose({
          pluginId: PLUGIN_ID,
          kind: `${PLUGIN_ID}.scenario-computed`,
          scenarioId: result.scenarioId,
          acceptedParameters,
          result,
          ensemble,
        });
        sdk.events.propose({
          pluginId: PLUGIN_ID,
          kind: `${PLUGIN_ID}.playback-started`,
          acceptedParameters,
        });
        appendScenarioReceipts(result, ensemble, acceptedParameters);
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
        sdk.events.propose({
          pluginId: PLUGIN_ID,
          kind: `${PLUGIN_ID}.playback-advanced`,
          cursor,
          acceptedParameters: state.acceptedParameters,
        });
        const next = sdk.state.read();
        if (next.playback.status === 'settled') appendSettlementReceipt(next);
        return playbackResult(next);
      }
      return { status: 'refused', reason: 'scenario_phase_invalid', phase };
    }

    async function compareCounterfactual() {
      const state = sdk.state.read();
      const comparisonRun = await comparisonApi.runComparison({
        datasets,
        dataReceipts: datasets.dataReceipts,
        config,
        scenario: state.acceptedParameters,
      });
      comparison = comparisonRun;
      sdk.events.propose({
        pluginId: PLUGIN_ID,
        kind: `${PLUGIN_ID}.comparison-computed`,
        comparison: comparisonRun,
      });
      sdk.receipts.append(comparisonRun.comparisonExecutionReceipt);
      sdk.receipts.append({
        schema: 'simulatte.plugin.subseaComparisonReceipt.v1',
        comparisonId: comparisonRun.comparisonId,
        policies: comparisonRun.policies,
        branchMetrics: comparisonRun.branchMetrics,
        settlementId: comparisonRun.settlement.id,
        truth: truth('simulated', 'forecast', distribution('Shared declared inputs; not current operations.')),
      });
      return {
        status: 'settled',
        comparisonId: comparisonRun.comparisonId,
        comparisonBranches: comparisonRun.branchMetrics,
        comparisonExecutionReceipt: comparisonRun.comparisonExecutionReceipt,
      };
    }

    function contributeRequest({ sourceText, mission = null }) {
      if (!/\b(?:subsea|submarine cable|communications resilience|bandwidth|landing station|cable cut)\b/i.test(sourceText || '')) {
        return null;
      }
      if (!mission) return { recognized: true, obligations: [], unresolved: [] };
      const scenarioId = sdk.state.read().result.scenarioId;
      return {
        recognized: true,
        obligations: [
          { id: `${PLUGIN_ID}:allocation:${scenarioId}`, kind: 'capacity_constrained_allocation', required: true },
          { id: `${PLUGIN_ID}:conservation:${scenarioId}`, kind: 'demand_and_capacity_conservation', required: true },
          { id: `${PLUGIN_ID}:truth:${scenarioId}`, kind: 'truth_boundary', required: true },
        ],
        unresolved: [],
      };
    }

    function settle() {
      const state = sdk.state.read();
      const snapshot = currentSnapshot(state);
      const allocationValid = snapshot.allocationReceipt.feasibility.isValid;
      const repairValid = state.result.repairReceipt.inventoryConserved;
      const terminal = state.playback.status === 'settled'
        && state.playback.cursor === state.result.snapshots.length - 1
        && snapshot.status === 'settled';
      return {
        obligationResults: [
          {
            obligationId: `${PLUGIN_ID}:allocation:${state.result.scenarioId}`,
            status: terminal ? 'settled' : 'unmet',
            evidence: {
              scenarioIdentity: state.result.scenarioIdentity,
              currentStep: state.playback.cursor,
              totalSteps: state.result.snapshots.length - 1,
            },
          },
          {
            obligationId: `${PLUGIN_ID}:conservation:${state.result.scenarioId}`,
            status: allocationValid && repairValid ? 'settled' : 'unmet',
            evidence: {
              allocation: snapshot.allocationReceipt.feasibility,
              repairInventoryConserved: repairValid,
            },
          },
          {
            obligationId: `${PLUGIN_ID}:truth:${state.result.scenarioId}`,
            status: state.result.claimBoundary.includes('modeled') ? 'settled' : 'unmet',
            evidence: {
              claimBoundary: state.result.claimBoundary,
              observedClaim: 'FCC regulatory cable identity and named foreign landing countries only',
            },
          },
        ],
        stateIdentity: `${state.result.scenarioIdentity}:step-${state.playback.cursor}:${state.playback.status}`,
        losses: terminal ? [] : [{
          kind: 'playback_incomplete',
          currentStep: state.playback.cursor,
          totalSteps: state.result.snapshots.length - 1,
        }],
        truth: truth('derived', 'forecast', missing('Settlement validity is exact for declared inputs only.')),
      };
    }

    function view() {
      const state = sdk.state.read();
      const snapshot = currentSnapshot(state);
      const parameters = state.acceptedParameters;
      return [{
        slot: 'inspector',
        title: 'Subsea allocation experiment',
        rows: [
          { label: 'Scenario', value: parameters.demandScenarioId.replaceAll('-', ' ') },
          { label: 'Playback', value: `${state.playback.cursor} of ${state.result.snapshots.length - 1} · ${state.playback.status}` },
          { label: 'Network stage', value: snapshot.status.replaceAll('-', ' ') },
          { label: 'What changed', value: snapshot.narrative },
          { label: 'Allocation', value: parameters.allocationPolicyId.replaceAll('-', ' ') },
          { label: 'Repair priority', value: parameters.repairPolicyId.replaceAll('-', ' ') },
          { label: 'Modeled failures', value: parameters.failedResourceIds.join(', ') },
          { label: 'Delivered', value: `${Math.round(snapshot.metrics.deliveredGbps).toLocaleString()} scenario Gbps` },
          { label: 'Unmet demand', value: `${Math.round(snapshot.metrics.droppedGbps).toLocaleString()} scenario Gbps` },
          { label: 'Service fairness', value: snapshot.metrics.jainServiceFairness.toFixed(3) },
          { label: 'Ensemble', value: `${parameters.ensembleSize} declared seeds · scenario variance` },
        ],
        fields: [],
        actions: [],
      }];
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
        dataReceipts: datasets.dataReceipts,
        config,
        result: state.result,
        snapshot: currentSnapshot(state),
        comparison: state.comparison,
      });
    }

    function appendScenarioReceipts(value, ensembleReceipt, parameters) {
      sdk.receipts.append({
        schema: 'simulatte.plugin.subseaScenarioReceipt.v1',
        scenarioIdentity: value.scenarioIdentity,
        scenarioId: value.scenarioId,
        seed: value.seed,
        acceptedParameters: parameters,
        datasetIdentities: Object.fromEntries(datasets.dataReceipts.map((row) => [row.datasetId, row.sha256])),
        pathCatalogHashes: value.pathCatalogReceipts.map((row) => row.catalogHash),
        allocationMatrixHashes: value.allocationReceipts.map((row) => row.matrixHash),
        repairReceipt: value.repairReceipt,
        claimBoundary: value.claimBoundary,
        truth: truth('simulated', 'forecast', distribution('Declared scenario seed and uncalibrated demand variance.')),
      });
      sdk.receipts.append(ensembleReceipt);
    }

    function appendSettlementReceipt(state) {
      const snapshot = currentSnapshot(state);
      sdk.receipts.append({
        schema: 'simulatte.plugin.subseaConservationReceipt.v1',
        scenarioIdentity: state.result.scenarioIdentity,
        acceptedParameters: state.acceptedParameters,
        allocationFeasibility: snapshot.allocationReceipt.feasibility,
        repairInventoryConserved: state.result.repairReceipt.inventoryConserved,
        terminalMetrics: snapshot.metrics,
        truth: truth('derived', 'forecast', missing('Conservation is exact for the declared scenario inputs.')),
      });
      sdk.receipts.append({
        schema: 'simulatte.plugin.subseaSettlementReceipt.v1',
        scenarioIdentity: state.result.scenarioIdentity,
        status: 'settled',
        terminalSnapshotId: snapshot.id,
        eventIds: state.result.events.map((row) => row.id),
        acceptedParameters: state.acceptedParameters,
        claimBoundary: state.result.claimBoundary,
        truth: truth('simulated', 'forecast', distribution('Scenario variance; not a current-operations estimate.')),
      });
    }

    const capabilities = Object.freeze({
      'simulation.subsea-network.v1': (input = {}) => {
        const nextScenario = normalizeScenario(input.scenario || input, config);
        const parameters = validateParameters(input.values || input, nextScenario, config, datasets);
        return model.runScenario({ datasets, config, scenario: parameters });
      },
    });

    return Object.freeze({
      id: PLUGIN_ID,
      capabilities,
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

  function validateParameters(values, selectedScenario, config, datasets) {
    const demandScenarioId = textControl(values.demandScenarioId, selectedScenario.scenarioId, 'demandScenarioId');
    const demandScenario = datasets.demands.scenarios.find((row) => row.id === demandScenarioId);
    if (!demandScenario) throw pluginError('subsea_control_invalid', `Unknown demandScenarioId ${demandScenarioId}`);
    const allocationPolicyId = textControl(values.allocationPolicyId, selectedScenario.allocationPolicyId || config.allocationPolicyId, 'allocationPolicyId');
    const allocationApi = dep('SimulatteSubseaAllocationSolver', './allocation-solver.js');
    if (!allocationApi.POLICY_IDS.includes(allocationPolicyId)) {
      throw pluginError('subsea_control_invalid', `Unknown allocationPolicyId ${allocationPolicyId}`);
    }
    const repairPolicyId = textControl(values.repairPolicyId, selectedScenario.repairPolicyId || config.repairPolicyId, 'repairPolicyId');
    if (!['nearest-first', 'unmet-demand-first'].includes(repairPolicyId)) {
      throw pluginError('subsea_control_invalid', `Unknown repairPolicyId ${repairPolicyId}`);
    }
    const failedResourceIds = arrayControl(
      values.failedResourceIds,
      selectedScenario.failedResourceIds || demandScenario.failedResourceIds || config.failureIds,
      'failedResourceIds'
    );
    const validFailures = new Set([
      ...datasets.topology.edges.map((row) => row.id),
      ...datasets.landings.points.map((row) => `landing:${row.id}`),
    ]);
    requireKnown(failedResourceIds, validFailures, 'failedResourceIds');
    const jurisdictionExclusions = arrayControl(
      values.jurisdictionExclusions,
      selectedScenario.excludedLandingIds || config.jurisdictionExclusions,
      'jurisdictionExclusions',
      true
    ).filter((row) => row !== 'none');
    requireKnown(jurisdictionExclusions, new Set(datasets.landings.points.map((row) => row.id)), 'jurisdictionExclusions');
    const essentialServiceWeight = numberControl(
      values.essentialServiceWeight,
      selectedScenario.essentialServiceWeight || config.essentialServiceWeight,
      1,
      20,
      false,
      'essentialServiceWeight'
    );
    const maximumResources = datasets.repairs.scenarios.find(
      (row) => row.id === demandScenario.repairScenarioId
    )?.resources.length;
    const repairResourceCount = numberControl(
      values.repairResourceCount,
      selectedScenario.repairResourceCount || config.repairResourceCount,
      1,
      maximumResources,
      true,
      'repairResourceCount'
    );
    const ensembleSize = numberControl(
      values.ensembleSize,
      selectedScenario.ensembleSize || config.ensembleSize,
      1,
      config.ensembleSeeds.length,
      true,
      'ensembleSize'
    );
    return deepFreeze({
      id: demandScenarioId,
      scenarioId: demandScenarioId,
      seed: selectedScenario.seed,
      demandScenarioId,
      capacityScenarioId: demandScenario.capacityScenarioId,
      repairScenarioId: demandScenario.repairScenarioId,
      allocationPolicyId,
      repairPolicyId,
      failedResourceIds,
      excludedLandingIds: jurisdictionExclusions,
      jurisdictionExclusions,
      essentialServiceWeight,
      repairResourceCount,
      ensembleSize,
    });
  }

  function loadDatasets(sdk) {
    const dataReceipts = Object.values(DATASETS).map((datasetId) => {
      const receipt = sdk.datasets.receipt(datasetId);
      if (!receipt?.sha256) throw pluginError('subsea_dataset_receipt_missing', datasetId);
      return Object.freeze({ datasetId, sha256: receipt.sha256, schemaId: receipt.schemaId });
    });
    return Object.freeze({
      fcc: sdk.datasets.require(DATASETS.fcc),
      landings: sdk.datasets.require(DATASETS.landings),
      topology: sdk.datasets.require(DATASETS.topology),
      capacities: sdk.datasets.require(DATASETS.capacities),
      demands: sdk.datasets.require(DATASETS.demands),
      repairs: sdk.datasets.require(DATASETS.repairs),
      governance: sdk.datasets.require(DATASETS.governance),
      provenance: sdk.datasets.require(DATASETS.provenance),
      dataReceipts: Object.freeze(dataReceipts),
    });
  }

  function normalizeScenario(value, config) {
    if (typeof value === 'string') return deepFreeze({ id: value, scenarioId: value, seed: value });
    const scenarioId = value?.scenarioId || value?.id || config.demandScenarioId;
    return deepFreeze({
      ...value,
      id: scenarioId,
      scenarioId,
      seed: value?.seed || scenarioId,
    });
  }

  function initialState(result, ensemble, acceptedParameters) {
    return {
      result,
      ensemble,
      acceptedParameters,
      playback: { status: 'ready', cursor: 0 },
      comparison: null,
    };
  }

  function reduce(state, event) {
    if (event.kind === `${PLUGIN_ID}.scenario-computed`) {
      return {
        result: event.result,
        ensemble: event.ensemble,
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
      return { ...state, comparison: event.comparison };
    }
    return state;
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
        mode: snapshot.status === 'repairing' ? 'follow' : snapshot.status === 'settled' ? 'compare' : 'overview',
        targetIds: snapshot.edges.filter((row) => row.failureState === 'failed' || row.utilizationRatio > 0.85)
          .map((row) => `corridor:${row.id}`),
        transitionReason: snapshot.eventIds.at(-1) ? `simulation_event:${snapshot.eventIds.at(-1)}` : 'scenario_ready',
        priority: 60,
        expiresAtEventId: null,
        mayInterruptManualOverride: false,
      }],
    };
  }

  function currentSnapshot(state) {
    return state.result.snapshots[state.playback.cursor];
  }

  function scenarioSummary(result, parameters) {
    return {
      scenarioId: result.scenarioId,
      scenarioIdentity: result.scenarioIdentity,
      acceptedParameters: parameters,
      eventCount: result.events.length,
      totalSteps: result.snapshots.length - 1,
    };
  }

  function textControl(value, fallback, label) {
    const selected = value === undefined || value === null || value === '' ? fallback : value;
    if (typeof selected !== 'string' || !selected) throw pluginError('subsea_control_invalid', `${label} must be a non-empty string`);
    return selected;
  }

  function arrayControl(value, fallback, label, allowEmpty = false) {
    const selected = value === undefined ? fallback : value;
    if (!Array.isArray(selected) || (!allowEmpty && !selected.length)
      || selected.some((row) => typeof row !== 'string' || !row)
      || new Set(selected).size !== selected.length) {
      throw pluginError('subsea_control_invalid', `${label} must be a ${allowEmpty ? '' : 'non-empty '}unique string array`);
    }
    return [...selected].sort();
  }

  function numberControl(value, fallback, minimum, maximum, integer, label) {
    const selected = value === undefined || value === null || value === '' ? fallback : Number(value);
    if (!Number.isFinite(selected) || selected < minimum || selected > maximum || (integer && !Number.isInteger(selected))) {
      throw pluginError('subsea_control_invalid', `${label} must be ${integer ? 'an integer' : 'a number'} from ${minimum} to ${maximum}`);
    }
    return selected;
  }

  function requireKnown(values, allowed, label) {
    const unknown = values.find((row) => !allowed.has(row));
    if (unknown) throw pluginError('subsea_control_invalid', `${label} contains unknown value ${unknown}`);
  }

  function truth(origin, temporalStatus, uncertainty) {
    return deepFreeze({ origin, temporalStatus, uncertainty });
  }

  function distribution(interpretation) {
    return { kind: 'distribution', value: { interpretation } };
  }

  function missing(reason) {
    return { kind: 'missing', value: { reason } };
  }

  function pluginError(code, message) {
    const error = new Error(`${code}: ${message}`);
    error.name = 'SimulatteSubseaPluginError';
    error.code = code;
    return error;
  }

  function deepFreeze(value, seen = new Set()) {
    if (!value || typeof value !== 'object' || seen.has(value) || Object.isFrozen(value)) return value;
    seen.add(value);
    Object.values(value).forEach((row) => deepFreeze(row, seen));
    return Object.freeze(value);
  }

  const datasetValidators = Object.freeze({
    'simulatte.subseaFccCableRegistry.v1': validateFcc,
    'simulatte.subseaLandingPoints.v1': validateLandings,
    'simulatte.subseaCableTopology.v1': validateTopology,
    'simulatte.subseaCapacityScenarios.v1': validateCapacities,
    'simulatte.subseaDemandScenarios.v1': validateDemands,
    'simulatte.subseaRepairResources.v1': validateRepairs,
    'simulatte.subseaModelGovernance.v1': validateGovernance,
    'simulatte.subseaProvenanceRegistry.v1': validateProvenance,
  });

  function validateFcc(value) {
    if (!Array.isArray(value?.cables) || value.cables.length < 4 || !Array.isArray(value.sources)) {
      throw pluginError('subsea_fcc_registry_invalid', 'FCC registry requires governed cable and source rows');
    }
    return value;
  }

  function validateLandings(value) {
    if (!Array.isArray(value?.points) || value.points.length < 4
      || value.points.some((row) => !row.id || !Array.isArray(row.coordinates) || row.coordinates.length !== 2)) {
      throw pluginError('subsea_landing_registry_invalid', 'Landing display anchors are incomplete');
    }
    return value;
  }

  function validateTopology(value) {
    if (!Array.isArray(value?.edges) || !value.edges.length || !Array.isArray(value.nodeIds)
      || value.edges.some((row) => !value.nodeIds.includes(row.fromLandingId) || !value.nodeIds.includes(row.toLandingId))) {
      throw pluginError('subsea_topology_invalid', 'Topology contains missing nodes or edges');
    }
    return value;
  }

  function validateCapacities(value) {
    if (!Array.isArray(value?.scenarios) || !value.scenarios.length
      || value.scenarios.some((scenario) => scenario.edgeCapacities.some(
        (row) => !Number.isFinite(row.capacityGbps) || row.capacityGbps < 0
      ))) {
      throw pluginError('subsea_capacity_scenarios_invalid', 'Capacity scenarios contain invalid values');
    }
    return value;
  }

  function validateDemands(value) {
    if (!Array.isArray(value?.scenarios) || value.scenarios.length < 4
      || value.scenarios.some((scenario) => !scenario.demands.length || scenario.demands.some(
        (row) => !Number.isFinite(row.requestedGbps) || row.requestedGbps < 0
      ))) {
      throw pluginError('subsea_demand_scenarios_invalid', 'Demand scenarios are incomplete');
    }
    return value;
  }

  function validateRepairs(value) {
    if (!Array.isArray(value?.scenarios) || !value.scenarios.length
      || value.scenarios.some((scenario) => !scenario.resources.length)) {
      throw pluginError('subsea_repair_resources_invalid', 'Repair scenarios require resources');
    }
    return value;
  }

  function validateGovernance(value) {
    if (!Array.isArray(value?.algorithms) || !value.algorithms.length
      || !Array.isArray(value.prohibitedClaims) || !value.prohibitedClaims.length) {
      throw pluginError('subsea_model_governance_invalid', 'Model governance is incomplete');
    }
    return value;
  }

  function validateProvenance(value) {
    if (!Array.isArray(value?.sources) || value.sources.some((row) => !/^[a-f0-9]{64}$/.test(row.sha256 || ''))
      || !Array.isArray(value.transformations)) {
      throw pluginError('subsea_provenance_registry_invalid', 'Provenance sources or transformations are incomplete');
    }
    return value;
  }

  return Object.freeze({ activate, datasetValidators });
});
