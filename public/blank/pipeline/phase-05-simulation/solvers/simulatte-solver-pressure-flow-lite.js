(function attachSimulattePressureFlowSolver(root, factory) {
  const values = typeof module === 'object' && module.exports
    ? require('./simulatte-solver-values.js')
    : root.SimulatteSolverValues;
  const api = factory(values);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulattePressureFlowSolver = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createPressureFlowSolverApi(values) {
  const { firstInput, firstOutput, vector, scalar, finite, clamp } = values;
  return {
    id: 'pressure-flow-lite',
    operatorTypes: ['pressure_flow_lite'],
    stateVariables: ['pressure', 'flowVelocity'],
    supportedInteractions: ['pressureGradient', 'flowVelocity'],
    stableDt: 0.05,
    step,
  };

  function step({ channels = {}, step: row = {}, dt = 0.016 }) {
    const pressureId = firstInput(row, 'pressure');
    const flowId = firstOutput(row, 'flowVelocity');
    if (!pressureId || !flowId) return;
    const pressure = scalar(channels[pressureId], 0.3);
    const flow = vector(channels[flowId], { x: 0, y: 0 });
    flow.x = clamp(flow.x + pressure * dt * 0.35, -4, 4);
    flow.y = clamp(flow.y + Math.sin((channels.__t || 0) * 0.7) * dt * 0.05, -4, 4);
    channels[flowId] = flow;
  }

});
