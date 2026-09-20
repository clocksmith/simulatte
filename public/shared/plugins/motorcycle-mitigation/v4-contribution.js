(function attachMotorcycleMitigationV4(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteMotorcycleMitigationV4 = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createMotorcycleMitigationV4() {
  'use strict';

  const PLUGIN_ID = 'motorcycle-mitigation';

  function createContribution({ state, config }) {
    const metrics = state.metrics || {};
    const bikes = state.bikes || [];
    const receipts = state.violationReceipts || [];

    return Object.freeze({
      pluginId: PLUGIN_ID,
      version: '1.0.0',
      timestampSec: state.currentTime || 0,
      tickCount: state.tickCount || 0,
      corridorStatus: {
        scenarioId: state.scenario ? state.scenario.id : 'unknown',
        totalBikes: bikes.length,
        activeBikes: bikes.filter((b) => b.engineState !== 'stalled').length,
        stalledBikes: metrics.stalledBikesCount || 0,
        quenchRatePercentage: metrics.stalledPercentage || 0,
      },
      acousticMetrics: {
        peakSidewalkDba: metrics.peakSidewalkDba || 0,
        unmitigatedPeakDba: metrics.unmitigatedPeakDba || 0,
        activeAttenuationDba: metrics.activeAttenuationDba || 0,
        averageSidewalkDba: metrics.averageSidewalkDba || 0,
      },
      forensics: {
        identifiedBikesCount: metrics.identifiedBikesCount || 0,
        violationsIssuedCount: receipts.length,
        receipts: receipts.slice(-10),
      },
      activeControls: { ...state.controls },
    });
  }

  return Object.freeze({
    PLUGIN_ID,
    createContribution,
  });
});
