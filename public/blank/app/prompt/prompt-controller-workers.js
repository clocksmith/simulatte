(function attachSimulattePromptControllerWorkers(root) {
  const support = typeof module === 'object' && module.exports
    ? require('./prompt-controller-dependencies.js')
    : root.SimulattePromptControllerSupport;
  const construction = typeof module === 'object' && module.exports
    ? require('./prompt-controller-construction-search.js')
    : root.SimulatteConstructionSearch;
  const runtime = typeof module === 'object' && module.exports
    ? require('./prompt-controller-runtime.js')
    : root.SimulattePromptControllerRuntime;
  if (!support || !construction || !runtime) {
    throw new Error('SimulattePromptControllerWorkers requires controller support, construction search, and runtime URL helpers');
  }
  const {
    model,
    EXAMPLE_INTENTS,
    controlsForSpec,
    readoutLabelsForSpec,
    readoutValues,
    recordWorldSpecEdit,
    stateLabel,
    worldModelSnapshot,
  } = support;
  const { createConstructionSearchState } = construction;
  const phaseContracts = typeof module === 'object' && module.exports
    ? require('../../pipeline/simulatte-phase-contracts.js') : root.SimulattePhaseContracts;
  const phases = phaseContracts.phases;
  const { appendBuildVersion } = runtime;

    function createPipelineCompiler(root) {
        const view = root && root.defaultView;
        if (!view || typeof view.Worker !== 'function') return null;
        let worker = null;
        let failed = false;
        let nextId = 0;
        const pending = new Map();

        function rejectAll(error) {
          failed = true;
          if (worker) worker.terminate();
          worker = null;
          pending.forEach((entry) => entry.reject(error));
          pending.clear();
        }

        function pipelineWorkerError(message, code) {
          const error = new Error(message);
          error.code = code;
          return error;
        }

        function ensureWorker() {
          if (worker) return worker;
          if (failed) throw pipelineWorkerError('Pipeline worker unavailable', 'SIMULATTE_PIPELINE_WORKER_UNAVAILABLE');
          const baseUrl = (view.document && view.document.baseURI) || view.location.href;
          const url = new URL('./app/workers/simulatte-pipeline-worker.js', baseUrl);
          appendBuildVersion(url, view);
          try {
            worker = new view.Worker(url);
          } catch (error) {
            failed = true;
            throw pipelineWorkerError(error && error.message || 'Pipeline worker unavailable', 'SIMULATTE_PIPELINE_WORKER_UNAVAILABLE');
          }
          const activeWorker = worker;
          worker.addEventListener('message', (event) => {
            if (worker !== activeWorker) return;
            const data = event && event.data || {};
            const entry = pending.get(data.id);
            if (!entry) return;
            if (data.type === 'simulatte:pipeline-worker:progress') {
              if (entry.onProgress) entry.onProgress(data.event || {});
              return;
            }
            if (data.type !== 'simulatte:pipeline-worker:result') return;
            pending.delete(data.id);
            if (data.ok) {
              entry.resolve(entry.resultKey === 'output' ? data.output : data.spec);
            } else {
              entry.reject(pipelineWorkerError(data.error || 'Pipeline worker compile failed', 'SIMULATTE_PIPELINE_COMPILE_FAILED'));
            }
          });
          worker.addEventListener('error', (event) => {
            if (worker !== activeWorker) return;
            rejectAll(pipelineWorkerError(event.message || 'Pipeline worker failed', 'SIMULATTE_PIPELINE_WORKER_UNAVAILABLE'));
          });
          worker.addEventListener('messageerror', () => {
            if (worker !== activeWorker) return;
            rejectAll(pipelineWorkerError('Pipeline worker message clone failed', 'SIMULATTE_PIPELINE_WORKER_UNAVAILABLE'));
          });
          return worker;
        }

        function cancel(message = 'Pipeline worker request superseded') {
            if (!worker && !pending.size) return;
            const error = pipelineWorkerError(message, 'SIMULATTE_PIPELINE_ABORTED');
            error.name = 'AbortError';
            pending.forEach((entry) => entry.reject(error));
            pending.clear();
            if (worker) worker.terminate();
            worker = null;
          }

        function request(type, payload, resultKey, onProgress = null, signal = null) {
            if (signal?.aborted) return Promise.reject(Object.assign(new Error('Pipeline phase cancelled'), {
              name: 'AbortError', code: 'SIMULATTE_PIPELINE_ABORTED' }));
            try {
              ensureWorker();
            } catch (error) {
              return Promise.reject(error);
            }
            const id = nextId + 1;
            nextId = id;
            return new Promise((resolve, reject) => {
              const abort = () => cancel('Pipeline phase cancelled');
              const finish = callback => value => {
                signal?.removeEventListener('abort', abort);
                callback(value);
              };
              pending.set(id, {
                resolve: finish(resolve),
                reject: finish(reject),
                resultKey,
                onProgress: typeof onProgress === 'function' ? onProgress : null,
              });
              signal?.addEventListener('abort', abort, { once: true });
              try {
                worker.postMessage({
                  type,
                  id,
                  ...payload,
                });
              } catch (error) {
                const entry = pending.get(id);
                pending.delete(id);
                entry.reject(pipelineWorkerError(error && error.message || 'Pipeline worker request could not be sent', 'SIMULATTE_PIPELINE_WORKER_UNAVAILABLE'));
              }
            });
          }

        return {
          cancel,
          compile(prompt, options, onProgress = null) {
            return request('simulatte:pipeline-worker:compile', { prompt, options }, 'spec', onProgress);
          },
          runPhase(phase, call, resources = {}, { signal, onProgress, sourceMode = 'prompt' } = {}) {
            try {
              if (!Number.isInteger(phase) || phase < 1 || phase > 8 || phase === 7) {
                throw new Error('Pipeline worker supports phases 1–6 and 8; Phase 7 requires the graphics owner');
              }
              if (!['prompt', 'authored'].includes(sourceMode)) throw new Error('Unsupported phase source mode');
              const payload = phaseContracts.immutableArtifact({ phase, call, resources, sourceMode });
              return request('simulatte:pipeline-worker:phase', payload, 'output', onProgress, signal);
            } catch (error) {
              return Promise.reject(error);
            }
          },
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
          constructionSearch: createConstructionSearchState(),
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
        run.specHash = '';
        run.sceneProofReport = null;
        run.retrievalPreview = null;
        run.constructionSearch = createConstructionSearchState({ buildSerial: serial });

      }

    function syncTrainingRuntime(run, runtime, event = {}) {
        if (!run || !runtime) return;
        run.phase = {
          step: runtime.phase && runtime.phase.step || 0,
          id: runtime.phase && runtime.phase.id || '',
          label: runtime.phase && runtime.phase.label || '',
          stage: runtime.stage || '',
          state: runtime.state || '',
          percent: Number(runtime.progress || 0),
          overallPercent: Number(runtime.overallProgress || 0),
          progressBasis: runtime.progressBasis || '',
          taskKey: runtime.taskKey || '',
          taskElapsedMs: numericMetric(runtime.taskElapsedMs),
          taskRemainingMs: numericMetric(runtime.taskRemainingMs),
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
          loaderReceipt: compactObject(runtime.loaderReceipt || null, 32),
        };

      }

    function syncTrainingPreviewArtifacts(run, preview = {}) {
        if (run) run.retrievalPreview = compactObject(preview, 16);
      }

    function syncTrainingRankArtifacts(run, result = {}) {
        if (run) run.retrievalPreview = compactObject(result, 24);
      }

    function syncTrainingSpecArtifacts(run, spec = {}) {
        if (!run) return;
        if (run.specHash !== spec.contentHash) {
          run.specHash = spec.contentHash;
          run.sceneProofReport = null;
          run.artifacts = {};
        }
        const envelopes = { ...(spec.phaseArtifacts || {}) };
        const report = run.sceneProofReport;
        const binding = report?.phase7Output?.artifact?.renderExecution?.worldProofBinding;
        if (binding?.worldSpec?.contentHash === spec.contentHash) {
          envelopes.phase7 = report.phase7Output;
          envelopes.phase8 = report.phase8Output;
        }
        for (const phase of phases) {
          const output = envelopes[`phase${phase.phase}`];
          if (!output) continue;
          if (run.artifacts[`1->${phase.phase}`]?.output === output) continue;
          storeTrainingArtifact(run, phase.phase, phase.id, phase.label, {
            input: phase.phase === 1 ? null : envelopes[`phase${phase.phase - 1}`] || null,
            output,
          });
        }
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
          constructionSearch: compactObject(run.constructionSearch || createConstructionSearchState(), 64),
          artifacts: structuredClone(run.artifacts),
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
          input: pair.input || null,
          inputCapture: pair.input ? 'previous-phase-envelope' : 'not-retained',
          output: pair.output || null,
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
        return recordWorldSpecEdit(spec, {
          ...spec,
          name,
          params,
        }, { rationale: 'Adjusted WorldSpec controls in Create' });
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
            intentBrief: compactObject(spec.intent.intentBrief || null, 16),
          } : null,
          intentReceipt: spec.physicalSpec && spec.physicalSpec.receipt
            ? compactObject(spec.physicalSpec.receipt.intentBrief || null, 16)
            : null,
          semanticRetrievalReceipt: spec.universeGraph
            ? compactObject(spec.universeGraph.intentBrief || null, 16)
            : null,
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
          validationReceipt: compactObject(spec.validationReceipt || null, 20),
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
            rendererPlan: renderProgramPreviewPlan(spec.renderProgram.rendererPlan),
            visualIR: renderProgramPreviewVisualIR(spec.renderProgram.visualIR),
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
            receipt: compactObject(spec.physicalSpec.receipt, 20),
          } : null,
          params: Object.fromEntries(Object.entries(spec.params).slice(0, 8)),
          remixOf: spec.remixOf || null,
        }, null, 2);
      }

    function renderProgramPreviewPlan(plan = null) {
        if (!plan) return null;
        const genome = plan.visualGenome || {};
        return {
          schema: plan.schema || '',
          renderer: plan.renderer || '',
          sceneKind: plan.sceneKind || '',
          dominantRegime: plan.dominantRegime || '',
          passOrder: (plan.passOrder || []).slice(0, 12),
          visualIdentity: compactObject(plan.visualIdentity || {}, 16),
          visualGenome: {
            id: genome.id || '',
            sceneKind: genome.sceneKind || '',
            visualDialect: genome.visualDialect || '',
            compositionTopology: genome.compositionTopology || '',
            cameraArchetype: genome.cameraArchetype || '',
            scaleTier: genome.scaleTier || '',
            motifs: (genome.motifs || []).slice(0, 12),
            evidence: compactObject(genome.evidence || {}, 12),
          },
        };
      }

    function renderProgramPreviewVisualIR(visualIR = null) {
        if (!visualIR) return null;
        const packet = visualIR.sceneRenderPacket || {};
        return {
          schema: visualIR.schema || '',
          sceneKind: visualIR.sceneKind || '',
          scale: visualIR.scale || '',
          camera: compactObject(visualIR.camera || {}, 12),
          lighting: compactObject(visualIR.lighting || {}, 12),
          entities: rowCount(visualIR.entities),
          materials: rowCount(visualIR.materials),
          fields: rowCount(visualIR.fields),
          processes: rowCount(visualIR.processes),
          geometry: rowCount(visualIR.geometry),
          motion: rowCount(visualIR.motion),
          renderInstances: rowCount(visualIR.renderInstances),
          packet: {
            schema: packet.schema || '',
            topology: packet.compositionTopology || '',
            cameraArchetype: packet.camera && packet.camera.archetype || '',
            scaleTier: packet.camera && packet.camera.scaleTier || '',
            entities: rowCount(packet.entities),
            fields: rowCount(packet.fields),
            effects: rowCount(packet.effects),
          },
        };
      }

    const api = Object.freeze({
      createPipelineCompiler,
      worldModelReceiptElements,
      createTrainingRunState,
      beginTrainingRun,
      syncTrainingRuntime,
      syncTrainingPreviewArtifacts,
      syncTrainingRankArtifacts,
      syncTrainingSpecArtifacts,
      trainingSnapshot,
      waitForLoadingPaint,
      renderControls,
      readSpecFromUi,
      syncShuffleButton,
      pickShuffleExample,
      readPromptParams,
      syncComponentStack,
      syncReadoutLabels,
      syncReadouts,
      syncSpecPreview,
    });

  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulattePromptControllerWorkers = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
