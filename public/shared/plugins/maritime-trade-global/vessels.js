(function attachMaritimeVessels(root, factory) {
  const api = factory();
  root.MaritimeTradeVessels = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createMaritimeVesselsModule() {
  function getVesselClass(vesselDataset, classId) {
    return vesselDataset?.classes?.[classId] || null;
  }

  return Object.freeze({ getVesselClass });
});
