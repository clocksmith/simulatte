(function attachSimulatteNetworkControlSolver(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteNetworkControlSolver = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createNetworkControlSolverApi() {
  return {
    id: 'network-control',
    operatorTypes: ['network_flow'],
    stateVariables: ['backlog', 'throughput', 'signalDelay'],
    supportedInteractions: ['demand', 'service', 'feedback'],
    stableDt: 0.05,
  };
});
