(function attachPluginAssetPaths(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulattePluginAssetPaths = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createPluginAssetPaths() {
  // Plugin packages are hosted under <site>/shared/plugins/<id>/. The boot dataset
  // loader and the plugin runtime both need that exact root. A prior reorg that moved
  // plugins from /plugins/ to /shared/plugins/ half-applied because each caller rebuilt
  // the base independently, so one site kept resolving to the old /plugins/ root and
  // 404'd every entry and resource. Own the layout join here so it lives in one place.
  const SHARED_SEGMENT = './shared/';
  const FALLBACK_BASE = 'https://simulatte.world/';

  // The shared asset root (<documentBase>/shared/) that plugin, contract, and core
  // assets hang off. Falls back to the production origin if the document base is
  // unusable (e.g. a non-browser host with no resolvable base URL).
  function sharedRootUrl(documentBaseUrl) {
    try {
      return new URL(SHARED_SEGMENT, documentBaseUrl).toString();
    } catch (_error) {
      return new URL(SHARED_SEGMENT, FALLBACK_BASE).toString();
    }
  }

  // The base URL for one plugin's package directory, given the shared root. Entry and
  // resource paths from the manifest resolve relative to this.
  function pluginBaseUrl(sharedRoot, pluginId) {
    return new URL(`./plugins/${pluginId}/`, sharedRoot).toString();
  }

  // Convenience join for callers that only hold the document base.
  function pluginBaseFromDocument(documentBaseUrl, pluginId) {
    return pluginBaseUrl(sharedRootUrl(documentBaseUrl), pluginId);
  }

  return Object.freeze({ sharedRootUrl, pluginBaseUrl, pluginBaseFromDocument });
});
