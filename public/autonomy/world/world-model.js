(function attachAutonomyWorldModel(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteAutonomyWorld = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createAutonomyWorldModule() {
  function createWorldModel(world) {
    const nodesById = new Map(world.nodes.map((row) => [row.id, row]));
    const segmentsById = new Map(world.segments.map((row) => [row.id, row]));
    const outgoingByNodeId = new Map(world.nodes.map((row) => [row.id, []]));
    world.segments.forEach((segment) => outgoingByNodeId.get(segment.fromNodeId).push(segment));
    outgoingByNodeId.forEach((rows) => rows.sort((left, right) => left.id.localeCompare(right.id)));
    const signalsByNodeId = new Map();
    world.signals.forEach((signal) => signalsByNodeId.set(signal.nodeId, signal));

    function node(id) {
      const row = nodesById.get(id);
      if (!row) throw worldError('unknown_node', `World ${world.id} has no node ${id}`);
      return row;
    }

    function segment(id) {
      const row = segmentsById.get(id);
      if (!row) throw worldError('unknown_segment', `World ${world.id} has no segment ${id}`);
      return row;
    }

    function outgoing(nodeId) {
      return [...(outgoingByNodeId.get(nodeId) || [])];
    }

    function blockedSegmentIds(tick) {
      return world.disruptions
        .filter((row) => row.type === 'blocked_segment' && tick >= row.activeFromTick && tick <= row.activeUntilTick)
        .map((row) => row.segmentId)
        .sort();
    }

    function signalState(signal, tick) {
      const phase = modulo(tick + signal.phaseOffsetTicks, signal.cycleTicks);
      return phase < signal.greenTickCount ? 'green' : 'red';
    }

    function signalRows(tick) {
      return world.signals.map((signal) => ({
        id: signal.id,
        nodeId: signal.nodeId,
        state: signalState(signal, tick),
      }));
    }

    function signalForEntry(nodeId, segmentId, tick) {
      const signal = signalsByNodeId.get(nodeId);
      if (!signal || !signal.controlledOutgoingSegmentIds.includes(segmentId)) return null;
      return { ...signal, state: signalState(signal, tick) };
    }

    function actorAtTick(actor, tick) {
      const isActive = tick >= actor.activeFromTick && tick <= actor.activeUntilTick;
      const span = Math.max(1, actor.activeUntilTick - actor.activeFromTick);
      const ratio = clamp((tick - actor.activeFromTick) / span, 0, 1);
      return {
        id: actor.id,
        type: actor.type,
        position: interpolatePolyline(actor.path, ratio),
        radiusM: actor.radiusM,
        isActive,
      };
    }

    function activeActors(tick) {
      return world.actors.map((actor) => actorAtTick(actor, tick)).filter((actor) => actor.isActive);
    }

    function nearbyActors(position, tick, radiusM) {
      return world.actors.map((actor) => actorAtTick(actor, tick)).map((actor) => ({
        ...actor,
        distanceM: distance(position, actor.position),
      })).filter((actor) => actor.isActive && actor.distanceM <= radiusM)
        .sort((left, right) => left.distanceM - right.distanceM || left.id.localeCompare(right.id));
    }

    function minimumActorClearance(start, end, tick, agentRadiusM, capM) {
      let minimum = capM;
      let actorId = null;
      const samples = 8;
      for (const actor of world.actors) {
        for (let index = 0; index <= samples; index += 1) {
          const ratio = index / samples;
          const actorState = actorAtTick(actor, tick + ratio);
          if (!actorState.isActive) continue;
          const agentPoint = interpolatePoint(start, end, ratio);
          const clearance = Math.max(0, distance(agentPoint, actorState.position) - agentRadiusM - actorState.radiusM);
          if (clearance < minimum || (clearance === minimum && actor.id < String(actorId || ''))) {
            minimum = clearance;
            actorId = actor.id;
          }
        }
      }
      return { clearanceM: minimum, actorId };
    }

    function positionAlongSegment(segmentId, progressM) {
      const row = segment(segmentId);
      return interpolatePolyline(row.geometry, clamp(progressM / row.lengthM, 0, 1));
    }

    function agentPosition(state) {
      if (state.currentSegmentId) return positionAlongSegment(state.currentSegmentId, state.segmentProgressM);
      return { ...node(state.currentNodeId).position };
    }

    return {
      world,
      nodesById,
      segmentsById,
      node,
      segment,
      outgoing,
      blockedSegmentIds,
      signalRows,
      signalForEntry,
      actorAtTick,
      activeActors,
      nearbyActors,
      minimumActorClearance,
      positionAlongSegment,
      agentPosition,
    };
  }

  function interpolatePolyline(points, ratio) {
    if (points.length === 1) return { ...points[0] };
    const lengths = [];
    let total = 0;
    for (let index = 1; index < points.length; index += 1) {
      const length = distance(points[index - 1], points[index]);
      lengths.push(length);
      total += length;
    }
    let target = clamp(ratio, 0, 1) * total;
    for (let index = 0; index < lengths.length; index += 1) {
      if (target <= lengths[index] || index === lengths.length - 1) {
        return interpolatePoint(points[index], points[index + 1], lengths[index] ? target / lengths[index] : 0);
      }
      target -= lengths[index];
    }
    return { ...points[points.length - 1] };
  }

  function interpolatePoint(start, end, ratio) {
    return { x: start.x + (end.x - start.x) * ratio, y: start.y + (end.y - start.y) * ratio };
  }

  function distance(left, right) {
    return Math.hypot(left.x - right.x, left.y - right.y);
  }

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function modulo(value, divisor) {
    return ((value % divisor) + divisor) % divisor;
  }

  function worldError(code, message) {
    const error = new Error(`${code}: ${message}`);
    error.name = 'AutonomyWorldError';
    error.code = code;
    return error;
  }

  return { createWorldModel, distance, interpolatePoint, interpolatePolyline };
});
