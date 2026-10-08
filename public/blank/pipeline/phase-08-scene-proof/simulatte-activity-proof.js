(function registerActivityProof(root) {
  const registry = typeof module === 'object' && module.exports
    ? require('../../app/runtime/phase-module-registry.js') : root.SimulattePhaseModuleRegistry;
  const scope = registry.family('physicsModel');
  const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  function proveActivitySequence(program, activity) {
    if (!program) return null;
    scope.validateActivityProgram(program);
    const frames = activity?.history || [], violations = [];
    let contactError = 0, penetration = 0, footSlide = 0, previous = null;
    for (const frame of frames) {
      if (frame.programHash !== program.contentHash || !Number.isFinite(frame.time) || previous && frame.time <= previous.time) {
        violations.push('invalid frame identity/order'); continue;
      }
      for (const issue of frame.violations) violations.push(issue.reason);
      if (program.actors.some(actor => !frame.actors[actor.id]) ||
          program.objects.some(object => !frame.objects[object.id]) ||
          Object.keys(frame.actors).length !== program.actors.length || Object.keys(frame.objects).length !== program.objects.length) {
        violations.push('participant count/identity changed');
      }
      for (const action of program.actions) {
        const expected = frame.time < action.startSeconds ? 'pending' : frame.time >= action.endSeconds ? 'completed' : 'active';
        if (frame.actionStates[action.id] !== expected) violations.push('incorrect action timing/order');
        if (expected === 'active' && ['hold', 'drink'].includes(action.action)) {
          const owner = frame.objects[action.objectId]?.owner;
          if (!owner || owner.actorId !== action.actorId || owner.hand !== action.hand) violations.push('required attachment missing');
        }
      }
      for (const object of Object.values(frame.objects)) {
        if (!object.position.every(Number.isFinite)) { violations.push('nonfinite object state'); continue; }
        if (object.owner) {
          const actor = frame.actors[object.owner.actorId], hand = actor?.joints[`${object.owner.hand}-hand`];
          const action = program.actions.find(row => row.id === object.owner.actionId);
          if (!hand || !action || action.actorId !== object.owner.actorId || action.hand !== object.owner.hand || action.objectId !== object.id || frame.time < action.startSeconds) {
            violations.push('incorrect attachment participant/hand/order'); continue;
          }
          contactError = Math.max(contactError, distance(object.position, hand));
        }
        if (object.kind !== 'seat') penetration = Math.max(penetration, object.radius - object.position[1]);
      }
      const held = Object.values(frame.objects).filter(row => row.owner);
      for (let i = 0; i < held.length; i++) for (let j = i + 1; j < held.length; j++) {
        penetration = Math.max(penetration, held[i].radius + held[j].radius - distance(held[i].position, held[j].position));
      }
      for (const actor of Object.values(frame.actors)) {
        if (Object.values(actor.joints).some(point => !point.every(Number.isFinite))) violations.push('nonfinite joint state');
        if (actor.supportObjectId) {
          const seat = program.objects.find(row => row.id === actor.supportObjectId);
          contactError = Math.max(contactError, distance(actor.joints.pelvis, [seat.position[0], seat.seatHeight]));
        }
        const prior = previous?.actors[actor.id];
        const h = actor.height;
        for (const side of ['left', 'right']) {
          for (const [a, b, length] of [[`${side}-shoulder`, `${side}-elbow`, h * 0.21],
            [`${side}-elbow`, `${side}-hand`, h * 0.21], [`${side}-hip`, `${side}-knee`, h * 0.28],
            [`${side}-knee`, `${side}-foot`, h * 0.28]]) {
            if (!actor.joints[a] || !actor.joints[b] || Math.abs(distance(actor.joints[a], actor.joints[b]) - length) > 1e-5) violations.push('joint length/reach constraint failed');
          }
        }
        // Conservative torso rectangle; head/mouth contact remains outside this collision model.
        for (const object of Object.values(frame.objects).filter(row => row.owner)) {
          const left = actor.joints.pelvis[0] - h * 0.13, right = actor.joints.pelvis[0] + h * 0.13;
          const bottom = actor.joints.pelvis[1], top = actor.joints.neck[1];
          const closest = [Math.max(left, Math.min(right, object.position[0])), Math.max(bottom, Math.min(top, object.position[1]))];
          penetration = Math.max(penetration, object.radius - distance(object.position, closest));
        }
        for (const side of ['left', 'right']) if (actor.planted[side] && prior?.planted[side] && actor.gaitCycles[side] === prior.gaitCycles[side]) {
          footSlide = Math.max(footSlide, distance(actor.joints[`${side}-foot`], prior.joints[`${side}-foot`]));
        }
      }
      previous = frame;
    }
    const end = Math.max(0, ...program.actions.map(row => row.endSeconds));
    const dynamics = scope.proveActivityDynamics(program, frames);
    violations.push(...dynamics.violations);
    if (frames.length > 1) for (const action of program.actions) {
      const samples = frames.filter(frame => frame.time >= action.startSeconds && frame.time <= action.endSeconds);
      if (action.action === 'walk' && samples.length > 1 &&
          distance(samples[0].actors[action.actorId]?.joints.pelvis || [0, 0], samples.at(-1).actors[action.actorId]?.joints.pelvis || [0, 0]) < 0.01) {
        violations.push('requested locomotion did not execute');
      }
      if (action.action === 'drink' && samples.length > 1) {
        const heights = samples.map(frame => frame.objects[action.objectId]?.position[1] ?? -Infinity);
        const rotations = samples.map(frame => Math.abs(frame.objects[action.objectId]?.rotation || 0));
        if (Math.max(...heights) - heights[0] < 0.05 || Math.max(...rotations) < 0.2) violations.push('requested cup lift/tilt did not execute');
      }
    }
    const complete = frames.length >= 2 && frames[0].time === 0 && previous?.time >= end - 1e-8 && !activity.historyTruncated;
    const pass = complete && !program.unsupported.length && !violations.length &&
      contactError <= program.tolerances.contactMeters && penetration <= program.tolerances.penetrationMeters && footSlide <= program.tolerances.footSlideMeters;
    return { schema: 'simulatte.activitySequenceProof.v1', programHash: program.contentHash,
      status: pass ? 'passed' : complete ? 'failed' : 'not-proven', pass,
      coverage: { firstTime: frames[0]?.time ?? null, lastTime: previous?.time ?? null, sampleCount: frames.length,
        complete, dimensions: 2, contacts: program.dynamics ? 'holonomic-constraints' : 'kinematic',
        forcesValidated: complete && !activity.historyTruncated && dynamics.forcesValidated,
        liquidTransferValidated: complete && !activity.historyTruncated && dynamics.liquidTransferValidated,
        collisionScope: 'held-object circles, torso rectangles and ground; finger/head/seat mesh penetration is not validated' },
      metrics: { contactErrorMeters: contactError, penetrationMeters: Math.max(0, penetration), footSlideMeters: footSlide, ...dynamics.metrics },
      dynamicsModel: dynamics.model || null,
      violations: [...new Set(violations)], unsupported: program.unsupported, tolerances: program.tolerances };
  }
  registry.define('physicsModel', 'simulatte-activity-proof.js', { proveActivitySequence });
})(typeof globalThis !== 'undefined' ? globalThis : window);
