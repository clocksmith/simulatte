(function attachSimulattePhysicsRendererlabcontroller(root) {
  const scope = root.__SimulattePhysicsRendererRefactorScope;
  if (!scope || scope.missingDependency) return;
  with (scope) {
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
        const trainingRun = createTrainingRunState();
        const runtimeProgress = runtimeProgressApi.connect(root, {
          loadingCanvas: loadingCanvasController,
          runButton: root.getElementById('build-lab'),
        });
        runtimeProgress.subscribe((runtime, event) => syncTrainingRuntime(trainingRun, runtime, event), {
          replay: false,
        });
        function publishRuntime(event = {}) {
          return runtimeProgress.publish({
            runId: trainingRun.runId || '',
            ...event,
          });
        }
        unregisterLegacyModelCacheWorker(root.defaultView);
        if (!webGpuRenderer && stateReadout) {
          stateReadout.textContent = 'WebGPU required';
        }
        const intentWorker = createIntentWorkerClient(root, (event) => publishRuntime(event));
        let mainThreadEmbedder = null;
        const createMainThreadEmbedder = () => {
          if (mainThreadEmbedder) return mainThreadEmbedder;
          const api = root.defaultView && root.defaultView.SimulatteIntentEmbedder;
          if (!api || typeof api.create !== 'function') return null;
          mainThreadEmbedder = api.create({
            catalog: model,
            onProgress: (event) => publishRuntime(event),
            traceEmbeddings: intentTraceEnabled(root.defaultView),
          });
          return mainThreadEmbedder;
        };
        const embedder = intentWorker || createMainThreadEmbedder();
        const initialParams = promptInput
          ? readPromptParams(promptInput, EXAMPLE_INTENTS[0].params)
          : EXAMPLE_INTENTS[0].params;
        let spec = createSpec('blank-world', { params: initialParams });
        let state = createSimulationState(spec);
        let renderExecutionInput = null;
        let last = performance.now();
        let paused = false;
        let buildSerial = 0;
        let compileSerial = 0;
        let activePromptRuntimeReceipt = null;
        const pipelineCompiler = createPipelineCompiler(root);

        const refreshRenderExecutionInput = () => {
          const phase6Output = spec && spec.phaseArtifacts && spec.phaseArtifacts.phase6 || null;
          if (!phase6Output) {
            renderExecutionInput = null;
            return null;
          }
          renderExecutionInput = createRenderExecutionInput(phase6Output, state, canvas);
          return renderExecutionInput;
        };

        const previewDisclosure = specPreview && specPreview.closest
          ? specPreview.closest('details')
          : null;
        if (previewDisclosure) {
          previewDisclosure.addEventListener('toggle', () => {
            if (!previewDisclosure.open) return;
            syncSpecPreview(specPreview, spec);
          });
        }

        setSimulationCanvasVisible(false);

        const setSpec = (nextSpec, options = {}) => {
          const visible = options.visible === true || simulationVisible;
          spec = normalizeSpec(nextSpec);
          state = createSimulationState(spec);
          renderExecutionInput = null;
          if (nameInput) nameInput.value = spec.name;
          renderControls(controlStack, spec);
          syncComponentStack(componentStack, spec);
          syncShuffleButton(shuffleButton, spec);
          syncReadoutLabels(readouts, spec);
          syncWorldModelReceipt(worldModelReceipt, spec);
          syncSpecPreview(specPreview, spec);
          logGraphDebug(spec);
          if (visible && webGpuRenderer) {
            const nextRenderExecutionInput = refreshRenderExecutionInput();
            if (nextRenderExecutionInput) webGpuRenderer.setRenderExecutionInput(nextRenderExecutionInput);
          }
          if (visible) {
            setSimulationCanvasVisible(true);
            syncTrainingSpecArtifacts(trainingRun, spec, state, canvas);
          }
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
          if (!String(prompt || '').trim()) {
            publishRuntime({
              state: 'ready',
              stage: 'blank',
              percent: 100,
              message: 'Ready',
              canvasLoading: false,
            });
            setSimulationCanvasVisible(false);
            setSpec(createSpec('blank-world', { params }), { visible: false });
            return;
          }
          publishRuntime({
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
          publishRuntime({
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
            activePromptRuntimeReceipt = promptRuntimeReceipt;
            publishRuntime({
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
          publishRuntime({
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
                slotRetrieval: result.slotRetrieval,
                retrievalPhase: result.retrievalPhase || 'span-refined',
                evidenceRows: result.evidenceRows,
              }, {
                stage: 'language',
                percent: 31,
                message: 'Parsing language',
                backend: result.backend,
                canvasLoading: showCanvasLoader,
              });
              if (serial !== buildSerial || token !== compileSerial) return false;
              setSpec(nextSpec, { visible: true });
              publishRuntime({
                state: 'active',
                stage: 'render',
                percent: 98,
                message: 'Rendering scene',
                backend: result.backend,
                canvasLoading: showCanvasLoader,
              });
              return true;
            };
            const promptRuntimeReceipt = await ensurePromptRuntimeReceipt(serial);
            if (serial !== buildSerial) return;
            const retrievalQueryPlan = retrievalQueryPlanForPrompt(prompt, params, promptRuntimeReceipt);
            publishRuntime({
              state: 'active',
              stage: 'scene-query-plan',
              percent: 5,
              message: 'Planning scene retrieval slots',
              querySlotCount: retrievalQueryPlan.queryPlan &&
                retrievalQueryPlan.queryPlan.summary &&
                retrievalQueryPlan.queryPlan.summary.slotCount || 0,
              canvasLoading: showCanvasLoader,
            });
            const result = await embedder.rankPrompt(prompt, model.PHYSICAL_PRIMITIVES, {
              max: 36,
              queryPlan: retrievalQueryPlan.queryPlan,
              sceneLanguageGraph: retrievalQueryPlan.sceneLanguageGraph,
              promptRuntimeReceipt,
              onProgress: (event) => publishRuntime({
                ...event,
                canvasLoading: showCanvasLoader,
              }),
              onPreview: (preview) => {
                syncTrainingPreviewArtifacts(trainingRun, preview);
                publishRuntime({
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
            publishRuntime({
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

        async function ensurePromptRuntimeReceipt(serial) {
          if (
            activePromptRuntimeReceipt &&
            activePromptRuntimeReceipt.providerReady === true &&
            activePromptRuntimeReceipt.noFallback === true &&
            (activePromptRuntimeReceipt.rerankerRequired !== true || activePromptRuntimeReceipt.rerankerReady === true)
          ) {
            return activePromptRuntimeReceipt;
          }
          const loadedRuntime = await embedder.loadModel();
          if (serial !== buildSerial) return null;
          activePromptRuntimeReceipt = loadedRuntime && loadedRuntime.promptRuntimeReceipt || null;
          return activePromptRuntimeReceipt;
        }

        function retrievalQueryPlanForPrompt(prompt, params = {}, promptRuntimeReceipt = null) {
          if (
            !model ||
            typeof model.runPhase1RuntimeGate !== 'function' ||
            typeof model.runPhase2LanguageGraph !== 'function'
          ) {
            return { queryPlan: null, sceneLanguageGraph: null };
          }
          try {
            const phase1 = model.runPhase1RuntimeGate(prompt, {
              params,
              promptRuntimeReceipt,
            });
            const phase2 = model.runPhase2LanguageGraph(phase1);
            const artifact = phase2 && phase2.artifact || {};
            return {
              queryPlan: artifact.queryPlan || null,
              sceneLanguageGraph: artifact.sceneLanguageGraph || null,
            };
          } catch (error) {
            if (typeof console !== 'undefined' && console.warn) {
              console.warn('[simulatte.intent] retrieval query plan unavailable', error);
            }
            return { queryPlan: null, sceneLanguageGraph: null };
          }
        }

        function reportIntentFailure(serial, diagnostic = '') {
          if (serial !== buildSerial) return;
          publishRuntime({
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
          const onPhaseProgress = (progressEvent = {}) => publishRuntime({
            ...progressEvent,
            backend: event.backend,
            canvasLoading: event.canvasLoading,
          });
          publishRuntime({
            state: 'active',
            stage: 'pipeline-dispatch',
            taskPercent: 0,
            progressScope: 'task',
            percent: event.percent || 31,
            message: 'Starting compiler',
            backend: event.backend,
            detail: event.detail || workerDetail,
            canvasLoading: event.canvasLoading,
          });
          await waitForLoadingPaint();
          if (pipelineCompiler) {
            try {
              return await pipelineCompiler.compile(prompt, options, onPhaseProgress);
            } catch (error) {
              if (typeof console !== 'undefined' && console.warn) {
                console.warn('[simulatte.pipeline] worker compile fell back to main thread', error);
              }
              publishRuntime({
                state: 'active',
                stage: 'pipeline-dispatch',
                taskPercent: 0,
                progressScope: 'task',
                percent: event.percent || 31,
                message: 'Restarting compiler on main thread',
                backend: event.backend,
                detail: error && error.message ? error.message : String(error || ''),
                canvasLoading: event.canvasLoading,
              });
              await waitForLoadingPaint();
            }
          }
          return createSpecFromPrompt(prompt, { ...options, onPhaseProgress });
        }

        function tick(now) {
          const dt = clamp((now - last) / 1000 || 0.016, 0.001, 0.05);
          last = now;
          if (runtimeProgress.isBusy()) {
            fpsMeter.sample(now, false);
            requestAnimationFrame(tick);
            return;
          }
          const previousSpec = spec;
          spec = readSpecFromUi(spec, controlStack, nameInput);
          if (spec !== previousSpec) {
            renderExecutionInput = null;
            if (previewDisclosure && previewDisclosure.open) syncSpecPreview(specPreview, spec);
          }
          if (!paused && canvas.dataset.auditFreezeFrame !== 'true') {
            const substeps = spec.templateId === 'reaction-diffusion' ? 2 : 3;
            for (let i = 0; i < substeps; i += 1) {
              state = stepSimulation(state, spec, dt / substeps);
            }
          }
          if (simulationVisible && webGpuRenderer) {
            const input = renderExecutionInput || refreshRenderExecutionInput();
            if (input) {
              input.simulationState = state;
              input.canvas = canvas;
              webGpuRenderer.render(input, now);
            }
          }
          fpsMeter.sample(now, simulationVisible && webGpuRenderer);
          syncReadouts(readouts, stateReadout, state, spec);
          requestAnimationFrame(tick);
        }

        setSpec(spec, { visible: false });
        if (!skipInitialBuildForAudit(root)) {
          warmIntentRuntime(buildSerial);
        } else {
          publishRuntime({
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

        function ensureWorker() {
          if (worker) return worker;
          if (failed) throw new Error('Intent worker unavailable');
          const url = new URL('./app/workers/simulatte-intent-worker.js', view.location.href);
          appendBuildVersion(url, view);
          try {
            worker = new view.Worker(url, { name: 'simulatte-intent-worker' });
          } catch (error) {
            failed = true;
            throw error;
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
          return worker;
        }

        function request(type, payload = {}, options = {}) {
          const run = () => {
            try {
              ensureWorker();
            } catch (error) {
              return Promise.reject(error);
            }
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
        const absolute = (value) => versionedLocalUrl(value, view);
        return {
          manifestUrl: absolute('./data/simulatte-embedder/manifest.json'),
          spanLevelEmbedding: cloneWorkerValue(urlParam(view, 'spanLevelEmbedding') || ''),
          traceEmbeddings: intentTraceEnabled(view),
        };
      }

    function cloneIntentWorkerOptions(options = {}) {
        const out = {};
        for (const key of [
          'max',
          'nowIso',
          'spanLevelEmbedding',
          'traceEmbeddings',
          'queryPlan',
          'sceneLanguageGraph',
        ]) {
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

    function unregisterLegacyModelCacheWorker(view) {
        const serviceWorker = view && view.navigator && view.navigator.serviceWorker;
        if (!serviceWorker || typeof serviceWorker.getRegistrations !== 'function') return;
        serviceWorker.getRegistrations()
          .then((registrations) => {
            registrations.forEach((registration) => {
              const scriptUrls = [
                registration.active && registration.active.scriptURL,
                registration.waiting && registration.waiting.scriptURL,
                registration.installing && registration.installing.scriptURL,
              ].filter(Boolean);
              if (scriptUrls.some((url) => /\/simulatte-model-cache-sw\.js(?:[?#].*)?$/.test(String(url)))) {
                registration.unregister().catch(() => {});
              }
            });
          })
          .catch(() => {});
      }

    function intentTraceEnabled(view) {
        return ['embeddingTrace', 'embeddingTiming', 'intentTrace', 'modelTrace']
          .some((name) => truthyParam(urlParam(view, name)));
      }

    function truthyParam(value) {
        return /^(1|true|on|yes|debug|trace)$/i.test(String(value || '').trim());
      }

    function appBuildVersion(view) {
        const doc = view && view.document;
        const meta = doc && doc.querySelector && doc.querySelector('meta[name="simulatte-build"]');
        return meta ? String(meta.getAttribute('content') || '').trim() : '';
      }

    function appendBuildVersion(url, view) {
        const build = appBuildVersion(view);
        if (!build || !url || url.origin !== view.location.origin) return url;
        url.searchParams.set('v', build);
        return url;
      }

    function versionedLocalUrl(value, view) {
        const url = new URL(value, view.location.href);
        appendBuildVersion(url, view);
        return url.toString();
      }

    Object.assign(scope, {
      createBrowserLab,
      skipInitialBuildForAudit,
      createFpsMeter,
      createIntentWorkerClient,
      intentWorkerConfig,
      cloneIntentWorkerOptions,
      cloneWorkerValue,
      urlParam,
      unregisterLegacyModelCacheWorker,
      intentTraceEnabled,
      truthyParam,
      appBuildVersion,
      appendBuildVersion,
      versionedLocalUrl,
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
