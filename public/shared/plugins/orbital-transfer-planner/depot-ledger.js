(function attachDepotLedger(root, factory) {
  const api = factory();
  root.OrbitalTransferDepotLedger = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createDepotLedgerModule() {
  function checkDepotAvailability(depotDataset, depotId, requestedMethaloxKg) {
    const depot = depotDataset?.depots?.find((d) => d.id === depotId);
    if (!depot) return { available: false, reason: 'depot_not_found' };
    const methalox = depot.inventory?.methaloxKg || 0;
    if (methalox < requestedMethaloxKg) {
      return { available: false, reason: 'insufficient_propellant', current: methalox, requested: requestedMethaloxKg };
    }
    return { available: true, current: methalox, remaining: methalox - requestedMethaloxKg };
  }

  return Object.freeze({ checkDepotAvailability });
});
