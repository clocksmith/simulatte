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
  const api = factory(network, v4Contribution, comparisonDriver, ensembleRunner);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulattePluginCableTrader = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createCableTraderPlugin(
  network,
  v4Contribution,
  comparisonDriver,
  ensembleRunner
) {
  const MAX_PRESENTATION_ACTORS = 64;

  async function activate({ sdk, config, scenario = null }) {
    let activeConfig = config;
    const renderedRequestCount = resolveRenderedRequestCount(config.simulation.renderedRequestCount);
    const worldModel = sdk.worldQuery.model();
    const transferRoutes = config.hubs.flatMap((sourceHub) => config.hubs
      .filter((destinationHub) => destinationHub.id !== sourceHub.id)
      .map((destinationHub) => {
        const route = sdk.routing.plan({
          worldModel,
          originNodeId: sourceHub.nodeId,
          destinationNodeId: destinationHub.nodeId,
          mode: 'delivery_bike',
          tick: 0,
          mission: { constraints: { avoidStreetNames: [], lanePreference: 'protected' }, task: { type: 'point_to_point' } },
          policy: sdk.routing.policy(),
        });
        const distanceM = route.segmentIds.reduce((total, segmentId) => total + worldModel.segment(segmentId).lengthM, 0);
        return Object.freeze({
          id: `transfer-${sourceHub.id}-${destinationHub.id}`,
          sourceHubId: sourceHub.id,
          destinationHubId: destinationHub.id,
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
      return network.simulateNetwork(effectiveConfig, transferRoutes);
    };
    const simulation = simulationFor(scenario);
    const reduceState = createReducer(simulationFor);
    sdk.state.register(reduceState, {
      simulation,
      inventory: simulation.snapshots[0].inventory,
      credits: {},
      lastExchange: null,
      playback: { status: 'ready', day: 0 },
    });
    appendNetworkReceipt(simulation);
    let activeComparisonRun = await executeComparison(simulation);
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
        dataReceiptIds: ['cable-trader:data:compatibility-priors', 'cable-trader:data:authored-scenario'],
        modelReceiptIds: ['cable-trader:model:event-generator', 'cable-trader:model:min-cost-flow'],
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
        activeComparisonRun = await executeComparison(nextSimulation);
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

    async function executeComparison(interventionSimulation) {
      const driver = comparisonDriver || globalThis.SimulatteCableTraderComparison;
      if (!driver?.runComparison) {
        throw new Error('cable_trader_comparison_driver_unavailable');
      }
      const run = await driver.runComparison({
        config: activeConfig,
        transferRoutes,
        interventionSimulation,
      });
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

    function exchange({ cableTypeId, hubId, direction, requestId }) {
      const state = sdk.state.read();
      const key = `${hubId}:${cableTypeId}`;
      const available = state.inventory[key] || 0;
      if (!activeConfig.hubs.some((row) => row.id === hubId)
        || !state.simulation.selectedCableFamilyIds.includes(cableTypeId)) {
        return { status: 'refused', reason: 'exchange_selection_invalid' };
      }
      if (!['deposit', 'withdraw'].includes(direction)) return { status: 'refused', reason: 'exchange_direction_invalid' };
      if (direction === 'withdraw' && available < 1) return { status: 'refused', reason: 'inventory_unavailable' };
      if (typeof requestId !== 'string' || !requestId) return { status: 'refused', reason: 'modeled_request_id_invalid' };
      const event = {
        pluginId: 'cable-trader',
        kind: 'cable-trader.exchanged',
        cableTypeId,
        hubId,
        direction,
        requestId,
        creditDelta: direction === 'deposit' ? 1 : -1,
        scenarioId: state.simulation.scenarioId,
        configurationHash: state.simulation.configurationHash,
        selectedCableFamilyIds: state.simulation.selectedCableFamilyIds,
      };
      sdk.events.propose(event);
      return { status: 'settled', ...event };
    }

    function view() {
      const state = sdk.state.read();
      const result = visibleResult(state);
      const busiestHub = [...result.hubStats].sort((left, right) => right.needs - left.needs || left.id.localeCompare(right.id))[0];
      const busiestCable = [...result.typeStats].sort((left, right) => right.needs - left.needs || left.id.localeCompare(right.id))[0];
      const crossHubTransfers = result.flows.filter((flow) => flow.sourceHubId !== flow.destinationHubId).reduce((total, flow) => total + flow.quantity, 0);
      return [{
        slot: 'inspector',
        title: 'Optimal cable network',
        rows: [
          { label: 'Playback', value: `Day ${result.day} of ${result.durationDays} · ${state.playback.status}` },
          { label: 'Seeded month', value: `${state.simulation.durationDays} days · ${state.simulation.seed}` },
          { label: 'Cable families', value: state.simulation.selectedCableFamilyIds.join(', ') },
          { label: 'Needs served', value: result.summary.needs ? `${format(result.summary.fulfilledNeeds)} / ${format(result.summary.needs)} (${result.summary.fulfillmentPercent}%)` : '0 / 0 (not started)' },
          { label: 'Seeded input events', value: format(result.summary.randomEvents) },
          { label: 'Exact allocations', value: result.summary.allocations ? `${result.summary.optimalAllocations} / ${result.summary.allocations} (${result.summary.optimalityPercent}%)` : '0 / 0 (not started)' },
          { label: 'Inventory', value: `${format(result.summary.startingInventory)} → ${format(result.summary.endingInventory)}` },
          { label: 'Busiest hub', value: `${busiestHub.label} · ${format(busiestHub.needs)} modeled requests` },
          { label: 'Top cable', value: `${busiestCable.label} · ${format(busiestCable.needs)} modeled requests` },
          { label: 'Modeled service level', value: result.summary.needs ? `${result.summary.fulfillmentPercent.toFixed(1)}%` : 'not started' },
          {
            label: 'Scenario variance',
            value: distributionRange(
              activeEnsembleRun.distributions.branches.intervention.fulfillmentPercent,
              '% fulfillment'
            ),
          },
          { label: 'Average transport cost', value: `${(result.summary.totalBurden / (result.summary.fulfilledNeeds || 1)).toFixed(2)} modeled cost units` },
          ...(state.lastExchange ? [{ label: 'Last live exchange', value: `${state.lastExchange.direction} · ${state.lastExchange.hubId}` }] : []),
        ],
        actions: [],
      }, {
        slot: 'map',
        title: '30-day cable city',
        rows: [
          { label: 'Modeled demand events', value: format(result.summary.modeledRequests) },
          { label: 'Rendered request sample', value: `${format(renderedRequestCount)} of ${format(result.summary.modeledRequests)} modeled requests` },
          { label: 'Cross-hub transfers', value: format(crossHubTransfers) },
          { label: 'Solver', value: 'Exact min-cost maximum-flow' },
        ],
        actions: [
          { id: 'focus-network', label: 'Whole network', command: { kind: 'camera.focus', targetId: 'cable-network-overview' } },
          ...activeConfig.hubs.map((hub) => ({ id: `focus-${hub.id}`, label: hub.label, command: { kind: 'camera.focus', targetId: hub.id } })),
        ],
      }];
    }

    function present() {
      const state = sdk.state.read();
      const result = visibleResult(state);
      const routeByPair = new Map(transferRoutes.map((route) => [`${route.sourceHubId}:${route.destinationHubId}`, route]));
      const activeFlows = result.flows.filter((flow) => flow.sourceHubId !== flow.destinationHubId && flow.quantity > 0);
      const maximumNeeds = Math.max(...result.hubStats.map((hub) => hub.needs), 1);
      if (!activeFlows.length) {
        return {
          schema: 'simulatte.pluginPresentation.v1',
          markers: result.hubStats.map((hub) => ({
            id: hub.id,
            label: `${hub.label}: ${format(hub.fulfilled)} served · ${format(hub.endingInventory)} stock`,
            nodeId: activeConfig.hubs.find((row) => row.id === hub.id).nodeId,
            tone: hub.needs === maximumNeeds ? 'green' : 'amber',
            heightM: 16 + (Math.sqrt(hub.needs / maximumNeeds) * 20),
            radiusM: 4 + (Math.sqrt(hub.needs / maximumNeeds) * 3),
            intensity: 0.7 + ((hub.needs / maximumNeeds) * 0.8),
          })),
          paths: [],
          actors: [],
          cameraTargets: [
            { id: 'cable-network-overview', label: 'Cable exchange network', nodeIds: activeConfig.hubs.map((hub) => hub.nodeId), segmentIds: [], distanceM: 3000 },
            ...activeConfig.hubs.map((hub) => ({ id: hub.id, label: hub.label, nodeIds: [hub.nodeId], segmentIds: [], distanceM: 620 })),
          ],
        };
      }
      const maximumFlow = Math.max(...activeFlows.map((flow) => flow.quantity), 1);
      const paths = activeFlows.map((flow, index) => {
        const route = routeByPair.get(`${flow.sourceHubId}:${flow.destinationHubId}`);
        if (!route) return null;
        return {
          id: route.id,
          label: `${format(flow.quantity)} optimal transfers`,
          segmentIds: route.segmentIds,
          tone: flowTone(index),
          widthM: 1.2 + (Math.sqrt(flow.quantity / maximumFlow) * 3.2),
          intensity: 0.45 + ((flow.quantity / maximumFlow) * 1.25),
        };
      }).filter(Boolean);
      const visibleRequestCount = Math.ceil(renderedRequestCount * (result.day / result.durationDays));
      const actors = Array.from({ length: visibleRequestCount }, (_, index) => {
        const flow = selectFlow(activeFlows, index, visibleRequestCount);
        const route = routeByPair.get(`${flow.sourceHubId}:${flow.destinationHubId}`);
        if (!route) return null;
        return {
          id: `modeled-cable-request-${index + 1}`,
          label: `Modeled request ${index + 1}`,
          kind: index % 5 === 0 ? 'scooter' : 'bicycle',
          segmentIds: route.segmentIds,
          tone: flowTone(activeFlows.indexOf(flow)),
          speedMps: 4.4 + ((index % 7) * 0.24),
          phaseOffsetM: (index * 173) % 2400,
          isSelected: false,
        };
      }).filter(Boolean);
      const allSegments = [...new Set(transferRoutes.flatMap((route) => route.segmentIds))];
      return {
        schema: 'simulatte.pluginPresentation.v1',
        markers: result.hubStats.map((hub) => ({
          id: hub.id,
          label: `${hub.label}: ${format(hub.fulfilled)} served · ${format(hub.endingInventory)} stock`,
          nodeId: activeConfig.hubs.find((row) => row.id === hub.id).nodeId,
          tone: hub.needs === maximumNeeds ? 'green' : 'amber',
          heightM: 16 + (Math.sqrt(hub.needs / maximumNeeds) * 20),
          radiusM: 4 + (Math.sqrt(hub.needs / maximumNeeds) * 3),
          intensity: 0.7 + ((hub.needs / maximumNeeds) * 0.8),
        })),
        paths,
        actors,
        cameraTargets: [
          { id: 'cable-network-overview', label: 'Cable exchange network', nodeIds: activeConfig.hubs.map((hub) => hub.nodeId), segmentIds: allSegments, distanceM: 3000 },
          ...activeConfig.hubs.map((hub) => ({ id: hub.id, label: hub.label, nodeIds: [hub.nodeId], segmentIds: [], distanceM: 620 })),
        ],
      };
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
        return executeComparison(sdk.state.read().simulation).then((run) => {
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
          durationDays: integerBetween(values.durationDays, activeConfig.simulation.durationDays, 1, 365, 'durationDays'),
          initialInventoryPerHubType: integerBetween(
            values.initialInventoryPerHubType,
            activeConfig.simulation.initialInventoryPerHubType,
            1,
            100000,
            'initialInventoryPerHubType'
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
            obligationId: `cable-trader:month:${state.simulation.id}`,
            status: completed ? 'settled' : 'unmet',
            evidence: {
              completedDays: state.playback.day,
              durationDays: state.simulation.durationDays,
              configurationHash: state.simulation.configurationHash,
              selectedCableFamilyIds: state.simulation.selectedCableFamilyIds,
            },
          },
          {
            obligationId: `cable-trader:optimality:${state.simulation.id}`,
            status: completed && state.simulation.summary.optimalityProven ? 'settled' : 'unmet',
            evidence: {
              optimalAllocations: state.simulation.summary.optimalAllocations,
              allocations: state.simulation.summary.allocations,
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
        dataReceiptIds: ['cable-trader:data:compatibility-priors', 'cable-trader:data:authored-scenario'],
        modelReceiptIds: ['cable-trader:model:event-generator', 'cable-trader:model:min-cost-flow'],
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
        'inventory.exchange.v1': exchange,
        'settlement.credit.v1': exchange,
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
          inventory: simulation.snapshots[0].inventory,
          lastExchange: null,
          playback: { status: 'ready', day: 0 },
        };
      }
      return reducePlaybackState(state, event);
    };
  }

  function reducePlaybackState(state, event) {
    if (event.kind === 'cable-trader.playback-started') {
      return {
        ...state,
        inventory: state.simulation.snapshots[0].inventory,
        lastExchange: null,
        playback: { status: 'running', day: 0 },
      };
    }
    if (event.kind === 'cable-trader.playback-advanced') {
      const snapshot = state.simulation.snapshots[event.day];
      return {
        ...state,
        inventory: snapshot.inventory,
        playback: {
          status: event.day === state.simulation.durationDays ? 'settled' : 'running',
          day: event.day,
        },
      };
    }
    if (event.kind !== 'cable-trader.exchanged') return state;
    const key = `${event.hubId}:${event.cableTypeId}`;
    const inventory = { ...state.inventory, [key]: (state.inventory[key] || 0) + (event.direction === 'deposit' ? 1 : -1) };
    const credits = { ...state.credits, [event.requestId]: (state.credits[event.requestId] || 0) + event.creditDelta };
    return { ...state, inventory, credits, lastExchange: { cableTypeId: event.cableTypeId, hubId: event.hubId, direction: event.direction } };
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

  function hasParameterValues(values) {
    return ['selectedCableFamilyIds', 'durationDays', 'initialInventoryPerHubType']
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
    };
  }

  function selectFlow(flows, index, count) {
    const total = flows.reduce((sum, flow) => sum + flow.quantity, 0);
    let target = ((index + 0.5) / count) * total;
    for (const flow of flows) { target -= flow.quantity; if (target <= 0) return flow; }
    return flows.at(-1);
  }

  function flowTone(index) { return ['cyan', 'blue', 'magenta', 'violet', 'green', 'amber'][index % 6]; }
  function format(value) { return Number(value).toLocaleString('en-US'); }
  function distributionRange(distribution, unit) {
    return `${distribution.minimum.toFixed(2)}–${distribution.maximum.toFixed(2)} ${unit} · declared seeds`;
  }
  function yieldBrowserTask() { return new Promise((resolve) => setTimeout(resolve, 0)); }

  function validateCompatibilityPriors(value) {
    if (value?.schema !== 'simulatte.cableCompatibilityPriors.v1'
      || value.id !== 'cable-compatibility-priors-v1'
      || !Array.isArray(value.sources)
      || !value.sources.length
      || !Array.isArray(value.rows)
      || !value.rows.length
      || !Array.isArray(value.scenarioOnlyCableTypeIds)
      || typeof value.claimBoundary !== 'string') {
      throw new Error('cable_compatibility_priors_invalid');
    }
    const sourceIds = new Set(value.sources.map((row) => row.id));
    value.rows.forEach((row) => {
      if (!row.id
        || !Array.isArray(row.connectorFamilyIds)
        || !row.connectorFamilyIds.length
        || !Array.isArray(row.sourceIds)
        || row.sourceIds.some((id) => !sourceIds.has(id))
        || !row.origin
        || !row.temporalStatus
        || !row.uncertainty) {
        throw new Error(`cable_compatibility_prior_row_invalid: ${row.id || 'missing'}`);
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
      'simulatte.cableCompatibilityPriors.v1': validateCompatibilityPriors,
    }),
  });
});
