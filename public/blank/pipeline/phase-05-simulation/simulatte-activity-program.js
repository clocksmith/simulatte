(function registerActivityProgram(root) {
  const registry = typeof module === 'object' && module.exports
    ? require('../../app/runtime/phase-module-registry.js') : root.SimulattePhaseModuleRegistry;
  const scope = registry.family('physicsModel');
  function activityProgramHash(program) {
    const { contentHash, ...body } = program;
    return `fnv1a32:${scope.fnv1a32(scope.phaseContracts.canonicalJson(body)).toString(16).padStart(8, '0')}`;
  }
  function compileActivityProgram(graph, acceptedGraph) {
    if (!graph) return null;
    const nodes = acceptedGraph.nodes || [], unsupported = graph.unsupported.slice();
    const policy = graph.capabilities.dynamics;
    const actions = graph.actions.filter(row => {
      if (row.status !== 'accepted') return false;
      if (!nodes.some(node => node.id === row.actorId && !node.unresolved) ||
          row.objectId && !nodes.some(node => node.id === row.objectId && !node.unresolved) ||
          row.supportObjectId && !nodes.some(node => node.id === row.supportObjectId && !node.unresolved)) {
        unsupported.push({ id: row.id, reason: 'authored edit removed an activity participant', evidence: row.sourceEvidence });
        return false;
      }
      return true;
    }).sort((a, b) => a.startSeconds - b.startSeconds || a.sourceEvidence.start - b.sourceEvidence.start);
    const actorIds = [...new Set(actions.map(row => row.actorId))];
    if (actorIds.length > graph.capabilities.limits.maxActors) throw new Error('Activity actor bound exceeded');
    const actors = actorIds.map((id, i) => {
      const node = nodes.find(row => row.id === id);
      const height = node?.params?.height ?? 1.7;
      if (!Number.isFinite(height) || height < 0.8 || height > 2.4) throw new Error('Unsupported actor height');
      return { id, height, skeletonId: graph.capabilities.skeleton.id, capabilities: [graph.capabilities.skeleton.id], origin: [i * 2.5, 0],
        ...(policy ? { massKg: node?.params?.massKg ?? policy.defaultActorMassKg } : {}),
        units: 'm', frame: 'world', provenance: node.provenance || { spanId: node.spanId } };
    });
    const objectIds = [...new Set(actions.flatMap(row => [row.objectId,row.supportObjectId]).filter(Boolean))];
    const objects = objectIds.map((id, i) => {
      const node = nodes.find(row => row.id === id);
      const qualified = scope.resolveActivityObjectCapabilities(node, graph.capabilities);
      const { kind, capabilities, provenance } = qualified;
      const radius = node.params?.radius ?? (kind === 'seat' ? 0.25 : kind === 'support' ? 0.35 : kind === 'cup' ? 0.045 : 0.035);
      const containsLiquid = actions.some(row => scope.activityPrimitive(row) === 'drink' && row.objectId === id);
      const first = actions.find(row => row.objectId === id || row.supportObjectId===id), actor = actors.find(row => row.id === first?.actorId);
      const walkTime = actions.filter(row => row.actorId === actor?.id && scope.activityPrimitive(row) === 'walk' && row.startSeconds < first.startSeconds)
        .reduce((s, row) => s + Math.min(row.endSeconds, first.startSeconds) - row.startSeconds, 0);
      const priorSeat=actions.filter(row=>row.actorId===actor?.id&&scope.activityPrimitive(row)==='sit'&&row.startSeconds<first.startSeconds).at(-1);
      const priorSeatNode=nodes.find(row=>row.id===priorSeat?.objectId);
      const seatX = action => {
        const seatNode = nodes.find(row => row.id === action?.objectId);
        if (!seatNode) return actor.origin[0] + actor.height * 0.2 * walkTime;
        const walked = actions.filter(row => row.actorId === actor.id && scope.activityPrimitive(row) === 'walk' && row.startSeconds < action.startSeconds)
          .reduce((sum, row) => sum + Math.min(row.endSeconds, action.startSeconds) - row.startSeconds, 0);
        return seatNode.params?.position?.[0] ?? (action.startSeconds > 0 ? actor.origin[0] + actor.height * 0.2 * walked : 0.5 + objectIds.indexOf(seatNode.id) * 0.3);
      };
      const pendingPosition = policy && first?.hand && first.startSeconds > 0
        ? [seatX(priorSeat)+actor.height*(first.hand==='left'?-0.29:0.29), (priorSeat ? priorSeatNode.params?.seatHeight??0.45 : actor.height*0.5)+actor.height*0.05] : null;
      const seated=actions.filter(row=>row.actorId===actor?.id&&scope.activityPrimitive(row)==='sit'&&row.startSeconds<first.startSeconds).at(-1);
      const supportHeight=node.params?.supportHeight ?? 0.75;
      const supportPosition=kind==='support' ? [seatX(seated)+(first.hand==='left'?-1:1)*actor.height*0.29,supportHeight] : null;
      const seatPosition=kind==='seat'&&first.startSeconds>0 ? [actor.origin[0]+actor.height*0.2*walkTime,node.params?.seatHeight??0.45] : null;
      return { id, kind, capabilities, capabilityProvenance: provenance, position: node.params?.position || supportPosition || seatPosition || pendingPosition || [0.5 + i * 0.3, kind === 'seat' ? 0.45 : 1],
        ...(policy ? {supportHeight} : {}),
        ...(policy ? { massKg: node.params?.massKg ?? policy.defaultObjectMassKg,
        gripForceLimitNewtons: node.params?.gripForceLimitNewtons ?? policy.defaultGripForceNewtons,
        gripTorqueLimitNewtonMeters: node.params?.gripTorqueLimitNewtonMeters ?? policy.defaultGripTorqueNewtonMeters,
        supportCapacityNewtons: node.params?.supportCapacityNewtons ?? policy.defaultSeatCapacityNewtons,
        liquidContainer: kind === 'cup' ? { widthMeters: radius * 2, heightMeters: radius * 2.6,
          depthMeters: radius * 2, fillFraction: node.params?.liquidFillFraction ?? (containsLiquid ? 0.55 : 0) } : null } : {}),
        radius,
        seatHeight: node.params?.seatHeight ?? 0.45, units: 'm', frame: 'world' };
    });
    const composition = scope.compileActivityRelationships(actions, [...actors, ...objects], unsupported);
    const accepted = composition.actions;
    for (const object of objects) object.authoringFields = scope.activityObjectAuthoringFields(object, graph.capabilities);
    const program = { schema: policy ? 'simulatte.activityProgram.v3' : 'simulatte.activityProgram.v1', version: policy ? 3 : 1, actors, objects, relationships: composition.relationships, identityBindings:acceptedGraph.activityIdentityBindings||[],
      actions: accepted.map(action => ({ ...action,
        ...(scope.activityPrimitive(action)==='place'?{releaseSeconds:action.startSeconds+action.durationSeconds*0.8}:{}),
        joints: action.hand ? [`${action.hand}-shoulder`, `${action.hand}-elbow`, `${action.hand}-hand`] : ['pelvis', 'left-foot', 'right-foot'],
        anchors: scope.activityPrimitive(action) === 'sit' ? ['pelvis', 'seat'] : action.hand ? [`${action.hand}-hand`, 'grip'] : ['left-foot', 'right-foot'],
        startCondition: action.timing.after ? `complete:${action.timing.after}` : 'simulation-start',
        completionCondition: action.component.completion, cancellation: action.component.cancellation,
      })), unsupported, assumptions: [...graph.assumptions, { id: 'geometry-defaults',
        reason: 'declared procedural geometry in meters; authored node params override dimensions and placements' },
        ...(policy ? [{ id: 'dynamics-defaults', reason: 'declared masses, load limits, rectangular cup and water properties; drink implies a 55% initial fill unless authored; pending props begin at the unspecified later attachment position' }] : [])],
      coverage: graph.coverage, limits: graph.capabilities.limits, ...(policy ? { dynamics: policy } : {}),
      tolerances: { contactMeters: 1e-5, penetrationMeters: 1e-4, footSlideMeters: 1e-4 },
      manipulationPolicy: 'reject-active-participant-mutation' };
    program.contentHash = activityProgramHash(program);
    validateActivityProgram(program);
    return scope.phaseContracts.immutableArtifact(program);
  }
  const validatedPrograms=new WeakSet();
  function activityRevisionRequirements(program) {
    if (!program) return [];
    scope.validateActivityProgram(program);
    const requirements = program.unsupported.slice();
    for (const action of program.actions) {
      const object = program.objects.find(row => row.id === action.objectId);
      if (scope.activityPrimitive(action) === 'drink' && !(object?.liquidContainer?.fillFraction > 0)) {
        requirements.push({ id: action.id, reason: 'drinking requires liquid in the selected container' });
      }
      // This checks the prescribed path. Force, liquid, and drawing proof remain independent.
      for (let sample = 0; sample <= 32; sample++) {
        const time = action.startSeconds + action.durationSeconds * sample / 32;
        const frame = scope.evaluateActivityFrame(program, time);
        for (const violation of frame.violations) {
          if (!requirements.some(row => row.id === action.id && row.reason === violation.reason)) {
            requirements.push({ id: action.id, ...violation, timeSeconds: time });
          }
        }
        // The depth solver cannot represent loss of normal gravity during an
        // unrotated lift. Match its backward-difference acceleration; rotating
        // fluid, forces, and conservation still require execution proof.
        const dt = program.dynamics?.maxStepSeconds;
        if (object?.liquidContainer?.fillFraction > 0 && dt && time >= 2 * dt) {
          const current = frame.objects[object.id];
          const before = scope.evaluateActivityFrame(program, time - dt).objects[object.id];
          const prior = scope.evaluateActivityFrame(program, time - 2 * dt).objects[object.id];
          if ([current.rotation, before.rotation, prior.rotation].every(angle => Math.abs(angle) < 1e-9)) {
            const acceleration = (current.position[1] - 2 * before.position[1] + prior.position[1]) / (dt * dt);
            const reason = 'prescribed cup acceleration exceeds the liquid depth model: positive effective normal gravity required';
            if (program.dynamics.gravityMetersPerSecondSquared + acceleration <= 0 &&
                !requirements.some(row => row.id === action.id && row.reason === reason)) {
              requirements.push({ id: action.id, reason, objectId: object.id, timeSeconds: time });
            }
          }
        }
      }
    }
    return requirements;
  }
  function deeplyImmutable(value,seen=new WeakSet()) {
    if(value===null||typeof value!=='object')return typeof value!=='function';
    if(seen.has(value))return true;
    const prototype=Object.getPrototypeOf(value);
    if(!Object.isFrozen(value)||prototype!==null&&prototype!==Object.prototype&&prototype!==Array.prototype)return false;
    seen.add(value);
    const descriptors=Object.getOwnPropertyDescriptors(value);
    return Reflect.ownKeys(descriptors).every(key=>Object.hasOwn(descriptors[key],'value')&&deeplyImmutable(descriptors[key].value,seen));
  }
  function validateActivityProgram(program) {
    if(program&&validatedPrograms.has(program))return program;
    if (!program || !['simulatte.activityProgram.v1', 'simulatte.activityProgram.v2', 'simulatte.activityProgram.v3'].includes(program.schema) ||
        program.schema !== `simulatte.activityProgram.v${program.version}` ||
        program.contentHash !== activityProgramHash(program)) throw new Error('Invalid activity program identity');
    if (!Number.isInteger(program.limits.maxActors) || program.limits.maxActors > 16 ||
        !Number.isInteger(program.limits.maxActions) || program.limits.maxActions > 64 ||
        !Number.isFinite(program.limits.maxDurationSeconds) || program.limits.maxDurationSeconds > 120 ||
        program.actors.length > program.limits.maxActors || program.actions.length > program.limits.maxActions) throw new Error('Activity program exceeds bounds');
    if(program.version===3&&(!Number.isInteger(program.limits.maxHistoryFrames)||program.limits.maxHistoryFrames<2||program.limits.maxHistoryFrames>8192))throw new Error('Invalid activity history bound');
    if (program.version >= 2) validateActivityDynamicsPolicy(program.dynamics);
    if(program.version===2&&program.dynamics.schema!=='simulatte.activityDynamicsPolicy.v1'||program.version===3&&program.dynamics.schema!=='simulatte.activityDynamicsPolicy.v2')throw new Error('Activity version requires its declared numerical policy');
    if (program.version === 1 && program.dynamics) throw new Error('Legacy activities cannot silently acquire dynamics');
    const ids = new Set();
    for (const actor of program.actors) {
      if (ids.has(actor.id) || !Number.isFinite(actor.height) || actor.height < 0.8 || actor.height > 2.4 ||
          !Array.isArray(actor.origin) || actor.origin.length !== 2 || !actor.origin.every(Number.isFinite) ||
          actor.skeletonId !== 'simulatte.planar-human.v1') throw new Error('Invalid activity actor');
      if (program.dynamics && (!Number.isFinite(actor.massKg) || actor.massKg <= 0 || actor.massKg > 500)) throw new Error('Invalid activity actor mass');
      ids.add(actor.id);
    }
    for (const object of program.objects) {
      if (ids.has(object.id) || !Array.isArray(object.position) || object.position.length !== 2 ||
          !object.position.every(Number.isFinite) || !Number.isFinite(object.radius) || object.radius <= 0 ||
          !Number.isFinite(object.seatHeight) || object.seatHeight <= 0 || object.seatHeight > 1.2 || object.kind==='support'&&(!Number.isFinite(object.supportHeight)||object.supportHeight<=0||object.supportHeight>2)) throw new Error('Invalid activity object geometry');
      if (program.dynamics) {
        for (const key of ['massKg', 'gripForceLimitNewtons', 'gripTorqueLimitNewtonMeters', 'supportCapacityNewtons']) {
          if (!Number.isFinite(object[key]) || object[key] <= 0 || object[key] > 100000) throw new Error('Invalid activity mass/load limit');
        }
        const c = object.liquidContainer;
        if (object.kind === 'cup' && !c || c && (!['widthMeters', 'heightMeters', 'depthMeters'].every(k => Number.isFinite(c[k]) && c[k] > 0 && c[k] <= 2) ||
            !Number.isFinite(c.fillFraction) || c.fillFraction < 0 || c.fillFraction > 1)) throw new Error('Invalid liquid container');
      }
      ids.add(object.id);
    }
    for (const action of program.actions) {
      if (action.component?.contract) {
        scope.qualifyActivityComponent(action.component);
        if (action.action !== action.component.id) throw new Error('Activity component identity mismatch');
      }
      if (ids.has(action.id)) throw new Error('Duplicate activity action identity');
      ids.add(action.id);
      if (!program.actors.some(row => row.id === action.actorId) ||
          action.objectId && !program.objects.some(row => row.id === action.objectId) ||
          !Number.isFinite(action.startSeconds) || !Number.isFinite(action.endSeconds) ||
          action.startSeconds < 0 || action.endSeconds <= action.startSeconds || action.endSeconds > program.limits.maxDurationSeconds ||
          !Number.isFinite(action.durationSeconds) || Math.abs(action.durationSeconds - (action.endSeconds - action.startSeconds)) > 1e-9 ||
          !['walk', 'sit', 'stand', 'hold', 'drink', 'place'].includes(scope.activityPrimitive(action)) ||
          action.hand && !['left', 'right'].includes(action.hand) ||
          scope.activityPrimitive(action)==='place'&&(program.version<3||!program.objects.some(row=>row.id===action.supportObjectId&&row.kind==='support')||action.releaseSeconds!==action.startSeconds+action.durationSeconds*0.8)) throw new Error('Invalid activity action');
    }
    if(deeplyImmutable(program))validatedPrograms.add(program);
    return program;
  }
  function validateActivityDynamicsPolicy(policy) {
    if (!policy || !['simulatte.activityDynamicsPolicy.v1','simulatte.activityDynamicsPolicy.v2'].includes(policy.schema)) throw new Error('Missing dynamics policy');
    const keys = Object.keys(scope.activityCapabilityInventory().dynamics).filter(key=>policy.schema!=='simulatte.activityDynamicsPolicy.v1'||key!=='liquidSpatialOrder');
    if(policy.schema==='simulatte.activityDynamicsPolicy.v2'&&policy.liquidSpatialOrder!==2)throw new Error('Unsupported liquid reconstruction order');
    if (keys.some(k => !Object.hasOwn(policy, k)) || Object.keys(policy).some(k => !keys.includes(k))) throw new Error('Invalid dynamics policy fields');
    for (const [key, value] of Object.entries(policy)) if (key !== 'schema' && (!Number.isFinite(value) || value < 0)) throw new Error('Invalid dynamics policy');
    for (const key of ['gravityMetersPerSecondSquared', 'maxStepSeconds', 'cfl', 'liquidDensityKgPerCubicMeter',
      'mouthCaptureRadiusMeters', 'groundCapacityNewtons', 'momentumToleranceKgMetersPerSecond',
      'angularMomentumToleranceKgSquareMetersPerSecond', 'massToleranceKg']) {
      if (!(policy[key] > 0)) throw new Error('Missing positive dynamics policy');
    }
    if (!Number.isInteger(policy.liquidCells) || policy.liquidCells < 4 || policy.liquidCells > (policy.schema==='simulatte.activityDynamicsPolicy.v1'?128:4096) ||
        !Number.isInteger(policy.liquidVisualCells) || policy.liquidVisualCells < 1 || policy.liquidVisualCells > 16 || policy.liquidCells % policy.liquidVisualCells !== 0 ||
        !Number.isInteger(policy.maxLiquidSubsteps) || policy.maxLiquidSubsteps < 1 || policy.maxLiquidSubsteps > 4096 ||
        !Number.isInteger(policy.maxPhysicsSubsteps) || policy.maxPhysicsSubsteps < 1 || policy.maxPhysicsSubsteps > 256 ||
        !Number.isInteger(policy.maxLiquidTransferEventsPerFrame) || policy.maxLiquidTransferEventsPerFrame < 1 || policy.maxLiquidTransferEventsPerFrame > (policy.schema==='simulatte.activityDynamicsPolicy.v1'?2048:32768) ||
        policy.cfl > 0.4 || policy.maxStepSeconds > 1 / 120 || policy.maxStepSeconds < 1 / 960 || policy.mouthCaptureRadiusMeters > 0.1 || policy.frictionCoefficient > 2 ||
        policy.angularMomentumToleranceKgSquareMetersPerSecond > 1e-6 ||
        policy.momentumToleranceKgMetersPerSecond > 1e-6 || policy.massToleranceKg > 1e-8) throw new Error('Dynamics accuracy/resource bounds exceeded');
    return policy;
  }
  registry.define('physicsModel', 'simulatte-activity-program.js', { compileActivityProgram, validateActivityProgram, activityProgramHash, activityRevisionRequirements });
})(typeof globalThis !== 'undefined' ? globalThis : window);
