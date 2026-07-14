(function attachSimulatteRuntimeProgressreducer(root) {
  const scope = root.__SimulatteRuntimeProgressRefactorScope;
  if (!scope || scope.missingDependency) return;
  with (scope) {
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
          executionDurationMs: numericMetric(event.executionDurationMs),
        }, 12);
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

    Object.assign(scope, {
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
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
