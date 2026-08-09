(function attachAutonomyRuntimeLog(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteAutonomyRuntimeLog = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createAutonomyRuntimeLog(root) {
  const EVENT_SCHEMA = 'simulatte.autonomyRuntimeEvent.v1';
  const MAX_EVENTS = 250;

  function createRuntimeLogger(options = {}) {
    const events = [];
    const clock = options.clock || now;
    const startedAt = clock();
    const sink = options.sink === undefined
      ? typeof window !== 'undefined' ? console : null
      : options.sink;

    function emit(level, event, details = {}) {
      const row = {
        schema: EVENT_SCHEMA,
        sequence: events.length ? events.at(-1).sequence + 1 : 1,
        level,
        event,
        elapsedMs: Number((clock() - startedAt).toFixed(3)),
        details: cloneDetails(details),
      };
      events.push(row);
      if (events.length > MAX_EVENTS) events.shift();
      if (root) root.__simulatteAutonomyRuntimeEvents = events;
      const method = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'info';
      if (sink && typeof sink[method] === 'function') sink[method](`[Simulatte] ${event}`, row);
      if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
        window.dispatchEvent(new CustomEvent('simulatte-autonomy-runtime', { detail: row }));
      }
      return row;
    }

    return {
      events,
      info: (event, details) => emit('info', event, details),
      warn: (event, details) => emit('warn', event, details),
      error: (event, details) => emit('error', event, details),
    };
  }

  // Loading is a cross-surface lifecycle: city and tier experiences should expose
  // the same stage timings in DevTools, even though their data and renderers differ.
  // Keep this helper on the runtime logger so it uses the logger's bounded event
  // buffer and console sink rather than creating a second ad-hoc telemetry path.
  function createLoadTrace(logger, options = {}) {
    const target = logger && typeof logger.info === 'function' ? logger : null;
    const clock = options.clock || now;
    const startedAt = clock();
    const loadId = options.loadId || `load-${Math.round(startedAt * 1000)}`;
    const event = options.event || 'experience.load';
    const baseDetails = cloneDetails(options.details || {});
    const stages = [];
    let finished = false;

    function emit(name, details = {}) {
      if (!target) return null;
      return target.info(`${event}.${name}`, {
        loadId,
        ...baseDetails,
        ...cloneDetails(details),
      });
    }

    emit('started', { });

    function stage(name, details = {}) {
      const stageStartedAt = clock();
      emit('stage.started', { stage: name, ...details });
      let ended = false;
      return Object.freeze({
        end(extra = {}) {
          if (ended) return null;
          ended = true;
          const durationMs = roundedDuration(clock() - stageStartedAt);
          const row = Object.freeze({ stage: name, durationMs, ...cloneDetails(extra) });
          stages.push(row);
          emit('stage.completed', row);
          return row;
        },
        fail(error, extra = {}) {
          if (ended) return null;
          ended = true;
          const durationMs = roundedDuration(clock() - stageStartedAt);
          const row = Object.freeze({
            stage: name,
            durationMs,
            error: serializeError(error),
            ...cloneDetails(extra),
          });
          stages.push(row);
          if (target) target.error(`${event}.stage.failed`, {
            loadId,
            ...baseDetails,
            ...row,
          });
          return row;
        },
      });
    }

    function complete(details = {}) {
      if (finished) return null;
      finished = true;
      return emit('completed', {
        durationMs: roundedDuration(clock() - startedAt),
        stages: stages.slice(),
        ...details,
      });
    }

    function fail(error, details = {}) {
      if (finished) return null;
      finished = true;
      if (!target) return null;
      return target.error(`${event}.failed`, {
        loadId,
        ...baseDetails,
        durationMs: roundedDuration(clock() - startedAt),
        stages: stages.slice(),
        error: serializeError(error),
        ...details,
      });
    }

    async function run(name, operation, details = {}) {
      const span = stage(name, details);
      try {
        const value = await operation();
        span.end();
        return value;
      } catch (error) {
        span.fail(error);
        throw error;
      }
    }

    return Object.freeze({ loadId, stage, run, complete, fail });
  }

  function roundedDuration(value) {
    return Number(Math.max(0, value).toFixed(3));
  }

  function serializeError(error) {
    return {
      name: error?.name || 'Error',
      message: error?.message || String(error),
      code: error?.code || null,
      evidence: cloneDetails(error?.evidence || null),
      stack: typeof error?.stack === 'string' ? error.stack : null,
    };
  }

  function cloneDetails(value) {
    if (value === undefined) return null;
    try {
      return structuredClone(value);
    } catch {
      try {
        return JSON.parse(JSON.stringify(value));
      } catch {
        return String(value);
      }
    }
  }

  function now() {
    return typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();
  }

  const logger = createRuntimeLogger();
  return { EVENT_SCHEMA, MAX_EVENTS, createRuntimeLogger, createLoadTrace, serializeError, ...logger };
});
