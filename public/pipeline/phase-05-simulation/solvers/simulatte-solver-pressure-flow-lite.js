(function attachSimulattePressureFlowSolver(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulattePressureFlowSolver = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createPressureFlowSolverApi() {
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

  function firstInput(step, prefix) {
    return firstMatching(step.inputs || step.reads || [], prefix);
  }

  function firstOutput(step, prefix) {
    return firstMatching(step.outputs || step.writes || [], prefix);
  }

  function firstMatching(values, prefix) {
    return (values || []).find((id) => id.startsWith(`${prefix}:`)) || '';
  }

  function vector(value, fallback) {
    if (value && typeof value === 'object') return { x: finite(value.x, fallback.x), y: finite(value.y, fallback.y) };
    return { ...fallback };
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
