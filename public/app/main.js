(function attachAutonomyApp(root, factory) {
  const api = factory(
    root.SimulatteAutonomyDataLoader,
    root.SimulatteAutonomyMission,
    root.SimulatteAutonomyController,
    root.SimulatteAutonomyCanvas,
    root.SimulatteAutonomyTraceView,
    root.SimulatteAutonomyRuntimeLog
  );
  root.SimulatteAutonomyApp = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createAutonomyApp(dataLoader, missionApi, controllerApi, canvasApi, traceApi, runtimeLog) {
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
    const stepIntervalMs = 18;

    async function buildController({ keepMissionLocked = false } = {}) {
      const mission = missionApi.compileMission(elements.missionInput.value, data.world, data.embodiments);
      activeMission = mission;
      log.info('mission.compiled', {
        missionId: mission.id,
        sourceText: elements.missionInput.value,
        embodimentId: mission.embodimentId,
        task: mission.task,
        constraints: mission.constraints,
        grounding: mission.grounding,
      });
      const embodiment = data.embodiments.find((row) => row.id === mission.embodimentId);
      if (!embodiment) throw new Error(`Mission selected unavailable embodiment ${mission.embodimentId}`);
      const nextController = controllerApi.createAutonomyController({
        world: data.world,
        featureCatalog: data.featureCatalog,
        occurrenceCatalog: data.occurrenceCatalog,
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
      elements.renderIdentity.textContent = renderIdentity(renderer.receipt());
      setRuntimeStatus(elements, 'WebGPU world ready', 'ready');
      updateButtons(elements, keepMissionLocked, true);
      return controller;
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
    elements.missionInput.addEventListener('input', () => {
      if (isRunning) return;
      controller = null;
      updateButtons(elements, false, false);
      setRuntimeStatus(elements, 'Mission changed; execute to recompile', 'changed');
    });
    window.addEventListener('resize', () => {
      if (renderer && controller) renderer.render(controller.snapshot());
    });

    try {
      await buildController();
    } catch (error) {
      failRuntime(elements, error);
    }
    return { data, getController: () => controller, getRenderer: () => renderer };
  }

  function collectElements() {
    const ids = [
      'mission-input', 'shuffle-button', 'start-button', 'pause-button', 'step-button', 'reset-button', 'export-button',
      'runtime-status', 'render-identity', 'autonomy-canvas', 'follow-minimap', 'decision-title', 'decision-meta',
      'bet-list', 'gate-list', 'trace-list', 'route-formula', 'route-stats', 'route-components',
      'retrieval-query', 'retrieval-candidates', 'rerank-candidates', 'retrieval-stats', 'settlement-math',
      'reranker-proof',
      'occurrence-stats', 'occurrence-patterns', 'occurrence-effects',
      'metric-state', 'metric-tick', 'metric-speed', 'metric-distance', 'metric-route', 'metric-bet',
      'metric-settlement', 'metric-calibration', 'camera-focus', 'camera-follow', 'camera-bird', 'camera-top',
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
    elements.startButton.disabled = true;
    elements.stepButton.disabled = true;
  }

  function runtimeLabel(state) {
    if (state.status === 'completed' && state.taskType === 'loop') return `Loop complete: ${state.distanceTraveledM.toFixed(1)} m | ${state.completedLaps} full lap(s) | ${state.simulatedTimeSeconds.toFixed(1)} s`;
    if (state.status === 'completed') return `Delivered at tick ${state.tick}`;
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

  function downloadJson(filename, value) {
    const blob = new Blob([`${JSON.stringify(value, null, 2)}\n`], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
  }

  return { collectElements, nextMissionExample, populateCameraFocus, renderIdentity, runtimeLabel, selectCameraMode, start };
});
