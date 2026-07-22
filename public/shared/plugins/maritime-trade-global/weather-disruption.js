(function attachMaritimeWeatherDisruption(root, factory) {
  const api = factory();
  root.MaritimeWeatherDisruption = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createMaritimeWeatherDisruption() {
  function resolveDisruption(scenarioId, weatherSnapshot = null) {
    const id = String(scenarioId || '').toLowerCase();
    if (id.includes('suez')) return disruption('suez-closure', 0.92, 4.8, 'cape_good_hope', 'Declared Suez closure scenario');
    if (id.includes('panama')) return disruption('panama-capacity', 0.90, 3.2, null, 'Declared Panama capacity restriction');
    if (id.includes('cyclone') || id.includes('hurricane')) return disruption('tropical-cyclone', 0.72, 5.5, null, 'Pinned tropical-cyclone scenario track');
    const active = (weatherSnapshot?.events || weatherSnapshot?.tracks || []).find((row) => row.active === true);
    if (active) return disruption(`weather:${active.id}`, Number(active.speedMultiplier || 0.85), Number(active.queueMultiplier || 2), active.rerouteKind || null, active.label || 'Pinned weather event');
    return disruption('baseline', 1, 1, null, 'No declared disruption');
  }
  function disruption(id, speedMultiplier, queueMultiplier, rerouteKind, evidence) {
    return Object.freeze({ schema: 'simulatte.maritimeDisruption.v1', id, speedMultiplier, queueMultiplier, rerouteKind, evidence });
  }
  return Object.freeze({ resolveDisruption });
});
