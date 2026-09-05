(function attachAutonomyApp(root, factory) {
  const api = factory(Object.freeze({
    hostRoot: root,
    dataLoader: (root.SimulatteApplicationLoader || root.SimulatteDataLoader),
    missionApi: root.SimulatteAutonomyMission,
    controllerApi: root.SimulatteAutonomyController,
    canvasApi: root.SimulatteAutonomyCanvas,
    traceApi: (root.SimulatteAutonomyTraceView || root.SimulatteMissionTrace),
    runtimeLog: (root.SimulatteAutonomyRuntimeLog || root.SimulatteRuntimeLog),
    neuralPlaceApi: root.SimulatteNeuralPlaceResolver,
    ledgerApi: (root.SimulatteJourneyLedger || root.SimulatteSettlementLedger),
    receiptsApi: (root.SimulatteAutonomyReceipts || root.SimulatteCanonicalReceipts),
    worldApi: root.SimulatteAutonomyWorld,
    neuralConsentApi: (root.SimulatteNeuralModelConsent || root.SimulatteNeuralConsent),
    modelSelectionApi: root.SimulatteModelSelection,
    runtimeLoaderApi: root.SimulatteWorldRuntimeLoader,
    pluginRuntimeApi: root.SimulattePluginRuntime,
    pluginRegistry: root.SimulatteGeneratedPluginRegistry,
    pluginUiApi: root.SimulatteDeclarativeUiHost,
    transportApi: root.SimulatteBrowserTransport,
    artifactStoreApi: root.SimulatteGovernedArtifactStore,
    routePlannerApi: root.SimulatteAutonomyRoutePlanner,
    civilTimeApi: root.SimulatteCivilTime,
    universeParserApi: root.SimulatteUniverseParser,
    applicationProfileSelectApi: root.SimulatteApplicationProfileSelect,
    experienceCameraApi: root.SimulatteExperienceCamera,
    pluginAssetPathsApi: root.SimulattePluginAssetPaths,
    pluginRandomApi: root.SimulattePluginRandom,
    pluginSchedulerApi: root.SimulattePluginScheduler,
    pluginEnvironmentApi: root.SimulattePluginEnvironment,
    pluginGeographyApi: root.SimulattePluginGeography,
    pluginComputeApi: root.SimulattePluginCompute,
    simulationClockApi: root.SimulatteSimulationClock,
    viewDirectorApi: root.SimulatteViewDirector,
    pluginViewRuntimeApi: typeof module === 'object' && module.exports
      ? require('./plugin-view-runtime.js')
      : root.SimulattePluginViewRuntime,
    mountLifecycleApi: root.SimulatteMountLifecycle,
    mainViewApi: typeof module === 'object' && module.exports
      ? require('./main-view.js')
      : root.SimulatteMainView,
    pluginPlaybackApi: typeof module === 'object' && module.exports
      ? require('./plugin-playback.js')
      : root.SimulattePluginPlayback,
    cityInterfaceApi: typeof module === 'object' && module.exports
      ? require('./city-interface.js')
      : root.SimulatteCityInterface,
    mainControllerBuilderApi: typeof module === 'object' && module.exports
      ? require('./main-controller-builder.js')
      : root.SimulatteMainControllerBuilder,
    mainSupportApi: typeof module === 'object' && module.exports
      ? require('./main-support.js')
      : root.SimulatteMainSupport,
    profileProgramApi: typeof module === 'object' && module.exports ? require('./profile-program.js') : root.SimulatteProfileProgram,
    journeyRecorderApi: typeof module === 'object' && module.exports ? require('./journey-recorder.js') : root.SimulatteJourneyRecorder,
    cityRunControlsApi: typeof module === 'object' && module.exports ? require('./city-run-controls.js') : root.SimulatteCityRunControls,
    cityPluginSessionApi: typeof module === 'object' && module.exports ? require('./city-plugin-session.js') : root.SimulatteCityPluginSession,
    appRenderWorkApi: typeof module === 'object' && module.exports ? require('./app-render-work.js') : root.SimulatteAppRenderWork,
  }));
  root.SimulatteAutonomyApp = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createAutonomyApp(dependencies) {
  const { hostRoot, dataLoader, missionApi, controllerApi, canvasApi, traceApi, runtimeLog, neuralPlaceApi, ledgerApi, receiptsApi, worldApi, neuralConsentApi, modelSelectionApi, runtimeLoaderApi, pluginRuntimeApi, pluginRegistry, pluginUiApi, transportApi, artifactStoreApi, routePlannerApi, civilTimeApi, universeParserApi, applicationProfileSelectApi, experienceCameraApi, pluginAssetPathsApi, pluginRandomApi, pluginSchedulerApi, pluginEnvironmentApi, pluginGeographyApi, pluginComputeApi, simulationClockApi, pluginViewRuntimeApi, mountLifecycleApi, mainViewApi, pluginPlaybackApi, cityInterfaceApi, mainControllerBuilderApi, mainSupportApi, profileProgramApi, appRenderWorkApi, cityPluginSessionApi, cityRunControlsApi, journeyRecorderApi } = dependencies;
  if (!journeyRecorderApi || !cityRunControlsApi || !cityPluginSessionApi || !cityInterfaceApi || !mainViewApi || !mainControllerBuilderApi || !mainSupportApi || !profileProgramApi || !appRenderWorkApi) {
    throw new Error('simulatte_app_view_dependency_missing');
  }
  const { collectElements, populateApplicationProfiles, applicationProfileLabel, setRuntimeStatus, runtimeLabel, renderIdentity, renderPlaceResolution, renderPlanning, configureExperienceShell, renderExperienceSummary, renderPlayback } = mainViewApi;
  const { wireCameraControls, selectCameraMode, wireInterfaceControls, setJourneyPhase, resizeMissionInput, clearMissionError, isMissionInputError, friendlyMissionError, updateButtons } = cityInterfaceApi;
  const { record: recordRenderWork, receipt: renderWorkReceipt } = appRenderWorkApi;
  const log = runtimeLog || {
    info: () => null,
    warn: () => null,
    error: () => null,
    serializeError: (error) => ({ name: error?.name || 'Error', message: error?.message || String(error) }),
  };
  const {
    applyPluginMissionContributions,
    createRenderer,
    environmentInstant,
    failRuntime,
    launchBrowserApp,
    renderLedger,
    renderPolicyArena,
    validateImportedJourneyReceipt,
    wireProfileSelection,
    wireReceiptControls,
  } = mainSupportApi.create({
    hostRoot, receiptsApi, civilTimeApi, setJourneyPhase, isMissionInputError,
    friendlyMissionError, setRuntimeStatus, updateButtons, canvasApi,
    wireCameraControls, selectCameraMode, log,
  });
  async function start(initialTier = 'city', requestedProfileId = null, hooks = {}) {
    if (!experienceCameraApi?.applyInitialCamera || !experienceCameraApi?.runCameraMode) throw new Error('Experience camera dependency is unavailable');
    const elements = collectElements();
    let routeSimulation = hooks.simulation || null;
    let activeCameraMode = hooks.routeState?.camera || null;
    const lifecycle = mountLifecycleApi.create(hooks.signal);
    const on = lifecycle.on;
    const loadTrace = runtimeLog?.createLoadTrace?.(log, { details: { tier: initialTier, requestedProfileId, route: typeof window !== 'undefined' ? window.location.pathname + window.location.search : null, scenarioId: hooks.simulation?.scenarioId || null } }) || null;
    const timedLoadStage = (name, operation, details = {}) => loadTrace?.run(name, operation, details) || operation();
    let extensions = null;
    let profileSelectUi = null;
    let tierVisualizer = null;
    let renderer = null;
    let rendererPromise = null;
    let placeResolver = null;
    let frameRequest = null;
    let pluginSession = null;
    let pluginViewRuntime = null;
    let pluginPlayback = null, pluginUi = null;
    let profileProgram = null, latestJourneyReceipt = null;
    let neuralGate = null;
    let buildRevision = 0;
    let routeParametersApplied = false;
    let missionUrlTimer = null;
    let isRunning = false;
    let disposal = null;

    async function disposeApplication() {
      if (disposal) return disposal;
      disposal = (async () => {
        isRunning = false;
        if (missionUrlTimer !== null) clearTimeout(missionUrlTimer);
        missionUrlTimer = null;
        buildRevision += 1;
        pluginSession?.dispose();
        if (frameRequest !== null) cancelAnimationFrame(frameRequest);
        frameRequest = null;
        lifecycle.abort();
        elements.applicationProfile.disabled = true;
        const resources = {
          profileSelectUi, placeResolver, tierVisualizer, renderer, extensions, pluginUi, neuralGate, profileProgram,
        };
        profileSelectUi = null;
        placeResolver = null;
        tierVisualizer = null;
        renderer = null;
        rendererPromise = null;
        extensions = null;
        pluginUi = null;
        neuralGate = null;
        profileProgram = null;
        await mountLifecycleApi.disposeAll([
          { resource: 'place-resolver', dispose: () => resources.placeResolver?.unload() },
          { resource: 'tier-visualizer', dispose: () => resources.tierVisualizer?.destroy() },
          { resource: 'renderer', dispose: () => resources.renderer?.destroy() },
          { resource: 'plugin-playback', dispose: () => pluginPlayback?.dispose() },
          { resource: 'plugin-ui', dispose: () => resources.pluginUi?.dispose() },
          { resource: 'profile-program', dispose: () => resources.profileProgram?.dispose() },
          { resource: 'plugin-runtime', dispose: () => resources.extensions?.dispose() },
          { resource: 'profile-select', dispose: () => resources.profileSelectUi?.dispose() },
          { resource: 'neural-consent', dispose: () => resources.neuralGate?.dispose() },
        ], ({ resource, error }) => log.warn('app.dispose.resource_failed', {
          resource,
          error: log.serializeError(error),
        }));
      })();
      return disposal;
    }

    try {
      const interfaceUi = wireInterfaceControls(elements, lifecycle.signal);
      setJourneyPhase('loading');
      log.info('app.boot.started', {
        build: document.querySelector('meta[name="simulatte-build"]')?.content || null,
        location: window.location.href,
        userAgent: navigator.userAgent,
      });
      setRuntimeStatus(elements, 'Loading', 'loading');
      if (!runtimeLoaderApi?.loadSelectedProduct) throw new Error('World runtime loader dependency is unavailable');
      await timedLoadStage('runtime.bootstrap', () => runtimeLoaderApi.loadSelectedProduct({ tierId: 'city', profileId: requestedProfileId }));
      lifecycle.throwIfAborted();
      let data;
      data = await timedLoadStage('application.data', () => dataLoader.loadApplication(undefined, lifecycle.fetch, { requestedProfileId, deferRenderGeometry: true }));
      lifecycle.throwIfAborted();
    if (hooks.routeState?.profile && hooks.routeState.profile !== data.applicationProfile.id) throw routeIdentityError('profile', hooks.routeState.profile, data.applicationProfile.id);
    if (hooks.routeState?.world && hooks.routeState.world !== data.world.id) throw routeIdentityError('world', hooks.routeState.world, data.world.id);
    if (activeCameraMode && !(data.applicationProfile.experience?.supportedViews || []).includes(activeCameraMode)) throw routeIdentityError('camera', activeCameraMode, data.applicationProfile.experience?.supportedViews?.join(',') || 'none');
    if (!applicationProfileSelectApi?.resolveInteraction || !applicationProfileSelectApi?.renderInteraction) throw new Error('Application interaction dependency is unavailable');
    const interaction = applicationProfileSelectApi.resolveInteraction(data.applicationProfile, data.manifest);
    if (routeSimulation?.mission && interaction.mode !== 'prompt') throw routeIdentityError('mission', routeSimulation.mission, 'prompt interaction');
    configureExperienceShell(elements, {
      interactionMode: interaction.mode,
      profile: data.applicationProfile,
      tier: initialTier,
    });
    if (typeof data.loadRenderGeometry === 'function' && data.applicationProfile.experience?.worldDetail !== 'plugin-owned') {
      setRuntimeStatus(elements, 'Loading map detail', 'loading');
      await new Promise((resolve) => requestAnimationFrame(resolve));
      lifecycle.throwIfAborted();
      data = await timedLoadStage('world.geometry', () => data.loadRenderGeometry());
      lifecycle.throwIfAborted();
    } else {
      loadTrace?.stage('world.geometry').end({ skipped: true, reason: 'plugin-owned' });
    }
    const playbackStorage = pluginPlaybackApi?.browserStorage?.(hostRoot) || null;
    let storedPlaybackReceipt = interaction.mode === 'playback'
      ? pluginPlaybackApi.loadStoredReceipt(playbackStorage, data.applicationProfile.id)
      : null;
    const storedScenario = storedPlaybackReceipt
      ? interaction.scenarios.find((row) => (
          row.id === storedPlaybackReceipt.scenario?.id
          && row.seed === storedPlaybackReceipt.scenario?.seed
        ))
      : null;
    if (storedPlaybackReceipt && !storedScenario) {
      pluginPlaybackApi.clearStoredReceipt(playbackStorage, data.applicationProfile.id);
      storedPlaybackReceipt = null;
    }
    let activeScenario = routeSimulation ? scenarioForRoute(routeSimulation) : storedScenario || interaction.defaultScenario;
    const pluginArtifacts = artifactStoreApi.createGovernedArtifactStore({ transport: transportApi.createBrowserTransport({ fetchImpl: lifecycle.fetch }) });
    let activeMissionForPlugins = null;
    extensions = await timedLoadStage('plugins.runtime', () => pluginRuntimeApi.createPluginRuntime({
      registry: pluginRegistry,
      profile: data.applicationProfile,
      scenario: activeScenario,
      dataCatalog: data.dataCatalog,
      artifactStore: pluginArtifacts,
      registryBaseUrl: pluginAssetPathsApi.sharedRootUrl(document.baseURI),
      corePorts: {
        worldQuery: Object.freeze({ snapshot: () => data.world, model: () => worldApi.createWorldModel(data.world) }),
        routing: Object.freeze({
          plan(options) { return routePlannerApi.planRoute(options); },
          resolveMission(sourceText) {
            return missionApi.compileMission(sourceText, data.world, data.embodiments);
          },
          alternatives(mission, maximumAlternatives) {
            const embodiment = data.embodiments.find((row) => row.id === mission.embodimentId);
            if (!embodiment) throw new Error(`Plugin routing expected embodiment ${mission.embodimentId}`);
            return routePlannerApi.planRouteAlternatives({ worldModel: worldApi.createWorldModel(data.world), originNodeId: mission.originNodeId, destinationNodeId: mission.destinationNodeId, mode: embodiment.mode, tick: 0, mission, policy: data.policy }, maximumAlternatives);
          },
          modeFor(embodimentId) { return data.embodiments.find((row) => row.id === embodimentId)?.mode || null; },
          policy: () => data.policy,
        }),
        clock: Object.freeze({ instantForMission: (mission) => environmentInstant(data.world, mission) }),
        language: Object.freeze({ parsePrompt: (sourceText) => universeParserApi.parsePrompt(sourceText) }),
        receipts: Object.freeze({ createReceiptChain: receiptsApi.createReceiptChain, appendReceiptEntry: receiptsApi.appendReceiptEntry, sha256Hex: receiptsApi.sha256Hex, verifyReceiptChain: receiptsApi.verifyReceiptChain }),
        simulation: Object.freeze({
          async run({ id, mission, routeObjective }) {
            const embodiment = data.embodiments.find((row) => row.id === mission.embodimentId);
            if (!embodiment) throw new Error(`Simulation lane expected embodiment ${mission.embodimentId}`);
            const laneController = controllerApi.createAutonomyController({
              world: data.world, featureCatalog: data.featureCatalog, occurrenceCatalog: data.occurrenceCatalog,
              embodiment, policy: data.policy, mission, regionComposition: data.regionComposition,
              routeContributors: extensions.routeContributors({ mission }), routeObjective,
            });
            await laneController.run();
            return laneController.journeyReceipt();
          },
        }),
        ui: Object.freeze({ slot: 'inspector' }),
        random: pluginRandomApi ? pluginRandomApi.createRandomPort({ rootSeed: activeScenario?.seed || data.applicationProfile.id, scenarioId: activeScenario?.id || null }) : undefined,
        scheduler: pluginSchedulerApi ? pluginSchedulerApi.createSchedulerPort({}) : undefined,
        environment: pluginEnvironmentApi ? pluginEnvironmentApi.createEnvironmentPort({ snapshots: {} }) : undefined,
        geography: pluginGeographyApi ? pluginGeographyApi.createGeographyPort({ world: data.world }) : undefined,
        compute: pluginComputeApi ? pluginComputeApi.createComputePort({ workerPool: null }) : undefined,
        tier: Object.freeze({ schema: 'simulatte.tierQuery.v1', id: initialTier, worldId: data.world.id, profileId: data.applicationProfile.id, snapshot: () => data.world }),
      },
    }), { pluginCount: data.applicationProfile.plugins.length });
    lifecycle.throwIfAborted();
      pluginUi = pluginUiApi.createDeclarativeUiHost({
      rootElements: { inspector: elements.pluginInspector, map: elements.pluginMapUi },
      onAction: async ({ pluginId, actionId, command, values }) => {
        if (command?.kind === 'camera.focus') {
          const targetId = `plugin:${pluginId}:${command.targetId}`;
          pluginViewRuntime?.setManualOverride({ mode: 'free', targetIds: [targetId] });
          selectCameraMode(elements, renderer.focusCameraTarget(targetId));
          return;
        }
        if (actionId.startsWith(`${pluginId}.intervene.`)) {
          if (!pluginPlayback?.intervene) throw new Error(`Playback intervention ${actionId} is unavailable before the run starts`);
          await pluginPlayback.intervene(actionId, values);
          renderPluginExperience({ mission: activeMissionForPlugins });
          return;
        }
        await extensions.dispatchAction(pluginId, actionId, { mission: activeMissionForPlugins, routeObjective: data.applicationProfile.routeObjective, values });
        renderPluginExperience({ mission: activeMissionForPlugins });
      },
      onControlChange: async ({ pluginId, values }) => {
        if (hooks.navigate) {
          const simulation = simulationRouteState();
          await hooks.navigate(governedRoute({
            ...simulation,
            parameters: { ...simulation.parameters, [pluginId]: values },
          }), { replace: true });
          return;
        }
        if (!pluginPlayback || pluginPlayback.snapshot().ownerPluginId !== pluginId) return;
        pluginPlaybackApi.clearStoredReceipt(playbackStorage, data.applicationProfile.id);
        hostRoot.__simulattePluginRunReceipt = null;
        hostRoot.__simulatteComparisonExecutionReceipts = Object.freeze([]);
        setJourneyPhase('loading');
        setRuntimeStatus(elements, 'Applying controls', 'loading');
        await yieldToFrame();
        try {
          await pluginPlayback.applyControls(values);
          setJourneyPhase('ready');
          setRuntimeStatus(elements, 'Ready', 'ready');
        } catch (error) {
          failRuntime(elements, error);
          throw error;
        }
      },
      onError: (error) => failRuntime(elements, error),
    });
    pluginUi.render(extensions.views({ mission: null, compositionSize: extensions.activePluginIds.length }));
    applicationProfileSelectApi.renderInteraction(interaction, activeScenario, elements);
    resizeMissionInput(elements.missionInput);
    const traceView = traceApi.createTraceView(elements, data.policy, data.rerankerEvidence);
    let controller = null;
    let activeMission = null;
    let lastStepAt = 0;
    let retrievalLaneLogged = false;
    let terminalJourneyLogged = false;
    let hasJourneyStarted = false;
    const journeyLedger = ledgerApi.createJourneyLedger();
    const journeyRecorder = journeyRecorderApi.create({
      getContext: () => ({ revision: buildRevision, runtime: extensions, mission: activeMission }),
      isCurrent: (context) => !lifecycle.signal.aborted && context.revision === buildRevision && context.runtime === extensions,
      ledger: journeyLedger,
      async onReceipt(receipt, mission) {
        latestJourneyReceipt = receipt; void profileProgram?.refreshProof();
        await renderPluginExperience({ mission, journey: receipt });
      },
      refreshLedger: () => renderLedger(elements, journeyLedger, data.curriculum, data.world.contentVersion),
    });
    const stepIntervalMs = 18;
    const yieldToFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
    neuralGate = await neuralConsentApi.createGate({
      root: document,
      modelRuntimeLock: data.modelRuntimeLock,
      toggle: elements.placeResolutionLane,
      dialog: document.getElementById('neural-model-dialog'),
      surface: 'autonomy',
      status(enabled, bundle) {
        elements.placeLaneNote.textContent = enabled
          ? `Model consent granted · ${bundle.embedding.size} available locally`
          : 'No neural model consent';
      },
    });
    const modelSelection = await modelSelectionApi.createController({
      root: document,
      container: elements.modelSelectionControls,
      config: data.pipelineModelSelection,
      modelRuntimeLock: data.modelRuntimeLock,
      surfaceId: 'autonomy',
      consentGate: neuralGate,
    });
    const controllerBuilder = mainControllerBuilderApi.create({
      elements, data, interaction, worldApi,
      ensureRenderer,
      nextRevision: () => ++buildRevision,
      currentRevision: () => buildRevision,
      clearMissionError,
      extensions,
      getRenderer: () => renderer,
      setActiveState(next) {
        controller = next.controller;
        activeMission = next.mission;
        activeMissionForPlugins = next.mission;
      },
      renderPluginExperience, renderIdentity, setRuntimeStatus,
      setJourneyPhase, updateButtons,
      hasJourneyStarted: () => hasJourneyStarted,
      modelSelection,
      runtimeLoaderApi,
      neuralPlaceApi,
      hostRoot,
      getPlaceResolver: () => placeResolver,
      setPlaceResolver: (value) => { placeResolver = value; },
      missionApi,
      applyPluginMissionContributions,
      log,
      renderPlaceResolution,
      yieldToFrame,
      controllerApi,
      traceView,
      runtimeLabel,
      setRetrievalLaneLogged: (value) => { retrievalLaneLogged = value; },
      isRetrievalLaneLogged: () => retrievalLaneLogged,
      setTerminalJourneyLogged: (value) => { terminalJourneyLogged = value; },
      isTerminalJourneyLogged: () => terminalJourneyLogged,
      recordJourney,
      stopLoop,
      renderPlanning,
    });
    pluginSession = cityPluginSessionApi.create({
      hostRoot, extensions, pluginUi, elements, profile: data.applicationProfile, interaction, playbackStorage,
      experienceCameraApi, simulationClockApi, pluginPlaybackApi, pluginViewRuntimeApi, log,
      recordRenderWork, renderWorkReceipt, renderExperienceSummary,
      summarize: hostRoot.SimulatteWorldTiersBoot.experienceHudSummary, yieldToFrame,
      getScenario: () => activeScenario, getCameraMode: () => activeCameraMode, getRenderer: () => renderer,
      selectCamera: (mode) => { activeCameraMode = mode; selectCameraMode(elements, mode); },
      selectViewMode: (mode) => selectCameraMode(elements, mode),
      applyRouteParameters() {
        if (routeParametersApplied) return false;
        const accepted = acceptedRouteParameters(routeSimulation);
        Object.entries(accepted).forEach(([pluginId, values]) => pluginUi.setValues(pluginId, values));
        routeParametersApplied = true;
        return Object.keys(accepted).length > 0;
      },
      onPhase: reflectPluginPlaybackPhase,
      onPlayback: (value) => { pluginPlayback = value; },
      onViewRuntime: (value) => { pluginViewRuntime = value; },
      onError: (error) => failRuntime(elements, error),
    });
    function renderPluginExperience(context) { return pluginSession.render(context); }
    function renderPluginSummary(state) { return pluginSession.summary(state); }

    function scenarioForRoute(simulation) {
      const scenarioId = simulation?.scenarioId || null;
      const seed = simulation?.seed || null;
      if (!scenarioId && !seed) return interaction.defaultScenario;
      const scenario = interaction.scenarios.find((row) => (!scenarioId || row.id === scenarioId) && (!seed || row.seed === seed));
      if (!scenario) throw routeIdentityError('scenario', [scenarioId, seed].filter(Boolean).join('/'), 'declared profile scenario');
      return scenario;
    }

    function acceptedRouteParameters(simulation) {
      const requested = simulation?.parameters || {};
      const accepted = {};
      Object.entries(requested).forEach(([pluginId, values]) => {
        if (!extensions.activePluginIds.includes(pluginId)) throw routeIdentityError('parameter-owner', pluginId, extensions.activePluginIds.join(','));
        if (!values || typeof values !== 'object' || Array.isArray(values)) throw routeIdentityError('parameters', pluginId, 'object');
        const declared = pluginUi.values(pluginId);
        const unknown = Object.keys(values).filter((key) => !Object.prototype.hasOwnProperty.call(declared, key));
        if (unknown.length) throw routeIdentityError('parameter', `${pluginId}.${unknown.join(',')}`, 'declared control');
        if (Object.keys(values).length) accepted[pluginId] = values;
      });
      return accepted;
    }

    function simulationRouteState() {
      const parameters = {};
      extensions.activePluginIds.forEach((pluginId) => {
        const values = pluginUi.values(pluginId);
        if (Object.keys(values).length) parameters[pluginId] = values;
      });
      return {
        scenarioId: activeScenario.id,
        seed: activeScenario.seed,
        ...(interaction.mode === 'prompt' && elements.missionInput.value ? { mission: elements.missionInput.value } : {}),
        parameters,
      };
    }
    async function updateSimulationFromRoute(nextSimulation) {
      routeSimulation = nextSimulation || null;
      const nextScenario = scenarioForRoute(nextSimulation);
      const scenarioChanged = nextScenario.id !== activeScenario.id || nextScenario.seed !== activeScenario.seed;
      const requestedParameters = acceptedRouteParameters(nextSimulation);
      let controlsApplied = false;
      if (scenarioChanged) {
        pluginPlaybackApi.clearStoredReceipt(playbackStorage, data.applicationProfile.id);
        hostRoot.__simulattePluginRunReceipt = null;
        hostRoot.__simulatteComparisonExecutionReceipts = Object.freeze([]);
        routeParametersApplied = false;
        if (pluginPlayback) {
          // Keep declared controls until scenario.run prepares the new contribution.
          await pluginPlayback.reset(nextScenario, { renderReadyState: false });
        } else {
          pluginUi.resetValues();
          await extensions.setScenario(nextScenario);
        }
        activeScenario = nextScenario;
        applicationProfileSelectApi.renderInteraction(interaction, activeScenario, elements);
        if (!pluginPlayback) await renderPluginExperience({ mission: null });
      } else {
        pluginUi.resetValues();
        routeParametersApplied = false;
        await renderPluginExperience({ mission: activeMissionForPlugins });
      }
      if (nextSimulation?.mission && interaction.mode === 'prompt') {
        elements.missionInput.value = nextSimulation.mission;
        resizeMissionInput(elements.missionInput);
      }
      if (pluginPlayback) {
        const owner = data.applicationProfile.interaction?.simulationOwnerPluginId || extensions.activePluginIds[0];
        await pluginPlayback.applyControls(requestedParameters[owner] || pluginUi.values(owner));
        controlsApplied = true;
      }
      if (!controlsApplied) await renderPluginExperience({ mission: activeMissionForPlugins });
      return simulationRouteState();
    }

    function governedRoute(simulation = simulationRouteState()) { return { tier: initialTier, experience: data.applicationProfile.id, world: data.world.id, profile: data.applicationProfile.id, camera: activeCameraMode, simulation }; }
    function selectGovernedCamera(mode, navigate = false) {
      const canonical = experienceCameraApi.canonicalMode(mode);
      if (!(data.applicationProfile.experience?.supportedViews || []).includes(canonical)) throw routeIdentityError('camera', canonical, data.applicationProfile.experience?.supportedViews?.join(',') || 'none');
      activeCameraMode = canonical;
      renderer?.setCameraMode(canonical);
      selectCameraMode(elements, canonical);
      if (navigate) void hooks.navigate?.(governedRoute(), { replace: true });
      return canonical;
    }
    async function updateRouteFromUrl(route) {
      if (route.profile && route.profile !== data.applicationProfile.id) throw routeIdentityError('profile', route.profile, data.applicationProfile.id);
      if (route.world && route.world !== data.world.id) throw routeIdentityError('world', route.world, data.world.id);
      if (route.camera && route.camera !== activeCameraMode) selectGovernedCamera(route.camera);
      if (hostRoot.SimulatteRouter.queryForSimulation(route.simulation) !== hostRoot.SimulatteRouter.queryForSimulation(simulationRouteState())) await updateSimulationFromRoute(route.simulation || null);
      return governedRoute();
    }
    function routeIdentityError(kind, requested, resolved) { const error = new Error(`Requested ${kind} ${requested}; resolved ${resolved}`); error.code = `route_${kind}_resolution_mismatch`; return error; }

    profileSelectUi = wireProfileSelection({
      elements,
      data,
      applicationProfileSelectApi,
      populateApplicationProfiles,
      on,
      navigate: hooks.navigate,
      dispose: disposeApplication,
    });
    async function ensureRenderer(worldModel) {
      if (renderer) return renderer;
      if (rendererPromise) return rendererPromise;
      const pending = (async () => {
        const nextRenderer = await createRenderer({
          elements,
          worldModel,
          data,
          lifecycle,
          stopLoop,
          fail: (error) => failRuntime(elements, error),
          onCameraInteraction(cameraInteraction) {
            pluginViewRuntime?.setManualOverride({
              mode: cameraInteraction.mode,
              targetIds: cameraInteraction.targetIds,
            });
            activeCameraMode = experienceCameraApi.canonicalMode(cameraInteraction.mode);
            selectCameraMode(elements, activeCameraMode);
          },
          onManualNavigation(cameraInteraction) {
            pluginViewRuntime?.setManualOverride({
              mode: cameraInteraction.mode,
              targetIds: cameraInteraction.targetIds,
            });
            activeCameraMode = experienceCameraApi.canonicalMode(cameraInteraction.mode);
            void hooks.navigate?.(governedRoute(), { replace: true });
          },
        });
        if (lifecycle.signal.aborted) {
          nextRenderer.destroy();
          return null;
        }
        renderer = nextRenderer;
        return renderer;
      })();
      rendererPromise = pending;
      try {
        return await pending;
      } finally {
        if (rendererPromise === pending) rendererPromise = null;
      }
    }
    async function buildController({ keepMissionLocked = false } = {}) {
      latestJourneyReceipt = null; return controllerBuilder.build({ keepMissionLocked });
    }
    function recordJourney(targetController) { return journeyRecorder.record(targetController); }
    async function tickFrame(timestamp) {
      if (!isRunning || !controller) return;
      try {
        if (timestamp - lastStepAt >= stepIntervalMs) {
          lastStepAt = timestamp;
          await controller.step();
        }
      } catch (error) {
        stopLoop();
        failRuntime(elements, error);
        return;
      }
      if (isRunning) frameRequest = requestAnimationFrame(tickFrame);
    }
    async function runLoop() {
      clearMissionError(elements);
      updateButtons(elements, true, Boolean(controller), controller?.snapshot().state.status || 'active', true);
      if (!controller || controller.snapshot().state.status !== 'active') {
        const built = await buildController({ keepMissionLocked: true });
        if (!built) return;
      }
      if (controller.snapshot().state.status !== 'active') {
        setRuntimeStatus(elements, runtimeLabel(controller.snapshot().state), 'failed');
        updateButtons(elements, false, true, controller.snapshot().state.status, true);
        return;
      }
      const runCameraMode = selectGovernedCamera(experienceCameraApi.runCameraMode(data.applicationProfile.camera), true);
      isRunning = true;
      setJourneyPhase('running');
      hasJourneyStarted = true;
      updateButtons(elements, true, true, 'active', true);
      setRuntimeStatus(elements, 'Running', 'active');
      const snapshot = controller.snapshot();
      log.info('journey.started', {
        missionId: activeMission.id,
        embodimentId: activeMission.embodimentId,
        taskType: snapshot.state.taskType,
        cameraMode: runCameraMode,
      });
      frameRequest = requestAnimationFrame(tickFrame);
    }

    function stopLoop() {
      isRunning = false;
      if (frameRequest !== null) cancelAnimationFrame(frameRequest);
      frameRequest = null;
      const status = controller?.snapshot().state.status || 'active';
      updateButtons(elements, false, Boolean(controller), status, hasJourneyStarted);
    }

    cityRunControlsApi.connect({
      elements, on, isActive: () => !lifecycle.signal.aborted, isRunning: () => isRunning,
      interactionMode: interaction.mode, getPlayback: () => pluginPlayback,
      getController: () => controller, getScenario: () => activeScenario,
      buildController, runLoop, stopLoop, selectNextScenario,
      selectRunCamera: () => selectGovernedCamera(experienceCameraApi.runCameraMode(data.applicationProfile.camera), true),
      focusPrimary: () => applicationProfileSelectApi.focusPrimary(interaction, elements),
      setPaused: () => setRuntimeStatus(elements, 'Paused', 'paused'),
      onError: (error) => failRuntime(elements, error),
      resetJourney({ clearController = false } = {}) {
        hasJourneyStarted = false;
        if (clearController) {
          buildRevision += 1; controller = null;
          updateButtons(elements, false, false, 'active', false);
          setRuntimeStatus(elements, 'Ready', 'changed');
        }
      },
    });
    async function selectNextScenario() {
      if (isRunning) return;
      const nextScenario = applicationProfileSelectApi.nextScenario(interaction, activeScenario.id);
      if (hooks.navigate) {
        await hooks.navigate(governedRoute({ scenarioId: nextScenario.id, seed: nextScenario.seed }));
        return;
      }
      elements.shuffleButton.disabled = true;
      setJourneyPhase('loading');
      setRuntimeStatus(elements, 'Loading scenario', 'loading');
      await yieldToFrame();
      try {
        pluginPlaybackApi.clearStoredReceipt(playbackStorage, data.applicationProfile.id);
        hostRoot.__simulattePluginRunReceipt = null;
        pluginUi.resetValues();
        if (pluginPlayback) await pluginPlayback.reset(nextScenario, { renderReadyState: false });
        else await extensions.setScenario(nextScenario);
        activeScenario = nextScenario;
        applicationProfileSelectApi.renderInteraction(interaction, activeScenario, elements);
        log.info('application.scenario.selected', {
          scenarioId: activeScenario.id,
          seed: activeScenario.seed,
          interactionMode: interaction.mode,
        });
        elements.missionInput.dispatchEvent(new Event('input', { bubbles: true }));
        resizeMissionInput(elements.missionInput);
        renderPluginExperience({ mission: null });
        if (hasJourneyStarted) {
          stopLoop();
          hasJourneyStarted = false;
          await buildController();
        }
      } catch (error) {
        failRuntime(elements, error);
      } finally {
        elements.shuffleButton.disabled = false;
      }
    }

    function reflectPluginPlaybackPhase(phase, snapshot) {
      if (phase !== 'completed') profileProgramApi.invalidateRunReceipt(hostRoot, '__simulattePluginRunReceipt');
      const isActive = phase === 'running'; setJourneyPhase(phase);
      isRunning = isActive;
      hasJourneyStarted = phase !== 'ready';
      if (phase === 'running') {
        log.info('plugin.playback.started', snapshot);
      } else if (phase === 'completed' || phase === 'failed') {
        log.info('plugin.playback.terminal', snapshot);
      }
      const status = phase === 'completed' ? 'completed' : phase === 'failed' ? 'failed' : 'active';
      updateButtons(elements, isActive, true, status, hasJourneyStarted);
      const label = renderPlayback(elements, phase, snapshot);
      setRuntimeStatus(elements, label, phase === 'failed' ? 'error' : phase);
      renderPluginSummary(phase);
    }
    on(elements.whatIfButton, 'click', () => interfaceUi.openDecisions('plugin-inspector'));
    wireReceiptControls({
      on,
      elements,
      getController: () => controller,
      getRenderer: () => renderer,
      data,
      extensions,
      journeyLedger,
      stopLoop,
      resizeMissionInput,
      resetJourneyState() {
        buildRevision += 1;
        controller = null;
        hasJourneyStarted = false;
        updateButtons(elements, false, false, 'active', false);
      },
    });
    on(elements.missionInput, 'input', () => {
      if (isRunning) return;
      clearMissionError(elements);
      resizeMissionInput(elements.missionInput);
      buildRevision += 1;
      controller = null;
      hasJourneyStarted = false;
      updateButtons(elements, false, false, 'active', false);
      setRuntimeStatus(elements, 'Ready', 'changed');
      if (hooks.navigate) {
        if (missionUrlTimer !== null) clearTimeout(missionUrlTimer);
        missionUrlTimer = setTimeout(() => {
          missionUrlTimer = null;
          void hooks.navigate(governedRoute(), { replace: true });
        }, 160);
      }
    });
    on(elements.missionInput, 'keydown', (event) => {
      if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
      event.preventDefault();
      elements.startButton.click();
    });
    on(elements.modelSelectionControls, 'model-selection-change', async (event) => {
      if (isRunning) return;
      const placeSelection = event.detail.selections.find((row) => row.slotId === 'place-resolution');
      const neural = placeSelection && placeSelection.runtimeRef.kind === 'embedding';
      if (!neural && placeResolver) {
        await placeResolver.unload();
        placeResolver = null;
      }
      buildRevision += 1;
      controller = null;
      hasJourneyStarted = false;
      updateButtons(elements, false, false, 'active', false);
      setRuntimeStatus(elements, 'Ready', 'changed');
      elements.placeResolutionProof.textContent = neural
        ? 'Qwen embedding after deterministic refusal · measured gain +0/37 · no neural reranker on this surface'
        : 'Deterministic place matching · 27/37 diagnostic · no model execution';
    });
    on(window, 'resize', () => {
      if (renderer && controller) renderer.render(controller.snapshot());
    });

    try {
      renderPolicyArena(elements, data.policyArenaEvidence);
      await renderLedger(elements, journeyLedger, data.curriculum, data.world.contentVersion);
      await timedLoadStage('initial.controller', () => buildController());
      lifecycle.throwIfAborted();
      if (storedPlaybackReceipt) {
        if (!pluginPlayback) throw new Error('Stored plugin playback cannot be restored without a playback controller');
        try {
          await pluginPlayback.restore(storedPlaybackReceipt);
        } catch (error) {
          pluginPlaybackApi.clearStoredReceipt(playbackStorage, data.applicationProfile.id);
          throw error;
        }
        lifecycle.throwIfAborted();
    }
      tierVisualizer = SimulatteMultiTierVisualizer.createTierVisualizer(elements.overlayCanvas, 'world-tier-control');
      const selectWorldTier = SimulatteWorldTiersBoot.wireTierControls({
        elements,
        tierVisualizer,
        profileSelectUi,
        activeTier: 'city',
        signal: lifecycle.signal,
        onSelectTier: (tier) => hooks.navigate?.({ tier, experience: null }),
      });

      await timedLoadStage('tier.visualizer', () => selectWorldTier(initialTier));
      lifecycle.throwIfAborted();
      await timedLoadStage('first.render', () => renderPluginExperience({ mission: activeMissionForPlugins }));
      profileProgram = profileProgramApi.connect({
        documentRoot: document, profile: data.applicationProfile, registry: pluginRegistry,
        getRuntime: () => extensions, getScenario: () => activeScenario, getCanvas: () => elements.autonomyCanvas,
        getRunReceipt: () => hostRoot.__simulatteTierRunReceipt || hostRoot.__simulattePluginRunReceipt || latestJourneyReceipt,
        navigateScenario: async (scenario) => {
          const simulation = { scenarioId: scenario.id, seed: scenario.seed };
          if (hooks.navigate) return hooks.navigate(governedRoute(simulation));
          return updateSimulationFromRoute(simulation);
        },
        replay: async () => {
          if (!pluginPlayback) return elements.replayButton.click();
          await pluginPlayback.seek(pluginPlayback.snapshot().totalSteps); await pluginPlayback.resume();
          return hostRoot.__simulattePluginRunReceipt;
        },
      });
      loadTrace?.complete({ profileId: data.applicationProfile.id, interactionMode: interaction.mode, scenarioId: activeScenario.id, renderer: renderer?.receipt?.().backend || null });
    } catch (error) {
      await disposeApplication();
      throw error;
    }
      return {
        tier: 'city',
        experience: data.applicationProfile.id,
        world: data.world.id,
        profile: data.applicationProfile.id,
        camera: activeCameraMode,
        simulation: simulationRouteState(),
        data,
        dispose: disposeApplication,
        updateRoute: updateRouteFromUrl,
        updateSimulation: updateSimulationFromRoute,
        getController: () => controller,
        getRenderer: () => renderer,
      };
    } catch (error) {
      loadTrace?.fail(error, { profileId: requestedProfileId });
      await disposeApplication();
      throw error;
    }
    }
  launchBrowserApp(start, collectElements);
  return { applicationProfileLabel, collectElements, friendlyMissionError, populateApplicationProfiles, renderIdentity, renderPlaceResolution, renderPlanning, renderPolicyArena, runtimeLabel, selectCameraMode, start, validateImportedJourneyReceipt };
});
