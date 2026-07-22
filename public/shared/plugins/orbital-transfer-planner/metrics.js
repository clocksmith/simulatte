(function attachOrbitalMetrics(root, factory) {
  const api = factory();
  root.OrbitalTransferMetrics = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createOrbitalMetricsModule() {
  function summarize(search, radiation = null) {
    const selected = search?.selected;
    return Object.freeze({
      schema: 'simulatte.orbitalTransferMetrics.v1',
      solutionCount: search?.search?.converged || 0,
      attemptedCount: search?.search?.attempted || 0,
      departureEpoch: selected?.departureEpoch || null,
      arrivalEpoch: selected?.arrivalEpoch || null,
      timeOfFlightDays: selected?.tofDays ?? null,
      totalDeltaVKmS: selected?.endpoint?.totalDeltaVKmS ?? null,
      departureVinfKmS: selected?.endpoint?.departureVinfKmS ?? null,
      arrivalVinfKmS: selected?.endpoint?.arrivalVinfKmS ?? null,
      radiationExposureUnits: radiation?.shieldedProtonUnits ?? null,
      algorithm: selected?.transfer?.algorithm || null,
      claimBoundary: search?.claimBoundary || null,
    });
  }
  return Object.freeze({ summarize });
});
