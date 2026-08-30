(function attachSubseaV4(root, factory) {
  const builder = typeof module === 'object' && module.exports
    ? require('../../core/simulation/plugin-v4-builder.js')
    : root.SimulattePluginV4Builder;
  const api = factory(builder);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteSubseaV4 = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createSubseaV4(builder) {
  const PLUGIN_ID = 'subsea-network-global';
  const MODEL_HASHES = Object.freeze({
    allocation: 'b74dd2870c3c28b1e08236ca30eea42535f1af79c849aaf3a3ec50be0497faab',
    fairAllocation: 'd8caa2bc05f9056604a9f13dd4b7f0b9c7b9454ee74b0f5b99c1293996f8d71c',
    repair: '6935c49c5fd7496b70ed3db60fd38b26b5064b448b70ca7c54d74a1a8ac86017',
  });

  function createContribution({
    datasets,
    dataReceipts,
    config,
    result,
    snapshot,
    appliedParameters = null,
    comparison = null,
  }) {
    requireBuilder();
    const records = dataReceipts.map((receipt) => builder.datasetRecord(receipt.datasetId, receipt, metadataFor(receipt.datasetId)));
    const recordById = new Map(records.map((row) => [row.id, row]));
    const sourceRecord = recordById.get('subsea-fcc-cable-license-register-2025-v1');
    const scenarioRecords = records.filter((row) => row.id !== sourceRecord?.id);
    const modelRecords = [
      builder.modelRecord({
        id: `${PLUGIN_ID}:model:allocation`,
        datasetId: 'subsea-model-governance-v1',
        contentHash: MODEL_HASHES.allocation,
        parentIds: scenarioRecords.map((row) => row.id),
        metadata: { algorithm: result.allocationReceipts.at(-1).algorithm },
        lineage: modeledLineage('path-flow-simplex-v1', result),
      }),
      builder.modelRecord({
        id: `${PLUGIN_ID}:model:fair-allocation`,
        datasetId: 'subsea-model-governance-v1',
        contentHash: MODEL_HASHES.fairAllocation,
        parentIds: scenarioRecords.map((row) => row.id),
        metadata: { algorithm: 'deterministic-frank-wolfe-with-simplex-oracle-v1' },
        lineage: modeledLineage('proportional-fair-frank-wolfe-v1', result),
      }),
      builder.modelRecord({
        id: `${PLUGIN_ID}:model:repair`,
        datasetId: 'subsea-model-governance-v1',
        contentHash: MODEL_HASHES.repair,
        parentIds: scenarioRecords.map((row) => row.id),
        metadata: { algorithm: result.repairReceipt.algorithm },
        lineage: modeledLineage('repair-discrete-event-v1', result),
      }),
    ];
    const sourceProvenance = builder.provenance({
      origin: 'derived',
      temporalStatus: 'snapshot',
      uncertainty: { kind: 'missing', value: { reason: 'Country display anchors are not landing stations.' } },
      records: sourceRecord ? [sourceRecord] : scenarioRecords.slice(0, 1),
    });
    const modeled = builder.provenance({
      origin: 'modeled',
      temporalStatus: 'forecast',
      uncertainty: { kind: 'missing', value: { reason: 'Topology geometry is a modeled display abstraction.' } },
      records: [modelRecords[0]],
    });
    const scenario = builder.provenance({
      origin: 'scenario',
      temporalStatus: 'forecast',
      uncertainty: {
        kind: 'distribution',
        value: { source: 'declared seed set', calibrationStatus: 'not_current_operations' },
      },
      records: scenarioRecords,
    });
    const simulated = builder.provenance({
      origin: 'simulated',
      temporalStatus: 'forecast',
      uncertainty: {
        kind: 'distribution',
        value: { seed: result.seed, ensembleStatus: 'scenario_variance' },
      },
      records: modelRecords,
    });
    const pointById = new Map(datasets.landings.points.map((row) => [row.id, row]));
    const activeRepair = result.repairReceipt.events.find((row) => row.id === snapshot.activeRepairEventId) || null;
    const maximumCapacity = Math.max(...snapshot.edges.map((row) => row.capacityGbps), 1);
    const maximumDemand = Math.max(...snapshot.demands.map((row) => row.requestedGbps), 1);
    const layers = [
      ...datasets.landings.points.map((point) => builder.layer({
        id: `landing:${point.id}`,
        kind: 'point',
        label: point.label,
        geometry: builder.geometry('point', 'wgs84', [[...point.coordinates, 0]]),
        quantity: builder.quantity(
          'delivered-service',
          snapshot.demands.filter((row) => row.destinationLandingId === point.id)
            .reduce((sum, row) => sum + row.deliveredGbps, 0),
          'Gbps',
          [0, maximumDemand]
        ),
        role: 'context',
        importance: 0.62,
        aggregationKey: 'subsea-landing-regions',
        provenance: sourceProvenance,
      })),
      ...snapshot.edges.map((edge) => builder.layer({
        id: `corridor:${edge.id}`,
        kind: 'path',
        label: edge.failureState === 'failed' ? `${edge.id} unavailable` : `${edge.id} modeled load`,
        geometry: builder.geometry('polyline', 'wgs84', edge.coordinates),
        quantity: builder.quantity('utilization-ratio', edge.utilizationRatio, 'ratio', [0, 1.000001]),
        role: edge.failureState === 'failed' ? 'event' : edge.utilizationRatio > 0.85 ? 'primary' : 'context',
        importance: edge.failureState === 'failed' ? 1 : Math.min(0.95, 0.35 + edge.capacityGbps / maximumCapacity * 0.45),
        aggregationKey: 'subsea-cable-corridors',
        provenance: modeled,
      })),
      ...snapshot.demands.filter((row) => row.droppedGbps > 0).map((demand) => builder.layer({
        id: `dropped:${demand.id}`,
        kind: 'point',
        label: `${demand.categoryId} modeled service loss`,
        geometry: builder.geometry('point', 'wgs84', [[...pointById.get(demand.destinationLandingId).coordinates, 0]]),
        quantity: builder.quantity('dropped-demand', demand.droppedGbps, 'Gbps', [0, maximumDemand]),
        role: 'event',
        importance: 0.95,
        aggregationKey: 'subsea-dropped-demand',
        provenance: simulated,
      })),
      ...(activeRepair?.origin && activeRepair?.destination ? [builder.layer({
        id: `repair-transit:${activeRepair.resourceId}`,
        kind: 'path',
        label: `${activeRepair.resourceId} modeled repair transit`,
        geometry: builder.geometry('polyline', 'wgs84', [activeRepair.origin, activeRepair.destination]),
        quantity: builder.quantity(
          'repair-progress',
          activeRepair.transitProgressFraction ?? 1,
          'ratio',
          [0, 1]
        ),
        role: 'event',
        importance: 0.78,
        aggregationKey: 'subsea-repair-transit',
        provenance: simulated,
      })] : []),
      ...(activeRepair?.position ? [builder.layer({
        id: `repair-resource:${activeRepair.resourceId}`,
        kind: 'actor',
        label: `${activeRepair.resourceId} repair resource`,
        geometry: builder.geometry(
          activeRepair.origin && activeRepair.destination ? 'polyline' : 'point',
          'wgs84',
          activeRepair.origin && activeRepair.destination
            ? [activeRepair.origin, activeRepair.destination]
            : [activeRepair.position]
        ),
        quantity: builder.quantity(
          'actor.repair-vessel.route-progress',
          activeRepair.transitProgressFraction ?? 1,
          'ratio',
          [0, 1]
        ),
        role: 'event',
        importance: 1,
        aggregationKey: 'subsea-repair-resources',
        provenance: simulated,
      })] : []),
    ];
    const events = result.events.map((row, sequence) => builder.event({
      id: row.id,
      pluginId: PLUGIN_ID,
      sequence,
      simulationTimeMs: row.simulationTimeMs,
      kind: row.kind,
      causationIds: row.causationIds.filter(Boolean),
      correlationId: result.id,
      payload: row.payload || {
        targetId: row.targetId,
        edgeIds: row.edgeIds,
        resourceId: row.resourceId,
      },
      provenance: simulated,
    }));
    const activeEvent = [...events].reverse().find((row) => row.simulationTimeMs <= snapshot.simulationTimeMs) || null;
    const activeTargets = layers.filter((row) => row.role === 'event' || row.role === 'primary').map((row) => row.id);
    const repairTargetId = activeRepair ? `repair-resource:${activeRepair.resourceId}` : null;
    const presentation = builder.presentation({
      pluginId: PLUGIN_ID,
      coordinateSystem: 'wgs84',
      epoch: config.startInstant,
      layers,
      viewIntents: [builder.viewIntent({
        id: `subsea-view:${snapshot.id}`,
        mode: comparison?.settlement ? 'compare' : snapshot.status === 'repairing' ? 'follow' : 'overview',
        targetIds: snapshot.status === 'repairing' && repairTargetId
          ? [repairTargetId]
          : activeTargets.length
            ? activeTargets
            : layers.filter((row) => row.kind === 'path').map((row) => row.id),
        reasonEventId: activeEvent?.id || null,
        priority: 65,
      })],
    });
    const controls = builder.controls([
      selectControl('demandScenarioId', 'Disruption: demand scenario', result.configurationIdentity.demandScenarioId,
        datasets.demands.scenarios.map((row) => option(row.id, row.id.replaceAll('-', ' '))), scenario),
      multiSelectControl('failedResourceIds', 'Disruption: failed resources', result.failedResourceIds, failureOptions(datasets), scenario),
      multiSelectControl(
        'jurisdictionExclusions',
        'Disruption: excluded landing regions',
        result.excludedLandingIds.length ? result.excludedLandingIds : ['none'],
        [option('none', 'No exclusions'), ...datasets.landings.points.map((row) => option(row.id, row.label))],
        scenario
      ),
      selectControl('allocationPolicyId', 'Allocation: selected policy', result.allocationPolicyId, [
        option('weighted-throughput', 'Weighted throughput'),
        option('proportional-fair', 'Proportional fairness'),
        option('essential-service-priority', 'Essential-service priority'),
        option('geographic-equity', 'Geographic equity'),
      ], scenario),
      selectControl('comparisonPolicyId', 'Allocation: comparison policy', appliedParameters?.comparisonPolicyId || config.comparisonPolicyId, [
        option('weighted-throughput', 'Weighted throughput'),
        option('proportional-fair', 'Proportional fairness'),
        option('essential-service-priority', 'Essential-service priority'),
        option('geographic-equity', 'Geographic equity'),
      ], scenario),
      rangeControl('essentialServiceWeight', 'Allocation: essential-service weight', result.configurationIdentity.essentialServiceWeight, 1, 20, 1, scenario),
      selectControl('repairPolicyId', 'Repair: priority policy', result.repairPolicyId, [
        option('nearest-first', 'Nearest resource first'),
        option('unmet-demand-first', 'Unserved demand first'),
      ], scenario),
      numberControl('repairResourceCount', 'Repair: available resources', result.configurationIdentity.repairResourceCount, 1, datasets.repairs.scenarios[0].resources.length, 1, scenario),
      numberControl('ensembleSize', 'Evidence: ensemble runs', result.configurationIdentity.ensembleSize, 1, config.ensembleSeeds.length, 1, scenario),
    ], [{
      id: `${appliedParameters?.comparisonPolicyId || config.comparisonPolicyId}-vs-${result.allocationPolicyId}`,
      label: `${(appliedParameters?.comparisonPolicyId || config.comparisonPolicyId).replaceAll('-', ' ')} vs selected ${result.allocationPolicyId.replaceAll('-', ' ')}`,
      baselineScenarioId: `${result.scenarioId}:${appliedParameters?.comparisonPolicyId || config.comparisonPolicyId}`,
      variantScenarioId: `${result.scenarioId}:${result.allocationPolicyId}`,
      synchronizedClock: true,
    }]);
    const progressiveState = builder.state({
      id: snapshot.id,
      pluginId: PLUGIN_ID,
      simulationTimeMs: snapshot.simulationTimeMs,
      status: snapshot.status,
      previousStateId: previousSnapshotId(result, snapshot),
      eventIds: snapshot.eventIds,
      measures: [
        builder.quantity('delivered-service', snapshot.metrics.deliveredGbps, 'Gbps'),
        builder.quantity('dropped-demand', snapshot.metrics.droppedGbps, 'Gbps'),
        builder.quantity('service-fairness', snapshot.metrics.jainServiceFairness, 'ratio'),
        builder.quantity('maximum-utilization', snapshot.metrics.maximumUtilizationRatio, 'ratio'),
      ],
      provenance: simulated,
    });
    return builder.contribution({
      pluginId: PLUGIN_ID,
      presentation,
      events,
      controls,
      state: progressiveState,
      inspections: createInspections(snapshot, datasets, sourceProvenance, modeled, scenario, simulated),
      provenanceRecords: [...records, ...modelRecords],
    });
  }

  function createInspections(snapshot, datasets, source, modeled, scenario, simulated) {
    const cables = new Map(datasets.fcc.cables.map((row) => [row.id, row]));
    return [
      ...snapshot.edges.map((edge) => ({
        id: `inspect:${edge.id}`,
        label: edge.id,
        targetIds: [`corridor:${edge.id}`],
        fields: [
          field('identity', 'Cable identity', cables.get(edge.cableId)?.label || edge.cableId, null, source),
          field('capacity', 'Scenario capacity', edge.capacityGbps, 'Gbps', scenario),
          field('load', 'Simulated load', edge.loadGbps, 'Gbps', simulated),
          field('utilization', 'Utilization', edge.utilizationRatio, 'ratio', simulated),
          field('capacity-class', 'Capacity classification', edge.capacityOrigin, null, scenario),
          field('geometry-class', 'Geometry classification', edge.geometryClassification, null, modeled),
        ],
      })),
      ...snapshot.demands.map((demand) => ({
        id: `inspect:${demand.id}`,
        label: demand.id,
        targetIds: demand.droppedGbps > 0 ? [`dropped:${demand.id}`] : [],
        fields: [
          field('requested', 'Scenario demand', demand.requestedGbps, 'Gbps', scenario),
          field('delivered', 'Simulated delivered', demand.deliveredGbps, 'Gbps', simulated),
          field('dropped', 'Simulated dropped', demand.droppedGbps, 'Gbps', simulated),
          field('paths', 'Admitted path count', demand.pathAllocations.length, 'paths', simulated),
        ],
      })),
    ];
  }

  function modeledLineage(contentVersion, result) {
    return {
      axes: {
        origin: 'modeled',
        temporalStatus: 'forecast',
        uncertainty: { kind: 'missing', value: { reason: 'Algorithm identity is exact; operational calibration is absent.' } },
      },
      contentVersion,
      scenarioEpoch: `scenario:${result.scenarioIdentity}`,
      license: { required: false, identifier: null },
    };
  }

  function metadataFor(datasetId) {
    if (datasetId === 'subsea-fcc-cable-license-register-2025-v1') {
      return {
        license: 'FCC-public-record',
        contentVersion: 'fcc-year-end-2025-and-capacity-2024',
        truth: {
          origin: 'observed',
          temporalStatus: 'historical',
          uncertainty: { kind: 'missing', value: { reason: 'Regulatory identity has no quantified uncertainty.' } },
        },
      };
    }
    return {
      kind: 'governed scenario or modeled transformation',
      scenarioKind: 'subsea-network',
      contentVersion: '1.0.0',
    };
  }

  function failureOptions(datasets) {
    return [
      ...datasets.topology.edges.filter((row) => row.cableId !== 'modeled-regional-gateway')
        .map((row) => option(row.id, row.id.replace(':', ' to '))),
      ...datasets.landings.points.map((row) => option(`landing:${row.id}`, `${row.label} regional loss`)),
    ];
  }

  function previousSnapshotId(result, snapshot) {
    const index = result.snapshots.findIndex((row) => row.id === snapshot.id);
    return index > 0 ? result.snapshots[index - 1].id : null;
  }

  function selectControl(id, label, value, options, provenance) {
    return { id, label, kind: 'select', value, options, minimum: null, maximum: null, step: null, provenance };
  }

  function multiSelectControl(id, label, value, options, provenance) {
    return { id, label, kind: 'multiselect', value, options, minimum: null, maximum: null, step: null, provenance };
  }

  function rangeControl(id, label, value, minimum, maximum, step, provenance) {
    return { id, label, kind: 'range', value, options: null, minimum, maximum, step, provenance };
  }

  function numberControl(id, label, value, minimum, maximum, step, provenance) {
    return { id, label, kind: 'number', value, options: null, minimum, maximum, step, provenance };
  }

  function option(value, label) {
    return { value, label };
  }

  function field(id, label, value, unit, provenance) {
    return { id, label, value, unit, provenance };
  }

  function requireBuilder() {
    if (!builder?.datasetRecord || !builder?.contribution) throw new Error('subsea_v4_builder_missing');
  }

  return Object.freeze({ MODEL_HASHES, createContribution });
});
