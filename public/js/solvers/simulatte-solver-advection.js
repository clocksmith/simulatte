(function attachSimulatteAdvectionSolver(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteAdvectionSolver = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createAdvectionSolverApi() {
  return {
    id: 'advection',
    operatorTypes: ['advection'],
    stateVariables: ['flowVelocity', 'pressure'],
    supportedInteractions: ['fluidForce', 'transport'],
    stableDt: 0.05,
  };
});
