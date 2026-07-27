(function attachNeighborhoodBulkPoolSolver(root, factory) {
  const catalogApi = typeof module === 'object' && module.exports
    ? require('./catalog-index.js')
    : root.SimulatteNeighborhoodBulkCatalogIndex;
  const timelineApi = typeof module === 'object' && module.exports
    ? require('./pool-timeline.js')
    : root.SimulatteNeighborhoodBulkPoolTimeline;
  const api = factory(catalogApi, timelineApi);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteNeighborhoodBulkPoolSolver = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createNeighborhoodBulkPoolSolver(catalogApi, timelineApi) {
  const POLICY_IDS = Object.freeze(['independent', 'bulk-only', 'existing-trip', 'neighborhood-hub']);
  const ROUTED_POLICIES = new Set(['existing-trip', 'neighborhood-hub']);

  function runScenario({ datasets, config, scenario }) {
    requireDependencies();
    validateInputs(datasets, scenario);
    const catalog = catalogApi.createCatalogIndex(datasets.catalog);
    const scenarioRow = datasets.demand.scenarios.find((row) => row.id === scenario.scenarioId);
    const requestIds = new Set(scenarioRow.requestIds);
    const tripIds = new Set(scenarioRow.tripIds);
    const participantsById = new Map(datasets.demand.participants.map((row) => [row.id, row]));
    const neighborhoodsById = new Map(datasets.routes.neighborhoods.map((row) => [row.id, row]));
    const warehousesById = new Map(datasets.warehouses.warehouses.map((row) => [row.id, row]));
    const corridorsById = new Map(datasets.routes.corridors.map((row) => [row.id, row]));
    const requests = datasets.demand.requests
      .filter((row) => requestIds.has(row.id))
      .filter((row) => scenario.selectedCategoryIds.includes(catalog.requireItem(row.itemId).categoryId))
      .map((row) => Object.freeze({
        ...row,
        participant: participantsById.get(row.participantId),
        neighborhood: neighborhoodsById.get(participantsById.get(row.participantId)?.neighborhoodId),
        item: catalog.requireItem(row.itemId),
      }));
    const trips = datasets.demand.trips
      .filter((row) => tripIds.has(row.id))
      .filter((row) => scenario.selectedWarehouseIds.includes(row.warehouseId))
      .filter((row) => scenario.compensationModes.includes(row.compensation.mode))
      .map((row) => Object.freeze({
        ...row,
        corridor: corridorsById.get(row.corridorId),
      }));
    const context = Object.freeze({
      catalog,
      config,
      datasets,
      neighborhoodsById,
      participantsById,
      requests,
      scenario,
      trips,
      warehousesById,
    });
    const policyResults = Object.fromEntries(POLICY_IDS.map((policyId) => [
      policyId,
      solvePolicy(context, policyId),
    ]));
    const active = policyResults[scenario.poolingPolicyId];
    const configurationIdentity = Object.freeze({
      scenarioId: scenario.scenarioId,
      seed: scenario.seed,
      poolingPolicyId: scenario.poolingPolicyId,
      selectedWarehouseIds: Object.freeze([...scenario.selectedWarehouseIds]),
      selectedCategoryIds: Object.freeze([...scenario.selectedCategoryIds]),
      compensationModes: Object.freeze([...scenario.compensationModes]),
      maximumDetourKm: scenario.maximumDetourKm,
      maximumStops: scenario.maximumStops,
      minimumSavingsUsd: scenario.minimumSavingsUsd,
      freshnessLimitMinutes: scenario.freshnessLimitMinutes,
      allowUnknownAvailability: scenario.allowUnknownAvailability,
    });
    const scenarioIdentity = `neighborhood-bulk:${hashIdentity(configurationIdentity)}`;
    const events = timelineApi.createEvents(scenarioIdentity, active);
    const snapshots = timelineApi.createSnapshots(scenarioIdentity, active, events);
    return deepFreeze({
      schema: 'simulatte.neighborhoodBulkSimulation.v1',
      id: scenarioIdentity,
      scenarioId: scenario.scenarioId,
      seed: scenario.seed,
      scenarioIdentity,
      configurationIdentity,
      policyResults,
      activePolicyId: scenario.poolingPolicyId,
      metrics: active.metrics,
      poolGroups: active.poolGroups,
      tripAssignments: active.tripAssignments,
      settlements: active.settlements,
      unsupported: active.unsupported,
      conservation: active.conservation,
      events,
      snapshots,
      catalogReceipt: {
        datasetId: datasets.catalog.id,
        indexedRows: catalog.itemCount,
        indexedOffers: catalog.offerCount,
        coverageStatus: catalog.coverage.status,
        declaredComplete: catalog.coverage.declaredComplete,
        maximumSupportedRows: catalog.coverage.maximumSupportedRows,
      },
      claimBoundary: [
        datasets.warehouses.claimBoundary,
        datasets.catalog.claimBoundary,
        datasets.demand.claimBoundary,
        datasets.routes.claimBoundary,
      ].join(' '),
    });
  }

  function solvePolicy(context, policyId) {
    const grouping = groupRequests(context, policyId);
    const driverStates = new Map();
    const acceptedGroups = [];
    const rejected = [...grouping.rejected];
    grouping.groups
      .sort((left, right) => left.id.localeCompare(right.id))
      .forEach((group) => {
        const prepared = prepareGroup(group, context, policyId);
        if (prepared.rejection) {
          rejected.push(...prepared.allocations.map((row) => rejection(row, prepared.rejection)));
          return;
        }
        if (!ROUTED_POLICIES.has(policyId)) {
          acceptedGroups.push(prepared);
          return;
        }
        const accepted = admitRoutedGroup(prepared, context, driverStates);
        if (!accepted.ok) {
          rejected.push(...prepared.allocations.map((row) => rejection(row, accepted.reason)));
          return;
        }
        acceptedGroups.push(prepared);
      });
    const tripAssignments = finalizeTripAssignments(driverStates, context);
    const settlements = settleParticipants(context, acceptedGroups, rejected, tripAssignments);
    const metrics = calculateMetrics(context, policyId, acceptedGroups, rejected, tripAssignments, settlements);
    const requestedUnits = sum(context.requests, (row) => row.quantity);
    const fulfilledUnits = sum(acceptedGroups, (row) => row.allocatedUnits);
    const purchasedUnits = sum(acceptedGroups, (row) => row.purchasedUnits);
    const unservedUnits = sum(rejected, (row) => row.quantity);
    const wasteUnits = sum(acceptedGroups, (row) => row.wasteUnits);
    const conservation = Object.freeze({
      requestedUnits,
      fulfilledUnits,
      unservedUnits,
      purchasedUnits,
      wasteUnits,
      demandConserved: nearlyEqual(requestedUnits, fulfilledUnits + unservedUnits),
      packageConserved: nearlyEqual(purchasedUnits, fulfilledUnits + wasteUnits),
      capacityConserved: tripAssignments.every((row) => row.capacity.isValid),
      refrigerationViolations: tripAssignments.filter((row) => !row.freshness.isValid).length,
    });
    if (!conservation.demandConserved || !conservation.packageConserved || !conservation.capacityConserved) {
      throw solverError('bulk_pool_conservation_failed', `Policy ${policyId} failed conservation`, conservation);
    }
    return deepFreeze({
      policyId,
      poolGroups: acceptedGroups,
      rejectedRequests: rejected,
      tripAssignments,
      settlements,
      metrics,
      conservation,
      unsupported: unsupportedRows(context, acceptedGroups, rejected),
    });
  }

  function groupRequests(context, policyId) {
    const groups = new Map();
    const rejected = [];
    context.requests.forEach((request) => {
      const assignment = chooseAssignment(context, policyId, request);
      if (!assignment) {
        rejected.push(rejection(request, 'no-eligible-warehouse-or-trip'));
        return;
      }
      const key = policyId === 'independent'
        ? `${request.itemId}:${request.id}`
        : ROUTED_POLICIES.has(policyId)
          ? `${request.itemId}:${assignment.warehouseId}:${assignment.trip.id}`
          : `${request.itemId}:${assignment.warehouseId}`;
      const group = groups.get(key) || {
        id: `pool:${policyId}:${key}`,
        item: request.item,
        offer: assignment.offer,
        warehouseId: assignment.warehouseId,
        trip: assignment.trip || null,
        allocations: [],
      };
      group.allocations.push(Object.freeze({
        requestId: request.id,
        participantId: request.participantId,
        pseudonym: request.participant.pseudonym,
        neighborhoodId: request.neighborhood.id,
        neighborhoodCoordinates: request.neighborhood.coordinates,
        itemId: request.itemId,
        quantity: request.quantity,
        maximumUnitPriceUsd: request.maximumUnitPriceUsd,
        stop: assignment.stop,
        detourKm: assignment.detourKm,
        walkingKm: assignment.walkingKm,
      }));
      groups.set(key, group);
    });
    return Object.freeze({ groups: [...groups.values()], rejected });
  }

  function chooseAssignment(context, policyId, request) {
    const offers = context.catalog.eligibleOffersFor(request.itemId, {
      warehouseIds: context.scenario.selectedWarehouseIds,
      allowUnknownAvailability: context.scenario.allowUnknownAvailability,
    });
    if (!offers.length) return null;
    if (!ROUTED_POLICIES.has(policyId)) {
      return offers.map((offer) => {
        const warehouse = context.warehousesById.get(offer.warehouseId);
        return {
          offer,
          warehouseId: offer.warehouseId,
          trip: null,
          stop: pointStop(request),
          detourKm: distanceKm(request.neighborhood.coordinates, warehouse.coordinates),
          walkingKm: 0,
          score: offer.priceUsd + distanceKm(request.neighborhood.coordinates, warehouse.coordinates) * 0.45,
        };
      }).sort(byScore)[0];
    }
    const candidates = [];
    context.trips.forEach((trip) => {
      const offer = offers.find((row) => row.warehouseId === trip.warehouseId);
      if (!offer || !trip.corridor) return;
      const stop = policyId === 'neighborhood-hub'
        ? nearestHub(request.neighborhood.coordinates, context.datasets.routes.hubs, context.config.constraints.maximumWalkingKm)
        : pointStop(request);
      if (!stop) return;
      const oneWayDetourKm = distanceToPolylineKm(stop.coordinates, trip.corridor.coordinates);
      const detourKm = oneWayDetourKm * 2;
      if (detourKm > Math.min(context.scenario.maximumDetourKm, trip.maximumDetourKm)) return;
      if (request.item.handling.temperatureZone !== 'ambient' && trip.coldCapacityL <= 0) return;
      candidates.push({
        offer,
        warehouseId: trip.warehouseId,
        trip,
        stop,
        detourKm,
        walkingKm: policyId === 'neighborhood-hub'
          ? distanceKm(request.neighborhood.coordinates, stop.coordinates)
          : 0,
        score: offer.priceUsd / request.item.package.innerUnits
          + detourKm * 0.6
          + trip.compensation.amountUsd * 0.025,
      });
    });
    return candidates.sort(byScore)[0] || null;
  }

  function prepareGroup(group, context, policyId) {
    const allocatedUnits = sum(group.allocations, (row) => row.quantity);
    const packages = Math.ceil(allocatedUnits / group.item.package.innerUnits);
    const purchasedUnits = packages * group.item.package.innerUnits;
    const purchaseCostUsd = round(packages * group.offer.priceUsd, 2);
    const unitCostUsd = purchaseCostUsd / allocatedUnits;
    const independentEquivalentCostUsd = round(sum(group.allocations, (row) => (
      Math.ceil(row.quantity / group.item.package.innerUnits) * group.offer.priceUsd
    )), 2);
    const savingsUsd = round(independentEquivalentCostUsd - purchaseCostUsd, 2);
    let rejectionReason = null;
    if (group.allocations.some((row) => unitCostUsd > row.maximumUnitPriceUsd)) {
      rejectionReason = 'maximum-unit-price-exceeded';
    } else if (policyId !== 'independent' && savingsUsd < context.scenario.minimumSavingsUsd) {
      rejectionReason = 'minimum-savings-not-met';
    }
    return deepFreeze({
      ...group,
      packages,
      allocatedUnits,
      purchasedUnits,
      wasteUnits: purchasedUnits - allocatedUnits,
      purchaseCostUsd,
      independentEquivalentCostUsd,
      savingsBeforeCompensationUsd: savingsUsd,
      packageUtilizationRatio: allocatedUnits / purchasedUnits,
      cargo: {
        massKg: packages * group.item.package.massKg,
        volumeL: packages * group.item.package.volumeL,
        coldVolumeL: group.item.handling.temperatureZone === 'ambient'
          ? 0
          : packages * group.item.package.volumeL,
      },
      estimatedTransitMinutes: group.trip
        ? 20 + sumUniqueStops(group.allocations, 'detourKm') * 5 + uniqueStopIds(group.allocations).length * 7
        : 0,
      availabilityAssumption: group.offer.availability,
      rejection: rejectionReason,
    });
  }

  function admitRoutedGroup(group, context, driverStates) {
    const trip = group.trip;
    const state = driverStates.get(trip.id) || createDriverState(trip);
    const nextStops = new Map(state.stops);
    group.allocations.forEach((row) => {
      if (!nextStops.has(row.stop.id)) nextStops.set(row.stop.id, row.stop);
    });
    const addedDetourKm = group.allocations.reduce((total, row) => (
      state.stops.has(row.stop.id) || [...group.allocations]
        .slice(0, group.allocations.indexOf(row))
        .some((previous) => previous.stop.id === row.stop.id)
        ? total
        : total + row.detourKm
    ), 0);
    const next = {
      massKg: state.massKg + group.cargo.massKg,
      volumeL: state.volumeL + group.cargo.volumeL,
      coldVolumeL: state.coldVolumeL + group.cargo.coldVolumeL,
      detourKm: state.detourKm + addedDetourKm,
      stopCount: nextStops.size,
    };
    const maximumStops = Math.min(context.scenario.maximumStops, trip.maximumStops);
    const maximumDetourKm = Math.min(context.scenario.maximumDetourKm, trip.maximumDetourKm);
    if (next.stopCount > maximumStops) return { ok: false, reason: 'maximum-stops-exceeded' };
    if (next.detourKm > maximumDetourKm) return { ok: false, reason: 'maximum-detour-exceeded' };
    if (next.massKg > trip.capacityKg || next.volumeL > trip.capacityL) {
      return { ok: false, reason: 'vehicle-capacity-exceeded' };
    }
    if (next.coldVolumeL > trip.coldCapacityL) return { ok: false, reason: 'cold-capacity-exceeded' };
    const transitMinutes = 20 + next.detourKm * 5 + next.stopCount * 7;
    const productLimit = group.item.handling.maximumTransitMinutes;
    const freshnessLimit = Math.min(context.scenario.freshnessLimitMinutes, productLimit);
    if (group.item.handling.temperatureZone !== 'ambient' && transitMinutes > freshnessLimit) {
      return { ok: false, reason: 'freshness-window-exceeded' };
    }
    Object.assign(state, next, {
      stops: nextStops,
      maximumTransitMinutes: Math.max(state.maximumTransitMinutes, transitMinutes),
    });
    state.groups.push(group);
    group.allocations.forEach((row) => state.allocations.push(row));
    driverStates.set(trip.id, state);
    return { ok: true };
  }

  function createDriverState(trip) {
    return {
      trip,
      groups: [],
      allocations: [],
      stops: new Map(),
      massKg: 0,
      volumeL: 0,
      coldVolumeL: 0,
      detourKm: 0,
      stopCount: 0,
      maximumTransitMinutes: 0,
    };
  }

  function finalizeTripAssignments(driverStates, context) {
    return [...driverStates.values()].map((state) => {
      const trip = state.trip;
      const compensationUsd = trip.compensation.amountUsd;
      const capacity = {
        massKg: round(state.massKg, 3),
        maximumMassKg: trip.capacityKg,
        volumeL: round(state.volumeL, 3),
        maximumVolumeL: trip.capacityL,
        coldVolumeL: round(state.coldVolumeL, 3),
        maximumColdVolumeL: trip.coldCapacityL,
        stopCount: state.stopCount,
        maximumStops: Math.min(context.scenario.maximumStops, trip.maximumStops),
        isValid: state.massKg <= trip.capacityKg
          && state.volumeL <= trip.capacityL
          && state.coldVolumeL <= trip.coldCapacityL
          && state.stopCount <= Math.min(context.scenario.maximumStops, trip.maximumStops),
      };
      return deepFreeze({
        id: `assignment:${trip.id}`,
        tripId: trip.id,
        driverPseudonym: trip.driverPseudonym,
        warehouseId: trip.warehouseId,
        corridorId: trip.corridorId,
        corridorCoordinates: trip.corridor.coordinates,
        poolGroupIds: state.groups.map((row) => row.id),
        participantIds: unique(state.allocations.map((row) => row.participantId)),
        stops: [...state.stops.values()],
        incrementalDetourKm: round(state.detourKm, 3),
        estimatedBurdenMinutes: round(state.detourKm * 5 + state.stopCount * 7, 2),
        compensation: { ...trip.compensation, settledUsd: compensationUsd },
        capacity,
        freshness: {
          maximumTransitMinutes: round(state.maximumTransitMinutes, 2),
          configuredLimitMinutes: context.scenario.freshnessLimitMinutes,
          isValid: true,
        },
        reputation: reputationFor(trip.compensation.mode, state.stopCount),
      });
    }).sort((left, right) => left.tripId.localeCompare(right.tripId));
  }

  function settleParticipants(context, groups, rejected, tripAssignments) {
    const settlements = new Map(context.requests.map((request) => [request.participantId, {
      participantId: request.participantId,
      pseudonym: request.participant.pseudonym,
      requestedUnits: 0,
      fulfilledUnits: 0,
      unservedUnits: 0,
      itemCostUsd: 0,
      driverCompensationUsd: 0,
      independentEquivalentCostUsd: 0,
      allocations: [],
    }]));
    context.requests.forEach((request) => {
      settlements.get(request.participantId).requestedUnits += request.quantity;
    });
    groups.forEach((group) => {
      group.allocations.forEach((allocation) => {
        const row = settlements.get(allocation.participantId);
        const cost = group.purchaseCostUsd * allocation.quantity / group.allocatedUnits;
        const baseline = group.independentEquivalentCostUsd * allocation.quantity / group.allocatedUnits;
        row.fulfilledUnits += allocation.quantity;
        row.itemCostUsd += cost;
        row.independentEquivalentCostUsd += baseline;
        row.allocations.push({
          requestId: allocation.requestId,
          itemId: allocation.itemId,
          quantity: allocation.quantity,
          costUsd: round(cost, 2),
          poolGroupId: group.id,
        });
      });
    });
    rejected.forEach((entry) => {
      const row = settlements.get(entry.participantId);
      if (row) row.unservedUnits += entry.quantity;
    });
    tripAssignments.forEach((assignment) => {
      const participants = assignment.participantIds;
      const share = participants.length ? assignment.compensation.settledUsd / participants.length : 0;
      participants.forEach((participantId) => {
        settlements.get(participantId).driverCompensationUsd += share;
      });
    });
    return [...settlements.values()].map((row) => {
      const totalCostUsd = row.itemCostUsd + row.driverCompensationUsd;
      return deepFreeze({
        ...row,
        itemCostUsd: round(row.itemCostUsd, 2),
        driverCompensationUsd: round(row.driverCompensationUsd, 2),
        totalCostUsd: round(totalCostUsd, 2),
        independentEquivalentCostUsd: round(row.independentEquivalentCostUsd, 2),
        savingsUsd: round(row.independentEquivalentCostUsd - totalCostUsd, 2),
        fulfillmentRatio: row.requestedUnits ? row.fulfilledUnits / row.requestedUnits : 1,
      });
    }).sort((left, right) => left.participantId.localeCompare(right.participantId));
  }

  function calculateMetrics(context, policyId, groups, rejected, trips, settlements) {
    const requestedUnits = sum(context.requests, (row) => row.quantity);
    const fulfilledUnits = sum(groups, (row) => row.allocatedUnits);
    const packageUnits = sum(groups, (row) => row.purchasedUnits);
    const packageCostUsd = sum(groups, (row) => row.purchaseCostUsd);
    const driverCompensationUsd = sum(trips, (row) => row.compensation.settledUsd);
    const vehicleKm = ROUTED_POLICIES.has(policyId)
      ? sum(trips, (row) => row.incrementalDetourKm)
      : shoppingTripDistance(context, groups);
    const walkingKm = sum(groups.flatMap((row) => row.allocations), (row) => row.walkingKm || 0);
    const ratios = settlements.map((row) => row.fulfillmentRatio);
    const freshness = trips.map((row) => row.freshness.maximumTransitMinutes).filter((row) => row > 0);
    return deepFreeze({
      requestedUnits,
      fulfilledUnits,
      unservedUnits: requestedUnits - fulfilledUnits,
      fulfillmentPercent: requestedUnits ? round(fulfilledUnits / requestedUnits * 100, 2) : 100,
      packagesPurchased: sum(groups, (row) => row.packages),
      packageUtilizationPercent: packageUnits ? round(fulfilledUnits / packageUnits * 100, 2) : 0,
      wasteUnits: packageUnits - fulfilledUnits,
      householdCostUsd: round(packageCostUsd + driverCompensationUsd, 2),
      independentEquivalentCostUsd: round(sum(settlements, (row) => row.independentEquivalentCostUsd), 2),
      householdSavingsUsd: round(sum(settlements, (row) => row.savingsUsd), 2),
      driverCompensationUsd: round(driverCompensationUsd, 2),
      incrementalVehicleKm: round(vehicleKm, 3),
      walkingKm: round(walkingKm, 3),
      emissionsKgCo2e: round(vehicleKm * context.config.emissions.kgCo2ePerVehicleKm, 3),
      servedHouseholds: settlements.filter((row) => row.fulfilledUnits > 0).length,
      totalHouseholds: settlements.length,
      serviceFairness: round(jainIndex(ratios), 4),
      averageFreshnessMinutes: freshness.length ? round(sum(freshness) / freshness.length, 2) : 0,
      refrigerationViolations: trips.filter((row) => !row.freshness.isValid).length,
      activeTrips: trips.length,
      unsupportedRequestCount: rejected.length,
      unknownAvailabilityPoolCount: groups.filter((row) => row.availabilityAssumption === 'unknown').length,
    });
  }

  function shoppingTripDistance(context, groups) {
    const seen = new Set();
    let total = 0;
    groups.forEach((group) => group.allocations.forEach((allocation) => {
      const key = `${allocation.participantId}:${group.warehouseId}`;
      if (seen.has(key)) return;
      seen.add(key);
      const warehouse = context.warehousesById.get(group.warehouseId);
      total += distanceKm(allocation.neighborhoodCoordinates, warehouse.coordinates) * 2;
    }));
    return total;
  }

  function unsupportedRows(context, groups, rejected) {
    const rows = [];
    if (!context.datasets.catalog.coverage.declaredComplete) {
      rows.push({
        id: 'catalog-incomplete',
        kind: 'catalog-coverage',
        reason: `Catalog coverage is ${context.datasets.catalog.coverage.status}`,
      });
    }
    groups.filter((row) => row.availabilityAssumption === 'unknown').forEach((group) => {
      rows.push({
        id: `unknown-availability:${group.id}`,
        kind: 'inventory-availability',
        reason: `${group.item.name} availability was unknown and admitted only by explicit scenario control`,
      });
    });
    unique(rejected.map((row) => row.reason)).forEach((reason) => {
      rows.push({ id: `unserved:${reason}`, kind: 'unserved-demand', reason });
    });
    return rows;
  }

  function nearestHub(coordinates, hubs, maximumWalkingKm) {
    return hubs.map((hub) => ({
      id: hub.id,
      label: hub.label,
      coordinates: hub.coordinates,
      kind: 'pickup-hub',
      distanceKm: distanceKm(coordinates, hub.coordinates),
      walkingRadiusKm: hub.walkingRadiusKm,
    })).filter((hub) => hub.distanceKm <= Math.min(hub.walkingRadiusKm, maximumWalkingKm))
      .sort((left, right) => left.distanceKm - right.distanceKm || left.id.localeCompare(right.id))[0] || null;
  }

  function pointStop(request) {
    return {
      id: `neighborhood:${request.neighborhood.id}`,
      label: `${request.neighborhood.label} handoff`,
      coordinates: request.neighborhood.coordinates,
      kind: 'neighborhood-centroid',
    };
  }

  function rejection(request, reason) {
    return deepFreeze({
      requestId: request.requestId || request.id,
      participantId: request.participantId,
      itemId: request.itemId,
      quantity: request.quantity,
      neighborhoodId: request.neighborhoodId || request.neighborhood?.id,
      reason,
    });
  }

  function reputationFor(mode, stopCount) {
    return {
      reliability: stopCount,
      generosity: mode === 'pro-bono' ? stopCount : 0,
      costStewardship: mode === 'exact-expenses' ? stopCount : 0,
      paidService: mode === 'fee' ? stopCount : 0,
    };
  }

  function validateInputs(datasets, scenario) {
    if (!datasets?.warehouses?.warehouses || !datasets?.routes?.corridors
      || !datasets?.demand?.scenarios || !datasets?.catalog?.items) {
      throw solverError('bulk_pool_datasets_invalid', 'Neighborhood Bulk Pool datasets are incomplete');
    }
    if (!scenario || !datasets.demand.scenarios.some((row) => row.id === scenario.scenarioId)
      || !POLICY_IDS.includes(scenario.poolingPolicyId)) {
      throw solverError('bulk_pool_scenario_invalid', 'Neighborhood Bulk Pool scenario is invalid');
    }
  }

  function requireDependencies() {
    if (!catalogApi?.createCatalogIndex) {
      throw solverError('bulk_pool_catalog_dependency_missing', 'Catalog index dependency is unavailable');
    }
  }

  function byScore(left, right) {
    return left.score - right.score
      || left.warehouseId.localeCompare(right.warehouseId)
      || (left.trip?.id || '').localeCompare(right.trip?.id || '');
  }

  function uniqueStopIds(allocations) {
    return unique(allocations.map((row) => row.stop.id));
  }

  function sumUniqueStops(allocations, field) {
    const seen = new Set();
    return allocations.reduce((total, row) => {
      if (seen.has(row.stop.id)) return total;
      seen.add(row.stop.id);
      return total + Number(row[field] || 0);
    }, 0);
  }

  function distanceToPolylineKm(point, coordinates) {
    if (coordinates.length < 2) return Infinity;
    let minimum = Infinity;
    for (let index = 1; index < coordinates.length; index += 1) {
      minimum = Math.min(minimum, pointSegmentDistanceKm(point, coordinates[index - 1], coordinates[index]));
    }
    return minimum;
  }

  function pointSegmentDistanceKm(point, start, end) {
    const latitude = (point[1] + start[1] + end[1]) / 3 * Math.PI / 180;
    const scaleX = 111.32 * Math.cos(latitude);
    const scaleY = 110.57;
    const px = point[0] * scaleX;
    const py = point[1] * scaleY;
    const ax = start[0] * scaleX;
    const ay = start[1] * scaleY;
    const bx = end[0] * scaleX;
    const by = end[1] * scaleY;
    const dx = bx - ax;
    const dy = by - ay;
    const denominator = dx * dx + dy * dy;
    const t = denominator ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / denominator)) : 0;
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  }

  function distanceKm(left, right) {
    const latitude = (left[1] + right[1]) / 2 * Math.PI / 180;
    return Math.hypot(
      (left[0] - right[0]) * 111.32 * Math.cos(latitude),
      (left[1] - right[1]) * 110.57
    );
  }

  function jainIndex(values) {
    if (!values.length) return 1;
    const total = sum(values);
    const squares = sum(values, (value) => value * value);
    return squares ? total * total / (values.length * squares) : 1;
  }

  function hashIdentity(value) {
    const text = canonical(value);
    let hash = 2166136261;
    for (const character of text) {
      hash ^= character.codePointAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  }

  function canonical(value) {
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
    if (value && typeof value === 'object') {
      return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
  }

  function sum(rows, selector = (value) => value) {
    return rows.reduce((total, row) => total + Number(selector(row) || 0), 0);
  }

  function unique(values) {
    return [...new Set(values)].sort();
  }

  function round(value, digits = 4) {
    const scale = 10 ** digits;
    return Math.round((Number(value) + Number.EPSILON) * scale) / scale;
  }

  function nearlyEqual(left, right) {
    return Math.abs(left - right) <= 1e-9;
  }

  function deepFreeze(value, seen = new Set()) {
    if (!value || typeof value !== 'object' || seen.has(value) || Object.isFrozen(value)) return value;
    seen.add(value);
    Object.values(value).forEach((row) => deepFreeze(row, seen));
    return Object.freeze(value);
  }

  function solverError(code, message, evidence = null) {
    const error = new Error(`${code}: ${message}`);
    error.name = 'SimulatteNeighborhoodBulkSolverError';
    error.code = code;
    error.evidence = evidence;
    return error;
  }

  return Object.freeze({
    POLICY_IDS,
    distanceKm,
    distanceToPolylineKm,
    runScenario,
  });
});
