(function attachSimulatteWaveFieldSolver(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteWaveFieldSolver = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createWaveFieldSolverApi() {
  return {
    id: 'wave-field',
    operatorTypes: ['wave_field', 'oscillator'],
    stateVariables: ['phase', 'amplitude'],
    supportedInteractions: ['waveCoupling', 'resonance'],
    stableDt: 0.05,
  };
});
