(function attachSunWalkerPlugin(root, factory) {
  const exposure = typeof module === 'object' && module.exports
    ? require('./sun-exposure.js')
    : root.SimulatteSunExposure;
  const routeSimulation = typeof module === 'object' && module.exports
    ? require('./sun-route-simulation.js')
    : root.SimulatteSunWalkerRouteSimulation;
  const presentation = typeof module === 'object' && module.exports
    ? require('./presentation.js')
    : root.SimulatteSunWalkerPresentation;
  const compatibility = typeof module === 'object' && module.exports
    ? require('./compatibility-adapter.js')
    : root.SimulatteSunWalkerCompatibility;
  const api = factory(exposure, routeSimulation, presentation, compatibility);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulattePluginSunWalker = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createSunWalkerPlugin(
  exposure,
  routeSimulation,
  presentationApi,
  compatibilityApi
) {
  const GOVERNANCE_DATASET_ID = 'sun-walker.model-governance.v1';

  async function activate({ sdk, config, scenario = null }) {
    const world = sdk.worldQuery.snapshot();
    const worldModel = sdk.worldQuery.model();
    const governance = sdk.datasets.require(GOVERNANCE_DATASET_ID);
    const governanceReceipt = sdk.datasets.receipt(GOVERNANCE_DATASET_ID);
    const buildingReceipt = sdk.datasets.receipt('world.buildings.v1');
    let activeScenario = scenario;
    sdk.state.register(reduce, {
      simulation: null,
      playback: { status: 'idle', step: 0 },
      scenario: activeScenario,
    });

    function simulateMission(mission) {
      if (!mission) throw pluginError('sun_mission_required', 'Sun Walker requires a resolved route mission');
      const routes = sdk.routing.alternatives(mission, config.maximumAlternatives);
      const departureAt = sdk.clock.instantForMission(mission);
      const simulation = routeSimulation.simulate({
        world,
        worldModel,
        routes,
        departureAt,
        config,
        seed: activeScenario?.seed || config.seed,
        buildingReceipt,
        governance,
        governanceReceipt,
      });
      sdk.events.propose({ pluginId: 'sun-walker', kind: 'sun-walker.simulation-created', simulation });
      appendSelectionReceipt(simulation);
      return simulation;
    }

    function appendSelectionReceipt(simulation) {
      const selected = candidate(simulation, simulation.selectedCandidateId);
      sdk.receipts.append({
        schema: 'simulatte.plugin.sunWalkerSelectionReceipt.v2',
        simulationId: simulation.id,
        seed: simulation.seed,
        dataReceiptId: simulation.dataReceipt.id,
        modelReceiptId: simulation.modelReceipt.id,
        selectedSegmentIds: selected.route.segmentIds,
        comparison: simulation.comparison,
        uncertainty: simulation.modelReceipt.uncertainty,
        claimBoundary: simulation.claimBoundary,
      });
    }

    function contributeRequest({ sourceText, mission }) {
      if (!mission) return null;
      if (!recognizesSunIntent(sourceText)) {
        sdk.events.propose({ pluginId: 'sun-walker', kind: 'sun-walker.cleared' });
        return null;
      }
      const simulation = simulateMission(mission);
      const selected = candidate(simulation, simulation.selectedCandidateId);
      return {
        recognized: true,
        obligations: [{ id: 'sun-walker:direct-sun-exposure', kind: 'direct_sun_exposure', required: true }],
        unresolved: [],
        missionPatch: {
          routeOverride: {
            segmentIds: [...selected.route.segmentIds],
            environmentFieldId: simulation.dataReceipt.id,
            selectionId: simulation.id,
            objective: selected.metrics.objective,
            algorithm: 'sun_walker_arrival_sample_route_v2',
          },
        },
      };
    }

    function createRouteContributor({ mission }) {
      const origin = exposure.worldOrigin(world);
      const buildings = exposure.compiledBuildings(world);
      const utcInstant = sdk.clock.instantForMission(mission);
      const sun = exposure.solarPosition(utcInstant, origin.lat, origin.lon);
      const exposureBySegmentId = new Map();
      return {
        id: 'sun-walker:sun-exposure',
        costDimensionIds: Object.freeze(['sunExposureSeconds']),
        canRejectSegments: false,
        evaluateSegment({ segment }) {
          let row = exposureBySegmentId.get(segment.id);
          if (!row) {
            row = exposure.segmentExposureRow({
              segment,
              buildings,
              sun,
              sampleSpacingM: config.sampleSpacingM,
              minimumSolarElevationDegrees: config.minimumSolarElevationDegrees,
            });
            exposureBySegmentId.set(segment.id, row);
          }
          return {
            eligible: true,
            costDimensions: { sunExposureSeconds: row.output.directSunSeconds },
            rejectionReasons: [],
            receipt: {
              ...row.output,
              modelId: 'fixed-departure-routing-approximation-v1',
              claimBoundary: 'This routing contribution uses departure-time sun as a search approximation. Final selection is recomputed at every simulated sample arrival.',
            },
          };
        },
      };
    }

    function setScenario(nextScenario) {
      activeScenario = nextScenario;
      sdk.events.propose({ pluginId: 'sun-walker', kind: 'sun-walker.scenario-selected', scenario: nextScenario });
      return { status: 'ready', seed: activeScenario?.seed || config.seed };
    }

    function handleAction(actionId, context = {}) {
      if (actionId === 'sun-walker.select-control') {
        return {
          status: 'deferred',
          reason: 'shared_branching_runtime_required',
          acceptedValues: context.values || {},
          controlDefinitions: sdk.state.read().simulation?.controls || [],
        };
      }
      if (actionId !== 'scenario.run') return { status: 'refused', reason: 'unknown_action', actionId };
      const phase = context.values?.phase;
      const state = sdk.state.read();
      if (!state.simulation) return { status: 'refused', reason: 'simulation_missing' };
      if (phase === 'start') {
        sdk.events.propose({ pluginId: 'sun-walker', kind: 'sun-walker.playback-started' });
        return playbackAction(sdk.state.read());
      }
      if (phase === 'step') {
        if (state.playback.status !== 'running') return { status: 'refused', reason: 'playback_not_running' };
        const finalStep = state.simulation.timeline.snapshots.length - 1;
        const step = Math.min(finalStep, state.playback.step + 1);
        sdk.events.propose({ pluginId: 'sun-walker', kind: 'sun-walker.playback-advanced', step });
        const nextState = sdk.state.read();
        if (nextState.playback.status === 'settled') appendPlaybackReceipt(nextState);
        return playbackAction(nextState);
      }
      return { status: 'refused', reason: 'scenario_phase_invalid', phase: phase || null };
    }

    function appendPlaybackReceipt(state) {
      const finalSnapshot = state.simulation.timeline.snapshots.at(-1);
      sdk.receipts.append({
        schema: 'simulatte.plugin.sunWalkerPlaybackReceipt.v1',
        simulationId: state.simulation.id,
        completedEvents: state.simulation.timeline.eventCount,
        finalState: finalSnapshot.state,
        comparisonId: state.simulation.comparison.id,
        dataReceiptId: state.simulation.dataReceipt.id,
        modelReceiptId: state.simulation.modelReceipt.id,
        claimBoundary: state.simulation.claimBoundary,
      });
    }

    function semanticPresentation() {
      const state = sdk.state.read();
      if (!state.simulation) return null;
      return presentationApi.semanticPresentation(state.simulation, state.playback.step);
    }

    function present() {
      const state = sdk.state.read();
      if (!state.simulation) return null;
      return compatibilityApi.legacyPresentation({
        simulation: state.simulation,
        step: state.playback.step,
        world,
      });
    }

    function view(context = {}) {
      const state = sdk.state.read();
      if (!state.simulation) {
        return {
          slot: context.compositionSize === 1 ? 'map' : 'inspector',
          title: 'Sun Walker',
          rows: [
            { label: 'Activation', value: 'Ask for shade or less direct sun' },
            { label: 'Inputs', value: 'Governed buildings + modeled solar position' },
            { label: 'Boundary', value: 'Clear sky; no trees or weather' },
          ],
          actions: [],
        };
      }
      const simulation = state.simulation;
      const selected = candidate(simulation, simulation.selectedCandidateId);
      const fastest = candidate(simulation, simulation.fastestCandidateId);
      const snapshot = simulation.timeline.snapshots[state.playback.step];
      const latestSample = selected.samples[Math.max(0, snapshot.state.completedSamples - 1)];
      const rows = [
        { label: 'Simulation', value: `${snapshot.state.status} · ${snapshot.state.completedSamples}/${snapshot.state.totalSamples} samples` },
        { label: 'Shade-selected', value: `${Math.round(selected.metrics.modeledBuildingShadePercent)}% modeled building shade` },
        { label: 'Fastest', value: `${Math.round(fastest.metrics.modeledBuildingShadePercent)}% modeled building shade` },
        { label: 'Direct sun', value: `${Math.round(snapshot.state.directSunSeconds)} of ${Math.round(selected.metrics.directSunSeconds)} s` },
        { label: 'Added travel', value: `${Math.round(simulation.comparison.metrics.travelSeconds.difference)} s` },
        {
          label: 'Sun',
          value: `${Math.round(latestSample.solarPosition.azimuthDegrees)}° azimuth · ${Math.round(latestSample.solarPosition.elevationDegrees)}° elevation`,
        },
        { label: 'Data', value: `${simulation.dataReceipt.datasets[0].sourceRowIds.length.toLocaleString('en-US')} governed building rows` },
        { label: 'Uncertainty', value: 'Trees, weather, awnings, diffuse light missing' },
      ];
      return [
        { slot: 'inspector', title: 'Arrival-time sun exposure', rows, actions: [] },
        {
          slot: 'hud',
          title: 'Sun + shade',
          rows: [rows[0], rows[1], rows[3]],
          actions: [],
        },
      ];
    }

    function settle() {
      const state = sdk.state.read();
      if (!state.simulation) return null;
      const finalStep = state.simulation.timeline.snapshots.length - 1;
      const completed = state.playback.status === 'settled' && state.playback.step === finalStep;
      return {
        obligationResults: [{
          obligationId: 'sun-walker:direct-sun-exposure',
          status: completed ? 'settled' : 'not_settled',
          evidence: {
            simulationId: state.simulation.id,
            completedEvents: state.playback.step,
            requiredEvents: finalStep,
            comparisonId: state.simulation.comparison.id,
          },
        }],
        stateIdentity: `${state.simulation.id}:step-${state.playback.step}:${state.playback.status}`,
        losses: completed
          ? Object.entries(state.simulation.modelReceipt.uncertainty.value)
            .filter(([, value]) => value)
            .map(([kind, value]) => ({ kind: `uncertainty_${kind}`, value }))
          : [{ kind: 'simulation_incomplete', completedEvents: state.playback.step, requiredEvents: finalStep }],
      };
    }

    const capabilities = {
      'field.thermal-comfort.v1': (input) => thermalComfortField(input, sdk),
    };
    return Object.freeze({
      id: 'sun-walker',
      contributeRequest,
      createRouteContributor,
      setScenario,
      handleAction,
      settle,
      view,
      present,
      semanticPresentation,
      simulationState: () => sdk.state.read().simulation
        ? sdk.state.read().simulation.timeline.snapshots[sdk.state.read().playback.step]
        : null,
      eventTimeline: () => sdk.state.read().simulation?.timeline || null,
      comparisonModel: () => sdk.state.read().simulation?.comparison || null,
      controlModel: () => sdk.state.read().simulation?.controls || [],
      capabilities,
      dispose() {},
    });
  }

  function reduce(state, event) {
    if (event.kind === 'sun-walker.cleared') {
      return { ...state, simulation: null, playback: { status: 'idle', step: 0 } };
    }
    if (event.kind === 'sun-walker.scenario-selected') {
      return { ...state, scenario: event.scenario, simulation: null, playback: { status: 'idle', step: 0 } };
    }
    if (event.kind === 'sun-walker.simulation-created') {
      return { ...state, simulation: event.simulation, playback: { status: 'ready', step: 0 } };
    }
    if (event.kind === 'sun-walker.playback-started') {
      return { ...state, playback: { status: 'running', step: 0 } };
    }
    if (event.kind === 'sun-walker.playback-advanced') {
      const finalStep = state.simulation.timeline.snapshots.length - 1;
      return {
        ...state,
        playback: {
          status: event.step === finalStep ? 'settled' : 'running',
          step: event.step,
        },
      };
    }
    return state;
  }

  function playbackAction(state) {
    const finalStep = state.simulation.timeline.snapshots.length - 1;
    return {
      status: state.playback.status === 'settled' ? 'settled' : 'running',
      currentStep: state.playback.step,
      totalSteps: finalStep,
      simulationId: state.simulation.id,
      state: state.simulation.timeline.snapshots[state.playback.step],
      viewIntents: presentationApi.semanticPresentation(state.simulation, state.playback.step).viewIntents,
    };
  }

  function thermalComfortField(input, sdk) {
    if (!sdk.environment) return { enabled: false, reason: 'environment_unavailable' };
    if (!input || !Number.isFinite(input.longitude) || !Number.isFinite(input.latitude)) {
      return { value: null, reason: 'coordinate_required' };
    }
    const instant = input.instant || '2026-07-01T17:00:00Z';
    const sample = sdk.environment.sample({
      instant,
      longitude: input.longitude,
      latitude: input.latitude,
      fields: ['airTemperatureC', 'solarElevationDegrees'],
    });
    const solarRad = Math.max(0, Math.sin(sample.values.solarElevationDegrees * Math.PI / 180));
    const meanRadiantTemperatureC = Number((sample.values.airTemperatureC + 18 * solarRad).toFixed(2));
    const state = sdk.state.read();
    const visible = state.simulation?.timeline.snapshots[state.playback.step]?.state;
    return {
      schema: 'field.thermal-comfort.v1',
      value: meanRadiantTemperatureC,
      units: 'mean_radiant_temperature_c_proxy',
      airTemperatureC: sample.values.airTemperatureC,
      thermalDoseSunSeconds: visible?.directSunSeconds || 0,
      providerId: 'sun-walker',
      sourceSnapshotIds: sample.sourceSnapshotIds,
      truth: {
        origin: 'modeled',
        temporalStatus: 'snapshot',
        uncertainty: { kind: 'missing', value: { physiologicalCalibration: true, humidity: true, wind: true } },
      },
      claimBoundary: 'Clear-sky mean-radiant-temperature proxy from a pinned environment snapshot and modeled direct-sun exposure. It is not measured thermal comfort.',
    };
  }

  function validateGovernance(value) {
    if (!value || value.schema !== 'simulatte.sunWalkerModelGovernance.v1' || value.id !== GOVERNANCE_DATASET_ID) {
      throw pluginError('sun_governance_schema_invalid', value?.schema || 'missing');
    }
    if (!Array.isArray(value.sources) || value.sources.length < 2 || !Array.isArray(value.models) || !value.models.length) {
      throw pluginError('sun_governance_content_invalid', value.id);
    }
    return value;
  }

  function recognizesSunIntent(value) {
    return /\b(?:shade|shaded|shadier|less\s+direct\s+sun|avoid(?:ing)?\s+(?:the\s+)?sun|hot\s+day)\b/i.test(value || '');
  }

  function candidate(simulation, id) {
    return simulation.candidates.find((row) => row.id === id);
  }

  function pluginError(code, message) {
    const error = new Error(`${code}: ${message}`);
    error.name = 'SunWalkerPluginError';
    error.code = code;
    return error;
  }

  return Object.freeze({
    activate,
    datasetValidators: Object.freeze({
      'simulatte.sunWalkerModelGovernance.v1': validateGovernance,
    }),
  });
});
