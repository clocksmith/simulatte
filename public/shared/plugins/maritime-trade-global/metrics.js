(function attachMaritimeMetrics(root, factory) {
  const api = factory();
  root.MaritimeMetrics = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createMaritimeMetrics() {
  function summarize({ route, queue, ledger, emissions, eventTrace }) {
    const delivered = ledger?.containers?.filter((row) => row.status === 'delivered').length || 0;
    const total = ledger?.containers?.length || 0;
    return Object.freeze({
      schema: 'simulatte.maritimeMetrics.v1',
      distanceNm: route.distanceNm,
      sailingDays: route.sailingDays,
      queueWaitHours: queue?.averageWaitHours || 0,
      totalTransitDays: route.sailingDays + (queue?.averageWaitHours || 0) / 24,
      containersTotal: total,
      containersDelivered: delivered,
      deliveryPercent: total ? delivered / total : 0,
      fuelTons: emissions.fuelTons,
      co2Tons: emissions.co2Tons,
      intensityGCo2PerTeuNm: emissions.intensityGCo2PerTeuNm,
      eventCount: eventTrace?.length || 0,
    });
  }
  return Object.freeze({ summarize });
});
