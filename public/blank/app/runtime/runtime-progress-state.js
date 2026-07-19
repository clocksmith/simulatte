(function attachSimulatteRuntimeProgressState(root, factory) {
  const support = typeof module === 'object' && module.exports
    ? require('./runtime-progress-support.js')
    : root.SimulatteRuntimeProgressSupport;
  const api = factory(support);
  root.SimulatteRuntimeProgressState = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createRuntimeProgressState(support) {
  if (!support) {
    throw new Error('SimulatteRuntimeProgressState requires runtime-progress-support.js to load first.');
  }
  const {
    EVENT_SCHEMA,
    STATE_SCHEMA,
    DEFAULT_STAGE,
    STALE_EVENT_MS,
    TASK_DURATION_FALLBACK_MS,
    RUN_DURATION_FALLBACK_MS,
    measuredTaskFraction,
    runtimeTaskProgressState,
    runtimeRunProgressState,
    advanceRuntimeTimingState,
    mergeRuntimeReceipt,
    createRuntimeTimingProfile,
    runtimeTaskTimingText,
    modelReceipt,
    resourceReceipt,
    embeddingReceipt,
    timingReceipt,
    runtimeTimingSuffix,
    runtimeResourceSuffix,
    runtimeSublineText,
    runtimeSourceText,
    runtimeBytePairText,
    runtimeByteProgressState,
    eventTimestampMs,
    nowMs,
    lowerFirst,
    compactRuntimeMessage,
    compactObject,
    clamp01,
  } = support;

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
    stageAlias(/cache-hit/, 'runtime.cache.read', 'Reading cached model weights'),
    stageAlias(/cache-file-ready|cache-ready/, 'runtime.cache.ready', 'Model cache ready'),
    stageAlias(/cache-fill|shard|weight/, 'runtime.cache.file', 'Caching model weights'),
    stageAlias(/model-rerank-probe|phase1-reranker-probe/, 'runtime.reranker.probe', 'Verifying reranker'),
    stageAlias(/reranker-ready/, 'runtime.reranker.ready', 'Reranker ready'),
    stageAlias(/reranker-load/, 'runtime.reranker.load', 'Loading reranker'),
    stageAlias(/slot-model-rerank/, 'retrieval.slot.model-rerank', 'Reranking scene slots'),
    stageAlias(/^model-rerank$/, 'retrieval.primitive.model-rerank', 'Reranking candidates'),
    stageAlias(/model-reuse/, 'runtime.model.reuse', 'Reusing embedding model'),
    stageAlias(/model-probe/, 'runtime.model.probe', 'Verifying embedding model'),
    stageAlias(/model-ready/, 'runtime.model.ready', 'Embedding model ready'),
    stageAlias(/model-load|model/, 'runtime.model.load', 'Loading Doppler model'),
    stageAlias(/pipeline-dispatch/, 'language.dispatch', 'Starting compiler'),
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
      sourceProgress: 0,
      overallProgress: 0,
      overallProgressBasis: 'observed-duration-forecast',
      taskKey: '',
      taskStartedAtMs: 0,
      taskElapsedMs: 0,
      taskExpectedDurationMs: TASK_DURATION_FALLBACK_MS,
      taskRemainingMs: TASK_DURATION_FALLBACK_MS,
      progressBasis: 'elapsed-time-forecast',
      progressEstimated: true,
      runStartedAtMs: 0,
      runElapsedMs: 0,
      runExpectedDurationMs: RUN_DURATION_FALLBACK_MS,
      runRemainingMs: RUN_DURATION_FALLBACK_MS,
      line: '',
      displayLine: '',
      heartbeatLine: '',
      heartbeatTick: 0,
      silenceMs: 0,
      label: '',
      baseSubline: '',
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

  function reduceRuntimeProgress(previous = initialState(), rawEvent = {}, context = {}) {
    const event = normalizeEvent(rawEvent, previous.runId);
    const stage = canonicalStage(event);
    const phase = phaseForStage(stage, event);
    const rawPercent = eventPercent(event, stage, phase);
    const sourceProgress = monotonicEventPercent(previous, event, rawPercent);
    const passive = passiveEvent(event, stage);
    const state = event.state || stateForEvent(event, stage, sourceProgress, passive, previous);
    const loading = !passive && state === 'active';
    const canvasLoading = loading && event.canvasLoading !== false;
    const message = compactRuntimeMessage(event.message || stage);
    const eventAt = eventTimestampMs(event, context.timestampMs || previous.lastEventAt);
    const timingProfile = context.timingProfile || createRuntimeTimingProfile();
    const taskTiming = runtimeTaskProgressState(previous, event, stage, eventAt, timingProfile);
    const runTiming = runtimeRunProgressState(previous, event, eventAt, timingProfile);
    const line = runtimeLineText(event, stage, phase, taskTiming.progress);
    const label = runtimeStageLabel(stage, phase, event);
    const byteText = runtimeBytePairText(event);
    const sourceText = runtimeSourceText(event, stage);
    const byteProgress = runtimeByteProgressState(event, stage, loading);
    const baseSubline = runtimeSublineText(event, stage, byteText, sourceText);
    const taskTimingText = runtimeTaskTimingText(taskTiming);
    const subline = [baseSubline, taskTimingText]
      .filter(Boolean)
      .join(' - ');
    const activity = runtimeActivityText(stage, phase, event);
    const nextState = {
      schema: STATE_SCHEMA,
      runId: String(event.runId || previous.runId || ''),
      state,
      blocking: loading,
      passive,
      canvasLoading,
      indeterminate: false,
      phase,
      stage,
      sourceStage: String(event.stage || event.phase || ''),
      sourceProgress,
      ...taskTiming,
      ...runTiming,
      line,
      displayLine: line,
      heartbeatLine: '',
      heartbeatTick: 0,
      silenceMs: 0,
      label,
      baseSubline,
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
      baseSubline: current.baseSubline || receiptState.baseSubline || '',
      subline: current.subline || receiptState.subline || '',
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

  function normalizeEvent(rawEvent = {}, runId = '') {
    const event = rawEvent && typeof rawEvent === 'object' ? rawEvent : {};
    return {
      schema: EVENT_SCHEMA,
      timestamp: event.timestamp || new Date().toISOString(),
      runId: event.runId || runId || '',
      ...event,
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
    return Math.max(boundedProgress(previous.sourceProgress || 0), next);
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
    return measuredTaskFraction(event) !== null;
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
    if (percent >= 100 && event.progressScope !== 'task') return 'ready';
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
    if (event.state === 'ready' || /render\.(ready|blank)/.test(stage)) {
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

  return {
    RUNTIME_PHASES,
    PHASE_OFFSETS,
    STAGE_ALIASES,
    STAGE_ESTIMATES,
    phaseRule,
    stageAlias,
    phaseOffsets,
    initialState,
    reduceRuntimeProgress,
    passiveRuntimeProgressState,
    heartbeatRuntimeProgressState,
    normalizeEvent,
    canonicalStage,
    phaseForStage,
    eventPercent,
    monotonicEventPercent,
    measuredFraction,
    hasMeasuredProgress,
    weightedPercent,
    boundedProgress,
    passiveEvent,
    stateForEvent,
    runtimeLineText,
    runtimeDisplayLine,
    runtimeTitleText,
    runtimeHeartbeatLine,
    runtimeStageLabel,
    runtimeActivityText,
    shouldIgnoreCompletedRunActiveEvent,
  };
});
