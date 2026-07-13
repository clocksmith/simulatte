(function attachSimulatteRuntimeProgressTiming(root) {
  const scope = root.__SimulatteRuntimeProgressRefactorScope;
  if (!scope || scope.missingDependency) return;
  with (scope) {
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

    function heartbeatRuntimeProgressState(previous = {}, view) {
      const current = previous || initialState();
      const now = nowMs(view);
      const timed = advanceRuntimeTimingState(current, now);
      const lastEventAt = Number(current.lastEventAt || now);
      const silenceMs = Math.max(0, now - lastEventAt);
      const line = runtimeLineText({ ...timed, ...(timed.resource || {}) }, timed.stage, timed.phase, timed.progress);
      const subline = [timed.baseSubline, runtimeTaskTimingText(timed)].filter(Boolean).join(' - ');
      const heartbeatLine = silenceMs >= STALE_EVENT_MS ? runtimeHeartbeatLine({ ...timed, line }) : '';
      return {
        ...timed,
        line,
        subline,
        heartbeatTick: Number(current.heartbeatTick || 0) + 1,
        silenceMs,
        heartbeatLine,
        displayLine: heartbeatLine || line || current.message || '',
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

    Object.assign(scope, {
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
      heartbeatRuntimeProgressState,
      mergeRuntimeReceipt,
      recordRuntimeTaskDuration,
      recordRuntimeRunDuration,
      runtimeTaskTimingText,
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
