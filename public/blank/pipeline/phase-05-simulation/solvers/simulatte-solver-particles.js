(function attachSimulatteParticleSolver(root, factory) {
  const values = typeof module === 'object' && module.exports
    ? require('./simulatte-solver-values.js')
    : root.SimulatteSolverValues;
  const api = factory(values);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteParticleSolver = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createParticleSolverApi(values) {
  const { scalar, clamp } = values;
  return {
    id: 'particles',
    operatorTypes: ['advection', 'reaction_diffusion'],
    stateVariables: ['position', 'velocity', 'density'],
    supportedInteractions: ['transport', 'emission', 'mixing'],
    stableDt: 0.05,
    step,
  };

  function step({ channels = {}, step: row = {}, dt = 0.016 }) {
    for (const output of row.outputs || row.writes || []) {
      if (/density|reactionProgress|nutrient/.test(output)) {
        channels[output] = clamp(scalar(channels[output], 0.3) + dt * 0.02, 0, 1);
      }
    }
  }

});
