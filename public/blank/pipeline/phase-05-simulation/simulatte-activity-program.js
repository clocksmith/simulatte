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
    const actions = graph.actions.filter(row => {
      if (row.status !== 'accepted') return false;
      if (!nodes.some(node => node.id === row.actorId && !node.unresolved) ||
          row.objectId && !nodes.some(node => node.id === row.objectId && !node.unresolved)) {
        unsupported.push({ id: row.id, reason: 'authored edit removed an activity participant', evidence: row.sourceEvidence });
        return false;
      }
      return true;
    });
    const actorIds = [...new Set(actions.map(row => row.actorId))];
    if (actorIds.length > graph.capabilities.limits.maxActors) throw new Error('Activity actor bound exceeded');
    const actors = actorIds.map((id, i) => {
      const node = nodes.find(row => row.id === id);
      const height = node?.params?.height ?? 1.7;
      if (!Number.isFinite(height) || height < 0.8 || height > 2.4) throw new Error('Unsupported actor height');
      return { id, height, skeletonId: graph.capabilities.skeleton.id, origin: [i * 2.5, 0],
        units: 'm', frame: 'world', provenance: node.provenance || { spanId: node.spanId } };
    });
    const objects = [...new Set(actions.map(row => row.objectId).filter(Boolean))].map((id, i) => {
      const node = nodes.find(row => row.id === id), label = String(node.label || '').toLowerCase();
      const kind = /chair|seat|bench/.test(label) ? 'seat' : /cup|mug/.test(label) ? 'cup' : /phone/.test(label) ? 'phone' : 'object';
      return { id, kind, position: node.params?.position || [0.5 + i * 0.3, kind === 'seat' ? 0.45 : 1],
        radius: node.params?.radius ?? (kind === 'seat' ? 0.25 : kind === 'cup' ? 0.045 : 0.035),
        seatHeight: node.params?.seatHeight ?? 0.45, units: 'm', frame: 'world' };
    });
    const accepted = actions.filter(action => {
      const object = objects.find(row => row.id === action.objectId);
      const previous = actions.filter(row => row.status === 'accepted' && row.actorId === action.actorId &&
        row.endSeconds <= action.startSeconds && row.writes.some(channel => action.writes.includes(channel))).at(-1);
      const node = nodes.find(row => row.id === action.objectId);
      const repeatedReference = previous?.objectId !== action.objectId && object &&
        action.sourceEvidence.text.toLowerCase().includes(`the ${String(node?.label || '').toLowerCase()}`) &&
        objects.find(row => row.id === previous?.objectId)?.kind === object.kind;
      const reason = action.action === 'sit' && object?.kind !== 'seat' ? 'object has no qualified seat support' :
        action.action === 'drink' && object?.kind !== 'cup' ? 'object has no cup affordance' :
          action.action === 'place' ? 'placement requires a qualified support binding and release transition' :
          repeatedReference ? 'repeated object reference lacks a committed identity binding' :
          previous && ['walk', 'sit'].includes(action.action) && previous.action !== action.action ? 'root transition requires a qualified stand or sit-down trajectory' :
          previous?.hand && previous.objectId !== action.objectId ? 'hand transition requires an explicit qualified release' : null;
      if (reason) unsupported.push({ id: action.id, reason, evidence: action.sourceEvidence });
      return !reason;
    });
    const program = { schema: 'simulatte.activityProgram.v1', version: 1, actors, objects,
      actions: accepted.map(action => ({ ...action,
        joints: action.hand ? [`${action.hand}-shoulder`, `${action.hand}-elbow`, `${action.hand}-hand`] : ['pelvis', 'left-foot', 'right-foot'],
        anchors: action.action === 'sit' ? ['pelvis', 'seat'] : action.hand ? [`${action.hand}-hand`, 'grip'] : ['left-foot', 'right-foot'],
        startCondition: action.timing.after ? `complete:${action.timing.after}` : 'simulation-start',
        completionCondition: action.component.completion, cancellation: action.component.cancellation,
      })), unsupported, assumptions: [...graph.assumptions, { id: 'geometry-defaults',
        reason: 'declared procedural geometry in meters; authored node params override dimensions and placements' }],
      coverage: graph.coverage, limits: graph.capabilities.limits,
      tolerances: { contactMeters: 1e-5, penetrationMeters: 1e-4, footSlideMeters: 1e-4 },
      manipulationPolicy: 'reject-active-participant-mutation' };
    program.contentHash = activityProgramHash(program);
    validateActivityProgram(program);
    return scope.phaseContracts.immutableArtifact(program);
  }
  function validateActivityProgram(program) {
    if (!program || program.schema !== 'simulatte.activityProgram.v1' || program.version !== 1 ||
        program.contentHash !== activityProgramHash(program)) throw new Error('Invalid activity program identity');
    if (!Number.isInteger(program.limits.maxActors) || program.limits.maxActors > 16 ||
        !Number.isInteger(program.limits.maxActions) || program.limits.maxActions > 64 ||
        !Number.isFinite(program.limits.maxDurationSeconds) || program.limits.maxDurationSeconds > 120 ||
        program.actors.length > program.limits.maxActors || program.actions.length > program.limits.maxActions) throw new Error('Activity program exceeds bounds');
    const ids = new Set();
    for (const actor of program.actors) {
      if (ids.has(actor.id) || !Number.isFinite(actor.height) || actor.height < 0.8 || actor.height > 2.4 ||
          !Array.isArray(actor.origin) || actor.origin.length !== 2 || !actor.origin.every(Number.isFinite) ||
          actor.skeletonId !== 'simulatte.planar-human.v1') throw new Error('Invalid activity actor');
      ids.add(actor.id);
    }
    for (const object of program.objects) {
      if (ids.has(object.id) || !Array.isArray(object.position) || object.position.length !== 2 ||
          !object.position.every(Number.isFinite) || !Number.isFinite(object.radius) || object.radius <= 0 ||
          !Number.isFinite(object.seatHeight)) throw new Error('Invalid activity object geometry');
      ids.add(object.id);
    }
    for (const action of program.actions) {
      if (ids.has(action.id)) throw new Error('Duplicate activity action identity');
      ids.add(action.id);
      if (!program.actors.some(row => row.id === action.actorId) ||
          action.objectId && !program.objects.some(row => row.id === action.objectId) ||
          !Number.isFinite(action.startSeconds) || !Number.isFinite(action.endSeconds) ||
          action.startSeconds < 0 || action.endSeconds <= action.startSeconds || action.endSeconds > program.limits.maxDurationSeconds ||
          action.durationSeconds !== action.endSeconds - action.startSeconds ||
          !['walk', 'sit', 'hold', 'drink', 'place'].includes(action.action) ||
          action.hand && !['left', 'right'].includes(action.hand)) throw new Error('Invalid activity action');
    }
    return program;
  }
  registry.define('physicsModel', 'simulatte-activity-program.js', { compileActivityProgram, validateActivityProgram, activityProgramHash });
})(typeof globalThis !== 'undefined' ? globalThis : window);
