(function attachSimulatteReviewBridgepanel(root) {
  const scope = root.__SimulatteReviewBridgeRefactorScope;
  if (!scope || scope.missingDependency) return;
  with (scope) {
    function start() {
        installKeyboardToggle();
        if (shouldEnable()) enable();
        return panel;
      }

    function enable(nextServerUrl = '') {
        enabled = true;
        const requestedServerUrl = nextServerUrl ? normalizeServerUrl(nextServerUrl) : '';
        serverUrl = requestedServerUrl || configuredServerUrl();
        try {
          root.localStorage.setItem(STORAGE_ENABLED, 'true');
          root.localStorage.removeItem(LEGACY_STORAGE_ENABLED);
          if (requestedServerUrl) root.localStorage.setItem(STORAGE_SERVER, requestedServerUrl);
        } catch (_err) {}
        if (!panel) panel = createPanel();
        if (document.documentElement) document.documentElement.dataset.trainingMode = 'true';
        syncStatus('checking');
        refreshLocalStatus();
        checkServer();
        installRefreshLoop();
        connectReviewEvents();
        return panel;
      }

    function disable() {
        try {
          root.localStorage.removeItem(STORAGE_ENABLED);
          root.localStorage.removeItem(LEGACY_STORAGE_ENABLED);
        } catch (_err) {}
        if (panel) panel.remove();
        panel = null;
        noteInput = null;
        statusNode = null;
        summaryNode = null;
        targetNode = null;
        questionNode = null;
        queueNode = null;
        promptNode = null;
        artifactJsonNode = null;
        diagnosticsNode = null;
        serverSummaryNode = null;
        phaseButtons = [];
        if (refreshTimer) root.clearInterval(refreshTimer);
        if (serverRefreshTimer) root.clearInterval(serverRefreshTimer);
        refreshTimer = 0;
        serverRefreshTimer = 0;
        if (eventsSource) {
          eventsSource.close();
          eventsSource = null;
        }
        if (document.documentElement) delete document.documentElement.dataset.trainingMode;
        enabled = false;
      }

    function toggle() {
        if (enabled) disable();
        else enable();
      }

    function shouldEnable() {
        const params = new URLSearchParams(root.location && root.location.search || '');
        if (/^(1|true|on)$/i.test(params.get('training') || '')) return true;
        if (/^(1|true|on)$/i.test(params.get('review') || '')) return true;
        try {
          return root.localStorage.getItem(STORAGE_ENABLED) === 'true' ||
            root.localStorage.getItem(LEGACY_STORAGE_ENABLED) === 'true';
        } catch (_err) {
          return false;
        }
      }

    function configuredServerUrl() {
        const params = new URLSearchParams(root.location && root.location.search || '');
        const fromQuery = params.get('reviewServer') || params.get('trainingServer');
        if (fromQuery) return normalizeServerUrl(fromQuery);
        try {
          return normalizeServerUrl(root.localStorage.getItem(STORAGE_SERVER) || DEFAULT_SERVER);
        } catch (_err) {
          return DEFAULT_SERVER;
        }
      }

    function normalizeServerUrl(value) {
        return String(value || DEFAULT_SERVER).trim().replace(/\/+$/, '') || DEFAULT_SERVER;
      }

    function installKeyboardToggle() {
        if (keyboardInstalled || !root.document) return;
        keyboardInstalled = true;
        root.document.addEventListener('keydown', (event) => {
          if (shouldIgnoreKey(event)) return;
          const key = String(event.key || '').toLowerCase();
          if (key === 't') {
            event.preventDefault();
            toggle();
            return;
          }
          if (!enabled) return;
          const action = TRAINING_LABELS.find((row) => row.key === key);
          if (action) {
            event.preventDefault();
            submitTrainingLabel(action);
          }
        });
      }

    function shouldIgnoreKey(event) {
        if (!event || event.altKey || event.ctrlKey || event.metaKey) return true;
        const target = event.target;
        const tagName = target && target.tagName ? target.tagName.toLowerCase() : '';
        return tagName === 'input' || tagName === 'textarea' || tagName === 'select' ||
          Boolean(target && target.isContentEditable);
      }

    function createPanel() {
        injectStyles();
        const node = document.createElement('section');
        node.className = 'simulatte-review-bridge simulatte-training-mode simulatte-training-layer';
        node.setAttribute('aria-label', 'Simulatte training layer');
        node.innerHTML = [
          '<div class="training-layer-head">',
          '<div class="training-title-block">',
          '<strong>Training layer</strong>',
          '<span data-training-server-summary>0 saved</span>',
          '</div>',
          '<div class="training-head-actions">',
          '<span data-review-status>offline</span>',
          '<button type="button" data-training-collapse aria-expanded="true">Minimize</button>',
          '</div>',
          '</div>',
          '<div class="training-layer-body" data-training-body>',
          '<div class="training-prompt-readout">',
          '<span>Prompt</span>',
          '<output data-training-prompt>No prompt submitted</output>',
          '</div>',
          '<div class="training-field-label">Feedback target</div>',
          '<div class="training-phase-grid" data-training-phase-grid role="tablist" aria-label="Training checkpoint"></div>',
          '<div class="training-target-readout" data-training-target>Target: Final render</div>',
          '<div class="training-artifact-summary" data-training-summary>Final: awaiting output</div>',
          '<pre class="training-artifact-json" data-training-artifact-json>{}</pre>',
          '<div class="training-diagnostics" data-training-diagnostics>Runtime idle</div>',
          '<label class="training-note-label" for="training-feedback-note">Feedback</label>',
          '<textarea id="training-feedback-note" data-review-note rows="5" placeholder="Say what is right or wrong about this selected phase"></textarea>',
          '<div class="training-question" data-training-question>Feedback for Final render</div>',
          '<div class="training-primary-actions">',
          '<button type="button" data-training-save-feedback>Save feedback</button>',
          '<button type="button" data-training-save-pass>Looks right</button>',
          '</div>',
          '<div class="training-utility-row">',
          '<button type="button" data-review-sync>Sync</button>',
          '<button type="button" data-review-export>Export reviews</button>',
          '<span data-review-queue>0 queued</span>',
          '</div>',
          '</div>',
        ].join('');
        statusNode = node.querySelector('[data-review-status]');
        noteInput = node.querySelector('[data-review-note]');
        summaryNode = node.querySelector('[data-training-summary]');
        targetNode = node.querySelector('[data-training-target]');
        questionNode = node.querySelector('[data-training-question]');
        queueNode = node.querySelector('[data-review-queue]');
        promptNode = node.querySelector('[data-training-prompt]');
        artifactJsonNode = node.querySelector('[data-training-artifact-json]');
        diagnosticsNode = node.querySelector('[data-training-diagnostics]');
        serverSummaryNode = node.querySelector('[data-training-server-summary]');
        phaseButtons = [];
        const phaseTabs = node.querySelector('[data-training-phase-grid]');
        PHASE_TARGETS.forEach((target) => {
          const button = document.createElement('button');
          button.type = 'button';
          button.dataset.trainingPhase = target.id;
          button.innerHTML = [
            `<span class="training-phase-short">${target.label}</span>`,
            `<span class="training-phase-name">${phaseShortName(target)}</span>`,
            '<span class="training-phase-state" data-training-phase-state>Waiting</span>',
          ].join('');
          button.title = `Record feedback against ${targetName(target)}`;
          button.setAttribute('aria-label', `Feedback target ${targetName(target)}`);
          button.addEventListener('click', () => selectPhase(target.id));
          phaseTabs.append(button);
          phaseButtons.push(button);
        });
        const draftFields = [noteInput].filter(Boolean);
        draftFields.forEach((field) => field.addEventListener('input', scheduleDraft));
        draftFields.forEach((field) => field.addEventListener('change', scheduleDraft));
        node.querySelector('[data-training-save-feedback]').addEventListener('click', () => submitFreeTextFeedback());
        node.querySelector('[data-training-save-pass]').addEventListener('click', () => {
          submitTrainingLabel(label('pass', 'looks right', 'Looks right', ''));
        });
        node.querySelector('[data-training-collapse]').addEventListener('click', () => toggleCollapsed(node));
        node.querySelector('[data-review-sync]').addEventListener('click', syncQueuedRecords);
        node.querySelector('[data-review-export]').addEventListener('click', exportReviews);
        document.body.append(node);
        selectPhase(selectedPhaseId);
        return node;
      }

    function injectStyles() {
        if (document.getElementById('simulatte-review-bridge-style')) return;
        const style = document.createElement('style');
        style.id = 'simulatte-review-bridge-style';
        style.textContent = `
          .simulatte-review-bridge {
            position: fixed;
            z-index: 55;
            top: 12px;
            right: 12px;
            width: min(440px, calc(100vw - 24px));
            max-height: calc(100vh - 24px);
            display: grid;
            gap: 10px;
            overflow: auto;
            padding: 12px;
            border: 1px solid rgba(26, 49, 47, 0.14);
            border-radius: 8px;
            background: rgba(250, 252, 249, 0.94);
            box-shadow: 0 14px 52px rgba(20, 31, 28, 0.18);
            color: rgba(18, 28, 26, 0.9);
            backdrop-filter: blur(12px);
          }
          .training-layer-head,
          .training-head-actions,
          .training-utility-row {
            display: flex;
            align-items: center;
            gap: 6px;
          }
          .training-layer-head {
            justify-content: space-between;
            font-size: 12px;
          }
          .training-title-block {
            display: grid;
            gap: 2px;
          }
          .training-title-block strong {
            font-size: 13px;
          }
          .training-layer-body {
            display: grid;
            gap: 9px;
          }
          .simulatte-review-bridge.is-collapsed {
            width: min(280px, calc(100vw - 24px));
          }
          .simulatte-review-bridge.is-collapsed .training-layer-body {
            display: none;
          }
          .training-layer-head span,
          .training-utility-row span {
            color: rgba(23, 32, 29, 0.58);
          }
          .training-prompt-readout {
            display: grid;
            gap: 4px;
            padding: 8px;
            border: 1px solid rgba(26, 49, 47, 0.1);
            border-radius: 7px;
            background: rgba(255, 255, 255, 0.68);
          }
          .training-prompt-readout span {
            color: rgba(23, 32, 29, 0.52);
            font-size: 10px;
            text-transform: uppercase;
          }
          .training-prompt-readout output {
            max-height: 52px;
            overflow: auto;
            font-size: 12px;
            line-height: 1.35;
          }
          .training-question,
          .training-note-label,
          .training-field-label,
          .training-target-readout,
          .training-artifact-summary,
          .training-diagnostics {
            color: rgba(23, 32, 29, 0.72);
            font-size: 12px;
            font-weight: 720;
          }
          .training-field-label {
            color: rgba(23, 32, 29, 0.52);
            font-size: 10px;
            text-transform: uppercase;
          }
          .training-note-label {
            color: rgba(23, 32, 29, 0.6);
            font-size: 10px;
            text-transform: uppercase;
          }
          .training-target-readout {
            color: rgba(23, 32, 29, 0.86);
          }
          .training-artifact-summary {
            max-height: 42px;
            overflow: hidden;
            font-size: 11px;
            font-weight: 560;
          }
          .training-artifact-json {
            max-height: 150px;
            overflow: auto;
            margin: 0;
            padding: 8px;
            border: 1px solid rgba(26, 49, 47, 0.1);
            border-radius: 7px;
            background: rgba(15, 21, 19, 0.92);
            color: rgba(239, 250, 244, 0.94);
            font: 10px/1.35 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
            white-space: pre-wrap;
          }
          .training-diagnostics {
            padding: 7px 8px;
            border-radius: 7px;
            background:
              linear-gradient(90deg, rgba(244, 192, 210, 0.38), rgba(255, 236, 164, 0.32), rgba(175, 232, 206, 0.34), rgba(184, 219, 255, 0.32));
            font-size: 11px;
            font-weight: 620;
          }
          .training-utility-row {
            flex-wrap: wrap;
          }
          .training-primary-actions {
            display: grid;
            grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
            gap: 8px;
          }
          .training-phase-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 6px;
          }
          .training-phase-grid button,
          .training-utility-row button,
          .training-primary-actions button,
          .training-head-actions button {
            min-height: 30px;
            padding: 0 9px;
            border: 1px solid rgba(26, 49, 47, 0.12);
            border-radius: 7px;
            background: rgba(255, 255, 255, 0.72);
            font-size: 10px;
            text-transform: none;
            letter-spacing: 0;
          }
          .training-primary-actions button {
            min-height: 36px;
            font-size: 12px;
            font-weight: 760;
          }
          .training-primary-actions button[data-training-save-feedback] {
            border-color: rgba(32, 111, 93, 0.32);
            background: rgba(218, 244, 237, 0.84);
          }
          .training-phase-grid button {
            display: grid;
            gap: 2px;
            align-items: start;
            min-height: 58px;
            padding: 7px 8px;
            text-align: left;
          }
          .training-phase-grid button.is-active {
            border-color: rgba(32, 111, 93, 0.42);
            background: rgba(218, 244, 237, 0.86);
          }
          .training-phase-short {
            font-size: 12px;
            font-weight: 780;
          }
          .training-phase-name,
          .training-phase-state {
            overflow: hidden;
            color: rgba(23, 32, 29, 0.56);
            font-size: 10px;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
          .training-phase-grid button[data-phase-state="ready"] .training-phase-state {
            color: rgba(22, 112, 83, 0.82);
          }
          .training-phase-grid button[data-phase-state="missing"] .training-phase-state {
            color: rgba(169, 74, 48, 0.86);
          }
          .simulatte-review-bridge textarea {
            width: 100%;
            min-height: 66px;
            max-height: 140px;
            resize: vertical;
          }
          @media (max-width: 700px) {
            .simulatte-review-bridge {
              top: auto;
              right: 8px;
              bottom: 8px;
              left: 8px;
              width: auto;
              max-height: min(72vh, 620px);
            }
            .training-phase-grid,
            .training-primary-actions {
              grid-template-columns: 1fr;
            }
          }
        `;
        document.head.append(style);
      }

    function selectPhase(phaseId) {
        selectedPhaseId = phaseById(phaseId).id;
        try {
          root.localStorage.setItem(STORAGE_PHASE, selectedPhaseId);
        } catch (_err) {}
        syncArtifactSummary();
      }

    function storedPhaseId() {
        try {
          return phaseById(root.localStorage.getItem(STORAGE_PHASE) || 'final').id;
        } catch (_err) {
          return 'final';
        }
      }

    function phaseById(phaseId) {
        return PHASE_TARGETS.find((target) => target.id === phaseId) || PHASE_TARGETS[0];
      }

    function scheduleDraft() {
        if (draftTimer) root.clearTimeout(draftTimer);
        draftTimer = root.setTimeout(() => submitDraft(false), 450);
      }

    async function checkServer() {
        try {
          const response = await fetch(`${serverUrl}/health`, { cache: 'no-store' });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const json = await response.json();
          const queued = await reviewStore.countQueued();
          syncStatus(`online ${json.reviewCount || 0}`);
          renderServerSummary(json.summary);
          syncQueueLabel(queued);
          if (queued) await syncQueuedRecords();
        } catch (_err) {
          const queued = await reviewStore.countQueued();
          syncStatus(queued ? `offline ${queued} queued` : 'offline');
          renderServerSummary(null);
          syncQueueLabel(queued);
        }
      }

    async function submitDraft(force) {
        if (!enabled || !panel) return;
        const record = await collectRecord('draft');
        if (!force && !record.note && !record.tags.length) return;
        try {
          await postJson('/draft', record);
          syncStatus('draft synced');
        } catch (_err) {
          syncStatus('draft local');
        }
      }

    async function submitTrainingLabel(action) {
        const record = await collectRecord(action.status, [action.tag]);
        await reviewStore.put(record, false);
        syncStatus(`queued ${action.label.toLowerCase()}`);
        clearFeedbackFields();
        await refreshLocalStatus();
        try {
          await postJson('/reviews', record);
          await reviewStore.markSynced(record.id);
          syncStatus(action.status === 'pass' ? 'saved looks right' : 'saved feedback');
          await refreshServerSummary();
        } catch (_err) {
          syncStatus(`queued ${action.label.toLowerCase()}`);
        }
        await refreshLocalStatus();
      }

    function submitFreeTextFeedback() {
        submitTrainingLabel(label('feedback', '', 'Feedback', ''));
      }

    async function syncQueuedRecords() {
        if (syncing) return;
        syncing = true;
        try {
          const queued = await reviewStore.queued();
          for (const row of queued) {
            await postJson('/reviews', cleanLocalRecord(row));
            await reviewStore.markSynced(row.id);
          }
          syncStatus(queued.length ? `synced ${queued.length}` : 'synced');
          await refreshServerSummary();
        } catch (_err) {
          const count = await reviewStore.countQueued();
          syncStatus(count ? `offline ${count} queued` : 'offline');
        } finally {
          syncing = false;
          await refreshLocalStatus();
        }
      }

    async function postJson(pathname, body) {
        const response = await fetch(`${serverUrl}${pathname}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      }

    async function collectRecord(status, selectedTags = []) {
        const snapshot = trainingSnapshot();
        const target = phaseById(selectedPhaseId);
        const artifact = artifactForPhase(snapshot, target);
        const diagnostics = await collectDiagnostics(snapshot);
        const createdAt = new Date().toISOString();
        const prompt = snapshot.prompt || currentPrompt();
        const feedback = noteInput ? noteInput.value : '';
        const tags = selectedTags.filter(Boolean);
        return {
          schema: 'simulatte.trainingReview.v1',
          id: reviewId(),
          clientCreatedAt: createdAt,
          runId: snapshot.runId || fallbackRunId(prompt),
          status,
          prompt,
          feedback,
          note: feedback,
          tags,
          phaseId: target.id,
          phaseLabel: target.label,
          phaseFrom: target.from,
          phaseTo: target.to,
          pipelinePhase: snapshot.phase || null,
          artifactSummary: artifact,
          artifactHash: await hashText(JSON.stringify(artifact).slice(0, 60000)),
          phaseCards: phaseCardSummary(snapshot),
          selectedArtifact: compactRecordArtifact(artifact),
          appUrl: root.location && root.location.href || '',
          build: document.querySelector('meta[name="simulatte-build"]')?.content || '',
          diagnostics,
        };
      }

    function trainingSnapshot() {
        const lab = root.SimulattePhysicsLab && root.SimulattePhysicsLab._browserLab;
        if (lab && typeof lab.getTrainingSnapshot === 'function') return lab.getTrainingSnapshot();
        return {
          schema: 'simulatte.trainingSnapshot.v1',
          runId: '',
          prompt: currentPrompt(),
          phase: null,
          artifacts: {},
        };
      }

    function artifactForPhase(snapshot, target) {
        const key = artifactKeyForTarget(target);
        const artifact = target.id === 'final'
          ? snapshot.artifacts && (snapshot.artifacts['1->8'] || snapshot.artifacts.final)
          : snapshot.artifacts && snapshot.artifacts[key];
        return artifact || {
          schema: 'simulatte.trainingPhaseArtifact.v1',
          phaseFrom: target.from,
          phaseTo: target.to,
          phaseId: target.id,
          phaseLabel: target.label,
          input: { prompt: snapshot.prompt || currentPrompt() },
          output: {},
          summary: `${target.label}: awaiting output`,
        };
      }

    async function collectDiagnostics(snapshot = {}) {
        const lab = root.SimulattePhysicsLab && root.SimulattePhysicsLab._browserLab;
        const spec = lab && typeof lab.getSpec === 'function' ? lab.getSpec() : null;
        const renderProgram = spec && spec.renderProgram || {};
        const visualIR = renderProgram.visualIR || {};
        const atoms = visualIR.graphicsAtoms || {};
        const slots = atoms.uniforms && atoms.uniforms.bySlot || {};
        const canvas = document.getElementById('physics-canvas');
        return {
          currentPhase: snapshot.phase || null,
          rendererSceneKind: renderProgram.rendererPlan && renderProgram.rendererPlan.sceneKind || '',
          visualIRSceneKind: visualIR.sceneKind || '',
          visualIRCamera: visualIR.camera && visualIR.camera.mode || '',
          mappingIds: (atoms.mappings || []).map((row) => row.id),
          uniformSlots: Object.keys(slots).filter((slot) => Number(slots[slot] || 0) > 0),
          wgslOperators: atoms.wgslOperators || [],
          canvasHash: await canvasHash(canvas),
          renderCount: canvas && canvas.dataset ? Number(canvas.dataset.renderCount || 0) : 0,
          fps: canvas && canvas.dataset ? Number(canvas.dataset.fps || 0) : 0,
          rendererStatus: canvas && canvas.dataset ? canvas.dataset.rendererStatus || '' : '',
        };
      }

    function currentPrompt() {
        return document.getElementById('build-prompt')?.value || '';
      }

    function syncArtifactSummary() {
        if (!summaryNode) return;
        const snapshot = trainingSnapshot();
        const target = phaseById(selectedPhaseId);
        const artifact = artifactForPhase(snapshot, target);
        const name = targetName(target);
        renderPhaseButtons(snapshot);
        if (promptNode) promptNode.textContent = snapshot.prompt || currentPrompt() || 'No prompt submitted';
        if (targetNode) targetNode.textContent = `Target: ${name}`;
        if (questionNode) questionNode.textContent = `Submit feedback for ${name}`;
        summaryNode.textContent = artifact.summary || `${target.label}: awaiting output`;
        if (artifactJsonNode) artifactJsonNode.textContent = prettyArtifact(artifact);
        if (diagnosticsNode) diagnosticsNode.textContent = trainingDiagnosticsLine(snapshot, artifact);
      }

    function targetName(target) {
        if (!target || target.id === 'final') return 'Final render (1->8 WebGPU ready)';
        return `${target.label} ${PHASE_NAMES[target.to] || `Phase ${target.to}`} output`;
      }

    function phaseShortName(target) {
        if (!target || target.id === 'final') return 'Final render';
        return PHASE_NAMES[target.to] || `Phase ${target.to}`;
      }

    async function refreshLocalStatus() {
        syncQueueLabel(await reviewStore.countQueued());
        syncArtifactSummary();
      }

    function syncStatus(text) {
        if (statusNode) statusNode.textContent = text;
      }

    function syncQueueLabel(count) {
        if (queueNode) queueNode.textContent = `${count || 0} queued`;
      }

    function installRefreshLoop() {
        if (!refreshTimer) {
          refreshTimer = root.setInterval(syncArtifactSummary, PANEL_REFRESH_INTERVAL);
        }
        if (!serverRefreshTimer) {
          serverRefreshTimer = root.setInterval(refreshServerSummary, SERVER_REFRESH_INTERVAL);
        }
      }

    function connectReviewEvents() {
        if (eventsSource || !root.EventSource) return;
        try {
          eventsSource = new root.EventSource(`${serverUrl}/events`);
          eventsSource.addEventListener('review', () => refreshServerSummary());
          eventsSource.addEventListener('draft', () => syncStatus('draft synced'));
          eventsSource.onerror = () => {
            if (eventsSource) {
              eventsSource.close();
              eventsSource = null;
            }
          };
        } catch (_err) {
          eventsSource = null;
        }
      }

    async function refreshServerSummary() {
        if (!enabled || !serverSummaryNode) return;
        try {
          const response = await fetch(`${serverUrl}/summary`, { cache: 'no-store' });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          renderServerSummary(await response.json());
        } catch (_err) {
          renderServerSummary(null);
        }
      }

    function renderServerSummary(summary) {
        if (!serverSummaryNode) return;
        if (!summary || typeof summary !== 'object') {
          serverSummaryNode.textContent = 'offline capture';
          return;
        }
        const feedback = Number(summary.byStatus && (summary.byStatus.feedback || summary.byStatus.fail || 0)) || 0;
        const topPhase = topBucket(summary.byPhaseTo);
        serverSummaryNode.textContent = [
          `${Number(summary.count || 0)} saved`,
          feedback ? `${feedback} feedback` : '',
          topPhase ? `phase ${topPhase}` : '',
        ].filter(Boolean).join(' | ');
      }

    function topBucket(bucket = {}) {
        return Object.entries(bucket || {})
          .filter(([, count]) => Number(count) > 0)
          .sort((a, b) => Number(b[1]) - Number(a[1]))[0]?.[0] || '';
      }

    function renderPhaseButtons(snapshot = {}) {
        for (const button of phaseButtons) {
          const target = phaseById(button.dataset.trainingPhase);
          const active = target.id === selectedPhaseId;
          const state = phaseState(snapshot, target);
          const artifact = artifactForPhase(snapshot, target);
          const stateNode = button.querySelector('[data-training-phase-state]');
          button.classList.toggle('is-active', active);
          button.dataset.phaseState = state;
          button.setAttribute('aria-selected', active ? 'true' : 'false');
          if (stateNode) stateNode.textContent = stateLabel(state, artifact);
        }
      }

    function phaseState(snapshot = {}, target = PHASE_TARGETS[0]) {
        const key = artifactKeyForTarget(target);
        const hasArtifact = Boolean(snapshot.artifacts && (snapshot.artifacts[key] ||
          (target.id === 'final' && snapshot.artifacts.final)));
        if (hasArtifact) return 'ready';
        const step = Number(snapshot.phase && snapshot.phase.step || 0);
        return step >= target.to ? 'missing' : 'waiting';
      }

    function stateLabel(state, artifact = {}) {
        if (state === 'ready') return shortLine(artifact.summary || 'Ready', 56);
        if (state === 'missing') return 'Missing artifact';
        return 'Waiting';
      }

    function artifactKeyForTarget(target = PHASE_TARGETS[0]) {
        return `1->${target.to || 8}`;
      }

    function prettyArtifact(artifact = {}) {
        const preview = compactRecordArtifact(artifact);
        const raw = JSON.stringify(preview, null, 2);
        return raw.length > 2400 ? `${raw.slice(0, 2400)}\n...` : raw;
      }

    function compactRecordArtifact(artifact = {}) {
        return {
          phase: artifact.phaseLabel || artifact.phaseId || '',
          from: artifact.phaseFrom || 1,
          to: artifact.phaseTo || 8,
          input: artifact.input || {},
          output: artifact.output || {},
          summary: artifact.summary || '',
        };
      }

    function phaseCardSummary(snapshot = {}) {
        return PHASE_TARGETS.map((target) => {
          const artifact = artifactForPhase(snapshot, target);
          return {
            id: target.id,
            label: target.label,
            to: target.to,
            state: phaseState(snapshot, target),
            summary: artifact.summary || '',
          };
        });
      }

    function trainingDiagnosticsLine(snapshot = {}, artifact = {}) {
        const phase = snapshot.phase || {};
        const spec = snapshot.currentSpec || {};
        return [
          phase.label ? `runtime ${phase.step || '-'} ${phase.label}` : 'runtime idle',
          phase.line ? shortLine(phase.line, 54) : '',
          spec.sceneKind ? `scene ${spec.sceneKind}` : '',
          artifact.phaseLabel ? `selected ${artifact.phaseLabel}` : '',
        ].filter(Boolean).join(' | ');
      }

    function shortLine(value, max = 80) {
        const text = String(value || '').replace(/\s+/g, ' ').trim();
        return text.length > max ? `${text.slice(0, max - 3)}...` : text;
      }

    function clearFeedbackFields() {
        if (noteInput) noteInput.value = '';
      }

    function toggleCollapsed(node) {
        const collapsed = !node.classList.contains('is-collapsed');
        node.classList.toggle('is-collapsed', collapsed);
        const button = node.querySelector('[data-training-collapse]');
        if (button) {
          button.textContent = collapsed ? 'Expand' : 'Minimize';
          button.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
        }
      }

    Object.assign(scope, {
      start,
      enable,
      disable,
      toggle,
      shouldEnable,
      configuredServerUrl,
      normalizeServerUrl,
      installKeyboardToggle,
      shouldIgnoreKey,
      createPanel,
      injectStyles,
      selectPhase,
      storedPhaseId,
      phaseById,
      scheduleDraft,
      checkServer,
      submitDraft,
      submitTrainingLabel,
      submitFreeTextFeedback,
      syncQueuedRecords,
      postJson,
      collectRecord,
      trainingSnapshot,
      artifactForPhase,
      collectDiagnostics,
      currentPrompt,
      syncArtifactSummary,
      targetName,
      phaseShortName,
      refreshLocalStatus,
      syncStatus,
      syncQueueLabel,
      installRefreshLoop,
      connectReviewEvents,
      refreshServerSummary,
      renderServerSummary,
      topBucket,
      renderPhaseButtons,
      phaseState,
      stateLabel,
      artifactKeyForTarget,
      prettyArtifact,
      compactRecordArtifact,
      phaseCardSummary,
      trainingDiagnosticsLine,
      shortLine,
      clearFeedbackFields,
      toggleCollapsed,
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
