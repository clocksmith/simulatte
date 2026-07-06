(function attachSimulatteRotationalMechanicsSolver(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteRotationalMechanicsSolver = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createRotationalMechanicsSolverApi() {
  const TAU = Math.PI * 2;

  return {
    id: 'rotational-mechanics',
    operatorTypes: ['rotational_torque'],
    stateVariables: ['angularVelocity', 'angle', 'torque'],
    supportedInteractions: ['fluidForce', 'torqueTransfer'],
    stableDt: 0.05,
    step,
  };

  function step({ channels = {}, step: row = {}, dt = 0.016 }) {
    const flowId = firstInput(row, 'flowVelocity');
    const angularId = firstOutput(row, 'angularVelocity');
    const angleId = firstOutput(row, 'angle');
    const torqueId = firstOutput(row, 'torque');
    if (!angularId) return;
    const flow = vector(channels[flowId], { x: 0.2, y: 0 });
    const speed = Math.hypot(flow.x, flow.y);
    const viscosityId = firstInput(row, 'viscosity');
    const viscosity = viscosityId ? scalar(channels[viscosityId], 0.25) : 0.25;
    const coupling = finite(row.params && row.params.coupling, 0.6);
    const previous = scalar(channels[angularId], 0);
    const torque = speed * coupling * (1.15 - Math.min(0.95, viscosity)) - previous * 0.12;
    const angular = clamp(previous + torque * dt * 4.4, -24, 24);
    channels[angularId] = angular;
    if (angleId) channels[angleId] = wrapAngle(scalar(channels[angleId], 0) + angular * dt);
    if (torqueId) channels[torqueId] = torque;
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

  function wrapAngle(angle) {
    const wrapped = angle % TAU;
    return wrapped < 0 ? wrapped + TAU : wrapped;
  }
});
