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
  return { EVENT_SCHEMA, MAX_EVENTS, createRuntimeLogger, serializeError, ...logger };
});
