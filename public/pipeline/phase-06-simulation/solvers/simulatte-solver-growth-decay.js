(function attachSimulatteGrowthDecaySolver(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteGrowthDecaySolver = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createGrowthDecaySolverApi() {
  return {
    id: 'growth-decay',
    operatorTypes: ['growth_decay'],
    stateVariables: ['density', 'nutrient'],
    supportedInteractions: ['growthCoupling', 'resourceConsumption', 'decay'],
    stableDt: 0.05,
    step,
  };

  function step({ channels = {}, step: row = {}, dt = 0.016 }) {
    const densityId = firstOutput(row, 'density') || firstInput(row, 'density');
    const nutrientId = firstOutput(row, 'nutrient') || firstInput(row, 'nutrient');
    if (!densityId || !nutrientId) return;
    const density = scalar(channels[densityId], 0.25);
    const nutrient = scalar(channels[nutrientId], 0.5);
    const rate = finite(row.params && row.params.rate, 0.25);
    const growth = density * nutrient * rate * dt;
    channels[densityId] = clamp(density + growth - density * dt * 0.025, 0, 1);
    channels[nutrientId] = clamp(nutrient - growth * 0.7 + dt * 0.01, 0, 1);
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
