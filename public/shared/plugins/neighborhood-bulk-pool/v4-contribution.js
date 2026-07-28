(function attachNeighborhoodBulkV4(root, factory) {
  const builder = typeof module === 'object' && module.exports
    ? require('../../core/simulation/plugin-v4-builder.js')
    : root.SimulattePluginV4Builder;
  const api = factory(builder);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteNeighborhoodBulkV4 = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createNeighborhoodBulkV4(builder) {
  const PLUGIN_ID = 'neighborhood-bulk-pool';
  const MODEL_HASHES = Object.freeze({
    catalogIndex: 'ea332cf023c9ede5cb17e3736927ce35e9c2ad98eb61cc4c7891a1edc749b050',
    poolSolver: 'c420f87e38de174243e8cacf3f495ac04496528bc0df2a28b2664666155694c3',
    routeScreen: 'c420f87e38de174243e8cacf3f495ac04496528bc0df2a28b2664666155694c3',
    settlement: 'c420f87e38de174243e8cacf3f495ac04496528bc0df2a28b2664666155694c3',
  });

  function createContribution({ datasets, dataReceipts, config, result, snapshot }) {
    requireBuilder();
    const records = dataReceipts.map((receipt) => builder.datasetRecord(
      receipt.datasetId,
      receipt,
      metadataFor(receipt.datasetId, datasets)
    ));
    const recordById = new Map(records.map((row) => [row.id, row]));
    const modelRecords = [
      modelRecord('catalog-index', MODEL_HASHES.catalogIndex, records, 'bounded inverted index', result),
      modelRecord('pool-solver', MODEL_HASHES.poolSolver, records, 'joint package and trip assignment', result),
      modelRecord('route-screen', MODEL_HASHES.routeScreen, records, 'capacity and freshness route screen', result),
      modelRecord('settlement', MODEL_HASHES.settlement, records, 'exact pro-rata cost settlement', result),
    ];
    const warehouseProvenance = provenance('derived', 'snapshot', {
      kind: 'missing',
      value: { reason: 'Addresses are observed; coordinates are derived display anchors.' },
    }, [recordById.get('neighborhood-bulk-warehouse-registry-v1')]);
    const scenarioProvenance = provenance('scenario', 'forecast', {
      kind: 'distribution',
      value: { interpretation: 'Authored pseudonymous demand and trip scenario only.' },
    }, [
      recordById.get('neighborhood-bulk-catalog-snapshot-bootstrap-v1'),
      recordById.get('neighborhood-bulk-demand-and-trips-scenario-v1'),
    ]);
    const modeledProvenance = provenance('modeled', 'forecast', {
      kind: 'missing',
      value: { reason: 'Route corridors and solver outputs are not calibrated to live travel or inventory.' },
    }, [
      recordById.get('neighborhood-bulk-route-corridors-modeled-v1'),
      modelRecords[1],
      modelRecords[2],
    ]);
    const simulatedProvenance = provenance('simulated', 'forecast', {
      kind: 'distribution',
      value: { seed: result.seed, interpretation: 'Deterministic scenario result; no empirical probability claim.' },
    }, modelRecords);
    const layers = createLayers(
      datasets,
      result,
      snapshot,
      warehouseProvenance,
      scenarioProvenance,
      modeledProvenance,
      simulatedProvenance
    );
    const events = result.events.map((row) => builder.event({
      id: row.id,
      pluginId: PLUGIN_ID,
      sequence: row.sequence,
      simulationTimeMs: row.simulationTimeMs,
      kind: row.kind,
      causationIds: row.causationIds,
      correlationId: result.scenarioIdentity,
      payload: row.payload,
      provenance: simulatedProvenance,
    }));
    const activeEvent = [...events].reverse()
      .find((row) => row.simulationTimeMs <= snapshot.simulationTimeMs) || null;
    const activeTripIds = new Set(
      snapshot.activeTripAssignmentId ? [snapshot.activeTripAssignmentId] : []
    );
    const activeDriverIds = layers
      .filter((row) => row.id.startsWith('driver:'))
      .map((row) => row.id);
    const activeTargets = layers
      .filter((row) => row.role === 'primary' || row.role === 'event')
      .map((row) => row.id);
    const presentation = builder.presentation({
      pluginId: PLUGIN_ID,
      coordinateSystem: 'wgs84',
      layers,
      viewIntents: [
        builder.viewIntent({
          id: `bulk-pool-view:${snapshot.id}`,
          mode: snapshot.status === 'settled' ? 'compare' : 'overview',
          targetIds: activeTripIds.size && snapshot.status !== 'settled'
            ? activeDriverIds
            : activeTargets.length
              ? activeTargets
            : layers.filter((row) => row.id.startsWith('warehouse:')).map((row) => row.id),
          reasonEventId: activeEvent?.id || null,
          priority: 68,
        }),
      ],
    });
    const controls = builder.controls(createControls(
      datasets,
      result.configurationIdentity,
      scenarioProvenance
    ), [
      comparison(
        'independent-vs-pool',
        'Independent shopping vs selected neighborhood pool',
        `${result.scenarioId}:independent`,
        `${result.scenarioId}:${result.activePolicyId}`
      ),
      comparison(
        'bulk-only-vs-existing-trip',
        'Bulk split only vs existing-trip pooling',
        `${result.scenarioId}:bulk-only`,
        `${result.scenarioId}:existing-trip`
      ),
      comparison(
        'existing-trip-vs-hub',
        'Existing-trip delivery vs neighborhood pickup hubs',
        `${result.scenarioId}:existing-trip`,
        `${result.scenarioId}:neighborhood-hub`
      ),
    ]);
    const progressiveState = builder.state({
      id: snapshot.id,
      pluginId: PLUGIN_ID,
      simulationTimeMs: snapshot.simulationTimeMs,
      status: snapshot.status,
      previousStateId: previousSnapshotId(result, snapshot),
      eventIds: snapshot.eventIds,
      measures: [
        builder.quantity('requested-share-units', snapshot.metrics.requestedUnits, 'share units'),
        builder.quantity('fulfilled-share-units', snapshot.metrics.fulfilledUnits, 'share units'),
        builder.quantity('packages-purchased', snapshot.metrics.packagesPurchased, 'packages'),
        builder.quantity('package-waste', snapshot.metrics.wasteUnits, 'share units'),
        builder.quantity('household-cost', snapshot.metrics.householdCostUsd, 'USD'),
        builder.quantity('incremental-driving', snapshot.metrics.incrementalVehicleKm, 'km'),
      ],
      provenance: simulatedProvenance,
    });
    return builder.contribution({
      pluginId: PLUGIN_ID,
      presentation,
      events,
      controls,
      state: progressiveState,
      inspections: createInspections(
        datasets,
        result,
        scenarioProvenance,
        modeledProvenance,
        simulatedProvenance
      ),
      provenanceRecords: [...records, ...modelRecords],
    });
  }

  function createLayers(datasets, result, snapshot, warehouse, scenario, modeled, simulated) {
    const warehouseOffers = new Map(datasets.warehouses.warehouses.map((row) => [row.id, 0]));
    datasets.catalog.items.forEach((item) => item.offers.forEach((offer) => {
      warehouseOffers.set(offer.warehouseId, (warehouseOffers.get(offer.warehouseId) || 0) + 1);
    }));
    const activeGroups = new Set(snapshot.visiblePoolGroupIds);
    const visibleTrips = new Set(snapshot.visibleTripAssignmentIds);
    const completedTrips = new Set(snapshot.completedTripAssignmentIds || []);
    const activeTripId = snapshot.activeTripAssignmentId || null;
    const tripProgress = Number.isFinite(snapshot.activeTripProgress)
      ? Math.max(0, Math.min(1, snapshot.activeTripProgress))
      : 0;
    const completedStops = new Set(snapshot.completedStopIds || []);
    const visibleRejectedRequests = new Set(snapshot.visibleRejectedRequestIds || []);
    const neighborhoods = new Map(datasets.routes.neighborhoods.map((row) => [row.id, row]));
    const maximumOffers = Math.max(...warehouseOffers.values(), 1);
    const layers = [
      ...datasets.routes.coverageAreas.map((row) => builder.layer({
        id: `modeled-area:${row.id}`,
        kind: 'area',
        label: `${row.label} · coarse modeled envelope`,
        geometry: builder.geometry('polygon', 'wgs84', row.coordinates),
        quantity: builder.quantity('scenario-coverage-area', 1, 'area', [0, 2]),
        role: 'comparison',
        importance: 0.66,
        aggregationKey: 'bulk-pool-modeled-coverage',
        provenance: modeled,
      })),
      ...datasets.warehouses.warehouses.map((row) => builder.layer({
        id: `warehouse:${row.id}`,
        kind: 'point',
        label: row.label,
        geometry: builder.geometry('point', 'wgs84', [[...row.coordinates, 0]]),
        quantity: builder.quantity('catalog-offer-rows', warehouseOffers.get(row.id), 'rows', [0, maximumOffers]),
        role: 'primary',
        importance: 0.98,
        aggregationKey: 'bulk-pool-warehouses',
        provenance: warehouse,
      })),
      ...result.poolGroups.filter((row) => activeGroups.has(row.id)).map((row) => {
        const warehouseRow = datasets.warehouses.warehouses.find((entry) => entry.id === row.warehouseId);
        return builder.layer({
          id: row.id,
          kind: 'point',
          label: `${row.item.name}: ${row.allocatedUnits} of ${row.purchasedUnits} units allocated`,
          geometry: builder.geometry('point', 'wgs84', [[...warehouseRow.coordinates, 0]]),
          quantity: builder.quantity('package-utilization', row.packageUtilizationRatio, 'ratio', [0, 1.000001]),
          role: row.packageUtilizationRatio >= 0.75 ? 'primary' : 'event',
          importance: Math.min(1, 0.55 + row.allocatedUnits / Math.max(1, result.metrics.fulfilledUnits)),
          aggregationKey: `pool-groups:${row.warehouseId}`,
          provenance: simulated,
        });
      }),
      ...result.poolGroups.filter((row) => activeGroups.has(row.id)).flatMap((row) => (
        row.allocations.map((allocation) => builder.layer({
          id: `request:${allocation.requestId}`,
          kind: 'point',
          label: `${allocation.pseudonym} · ${allocation.quantity} ${row.item.package.unitType} ${row.item.name}`,
          geometry: builder.geometry('point', 'wgs84', [[...allocation.neighborhoodCoordinates, 0]]),
          quantity: builder.quantity(
            'household-request-share-units',
            allocation.quantity,
            row.item.package.unitType,
            [0, Math.max(1, result.metrics.requestedUnits)]
          ),
          role: 'context',
          importance: 0.65,
          aggregationKey: `bulk-pool-requests:${allocation.neighborhoodId}`,
          provenance: scenario,
        }))
      )),
      ...result.tripAssignments.filter((row) => visibleTrips.has(row.id)).map((row) => builder.layer({
        id: row.id,
        kind: 'path',
        label: `${row.driverPseudonym}: warehouse pickup and ${row.stops.length} handoff stops`,
        geometry: builder.geometry('polyline', 'wgs84', row.corridorCoordinates),
        quantity: builder.quantity('incremental-detour', row.incrementalDetourKm, 'km', [0, Math.max(0.001, result.configurationIdentity.maximumDetourKm)]),
        role: row.id === activeTripId ? 'primary' : 'context',
        importance: row.id === activeTripId ? 0.96 : 0.42,
        aggregationKey: 'bulk-pool-trip-corridors',
        provenance: modeled,
      })),
      ...result.tripAssignments.filter((row) => row.id === activeTripId).map((row) => builder.layer({
        id: `driver:${row.id}`,
        kind: 'actor',
        label: `${row.driverPseudonym} · ${Math.round(tripProgress * 100)}% along volunteered corridor`,
        geometry: builder.geometry('polyline', 'wgs84', row.corridorCoordinates),
        quantity: builder.quantity('actor.car.route-progress', tripProgress, 'ratio', [0, 1]),
        role: 'event',
        importance: 1,
        aggregationKey: 'bulk-pool-drivers',
        provenance: simulated,
      })),
      ...result.tripAssignments.filter((row) => row.id === activeTripId).flatMap((trip) => (
        trip.poolGroupIds.map((groupId, index) => {
          const group = result.poolGroups.find((row) => row.id === groupId);
          return builder.layer({
            id: `package:${trip.id}:${groupId}`,
            kind: 'actor',
            label: `${group.item.name} · ${group.packages} package${group.packages === 1 ? '' : 's'} in transit`,
            geometry: builder.geometry('polyline', 'wgs84', trip.corridorCoordinates),
            quantity: builder.quantity(
              'actor.package.route-progress',
              Math.max(0, tripProgress - index * 0.015),
              'ratio',
              [0, 1]
            ),
            role: 'event',
            importance: 0.92 - index * 0.02,
            aggregationKey: `bulk-pool-packages:${trip.id}`,
            provenance: simulated,
          });
        })
      )),
      ...result.tripAssignments.filter((row) => visibleTrips.has(row.id)).flatMap((trip) => (
        trip.stops.map((stop) => builder.layer({
          id: `stop:${trip.tripId}:${stop.id}`,
          kind: 'point',
          label: completedStops.has(`${trip.id}:${stop.id}`)
            ? `${stop.label} · delivered`
            : stop.label,
          geometry: builder.geometry('point', 'wgs84', [[...stop.coordinates, 0]]),
          quantity: builder.quantity(
            completedStops.has(`${trip.id}:${stop.id}`) ? 'handoff.completed' : 'handoff.pending',
            completedStops.has(`${trip.id}:${stop.id}`) ? 1 : 0,
            'state',
            [0, 1]
          ),
          role: completedStops.has(`${trip.id}:${stop.id}`) ? 'primary' : 'context',
          importance: completedStops.has(`${trip.id}:${stop.id}`) ? 0.9 : 0.5,
          aggregationKey: `bulk-pool-stops:${trip.tripId}`,
          provenance: scenario,
        }))
      )),
      ...result.policyResults[result.activePolicyId].rejectedRequests
        .filter((row) => visibleRejectedRequests.has(row.requestId))
        .map((row) => {
        const neighborhood = neighborhoods.get(row.neighborhoodId);
        if (!neighborhood) return null;
        return builder.layer({
          id: `unserved:${row.requestId}`,
          kind: 'point',
          label: `${neighborhood.label}: unserved demand`,
          geometry: builder.geometry('point', 'wgs84', [[...neighborhood.coordinates, 0]]),
          quantity: builder.quantity('unserved-share-units', row.quantity, 'share units', [0, Math.max(1, result.metrics.requestedUnits)]),
          role: 'uncertainty',
          importance: 0.92,
          aggregationKey: 'bulk-pool-unserved',
          provenance: simulated,
        });
      }).filter(Boolean),
      ...result.tripAssignments.filter((row) => completedTrips.has(row.id)).map((row) => {
        const endpoint = row.corridorCoordinates.at(-1);
        return builder.layer({
          id: `completed:${row.id}`,
          kind: 'point',
          label: `${row.driverPseudonym} completed pooled delivery`,
          geometry: builder.geometry('point', 'wgs84', [[...endpoint, 0]]),
          quantity: builder.quantity('delivery.completed', 1, 'trip', [0, 1]),
          role: 'primary',
          importance: 0.72,
          aggregationKey: 'bulk-pool-completed-trips',
          provenance: simulated,
        });
      }),
    ];
    return layers;
  }

  function createControls(datasets, values, evidence) {
    return [
      selectControl('poolingPolicyId', 'Pooling and handoff policy', values.poolingPolicyId, [
        option('existing-trip', 'Existing-trip delivery'),
        option('neighborhood-hub', 'Neighborhood pickup hubs'),
        option('bulk-only', 'Bulk split without route pooling'),
        option('independent', 'Independent shopping'),
      ], evidence),
      multiSelectControl(
        'selectedWarehouseIds',
        'Warehouses',
        values.selectedWarehouseIds,
        datasets.warehouses.warehouses.map((row) => option(row.id, row.label)),
        evidence
      ),
      multiSelectControl(
        'selectedCategoryIds',
        'Catalog categories',
        values.selectedCategoryIds,
        datasets.catalog.categories.map((row) => option(row.id, row.label)),
        evidence
      ),
      multiSelectControl('compensationModes', 'Driver compensation', values.compensationModes, [
        option('pro-bono', 'Pro bono'),
        option('exact-expenses', 'Exact disclosed expenses'),
        option('fee', 'Disclosed fee'),
      ], evidence),
      rangeControl('maximumDetourKm', 'Maximum trip detour', values.maximumDetourKm, 0.5, 8, 0.5, evidence),
      numberControl('maximumStops', 'Maximum handoff stops', values.maximumStops, 1, 12, 1, evidence),
      rangeControl('minimumSavingsUsd', 'Minimum pool savings', values.minimumSavingsUsd, 0, 20, 0.5, evidence),
      rangeControl('freshnessLimitMinutes', 'Cold-item transit limit', values.freshnessLimitMinutes, 30, 240, 5, evidence),
      toggleControl('allowUnknownAvailability', 'Permit unknown inventory in scenario', values.allowUnknownAvailability, evidence),
    ];
  }

  function createInspections(datasets, result, scenario, modeled, simulated) {
    const rows = [{
      id: 'catalog-coverage',
      label: 'Catalog coverage and truth',
      targetIds: datasets.warehouses.warehouses.map((row) => `warehouse:${row.id}`),
      fields: [
        field('rows', 'Indexed catalog rows', result.catalogReceipt.indexedRows, 'rows', scenario),
        field('offers', 'Indexed warehouse offers', result.catalogReceipt.indexedOffers, 'offers', scenario),
        field('coverage', 'Coverage status', result.catalogReceipt.coverageStatus, null, scenario),
        field('complete', 'Declared complete', result.catalogReceipt.declaredComplete, null, scenario),
        field('capacity', 'Supported catalog bound', result.catalogReceipt.maximumSupportedRows, 'rows', modeled),
      ],
    }, {
      id: 'policy-comparison',
      label: 'Four-policy comparison',
      targetIds: result.tripAssignments.map((row) => row.id),
      fields: Object.values(result.policyResults).flatMap((policy) => [
        field(`${policy.policyId}-cost`, `${policy.policyId} cost`, policy.metrics.householdCostUsd, 'USD', simulated),
        field(`${policy.policyId}-km`, `${policy.policyId} driving`, policy.metrics.incrementalVehicleKm, 'km', simulated),
        field(`${policy.policyId}-served`, `${policy.policyId} fulfilled`, policy.metrics.fulfillmentPercent, 'percent', simulated),
      ]),
    }, ...result.poolGroups.map((group) => ({
      id: `inspect:${group.id}`,
      label: group.item.name,
      targetIds: [group.id],
      fields: [
        field('warehouse', 'Warehouse', group.warehouseId, null, scenario),
        field('packages', 'Whole packages', group.packages, 'packages', simulated),
        field('allocated', 'Allocated quantity', group.allocatedUnits, group.item.package.unitType, simulated),
        field('waste', 'Unallocated package quantity', group.wasteUnits, group.item.package.unitType, simulated),
        field('cost', 'Package cost', group.purchaseCostUsd, 'USD', simulated),
        field('availability', 'Availability used', group.availabilityAssumption, null, scenario),
      ],
    })), ...result.tripAssignments.map((trip) => ({
      id: `inspect:${trip.id}`,
      label: `${trip.driverPseudonym} trip`,
      targetIds: [trip.id],
      fields: [
        field('mode', 'Compensation mode', trip.compensation.mode, null, scenario),
        field('compensation', 'Settled compensation', trip.compensation.settledUsd, 'USD', simulated),
        field('detour', 'Incremental detour', trip.incrementalDetourKm, 'km', modeled),
        field('stops', 'Coarse handoff stops', trip.stops.length, 'stops', modeled),
        field('mass', 'Cargo mass', trip.capacity.massKg, 'kg', modeled),
        field('cold-volume', 'Cold cargo volume', trip.capacity.coldVolumeL, 'L', modeled),
      ],
    })), ...result.settlements.map((settlement) => ({
      id: `settlement:${settlement.participantId}`,
      label: `${settlement.pseudonym} settlement`,
      targetIds: [],
      fields: [
        field('quantity', 'Fulfilled quantity', settlement.fulfilledUnits, 'share units', simulated),
        field('item-cost', 'Item cost', settlement.itemCostUsd, 'USD', simulated),
        field('driver-cost', 'Driver compensation share', settlement.driverCompensationUsd, 'USD', simulated),
        field('total-cost', 'Total cost', settlement.totalCostUsd, 'USD', simulated),
        field('savings', 'Savings against independent packages', settlement.savingsUsd, 'USD', simulated),
        field('base-price', 'Base item price', settlement.receiptBreakdown?.basePriceUsd || 0, 'USD', simulated),
        field('tax', 'Sales tax', settlement.receiptBreakdown?.taxUsd || 0, 'USD', simulated),
        field('deposit', 'Container deposit', settlement.receiptBreakdown?.depositUsd || 0, 'USD', simulated),
        field('toll', 'Allocated tolls', settlement.receiptBreakdown?.tollUsd || 0, 'USD', simulated),
        field('mileage', 'Mileage reimbursement', settlement.receiptBreakdown?.mileageUsd || 0, 'USD', simulated),
        field(
          'expense-reimbursement',
          'Unitemized expense reimbursement',
          settlement.receiptBreakdown?.expenseReimbursementUsd || 0,
          'USD',
          simulated
        ),
        field('fee', 'Disclosed service fee', settlement.receiptBreakdown?.feeUsd || 0, 'USD', simulated),
      ],
    }))];
    return rows;
  }

  function modelRecord(id, contentHash, parents, algorithm, result) {
    return builder.modelRecord({
      id: `${PLUGIN_ID}:model:${id}`,
      datasetId: 'neighborhood-bulk-model-governance-v1',
      contentHash,
      parentIds: parents.map((row) => row.id),
      metadata: { algorithm },
      lineage: {
        axes: {
          origin: 'modeled',
          temporalStatus: 'forecast',
          uncertainty: {
            kind: 'missing',
            value: { reason: 'Algorithm identity is exact; real demand and travel calibration are absent.' },
          },
        },
        contentVersion: id,
        scenarioEpoch: `scenario:${result.scenarioIdentity}`,
        license: { required: false, identifier: null },
      },
    });
  }

  function metadataFor(datasetId, datasets) {
    if (datasetId === datasets.warehouses.id) {
      return {
        contentVersion: datasets.warehouses.contentVersion,
        truth: datasets.warehouses.truth,
      };
    }
    const value = Object.values(datasets).find((row) => row?.id === datasetId);
    return {
      kind: datasetId.includes('model-governance') ? 'governed model definition' : 'governed scenario input',
      scenarioKind: 'neighborhood-bulk-pool',
      contentVersion: value?.contentVersion || '1.0.0',
      truth: value?.truth,
    };
  }

  function provenance(origin, temporalStatus, uncertainty, records) {
    return builder.provenance({
      origin,
      temporalStatus,
      uncertainty,
      records: records.filter(Boolean),
    });
  }

  function previousSnapshotId(result, snapshot) {
    const index = result.snapshots.findIndex((row) => row.id === snapshot.id);
    return index > 0 ? result.snapshots[index - 1].id : null;
  }

  function selectControl(id, label, value, options, evidence) {
    return { id, label, kind: 'select', value, options, minimum: null, maximum: null, step: null, provenance: evidence };
  }

  function multiSelectControl(id, label, value, options, evidence) {
    return { id, label, kind: 'multiselect', value, options, minimum: null, maximum: null, step: null, provenance: evidence };
  }

  function rangeControl(id, label, value, minimum, maximum, step, evidence) {
    return { id, label, kind: 'range', value, options: null, minimum, maximum, step, provenance: evidence };
  }

  function numberControl(id, label, value, minimum, maximum, step, evidence) {
    return { id, label, kind: 'number', value, options: null, minimum, maximum, step, provenance: evidence };
  }

  function toggleControl(id, label, value, evidence) {
    return { id, label, kind: 'toggle', value, options: null, minimum: null, maximum: null, step: null, provenance: evidence };
  }

  function comparison(id, label, baselineScenarioId, variantScenarioId) {
    return { id, label, baselineScenarioId, variantScenarioId, synchronizedClock: true };
  }

  function option(value, label) {
    return { value, label };
  }

  function field(id, label, value, unit, evidence) {
    return { id, label, value, unit, provenance: evidence };
  }

  function requireBuilder() {
    if (!builder?.datasetRecord || !builder?.contribution) {
      throw new Error('neighborhood_bulk_v4_builder_missing');
    }
  }

  return Object.freeze({ MODEL_HASHES, createContribution });
});
