(function attachSimulattePromptControllerLab(root) {
  const support = typeof module === 'object' && module.exports
    ? require('./prompt-controller-dependencies.js')
    : root.SimulattePromptControllerSupport;
  const workers = typeof module === 'object' && module.exports
    ? require('./prompt-controller-workers.js')
    : root.SimulattePromptControllerWorkers;
  const training = typeof module === 'object' && module.exports
    ? require('./prompt-controller-training.js')
    : root.SimulattePromptControllerTraining;
  const construction = typeof module === 'object' && module.exports
    ? require('./prompt-controller-construction-search.js')
    : root.SimulatteConstructionSearch;
  const runtime = typeof module === 'object' && module.exports
    ? require('./prompt-controller-runtime.js')
    : root.SimulattePromptControllerRuntime;
  const promptModelSelection = typeof module === 'object' && module.exports
    ? require('./prompt-model-selection.js')
    : root.SimulattePromptModelSelection;
  const runViewModelApi = typeof module === 'object' && module.exports
    ? require('../runtime/run-view-model.js')
    : root.SimulatteRunViewModel;
  if (!support || !workers || !training || !construction || !runtime || !promptModelSelection || !runViewModelApi) {
    throw new Error('SimulattePromptControllerLab requires support, workers, training, construction search, runtime, model selection, and run view model');
  }
  const {
    model, runtimeProgressApi, EXAMPLE_INTENTS, clamp, createRenderExecutionInput,
    createSimulationState, createSpec, createSpecFromPrompt, deserializeSpec,
    normalizeSpec, remixSpec, serializeSpec, stepSimulation,
  } = support;
  const {
    createPipelineCompiler, worldModelReceiptElements, createTrainingRunState,
    beginTrainingRun, syncTrainingRuntime, syncTrainingPreviewArtifacts,
    syncTrainingRankArtifacts, syncTrainingSpecArtifacts, trainingSnapshot,
    waitForLoadingPaint, renderControls, readSpecFromUi, syncShuffleButton,
    pickShuffleExample, readPromptParams, syncComponentStack, syncReadoutLabels,
    syncReadouts, syncSpecPreview,
  } = workers;
  const { createFpsMeter, createIntentWorkerClient, intentWorkerConfig, cloneIntentWorkerOptions, cloneWorkerValue, urlParam, unregisterLegacyModelCacheWorker, intentTraceEnabled, truthyParam, appBuildVersion, appendBuildVersion, versionedLocalUrl } = runtime;
  const { logGraphDebug, syncWorldModelReceipt } = training;
  const {
    createConstructionSearchState, observeConstructionSceneProof,
    syncConstructionSearchDataset, constructionSearchSpec,
  } = construction;

    function createBrowserLab(root = document) {
        const canvas = root.getElementById('physics-canvas');
        if (!canvas) return null;
        let handleSceneProofReport = null;
        const webGpuRenderer = root.defaultView && root.defaultView.SimulatteWebGpuRenderer && canvas
          ? root.defaultView.SimulatteWebGpuRenderer.create(canvas, {
            maxDpr: 1.5,
            onSceneProof: (report) => {
              if (handleSceneProofReport) handleSceneProofReport(report);
            },
          })
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
        const modelSelectionReady = promptModelSelection.create(root);
        const fpsMeter = createFpsMeter(root.getElementById('fps-readout'), canvas);
        const trainingRun = createTrainingRunState();
        const runtimeProgress = runtimeProgressApi.connect(root, {
          loadingCanvas: loadingCanvasController,
          runButton: root.getElementById('build-lab'),
        });
        const runView = runViewModelApi.connect(root, runtimeProgress);
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
        let constructionRetryPending = false;
        let activePromptRuntimeReceipt = null;
        let classificationPolicyPromise = null;
        const pipelineCompiler = createPipelineCompiler(root);

        function ensureClassificationPolicy() {
          if (classificationPolicyPromise) return classificationPolicyPromise;
          const policyEmbedder = createMainThreadEmbedder();
          if (!policyEmbedder || typeof policyEmbedder.loadClassificationPolicy !== 'function') {
            return Promise.reject(new Error('Classification policy loader unavailable'));
          }
          classificationPolicyPromise = policyEmbedder.loadClassificationPolicy().catch((error) => {
            classificationPolicyPromise = null;
            throw error;
          });
          return classificationPolicyPromise;
        }

        handleSceneProofReport = (report) => {
          runView?.recordSceneProof(report);
          if (!report || report.final !== true || !trainingRun.runId || !trainingRun.prompt) return;
          const search = trainingRun.constructionSearch || createConstructionSearchState({ buildSerial });
          trainingRun.constructionSearch = search;
          const decision = observeConstructionSceneProof(report, spec, search);
          syncConstructionSearchDataset(canvas, decision);
          if (decision.action === 'duplicate' || decision.action === 'wait' || decision.action === 'ignore') return;
          if (decision.action === 'accept') {
            publishRuntime({
              state: 'ready',
              blocking: false,
              stage: 'construction-proof',
              percent: 100,
              message: 'Scene obligations proven',
              detail: `${search.attempts.length} construction attempt${search.attempts.length === 1 ? '' : 's'} receipted`,
              canvasLoading: false,
            });
            return;
          }
          if (decision.action !== 'retry' || constructionRetryPending) {
            publishRuntime({
              state: 'ready',
              blocking: false,
              stage: 'construction-proof',
              percent: 100,
              message: 'Scene obligations not proven',
              detail: decision.reason || search.terminalReason || 'construction search stopped',
              canvasLoading: false,
            });
            return;
          }
          constructionRetryPending = true;
          const retrySerial = buildSerial;
          publishRuntime({
            state: 'active',
            blocking: false,
            stage: 'construction-search',
            taskPercent: 0,
            progressScope: 'task',
            percent: 99,
            message: `Trying construction ${decision.nextApproach.attempt + 1}`,
            detail: `rejected ${decision.nextApproach.rejectedGrammarIds.join(', ')}`,
            canvasLoading: false,
          });
          Promise.resolve().then(() => {
            if (retrySerial !== buildSerial || trainingRun.serial !== retrySerial) return;
            const nextSpec = constructionSearchSpec(spec, decision.nextApproach);
            setSpec(nextSpec, { visible: true });
            publishRuntime({
              state: 'ready',
              blocking: false,
              stage: 'construction-search',
              percent: 100,
              message: 'Construction candidate rendered',
              detail: `attempt ${decision.nextApproach.attempt + 1} awaiting screenshot proof`,
              canvasLoading: false,
            });
          }).catch((error) => {
            search.status = 'failed';
            search.terminalReason = error && error.message ? error.message : String(error || 'construction retry failed');
            syncConstructionSearchDataset(canvas, {
              ...decision,
              action: 'error',
              reason: search.terminalReason,
            });
            publishRuntime({
              state: 'error',
              blocking: false,
              stage: 'construction-search',
              percent: 100,
              message: 'Construction search failed',
              detail: search.terminalReason,
              canvasLoading: false,
            });
          }).finally(() => {
            constructionRetryPending = false;
          });
        };

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
          runView?.recordSpec(spec);
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

        const buildFromPrompt = async (paramsOverride = null) => {
          const prompt = promptInput ? promptInput.value : '';
          const params = paramsOverride || readPromptParams(promptInput, {});
          const serial = buildSerial + 1;
          buildSerial = serial;
          constructionRetryPending = false;
          if (!String(prompt || '').trim()) {
            beginTrainingRun(trainingRun, prompt, params, serial);
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
          let modelSelection;
          try {
            modelSelection = await modelSelectionReady;
          } catch (error) {
            reportIntentFailure(serial, error.message);
            return;
          }
          if (await modelSelection.ensureConsent() !== true) {
            reportIntentFailure(serial, 'Selected model requires local model consent');
            return;
          }
          beginTrainingRun(trainingRun, prompt, params, serial);
          const retrievalRef = modelSelection.selectedRuntimeRef('open-vocabulary-retrieval');
          if (retrievalRef.kind === 'embedding') {
            publishRuntime({
              state: 'active',
              stage: 'manifest',
              percent: 1,
              message: 'Loading embeddings',
              canvasLoading: true,
            });
            resolveWithEmbedding(prompt, params, serial, true, modelSelection);
          } else {
            resolveDeterministically(prompt, params, serial, true, modelSelection);
          }
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

        async function resolveWithEmbedding(prompt, params, serial, showCanvasLoader = false, modelSelection) {
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
                boundedClassification: result.boundedClassification || null,
                classificationTierId: selectedClassificationTierId(modelSelection),
                modelSelection: modelSelection.receipt(),
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
              classificationTierId: selectedClassificationTierId(modelSelection),
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

        async function resolveDeterministically(prompt, params, serial, showCanvasLoader = false, modelSelection) {
          if (!String(prompt || '').trim()) return;
          if (stateReadout) stateReadout.textContent = 'compiling intent';
          publishRuntime({
            state: 'active',
            stage: 'deterministic-start',
            percent: 4,
            message: 'Reading language',
            backend: 'deterministic-local',
            canvasLoading: showCanvasLoader,
          });
          try {
            await waitForLoadingPaint();
            if (serial !== buildSerial) return;
            const token = compileSerial + 1;
            compileSerial = token;
            const classification = await ensureClassificationPolicy();
            if (serial !== buildSerial || token !== compileSerial) return;
            const nextSpec = await compilePromptSpec(prompt, {
              params,
              deterministicRuntime: true,
              retrievalPhase: 'deterministic-local',
              classificationTierPolicy: classification.policy,
              classificationCalibration: classification.calibration,
              classificationTierId: selectedClassificationTierId(modelSelection),
              modelSelection: modelSelection.receipt(),
            }, {
              stage: 'language',
              percent: 18,
              message: 'Parsing language',
              backend: 'deterministic-local',
              canvasLoading: showCanvasLoader,
            });
            if (serial !== buildSerial || token !== compileSerial) return;
            setSpec(nextSpec, { visible: true });
            publishRuntime({
              state: 'ready',
              stage: 'ready',
              percent: 100,
              message: 'Deterministic ready',
              detail: 'Lexical retrieval and typed rules',
              backend: 'deterministic-local',
              modelId: 'simulatte-deterministic-language-runtime-v1',
              providerReady: false,
              noFallback: true,
              canvasLoading: false,
            });
          } catch (error) {
            if (serial !== buildSerial) return;
            const diagnostic = error && error.message ? error.message : String(error || 'deterministic compiler failed');
            console.error('[simulatte.intent] deterministic intent failed', error);
            publishRuntime({
              state: 'error',
              stage: 'error',
              percent: 0,
              message: 'Deterministic compiler failed',
              detail: diagnostic,
              backend: 'deterministic-local',
              canvasLoading: false,
            });
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

        function selectedClassificationTierId(modelSelection) {
          return promptModelSelection.classificationTierId(modelSelection);
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
        root.getElementById('model-selection-controls')?.addEventListener('model-selection-change', () => {
          if (runtimeProgress.isBusy()) return;
          publishRuntime({
            state: 'ready',
            stage: 'model-selection-ready',
            percent: 100,
            message: 'Model selection ready',
            detail: 'Selection applies to the next run',
            canvasLoading: false,
          });
        });
        modelSelectionReady.then((selection) => {
          const neural = selection.selectedRuntimeRef('open-vocabulary-retrieval').kind === 'embedding';
          publishRuntime({
            state: 'ready',
            stage: neural ? 'model-ready' : 'deterministic-ready',
            percent: 100,
            message: 'Ready',
            detail: neural ? 'Qwen retrieval selected for the next run' : 'Lexical retrieval and typed rules',
            canvasLoading: false,
          });
        }).catch((error) => reportIntentFailure(buildSerial, error.message));
        requestAnimationFrame(tick);
        return {
          getSpec: () => spec,
          getState: () => state,
          getTrainingSnapshot: () => trainingSnapshot(trainingRun, spec, state, canvas),
          setSpec,
        };
      }

    const api = Object.freeze({
      createBrowserLab,
    });

  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulattePromptControllerLab = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
