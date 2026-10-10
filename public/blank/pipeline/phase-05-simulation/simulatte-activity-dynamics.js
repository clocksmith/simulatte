(function registerActivityDynamics(root) {
  const registry = typeof module === 'object' && module.exports
    ? require('../../app/runtime/phase-module-registry.js') : root.SimulattePhaseModuleRegistry;
  const scope = registry.family('physicsModel');
  const add = (a, b) => a.map((v, i) => v + b[i]);
  const sub = (a, b) => a.map((v, i) => v - b[i]);
  const scale = (a, s) => a.map(v => v * s);
  const zero = () => [0, 0];
  const cross = (r, p) => r[0] * p[1] - r[1] * p[0];
  function activityObjectMassElements(object, definition, policy) {
    const result = [{ mass: definition.massKg, position: object.position, velocity: object.velocity,
      inertia: definition.massKg * definition.radius ** 2 / 2 }];
    const liquid = object.liquid;
    if (!liquid) return result;
    const container = definition.liquidContainer, dx = container.widthMeters / liquid.depthMeters.length;
    const c = Math.cos(object.rotation), s = Math.sin(object.rotation);
    for (let i = 0; i < liquid.depthMeters.length; i++) {
      const h = liquid.depthMeters[i], x = (i + 0.5) * dx - container.widthMeters / 2;
      if (policy.liquidSpatialOrder === 2 && h === 0) continue;
      const y = (h - container.heightMeters) / 2, mass = h * dx * container.depthMeters * policy.liquidDensityKgPerCubicMeter;
      const u = h > policy.dryDepthMeters ? liquid.dischargeSquareMetersPerSecond[i] / h : 0;
      const r = [c * x - s * y, s * x + c * y];
      result.push({ mass, position: add(object.position, r), inertia: mass * (dx * dx + h * h) / 12,
        velocity: [object.velocity[0] + c * u - object.angularVelocity * r[1],
          object.velocity[1] + s * u + object.angularVelocity * r[0]] });
    }
    return result;
  }
  function activityObjectAngularMomentum(object, definition, policy) {
    return activityObjectMassElements(object, definition, policy)
      .reduce((s, e) => s + cross(e.position, scale(e.velocity, e.mass)) + e.inertia * object.angularVelocity, 0);
  }
  function activityObjectGravityMoment(object, definition, policy) {
    return activityObjectMassElements(object, definition, policy).reduce((s, e) => s - e.position[0] * e.mass * policy.gravityMetersPerSecondSquared, 0);
  }
  function liquidMomentum(object, definition, policy) {
    const liquid = object.liquid;
    if (!liquid) return zero();
    const container = definition.liquidContainer, dx = container.widthMeters / liquid.depthMeters.length;
    const c = Math.cos(object.rotation), s = Math.sin(object.rotation), result = zero();
    for (let i = 0; i < liquid.depthMeters.length; i++) {
      const h = liquid.depthMeters[i], x = (i + 0.5) * dx - container.widthMeters / 2;
      if (policy.liquidSpatialOrder === 2 && h === 0) continue;
      const y = (h - container.heightMeters) / 2, mass = h * dx * container.depthMeters * policy.liquidDensityKgPerCubicMeter;
      const u = h > policy.dryDepthMeters ? liquid.dischargeSquareMetersPerSecond[i] / h : 0;
      result[0] += mass * (object.velocity[0] + c * u - object.angularVelocity * (s * x + c * y));
      result[1] += mass * (object.velocity[1] + s * u + object.angularVelocity * (c * x - s * y));
    }
    return result;
  }
  function initializeActivityDynamics(frame, program) {
    if (!program.dynamics) return frame;
    const p = program.dynamics;
    const sample = scope.evaluateActivityFrame(program, p.maxStepSeconds);
    for (const definition of program.objects) {
      const object = frame.objects[definition.id];
      object.velocity = scale(sub(sample.objects[definition.id].position, object.position), 1 / p.maxStepSeconds);
      object.angularVelocity = (sample.objects[definition.id].rotation - object.rotation) / p.maxStepSeconds;
      if (definition.liquidContainer) object.liquid = scope.createActivityLiquid(definition.liquidContainer, p.liquidCells);
      object.massKg = definition.massKg + (object.liquid?.remainingVolumeCubicMeters || 0) * p.liquidDensityKgPerCubicMeter;
      object.momentum = scale(object.velocity, object.massKg);
      object.angularMomentum = activityObjectAngularMomentum(object, definition, p);
    }
    for (const definition of program.actors) {
      const velocity = scale(sub(sample.actors[definition.id].joints.pelvis, frame.actors[definition.id].joints.pelvis), 1 / p.maxStepSeconds);
      Object.assign(frame.actors[definition.id], { velocity, massKg: definition.massKg,
        momentum: scale(velocity, definition.massKg), consumedMassKg: 0,
        angularMomentum: cross(frame.actors[definition.id].joints.pelvis, scale(velocity, definition.massKg)) });
    }
    frame.dynamics = { schema: 'simulatte.activityDynamicsFrame.v1', programHash: program.contentHash,
      startTime: 0, endTime: 0, gravityImpulse: zero(), outflowMomentum: zero(), supportImpulse: zero(),
      objectImpulses: {}, actorImpulses: {}, maxGripForceNewtons: 0, maxGripTorqueNewtonMeters: 0,
      maxSupportForceNewtons: 0, gravityAngularImpulse: 0, outflowAngularMomentum: 0, supportAngularImpulse: 0, liquidTransfers: [], stepCount: 0, violations: [] };
    return frame;
  }
  function advanceActivityDynamics(previous, program, endTime) {
    const p = program.dynamics, dtTotal = endTime - previous.time;
    const receipt = { schema: 'simulatte.activityDynamicsFrame.v1', programHash: program.contentHash,
      startTime: previous.time, endTime, gravityImpulse: zero(), outflowMomentum: zero(), supportImpulse: zero(),
      objectImpulses: Object.fromEntries(program.objects.map(o => [o.id, { constraint: zero(), gravity: zero(), outflow: zero(), angularConstraint: 0, angularGravity: 0, angularOutflow: 0 }])),
      actorImpulses: Object.fromEntries(program.actors.map(a => [a.id, { support: zero(), gravity: zero(), grip: zero(), inflow: zero(), angularSupport: 0, angularGravity: 0, angularGrip: 0, angularInflow: 0 }])),
      maxGripForceNewtons: 0, maxGripTorqueNewtonMeters: 0, maxSupportForceNewtons: 0,
      gravityAngularImpulse: 0, outflowAngularMomentum: 0, supportAngularImpulse: 0, liquidTransfers: [], stepCount: 0, violations: [] };
    let current = previous;
    const count = Math.max(1, Math.ceil(dtTotal / p.maxStepSeconds - 1e-10));
    if (count > p.maxPhysicsSubsteps) throw new Error('Activity physics integration bound exceeded');
    for (let tick = 1; tick <= count; tick++) {
      const time = tick === count ? endTime : previous.time + dtTotal * tick / count;
      const dt = time - current.time, frame = scope.evaluateActivityFrame(program, time);
      const grip = Object.fromEntries(program.actors.map(a => [a.id, zero()]));
      const gripAngular = Object.fromEntries(program.actors.map(a => [a.id, 0]));
      const incoming = Object.fromEntries(program.actors.map(a => [a.id, { momentum: zero(), mass: 0, angularMomentum: 0 }]));
      for (const definition of program.objects) {
        const object = frame.objects[definition.id], before = current.objects[definition.id];
        object.velocity = scale(sub(object.position, before.position), 1 / dt);
        object.angularVelocity = (object.rotation - before.rotation) / dt;
        const acceleration = scale(sub(object.velocity, before.velocity), 1 / dt);
        let outflow = zero(), angularOutflow = 0, consumed = 0;
        if (before.liquid) {
          const action = program.actions.find(a => a.action === 'drink' && a.objectId === object.id && time >= a.startSeconds && time <= a.endSeconds);
          const actor = action && frame.actors[action.actorId];
          const mouth = actor ? [actor.joints.head[0] + (action.hand === 'left' ? -1 : 1) * actor.height * p.mouthHorizontalHeightFraction,
            actor.joints.head[1] + actor.height * p.mouthVerticalHeightFraction] : null;
          object.liquid = scope.stepActivityLiquid(before.liquid, definition.liquidContainer,
            { angleRadians: (object.rotation + before.rotation) / 2, acceleration, position: object.position,
              velocity: object.velocity, angularVelocity: (object.angularVelocity + before.angularVelocity) / 2,
              angularAcceleration: (object.angularVelocity - before.angularVelocity) / dt, mouth }, dt, p);
          consumed = (object.liquid.consumedVolumeCubicMeters - before.liquid.consumedVolumeCubicMeters) * p.liquidDensityKgPerCubicMeter;
          outflow = object.liquid.outflowMomentumKgMetersPerSecond;
          angularOutflow = object.liquid.outflowAngularMomentumKgSquareMetersPerSecond;
          receipt.liquidTransfers.push(...object.liquid.transferEvents.map(event => ({ ...event, time, objectId: object.id,
            actorId: action?.actorId || null, actionId: action?.id || null, hand: action?.hand || null })));
          if (receipt.liquidTransfers.length > p.maxLiquidTransferEventsPerFrame) throw new Error('Liquid transfer evidence bound exceeded');
          if (action && consumed > 0) {
            incoming[action.actorId].mass += consumed;
            incoming[action.actorId].momentum = add(incoming[action.actorId].momentum, object.liquid.consumedMomentumKgMetersPerSecond);
            incoming[action.actorId].angularMomentum += object.liquid.consumedAngularMomentumKgSquareMetersPerSecond;
          }
        }
        object.massKg = definition.massKg + (object.liquid?.remainingVolumeCubicMeters || 0) * p.liquidDensityKgPerCubicMeter;
        object.momentum = add(scale(object.velocity, definition.massKg), liquidMomentum(object, definition, p));
        object.angularMomentum = activityObjectAngularMomentum(object, definition, p);
        const gravity = [0, -(object.massKg + before.massKg) / 2 * p.gravityMetersPerSecondSquared * dt];
        const constraint = add(sub(sub(object.momentum, before.momentum), gravity), outflow);
        const angularGravity = (activityObjectGravityMoment(object, definition, p) + activityObjectGravityMoment(before, definition, p)) / 2 * dt;
        const angularImpulse = object.angularMomentum - before.angularMomentum - angularGravity + angularOutflow;
        const row = receipt.objectImpulses[object.id];
        row.constraint = add(row.constraint, constraint); row.gravity = add(row.gravity, gravity); row.outflow = add(row.outflow, outflow);
        row.angularConstraint += angularImpulse; row.angularGravity += angularGravity; row.angularOutflow += angularOutflow;
        receipt.gravityImpulse = add(receipt.gravityImpulse, gravity);
        receipt.gravityAngularImpulse += angularGravity;
        // Unattached scene objects are fixed supports; their anchoring reactions belong to the environment.
        if (object.owner) { grip[object.owner.actorId] = sub(grip[object.owner.actorId], constraint); gripAngular[object.owner.actorId] -= angularImpulse; }
        else { receipt.supportImpulse = add(receipt.supportImpulse, constraint); receipt.supportAngularImpulse += angularImpulse; }
        receipt.outflowMomentum = add(receipt.outflowMomentum, outflow);
        receipt.outflowAngularMomentum += angularOutflow;
        const force = Math.hypot(...constraint) / dt;
        const torque = Math.abs(angularImpulse - cross(scale(add(object.position, before.position), 0.5), constraint)) / dt;
        if(object.supportObjectId){
          const support=program.objects.find(row=>row.id===object.supportObjectId);
          receipt.maxSupportForceNewtons=Math.max(receipt.maxSupportForceNewtons,force);
          if(!support||force>support.supportCapacityNewtons)receipt.violations.push('placement support load capacity exceeded');
        }
        if (object.owner) {
          receipt.maxGripForceNewtons = Math.max(receipt.maxGripForceNewtons, force);
          receipt.maxGripTorqueNewtonMeters = Math.max(receipt.maxGripTorqueNewtonMeters, torque);
          if (force > definition.gripForceLimitNewtons) receipt.violations.push('grip force capacity exceeded');
          if (torque > definition.gripTorqueLimitNewtonMeters) receipt.violations.push('grip torque capacity exceeded');
        }
      }
      for (const definition of program.actors) {
        const actor = frame.actors[definition.id], before = current.actors[definition.id], flow = incoming[definition.id];
        actor.velocity = scale(sub(actor.joints.pelvis, before.joints.pelvis), 1 / dt);
        actor.consumedMassKg = before.consumedMassKg + flow.mass; actor.massKg = definition.massKg + actor.consumedMassKg;
        actor.momentum = scale(actor.velocity, actor.massKg);
        actor.angularMomentum = cross(actor.joints.pelvis, actor.momentum);
        const gravity = [0, -(actor.massKg + before.massKg) / 2 * p.gravityMetersPerSecondSquared * dt];
        const support = sub(sub(sub(sub(actor.momentum, before.momentum), gravity), grip[actor.id]), flow.momentum);
        const angularGravity = -(actor.joints.pelvis[0] * actor.massKg + before.joints.pelvis[0] * before.massKg) / 2 * p.gravityMetersPerSecondSquared * dt;
        const angularSupport = actor.angularMomentum - before.angularMomentum - angularGravity - gripAngular[actor.id] - flow.angularMomentum;
        const supportTorque = angularSupport - cross(scale(add(actor.joints.pelvis, before.joints.pelvis), 0.5), support);
        const force = Math.hypot(...support) / dt, normal = support[1] / dt;
        const capacity = actor.supportObjectId ? program.objects.find(o => o.id === actor.supportObjectId).supportCapacityNewtons : p.groundCapacityNewtons;
        if (!actor.supportObjectId && !Object.values(actor.planted).some(Boolean)) receipt.violations.push('required support contact missing');
        if (normal < -1e-7 || force > capacity) receipt.violations.push('support load capacity exceeded');
        if (Math.abs(support[0]) > p.frictionCoefficient * Math.max(0, support[1]) + 1e-7) receipt.violations.push('support friction capacity exceeded');
        if (Math.abs(supportTorque) > p.supportMomentArmMeters * Math.max(0, support[1]) + 1e-7) receipt.violations.push('support moment capacity exceeded');
        const row = receipt.actorImpulses[actor.id];
        for (const [key, value] of Object.entries({ support, gravity, grip: grip[actor.id], inflow: flow.momentum })) row[key] = add(row[key], value);
        row.angularSupport += angularSupport; row.angularGravity += angularGravity; row.angularGrip += gripAngular[actor.id]; row.angularInflow += flow.angularMomentum;
        receipt.gravityImpulse = add(receipt.gravityImpulse, gravity);
        receipt.supportImpulse = add(receipt.supportImpulse, support);
        receipt.supportAngularImpulse += angularSupport; receipt.gravityAngularImpulse += angularGravity;
        receipt.maxSupportForceNewtons = Math.max(receipt.maxSupportForceNewtons, force);
      }
      receipt.stepCount++; current = frame;
    }
    // Delivered liquid is internal to the actor/object system, unlike spilled liquid.
    for (const row of Object.values(receipt.actorImpulses)) {
      receipt.outflowMomentum = sub(receipt.outflowMomentum, row.inflow); receipt.outflowAngularMomentum -= row.angularInflow;
    }
    receipt.violations = [...new Set(receipt.violations)]; current.dynamics = receipt;
    return current;
  }
  registry.define('physicsModel', 'simulatte-activity-dynamics.js', { liquidMomentum, activityObjectAngularMomentum,
    activityObjectMassElements, initializeActivityDynamics, advanceActivityDynamics });
})(typeof globalThis !== 'undefined' ? globalThis : window);
