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

    function ensureRoutes() {
      const hubs = activeConfig.hubs.slice(0, activeConfig.simulation.hubCount);
      const locations = activeConfig.locations.slice(0, activeConfig.simulation.locationCount);
      hubs.forEach((hub) => locations.forEach((location) => {
        planDirection(hub, location, 'from-hub', hub.nodeId, location.nodeId);
        planDirection(hub, location, 'to-hub', location.nodeId, hub.nodeId);
      }));
      return [...routeCache.values()];
    }

    function planDirection(hub, location, direction, originNodeId, destinationNodeId) {
      const key = circulation.routeKey(hub.id, location.id, direction);
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
        id: `route-${hub.id}-${location.id}-${direction}`,
        hubId: hub.id,
        locationId: location.id,
        direction,
        segmentIds: route.segmentIds,
        distanceM,
      });
    }

    function simulationFor(nextScenario = null) {
      if (nextScenario) activeConfig = withScenario(activeConfig, nextScenario);
      return circulation.simulateCirculation(activeConfig, ensureRoutes());
    }

    const simulation = simulationFor();
    sdk.state.register(createReducer(simulationFor), {
      simulation,
      playback: { status: 'ready', day: 0 },
    });
    appendNetworkReceipt(simulation);

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
        locationIds: result.activeLocationIds,
        selectedCableTypeIds: result.selectedCableTypeIds,
        summary: result.summary,
        balance: result.balance,
        origin: 'simulated',
        temporalStatus: 'forecast',
        claimBoundary: result.claimBoundary,
      });
    }

    async function setScenario(nextScenario) {
      sdk.events.propose({
        pluginId: 'cable-trader',
        kind: 'cable-trader.scenario-selected',
        scenario: {
          id: nextScenario?.id || activeConfig.simulation.scenarioId || 'everyday-exchange',
          seed: nextScenario?.seed || activeConfig.simulation.seed,
        },
      });
      const nextSimulation = sdk.state.read().simulation;
      appendNetworkReceipt(nextSimulation);
      return nextSimulation.summary;
    }

    function view() {
      const state = sdk.state.read();
      return presentation.createViews({
        config: activeConfig,
        simulation: state.simulation,
        playback: state.playback,
      });
    }

    function present() {
      const state = sdk.state.read();
      return presentation.createPresentation({
        config: activeConfig,
        simulation: state.simulation,
        playback: state.playback,
        routes: ensureRoutes(),
      });
    }

    function handleAction(actionId, context = {}) {
      if (actionId !== 'scenario.run') {
        return { status: 'refused', reason: 'unknown_action', actionId };
      }
      const phase = context.values?.phase;
      if (phase === 'start' && hasParameterValues(context.values)) {
        applyParameterValues(context.values);
        return setScenario({
          id: context.scenario?.id || activeConfig.simulation.scenarioId,
          seed: context.scenario?.seed || activeConfig.simulation.seed,
        }).then(startPlayback);
      }
      const state = sdk.state.read();
      if (phase === undefined) {
        startPlayback();
        for (let day = 1; day <= state.simulation.durationDays; day += 1) advancePlayback(day);
        appendPlaybackReceipt(sdk.state.read());
        return { ...playbackAction(sdk.state.read()), compatibilityMode: 'eager_v1_v3_host' };
      }
      if (phase === 'start') return startPlayback();
      if (phase === 'step') {
        if (state.playback.status !== 'running') {
          return { status: 'refused', reason: 'playback_not_running' };
        }
        const day = Math.min(state.simulation.durationDays, state.playback.day + 1);
        advancePlayback(day);
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
      });
      return playbackAction(sdk.state.read());
    }

    function advancePlayback(day) {
      const state = sdk.state.read();
      sdk.events.propose({
        pluginId: 'cable-trader',
        kind: 'cable-trader.playback-advanced',
        day,
        scenarioId: state.simulation.scenarioId,
        configurationHash: state.simulation.configurationHash,
      });
    }

    function applyParameterValues(values) {
      const selectedCableTypeIds = circulation.normalizeCableTypeIds(
        activeConfig.cableTypes,
        values.selectedCableTypeIds ?? activeConfig.simulation.selectedCableTypeIds
      );
      activeConfig = {
        ...activeConfig,
        simulation: {
          ...activeConfig.simulation,
          peopleCount: integerBetween(
            values.peopleCount,
            activeConfig.simulation.peopleCount,
            1000,
            25000,
            'peopleCount'
          ),
          hubCount: integerBetween(
            values.hubCount,
            activeConfig.simulation.hubCount,
            2,
            activeConfig.hubs.length,
            'hubCount'
          ),
          locationCount: integerBetween(
            values.locationCount,
            activeConfig.simulation.locationCount,
            4,
            activeConfig.locations.length,
            'locationCount'
          ),
          selectedCableTypeIds,
        },
      };
    }

    function contributeRequest({ sourceText, mission = null }) {
      if (!/\b(?:cable|hub|inventory|supply|demand|exchange|reuse|recycling)\b/i.test(sourceText || '')) {
        return null;
      }
      if (!mission) {
        return {
          recognized: true,
          executableSourceText: `Bike from ${activeConfig.locations[0].label} to ${activeConfig.hubs[0].label}.`,
          obligations: [],
          unresolved: [],
        };
      }
      const activeSimulation = sdk.state.read().simulation;
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
        && state.playback.day === state.simulation.durationDays;
      return {
        obligationResults: [
          {
            obligationId: `cable-trader:circulation-run:${state.simulation.id}`,
            status: completed ? 'settled' : 'unmet',
            evidence: {
              completedDays: state.playback.day,
              durationDays: state.simulation.durationDays,
              peopleCount: state.simulation.people.length,
              configurationHash: state.simulation.configurationHash,
            },
          },
          {
            obligationId: `cable-trader:cable-balance:${state.simulation.id}`,
            status: completed && state.simulation.balance.pass ? 'settled' : 'unmet',
            evidence: { ...state.simulation.balance },
          },
        ],
        stateIdentity: `${state.simulation.id}:day-${state.playback.day}:${state.playback.status}`,
        losses: completed
          ? []
          : [{
            kind: 'playback_incomplete',
            completedDays: state.playback.day,
            durationDays: state.simulation.durationDays,
          }],
      };
    }

    function appendPlaybackReceipt(state) {
      sdk.receipts.append({
        schema: 'simulatte.plugin.cableTraderPlaybackReceipt.v2',
        simulationId: state.simulation.id,
        scenarioId: state.simulation.scenarioId,
        configurationHash: state.simulation.configurationHash,
        completedDays: state.playback.day,
        durationDays: state.simulation.durationDays,
        peopleCount: state.simulation.people.length,
        eventIds: state.simulation.events.map((row) => row.id),
        summary: state.simulation.summary,
        balance: state.simulation.balance,
        origin: 'simulated',
        temporalStatus: 'forecast',
        claimBoundary: state.simulation.claimBoundary,
      });
    }

    function contributeV4() {
      if (!v4Contribution?.createContribution) {
        throw new Error('cable_trader_v4_contribution_unavailable');
      }
      const state = sdk.state.read();
      return v4Contribution.createContribution({
        config: activeConfig,
        simulation: state.simulation,
        state,
        routes: ensureRoutes(),
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
          const result = sdk.state.read().simulation;
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

  function createReducer(simulationFor) {
    return function reduce(state, event) {
      if (event.kind === 'cable-trader.scenario-selected') {
        return {
          ...state,
          simulation: simulationFor(event.scenario),
          playback: { status: 'ready', day: 0 },
        };
      }
      if (event.kind === 'cable-trader.playback-started') {
        return {
          ...state,
          playback: { status: 'running', day: 0 },
        };
      }
      if (event.kind === 'cable-trader.playback-advanced') {
        return {
          ...state,
          playback: {
            status: event.day === state.simulation.durationDays ? 'settled' : 'running',
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
    return ['peopleCount', 'hubCount', 'locationCount', 'selectedCableTypeIds']
      .some((key) => Object.prototype.hasOwnProperty.call(values || {}, key));
  }

  function playbackAction(state) {
    const visible = state.simulation.snapshots[state.playback.day];
    return {
      status: state.playback.status === 'settled' ? 'settled' : 'running',
      currentStep: state.playback.day,
      totalSteps: state.simulation.durationDays,
      simulationId: state.simulation.id,
      scenarioId: state.simulation.scenarioId,
      configurationHash: state.simulation.configurationHash,
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
