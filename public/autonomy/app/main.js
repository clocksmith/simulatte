(function attachAutonomyApp(root, factory) {
  const dataLoader = root.SimulatteAutonomyDataLoader;
  const missionApi = root.SimulatteAutonomyMission;
  const controllerApi = root.SimulatteAutonomyController;
  const canvasApi = root.SimulatteAutonomyCanvas;
  const traceApi = root.SimulatteAutonomyTraceView;
  const api = factory(dataLoader, missionApi, controllerApi, canvasApi, traceApi);
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
      setRuntimeStatus(elements, error.message, 'error');
      elements.startButton.disabled = true;
      elements.stepButton.disabled = true;
      return null;
    }
    elements.missionInput.value = data.manifest.defaultMissionText;
    elements.dataIdentity.textContent = `${data.world.id} | ${data.embodiment.id} | ${data.policy.id}`;
    const traceView = traceApi.createTraceView(elements);
    let controller = null;
    let renderer = null;
    let isRunning = false;
    let frameRequest = null;
    let lastStepAt = 0;
    const stepIntervalMs = 130;

    function buildController() {
      const mission = missionApi.compileMission(elements.missionInput.value, data.world, data.embodiment);
      controller = controllerApi.createAutonomyController({
        world: data.world,
        featureCatalog: data.featureCatalog,
        embodiment: data.embodiment,
        policy: data.policy,
        mission,
        onTick: ({ entry, snapshot }) => {
          renderer.render(snapshot);
          traceView.renderTick(entry, snapshot);
          setRuntimeStatus(elements, runtimeLabel(snapshot.state), snapshot.state.status);
          if (snapshot.state.status !== 'active') stopLoop();
        },
      });
      renderer = canvasApi.createCanvasRenderer(elements.autonomyCanvas, controller.worldModel);
      renderer.reset();
      const snapshot = controller.snapshot();
      renderer.render(snapshot);
      traceView.renderInitial(snapshot);
      setRuntimeStatus(elements, 'Ready to execute mission', 'ready');
      updateButtons(elements, false, true);
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

    function runLoop() {
      if (!controller || controller.snapshot().state.status !== 'active') buildController();
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

    elements.startButton.addEventListener('click', () => {
      try {
        runLoop();
      } catch (error) {
        stopLoop();
        setRuntimeStatus(elements, error.message, 'error');
      }
    });
    elements.pauseButton.addEventListener('click', () => {
      stopLoop();
      setRuntimeStatus(elements, 'Paused with state retained', 'paused');
    });
    elements.stepButton.addEventListener('click', async () => {
      try {
        stopLoop();
        if (!controller || controller.snapshot().state.status !== 'active') buildController();
        await controller.step();
      } catch (error) {
        setRuntimeStatus(elements, error.message, 'error');
      }
    });
    elements.resetButton.addEventListener('click', () => {
      stopLoop();
      try {
        buildController();
      } catch (error) {
        setRuntimeStatus(elements, error.message, 'error');
      }
    });
    elements.exportButton.addEventListener('click', async () => {
      if (!controller) return;
      const receipt = await controller.journeyReceipt();
      downloadJson(`simulatte-autonomy-${receipt.mission.id}.json`, receipt);
    });
    elements.missionInput.addEventListener('input', () => {
      if (isRunning) return;
      controller = null;
      updateButtons(elements, false, false);
      setRuntimeStatus(elements, 'Mission changed; next execution will recompile', 'changed');
    });
    window.addEventListener('resize', () => {
      if (renderer && controller) renderer.render(controller.snapshot());
    });

    try {
      buildController();
    } catch (error) {
      setRuntimeStatus(elements, error.message, 'error');
    }
    return { data, getController: () => controller };
  }

  function collectElements() {
    const ids = [
      'mission-input', 'start-button', 'pause-button', 'step-button', 'reset-button', 'export-button',
      'runtime-status', 'data-identity', 'autonomy-canvas', 'decision-title', 'decision-meta', 'bet-list',
      'trace-list', 'metric-state', 'metric-tick', 'metric-speed', 'metric-distance', 'metric-route',
      'metric-bet', 'metric-settlement', 'metric-calibration',
    ];
    return Object.fromEntries(ids.map((id) => [camelId(id), document.getElementById(id)]));
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

  function runtimeLabel(state) {
    if (state.status === 'completed') return `Delivered at tick ${state.tick}`;
    if (state.status === 'failed') return `Stopped: ${state.terminalReason}`;
    return `Tick ${state.tick}: observing and selecting`;
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

  return { start, collectElements, runtimeLabel };
});
