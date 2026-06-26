(function attachSimulatteReactionDiffusionSolver(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteReactionDiffusionSolver = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createReactionDiffusionSolverApi() {
  return {
    id: 'reaction-diffusion',
    operatorTypes: ['reaction_diffusion'],
    stateVariables: ['reactionProgress', 'temperature'],
    supportedInteractions: ['reaction', 'frontPropagation'],
    stableDt: 0.05,
  };
});
