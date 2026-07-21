(function attachWorldTileStorage(root, factory) {
  const browserTileStorage = typeof module === 'object' && module.exports
    ? require('../platform/storage/browser-tile-storage.js')
    : root.SimulatteBrowserTileStorage;
  const api = factory(browserTileStorage);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteWorldTileStorage = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createWorldTileStorageCompatibility(browserTileStorage) {
  if (!browserTileStorage || typeof browserTileStorage.createBrowserTileStores !== 'function' || typeof browserTileStorage.createWorkerDecoder !== 'function') {
    throw new Error('world_tile_storage_dependency_missing: browser tile storage is required');
  }
  return browserTileStorage;
});
