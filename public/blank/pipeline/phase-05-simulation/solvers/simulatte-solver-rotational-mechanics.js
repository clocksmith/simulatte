(function attachSimulatteRotationalMechanicsSolver(root, factory) {
  const values = typeof module === 'object' && module.exports
    ? require('./simulatte-solver-values.js')
    : root.SimulatteSolverValues;
  const api = factory(values);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteRotationalMechanicsSolver = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createRotationalMechanicsSolverApi(values) {
  const { firstInput, firstOutput, vector, scalar, finite, clamp, wrapAngle } = values;
  return {
    id: 'rotational-mechanics',
    operatorTypes: ['rotational_torque'],
    stateVariables: ['angularVelocity', 'angle', 'angularMomentum', 'torque'],
    supportedInteractions: ['fluidForce', 'torqueTransfer', 'trajectoryCurvature'],
    stableDt: 0.05,
    integrator: Object.freeze({ scheme: 'semi_implicit_euler_v1', order: 1, symplectic: true, stableDt: 0.05, cfl: 0.9, stateContract: ['angularVelocity', 'angle'] }),
    step,
  };

  function step({ channels = {}, step: row = {}, dt = 0.016 }) {
    const flowId = firstInput(row, 'flowVelocity');
    const angularId = firstOutput(row, 'angularVelocity');
    const angleId = firstOutput(row, 'angle');
    const torqueId = firstOutput(row, 'torque');
    if (!angularId) return;
    if (!flowId) {
      stepRigidRotation(channels, row, dt, angularId, angleId);
      return;
    }
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

  function stepRigidRotation(channels, row, dt, angularId, angleId) {
    const velocityId = firstInput(row, 'velocity');
    const frictionId = firstInput(row, 'friction');
    const momentumId = firstOutput(row, 'angularMomentum');
    const velocity = vector(channels[velocityId], { x: 0, y: 0 });
    const speed = Math.hypot(velocity.x, velocity.y);
    const friction = clamp(scalar(channels[frictionId], 0.16), 0, 1);
    const coupling = finite(row.params && row.params.coupling, 0.72);
    const drive = finite(row.params && row.params.drive, 0.58);
    const inertia = Math.max(0.05, finite(row.params && row.params.inertia, 0.62));
    const previous = scalar(channels[angularId], 0);
    const target = (speed + drive) * coupling;
    const torque = target - previous * (0.18 + friction * 0.82);
    const angular = clamp(previous + torque * dt * 4.4, -24, 24);
    channels[angularId] = angular;
    if (angleId) channels[angleId] = wrapAngle(scalar(channels[angleId], 0) + angular * dt);
    if (momentumId) channels[momentumId] = angular * inertia;
  }

});
