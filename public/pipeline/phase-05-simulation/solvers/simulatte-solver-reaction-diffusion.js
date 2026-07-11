(function attachSimulatteReactionDiffusionSolver(root, factory) {
  const values = typeof module === 'object' && module.exports
    ? require('./simulatte-solver-values.js')
    : root.SimulatteSolverValues;
  const api = factory(values);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteReactionDiffusionSolver = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createReactionDiffusionSolverApi(values) {
  const { firstInput, firstOutput, scalar, finite, clamp } = values;
  return {
    id: 'reaction-diffusion',
    operatorTypes: ['reaction_diffusion'],
    stateVariables: ['reactionProgress', 'temperature'],
    supportedInteractions: ['reaction', 'frontPropagation'],
    stableDt: 0.05,
    step,
  };

  function step({ channels = {}, step: row = {}, dt = 0.016 }) {
    const out = firstOutput(row, 'reactionProgress') || firstInput(row, 'reactionProgress');
    if (!out) return;
    const rate = finite(row.params && row.params.rate, 0.4);
    const value = scalar(channels[out], 0);
    channels[out] = clamp(value + value * (1 - value) * rate * dt + 0.01 * dt, 0, 1);
  }

});
