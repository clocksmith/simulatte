(function attachContainerLedger(root, factory) {
  const api = factory();
  root.MaritimeContainerLedger = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createContainerLedgerModule() {
  function createContainerLedger(scenarioId = 'transpacific-baseline', containerCount = 1000) {
    const containers = [];
    for (let i = 0; i < containerCount; i++) {
      const containerId = `cntr:${scenarioId}:${String(i).padStart(6, '0')}`;
      containers.push({
        containerId,
        isoCode: i % 2 === 0 ? '45G1' : '22G1',
        cargoType: i % 5 === 0 ? 'reefer-perishable' : 'general-dry',
        weightTons: 14.5 + (i % 10) * 0.8,
        originPort: 'CNSHA',
        destinationPort: i % 2 === 0 ? 'USLAX' : 'NLRTM',
        status: 'in-transit'
      });
    }
    return Object.freeze({
      scenarioId,
      totalContainers: containerCount,
      containers
    });
  }

  return Object.freeze({ createContainerLedger });
});
