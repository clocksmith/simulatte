(function attachAutonomyApp(root, factory) {
  const api = factory(Object.freeze({
    hostRoot: root,
    dataLoader: // Accept both the original and the in-progress renamed global names so the app boots
    // whichever the module files currently register under (the multi-tier refactor renamed
    // these references before the module registrations were renamed to match).
    (root.SimulatteApplicationLoader || root.SimulatteDataLoader),
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
  }));
  root.SimulatteAutonomyApp = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createAutonomyApp(dependencies) {
  const { hostRoot, dataLoader, missionApi, controllerApi, canvasApi, traceApi, runtimeLog, neuralPlaceApi, ledgerApi, receiptsApi, worldApi, neuralConsentApi, modelSelectionApi, runtimeLoaderApi, pluginRuntimeApi, pluginRegistry, pluginUiApi, transportApi, artifactStoreApi, routePlannerApi, civilTimeApi, universeParserApi, applicationProfileSelectApi, experienceCameraApi, pluginAssetPathsApi, pluginRandomApi, pluginSchedulerApi, pluginEnvironmentApi, pluginGeographyApi, pluginComputeApi, simulationClockApi, pluginViewRuntimeApi, mountLifecycleApi, mainViewApi, pluginPlaybackApi, cityInterfaceApi, mainControllerBuilderApi, mainSupportApi } = dependencies;
  if (!cityInterfaceApi || !mainViewApi || !mainControllerBuilderApi || !mainSupportApi) {
    throw new Error('simulatte_app_view_dependency_missing');
  }
  const { collectElements, populateApplicationProfiles, applicationProfileLabel, setRuntimeStatus, runtimeLabel, renderIdentity, renderPlaceResolution, renderPlanning, configureExperienceShell, renderExperienceSummary, renderPlayback } = mainViewApi;
  const { wireCameraControls, selectCameraMode, populateCameraFocus, wireInterfaceControls, setJourneyPhase, resizeMissionInput, clearMissionError, isMissionInputError, friendlyMissionError, updateButtons } = cityInterfaceApi;
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
    const lifecycle = mountLifecycleApi.create(hooks.signal);
    const on = lifecycle.on;
    let extensions = null;
    let profileSelectUi = null;
    let tierVisualizer = null;
    let renderer = null;
    let rendererPromise = null;
    let placeResolver = null;
    let frameRequest = null;
    let pluginClock = null;
    let pluginViewRuntime = null;
    let pluginPlayback = null;
    let pluginUi = null;
    let neuralGate = null;
    let buildRevision = 0;
    let lastPluginContributions = Object.freeze([]);
    let isRunning = false;
    let disposal = null;

    async function disposeApplication() {
      if (disposal) return disposal;
      disposal = (async () => {
        isRunning = false;
        buildRevision += 1;
        pluginClock?.pause();
        if (frameRequest !== null) cancelAnimationFrame(frameRequest);
        frameRequest = null;
        lifecycle.abort();
        elements.applicationProfile.disabled = true;
        const resources = {
          profileSelectUi, placeResolver, tierVisualizer, renderer, extensions, pluginUi, neuralGate,
        };
        profileSelectUi = null;
        placeResolver = null;
        tierVisualizer = null;
        renderer = null;
        rendererPromise = null;
        extensions = null;
        pluginUi = null;
        neuralGate = null;
        await mountLifecycleApi.disposeAll([
          { resource: 'place-resolver', dispose: () => resources.placeResolver?.unload() },
          { resource: 'tier-visualizer', dispose: () => resources.tierVisualizer?.destroy() },
          { resource: 'renderer', dispose: () => resources.renderer?.destroy() },
          { resource: 'plugin-playback', dispose: () => pluginPlayback?.dispose() },
          { resource: 'plugin-ui', dispose: () => resources.pluginUi?.dispose() },
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
      await runtimeLoaderApi.loadSelectedProduct({ tierId: 'city', profileId: requestedProfileId });
      lifecycle.throwIfAborted();
      let data;
      data = await dataLoader.loadApplication(undefined, lifecycle.fetch, { requestedProfileId, deferRenderGeometry: true });
      lifecycle.throwIfAborted();
    if (!applicationProfileSelectApi?.resolveInteraction || !applicationProfileSelectApi?.renderInteraction) throw new Error('Application interaction dependency is unavailable');
    const interaction = applicationProfileSelectApi.resolveInteraction(data.applicationProfile, data.manifest);
    configureExperienceShell(elements, {
      interactionMode: interaction.mode,
      profile: data.applicationProfile,
      tier: initialTier,
    });
    if (typeof data.loadRenderGeometry === 'function' && data.applicationProfile.experience?.worldDetail !== 'plugin-owned') { setRuntimeStatus(elements, 'Loading map detail', 'loading'); await new Promise((resolve) => requestAnimationFrame(resolve)); lifecycle.throwIfAborted(); data = await data.loadRenderGeometry(); lifecycle.throwIfAborted(); }
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
    let activeScenario = storedScenario || interaction.defaultScenario;
    const pluginArtifacts = artifactStoreApi.createGovernedArtifactStore({ transport: transportApi.createBrowserTransport({ fetchImpl: lifecycle.fetch }) });
    let activeMissionForPlugins = null;
    extensions = await pluginRuntimeApi.createPluginRuntime({
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
    });
    lifecycle.throwIfAborted();
    pluginUi = pluginUiApi.createDeclarativeUiHost({
      rootElements: { inspector: elements.pluginInspector, map: elements.pluginMapUi },
      onAction: async ({ pluginId, actionId, command, values }) => {
        if (command?.kind === 'camera.focus') {
          const targetId = `plugin:${pluginId}:${command.targetId}`;
          pluginViewRuntime?.setManualOverride({ mode: 'free', targetIds: [targetId] });
          selectCameraMode(elements, renderer.focusCameraTarget(targetId));
          elements.cameraFocus.value = targetId;
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
    let hasAppliedInitialCamera = false;
    const journeyLedger = ledgerApi.createJourneyLedger();
    const recordedJourneyHashes = new Set();
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
    function renderPluginExperience(context) {
      const pluginContext = { ...context, compositionSize: extensions.activePluginIds.length };
      const platform = extensions.platformV4(pluginContext);
      lastPluginContributions = platform.contributions;
      pluginUi.render(extensions.views(pluginContext), platform.contributions);
      const controlCount = platform.contributions.reduce((total, contribution) => total + contribution.controls.controls.length, 0);
      elements.decisionsButton.textContent = controlCount ? `Controls (${controlCount})` : 'Evidence';
      renderPluginSummary(pluginPlayback?.snapshot().phase || 'ready');
      if (!renderer) return;
      const selected = elements.cameraFocus.value || 'route';
      const semanticPresentations = platform.contributions.map((contribution) => ({
        pluginId: contribution.pluginId,
        presentation: contribution.presentation,
      }));
      const platformTime = Math.max(0, ...platform.contributions.map((contribution) => contribution.state?.simulationTimeMs || 0));
      renderer.setPluginPresentations(semanticPresentations, {
        simulationTimeMs: platformTime,
        selectedIds: [selected],
        provenanceReceipts: platform.provenanceReceipts,
      });
      populateCameraFocus(elements.cameraFocus, renderer.cameraTargets(), selected);
      if (!hasAppliedInitialCamera) hasAppliedInitialCamera = experienceCameraApi.applyInitialCamera({
        configuration: data.applicationProfile.camera,
        renderer,
        focusSelect: elements.cameraFocus,
        onModeSelected: (mode) => selectCameraMode(elements, mode),
      });
      if (!pluginClock) pluginClock = simulationClockApi.createClock({
        timeline: platform.timeline,
        wallIntervalMs: data.applicationProfile.interaction?.stepDelayMs || 450,
      });
      const clockState = pluginClock.snapshot();
      const timelineReceipt = platform.timeline.receipt();
      if (clockState.timelineId !== timelineReceipt.id
        || clockState.eventCount !== timelineReceipt.eventCount
        || (clockState.state !== 'playing' && clockState.currentMs !== platformTime)) {
        pluginClock.useTimeline(platform.timeline, { atMs: platformTime });
      }
      if (interaction.mode === 'playback' && !pluginPlayback) {
        if (!pluginPlaybackApi?.createController) throw new Error('Plugin playback dependency is unavailable');
        const ownerPluginId = data.applicationProfile.interaction?.simulationOwnerPluginId || extensions.activePluginIds[0];
        pluginPlayback = pluginPlaybackApi.createController({
          runtime: extensions,
          ownerPluginId,
          scenario: activeScenario,
          clock: pluginClock,
          getControlValues: pluginUi.values,
          setControlValues: pluginUi.setValues,
          render: () => renderPluginExperience({ mission: null }),
          onPhase: reflectPluginPlaybackPhase,
          onSettled: (receipt) => {
            hostRoot.__simulattePluginRunReceipt = receipt;
            hostRoot.__simulatteComparisonExecutionReceipts = Object.freeze(
              receipt.comparisonExecutionReceipts
                || (receipt.comparisonExecutionReceipt ? [receipt.comparisonExecutionReceipt] : [])
            );
            const persisted = pluginPlaybackApi.saveStoredReceipt(
              playbackStorage,
              data.applicationProfile.id,
              receipt
            );
            if (!persisted) log.warn('plugin.playback.persistence.skipped', {
              profileId: data.applicationProfile.id,
              reason: 'browser_storage_unavailable',
            });
          },
          onError: (error) => failRuntime(elements, error),
        });
      }
      if (!pluginViewRuntime) {
        pluginViewRuntime = pluginViewRuntimeApi.createCoordinator({
          renderer,
          focusSelect: elements.cameraFocus,
          onModeSelected: (mode) => selectCameraMode(elements, mode),
        });
      }
      const viewReceipt = pluginViewRuntime.sync(platform.contributions, platform.provenanceReceipts);
      hostRoot.__simulattePluginPlatformV4 = Object.freeze({
        receipt: platform.receipt,
        contributions: platform.contributions,
        contributionSources: platform.contributionSources,
        provenance: platform.provenanceCoverage,
        clock: pluginClock.receipt(),
        view: viewReceipt,
        compositor: renderer.receipt().pluginCompositor,
      });
    }
    function renderPluginSummary(runState) {
      renderExperienceSummary(elements, hostRoot.SimulatteWorldTiersBoot.experienceHudSummary({
        profileId: data.applicationProfile.id,
        profile: data.applicationProfile,
        profileLabel: elements.applicationProfileLabel.textContent,
        scenario: activeScenario,
        contributions: lastPluginContributions,
        runState,
        playback: pluginPlayback?.snapshot() || null,
        comparisonReceipts: hostRoot.__simulatteComparisonExecutionReceipts || [],
      }));
    }

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
            selectCameraMode(elements, cameraInteraction.mode);
          },
          onManualNavigation(cameraInteraction) {
            pluginViewRuntime?.setManualOverride({
              mode: cameraInteraction.mode,
              targetIds: cameraInteraction.targetIds,
            });
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
      return controllerBuilder.build({ keepMissionLocked });
    }
    async function recordJourney(targetController) {
      const revision = buildRevision;
      const activeExtensions = extensions;
      const mission = activeMission;
      const receipt = await targetController.journeyReceipt();
      receipt.pluginSettlement = await activeExtensions.settle({ journey: receipt });
      receipt.pluginRuntime = activeExtensions.runtimeReceipt();
      if (revision === buildRevision && activeExtensions === extensions) {
        renderPluginExperience({ mission, journey: receipt });
      }
      const identity = `${receipt.mission.id}:${receipt.integrity.terminalHash}:${receipt.finalState.status}`;
      if (recordedJourneyHashes.has(identity)) return receipt;
      recordedJourneyHashes.add(identity);
      await journeyLedger.append(receipt);
      if (revision === buildRevision && activeExtensions === extensions) {
        await renderLedger(elements, journeyLedger, data.curriculum, data.world.contentVersion);
      }
      return receipt;
    }
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
      const runCameraMode = experienceCameraApi.runCameraMode(data.applicationProfile.camera);
      renderer.setCameraMode(runCameraMode);
      selectCameraMode(elements, runCameraMode);
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

    const startRun = async () => {
      try {
        await runLoop();
      } catch (error) {
        stopLoop();
        failRuntime(elements, error);
      }
    };
    const startSelectedExperience = async () => {
      try {
        if (interaction.mode === 'playback') {
          const runCameraMode = experienceCameraApi.runCameraMode(data.applicationProfile.camera);
          renderer.setCameraMode(runCameraMode);
          selectCameraMode(elements, runCameraMode);
          if (pluginPlayback.snapshot().phase === 'paused') await pluginPlayback.resume();
          else await pluginPlayback.start();
        } else await startRun();
      } catch (error) {
        failRuntime(elements, error);
      }
    };
    on(elements.startButton, 'click', startSelectedExperience);
    on(elements.resumeButton, 'click', startSelectedExperience);
    on(elements.newMissionButton, 'click', () => {
      stopLoop();
      buildRevision += 1;
      controller = null;
      hasJourneyStarted = false;
      updateButtons(elements, false, false, 'active', false);
      setRuntimeStatus(elements, 'Ready', 'changed');
      applicationProfileSelectApi.focusPrimary(interaction, elements);
    });
    on(elements.shuffleButton, 'click', async () => {
      if (isRunning) return;
      const nextScenario = applicationProfileSelectApi.nextScenario(interaction, activeScenario.id);
      elements.shuffleButton.disabled = true;
      setJourneyPhase('loading');
      setRuntimeStatus(elements, 'Loading scenario', 'loading');
      await yieldToFrame();
      try {
        pluginPlaybackApi.clearStoredReceipt(playbackStorage, data.applicationProfile.id);
        hostRoot.__simulattePluginRunReceipt = null;
        pluginUi.resetValues();
        if (pluginPlayback) await pluginPlayback.reset(nextScenario);
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
    });
    on(elements.pauseButton, 'click', () => {
      if (pluginPlayback) {
        pluginPlayback.pause();
        return;
      }
      stopLoop();
      setRuntimeStatus(elements, 'Paused', 'paused');
    });
    on(elements.stepButton, 'click', async () => {
      try {
        if (pluginPlayback) {
          await pluginPlayback.step();
          return;
        }
        stopLoop();
        let targetController = controller;
        if (!targetController || targetController.snapshot().state.status !== 'active') targetController = await buildController();
        if (targetController) await targetController.step();
      } catch (error) {
        failRuntime(elements, error);
      }
    });
    on(elements.resetButton, 'click', async () => {
      stopLoop();
      try {
        hasJourneyStarted = false;
        if (pluginPlayback) {
          await pluginPlayback.reset(activeScenario);
          return;
        }
        await buildController();
      } catch (error) {
        failRuntime(elements, error);
      }
    });
    on(elements.replayButton, 'click', async () => {
      try {
        if (pluginPlayback) {
          await pluginPlayback.replay();
          return;
        }
        stopLoop();
        hasJourneyStarted = false;
        await buildController({ keepMissionLocked: true });
        await runLoop();
      } catch (error) {
        stopLoop();
        failRuntime(elements, error);
      }
    });
    on(elements.playbackSpeed, 'change', () => {
      pluginPlayback?.setPlaybackRate(Number(elements.playbackSpeed.value));
    });
    on(elements.playbackTimeline, 'change', async () => {
      if (!pluginPlayback) return;
      try {
        await pluginPlayback.seek(Number(elements.playbackTimeline.value));
      } catch (error) {
        failRuntime(elements, error);
      }
    });

    function reflectPluginPlaybackPhase(phase, snapshot) {
      const isActive = phase === 'running';
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
      await buildController();
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

      // Init the tier visualizer + wire the toolbar dropdown (SimulatteWorldTiersBoot owns landing).
      tierVisualizer = SimulatteMultiTierVisualizer.createTierVisualizer(elements.overlayCanvas, 'world-tier-control');
      const selectWorldTier = SimulatteWorldTiersBoot.wireTierControls({
        elements,
        tierVisualizer,
        profileSelectUi,
        activeTier: 'city',
        signal: lifecycle.signal,
        onSelectTier: (tier) => hooks.navigate?.({ tier, experience: null }),
      });

      // Load the city tier visualizer for this mount. Tier/experience switches are URL-driven and
      // re-boot in place through the shell — no page reload.
      await selectWorldTier(initialTier);
      lifecycle.throwIfAborted();
      renderPluginExperience({ mission: activeMissionForPlugins });
    } catch (error) {
      // Tear this boot down cleanly (abort listeners, release GPU) and throw so the shell can retry
      // the tier default or surface the failure. No location.assign, no landing bounce.
      await disposeApplication();
      throw error;
    }
      return { tier: 'city', experience: data.applicationProfile.id, data, dispose: disposeApplication, getController: () => controller, getRenderer: () => renderer };
    } catch (error) {
      await disposeApplication();
      throw error;
    }
  }

  launchBrowserApp(start, collectElements);
  return { applicationProfileLabel, collectElements, friendlyMissionError, populateApplicationProfiles, populateCameraFocus, renderIdentity, renderPlaceResolution, renderPlanning, renderPolicyArena, runtimeLabel, selectCameraMode, start, validateImportedJourneyReceipt };
});
