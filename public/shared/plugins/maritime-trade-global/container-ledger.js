(function attachContainerLedger(root, factory) {
  const api = factory();
  root.MaritimeContainerLedger = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createContainerLedgerModule() {
  function createContainerLedger({ scenarioId = 'baseline', containerCount = 1000, originPort, destinationPort } = {}) {
    const containers = Array.from({ length: containerCount }, (_, index) => Object.freeze({
      containerId: `cntr:${scenarioId}:${String(index + 1).padStart(6, '0')}`,
      isoCode: index % 2 === 0 ? '45G1' : '22G1',
      teu: index % 2 === 0 ? 2 : 1,
      cargoType: index % 5 === 0 ? 'reefer-perishable' : 'general-dry',
      weightTons: 14.5 + (index % 10) * 0.8,
      originPort, destinationPort, currentLocation: originPort, status: 'booked',
      truth: truth('scenario', 'forecast', { kind: 'missing', value: { reason: 'Synthetic representative container record.' } }),
      evidenceRefs: Object.freeze(['model:container-lineage-state-machine-v2']),
      lineage: Object.freeze([lineageEvent(0, {
        eventId: `container-booked:${scenarioId}`,
        kind: 'booked',
        location: originPort,
        time: 0,
        causalParentIds: [],
      })]),
    }));
    return state(scenarioId, containers);
  }
  function applyEvent(ledger, event) {
    const targets = event.containerIds ? new Set(event.containerIds) : null;
    const containers = ledger.containers.map((container) => {
      if (targets && !targets.has(container.containerId)) return container;
      const nextStatus = event.kind === 'loaded' ? 'in-transit' : event.kind === 'discharged' ? 'at-terminal' : event.kind === 'delivered' ? 'delivered' : container.status;
      return Object.freeze({ ...container, status: nextStatus, currentLocation: event.location || container.currentLocation,
        lineage: Object.freeze([...container.lineage, lineageEvent(container.lineage.length, event)]) });
    });
    return state(ledger.scenarioId, containers);
  }
  function lineageEvent(sequence, event) {
    return Object.freeze({
      sequence,
      eventId: event.eventId || `container-event:${sequence}`,
      kind: event.kind,
      location: event.location || null,
      timeHours: event.time ?? null,
      causalParentIds: Object.freeze([...(event.causalParentIds || [])]),
      evidenceRefs: Object.freeze([...(event.evidenceRefs || ['model:container-lineage-state-machine-v2'])]),
    });
  }
  function state(scenarioId, containers) {
    return Object.freeze({
      schema: 'simulatte.containerLedger.v2',
      scenarioId,
      totalContainers: containers.length,
      totalTeu: containers.reduce((sum, row) => sum + row.teu, 0),
      truth: truth('simulated', 'forecast', { kind: 'missing', value: { reason: 'Representative records do not claim carrier container identities.' } }),
      evidenceRefs: Object.freeze(['model:container-lineage-state-machine-v2']),
      containers: Object.freeze(containers),
    });
  }
  function truth(origin, temporalStatus, uncertainty) { return Object.freeze({ origin, temporalStatus, uncertainty: Object.freeze(uncertainty) }); }
  return Object.freeze({ createContainerLedger, applyEvent });
});
