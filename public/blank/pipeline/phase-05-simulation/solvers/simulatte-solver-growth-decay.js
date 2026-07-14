(function attachSimulatteGrowthDecaySolver(root, factory) {
  const values = typeof module === 'object' && module.exports
    ? require('./simulatte-solver-values.js')
    : root.SimulatteSolverValues;
  const api = factory(values);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteGrowthDecaySolver = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createGrowthDecaySolverApi(values) {
  const { firstInput, firstOutput, scalar, finite, clamp } = values;
  return {
    id: 'growth-decay',
    operatorTypes: ['growth_decay'],
    stateVariables: ['density', 'nutrient'],
    supportedInteractions: ['growthCoupling', 'resourceConsumption', 'decay'],
    stableDt: 0.05,
    integrator: Object.freeze({ scheme: 'explicit_euler_v1', order: 1, symplectic: false, stableDt: 0.05, cfl: 0.9, stateContract: ['density', 'nutrient'] }),
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

});
