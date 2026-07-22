(function attachInterstellarAstrometry(root, factory) {
  const api = factory();
  root.InterstellarRelayAstrometry = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createAstrometryModule() {
  function getStar(gaiaDataset, starId) {
    return gaiaDataset?.stars?.find((s) => s.id === starId) || null;
  }

  function computeDistancePc(pos1, pos2) {
    return Math.hypot(pos2[0] - pos1[0], pos2[1] - pos1[1], pos2[2] - pos1[2]);
  }

  return Object.freeze({ getStar, computeDistancePc });
});
