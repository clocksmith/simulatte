(function attachSimulatteRuntimeProgress(root, factory) {
  const isCjs = typeof module === 'object' && module.exports;
  const support = isCjs
    ? require('./runtime-progress-support.js')
    : root.SimulatteRuntimeProgressSupport;
  const progressState = isCjs
    ? require('./runtime-progress-state.js')
    : root.SimulatteRuntimeProgressState;
  const api = factory(support, progressState, root);
  root.SimulatteRuntimeProgress = api;
  if (isCjs) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createRuntimeProgress(support, progressState, root) {
  if (!support || !progressState) {
    throw new Error('SimulatteRuntimeProgress requires runtime-progress-support.js and runtime-progress-state.js to load first.');
  }
  const {
    EVENT_SCHEMA,
    STATE_SCHEMA,
    HEALTH_SCHEMA,
    LOADER_RECEIPT_SCHEMA,
    PROGRESS_LOG_SCHEMA,
    TIMING_PROFILE_SCHEMA,
    DEFAULT_STAGE,
    HEARTBEAT_MS,
    MAX_EVENT_HISTORY,
    MAX_LOADER_RECEIPTS,
    MAX_PROGRESS_LOGS,
    createRuntimeTimingProfile,
    loadRuntimeTimingProfile,
    saveRuntimeTimingProfile,
    recordRuntimeTaskDuration,
    recordRuntimeRunDuration,
    eventTimestampMs,
    isoFromTimestamp,
    durationSinceIso,
    nowMs,
    longerRuntimeText,
    logRuntimeProgress,
    runtimePercentText,
    compactObject,
    numericMetric,
  } = support;
  const {
    RUNTIME_PHASES,
    initialState,
    reduceRuntimeProgress,
    heartbeatRuntimeProgressState,
    normalizeEvent,
    boundedProgress,
    runtimeLineText,
    runtimeDisplayLine,
    runtimeTitleText,
    runtimeStageLabel,
    shouldIgnoreCompletedRunActiveEvent,
  } = progressState;

  function createController(options = {}) {
    const view = options.view || root;
    let state = initialState(options.initialState || {});
    let pending = false;
    let heartbeatTimer = 0;
    let heartbeatDueAtMs = 0;
    let lastEvent = null;
    let activeLoaderReceiptKey = '';
    let activeLoaderReceipt = null;
    let runStartedAtMs = 0;
    let lastProgressLogAtMs = 0;
    let progressLogSequence = 0;
    let timingProfile = loadRuntimeTimingProfile(view);
    if (view) view.__simulatteRuntimeTimingProfile = createRuntimeTimingProfile(timingProfile);
    const observers = new Set();
    const events = [];
    const loaderReceipts = [];
    const progressLogs = [];
    const performanceLogs = [];
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

    function controllerClockMs() {
      return view && view.performance && typeof view.performance.now === 'function'
        ? Number(view.performance.now())
        : Date.now();
    }

    function recordControllerPerformance(kind, startedAtMs, details = {}) {
      const durationMs = Math.max(0, controllerClockMs() - Number(startedAtMs || 0));
      const receipt = {
        schema: 'simulatte.runtimeProgressPerformance.v1',
        timestamp: new Date().toISOString(),
        kind,
        durationMs: Number(durationMs.toFixed(3)),
        runId: String(state.runId || ''),
        stage: String(state.stage || ''),
        ...details,
      };
      performanceLogs.push(receipt);
      while (performanceLogs.length > MAX_EVENT_HISTORY) performanceLogs.shift();
      if (view) {
        view.__simulatteRuntimePerformanceLogs = performanceLogs;
        if (durationMs >= 16 && view.console && typeof view.console.warn === 'function') {
          view.console.warn(`[Simulatte][ProgressPerformance] ${kind} ${durationMs.toFixed(1)}ms`, receipt);
        }
      }
      return receipt;
    }

    function flush() {
      const startedAtMs = controllerClockMs();
      pending = false;
      observers.forEach((observer) => observer(state, lastEvent));
      recordControllerPerformance('observer-flush', startedAtMs, {
        observerCount: observers.size,
      });
    }

    function recordProgressTransition(previous, next, event) {
      const timestampMs = eventTimestampMs(event, next && next.lastEventAt) || nowMs(view);
      const runChanged = String(previous && previous.runId || '') !== String(next && next.runId || '');
      if (!runStartedAtMs || runChanged || (next.state === 'active' && previous.state !== 'active')) {
        runStartedAtMs = timestampMs;
        lastProgressLogAtMs = 0;
      }
      const receipt = logRuntimeProgress(view, previous, next, event, {
        sequence: progressLogSequence + 1,
        runStartedAtMs,
        lastProgressLogAtMs,
      });
      if (!receipt) return;
      progressLogSequence += 1;
      lastProgressLogAtMs = timestampMs;
      progressLogs.push(receipt);
      while (progressLogs.length > MAX_PROGRESS_LOGS) progressLogs.shift();
    }

    function clearHeartbeat() {
      if (!heartbeatTimer || !clearTimer) return;
      clearTimer(heartbeatTimer);
      heartbeatTimer = 0;
      heartbeatDueAtMs = 0;
    }

    function scheduleHeartbeat() {
      if (!setTimer) return;
      if (!(state.state === 'active' && state.blocking !== false)) {
        clearHeartbeat();
        return;
      }
      if (heartbeatTimer) return;
      heartbeatDueAtMs = controllerClockMs() + HEARTBEAT_MS;
      heartbeatTimer = setTimer(() => {
        const startedAtMs = controllerClockMs();
        const schedulerLagMs = Math.max(0, startedAtMs - heartbeatDueAtMs);
        heartbeatTimer = 0;
        heartbeatDueAtMs = 0;
        if (!(state.state === 'active' && state.blocking !== false)) return;
        const previous = state;
        state = heartbeatRuntimeProgressState(state, view);
        const heartbeatEvent = {
          ...(lastEvent || {}),
          timestamp: nowMs(view),
          heartbeat: true,
          schedulerLagMs,
        };
        const loaderReceipt = updateLoaderPhaseReceipts(previous, state, heartbeatEvent);
        if (loaderReceipt) {
          state = {
            ...state,
            loaderReceipt: copyLoaderReceipt(loaderReceipt),
            loaderReceipts: loaderReceipts.slice(-12).map((receipt) => ({ ...receipt })),
          };
        }
        recordProgressTransition(previous, state, heartbeatEvent);
        schedule();
        scheduleHeartbeat();
        recordControllerPerformance('heartbeat-handler', startedAtMs, {
          schedulerLagMs: Number(schedulerLagMs.toFixed(3)),
        });
      }, HEARTBEAT_MS);
    }

    function publish(rawEvent = {}) {
      const event = normalizeEvent(rawEvent, state.runId);
      if (shouldIgnoreCompletedRunActiveEvent(state, event)) return state;
      lastEvent = event;
      events.push(event);
      while (events.length > MAX_EVENT_HISTORY) events.shift();
      const previous = state;
      state = reduceRuntimeProgress(state, event, { timingProfile, timestampMs: nowMs(view) });
      const loaderReceipt = updateLoaderPhaseReceipts(previous, state, event);
      if (loaderReceipt) {
        state = {
          ...state,
          loaderReceipt: copyLoaderReceipt(loaderReceipt),
          loaderReceipts: loaderReceipts.slice(-12).map((receipt) => ({ ...receipt })),
        };
      }
      if (previous.state === 'active' && state.state === 'ready' && state.runElapsedMs > 0) {
        if (recordRuntimeRunDuration(timingProfile, state.runElapsedMs)) persistTimingProfile();
      }
      recordProgressTransition(previous, state, event);
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
      logs() {
        return progressLogs.map((receipt) => ({ ...receipt }));
      },
      performanceLogs() {
        return performanceLogs.map((receipt) => ({ ...receipt }));
      },
      timingProfile() {
        return createRuntimeTimingProfile(timingProfile);
      },
      isBusy() {
        return state.state === 'active' && state.blocking !== false;
      },
    };

    function persistTimingProfile() {
      timingProfile = saveRuntimeTimingProfile(view, timingProfile);
    }

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
        if (recordRuntimeTaskDuration(
          timingProfile,
          activeLoaderReceipt.taskKey,
          activeLoaderReceipt.stage,
          activeLoaderReceipt.durationMs
        )) persistTimingProfile();
      }
      if (!activeLoaderReceipt || activeLoaderReceiptKey !== receiptKey) {
        activeLoaderReceipt = createLoaderReceipt(next, event, timestampMs, 'active', loaderReceipts.length + 1);
        activeLoaderReceiptKey = receiptKey;
        appendLoaderReceipt(activeLoaderReceipt);
      }
      updateLoaderReceipt(activeLoaderReceipt, next, event, timestampMs);
      if (next.state === 'ready') {
        closeLoaderReceipt(activeLoaderReceipt, 'complete', timestampMs, next);
        if (recordRuntimeTaskDuration(
          timingProfile,
          activeLoaderReceipt.taskKey,
          activeLoaderReceipt.stage,
          activeLoaderReceipt.durationMs
        )) persistTimingProfile();
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

  function loaderReceiptKey(state = {}) {
    const runId = state.runId || 'runtime';
    return [runId, state.taskKey || state.stage || DEFAULT_STAGE].join(':');
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
      taskKey: String(state.taskKey || ''),
      progressBasis: String(state.progressBasis || ''),
      progressEstimated: state.progressEstimated === true,
      expectedDurationMs: numericMetric(state.taskExpectedDurationMs),
      percentStart: 0,
      percentEnd: boundedProgress(state.progress || 0),
      overallPercentStart: boundedProgress(state.overallProgress || 0),
      overallPercentEnd: boundedProgress(state.overallProgress || 0),
      sourcePercentStart: boundedProgress(state.sourceProgress || 0),
      sourcePercentEnd: boundedProgress(state.sourceProgress || 0),
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
    receipt.progressBasis = state.progressBasis || receipt.progressBasis || '';
    receipt.progressEstimated = state.progressEstimated === true;
    receipt.expectedDurationMs = numericMetric(state.taskExpectedDurationMs) || receipt.expectedDurationMs || 0;
    receipt.label = state.label || receipt.label || runtimeStageLabel(state.stage, state.phase, state);
    receipt.subline = longerRuntimeText(receipt.subline, state.subline);
    receipt.percentEnd = boundedProgress(state.progress || receipt.percentEnd || 0);
    receipt.overallPercentEnd = boundedProgress(state.overallProgress || receipt.overallPercentEnd || 0);
    receipt.sourcePercentEnd = boundedProgress(state.sourceProgress || receipt.sourcePercentEnd || 0);
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
      receipt.percentEnd = status === 'complete' ? 100 : boundedProgress(state.progress);
      receipt.overallPercentEnd = boundedProgress(state.overallProgress || receipt.overallPercentEnd || 0);
      receipt.sourcePercentEnd = boundedProgress(state.sourceProgress || receipt.sourcePercentEnd || 0);
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
        state.taskKey,
        state.progress,
        state.overallProgress,
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
      node.dataset.taskProgress = String(boundedProgress(state.progress));
      node.dataset.overallProgress = String(boundedProgress(state.overallProgress));
      node.dataset.sourceProgress = String(boundedProgress(state.sourceProgress));
      node.dataset.progressBasis = String(state.progressBasis || '');
      node.dataset.progressEstimated = state.progressEstimated ? 'true' : 'false';
      node.dataset.taskKey = String(state.taskKey || '');
      node.dataset.taskElapsedMs = String(Math.trunc(Number(state.taskElapsedMs || 0)));
      node.dataset.taskRemainingMs = String(Math.trunc(Number(state.taskRemainingMs || 0)));
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
      node.style.setProperty('--runtime-overall-progress', `${state.overallProgress}%`);
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
        state.taskKey,
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
        indeterminate: state.indeterminate,
        overallProgress: state.overallProgress,
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
      taskProgress: state.progress || 0,
      overallProgress: state.overallProgress || 0,
      sourceProgress: state.sourceProgress || 0,
      progressBasis: state.progressBasis || '',
      progressEstimated: state.progressEstimated === true,
      taskKey: state.taskKey || '',
      taskElapsedMs: numericMetric(state.taskElapsedMs),
      taskExpectedDurationMs: numericMetric(state.taskExpectedDurationMs),
      taskRemainingMs: numericMetric(state.taskRemainingMs),
      runElapsedMs: numericMetric(state.runElapsedMs),
      runExpectedDurationMs: numericMetric(state.runExpectedDurationMs),
      runRemainingMs: numericMetric(state.runRemainingMs),
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
    }, 48);
  }

  return {
    EVENT_SCHEMA,
    STATE_SCHEMA,
    LOADER_RECEIPT_SCHEMA,
    PROGRESS_LOG_SCHEMA,
    TIMING_PROFILE_SCHEMA,
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
