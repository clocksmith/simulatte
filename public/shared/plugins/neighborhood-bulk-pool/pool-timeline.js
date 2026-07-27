(function attachNeighborhoodBulkPoolTimeline(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteNeighborhoodBulkPoolTimeline = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createNeighborhoodBulkPoolTimeline() {
  const HOUR_MS = 3600000;

  function createEvents(identity, result) {
    const rows = [{
      kind: 'bulk-pool.demand-registered',
      payload: {
        requestedUnits: result.metrics.requestedUnits,
        householdCount: result.metrics.totalHouseholds,
      },
    }];
    result.poolGroups.forEach((group) => rows.push({
      kind: 'bulk-pool.package-formed',
      payload: {
        poolGroupId: group.id,
        itemId: group.item.id,
        itemName: group.item.name,
        warehouseId: group.warehouseId,
        packages: group.packages,
        allocatedUnits: group.allocatedUnits,
        wasteUnits: group.wasteUnits,
        purchaseCostUsd: group.purchaseCostUsd,
      },
    }));
    result.rejectedRequests.forEach((request) => rows.push({
      kind: 'bulk-pool.request-rejected',
      payload: {
        requestId: request.requestId,
        neighborhoodId: request.neighborhoodId,
        quantity: request.quantity,
        reason: request.reason,
      },
    }));
    result.tripAssignments.forEach((trip) => {
      rows.push({
        kind: 'bulk-pool.trip-dispatched',
        payload: {
          tripAssignmentId: trip.id,
          tripId: trip.tripId,
          driverPseudonym: trip.driverPseudonym,
          warehouseId: trip.warehouseId,
          progressFraction: 0,
          poolGroupIds: trip.poolGroupIds,
        },
      }, {
        kind: 'bulk-pool.vehicle-arrived-warehouse',
        payload: {
          tripAssignmentId: trip.id,
          warehouseId: trip.warehouseId,
          progressFraction: 0.18,
        },
      }, {
        kind: 'bulk-pool.packages-loaded',
        payload: {
          tripAssignmentId: trip.id,
          poolGroupIds: trip.poolGroupIds,
          progressFraction: 0.28,
          cargoMassKg: trip.capacity.massKg,
          coldVolumeL: trip.capacity.coldVolumeL,
        },
      });
      trip.stops.forEach((stop, stopIndex) => rows.push({
        kind: 'bulk-pool.handoff-completed',
        payload: {
          tripAssignmentId: trip.id,
          stopId: stop.id,
          stopLabel: stop.label,
          progressFraction: 0.28 + 0.62 * (stopIndex + 1) / Math.max(1, trip.stops.length),
        },
      }));
      rows.push({
        kind: 'bulk-pool.trip-completed',
        payload: {
          tripAssignmentId: trip.id,
          progressFraction: 1,
          incrementalDetourKm: trip.incrementalDetourKm,
        },
      });
    });
    rows.push({
      kind: 'bulk-pool.settled',
      payload: {
        householdCostUsd: result.metrics.householdCostUsd,
        savingsUsd: result.metrics.householdSavingsUsd,
        fulfilledUnits: result.metrics.fulfilledUnits,
        wasteUnits: result.metrics.wasteUnits,
      },
    });
    return rows.map((row, sequence) => deepFreeze({
      id: `${identity}:event-${sequence}`,
      sequence,
      simulationTimeMs: sequence * HOUR_MS,
      kind: row.kind,
      causationIds: sequence ? [`${identity}:event-${sequence - 1}`] : [],
      payload: row.payload,
    }));
  }

  function createSnapshots(identity, result, events) {
    const groupsById = new Map(result.poolGroups.map((row) => [row.id, row]));
    const tripsById = new Map(result.tripAssignments.map((row) => [row.id, row]));
    const visibleGroups = new Set();
    const visibleTrips = new Set();
    const completedTrips = new Set();
    const completedStops = new Set();
    const rejectedRequests = new Set();
    const metrics = emptyMetrics();
    return events.map((event, index) => {
      const activity = applyEvent({
        event,
        result,
        groupsById,
        tripsById,
        visibleGroups,
        visibleTrips,
        completedTrips,
        completedStops,
        rejectedRequests,
        metrics,
      });
      return deepFreeze({
        id: `${identity}:step-${index}`,
        simulationTimeMs: event.simulationTimeMs,
        status: statusForEvent(event.kind),
        narrative: narrativeForEvent(event, groupsById, tripsById),
        eventIds: events.slice(0, index + 1).map((row) => row.id),
        visiblePoolGroupIds: [...visibleGroups],
        visibleTripAssignmentIds: [...visibleTrips],
        completedTripAssignmentIds: [...completedTrips],
        activeTripAssignmentId: activity.activeTripAssignmentId,
        activeTripProgress: activity.activeTripProgress,
        completedStopIds: [...completedStops],
        visibleRejectedRequestIds: [...rejectedRequests],
        metrics: roundedMetrics(metrics),
      });
    });
  }

  function applyEvent(context) {
    const { event, result, groupsById, tripsById, metrics } = context;
    const payload = event.payload || {};
    let activeTripAssignmentId = null;
    let activeTripProgress = null;
    if (event.kind === 'bulk-pool.demand-registered') metrics.requestedUnits = result.metrics.requestedUnits;
    if (event.kind === 'bulk-pool.package-formed') {
      const group = groupsById.get(payload.poolGroupId);
      context.visibleGroups.add(payload.poolGroupId);
      metrics.fulfilledUnits += group.allocatedUnits;
      metrics.packagesPurchased += group.packages;
      metrics.wasteUnits += group.wasteUnits;
      metrics.householdCostUsd += group.purchaseCostUsd;
    }
    if (event.kind === 'bulk-pool.request-rejected') context.rejectedRequests.add(payload.requestId);
    if (payload.tripAssignmentId) {
      activeTripAssignmentId = payload.tripAssignmentId;
      activeTripProgress = payload.progressFraction;
      context.visibleTrips.add(payload.tripAssignmentId);
    }
    if (event.kind === 'bulk-pool.handoff-completed') {
      context.completedStops.add(`${payload.tripAssignmentId}:${payload.stopId}`);
    }
    if (event.kind === 'bulk-pool.trip-completed') context.completedTrips.add(payload.tripAssignmentId);
    if (event.kind === 'bulk-pool.settled') {
      activeTripAssignmentId = null;
      activeTripProgress = null;
      Object.assign(metrics, {
        householdCostUsd: result.metrics.householdCostUsd,
        householdSavingsUsd: result.metrics.householdSavingsUsd,
        incrementalVehicleKm: result.metrics.incrementalVehicleKm,
      });
    } else {
      metrics.incrementalVehicleKm = [...context.completedTrips].reduce(
        (total, tripId) => total + tripsById.get(tripId).incrementalDetourKm,
        0
      );
      if (activeTripAssignmentId && !context.completedTrips.has(activeTripAssignmentId)) {
        metrics.incrementalVehicleKm += tripsById.get(activeTripAssignmentId).incrementalDetourKm
          * Math.max(0, Math.min(1, activeTripProgress));
      }
    }
    return { activeTripAssignmentId, activeTripProgress };
  }

  function statusForEvent(kind) {
    return ({
      'bulk-pool.demand-registered': 'demand-registered',
      'bulk-pool.package-formed': 'packages-forming',
      'bulk-pool.request-rejected': 'constraints-evaluated',
      'bulk-pool.trip-dispatched': 'trip-dispatched',
      'bulk-pool.vehicle-arrived-warehouse': 'warehouse-pickup',
      'bulk-pool.packages-loaded': 'packages-loaded',
      'bulk-pool.handoff-completed': 'handoff',
      'bulk-pool.trip-completed': 'trip-completed',
      'bulk-pool.settled': 'settled',
    })[kind] || 'running';
  }

  function narrativeForEvent(event, groupsById, tripsById) {
    const payload = event.payload || {};
    if (event.kind === 'bulk-pool.demand-registered') {
      return `${payload.householdCount} synthetic households requested ${payload.requestedUnits} share units.`;
    }
    if (event.kind === 'bulk-pool.package-formed') {
      const group = groupsById.get(payload.poolGroupId);
      return `${group.item.name}: ${group.packages} whole package${group.packages === 1 ? '' : 's'} cover ${group.allocatedUnits} requested units with ${group.wasteUnits} unallocated.`;
    }
    if (event.kind === 'bulk-pool.request-rejected') {
      return `A modeled request remains unserved because ${payload.reason.replaceAll('-', ' ')}.`;
    }
    if (event.kind === 'bulk-pool.trip-dispatched') {
      return `${payload.driverPseudonym} begins a volunteered warehouse trip carrying ${payload.poolGroupIds.length} pooled group${payload.poolGroupIds.length === 1 ? '' : 's'}.`;
    }
    if (event.kind === 'bulk-pool.vehicle-arrived-warehouse') {
      return `${tripsById.get(payload.tripAssignmentId).driverPseudonym} arrives at the selected warehouse.`;
    }
    if (event.kind === 'bulk-pool.packages-loaded') {
      return `${payload.cargoMassKg} kg of modeled pooled cargo is loaded; ${payload.coldVolumeL} L requires cold capacity.`;
    }
    if (event.kind === 'bulk-pool.handoff-completed') return `${payload.stopLabel} receives its pooled package handoff.`;
    if (event.kind === 'bulk-pool.trip-completed') {
      return `${tripsById.get(payload.tripAssignmentId).driverPseudonym} completes the route with ${payload.incrementalDetourKm} km modeled detour.`;
    }
    return `The pool settles at $${payload.householdCostUsd} modeled household cost and $${payload.savingsUsd} modeled savings.`;
  }

  function emptyMetrics() {
    return {
      requestedUnits: 0,
      fulfilledUnits: 0,
      packagesPurchased: 0,
      wasteUnits: 0,
      householdCostUsd: 0,
      householdSavingsUsd: 0,
      incrementalVehicleKm: 0,
    };
  }

  function roundedMetrics(metrics) {
    return {
      requestedUnits: metrics.requestedUnits,
      fulfilledUnits: round(metrics.fulfilledUnits, 3),
      packagesPurchased: metrics.packagesPurchased,
      wasteUnits: round(metrics.wasteUnits, 3),
      householdCostUsd: round(metrics.householdCostUsd, 2),
      householdSavingsUsd: round(metrics.householdSavingsUsd, 2),
      incrementalVehicleKm: round(metrics.incrementalVehicleKm, 3),
    };
  }

  function round(value, digits) {
    const scale = 10 ** digits;
    return Math.round((Number(value) + Number.EPSILON) * scale) / scale;
  }

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
  }

  return Object.freeze({ createEvents, createSnapshots });
});
