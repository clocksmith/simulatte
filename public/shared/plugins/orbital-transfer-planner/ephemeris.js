(function attachEphemeris(root, factory) {
  const api = factory();
  root.OrbitalTransferEphemeris = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createEphemerisModule() {
  function getBodyState(ephemerisDataset, bodyId, day) {
    const bodyData = ephemerisDataset?.bodies?.[bodyId];
    if (!bodyData || !Array.isArray(bodyData.vectors)) {
      throw new Error(`Ephemeris body ${bodyId} not found in dataset`);
    }
    const idx = Math.max(0, Math.min(Math.floor(day), bodyData.vectors.length - 1));
    return bodyData.vectors[idx];
  }

  return Object.freeze({ getBodyState });
});
