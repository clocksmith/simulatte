(function attachSimulatteWaveFieldSolver(root, factory) {
  const values = typeof module === 'object' && module.exports
    ? require('./simulatte-solver-values.js')
    : root.SimulatteSolverValues;
  const api = factory(values);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteWaveFieldSolver = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createWaveFieldSolverApi(values) {
  const { firstInput, firstOutput, scalar, finite, clamp } = values;
  return {
    id: 'wave-field',
    operatorTypes: ['wave_field', 'oscillator'],
    stateVariables: ['phase', 'amplitude'],
    supportedInteractions: ['waveCoupling', 'resonance'],
    stableDt: 0.05,
    step,
  };

  function step(context = {}) {
    stepOscillator({ ...context, frequencyScale: context.step && context.step.operatorType === 'wave_field' ? 1.4 : 1 });
  }

  function stepOscillator({ channels = {}, step: row = {}, dt = 0.016, frequencyScale = 1 }) {
    const phaseId = firstOutput(row, 'phase') || firstInput(row, 'phase');
    const amplitudeId = firstOutput(row, 'amplitude') || firstInput(row, 'amplitude');
    const frequency = finite(row.params && row.params.frequency, 0.7) * frequencyScale;
    if (phaseId) channels[phaseId] = scalar(channels[phaseId], 0) + frequency * dt * Math.PI * 2;
    if (amplitudeId) {
      const phase = phaseId ? scalar(channels[phaseId], 0) : channels.__t || 0;
      channels[amplitudeId] = clamp(scalar(channels[amplitudeId], 0.4) + Math.sin(phase) * dt * 0.05, 0, 1);
    }
  }

});
