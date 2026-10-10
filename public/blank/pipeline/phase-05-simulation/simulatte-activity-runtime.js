(function registerActivityRuntime(root) {
  const registry = typeof module === 'object' && module.exports
    ? require('../../app/runtime/phase-module-registry.js') : root.SimulattePhaseModuleRegistry;
  const scope = registry.family('physicsModel');
  const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const mix = (a, b, t) => a.map((value, i) => value + (b[i] - value) * t);
  const smooth = t => t * t * (3 - 2 * t);
  const smoothTrajectory = t => t * t * t * (t * (t * 6 - 15) + 10);
  function solveActivityTwoBone(start, target, first, second, bend = 1) {
    const d = distance(start, target);
    if (!Number.isFinite(d) || d > first + second + 1e-8 || d < Math.abs(first - second) - 1e-8) {
      return { supported: false, reason: 'unreachable joint target', distance: d };
    }
    const angle = Math.atan2(target[1] - start[1], target[0] - start[0]);
    const cosine = Math.max(-1, Math.min(1, (first * first + d * d - second * second) / (2 * first * Math.max(d, 1e-12))));
    const theta = angle + bend * Math.acos(cosine);
    return { supported: true, joint: [start[0] + first * Math.cos(theta), start[1] + first * Math.sin(theta)], end: target.slice() };
  }
  function evaluateActivityFrame(program, time) {
    scope.validateActivityProgram(program);
    if(program.version<3)return evaluateLegacyActivityFrame(program,time);
    if (!Number.isFinite(time) || time < 0 || time > program.limits.maxDurationSeconds) throw new Error('Activity time exceeds execution bounds');
    const actors = {}, objects = Object.fromEntries(program.objects.map(row => [row.id, {
      id: row.id, position: row.position.slice(), rotation: 0, radius: row.radius, kind: row.kind, owner: null,
    }]));
    const violations = [], actionStates = {};
    for (const actor of program.actors) {
      const h = actor.height, active = program.actions.filter(row => row.actorId === actor.id && time >= row.startSeconds);
      const rootActions=active.filter(row=>['walk','sit','stand'].includes(row.action));
      const rootPoseCache=new Map();
      function rootPose(at,limit=rootActions.length){
        const key=`${at}:${limit}`;if(rootPoseCache.has(key))return rootPoseCache.get(key);
        let pose=[actor.origin[0],h*0.5],seat=null,feet={left:[actor.origin[0]-h*0.075,0],right:[actor.origin[0]+h*0.075,0]},planted={left:true,right:true},cycles={left:0,right:0};
        for(let i=0;i<limit;i++){
          const action=rootActions[i];if(at<action.startSeconds)break;
          const progress=Math.max(0,Math.min(1,(at-action.startSeconds)/action.durationSeconds));
          const from=rootPose(action.startSeconds,i);
          if(action.action==='walk'){
            feet={left:from.feet.left.slice(),right:from.feet.right.slice()};planted={left:true,right:true};cycles={left:0,right:0};
            const elapsed=program.dynamics?action.durationSeconds*smoothTrajectory(progress):Math.min(at,action.endSeconds)-action.startSeconds;
            const distance=h*0.2*elapsed;pose=[from.pelvis[0]+distance,h*0.5];seat=null;
            for(const [side,offset]of [['left',0],['right',0.5]]){
              const cycleTime=elapsed/0.8+offset,cycle=Math.floor(cycleTime),phase=cycleTime-cycle;
              const swing=phase>=0.5&&progress<1;
              feet[side]=[from.feet[side][0]+h*0.2*0.8*(cycle+(swing?smooth((phase-0.5)*2):0)),swing?Math.sin((phase-0.5)*2*Math.PI)*h*0.07:0];
              planted[side]=!swing;cycles[side]=i*1000+cycle;
            }
          }else if(action.action==='sit'){
            const target=program.objects.find(row=>row.id===action.objectId);
            pose=action.startSeconds===0?[target.position[0],target.seatHeight]:mix(from.pelvis,[target.position[0],target.seatHeight],smoothTrajectory(progress));
            feet=action.startSeconds===0?{left:[pose[0]+h*0.16,0],right:[pose[0]+h*0.24,0]}:from.feet;
            planted={left:true,right:true};cycles=from.cycles;seat=action.startSeconds===0||progress===1?target:null;
          }else{
            const target=[(from.feet.left[0]+from.feet.right[0])/2,h*0.5];
            pose=mix(from.pelvis,target,smoothTrajectory(progress));feet=from.feet;planted={left:true,right:true};cycles=from.cycles;seat=progress===0?from.seat:null;
          }
        }
        const result={pelvis:pose,seat,feet,planted,cycles};rootPoseCache.set(key,result);return result;
      }
      const rootState=rootPose(time),pelvis=rootState.pelvis,seat=rootState.seat;
      if(seat&&(seat.seatHeight<0.15||seat.seatHeight>h*0.6))violations.push({actorId:actor.id,reason:'unsupported seat height'});
      const joints = { pelvis, neck: [pelvis[0], pelvis[1] + h * 0.32], head: [pelvis[0], pelvis[1] + h * 0.42] };
      const planted = {}, gaitCycles = {};
      for (const [side, sign] of [['left', -1], ['right', 1]]) {
        const foot=rootState.feet[side],swing=!rootState.planted[side],cycle=rootState.cycles[side];
        joints[`${side}-hip`] = [pelvis[0] + sign * h * 0.05, pelvis[1]];
        const leg = solveActivityTwoBone(joints[`${side}-hip`], foot, h * 0.28, h * 0.28, sign);
        if (!leg.supported) violations.push({ actorId: actor.id, reason: leg.reason, joint: `${side}-foot` });
        joints[`${side}-knee`] = leg.joint || foot.slice(); joints[`${side}-foot`] = foot;
        planted[side] = !swing; gaitCycles[side] = cycle;
        const shoulder = [pelvis[0] + sign * h * 0.11, pelvis[1] + h * 0.28];
        joints[`${side}-shoulder`] = shoulder;
        let target = [pelvis[0] + sign * h * 0.29, pelvis[1] + h * 0.05];
        const handActions = active.filter(row => row.hand === side);
        const controlling = handActions.find(row => row.action === 'drink' && time < row.endSeconds) || handActions.at(-1);
        if (controlling) {
          const progress = Math.max(0, Math.min(1, (time - controlling.startSeconds) / controlling.durationSeconds));
          const lift = program.dynamics
            ? progress < 0.2 ? smooth(progress / 0.2) : progress > 0.8 ? smooth((1 - progress) / 0.2) : 1
            : Math.sin(progress * Math.PI);
          if (controlling.action === 'drink') {
            // Lift outside the torso before moving inward to the mouth.
            const inward = program.dynamics ? progress < 0.4 ? smooth(Math.max(0, (progress - 0.2) / 0.2))
              : progress > 0.6 ? smooth(Math.max(0, (0.8 - progress) / 0.2)) : 1 : Math.max(0, (lift - 0.8) / 0.2);
            target = [pelvis[0] + sign * h * (0.29 - 0.215 * inward), pelvis[1] + h * (0.05 + 0.39 * lift)];
          } else if (controlling.action === 'place') {
            const support=program.objects.find(row=>row.id===controlling.supportObjectId),definition=program.objects.find(row=>row.id===controlling.objectId);
            const startFrame=controlling.startSeconds>0?evaluateActivityFrame(program,Math.max(0,controlling.startSeconds-1e-9)):null;
            const halfHeight=definition.liquidContainer?.heightMeters/2 || definition.radius;
            const placed=[support.position[0],support.supportHeight+halfHeight];
            target = mix(startFrame?.objects[controlling.objectId]?.position || target,placed,smoothTrajectory(Math.min(1,progress/0.8)));
          }
          if (controlling.action !== 'place' || time < controlling.releaseSeconds) {
            const object = objects[controlling.objectId];
            object.position = target.slice(); object.owner = { actorId: actor.id, hand: side, actionId: controlling.id };
            object.rotation = controlling.action !== 'drink' ? 0 : !program.dynamics ? sign * Math.sin(progress * Math.PI) * 0.7
              : progress >= 0.4 && progress <= 0.6 ? sign * Math.sin(smooth((progress - 0.4) / 0.2) * Math.PI) * 1.1 : 0;
          } else {
            objects[controlling.objectId].position = target.slice();
            objects[controlling.objectId].owner = null;
            objects[controlling.objectId].supportObjectId=controlling.supportObjectId;
            const idle=[pelvis[0]+sign*h*0.29,pelvis[1]+h*0.05];
            target=mix(target,idle,smoothTrajectory(Math.max(0,(progress-0.8)/0.2)));
          }
        }
        const arm = solveActivityTwoBone(shoulder, target, h * 0.21, h * 0.21, -sign);
        if (!arm.supported) violations.push({ actorId: actor.id, reason: arm.reason, joint: `${side}-hand` });
        joints[`${side}-elbow`] = arm.joint || target.slice(); joints[`${side}-hand`] = target;
      }
      actors[actor.id] = { id: actor.id, height: h, joints, planted, gaitCycles, supportObjectId: seat?.id || null };
    }
    for (const action of program.actions) actionStates[action.id] = time < action.startSeconds ? 'pending' :
      time >= action.endSeconds ? 'completed' : 'active';
    return { schema: 'simulatte.activityFrame.v1', programHash: program.contentHash, time, actors, objects, actionStates, violations };
  }
  function evaluateLegacyActivityFrame(program, time) {
    scope.validateActivityProgram(program);
    if (!Number.isFinite(time) || time < 0 || time > program.limits.maxDurationSeconds) throw new Error('Activity time exceeds execution bounds');
    const actors = {}, objects = Object.fromEntries(program.objects.map(row => [row.id, {
      id: row.id, position: row.position.slice(), rotation: 0, radius: row.radius, kind: row.kind, owner: null,
    }]));
    const violations = [], actionStates = {};
    for (const actor of program.actors) {
      const h = actor.height, active = program.actions.filter(row => row.actorId === actor.id && time >= row.startSeconds);
      const walks = active.filter(row => row.action === 'walk');
      const walk = walks.at(-1), sit = active.find(row => row.action === 'sit');
      const walkTime = walks.reduce((sum, row) => sum + (program.dynamics
        ? row.durationSeconds * smoothTrajectory(Math.min(1, (time - row.startSeconds) / row.durationSeconds))
        : Math.min(time, row.endSeconds) - row.startSeconds), 0);
      const speed = h * 0.2, x = actor.origin[0] + speed * walkTime;
      let pelvis = [x, h * 0.5], seat = null;
      if (sit) {
        seat = program.objects.find(row => row.id === sit.objectId);
        pelvis = [seat.position[0], seat.seatHeight];
        if (seat.seatHeight < 0.15 || seat.seatHeight > h * 0.6) violations.push({ actionId: sit.id, reason: 'unsupported seat height' });
      }
      const joints = { pelvis, neck: [pelvis[0], pelvis[1] + h * 0.32], head: [pelvis[0], pelvis[1] + h * 0.42] };
      const planted = {}, gaitCycles = {};
      for (const [side, sign] of [['left', -1], ['right', 1]]) {
        const offset = side === 'right' ? 0.5 : 0, cycleTime = walkTime / 0.8 + offset;
        const cycle = Math.floor(cycleTime), phase = cycleTime - cycle;
        const swing = phase >= 0.5 && Boolean(walk) && time < walk.endSeconds;
        const foot = sit ? [pelvis[0] + h * 0.20 + sign * h * 0.04, 0] :
          [actor.origin[0] + sign * h * 0.075 + speed * 0.8 * (cycle - offset + (swing ? smooth((phase - 0.5) * 2) : 0)),
            swing ? Math.sin((phase - 0.5) * 2 * Math.PI) * h * 0.07 : 0];
        if (!walk && !sit) foot[0] = pelvis[0] + sign * h * 0.075;
        joints[`${side}-hip`] = [pelvis[0] + sign * h * 0.05, pelvis[1]];
        const leg = solveActivityTwoBone(joints[`${side}-hip`], foot, h * 0.28, h * 0.28, sign);
        if (!leg.supported) violations.push({ actorId: actor.id, reason: leg.reason, joint: `${side}-foot` });
        joints[`${side}-knee`] = leg.joint || foot.slice(); joints[`${side}-foot`] = foot;
        planted[side] = !swing; gaitCycles[side] = cycle;
        const shoulder = [pelvis[0] + sign * h * 0.11, pelvis[1] + h * 0.28];
        joints[`${side}-shoulder`] = shoulder;
        let target = [pelvis[0] + sign * h * 0.29, pelvis[1] + h * 0.05];
        const handActions = active.filter(row => row.hand === side);
        const controlling = handActions.find(row => row.action === 'drink' && time < row.endSeconds) || handActions.at(-1);
        if (controlling) {
          const progress = Math.max(0, Math.min(1, (time - controlling.startSeconds) / controlling.durationSeconds));
          const lift = program.dynamics
            ? progress < 0.2 ? smooth(progress / 0.2) : progress > 0.8 ? smooth((1 - progress) / 0.2) : 1
            : Math.sin(progress * Math.PI);
          if (controlling.action === 'drink') {
            // Lift outside the torso before moving inward to the mouth.
            const inward = program.dynamics ? progress < 0.4 ? smooth(Math.max(0, (progress - 0.2) / 0.2))
              : progress > 0.6 ? smooth(Math.max(0, (0.8 - progress) / 0.2)) : 1 : Math.max(0, (lift - 0.8) / 0.2);
            target = [pelvis[0] + sign * h * (0.29 - 0.215 * inward), pelvis[1] + h * (0.05 + 0.39 * lift)];
          } else if (controlling.action === 'place') {
            target = mix(target, [pelvis[0] + sign * h * 0.3, h * 0.4], smooth(progress));
          }
          if (controlling.action !== 'place' || time < controlling.endSeconds) {
            const object = objects[controlling.objectId];
            object.position = target.slice(); object.owner = { actorId: actor.id, hand: side, actionId: controlling.id };
            object.rotation = controlling.action !== 'drink' ? 0 : !program.dynamics ? sign * Math.sin(progress * Math.PI) * 0.7
              : progress >= 0.4 && progress <= 0.6 ? sign * Math.sin(smooth((progress - 0.4) / 0.2) * Math.PI) * 1.1 : 0;
          } else {
            objects[controlling.objectId].position = target.slice();
            objects[controlling.objectId].owner = null;
          }
        }
        const arm = solveActivityTwoBone(shoulder, target, h * 0.21, h * 0.21, -sign);
        if (!arm.supported) violations.push({ actorId: actor.id, reason: arm.reason, joint: `${side}-hand` });
        joints[`${side}-elbow`] = arm.joint || target.slice(); joints[`${side}-hand`] = target;
      }
      actors[actor.id] = { id: actor.id, height: h, joints, planted, gaitCycles, supportObjectId: seat?.id || null };
    }
    for (const action of program.actions) actionStates[action.id] = time < action.startSeconds ? 'pending' :
      time >= action.endSeconds ? 'completed' : 'active';
    return { schema: 'simulatte.activityFrame.v1', programHash: program.contentHash, time, actors, objects, actionStates, violations };
  }
  function withActivityState(state, program) {
    if (!program) return state;
    const initial = scope.initializeActivityDynamics(evaluateActivityFrame(program, 0), program);
    const frame = program.version>=3 ? scope.phaseContracts.immutableArtifact(initial) : initial;
    return publishActivityState(state, program, { ...frame, history: [frame], frameCount: 1, historyTruncated: false });
  }
  function publishActivityState(state, program, activity) {
    const channels = { ...(state.solverState?.channels || {}) };
    for (const [id, actor] of Object.entries(activity.actors)) {
      for (const [joint, position] of Object.entries(actor.joints)) channels[`activity:${id}:${joint}`] = position.slice();
    }
    for (const [id, object] of Object.entries(activity.objects)) channels[`activity:${id}:position`] = object.position.slice();
    return { ...state, activity, solverState: { ...(state.solverState || {}), channels } };
  }
  function stepActivityState(state, program, dt) {
    if (!program) return state;
    if (!Number.isFinite(dt) || dt < 0 || dt > 0.25) throw new Error('Activity requires bounded finite step');
    const previous = state.activity;
    if (!previous || previous.programHash !== program.contentHash) throw new Error('Activity state/program mismatch');
    const end = Math.max(0, ...program.actions.map(row => row.endSeconds));
    const proposed = previous.time + dt;
    const time = proposed >= end - 1e-9 ? end : proposed;
    if (time === previous.time) return publishActivityState(state, program, previous);
    const next = program.dynamics ? scope.advanceActivityDynamics(previous, program, time) : evaluateActivityFrame(program, time);
    const frame = program.version>=3 ? scope.phaseContracts.immutableArtifact(next) : next;
    // Restored execution state can contain mutable JSON-decoded frames. Take
    // owned snapshots before retaining that prefix; caller freezing alone must
    // never authorize proof-cache reuse. Already owned frames retain identity.
    const priorHistory = program.version>=3
      ? previous.history.map(row => scope.phaseContracts.immutableArtifact(row)) : previous.history;
    const history = [...priorHistory, frame];
    const truncated = history.length > (program.limits.maxHistoryFrames || 1024);
    return publishActivityState(state, program, { ...frame, history: history.slice(-(program.limits.maxHistoryFrames || 1024)),
      frameCount: previous.frameCount + 1, historyTruncated: previous.historyTruncated || truncated });
  }
  function activityMutationConflict(state, targetId, actionId) {
    if (!state.activity || !['grab', 'drag', 'impulse', 'adjust', 'nudge', 'activate'].includes(actionId)) return false;
    const id = String(targetId || '').replace(/^target:/, '');
    return Boolean(state.activity.actors[id]) || Boolean(state.activity.objects[id]?.owner);
  }
  function activitySimulationSettled(state, spec, dt) {
    const program = spec.activityProgram, activity = state.activity;
    if (!program?.dynamics || !activity || !Number.isFinite(dt) || dt < 0 || dt > 0.25 ||
        spec.templateId !== 'custom-world' || activity.programHash !== program.contentHash ||
        !program.actions.length || program.unsupported.length ||
        activity.time < Math.max(...program.actions.map(row => row.endSeconds))) return false;
    const steps = spec.solverGraph?.steps;
    if (!Array.isArray(steps) || steps.some(row => row.operatorType !== 'interaction_kinematics')) return false;
    // Only idle manipulation operators can settle with a bounded activity.
    // A new impulse, force, or independent solver keeps the world advancing.
    const zero = value => value === undefined || (typeof value === 'number' && value === 0) ||
      (value && typeof value === 'object' && Object.values(value).every(zero));
    return steps.every(row => (row.inputs || row.reads || []).every(id =>
      !/^(velocity|angularVelocity|force|torque):/.test(id) || zero(state.solverState?.channels?.[id])));
  }
  registry.define('physicsModel', 'simulatte-activity-runtime.js', {
    solveActivityTwoBone, evaluateActivityFrame, withActivityState, stepActivityState, activityMutationConflict,
    activitySimulationSettled,
  });
})(typeof globalThis !== 'undefined' ? globalThis : window);
