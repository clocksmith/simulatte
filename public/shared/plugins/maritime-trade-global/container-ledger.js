(function attachContainerLedger(root, factory) {
  const api = factory();
  root.MaritimeContainerLedger = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createContainerLedgerModule() {
  function createContainerLedger({ scenarioId = 'baseline', containerCount = 1000, originPort, destinationPort } = {}) {
    const containers = Array.from({ length: containerCount }, (_, index) => Object.freeze({
      containerId: `cntr:${scenarioId}:${String(index + 1).padStart(6, '0')}`,
      isoCode: index % 2 === 0 ? '45G1' : '22G1',
      cargoType: index % 5 === 0 ? 'reefer-perishable' : 'general-dry',
      weightTons: 14.5 + (index % 10) * 0.8,
      originPort, destinationPort, currentLocation: originPort, status: 'booked',
      lineage: Object.freeze([{ sequence: 0, kind: 'booked', location: originPort }]),
    }));
    return state(scenarioId, containers);
  }
  function applyEvent(ledger, event) {
    const targets = event.containerIds ? new Set(event.containerIds) : null;
    const containers = ledger.containers.map((container) => {
      if (targets && !targets.has(container.containerId)) return container;
      const nextStatus = event.kind === 'loaded' ? 'in-transit' : event.kind === 'discharged' ? 'at-terminal' : event.kind === 'delivered' ? 'delivered' : container.status;
      return Object.freeze({ ...container, status: nextStatus, currentLocation: event.location || container.currentLocation,
        lineage: Object.freeze([...container.lineage, Object.freeze({ sequence: container.lineage.length, kind: event.kind, location: event.location || null, time: event.time ?? null })]) });
    });
    return state(ledger.scenarioId, containers);
  }
  function state(scenarioId, containers) { return Object.freeze({ schema: 'simulatte.containerLedger.v1', scenarioId, totalContainers: containers.length, containers: Object.freeze(containers) }); }
  return Object.freeze({ createContainerLedger, applyEvent });
});
