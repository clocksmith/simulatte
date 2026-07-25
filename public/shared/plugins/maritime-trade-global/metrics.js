(function attachMaritimeMetrics(root, factory) {
  const api = factory();
  root.MaritimeMetrics = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createMaritimeMetrics() {
  function summarize({ route, queueEnsemble, ledger, emissions, eventTrace }) {
    const delivered = ledger?.containers?.filter((row) => row.status === 'delivered').length || 0;
    const total = ledger?.containers?.length || 0;
    const queueWaitHours = queueEnsemble?.p50WaitHours || 0;
    return Object.freeze({
      schema: 'simulatte.maritimeMetrics.v2',
      distanceNm: metric(route.distanceNm, 'nautical_mile', 'modeled', route.evidenceRefs, route.truth.uncertainty),
      sailingDays: metric(route.sailingDays, 'day', 'derived', route.evidenceRefs, route.truth.uncertainty),
      queueWaitHours: metric(queueWaitHours, 'hour', 'simulated', queueEnsemble.evidenceRefs, queueEnsemble.truth.uncertainty),
      totalTransitDays: metric(route.sailingDays + queueWaitHours / 24 + 18 / 24, 'day', 'derived', [
        ...route.evidenceRefs,
        ...queueEnsemble.evidenceRefs,
        'model:terminal-handling-v1',
      ], {
        kind: 'interval',
        value: {
          minimum: route.sailingDays + queueEnsemble.p05WaitHours / 24 + 18 / 24,
          maximum: route.sailingDays + queueEnsemble.p95WaitHours / 24 + 18 / 24,
          units: 'day',
        },
      }),
      containersTotal: metric(total, 'representative_container', 'scenario', ledger.evidenceRefs, ledger.truth.uncertainty),
      containersDelivered: metric(delivered, 'representative_container', 'simulated', ledger.evidenceRefs, ledger.truth.uncertainty),
      cargoTeu: metric(emissions.cargoTeu, 'TEU', 'scenario', emissions.evidenceRefs, {
        kind: 'missing',
        value: { reason: 'Scenario cargo load is not a carrier manifest.' },
      }),
      deliveryFraction: metric(total ? delivered / total : 0, 'fraction', 'derived', ledger.evidenceRefs, ledger.truth.uncertainty),
      fuelTons: metric(emissions.fuelTons, 'tonne', 'modeled', emissions.evidenceRefs, emissions.truth.uncertainty),
      co2Tons: metric(emissions.co2Tons, 'tonne_CO2e', 'modeled', emissions.evidenceRefs, emissions.truth.uncertainty),
      intensityGCo2PerTeuNm: metric(emissions.intensityGCo2PerTeuNm, 'g_CO2e_per_TEU_nm', 'derived', emissions.evidenceRefs, emissions.truth.uncertainty),
      eventCount: metric(eventTrace?.length || 0, 'event', 'derived', ['model:maritime-causal-event-log-v2'], {
        kind: 'missing',
        value: { reason: 'Event count is exact for the modeled run.' },
      }),
    });
  }

  function metric(value, units, origin, evidenceRefs, uncertainty) {
    return Object.freeze({
      value,
      units,
      truth: Object.freeze({
        origin,
        temporalStatus: 'forecast',
        uncertainty: Object.freeze(uncertainty),
      }),
      evidenceRefs: Object.freeze([...(evidenceRefs || [])]),
    });
  }

  function values(metrics) {
    return Object.freeze(Object.fromEntries(Object.entries(metrics || {})
      .filter(([, row]) => row && typeof row === 'object' && Object.hasOwn(row, 'value'))
      .map(([key, row]) => [key, row.value])));
  }

  return Object.freeze({ summarize, values });
});
