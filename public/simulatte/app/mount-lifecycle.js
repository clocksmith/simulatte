(function attachMountLifecycle(root, factory) {
  const api = factory(root);
  root.SimulatteMountLifecycle = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createMountLifecycleModule(root) {
  function create(parentSignal = null, fetchImpl = null) {
    const controller = new AbortController();
    const { signal } = controller;
    const baseFetch = fetchImpl || (typeof root.fetch === 'function' ? root.fetch.bind(root) : null);

    if (parentSignal?.aborted) {
      controller.abort(parentSignal.reason);
    } else if (parentSignal) {
      parentSignal.addEventListener('abort', () => controller.abort(parentSignal.reason), {
        once: true,
        signal,
      });
    }

    function throwIfAborted() {
      if (typeof signal.throwIfAborted === 'function') {
        signal.throwIfAborted();
        return;
      }
      if (!signal.aborted) return;
      const error = new Error('Mount lifecycle was aborted');
      error.name = 'AbortError';
      throw error;
    }

    function on(target, type, handler, options = {}) {
      target.addEventListener(type, handler, { ...options, signal });
    }

    function fetchWithSignal(input, options = {}) {
      if (!baseFetch) throw new Error('simulatte_mount_lifecycle_fetch_unavailable');
      throwIfAborted();
      return baseFetch(input, { ...options, signal });
    }

    return Object.freeze({
      signal,
      on,
      fetch: fetchWithSignal,
      abort: (reason) => controller.abort(reason),
      throwIfAborted,
    });
  }

  async function disposeAll(entries, onFailure = null) {
    const failures = [];
    for (const entry of entries || []) {
      if (!entry || typeof entry.dispose !== 'function') continue;
      try {
        await entry.dispose();
      } catch (error) {
        const failure = Object.freeze({ resource: entry.resource || 'unknown', error });
        failures.push(failure);
        try { onFailure?.(failure); } catch (_error) { /* disposal evidence must not block cleanup */ }
      }
    }
    return Object.freeze(failures);
  }

  return Object.freeze({ create, disposeAll });
});
