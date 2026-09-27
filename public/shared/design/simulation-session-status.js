(function attachSimulationSessionStatus(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SimulatteSimulationSessionStatus = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createSessionStatusApi() {
  function create({ host }) {
    if (!host || typeof host.append !== 'function') throw new TypeError('Session status needs a host');
    const indicator = host.ownerDocument.createElement('span');
    indicator.className = 'sim-session-status';
    indicator.dataset.sessionStatus = '';
    indicator.setAttribute('role', 'status');
    indicator.setAttribute('aria-live', 'polite');
    host.prepend(indicator);
    return Object.freeze({
      render(snapshot) {
        if (!snapshot) return;
        indicator.textContent = snapshot.visibleStatus;
        indicator.dataset.sessionStatus = snapshot.visibleStatus.toLowerCase().replace(/\s+/g, '-');
        indicator.dataset.measurement = snapshot.measurement;
        indicator.title = snapshot.pending?.length ? 'An operation is pending'
          : snapshot.lastOperation?.status === 'failed' ? snapshot.lastOperation.error
          : snapshot.measurement === 'stale' ? 'The last measurement is stale'
          : snapshot.measurement === 'pending' ? 'Updating the measurement' : '';
        indicator.dataset.operation = snapshot.pending?.length ? 'pending' : snapshot.lastOperation?.status || 'idle';
      },
      dispose() { indicator.remove(); },
    });
  }
  return Object.freeze({ create });
});
