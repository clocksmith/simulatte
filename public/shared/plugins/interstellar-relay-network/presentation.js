(function attachInterstellarPresentation(root, factory) {
  const api = factory();
  root.InterstellarRelayPresentation = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createInterstellarPresentationModule() {
  function createPresentation(starsData, relayPlan) {
    const markers = [];
    const paths = [];

    if (Array.isArray(starsData?.stars)) {
      starsData.stars.forEach((s) => {
        const state = globalThis.InterstellarStellarState.convertEquatorialToCartesianPc(s);
        markers.push({
          id: s.sourceId,
          position: state.positionPc,
          label: s.name,
          tone: s.sourceId === 'gaia-sol' ? 'amber' : 'cyan'
        });
      });
    }

    if (relayPlan?.pathPositions) {
      paths.push({
        id: 'optical-relay-link',
        coordinates: relayPlan.pathPositions,
        tone: 'amber',
        width: 2
      });
    }

    return Object.freeze({
      schema: 'simulatte.pluginPresentation.v3',
      coordinateSystem: 'icrs-cartesian-pc',
      epoch: 'J2016.0',
      markers,
      paths,
      actors: [],
      areas: [],
      cameraTargets: [
        { id: 'sol-origin', center: [0, 0, 0] },
        { id: 'target-star', center: relayPlan?.pathPositions?.[1] || [1, 0, 0] }
      ]
    });
  }

  return Object.freeze({ createPresentation });
});
