(function attachInterstellarPresentation(root, factory) {
  const api = factory(root);
  root.InterstellarRelayPresentation = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createInterstellarPresentationModule(root) {
  function createPresentation(starsData, relayPlan = {}) {
    const stellarApi = typeof module === 'object' && module.exports ? require('./stellar-state.js') : root.InterstellarStellarState;
    const relayIds = new Set(relayPlan.relayPath || []);
    const markers = (starsData?.stars || []).map((star) => {
      const state = stellarApi.convertEquatorialToCartesianPc(star, 2026.5);
      return { id: star.sourceId, position: state.positionPc, label: state.name, tone: star.sourceId === 'gaia-sol' ? 'amber' : relayIds.has(star.sourceId) ? 'cyan' : 'muted', radius: relayIds.has(star.sourceId) ? 0.09 : 0.04 };
    });
    const paths = Array.isArray(relayPlan.pathPositions) && relayPlan.pathPositions.length >= 2
      ? [{ id: 'optical-relay-link', label: 'Selected store-and-forward path', coordinates: relayPlan.pathPositions, tone: 'amber', width: 3 }]
      : [];
    return Object.freeze({
      schema: 'simulatte.pluginPresentation.v3', coordinateSystem: 'icrs-cartesian-pc', epoch: 'J2026.5',
      markers, paths, actors: [], areas: [],
      cameraTargets: [
        { id: 'stellar-neighborhood', label: 'Nearby stellar neighborhood', center: [0,0,0], distance: 12 },
        { id: 'target-star', label: 'Target star', center: relayPlan.pathPositions?.at(-1) || [1,0,0], distance: 3 },
      ],
    });
  }
  return Object.freeze({ createPresentation });
});
