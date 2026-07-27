(function attachGridV4(root, factory) {
  const builder = typeof module === 'object' && module.exports
    ? require('../../core/simulation/plugin-v4-builder.js') : root.SimulattePluginV4Builder;
  const api = factory(builder);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteGridV4 = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createGridV4(builder) {
  const PLUGIN_ID = 'grid-resilience-us';
  const MODEL_HASHES = Object.freeze({
    dispatch: 'abb6945598b0d6369450924be0528b57b484bc85fa0d017cc72a9b53dacb8786',
    restoration: '2f2a8bc32a9ba63d3fa4cbdd94d022fbe15fe6f22c01a6456317e09b1724cc51',
  });

  function createContribution({ datasets, config, result, snapshot, comparison = null }) {
    const currentMetrics = currentSnapshotMetrics(snapshot);
    const records = datasets.dataReceipts.map((receipt) => builder.datasetRecord(
      receipt.datasetId,
      receipt,
      metadataFor(receipt.datasetId)
    ));
    const modelRecords = [
      modelRecord('dispatch', MODEL_HASHES.dispatch, records, result),
      modelRecord('restoration', MODEL_HASHES.restoration, records, result),
    ];
    const observed = builder.provenance({
      origin: 'observed',
      temporalStatus: 'historical',
      uncertainty: { kind: 'missing', value: { reason: 'Agency row flags retained; no common interval exists.' } },
      records: records.filter((row) => /eia|noaa/.test(row.id)),
    });
    const simulated = builder.provenance({
      origin: 'simulated',
      temporalStatus: 'forecast',
      uncertainty: { kind: 'distribution', value: { interpretation: 'Declared scenario variance, not forecast uncertainty.' } },
      records: modelRecords,
    });
    const scenario = builder.provenance({
      origin: 'scenario',
      temporalStatus: 'forecast',
      uncertainty: { kind: 'distribution', value: { interpretation: 'User-controlled aggregate experiment assumptions.' } },
      records: records.filter((row) => !/eia|noaa/.test(row.id)),
    });
    const maxDemand = Math.max(1, ...snapshot.regions.map((row) => row.grossDemandMw));
    const regionById = new Map(snapshot.regions.map((row) => [row.id, row]));
    const layers = [
      ...snapshot.regions.map((region) => builder.layer({
        id: `grid-region:${region.id}`,
        kind: 'point',
        label: region.label,
        geometry: builder.geometry('point', 'wgs84', [[...region.coordinates, 0]]),
        quantity: builder.quantity('modeled-unserved-load', region.unservedMw, 'MW', [0, maxDemand]),
        role: region.unservedMw > 0 ? 'event' : 'primary',
        importance: region.unservedMw > 0 ? 1 : 0.7,
        aggregationKey: 'grid-regions',
        provenance: simulated,
      })),
      ...snapshot.interfaces.map((edge) => builder.layer({
        id: `grid-interface:${edge.id}`,
        kind: 'path',
        label: edge.available ? `${edge.id} aggregate transfer` : `${edge.id} scenario unavailable`,
        geometry: builder.geometry('polyline', 'wgs84', [
          regionById.get(edge.fromRegionId).coordinates,
          regionById.get(edge.toRegionId).coordinates,
        ]),
        quantity: builder.quantity('interface-utilization', edge.utilizationRatio, 'ratio', [0, 1.000001]),
        role: edge.available ? 'context' : 'event',
        importance: edge.available ? 0.55 : 1,
        aggregationKey: 'grid-interfaces',
        provenance: simulated,
      })),
    ];
    const events = result.events.map((row, sequence) => builder.event({
      id: row.id,
      pluginId: PLUGIN_ID,
      sequence,
      simulationTimeMs: row.simulationTimeMs,
      kind: row.kind,
      causationIds: row.causationIds,
      correlationId: result.id,
      payload: row.payload,
      provenance: simulated,
    }));
    const presentation = builder.presentation({
      pluginId: PLUGIN_ID,
      coordinateSystem: 'wgs84',
      epoch: config.startInstant,
      layers,
      viewIntents: [builder.viewIntent({
        id: `grid-view:${snapshot.id}`,
        mode: comparison?.settlement ? 'compare' : 'overview',
        targetIds: layers.filter((row) => row.role === 'event').map((row) => row.id),
        reasonEventId: snapshot.eventIds.at(-1) || null,
        priority: 65,
      })],
    });
    const controls = builder.controls([
      select('disturbanceScenarioId', 'Disturbance', result.configurationIdentity.disturbanceScenarioId,
        datasets.disturbances.scenarios.map((row) => option(row.id, row.name)), scenario),
      select('dispatchPolicyId', 'Dispatch policy', result.policies.dispatchPolicyId, [
        option('economic-order', 'Economic order'),
        option('resilience-weighted', 'Resilience weighted'),
      ], scenario),
      select('reservePolicyId', 'Reserve policy', result.policies.reservePolicyId, [
        option('fixed-reserve', 'Fixed reserve'),
        option('adaptive-reserve', 'Adaptive reserve'),
      ], scenario),
      select('storagePolicyId', 'Storage policy', result.policies.storagePolicyId, [
        option('immediate-support', 'Immediate support'),
        option('reserve-preserving', 'Reserve preserving'),
      ], scenario),
      select('restorationPolicyId', 'Restoration policy', result.policies.restorationPolicyId, [
        option('nearest-first', 'Nearest first'),
        option('dependency-aware', 'Dependency aware'),
        option('service-impact-first', 'Service impact first'),
      ], scenario),
      range('demandResponseMaximumFraction', 'Maximum demand response', result.configurationIdentity.demandResponseMaximumFraction, 0, 0.2, 0.01, scenario),
      number('emissionsPriceUsdPerTon', 'Emissions price', result.configurationIdentity.emissionsPriceUsdPerTon, 0, 250, 5, scenario),
      multi('sheddingPriorities', 'Service priority regions', result.configurationIdentity.sheddingPriorities,
        datasets.topology.regions.map((row) => option(row.id, row.name)), scenario),
      number('restorationCrewCount', 'Restoration crews', result.configurationIdentity.restorationCrewCount, 1, datasets.restoration.crews.length, 1, scenario),
      number('ensembleSize', 'Scenario ensemble runs', result.configurationIdentity.ensembleSize, 1, config.ensembleSeeds.length, 1, scenario),
    ], [{
      id: 'fixed-vs-adaptive-resilience',
      label: 'Economic baseline versus resilience intervention',
      baselineScenarioId: `${result.scenarioId}:baseline`,
      variantScenarioId: `${result.scenarioId}:intervention`,
      synchronizedClock: true,
    }]);
    const state = builder.state({
      id: snapshot.id,
      pluginId: PLUGIN_ID,
      simulationTimeMs: snapshot.simulationTimeMs,
      status: snapshot.status,
      previousStateId: previousSnapshotId(result, snapshot),
      eventIds: snapshot.eventIds,
      measures: [
        builder.quantity('modeled-unserved-load', currentMetrics.unservedMw, 'MW'),
        builder.quantity('modeled-emissions-this-hour', currentMetrics.emissionsTons, 'ton'),
        builder.quantity('current-minimum-reserve-margin', currentMetrics.minimumReserveMarginRatio, 'ratio'),
        builder.quantity('storage-state-of-charge', currentMetrics.storageStateOfChargeMwh, 'MWh'),
        builder.quantity('storage-charging-load', currentMetrics.storageChargeMw, 'MW'),
        builder.quantity('spilled-generation', currentMetrics.spilledGenerationMw, 'MW'),
      ],
      provenance: simulated,
    });
    return builder.contribution({
      pluginId: PLUGIN_ID,
      presentation,
      events,
      controls,
      state,
      inspections: snapshot.regions.map((region) => ({
        id: `inspect:grid-region:${region.id}`,
        label: region.label,
        targetIds: [`grid-region:${region.id}`],
        fields: [
          field('observed-demand-row', 'EIA demand row', region.observedDemandRowId || 'ready', null, observed),
          field('gross-demand', 'Scenario-adjusted demand', region.grossDemandMw, 'MW', simulated),
          field('served', 'Modeled served load', region.servedMw, 'MW', simulated),
          field('unserved', 'Modeled unserved load', region.unservedMw, 'MW', simulated),
          field('reserve', 'Modeled reserve margin', region.reserveMarginRatio, 'ratio', simulated),
        ],
      })),
      provenanceRecords: [...records, ...modelRecords],
    });
  }

  function modelRecord(id, contentHash, parents, result) {
    return builder.modelRecord({
      id: `${PLUGIN_ID}:model:${id}`,
      datasetId: 'grid-model-governance-v1',
      contentHash,
      parentIds: parents.map((row) => row.id),
      metadata: { algorithm: `${id}-v1` },
      lineage: {
        axes: {
          origin: 'derived',
          temporalStatus: 'forecast',
          uncertainty: { kind: 'missing', value: { reason: 'Derived from observed, modeled, and scenario parents without operational calibration.' } },
        },
        contentVersion: `${id}-v1`,
        scenarioEpoch: `scenario:${result.scenarioIdentity}`,
        license: { required: false, identifier: null },
      },
    });
  }

  function metadataFor(id) {
    if (/grid-(?:eia|noaa)-/.test(id)) return {
      license: 'US-government-public-data',
      contentVersion: '2024-07-15',
      truth: {
        origin: 'observed',
        temporalStatus: 'historical',
        uncertainty: { kind: 'missing', value: { reason: 'Source flags retained; no common quantified interval.' } },
      },
    };
    return { scenarioKind: 'grid-resilience', contentVersion: '1.0.0' };
  }

  function previousSnapshotId(result, snapshot) {
    const index = result.snapshots.findIndex((row) => row.id === snapshot.id);
    return index > 0 ? result.snapshots[index - 1].id : null;
  }

  function select(id, label, value, options, provenance) {
    return { id, label, kind: 'select', value, options, minimum: null, maximum: null, step: null, provenance };
  }
  function multi(id, label, value, options, provenance) {
    return { id, label, kind: 'multiselect', value, options, minimum: null, maximum: null, step: null, provenance };
  }
  function range(id, label, value, minimum, maximum, step, provenance) {
    return { id, label, kind: 'range', value, options: null, minimum, maximum, step, provenance };
  }
  function number(id, label, value, minimum, maximum, step, provenance) {
    return { id, label, kind: 'number', value, options: null, minimum, maximum, step, provenance };
  }
  function option(value, label) { return { value, label }; }
  function field(id, label, value, unit, provenance) { return { id, label, value, unit, provenance }; }

  function currentSnapshotMetrics(snapshot) {
    return snapshot.regions.reduce((result, row) => ({
      unservedMw: result.unservedMw + (row.unservedMw || 0),
      emissionsTons: result.emissionsTons + (row.emissionsTons || 0),
      minimumReserveMarginRatio: Math.min(result.minimumReserveMarginRatio, row.reserveMarginRatio || 0),
      storageStateOfChargeMwh: result.storageStateOfChargeMwh + (row.storageStateOfChargeMwh || 0),
      storageChargeMw: result.storageChargeMw + (row.storageChargeMw || 0),
      spilledGenerationMw: result.spilledGenerationMw + (row.spilledGenerationMw || 0),
    }), {
      unservedMw: 0,
      emissionsTons: 0,
      minimumReserveMarginRatio: 1,
      storageStateOfChargeMwh: 0,
      storageChargeMw: 0,
      spilledGenerationMw: 0,
    });
  }

  return Object.freeze({ MODEL_HASHES, createContribution });
});
