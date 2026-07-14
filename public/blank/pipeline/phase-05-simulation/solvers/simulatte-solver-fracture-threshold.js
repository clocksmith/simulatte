(function attachSimulatteFractureThresholdSolver(root, factory) {
  const values = typeof module === 'object' && module.exports
    ? require('./simulatte-solver-values.js')
    : root.SimulatteSolverValues;
  const api = factory(values);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteFractureThresholdSolver = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createFractureThresholdSolverApi(values) {
  const { firstInput, firstOutput, scalar, finite, clamp } = values;
  return {
    id: 'fracture-threshold',
    operatorTypes: ['fracture_threshold'],
    stateVariables: ['stress', 'damage', 'temperature'],
    supportedInteractions: ['fracture', 'heatDamage', 'impactDamage'],
    stableDt: 0.05,
    integrator: Object.freeze({ scheme: 'explicit_euler_v1', order: 1, symplectic: false, stableDt: 0.05, cfl: 0.9, stateContract: ['stress', 'damage', 'temperature'] }),
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

});
