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
    step,
  };

  function step({ channels = {}, step: row = {}, dt = 0.016 }) {
    for (const output of row.outputs || row.writes || []) {
      if (/density|reactionProgress|nutrient/.test(output)) {
        channels[output] = clamp(scalar(channels[output], 0.3) + dt * 0.02, 0, 1);
      }
    }
  }

  function scalar(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }
});
