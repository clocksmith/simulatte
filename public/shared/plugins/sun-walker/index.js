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
  const v4 = typeof module === 'object' && module.exports
    ? require('./v4-contribution.js')
    : root.SimulatteSunWalkerV4;
  const environment = typeof module === 'object' && module.exports
    ? require('./environment.js')
    : root.SimulatteSunWalkerEnvironment;
  const api = factory(exposure, routeSimulation, presentation, compatibility, v4, environment);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulattePluginSunWalker = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createSunWalkerPlugin(
  exposure,
  routeSimulation,
  presentationApi,
  compatibilityApi,
  v4Api,
  environmentApi
) {
  const GOVERNANCE_DATASET_ID = 'sun-walker.model-governance.v1';
  const ENVIRONMENT_DATASET_ID = 'sun-walker.environment.v1';

  async function activate({ sdk, config, scenario = null }) {
    const world = sdk.worldQuery.snapshot();
    const worldModel = sdk.worldQuery.model();
    const governance = sdk.datasets.require(GOVERNANCE_DATASET_ID);
    const environment = sdk.datasets.require(ENVIRONMENT_DATASET_ID);
    const governanceReceipt = sdk.datasets.receipt(GOVERNANCE_DATASET_ID);
    const environmentReceipt = sdk.datasets.receipt(ENVIRONMENT_DATASET_ID);
    const buildingReceipt = sdk.datasets.receipt('world.buildings.v1');
    let activeConfig = { ...config };
    let activeScenario = scenario;
    let activeMission = null;
    let activeDepartureAt = null;
    sdk.state.register(reduce, {
      simulation: null,
      playback: { status: 'idle', step: 0 },
      scenario: activeScenario,
    });

    function simulateMission(mission) {
      if (!mission) throw pluginError('sun_mission_required', 'Sun Walker requires a resolved route mission');
      activeMission = mission;
      const routes = sdk.routing.alternatives(mission, activeConfig.maximumAlternatives);
      const departureAt = activeDepartureAt || sdk.clock.instantForMission(mission);
      const simulation = routeSimulation.simulate({
        world,
        worldModel,
        routes,
        departureAt,
        config: activeConfig,
        seed: activeScenario?.seed || activeConfig.seed,
        buildingReceipt,
        governance,
        governanceReceipt,
        environment,
        environmentReceipt,
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
              sampleSpacingM: activeConfig.sampleSpacingM,
              minimumSolarElevationDegrees: activeConfig.minimumSolarElevationDegrees,
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
      activeMission = null;
      activeDepartureAt = null;
      sdk.events.propose({ pluginId: 'sun-walker', kind: 'sun-walker.scenario-selected', scenario: nextScenario });
      return { status: 'ready', seed: activeScenario?.seed || activeConfig.seed };
    }

    function handleAction(actionId, context = {}) {
      if (actionId === 'sun-walker.select-control') {
        applyControlValues(context.values || {});
        const mission = activeMission || sdk.routing.resolveMission(activeScenario?.missionText || '');
        const simulation = simulateMission(mission);
        return {
          status: 'settled',
          simulationId: simulation.id,
          controls: simulation.controls,
        };
      }
      if (actionId === 'counterfactual.compare') {
        const simulation = sdk.state.read().simulation;
        if (!simulation?.comparison?.metrics) {
          return { status: 'refused', reason: 'comparison_missing' };
        }
        const comparisonBranches = Object.fromEntries(['baseline', 'intervention'].map((role) => [
          role,
          Object.fromEntries(Object.entries(simulation.comparison.metrics)
            .map(([id, values]) => [id, values[role]])),
        ]));
        return {
          status: 'settled',
          comparisonId: simulation.comparison.id,
          comparisonBranches,
          comparison: simulation.comparison,
        };
      }
      if (actionId !== 'scenario.run') return { status: 'refused', reason: 'unknown_action', actionId };
      const phase = context.values?.phase;
      let state = sdk.state.read();
      if (phase === 'start') {
        activeScenario = context.scenario || activeScenario;
        if (hasControlValues(context.values) || !state.simulation) {
          applyControlValues(context.values || {});
          simulateMission(activeMission || sdk.routing.resolveMission(activeScenario?.missionText || ''));
          state = sdk.state.read();
        }
      }
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

    function applyControlValues(values) {
      activeConfig = {
        ...activeConfig,
        maximumAddedTimeSeconds: finiteControl(values.maximumAddedTimeSeconds, activeConfig.maximumAddedTimeSeconds, 0, Infinity, 'maximumAddedTimeSeconds'),
        maximumAddedRatio: finiteControl(values.maximumAddedRatio, activeConfig.maximumAddedRatio, 0, Infinity, 'maximumAddedRatio'),
        directSunWeight: finiteControl(values.directSunWeight, activeConfig.directSunWeight, 0, Infinity, 'directSunWeight'),
        walkingSpeedMps: finiteControl(values.walkingSpeedMps, activeConfig.walkingSpeedMps, Number.EPSILON, 3, 'walkingSpeedMps'),
        treeCanopyParticipation: booleanControl(values.treeCanopyParticipation, activeConfig.treeCanopyParticipation, 'treeCanopyParticipation'),
        weatherParticipation: booleanControl(values.weatherParticipation, activeConfig.weatherParticipation, 'weatherParticipation'),
      };
      if (values.departureAt !== undefined) activeDepartureAt = datetimeControl(values.departureAt, 'departureAt');
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

    function contributeV4() {
      const state = sdk.state.read();
      if (!state.simulation) return null;
      return v4Api.createContribution({
        simulation: state.simulation,
        step: state.playback.step,
        buildingReceipt,
        governanceReceipt,
        environmentReceipt,
      });
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
            { label: 'Inputs', value: 'Governed buildings, historical tree identities, and pinned weather analog' },
            { label: 'Boundary', value: 'Canopy envelopes and weather attenuation are modeled; conditions are not live' },
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
        { label: 'Canopy', value: `${Math.round(selected.metrics.modeledCanopyShadePercent)}% modeled historical-canopy shade` },
        { label: 'Fastest', value: `${Math.round(fastest.metrics.modeledBuildingShadePercent)}% modeled building shade` },
        { label: 'Direct sun', value: `${Math.round(snapshot.state.directSunSeconds)} of ${Math.round(selected.metrics.travelSeconds)} s` },
        { label: 'Added travel', value: `${Math.round(simulation.comparison.metrics.travelSeconds.difference)} s` },
        {
          label: 'Sun',
          value: `${Math.round(latestSample.solarPosition.azimuthDegrees)}° azimuth · ${Math.round(latestSample.solarPosition.elevationDegrees)}° elevation`,
        },
        { label: 'Data', value: `${simulation.dataReceipt.datasets[0].sourceRowIds.length.toLocaleString('en-US')} governed building rows` },
        {
          label: 'Environment',
          value: `${latestSample.environment.weather.skyCode || 'weather off'} · ${latestSample.occluderKind || 'no occluder'}`,
        },
        { label: 'Uncertainty', value: 'Current canopy/weather, awnings, diffuse and reflected light remain missing' },
      ];
      return [
        { slot: 'inspector', title: 'Arrival-time sun exposure', rows, actions: [] },
        {
          slot: 'hud',
          title: 'Sun + shade',
          rows: [rows[0], rows[1], rows[4]],
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
      contributeV4,
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

  function finiteControl(value, fallback, minimum, maximum, label) {
    if (value === undefined || value === null || value === '') return fallback;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) {
      throw pluginError('sun_control_invalid', `${label} must be between ${minimum} and ${maximum}`);
    }
    return parsed;
  }

  function booleanControl(value, fallback, label) {
    if (value === undefined || value === null || value === '') return fallback;
    if (typeof value !== 'boolean') throw pluginError('sun_control_invalid', `${label} must be boolean`);
    return value;
  }

  function datetimeControl(value, label) {
    const text = String(value);
    const normalized = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(text)
      ? `${text}Z`
      : text;
    if (!Number.isFinite(Date.parse(normalized))) throw pluginError('sun_control_invalid', `${label} must be a valid date and time`);
    return new Date(normalized).toISOString();
  }

  function hasControlValues(values) {
    return [
      'maximumAddedTimeSeconds',
      'maximumAddedRatio',
      'directSunWeight',
      'walkingSpeedMps',
      'treeCanopyParticipation',
      'weatherParticipation',
      'departureAt',
    ].some((key) => Object.prototype.hasOwnProperty.call(values || {}, key));
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
      'simulatte.sunWalkerEnvironment.v1': environmentApi.validateDataset,
    }),
  });
});
