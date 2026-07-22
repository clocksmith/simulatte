(function attachInterstellarNetwork(root, factory) {
  const api = factory();
  root.InterstellarRelayNetwork = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createNetworkModule() {
  function solveRelayGraph(gaiaDataset, transceiverDataset, dustDataset, targetStarId) {
    const sun = gaiaDataset?.stars?.find((s) => s.id === 'star-sun');
    const target = gaiaDataset?.stars?.find((s) => s.id === targetStarId) || gaiaDataset?.stars?.[1];

    const distPc = globalThis.InterstellarRelayAstrometry.computeDistancePc(sun?.posPc || [0, 0, 0], target?.posPc || [1, 1, 0]);
    const transceiver = transceiverDataset?.transceivers?.['deep-space-node-v1'];
    const linkBudget = globalThis.InterstellarRelayPropagation.computeLinkBudget(distPc, transceiver, dustDataset);

    return {
      sourceStar: sun?.name,
      targetStar: target?.name,
      distPc,
      distLy: linkBudget.distanceLy,
      latencyYears: linkBudget.latencyYears,
      dataRateGbps: linkBudget.dataRateGbps,
      path: [sun?.posPc || [0, 0, 0], target?.posPc || [1, 1, 0]]
    };
  }

  return Object.freeze({ solveRelayGraph });
});
