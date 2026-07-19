(function attachAutonomyApp(root, factory) {
  const api = factory(
    root.SimulatteAutonomyDataLoader,
    root.SimulatteAutonomyMission,
    root.SimulatteAutonomyController,
    root.SimulatteAutonomyCanvas,
    root.SimulatteAutonomyTraceView,
    root.SimulatteAutonomyRuntimeLog,
    root.SimulatteNeuralPlaceResolver,
    root.SimulatteJourneyLedger,
    root.SimulatteCounterfactualRunner,
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
    root.SimulatteCivilTime
  );
  root.SimulatteAutonomyApp = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createAutonomyApp(dataLoader, missionApi, controllerApi, canvasApi, traceApi, runtimeLog, neuralPlaceApi, ledgerApi, counterfactualApi, receiptsApi, worldApi, neuralConsentApi, modelSelectionApi, pluginRuntimeApi, pluginRegistry, pluginUiApi, transportApi, artifactStoreApi, routePlannerApi, civilTimeApi) {
  const log = runtimeLog || {
    info: () => null,
    warn: () => null,
    error: () => null,
    serializeError: (error) => ({ name: error?.name || 'Error', message: error?.message || String(error) }),
  };

  async function start() {
    const elements = collectElements();
    const interfaceUi = wireInterfaceControls(elements);
    setJourneyPhase('loading');
    log.info('app.boot.started', {
      build: document.querySelector('meta[name="simulatte-build"]')?.content || null,
      location: window.location.href,
      userAgent: navigator.userAgent,
    });
    setRuntimeStatus(elements, 'Loading governed assets', 'loading');
    let data;
    try {
      data = await dataLoader.loadAutonomyData();
    } catch (error) {
      failRuntime(elements, error);
      return null;
    }
    const pluginArtifacts = artifactStoreApi.createGovernedArtifactStore({ transport: transportApi.createBrowserTransport({ fetchImpl: fetch.bind(globalThis) }) });
    let activeMissionForPlugins = null;
    let embodimentForPlugins = null;
    const extensions = await pluginRuntimeApi.createPluginRuntime({
      registry: pluginRegistry,
      profile: data.applicationProfile,
      dataCatalog: data.dataCatalog,
      artifactStore: pluginArtifacts,
      registryBaseUrl: document.baseURI,
      corePorts: {
        worldQuery: Object.freeze({ snapshot: () => data.world, model: () => worldApi.createWorldModel(data.world) }),
        routing: Object.freeze({
          alternatives(mission, maximumAlternatives) {
            const embodiment = data.embodiments.find((row) => row.id === mission.embodimentId);
            if (!embodiment) throw new Error(`Plugin routing expected embodiment ${mission.embodimentId}`);
            return routePlannerApi.planRouteAlternatives({ worldModel: worldApi.createWorldModel(data.world), originNodeId: mission.originNodeId, destinationNodeId: mission.destinationNodeId, mode: embodiment.mode, tick: 0, mission, policy: data.policy }, maximumAlternatives);
          },
          modeFor(embodimentId) { return data.embodiments.find((row) => row.id === embodimentId)?.mode || null; },
          policy: () => data.policy,
        }),
        clock: Object.freeze({ instantForMission: (mission) => environmentInstant(data.world, mission) }),
        simulation: Object.freeze({
          compare(intervention) {
            if (!activeMissionForPlugins || !embodimentForPlugins) throw new Error('Counterfactual comparison requires an active mission');
            return counterfactualApi.compareCounterfactual({
              world: data.world, featureCatalog: data.featureCatalog, occurrenceCatalog: data.occurrenceCatalog,
              accessibilityIndex: data.accessibilityIndex, routeAmenityIndex: data.routeAmenityIndex, safetyHistoryIndex: data.safetyHistoryIndex,
              embodiment: embodimentForPlugins, policy: data.policy, mission: activeMissionForPlugins, regionComposition: data.regionComposition, intervention,
            });
          },
        }),
        ui: Object.freeze({ slot: 'inspector' }),
      },
    });
    const pluginUi = pluginUiApi.createDeclarativeUiHost({
      rootElement: elements.pluginInspector,
      onAction: ({ pluginId, actionId }) => extensions.dispatchAction(pluginId, actionId, { mission: activeMissionForPlugins }),
    });
    pluginUi.render(extensions.views({ mission: null }));
    elements.missionInput.value = data.manifest.defaultMissionText;
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
    let placeResolver = null;
    let shadeSelection = null;
    const journeyLedger = ledgerApi.createJourneyLedger();
    const recordedJourneyHashes = new Set();
    let latestCounterfactual = null;
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

    async function buildController({ keepMissionLocked = false } = {}) {
      clearMissionError(elements);
      const requestedSourceText = elements.missionInput.value;
      shadeSelection = null;
      const preflightContributions = await extensions.contributeRequest({ sourceText: requestedSourceText });
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
      const pluginContributions = await extensions.contributeRequest({ sourceText: requestedSourceText, executableSourceText, mission });
      applyPluginMissionContributions(mission, pluginContributions);
      shadeSelection = pluginContributions.find((row) => row.environment)?.environment || null;
      activeMission = mission;
      activeMissionForPlugins = mission;
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
      pluginUi.render(extensions.views({ mission }));
      await yieldToFrame();
      const embodiment = data.embodiments.find((row) => row.id === mission.embodimentId);
      if (!embodiment) throw new Error(`Mission selected unavailable embodiment ${mission.embodimentId}`);
      embodimentForPlugins = embodiment;
      const nextController = controllerApi.createAutonomyController({
        world: data.world,
        featureCatalog: data.featureCatalog,
        occurrenceCatalog: data.occurrenceCatalog,
        accessibilityIndex: data.accessibilityIndex,
        routeAmenityIndex: data.routeAmenityIndex,
        safetyHistoryIndex: data.safetyHistoryIndex,
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
      controller = nextController;
      retrievalLaneLogged = false;
      terminalJourneyLogged = false;
      await yieldToFrame();
      renderer.reset();
      const snapshot = controller.snapshot();
      renderer.render(snapshot);
      traceView.renderInitial(snapshot, renderer.receipt());
      renderPlanning(elements, { ...controller.planning(), environment: shadeSelection });
      elements.renderIdentity.textContent = renderIdentity(renderer.receipt());
      setRuntimeStatus(elements, snapshot.state.status === 'active' ? 'Ready' : accessibilityRuntimeLabel(controller.planning().accessibility), snapshot.state.status === 'active' ? 'ready' : 'failed');
      updateButtons(elements, keepMissionLocked, true, snapshot.state.status, hasJourneyStarted);
      if (snapshot.state.status !== 'active') await recordJourney(nextController);
      return controller;
    }

    async function recordJourney(targetController) {
      const receipt = await targetController.journeyReceipt();
      receipt.pluginSettlement = await extensions.settle({ journey: receipt });
      receipt.pluginRuntime = extensions.runtimeReceipt();
      pluginUi.render(extensions.views({ mission: activeMission, journey: receipt }));
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
      if (!controller || controller.snapshot().state.status !== 'active') await buildController({ keepMissionLocked: true });
      if (controller.snapshot().state.status !== 'active') {
        setRuntimeStatus(elements, accessibilityRuntimeLabel(controller.planning().accessibility), 'failed');
        updateButtons(elements, false, true, controller.snapshot().state.status, true);
        return;
      }
      renderer.setCameraMode('follow');
      selectCameraMode(elements, 'follow');
      isRunning = true;
      hasJourneyStarted = true;
      updateButtons(elements, true, true, 'active', true);
      setRuntimeStatus(elements, 'Running', 'active');
      const snapshot = controller.snapshot();
      log.info('journey.started', {
        missionId: activeMission.id,
        embodimentId: activeMission.embodimentId,
        taskType: snapshot.state.taskType,
        cameraMode: 'follow',
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
      controller = null;
      hasJourneyStarted = false;
      updateButtons(elements, false, false, 'active', false);
      setRuntimeStatus(elements, 'Ready', 'changed');
      elements.missionInput.focus();
    });
    elements.shuffleButton.addEventListener('click', () => {
      if (isRunning) return;
      elements.missionInput.value = nextMissionExample(data.manifest.missionExamples, elements.missionInput.value);
      log.info('mission.example.selected', {
        sourceText: elements.missionInput.value,
        exampleCount: data.manifest.missionExamples.length,
      });
      elements.missionInput.dispatchEvent(new Event('input', { bubbles: true }));
      resizeMissionInput(elements.missionInput);
    });
    elements.pauseButton.addEventListener('click', () => {
      stopLoop();
      setRuntimeStatus(elements, 'Paused', 'paused');
    });
    elements.stepButton.addEventListener('click', async () => {
      try {
        stopLoop();
        if (!controller || controller.snapshot().state.status !== 'active') await buildController();
        await controller.step();
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
    elements.whatIfButton.addEventListener('click', () => interfaceUi.openDecisions('what-if-section'));
    elements.exportButton.addEventListener('click', async () => {
      if (!controller) return;
      const receipt = await controller.journeyReceipt();
      receipt.rendering = renderer.receipt();
      receipt.dataLoad = structuredClone(data.receipt);
      receipt.environment = shadeSelection ? structuredClone(shadeSelection) : null;
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
    elements.counterfactualKind.addEventListener('change', () => {
      syncCounterfactualInputs(elements);
    });
    elements.compareButton.addEventListener('click', async () => {
      try {
        stopLoop();
        if (!controller) await buildController();
        elements.compareButton.disabled = true;
        elements.counterfactualProof.textContent = 'Comparing the same mission under one declared change.';
        const embodiment = data.embodiments.find((row) => row.id === activeMission.embodimentId);
        const intervention = elements.counterfactualKind.value === 'close_street'
          ? { id: `close-${hash32(elements.counterfactualStreet.value).toString(16)}`, kind: 'close_street', streetName: elements.counterfactualStreet.value }
          : elements.counterfactualKind.value === 'world_snapshot'
            ? { id: `world-${elements.counterfactualSnapshot.value}`, kind: 'world_snapshot', snapshotDate: elements.counterfactualSnapshot.value }
            : { id: 'historical-crash-weight-1', kind: 'historical_crash_weighting', historicalObservationWeight: 1 };
        latestCounterfactual = await counterfactualApi.compareCounterfactual({
          world: data.world,
          featureCatalog: data.featureCatalog,
          occurrenceCatalog: data.occurrenceCatalog,
          accessibilityIndex: data.accessibilityIndex,
          routeAmenityIndex: data.routeAmenityIndex,
          safetyHistoryIndex: data.safetyHistoryIndex,
          embodiment,
          policy: data.policy,
          mission: activeMission,
          regionComposition: data.regionComposition,
          intervention,
        });
        renderCounterfactual(elements, latestCounterfactual);
        downloadJson(`simulatte-what-if-${intervention.id}.json`, latestCounterfactual);
      } catch (error) {
        elements.counterfactualProof.textContent = error.message;
        log.error('counterfactual.failed', log.serializeError(error));
      } finally {
        elements.compareButton.disabled = false;
      }
    });
    elements.missionInput.addEventListener('input', () => {
      if (isRunning) return;
      clearMissionError(elements);
      resizeMissionInput(elements.missionInput);
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
      syncCounterfactualInputs(elements);
      renderPolicyArena(elements, data.policyArenaEvidence);
      await renderLedger(elements, journeyLedger, data.curriculum, data.world.contentVersion);
      await buildController();
    } catch (error) {
      failRuntime(elements, error);
    }
    return { data, getController: () => controller, getRenderer: () => renderer };
  }

  function collectElements() {
    const ids = [
      'mission-input', 'mission-error', 'place-resolution-lane', 'place-lane-note', 'model-selection-controls', 'shuffle-button', 'start-button', 'pause-button', 'resume-button', 'step-button', 'reset-button', 'replay-button', 'new-mission-button', 'what-if-button', 'export-button',
      'dock-more-button', 'dock-more-menu',
      'runtime-status', 'runtime-toggle', 'runtime-details', 'runtime-details-close', 'render-identity', 'autonomy-canvas', 'follow-minimap', 'decision-title', 'decision-meta',
      'bet-list', 'gate-list', 'trace-list', 'route-formula', 'route-stats', 'route-components',
      'retrieval-query', 'retrieval-candidates', 'rerank-candidates', 'retrieval-stats', 'settlement-math',
      'reranker-proof', 'place-resolution-proof',
      'occurrence-stats', 'occurrence-patterns', 'occurrence-effects',
      'metric-state', 'metric-tick', 'metric-time', 'metric-speed', 'metric-distance', 'metric-route', 'metric-bet', 'journey-progress-fill', 'journey-hud',
      'metric-settlement', 'metric-calibration', 'camera-focus', 'camera-focus-button', 'camera-focus-popover', 'camera-follow', 'camera-bird', 'camera-top',
      'planning-forecast', 'accessibility-proof', 'alternative-proof', 'ledger-proof', 'policy-arena-proof',
      'counterfactual-kind', 'counterfactual-street', 'counterfactual-snapshot', 'compare-button', 'export-ledger-button',
      'counterfactual-street-wrap', 'counterfactual-snapshot-wrap', 'import-receipt-button', 'import-receipt-file', 'counterfactual-proof',
      'decisions-button', 'decisions-drawer', 'decisions-close', 'decisions-backdrop', 'journey-section', 'what-if-section',
      'plugin-inspector',
    ];
    const elements = Object.fromEntries(ids.map((id) => [camelId(id), document.getElementById(id)]));
    const missing = ids.filter((id) => !document.getElementById(id));
    if (missing.length) throw new Error(`Autonomy UI expected elements: ${missing.join(', ')}`);
    return elements;
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

  function populateCameraFocus(select, targets) {
    select.replaceChildren();
    const groups = new Map([
      ['route', document.createElement('optgroup')],
      ['region', document.createElement('optgroup')],
      ['place', document.createElement('optgroup')],
    ]);
    groups.get('route').label = 'Journey';
    groups.get('region').label = 'Regions';
    groups.get('place').label = 'Places';
    targets.forEach((target) => {
      const option = document.createElement('option');
      option.value = target.id;
      option.textContent = target.label;
      groups.get(target.kind).append(option);
    });
    groups.forEach((group) => {
      if (group.children.length) select.append(group);
    });
    select.value = 'route';
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

  function syncCounterfactualInputs(elements) {
    const street = elements.counterfactualKind.value === 'close_street';
    const snapshot = elements.counterfactualKind.value === 'world_snapshot';
    elements.counterfactualStreetWrap.hidden = !street;
    elements.counterfactualStreet.disabled = !street;
    elements.counterfactualSnapshotWrap.hidden = !snapshot;
    elements.counterfactualSnapshot.disabled = !snapshot;
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

  function nextMissionExample(examples, currentText) {
    const rows = [...new Set((examples || []).map((row) => String(row).trim()).filter(Boolean))]
      .sort((left, right) => hash32(left) - hash32(right) || left.localeCompare(right));
    if (rows.length < 2) throw new Error('Mission shuffle expected at least two governed examples');
    const currentIndex = rows.indexOf(String(currentText || '').trim());
    return rows[(currentIndex + 1 + rows.length) % rows.length];
  }

  function hash32(value) {
    let hash = 2166136261;
    for (const character of String(value)) {
      hash ^= character.codePointAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
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
    const amenity = planning.amenities?.requestedMaximumDistanceM === null
      ? ''
      : planning.amenities?.pass ? ` · rack ≤${Math.round(planning.amenities.maximumObservedDistanceM)} m` : ' · rack constraint blocked';
    elements.planningForecast.textContent = `${Math.round(forecast.predictedDurationSeconds)} s · ${Math.round(forecast.distanceM).toLocaleString()} m${amenity}`;
    const environment = planning.environment;
    elements.alternativeProof.dataset.preferShade = String(Boolean(environment));
    elements.alternativeProof.dataset.routeAlgorithm = planning.alternatives?.[0]?.algorithm || '';
    elements.alternativeProof.textContent = environment
      ? `${environment.candidates.length} compared · ${Math.round(environment.comparison.selectedModeledBuildingShadePercent)}% modeled building shade vs ${Math.round(environment.comparison.fastestModeledBuildingShadePercent)}% fastest · ${signedDuration(environment.comparison.addedTravelSeconds)}`
      : planning.alternatives.length > 1
      ? `${planning.alternatives.length} compared · ${(planning.alternatives[1].forecast.predictedDurationSeconds - forecast.predictedDurationSeconds).toFixed(1)} s next`
      : 'No distinct legal alternative';
    elements.accessibilityProof.textContent = accessibilityProofLabel(planning.accessibility);
    elements.accessibilityProof.dataset.verdict = planning.accessibility.verdict;
  }

  function signedDuration(value) {
    const seconds = Math.round(Math.abs(value));
    const text = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    return value < 0 ? `${text} faster` : value > 0 ? `+${text}` : 'no added time';
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

  function accessibilityProofLabel(audit) {
    if (!audit || audit.verdict === 'unavailable') return 'unavailable · no claim';
    if (!audit.enforced) return `not requested · audit ${audit.verdict}`;
    if (audit.verdict === 'supported') return `${audit.counts.nodesWithRampEvidence}/${audit.counts.routeNodes} nodes supported`;
    const firstRamp = audit.failures?.failedRamps?.[0];
    if (firstRamp) return `blocked at ramp ${firstRamp.rampId}: ${firstRamp.failures.join(', ')}`;
    if (audit.counts?.topologyRowsWithoutAccessibilityProof) return `unresolved topology · ${audit.counts.topologyRowsWithoutAccessibilityProof} segment(s)`;
    return `unresolved · ${audit.counts?.missingNodes || 0} node(s) lack ramp evidence`;
  }

  function accessibilityRuntimeLabel(audit) {
    return `Route not executed: ${accessibilityProofLabel(audit)}`;
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

  function renderCounterfactual(elements, receipt) {
    const diff = receipt.diff;
    const intervention = receipt.intervention.kind === 'close_street'
      ? `Closed ${receipt.intervention.streetName}`
      : receipt.intervention.kind === 'world_snapshot'
        ? `World ${receipt.intervention.snapshotDate}`
        : `Reported-crash weighting ${receipt.intervention.historicalObservationWeight}`;
    if (receipt.challenger.status === 'refused') {
      elements.counterfactualProof.textContent = `${intervention}: refused · ${receipt.challenger.terminalReason}. Baseline receipt retained.`;
      return;
    }
    const duration = diff.actualDurationDeltaSeconds === null ? 'duration unresolved' : `${signed(diff.actualDurationDeltaSeconds)} s`;
    const distance = diff.distanceDeltaM === null ? 'distance unresolved' : `${signed(diff.distanceDeltaM)} m`;
    const risk = diff.accumulatedRiskDelta === null ? 'risk unresolved' : `${signed(diff.accumulatedRiskDelta)} assumed risk`;
    const history = diff.historicalCrashDelta === null ? 'history unresolved' : `${signed(diff.historicalCrashDelta)} reported crashes`;
    elements.counterfactualProof.textContent = `${intervention}: ${duration} · ${distance} · ${risk} · ${history} · route overlap ${diff.routeJaccard === null ? 'n/a' : `${Math.round(diff.routeJaccard * 100)}%`} · receipt ${receipt.integrity.payloadSha256.slice(0, 12)}`;
  }

  function signed(value) {
    return `${value > 0 ? '+' : ''}${Number(value.toFixed(1))}`;
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
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
  }

  return { accessibilityProofLabel, collectElements, friendlyMissionError, nextMissionExample, populateCameraFocus, renderCounterfactual, renderIdentity, renderPlaceResolution, renderPlanning, renderPolicyArena, runtimeLabel, selectCameraMode, start, validateImportedJourneyReceipt };
});
