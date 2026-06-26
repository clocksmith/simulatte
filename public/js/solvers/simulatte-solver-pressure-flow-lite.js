(function attachSimulattePressureFlowSolver(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulattePressureFlowSolver = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createPressureFlowSolverApi() {
  return {
    id: 'pressure-flow-lite',
    operatorTypes: ['pressure_flow_lite'],
    stateVariables: ['pressure', 'flowVelocity'],
    supportedInteractions: ['pressureGradient', 'flowVelocity'],
    stableDt: 0.05,
  };
});
