(function attachSimulatteReviewBridge(root, factory) {
  const api = factory(root);
  root.SimulatteReviewBridge = api;
  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => api.start());
  }
})(typeof globalThis !== 'undefined' ? globalThis : window, function createReviewBridge(root) {
  'use strict';

  const STORAGE_ENABLED = 'simulatte.trainingMode.enabled.v1';
  const LEGACY_STORAGE_ENABLED = 'simulatte.reviewBridge.enabled.v1';
  const STORAGE_SERVER = 'simulatte.reviewBridge.server.v1';
  const STORAGE_PHASE = 'simulatte.trainingMode.phase.v1';
  const STORAGE_FALLBACK = 'simulatte.trainingMode.records.v1';
  const DB_NAME = 'simulatte-training-reviews-v1';
  const DB_STORE = 'reviews';
  const DEFAULT_SERVER = 'http://127.0.0.1:4766';
  const TRAINING_LABELS = Object.freeze([
    label('pass', 'looks right', 'Looks right', '1'),
    label('fail', 'wrong scene', 'Wrong scene', '2'),
    label('fail', 'missing object', 'Missing object', '3'),
    label('fail', 'wrong material', 'Wrong material', '4'),
    label('fail', 'too generic', 'Too generic', '5'),
    label('fail', 'bad motion', 'Bad motion', '6'),
  ]);
  const PHASE_TARGETS = Object.freeze([
    phaseTarget('final', 'Final', 1, 8),
    phaseTarget('1-2', '1->2', 1, 2),
    phaseTarget('1-3', '1->3', 1, 3),
    phaseTarget('1-4', '1->4', 1, 4),
    phaseTarget('1-5', '1->5', 1, 5),
    phaseTarget('1-6', '1->6', 1, 6),
    phaseTarget('1-7', '1->7', 1, 7),
    phaseTarget('1-8', '1->8', 1, 8),
  ]);
  const PHASE_NAMES = Object.freeze({
    2: 'Language graph',
    3: 'Embedding retrieval',
    4: 'Activation cloud',
    5: 'Grounded intent',
    6: 'Simulation compile',
    7: 'VisualIR compile',
    8: 'WebGPU ready',
  });

  const reviewStore = createReviewStore(root);
  let panel = null;
  let noteInput = null;
  let statusNode = null;
  let summaryNode = null;
  let targetNode = null;
  let questionNode = null;
  let queueNode = null;
  let phaseButtons = [];
  let draftTimer = 0;
  let serverUrl = DEFAULT_SERVER;
  let enabled = false;
  let keyboardInstalled = false;
  let selectedPhaseId = storedPhaseId();
  let syncing = false;

  function start() {
    installKeyboardToggle();
    if (shouldEnable()) enable();
    return panel;
  }

  function enable(nextServerUrl = '') {
    enabled = true;
    serverUrl = configuredServerUrl();
    try {
      root.localStorage.setItem(STORAGE_ENABLED, 'true');
      root.localStorage.removeItem(LEGACY_STORAGE_ENABLED);
      if (nextServerUrl) root.localStorage.setItem(STORAGE_SERVER, normalizeServerUrl(nextServerUrl));
    } catch (_err) {}
    if (!panel) panel = createPanel();
    syncStatus('checking');
    refreshLocalStatus();
    checkServer();
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
    phaseButtons = [];
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
    node.className = 'simulatte-review-bridge simulatte-training-mode';
    node.setAttribute('aria-label', 'Training mode');
    node.innerHTML = [
      '<div class="review-bridge-head">',
      '<strong>Training</strong>',
      '<span data-review-status>offline</span>',
      '</div>',
      '<div class="training-field-label">Feedback target</div>',
      '<div class="training-phase-tabs" role="tablist" aria-label="Training checkpoint"></div>',
      '<div class="training-target-readout" data-training-target>Target: Final render</div>',
      '<div class="training-artifact-summary" data-training-summary>Final: awaiting output</div>',
      '<label class="training-note-label" for="training-feedback-note">Feedback note</label>',
      '<textarea id="training-feedback-note" data-review-note rows="3" placeholder="Type feedback here"></textarea>',
      '<div class="training-question" data-training-question>Save feedback as</div>',
      '<div class="review-bridge-actions training-labels"></div>',
      '<div class="training-utility-row">',
      '<button type="button" data-review-sync>Sync</button>',
      '<button type="button" data-review-export>Export reviews</button>',
      '<span data-review-queue>0 queued</span>',
      '</div>',
    ].join('');
    statusNode = node.querySelector('[data-review-status]');
    noteInput = node.querySelector('[data-review-note]');
    summaryNode = node.querySelector('[data-training-summary]');
    targetNode = node.querySelector('[data-training-target]');
    questionNode = node.querySelector('[data-training-question]');
    queueNode = node.querySelector('[data-review-queue]');
    phaseButtons = [];
    const phaseTabs = node.querySelector('.training-phase-tabs');
    PHASE_TARGETS.forEach((target) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.trainingPhase = target.id;
      button.textContent = target.label;
      button.title = `Record feedback against ${targetName(target)}`;
      button.setAttribute('aria-label', `Feedback target ${targetName(target)}`);
      button.addEventListener('click', () => selectPhase(target.id));
      phaseTabs.append(button);
      phaseButtons.push(button);
    });
    const actions = node.querySelector('.training-labels');
    TRAINING_LABELS.forEach((row) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.trainingStatus = row.status;
      button.dataset.trainingTag = row.tag;
      button.textContent = `${row.key} ${row.label}`;
      button.title = `Submit "${row.label}" for the selected target`;
      button.addEventListener('click', () => submitTrainingLabel(row));
      actions.append(button);
    });
    noteInput.addEventListener('input', scheduleDraft);
    node.querySelector('[data-review-sync]').addEventListener('click', syncQueuedRecords);
    node.querySelector('[data-review-export]').addEventListener('click', exportReviews);
    const moreMenu = document.querySelector('#prompt-more-menu');
    const moreContent = moreMenu ? moreMenu.querySelector('.prompt-more-content') : null;
    const dockCore = moreContent || document.querySelector('.prompt-dock-core') || document.body;
    dockCore.append(node);
    if (moreMenu) moreMenu.open = true;
    selectPhase(selectedPhaseId);
    return node;
  }

  function injectStyles() {
    if (document.getElementById('simulatte-review-bridge-style')) return;
    const style = document.createElement('style');
    style.id = 'simulatte-review-bridge-style';
    style.textContent = `
      .simulatte-review-bridge {
        display: grid;
        gap: 8px;
        padding: 9px;
        border: 1px solid rgba(26, 49, 47, 0.14);
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.82);
        box-shadow: 0 10px 38px rgba(20, 31, 28, 0.1);
      }
      .review-bridge-head,
      .review-bridge-actions,
      .training-phase-tabs,
      .training-utility-row {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .review-bridge-head {
        justify-content: space-between;
        font-size: 11px;
      }
      .review-bridge-head span,
      .training-utility-row span {
        color: rgba(23, 32, 29, 0.58);
      }
      .training-question,
      .training-note-label,
      .training-field-label,
      .training-target-readout,
      .training-artifact-summary {
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
      .review-bridge-actions,
      .training-phase-tabs,
      .training-utility-row {
        flex-wrap: wrap;
      }
      .review-bridge-actions button,
      .training-phase-tabs button,
      .training-utility-row button {
        min-height: 30px;
        padding: 0 9px;
        border: 1px solid rgba(26, 49, 47, 0.12);
        border-radius: 7px;
        background: rgba(255, 255, 255, 0.72);
        font-size: 10px;
        text-transform: none;
        letter-spacing: 0;
      }
      .training-phase-tabs button.is-active {
        border-color: rgba(32, 111, 93, 0.42);
        background: rgba(218, 244, 237, 0.86);
      }
      .simulatte-review-bridge textarea {
        min-height: 66px;
        max-height: 140px;
      }
    `;
    document.head.append(style);
  }

  function selectPhase(phaseId) {
    selectedPhaseId = phaseById(phaseId).id;
    try {
      root.localStorage.setItem(STORAGE_PHASE, selectedPhaseId);
    } catch (_err) {}
    phaseButtons.forEach((button) => {
      const active = button.dataset.trainingPhase === selectedPhaseId;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
    });
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
      syncQueueLabel(queued);
      if (queued) await syncQueuedRecords();
    } catch (_err) {
      const queued = await reviewStore.countQueued();
      syncStatus(queued ? `offline ${queued} queued` : 'offline');
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
    syncStatus(`queued ${action.tag}`);
    await refreshLocalStatus();
    try {
      await postJson('/reviews', record);
      await reviewStore.markSynced(record.id);
      syncStatus(action.status === 'pass' ? 'saved looks right' : `saved ${action.tag}`);
      if (noteInput) noteInput.value = '';
    } catch (_err) {
      syncStatus(`queued ${action.tag}`);
    }
    await refreshLocalStatus();
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
    return {
      schema: 'simulatte.trainingReview.v1',
      id: reviewId(),
      clientCreatedAt: createdAt,
      runId: snapshot.runId || fallbackRunId(prompt),
      status,
      prompt,
      note: noteInput ? noteInput.value : '',
      expected: '',
      tags: selectedTags.length ? selectedTags : [],
      phaseId: target.id,
      phaseLabel: target.label,
      phaseFrom: target.from,
      phaseTo: target.to,
      pipelinePhase: snapshot.phase || null,
      artifactSummary: artifact,
      artifactHash: await hashText(JSON.stringify(artifact).slice(0, 60000)),
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
    const key = `1->${target.to}`;
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
    const target = phaseById(selectedPhaseId);
    const artifact = artifactForPhase(trainingSnapshot(), target);
    const name = targetName(target);
    if (targetNode) targetNode.textContent = `Target: ${name}`;
    if (questionNode) questionNode.textContent = `Submit feedback for ${name}`;
    summaryNode.textContent = artifact.summary || `${target.label}: awaiting output`;
  }

  function targetName(target) {
    if (!target || target.id === 'final') return 'Final render (1->8 WebGPU ready)';
    return `${target.label} ${PHASE_NAMES[target.to] || `Phase ${target.to}`} output`;
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

  async function exportReviews() {
    const rows = (await reviewStore.all()).map(cleanLocalRecord);
    const jsonl = rows.map((row) => JSON.stringify(row)).join('\n');
    const body = jsonl ? `${jsonl}\n` : '';
    const blob = new Blob([body], { type: 'application/x-ndjson' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `simulatte-training-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    syncStatus(`exported ${rows.length}`);
  }

  async function canvasHash(canvas) {
    if (!canvas || typeof canvas.toDataURL !== 'function' || !root.crypto || !root.crypto.subtle) return '';
    try {
      const data = canvas.toDataURL('image/png');
      const bytes = new TextEncoder().encode(data.slice(0, 180000));
      const digest = await root.crypto.subtle.digest('SHA-256', bytes);
      return hexDigest(digest, 12);
    } catch (_err) {
      return '';
    }
  }

  async function hashText(text) {
    if (!root.crypto || !root.crypto.subtle) return '';
    try {
      const digest = await root.crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(text || '')));
      return hexDigest(digest, 16);
    } catch (_err) {
      return '';
    }
  }

  function hexDigest(digest, bytes) {
    return Array.from(new Uint8Array(digest)).slice(0, bytes)
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  }

  function reviewId() {
    const random = root.crypto && root.crypto.getRandomValues
      ? Array.from(root.crypto.getRandomValues(new Uint32Array(2))).map((row) => row.toString(36)).join('')
      : Math.random().toString(36).slice(2);
    return `${Date.now().toString(36)}-${random}`;
  }

  function fallbackRunId(prompt) {
    return `manual-${String(prompt || '').slice(0, 24).replace(/\W+/g, '-').replace(/^-|-$/g, '') || 'blank'}`;
  }

  function cleanLocalRecord(row = {}) {
    const { _sync, ...record } = row;
    return record;
  }

  function createReviewStore(env) {
    let dbPromise = null;

    async function db() {
      if (!env.indexedDB) return null;
      if (!dbPromise) dbPromise = openDb(env.indexedDB);
      return dbPromise;
    }

    async function put(record, synced) {
      const row = {
        ...record,
        _sync: {
          queuedAt: new Date().toISOString(),
          synced: Boolean(synced),
          syncedAt: synced ? new Date().toISOString() : '',
        },
      };
      const database = await db();
      if (database) {
        try {
          await requestPromise(database.transaction(DB_STORE, 'readwrite').objectStore(DB_STORE).put(row));
          return row;
        } catch (_err) {}
      }
      return putFallback(row);
    }

    async function all() {
      const database = await db();
      if (database) {
        try {
          return await requestPromise(database.transaction(DB_STORE, 'readonly').objectStore(DB_STORE).getAll());
        } catch (_err) {}
      }
      return fallbackRows();
    }

    async function queued() {
      return (await all()).filter((row) => !(row._sync && row._sync.synced));
    }

    async function countQueued() {
      return (await queued()).length;
    }

    async function markSynced(id) {
      const row = (await all()).find((entry) => entry.id === id);
      if (!row) return;
      await put(cleanLocalRecord(row), true);
    }

    function putFallback(row) {
      const rows = fallbackRows().filter((entry) => entry.id !== row.id);
      rows.push(row);
      try {
        env.localStorage.setItem(STORAGE_FALLBACK, JSON.stringify(rows.slice(-500)));
      } catch (_err) {}
      return row;
    }

    function fallbackRows() {
      try {
        return JSON.parse(env.localStorage.getItem(STORAGE_FALLBACK) || '[]');
      } catch (_err) {
        return [];
      }
    }

    return { all, countQueued, markSynced, put, queued };
  }

  function openDb(indexedDB) {
    return new Promise((resolve) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(DB_STORE)) {
          database.createObjectStore(DB_STORE, { keyPath: 'id' });
        }
      };
      request.onerror = () => resolve(null);
      request.onsuccess = () => resolve(request.result);
    });
  }

  function requestPromise(request) {
    return new Promise((resolve, reject) => {
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  function label(status, tag, labelText, key) {
    return Object.freeze({ status, tag, label: labelText, key });
  }

  function phaseTarget(id, labelText, from, to) {
    return Object.freeze({ id, label: labelText, from, to });
  }

  return {
    start,
    enable,
    disable,
    toggle,
    collectRecord,
    exportReviews,
    syncQueuedRecords,
  };
});
