(function attachSimulatteRuntimeProgressSupport(root, factory) {
  const api = factory();
  root.SimulatteRuntimeProgressSupport = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createRuntimeProgressSupport() {
  const EVENT_SCHEMA = 'simulatte.runtimeProgressEvent.v2';
  const STATE_SCHEMA = 'simulatte.runtimeProgressState.v2';
  const HEALTH_SCHEMA = 'simulatte.intentRuntimeHealth.v2';
  const LOADER_RECEIPT_SCHEMA = 'simulatte.loaderPhaseReceipt.v2';
  const PROGRESS_LOG_SCHEMA = 'simulatte.runtimeProgressLog.v2';
  const TIMING_PROFILE_SCHEMA = 'simulatte.runtimeTaskTimingProfile.v1';
  const TIMING_PROFILE_STORAGE_KEY = 'simulatte.runtime-task-timing-profile.v1';
  const TIME_ESTIMATE_PROGRESS_CAP = 95;
  const RUN_DURATION_FALLBACK_MS = 24000;
  const TASK_DURATION_FALLBACK_MS = 1200;
  const MAX_EVENT_HISTORY = 120;
  const MAX_LOADER_RECEIPTS = 64;
  const MAX_PROGRESS_LOGS = 2048;
  const DEFAULT_STAGE = 'runtime.start';
  const HEARTBEAT_MS = 900;
  const STALE_EVENT_MS = 1400;

  const TASK_DURATION_DEFAULTS_MS = Object.freeze({
    'runtime.start': 400,
    'runtime.manifest.fetch': 800,
    'runtime.index.fetch': 2400,
    'runtime.module.import': 1200,
    'runtime.cache.storage': 500,
    'runtime.cache.file': 45000,
    'runtime.cache.read': 7000,
    'runtime.cache.ready': 300,
    'runtime.cache.skip': 300,
    'runtime.model.load': 12000,
    'runtime.model.reuse': 300,
    'runtime.model.probe': 1800,
    'runtime.model.ready': 300,
    'runtime.reranker.load': 12000,
    'runtime.reranker.probe': 1800,
    'runtime.reranker.ready': 300,
    'runtime.ready': 300,
    'language.dispatch': 300,
    'language.parse': 300,
    'retrieval.start': 300,
    'retrieval.prompt.embed': 2200,
    'retrieval.scene.query-plan': 500,
    'retrieval.index.query': 2200,
    'retrieval.primitive.rank': 1800,
    'retrieval.slot.embed': 5000,
    'retrieval.slot.rank': 4000,
    'retrieval.slot.model-rerank': 7000,
    'retrieval.primitive.model-rerank': 7000,
    'activation.span.cache': 500,
    'activation.span.embed': 2200,
    'activation.span.rank': 1800,
    'activation.span.refined': 900,
    'activation.cloud': 900,
    'grounding.intent': 500,
    'simulation.compile': 700,
    'visual.visual-ir': 700,
    'render.first-frame': 700,
    'render.ready': 100,
    'render.blank': 100,
  });

  function runtimeTaskKey(event = {}, stage = '') {
    const slotId = String(event.slotId || '').trim();
    const operationId = Number(event.operationId || 0);
    const resourceKind = String(event.resourceKind || '').trim();
    const modelId = String(event.modelId || '').trim();
    const qualifier = slotId || (operationId > 0 ? `operation-${operationId}` : '') || resourceKind || modelId;
    return [String(stage || DEFAULT_STAGE), qualifier].filter(Boolean).join(':');
  }

  function createRuntimeTimingProfile(seed = {}) {
    const tasks = seed && seed.tasks && typeof seed.tasks === 'object' ? seed.tasks : {};
    const run = seed && seed.run && typeof seed.run === 'object' ? seed.run : {};
    return {
      schema: TIMING_PROFILE_SCHEMA,
      updatedAt: String(seed.updatedAt || ''),
      tasks: Object.fromEntries(Object.entries(tasks).slice(-128).map(([key, entry]) => [key, {
        stage: String(entry && entry.stage || ''),
        samples: Math.max(0, Number(entry && entry.samples || 0)),
        averageDurationMs: positiveDuration(entry && entry.averageDurationMs),
        lastDurationMs: positiveDuration(entry && entry.lastDurationMs),
      }])),
      run: {
        samples: Math.max(0, Number(run.samples || 0)),
        averageDurationMs: positiveDuration(run.averageDurationMs),
        lastDurationMs: positiveDuration(run.lastDurationMs),
      },
    };
  }

  function loadRuntimeTimingProfile(view) {
    try {
      const storage = view && view.localStorage;
      const parsed = storage && JSON.parse(storage.getItem(TIMING_PROFILE_STORAGE_KEY) || 'null');
      return createRuntimeTimingProfile(parsed && parsed.schema === TIMING_PROFILE_SCHEMA ? parsed : {});
    } catch (_error) {
      return createRuntimeTimingProfile();
    }
  }

  function saveRuntimeTimingProfile(view, profile) {
    const snapshot = createRuntimeTimingProfile(profile);
    snapshot.updatedAt = new Date().toISOString();
    try {
      const storage = view && view.localStorage;
      if (storage) storage.setItem(TIMING_PROFILE_STORAGE_KEY, JSON.stringify(snapshot));
    } catch (_error) {
      // The in-memory timing profile remains authoritative for this page run.
    }
    if (view) view.__simulatteRuntimeTimingProfile = snapshot;
    return snapshot;
  }

  function defaultTaskDurationMs(stage = '') {
    const exact = positiveDuration(TASK_DURATION_DEFAULTS_MS[stage]);
    if (exact) return exact;
    const prefix = Object.keys(TASK_DURATION_DEFAULTS_MS).find((key) => String(stage).startsWith(key));
    return positiveDuration(prefix && TASK_DURATION_DEFAULTS_MS[prefix]) || TASK_DURATION_FALLBACK_MS;
  }

  function expectedTaskDurationMs(profile = {}, taskKey = '', stage = '', event = {}) {
    const explicit = positiveDuration(event.expectedDurationMs);
    if (explicit) return explicit;
    const entry = profile.tasks && profile.tasks[taskKey];
    return positiveDuration(entry && entry.averageDurationMs) || defaultTaskDurationMs(stage);
  }

  function measuredTaskFraction(event = {}, stage = '') {
    const taskPercent = Number(event.taskPercent);
    if (Number.isFinite(taskPercent)) return progressClamp(taskPercent) / 100;
    if (event.progressScope === 'task' && Number.isFinite(Number(event.percent))) {
      return progressClamp(event.percent) / 100;
    }
    const pairs = [[event.completed, event.total]];
    if (/runtime\.(cache|manifest|index)/.test(stage)) {
      pairs.push([event.completedBytes, event.totalBytes]);
    }
    if (/activation\.|retrieval\./.test(stage)) {
      pairs.push(
        [event.embeddedSpanCount, event.spanCount],
        [event.embeddedSlotCount || event.completedSlotCount, event.slotCount || event.querySlotCount]
      );
    }
    for (const pair of pairs) {
      const completed = Number(pair[0]);
      const total = Number(pair[1]);
      if (Number.isFinite(completed) && Number.isFinite(total) && total > 0) {
        return fractionClamp(completed / total);
      }
    }
    return null;
  }

  function runtimeTaskProgressState(previous = {}, event = {}, stage = '', eventAt = 0, profile = {}) {
    const taskKey = runtimeTaskKey(event, stage);
    const runChanged = String(previous.runId || '') !== String(event.runId || previous.runId || '');
    const taskChanged = runChanged || event.resetTaskProgress === true || String(previous.taskKey || '') !== taskKey;
    const taskStartedAtMs = taskChanged
      ? eventAt
      : positiveTimestamp(previous.taskStartedAtMs) || eventAt;
    const taskElapsedMs = Math.max(0, eventAt - taskStartedAtMs);
    const measured = measuredTaskFraction(event, stage);
    const taskStartAnchor = event.progressScope === 'task' && Number(event.taskPercent) === 0;
    let expectedDurationMs = expectedTaskDurationMs(profile, taskKey, stage, event);
    let progressBasis = measured !== null && !taskStartAnchor ? 'measured-work' : 'elapsed-time-forecast';
    let progress = measured !== null && !taskStartAnchor
      ? progressClamp(measured * 100)
      : taskChanged
        ? 0
        : progressClamp(Math.min(TIME_ESTIMATE_PROGRESS_CAP, taskElapsedMs / expectedDurationMs * 100));
    if (event.state === 'ready' || /^render\.(ready|blank)$/.test(stage)) {
      progress = 100;
      progressBasis = 'terminal';
    } else if (event.state === 'error') {
      progress = 0;
      progressBasis = 'error';
    } else if (!taskChanged) {
      progress = Math.max(progressClamp(previous.progress || 0), progress);
    }
    if (measured !== null && measured > 0 && measured < 1 && taskElapsedMs > 0) {
      const measuredDurationMs = taskElapsedMs / measured;
      expectedDurationMs = Math.max(taskElapsedMs, Math.round(expectedDurationMs * 0.35 + measuredDurationMs * 0.65));
    }
    return {
      taskKey,
      taskStartedAtMs,
      taskElapsedMs,
      taskExpectedDurationMs: expectedDurationMs,
      taskRemainingMs: Math.max(0, expectedDurationMs - taskElapsedMs),
      progress,
      progressBasis,
      progressEstimated: progressBasis === 'elapsed-time-forecast',
    };
  }

  function runtimeRunProgressState(previous = {}, event = {}, eventAt = 0, profile = {}) {
    const runId = String(event.runId || previous.runId || '');
    const runChanged = String(previous.runId || '') !== runId;
    const runStartedAtMs = runChanged || previous.state !== 'active'
      ? eventAt
      : positiveTimestamp(previous.runStartedAtMs) || eventAt;
    const runElapsedMs = Math.max(0, eventAt - runStartedAtMs);
    const expectedDurationMs = positiveDuration(profile.run && profile.run.averageDurationMs) || RUN_DURATION_FALLBACK_MS;
    let overallProgress = progressClamp(Math.min(
      TIME_ESTIMATE_PROGRESS_CAP,
      runElapsedMs / expectedDurationMs * 100
    ));
    if (event.state === 'ready' || /^render\.(ready|blank)$/.test(String(event.stage || ''))) {
      overallProgress = 100;
    } else if (event.state === 'error') {
      overallProgress = progressClamp(previous.overallProgress || 0);
    } else if (!runChanged) {
      overallProgress = Math.max(progressClamp(previous.overallProgress || 0), overallProgress);
    }
    return {
      runStartedAtMs,
      runElapsedMs,
      runExpectedDurationMs: expectedDurationMs,
      runRemainingMs: Math.max(0, expectedDurationMs - runElapsedMs),
      overallProgress,
      overallProgressBasis: 'observed-duration-forecast',
    };
  }

  function advanceRuntimeTimingState(previous = {}, timestampMs = 0) {
    if (!previous || previous.state !== 'active') return previous;
    const taskElapsedMs = Math.max(0, timestampMs - positiveTimestamp(previous.taskStartedAtMs));
    const taskExpectedDurationMs = positiveDuration(previous.taskExpectedDurationMs) || TASK_DURATION_FALLBACK_MS;
    const runElapsedMs = Math.max(0, timestampMs - positiveTimestamp(previous.runStartedAtMs));
    const runExpectedDurationMs = positiveDuration(previous.runExpectedDurationMs) || RUN_DURATION_FALLBACK_MS;
    const progress = previous.progressBasis === 'elapsed-time-forecast'
      ? Math.max(progressClamp(previous.progress || 0), progressClamp(Math.min(
        TIME_ESTIMATE_PROGRESS_CAP,
        taskElapsedMs / taskExpectedDurationMs * 100
      )))
      : progressClamp(previous.progress || 0);
    const overallProgress = Math.max(progressClamp(previous.overallProgress || 0), progressClamp(Math.min(
      TIME_ESTIMATE_PROGRESS_CAP,
      runElapsedMs / runExpectedDurationMs * 100
    )));
    return {
      ...previous,
      progress,
      taskElapsedMs,
      taskRemainingMs: Math.max(0, taskExpectedDurationMs - taskElapsedMs),
      overallProgress,
      runElapsedMs,
      runRemainingMs: Math.max(0, runExpectedDurationMs - runElapsedMs),
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

  function recordRuntimeTaskDuration(profile = {}, taskKey = '', stage = '', durationMs = 0) {
    const duration = positiveDuration(durationMs);
    if (!duration || !taskKey) return false;
    profile.tasks = profile.tasks || {};
    profile.tasks[taskKey] = updatedDurationEntry(profile.tasks[taskKey], duration, { stage });
    trimTimingTasks(profile.tasks);
    return true;
  }

  function recordRuntimeRunDuration(profile = {}, durationMs = 0) {
    const duration = positiveDuration(durationMs);
    if (!duration) return false;
    profile.run = updatedDurationEntry(profile.run, duration);
    return true;
  }

  function updatedDurationEntry(previous = {}, durationMs = 0, extra = {}) {
    const samples = Math.max(0, Number(previous && previous.samples || 0));
    const average = positiveDuration(previous && previous.averageDurationMs);
    const alpha = samples < 4 ? 1 / (samples + 1) : 0.25;
    const nextAverage = average
      ? Math.round(average + (durationMs - average) * alpha)
      : Math.round(durationMs);
    return {
      ...extra,
      samples: samples + 1,
      averageDurationMs: nextAverage,
      lastDurationMs: Math.round(durationMs),
    };
  }

  function runtimeTaskTimingText(state = {}) {
    const elapsed = positiveDuration(state.taskElapsedMs);
    const remaining = positiveDuration(state.taskRemainingMs);
    if (!elapsed && !remaining) return '';
    const parts = [];
    if (elapsed) parts.push(`${formatTimingDuration(elapsed)} elapsed`);
    if (remaining && Number(state.progress || 0) < 100) {
      parts.push(`${formatTimingDuration(remaining)} estimated remaining`);
    }
    return parts.join(', ');
  }

  function formatTimingDuration(value = 0) {
    const ms = positiveDuration(value);
    if (ms < 1000) return `${Math.round(ms)}ms`;
    return `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)}s`;
  }

  function trimTimingTasks(tasks = {}) {
    const keys = Object.keys(tasks);
    while (keys.length > 128) delete tasks[keys.shift()];
  }

  function positiveDuration(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : 0;
  }

  function positiveTimestamp(value) {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : 0;
  }

  function fractionClamp(value) {
    return Math.max(0, Math.min(1, Number.isFinite(Number(value)) ? Number(value) : 0));
  }

  function progressClamp(value) {
    return Math.min(100, Math.max(0, Math.trunc(Number(value || 0) + 0.5)));
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
      bytesPerSecond: numericMetric(event.bytesPerSecond),
      eta: event.eta || '',
      operationId: numericMetric(event.operationId),
      queueDepth: numericMetric(event.queueDepth),
      cacheBackends: Array.isArray(event.cacheBackends)
        ? event.cacheBackends.join(',')
        : event.cacheBackends || '',
    }, 18);
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

  function rerankerReceipt(event = {}) {
    return compactObject({
      slotId: event.slotId || '',
      candidateId: event.candidateId || '',
      completed: numericMetric(event.completed),
      total: numericMetric(event.total),
      candidateCount: numericMetric(event.candidateCount),
      scoreCacheHit: event.scoreCacheHit === true,
      promptTokenCount: numericMetric(event.promptTokenCount),
      prefixTokenCount: numericMetric(event.prefixTokenCount),
      prefixStateReused: event.prefixStateReused === true,
      prefixPreparationDurationMs: numericMetric(event.prefixPreparationDurationMs),
      prefixTokenizationDurationMs: numericMetric(event.prefixTokenizationDurationMs),
      prefixResetDurationMs: numericMetric(event.prefixResetDurationMs),
      prefixPrimingDurationMs: numericMetric(event.prefixPrimingDurationMs),
      executionDurationMs: numericMetric(event.executionDurationMs),
    }, 16);
  }

  function timingReceipt(event = {}) {
    return compactObject({
      timestamp: event.timestamp || '',
      durationMs: numericMetric(event.durationMs),
      elapsedMs: numericMetric(event.elapsedMs),
      queueWaitMs: numericMetric(event.queueWaitMs),
      schedulerLagMs: numericMetric(event.schedulerLagMs),
      handlerDurationMs: numericMetric(event.handlerDurationMs),
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
    return `${progressClamp(state.progress || 0)}%`;
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

  function visibleRuntimeProgressChanged(previous = {}, next = {}) {
    if (!next || typeof next !== 'object') return false;
    return String(previous.displayLine || previous.line || '') !== String(next.displayLine || next.line || '') ||
      String(previous.message || '') !== String(next.message || '') ||
      String(previous.detail || '') !== String(next.detail || '') ||
      String(previous.subline || '') !== String(next.subline || '') ||
      String(previous.runId || '') !== String(next.runId || '') ||
      String(previous.state || '') !== String(next.state || '') ||
      String(previous.stage || '') !== String(next.stage || '') ||
      String(previous.taskKey || '') !== String(next.taskKey || '') ||
      Number(previous.progress || 0) !== Number(next.progress || 0) ||
      Number(previous.overallProgress || 0) !== Number(next.overallProgress || 0) ||
      Number(previous.taskElapsedMs || 0) !== Number(next.taskElapsedMs || 0);
  }

  function runtimeProgressLogReceipt(previous = {}, next = {}, event = {}, context = {}) {
    if (!visibleRuntimeProgressChanged(previous, next)) return null;
    const timestampMs = eventTimestampMs(event, next.lastEventAt);
    const runStartedAtMs = Number(context.runStartedAtMs || timestampMs);
    const lastProgressLogAtMs = Number(context.lastProgressLogAtMs || 0);
    const loaderDurationMs = Number(next.loaderReceipt && next.loaderReceipt.durationMs || 0);
    const completedBytes = Number(next.resource && next.resource.completedBytes || 0);
    const boundedProgress = progressClamp;
    return {
      schema: PROGRESS_LOG_SCHEMA,
      sequence: Math.max(1, Number(context.sequence || 1)),
      timestamp: isoFromTimestamp(timestampMs, event.timestamp),
      timestampMs,
      runId: String(next.runId || ''),
      state: String(next.state || ''),
      blocking: next.blocking === true,
      phase: compactObject(next.phase || {}, 8),
      stage: String(next.stage || ''),
      sourceStage: String(next.sourceStage || event.stage || ''),
      source: String(next.source || event.source || ''),
      progress: boundedProgress(next.progress || 0),
      taskProgress: boundedProgress(next.progress || 0),
      overallProgress: boundedProgress(next.overallProgress || 0),
      sourceProgress: boundedProgress(next.sourceProgress || 0),
      progressBasis: String(next.progressBasis || ''),
      progressEstimated: next.progressEstimated === true,
      taskKey: String(next.taskKey || ''),
      line: String(next.displayLine || next.line || next.message || ''),
      label: String(next.label || ''),
      subline: String(next.subline || ''),
      message: String(next.message || ''),
      detail: String(next.detail || event.message || ''),
      transitionMs: lastProgressLogAtMs > 0 ? Math.max(0, timestampMs - lastProgressLogAtMs) : 0,
      runElapsedMs: Math.max(0, timestampMs - runStartedAtMs),
      taskTiming: {
        elapsedMs: numericMetric(next.taskElapsedMs),
        expectedDurationMs: numericMetric(next.taskExpectedDurationMs),
        estimatedRemainingMs: numericMetric(next.taskRemainingMs),
      },
      runTiming: {
        elapsedMs: numericMetric(next.runElapsedMs),
        expectedDurationMs: numericMetric(next.runExpectedDurationMs),
        estimatedRemainingMs: numericMetric(next.runRemainingMs),
        basis: String(next.overallProgressBasis || ''),
      },
      throughputBytesPerSecond: loaderDurationMs > 0 && completedBytes > 0
        ? Math.round(completedBytes / (loaderDurationMs / 1000))
        : 0,
      model: compactObject(next.model || {}, 16),
      resource: compactObject(next.resource || {}, 16),
      embeddings: compactObject(next.embeddings || {}, 16),
      reranker: rerankerReceipt(event),
      timing: compactObject(next.timing || {}, 16),
      loaderReceipt: compactObject(next.loaderReceipt || null, 24),
    };
  }

  function logRuntimeProgress(view, previous = {}, next = {}, event = {}, context = {}) {
    const receipt = runtimeProgressLogReceipt(previous, next, event, context);
    if (!receipt) {
      if (traceEnabled(view) && view && view.console && typeof view.console.info === 'function') {
        const payload = { ...(event || {}) };
        delete payload.rawEvent;
        view.console.info('[simulatte.runtime:trace]', payload.stage || 'event', payload);
      }
      return null;
    }
    if (view) {
      const logs = Array.isArray(view.__simulatteRuntimeProgressLogs)
        ? view.__simulatteRuntimeProgressLogs
        : [];
      logs.push(receipt);
      while (logs.length > MAX_PROGRESS_LOGS) logs.shift();
      view.__simulatteRuntimeProgressLogs = logs;
      if (view.console && typeof view.console.info === 'function') {
        const detail = receipt.detail && receipt.detail !== receipt.line
          ? ` | ${receipt.detail}`
          : '';
        view.console.info(`[Simulatte][Progress] #${receipt.sequence} ${receipt.line}${detail}`, receipt);
      }
    }
    return receipt;
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
    HEALTH_SCHEMA,
    LOADER_RECEIPT_SCHEMA,
    PROGRESS_LOG_SCHEMA,
    TIMING_PROFILE_SCHEMA,
    TIMING_PROFILE_STORAGE_KEY,
    TIME_ESTIMATE_PROGRESS_CAP,
    RUN_DURATION_FALLBACK_MS,
    TASK_DURATION_FALLBACK_MS,
    MAX_EVENT_HISTORY,
    MAX_LOADER_RECEIPTS,
    MAX_PROGRESS_LOGS,
    DEFAULT_STAGE,
    HEARTBEAT_MS,
    STALE_EVENT_MS,
    TASK_DURATION_DEFAULTS_MS,
    runtimeTaskKey,
    createRuntimeTimingProfile,
    loadRuntimeTimingProfile,
    saveRuntimeTimingProfile,
    defaultTaskDurationMs,
    expectedTaskDurationMs,
    measuredTaskFraction,
    runtimeTaskProgressState,
    runtimeRunProgressState,
    advanceRuntimeTimingState,
    mergeRuntimeReceipt,
    recordRuntimeTaskDuration,
    recordRuntimeRunDuration,
    runtimeTaskTimingText,
    modelReceipt,
    resourceReceipt,
    embeddingReceipt,
    rerankerReceipt,
    timingReceipt,
    runtimeTimingSuffix,
    runtimeResourceSuffix,
    runtimeSublineText,
    runtimeSourceText,
    runtimeResourceKindText,
    runtimeBytePairText,
    runtimeByteProgressState,
    shortRuntimeFile,
    formatRuntimeBytes,
    formatRuntimeByteUnit,
    runtimePercentText,
    eventTimestampMs,
    isoFromTimestamp,
    durationSinceIso,
    nowMs,
    lowerFirst,
    longerRuntimeText,
    formatRuntimeDuration,
    compactRuntimeMessage,
    visibleRuntimeProgressChanged,
    runtimeProgressLogReceipt,
    logRuntimeProgress,
    traceEnabled,
    compactObject,
    numericMetric,
    clamp01,
  };
});
