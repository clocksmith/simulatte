(function attachSubseaRepairEngine(root, factory) {
  const demandApi = typeof module === 'object' && module.exports
    ? require('./demand-model.js')
    : root.SimulatteSubseaDemandModel;
  const api = factory(demandApi);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteSubseaRepairEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createSubseaRepairEngine(demandApi) {
  const HOUR_MS = 3600000;

  function buildRepairTimeline({
    failedResourceIds,
    edges,
    points,
    repairScenario,
    repairPolicyId,
    repairResourceCount,
    seed,
    unmetByEdge,
  }) {
    const targets = resolveTargets(failedResourceIds, edges);
    const resources = repairScenario.resources.slice(0, repairResourceCount).map((row) => ({
      ...row,
      availableAtHours: 0,
      currentLandingId: row.startLandingId,
      remainingSpareCableKm: row.spareCableKm,
      remainingSpliceKits: row.spliceKits,
    }));
    if (targets.length && !resources.length) throw repairError('subsea_repair_resource_missing', 'Failed resources require at least one repair resource');
    const ordered = [...targets].sort((left, right) => compareTarget(left, right, repairPolicyId, unmetByEdge));
    const events = [];
    const restorations = [];
    for (const target of ordered) {
      const resource = selectResource(resources, target, points);
      requireInventory(resource, repairScenario, target);
      const travelHours = travelTimeHours(resource.currentLandingId, target.landingId, points, resource.speedKph);
      const requestedAt = resource.availableAtHours;
      const reachedAt = requestedAt + travelHours;
      let attemptAt = reachedAt;
      const origin = coordinatesFor(resource.currentLandingId, points);
      const destination = coordinatesFor(target.landingId, points);
      appendEvent(events, target, resource, 'repair.requested', requestedAt, [], {
        position: origin,
        origin,
        destination,
        transitProgressFraction: 0,
      });
      appendEvent(events, target, resource, 'repair.resource-assigned', requestedAt, [events.at(-1).id], {
        position: origin,
        origin,
        destination,
        transitProgressFraction: 0,
      });
      appendEvent(events, target, resource, 'repair.transit-started', requestedAt, [events.at(-1).id], {
        position: origin,
        origin,
        destination,
        transitProgressFraction: 0,
      });
      for (const fraction of [0.25, 0.5, 0.75]) {
        appendEvent(
          events,
          target,
          resource,
          'repair.transit-progressed',
          requestedAt + travelHours * fraction,
          [events.at(-1).id],
          {
            position: interpolate(origin, destination, fraction),
            origin,
            destination,
            transitProgressFraction: fraction,
          }
        );
      }
      appendEvent(events, target, resource, 'repair.site-reached', reachedAt, [events.at(-1).id], {
        position: destination,
        origin,
        destination,
        transitProgressFraction: 1,
      });
      appendEvent(events, target, resource, 'repair.attempt-started', attemptAt, [events.at(-1).id], {
        position: destination,
        origin,
        destination,
        transitProgressFraction: 1,
      });
      const failedAttempt = demandApi.seededUnit(`${seed}:${target.id}:repair-attempt`) < repairScenario.attemptFailureProbability;
      if (failedAttempt) {
        attemptAt += repairScenario.repairDurationHours;
        appendEvent(events, target, resource, 'repair.attempt-failed', attemptAt, [events.at(-1).id], {
          position: destination,
          origin,
          destination,
          transitProgressFraction: 1,
        });
        appendEvent(events, target, resource, 'repair.attempt-started', attemptAt, [events.at(-1).id], {
          position: destination,
          origin,
          destination,
          transitProgressFraction: 1,
        });
      }
      const restoredAt = attemptAt + repairScenario.repairDurationHours;
      appendEvent(events, target, resource, 'repair.capacity-restored', restoredAt, [events.at(-1).id], {
        position: destination,
        origin,
        destination,
        transitProgressFraction: 1,
      });
      appendEvent(events, target, resource, 'repair.completed', restoredAt, [events.at(-1).id], {
        position: destination,
        origin,
        destination,
        transitProgressFraction: 1,
      });
      resource.remainingSpareCableKm -= repairScenario.spareCablePerRepairKm;
      resource.remainingSpliceKits -= repairScenario.spliceKitsPerRepair;
      resource.availableAtHours = restoredAt;
      resource.currentLandingId = target.landingId;
      restorations.push({
        targetId: target.id,
        edgeIds: target.edgeIds,
        simulationTimeMs: Math.round(restoredAt * HOUR_MS),
        resourceId: resource.id,
      });
    }
    return deepFreeze({
      schema: 'simulatte.plugin.subseaRepairReceipt.v1',
      algorithm: 'deterministic-discrete-event-repair-queue-v1',
      repairPolicyId,
      failedResourceIds: [...failedResourceIds].sort(),
      targetPriorityBurdenGbps: Object.fromEntries(
        [...targets]
          .sort((left, right) => left.id.localeCompare(right.id))
          .map((target) => [
            target.id,
            target.edgeIds.reduce((sum, edgeId) => sum + (unmetByEdge[edgeId] || 0), 0),
          ])
      ),
      events: events.sort(compareEvent).map((row, sequence) => ({ ...row, sequence })),
      restorations: restorations.sort((left, right) => left.simulationTimeMs - right.simulationTimeMs || left.targetId.localeCompare(right.targetId)),
      resources: resources.map(({ availableAtHours, currentLandingId, ...row }) => ({
        ...row,
        terminalAvailableAtHours: availableAtHours,
        terminalLandingId: currentLandingId,
      })),
      inventoryConserved: resources.every((row) => row.remainingSpareCableKm >= 0 && row.remainingSpliceKits >= 0),
    });
  }

  function resolveTargets(failedResourceIds, edges) {
    return failedResourceIds.map((id) => {
      if (id.startsWith('landing:')) {
        const landingId = id.slice('landing:'.length);
        const edgeIds = edges.filter((row) => row.fromLandingId === landingId || row.toLandingId === landingId)
          .map((row) => row.id);
        if (!edgeIds.length) throw repairError('subsea_failure_target_invalid', `Landing ${landingId} has no edges`);
        return { id, landingId, edgeIds };
      }
      const edge = edges.find((row) => row.id === id);
      if (!edge) throw repairError('subsea_failure_target_invalid', `Unknown edge ${id}`);
      return { id, landingId: edge.toLandingId, edgeIds: [edge.id] };
    });
  }

  function compareTarget(left, right, policyId, unmetByEdge) {
    if (policyId === 'unmet-demand-first') {
      const leftBurden = left.edgeIds.reduce((sum, id) => sum + (unmetByEdge[id] || 0), 0);
      const rightBurden = right.edgeIds.reduce((sum, id) => sum + (unmetByEdge[id] || 0), 0);
      if (leftBurden !== rightBurden) return rightBurden - leftBurden;
    }
    return left.id.localeCompare(right.id);
  }

  function selectResource(resources, target, points) {
    return [...resources].sort((left, right) => {
      const leftArrival = left.availableAtHours + travelTimeHours(left.currentLandingId, target.landingId, points, left.speedKph);
      const rightArrival = right.availableAtHours + travelTimeHours(right.currentLandingId, target.landingId, points, right.speedKph);
      return leftArrival - rightArrival || left.id.localeCompare(right.id);
    })[0];
  }

  function requireInventory(resource, scenario, target) {
    if (resource.remainingSpareCableKm < scenario.spareCablePerRepairKm
      || resource.remainingSpliceKits < scenario.spliceKitsPerRepair) {
      throw repairError('subsea_repair_inventory_exhausted', `${resource.id} cannot repair ${target.id}`);
    }
  }

  function travelTimeHours(fromLandingId, toLandingId, points, speedKph) {
    const from = points.find((row) => row.id === fromLandingId);
    const to = points.find((row) => row.id === toLandingId);
    if (!from || !to || !Number.isFinite(speedKph) || speedKph <= 0) {
      throw repairError('subsea_repair_travel_input_invalid', `${fromLandingId} to ${toLandingId}`);
    }
    return greatCircleKm(from.coordinates, to.coordinates) / speedKph;
  }

  function greatCircleKm(left, right) {
    const radians = (degrees) => degrees * Math.PI / 180;
    const lat1 = radians(left[1]);
    const lat2 = radians(right[1]);
    const deltaLat = lat2 - lat1;
    const deltaLon = radians(right[0] - left[0]);
    const a = Math.sin(deltaLat / 2) ** 2
      + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function appendEvent(events, target, resource, kind, timeHours, causationIds, details = {}) {
    events.push({
      id: `${target.id}:${resource.id}:${kind}:${events.length}`,
      kind,
      simulationTimeMs: Math.round(timeHours * HOUR_MS),
      targetId: target.id,
      edgeIds: target.edgeIds,
      resourceId: resource.id,
      causationIds,
      ...details,
    });
  }

  function coordinatesFor(landingId, points) {
    const point = points.find((row) => row.id === landingId);
    if (!point) throw repairError('subsea_repair_landing_missing', landingId);
    return Object.freeze([...point.coordinates, 0]);
  }

  function interpolate(start, end, fraction) {
    return Object.freeze(start.map((value, index) => value + (end[index] - value) * fraction));
  }

  function compareEvent(left, right) {
    return left.simulationTimeMs - right.simulationTimeMs;
  }

  function repairError(code, message) {
    const error = new Error(`${code}: ${message}`);
    error.name = 'SimulatteSubseaRepairError';
    error.code = code;
    return error;
  }

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
  }

  return Object.freeze({ buildRepairTimeline });
});
