(function attachRendererSession(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteRendererSession = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createRendererSessionApi() {
  const OPERATIONS = Object.freeze(['setScene', 'render', 'resize', 'setCamera', 'pick', 'capture', 'receipt']);

  function error(code, message, cause) {
    return Object.assign(new Error(message, cause ? { cause } : undefined), { code });
  }

  // Adapters own their typed scene inputs and evidence. The session only owns
  // lifecycle, capability checks, and invalidation of asynchronous output.
  function create({ backend, initialize, capabilities = [], signal, onError } = {}) {
    if (typeof backend !== 'string' || !backend.trim() || typeof initialize !== 'function' || !Array.isArray(capabilities)) throw error('renderer_adapter_invalid', 'Expected backend, initialize, and capability array');
    const supported = Object.freeze(Object.fromEntries(OPERATIONS.map(name => [name, capabilities.includes(name)])));
    if (!supported.render || !supported.receipt) throw error('renderer_adapter_invalid', 'Adapters must support render and receipt');
    if (capabilities.some(name => !OPERATIONS.includes(name))) throw error('renderer_capability_invalid', 'Unknown renderer capability');
    const controller = new AbortController();
    let state = 'initializing';
    let adapter = null;
    let failure = null;
    let generation = 0;
    let cleanup = null;
    let rejectReady;
    let resolveReady;
    const ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
    // Legacy synchronous mounting can observe status before awaiting readiness.
    // Keep the original promise rejected for callers without an unhandled event.
    ready.catch(() => {});

    function release(value) {
      if (!value) return Promise.resolve();
      try { return Promise.resolve(value.dispose()); } catch (cause) { return Promise.reject(cause); }
    }

    function fail(cause) {
      if (state === 'disposed' || state === 'failed') return;
      failure = cause instanceof Error ? cause : error('renderer_failed', String(cause));
      state = 'failed';
      generation += 1;
      controller.abort(failure);
      rejectReady(failure);
      cleanup = release(adapter);
      cleanup.catch(() => {});
      // An observer cannot undo failed state or prevent resource cleanup.
      if (onError) { try { onError(failure); } catch (_) { /* Status retains the original backend failure. */ } }
    }

    function assertActive(name) {
      if (state !== 'ready') throw error(`renderer_${state}`, `Cannot ${name}: renderer is ${state}`, failure);
      if (!supported[name]) throw error('renderer_operation_unsupported', `${backend} does not support ${name}`);
    }

    function invoke(name, args) {
      assertActive(name);
      const current = generation;
      const result = adapter[name](...args);
      if (!result || typeof result.then !== 'function') return result;
      return result.then(value => {
        if (generation !== current || state !== 'ready') throw error('renderer_result_stale', `${name} completed after renderer invalidation`);
        return value;
      });
    }

    function dispose() {
      if (state === 'disposed') return cleanup || Promise.resolve();
      const wasFailed = state === 'failed';
      state = 'disposed';
      generation += 1;
      controller.abort();
      signal?.removeEventListener('abort', dispose);
      rejectReady(error('renderer_disposed', 'Renderer disposed before readiness'));
      if (!wasFailed) cleanup = release(adapter);
      cleanup?.catch(() => {});
      return cleanup || Promise.resolve();
    }

    const session = Object.freeze({
      backend, capabilities: supported, ready,
      status: () => Object.freeze({ state, backend, error: failure ? { code: failure.code || 'renderer_failed', message: failure.message } : null }),
      ...Object.fromEntries(OPERATIONS.map(name => [name, (...args) => invoke(name, args)])),
      dispose,
    });
    signal?.addEventListener('abort', dispose, { once: true });
    if (signal?.aborted) dispose();
    Promise.resolve().then(() => {
      if (controller.signal.aborted) return null;
      return initialize({ signal: controller.signal, fail });
    }).then(value => {
      if (!value) {
        if (state === 'initializing') throw error('renderer_adapter_invalid', 'Initialization returned no adapter');
        return;
      }
      if (typeof value.dispose !== 'function') throw error('renderer_adapter_invalid', 'Adapter must implement dispose');
      if (state !== 'initializing') return release(value);
      adapter = value;
      for (const name of OPERATIONS) {
        if (supported[name] && typeof value[name] !== 'function') throw error('renderer_adapter_invalid', `Missing adapter operation ${name}`);
      }
      state = 'ready';
      resolveReady(session);
    }).catch(fail);
    return session;
  }
  return Object.freeze({ create, OPERATIONS });
});
