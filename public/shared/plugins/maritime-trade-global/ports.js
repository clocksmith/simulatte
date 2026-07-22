(function attachMaritimePorts(root, factory) {
  const api = factory();
  root.MaritimeTradePorts = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createMaritimePortsModule() {
  function getPort(portsDataset, portId) {
    return portsDataset?.ports?.find((p) => p.id === portId) || null;
  }

  return Object.freeze({ getPort });
});
