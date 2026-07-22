(function attachTierPluginPresentation(root, factory) {
  const api = factory();
  root.SimulatteTierPluginPresentation = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createTierPluginPresentationApi() {
  function compileTierPresentation(pluginPresentation, coordinateSystem = 'equirectangular-planar') {
    if (!pluginPresentation) return null;
    const schema = pluginPresentation.schema;
    if (schema !== 'simulatte.pluginPresentation.v3') return null;

    return Object.freeze({
      schema,
      coordinateSystem: pluginPresentation.coordinateSystem || coordinateSystem,
      epoch: pluginPresentation.epoch || null,
      markers: Object.freeze(pluginPresentation.markers || pluginPresentation.geoMarkers || []),
      paths: Object.freeze(pluginPresentation.paths || pluginPresentation.geoPaths || []),
      actors: Object.freeze(pluginPresentation.actors || []),
      areas: Object.freeze(pluginPresentation.areas || pluginPresentation.geoAreas || []),
      choropleths: Object.freeze(pluginPresentation.choropleths || []),
      cameraTargets: Object.freeze(pluginPresentation.cameraTargets || pluginPresentation.geoCameraTargets || []),
    });
  }

  return Object.freeze({
    compileTierPresentation,
  });
});
