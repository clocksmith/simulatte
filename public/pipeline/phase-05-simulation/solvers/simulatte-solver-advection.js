(function attachSimulatteAdvectionSolver(root, factory) {
  const values = typeof module === 'object' && module.exports
    ? require('./simulatte-solver-values.js')
    : root.SimulatteSolverValues;
  const api = factory(values);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteAdvectionSolver = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createAdvectionSolverApi(values) {
  const { firstInput, firstOutput, vector, scalar, finite, clamp } = values;
  return {
    id: 'advection',
    operatorTypes: ['advection'],
    stateVariables: ['flowVelocity', 'pressure'],
    supportedInteractions: ['fluidForce', 'transport'],
    stableDt: 0.05,
    step,
  };

  function step({ channels = {}, step: row = {}, dt = 0.016 }) {
    const flowId = firstOutput(row, 'flowVelocity') || firstInput(row, 'flowVelocity');
    if (!flowId) return;
    const flow = vector(channels[flowId], { x: 0.4, y: 0 });
    const rate = finite(row.params && row.params.rate, 0.5);
    const viscosityId = firstInput(row, 'viscosity');
    const viscosity = viscosityId ? scalar(channels[viscosityId], 0.25) : 0.25;
    const pulse = Math.sin((channels.__t || 0) * 1.7 + rate) * 0.018;
    flow.x = clamp(flow.x + (rate - viscosity * 0.18) * dt * 0.4 + pulse, -4, 4);
    flow.y = clamp(flow.y + Math.cos((channels.__t || 0) * 1.3) * dt * 0.08, -4, 4);
    channels[flowId] = flow;
    const pressureId = firstOutput(row, 'pressure');
    if (pressureId) channels[pressureId] = clamp(Math.hypot(flow.x, flow.y) * (1 + viscosity), 0, 2);
  }

});
