(function attachSimulatteThermalSolver(root, factory) {
  const values = typeof module === 'object' && module.exports
    ? require('./simulatte-solver-values.js')
    : root.SimulatteSolverValues;
  const api = factory(values);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteThermalSolver = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createThermalSolverApi(values) {
  const { firstInput, firstOutput, lastOutput, scalar, finite, clamp } = values;
  return {
    id: 'thermal',
    operatorTypes: ['heat_source', 'heat_transfer', 'phase_transition'],
    stateVariables: ['temperature', 'liquidFraction'],
    supportedInteractions: ['heatTransfer', 'cooling', 'melting'],
    stableDt: 0.05,
    step,
  };

  function step(context = {}) {
    const type = context.step && context.step.operatorType || context.step && context.step.type || '';
    if (type === 'heat_source') return stepHeatSource(context);
    if (type === 'heat_transfer') return stepHeatTransfer(context);
    if (type === 'phase_transition') return stepPhaseTransition(context);
  }

  function stepHeatSource({ channels = {}, step: row = {}, dt = 0.016 }) {
    const out = firstOutput(row, 'temperature');
    if (!out) return;
    const current = scalar(channels[out], 0.4);
    const strength = finite(row.params && row.params.strength, 0.5);
    channels[out] = clamp(current + strength * dt * 0.42, 0, 2);
  }

  function stepHeatTransfer({ channels = {}, step: row = {}, dt = 0.016 }) {
    const sourceId = firstInput(row, 'temperature');
    const targetId = lastOutput(row, 'temperature');
    if (!sourceId || !targetId) return;
    const source = scalar(channels[sourceId], 0.4);
    const target = scalar(channels[targetId], 0.3);
    const rate = finite(row.params && row.params.rate, 0.35);
    channels[targetId] = clamp(target + (source - target) * rate * dt, 0, 2);
  }

  function stepPhaseTransition({ channels = {}, step: row = {}, dt = 0.016 }) {
    const temperatureId = firstInput(row, 'temperature');
    const phaseId = firstOutput(row, 'liquidFraction');
    if (!temperatureId || !phaseId) return;
    const temperature = scalar(channels[temperatureId], 0.2);
    const phase = scalar(channels[phaseId], 0);
    const threshold = finite(row.params && row.params.threshold, 0.32);
    const rate = finite(row.params && row.params.rate, 0.45);
    const delta = temperature > threshold
      ? (temperature - threshold) * rate * dt
      : -(threshold - temperature) * rate * dt * 0.2;
    channels[phaseId] = clamp(phase + delta, 0, 1);
  }

});
