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
      : root.SimulatteCityInterface
  }));
  root.SimulatteAutonomyApp = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createAutonomyApp(dependencies) {
  const { hostRoot, dataLoader, missionApi, controllerApi, canvasApi, traceApi, runtimeLog, neuralPlaceApi, ledgerApi, receiptsApi, worldApi, neuralConsentApi, modelSelectionApi, runtimeLoaderApi, pluginRuntimeApi, pluginRegistry, pluginUiApi, transportApi, artifactStoreApi, routePlannerApi, civilTimeApi, universeParserApi, applicationProfileSelectApi, experienceCameraApi, pluginAssetPathsApi, pluginRandomApi, pluginSchedulerApi, pluginEnvironmentApi, pluginGeographyApi, pluginComputeApi, simulationClockApi, pluginViewRuntimeApi, mountLifecycleApi, mainViewApi, pluginPlaybackApi, cityInterfaceApi } = dependencies;
  if (!cityInterfaceApi || !mainViewApi) throw new Error('simulatte_app_view_dependency_missing');
  const { collectElements, populateApplicationProfiles, applicationProfileLabel, setRuntimeStatus, runtimeLabel, renderIdentity, renderPlaceResolution, renderPlanning } = mainViewApi;
  const { wireCameraControls, selectCameraMode, populateCameraFocus, wireInterfaceControls, setJourneyPhase, resizeMissionInput, clearMissionError, isMissionInputError, friendlyMissionError, updateButtons } = cityInterfaceApi;
  const log = runtimeLog || {
    info: () => null,
    warn: () => null,
    error: () => null,
    serializeError: (error) => ({ name: error?.name || 'Error', message: error?.message || String(error) }),
  };
  // Owns the landing page and gates asset loading: nothing in start() runs until
  // the visitor picks a tier here.

  async function start(initialTier = 'city', requestedProfileId = null, hooks = {}) {
    if (!experienceCameraApi?.applyInitialCamera || !experienceCameraApi?.runCameraMode) throw new Error('Experience camera dependency is unavailable');
    const elements = collectElements();
    // Every listener binds through `on` scoped to `lifecycle`, so disposeApplication()'s abort drops
    // them all — letting the shell re-boot this app in place without double-binding the persistent DOM.
    const lifecycle = mountLifecycleApi.create(hooks.signal);
    const on = lifecycle.on;
    let extensions = null;
    let profileSelectUi = null;
    let tierVisualizer = null;
    let renderer = null;
    let placeResolver = null;
    let frameRequest = null;
    let pluginClock = null;
    let pluginViewRuntime = null;
    let pluginPlayback = null;
    let isRunning = false;
    let disposal = null;

    async function disposeApplication() {
      if (disposal) return disposal;
      disposal = (async () => {
        isRunning = false;
        pluginClock?.pause();
        if (frameRequest !== null) cancelAnimationFrame(frameRequest);
        frameRequest = null;
        lifecycle.abort();
        elements.applicationProfile.disabled = true;
        const resources = {
          profileSelectUi, placeResolver, tierVisualizer, renderer, extensions,
        };
        profileSelectUi = null;
        placeResolver = null;
        tierVisualizer = null;
        renderer = null;
        extensions = null;
        await mountLifecycleApi.disposeAll([
          { resource: 'profile-select-sync', dispose: () => resources.profileSelectUi?.sync() },
          { resource: 'place-resolver', dispose: () => resources.placeResolver?.unload() },
          { resource: 'tier-visualizer', dispose: () => resources.tierVisualizer?.destroy() },
          { resource: 'renderer', dispose: () => resources.renderer?.destroy() },
          { resource: 'plugin-runtime', dispose: () => resources.extensions?.dispose() },
          { resource: 'plugin-playback', dispose: () => pluginPlayback?.dispose() },
          { resource: 'profile-select', dispose: () => resources.profileSelectUi?.dispose() },
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
      data = await dataLoader.loadApplication(undefined, lifecycle.fetch, { requestedProfileId });
      lifecycle.throwIfAborted();
    if (!applicationProfileSelectApi?.resolveInteraction || !applicationProfileSelectApi?.renderInteraction) throw new Error('Application interaction dependency is unavailable');
    const interaction = applicationProfileSelectApi.resolveInteraction(data.applicationProfile, data.manifest);
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
    const pluginUi = pluginUiApi.createDeclarativeUiHost({
      rootElements: { inspector: elements.pluginInspector, map: elements.pluginMapUi, hud: elements.pluginHudUi },
      onAction: async ({ pluginId, actionId, command, values }) => {
        if (command?.kind === 'camera.focus') {
          const targetId = `plugin:${pluginId}:${command.targetId}`;
          pluginViewRuntime?.setManualOverride({ mode: 'free', targetIds: [targetId] });
          selectCameraMode(elements, renderer.focusCameraTarget(targetId));
          elements.cameraFocus.value = targetId;
          return;
        }
        await extensions.dispatchAction(pluginId, actionId, { mission: activeMissionForPlugins, routeObjective: data.applicationProfile.routeObjective, values });
        renderPluginExperience({ mission: activeMissionForPlugins });
      },
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
    let buildRevision = 0;
    const journeyLedger = ledgerApi.createJourneyLedger();
    const recordedJourneyHashes = new Set();
    const stepIntervalMs = 18;
    const yieldToFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
    const neuralGate = await neuralConsentApi.createGate({
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
    function renderPluginExperience(context) {
      const pluginContext = { ...context, compositionSize: extensions.activePluginIds.length };
      const platform = extensions.platformV4(pluginContext);
      pluginUi.render(extensions.views(pluginContext), platform.contributions);
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
      if (!pluginClock) pluginClock = simulationClockApi.createClock({ timeline: platform.timeline });
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
          render: () => renderPluginExperience({ mission: null }),
          onPhase: reflectPluginPlaybackPhase,
          onSettled: (receipt) => {
            hostRoot.__simulattePluginRunReceipt = receipt;
            hostRoot.__simulatteComparisonExecutionReceipts = Object.freeze(
              receipt.comparisonExecutionReceipt ? [receipt.comparisonExecutionReceipt] : []
            );
            pluginPlaybackApi.saveStoredReceipt(playbackStorage, data.applicationProfile.id, receipt);
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

    populateApplicationProfiles(elements.applicationProfile, data.manifest, data.applicationProfile.id);
    if (!applicationProfileSelectApi?.createApplicationProfileSelect) {
      throw new Error('Application profile select dependency is unavailable');
    }
    profileSelectUi = applicationProfileSelectApi.createApplicationProfileSelect({
      select: elements.applicationProfile,
      root: elements.applicationProfileControl,
      trigger: elements.applicationProfileTrigger,
      label: elements.applicationProfileLabel,
      listbox: elements.applicationProfileOptions,
    });
    on(elements.applicationProfile, 'change', () => {
      const profileId = elements.applicationProfile.value;
      if (!profileId || profileId === data.applicationProfile.id) return;
      // URL is the source of truth: push /city/<profileId>; the shell re-boots this app in place.
      hooks.navigate?.({ tier: 'city', experience: profileId });
    });
    on(window, 'pagehide', () => { void disposeApplication(); }, { once: true });

    async function ensureRenderer(worldModel) {
      if (renderer) return renderer;
      renderer = await canvasApi.createCanvasRenderer(elements.autonomyCanvas, worldModel, {
        minimapCanvas: elements.followMinimap,
        regionRegistry: data.regionRegistry,
        regionPacks: data.regionPacks,
        onFailure: (error) => {
          stopLoop();
          failRuntime(elements, error);
        },
        onCameraInteraction: (cameraInteraction) => {
          pluginViewRuntime?.setManualOverride({
            mode: cameraInteraction.mode,
            targetIds: cameraInteraction.targetIds,
          });
        },
      });
      wireCameraControls(elements, renderer, lifecycle.signal, {
        onManualNavigation: (cameraInteraction) => {
          pluginViewRuntime?.setManualOverride({
            mode: cameraInteraction.mode,
            targetIds: cameraInteraction.targetIds,
          });
        },
      });
      const renderReceipt = renderer.receipt();
      log.info('renderer.ready', {
        backend: renderReceipt.backend,
        adapter: renderReceipt.adapter,
        buildingCount: renderReceipt.buildingCount,
        staticVertexCount: renderReceipt.staticVertexCount,
        ambientTraffic: renderReceipt.ambientTraffic,
      });
      return renderer;
    }

    async function buildController({ keepMissionLocked = false } = {}) {
      const revision = ++buildRevision;
      const isCurrent = () => revision === buildRevision;
      clearMissionError(elements);
      const requestedSourceText = elements.missionInput.value;
      const preflightContributions = await extensions.contributeRequest({ sourceText: requestedSourceText });
      if (!isCurrent()) return null;
      const sourceOverrides = preflightContributions.filter((row) => row.executableSourceText);
      if (sourceOverrides.length > 1) throw new Error(`Plugin request conflict: ${sourceOverrides.map((row) => row.pluginId).join(', ')} proposed executable source`);
      const executableSourceText = sourceOverrides[0]?.executableSourceText || requestedSourceText;
      if (interaction.mode === 'playback') {
        const playbackWorld = worldApi.createWorldModel(data.world);
        await ensureRenderer(playbackWorld);
        if (!isCurrent()) return null;
        const initialNode = data.world.nodes[0];
        const snapshot = {
          route: { segmentIds: [] },
          state: {
            tick: 0,
            taskType: 'playback',
            currentNodeId: initialNode.id,
            position: { ...initialNode.position },
            suppressPrimaryActor: true,
            distanceTraveledM: 0,
            speedMps: 0,
            simulatedTimeSeconds: 0,
            status: 'active',
          },
        };
        renderer.reset();
        renderer.render(snapshot);
        activeMission = null;
        activeMissionForPlugins = null;
        renderPluginExperience({ mission: null });
        elements.renderIdentity.textContent = renderIdentity(renderer.receipt());
        setRuntimeStatus(elements, 'Ready', 'ready');
        setJourneyPhase('ready');
        updateButtons(elements, keepMissionLocked, true, 'active', hasJourneyStarted);
        return null;
      }
      const placeSelection = modelSelection.selectedRuntimeRef('place-resolution');
      const useNeuralPlaces = placeSelection.kind === 'embedding';
      if (useNeuralPlaces && await modelSelection.ensureConsent() !== true) {
        throw new Error('Selected place model requires local model consent');
      }
      if (useNeuralPlaces && !placeResolver) {
        await runtimeLoaderApi.loadOptionalModel();
        const activeNeuralPlaceApi = neuralPlaceApi || globalThis.SimulatteNeuralPlaceResolver;
        if (!activeNeuralPlaceApi?.createPlaceResolver) throw new Error('Neural place resolver failed to load');
        placeResolver = activeNeuralPlaceApi.createPlaceResolver({
          index: data.placeEmbeddingIndex,
          modelLock: data.modelRuntimeLock,
          onProgress(event) {
            if (event?.phase === 'ready') {
              setRuntimeStatus(elements, 'Ready', 'ready');
              elements.placeLaneNote.textContent = 'Semantic test ready. It currently adds no diagnostic matches.';
            } else if (event?.percent != null) {
              setRuntimeStatus(elements, `Loading semantic matching ${Math.round(event.percent)}%`, 'loading');
              elements.placeLaneNote.textContent = `Downloading semantic matching ${Math.round(event.percent)}%.`;
            }
          },
        });
      }
      const mission = useNeuralPlaces && sourceOverrides.length === 0
        ? await missionApi.compileMissionWithResolver(executableSourceText, data.world, data.embodiments, placeResolver)
        : missionApi.compileMission(executableSourceText, data.world, data.embodiments);
      if (!isCurrent()) return null;
      const pluginContributions = await extensions.contributeRequest({ sourceText: requestedSourceText, executableSourceText, mission });
      if (!isCurrent()) return null;
      applyPluginMissionContributions(mission, pluginContributions);
      log.info('mission.compiled', {
        missionId: mission.id,
        sourceText: requestedSourceText,
        executableSourceText,
        embodimentId: mission.embodimentId,
        task: mission.task,
        constraints: mission.constraints,
        grounding: mission.grounding,
        placeResolution: mission.placeResolution,
        modelSelection: modelSelection.receipt(),
      });
      renderPlaceResolution(elements, mission, placeResolver?.receipt() || null, data.placeResolutionEvidence);
      await yieldToFrame();
      if (!isCurrent()) return null;
      const embodiment = data.embodiments.find((row) => row.id === mission.embodimentId);
      if (!embodiment) throw new Error(`Mission selected unavailable embodiment ${mission.embodimentId}`);
      const nextController = controllerApi.createAutonomyController({
        world: data.world,
        featureCatalog: data.featureCatalog,
        occurrenceCatalog: data.occurrenceCatalog,
        routeContributors: extensions.routeContributors({ mission }),
        routeObjective: data.applicationProfile.routeObjective,
        embodiment,
        policy: data.policy,
        mission,
        regionComposition: data.regionComposition,
        onTick: ({ entry, snapshot }) => {
          renderer.render(snapshot, entry.payload);
          traceView.renderTick(entry, snapshot);
          setRuntimeStatus(elements, runtimeLabel(snapshot.state), snapshot.state.status);
          const retrieval = entry.payload?.observation?.featureRetrieval;
          if (!retrievalLaneLogged && retrieval) {
            retrievalLaneLogged = true;
            log.info('retrieval.lane.executed', {
              missionId: mission.id,
              method: retrieval.method,
              reranker: retrieval.reranker,
              modelExecution: retrieval.modelExecution,
              counts: retrieval.counts,
            });
          }
          if (!terminalJourneyLogged && snapshot.state.status !== 'active') {
            terminalJourneyLogged = true;
            setJourneyPhase(snapshot.state.status === 'completed' ? 'completed' : 'failed');
            log.info('journey.terminal', {
              missionId: mission.id,
              status: snapshot.state.status,
              terminalReason: snapshot.state.terminalReason || null,
              tick: snapshot.state.tick,
              distanceTraveledM: snapshot.state.distanceTraveledM,
              simulatedTimeSeconds: snapshot.state.simulatedTimeSeconds,
              completedLaps: snapshot.state.completedLaps,
            });
            recordJourney(nextController).catch((error) => log.error('journey.ledger.failed', log.serializeError(error)));
          }
          if (snapshot.state.status !== 'active') stopLoop();
        },
      });
      await ensureRenderer(nextController.worldModel);
      if (!isCurrent()) return null;
      retrievalLaneLogged = false;
      terminalJourneyLogged = false;
      await yieldToFrame();
      if (!isCurrent()) return null;
      renderer.reset();
      const snapshot = nextController.snapshot();
      renderer.render(snapshot);
      await yieldToFrame();
      if (!isCurrent()) return null;
      controller = nextController;
      activeMission = mission;
      activeMissionForPlugins = mission;
      traceView.renderInitial(snapshot, renderer.receipt());
      renderPlanning(elements, nextController.planning());
      renderPluginExperience({ mission });
      elements.renderIdentity.textContent = renderIdentity(renderer.receipt());
      setRuntimeStatus(elements, snapshot.state.status === 'active' ? 'Ready' : runtimeLabel(snapshot.state), snapshot.state.status === 'active' ? 'ready' : 'failed');
      setJourneyPhase(snapshot.state.status === 'active' ? 'ready' : 'failed');
      updateButtons(elements, keepMissionLocked, true, snapshot.state.status, hasJourneyStarted);
      if (snapshot.state.status !== 'active') await recordJourney(nextController);
      return controller;
    }

    async function recordJourney(targetController) {
      const receipt = await targetController.journeyReceipt();
      receipt.pluginSettlement = await extensions.settle({ journey: receipt });
      receipt.pluginRuntime = extensions.runtimeReceipt();
      renderPluginExperience({ mission: activeMission, journey: receipt });
      const identity = `${receipt.mission.id}:${receipt.integrity.terminalHash}:${receipt.finalState.status}`;
      if (recordedJourneyHashes.has(identity)) return receipt;
      recordedJourneyHashes.add(identity);
      await journeyLedger.append(receipt);
      await renderLedger(elements, journeyLedger, data.curriculum, data.world.contentVersion);
      return receipt;
    }

    async function tickFrame(timestamp) {
      if (!isRunning || !controller) return;
      if (timestamp - lastStepAt >= stepIntervalMs) {
        lastStepAt = timestamp;
        await controller.step();
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
          if (pluginPlayback.snapshot().phase === 'paused') pluginPlayback.resume();
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
      const label = phase === 'completed'
        ? 'Complete'
        : phase === 'paused'
          ? `Paused at ${snapshot.currentStep} of ${snapshot.totalSteps}`
          : phase === 'running'
            ? `Running ${snapshot.currentStep} of ${snapshot.totalSteps}`
            : 'Ready';
      setRuntimeStatus(elements, label, phase === 'failed' ? 'error' : phase);
    }
    on(elements.whatIfButton, 'click', () => interfaceUi.openDecisions('plugin-inspector'));
    on(elements.exportButton, 'click', async () => {
      if (!controller) return;
      const receipt = await controller.journeyReceipt();
      receipt.rendering = renderer.receipt();
      receipt.dataLoad = structuredClone(data.receipt);
      receipt.pluginRuntime = extensions.runtimeReceipt();
      log.info('journey.receipt.exported', {
        missionId: receipt.mission.id,
        terminalHash: receipt.integrity.terminalHash,
        traceEntryCount: receipt.trace.length,
      });
      downloadJson(`simulatte-autonomy-${receipt.mission.id}.json`, receipt);
    });
    on(elements.exportLedgerButton, 'click', async () => {
      downloadJson('simulatte-local-settlement-ledger.json', await journeyLedger.exportLedger());
    });
    on(elements.importReceiptButton, 'click', () => elements.importReceiptFile.click());
    on(elements.importReceiptFile, 'change', async () => {
      const [file] = elements.importReceiptFile.files || [];
      elements.importReceiptFile.value = '';
      if (!file) return;
      try {
        const imported = JSON.parse(await file.text());
        await validateImportedJourneyReceipt(imported, receiptsApi);
        stopLoop();
        elements.missionInput.value = imported.mission.sourceText;
        resizeMissionInput(elements.missionInput);
        buildRevision += 1;
        controller = null;
        hasJourneyStarted = false;
        updateButtons(elements, false, false, 'active', false);
        setRuntimeStatus(elements, 'Receipt verified. Ready to replay.', 'ready');
        log.info('journey.receipt.imported', {
          filename: file.name,
          missionId: imported.mission.id,
          terminalHash: imported.integrity.terminalHash,
          worldContentVersion: imported.identities.worldContentVersion,
          networkWrite: false,
        });
      } catch (error) {
        setRuntimeStatus(elements, `Receipt import refused: ${error.message}`, 'error');
        log.error('journey.receipt.import_failed', log.serializeError(error));
      }
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
      if (storedPlaybackReceipt) {
        if (!pluginPlayback) throw new Error('Stored plugin playback cannot be restored without a playback controller');
        try {
          await pluginPlayback.restore(storedPlaybackReceipt);
        } catch (error) {
          pluginPlaybackApi.clearStoredReceipt(playbackStorage, data.applicationProfile.id);
          throw error;
        }
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

  function failRuntime(elements, error) {
    setJourneyPhase('failed');
    try { if (typeof window !== 'undefined') window.__simulatteLastFailError = { code: error?.code || null, name: error?.name || null, message: error?.message || String(error), evidence: error?.evidence || null, stack: typeof error?.stack === 'string' ? error.stack.split('\n').slice(0, 6).join('\n') : null }; } catch (_e) { /* diagnostic only */ }
    log.error('runtime.failed', log.serializeError(error));
    if (isMissionInputError(error)) {
      elements.missionError.textContent = friendlyMissionError(error);
      elements.missionInput.setAttribute('aria-invalid', 'true');
      setRuntimeStatus(elements, 'Check mission', 'changed');
      updateButtons(elements, false, false, 'active', false);
      elements.missionInput.focus();
      return;
    }
    elements.missionError.textContent = 'The simulator stopped. Open status for technical details.';
    setRuntimeStatus(elements, 'Stopped', 'error');
    updateButtons(elements, false, false, 'failed', true);
  }

  function applyPluginMissionContributions(mission, contributions) {
    const patches = contributions.filter((row) => row.missionPatch);
    const routePatches = patches.filter((row) => row.missionPatch.routeOverride);
    if (routePatches.length > 1) throw new Error(`Plugin mission conflict: ${routePatches.map((row) => row.pluginId).join(', ')} proposed route overrides`);
    patches.forEach((row) => {
      const keys = Object.keys(row.missionPatch);
      if (keys.some((key) => key !== 'routeOverride')) throw new Error(`Plugin ${row.pluginId} proposed unsupported mission fields: ${keys.join(', ')}`);
    });
    if (routePatches.length) mission.constraints.routeOverride = structuredClone(routePatches[0].missionPatch.routeOverride);
    mission.extensions = Object.freeze(Object.fromEntries(contributions.map((row) => [row.pluginId, structuredClone({
      recognized: Boolean(row.recognized), obligations: row.obligations || [], unresolved: row.unresolved || [],
    })])));
    return mission;
  }

  function environmentInstant(world, mission) {
    const snapshotDate = world.provenance?.snapshotDate || '2026-07-14';
    const localMinutes = mission.constraints.departureLocalMinutes;
    const hour = String(Math.floor(localMinutes / 60)).padStart(2, '0');
    const minute = String(localMinutes % 60).padStart(2, '0');
    return civilTimeApi.resolve({
      civilTime: `${snapshotDate}T${hour}:${minute}:00`,
      timeZone: world.scenario?.timeZone || 'America/New_York',
    }).utcInstant;
  }

  async function renderLedger(elements, ledger, curriculum = null, worldContentVersion = null) {
    try {
      const summary = await ledger.summary();
      const error = summary.meanAbsoluteEtaErrorSeconds;
      const curriculumProgress = curriculum ? await ledger.curriculumProgress(curriculum, worldContentVersion) : null;
      elements.ledgerProof.textContent = `${summary.trialCount} trial${summary.trialCount === 1 ? '' : 's'}${error === null ? '' : ` · MAE ${error.toFixed(1)} s`}${curriculumProgress ? ` · curriculum ${curriculumProgress.completedCount}/${curriculumProgress.missionCount}` : ''}`;
    } catch (error) {
      elements.ledgerProof.textContent = `integrity failure · ${error.code || 'invalid'}`;
    }
  }

  function renderPolicyArena(elements, evidence) {
    const leader = evidence?.diagnosticSelection;
    const lane = evidence?.lanes?.find((row) => row.id === leader?.laneId);
    elements.policyArenaProof.textContent = leader?.status === 'diagnostic_leader_only' && lane
      ? `${lane.id} · ${lane.metrics.safetyAdjustedCompletionScore.toFixed(3)} · promotion blocked`
      : 'no qualified diagnostic leader';
  }

  function downloadJson(filename, value) {
    const blob = new Blob([`${JSON.stringify(value, null, 2)}\n`], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function validateImportedJourneyReceipt(value, receiptTools = receiptsApi) {
    if (!value || value.schema !== 'simulatte.autonomyJourneyReceipt.v2') {
      throw new Error('expected simulatte.autonomyJourneyReceipt.v2');
    }
    if (!value.mission || typeof value.mission.sourceText !== 'string' || !value.mission.sourceText.trim()) {
      throw new Error('receipt has no replayable mission source text');
    }
    if (!value.integrity || !Array.isArray(value.trace) || !receiptTools?.verifyReceiptChain) {
      throw new Error('receipt integrity evidence is unavailable');
    }
    const verification = await receiptTools.verifyReceiptChain({
      schema: 'simulatte.autonomyReceiptChain.v1',
      algorithm: value.integrity.algorithm,
      terminalHash: value.integrity.terminalHash,
      entries: value.trace,
    });
    if (!verification.pass || verification.entryCount !== value.integrity.entryCount) {
      throw new Error(`receipt chain failed verification: ${verification.reason}`);
    }
    return verification;
  }

  if (typeof document !== 'undefined') {
    const launch = () => {
      // Single URL dispatcher: the path names the tier; city boots the mission app, every other
      // scale the governed explorer. Both return { tier, experience, dispose } to the shell.
      const router = SimulatteRouter.createRouter(window);
      const navigate = (route) => router.navigate(route);
      const governedCtx = { collectElements, setJourneyPhase, setRuntimeStatus, createTierVisualizer: SimulatteMultiTierVisualizer.createTierVisualizer, navigate, onSelectTier: (tier) => navigate({ tier, experience: null }) };
      const boot = (tier, experience, options) => tier === 'city'
        ? start('city', experience, { navigate, signal: options?.signal })
        : SimulatteWorldTiersBoot.bootGovernedTierExplorer(governedCtx, tier, experience, options);
      const shell = SimulatteWorldTiersBoot.createAppShell({ router, boot, landing: document.getElementById('world-tiers-landing-page') });
      void Promise.resolve(shell.start()).catch((error) => {
        try { failRuntime(collectElements(), error); } catch (boundaryError) { log.error('runtime.bootstrap_failed', log.serializeError(boundaryError)); }
      });
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', launch, { once: true });
    else launch();
  }

  return { applicationProfileLabel, collectElements, friendlyMissionError, populateApplicationProfiles, populateCameraFocus, renderIdentity, renderPlaceResolution, renderPlanning, renderPolicyArena, runtimeLabel, selectCameraMode, start, validateImportedJourneyReceipt };
});
