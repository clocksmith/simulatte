(function attachSimulatteParticleDepositionSolver(root, factory) {
  const values = typeof module === 'object' && module.exports
    ? require('./simulatte-solver-values.js')
    : root.SimulatteSolverValues;
  const api = factory(values);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteParticleDepositionSolver = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createParticleDepositionSolverApi(values) {
  const { firstInput, firstOutput, scalar, finite, clamp } = values;
  return {
    id: 'particle-deposition',
    operatorTypes: ['particle_deposition'],
    stateVariables: ['airborneDensity', 'depositedMass'],
    supportedInteractions: ['settling', 'surfaceDeposition', 'massTransfer'],
    stableDt: 0.05,
    integrator: Object.freeze({ scheme: 'explicit_euler_v1', order: 1, symplectic: false, stableDt: 0.05, cfl: 0.9, stateContract: ['airborneDensity', 'depositedMass'] }),
    step,
  };

  function step({ channels = {}, step: row = {}, dt = 0.016 }) {
    const airborneId = firstOutput(row, 'airborneDensity') || firstInput(row, 'airborneDensity');
    const depositedId = firstOutput(row, 'depositedMass') || firstInput(row, 'depositedMass');
    if (!airborneId || !depositedId) return;
    const airborne = scalar(channels[airborneId], 0.72);
    const deposited = scalar(channels[depositedId], 0.04);
    const rate = clamp(finite(row.params && row.params.rate, 0.32), 0, 2);
    const transfer = Math.min(airborne, airborne * rate * Math.max(0, dt));
    channels[airborneId] = clamp(airborne - transfer, 0, 1);
    channels[depositedId] = clamp(deposited + transfer, 0, 4);
  }
});
