(function attachBrowserTransport(root, factory) {
  const runtimeLog = typeof module === 'object' && module.exports
    ? require('../../runtime/runtime-log.js')
    : root.SimulatteAutonomyRuntimeLog;
  const api = factory(runtimeLog);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteBrowserTransport = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createBrowserTransportModule(runtimeLog) {
  const DEFAULT_CACHE_MODE = 'no-cache';

  if (!runtimeLog || typeof runtimeLog.info !== 'function' || typeof runtimeLog.error !== 'function') {
    throw new Error('browser_transport_dependency_missing: runtime log is required');
  }

  function createBrowserTransport({ fetchImpl = defaultFetch(), cacheMode = DEFAULT_CACHE_MODE } = {}) {
    if (typeof fetchImpl !== 'function') throw transportError('transport_fetch_missing', 'Browser transport expected a fetch function', null);
    if (typeof cacheMode !== 'string' || !cacheMode) throw transportError('transport_cache_mode_invalid', 'Browser transport expected a cache mode', { cacheMode });

    async function readResponse(url, signal) {
      const options = { cache: cacheMode };
      if (signal) options.signal = signal;
      let response;
      try {
        response = await fetchImpl(url, options);
      } catch (error) {
        runtimeLog.error('data.asset.fetch.failed', {
          url,
          cacheMode,
          error: runtimeLog.serializeError(error),
        });
        throw transportError('asset_fetch_failed', `${url} request failed: ${error.message}`, {
          url,
          status: null,
          cause: runtimeLog.serializeError(error),
        });
      }
      const responseMetadata = responseReceipt(response, cacheMode);
      runtimeLog.info('data.asset.fetch.completed', { url, ...responseMetadata });
      if (!response || !response.ok) {
        throw transportError('asset_fetch_failed', `${url} expected HTTP success, received ${response?.status || 'no response'}`, {
          url,
          status: response?.status || null,
          response: responseMetadata,
        });
      }
      return { response, responseMetadata };
    }

    async function readText(url, { signal = null } = {}) {
      const { response, responseMetadata } = await readResponse(url, signal);
      return Object.freeze({
        url,
        text: await response.text(),
        response: responseMetadata,
      });
    }

    async function readBytes(url, { signal = null } = {}) {
      const { response, responseMetadata } = await readResponse(url, signal);
      return Object.freeze({
        url,
        bytes: new Uint8Array(await response.arrayBuffer()),
        response: responseMetadata,
      });
    }

    return Object.freeze({ cacheMode, readBytes, readText });
  }

  function responseReceipt(response, cacheMode) {
    return Object.freeze({
      status: response?.status || null,
      ok: Boolean(response?.ok),
      cacheMode,
      cacheControl: responseHeader(response, 'cache-control'),
      etag: responseHeader(response, 'etag'),
      contentLength: responseHeader(response, 'content-length'),
    });
  }

  function responseHeader(response, name) {
    return response?.headers && typeof response.headers.get === 'function'
      ? response.headers.get(name)
      : null;
  }

  function defaultFetch() {
    return typeof fetch === 'function' ? fetch.bind(globalThis) : null;
  }

  function transportError(code, message, evidence) {
    const error = new Error(`${code}: ${message}`);
    error.name = 'SimulatteTransportError';
    error.code = code;
    error.evidence = evidence;
    return error;
  }

  return { DEFAULT_CACHE_MODE, createBrowserTransport, responseReceipt };
});
