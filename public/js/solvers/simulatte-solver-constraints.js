(function attachSimulatteConstraintSolver(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteConstraintSolver = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createConstraintSolverApi() {
  return {
    id: 'springs-constraints',
    operatorTypes: ['spring_constraint'],
    stateVariables: ['position', 'force'],
    supportedInteractions: ['distance_constraint', 'anchor', 'spring'],
    stableDt: 0.05,
    step,
  };

  function step({ channels = {}, step: row = {}, dt = 0.016 }) {
    const forceId = firstOutput(row, 'force');
    if (!forceId) return;
    const current = vector(channels[forceId], { x: 0, y: 0 });
    const stiffness = finite(row.params && row.params.stiffness, 0.4);
    channels[forceId] = {
      x: current.x * (1 - dt * stiffness),
      y: current.y * (1 - dt * stiffness),
    };
  }

  function firstOutput(step, prefix) {
    return ((step.outputs || step.writes || []).find((id) => id.startsWith(`${prefix}:`))) || '';
  }

  function vector(value, fallback) {
    if (value && typeof value === 'object') return { x: finite(value.x, fallback.x), y: finite(value.y, fallback.y) };
    return { ...fallback };
  }

  function finite(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }
});
