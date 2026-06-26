(function attachSimulatteFractureThresholdSolver(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteFractureThresholdSolver = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createFractureThresholdSolverApi() {
  return {
    id: 'fracture-threshold',
    operatorTypes: ['fracture_threshold'],
    stateVariables: ['stress', 'damage', 'temperature'],
    supportedInteractions: ['fracture', 'heatDamage', 'impactDamage'],
    stableDt: 0.05,
  };
});
