(function attachSimulattePhysicsRenderer(root, factory) {
  function markMissingDependency(moduleName, dependencyName) {
    const state = root.SimulatteBoot = root.SimulatteBoot || { failedScripts: [] };
    state.missingDependencies = state.missingDependencies || [];
    state.missingDependencies.push({ moduleName, dependencyName });
    console.warn(`[simulatte.boot] ${moduleName} waiting for ${dependencyName}`);
  }

  const model = typeof module === 'object' && module.exports
    ? require('../../pipeline/phase-06-simulation/simulatte-physics-model.js')
    : root.SimulattePhysicsModel;
  if (!model) {
    markMissingDependency('SimulattePhysicsRenderer', 'SimulattePhysicsModel');
    return;
  }
  const api = factory(model);
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.SimulattePhysicsRenderer = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createPhysicsRenderer(model) {
  const {
    DEFAULT_PARAMS,
    EXAMPLE_INTENTS,
    TAU,
    clamp,
    clamp01,
    controlsForSpec,
    createRenderExecutionInput,
    createSimulationState,
    createSpecFromPrompt,
    deserializeSpec,
    energyLedger,
    hasModule,
    hashNoise,
    maxField,
    normalizeSpec,
    readoutLabelsForSpec,
    readoutValues,
    remixSpec,
    serializeSpec,
    sliderTargetAngle,
    solarPower,
    stateLabel,
    stepSimulation,
    templateById,
  } = model;

  function createBrowserLab(root = document) {
    const canvas = root.getElementById('physics-canvas');
    if (!canvas) return null;
    const webGpuRenderer = root.defaultView && root.defaultView.SimulatteWebGpuRenderer && canvas
      ? root.defaultView.SimulatteWebGpuRenderer.create(canvas, { maxDpr: 1.5 })
      : null;
    let simulationVisible = false;
    const loadingCanvas = root.getElementById('loading-canvas');
    const loadingCanvasController = root.defaultView && root.defaultView.SimulatteLoadingCanvas
      ? root.defaultView.SimulatteLoadingCanvas.createController(loadingCanvas, { maxDpr: 1.25 })
      : null;
    const ctx = null;
    const controlStack = root.getElementById('control-stack');
    const nameInput = root.getElementById('simulation-name');
    const promptInput = root.getElementById('build-prompt');
    const specPreview = root.getElementById('spec-preview');
    const worldModelReceipt = worldModelReceiptElements(root, specPreview);
    const componentStack = root.getElementById('component-stack');
    const shuffleButton = root.getElementById('shuffle-prompt');
    const readouts = Array.from({ length: 6 }, (_, index) => ({
      label: root.getElementById(`readout-${index + 1}-label`),
      value: root.getElementById(`readout-${index + 1}`),
    }));
    const stateReadout = root.getElementById('lab-state');
    const fpsMeter = createFpsMeter(root.getElementById('fps-readout'), canvas);
    const runtimeStatus = intentRuntimeElements(root);
    runtimeStatus.webGpuRenderer = webGpuRenderer;
    runtimeStatus.loadingCanvas = loadingCanvasController;
    const trainingRun = createTrainingRunState();
    function syncRuntime(event = {}) {
      logIntentRuntimeEvent(root.defaultView, event);
      const runtime = syncIntentRuntime(runtimeStatus, event);
      syncTrainingRuntime(trainingRun, runtime, event);
      return runtime;
    }
    registerModelCacheWorker(root.defaultView, (event) => syncRuntime(event));
    if (!webGpuRenderer && stateReadout) {
      stateReadout.textContent = 'WebGPU required';
    }
    const intentWorker = createIntentWorkerClient(root, (event) => syncRuntime(event));
    const mainThreadEmbedder = root.defaultView && root.defaultView.SimulatteIntentEmbedder
      ? root.defaultView.SimulatteIntentEmbedder.create({
        catalog: model,
        onProgress: (event) => syncRuntime(event),
        traceEmbeddings: intentTraceEnabled(root.defaultView),
      })
      : null;
    const embedder = intentWorker || mainThreadEmbedder;
    const initialParams = promptInput
      ? readPromptParams(promptInput, EXAMPLE_INTENTS[0].params)
      : EXAMPLE_INTENTS[0].params;
    let spec = createSpecFromPrompt('blank world', { params: initialParams });
    let state = createSimulationState(spec);
    let last = performance.now();
    let paused = false;
    let lastPreviewSync = 0;
    let buildSerial = 0;
    let compileSerial = 0;
    const pipelineCompiler = createPipelineCompiler(root);

    setSimulationCanvasVisible(false);

    const setSpec = (nextSpec, options = {}) => {
      const visible = options.visible === true || simulationVisible;
      spec = normalizeSpec(nextSpec);
      state = createSimulationState(spec);
      if (nameInput) nameInput.value = spec.name;
      renderControls(controlStack, spec);
      syncComponentStack(componentStack, spec);
      syncShuffleButton(shuffleButton, spec);
      syncReadoutLabels(readouts, spec);
      syncWorldModelReceipt(worldModelReceipt, spec);
      syncSpecPreview(specPreview, spec);
      logGraphDebug(spec);
      if (visible && webGpuRenderer) {
        webGpuRenderer.setRenderExecutionInput(createRenderExecutionInput(spec, state, canvas));
      }
      if (visible) {
        setSimulationCanvasVisible(true);
        syncTrainingSpecArtifacts(trainingRun, spec, state, canvas);
      }
      lastPreviewSync = performance.now();
      last = performance.now();
    };

    function setSimulationCanvasVisible(visible) {
      simulationVisible = Boolean(visible);
      canvas.dataset.sceneVisible = simulationVisible ? 'true' : 'false';
      const stage = canvas.closest ? canvas.closest('.physics-stage') : null;
      if (stage) stage.dataset.sceneVisible = simulationVisible ? 'true' : 'false';
    }

    const buildFromPrompt = (paramsOverride = null) => {
      const prompt = promptInput ? promptInput.value : '';
      const params = paramsOverride || readPromptParams(promptInput, {});
      const serial = buildSerial + 1;
      buildSerial = serial;
      beginTrainingRun(trainingRun, prompt, params, serial);
      if (!String(prompt || '').trim() || /\b(blank|empty|scratch)\b/i.test(prompt)) {
        syncRuntime({
          state: 'ready',
          stage: 'blank',
          percent: 100,
          message: 'Ready',
          canvasLoading: false,
        });
        setSimulationCanvasVisible(false);
        setSpec(createSpecFromPrompt('blank world', { params }), { visible: false });
        return;
      }
      syncRuntime({
        state: 'active',
        stage: 'manifest',
        percent: 1,
        message: 'Loading embeddings',
        canvasLoading: true,
      });
      resolveWithEmbedding(prompt, params, serial, true);
    };

    if (shuffleButton) {
      shuffleButton.addEventListener('click', () => {
        const example = pickShuffleExample(promptInput ? promptInput.value : '');
        if (promptInput && example) {
          promptInput.value = example.prompt;
          promptInput.dataset.exampleParams = JSON.stringify(example.params || {});
        }
        if (example) {
          shuffleButton.dataset.exampleId = example.id;
          shuffleButton.title = example.prompt;
          buildFromPrompt(example.params || {});
        }
      });
    }
    if (promptInput) {
      promptInput.addEventListener('input', () => {
        delete promptInput.dataset.exampleParams;
      });
    }
    root.getElementById('build-lab')?.addEventListener('click', () => buildFromPrompt());
    root.getElementById('reset-lab')?.addEventListener('click', () => setSpec(spec));
    root.getElementById('pause-lab')?.addEventListener('click', () => {
      paused = !paused;
      root.getElementById('pause-lab').textContent = paused ? 'Resume' : 'Pause';
    });
    root.getElementById('remix-lab')?.addEventListener('click', () => setSpec(remixSpec(readSpecFromUi(spec, controlStack, nameInput))));
    root.getElementById('export-lab')?.addEventListener('click', async () => {
      const payload = serializeSpec(readSpecFromUi(spec, controlStack, nameInput));
      try {
        await navigator.clipboard.writeText(payload);
      } catch (_err) {
        window.prompt('Simulatte simulation spec:', payload);
      }
    });
    root.getElementById('import-lab')?.addEventListener('click', () => {
      const raw = window.prompt('Paste Simulatte simulation spec JSON:');
      if (!raw) return;
      try {
        setSpec(deserializeSpec(raw));
      } catch (_err) {
        if (stateReadout) stateReadout.textContent = 'import failed';
      }
    });

    async function warmIntentRuntime(serial) {
      if (!embedder) {
        reportIntentFailure(serial, 'Intent model unavailable');
        return;
      }
      syncRuntime({
        state: 'active',
        stage: 'manifest',
        percent: 1,
        message: 'Loading embeddings',
        canvasLoading: true,
      });
      try {
        await waitForLoadingPaint();
        const loadedRuntime = await embedder.loadModel();
        if (serial !== buildSerial) return;
        const promptRuntimeReceipt = loadedRuntime && loadedRuntime.promptRuntimeReceipt || null;
        syncRuntime({
          state: 'ready',
          stage: 'runtime-ready',
          percent: 100,
          message: 'Prompt runtime ready',
          canvasLoading: false,
          promptRuntimeReceipt,
          providerReady: promptRuntimeReceipt && promptRuntimeReceipt.providerReady === true,
          noFallback: promptRuntimeReceipt && promptRuntimeReceipt.noFallback === true,
          backend: promptRuntimeReceipt && promptRuntimeReceipt.providerBackend || '',
          modelId: promptRuntimeReceipt && promptRuntimeReceipt.modelId || '',
          modelBaseUrl: promptRuntimeReceipt && promptRuntimeReceipt.modelBaseUrl || '',
          embeddingDim: promptRuntimeReceipt && promptRuntimeReceipt.embeddingDim || 0,
        });
      } catch (err) {
        if (serial === buildSerial) {
          const diagnostic = err && err.message ? err.message : String(err || 'intent model failed');
          console.error('[simulatte.intent] model-backed intent warmup failed', err);
          reportIntentFailure(serial, diagnostic);
        }
      }
    }

    async function resolveWithEmbedding(prompt, params, serial, showCanvasLoader = false) {
      if (!String(prompt || '').trim()) return;
      if (!embedder) {
        reportIntentFailure(serial, 'Intent model unavailable');
        return;
      }
      if (stateReadout) stateReadout.textContent = 'loading intent';
      syncRuntime({
        state: 'active',
        stage: 'start',
        percent: 1,
        message: 'Loading embeddings',
        canvasLoading: showCanvasLoader,
      });
      try {
        await waitForLoadingPaint();
        if (serial !== buildSerial) return;
        const applyIntentResult = async (result) => {
          if (serial !== buildSerial || !result) return false;
          syncTrainingRankArtifacts(trainingRun, result);
          const token = compileSerial + 1;
          compileSerial = token;
          const nextSpec = await compilePromptSpec(prompt, {
            params,
            embeddingPriors: result.priors,
            embeddingModel: result.model,
            embeddingBackend: result.backend,
            promptRuntimeReceipt: result.promptRuntimeReceipt || null,
            intentRerank: result.rerank,
            semanticRag: result.semanticRag,
            dopplerIntent: result.dopplerIntent,
            cardMatches: result.cardMatches,
            universeMatches: result.universeMatches,
            spanRetrieval: result.spanRetrieval,
            retrievalPhase: result.retrievalPhase || 'span-refined',
            evidenceRows: result.evidenceRows,
          }, {
            stage: 'compile',
            percent: 94,
            message: 'Building VisualIR',
            backend: result.backend,
            canvasLoading: showCanvasLoader,
          });
          if (serial !== buildSerial || token !== compileSerial) return false;
          setSpec(nextSpec, { visible: true });
          syncRuntime({
            state: 'active',
            stage: 'visual',
            percent: 98,
            message: 'Rendering scene',
            backend: result.backend,
            canvasLoading: showCanvasLoader,
          });
          return true;
        };
        const result = await embedder.rankPrompt(prompt, model.PHYSICAL_PRIMITIVES, {
          max: 36,
          onProgress: (event) => syncRuntime({
            ...event,
            canvasLoading: showCanvasLoader,
          }),
          onPreview: (preview) => {
            syncTrainingPreviewArtifacts(trainingRun, preview);
            syncRuntime({
              state: 'active',
              stage: 'span-retrieval',
              percent: 87,
              message: 'Compiling intent',
              backend: preview && preview.backend,
              canvasLoading: showCanvasLoader,
            });
          },
        });
        if (serial !== buildSerial) return;
        const applied = await applyIntentResult(result);
        if (!applied) return;
        syncRuntime({
          state: 'ready',
          stage: 'ready',
          percent: 100,
          message: 'Ready',
          backend: result.backend,
        });
      } catch (err) {
        if (serial === buildSerial) {
          const diagnostic = err && err.message ? err.message : String(err || 'intent model failed');
          console.error('[simulatte.intent] model-backed intent failed', err);
          reportIntentFailure(serial, diagnostic);
        }
      }
    }

    function reportIntentFailure(serial, diagnostic = '') {
      if (serial !== buildSerial) return;
      syncRuntime({
        state: 'error',
        stage: 'error',
        percent: 0,
        message: 'Intent model failed',
        detail: diagnostic,
      });
      if (stateReadout) stateReadout.textContent = 'intent model failed';
    }

    async function compilePromptSpec(prompt, options, event = {}) {
      const workerDetail = pipelineCompiler ? 'pipeline worker' : 'main-thread fallback';
      syncRuntime({
        state: 'active',
        stage: event.stage || 'compile',
        percent: event.percent || 94,
        message: event.message || 'Building VisualIR',
        backend: event.backend,
        detail: event.detail || workerDetail,
        canvasLoading: event.canvasLoading,
      });
      await waitForLoadingPaint();
      if (pipelineCompiler) {
        try {
          return await pipelineCompiler.compile(prompt, options);
        } catch (error) {
          if (typeof console !== 'undefined' && console.warn) {
            console.warn('[simulatte.pipeline] worker compile fell back to main thread', error);
          }
          syncRuntime({
            state: 'active',
            stage: event.stage || 'compile',
            percent: event.percent || 94,
            message: 'Building VisualIR',
            backend: event.backend,
            detail: error && error.message ? error.message : String(error || ''),
            canvasLoading: event.canvasLoading,
          });
          await waitForLoadingPaint();
        }
      }
      return createSpecFromPrompt(prompt, options);
    }

    function tick(now) {
      const dt = clamp((now - last) / 1000 || 0.016, 0.001, 0.05);
      last = now;
      if (intentRuntimeBusy(runtimeStatus)) {
        fpsMeter.sample(now, false);
        requestAnimationFrame(tick);
        return;
      }
      spec = readSpecFromUi(spec, controlStack, nameInput);
      if (!paused) {
        const substeps = spec.templateId === 'reaction-diffusion' ? 2 : 3;
        for (let i = 0; i < substeps; i += 1) {
          state = stepSimulation(state, spec, dt / substeps);
        }
      }
      if (simulationVisible && webGpuRenderer) {
        webGpuRenderer.render(createRenderExecutionInput(spec, state, canvas), now);
      }
      fpsMeter.sample(now, simulationVisible && webGpuRenderer);
      syncReadouts(readouts, stateReadout, state, spec);
      syncOpenSpecPreview(specPreview, spec, now, lastPreviewSync, (value) => {
        lastPreviewSync = value;
      });
      requestAnimationFrame(tick);
    }

    setSpec(spec, { visible: false });
    if (!skipInitialBuildForAudit(root)) {
      warmIntentRuntime(buildSerial);
    } else {
      syncRuntime({
        state: 'ready',
        stage: 'blank',
        percent: 100,
        message: 'Ready',
        canvasLoading: false,
      });
    }
    requestAnimationFrame(tick);
    return {
      getSpec: () => spec,
      getState: () => state,
      getTrainingSnapshot: () => trainingSnapshot(trainingRun, spec, state, canvas),
      setSpec,
    };
  }

  function skipInitialBuildForAudit(root) {
    try {
      const search = root && root.defaultView && root.defaultView.location
        ? root.defaultView.location.search
        : '';
      return new URLSearchParams(search || '').get('auditNoInitial') === '1';
    } catch (_err) {
      return false;
    }
  }

  function createFpsMeter(node, canvas) {
    let lastNow = 0;
    let frameCount = 0;
    let elapsedMs = 0;
    let lastVisible = false;

    function publish(fps, visible) {
      if (canvas && canvas.dataset) {
        canvas.dataset.fps = visible ? String(fps) : '0';
      }
      if (!node) return;
      if (!visible) {
        if (lastVisible) node.textContent = 'FPS --';
        node.dataset.perf = 'idle';
        lastVisible = false;
        return;
      }
      lastVisible = true;
      node.textContent = `${fps} FPS`;
      node.dataset.perf = fps < 24 ? 'low' : fps < 45 ? 'warn' : 'ok';
    }

    return {
      sample(now, visible) {
        if (!visible) {
          lastNow = now;
          frameCount = 0;
          elapsedMs = 0;
          publish(0, false);
          return;
        }
        if (!lastNow) {
          lastNow = now;
          return;
        }
        const delta = Math.max(0, Math.min(1000, now - lastNow));
        lastNow = now;
        frameCount += 1;
        elapsedMs += delta;
        if (elapsedMs < 500) return;
        const fps = Math.round((frameCount * 1000) / Math.max(1, elapsedMs));
        publish(fps, true);
        frameCount = 0;
        elapsedMs = 0;
      },
    };
  }

  function createIntentWorkerClient(root, onProgress = null) {
    const view = root && root.defaultView;
    if (!view || typeof view.Worker !== 'function') return null;
    let worker = null;
    let failed = false;
    let nextId = 0;
    let queue = Promise.resolve();
    const pending = new Map();
    const config = intentWorkerConfig(view);

    function rejectAll(error) {
      failed = true;
      pending.forEach((entry) => entry.reject(error));
      pending.clear();
    }

    try {
      const url = new URL('./app/workers/simulatte-intent-worker.js', view.location.href);
      worker = new view.Worker(url, { name: 'simulatte-intent-worker' });
    } catch (_error) {
      return null;
    }

    worker.addEventListener('message', (event) => {
      const data = event && event.data || {};
      const entry = pending.get(data.id);
      if (data.type === 'simulatte:intent-worker:progress') {
        if (entry && typeof entry.onProgress === 'function') entry.onProgress(data.event || {});
        return;
      }
      if (data.type === 'simulatte:intent-worker:preview') {
        if (entry && typeof entry.onPreview === 'function') entry.onPreview(data.preview || {});
        return;
      }
      if (data.type !== 'simulatte:intent-worker:result' || !entry) return;
      pending.delete(data.id);
      if (data.ok) entry.resolve(data.result);
      else entry.reject(new Error(data.error || 'Intent worker failed'));
    });
    worker.addEventListener('error', (event) => {
      rejectAll(new Error(event.message || 'Intent worker failed'));
    });
    worker.addEventListener('messageerror', () => {
      rejectAll(new Error('Intent worker message clone failed'));
    });

    function request(type, payload = {}, options = {}) {
      const run = () => {
        if (!worker || failed) return Promise.reject(new Error('Intent worker unavailable'));
        const id = nextId + 1;
        nextId = id;
        return new Promise((resolve, reject) => {
          pending.set(id, {
            resolve,
            reject,
            onProgress: options.onProgress,
            onPreview: options.onPreview,
          });
          try {
            worker.postMessage({
              type,
              id,
              config,
              ...payload,
            });
          } catch (error) {
            pending.delete(id);
            reject(error);
          }
        });
      };
      const next = queue.then(run, run);
      queue = next.then(() => undefined, () => undefined);
      return next;
    }

    return {
      backend: 'intent-worker',
      loadModel() {
        return request('simulatte:intent-worker:load', {}, {
          onProgress,
          onPreview: null,
        });
      },
      rankPrompt(prompt, _primitives, options = {}) {
        return request('simulatte:intent-worker:rank', {
          prompt,
          options: cloneIntentWorkerOptions(options),
        }, {
          onProgress: options.onProgress,
          onPreview: options.onPreview,
        });
      },
    };
  }

  function intentWorkerConfig(view) {
    const absolute = (value) => new URL(value, view.location.href).toString();
    return {
      manifestUrl: absolute('./data/simulatte-embedder/manifest.json'),
      modelBaseUrl: urlParam(view, 'embeddingModelBase') || urlParam(view, 'dopplerModelBase') || '',
      dopplerModuleUrl: urlParam(view, 'dopplerModule') || absolute('./vendor/doppler/src/index-browser.js'),
      dopplerKernelBasePath: urlParam(view, 'dopplerKernelBase') || absolute('./vendor/doppler/src/gpu/kernels'),
      spanLevelEmbedding: cloneWorkerValue(urlParam(view, 'spanLevelEmbedding') || ''),
      traceEmbeddings: intentTraceEnabled(view),
    };
  }

  function cloneIntentWorkerOptions(options = {}) {
    const out = {};
    for (const key of ['max', 'nowIso', 'dopplerEnabled', 'spanLevelEmbedding', 'traceEmbeddings']) {
      if (options[key] !== undefined) out[key] = cloneWorkerValue(options[key]);
    }
    return out;
  }

  function cloneWorkerValue(value) {
    if (value == null || value === '') return value;
    if (typeof value !== 'object') return value;
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (_err) {
      return undefined;
    }
  }

  function urlParam(view, name) {
    try {
      return new URLSearchParams(view.location && view.location.search || '').get(name) || '';
    } catch (_err) {
      return '';
    }
  }

  function emitRuntimeEvent(callback, event = {}) {
    if (typeof callback !== 'function') return;
    callback({
      timestamp: new Date().toISOString(),
      ...event,
    });
  }

  function nowMs() {
    if (typeof performance !== 'undefined' && performance && typeof performance.now === 'function') {
      return performance.now();
    }
    return Date.now();
  }

  function elapsedRuntimeMs(started) {
    const elapsed = nowMs() - Number(started || 0);
    return Number(Math.max(0, elapsed).toFixed(1));
  }

  function registerModelCacheWorker(view, onProgress = null) {
    if (!view || !view.navigator || !view.navigator.serviceWorker) return;
    const started = nowMs();
    emitRuntimeEvent(onProgress, {
      source: 'simulatte-model-cache',
      stage: 'cache-worker',
      percent: 1,
      message: 'Registering model cache worker',
      nonBlocking: true,
      canvasLoading: false,
    });
    const workerUrl = new URL('./simulatte-model-cache-sw.js', view.location.href).toString();
    view.navigator.serviceWorker.register(workerUrl)
      .then(() => view.navigator.serviceWorker.ready)
      .then(() => {
        emitRuntimeEvent(onProgress, {
          source: 'simulatte-model-cache',
          stage: 'cache-worker',
          percent: 20,
          message: 'Model cache worker registered',
          durationMs: elapsedRuntimeMs(started),
          cacheWorker: view.navigator.serviceWorker.controller ? 'controlling' : 'registered',
          nonBlocking: true,
          canvasLoading: false,
        });
      })
      .catch((error) => {
        emitRuntimeEvent(onProgress, {
          source: 'simulatte-model-cache',
          stage: 'cache-worker',
          percent: 1,
          message: error && error.message ? error.message : 'Model cache worker unavailable',
          cacheWorker: 'error',
          nonBlocking: true,
          canvasLoading: false,
        });
      });
  }

  function intentTraceEnabled(view) {
    return ['embeddingTrace', 'embeddingTiming', 'intentTrace', 'modelTrace']
      .some((name) => truthyParam(urlParam(view, name)));
  }

  function truthyParam(value) {
    return /^(1|true|on|yes|debug|trace)$/i.test(String(value || '').trim());
  }

  function logIntentRuntimeEvent(view, event = {}) {
    if (!intentTraceEnabled(view) || !view || !view.console || typeof view.console.info !== 'function') return;
    const payload = { ...event };
    delete payload.rawEvent;
    view.console.info('[simulatte.intent.runtime]', payload.stage || payload.phase || 'event', payload);
  }

  function createPipelineCompiler(root) {
    const view = root && root.defaultView;
    if (!view || typeof view.Worker !== 'function') return null;
    let worker = null;
    let failed = false;
    let nextId = 0;
    const pending = new Map();

    function rejectAll(error) {
      failed = true;
      pending.forEach((entry) => entry.reject(error));
      pending.clear();
    }

    try {
      const url = new URL('./app/workers/simulatte-pipeline-worker.js', view.location.href);
      worker = new view.Worker(url);
    } catch (error) {
      return null;
    }

    worker.addEventListener('message', (event) => {
      const data = event && event.data || {};
      if (data.type !== 'simulatte:pipeline-worker:result') return;
      const entry = pending.get(data.id);
      if (!entry) return;
      pending.delete(data.id);
      if (data.ok) {
        entry.resolve(data.spec);
      } else {
        entry.reject(new Error(data.error || 'Pipeline worker compile failed'));
      }
    });
    worker.addEventListener('error', (event) => {
      rejectAll(new Error(event.message || 'Pipeline worker failed'));
    });
    worker.addEventListener('messageerror', () => {
      rejectAll(new Error('Pipeline worker message clone failed'));
    });

    return {
      compile(prompt, options) {
        if (!worker || failed) {
          return Promise.reject(new Error('Pipeline worker unavailable'));
        }
        const id = nextId + 1;
        nextId = id;
        return new Promise((resolve, reject) => {
          pending.set(id, { resolve, reject });
          try {
            worker.postMessage({
              type: 'simulatte:pipeline-worker:compile',
              id,
              prompt,
              options,
            });
          } catch (error) {
            pending.delete(id);
            reject(error);
          }
        });
      },
    };
  }

  function intentRuntimeElements(root) {
    return {
      node: root.getElementById('intent-runtime'),
      title: root.getElementById('intent-runtime-title'),
      percent: root.getElementById('intent-runtime-percent'),
      fill: root.getElementById('intent-runtime-fill'),
      message: root.getElementById('intent-runtime-message'),
      stage: root.getElementById('intent-runtime-stage'),
    };
  }

  function worldModelReceiptElements(root, previewNode) {
    return {
      node: root.getElementById('world-model-panel'),
      status: root.getElementById('world-model-status'),
      summary: root.getElementById('world-model-summary'),
      chips: root.getElementById('world-model-chips'),
      preview: previewNode || root.getElementById('spec-preview'),
    };
  }

  const INTENT_PIPELINE_PHASES = Object.freeze([
    phaseRule(1, 'prompt-runtime', 'Prompt runtime', [
      'start',
      'manifest',
      'manifest-fetch',
      'cache',
      'cache-worker',
      'cache-storage',
      'cache-fill',
      'cache-hit',
      'cache-ready',
      'cache-skip',
      'indexes',
      'index-fetch',
      'model-module',
      'model-load',
      'model',
      'model-ready',
      'model-probe',
      'model-reuse',
      'runtime-ready',
      'runtime-reuse',
    ]),
    phaseRule(2, 'language-graph', 'Language graph', ['language', 'parse']),
    phaseRule(3, 'retrieval', 'Embedding retrieval', [
      'embed',
      'prompt-embed',
      'rank',
      'retrieval',
    ]),
    phaseRule(4, 'activation-cloud', 'Activation cloud', [
      'span-retrieval',
      'span-cache',
      'span-embed',
      'span-rank',
      'activation',
    ]),
    phaseRule(5, 'grounded-intent', 'Grounded intent', ['classification']),
    phaseRule(6, 'simulation-compile', 'Simulation compile', ['compile']),
    phaseRule(7, 'visual-ir', 'VisualIR compile', ['visual']),
    phaseRule(8, 'webgpu-ready', 'WebGPU ready', ['ready', 'blank']),
  ]);

  function phaseRule(step, id, label, stages) {
    return { step, id, label, stages };
  }

  function loadingPhaseFor(stage, event = {}) {
    if (event.state === 'error' || stage === 'error') {
      return { step: 0, id: 'error', label: 'Runtime error', stages: ['error'] };
    }
    const normalized = String(stage || '').toLowerCase();
    const match = INTENT_PIPELINE_PHASES.find((phase) => (
      phase.stages.some((candidate) => normalized === candidate || normalized.includes(candidate))
    ));
    return match || { step: 1, id: 'prompt-runtime', label: 'Prompt runtime', stages: [] };
  }

  function syncIntentRuntime(elements, event = {}) {
    if (!elements || !elements.node) return;
    const hasPercent = Number.isFinite(Number(event.percent));
    const percent = Math.max(0, Math.min(100, Number(event.percent || 0)));
    const stage = String(event.stage || event.phase || 'intent');
    const phase = loadingPhaseFor(stage, event);
    const passive = passiveRuntimeEvent(event, stage);
    const previousState = elements.node.dataset.state || '';
    const state = event.state || (stage === 'error' ? 'error' : percent >= 100 ? 'ready' : passive ? previousState || 'ready' : 'active');
    const loading = !passive && state === 'active';
    const indeterminate = loading && !hasPercent;
    const estimate = estimatedRuntimePercent(phase, stage, state);
    const visiblePercent = visibleRuntimePercent(percent, estimate, hasPercent, state);
    const canvasLoading = loading && event.canvasLoading !== false;
    const runButton = elements.node.closest('.physics-panel')?.querySelector('#build-lab');
    const rawMessage = event.detail || event.message || stage;
    const message = compactIntentRuntimeMessage(event.message || stage);
    const line = runtimeLineText(event, phase, stage, message, visiblePercent, indeterminate);
    elements.node.dataset.state = state;
    elements.node.dataset.progress = indeterminate ? 'indeterminate' : 'determinate';
    elements.node.dataset.loadingVisual = canvasLoading ? 'snake' : loading ? 'simple' : 'idle';
    elements.node.dataset.stage = phase.id;
    elements.node.dataset.pipelineStep = String(phase.step);
    elements.node.dataset.detail = String(line || '');
    elements.node.dataset.lastStage = stage;
    elements.node.dataset.lastMessage = String(message || '');
    elements.node.dataset.lastLine = String(line || '');
    elements.node.dataset.lastSource = String(event.source || '');
    elements.node.dataset.backend = String(event.backend || '');
    elements.node.dataset.blocking = loading ? 'true' : 'false';
    elements.node.dataset.passive = passive ? 'true' : 'false';
    elements.node.style.setProperty('--runtime-progress', `${visiblePercent}%`);
    elements.node.title = String(line || compactIntentRuntimeMessage(rawMessage) || '');
    publishIntentRuntimeHealth(elements.node, event, {
      canvasLoading,
      line,
      loading,
      message,
      passive,
      percent: visiblePercent,
      phase,
      rawMessage,
      stage,
      state,
    });
    const doc = elements.node.ownerDocument;
    if (doc && doc.documentElement) {
      doc.documentElement.dataset.canvasLoading = canvasLoading ? 'snake' : 'idle';
    }
    if (elements.loadingCanvas && typeof elements.loadingCanvas.setLoading === 'function') {
      elements.loadingCanvas.setLoading(canvasLoading, percent, stage);
    }
    if (runButton) {
      runButton.classList.toggle('is-loading', loading);
      runButton.disabled = loading;
      runButton.setAttribute('aria-disabled', loading ? 'true' : 'false');
      runButton.setAttribute('aria-busy', loading ? 'true' : 'false');
    }
    if (elements.title) elements.title.textContent = line;
    if (elements.percent) elements.percent.textContent = '';
    if (elements.fill) elements.fill.style.width = `${indeterminate ? 38 : visiblePercent}%`;
    if (elements.message) elements.message.textContent = message;
    if (elements.stage) elements.stage.textContent = phase.label;
    return {
      canvasLoading,
      line,
      percent: visiblePercent,
      phase,
      stage,
      state,
    };
  }

  function passiveRuntimeEvent(event = {}, stage = '') {
    if (event.nonBlocking === true || event.blocking === false) return true;
    if (event.state === 'error' || event.state === 'ready') return false;
    const source = String(event.source || '').toLowerCase();
    const normalized = String(stage || event.stage || event.phase || '').toLowerCase();
    return source === 'simulatte-model-cache' &&
      normalized === 'cache-worker' &&
      event.canvasLoading === false;
  }

  function publishIntentRuntimeHealth(node, event = {}, runtime = {}) {
    if (!node || !node.dataset) return;
    const health = compactObject({
      schema: 'simulatte.intentRuntimeHealth.v1',
      timestamp: event.timestamp || new Date().toISOString(),
      source: event.source || '',
      state: runtime.state || '',
      blocking: runtime.loading === true,
      passive: runtime.passive === true,
      canvasLoading: runtime.canvasLoading === true,
      stage: runtime.stage || '',
      phaseId: runtime.phase && runtime.phase.id || '',
      phaseLabel: runtime.phase && runtime.phase.label || '',
      pipelineStep: runtime.phase && runtime.phase.step || 0,
      progress: runtime.percent || 0,
      line: runtime.line || '',
      message: runtime.message || '',
      detail: runtime.rawMessage || '',
      backend: event.backend || '',
      timing: {
        durationMs: numericMetric(event.durationMs),
        elapsedMs: numericMetric(event.elapsedMs),
        traceId: event.traceId || '',
        rankId: event.rankId || 0,
        reuse: event.reuse === true,
        providerReady: event.providerReady === true,
      },
      model: {
        id: event.modelId || '',
        baseUrl: event.modelBaseUrl || '',
        artifactMode: event.artifactMode || '',
        sourceSizeBytes: numericMetric(event.sourceSizeBytes),
        cachePrefetch: event.cachePrefetch === true,
        cacheSkipReason: event.cacheSkipReason || '',
      },
      resource: {
        kind: event.resourceKind || '',
        url: event.resourceUrl || '',
        file: event.file || '',
        fileKind: event.fileKind || '',
        status: event.status || 0,
        byteLength: numericMetric(event.byteLength),
        completedBytes: numericMetric(event.completedBytes),
        totalBytes: numericMetric(event.totalBytes),
        cacheMode: event.cacheMode || '',
        cacheWorker: event.cacheWorker || '',
        cacheBackends: Array.isArray(event.cacheBackends) ? event.cacheBackends.join(',') : event.cacheBackends || '',
      },
      embeddings: {
        promptChars: numericMetric(event.promptChars),
        embeddingDim: numericMetric(event.embeddingDim),
        candidateCount: numericMetric(event.candidateCount),
        rankBackend: event.rankBackend || '',
        spanCount: numericMetric(event.spanCount),
        embeddedSpanCount: numericMetric(event.embeddedSpanCount),
        cachedSpanCount: numericMetric(event.cachedSpanCount),
        cacheHitCount: numericMetric(event.cacheHitCount),
        cacheMissCount: numericMetric(event.cacheMissCount),
        batchEmbedding: event.batchEmbedding === true,
      },
      promptRuntime: compactObject(event.promptRuntimeReceipt || null, 24),
    }, 32);
    const view = node.ownerDocument && node.ownerDocument.defaultView;
    if (view) {
      const events = Array.isArray(view.__simulatteIntentRuntimeEvents)
        ? view.__simulatteIntentRuntimeEvents
        : [];
      events.push(health);
      while (events.length > 80) events.shift();
      view.__simulatteIntentRuntimeEvents = events;
      view.SimulatteIntentRuntimeHealth = health;
    }
    node.dataset.health = JSON.stringify(health).slice(0, 2400);
    node.dataset.modelId = String(health.model && health.model.id || '');
    node.dataset.modelBaseUrl = String(health.model && health.model.baseUrl || '');
    node.dataset.cacheMode = String(health.resource && health.resource.cacheMode || '');
    node.dataset.cacheWorker = String(health.resource && health.resource.cacheWorker || '');
    node.dataset.cacheBackends = String(health.resource && health.resource.cacheBackends || '');
    node.dataset.resourceKind = String(health.resource && health.resource.kind || '');
    node.dataset.resourceFile = String(health.resource && health.resource.file || '');
    node.dataset.completedBytes = String(health.resource && health.resource.completedBytes || 0);
    node.dataset.totalBytes = String(health.resource && health.resource.totalBytes || 0);
    node.dataset.traceId = String(health.timing && health.timing.traceId || '');
    node.dataset.rankId = String(health.timing && health.timing.rankId || '');
    node.dataset.reuse = health.timing && health.timing.reuse ? 'true' : 'false';
    node.dataset.providerReady = health.timing && health.timing.providerReady ? 'true' : 'false';
    node.dataset.promptRuntimeReceipt = health.promptRuntime
      ? JSON.stringify(health.promptRuntime).slice(0, 1800)
      : '';
    node.dataset.cacheHitCount = String(health.embeddings && health.embeddings.cacheHitCount || 0);
    node.dataset.cacheMissCount = String(health.embeddings && health.embeddings.cacheMissCount || 0);
    node.dataset.cachedSpanCount = String(health.embeddings && health.embeddings.cachedSpanCount || 0);
  }

  function intentRuntimeBusy(elements) {
    const node = elements && elements.node;
    if (!node || !node.dataset) return false;
    return node.dataset.state === 'active' && node.dataset.blocking !== 'false';
  }

  function estimatedRuntimePercent(phase, stage, state) {
    if (state === 'ready') return 100;
    if (state === 'error') return 0;
    const normalized = String(stage || phase && phase.id || '').toLowerCase();
    if (/cache-fill|shard|weight/.test(normalized)) return 12;
    if (/manifest-fetch|manifest|model-module|cache-worker/.test(normalized)) return 18;
    if (/cache-ready|cache-hit|cache-skip|model-load/.test(normalized)) return 24;
    if (/language|parse/.test(normalized)) return 26;
    if (/index-fetch|indexes|runtime-ready/.test(normalized)) return 34;
    if (/model-reuse|model-ready|prompt-embed|rank|model|embed|retrieval/.test(normalized)) return 42;
    if (/span-cache|span-embed|span-rank|span-retrieval|activation/.test(normalized)) return 50;
    if (/classification|grounded|intent/.test(normalized)) return 58;
    if (/compile|simulation/.test(normalized)) return 70;
    if (/visual/.test(normalized)) return 82;
    if (/render|ready|blank/.test(normalized)) return 94;
    return Math.min(94, Math.max(6, (phase && phase.step ? phase.step : 1) * 11));
  }

  function visibleRuntimePercent(percent, estimate, hasPercent, state) {
    if (state === 'ready') return 100;
    if (state === 'error') return 0;
    const visible = hasPercent ? Math.max(percent, estimate) : estimate;
    return Math.min(99, Math.max(1, Math.trunc(visible + 0.5)));
  }

  function createTrainingRunState() {
    return {
      schema: 'simulatte.trainingRunState.v1',
      runId: '',
      prompt: '',
      params: {},
      serial: 0,
      startedAt: '',
      phase: null,
      artifacts: {},
    };
  }

  function beginTrainingRun(run, prompt, params, serial) {
    if (!run) return;
    run.runId = `${Date.now().toString(36)}-${Math.max(0, Number(serial || 0))}`;
    run.prompt = String(prompt || '');
    run.params = compactObject(params || {}, 12);
    run.serial = Number(serial || 0);
    run.startedAt = new Date().toISOString();
    run.artifacts = {};
    storeTrainingArtifact(run, 1, 'prompt-runtime', 'Prompt runtime', {
      input: { prompt: run.prompt },
      output: { params: run.params },
    });
  }

  function syncTrainingRuntime(run, runtime, event = {}) {
    if (!run || !runtime) return;
    run.phase = {
      step: runtime.phase && runtime.phase.step || 0,
      id: runtime.phase && runtime.phase.id || '',
      label: runtime.phase && runtime.phase.label || '',
      stage: runtime.stage || '',
      state: runtime.state || '',
      percent: Number(runtime.percent || 0),
      line: runtime.line || '',
      backend: event.backend || '',
      timing: compactObject({
        timestamp: event.timestamp || '',
        durationMs: numericMetric(event.durationMs),
        elapsedMs: numericMetric(event.elapsedMs),
        timing: event.timing || '',
        traceId: event.traceId || '',
        rankId: event.rankId || 0,
        reuse: event.reuse === true,
        providerReady: event.providerReady === true,
      }, 12),
      model: compactObject({
        id: event.modelId || '',
        baseUrl: event.modelBaseUrl || '',
        artifactMode: event.artifactMode || '',
        sourceSizeBytes: numericMetric(event.sourceSizeBytes),
        cachePrefetch: event.cachePrefetch === true,
        cacheSkipReason: event.cacheSkipReason || '',
      }, 12),
      resource: compactObject({
        kind: event.resourceKind || '',
        url: event.resourceUrl || '',
        file: event.file || '',
        fileKind: event.fileKind || '',
        status: event.status || 0,
        byteLength: numericMetric(event.byteLength),
        completedBytes: numericMetric(event.completedBytes),
        totalBytes: numericMetric(event.totalBytes),
        cacheMode: event.cacheMode || '',
      }, 14),
      embeddings: compactObject({
        promptChars: numericMetric(event.promptChars),
        embeddingDim: numericMetric(event.embeddingDim),
        candidateCount: numericMetric(event.candidateCount),
        rankBackend: event.rankBackend || '',
        spanCount: numericMetric(event.spanCount),
        embeddedSpanCount: numericMetric(event.embeddedSpanCount),
        cachedSpanCount: numericMetric(event.cachedSpanCount),
        cacheHitCount: numericMetric(event.cacheHitCount),
        cacheMissCount: numericMetric(event.cacheMissCount),
        batchEmbedding: event.batchEmbedding === true,
      }, 16),
      promptRuntime: compactObject(event.promptRuntimeReceipt || null, 24),
    };
    if (event.promptRuntimeReceipt) {
      storeTrainingArtifact(run, 1, 'prompt-runtime', 'Prompt runtime', {
        input: { prompt: run.prompt },
        output: compactObject({
          params: run.params,
          runtime: event.promptRuntimeReceipt,
        }, 24),
      });
    }
  }

  function syncTrainingPreviewArtifacts(run, preview = {}) {
    if (!run || !preview) return;
    storeTrainingArtifact(run, 4, 'activation-cloud', 'Activation cloud', {
      input: { prompt: run.prompt, backend: preview.backend || '' },
      output: compactObject({
        backend: preview.backend,
        previewIds: idRows(preview.priors || preview.rows || preview.matches, 10),
      }, 16),
    });
  }

  function syncTrainingRankArtifacts(run, result = {}) {
    if (!run || !result) return;
    storeTrainingArtifact(run, 3, 'retrieval', 'Embedding retrieval', {
      input: { prompt: run.prompt, backend: result.backend || '' },
      output: compactObject({
        backend: result.backend,
        model: result.model,
        primitiveIds: idRows(result.priors, 12),
        cardIds: idRows(result.cardMatches, 12),
        universeIds: idRows(result.universeMatches, 12),
      }, 24),
    });
    storeTrainingArtifact(run, 4, 'activation-cloud', 'Activation cloud', {
      input: { prompt: run.prompt, retrievalPhase: result.retrievalPhase || '' },
      output: compactObject({
        spanRetrieval: compactCountObject(result.spanRetrieval),
        evidenceRows: rowCount(result.evidenceRows),
        dopplerIntent: compactObject(result.dopplerIntent, 10),
      }, 24),
    });
  }

  function syncTrainingSpecArtifacts(run, spec = {}, state = {}, canvas = null) {
    if (!run) return;
    const prompt = spec.renderIR && spec.renderIR.prompt ||
      spec.universeGraph && spec.universeGraph.prompt ||
      run.prompt ||
      spec.name ||
      '';
    if (prompt && !run.prompt) run.prompt = String(prompt);
    storeTrainingArtifact(run, 2, 'language-graph', 'Language graph', {
      input: { prompt: run.prompt },
      output: compactObject({
        spans: rowCount(spec.promptParse && spec.promptParse.spans),
        clauses: rowCount(spec.promptParse && spec.promptParse.clauses),
        languageSpans: rowCount(spec.intent && spec.intent.intentBrief &&
          spec.intent.intentBrief.languageEvidence && spec.intent.intentBrief.languageEvidence.spans),
      }, 16),
    });
    storeTrainingArtifact(run, 5, 'grounded-intent', 'Grounded intent', {
      input: phaseOutput(run, '1->4'),
      output: compactObject({
        contractFocus: spec.contract && spec.contract.layerFocus,
        topLevel: spec.contract && spec.contract.topLevel,
        assumptions: rowCount(spec.validationReceipt && spec.validationReceipt.assumptions),
        unsupported: rowCount(spec.validationReceipt && spec.validationReceipt.unsupported),
      }, 20),
    });
    storeTrainingArtifact(run, 6, 'simulation-compile', 'Simulation compile', {
      input: phaseOutput(run, '1->5'),
      output: compactObject({
        physicsDomains: idRows(spec.physicsIR && spec.physicsIR.domains, 12),
        operators: typeRows(spec.physicsIR && spec.physicsIR.operators, 12),
        solverSteps: typeRows(spec.solverGraph && spec.solverGraph.steps, 12),
        renderIRObjects: rowCount(spec.renderIR && spec.renderIR.objects),
        renderIRFields: rowCount(spec.renderIR && spec.renderIR.fields),
        visualAcceptance: visualAcceptanceCounts(spec),
        valid: spec.validationReceipt && spec.validationReceipt.valid,
      }, 28),
    });
    storeTrainingArtifact(run, 7, 'visual-ir', 'VisualIR compile', {
      input: phaseOutput(run, '1->6'),
      output: compactObject({
        sceneHint: spec.renderIR && spec.renderIR.sceneHint,
        sceneKind: spec.renderProgram && spec.renderProgram.visualIR &&
          spec.renderProgram.visualIR.sceneKind,
        objects: rowCount(spec.renderProgram && spec.renderProgram.objects),
        rows: visualIRRowCounts(spec),
        renderInstances: visualRenderInstanceCounts(spec),
        rejectedRows: visualRejectedRows(spec),
        atoms: graphicsAtomCounts(spec),
      }, 24),
    });
    storeTrainingArtifact(run, 8, 'webgpu-ready', 'WebGPU ready', {
      input: phaseOutput(run, '1->7'),
      output: compactObject({
        sceneKind: spec.renderProgram && spec.renderProgram.rendererPlan &&
          spec.renderProgram.rendererPlan.sceneKind,
        stateLabel: stateLabel(state, spec),
        rendererStatus: canvas && canvas.dataset ? canvas.dataset.rendererStatus || '' : '',
        sceneMix: canvas && canvas.dataset ? canvas.dataset.sceneMix || '' : '',
        sceneMixSlots: canvas && canvas.dataset ? Number(canvas.dataset.sceneMixSlots || 0) : 0,
        renderCount: canvas && canvas.dataset ? Number(canvas.dataset.renderCount || 0) : 0,
        semanticCoverage: semanticRenderCoverage(spec),
      }, 24),
    });
  }

  function trainingSnapshot(run, spec = {}, state = {}, canvas = null) {
    syncTrainingSpecArtifacts(run, spec, state, canvas);
    return {
      schema: 'simulatte.trainingSnapshot.v1',
      runId: run.runId || '',
      prompt: run.prompt || '',
      phase: run.phase || null,
      currentSpec: compactObject({
        id: spec.id,
        name: spec.name,
        templateId: spec.templateId,
        sceneKind: spec.renderProgram && spec.renderProgram.rendererPlan &&
          spec.renderProgram.rendererPlan.sceneKind,
      }, 12),
      artifacts: { ...run.artifacts },
    };
  }

  function storeTrainingArtifact(run, step, id, label, pair = {}) {
    if (!run || !step) return;
    run.artifacts[`1->${step}`] = {
      schema: 'simulatte.trainingPhaseArtifact.v1',
      phaseFrom: 1,
      phaseTo: step,
      phaseId: id,
      phaseLabel: label,
      input: compactObject(pair.input || {}, 24),
      output: compactObject(pair.output || {}, 32),
      summary: artifactSummary(step, label, pair.output || {}),
    };
  }

  function phaseOutput(run, phaseId) {
    return run && run.artifacts && run.artifacts[phaseId]
      ? run.artifacts[phaseId].output
      : {};
  }

  function artifactSummary(step, label, output) {
    const text = JSON.stringify(compactObject(output, 10));
    const compact = text.length > 180 ? `${text.slice(0, 177)}...` : text;
    return `${step}: ${label} ${compact}`;
  }

  function compactObject(value, maxKeys = 16) {
    if (!value || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.slice(0, maxKeys).map((row) => compactObject(row, 8));
    return Object.fromEntries(Object.entries(value).slice(0, maxKeys).map(([key, row]) => {
      if (typeof row === 'string') return [key, row.slice(0, 360)];
      if (Array.isArray(row)) return [key, row.slice(0, maxKeys).map((item) => compactObject(item, 8))];
      if (row && typeof row === 'object') return [key, compactObject(row, 8)];
      return [key, row];
    }));
  }

  function numericMetric(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function compactCountObject(value) {
    if (!value || typeof value !== 'object') return { rows: 0 };
    return compactObject({
      rows: rowCount(value.rows || value.matches || value.spans || value),
      ids: idRows(value.rows || value.matches || value.spans, 10),
    }, 8);
  }

  function rowCount(rows) {
    return Array.isArray(rows) ? rows.length : rows && typeof rows === 'object' ? Object.keys(rows).length : 0;
  }

  function idRows(rows, limit = 8) {
    return (Array.isArray(rows) ? rows : []).slice(0, limit).map((row) => (
      row && (row.id || row.primitiveId || row.cardId || row.conceptId || row.entityId || row.name || row.kind) || ''
    )).filter(Boolean);
  }

  function typeRows(rows, limit = 8) {
    return (Array.isArray(rows) ? rows : []).slice(0, limit).map((row) => (
      row && (row.type || row.operatorType || row.kind || row.id) || ''
    )).filter(Boolean);
  }

  function graphicsAtomCounts(spec = {}) {
    const atoms = spec.renderProgram && spec.renderProgram.visualIR &&
      spec.renderProgram.visualIR.graphicsAtoms || {};
    return compactObject({
      mappings: rowCount(atoms.mappings),
      geometry: rowCount(atoms.geometry),
      materials: rowCount(atoms.materials),
      processes: rowCount(atoms.processes),
      wgslOperators: rowCount(atoms.wgslOperators),
    }, 8);
  }

  function visualAcceptanceCounts(spec = {}) {
    const ledger = spec.renderProgram && spec.renderProgram.rendererPlan &&
      spec.renderProgram.rendererPlan.visualObjectLedger ||
      spec.renderProgram && spec.renderProgram.provenance &&
      spec.renderProgram.provenance.visualObjectLedger ||
      {};
    return compactObject({
      accepted: numericMetric(ledger.acceptedCount),
      rejected: numericMetric(ledger.rejectedCount),
      acceptedIds: ledger.acceptedIds || [],
      rejectedIds: ledger.rejectedIds || [],
    }, 12);
  }

  function visualIRRowCounts(spec = {}) {
    const visual = spec.renderProgram && spec.renderProgram.visualIR || {};
    const rowSets = ['entities', 'materials', 'fields', 'processes', 'geometry', 'motion', 'renderInstances'];
    const counts = {};
    for (const key of rowSets) counts[key] = rowCount(visual[key]);
    counts.accepted = rowSets.reduce((sum, key) => {
      const rows = Array.isArray(visual[key]) ? visual[key] : [];
      return sum + rows.filter((row) => row && row.status !== 'rejected').length;
    }, 0);
    counts.rejected = rowCount(visual.rejectedRows);
    counts.sourceLinked = rowSets.reduce((sum, key) => {
      const rows = Array.isArray(visual[key]) ? visual[key] : [];
      return sum + rows.filter((row) => row && (row.sourceGraphId || row.sourceObject || row.entityId)).length;
    }, 0);
    return compactObject(counts, 12);
  }

  function visualRenderInstanceCounts(spec = {}) {
    const rows = spec.renderProgram && spec.renderProgram.visualIR &&
      spec.renderProgram.visualIR.renderInstances || [];
    return compactObject({
      total: rowCount(rows),
      accepted: rows.filter((row) => row && row.status !== 'rejected').length,
      sourceLinked: rows.filter((row) => row && (row.sourceGraphId || row.sourceIds && row.sourceIds.length)).length,
      layerSlots: uniqueStrings(rows.map((row) => row && row.layerSlot).filter(Boolean)).slice(0, 12),
    }, 12);
  }

  function visualRejectedRows(spec = {}) {
    const rows = spec.renderProgram && spec.renderProgram.visualIR &&
      spec.renderProgram.visualIR.rejectedRows || [];
    return rows.slice(0, 12).map((row) => ({
      id: row && row.id || '',
      sourceKind: row && row.sourceKind || '',
      reason: row && row.reason || '',
    }));
  }

  function uniqueStrings(values) {
    return Array.from(new Set((values || []).map((value) => String(value || '')).filter(Boolean)));
  }

  function semanticRenderCoverage(spec = {}) {
    const promptObjects = (spec.objects || []).filter(isPromptGroundedObject);
    const renderedObjects = spec.renderProgram && Array.isArray(spec.renderProgram.objects)
      ? spec.renderProgram.objects
      : [];
    const renderedTokens = new Set(renderedObjects.flatMap(renderCoverageTokens));
    const promptRows = promptObjects.map((object) => {
      const tokens = renderCoverageTokens(object);
      const covered = tokens.some((token) => renderedTokens.has(token));
      return {
        id: object.id || '',
        phrase: object.phrase || object.role || '',
        source: object.source || '',
        covered,
      };
    });
    const missing = promptRows.filter((row) => !row.covered);
    return {
      status: missing.length ? 'semantic-miss' : 'covered',
      promptObjects: promptRows.length,
      renderedObjects: renderedObjects.length,
      missing: missing.map((row) => row.phrase || row.id).slice(0, 8),
    };
  }

  function isPromptGroundedObject(object) {
    const source = String(object && object.source || '');
    return /^embedding-guided-synth|open-semantic-rag|semantic-surface-grounder|prompt-explicit|doppler-residual/.test(source) ||
      Boolean(object && object.phrase && source && source !== 'catalog');
  }

  function renderCoverageTokens(object) {
    return [
      object && object.id,
      object && object.phrase,
      object && object.role,
      object && object.semanticRef,
      object && object.physicalRef,
    ]
      .filter(Boolean)
      .flatMap((value) => String(value).toLowerCase().split(/[^a-z0-9]+/))
      .filter((value) => value && !/^(open|surface|generated|entity|prompt|derived|generic|primitive)$/.test(value));
  }

  function runtimeLineText(event, phase, stage, _message, percent, _indeterminate) {
    const normalized = String(stage || phase && phase.id || '').toLowerCase();
    const timing = runtimeTimingSuffix(event);
    if (event.state === 'error' || normalized === 'error') return 'Intent model failed';
    if (event.state === 'ready' && /runtime-ready|prompt-runtime/.test(normalized)) {
      return 'Prompt runtime ready 100%';
    }
    if (event.state === 'ready' || percent >= 100 || /^(ready|blank|complete|done)$/.test(normalized)) {
      return 'Ready 100%';
    }
    if (/manifest-fetch/.test(normalized)) return `Loading intent manifest ${percent}%${timing}`;
    if (/index-fetch|indexes/.test(normalized)) return `Loading embedding indexes ${percent}%${timing}`;
    if (/model-module/.test(normalized)) return `Loading Doppler runtime ${percent}%${timing}`;
    if (/cache-worker/.test(normalized)) return `Preparing model cache ${percent}%${timing}`;
    if (/cache-storage/.test(normalized)) return `Opening persistent model cache ${percent}%${timing}`;
    if (/cache-skip/.test(normalized)) return `Model cache skipped ${percent}%${timing}`;
    if (/cache-fill|shard|weight/.test(normalized)) return `Caching model weights ${percent}%${timing}`;
    if (/cache-ready|cache-hit/.test(normalized)) return `Model cache ready ${percent}%${timing}`;
    if (/model-reuse/.test(normalized)) return `Reusing embedding model ${percent}%${timing}`;
    if (/model-ready/.test(normalized)) return `Embedding model ready ${percent}%${timing}`;
    if (/model-load/.test(normalized)) return `Loading Doppler model ${percent}%${timing}`;
    if (/prompt-embed/.test(normalized)) return `Embedding prompt ${percent}%${timing}`;
    if (/\brank\b/.test(normalized)) return `Ranking embeddings ${percent}%${timing}`;
    if (/span-cache/.test(normalized)) return `Checking span embedding cache ${percent}%${timing}`;
    if (/span-embed/.test(normalized)) return `Embedding prompt spans ${percent}%${timing}`;
    if (/span-rank/.test(normalized)) return `Ranking prompt spans ${percent}%${timing}`;
    if (/\b(language|parse)\b/.test(normalized)) return `Parsing language ${percent}%${timing}`;
    if (/\b(indexes|model|embed|retrieval)\b/.test(normalized)) return `Retrieving embeddings ${percent}%${timing}`;
    if (/\b(span-retrieval|activation)\b/.test(normalized)) return `Building activation cloud ${percent}%${timing}`;
    if (/\b(classification|grounded|intent)\b/.test(normalized)) return `Grounding intent ${percent}%`;
    if (/\b(compile|simulation)\b/.test(normalized)) return `Compiling simulation ${percent}%`;
    if (/\b(visual)\b/.test(normalized)) return `Building VisualIR ${percent}%`;
    if (/\b(render)\b/.test(normalized)) return `Rendering scene ${percent}%`;
    return `Loading embeddings ${percent}%`;
  }

  function runtimeTimingSuffix(event = {}) {
    if (Number.isFinite(Number(event.durationMs)) && Number(event.durationMs) > 0) {
      return ` ${formatRuntimeDuration(event.durationMs)}`;
    }
    if (Number.isFinite(Number(event.elapsedMs)) && Number(event.elapsedMs) > 0) {
      return ` ${formatRuntimeDuration(event.elapsedMs)} elapsed`;
    }
    return '';
  }

  function formatRuntimeDuration(value) {
    const ms = Number(value);
    if (!Number.isFinite(ms)) return '';
    if (ms < 1000) return `${Math.max(0, Math.round(ms))}ms`;
    return `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)}s`;
  }

  function compactIntentRuntimeMessage(message) {
    const text = String(message || '').trim();
    if (!text) return 'Intent model busy';
    if (/attention_small\.wgsl|activationDtype|kvDtype|kvcache/i.test(text)) {
      return 'Runtime dtype mismatch';
    }
    if (/cache worker.*controlling|reload and retry/i.test(text)) return 'Reload to finish model cache';
    if (/CacheStorage|Service Worker/i.test(text)) return 'Model cache unavailable';
    if (/model fetch failed|fetch failed|failed to fetch/i.test(text)) return 'Model download failed';
    if (/Doppler module import|no loader found/i.test(text)) return 'Doppler runtime unavailable';
    if (/embedModel(Id|Hash) mismatch|embedding dim mismatch|non-finite value/i.test(text)) {
      return 'Intent model unavailable';
    }
    if (/https?:\/\/|huggingface\.co|Clocksmith\/rdrr/i.test(text)) return 'Intent model unavailable';
    if (/^Caching shard_/i.test(text)) return 'Caching model weights';
    if (/^Cached shard_/i.test(text)) return 'Model weights cached';
    if (text.length <= 72) return text;
    return `${text.slice(0, 69).trim()}...`;
  }

  function waitForLoadingPaint() {
    if (typeof requestAnimationFrame !== 'function') return Promise.resolve();
    return new Promise((resolve) => {
      requestAnimationFrame(() => {
        setTimeout(resolve, 0);
      });
    });
  }

  function renderControls(controlStack, spec) {
    if (!controlStack) return;
    controlStack.innerHTML = '';
    for (const [key, label, min, max, step] of controlsForSpec(spec)) {
      const wrapper = document.createElement('label');
      wrapper.className = 'physics-control';
      wrapper.setAttribute('for', `control-${key}`);
      const title = document.createElement('span');
      title.textContent = label;
      const input = document.createElement('input');
      input.id = `control-${key}`;
      input.type = 'range';
      input.min = String(min);
      input.max = String(max);
      input.step = String(step);
      input.value = String(spec.params[key]);
      input.dataset.paramKey = key;
      wrapper.append(title, input);
      controlStack.appendChild(wrapper);
    }
  }

  function readSpecFromUi(spec, controlStack, nameInput) {
    const params = { ...spec.params };
    if (controlStack) {
      controlStack.querySelectorAll('[data-param-key]').forEach((input) => {
        params[input.dataset.paramKey] = Number(input.value);
      });
    }
    const name = nameInput && nameInput.value ? nameInput.value : spec.name;
    if (name === spec.name && sameParamValues(params, spec.params)) return spec;
    return {
      ...spec,
      name,
      params,
    };
  }

  function sameParamValues(next = {}, prev = {}) {
    const keys = new Set([...Object.keys(next || {}), ...Object.keys(prev || {})]);
    for (const key of keys) {
      if (Number(next[key]) !== Number(prev[key])) return false;
    }
    return true;
  }

  function syncTemplateButtons(buttons, templateId) {
    buttons.forEach((button) => {
      const active = button.dataset.templateId === templateId;
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
      button.classList.toggle('is-active', active);
    });
  }

  function syncShuffleButton(button, spec) {
    if (!button) return;
    const prompt = spec.renderIR && spec.renderIR.prompt ||
      spec.universeGraph && spec.universeGraph.prompt ||
      '';
    const match = EXAMPLE_INTENTS.find((example) => example.prompt === prompt);
    button.dataset.exampleId = match ? match.id : '';
    button.title = match ? match.prompt : `${EXAMPLE_INTENTS.length} example prompts`;
    button.classList.toggle('is-active', Boolean(match));
    button.setAttribute('aria-pressed', match ? 'true' : 'false');
  }

  function pickShuffleExample(currentPrompt = '') {
    const normalized = String(currentPrompt || '').trim().toLowerCase();
    const pool = EXAMPLE_INTENTS.filter((example) => String(example.prompt || '').toLowerCase() !== normalized);
    const candidates = pool.length ? pool : EXAMPLE_INTENTS;
    if (!candidates.length) return null;
    const index = Math.floor(Math.random() * candidates.length);
    return candidates[index] || candidates[0];
  }

  function readPromptParams(input, fallback = {}) {
    return parseParamJson(input && input.dataset ? input.dataset.exampleParams : '', fallback);
  }

  function parseParamJson(raw, fallback = {}) {
    if (!raw) return { ...fallback };
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : { ...fallback };
    } catch (_err) {
      return { ...fallback };
    }
  }

  function syncComponentStack(node, spec) {
    if (!node) return;
    node.innerHTML = '';
    if (spec.templateId === 'blank-world') {
      const empty = document.createElement('span');
      empty.className = 'component-chip is-empty';
      empty.textContent = 'empty plane';
      node.appendChild(empty);
      return;
    }
    if (spec.compositionGraph && spec.renderProgram) {
      const graph = spec.compositionGraph;
      const program = spec.renderProgram;
      const planChips = [
        'classifier composition',
        `${graph.nodes.length} primitives`,
        `${graph.relations.length} links`,
        `${graph.operators.length} operators`,
        `${program.fields.length} fields`,
      ];
      for (const label of planChips) {
        const chip = document.createElement('span');
        chip.className = 'component-chip is-domain';
        chip.textContent = label;
        node.appendChild(chip);
      }
      for (const object of graph.nodes.slice(0, 8)) {
        const chip = document.createElement('span');
        chip.className = `component-chip is-${object.type || 'part'}`;
        chip.textContent = object.primitiveId.replace(/-/g, ' ');
        node.appendChild(chip);
      }
      return;
    }
    const components = spec.objects.map((object) => ({
      id: object.id,
      type: object.type,
      role: object.role,
      params: {},
    }));
    const domains = spec.modules;
    const contract = spec.contract || null;
    const topLevelIds = contract && contract.topLevel || [];
    const topLevelItems = topLevelIds
      .map((id) => components.find((component) => component.id === id))
      .filter(Boolean);
    const childItems = components.filter((component) => !topLevelIds.includes(component.id));
    const componentItems = [...topLevelItems, ...childItems].slice(0, 12);
    if (!componentItems.length) {
      const empty = document.createElement('span');
      empty.className = 'component-chip is-empty';
      empty.textContent = 'empty plane';
      node.appendChild(empty);
      return;
    }
    const focus = contract && contract.layerFocus ? [contract.layerFocus] : [];
    const layout = contract && contract.layout ? [contract.layout.grammar] : [];
    for (const domain of [...focus, ...layout, ...domains].slice(0, 6)) {
      const chip = document.createElement('span');
      chip.className = 'component-chip is-domain';
      chip.textContent = domain;
      node.appendChild(chip);
    }
    for (const component of componentItems) {
      const chip = document.createElement('span');
      const topLevel = topLevelIds.includes(component.id) ? ' is-top-level' : '';
      chip.className = `component-chip is-${component.type || 'part'}${topLevel}`;
      chip.textContent = component.id.replace(/-/g, ' ');
      node.appendChild(chip);
    }
  }

  function syncReadoutLabels(readouts, spec) {
    const labels = readoutLabelsForSpec(spec);
    readouts.forEach((readout, index) => {
      if (readout.label) readout.label.textContent = labels[index] || '-';
    });
  }

  function syncReadouts(readouts, stateReadout, state, spec) {
    const values = readoutValues(state, spec);
    const labels = readoutLabelsForSpec(spec);
    readouts.forEach((readout, index) => {
      const key = labels[index];
      if (readout.value) readout.value.textContent = values[key] || '0';
    });
    if (stateReadout) stateReadout.textContent = stateLabel(state, spec);
  }

  function syncSpecPreview(node, spec) {
    if (!node) return;
    const worldModel = worldModelSnapshot(spec);
    node.textContent = JSON.stringify({
      schema: spec.schema,
      id: spec.id || '',
      templateId: spec.templateId || '',
      template: spec.templateId,
      name: spec.name,
      worldModel,
      intent: spec.intent ? {
        schema: spec.intent.schema,
        intentBrief: spec.intent.intentBrief || null,
      } : null,
      intentReceipt: spec.physicalSpec && spec.physicalSpec.receipt
        ? spec.physicalSpec.receipt.intentBrief || null
        : null,
      semanticRetrievalReceipt: spec.universeGraph ? spec.universeGraph.intentBrief || null : null,
      contract: spec.contract ? {
        layerFocus: spec.contract.layerFocus,
        topLevel: spec.contract.topLevel,
        layout: spec.contract.layout,
        interactions: spec.contract.interactions.map((rule) => rule.id),
        readouts: spec.contract.readouts,
        graph: spec.contract.graph ? {
          schema: spec.contract.graph.schema,
          nodes: spec.contract.graph.nodes.length,
          edges: spec.contract.graph.edges.length,
          operators: spec.contract.graph.operators.map((operator) => operator.id),
          conservation: spec.contract.graph.conservation.map((rule) => rule.id),
          temporal: spec.contract.graph.temporal.map((event) => event.id),
          validation: spec.contract.graph.validation,
          explanation: spec.contract.graph.explanation,
        } : null,
      } : null,
      compositionGraph: spec.compositionGraph ? {
        schema: spec.compositionGraph.schema,
        nodes: spec.compositionGraph.nodes.length,
        relations: spec.compositionGraph.relations.length,
        operators: spec.compositionGraph.operators.map((operator) => operator.id),
        priors: spec.compositionGraph.priors.slice(0, 10).map((prior) => prior.primitiveId),
      } : null,
      promptParse: spec.promptParse ? {
        schema: spec.promptParse.schema,
        spans: spec.promptParse.spans.length,
        clauses: spec.promptParse.clauses.length,
      } : null,
      universeGraph: spec.universeGraph ? {
        schema: spec.universeGraph.schema,
        nodes: spec.universeGraph.nodes.length,
        edges: spec.universeGraph.edges.length,
        unresolved: spec.universeGraph.unresolved,
      } : null,
      physicsIR: spec.physicsIR ? {
        schema: spec.physicsIR.schema,
        domains: spec.physicsIR.domains.map((domain) => `${domain.kind}:${domain.entityId}`),
        fields: spec.physicsIR.stateFields.map((field) => field.id),
        operators: spec.physicsIR.operators.map((operator) => operator.type),
        couplings: spec.physicsIR.couplings,
      } : null,
      validationReceipt: spec.validationReceipt || null,
      solverGraph: spec.solverGraph ? {
        schema: spec.solverGraph.schema,
        channels: Object.keys(spec.solverGraph.channels || {}),
        steps: spec.solverGraph.steps.map((step) => `${step.stage}:${step.operatorType}`),
        warnings: spec.solverGraph.warnings,
      } : null,
      renderIR: spec.renderIR ? {
        schema: spec.renderIR.schema,
        sceneHint: spec.renderIR.sceneHint,
        objects: spec.renderIR.objects.map((object) => ({
          id: object.physicalRef,
          glyph: object.glyph,
          bindings: object.stateBindings,
        })),
      } : null,
      renderProgram: spec.renderProgram ? {
        schema: spec.renderProgram.schema,
        rendererPlan: spec.renderProgram.rendererPlan || null,
        visualIR: spec.renderProgram.visualIR || null,
        objects: spec.renderProgram.objects.length,
        relations: spec.renderProgram.relations.length,
        fields: spec.renderProgram.fields.map((field) => field.kind),
        solver: spec.renderProgram.solverPlan ? spec.renderProgram.solverPlan.families : [],
        visualRegimes: spec.renderProgram.provenance.visualRegimes || [],
        signature: spec.renderProgram.provenance.signature,
      } : null,
      physicalSpec: spec.physicalSpec ? {
        schema: spec.physicalSpec.schema,
        sourceGraph: spec.physicalSpec.sourceGraph,
        stateTextures: spec.physicalSpec.stateTextures,
        renderPasses: spec.physicalSpec.renderPasses,
        quality: spec.physicalSpec.quality,
        receipt: spec.physicalSpec.receipt,
      } : null,
      params: Object.fromEntries(Object.entries(spec.params).slice(0, 8)),
      remixOf: spec.remixOf || null,
    }, null, 2);
  }

  function syncWorldModelReceipt(elements, spec) {
    if (!elements || !elements.node) return;
    const worldModel = worldModelSnapshot(spec);
    elements.node.dataset.sceneKind = worldModel.sceneKind || '';
    elements.node.dataset.templateId = worldModel.template || '';
    if (elements.status) elements.status.textContent = worldModel.sceneKind || worldModel.template || 'blank';
    if (elements.summary) elements.summary.textContent = worldModel.summary;
    if (elements.chips) {
      elements.chips.innerHTML = '';
      [
        ['spans', worldModel.languageSpans],
        ['accepted', worldModel.acceptedActivations],
        ['graph', `${worldModel.graphNodes}/${worldModel.graphEdges}`],
        ['physics', worldModel.physicsOperators],
        ['visual', `${worldModel.visualEntities}/${worldModel.visualProcesses}`],
        ['atoms', worldModel.graphicsAtoms],
        ['assumed', worldModel.assumptions],
        ['unsupported', worldModel.unsupported],
        ['wgsl', worldModel.wgslOperators],
      ].forEach(([label, value]) => {
        const chip = elements.node.ownerDocument.createElement('span');
        chip.className = 'world-model-chip';
        const labelNode = elements.node.ownerDocument.createElement('span');
        labelNode.textContent = label;
        const valueNode = elements.node.ownerDocument.createElement('strong');
        valueNode.textContent = String(value);
        chip.append(labelNode, valueNode);
        elements.chips.appendChild(chip);
      });
    }
  }

  function worldModelSnapshot(spec = {}) {
    const intentBrief = spec.intent && spec.intent.intentBrief || {};
    const universeBrief = spec.universeGraph && spec.universeGraph.intentBrief || {};
    const physicalReceipt = spec.physicalSpec && spec.physicalSpec.receipt || {};
    const receiptBrief = physicalReceipt.intentBrief || {};
    const renderReceipt = spec.renderIR && spec.renderIR.intentBriefReceipt || {};
    const compactBrief = renderReceipt.schema ? renderReceipt : receiptBrief;
    const visualIR = spec.renderProgram && spec.renderProgram.visualIR || {};
    const graphicsAtoms = visualIR.graphicsAtoms || {};
    const prompt = spec.renderIR && spec.renderIR.prompt ||
      spec.universeGraph && spec.universeGraph.prompt ||
      spec.name ||
      '';
    const sceneKind = visualIR.sceneKind ||
      spec.renderProgram && spec.renderProgram.rendererPlan && spec.renderProgram.rendererPlan.sceneKind ||
      spec.renderIR && spec.renderIR.sceneHint ||
      spec.templateId ||
      'blank-world';
    const languageSpans = countRows(intentBrief.languageEvidence && intentBrief.languageEvidence.spans) ||
      countRows(universeBrief.languageEvidence && universeBrief.languageEvidence.spans) ||
      countRows(compactBrief.languageSpans);
    const acceptedActivations = countRows(intentBrief.groundedInterpretation && intentBrief.groundedInterpretation.acceptedActivations) ||
      countRows(universeBrief.groundedInterpretation && universeBrief.groundedInterpretation.acceptedActivations) ||
      countRows(compactBrief.acceptedActivations);
    const graphNodes = countRows(spec.universeGraph && spec.universeGraph.nodes);
    const graphEdges = countRows(spec.universeGraph && spec.universeGraph.edges);
    const physicsOperators = countRows(spec.physicsIR && spec.physicsIR.operators);
    const visualEntities = countRows(visualIR.entities);
    const visualProcesses = countRows(visualIR.processes);
    const graphicsAtomRows = [
      'mappings',
      'geometry',
      'fields',
      'materials',
      'processes',
      'motion',
      'camera',
      'languageSignals',
    ].reduce((sum, key) => sum + countRows(graphicsAtoms[key]), 0);
    const assumptions = countRows(intentBrief.assumptions) ||
      countRows(universeBrief.assumptions) ||
      Number(physicalReceipt.assumptionCount || 0);
    const unsupported = countRows(intentBrief.unsupported) +
      countRows(intentBrief.degradedTo) ||
      countRows(universeBrief.unsupported) +
      countRows(universeBrief.degradedTo) ||
      Number(physicalReceipt.unsupportedCount || 0) + Number(physicalReceipt.degradedCount || 0);
    return {
      schema: 'simulatte.visibleWorldModelReceipt.v1',
      template: spec.templateId || '',
      prompt,
      sceneKind,
      summary: worldModelSummary(prompt, sceneKind, {
        graphNodes,
        graphEdges,
        visualEntities,
        graphicsAtomRows,
      }),
      languageSpans,
      acceptedActivations,
      graphNodes,
      graphEdges,
      physicsOperators,
      solverSteps: countRows(spec.solverGraph && spec.solverGraph.steps),
      visualEntities,
      visualProcesses,
      graphicsAtoms: graphicsAtomRows,
      mappings: countRows(graphicsAtoms.mappings),
      wgslOperators: countRows(graphicsAtoms.wgslOperators),
      assumptions,
      unsupported,
      receipts: {
        intentBrief: intentBrief.schema || universeBrief.schema || compactBrief.schema || '',
        universeGraph: spec.universeGraph && spec.universeGraph.schema || '',
        physicsIR: spec.physicsIR && spec.physicsIR.schema || '',
        solverGraph: spec.solverGraph && spec.solverGraph.schema || '',
        visualIR: visualIR.schema || '',
        graphicsAtoms: graphicsAtoms.schema || '',
      },
    };
  }

  function worldModelSummary(prompt, sceneKind, counts) {
    const source = String(prompt || '').trim() || 'blank construction plane';
    const compact = source.length > 84 ? `${source.slice(0, 81).trim()}...` : source;
    const evidence = counts.graphNodes || counts.visualEntities || counts.graphicsAtomRows
      ? `${counts.graphNodes} nodes, ${counts.visualEntities} visual entities, ${counts.graphicsAtomRows} atoms`
      : 'awaiting compiled evidence';
    return `${compact} -> ${sceneKind || 'world'} | ${evidence}`;
  }

  function countRows(rows) {
    return Array.isArray(rows) ? rows.length : 0;
  }

  function logGraphDebug(spec) {
    if (typeof console === 'undefined' || !spec || typeof spec !== 'object') return;
    if (!spec.compositionGraph && !spec.renderProgram && !spec.physicalSpec) return;
    const graph = spec.compositionGraph || null;
    const renderProgram = spec.renderProgram || null;
    const receipt = spec.physicalSpec && spec.physicalSpec.receipt || null;
    const rendererPlan = renderProgram && renderProgram.rendererPlan || null;
    const prompt = renderProgram && renderProgram.intentText || spec.renderIR && spec.renderIR.prompt || spec.name || 'simulation';
    const scene = rendererPlan && rendererPlan.sceneKind || 'unplanned';
    const graphId = spec.id || graph && graph.graphId || 'simulation';
    const label = `[simulatte.graph] ${scene} ${graphId}`;
    const group = typeof console.groupCollapsed === 'function' ? console.groupCollapsed.bind(console) : console.log.bind(console);
    const groupEnd = typeof console.groupEnd === 'function' ? console.groupEnd.bind(console) : () => {};
    group(label);
    console.log('compiledIntentText', String(prompt || '').slice(0, 1200));
    console.log('intentReceipt', spec.physicalSpec && spec.physicalSpec.receipt && spec.physicalSpec.receipt.intentBrief || null);
    console.log('semanticRetrievalReceipt', spec.universeGraph && spec.universeGraph.intentBrief || null);
    console.log('promptParse', spec.promptParse || null);
    console.log('universeGraph', spec.universeGraph || null);
    console.log('semanticGraph', spec.universeGraph && spec.universeGraph.semanticGraph || null);
    console.log('affordanceGraph', spec.universeGraph && spec.universeGraph.affordanceGraph || null);
    console.log('primitiveMapping', spec.universeGraph && spec.universeGraph.primitiveMapping || null);
    console.log('physicsIR', spec.physicsIR || null);
    console.log('validationReceipt', spec.validationReceipt || null);
    console.log('solverGraph', spec.solverGraph || null);
    console.log('renderIR', spec.renderIR || null);
    console.log('compositionGraph', graph);
    console.log('renderProgram', renderProgram);
    console.log('physicalSpec', spec.physicalSpec || null);
    console.log('receipt', receipt);
    if (graph && typeof console.table === 'function') {
      console.table((graph.nodes || []).map((node) => ({
        id: node.id,
        primitive: node.primitiveId,
        type: node.type,
        layer: node.layer,
        regime: node.visualRegime,
        material: node.material,
        source: node.source,
      })));
      console.table((graph.relations || []).map((relation) => ({
        from: relation.from,
        to: relation.to,
        type: relation.type || relation.relation || '',
        operator: relation.operator || '',
      })));
      console.table((graph.operators || []).map((operator) => ({
        id: operator.id,
        kind: operator.kind || operator.type || '',
        inputs: Array.isArray(operator.inputs) ? operator.inputs.join(', ') : '',
        outputs: Array.isArray(operator.outputs) ? operator.outputs.join(', ') : '',
      })));
    }
    if (rendererPlan) {
      console.log('rendererPlan', rendererPlan);
    }
    groupEnd();
  }

  function syncOpenSpecPreview(node, spec, frameNow, lastSync, assignLastSync) {
    if (!node) return;
    const disclosure = node.closest ? node.closest('details') : null;
    if (disclosure && !disclosure.open) return;
    if (frameNow - lastSync < 250) return;
    syncSpecPreview(node, spec);
    assignLastSync(frameNow);
  }


  function start() {
    if (typeof document === 'undefined') return null;
    return createBrowserLab(document);
  }
  return {
    createBrowserLab,
    start,
  };
});
