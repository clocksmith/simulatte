(function attachSimulatteInteractionKinematicsSolver(root, factory) {
  const values = typeof module === 'object' && module.exports
    ? require('./simulatte-solver-values.js')
    : root.SimulatteSolverValues;
  const api = factory(values);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteInteractionKinematicsSolver = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createInteractionKinematicsSolver(values) {
  const { firstMatching, vector, scalar, clamp, wrapAngle } = values;
  return {
    id: 'interaction-kinematics',
    operatorTypes: ['interaction_kinematics'],
    stateVariables: ['position', 'velocity', 'force', 'angle', 'angularVelocity', 'torque'],
    supportedInteractions: ['drag', 'nudge', 'impulse', 'rotate'],
    stableDt: 0.05,
    integrator: Object.freeze({
      scheme: 'semi_implicit_euler_v1',
      order: 1,
      symplectic: true,
      stableDt: 0.05,
      cfl: 0.9,
      stateContract: ['position', 'velocity', 'force', 'angle', 'angularVelocity', 'torque'],
    }),
    step,
  };

  function step({ channels = {}, step: row = {}, dt = 0.016, events = [] }) {
    const all = [...(row.inputs || row.reads || []), ...(row.outputs || row.writes || [])];
    const positionId = firstMatching(all, 'position');
    const velocityId = firstMatching(all, 'velocity');
    const forceId = firstMatching(all, 'force');
    const angleId = firstMatching(all, 'angle');
    const angularVelocityId = firstMatching(all, 'angularVelocity');
    const torqueId = firstMatching(all, 'torque');
    const damping = clamp(Number(row.params && row.params.damping || 0.84), 0, 0.999);
    const translationScale = clamp(Number(row.params && row.params.translationScale || 0.18), 0.01, 1);
    let moved = false;

    if (positionId && velocityId) {
      const position = vector(channels[positionId], { x: 0.5, y: 0.5 });
      const velocity = vector(channels[velocityId], { x: 0, y: 0 });
      const force = forceId ? vector(channels[forceId], { x: 0, y: 0 }) : { x: 0, y: 0 };
      velocity.x = clamp(velocity.x + force.x * dt * 0.025, -8, 8);
      velocity.y = clamp(velocity.y + force.y * dt * 0.025, -8, 8);
      position.x += velocity.x * dt * translationScale;
      position.y += velocity.y * dt * translationScale;
      if (position.x < 0 || position.x > 1) {
        position.x = clamp(position.x, 0, 1);
        velocity.x *= -0.42;
      }
      if (position.y < 0 || position.y > 1) {
        position.y = clamp(position.y, 0, 1);
        velocity.y *= -0.42;
      }
      const decay = Math.pow(damping, dt * 60);
      velocity.x *= decay;
      velocity.y *= decay;
      channels[positionId] = position;
      channels[velocityId] = velocity;
      if (forceId) channels[forceId] = { x: force.x * decay * 0.72, y: force.y * decay * 0.72 };
      moved = Math.hypot(velocity.x, velocity.y) > 0.0001;
    }

    if (angleId && angularVelocityId) {
      let angularVelocity = scalar(channels[angularVelocityId], 0);
      const torque = torqueId ? scalar(channels[torqueId], 0) : 0;
      angularVelocity = clamp(angularVelocity + torque * dt * 0.05, -20, 20);
      channels[angleId] = wrapAngle(scalar(channels[angleId], 0) + angularVelocity * dt);
      channels[angularVelocityId] = angularVelocity * Math.pow(damping, dt * 60);
      if (torqueId) channels[torqueId] = torque * Math.pow(damping * 0.82, dt * 60);
      moved = moved || Math.abs(angularVelocity) > 0.0001;
    }

    if (moved && Array.isArray(events)) {
      events.push({
        type: 'interactionKinematics',
        operatorId: row.operatorId || '',
        entityId: row.params && row.params.entityId || '',
      });
    }
  }
});
