(function attachSimulatteFractureThresholdSolver(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteFractureThresholdSolver = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createFractureThresholdSolverApi() {
  return {
    id: 'fracture-threshold',
    operatorTypes: ['fracture_threshold'],
    stateVariables: ['stress', 'damage', 'temperature'],
    supportedInteractions: ['fracture', 'heatDamage', 'impactDamage'],
    stableDt: 0.05,
    step,
  };

  function step({ channels = {}, step: row = {}, dt = 0.016 }) {
    const stressId = firstInput(row, 'stress');
    const damageId = firstOutput(row, 'damage');
    if (!damageId) return;
    const stress = scalar(channels[stressId], 0);
    const temperatureId = firstInput(row, 'temperature');
    const temperature = temperatureId ? scalar(channels[temperatureId], 0.3) : 0.3;
    const threshold = finite(row.params && row.params.threshold, 0.6);
    const overload = Math.max(0, stress + Math.max(0, temperature - 0.8) * 0.5 - threshold);
    channels[damageId] = clamp(scalar(channels[damageId], 0) + overload * dt * 0.5, 0, 1);
  }

  function firstInput(step, prefix) {
    return firstMatching(step.inputs || step.reads || [], prefix);
  }

  function firstOutput(step, prefix) {
    return firstMatching(step.outputs || step.writes || [], prefix);
  }

  function firstMatching(values, prefix) {
    return (values || []).find((id) => id.startsWith(`${prefix}:`)) || '';
  }

  function scalar(value, fallback) {
    return finite(value, fallback);
  }

  function finite(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }
});
