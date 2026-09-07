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
    operatorTypes: ['rigid_collision', 'free_fall', 'pendulum', 'directed_motion'],
    stateVariables: ['position', 'velocity', 'stress', 'damage'],
    supportedInteractions: ['collision', 'impulse', 'damage'],
    stableDt: 0.05,
    integrator: Object.freeze({ scheme: 'explicit_euler_v1', order: 1, symplectic: false, stableDt: 0.05, cfl: 0.9, stateContract: ['position', 'velocity', 'stress', 'damage'] }),
    integrators: Object.freeze({
      directed_motion: Object.freeze({ scheme: 'semi_implicit_euler_v1', stableDt: 0.01,
        stateContract: ['position', 'velocity'] }),
      free_fall: Object.freeze({ scheme: 'constant_acceleration_v1', stableDt: 0.01,
        stateContract: ['position', 'velocity', 'force'] }),
      pendulum: Object.freeze({ scheme: 'velocity_verlet_v1', stableDt: 0.01,
        stateContract: ['angle', 'angularVelocity', 'torque'] }),
    }),
    step,
  };

  function step({ channels = {}, step: row = {}, dt = 0.016 }) {
    if ((row.operatorType || row.type) === 'directed_motion') return stepDirectedMotion(channels, row, dt);
    if (['free_fall', 'pendulum'].includes(row.operatorType || row.type)) validateMechanics(row.params || {}, dt);
    if (row.operatorType === 'free_fall' || row.type === 'free_fall') return stepFreeFall(channels, row, dt);
    if (row.operatorType === 'pendulum' || row.type === 'pendulum') return stepPendulum(channels, row, dt);
    const stressId = firstOutput(row, 'stress');
    const damageId = firstOutput(row, 'damage');
    const impulse = finite(row.params && row.params.impulse, 0.5);
    if (stressId) channels[stressId] = clamp(scalar(channels[stressId], 0) + impulse * dt * 0.9, 0, 2);
    if (damageId) channels[damageId] = clamp(scalar(channels[damageId], 0) + impulse * dt * 0.22, 0, 1);
  }

  function stepDirectedMotion(channels, row, dt) {
    const { targetChannel, mode, maxSpeed, maxAcceleration, stoppingDistance } = row.params || {};
    if (!Number.isFinite(dt) || dt <= 0 || !['seek', 'flee'].includes(mode) ||
        ![maxSpeed, maxAcceleration, stoppingDistance].every((value) => Number.isFinite(value) && value > 0)) {
      throw new Error('Directed motion requires finite positive integration parameters and seek/flee mode');
    }
    const positionId = firstOutput(row, 'position');
    const velocityId = firstOutput(row, 'velocity');
    const position = channels[positionId], velocity = channels[velocityId], target = channels[targetChannel];
    if (![position, velocity, target].every((value) => value && Number.isFinite(value.x) && Number.isFinite(value.y))) {
      throw new Error('Directed motion requires source position, source velocity, and target position');
    }
    const dx = target.x - position.x, dy = target.y - position.y;
    const distance = Math.hypot(dx, dy);
    const direction = mode === 'seek' ? 1 : -1;
    const remaining = Math.max(0, distance - stoppingDistance);
    const speed = mode === 'seek' ? Math.min(maxSpeed, Math.sqrt(2 * maxAcceleration * remaining), remaining / dt) : maxSpeed;
    const desired = distance > 1e-9 ? { x: direction * dx / distance * speed, y: direction * dy / distance * speed } : { x: 0, y: 0 };
    const changeX = desired.x - velocity.x, changeY = desired.y - velocity.y;
    const factor = Math.min(1, maxAcceleration * dt / Math.max(1e-9, Math.hypot(changeX, changeY)));
    const next = { x: velocity.x + changeX * factor, y: velocity.y + changeY * factor };
    if (mode === 'seek' && remaining <= Math.hypot(next.x, next.y) * dt) {
      next.x = desired.x;
      next.y = desired.y;
    }
    channels[positionId] = { x: clamp(position.x + next.x * dt, 0.05, 0.95), y: clamp(position.y + next.y * dt, 0.05, 0.95) };
    channels[velocityId] = next;
  }

  function validateMechanics(params, dt) {
    if (!Number.isFinite(dt) || dt <= 0) throw new Error('Mechanics requires a positive finite dt');
    for (const name of ['worldSpanMeters', 'lengthMeters', 'massKg']) {
      if (params[name] != null && !(Number.isFinite(params[name]) && params[name] > 0)) {
        throw new Error(`Mechanics ${name} must be positive and finite`);
      }
    }
    for (const name of ['acceleration', 'initialAngle', 'floor', 'restitution']) {
      if (params[name] != null && !Number.isFinite(params[name])) throw new Error(`Non-finite mechanics ${name}`);
    }
    if (params.restitution != null && (params.restitution < 0 || params.restitution > 1)) {
      throw new Error('Mechanics restitution must be in [0, 1]');
    }
  }

  function stepFreeFall(channels, row, dt) {
    const positionId = firstOutput(row, 'position');
    const velocityId = firstOutput(row, 'velocity');
    const forceId = firstOutput(row, 'force');
    const p = { ...channels[positionId] }, v = { ...channels[velocityId] };
    const force = channels[forceId] || { x: 0, y: 0 };
    const params = row.params || {};
    const g = finite(params.acceleration, 9.81), span = finite(params.worldSpanMeters, 10);
    const mass = finite(params.massKg, 1);
    const ax = finite(force.x, 0) / mass, ay = g + finite(force.y, 0) / mass;
    p.x += (v.x * dt + ax * dt * dt / 2) / span;
    p.y += (v.y * dt + ay * dt * dt / 2) / span;
    v.x += ax * dt;
    v.y += ay * dt;
    const floor = finite(params.floor, 0.9);
    if (p.y >= floor) {
      p.y = floor;
      v.y = -Math.abs(v.y) * finite(params.restitution, 0.42);
      // Rebounds shorter than two substeps settle as resting contact.
      if (Math.abs(v.y) <= Math.abs(ay * dt)) v.y = 0;
    }
    channels[positionId] = p;
    channels[velocityId] = v;
    channels[forceId] = { x: 0, y: 0 };
  }

  function stepPendulum(channels, row, dt) {
    const angleId = firstOutput(row, 'angle');
    const velocityId = firstOutput(row, 'angularVelocity');
    const torqueId = firstOutput(row, 'torque');
    const params = row.params || {};
    const length = finite(params.lengthMeters, 1), mass = finite(params.massKg, 1);
    const g = finite(params.acceleration, 9.81);
    let angle = scalar(channels[angleId], params.initialAngle);
    let velocity = scalar(channels[velocityId], 0);
    const acceleration = (theta) => -g / length * Math.sin(theta) + scalar(channels[torqueId], 0) / (mass * length * length);
    velocity += acceleration(angle) * dt / 2;
    angle += velocity * dt;
    velocity += acceleration(angle) * dt / 2;
    channels[angleId] = angle;
    channels[velocityId] = velocity;
    channels[torqueId] = 0;
  }

});
