(function attachTierDataLoader(root, factory) {
  const transportApi = typeof module === 'object' && module.exports
    ? require('../platform/transport/browser-transport.js')
    : root.SimulatteBrowserTransport;
  const api = factory(transportApi);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteTierDataLoader = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createTierDataLoaderApi(transportApi) {
  function createTierDataLoader({ fetchImpl = defaultFetch(), baseUrl = documentBase() } = {}) {
    if (!transportApi || typeof transportApi.createBrowserTransport !== 'function') throw new Error('tier_data_transport_missing');
    const transport = transportApi.createBrowserTransport({ fetchImpl, cacheMode: 'no-cache' });
    const allowedOrigin = new URL(baseUrl).origin;
    async function fetchLocal(input) {
      const url = new URL(input, baseUrl);
      if (url.origin !== allowedOrigin) return failedResponse(url, 403, 'tier_data_remote_origin_forbidden');
      try {
        const loaded = await transport.readText(url.toString(), { cache: 'no-cache' });
        return Object.freeze({
          ok: true, status: 200, url: url.toString(),
          async text() { return loaded.text; },
          async json() { return JSON.parse(loaded.text); },
        });
      } catch (error) {
        return failedResponse(url, Number(error?.evidence?.status) || 0, error?.code || error?.message || 'tier_data_read_failed');
      }
    }
    return Object.freeze({ fetch: fetchLocal });
  }
  function failedResponse(url, status, reason) {
    return Object.freeze({
      ok: false, status, url: url.toString(), reason,
      async text() { throw new Error(reason); },
      async json() { throw new Error(reason); },
    });
  }
  function defaultFetch() { return typeof fetch === 'function' ? fetch.bind(globalThis) : null; }
  function documentBase() { return typeof document !== 'undefined' && document.baseURI ? document.baseURI : 'http://localhost/'; }
  return Object.freeze({ createTierDataLoader });
});
