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
    root.SimulatteAutonomyReceipts
  );
  root.SimulatteAutonomyApp = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createAutonomyApp(dataLoader, missionApi, controllerApi, canvasApi, traceApi, runtimeLog, neuralPlaceApi, ledgerApi, counterfactualApi, receiptsApi) {
  const log = runtimeLog || {
    info: () => null,
    warn: () => null,
    error: () => null,
    serializeError: (error) => ({ name: error?.name || 'Error', message: error?.message || String(error) }),
  };

  async function start() {
    const elements = collectElements();
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
    elements.missionInput.value = data.manifest.defaultMissionText;
    const traceView = traceApi.createTraceView(elements, data.policy, data.rerankerEvidence);
    let controller = null;
    let activeMission = null;
    let renderer = null;
    let isRunning = false;
    let frameRequest = null;
    let lastStepAt = 0;
    let retrievalLaneLogged = false;
    let terminalJourneyLogged = false;
    let placeResolver = null;
    const journeyLedger = ledgerApi.createJourneyLedger();
    const recordedJourneyHashes = new Set();
    let latestCounterfactual = null;
    const stepIntervalMs = 18;

    async function buildController({ keepMissionLocked = false } = {}) {
      const useNeuralPlaces = elements.placeResolutionLane.value === 'qwen_embedding';
      if (useNeuralPlaces && !placeResolver) {
        placeResolver = neuralPlaceApi.createPlaceResolver({
          index: data.placeEmbeddingIndex,
          modelLock: data.modelRuntimeLock,
          onProgress(event) {
            if (event?.phase === 'ready') setRuntimeStatus(elements, 'Qwen place model ready', 'ready');
            else if (event?.percent != null) setRuntimeStatus(elements, `Loading Qwen place model · ${Math.round(event.percent)}%`, 'loading');
          },
        });
      }
      const mission = useNeuralPlaces
        ? await missionApi.compileMissionWithResolver(elements.missionInput.value, data.world, data.embodiments, placeResolver)
        : missionApi.compileMission(elements.missionInput.value, data.world, data.embodiments);
      activeMission = mission;
      log.info('mission.compiled', {
        missionId: mission.id,
        sourceText: elements.missionInput.value,
        embodimentId: mission.embodimentId,
        task: mission.task,
        constraints: mission.constraints,
        grounding: mission.grounding,
        placeResolution: mission.placeResolution,
      });
      renderPlaceResolution(elements, mission, placeResolver?.receipt() || null, data.placeResolutionEvidence);
      const embodiment = data.embodiments.find((row) => row.id === mission.embodimentId);
      if (!embodiment) throw new Error(`Mission selected unavailable embodiment ${mission.embodimentId}`);
      const nextController = controllerApi.createAutonomyController({
        world: data.world,
        featureCatalog: data.featureCatalog,
        occurrenceCatalog: data.occurrenceCatalog,
        accessibilityIndex: data.accessibilityIndex,
        routeAmenityIndex: data.routeAmenityIndex,
        safetyHistoryIndex: data.safetyHistoryIndex,
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
      renderer.reset();
      const snapshot = controller.snapshot();
      renderer.render(snapshot);
      traceView.renderInitial(snapshot, renderer.receipt());
      renderPlanning(elements, controller.planning());
      elements.renderIdentity.textContent = renderIdentity(renderer.receipt());
      setRuntimeStatus(elements, snapshot.state.status === 'active' ? 'WebGPU world ready' : accessibilityRuntimeLabel(controller.planning().accessibility), snapshot.state.status === 'active' ? 'ready' : 'failed');
      updateButtons(elements, keepMissionLocked, true);
      if (snapshot.state.status !== 'active') await recordJourney(nextController);
      return controller;
    }

    async function recordJourney(targetController) {
      const receipt = await targetController.journeyReceipt();
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
      updateButtons(elements, true, Boolean(controller));
      if (!controller || controller.snapshot().state.status !== 'active') await buildController({ keepMissionLocked: true });
      if (controller.snapshot().state.status !== 'active') {
        setRuntimeStatus(elements, accessibilityRuntimeLabel(controller.planning().accessibility), 'failed');
        updateButtons(elements, false, true);
        return;
      }
      renderer.setCameraMode('follow');
      selectCameraMode(elements, 'follow');
      isRunning = true;
      updateButtons(elements, true, true);
      setRuntimeStatus(elements, 'Executing continuous action bets', 'active');
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
      updateButtons(elements, false, Boolean(controller));
    }

    elements.startButton.addEventListener('click', async () => {
      try {
        await runLoop();
      } catch (error) {
        stopLoop();
        failRuntime(elements, error);
      }
    });
    elements.shuffleButton.addEventListener('click', () => {
      if (isRunning) return;
      elements.missionInput.value = nextMissionExample(data.manifest.missionExamples, elements.missionInput.value);
      log.info('mission.example.selected', {
        sourceText: elements.missionInput.value,
        exampleCount: data.manifest.missionExamples.length,
      });
      elements.missionInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
    elements.pauseButton.addEventListener('click', () => {
      stopLoop();
      setRuntimeStatus(elements, 'Paused with state retained', 'paused');
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
        await buildController();
      } catch (error) {
        failRuntime(elements, error);
      }
    });
    elements.exportButton.addEventListener('click', async () => {
      if (!controller) return;
      const receipt = await controller.journeyReceipt();
      receipt.rendering = renderer.receipt();
      receipt.dataLoad = structuredClone(data.receipt);
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
        controller = null;
        updateButtons(elements, false, false);
        setRuntimeStatus(elements, 'Verified receipt imported locally; press Start to replay its mission', 'ready');
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
      elements.counterfactualStreet.disabled = elements.counterfactualKind.value !== 'close_street';
      elements.counterfactualSnapshot.disabled = elements.counterfactualKind.value !== 'world_snapshot';
    });
    elements.compareButton.addEventListener('click', async () => {
      try {
        stopLoop();
        if (!controller) await buildController();
        elements.compareButton.disabled = true;
        elements.counterfactualProof.textContent = 'Running matched baseline and intervention simulations…';
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
      controller = null;
      updateButtons(elements, false, false);
      setRuntimeStatus(elements, 'Mission changed; execute to recompile', 'changed');
    });
    elements.placeResolutionLane.addEventListener('change', () => {
      if (isRunning) return;
      controller = null;
      updateButtons(elements, false, false);
      const neural = elements.placeResolutionLane.value === 'qwen_embedding';
      setRuntimeStatus(elements, neural ? 'Hybrid Qwen place matching selected' : 'Lexical place matching selected', 'changed');
      elements.placeResolutionProof.textContent = neural
        ? 'Hybrid: lexical first, then local Qwen embedding with fail-closed thresholds · 533 MB'
        : 'Lexical control · no model execution or download';
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
    return { data, getController: () => controller, getRenderer: () => renderer };
  }

  function collectElements() {
    const ids = [
      'mission-input', 'place-resolution-lane', 'shuffle-button', 'start-button', 'pause-button', 'step-button', 'reset-button', 'export-button',
      'runtime-status', 'render-identity', 'autonomy-canvas', 'follow-minimap', 'decision-title', 'decision-meta',
      'bet-list', 'gate-list', 'trace-list', 'route-formula', 'route-stats', 'route-components',
      'retrieval-query', 'retrieval-candidates', 'rerank-candidates', 'retrieval-stats', 'settlement-math',
      'reranker-proof', 'place-resolution-proof',
      'occurrence-stats', 'occurrence-patterns', 'occurrence-effects',
      'metric-state', 'metric-tick', 'metric-speed', 'metric-distance', 'metric-route', 'metric-bet',
      'metric-settlement', 'metric-calibration', 'camera-focus', 'camera-follow', 'camera-bird', 'camera-top',
      'planning-forecast', 'accessibility-proof', 'alternative-proof', 'ledger-proof', 'policy-arena-proof',
      'counterfactual-kind', 'counterfactual-street', 'counterfactual-snapshot', 'compare-button', 'export-ledger-button',
      'import-receipt-button', 'import-receipt-file', 'counterfactual-proof',
    ];
    return Object.fromEntries(ids.map((id) => [camelId(id), document.getElementById(id)]));
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
    ].forEach(([button, buttonMode]) => button.classList.toggle('is-active', buttonMode === mode));
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

  function updateButtons(elements, running, hasController) {
    elements.missionInput.disabled = running;
    elements.placeResolutionLane.disabled = running;
    elements.shuffleButton.disabled = running;
    elements.startButton.disabled = running;
    elements.pauseButton.disabled = !running;
    elements.stepButton.disabled = running;
    elements.resetButton.disabled = running;
    elements.exportButton.disabled = !hasController;
  }

  function setRuntimeStatus(elements, text, kind) {
    elements.runtimeStatus.textContent = text;
    elements.runtimeStatus.dataset.kind = kind;
  }

  function failRuntime(elements, error) {
    log.error('runtime.failed', log.serializeError(error));
    setRuntimeStatus(elements, error.message, 'error');
    updateButtons(elements, false, false);
  }

  function runtimeLabel(state) {
    if (state.status === 'completed' && state.taskType === 'loop') return `Loop complete: ${state.distanceTraveledM.toFixed(1)} m | ${state.completedLaps} full lap(s) | ${state.simulatedTimeSeconds.toFixed(1)} s`;
    if (state.status === 'completed') return `${state.taskType === 'delivery' ? 'Delivered' : 'Arrived'} at tick ${state.tick}`;
    if (state.status === 'failed') return `Stopped: ${state.terminalReason}`;
    return `Tick ${state.tick}`;
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
      elements.placeResolutionProof.textContent = `Place matching: lexical control · Qwen ${readiness?.state || 'idle'} · diagnostic ${evidence?.lanes?.challenger?.metrics?.correct || 0}/${evidence?.population?.probeCount || 0}`;
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
    elements.alternativeProof.textContent = planning.alternatives.length > 1
      ? `${planning.alternatives.length} compared · ${(planning.alternatives[1].forecast.predictedDurationSeconds - forecast.predictedDurationSeconds).toFixed(1)} s next`
      : 'No distinct legal alternative';
    elements.accessibilityProof.textContent = accessibilityProofLabel(planning.accessibility);
    elements.accessibilityProof.dataset.verdict = planning.accessibility.verdict;
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

  return { accessibilityProofLabel, collectElements, nextMissionExample, populateCameraFocus, renderCounterfactual, renderIdentity, renderPlaceResolution, renderPlanning, renderPolicyArena, runtimeLabel, selectCameraMode, start, validateImportedJourneyReceipt };
});
