(function attachInterstellarMetrics(root, factory) {
  const api = factory();
  root.InterstellarMetrics = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createInterstellarMetrics() {
  function summarize({ schedule, linkBudgets, packet }) {
    const rates = linkBudgets.map((row) => row.achievableDataRateGbps).filter(Number.isFinite);
    const margins = linkBudgets.map((row) => row.linkMarginDb).filter(Number.isFinite);
    return Object.freeze({
      schema: 'simulatte.interstellarRelayMetrics.v1',
      hopCount: schedule.hops.length,
      oneWayLatencyYears: schedule.totalLatencyYears,
      deliveryEpochIso: schedule.deliveryEpochIso,
      bottleneckDataRateGbps: rates.length ? Math.min(...rates) : 0,
      minimumLinkMarginDb: margins.length ? Math.min(...margins) : null,
      packetBytes: packet.payloadBytes,
      retransmissionCount: Math.max(0, schedule.hops.length - 1),
      packetHash: packet.integrity.packetHash,
    });
  }
  return Object.freeze({ summarize });
});
