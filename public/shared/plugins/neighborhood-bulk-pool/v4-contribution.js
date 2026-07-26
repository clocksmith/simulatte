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
    catalogIndex: 'c208d27c9f577ea8ec7d43f500d6f5785403fe67738ab234e952003d71ef5741',
    poolSolver: 'f21624e5b6bbc51bda6c1402b38b311c5a1e2ac7059ca1086c8b906567edb27d',
    routeScreen: 'c51218bc43eff026a800a658f196bfc564dc037a59446813bed3a1636742767f',
    settlement: '4d9908a33b9f499fa6d3ed96150e81ee88d74d66d38aa26b2bd784e67b505208',
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
    const activeTripIds = new Set(snapshot.visibleTripAssignmentIds);
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
          mode: snapshot.status === 'settled' ? 'compare' : activeTripIds.size ? 'follow' : 'overview',
          targetIds: activeTargets.length
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
    const activeTrips = new Set(snapshot.visibleTripAssignmentIds);
    const neighborhoods = new Map(datasets.routes.neighborhoods.map((row) => [row.id, row]));
    const maximumOffers = Math.max(...warehouseOffers.values(), 1);
    const layers = [
      ...datasets.warehouses.warehouses.map((row) => builder.layer({
        id: `warehouse:${row.id}`,
        kind: 'point',
        label: row.label,
        geometry: builder.geometry('point', 'wgs84', [[...row.coordinates, 0]]),
        quantity: builder.quantity('catalog-offer-rows', warehouseOffers.get(row.id), 'rows', [0, maximumOffers]),
        role: 'context',
        importance: 0.72,
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
      ...result.tripAssignments.filter((row) => activeTrips.has(row.id)).map((row) => builder.layer({
        id: row.id,
        kind: 'path',
        label: `${row.driverPseudonym}: ${row.stops.length} coarse handoff stops`,
        geometry: builder.geometry('polyline', 'wgs84', row.corridorCoordinates),
        quantity: builder.quantity('incremental-detour', row.incrementalDetourKm, 'km', [0, Math.max(0.001, result.configurationIdentity.maximumDetourKm)]),
        role: 'primary',
        importance: 0.88,
        aggregationKey: 'bulk-pool-trip-corridors',
        provenance: modeled,
      })),
      ...result.tripAssignments.filter((row) => activeTrips.has(row.id)).flatMap((trip) => (
        trip.stops.map((stop) => builder.layer({
          id: `stop:${trip.tripId}:${stop.id}`,
          kind: stop.kind === 'pickup-hub' ? 'point' : 'actor',
          label: stop.label,
          geometry: builder.geometry('point', 'wgs84', [[...stop.coordinates, 0]]),
          quantity: builder.quantity('handoff-stop', 1, 'stop', [0, Math.max(1, trip.stops.length)]),
          role: 'event',
          importance: 0.8,
          aggregationKey: `bulk-pool-stops:${trip.tripId}`,
          provenance: scenario,
        }))
      )),
      ...result.policyResults[result.activePolicyId].rejectedRequests.map((row) => {
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
        field('savings', 'Savings against independent packages', settlement.savingsUsd, 'USD', simulated),
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
