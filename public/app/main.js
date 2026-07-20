(function attachAutonomyApp(root, factory) {
  const api = factory(
    root.SimulatteApplicationLoader,
    root.SimulatteAutonomyMission,
    root.SimulatteAutonomyController,
    root.SimulatteAutonomyCanvas,
    root.SimulatteAutonomyTraceView,
    root.SimulatteAutonomyRuntimeLog,
    root.SimulatteNeuralPlaceResolver,
    root.SimulatteJourneyLedger,
    root.SimulatteAutonomyReceipts,
    root.SimulatteAutonomyWorld,
    root.SimulatteNeuralModelConsent,
    root.SimulatteModelSelection,
    root.SimulattePluginRuntime,
    root.SimulatteGeneratedPluginRegistry,
    root.SimulatteDeclarativeUiHost,
    root.SimulatteBrowserTransport,
    root.SimulatteGovernedArtifactStore,
    root.SimulatteAutonomyRoutePlanner,
    root.SimulatteCivilTime,
    root.SimulatteUniverseParser,
    root.SimulatteApplicationProfileSelect,
    root.SimulatteExperienceCamera
  );
  root.SimulatteAutonomyApp = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createAutonomyApp(dataLoader, missionApi, controllerApi, canvasApi, traceApi, runtimeLog, neuralPlaceApi, ledgerApi, receiptsApi, worldApi, neuralConsentApi, modelSelectionApi, pluginRuntimeApi, pluginRegistry, pluginUiApi, transportApi, artifactStoreApi, routePlannerApi, civilTimeApi, universeParserApi, applicationProfileSelectApi, experienceCameraApi) {
  const log = runtimeLog || {
    info: () => null,
    warn: () => null,
    error: () => null,
    serializeError: (error) => ({ name: error?.name || 'Error', message: error?.message || String(error) }),
  };
  const PROFILE_LABELS = Object.freeze({
    'accessible-journey-v1': 'Accessible Journey',
    'amenity-router-v1': 'Amenity Router',
    'cable-trader-pickup-v1': 'Cable Trader',
    'cooperative-cable-city-v1': 'Cooperative Cable City',
    'counterfactual-lab-v1': 'Counterfactual Lab',
    'gig-wage-truth-v1': 'Gig Wage Truth',
    'historical-streets-v1': 'Historical Streets',
    'p2p-delivery-v1': 'P2P Delivery',
    'safety-explorer-v1': 'Safety Explorer',
    'simulatte-world-v1': 'Simulatte World',
    'sun-walker-v1': 'Sun Walker',
  });
  async function start() {
    if (!experienceCameraApi?.applyInitialCamera || !experienceCameraApi?.runCameraMode) throw new Error('Experience camera dependency is unavailable');
    const elements = collectElements();
    const interfaceUi = wireInterfaceControls(elements);
    setJourneyPhase('loading');
    log.info('app.boot.started', {
      build: document.querySelector('meta[name="simulatte-build"]')?.content || null,
      location: window.location.href,
      userAgent: navigator.userAgent,
    });
    setRuntimeStatus(elements, 'Loading', 'loading');
    let data;
    try {
      data = await dataLoader.loadApplication();
    } catch (error) {
      failRuntime(elements, error);
      return null;
    }
    if (!applicationProfileSelectApi?.resolveInteraction || !applicationProfileSelectApi?.renderInteraction) throw new Error('Application interaction dependency is unavailable');
    const interaction = applicationProfileSelectApi.resolveInteraction(data.applicationProfile, data.manifest);
    let activeScenario = interaction.defaultScenario;
    const pluginArtifacts = artifactStoreApi.createGovernedArtifactStore({ transport: transportApi.createBrowserTransport({ fetchImpl: fetch.bind(globalThis) }) });
    let activeMissionForPlugins = null;
    const extensions = await pluginRuntimeApi.createPluginRuntime({
      registry: pluginRegistry,
      profile: data.applicationProfile,
      scenario: activeScenario,
      dataCatalog: data.dataCatalog,
      artifactStore: pluginArtifacts,
      registryBaseUrl: document.baseURI,
      corePorts: {
        worldQuery: Object.freeze({ snapshot: () => data.world, model: () => worldApi.createWorldModel(data.world) }),
        routing: Object.freeze({
          plan(options) { return routePlannerApi.planRoute(options); },
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
      },
    });
    const pluginUi = pluginUiApi.createDeclarativeUiHost({
      rootElements: { inspector: elements.pluginInspector, map: elements.pluginMapUi, hud: elements.pluginHudUi },
      onAction: async ({ pluginId, actionId, command, values }) => {
        if (command?.kind === 'camera.focus') {
          const targetId = `plugin:${pluginId}:${command.targetId}`;
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
    let renderer = null;
    let isRunning = false;
    let frameRequest = null;
    let lastStepAt = 0;
    let retrievalLaneLogged = false;
    let terminalJourneyLogged = false;
    let hasJourneyStarted = false;
    let hasAppliedInitialCamera = false;
    let placeResolver = null;
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
    let disposal = null;
    let profileSelectUi = null;

    function renderPluginExperience(context) {
      const pluginContext = { ...context, compositionSize: extensions.activePluginIds.length };
      pluginUi.render(extensions.views(pluginContext));
      if (!renderer) return;
      const selected = elements.cameraFocus.value || 'route';
      renderer.setPluginPresentations(extensions.presentations(pluginContext));
      populateCameraFocus(elements.cameraFocus, renderer.cameraTargets(), selected);
      if (!hasAppliedInitialCamera) hasAppliedInitialCamera = experienceCameraApi.applyInitialCamera({
        configuration: data.applicationProfile.camera,
        renderer,
        focusSelect: elements.cameraFocus,
        onModeSelected: (mode) => selectCameraMode(elements, mode),
      });
    }

    async function disposeApplication() {
      if (disposal) return disposal;
      disposal = (async () => {
        stopLoop();
        elements.applicationProfile.disabled = true;
        profileSelectUi?.sync();
        if (placeResolver) {
          await placeResolver.unload();
          placeResolver = null;
        }
        await extensions.dispose();
        profileSelectUi?.dispose();
      })();
      return disposal;
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
    elements.applicationProfile.addEventListener('change', async () => {
      const profileId = elements.applicationProfile.value;
      if (!profileId || profileId === data.applicationProfile.id) return;
      setRuntimeStatus(elements, 'Switching application', 'loading');
      try {
        await disposeApplication();
        const url = new URL(window.location.href);
        url.searchParams.set('profile', profileId);
        window.location.assign(url.toString());
      } catch (error) {
        failRuntime(elements, error);
      }
    });
    window.addEventListener('pagehide', () => { void disposeApplication(); }, { once: true });

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
      const placeSelection = modelSelection.selectedRuntimeRef('place-resolution');
      const useNeuralPlaces = placeSelection.kind === 'embedding';
      if (useNeuralPlaces && await modelSelection.ensureConsent() !== true) {
        throw new Error('Selected place model requires local model consent');
      }
      if (useNeuralPlaces && !placeResolver) {
        placeResolver = neuralPlaceApi.createPlaceResolver({
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
      if (!renderer) {
        renderer = await canvasApi.createCanvasRenderer(elements.autonomyCanvas, nextController.worldModel, {
          minimapCanvas: elements.followMinimap,
          regionRegistry: data.regionRegistry,
          regionPacks: data.regionPacks,
          onFailure: (error) => {
            stopLoop();
            failRuntime(elements, error);
          },
        });
        wireCameraControls(elements, renderer);
        const renderReceipt = renderer.receipt();
        log.info('renderer.ready', {
          backend: renderReceipt.backend,
          adapter: renderReceipt.adapter,
          buildingCount: renderReceipt.buildingCount,
          staticVertexCount: renderReceipt.staticVertexCount,
          ambientTraffic: renderReceipt.ambientTraffic,
        });
      }
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
    elements.startButton.addEventListener('click', startRun);
    elements.resumeButton.addEventListener('click', startRun);
    elements.newMissionButton.addEventListener('click', () => {
      stopLoop();
      buildRevision += 1;
      controller = null;
      hasJourneyStarted = false;
      updateButtons(elements, false, false, 'active', false);
      setRuntimeStatus(elements, 'Ready', 'changed');
      applicationProfileSelectApi.focusPrimary(interaction, elements);
    });
    elements.shuffleButton.addEventListener('click', async () => {
      if (isRunning) return;
      activeScenario = applicationProfileSelectApi.nextScenario(interaction, activeScenario.id);
      await extensions.setScenario(activeScenario);
      applicationProfileSelectApi.renderInteraction(interaction, activeScenario, elements);
      log.info('application.scenario.selected', {
        scenarioId: activeScenario.id,
        seed: activeScenario.seed,
        interactionMode: interaction.mode,
      });
      elements.missionInput.dispatchEvent(new Event('input', { bubbles: true }));
      resizeMissionInput(elements.missionInput);
      renderPluginExperience({ mission: null });
    });
    elements.pauseButton.addEventListener('click', () => {
      stopLoop();
      setRuntimeStatus(elements, 'Paused', 'paused');
    });
    elements.stepButton.addEventListener('click', async () => {
      try {
        stopLoop();
        let targetController = controller;
        if (!targetController || targetController.snapshot().state.status !== 'active') targetController = await buildController();
        if (targetController) await targetController.step();
      } catch (error) {
        failRuntime(elements, error);
      }
    });
    elements.resetButton.addEventListener('click', async () => {
      stopLoop();
      try {
        hasJourneyStarted = false;
        await buildController();
      } catch (error) {
        failRuntime(elements, error);
      }
    });
    elements.replayButton.addEventListener('click', async () => {
      try {
        stopLoop();
        hasJourneyStarted = false;
        await buildController({ keepMissionLocked: true });
        await runLoop();
      } catch (error) {
        stopLoop();
        failRuntime(elements, error);
      }
    });
    elements.whatIfButton.addEventListener('click', () => interfaceUi.openDecisions('plugin-inspector'));
    elements.exportButton.addEventListener('click', async () => {
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
    elements.exportLedgerButton.addEventListener('click', async () => {
      downloadJson('simulatte-local-settlement-ledger.json', await journeyLedger.exportLedger());
    });
    elements.importReceiptButton.addEventListener('click', () => elements.importReceiptFile.click());
    elements.importReceiptFile.addEventListener('change', async () => {
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
    elements.missionInput.addEventListener('input', () => {
      if (isRunning) return;
      clearMissionError(elements);
      resizeMissionInput(elements.missionInput);
      buildRevision += 1;
      controller = null;
      hasJourneyStarted = false;
      updateButtons(elements, false, false, 'active', false);
      setRuntimeStatus(elements, 'Ready', 'changed');
    });
    elements.missionInput.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
      event.preventDefault();
      elements.startButton.click();
    });
    elements.modelSelectionControls.addEventListener('model-selection-change', async (event) => {
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
    window.addEventListener('resize', () => {
      if (renderer && controller) renderer.render(controller.snapshot());
    });

    try {
      renderPolicyArena(elements, data.policyArenaEvidence);
      await renderLedger(elements, journeyLedger, data.curriculum, data.world.contentVersion);
      await buildController();
    } catch (error) {
      failRuntime(elements, error);
    }
    return { data, dispose: disposeApplication, getController: () => controller, getRenderer: () => renderer };
  }

  function collectElements() {
    const ids = [
      'mission-field', 'scenario-field', 'scenario-label', 'scenario-description', 'scenario-seed', 'mission-input', 'mission-error', 'place-resolution-lane', 'place-lane-note', 'model-selection-controls', 'shuffle-button', 'shuffle-label', 'start-button', 'start-label', 'pause-button', 'resume-button', 'step-button', 'reset-button', 'replay-button', 'new-mission-button', 'what-if-button', 'export-button',
      'dock-more-button', 'dock-more-menu',
      'runtime-status', 'runtime-toggle', 'runtime-details', 'runtime-details-close', 'application-profile', 'application-profile-control', 'application-profile-trigger', 'application-profile-label', 'application-profile-options', 'render-identity', 'autonomy-canvas', 'follow-minimap', 'decision-title', 'decision-meta',
      'bet-list', 'gate-list', 'trace-list', 'route-formula', 'route-stats', 'route-components',
      'retrieval-query', 'retrieval-candidates', 'rerank-candidates', 'retrieval-stats', 'settlement-math',
      'reranker-proof', 'place-resolution-proof',
      'occurrence-stats', 'occurrence-patterns', 'occurrence-effects',
      'metric-state', 'metric-tick', 'metric-time', 'metric-speed', 'metric-distance', 'metric-route', 'metric-bet', 'journey-progress-fill', 'journey-hud',
      'metric-settlement', 'metric-calibration', 'camera-focus', 'camera-focus-button', 'camera-focus-popover', 'camera-follow', 'camera-bird', 'camera-top',
      'planning-forecast', 'alternative-proof', 'ledger-proof', 'policy-arena-proof',
      'export-ledger-button', 'import-receipt-button', 'import-receipt-file',
      'decisions-button', 'decisions-drawer', 'decisions-close', 'decisions-backdrop', 'journey-section',
      'plugin-inspector', 'plugin-map-ui', 'plugin-hud-ui',
    ];
    const elements = Object.fromEntries(ids.map((id) => [camelId(id), document.getElementById(id)]));
    const missing = ids.filter((id) => !document.getElementById(id));
    if (missing.length) throw new Error(`Autonomy UI expected elements: ${missing.join(', ')}`);
    return elements;
  }

  function populateApplicationProfiles(select, manifest, selectedId) {
    const references = [manifest.applicationProfile, ...(manifest.applicationProfiles || [])];
    const options = references.map((reference) => {
      const option = document.createElement('option');
      option.value = reference.id;
      option.textContent = applicationProfileLabel(reference.id);
      return option;
    });
    select.replaceChildren(...options);
    select.value = selectedId;
    select.disabled = false;
  }

  function applicationProfileLabel(id) {
    if (PROFILE_LABELS[id]) return PROFILE_LABELS[id];
    return String(id)
      .replace(/-v\d+$/, '')
      .split('-')
      .filter(Boolean)
      .map((word, index) => index === 0 ? `${word.charAt(0).toUpperCase()}${word.slice(1)}` : word)
      .join(' ');
  }

  function wireCameraControls(elements, renderer) {
    const controls = [
      [elements.cameraFollow, 'follow'],
      [elements.cameraBird, 'bird'],
      [elements.cameraTop, 'top'],
    ];
    populateCameraFocus(elements.cameraFocus, renderer.cameraTargets());
    controls.forEach(([button, mode]) => button.addEventListener('click', () => {
      renderer.setCameraMode(mode);
      selectCameraMode(elements, mode);
    }));
    elements.cameraFocus.addEventListener('change', () => selectCameraMode(elements, renderer.focusCameraTarget(elements.cameraFocus.value)));
  }

  function selectCameraMode(elements, mode) {
    [
      [elements.cameraFollow, 'follow'],
      [elements.cameraBird, 'bird'],
      [elements.cameraTop, 'top'],
    ].forEach(([button, buttonMode]) => {
      const active = buttonMode === mode;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  function populateCameraFocus(select, targets, selectedId = 'route') {
    select.replaceChildren();
    const groups = new Map([
      ['route', document.createElement('optgroup')],
      ['region', document.createElement('optgroup')],
      ['place', document.createElement('optgroup')],
      ['plugin', document.createElement('optgroup')],
    ]);
    groups.get('route').label = 'Journey';
    groups.get('region').label = 'Regions';
    groups.get('place').label = 'Places';
    groups.get('plugin').label = 'Application';
    targets.forEach((target) => {
      const option = document.createElement('option');
      option.value = target.id;
      option.textContent = target.label;
      groups.get(target.kind).append(option);
    });
    groups.forEach((group) => {
      if (group.children.length) select.append(group);
    });
    select.value = targets.some((row) => row.id === selectedId) ? selectedId : 'route';
  }

  function camelId(id) {
    return id.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
  }

  function wireInterfaceControls(elements) {
    let lastDrawerTrigger = null;
    const popovers = [
      [elements.runtimeToggle, elements.runtimeDetails],
      [elements.cameraFocusButton, elements.cameraFocusPopover],
      [elements.dockMoreButton, elements.dockMoreMenu],
    ];

    function setPopover(button, panel, open) {
      panel.hidden = !open;
      button.setAttribute('aria-expanded', String(open));
    }

    function closeTransientPopovers(except = null) {
      popovers.forEach(([button, panel]) => {
        if (button !== except) setPopover(button, panel, false);
      });
    }

    function openDecisions(sectionId = null) {
      closeTransientPopovers();
      lastDrawerTrigger = document.activeElement;
      elements.decisionsDrawer.classList.add('is-open');
      elements.decisionsDrawer.setAttribute('aria-hidden', 'false');
      elements.decisionsButton.setAttribute('aria-expanded', 'true');
      elements.decisionsBackdrop.hidden = false;
      if (sectionId) {
        const section = document.getElementById(sectionId);
        for (let node = section; node && node !== elements.decisionsDrawer; node = node.parentElement) {
          if (node.tagName === 'DETAILS') node.open = true;
        }
        section?.scrollIntoView({ block: 'start' });
      }
      window.setTimeout(() => elements.decisionsClose.focus(), 0);
    }

    function closeDecisions({ restoreFocus = true } = {}) {
      elements.decisionsDrawer.classList.remove('is-open');
      elements.decisionsDrawer.setAttribute('aria-hidden', 'true');
      elements.decisionsButton.setAttribute('aria-expanded', 'false');
      elements.decisionsBackdrop.hidden = true;
      if (restoreFocus && lastDrawerTrigger instanceof HTMLElement) lastDrawerTrigger.focus();
    }

    popovers.forEach(([button, panel]) => button.addEventListener('click', () => {
      const open = panel.hidden;
      closeTransientPopovers(open ? button : null);
      setPopover(button, panel, open);
    }));
    elements.runtimeDetailsClose.addEventListener('click', () => setPopover(elements.runtimeToggle, elements.runtimeDetails, false));
    elements.dockMoreMenu.addEventListener('click', (event) => {
      if (event.target.closest('button')) setPopover(elements.dockMoreButton, elements.dockMoreMenu, false);
    });
    elements.cameraFocus.addEventListener('change', () => setPopover(elements.cameraFocusButton, elements.cameraFocusPopover, false));
    const sections = Array.from(elements.decisionsDrawer.querySelectorAll(':scope > details.evidence-section'));
    sections.forEach((section) => section.addEventListener('toggle', () => {
      if (!section.open) return;
      sections.forEach((other) => {
        if (other !== section) other.open = false;
      });
    }));
    const openJourney = () => openDecisions('journey-section');
    elements.journeyHud.addEventListener('click', openJourney);
    elements.journeyHud.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      openJourney();
    });
    elements.decisionsButton.addEventListener('click', () => openDecisions());
    elements.decisionsClose.addEventListener('click', () => closeDecisions());
    elements.decisionsBackdrop.addEventListener('click', () => closeDecisions());
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      if (elements.decisionsDrawer.classList.contains('is-open')) closeDecisions();
      else closeTransientPopovers();
    });
    document.addEventListener('pointerdown', (event) => {
      popovers.forEach(([button, panel]) => {
        if (!panel.hidden && !panel.contains(event.target) && !button.contains(event.target)) setPopover(button, panel, false);
      });
    });
    return { closeDecisions, openDecisions };
  }

  function setJourneyPhase(phase) {
    const allowed = new Set(['loading', 'ready', 'running', 'paused', 'completed', 'failed']);
    document.body.dataset.journeyPhase = allowed.has(phase) ? phase : 'ready';
  }

  function resizeMissionInput(textarea) {
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(150, Math.max(58, textarea.scrollHeight))}px`;
  }

  function clearMissionError(elements) {
    elements.missionError.textContent = '';
    elements.missionInput.removeAttribute('aria-invalid');
  }

  function isMissionInputError(error) {
    if (error?.name === 'AutonomyMissionError') return true;
    return /(_not_grounded|_ambiguous|_not_positive|source_text_missing|route_has_no_extent|ordered_stop_repeated|clock_time_invalid|arrival_deadline_precedes_departure)$/.test(String(error?.code || ''));
  }

  function friendlyMissionError(error) {
    const messages = {
      source_text_missing: 'Describe a supported trip or loop before starting.',
      task_not_grounded: 'Describe a trip between places or a loop around a declared circuit.',
      loop_task_not_grounded: 'For a loop, say around, circle, lap, or loop.',
      mode_not_grounded: 'Say whether to walk, run, bike, scooter, or drive.',
      origin_not_grounded: 'I cannot identify the starting place in the loaded regions.',
      destination_not_grounded: 'I cannot identify the destination in the loaded regions.',
      neural_place_not_grounded: 'Semantic matching could not identify that place safely.',
      circuit_not_grounded: 'I cannot identify a registered loop boundary for that place.',
      termination_not_grounded: 'Add a distance, lap count, or duration for this loop.',
      street_avoidance_not_grounded: 'I cannot identify that street in the loaded regions.',
      embodiment_not_available: 'That travel mode is not available in the loaded world.',
      route_has_no_extent: 'Choose different starting and ending places.',
    };
    if (messages[error?.code]) return messages[error.code];
    if (String(error?.code || '').includes('ambiguous')) return 'That place matches more than one loaded location. Be more specific.';
    return 'I could not ground this mission in the loaded map. Try a named place and a clear travel goal.';
  }

  function updateButtons(elements, running, hasController, status = 'active', hasJourneyStarted = false) {
    const completed = status === 'completed';
    const failed = status === 'failed';
    const paused = !running && hasJourneyStarted && status === 'active';
    const phase = running ? 'running' : completed ? 'completed' : failed ? 'failed' : paused ? 'paused' : 'ready';
    setJourneyPhase(phase);
    elements.missionInput.disabled = running;
    elements.placeResolutionLane.disabled = running;
    elements.shuffleButton.disabled = running;
    elements.startButton.disabled = running;
    elements.pauseButton.disabled = false;
    elements.stepButton.disabled = false;
    elements.resetButton.disabled = false;
    elements.exportButton.disabled = !hasController;
    elements.shuffleButton.hidden = phase !== 'ready';
    elements.startButton.hidden = phase !== 'ready';
    elements.pauseButton.hidden = !running;
    elements.resumeButton.hidden = phase !== 'paused';
    elements.stepButton.hidden = !['running', 'paused'].includes(phase);
    elements.resetButton.hidden = !['running', 'paused'].includes(phase);
    elements.replayButton.hidden = !['completed', 'failed'].includes(phase);
    elements.newMissionButton.hidden = !['completed', 'failed'].includes(phase);
    elements.whatIfButton.hidden = phase !== 'completed';
    elements.dockMoreButton.hidden = !['running', 'paused', 'completed'].includes(phase);
    elements.dockMoreMenu.hidden = true;
    elements.dockMoreButton.setAttribute('aria-expanded', 'false');
  }

  function setRuntimeStatus(elements, text, kind) {
    if (elements.runtimeStatus.textContent !== text) elements.runtimeStatus.textContent = text;
    if (elements.runtimeStatus.dataset.kind !== kind) elements.runtimeStatus.dataset.kind = kind;
    if (elements.runtimeToggle.title !== text) elements.runtimeToggle.title = text;
  }

  function failRuntime(elements, error) {
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

  function runtimeLabel(state) {
    if (state.status === 'completed') return state.taskType === 'delivery' ? 'Delivered' : 'Complete';
    if (state.status === 'failed') return 'Stopped';
    return 'Running';
  }

  function renderIdentity(receipt) {
    const adapter = receipt.adapter.description || receipt.adapter.device || receipt.adapter.architecture || 'adapter';
    return `${adapter} | ${receipt.buildingCount} buildings | ${receipt.ambientTraffic.actorCount} moving actors | ${receipt.staticVertexCount.toLocaleString()} static vertices`;
  }

  function renderPlaceResolution(elements, mission, readiness, evidence) {
    if (!mission.placeResolution) {
      const defaultCorrect = evidence?.lanes?.challenger?.metrics?.correct || 0;
      const modelCorrect = evidence?.lanes?.modelCandidate?.metrics?.correct || 0;
      elements.placeResolutionProof.textContent = `Deterministic place matching ${defaultCorrect}/${evidence?.population?.probeCount || 0} · Qwen +${Math.max(0, modelCorrect - defaultCorrect)} · ${readiness?.state || 'idle'}`;
      return;
    }
    const roles = mission.placeResolution.roles.map((row) => {
      const lane = row.evidence?.lane === 'qwen_embedding_cosine' ? 'Qwen embedding' : 'extended typo';
      const label = row.evidence?.ranking?.[0]?.label || row.nodeId;
      return `${row.role}: ${label} via ${lane}`;
    });
    elements.placeResolutionProof.textContent = `${roles.join(' · ')} · model executed: ${mission.placeResolution.modelExecution ? 'yes' : 'no'}`;
  }

  function renderPlanning(elements, planning) {
    const forecast = planning.forecast;
    elements.planningForecast.textContent = `${Math.round(forecast.predictedDurationSeconds)} s · ${Math.round(forecast.distanceM).toLocaleString()} m`;
    elements.alternativeProof.dataset.pluginAuditCount = String(Object.keys(planning.pluginAudits || {}).length);
    elements.alternativeProof.dataset.routeAlgorithm = planning.alternatives?.[0]?.algorithm || '';
    elements.alternativeProof.textContent = planning.alternatives.length > 1
      ? `${planning.alternatives.length} compared · ${(planning.alternatives[1].forecast.predictedDurationSeconds - forecast.predictedDurationSeconds).toFixed(1)} s next`
      : 'No distinct legal alternative';
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
    const launch = () => { void start().catch((error) => {
      try { failRuntime(collectElements(), error); }
      catch (boundaryError) { log.error('runtime.bootstrap_failed', log.serializeError(boundaryError)); }
    }); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', launch, { once: true });
    else launch();
  }

  return { applicationProfileLabel, collectElements, friendlyMissionError, populateApplicationProfiles, populateCameraFocus, renderIdentity, renderPlaceResolution, renderPlanning, renderPolicyArena, runtimeLabel, selectCameraMode, start, validateImportedJourneyReceipt };
});
