(function attachApplicationLoadContext(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteApplicationLoadContext = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createApplicationLoadContext() {
  function defaultFetch() {
    return typeof fetch === 'function' ? fetch.bind(globalThis) : null;
  }

  function documentBase() {
    return typeof document !== 'undefined' && document.baseURI ? document.baseURI : 'http://localhost/';
  }

  function createDataServices({ fetchImpl = defaultFetch(), transportApi, artifactStoreApi }) {
    const transport = transportApi.createBrowserTransport({ fetchImpl });
    return Object.freeze({
      transport,
      artifacts: artifactStoreApi.createGovernedArtifactStore({ transport }),
    });
  }

  function assertDependencies(rows, createError) {
    const missing = rows.find(([, value, method]) => !value || typeof value[method] !== 'function');
    if (!missing) return;
    const message = `${missing[0]}.${missing[2]} is required`;
    throw typeof createError === 'function' ? createError(message, missing) : new Error(message);
  }

  function createLoadError(name, code, message, evidence) {
    const error = new Error(`${code}: ${message}`);
    error.name = name;
    error.code = code;
    error.evidence = evidence;
    return error;
  }

  return Object.freeze({
    assertDependencies,
    createDataServices,
    createLoadError,
    defaultFetch,
    documentBase,
  });
});
