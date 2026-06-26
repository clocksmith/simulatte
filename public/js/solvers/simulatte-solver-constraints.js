(function attachSimulatteConstraintSolver(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteConstraintSolver = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createConstraintSolverApi() {
  return {
    id: 'springs-constraints',
    operatorTypes: ['spring_constraint'],
    stateVariables: ['position', 'force'],
    supportedInteractions: ['distance_constraint', 'anchor', 'spring'],
    stableDt: 0.05,
  };
});
