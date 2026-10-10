(function registerActivityDynamicsProof(root) {
  const registry = typeof module === 'object' && module.exports
    ? require('../../app/runtime/phase-module-registry.js') : root.SimulattePhaseModuleRegistry;
  const scope = registry.family('physicsModel');
  const finiteVector = v => Array.isArray(v) && v.length === 2 && v.every(Number.isFinite);
  const sum = vectors => vectors.reduce((a, b) => a.map((v, i) => v + b[i]), [0, 0]);
  const checkedPrefixes = new WeakMap();
  function proveActivityDynamics(program, frames) {
    if (!program.dynamics) return { forcesValidated: false, liquidTransferValidated: false, violations: [], metrics: {} };
    const p = program.dynamics, violations = [];
    let momentumError = 0, angularError = 0, massError = 0, maxCfl = 0, consumed = 0, spilled = 0, previous = null;
    let cacheable = scope.phaseContracts.isOwnedSnapshot(program) && frames.every(scope.phaseContracts.isOwnedSnapshot);
    let prefix = null;
    let cache = checkedPrefixes.get(program);
    if (cacheable && !cache) { cache = new WeakMap(); checkedPrefixes.set(program, cache); }
    for (const frame of frames) {
      const checked = cacheable && cache.get(frame);
      if (checked && checked.previous === previous && checked.prefix === prefix) {
        ({ momentumError, angularError, massError, maxCfl } = checked);
        violations.length = 0; violations.push(...checked.violations);
        previous = frame; prefix = checked; continue;
      }
      const receipt = frame.dynamics;
      if (!receipt || receipt.schema !== 'simulatte.activityDynamicsFrame.v1' || receipt.programHash !== program.contentHash ||
          receipt.endTime !== frame.time || previous && receipt.startTime !== previous.time ||
          !Number.isInteger(receipt.stepCount) || previous && receipt.stepCount < 1 ||
          !Array.isArray(receipt.violations) ||
          ![receipt.gravityImpulse, receipt.supportImpulse, receipt.outflowMomentum].every(finiteVector) ||
          !['maxGripForceNewtons', 'maxGripTorqueNewtonMeters', 'maxSupportForceNewtons'].every(k => Number.isFinite(receipt[k]) && receipt[k] >= 0) ||
          !['gravityAngularImpulse', 'supportAngularImpulse', 'outflowAngularMomentum'].every(k => Number.isFinite(receipt[k]))) {
        violations.push('missing or mismatched dynamics evidence'); previous = frame; cacheable = false; continue;
      }
      violations.push(...receipt.violations);
      const transfers = receipt.liquidTransfers, eventTotals = {};
      if (!Array.isArray(transfers) || transfers.length > p.maxLiquidTransferEventsPerFrame) violations.push('missing or unbounded liquid transfer evidence');
      const snapshots = new Map();
      for (const event of Array.isArray(transfers) ? transfers : []) {
        const definition = program.objects.find(o => o.id === event.objectId), container = definition?.liquidContainer;
        if (!container || !Number.isFinite(event.time) || event.time < receipt.startTime || event.time > receipt.endTime ||
            !Number.isFinite(event.volumeCubicMeters) || event.volumeCubicMeters <= 0 || !finiteVector(event.outlet) ||
            !Number.isInteger(event.cellIndex) || event.cellIndex < 0 || event.cellIndex >= p.liquidCells ||
            !Number.isFinite(event.containerAngleRadians) || !['consumed', 'spilled'].includes(event.disposition)) {
          violations.push('invalid liquid transfer event'); continue;
        }
        if (!snapshots.has(event.time)) snapshots.set(event.time, scope.evaluateActivityFrame(program, event.time));
        const snapshot = snapshots.get(event.time), object = snapshot.objects[event.objectId];
        const priorPose = scope.evaluateActivityFrame(program, Math.max(0, event.time - p.maxStepSeconds)).objects[event.objectId];
        if (event.containerAngleRadians < Math.min(object.rotation, priorPose.rotation) - 1e-8 ||
            event.containerAngleRadians > Math.max(object.rotation, priorPose.rotation) + 1e-8) violations.push('liquid outlet uses a foreign container pose');
        const angle = event.containerAngleRadians, dx = event.outlet[0] - object.position[0], dy = event.outlet[1] - object.position[1];
        const localX = Math.cos(angle) * dx + Math.sin(angle) * dy, localY = -Math.sin(angle) * dx + Math.cos(angle) * dy;
        const expectedX = (event.cellIndex + 0.5) * container.widthMeters / p.liquidCells - container.widthMeters / 2;
        if (Math.abs(localX - expectedX) > 1e-8 || Math.abs(localY - container.heightMeters / 2) > 1e-8) violations.push('liquid transfer did not exit the container opening');
        const action = program.actions.find(a => a.id === event.actionId && a.action === 'drink' && a.objectId === event.objectId &&
          a.actorId === event.actorId && a.hand === event.hand && event.time >= a.startSeconds && event.time <= a.endSeconds);
        const actor = action && snapshot.actors[action.actorId];
        const mouth = actor ? [actor.joints.head[0] + (action.hand === 'left' ? -1 : 1) * actor.height * p.mouthHorizontalHeightFraction,
          actor.joints.head[1] + actor.height * p.mouthVerticalHeightFraction] : null;
        const contact = mouth && Math.hypot(event.outlet[0] - mouth[0], event.outlet[1] - mouth[1]) <= p.mouthCaptureRadiusMeters;
        if (event.disposition === 'consumed' && !contact || event.disposition === 'spilled' && contact) violations.push('liquid transfer destination/contact mismatch');
        const total = eventTotals[event.objectId] ||= { consumed: 0, spilled: 0 };
        total[event.disposition] += event.volumeCubicMeters;
      }
      for (const definition of program.objects) {
        const object = frame.objects[definition.id], prior = previous?.objects[definition.id];
        if (!object || !finiteVector(object.velocity) || !finiteVector(object.momentum) ||
            !Number.isFinite(object.massKg) || !Number.isFinite(object.angularMomentum) || !Number.isFinite(object.angularVelocity)) {
          violations.push('invalid force body state'); continue;
        }
        const liquid = object.liquid, container = definition.liquidContainer;
        if (container) {
          if (!liquid || liquid.depthMeters.length !== p.liquidCells || liquid.dischargeSquareMetersPerSecond.length !== p.liquidCells ||
              liquid.depthMeters.some(h => !Number.isFinite(h) || h < 0 || h > container.heightMeters + 1e-12) ||
              !liquid.dischargeSquareMetersPerSecond.every(Number.isFinite) ||
              !['initialVolumeCubicMeters', 'remainingVolumeCubicMeters', 'consumedVolumeCubicMeters', 'spilledVolumeCubicMeters', 'maxCfl'].every(k => Number.isFinite(liquid[k]) && liquid[k] >= 0)) {
            violations.push('invalid liquid state'); continue;
          }
          const initial = container.widthMeters * container.depthMeters * container.heightMeters * container.fillFraction;
          const volume = liquid.depthMeters.reduce((a, b) => a + b, 0) * container.widthMeters / p.liquidCells * container.depthMeters;
          massError = Math.max(massError, Math.abs(initial - liquid.initialVolumeCubicMeters) * p.liquidDensityKgPerCubicMeter,
            Math.abs(volume - liquid.remainingVolumeCubicMeters) * p.liquidDensityKgPerCubicMeter,
            Math.abs(initial - volume - liquid.consumedVolumeCubicMeters - liquid.spilledVolumeCubicMeters) * p.liquidDensityKgPerCubicMeter,
            Math.abs(object.massKg - definition.massKg - volume * p.liquidDensityKgPerCubicMeter));
          maxCfl = Math.max(maxCfl, liquid.maxCfl);
          if (liquid.maxCfl > p.cfl + 1e-9 || prior?.liquid &&
              (liquid.consumedVolumeCubicMeters < prior.liquid.consumedVolumeCubicMeters || liquid.spilledVolumeCubicMeters < prior.liquid.spilledVolumeCubicMeters)) violations.push('invalid liquid stability/transfer');
          if (prior?.liquid) {
            const totals = eventTotals[object.id] || { consumed: 0, spilled: 0 };
            massError = Math.max(massError, Math.abs(liquid.consumedVolumeCubicMeters - prior.liquid.consumedVolumeCubicMeters - totals.consumed) * p.liquidDensityKgPerCubicMeter,
              Math.abs(liquid.spilledVolumeCubicMeters - prior.liquid.spilledVolumeCubicMeters - totals.spilled) * p.liquidDensityKgPerCubicMeter);
          }
        } else massError = Math.max(massError, Math.abs(object.massKg - definition.massKg));
        const predicted = scope.liquidMomentum(object, definition, p).map((v, i) => v + definition.massKg * object.velocity[i]);
        momentumError = Math.max(momentumError, Math.hypot(...predicted.map((v, i) => v - object.momentum[i])));
        angularError = Math.max(angularError, Math.abs(object.angularMomentum - scope.activityObjectAngularMomentum(object, definition, p)));
        if (prior) {
          const row = receipt.objectImpulses[definition.id];
          if (!row || ![row.constraint, row.gravity, row.outflow].every(finiteVector) ||
              !['angularConstraint', 'angularGravity', 'angularOutflow'].every(k => Number.isFinite(row[k]))) {
            violations.push('missing object impulses'); continue;
          }
          momentumError = Math.max(momentumError, Math.hypot(...object.momentum.map((v, i) =>
            v - prior.momentum[i] - row.gravity[i] - row.constraint[i] + row.outflow[i])));
          angularError = Math.max(angularError, Math.abs(object.angularMomentum - prior.angularMomentum - row.angularConstraint - row.angularGravity + row.angularOutflow));
          if(object.supportObjectId){
            const support=program.objects.find(o=>o.id===object.supportObjectId);
            if(!support||Math.hypot(...row.constraint)>support.supportCapacityNewtons*(frame.time-previous.time)+1e-7)violations.push('placement support impulse outside declared capacity');
          }
          if (object.owner && Math.hypot(...row.constraint) > definition.gripForceLimitNewtons * (frame.time - previous.time) + 1e-7) violations.push('grip impulse outside declared capacity');
          if (Math.abs(row.gravity[0]) > 1e-12 || row.gravity[1] > 0 ||
              Math.abs(row.gravity[1]) < Math.min(object.massKg, prior.massKg) * p.gravityMetersPerSecondSquared * (frame.time - previous.time) - 1e-9 ||
              Math.abs(row.gravity[1]) > Math.max(object.massKg, prior.massKg) * p.gravityMetersPerSecondSquared * (frame.time - previous.time) + 1e-9) violations.push('invalid gravitational impulse');
        }
      }
      for (const definition of program.actors) {
        const actor = frame.actors[definition.id], prior = previous?.actors[definition.id];
        if (!actor || !finiteVector(actor.velocity) || !finiteVector(actor.momentum) || !Number.isFinite(actor.massKg) ||
            !Number.isFinite(actor.angularMomentum) || !Number.isFinite(actor.consumedMassKg) || actor.consumedMassKg < 0) { violations.push('invalid actor load state'); continue; }
        const actorConsumed = program.objects.reduce((s, o) => {
          const drink = program.actions.some(a => a.action === 'drink' && a.actorId === actor.id && a.objectId === o.id);
          return s + (drink ? (frame.objects[o.id]?.liquid?.consumedVolumeCubicMeters || 0) * p.liquidDensityKgPerCubicMeter : 0);
        }, 0);
        massError = Math.max(massError, Math.abs(actorConsumed - actor.consumedMassKg), Math.abs(actor.massKg - definition.massKg - actorConsumed));
        momentumError = Math.max(momentumError, Math.hypot(...actor.momentum.map((v, i) => v - actor.massKg * actor.velocity[i])));
        if (prior) {
          const row = receipt.actorImpulses[definition.id];
          if (!row || ![row.support, row.gravity, row.grip, row.inflow].every(finiteVector) ||
              !['angularSupport', 'angularGravity', 'angularGrip', 'angularInflow'].every(k => Number.isFinite(row[k]))) { violations.push('missing actor impulses'); continue; }
          momentumError = Math.max(momentumError, Math.hypot(...actor.momentum.map((v, i) => v - prior.momentum[i] - row.support[i] - row.gravity[i] - row.grip[i] - row.inflow[i])));
          angularError = Math.max(angularError, Math.abs(actor.angularMomentum - prior.angularMomentum - row.angularSupport - row.angularGravity - row.angularGrip - row.angularInflow));
          const capacity = actor.supportObjectId ? program.objects.find(o => o.id === actor.supportObjectId).supportCapacityNewtons : p.groundCapacityNewtons;
          if (row.support[1] < -1e-7 || Math.abs(row.support[0]) > p.frictionCoefficient * Math.max(0, row.support[1]) + 1e-7 ||
              Math.hypot(...row.support) > capacity * (frame.time - previous.time) + 1e-7) violations.push('support load/friction outside declared limits');
        }
      }
      if (previous) {
        const delta = sum([...Object.values(frame.objects), ...Object.values(frame.actors)].map(o => o.momentum));
        const initial = sum([...Object.values(previous.objects), ...Object.values(previous.actors)].map(o => o.momentum));
        momentumError = Math.max(momentumError, Math.hypot(...delta.map((v, i) => v - initial[i] - receipt.gravityImpulse[i] - receipt.supportImpulse[i] + receipt.outflowMomentum[i])));
        const angular = [...Object.values(frame.objects), ...Object.values(frame.actors)].reduce((s, o) => s + o.angularMomentum, 0);
        const priorAngular = [...Object.values(previous.objects), ...Object.values(previous.actors)].reduce((s, o) => s + o.angularMomentum, 0);
        angularError = Math.max(angularError, Math.abs(angular - priorAngular - receipt.gravityAngularImpulse - receipt.supportAngularImpulse + receipt.outflowAngularMomentum));
      }
      if (cacheable) {
        const checked = { previous, prefix, momentumError, angularError, massError, maxCfl, violations: violations.slice() };
        cache.set(frame, checked); prefix = checked;
      }
      previous = frame;
    }
    if (!Number.isFinite(momentumError) || momentumError > p.momentumToleranceKgMetersPerSecond) violations.push('momentum balance failed');
    if (!Number.isFinite(angularError) || angularError > p.angularMomentumToleranceKgSquareMetersPerSecond) violations.push('angular momentum balance failed');
    if (!Number.isFinite(massError) || massError > p.massToleranceKg) violations.push('liquid/body mass conservation failed');
    const end = frames.at(-1);
    if (end) for (const object of Object.values(end.objects)) {
      consumed += (object.liquid?.consumedVolumeCubicMeters || 0) * p.liquidDensityKgPerCubicMeter;
      spilled += (object.liquid?.spilledVolumeCubicMeters || 0) * p.liquidDensityKgPerCubicMeter;
    }
    for (const action of program.actions.filter(a => a.action === 'drink')) {
      if (end?.time >= action.endSeconds && !(end.objects[action.objectId]?.liquid?.consumedVolumeCubicMeters > 0)) violations.push('requested drinking transferred no liquid to mouth');
    }
    const complete = frames.length >= 2 && frames[0].time === 0 && end?.time >= Math.max(0, ...program.actions.map(a => a.endSeconds)) - 1e-8;
    const pass = complete && !violations.length;
    return { forcesValidated: pass, liquidTransferValidated: pass && program.actions.some(a => a.action === 'drink'),
      model: { forces: 'driven lumped actor and constrained rigid objects; no articulated muscle/segment dynamics',
        liquid: '1D depth-averaged rectangular container; no 3D viscosity, wetting or swallowing physiology' },
      violations: [...new Set(violations)], metrics: { momentumErrorKgMetersPerSecond: momentumError,
        angularMomentumErrorKgSquareMetersPerSecond: angularError,
        massErrorKg: massError, consumedMassKg: consumed, spilledMassKg: spilled, maxLiquidCfl: maxCfl } };
  }
  registry.define('physicsModel', 'simulatte-activity-dynamics-proof.js', { proveActivityDynamics });
})(typeof globalThis !== 'undefined' ? globalThis : window);
