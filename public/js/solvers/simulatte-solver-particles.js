(function attachSimulatteParticleSolver(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteParticleSolver = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createParticleSolverApi() {
  return {
    id: 'particles',
    operatorTypes: ['advection', 'reaction_diffusion'],
    stateVariables: ['position', 'velocity', 'density'],
    supportedInteractions: ['transport', 'emission', 'mixing'],
    stableDt: 0.05,
  };
});
