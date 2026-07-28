(function attachCableTraderPlugin(root, factory) {
  const network = typeof module === 'object' && module.exports
    ? require('./network-simulation.js')
    : root.SimulatteCableTraderNetwork;
  const v4Contribution = typeof module === 'object' && module.exports
    ? require('./v4-contribution.js')
    : root.SimulatteCableTraderV4Contribution;
  const comparisonDriver = typeof module === 'object' && module.exports
    ? require('./comparison-driver.js')
    : root.SimulatteCableTraderComparison;
  const ensembleRunner = typeof module === 'object' && module.exports
    ? require('./ensemble-runner.js')
    : root.SimulatteCableTraderEnsemble;
  const logisticsPresentation = typeof module === 'object' && module.exports
    ? require('./logistics-presentation.js')
    : root.SimulatteCableTraderPresentation;
  const api = factory(network, v4Contribution, comparisonDriver, ensembleRunner, logisticsPresentation);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulattePluginCableTrader = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createCableTraderPlugin(
  network,
  v4Contribution,
  comparisonDriver,
  ensembleRunner,
  logisticsPresentation
) {
  const MAX_PRESENTATION_ACTORS = 64;

  async function activate({ sdk, config, scenario = null }) {
    let activeConfig = config;
    resolveRenderedRequestCount(config.simulation.renderedRequestCount);
    const worldModel = sdk.worldQuery.model();
    const transferRoutes = config.hubs.flatMap((sourceHub) => config.demandSites
      .map((destinationSite) => {
        const route = sdk.routing.plan({
          worldModel,
          originNodeId: sourceHub.nodeId,
          destinationNodeId: destinationSite.nodeId,
          mode: 'delivery_bike',
          tick: 0,
          mission: { constraints: { avoidStreetNames: [], lanePreference: 'protected' }, task: { type: 'point_to_point' } },
          policy: sdk.routing.policy(),
        });
        const distanceM = route.segmentIds.reduce((total, segmentId) => total + worldModel.segment(segmentId).lengthM, 0);
        return Object.freeze({
          id: `route-${sourceHub.id}-${destinationSite.id}`,
          sourceHubId: sourceHub.id,
          destinationSiteId: destinationSite.id,
          segmentIds: route.segmentIds,
          distanceM,
          costUnits: Math.max(0.1, distanceM / 1000),
        });
      }));
    const simulationFor = (nextScenario) => {
      const selectedCableFamilyIds = network.normalizeCableFamilyIds(
        activeConfig.cableTypes,
        nextScenario?.selectedCableFamilyIds || activeConfig.simulation.selectedCableFamilyIds
      );
      const effectiveConfig = {
        ...activeConfig,
        simulation: {
          ...activeConfig.simulation,
          seed: nextScenario?.seed || activeConfig.simulation.seed,
          scenarioId: nextScenario?.id || activeConfig.scenarioModifiers[0].id,
          selectedCableFamilyIds,
        },
      };
      // The scenario identity already includes the governed seed and cable-family
      // selection. Using the activation-scoped host stream here would make a
      // shuffled scenario differ from the same scenario restored after reload.
      return network.simulateNetwork(effectiveConfig, transferRoutes, {
        allocationPolicy: effectiveConfig.simulation.allocationObjective,
      });
    };
    const simulation = simulationFor(scenario);
    const reduceState = createReducer(simulationFor);
    sdk.state.register(reduceState, {
      simulation,
      playback: { status: 'ready', day: 0 },
    });
    appendNetworkReceipt(simulation);
    const activeComparisonRuns = new Map();
    let activeComparisonRun = await executeComparison(simulation, 'cheapest-vs-fastest');
    let activeComparisonSimulationId = simulation.id;
    let activeEnsembleRun = await executeEnsemble();

    function appendNetworkReceipt(result) {
      sdk.receipts.append({
        schema: 'simulatte.plugin.cableTraderNetworkReceipt.v1',
        simulationId: result.id,
        seed: result.seed,
        baseSeed: result.baseSeed,
        scenarioId: result.scenarioId,
        scenarioProfileId: result.scenarioProfileId,
        configurationHash: result.configurationHash,
        selectedCableFamilyIds: result.selectedCableFamilyIds,
        durationDays: result.durationDays,
        summary: result.summary,
        solver: result.solver,
        policyId: result.allocationPolicy,
        controls: {
          demandPriority: activeConfig.simulation.demandPriority,
          allowSubstitutes: activeConfig.simulation.allowSubstitutes,
          reservePolicy: activeConfig.simulation.reservePolicy,
          transferCapacityMetersPerDay: activeConfig.simulation.transferCapacityMetersPerDay,
          allocationObjective: activeConfig.simulation.allocationObjective,
          fairnessWeight: activeConfig.simulation.fairnessWeight,
          disruptionScenario: activeConfig.simulation.disruptionScenario,
        },
        interventions: (activeConfig.simulation.interventions || []).map((row) => ({ ...row })),
        conservation: result.conservation,
        dataReceiptIds: ['cable-trader:data:logistics-catalog', 'cable-trader:data:authored-scenario'],
        modelReceiptIds: ['cable-trader:model:event-generator', 'cable-trader:model:policy-scored-flow'],
        origin: 'simulated',
        temporalStatus: 'forecast',
        uncertainty: {
          kind: 'distribution',
          value: { ensembleSize: 1, seed: result.seed, intervalStatus: 'not_computed' },
        },
        claimBoundary: result.claimBoundary,
      });
    }

    async function setScenario(nextScenario) {
      const selectedCableFamilyIds = network.normalizeCableFamilyIds(
        activeConfig.cableTypes,
        nextScenario?.selectedCableFamilyIds || activeConfig.simulation.selectedCableFamilyIds
      );
      activeConfig = {
        ...activeConfig,
        simulation: {
          ...activeConfig.simulation,
          seed: nextScenario?.seed || activeConfig.simulation.seed,
          scenarioId: nextScenario?.id || activeConfig.scenarioModifiers[0].id,
          selectedCableFamilyIds,
          interventions: [],
        },
      };
      sdk.events.propose({
        pluginId: 'cable-trader',
        kind: 'cable-trader.scenario-selected',
        scenario: {
          id: nextScenario?.id || activeConfig.scenarioModifiers[0].id,
          seed: nextScenario?.seed || activeConfig.simulation.seed,
          selectedCableFamilyIds,
        },
      });
      const nextSimulation = sdk.state.read().simulation;
      appendNetworkReceipt(nextSimulation);
      if (activeComparisonSimulationId !== nextSimulation.id) {
        await yieldBrowserTask();
        activeComparisonRun = await executeComparison(nextSimulation, 'cheapest-vs-fastest');
        await yieldBrowserTask();
        activeEnsembleRun = await executeEnsemble();
        activeComparisonSimulationId = nextSimulation.id;
      }
      return nextSimulation.summary;
    }

    async function setCableFamilies(selectedCableFamilyIds) {
      const state = sdk.state.read();
      return setScenario({
        id: state.simulation.scenarioProfileId,
        seed: state.simulation.baseSeed,
        selectedCableFamilyIds,
      });
    }

    async function executeComparison(interventionSimulation, comparisonId = 'cheapest-vs-fastest') {
      const driver = comparisonDriver || globalThis.SimulatteCableTraderComparison;
      if (!driver?.runComparison) {
        throw new Error('cable_trader_comparison_driver_unavailable');
      }
      const run = await driver.runComparison({
        config: activeConfig,
        transferRoutes,
        interventionSimulation,
        comparisonId,
      });
      activeComparisonRuns.set(run.comparisonId, run);
      sdk.receipts.append(run.comparisonExecutionReceipt);
      return run;
    }

    async function executeEnsemble() {
      const runner = ensembleRunner || globalThis.SimulatteCableTraderEnsemble;
      if (!runner?.runEnsemble) throw new Error('cable_trader_ensemble_runner_unavailable');
      const run = await runner.runEnsemble({ config: activeConfig, transferRoutes });
      sdk.receipts.append(run.receipt);
      return run;
    }

    function contributeRequest({ sourceText, mission = null }) {
      if (!/\b(?:cable|hub|inventory|allocation|monte\s+carlo|exchange\s+network)\b/i.test(sourceText || '')) return null;
      if (!mission) {
        return {
          recognized: true,
          executableSourceText: `Bike from ${activeConfig.hubs[0].label} to ${activeConfig.hubs.at(-1).label}. Prefer protected lanes.`,
          obligations: [],
          unresolved: [],
        };
      }
      const activeSimulation = sdk.state.read().simulation;
      return {
        recognized: true,
        obligations: [{ id: activeSimulation.id, kind: 'optimal_cable_network', required: true }],
        unresolved: [],
      };
    }

    function view() {
      const state = sdk.state.read();
      return logisticsPresentation.createViews({
        config: activeConfig,
        simulation: state.simulation,
        playback: state.playback,
        ensembleRun: activeEnsembleRun,
        comparisonRuns: [...activeComparisonRuns.values()],
      });
    }

    function present() {
      const state = sdk.state.read();
      return logisticsPresentation.createPresentation({
        config: activeConfig,
        simulation: state.simulation,
        playback: state.playback,
        transferRoutes,
      });
    }

    function handleAction(actionId, context = {}) {
      if (actionId === 'cable-families.set') {
        return setCableFamilies(context.values?.selectedCableFamilyIds).then((summary) => ({
          status: 'settled',
          summary,
          scenarioId: sdk.state.read().simulation.scenarioId,
          configurationHash: sdk.state.read().simulation.configurationHash,
          selectedCableFamilyIds: sdk.state.read().simulation.selectedCableFamilyIds,
        }));
      }
      if (actionId === 'comparison.run' || actionId === 'counterfactual.compare') {
        return executeComparison(
          sdk.state.read().simulation,
          context.values?.comparisonId || 'cheapest-vs-fastest'
        ).then((run) => {
          activeComparisonRun = run;
          return {
            status: 'settled',
            comparisonId: run.comparisonId,
            comparisonBranches: run.branchSummaries,
            settlement: run.settlement,
            comparisonExecutionReceipt: run.comparisonExecutionReceipt,
          };
        });
      }
      if (actionId === 'ensemble.run') {
        return executeEnsemble().then((run) => {
          activeEnsembleRun = run;
          return {
            status: 'settled',
            ensembleId: run.ensembleId,
            distributions: run.distributions,
            ensembleReceipt: run.receipt,
          };
        });
      }
      if (actionId.startsWith('cable-trader.intervene.')) {
        return applyLiveIntervention(actionId);
      }
      if (actionId !== 'scenario.run') return { status: 'refused', reason: 'unknown_action', actionId };
      const phase = context.values?.phase;
      if (phase === 'start' && hasParameterValues(context.values)) {
        const prior = sdk.state.read().simulation;
        applyParameterValues(context.values || {});
        return setScenario({
          id: context.scenario?.id || prior.scenarioProfileId,
          seed: context.scenario?.seed || prior.baseSeed,
          selectedCableFamilyIds: activeConfig.simulation.selectedCableFamilyIds,
        }).then(() => startPlayback());
      }
      const state = sdk.state.read();
      const identity = {
        scenarioId: state.simulation.scenarioId,
        configurationHash: state.simulation.configurationHash,
        selectedCableFamilyIds: state.simulation.selectedCableFamilyIds,
      };
      if (phase === undefined) {
        sdk.events.propose({ pluginId: 'cable-trader', kind: 'cable-trader.playback-started', ...identity });
        for (let day = 1; day <= state.simulation.durationDays; day += 1) {
          sdk.events.propose({ pluginId: 'cable-trader', kind: 'cable-trader.playback-advanced', day, ...identity });
        }
        appendPlaybackReceipt(sdk.state.read());
        return { ...playbackAction(sdk.state.read()), compatibilityMode: 'eager_v1_v3_host' };
      }
      if (phase === 'start') {
        return startPlayback();
      }
      if (phase === 'step') {
        if (state.playback.status !== 'running') return { status: 'refused', reason: 'playback_not_running' };
        const day = Math.min(state.simulation.durationDays, state.playback.day + 1);
        sdk.events.propose({ pluginId: 'cable-trader', kind: 'cable-trader.playback-advanced', day, ...identity });
        const nextState = sdk.state.read();
        if (nextState.playback.status === 'settled') appendPlaybackReceipt(nextState);
        return playbackAction(nextState);
      }
      return { status: 'refused', reason: 'scenario_phase_invalid', phase: phase || null };
    }

    async function applyLiveIntervention(actionId) {
      const state = sdk.state.read();
      if (state.playback.status !== 'running'
        || state.playback.day < 1
        || state.playback.day >= state.simulation.durationDays) {
        return { status: 'refused', reason: 'intervention_requires_active_playback' };
      }
      const kind = actionId.slice('cable-trader.intervene.'.length);
      if (!['route-closure', 'release-reserve'].includes(kind)) {
        return { status: 'refused', reason: 'intervention_kind_invalid', kind };
      }
      const day = state.playback.day + 1;
      const id = `user-${kind}-day-${day}`;
      if ((activeConfig.simulation.interventions || []).some((row) => row.id === id)) {
        return { status: 'refused', reason: 'intervention_already_applied', interventionId: id };
      }
      activeConfig = {
        ...activeConfig,
        simulation: {
          ...activeConfig.simulation,
          interventions: [
            ...(activeConfig.simulation.interventions || []),
            { id, kind, day },
          ],
        },
      };
      sdk.events.propose({
        pluginId: 'cable-trader',
        kind: 'cable-trader.intervention-applied',
        intervention: { id, kind, day },
        scenario: {
          id: state.simulation.scenarioProfileId,
          seed: state.simulation.baseSeed,
          selectedCableFamilyIds: state.simulation.selectedCableFamilyIds,
        },
        playbackDay: state.playback.day,
      });
      const nextSimulation = sdk.state.read().simulation;
      appendNetworkReceipt(nextSimulation);
      await yieldBrowserTask();
      activeComparisonRun = await executeComparison(nextSimulation, 'cheapest-vs-fastest');
      await yieldBrowserTask();
      activeEnsembleRun = await executeEnsemble();
      activeComparisonSimulationId = nextSimulation.id;
      return {
        ...playbackAction(sdk.state.read()),
        intervention: { id, kind, day },
      };
    }

    function startPlayback() {
      const state = sdk.state.read();
      sdk.events.propose({
        pluginId: 'cable-trader',
        kind: 'cable-trader.playback-started',
        scenarioId: state.simulation.scenarioId,
        configurationHash: state.simulation.configurationHash,
        selectedCableFamilyIds: state.simulation.selectedCableFamilyIds,
      });
      return playbackAction(sdk.state.read());
    }

    function applyParameterValues(values) {
      const selectedCableFamilyIds = network.normalizeCableFamilyIds(
        activeConfig.cableTypes,
        values.selectedCableFamilyIds ?? activeConfig.simulation.selectedCableFamilyIds
      );
      activeConfig = {
        ...activeConfig,
        simulation: {
          ...activeConfig.simulation,
          selectedCableFamilyIds,
          durationDays: integerBetween(values.durationDays, activeConfig.simulation.durationDays, 6, 60, 'durationDays'),
          initialInventoryPerHubType: integerBetween(
            values.initialInventoryPerHubType,
            activeConfig.simulation.initialInventoryPerHubType,
            1,
            12,
            'initialInventoryPerHubType'
          ),
          demandPriority: enumValue(
            values.demandPriority,
            activeConfig.simulation.demandPriority,
            ['critical-first', 'deadline-first', 'balanced'],
            'demandPriority'
          ),
          allowSubstitutes: booleanValue(
            values.allowSubstitutes,
            activeConfig.simulation.allowSubstitutes,
            'allowSubstitutes'
          ),
          reservePolicy: enumValue(
            values.reservePolicy,
            activeConfig.simulation.reservePolicy,
            ['none', 'one-reel', 'twenty-percent'],
            'reservePolicy'
          ),
          transferCapacityMetersPerDay: integerBetween(
            values.transferCapacityMetersPerDay,
            activeConfig.simulation.transferCapacityMetersPerDay,
            50,
            10000,
            'transferCapacityMetersPerDay'
          ),
          allocationObjective: enumValue(
            values.allocationObjective,
            activeConfig.simulation.allocationObjective,
            ['cheapest', 'fastest', 'fairness-first'],
            'allocationObjective'
          ),
          fairnessWeight: numberBetween(
            values.fairnessWeight,
            activeConfig.simulation.fairnessWeight,
            0,
            5,
            'fairnessWeight'
          ),
          disruptionScenario: enumValue(
            values.disruptionScenario,
            activeConfig.simulation.disruptionScenario,
            ['none', 'road-closure', 'damaged-stock', 'surprise-demand', 'fairness-conflict'],
            'disruptionScenario'
          ),
        },
      };
    }

    function settle() {
      const state = sdk.state.read();
      const completed = state.playback.status === 'settled' && state.playback.day === state.simulation.durationDays;
      return {
        obligationResults: [
          {
            obligationId: `cable-trader:logistics-run:${state.simulation.id}`,
            status: completed ? 'settled' : 'unmet',
            evidence: {
              completedDays: state.playback.day,
              durationDays: state.simulation.durationDays,
              configurationHash: state.simulation.configurationHash,
              selectedCableFamilyIds: state.simulation.selectedCableFamilyIds,
              interventions: (activeConfig.simulation.interventions || []).map((row) => ({ ...row })),
            },
          },
          {
            obligationId: `cable-trader:reel-conservation:${state.simulation.id}`,
            status: completed && state.simulation.conservation.pass ? 'settled' : 'unmet',
            evidence: {
              ...state.simulation.conservation,
              configurationHash: state.simulation.configurationHash,
              selectedCableFamilyIds: state.simulation.selectedCableFamilyIds,
            },
          },
        ],
        stateIdentity: `${state.simulation.id}:day-${state.playback.day}:${state.playback.status}`,
        losses: completed ? [] : [{ kind: 'playback_incomplete', completedDays: state.playback.day, durationDays: state.simulation.durationDays }],
      };
    }

    function appendPlaybackReceipt(state) {
      sdk.receipts.append({
        schema: 'simulatte.plugin.cableTraderPlaybackReceipt.v1',
        simulationId: state.simulation.id,
        seed: state.simulation.seed,
        baseSeed: state.simulation.baseSeed,
        scenarioId: state.simulation.scenarioId,
        scenarioProfileId: state.simulation.scenarioProfileId,
        configurationHash: state.simulation.configurationHash,
        selectedCableFamilyIds: state.simulation.selectedCableFamilyIds,
        completedDays: state.playback.day,
        durationDays: state.simulation.durationDays,
        eventIds: state.simulation.events.map((row) => row.id),
        endingInventory: state.simulation.summary.endingInventory,
        fulfillmentPercent: state.simulation.summary.fulfillmentPercent,
        optimalityProven: state.simulation.summary.optimalityProven,
        dataReceiptIds: ['cable-trader:data:logistics-catalog', 'cable-trader:data:authored-scenario'],
        modelReceiptIds: ['cable-trader:model:event-generator', 'cable-trader:model:policy-scored-flow'],
        policyId: state.simulation.allocationPolicy,
        controls: {
          demandPriority: activeConfig.simulation.demandPriority,
          allowSubstitutes: activeConfig.simulation.allowSubstitutes,
          reservePolicy: activeConfig.simulation.reservePolicy,
          transferCapacityMetersPerDay: activeConfig.simulation.transferCapacityMetersPerDay,
          allocationObjective: activeConfig.simulation.allocationObjective,
          fairnessWeight: activeConfig.simulation.fairnessWeight,
          disruptionScenario: activeConfig.simulation.disruptionScenario,
        },
        interventions: (activeConfig.simulation.interventions || []).map((row) => ({ ...row })),
        conservation: state.simulation.conservation,
        transferReceipts: state.simulation.transfers.map((row) => ({
          id: row.id,
          projectId: row.projectId,
          reelId: row.reelId,
          sourceHubId: row.sourceHubId,
          destinationSiteId: row.destinationSiteId,
          cableFamilyId: row.cableFamilyId,
          quantityMeters: row.quantityMeters,
          dispatchDay: row.dispatchDay,
          arrivalDay: row.arrivalDay,
          reason: row.reason,
          rejectedAlternatives: row.rejectedAlternatives,
          downstreamConsequence: row.downstreamConsequence,
        })),
        origin: 'simulated',
        temporalStatus: 'forecast',
        uncertainty: { kind: 'distribution', value: { ensembleSize: 1, seed: state.simulation.seed, intervalStatus: 'not_computed' } },
        claimBoundary: state.simulation.claimBoundary,
      });
    }

    function contributeV4() {
      if (!v4Contribution?.createContribution) {
        throw new Error('cable_trader_v4_contribution_unavailable: core must load ./v4-contribution.js before requesting the v4 contribution');
      }
      return v4Contribution.createContribution({
        config: activeConfig,
        simulation: sdk.state.read().simulation,
        state: sdk.state.read(),
        transferRoutes,
        comparisonRuns: [...activeComparisonRuns.values()],
      });
    }

    return Object.freeze({
      id: 'cable-trader',
      contributeRequest,
      view,
      present,
      setScenario,
      setCableFamilies,
      capabilities: {
        // Generic logistics-service field (§17/§18). Food Recall consumes this rather
        // than reaching into Cable Trader's internal state: it returns a transit-delay
        // and availability prior derived from the current allocation, with a claim
        // boundary. Dependency direction stays one-way (logistics -> food recall).
        'field.logistics-service.v1': (input) => {
          const result = sdk.state.read().simulation;
          const summary = result.summary;
          const fulfillmentRate = summary.needs ? summary.fulfilledNeeds / summary.needs : 1;
          const meanTransferCost = summary.totalBurden / (summary.fulfilledNeeds || 1);
          return {
            schema: 'field.logistics-service.v1',
            value: Number((meanTransferCost).toFixed(2)), units: 'transfer_cost_units',
            fulfillmentRate: Number(fulfillmentRate.toFixed(3)),
            availabilityPrior: Number(fulfillmentRate.toFixed(3)),
            transitDelayHoursPrior: Number((6 + meanTransferCost * 2).toFixed(2)),
            providerId: 'cable-trader', requested: input || null,
            claimBoundary: 'Synthetic logistics-service prior from a seeded exchange-network simulation, not observed carrier performance.',
          };
        },
      },
      handleAction,
      settle,
      contributeV4,
      comparisonReceipt() {
        return activeComparisonRun.comparisonExecutionReceipt;
      },
      ensembleReceipt() {
        return activeEnsembleRun.receipt;
      },
      dispose() {},
    });
  }

    function createReducer(simulationFor) {
      return function reduce(state, event) {
        if (event.kind === 'cable-trader.scenario-selected') {
          const simulation = simulationFor(event.scenario);
          return {
            ...state,
            simulation,
            playback: { status: 'ready', day: 0 },
          };
        }
        if (event.kind === 'cable-trader.intervention-applied') {
          const simulation = simulationFor(event.scenario);
          return {
            ...state,
            simulation,
            playback: { status: 'running', day: event.playbackDay },
          };
        }
        return reducePlaybackState(state, event);
      };
  }

  function reducePlaybackState(state, event) {
    if (event.kind === 'cable-trader.playback-started') {
      return {
        ...state,
        playback: { status: 'running', day: 0 },
      };
    }
    if (event.kind === 'cable-trader.playback-advanced') {
      const snapshot = state.simulation.snapshots[event.day];
      return {
        ...state,
        playback: {
          status: event.day === state.simulation.durationDays ? 'settled' : 'running',
          day: event.day,
        },
      };
    }
    return state;
  }

  function resolveRenderedRequestCount(value) {
    if (!Number.isInteger(value) || value < 1) {
      throw new Error(`Cable Trader renderedRequestCount expected a positive integer, received ${value}`);
    }
    return Math.min(value, MAX_PRESENTATION_ACTORS);
  }

  function integerBetween(value, fallback, minimum, maximum, label) {
    if (value === undefined || value === null || value === '') return fallback;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
      throw new Error(`cable_trader_control_invalid: ${label} must be an integer from ${minimum} to ${maximum}`);
    }
    return parsed;
  }

  function numberBetween(value, fallback, minimum, maximum, label) {
    if (value === undefined || value === null || value === '') return fallback;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) {
      throw new Error(`cable_trader_control_invalid: ${label} must be a number from ${minimum} to ${maximum}`);
    }
    return parsed;
  }

  function enumValue(value, fallback, allowed, label) {
    if (value === undefined || value === null || value === '') return fallback;
    if (!allowed.includes(value)) {
      throw new Error(`cable_trader_control_invalid: ${label} must be one of ${allowed.join(', ')}`);
    }
    return value;
  }

  function booleanValue(value, fallback, label) {
    if (value === undefined || value === null || value === '') return fallback;
    if (typeof value !== 'boolean') {
      throw new Error(`cable_trader_control_invalid: ${label} must be a boolean`);
    }
    return value;
  }

  function hasParameterValues(values) {
    return [
      'selectedCableFamilyIds',
      'durationDays',
      'initialInventoryPerHubType',
      'demandPriority',
      'allowSubstitutes',
      'reservePolicy',
      'transferCapacityMetersPerDay',
      'allocationObjective',
      'fairnessWeight',
      'disruptionScenario',
    ]
      .some((key) => Object.prototype.hasOwnProperty.call(values || {}, key));
  }

  function visibleResult(state) {
    return state.simulation.snapshots[state.playback.day];
  }

  function playbackAction(state) {
    const status = state.playback.status === 'settled' ? 'settled' : 'running';
    return {
      status,
      currentStep: state.playback.day,
      totalSteps: state.simulation.durationDays,
      simulationId: state.simulation.id,
      scenarioId: state.simulation.scenarioId,
      configurationHash: state.simulation.configurationHash,
      selectedCableFamilyIds: state.simulation.selectedCableFamilyIds,
      summary: visibleResult(state).summary,
      interventions: (state.simulation.exogenous?.interventions || []).map((row) => ({ ...row })),
    };
  }

  function yieldBrowserTask() { return new Promise((resolve) => setTimeout(resolve, 0)); }

  function validateLogisticsCatalog(value) {
    if (value?.schema !== 'simulatte.cableLogisticsCatalog.v1'
      || value.id !== 'cable-logistics-catalog-v1'
      || !Array.isArray(value.sources)
      || value.sources.length < 3
      || !Array.isArray(value.families)
      || !value.families.length
      || !Array.isArray(value.modeledFields)
      || !value.modeledFields.length
      || typeof value.claimBoundary !== 'string') {
      throw new Error('cable_logistics_catalog_invalid');
    }
    const sourceIds = new Set(value.sources.map((row) => row.id));
    value.families.forEach((row) => {
      if (!row.id
        || !Array.isArray(row.sourceIds)
        || !row.sourceIds.length
        || row.sourceIds.some((id) => !sourceIds.has(id))
        || row.identityOrigin !== 'derived') {
        throw new Error(`cable_logistics_catalog_family_invalid: ${row.id || 'missing'}`);
      }
    });
    return value;
  }

  function validatePublicClaim(value) {
    if (typeof value !== 'string' || !value.trim()) {
      throw new Error('cable_public_claim_text_invalid');
    }
    const patterns = [
      /\b(?:observed|measured|actual|current|live|operational)\s+(?:hub\s+)?(?:demand|requests?|compatibility outcomes?|inventor(?:y|ies)|stock|transport costs?)\b/gi,
      /\b(?:observed|measured|actual|current|live|operational)(?:\s+[a-z-]+){1,3}\s+(?:demand|requests?|compatibility outcomes?|inventor(?:y|ies)|stock|transport costs?)\b/gi,
      /\b(?:demand|requests?|compatibility outcomes?|inventor(?:y|ies)|stock|transport costs?)\s+(?:is|are|reflects?|uses?)\s+(?:observed|measured|actual|current|live|operational)\b/gi,
    ];
    for (const pattern of patterns) {
      let match = pattern.exec(value);
      while (match) {
        const prefix = value.slice(Math.max(0, match.index - 16), match.index);
        if (!/\b(?:no|not|never|without)\s+$/i.test(prefix)) {
          throw new Error(`cable_public_claim_observed_operations_invalid: ${match[0]}`);
        }
        match = pattern.exec(value);
      }
    }
    return value;
  }

  return Object.freeze({
    activate,
    validatePublicClaim,
    datasetValidators: Object.freeze({
      'simulatte.cableLogisticsCatalog.v1': validateLogisticsCatalog,
    }),
  });
});
