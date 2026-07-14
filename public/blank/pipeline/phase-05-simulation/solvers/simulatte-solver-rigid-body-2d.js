(function attachSimulatteRigidBodySolver(root, factory) {
  const values = typeof module === 'object' && module.exports
    ? require('./simulatte-solver-values.js')
    : root.SimulatteSolverValues;
  const api = factory(values);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteRigidBodySolver = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createRigidBodySolverApi(values) {
  const { firstOutput, scalar, finite, clamp } = values;
  return {
    id: 'rigid-body-2d',
    operatorTypes: ['rigid_collision'],
    stateVariables: ['position', 'velocity', 'stress', 'damage'],
    supportedInteractions: ['collision', 'impulse', 'damage'],
    stableDt: 0.05,
    integrator: Object.freeze({ scheme: 'explicit_euler_v1', order: 1, symplectic: false, stableDt: 0.05, cfl: 0.9, stateContract: ['position', 'velocity', 'stress', 'damage'] }),
    step,
  };

  function step({ channels = {}, step: row = {}, dt = 0.016 }) {
    const stressId = firstOutput(row, 'stress');
    const damageId = firstOutput(row, 'damage');
    const impulse = finite(row.params && row.params.impulse, 0.5);
    if (stressId) channels[stressId] = clamp(scalar(channels[stressId], 0) + impulse * dt * 0.9, 0, 2);
    if (damageId) channels[damageId] = clamp(scalar(channels[damageId], 0) + impulse * dt * 0.22, 0, 1);
  }

});
