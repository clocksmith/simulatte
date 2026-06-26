(function attachSimulatteRigidBodySolver(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteRigidBodySolver = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createRigidBodySolverApi() {
  return {
    id: 'rigid-body-2d',
    operatorTypes: ['rigid_collision'],
    stateVariables: ['position', 'velocity', 'stress', 'damage'],
    supportedInteractions: ['collision', 'impulse', 'damage'],
    stableDt: 0.05,
  };
});
