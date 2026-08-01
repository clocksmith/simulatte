(function attachCableTraderPlugin(root, factory) {
  const circulation = typeof module === 'object' && module.exports
    ? require('./circulation-simulation.js')
    : root.SimulatteCableTraderCirculation;
  const v4Contribution = typeof module === 'object' && module.exports
    ? require('./v4-contribution.js')
    : root.SimulatteCableTraderV4Contribution;
  const presentation = typeof module === 'object' && module.exports
    ? require('./circulation-presentation.js')
    : root.SimulatteCableTraderPresentation;
  const api = factory(circulation, v4Contribution, presentation);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulattePluginCableTrader = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createCableTraderPlugin(
  circulation,
  v4Contribution,
  presentation
) {
  async function activate({ sdk, config, scenario = null }) {
    let activeConfig = withScenario(config, scenario);
    const worldModel = sdk.worldQuery.model();
    const routeCache = new Map();
    let activeNetwork = circulation.createNetwork(activeConfig, worldModel);

    function routesForVisibleJourneys(simulation, day) {
      const visible = simulation.snapshots[day];
      const hubById = new Map(activeNetwork.hubs.map((row) => [row.id, row]));
      const residenceById = new Map(activeNetwork.residences.map((row) => [row.id, row]));
      visible.visibleJourneys.forEach((journey) => {
        const hub = hubById.get(journey.hubId);
        const residence = residenceById.get(journey.residenceId);
        const direction = journey.action === 'dropoff' ? 'to-hub' : 'from-hub';
        const originNodeId = direction === 'from-hub' ? hub.nodeId : residence.nodeId;
        const destinationNodeId = direction === 'from-hub' ? residence.nodeId : hub.nodeId;
        planDirection(hub, residence, direction, originNodeId, destinationNodeId);
      });
      const visibleIds = new Set(visible.visibleJourneys.map((row) => row.routeId));
      return [...routeCache.values()].filter((row) => visibleIds.has(row.id));
    }

    function planDirection(hub, residence, direction, originNodeId, destinationNodeId) {
      const key = circulation.routeKey(hub.id, residence.id, direction);
      if (routeCache.has(key)) return;
      const route = sdk.routing.plan({
        worldModel,
        originNodeId,
        destinationNodeId,
        mode: 'delivery_bike',
        tick: 0,
        mission: {
          constraints: {
            avoidStreetNames: [],
            lanePreference: 'protected',
          },
          task: { type: 'point_to_point' },
        },
        policy: sdk.routing.policy(),
      });
      const distanceM = route.segmentIds.reduce(
        (total, segmentId) => total + worldModel.segment(segmentId).lengthM,
        0
      );
      routeCache.set(key, {
        id: circulation.routeId(hub.id, residence.id, direction),
        hubId: hub.id,
        residenceId: residence.id,
        direction,
        segmentIds: route.segmentIds,
        distanceM,
      });
    }

    function simulationFor(nextScenario = null) {
      if (nextScenario) activeConfig = withScenario(activeConfig, nextScenario);
      routeCache.clear();
      activeNetwork = circulation.createNetwork(activeConfig, worldModel);
      return circulation.simulateCirculation(activeConfig, activeNetwork);
    }

    let activeSimulation = simulationFor();
    sdk.state.register(createReducer({
      selectScenario(nextScenario) {
        activeSimulation = simulationFor(nextScenario);
      },
      durationDays() {
        return activeSimulation.durationDays;
      },
    }), {
      playback: { status: 'ready', day: 0 },
    });
    appendNetworkReceipt(activeSimulation);

    function appendNetworkReceipt(result) {
      sdk.receipts.append({
        schema: 'simulatte.plugin.cableTraderCirculationReceipt.v1',
        simulationId: result.id,
        scenarioId: result.scenarioId,
        seed: result.seed,
        configurationHash: result.configurationHash,
        durationDays: result.durationDays,
        peopleCount: result.people.length,
        hubIds: result.activeHubIds,
        residenceCount: result.residences.length,
        selectedCableTypeIds: result.selectedCableTypeIds,
        summary: result.summary,
        balance: result.balance,
        origin: 'simulated',
        temporalStatus: 'forecast',
        claimBoundary: result.claimBoundary,
      });
    }

    async function setScenario(nextScenario, { forceRebuild = false } = {}) {
      const scenarioId = nextScenario?.id || activeConfig.simulation.scenarioId || 'everyday-exchange';
      const seed = nextScenario?.seed || activeConfig.simulation.seed;
      const reuseSimulation = !forceRebuild
        && scenarioId === activeConfig.simulation.scenarioId
        && seed === activeConfig.simulation.seed;
      sdk.events.propose({
        pluginId: 'cable-trader',
        kind: 'cable-trader.scenario-selected',
        scenario: {
          id: scenarioId,
          seed,
        },
        reuseSimulation,
      });
      appendNetworkReceipt(activeSimulation);
      return activeSimulation.summary;
    }

    function view() {
      const state = sdk.state.read();
      return presentation.createViews({
        config: activeConfig,
        simulation: activeSimulation,
        playback: state.playback,
      });
    }

    function present() {
      const state = sdk.state.read();
      return presentation.createPresentation({
        config: activeConfig,
        simulation: activeSimulation,
        playback: state.playback,
        routes: routesForVisibleJourneys(activeSimulation, state.playback.day),
      });
    }

    function handleAction(actionId, context = {}) {
      if (actionId !== 'scenario.run') {
        return { status: 'refused', reason: 'unknown_action', actionId };
      }
      const phase = context.values?.phase;
      if (phase === 'start' && hasParameterValues(context.values)) {
        const nextScenario = {
          id: context.scenario?.id || activeConfig.simulation.scenarioId,
          seed: context.scenario?.seed || activeConfig.simulation.seed,
        };
        const parametersChanged = applyParameterValues(context.values);
        const scenarioChanged = nextScenario.id !== activeConfig.simulation.scenarioId
          || nextScenario.seed !== activeConfig.simulation.seed;
        if (parametersChanged || scenarioChanged) {
          return setScenario(nextScenario, { forceRebuild: parametersChanged })
            .then(() => startPlayback({ presentationChanged: true }));
        }
        return startPlayback({ presentationChanged: false });
      }
      const state = sdk.state.read();
      if (phase === undefined) {
        startPlayback();
        for (let day = 1; day <= activeSimulation.durationDays; day += 1) advancePlayback(day);
        appendPlaybackReceipt(sdk.state.read().playback);
        return {
          ...playbackAction(activeSimulation, sdk.state.read().playback),
          compatibilityMode: 'eager_v1_v3_host',
        };
      }
      if (phase === 'start') return startPlayback({ presentationChanged: false });
      if (phase === 'step') {
        if (state.playback.status !== 'running') {
          return { status: 'refused', reason: 'playback_not_running' };
        }
        const day = Math.min(activeSimulation.durationDays, state.playback.day + 1);
        advancePlayback(day);
        const nextState = sdk.state.read();
        if (nextState.playback.status === 'settled') appendPlaybackReceipt(nextState.playback);
        return playbackAction(activeSimulation, nextState.playback);
      }
      return { status: 'refused', reason: 'scenario_phase_invalid', phase: phase || null };
    }

    function startPlayback({ presentationChanged = false } = {}) {
      sdk.events.propose({
        pluginId: 'cable-trader',
        kind: 'cable-trader.playback-started',
        scenarioId: activeSimulation.scenarioId,
        configurationHash: activeSimulation.configurationHash,
      });
      return {
        ...playbackAction(activeSimulation, sdk.state.read().playback),
        presentationChanged,
      };
    }

    function advancePlayback(day) {
      sdk.events.propose({
        pluginId: 'cable-trader',
        kind: 'cable-trader.playback-advanced',
        day,
        scenarioId: activeSimulation.scenarioId,
        configurationHash: activeSimulation.configurationHash,
      });
    }

    function applyParameterValues(values) {
      const selectedCableTypeIds = circulation.normalizeCableTypeIds(
        activeConfig.cableTypes,
        values.selectedCableTypeIds ?? activeConfig.simulation.selectedCableTypeIds
      );
      const nextSimulation = {
        ...activeConfig.simulation,
        peopleCount: integerBetween(
          values.peopleCount,
          activeConfig.simulation.peopleCount,
          64,
          10000,
          'peopleCount'
        ),
        hubCount: integerBetween(
          values.hubCount,
          activeConfig.simulation.hubCount,
          4,
          64,
          'hubCount'
        ),
        selectedCableTypeIds,
      };
      const changed = nextSimulation.peopleCount !== activeConfig.simulation.peopleCount
        || nextSimulation.hubCount !== activeConfig.simulation.hubCount
        || nextSimulation.selectedCableTypeIds.join('|')
          !== activeConfig.simulation.selectedCableTypeIds.join('|');
      if (changed) activeConfig = {
        ...activeConfig,
        simulation: nextSimulation,
      };
      return changed;
    }

    function contributeRequest({ sourceText, mission = null }) {
      if (!/\b(?:cable|hub|inventory|supply|demand|exchange|reuse|recycling)\b/i.test(sourceText || '')) {
        return null;
      }
      if (!mission) {
        return {
          recognized: true,
          executableSourceText: `Bike from ${activeNetwork.residences[0].label} to ${activeNetwork.hubs[0].label}.`,
          obligations: [],
          unresolved: [],
        };
      }
      return {
        recognized: true,
        obligations: [{
          id: `cable-trader:circulation-run:${activeSimulation.id}`,
          kind: 'community_cable_circulation',
          required: true,
        }],
        unresolved: [],
      };
    }

    function settle() {
      const state = sdk.state.read();
      const completed = state.playback.status === 'settled'
        && state.playback.day === activeSimulation.durationDays;
      return {
        obligationResults: [
          {
            obligationId: `cable-trader:circulation-run:${activeSimulation.id}`,
            status: completed ? 'settled' : 'unmet',
            evidence: {
              completedDays: state.playback.day,
              durationDays: activeSimulation.durationDays,
              peopleCount: activeSimulation.people.length,
              configurationHash: activeSimulation.configurationHash,
            },
          },
          {
            obligationId: `cable-trader:cable-balance:${activeSimulation.id}`,
            status: completed && activeSimulation.balance.pass ? 'settled' : 'unmet',
            evidence: { ...activeSimulation.balance },
          },
        ],
        stateIdentity: `${activeSimulation.id}:day-${state.playback.day}:${state.playback.status}`,
        losses: completed
          ? []
          : [{
            kind: 'playback_incomplete',
            completedDays: state.playback.day,
            durationDays: activeSimulation.durationDays,
          }],
      };
    }

    function appendPlaybackReceipt(playback) {
      sdk.receipts.append({
        schema: 'simulatte.plugin.cableTraderPlaybackReceipt.v2',
        simulationId: activeSimulation.id,
        scenarioId: activeSimulation.scenarioId,
        configurationHash: activeSimulation.configurationHash,
        completedDays: playback.day,
        durationDays: activeSimulation.durationDays,
        peopleCount: activeSimulation.people.length,
        eventIds: activeSimulation.events.map((row) => row.id),
        summary: activeSimulation.summary,
        balance: activeSimulation.balance,
        origin: 'simulated',
        temporalStatus: 'forecast',
        claimBoundary: activeSimulation.claimBoundary,
      });
    }

    function contributeV4() {
      if (!v4Contribution?.createContribution) {
        throw new Error('cable_trader_v4_contribution_unavailable');
      }
      const state = sdk.state.read();
      return v4Contribution.createContribution({
        config: activeConfig,
        simulation: activeSimulation,
        state,
        routes: routesForVisibleJourneys(activeSimulation, state.playback.day),
      });
    }

    return Object.freeze({
      id: 'cable-trader',
      contributeRequest,
      view,
      present,
      setScenario,
      capabilities: {
        'field.logistics-service.v1': (input) => {
          const result = activeSimulation;
          const fulfillmentRate = result.summary.totalDemand
            ? result.summary.cablesReused / result.summary.totalDemand
            : 1;
          return {
            schema: 'field.logistics-service.v1',
            value: Number((1 - fulfillmentRate).toFixed(3)),
            units: 'modeled_unmet_share',
            fulfillmentRate: Number(fulfillmentRate.toFixed(3)),
            availabilityPrior: Number(fulfillmentRate.toFixed(3)),
            transitDelayHoursPrior: 1,
            providerId: 'cable-trader',
            requested: input || null,
            claimBoundary: 'Synthetic availability prior from a modeled community cable exchange, not observed carrier performance.',
          };
        },
      },
      handleAction,
      settle,
      contributeV4,
      dispose() {},
    });
  }

  function createReducer({ selectScenario, durationDays }) {
    return function reduce(state, event) {
      if (event.kind === 'cable-trader.scenario-selected') {
        if (!event.reuseSimulation) selectScenario(event.scenario);
        return {
          playback: { status: 'ready', day: 0 },
        };
      }
      if (event.kind === 'cable-trader.playback-started') {
        return {
          playback: { status: 'running', day: 0 },
        };
      }
      if (event.kind === 'cable-trader.playback-advanced') {
        return {
          playback: {
            status: event.day === durationDays() ? 'settled' : 'running',
            day: event.day,
          },
        };
      }
      return state;
    };
  }

  function withScenario(config, scenario) {
    return {
      ...config,
      simulation: {
        ...config.simulation,
        scenarioId: scenario?.id || config.simulation.scenarioId || 'everyday-exchange',
        seed: scenario?.seed || config.simulation.seed,
      },
    };
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
    return ['peopleCount', 'hubCount', 'selectedCableTypeIds']
      .some((key) => Object.prototype.hasOwnProperty.call(values || {}, key));
  }

  function playbackAction(simulation, playback) {
    const visible = simulation.snapshots[playback.day];
    return {
      status: playback.status === 'settled' ? 'settled' : 'running',
      currentStep: playback.day,
      totalSteps: simulation.durationDays,
      simulationId: simulation.id,
      scenarioId: simulation.scenarioId,
      configurationHash: simulation.configurationHash,
      summary: {
        day: visible.day,
        supply: visible.global.supply,
        demand: visible.global.demand,
        fulfilled: visible.global.fulfilled,
        waiting: visible.global.waiting,
        journeys: visible.global.journeys,
        cumulativeReused: visible.cumulative.fulfilled,
      },
    };
  }

  function validateCirculationCatalog(value) {
    if (value?.schema !== 'simulatte.cableCirculationCatalog.v1'
      || value.id !== 'cable-circulation-catalog-v1'
      || !Array.isArray(value.typeTaxonomy)
      || !value.typeTaxonomy.length
      || !Array.isArray(value.modeledFields)
      || !value.modeledFields.length
      || typeof value.claimBoundary !== 'string') {
      throw new Error('cable_circulation_catalog_invalid');
    }
    if (value.typeTaxonomy.some((row) => (
      !row.id || !row.family || !row.commonUse || row.identityOrigin !== 'authored'
    ))) {
      throw new Error('cable_circulation_catalog_type_invalid');
    }
    return value;
  }

  function validatePublicClaim(value) {
    if (typeof value !== 'string' || !value.trim()) {
      throw new Error('cable_public_claim_text_invalid');
    }
    const observedOperations = /\b(?:observed|measured|actual|current|live|operational)\s+(?:community\s+)?(?:demand|supply|requests?|inventory|stock|pickups?|drop-?offs?)\b/i;
    if (observedOperations.test(value)
      && !/\b(?:not|never|no|without)\b/i.test(value.slice(0, observedOperations.exec(value).index))) {
      throw new Error('cable_public_claim_observed_operations_invalid');
    }
    return value;
  }

  return Object.freeze({
    activate,
    validatePublicClaim,
    datasetValidators: Object.freeze({
      'simulatte.cableCirculationCatalog.v1': validateCirculationCatalog,
    }),
  });
});
