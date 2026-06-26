(function attachSimulatteRigidBodySolver(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteRigidBodySolver = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createRigidBodySolverApi() {
  return {
    id: 'rigid-body-2d',
    operatorTypes: ['rigid_collision'],
    stateVariables: ['position', 'velocity', 'stress', 'damage'],
    supportedInteractions: ['collision', 'impulse', 'damage'],
    stableDt: 0.05,
    step,
  };

  function step({ channels = {}, step: row = {}, dt = 0.016 }) {
    const stressId = firstOutput(row, 'stress');
    const damageId = firstOutput(row, 'damage');
    const impulse = finite(row.params && row.params.impulse, 0.5);
    if (stressId) channels[stressId] = clamp(scalar(channels[stressId], 0) + impulse * dt * 0.9, 0, 2);
    if (damageId) channels[damageId] = clamp(scalar(channels[damageId], 0) + impulse * dt * 0.22, 0, 1);
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
