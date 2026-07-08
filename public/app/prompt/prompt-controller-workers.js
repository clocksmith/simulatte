(function attachSimulattePhysicsRendererworkers(root) {
  const scope = root.__SimulattePhysicsRendererRefactorScope;
  if (!scope || scope.missingDependency) return;
  with (scope) {
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
          appendBuildVersion(url, view);
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
          loaderReceipt: compactObject(runtime.loaderReceipt || null, 32),
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

    Object.assign(scope, {
      createPipelineCompiler,
      worldModelReceiptElements,
      createTrainingRunState,
      beginTrainingRun,
      syncTrainingRuntime,
      syncTrainingPreviewArtifacts,
      syncTrainingRankArtifacts,
      syncTrainingSpecArtifacts,
      trainingSnapshot,
      storeTrainingArtifact,
      phaseOutput,
      artifactSummary,
      compactObject,
      numericMetric,
      compactCountObject,
      rowCount,
      idRows,
      typeRows,
      graphicsAtomCounts,
      visualAcceptanceCounts,
      visualIRRowCounts,
      visualRenderInstanceCounts,
      visualRejectedRows,
      uniqueStrings,
      semanticRenderCoverage,
      isPromptGroundedObject,
      renderCoverageTokens,
      waitForLoadingPaint,
      renderControls,
      readSpecFromUi,
      sameParamValues,
      syncTemplateButtons,
      syncShuffleButton,
      pickShuffleExample,
      readPromptParams,
      parseParamJson,
      syncComponentStack,
      syncReadoutLabels,
      syncReadouts,
      syncSpecPreview,
      syncWorldModelReceipt,
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
