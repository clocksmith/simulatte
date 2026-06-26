(function attachSimulatteThermalSolver(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteThermalSolver = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createThermalSolverApi() {
  return {
    id: 'thermal',
    operatorTypes: ['heat_source', 'heat_transfer', 'phase_transition'],
    stateVariables: ['temperature', 'liquidFraction'],
    supportedInteractions: ['heatTransfer', 'cooling', 'melting'],
    stableDt: 0.05,
  };
});
