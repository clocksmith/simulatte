(function attachAutonomyApp(root, factory) {
  const api = factory(
    root.SimulatteAutonomyDataLoader,
    root.SimulatteAutonomyMission,
    root.SimulatteAutonomyController,
    root.SimulatteAutonomyCanvas,
    root.SimulatteAutonomyTraceView
  );
  root.SimulatteAutonomyApp = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createAutonomyApp(dataLoader, missionApi, controllerApi, canvasApi, traceApi) {
  async function start() {
    const elements = collectElements();
    setRuntimeStatus(elements, 'Loading governed assets', 'loading');
    let data;
    try {
      data = await dataLoader.loadAutonomyData();
    } catch (error) {
      failRuntime(elements, error);
      return null;
    }
    elements.missionInput.value = data.manifest.defaultMissionText;
    elements.dataIdentity.textContent = `${data.world.id} | ${data.world.provenance.snapshotDate}`;
    const traceView = traceApi.createTraceView(elements, data.policy, data.rerankerEvidence);
    let controller = null;
    let renderer = null;
    let isRunning = false;
    let frameRequest = null;
    let lastStepAt = 0;
    const stepIntervalMs = 18;

    async function buildController({ keepMissionLocked = false } = {}) {
      const mission = missionApi.compileMission(elements.missionInput.value, data.world, data.embodiment);
      const nextController = controllerApi.createAutonomyController({
        world: data.world,
        featureCatalog: data.featureCatalog,
        occurrenceCatalog: data.occurrenceCatalog,
        embodiment: data.embodiment,
        policy: data.policy,
        mission,
        onTick: ({ entry, snapshot }) => {
          renderer.render(snapshot, entry.payload);
          traceView.renderTick(entry, snapshot);
          setRuntimeStatus(elements, runtimeLabel(snapshot.state), snapshot.state.status);
          if (snapshot.state.status !== 'active') stopLoop();
        },
      });
      if (!renderer) {
        renderer = await canvasApi.createCanvasRenderer(elements.autonomyCanvas, nextController.worldModel, {
          onFailure: (error) => {
            stopLoop();
            failRuntime(elements, error);
          },
        });
        wireCameraControls(elements, renderer);
      }
      controller = nextController;
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
      isRunning = true;
      updateButtons(elements, true, true);
      setRuntimeStatus(elements, 'Executing continuous action bets', 'active');
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
      'mission-input', 'start-button', 'pause-button', 'step-button', 'reset-button', 'export-button',
      'runtime-status', 'data-identity', 'render-identity', 'autonomy-canvas', 'decision-title', 'decision-meta',
      'bet-list', 'gate-list', 'trace-list', 'route-formula', 'route-stats', 'route-components',
      'retrieval-query', 'retrieval-candidates', 'rerank-candidates', 'retrieval-stats', 'settlement-math',
      'reranker-proof',
      'occurrence-stats', 'occurrence-patterns', 'occurrence-effects',
      'metric-state', 'metric-tick', 'metric-speed', 'metric-distance', 'metric-route', 'metric-bet',
      'metric-settlement', 'metric-calibration', 'camera-follow', 'camera-bird', 'camera-top',
    ];
    return Object.fromEntries(ids.map((id) => [camelId(id), document.getElementById(id)]));
  }

  function wireCameraControls(elements, renderer) {
    const controls = [
      [elements.cameraFollow, 'follow'],
      [elements.cameraBird, 'bird'],
      [elements.cameraTop, 'top'],
    ];
    controls.forEach(([button, mode]) => button.addEventListener('click', () => {
      renderer.setCameraMode(mode);
      controls.forEach(([row, rowMode]) => row.classList.toggle('is-active', rowMode === mode));
    }));
  }

  function camelId(id) {
    return id.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
  }

  function updateButtons(elements, running, hasController) {
    elements.missionInput.disabled = running;
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
    setRuntimeStatus(elements, error.message, 'error');
    elements.startButton.disabled = true;
    elements.stepButton.disabled = true;
  }

  function runtimeLabel(state) {
    if (state.status === 'completed') return `Delivered at tick ${state.tick}`;
    if (state.status === 'failed') return `Stopped: ${state.terminalReason}`;
    return `Tick ${state.tick}: observe, retrieve, choose, settle`;
  }

  function renderIdentity(receipt) {
    const adapter = receipt.adapter.description || receipt.adapter.device || receipt.adapter.architecture || 'adapter';
    return `${adapter} | ${receipt.buildingCount} buildings | ${receipt.staticVertexCount.toLocaleString()} vertices`;
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

  return { collectElements, renderIdentity, runtimeLabel, start };
});
