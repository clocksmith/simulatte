(function attachSimulatteRuntimeProgress(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.SimulatteRuntimeProgress = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createRuntimeProgressApi(root) {
  const EVENT_SCHEMA = 'simulatte.runtimeProgressEvent.v1';
  const STATE_SCHEMA = 'simulatte.runtimeProgressState.v1';
  const HEALTH_SCHEMA = 'simulatte.intentRuntimeHealth.v1';
  const LOADER_RECEIPT_SCHEMA = 'simulatte.loaderPhaseReceipt.v1';
  const MAX_EVENT_HISTORY = 120;
  const MAX_LOADER_RECEIPTS = 64;
  const DEFAULT_STAGE = 'runtime.start';
  const HEARTBEAT_MS = 900;
  const STALE_EVENT_MS = 1400;
  const RUNTIME_PHASES = Object.freeze([
    phaseRule(1, 'prompt-runtime', 'Prompt runtime', 30, [
      'runtime.',
      'cache-',
      'manifest',
      'indexes',
      'index-fetch',
      'model',
      'start',
    ]),
    phaseRule(2, 'language-graph', 'Language graph', 5, ['language.', 'parse']),
    phaseRule(3, 'retrieval', 'Embedding retrieval', 20, [
      'retrieval.',
      'embed',
      'prompt-embed',
      'rank',
    ]),
    phaseRule(4, 'activation-cloud', 'Activation cloud', 8, [
      'activation.',
      'span-',
    ]),
    phaseRule(5, 'grounded-intent', 'Grounded intent', 10, [
      'grounding.',
      'classification',
      'intent',
    ]),
    phaseRule(6, 'simulation-compile', 'Simulation compile', 10, [
      'simulation.',
      'compile',
    ]),
    phaseRule(7, 'visual-ir', 'VisualIR compile', 10, ['visual.']),
    phaseRule(8, 'webgpu-ready', 'WebGPU ready', 7, [
      'render.',
      'ready',
      'blank',
    ]),
  ]);
  const PHASE_OFFSETS = Object.freeze(phaseOffsets(RUNTIME_PHASES));
  const STAGE_ALIASES = Object.freeze([
    stageAlias(/error/, 'error', 'Runtime error'),
    stageAlias(/blank/, 'render.blank', 'Ready'),
    stageAlias(/runtime-ready|runtime-reuse/, 'runtime.ready', 'Prompt runtime ready'),
    stageAlias(/manifest-fetch|manifest/, 'runtime.manifest.fetch', 'Loading intent manifest'),
    stageAlias(/index-fetch|indexes/, 'runtime.index.fetch', 'Loading embedding indexes'),
    stageAlias(/model-module/, 'runtime.module.import', 'Loading Doppler runtime'),
    stageAlias(/cache-storage/, 'runtime.cache.storage', 'Opening persistent model cache'),
    stageAlias(/cache-skip/, 'runtime.cache.skip', 'Model cache skipped'),
    stageAlias(/cache-read/, 'runtime.cache.read', 'Reading cached model weights'),
    stageAlias(/cache-hit/, 'runtime.cache.hit', 'Reading cached model weights'),
    stageAlias(/cache-file-ready|cache-ready/, 'runtime.cache.ready', 'Model cache ready'),
    stageAlias(/cache-fill|shard|weight/, 'runtime.cache.file', 'Caching model weights'),
    stageAlias(/model-rerank-probe|phase1-reranker-probe/, 'runtime.reranker.probe', 'Verifying reranker'),
    stageAlias(/reranker-ready/, 'runtime.reranker.ready', 'Reranker ready'),
    stageAlias(/reranker-load/, 'runtime.reranker.load', 'Loading reranker'),
    stageAlias(/model-reuse/, 'runtime.model.reuse', 'Reusing embedding model'),
    stageAlias(/model-probe/, 'runtime.model.probe', 'Verifying embedding model'),
    stageAlias(/model-ready/, 'runtime.model.ready', 'Embedding model ready'),
    stageAlias(/model-load|model/, 'runtime.model.load', 'Loading Doppler model'),
    stageAlias(/\blanguage\b|parse/, 'language.parse', 'Parsing language'),
    stageAlias(/span-cache/, 'activation.span.cache', 'Checking span embedding cache'),
    stageAlias(/span-embed/, 'activation.span.embed', 'Embedding prompt spans'),
	    stageAlias(/span-rank/, 'activation.span.rank', 'Ranking prompt spans'),
	    stageAlias(/span-refined|span-refine/, 'activation.span.refined', 'Refining prompt spans'),
	    stageAlias(/span-retrieval|activation/, 'activation.cloud', 'Building activation cloud'),
	    stageAlias(/scene-query-plan/, 'retrieval.scene.query-plan', 'Planning scene retrieval slots'),
	    stageAlias(/slot-retrieval/, 'retrieval.slot.embed', 'Embedding scene slots'),
	    stageAlias(/slot-rank/, 'retrieval.slot.rank', 'Ranking scene slots'),
	    stageAlias(/retrieval-start/, 'retrieval.start', 'Starting retrieval'),
    stageAlias(/prompt-embed/, 'retrieval.prompt.embed', 'Embedding prompt'),
    stageAlias(/\brank\b/, 'retrieval.primitive.rank', 'Ranking embeddings'),
    stageAlias(/\bretrieval\b|embed/, 'retrieval.index.query', 'Retrieving embeddings'),
    stageAlias(/classification|grounded|intent/, 'grounding.intent', 'Grounding intent'),
    stageAlias(/compile|simulation/, 'simulation.compile', 'Compiling simulation'),
    stageAlias(/visual/, 'visual.visual-ir', 'Building VisualIR'),
    stageAlias(/render/, 'render.first-frame', 'Rendering scene'),
    stageAlias(/^(ready|done|complete)$/, 'render.ready', 'Ready'),
  ]);
  const STAGE_ESTIMATES = Object.freeze({
    'runtime.manifest.fetch': 0.1,
    'runtime.index.fetch': 0.5,
    'runtime.module.import': 0.18,
    'runtime.cache.storage': 0.12,
    'runtime.cache.file': 0.35,
    'runtime.cache.read': 0.62,
    'runtime.cache.hit': 0.62,
    'runtime.cache.ready': 0.75,
    'runtime.cache.skip': 0.75,
    'runtime.model.load': 0.82,
    'runtime.model.reuse': 0.86,
    'runtime.model.probe': 0.9,
    'runtime.model.ready': 0.92,
    'runtime.reranker.load': 0.86,
    'runtime.reranker.probe': 0.9,
    'runtime.reranker.ready': 0.92,
    'runtime.ready': 1,
    'language.parse': 0.7,
	    'retrieval.prompt.embed': 0.25,
	    'retrieval.scene.query-plan': 0.18,
	    'retrieval.start': 0.12,
	    'retrieval.index.query': 0.55,
	    'retrieval.primitive.rank': 0.75,
	    'retrieval.slot.embed': 0.82,
	    'retrieval.slot.rank': 0.9,
    'activation.span.cache': 0.2,
    'activation.span.embed': 0.55,
    'activation.span.rank': 0.75,
    'activation.span.refined': 0.82,
    'activation.cloud': 0.9,
    'grounding.intent': 0.8,
    'simulation.compile': 0.75,
    'visual.visual-ir': 0.72,
    'render.first-frame': 0.75,
    'render.ready': 1,
    'render.blank': 1,
  });

  function phaseRule(step, id, label, weight, stagePrefixes) {
    return Object.freeze({ step, id, label, weight, stagePrefixes });
  }

  function stageAlias(match, id, label) {
    return Object.freeze({ match, id, label });
  }

  function phaseOffsets(phases) {
    const offsets = {};
    let offset = 0;
    phases.forEach((phase) => {
      offsets[phase.id] = offset;
      offset += phase.weight;
    });
    return offsets;
  }

  function createController(options = {}) {
    const view = options.view || root;
    let state = initialState(options.initialState || {});
    let pending = false;
    let heartbeatTimer = 0;
    let lastEvent = null;
    let activeLoaderReceiptKey = '';
    let activeLoaderReceipt = null;
    const observers = new Set();
    const events = [];
    const loaderReceipts = [];
    const setTimer = view && typeof view.setTimeout === 'function'
      ? view.setTimeout.bind(view)
      : null;
    const clearTimer = view && typeof view.clearTimeout === 'function'
      ? view.clearTimeout.bind(view)
      : null;

    function schedule() {
      if (pending) return;
      pending = true;
      const raf = view && typeof view.requestAnimationFrame === 'function'
        ? view.requestAnimationFrame.bind(view)
        : (callback) => setTimeout(callback, 0);
      raf(flush);
    }

    function flush() {
      pending = false;
      observers.forEach((observer) => observer(state, lastEvent));
    }

    function clearHeartbeat() {
      if (!heartbeatTimer || !clearTimer) return;
      clearTimer(heartbeatTimer);
      heartbeatTimer = 0;
    }

    function scheduleHeartbeat() {
      if (!setTimer) return;
      if (!(state.state === 'active' && state.blocking !== false)) {
        clearHeartbeat();
        return;
      }
      if (heartbeatTimer) return;
      heartbeatTimer = setTimer(() => {
        heartbeatTimer = 0;
        if (!(state.state === 'active' && state.blocking !== false)) return;
        state = heartbeatRuntimeProgressState(state, view);
        schedule();
        scheduleHeartbeat();
      }, HEARTBEAT_MS);
    }

    function publish(rawEvent = {}) {
      const event = normalizeEvent(rawEvent, state.runId);
      if (shouldIgnoreCompletedRunActiveEvent(state, event)) return state;
      lastEvent = event;
      events.push(event);
      while (events.length > MAX_EVENT_HISTORY) events.shift();
      const previous = state;
      state = reduceRuntimeProgress(state, event);
      const loaderReceipt = updateLoaderPhaseReceipts(previous, state, event);
      if (loaderReceipt) {
        state = {
          ...state,
          loaderReceipt: copyLoaderReceipt(loaderReceipt),
          loaderReceipts: loaderReceipts.slice(-12).map((receipt) => ({ ...receipt })),
        };
      }
      logRuntimeProgress(view, event);
      schedule();
      scheduleHeartbeat();
      return state;
    }

    function subscribe(observer, options = {}) {
      if (typeof observer !== 'function') return () => {};
      observers.add(observer);
      if (options.replay !== false) observer(state, lastEvent);
      return () => observers.delete(observer);
    }

    return {
      publish,
      subscribe,
      flush,
      setRunId(runId) {
        state = { ...state, runId: String(runId || '') };
      },
      state() {
        return state;
      },
      events() {
        return events.slice();
      },
      receipts() {
        return loaderReceipts.map((receipt) => ({ ...receipt }));
      },
      isBusy() {
        return state.state === 'active' && state.blocking !== false;
      },
    };

    function updateLoaderPhaseReceipts(previous, next, event) {
      if (!next || !event) return null;
      const timestampMs = eventTimestampMs(event, next.lastEventAt);
      if (next.passive) {
        const passiveReceipt = createLoaderReceipt(next, event, timestampMs, 'complete', loaderReceipts.length + 1);
        updateLoaderReceipt(passiveReceipt, next, event, timestampMs);
        appendLoaderReceipt(passiveReceipt);
        return passiveReceipt;
      }
      const receiptKey = loaderReceiptKey(next);
      if (!receiptKey) return null;
      if (activeLoaderReceipt && activeLoaderReceiptKey && activeLoaderReceiptKey !== receiptKey) {
        closeLoaderReceipt(activeLoaderReceipt, 'complete', timestampMs, previous);
      }
      if (!activeLoaderReceipt || activeLoaderReceiptKey !== receiptKey) {
        activeLoaderReceipt = createLoaderReceipt(next, event, timestampMs, 'active', loaderReceipts.length + 1);
        activeLoaderReceiptKey = receiptKey;
        appendLoaderReceipt(activeLoaderReceipt);
      }
      updateLoaderReceipt(activeLoaderReceipt, next, event, timestampMs);
      if (next.state === 'ready') {
        closeLoaderReceipt(activeLoaderReceipt, 'complete', timestampMs, next);
        activeLoaderReceiptKey = '';
      } else if (next.state === 'error') {
        closeLoaderReceipt(activeLoaderReceipt, 'error', timestampMs, next);
        activeLoaderReceiptKey = '';
      }
      return activeLoaderReceipt;
    }

    function appendLoaderReceipt(receipt) {
      if (!receipt) return;
      loaderReceipts.push(receipt);
      while (loaderReceipts.length > MAX_LOADER_RECEIPTS) loaderReceipts.shift();
    }
  }

  function shouldIgnoreCompletedRunActiveEvent(current = initialState(), event = {}) {
    if (!current || current.state !== 'ready') return false;
    if (event.allowAfterReady === true) return false;
    if (event.state === 'ready' || event.state === 'error') return false;
    if (String(event.runId || '') !== String(current.runId || '')) return false;
    const stage = canonicalStage(event);
    const phase = phaseForStage(stage, event);
    const percent = eventPercent(event, stage, phase);
    const passive = passiveEvent(event, stage);
    if (passive) return false;
    const nextState = event.state || stateForEvent(event, stage, percent, passive, current);
    return nextState === 'active';
  }

  function loaderReceiptKey(state = {}) {
    const phaseId = state.phase && state.phase.id || '';
    const kind = state.resource && state.resource.kind || '';
    const modelId = state.model && state.model.id || '';
    const runId = state.runId || 'runtime';
    return [runId, state.stage || DEFAULT_STAGE, phaseId, kind || modelId].join(':');
  }

  function createLoaderReceipt(state = {}, event = {}, timestampMs = 0, status = 'active', ordinal = 1) {
    const startedAt = isoFromTimestamp(timestampMs, event.timestamp);
    const receipt = {
      schema: LOADER_RECEIPT_SCHEMA,
      id: `loader-${Math.max(1, Number(ordinal || 1))}`,
      runId: String(state.runId || ''),
      stage: state.stage || DEFAULT_STAGE,
      sourceStage: state.sourceStage || '',
      phaseId: state.phase && state.phase.id || '',
      phaseLabel: state.phase && state.phase.label || '',
      pipelineStep: state.phase && state.phase.step || 0,
      label: state.label || runtimeStageLabel(state.stage, state.phase, state),
      subline: state.subline || '',
      status,
      state: state.state || '',
      blocking: state.blocking === true,
      indeterminate: state.indeterminate === true,
      startedAt,
      updatedAt: startedAt,
      completedAt: status === 'active' ? '' : startedAt,
      durationMs: 0,
      percentStart: boundedProgress(state.progress || 0),
      percentEnd: boundedProgress(state.progress || 0),
      completedBytes: numericMetric(state.resource && state.resource.completedBytes),
      totalBytes: numericMetric(state.resource && state.resource.totalBytes),
      byteLength: numericMetric(state.resource && state.resource.byteLength),
      byteText: state.byteText || '',
      sourceText: state.sourceText || '',
      byteProgress: state.byteProgress || '',
      source: state.source || '',
      cacheMode: state.resource && state.resource.cacheMode || '',
      resourceKind: state.resource && state.resource.kind || '',
      resourceFile: state.resource && state.resource.file || '',
      resourceUrl: state.resource && state.resource.url || '',
      modelId: state.model && state.model.id || '',
      modelBaseUrl: state.model && state.model.baseUrl || '',
      eventCount: 0,
    };
    return receipt;
  }

  function updateLoaderReceipt(receipt, state = {}, event = {}, timestampMs = 0) {
    if (!receipt) return null;
    const updatedAt = isoFromTimestamp(timestampMs, event.timestamp);
    receipt.updatedAt = updatedAt;
    receipt.durationMs = durationSinceIso(receipt.startedAt || updatedAt, timestampMs);
    receipt.state = state.state || receipt.state || '';
    receipt.blocking = state.blocking === true;
    receipt.indeterminate = state.indeterminate === true;
    receipt.label = state.label || receipt.label || runtimeStageLabel(state.stage, state.phase, state);
    receipt.subline = longerRuntimeText(receipt.subline, state.subline);
    receipt.percentEnd = boundedProgress(state.progress || receipt.percentEnd || 0);
    receipt.completedBytes = Math.max(
      numericMetric(receipt.completedBytes),
      numericMetric(state.resource && state.resource.completedBytes)
    );
    receipt.totalBytes = Math.max(
      numericMetric(receipt.totalBytes),
      numericMetric(state.resource && state.resource.totalBytes)
    );
    receipt.byteLength = Math.max(
      numericMetric(receipt.byteLength),
      numericMetric(state.resource && state.resource.byteLength)
    );
    receipt.byteText = state.byteText || receipt.byteText || '';
    receipt.sourceText = state.sourceText || receipt.sourceText || '';
    receipt.byteProgress = receipt.byteProgress === 'known'
      ? 'known'
      : state.byteProgress || receipt.byteProgress || '';
    receipt.source = state.source || receipt.source || '';
    receipt.cacheMode = state.resource && state.resource.cacheMode || receipt.cacheMode || '';
    receipt.resourceKind = state.resource && state.resource.kind || receipt.resourceKind || '';
    receipt.resourceFile = state.resource && state.resource.file || receipt.resourceFile || '';
    receipt.resourceUrl = state.resource && state.resource.url || receipt.resourceUrl || '';
    receipt.modelId = state.model && state.model.id || receipt.modelId || '';
    receipt.modelBaseUrl = state.model && state.model.baseUrl || receipt.modelBaseUrl || '';
    receipt.eventCount = Number(receipt.eventCount || 0) + 1;
    return receipt;
  }

  function closeLoaderReceipt(receipt, status, timestampMs = 0, state = {}) {
    if (!receipt) return null;
    receipt.status = status || 'complete';
    receipt.completedAt = isoFromTimestamp(timestampMs);
    receipt.updatedAt = receipt.completedAt;
    receipt.durationMs = durationSinceIso(receipt.startedAt || receipt.completedAt, timestampMs);
    if (state && Number.isFinite(Number(state.progress))) {
      receipt.percentEnd = boundedProgress(state.progress);
    }
    return receipt;
  }

  function copyLoaderReceipt(receipt) {
    return receipt && typeof receipt === 'object' ? { ...receipt } : null;
  }

  function connect(rootDocument, options = {}) {
    const doc = rootDocument || root && root.document;
    const view = doc && doc.defaultView || root;
    const controller = createController({ view });
    const elements = runtimeElements(doc);
    controller.subscribe(createRuntimeStripObserver(elements));
    controller.subscribe(createLoadingCanvasObserver(options.loadingCanvas || null));
    controller.subscribe(createRunButtonObserver(options.runButton || runtimeRunButton(elements.node)));
    controller.subscribe(createRuntimeHealthObserver(elements.node, view));
    return controller;
  }

  function initialState(seed = {}) {
    return {
      schema: STATE_SCHEMA,
      runId: String(seed.runId || ''),
      state: seed.state || 'idle',
      blocking: false,
      passive: false,
      canvasLoading: false,
      indeterminate: false,
      phase: RUNTIME_PHASES[0],
      stage: DEFAULT_STAGE,
      sourceStage: '',
      progress: 0,
      line: '',
      displayLine: '',
      heartbeatLine: '',
      heartbeatTick: 0,
      silenceMs: 0,
      label: '',
      subline: '',
      byteText: '',
      sourceText: '',
      byteProgress: '',
      lastEventAt: 0,
      activity: '',
      message: '',
      detail: '',
      backend: '',
      source: '',
      model: {},
      resource: {},
      embeddings: {},
      timing: {},
      promptRuntime: null,
      loaderReceipt: null,
      loaderReceipts: [],
    };
  }

  function reduceRuntimeProgress(previous = initialState(), rawEvent = {}) {
    const event = normalizeEvent(rawEvent, previous.runId);
    const stage = canonicalStage(event);
    const phase = phaseForStage(stage, event);
    const rawPercent = eventPercent(event, stage, phase);
    const percent = monotonicEventPercent(previous, event, rawPercent);
    const passive = passiveEvent(event, stage);
    const state = event.state || stateForEvent(event, stage, percent, passive, previous);
    const loading = !passive && state === 'active';
    const indeterminate = loading && !hasMeasuredProgress(event);
    const canvasLoading = loading && event.canvasLoading !== false;
    const message = compactRuntimeMessage(event.message || stage);
    const line = runtimeLineText(event, stage, phase, percent);
    const eventAt = eventTimestampMs(event, previous.lastEventAt);
    const label = runtimeStageLabel(stage, phase, event);
    const byteText = runtimeBytePairText(event);
    const sourceText = runtimeSourceText(event, stage);
    const byteProgress = runtimeByteProgressState(event, stage, loading);
    const subline = runtimeSublineText(event, stage, byteText, sourceText);
    const activity = runtimeActivityText(stage, phase, event);
    const nextState = {
      schema: STATE_SCHEMA,
      runId: String(event.runId || previous.runId || ''),
      state,
      blocking: loading,
      passive,
      canvasLoading,
      indeterminate,
      phase,
      stage,
      sourceStage: String(event.stage || event.phase || ''),
      progress: percent,
      line,
      displayLine: line,
      heartbeatLine: '',
      heartbeatTick: 0,
      silenceMs: 0,
      label,
      subline,
      byteText,
      sourceText,
      byteProgress,
      lastEventAt: eventAt,
      activity,
      message,
      detail: String(event.detail || event.message || stage || ''),
      backend: String(event.backend || ''),
      source: String(event.source || ''),
      model: modelReceipt(event),
      resource: resourceReceipt(event),
      embeddings: embeddingReceipt(event),
      timing: timingReceipt(event),
      promptRuntime: compactObject(event.promptRuntimeReceipt || null, 24),
      loaderReceipt: previous.loaderReceipt || null,
      loaderReceipts: Array.isArray(previous.loaderReceipts) ? previous.loaderReceipts.slice(-12) : [],
    };
    return passive ? passiveRuntimeProgressState(previous, event, nextState) : nextState;
  }

  function passiveRuntimeProgressState(previous = initialState(), event = {}, receiptState = {}) {
    const current = previous || initialState();
    return {
      ...current,
      schema: STATE_SCHEMA,
      runId: String(event.runId || current.runId || ''),
      lastEventAt: eventTimestampMs(event, current.lastEventAt),
      heartbeatLine: '',
      heartbeatTick: 0,
      silenceMs: 0,
      label: current.label || receiptState.label || '',
      subline: receiptState.subline || current.subline || '',
      byteText: receiptState.byteText || current.byteText || '',
      sourceText: receiptState.sourceText || current.sourceText || '',
      byteProgress: receiptState.byteProgress || current.byteProgress || '',
      source: String(event.source || current.source || ''),
      model: mergeRuntimeReceipt(current.model, receiptState.model),
      resource: mergeRuntimeReceipt(current.resource, receiptState.resource),
      embeddings: mergeRuntimeReceipt(current.embeddings, receiptState.embeddings),
      timing: mergeRuntimeReceipt(current.timing, receiptState.timing),
      promptRuntime: current.promptRuntime || receiptState.promptRuntime || null,
      loaderReceipt: current.loaderReceipt || receiptState.loaderReceipt || null,
      loaderReceipts: Array.isArray(current.loaderReceipts) ? current.loaderReceipts.slice(-12) : [],
    };
  }

  function mergeRuntimeReceipt(previous = {}, next = {}) {
    const meaningful = Object.fromEntries(Object.entries(next || {}).filter((entry) => (
      entry[1] !== '' &&
      entry[1] !== null &&
      entry[1] !== undefined &&
      entry[1] !== false &&
      entry[1] !== 0
    )));
    return compactObject({ ...(previous || {}), ...meaningful }, 24) || {};
  }

  function normalizeEvent(rawEvent = {}, runId = '') {
    const event = rawEvent && typeof rawEvent === 'object' ? rawEvent : {};
    return {
      schema: EVENT_SCHEMA,
      timestamp: event.timestamp || new Date().toISOString(),
      runId: event.runId || runId || '',
      ...event,
    };
  }

  function heartbeatRuntimeProgressState(previous = initialState(), view) {
    const current = previous || initialState();
    const now = nowMs(view);
    const lastEventAt = Number(current.lastEventAt || now);
    const silenceMs = Math.max(0, now - lastEventAt);
    const heartbeatLine = silenceMs >= STALE_EVENT_MS ? runtimeHeartbeatLine(current) : '';
    return {
      ...current,
      heartbeatTick: Number(current.heartbeatTick || 0) + 1,
      silenceMs,
      heartbeatLine,
      displayLine: heartbeatLine || current.line || current.message || '',
    };
  }

  function canonicalStage(event = {}) {
    if (event.state === 'error') return 'error';
    const raw = String(event.stage || event.phase || DEFAULT_STAGE).toLowerCase();
    const match = STAGE_ALIASES.find((alias) => alias.match.test(raw));
    return match ? match.id : raw.replace(/[^a-z0-9.:-]+/g, '-');
  }

  function phaseForStage(stage, event = {}) {
    if (event.state === 'error' || stage === 'error') {
      return { step: 0, id: 'error', label: 'Runtime error', weight: 0 };
    }
    const match = RUNTIME_PHASES.find((phase) => (
      phase.stagePrefixes.some((prefix) => stage === prefix || stage.startsWith(prefix))
    ));
    return match || RUNTIME_PHASES[0];
  }

  function eventPercent(event, stage, phase) {
    if (event.state === 'ready' || /render\.(ready|blank)/.test(stage)) return 100;
    if (event.state === 'error' || stage === 'error') return 0;
    const raw = Number(event.percent);
    if (Number.isFinite(raw)) return boundedProgress(raw);
    const measured = measuredFraction(event);
    if (measured !== null) return weightedPercent(phase, measured);
    return weightedPercent(phase, STAGE_ESTIMATES[stage] ?? 0.18);
  }

  function monotonicEventPercent(previous = initialState(), event = {}, percent = 0) {
    const next = boundedProgress(percent);
    if (!previous || previous.state !== 'active') return next;
    if (event.state === 'error' || event.state === 'ready') return next;
    if (event.resetProgress === true) return next;
    const previousRunId = String(previous.runId || '');
    const nextRunId = String(event.runId || previousRunId || '');
    if (previousRunId && nextRunId && previousRunId !== nextRunId) return next;
    return Math.max(boundedProgress(previous.progress || 0), next);
  }

  function measuredFraction(event = {}) {
    const completed = Number(event.completed);
    const total = Number(event.total);
    if (Number.isFinite(completed) && Number.isFinite(total) && total > 0) {
      return clamp01(completed / total);
    }
    const completedBytes = Number(event.completedBytes);
    const totalBytes = Number(event.totalBytes);
    if (Number.isFinite(completedBytes) && Number.isFinite(totalBytes) && totalBytes > 0) {
      return clamp01(completedBytes / totalBytes);
    }
    const embeddedSpanCount = Number(event.embeddedSpanCount);
    const spanCount = Number(event.spanCount);
	    if (Number.isFinite(embeddedSpanCount) && Number.isFinite(spanCount) && spanCount > 0) {
	      return clamp01(embeddedSpanCount / spanCount);
	    }
	    const embeddedSlotCount = Number(event.embeddedSlotCount || event.completedSlotCount);
	    const slotCount = Number(event.slotCount || event.querySlotCount);
	    if (Number.isFinite(embeddedSlotCount) && Number.isFinite(slotCount) && slotCount > 0) {
	      return clamp01(embeddedSlotCount / slotCount);
	    }
	    return null;
	  }

  function hasMeasuredProgress(event = {}) {
    if (measuredFraction(event) !== null) return true;
    return Number.isFinite(Number(event.percent));
  }

  function weightedPercent(phase, fraction) {
    const offset = PHASE_OFFSETS[phase.id] || 0;
    return boundedProgress(offset + phase.weight * clamp01(fraction));
  }

  function boundedProgress(value) {
    return Math.min(100, Math.max(0, Math.trunc(Number(value || 0) + 0.5)));
  }

  function passiveEvent(event = {}, stage = '') {
    if (event.nonBlocking === true || event.blocking === false) return true;
    if (event.state === 'error' || event.state === 'ready') return false;
    return false;
  }

  function stateForEvent(event, stage, percent, passive, previous) {
    if (stage === 'error') return 'error';
    if (percent >= 100) return 'ready';
    if (passive) return previous.state || 'ready';
    return 'active';
  }

  function runtimeLineText(event, stage, phase, percent) {
    const timing = runtimeTimingSuffix(event);
    const resource = runtimeResourceSuffix(event, stage);
    if (event.state === 'error' || stage === 'error') return 'Intent model failed';
    if (event.state === 'ready' && phase.id === 'prompt-runtime') {
      return 'Prompt runtime ready 100%';
    }
    if (event.state === 'ready' || percent >= 100 || /render\.(ready|blank)/.test(stage)) {
      return 'Ready 100%';
    }
    const label = runtimeStageLabel(stage, phase, event);
    return `${label} ${percent}%${resource}${timing}`;
  }

  function runtimeDisplayLine(state = {}) {
    return state.displayLine || state.heartbeatLine || state.line || state.message || '';
  }

  function runtimeTitleText(state = {}) {
    if (state.heartbeatLine) return state.heartbeatLine;
    if (state.label) return state.label;
    return runtimeDisplayLine(state);
  }

  function runtimeHeartbeatLine(state = {}) {
    const activity = lowerFirst(state.activity || runtimeStageLabel(state.stage, state.phase, state));
    const percent = boundedProgress(state.progress || 0);
    const resource = runtimeResourceSuffix(state.resource || {}, state.stage);
    if (state.indeterminate) return `Still ${activity}`;
    return `Still ${activity} ${percent}%${resource}`;
  }

  function runtimeStageLabel(stage, phase = {}, event = {}) {
    const kind = String(event.resourceKind || event.resource && event.resource.kind || '').toLowerCase();
    const file = String(event.file || event.resourceFile || event.resource && event.resource.file || '').toLowerCase();
    const text = `${kind} ${file}`;
    if (stage === 'runtime.cache.file') {
      if (/reranker/.test(text)) return 'Downloading reranker model';
      if (/embedding|embed/.test(text)) return 'Downloading embedding model';
      return 'Downloading model weights';
    }
    if (stage === 'runtime.cache.read' || stage === 'runtime.cache.hit') {
      if (/reranker/.test(text)) return 'Reading reranker cache';
      if (/embedding|embed/.test(text)) return 'Reading embedding cache';
      return 'Reading cache';
    }
    if (stage === 'runtime.model.load') return 'Loading embedding model';
    if (stage === 'runtime.reranker.load') return 'Loading reranker';
    if (stage === 'runtime.model.probe') return 'Verifying embedding model';
    if (stage === 'runtime.reranker.probe') return 'Verifying reranker';
    if (stage === 'runtime.ready') return 'Verifying runtime';
    const match = STAGE_ALIASES.find((alias) => alias.id === stage);
    return match ? match.label : phase.label || 'Intent runtime';
  }

  function runtimeActivityText(stage, phase = {}, event = {}) {
    const label = runtimeStageLabel(stage, phase, event);
    const normalized = lowerFirst(label);
    if (/ready$/.test(stage || '')) return normalized;
    if (/^loading|^caching|^reading|^opening|^preparing|^verifying|^embedding|^ranking|^checking|^refining|^building|^grounding|^compiling|^rendering|^retrieving|^reusing|^starting/.test(normalized)) {
      return normalized;
    }
    return normalized;
  }

  function createRuntimeStripObserver(elements = {}) {
    let lastKey = '';
    return (state) => {
      const node = elements.node;
      if (!node || !node.dataset) return;
      const loadingVisual = state.canvasLoading ? 'snake' : state.blocking ? 'simple' : 'idle';
      const displayLine = runtimeDisplayLine(state);
      const titleLine = runtimeTitleText(state);
      const subline = state.subline || state.byteText || state.sourceText || '';
      const heartbeatActive = Boolean(state.heartbeatLine);
      const key = [
        state.state,
        state.progress,
        state.indeterminate,
        state.stage,
        displayLine,
        titleLine,
        subline,
        state.heartbeatTick,
        loadingVisual,
        state.byteProgress,
      ].join('|');
      if (key === lastKey) return;
      lastKey = key;
      node.dataset.state = state.state;
      node.dataset.progress = state.indeterminate ? 'indeterminate' : 'determinate';
      node.dataset.loadingVisual = loadingVisual;
      node.dataset.stage = state.phase.id;
      node.dataset.pipelineStep = String(state.phase.step);
      node.dataset.detail = String(state.line || '');
      node.dataset.displayLine = String(displayLine || '');
      node.dataset.label = String(state.label || '');
      node.dataset.subline = String(subline || '');
      node.dataset.byteText = String(state.byteText || '');
      node.dataset.sourceText = String(state.sourceText || '');
      node.dataset.byteProgress = String(state.byteProgress || '');
      node.dataset.activity = String(state.activity || '');
      node.dataset.heartbeat = heartbeatActive ? 'true' : 'false';
      node.dataset.silenceMs = String(Math.trunc(Number(state.silenceMs || 0)));
      node.dataset.lastStage = state.sourceStage || state.stage;
      node.dataset.lastMessage = String(state.message || '');
      node.dataset.lastLine = String(state.line || '');
      node.dataset.lastSource = String(state.source || '');
      node.dataset.backend = String(state.backend || '');
      node.dataset.blocking = state.blocking ? 'true' : 'false';
      node.dataset.passive = state.passive ? 'true' : 'false';
      node.dataset.loaderReceipt = state.loaderReceipt
        ? JSON.stringify(state.loaderReceipt).slice(0, 2400)
        : '';
      node.style.setProperty('--runtime-progress', `${state.progress}%`);
      node.title = [titleLine, subline].filter(Boolean).join(' - ');
      if (elements.title) elements.title.textContent = titleLine;
      if (elements.percent) elements.percent.textContent = runtimePercentText(state);
      if (elements.fill) elements.fill.style.width = `${state.indeterminate ? 38 : state.progress}%`;
      if (elements.message) elements.message.textContent = subline || state.message;
      if (elements.stage) elements.stage.textContent = subline || state.phase.label;
      const doc = node.ownerDocument;
      if (doc && doc.documentElement) {
        doc.documentElement.dataset.canvasLoading = state.canvasLoading ? 'snake' : 'idle';
      }
    };
  }

  function createLoadingCanvasObserver(loadingCanvas) {
    let lastKey = '';
    return (state) => {
      if (!loadingCanvas || typeof loadingCanvas.setLoading !== 'function') return;
      const key = [
        state.canvasLoading,
        state.progress,
        state.stage,
        state.indeterminate,
        Boolean(state.heartbeatLine),
        state.byteProgress,
      ].join(':');
      if (key === lastKey) return;
      lastKey = key;
      loadingCanvas.setLoading(state.canvasLoading, state.progress, state.stage, {
        heartbeat: Boolean(state.heartbeatLine),
        indeterminate: state.indeterminate || state.byteProgress === 'unknown' || state.byteProgress === 'unknown-total',
      });
    };
  }

  function createRunButtonObserver(runButton) {
    return (state) => {
      if (!runButton) return;
      const loading = state.blocking === true;
      runButton.classList.toggle('is-loading', loading);
      runButton.disabled = loading;
      runButton.setAttribute('aria-disabled', loading ? 'true' : 'false');
      runButton.setAttribute('aria-busy', loading ? 'true' : 'false');
    };
  }

  function createRuntimeHealthObserver(node, view) {
    return (state, event = {}) => {
      if (!node || !node.dataset) return;
      const health = runtimeHealth(state, event || {});
      if (view) {
        const events = Array.isArray(view.__simulatteIntentRuntimeEvents)
          ? view.__simulatteIntentRuntimeEvents
          : [];
        events.push(health);
        while (events.length > 80) events.shift();
        view.__simulatteIntentRuntimeEvents = events;
        view.SimulatteIntentRuntimeHealth = health;
        if (state.loaderReceipt) {
          const receipts = Array.isArray(view.__simulatteLoaderPhaseReceipts)
            ? view.__simulatteLoaderPhaseReceipts
            : [];
          const previous = receipts[receipts.length - 1];
          if (!previous || previous.id !== state.loaderReceipt.id || previous.updatedAt !== state.loaderReceipt.updatedAt) {
            receipts.push({ ...state.loaderReceipt });
            while (receipts.length > MAX_LOADER_RECEIPTS) receipts.shift();
          }
          view.__simulatteLoaderPhaseReceipts = receipts;
          view.SimulatteLoaderPhaseReceipts = receipts;
        }
      }
      node.dataset.health = JSON.stringify(health).slice(0, 2400);
      node.dataset.loaderPhaseReceipts = state.loaderReceipts
        ? JSON.stringify(state.loaderReceipts).slice(0, 2400)
        : '';
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
    };
  }

  function runtimeElements(doc) {
    return {
      node: doc && doc.getElementById('intent-runtime'),
      title: doc && doc.getElementById('intent-runtime-title'),
      percent: doc && doc.getElementById('intent-runtime-percent'),
      fill: doc && doc.getElementById('intent-runtime-fill'),
      message: doc && doc.getElementById('intent-runtime-message'),
      stage: doc && doc.getElementById('intent-runtime-stage'),
    };
  }

  function runtimeRunButton(node) {
    return node && node.closest ? node.closest('.physics-panel')?.querySelector('#build-lab') : null;
  }

  function runtimeHealth(state, event = {}) {
    return compactObject({
      schema: HEALTH_SCHEMA,
      timestamp: event.timestamp || new Date().toISOString(),
      source: state.source || '',
      state: state.state || '',
      blocking: state.blocking === true,
      passive: state.passive === true,
      canvasLoading: state.canvasLoading === true,
      stage: state.stage || '',
      phaseId: state.phase && state.phase.id || '',
      phaseLabel: state.phase && state.phase.label || '',
      pipelineStep: state.phase && state.phase.step || 0,
      progress: state.progress || 0,
      line: state.line || '',
      displayLine: runtimeDisplayLine(state),
      label: state.label || '',
      subline: state.subline || '',
      byteText: state.byteText || '',
      sourceText: state.sourceText || '',
      byteProgress: state.byteProgress || '',
      activity: state.activity || '',
      heartbeat: Boolean(state.heartbeatLine),
      silenceMs: numericMetric(state.silenceMs),
      message: state.message || '',
      detail: state.detail || '',
      backend: state.backend || '',
      timing: state.timing,
      model: state.model,
      resource: state.resource,
      embeddings: state.embeddings,
      promptRuntime: state.promptRuntime,
      loaderReceipt: state.loaderReceipt,
    }, 32);
  }

  function modelReceipt(event = {}) {
    return compactObject({
      id: event.modelId || '',
      baseUrl: event.modelBaseUrl || '',
      artifactMode: event.artifactMode || '',
      sourceSizeBytes: numericMetric(event.sourceSizeBytes),
      cachePrefetch: event.cachePrefetch === true,
      cacheSkipReason: event.cacheSkipReason || '',
    }, 12);
  }

  function resourceReceipt(event = {}) {
    return compactObject({
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
      cacheBackends: Array.isArray(event.cacheBackends)
        ? event.cacheBackends.join(',')
        : event.cacheBackends || '',
    }, 12);
  }

  function embeddingReceipt(event = {}) {
    return compactObject({
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
    }, 12);
  }

  function timingReceipt(event = {}) {
    return compactObject({
      timestamp: event.timestamp || '',
      durationMs: numericMetric(event.durationMs),
      elapsedMs: numericMetric(event.elapsedMs),
      timing: event.timing || '',
      traceId: event.traceId || '',
      rankId: event.rankId || 0,
      reuse: event.reuse === true,
      providerReady: event.providerReady === true,
    }, 12);
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

  function runtimeResourceSuffix(event = {}, stage = '') {
    const file = shortRuntimeFile(event.file || event.resourceFile || '');
    const bytes = runtimeBytePairText(event);
    const source = runtimeSourceText(event, stage);
    const parts = [source, file, bytes].filter(Boolean);
    return parts.length > 0 ? ` - ${parts.join(' - ')}` : '';
  }

  function runtimeSublineText(event = {}, stage = '', byteText = '', sourceText = '') {
    const file = shortRuntimeFile(event.file || event.resourceFile || '');
    const kind = runtimeResourceKindText(event.resourceKind || '');
    const timing = Number.isFinite(Number(event.durationMs)) && Number(event.durationMs) > 0
      ? formatRuntimeDuration(event.durationMs)
      : '';
    return [sourceText, kind, file, byteText, timing].filter(Boolean).join(' - ');
  }

  function runtimeSourceText(event = {}, stage = '') {
    const mode = String(event.cacheMode || '').toLowerCase();
    if (mode === 'opfs') return 'OPFS cache';
    if (mode === 'cache-storage') return 'CacheStorage';
    if (mode === 'force-cache') return 'browser cache/network';
    if (mode === 'reload') return 'network';
    if (mode === 'memory') return 'memory cache';
    if (/cache\.(read|hit|ready|verify)/.test(stage)) return 'cache';
    if (stage === 'runtime.cache.file') return 'network';
    return '';
  }

  function runtimeResourceKindText(value = '') {
    return String(value || '')
      .replace(/^intent-/, 'intent ')
      .replace(/^primitive-/, 'primitive ')
      .replace(/^surface-card-/, 'surface card ')
      .replace(/^universe-/, 'universe ')
      .replace(/-/g, ' ')
      .trim();
  }

  function runtimeBytePairText(event = {}) {
    const completed = Number(event.completedBytes);
    const total = Number(event.totalBytes);
    if (Number.isFinite(completed) && Number.isFinite(total) && total > 0) {
      return `${formatRuntimeBytes(completed)} / ${formatRuntimeBytes(total)}`;
    }
    if (Number.isFinite(completed) && completed > 0) return formatRuntimeBytes(completed);
    return '';
  }

  function runtimeByteProgressState(event = {}, stage = '', loading = false) {
    if (!loading) return '';
    const completed = Number(event.completedBytes);
    const total = Number(event.totalBytes);
    if (Number.isFinite(completed) && Number.isFinite(total) && total > 0) return 'known';
    if (Number.isFinite(completed) && completed > 0) return 'unknown-total';
    if (/runtime\.(cache|model|reranker|manifest|index)|retrieval/.test(stage || '')) return 'unknown';
    return '';
  }

  function shortRuntimeFile(value) {
    const name = String(value || '').split(/[\\/]/).filter(Boolean).pop() || '';
    if (name.length <= 32) return name;
    return `${name.slice(0, 14)}...${name.slice(-14)}`;
  }

  function formatRuntimeBytes(value) {
    const bytes = Math.max(0, Number(value || 0));
    if (bytes >= 1024 * 1024 * 1024) return formatRuntimeByteUnit(bytes, 1024 * 1024 * 1024, 'GB');
    if (bytes >= 1024 * 1024) return formatRuntimeByteUnit(bytes, 1024 * 1024, 'MB');
    if (bytes >= 1024) return formatRuntimeByteUnit(bytes, 1024, 'KB');
    return `${Math.round(bytes)} B`;
  }

  function formatRuntimeByteUnit(bytes, divisor, suffix) {
    const value = bytes / divisor;
    const rounded = value >= 10 ? String(Math.round(value)) : value.toFixed(1).replace(/\.0$/, '');
    return `${rounded} ${suffix}`;
  }

  function runtimePercentText(state = {}) {
    if (state.state === 'idle') return '';
    if (state.indeterminate) return 'working';
    return `${boundedProgress(state.progress || 0)}%`;
  }

  function eventTimestampMs(event = {}, fallback = 0) {
    const raw = event.timestamp;
    if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
    const parsed = Date.parse(String(raw || ''));
    if (Number.isFinite(parsed)) return parsed;
    return Number(fallback || 0);
  }

  function isoFromTimestamp(timestampMs = 0, fallback = '') {
    const numeric = Number(timestampMs);
    if (Number.isFinite(numeric) && numeric > 0) return new Date(numeric).toISOString();
    const parsed = Date.parse(String(fallback || ''));
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
    return new Date().toISOString();
  }

  function durationSinceIso(startedAt = '', timestampMs = 0) {
    const start = Date.parse(String(startedAt || ''));
    const end = Number(timestampMs);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
    return Math.max(0, end - start);
  }

  function nowMs(view) {
    if (view && Number.isFinite(Number(view.__simulatteNow))) {
      return Number(view.__simulatteNow);
    }
    if (view && view.performance && Number.isFinite(Number(view.performance.timeOrigin)) &&
      typeof view.performance.now === 'function') {
      return Number(view.performance.timeOrigin) + Number(view.performance.now());
    }
    return Date.now();
  }

  function lowerFirst(value) {
    const text = String(value || '').trim();
    if (!text) return '';
    return text.charAt(0).toLowerCase() + text.slice(1);
  }

  function longerRuntimeText(previous = '', next = '') {
    const a = String(previous || '');
    const b = String(next || '');
    return b.length > a.length ? b : a;
  }

  function formatRuntimeDuration(value) {
    const ms = Number(value);
    if (!Number.isFinite(ms)) return '';
    if (ms < 1000) return `${Math.max(0, Math.round(ms))}ms`;
    return `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)}s`;
  }

  function compactRuntimeMessage(message) {
    const text = String(message || '').trim();
    if (!text) return 'Intent model busy';
    if (/attention_small\.wgsl|activationDtype|kvDtype|kvcache/i.test(text)) {
      return 'Runtime dtype mismatch';
    }
    if (/CacheStorage|persistent model storage|model cache unavailable/i.test(text)) {
      return 'Model cache unavailable';
    }
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

  function logRuntimeProgress(view, event = {}) {
    if (!traceEnabled(view) || !view || !view.console || typeof view.console.info !== 'function') return;
    const payload = { ...(event || {}) };
    delete payload.rawEvent;
    view.console.info('[simulatte.runtime]', payload.stage || 'event', payload);
  }

  function traceEnabled(view) {
    try {
      const search = view && view.location && view.location.search || '';
      const params = new URLSearchParams(search);
      return ['traceIntent', 'debugIntent', 'traceEmbeddings', 'debugTimings', 'logTimings']
        .some((name) => /^(1|true|on|yes|debug|trace)$/i.test(String(params.get(name) || '')));
    } catch (_error) {
      return false;
    }
  }

  function compactObject(value, maxKeys = 16) {
    if (!value || typeof value !== 'object') return null;
    if (Array.isArray(value)) return value.slice(0, maxKeys).map((row) => compactObject(row, 8));
    return Object.fromEntries(Object.entries(value).slice(0, maxKeys).map(([key, row]) => {
      if (Array.isArray(row)) return [key, row.slice(0, maxKeys).map((item) => compactObject(item, 8))];
      if (row && typeof row === 'object') return [key, compactObject(row, 8)];
      return [key, row];
    }));
  }

  function numericMetric(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  function clamp01(value) {
    return Math.max(0, Math.min(1, Number.isFinite(Number(value)) ? Number(value) : 0));
  }

  return {
    EVENT_SCHEMA,
    STATE_SCHEMA,
    LOADER_RECEIPT_SCHEMA,
    RUNTIME_PHASES,
    connect,
    createController,
    createLoadingCanvasObserver,
    createRunButtonObserver,
    createRuntimeHealthObserver,
    createRuntimeStripObserver,
    initialState,
    reduceRuntimeProgress,
  };
});
