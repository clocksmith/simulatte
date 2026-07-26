(function attachNeighborhoodBulkPoolPlugin(root, factory) {
  const catalogApi = typeof module === 'object' && module.exports
    ? require('./catalog-index.js')
    : root.SimulatteNeighborhoodBulkCatalogIndex;
  const solver = typeof module === 'object' && module.exports
    ? require('./pool-solver.js')
    : root.SimulatteNeighborhoodBulkPoolSolver;
  const v4Api = typeof module === 'object' && module.exports
    ? require('./v4-contribution.js')
    : root.SimulatteNeighborhoodBulkV4;
  const api = factory(catalogApi, solver, v4Api);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulattePluginNeighborhoodBulkPool = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createNeighborhoodBulkPoolPlugin(
  catalogApi,
  solver,
  v4Api
) {
  const PLUGIN_ID = 'neighborhood-bulk-pool';
  const DATASETS = Object.freeze({
    warehouses: 'neighborhood-bulk-warehouse-registry-v1',
    catalog: 'neighborhood-bulk-catalog-snapshot-bootstrap-v1',
    routes: 'neighborhood-bulk-route-corridors-modeled-v1',
    demand: 'neighborhood-bulk-demand-and-trips-scenario-v1',
    governance: 'neighborhood-bulk-model-governance-v1',
  });

  async function activate({ sdk, config, scenario }) {
    requireDependencies();
    const datasets = loadDatasets(sdk);
    let selectedScenario = normalizeScenario(scenario, config);
    let acceptedParameters = validateParameters({}, selectedScenario, config, datasets);
    let result = run(acceptedParameters);
    sdk.state.register(reduce, initialState(result, acceptedParameters));
    appendScenarioReceipt(result, acceptedParameters);

    function run(parameters) {
      return solver.runScenario({ datasets, config, scenario: parameters });
    }

    function setScenario(nextScenario) {
      selectedScenario = normalizeScenario(nextScenario, config);
      acceptedParameters = validateParameters({}, selectedScenario, config, datasets);
      result = run(acceptedParameters);
      sdk.events.propose({
        pluginId: PLUGIN_ID,
        kind: `${PLUGIN_ID}.scenario-computed`,
        result,
        acceptedParameters,
      });
      appendScenarioReceipt(result, acceptedParameters);
      return scenarioSummary(result);
    }

    function handleAction(actionId, context = {}) {
      if (actionId === 'scenario.run') return runPlayback(context);
      if (actionId === 'counterfactual.compare') return compareCounterfactual();
      if (actionId === 'catalog.search') return searchCatalog(context.values || context);
      return { status: 'refused', reason: 'unknown_action', actionId };
    }

    function runPlayback(context) {
      const phase = context.values?.phase;
      if (phase === 'start') {
        selectedScenario = normalizeScenario(context.scenario || selectedScenario, config);
        acceptedParameters = validateParameters(context.values || {}, selectedScenario, config, datasets);
        result = run(acceptedParameters);
        sdk.events.propose({
          pluginId: PLUGIN_ID,
          kind: `${PLUGIN_ID}.scenario-computed`,
          result,
          acceptedParameters,
        });
        sdk.events.propose({
          pluginId: PLUGIN_ID,
          kind: `${PLUGIN_ID}.playback-started`,
          acceptedParameters,
        });
        appendScenarioReceipt(result, acceptedParameters);
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
        });
        const next = sdk.state.read();
        if (next.playback.status === 'settled') appendSettlementReceipt(next);
        return playbackResult(next);
      }
      return { status: 'refused', reason: 'scenario_phase_invalid', phase };
    }

    function compareCounterfactual() {
      const state = sdk.state.read();
      const baseline = state.result.policyResults.independent;
      const intervention = state.result.policyResults[state.result.activePolicyId];
      const comparisonId = `${PLUGIN_ID}:comparison:${state.result.scenarioIdentity}`;
      const comparisonBranches = deepFreeze({
        baseline: baseline.metrics,
        intervention: intervention.metrics,
      });
      sdk.events.propose({
        pluginId: PLUGIN_ID,
        kind: `${PLUGIN_ID}.comparison-computed`,
        comparisonId,
        comparisonBranches,
      });
      sdk.receipts.append({
        schema: 'simulatte.plugin.neighborhoodBulkComparisonReceipt.v1',
        comparisonId,
        scenarioIdentity: state.result.scenarioIdentity,
        baselinePolicyId: 'independent',
        interventionPolicyId: state.result.activePolicyId,
        branchMetrics: comparisonBranches,
        sharedConfiguration: state.acceptedParameters,
        truth: truth(
          'simulated',
          'forecast',
          distribution('Branches share demand, catalog, warehouses, and availability assumptions.')
        ),
      });
      return {
        status: 'settled',
        comparisonId,
        comparisonBranches,
      };
    }

    function searchCatalog(input) {
      if (typeof input.query !== 'string' || !input.query.trim()) {
        return { status: 'refused', reason: 'catalog_query_missing' };
      }
      const index = catalogApi.createCatalogIndex(datasets.catalog);
      const results = index.search(input.query, {
        warehouseIds: input.warehouseIds || acceptedParameters.selectedWarehouseIds,
        categoryIds: input.categoryIds || acceptedParameters.selectedCategoryIds,
        allowUnknownAvailability: input.allowUnknownAvailability
          ?? acceptedParameters.allowUnknownAvailability,
        limit: input.limit,
      });
      return deepFreeze({
        status: 'settled',
        query: input.query,
        results,
        coverage: index.coverage,
      });
    }

    function contributeRequest({ sourceText, mission = null }) {
      if (!/\b(?:costco|bulk groceries|grocery carpool|food pool|neighborhood delivery|split package)\b/i.test(sourceText || '')) {
        return null;
      }
      if (!mission) return { recognized: true, obligations: [], unresolved: [] };
      const scenarioId = sdk.state.read().result.scenarioId;
      return {
        recognized: true,
        obligations: [
          { id: `${PLUGIN_ID}:packages:${scenarioId}`, kind: 'whole_package_allocation', required: true },
          { id: `${PLUGIN_ID}:routes:${scenarioId}`, kind: 'capacity_and_freshness_route_assignment', required: true },
          { id: `${PLUGIN_ID}:settlement:${scenarioId}`, kind: 'exact_cost_settlement', required: true },
          { id: `${PLUGIN_ID}:truth:${scenarioId}`, kind: 'catalog_and_participant_truth_boundary', required: true },
        ],
        unresolved: [],
      };
    }

    function settle() {
      const state = sdk.state.read();
      const snapshot = currentSnapshot(state);
      const terminal = state.playback.status === 'settled'
        && state.playback.cursor === state.result.snapshots.length - 1
        && snapshot.status === 'settled';
      const conservation = state.result.conservation;
      const inventoryBoundary = state.result.catalogReceipt.declaredComplete === false
        && state.result.catalogReceipt.coverageStatus === 'bootstrap-scenario';
      return {
        obligationResults: [
          {
            obligationId: `${PLUGIN_ID}:packages:${state.result.scenarioId}`,
            status: terminal && conservation.packageConserved ? 'settled' : 'unmet',
            evidence: {
              purchasedUnits: conservation.purchasedUnits,
              fulfilledUnits: conservation.fulfilledUnits,
              wasteUnits: conservation.wasteUnits,
              packageConserved: conservation.packageConserved,
            },
          },
          {
            obligationId: `${PLUGIN_ID}:routes:${state.result.scenarioId}`,
            status: terminal && conservation.capacityConserved
              && conservation.refrigerationViolations === 0 ? 'settled' : 'unmet',
            evidence: {
              tripCount: state.result.tripAssignments.length,
              capacityConserved: conservation.capacityConserved,
              refrigerationViolations: conservation.refrigerationViolations,
            },
          },
          {
            obligationId: `${PLUGIN_ID}:settlement:${state.result.scenarioId}`,
            status: terminal && conservation.demandConserved ? 'settled' : 'unmet',
            evidence: {
              demandConserved: conservation.demandConserved,
              householdCostUsd: state.result.metrics.householdCostUsd,
              driverCompensationUsd: state.result.metrics.driverCompensationUsd,
            },
          },
          {
            obligationId: `${PLUGIN_ID}:truth:${state.result.scenarioId}`,
            status: inventoryBoundary ? 'settled' : 'unmet',
            evidence: {
              coverageStatus: state.result.catalogReceipt.coverageStatus,
              declaredComplete: state.result.catalogReceipt.declaredComplete,
              participantOrigin: datasets.demand.truth.origin,
              corridorOrigin: datasets.routes.truth.origin,
            },
          },
        ],
        stateIdentity: `${state.result.scenarioIdentity}:step-${state.playback.cursor}:${state.playback.status}`,
        losses: terminal ? state.result.unsupported : [{
          kind: 'playback_incomplete',
          currentStep: state.playback.cursor,
          totalSteps: state.result.snapshots.length - 1,
        }],
        truth: truth(
          'derived',
          'forecast',
          missing('Settlement is exact for declared scenario rows; real prices and inventory remain unsupported.')
        ),
      };
    }

    function view() {
      const state = sdk.state.read();
      const snapshot = currentSnapshot(state);
      const metrics = snapshot.metrics;
      return [{
        slot: 'inspector',
        title: 'Neighborhood Bulk Pool',
        rows: [
          { label: 'Scenario', value: state.acceptedParameters.scenarioId.replaceAll('-', ' ') },
          { label: 'Playback', value: `${state.playback.cursor} of ${state.result.snapshots.length - 1} · ${state.playback.status}` },
          { label: 'Policy', value: state.acceptedParameters.poolingPolicyId.replaceAll('-', ' ') },
          { label: 'Catalog', value: `${state.result.catalogReceipt.indexedRows.toLocaleString()} bootstrap rows · incomplete` },
          { label: 'Requested', value: `${metrics.requestedUnits} share units` },
          { label: 'Fulfilled', value: `${metrics.fulfilledUnits} share units` },
          { label: 'Packages', value: `${metrics.packagesPurchased} whole packages · ${metrics.wasteUnits} unallocated units` },
          { label: 'Cost', value: `$${metrics.householdCostUsd.toFixed(2)}` },
          { label: 'Incremental driving', value: `${metrics.incrementalVehicleKm.toFixed(2)} scenario km` },
        ],
        fields: [],
        actions: [],
      }, {
        slot: 'hud',
        title: 'Truth boundary',
        rows: [
          { label: 'Observed', value: 'Four official warehouse identities and addresses' },
          { label: 'Scenario', value: 'Products, prices, availability, participants, demand, trips, compensation' },
          { label: 'Modeled', value: 'Corridors, detours, capacity screens, freshness times' },
          { label: 'Simulated', value: 'Packages, assignments, costs, savings, waste, reputation' },
          { label: 'Not claimed', value: 'Live Costco inventory, real residents, exact streets, legal marketplace readiness' },
        ],
        actions: [],
      }];
    }

    function contributeV4() {
      const state = sdk.state.read();
      return v4Api.createContribution({
        datasets,
        dataReceipts: datasets.dataReceipts,
        config,
        result: state.result,
        snapshot: currentSnapshot(state),
      });
    }

    function appendScenarioReceipt(value, parameters) {
      sdk.receipts.append({
        schema: 'simulatte.plugin.neighborhoodBulkScenarioReceipt.v1',
        scenarioIdentity: value.scenarioIdentity,
        scenarioId: value.scenarioId,
        seed: value.seed,
        acceptedParameters: parameters,
        datasetIdentities: Object.fromEntries(datasets.dataReceipts.map((row) => [row.datasetId, row.sha256])),
        catalogReceipt: value.catalogReceipt,
        terminalMetrics: value.metrics,
        conservation: value.conservation,
        claimBoundary: value.claimBoundary,
        truth: truth(
          'simulated',
          'forecast',
          distribution('Authored scenario variation; no empirical demand or inventory calibration.')
        ),
      });
    }

    function appendSettlementReceipt(state) {
      sdk.receipts.append({
        schema: 'simulatte.plugin.neighborhoodBulkSettlementReceipt.v1',
        scenarioIdentity: state.result.scenarioIdentity,
        status: 'settled',
        activePolicyId: state.result.activePolicyId,
        terminalSnapshotId: currentSnapshot(state).id,
        acceptedParameters: state.acceptedParameters,
        conservation: state.result.conservation,
        settlements: state.result.settlements,
        unsupported: state.result.unsupported,
        truth: truth(
          'simulated',
          'forecast',
          missing('Costs use bootstrap scenario prices and must be replaced by a purchase receipt in real operation.')
        ),
      });
    }

    const capabilities = Object.freeze({
      'simulation.neighborhood-bulk-pool.v1': (input = {}) => {
        const nextScenario = normalizeScenario(input.scenario || input, config);
        const parameters = validateParameters(input.values || input, nextScenario, config, datasets);
        return solver.runScenario({ datasets, config, scenario: parameters });
      },
      'catalog.neighborhood-bulk.search.v1': (input = {}) => searchCatalog(input),
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
    const scenarioId = textControl(values.scenarioId, selectedScenario.scenarioId, 'scenarioId');
    const scenarioRow = datasets.demand.scenarios.find((row) => row.id === scenarioId);
    if (!scenarioRow) throw pluginError('bulk_pool_control_invalid', `Unknown scenarioId ${scenarioId}`);
    const defaults = scenarioRow.defaults;
    const poolingPolicyId = textControl(values.poolingPolicyId, defaults.poolingPolicyId, 'poolingPolicyId');
    if (!solver.POLICY_IDS.includes(poolingPolicyId)) {
      throw pluginError('bulk_pool_control_invalid', `Unknown poolingPolicyId ${poolingPolicyId}`);
    }
    const selectedWarehouseIds = arrayControl(
      values.selectedWarehouseIds,
      config.selectedWarehouseIds,
      'selectedWarehouseIds'
    );
    requireKnown(selectedWarehouseIds, new Set(datasets.warehouses.warehouses.map((row) => row.id)), 'selectedWarehouseIds');
    const selectedCategoryIds = arrayControl(
      values.selectedCategoryIds,
      config.selectedCategoryIds,
      'selectedCategoryIds'
    );
    requireKnown(selectedCategoryIds, new Set(datasets.catalog.categories.map((row) => row.id)), 'selectedCategoryIds');
    const compensationModes = arrayControl(
      values.compensationModes,
      config.compensationModes,
      'compensationModes'
    );
    requireKnown(compensationModes, new Set(['pro-bono', 'exact-expenses', 'fee']), 'compensationModes');
    return deepFreeze({
      id: scenarioId,
      scenarioId,
      seed: selectedScenario.seed,
      poolingPolicyId,
      selectedWarehouseIds,
      selectedCategoryIds,
      compensationModes,
      maximumDetourKm: numberControl(
        values.maximumDetourKm,
        defaults.maximumDetourKm,
        0.5,
        8,
        false,
        'maximumDetourKm'
      ),
      maximumStops: numberControl(
        values.maximumStops,
        defaults.maximumStops,
        1,
        12,
        true,
        'maximumStops'
      ),
      minimumSavingsUsd: numberControl(
        values.minimumSavingsUsd,
        defaults.minimumSavingsUsd,
        0,
        20,
        false,
        'minimumSavingsUsd'
      ),
      freshnessLimitMinutes: numberControl(
        values.freshnessLimitMinutes,
        defaults.freshnessLimitMinutes,
        30,
        240,
        false,
        'freshnessLimitMinutes'
      ),
      allowUnknownAvailability: booleanControl(
        values.allowUnknownAvailability,
        config.allowUnknownAvailability,
        'allowUnknownAvailability'
      ),
    });
  }

  function loadDatasets(sdk) {
    const dataReceipts = Object.values(DATASETS).map((datasetId) => {
      const receipt = sdk.datasets.receipt(datasetId);
      if (!receipt?.sha256) throw pluginError('bulk_pool_dataset_receipt_missing', datasetId);
      return Object.freeze({ datasetId, sha256: receipt.sha256, schemaId: receipt.schemaId });
    });
    return deepFreeze({
      warehouses: sdk.datasets.require(DATASETS.warehouses),
      catalog: sdk.datasets.require(DATASETS.catalog),
      routes: sdk.datasets.require(DATASETS.routes),
      demand: sdk.datasets.require(DATASETS.demand),
      governance: sdk.datasets.require(DATASETS.governance),
      dataReceipts,
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
          comparisonBranches: event.comparisonBranches,
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
      activePolicyId: result.activePolicyId,
      eventCount: result.events.length,
      totalSteps: result.snapshots.length - 1,
    });
  }

  function validateWarehouseRegistry(value) {
    if (!Array.isArray(value?.warehouses) || value.warehouses.length !== 4
      || new Set(value.warehouses.map((row) => row.id)).size !== value.warehouses.length
      || value.warehouses.some((row) => !row.sourceUrl || !Array.isArray(row.coordinates) || row.coordinates.length !== 2)) {
      throw pluginError('bulk_pool_warehouse_registry_invalid', 'Warehouse registry requires four unique sourced display anchors');
    }
    return value;
  }

  function validateRoutes(value) {
    if (!Array.isArray(value?.neighborhoods) || !value.neighborhoods.length
      || !Array.isArray(value.hubs) || !value.hubs.length
      || !Array.isArray(value.coverageAreas) || value.coverageAreas.length !== 3
      || value.coverageAreas.some((row) => !Array.isArray(row.coordinates) || row.coordinates.length < 3)
      || !Array.isArray(value.corridors) || !value.corridors.length
      || value.corridors.some((row) => !Array.isArray(row.coordinates) || row.coordinates.length < 2)) {
      throw pluginError('bulk_pool_routes_invalid', 'Route corridor scenarios are incomplete');
    }
    return value;
  }

  function validateDemand(value) {
    if (!Array.isArray(value?.participants) || !value.participants.length
      || !Array.isArray(value.requests) || !value.requests.length
      || !Array.isArray(value.trips) || !value.trips.length
      || !Array.isArray(value.scenarios) || value.scenarios.length < 2
      || value.participants.some((row) => Object.hasOwn(row, 'address') || Object.hasOwn(row, 'coordinates'))) {
      throw pluginError('bulk_pool_demand_invalid', 'Demand and trip scenario registry is incomplete or contains direct locations');
    }
    return value;
  }

  function validateGovernance(value) {
    if (!Array.isArray(value?.models) || value.models.length < 4
      || !value.gates || !value.claimBoundary) {
      throw pluginError('bulk_pool_governance_invalid', 'Model governance must declare algorithms, gates, and claim boundary');
    }
    return value;
  }

  const datasetValidators = Object.freeze({
    'simulatte.neighborhoodBulkWarehouseRegistry.v1': validateWarehouseRegistry,
    'simulatte.neighborhoodBulkCatalogSnapshot.v1': catalogApi.validateCatalogSnapshot,
    'simulatte.neighborhoodBulkRouteCorridors.v1': validateRoutes,
    'simulatte.neighborhoodBulkDemandTrips.v1': validateDemand,
    'simulatte.neighborhoodBulkModelGovernance.v1': validateGovernance,
  });

  function textControl(value, fallback, label) {
    const selected = value === undefined || value === null || value === '' ? fallback : value;
    if (typeof selected !== 'string' || !selected) {
      throw pluginError('bulk_pool_control_invalid', `${label} must be non-empty text`);
    }
    return selected;
  }

  function arrayControl(value, fallback, label) {
    const selected = value === undefined ? fallback : value;
    if (!Array.isArray(selected) || !selected.length
      || selected.some((row) => typeof row !== 'string' || !row)
      || new Set(selected).size !== selected.length) {
      throw pluginError('bulk_pool_control_invalid', `${label} must be a non-empty unique string array`);
    }
    return [...selected].sort();
  }

  function numberControl(value, fallback, minimum, maximum, integer, label) {
    const selected = value === undefined || value === null || value === '' ? fallback : Number(value);
    if (!Number.isFinite(selected) || selected < minimum || selected > maximum
      || (integer && !Number.isInteger(selected))) {
      throw pluginError(
        'bulk_pool_control_invalid',
        `${label} must be ${integer ? 'an integer' : 'a number'} from ${minimum} to ${maximum}`
      );
    }
    return selected;
  }

  function booleanControl(value, fallback, label) {
    const selected = value === undefined ? fallback : value;
    if (typeof selected !== 'boolean') {
      throw pluginError('bulk_pool_control_invalid', `${label} must be a boolean`);
    }
    return selected;
  }

  function requireKnown(values, allowed, label) {
    const unknown = values.find((row) => !allowed.has(row));
    if (unknown) throw pluginError('bulk_pool_control_invalid', `${label} contains unknown value ${unknown}`);
  }

  function requireDependencies() {
    if (!catalogApi?.createCatalogIndex || !solver?.runScenario || !v4Api?.createContribution) {
      throw pluginError('bulk_pool_dependency_missing', 'Neighborhood Bulk Pool runtime modules are incomplete');
    }
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
    error.name = 'SimulatteNeighborhoodBulkPluginError';
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
    activate,
    datasetValidators,
    validateDemand,
    validateGovernance,
    validateRoutes,
    validateWarehouseRegistry,
  });
});
