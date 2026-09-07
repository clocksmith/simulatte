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
  const phaseDispatchApi = typeof module === 'object' && module.exports
    ? require('./prompt-controller-phase-dispatch.js') : root.SimulatteCreatePhaseDispatch;
  const promptModelSelection = typeof module === 'object' && module.exports
    ? require('./prompt-model-selection.js')
    : root.SimulattePromptModelSelection;
  const runViewModelApi = typeof module === 'object' && module.exports
    ? require('../runtime/run-view-model.js')
    : root.SimulatteRunViewModel;
  const worldSpecEditorApi = typeof module === 'object' && module.exports
    ? require('./world-spec-editor.js')
    : root.SimulatteWorldSpecEditor;
  const reconciliationControllerApi = typeof module === 'object' && module.exports
    ? require('./world-spec-reconciliation-controller.js')
    : root.SimulatteWorldSpecReconciliationController;
  const compilerProofApi = typeof module === 'object' && module.exports
    ? require('./prompt-controller-compiler-proof.js')
    : root.SimulattePromptCompilerProof;
  const proofSessionApi = typeof module === 'object' && module.exports
    ? require('./prompt-proof-session.js') : root.SimulattePromptProofSession;
  const worldImprovementSessionApi = typeof module === 'object' && module.exports
    ? require('./world-improvement-session.js')
    : root.SimulatteWorldImprovementSession;
  if (!phaseDispatchApi || !proofSessionApi || !support || !workers || !training || !construction || !runtime || !promptModelSelection || !runViewModelApi || !worldSpecEditorApi || !reconciliationControllerApi || !compilerProofApi || !worldImprovementSessionApi) {
    throw new Error('SimulattePromptControllerLab requires support, workers, training, construction search, runtime, model selection, run view model, WorldSpec editing and reconciliation, compiler proof, and improvement records');
  }
  const {
    model, runtimeProgressApi, EXAMPLE_INTENTS, applyInteractionCommands, clamp, createRenderExecutionInput,
    createSimulationState, createIntentProofReceiptForSpec, createSemanticProofReceiptForSpec,
    createSimulationReproducibilityReceiptForSpec,
    createSafetyProofReceiptForSpec,
    createSpec, createSpecFromPrompt, deserializeSpec,
    applyWorldSpecEdit, normalizeSpec, remixSpec, serializeSpec,
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
  const { createConstructionSearchState } = construction;
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
        const controlStack = root.getElementById('control-stack');
        const nameInput = root.getElementById('simulation-name');
        const promptInput = root.getElementById('build-prompt');
        const specPreview = root.getElementById('spec-preview');
        const replayWorldSpecButton = root.getElementById('replay-world-spec');
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
        let playbackClock = model.createSimulationPlaybackClock(spec);
        let renderExecutionInput = null;
        let last = performance.now();
        let paused = false;
        let buildSerial = 0;
        let compileSerial = 0;
        const pendingInteractionCommands = [];
        let activePromptRuntimeReceipt = null;
        let classificationPolicyPromise = null;
        let worldSpecEditor = null;
        let worldSpecReconciliation = null;
        let intentProofReceipt = null;
        let semanticProofReceipt = null;
        let simulationReproducibilityReceipt = null;
        let safetyProofReceipt = null;
        const worldImprovementSession = worldImprovementSessionApi.create();
        const pipelineCompiler = createPipelineCompiler(root);
        const phaseCompiler = phaseDispatchApi.create({ model, worker: pipelineCompiler, renderer: webGpuRenderer,
          configuration: phaseDispatchApi.loadConfiguration(root), publishRuntime,
          requiresReconciliation: () => reconciliationControllerApi.needsReconciliation(spec),
          reconcileProgram: async (candidate, signal, authoredSource) => {
            const abort = () => worldSpecReconciliation.abort('superseded');
            signal.addEventListener('abort', abort, { once: true });
            try {
              const result = await worldSpecReconciliation.resolve(authoredSource || spec, candidate);
              return result?.worldSpec || null;
            } finally { signal.removeEventListener('abort', abort); }
          },
          invocationForProgram: async (program, previous, signal, authored, replay) => {
            await webGpuRenderer.session.ready;
            if (signal.aborted) throw signal.reason;
            setSimulationCanvasVisible(true);
            await webGpuRenderer.session.resize();
            if (signal.aborted) throw signal.reason;
            const initialState = replay ? await model.replaySimulationState(program, replay, signal)
              : model.stepSimulation(createSimulationState(program), program, program.source.compilerConfig.simulationProof.stepSeconds);
            const proofOptions = { buildId: appBuildVersion(root.defaultView), runtimeId: 'simulatte.blank.browser.webgpu.v1' };
            return model.createRenderInvocation(program, initialState, { index: replay ? replay.totalSteps : 1, simulationTime: initialState.t },
              { width: canvas.width, height: canvas.height }, { ...proofOptions,
                replayBaseline: replay?.baseline || null,
                compilerDeterminismReceipt: compilerProof.receiptFor(program),
                intentReceipt: createIntentProofReceiptForSpec(program, proofOptions),
                semanticReceipt: createSemanticProofReceiptForSpec(program, proofOptions),
                simulationReproducibilityReceipt: createSimulationReproducibilityReceiptForSpec(program, proofOptions),
                safetyReceipt: createSafetyProofReceiptForSpec(program, proofOptions),
                ...(authored ? { phase6Output: previous } : {}),
              });
          },
        });
        const compilePromptSpec = runtime.createCompilerDispatch({
          pipelineCompiler, publishRuntime, waitForLoadingPaint, createSpecFromPrompt, phaseExecutor: phaseCompiler,
        });
        const compilerProof = compilerProofApi.create(root, {
          createPipelineCompiler,
          createSpecFromPrompt,
        });
        const worldInteractionApi = root.defaultView && root.defaultView.SimulatteWorldInteractionRuntime;
        const worldInteraction = worldInteractionApi && typeof worldInteractionApi.connect === 'function'
          ? worldInteractionApi.connect(canvas, {
            renderer: webGpuRenderer,
            getProgram: () => {
              const visualCompile = spec && spec.phaseArtifacts && spec.phaseArtifacts.phase6 &&
                spec.phaseArtifacts.phase6.artifact &&
                spec.phaseArtifacts.phase6.artifact.visualCompile;
              return visualCompile && visualCompile.interactionProgram ||
                visualCompile && visualCompile.sceneRenderPacket &&
                visualCompile.sceneRenderPacket.interactionProgram ||
                null;
            },
            enqueueCommand: (command) => {
              pendingInteractionCommands.push(command);
              if (pendingInteractionCommands.length > 128) pendingInteractionCommands.shift();
            },
          })
          : null;

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

        const proofSession = proofSessionApi.create({
          root, canvas, compilerProof, worldImprovementSession, trainingRun, runView,
          getSpec: () => spec, getBuildSerial: () => buildSerial,
          getSimulationReceipt: () => simulationReproducibilityReceipt,
          onImprovement: (record) => worldSpecEditor?.syncImprovement(record),
          retryConstruction: async (source, decision, report, signal) => {
            if (signal.aborted) throw signal.reason;
            const abort = () => phaseCompiler.cancel('Construction retry superseded');
            signal.addEventListener('abort', abort, { once: true });
            try {
              const program = await phaseCompiler.retryConstruction(source, decision, report);
              return { program, phaseRun: phaseCompiler.getLatest() };
            } finally { signal.removeEventListener('abort', abort); }
          },
          setSpec: (next, options) => setSpec(next, options),
          publishRuntime,
          refreshRender() {
            renderExecutionInput = null;
            const input = refreshRenderExecutionInput();
            if (input && webGpuRenderer?.session.status().state === 'ready') webGpuRenderer.session.setScene(input);
          },
        });
        handleSceneProofReport = proofSession.observe;

        const refreshRenderExecutionInput = () => {
          const phase6Output = spec && spec.phaseArtifacts && spec.phaseArtifacts.phase6 || null;
          if (!phase6Output) {
            renderExecutionInput = null;
            return null;
          }
          renderExecutionInput = createRenderExecutionInput(spec, state, canvas, {
            buildId: appBuildVersion(root.defaultView),
            runtimeId: 'simulatte.blank.browser.webgpu.v1',
            replayBaseline: proofSession.pendingBaseline(),
            intentReceipt: intentProofReceipt,
            semanticReceipt: semanticProofReceipt,
            compilerDeterminismReceipt: compilerProof.receiptFor(spec),
            simulationReproducibilityReceipt,
            safetyReceipt: safetyProofReceipt,
          });
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
          const nextProgram = normalizeSpec(nextSpec);
          const managedFrame = options.phaseRun?.worldSpecContentHash === nextProgram.contentHash
            ? options.phaseRun.attempts.at(-1)?.outputs[6]?.artifact?.renderExecution : null;
          const proofOptions = {
            buildId: appBuildVersion(root.defaultView),
            runtimeId: 'simulatte.blank.browser.webgpu.v1',
          };
          const receiptForSpec = (key, create) => {
            if (!managedFrame) return create(nextProgram, proofOptions);
            const receipt = managedFrame[key];
            if (key === 'safetyReceipt' && nextProgram.safety.status === 'not-declared' && receipt === null) return null;
            if (receipt?.worldSpecContentHash !== nextProgram.contentHash || receipt.worldSpecRevision !== nextProgram.authorship.revision) {
              throw new Error(`Managed ${key} does not bind the published WorldSpec`);
            }
            return receipt;
          };
          const preparedProofs = {
            intent: receiptForSpec('intentReceipt', createIntentProofReceiptForSpec),
            semantic: receiptForSpec('semanticReceipt', createSemanticProofReceiptForSpec),
            simulation: receiptForSpec('simulationReproducibilityReceipt', createSimulationReproducibilityReceiptForSpec),
            safety: receiptForSpec('safetyReceipt', createSafetyProofReceiptForSpec),
          };
          spec = nextProgram;
          worldImprovementSession.observeSpec(spec);
          proofSession.invalidate({ replayBaseline: managedFrame?.replayBaseline || null,
            preserveCompilerProof: Boolean(managedFrame?.replayBaseline) });
          pendingInteractionCommands.length = 0;
          worldInteraction?.reset();
          runView?.recordSpec(spec);
          state = createSimulationState(spec);
          if (managedFrame) {
            const captured = managedFrame.frameInvocation?.simulationSnapshot?.state;
            if (captured) state = JSON.parse(JSON.stringify(captured));
          }
          playbackClock = model.createSimulationPlaybackClock(spec);
          intentProofReceipt = preparedProofs.intent;
          semanticProofReceipt = preparedProofs.semantic;
          simulationReproducibilityReceipt = preparedProofs.simulation;
          safetyProofReceipt = preparedProofs.safety;
          renderExecutionInput = null;
          if (nameInput) nameInput.value = spec.name;
          renderControls(controlStack, spec);
          syncComponentStack(componentStack, spec);
          syncShuffleButton(shuffleButton, spec);
          syncReadoutLabels(readouts, spec);
          syncWorldModelReceipt(worldModelReceipt, spec);
          syncSpecPreview(specPreview, spec);
          worldSpecEditor?.sync(spec, { signal: options.editorSignal });
          logGraphDebug(spec);
          if (visible && webGpuRenderer) {
            const nextRenderExecutionInput = refreshRenderExecutionInput();
            if (nextRenderExecutionInput && webGpuRenderer.session.status().state === 'ready') webGpuRenderer.session.setScene(nextRenderExecutionInput);
          }
          if (visible) {
            setSimulationCanvasVisible(true);
            syncTrainingSpecArtifacts(trainingRun, spec, state, canvas);
          }
          last = performance.now();
        };

        replayWorldSpecButton?.addEventListener('click', async () => {
          if (!webGpuRenderer || !proofSession.beginReplay()) return;
          const replayBaseline = proofSession.pendingBaseline();
          const replayState = state;
          const serial = ++buildSerial;
          worldSpecEditor?.cancel();
          worldSpecReconciliation.abort('replay started');
          proofSession.invalidate({ preserveCompilerProof: true });
          replayWorldSpecButton.disabled = true;
          publishRuntime({ state: 'active', blocking: false, stage: 'replay', taskPercent: 0,
            progressScope: 'task', percent: 99, message: 'Replaying exact WorldSpec',
            detail: spec.contentHash, canvasLoading: false });
          try {
            const program = await phaseCompiler.executeProgram(spec, { replayState, replayBaseline });
            if (serial !== buildSerial) return;
            setSpec(program, { visible: true, phaseRun: phaseCompiler.getLatest() });
          } catch (error) {
            if (serial !== buildSerial || error.name === 'AbortError') return;
            publishRuntime({ state: 'error', blocking: false, stage: 'replay', percent: 100,
              message: 'Exact replay failed', detail: error.message, canvasLoading: false });
          }
        });

        worldSpecReconciliation = reconciliationControllerApi.connect(root, {
          publishRuntime,
        });

        async function executeEditorProgram(payload, rationale, signal, recompile) {
          const serial = ++buildSerial;
          worldSpecReconciliation.abort('superseded by authored input');
          const cancel = () => phaseCompiler.cancel('WorldSpec operation superseded');
          signal.addEventListener('abort', cancel, { once: true });
          try {
            if (signal.aborted) throw signal.reason;
            const authored = recompile ? model.recordWorldSpecEdit(spec, payload, { rationale }) : deserializeSpec(payload);
            const next = await phaseCompiler.executeProgram(authored, { recompile });
            if (signal.aborted || serial !== buildSerial) throw signal.reason || Object.assign(new Error('WorldSpec operation superseded'), { name: 'AbortError' });
            setSpec(next, { visible: true, phaseRun: phaseCompiler.getLatest(), editorSignal: signal });
            return next;
          } finally { signal.removeEventListener('abort', cancel); }
        }

        worldSpecEditor = worldSpecEditorApi.connect(root, {
          getSpec: () => spec,
          getImprovementRecord: () => worldImprovementSession.getCurrentRecord(),
          serialize: serializeSpec,
          serializeExport: (accepted) => serializeSpec(accepted, { retainPhaseSources: true }),
          serializeImprovementRecord: worldImprovementSessionApi.serializeRecord,
          apply: (payload, rationale, signal) => executeEditorProgram(payload, rationale, signal, true),
          import: (payload, rationale, signal) => executeEditorProgram(payload, rationale, signal, false),
          onError: () => { if (stateReadout) stateReadout.textContent = 'WorldSpec edit failed'; },
        });

        async function reconcileCompiledSpec(nextSpec, serial, token = null) {
          const result = await worldSpecReconciliation.resolve(spec, nextSpec);
          if (serial !== buildSerial || (token !== null && token !== compileSerial)) return null;
          return result && result.worldSpec || null;
        }

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
          worldSpecReconciliation.abort('superseded');
          if (embedder && typeof embedder.cancel === 'function') embedder.cancel();
          if (pipelineCompiler && typeof pipelineCompiler.cancel === 'function') pipelineCompiler.cancel();
          phaseCompiler.cancel();
          worldSpecEditor.cancel();
          proofSession.invalidate();
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
            const nextSpec = await reconcileCompiledSpec(createSpec('blank-world', { params }), serial);
            if (!nextSpec) return;
            setSpec(nextSpec, { visible: false });
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
                retrievalSourcePromptHash: result.sourcePromptHash,
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
              worldSpecReconciliation.bindExecution(nextSpec);
              setSpec(nextSpec, { visible: true, phaseRun: phaseCompiler.getLatest() });
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
            worldSpecReconciliation.bindExecution(nextSpec);
            setSpec(nextSpec, { visible: true, phaseRun: phaseCompiler.getLatest() });
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

        function tick(now) {
          if (webGpuRenderer?.disposed) return;
          const dt = Math.max(0, (now - last) / 1000);
          last = now;
          if (runtimeProgress.isBusy()) {
            fpsMeter.sample(now, false);
            requestAnimationFrame(tick);
            return;
          }
          const previousSpec = spec;
          spec = readSpecFromUi(spec, controlStack, nameInput);
          if (spec !== previousSpec) {
            playbackClock = model.createSimulationPlaybackClock(spec);
            renderExecutionInput = null;
            worldSpecEditor?.sync(spec);
            if (previewDisclosure && previewDisclosure.open) syncSpecPreview(specPreview, spec);
          }
          if (pendingInteractionCommands.length && typeof applyInteractionCommands === 'function') {
            const commands = pendingInteractionCommands.splice(0, pendingInteractionCommands.length);
            state = applyInteractionCommands(state, spec.interactionIR, commands);
          }
          if (!paused && canvas.dataset.auditFreezeFrame !== 'true') {
            state = playbackClock.advance(state, spec, dt);
          }
          if (simulationVisible && webGpuRenderer) {
            const input = renderExecutionInput || refreshRenderExecutionInput();
            if (input) {
              input.simulationState = state;
              input.canvas = canvas;
              if (webGpuRenderer.session.status().state === 'ready') webGpuRenderer.session.render({ scene: input, timeMs: now });
            }
          }
          fpsMeter.sample(now, simulationVisible && webGpuRenderer);
          syncReadouts(readouts, stateReadout, state, spec);
          requestAnimationFrame(tick);
        }

        setSpec(spec, { visible: false });
        root.defaultView?.addEventListener('pagehide', () => {
          phaseCompiler.dispose();
          worldSpecEditor.cancel();
          pipelineCompiler?.cancel();
          worldSpecReconciliation.abort('page closed');
          webGpuRenderer?.session.dispose();
        }, { once: true });
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
          getPipelineRun: phaseCompiler.getLatest,
          getState: () => state,
          getTrainingSnapshot: () => ({
            ...trainingSnapshot(trainingRun, spec, state, canvas),
            improvementRecord: worldImprovementSession.getCurrentRecord(),
          }),
          getImprovementRecord: () => worldImprovementSession.getCurrentRecord(),
          getImprovementRecords: () => worldImprovementSession.getRecords(),
          getImprovementDiagnostics: () => ({
            session: worldImprovementSession.getDiagnostics(),
            ...proofSession.diagnostics(),
          }),
          setSpec,
        };
      }

    const api = Object.freeze({
      createBrowserLab,
    });

  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulattePromptControllerLab = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
