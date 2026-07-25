(function attachFoodRecallV4(root, factory) {
  const builder = typeof module === 'object' && module.exports
    ? require('../../core/simulation/plugin-v4-builder.js')
    : root.SimulattePluginV4Builder;
  const api = factory(builder);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteFoodRecallV4 = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createFoodRecallV4(builder) {
  const PLUGIN_ID = 'food-recall-us';
  const MODEL_HASH = '55d9102acb1748033bc842c3b0aa4a60f2e84f99d71ec2f2a261e7c86fd4f33e';
  const DAY_MS = 86400000;

  function createContribution({
    run,
    scenario,
    facilities,
    corridors,
    consumerZones,
    datasetReceipts,
    activeIntervention,
  }) {
    const datasets = datasetReceipts.map((row) => builder.datasetRecord(row.id, row, {
      scenarioKind: scenario.kind,
    }));
    const datasetById = new Map(datasets.map((row) => [row.id, row]));
    const facilitiesDataset = datasetById.get('us.food.facilities.synthetic.v1');
    const corridorsDataset = datasetById.get('us.food.freight-corridors.v1');
    const zonesDataset = datasetById.get('us.food.consumer-zones.v1');
    const facilityRecords = facilities.map((row) => builder.rowRecord(facilitiesDataset, row.id, {
      label: row.label,
      facilityKind: row.facilityKind,
    }));
    const facilityRecordById = new Map(facilityRecords.map((row) => [row.rowId, row]));
    const corridorRecords = corridors.map((row, index) => builder.rowRecord(corridorsDataset, row.id || index, {
      fromFacilityId: row.fromFacilityId,
      toFacilityId: row.toFacilityId,
    }));
    const zoneRecords = consumerZones.map((row) => builder.rowRecord(zonesDataset, row.id, {
      state: row.state,
      population: row.population,
    }));
    const model = builder.modelRecord({
      id: `${PLUGIN_ID}:model:${run.engineVersion}`,
      datasetId: 'us.food.hazard-model-registry.v1',
      contentHash: MODEL_HASH,
      parentIds: datasets.map((row) => row.id),
      metadata: {
        engineVersion: run.engineVersion,
        seed: run.seed,
        claimBoundary: 'Synthetic scenario estimate, not a live recall alert.',
      },
    });
    const simulated = builder.provenance({
      origin: 'simulated',
      temporalStatus: 'forecast',
      uncertainty: {
        kind: 'distribution',
        value: {
          seed: run.seed,
          ensemble: 'single realization unless ensemble control is run',
        },
      },
      records: [model],
    });
    const scenarioClaim = builder.provenance({
      origin: 'scenario',
      temporalStatus: 'forecast',
      uncertainty: {
        kind: 'missing',
        value: { calibration: 'synthetic facility and corridor network' },
      },
      records: [model],
    });
    const events = lineageEvents(run, simulated);
    const layers = [
      ...facilityLayers(facilities, facilityRecordById, run, model),
      ...corridorLayers(corridors, corridorRecords, facilities, scenarioClaim),
      ...zoneLayers(consumerZones, zoneRecords, run, simulated),
    ];
    const highlighted = layers.filter((row) => row.role === 'event').map((row) => row.id);
    const visual = builder.presentation({
      pluginId: PLUGIN_ID,
      coordinateSystem: 'wgs84',
      layers,
      viewIntents: [
        builder.viewIntent({
          id: 'food-network-overview',
          mode: 'overview',
          targetIds: highlighted.length ? highlighted : layers.slice(0, 12).map((row) => row.id),
          reasonEventId: events.at(-1)?.id || null,
          priority: 55,
        }),
      ],
    });
    const controls = builder.controls([
      {
        id: 'recallDay',
        label: 'Recall day',
        kind: 'number',
        value: activeIntervention?.dayOffset ?? scenario.defaultIntervention.dayOffset,
        options: null,
        minimum: 0,
        maximum: scenario.durationDays,
        step: 1,
        provenance: scenarioClaim,
      },
      {
        id: 'recallDepth',
        label: 'Recall depth',
        kind: 'select',
        value: activeIntervention?.depth ?? scenario.defaultIntervention.depth,
        options: [
          { value: 'retail', label: 'Retail' },
          { value: 'consumer', label: 'Consumer' },
        ],
        minimum: null,
        maximum: null,
        step: null,
        provenance: scenarioClaim,
      },
    ], [{
      id: 'recall-vs-baseline',
      label: 'Recall intervention vs no recall',
      baselineScenarioId: `${scenario.id}:baseline`,
      variantScenarioId: `${scenario.id}:recall`,
      synchronizedClock: true,
    }]);
    const progressiveState = builder.state({
      id: `${PLUGIN_ID}:state:${run.seed}`,
      pluginId: PLUGIN_ID,
      simulationTimeMs: scenario.durationDays * DAY_MS,
      status: 'settled',
      eventIds: events.map((row) => row.id),
      measures: [
        builder.quantity('true-illnesses', run.trueIllnesses, 'estimated people'),
        builder.quantity('observed-cases', run.observedCases, 'simulated reports'),
        builder.quantity('detection-day', run.detectionDay, 'day'),
        builder.quantity('source-rank', run.trueSourceRank || 0, 'rank'),
        builder.quantity('cases-averted', run.recall?.casesAverted || 0, 'estimated people'),
      ],
      provenance: simulated,
    });
    const inspections = [{
      id: 'food-recall-outcome',
      label: 'Scenario outcome and limits',
      targetIds: highlighted,
      fields: [
        field('scenario', 'Scenario', scenario.label, null, scenarioClaim),
        field('true-illnesses', 'Estimated illnesses', run.trueIllnesses, 'people', simulated),
        field('observed-cases', 'Simulated observed cases', run.observedCases, 'reports', simulated),
        field('detection', 'Detection day', run.detectionDay, 'day', simulated),
        field('claim-boundary', 'Claim boundary', 'Synthetic scenario, not a live recall alert', null, scenarioClaim),
      ],
    }];
    return builder.contribution({
      pluginId: PLUGIN_ID,
      presentation: visual,
      events,
      controls,
      state: progressiveState,
      inspections,
      provenanceRecords: [
        ...datasets,
        ...facilityRecords,
        ...corridorRecords,
        ...zoneRecords,
        model,
      ],
    });
  }

  function lineageEvents(run, provenance) {
    const previousByLot = new Map();
    return run.lineage.map((row, sequence) => {
      const id = `${PLUGIN_ID}:event:${sequence}:${safeId(row.tlcId)}`;
      const causes = [
        previousByLot.get(row.tlcId),
        ...(row.parents || []).map((parent) => previousByLot.get(parent)),
      ].filter(Boolean);
      previousByLot.set(row.tlcId, id);
      return builder.event({
        id,
        pluginId: PLUGIN_ID,
        sequence,
        simulationTimeMs: run.lineage.length < 2
          ? 0
          : Math.round(sequence / (run.lineage.length - 1) * DAY_MS),
        kind: `${PLUGIN_ID}.${row.cte}`,
        causationIds: [...new Set(causes)],
        correlationId: `${PLUGIN_ID}:${run.seed}`,
        payload: row,
        provenance,
      });
    });
  }

  function facilityLayers(facilities, records, run, model) {
    return facilities.map((facility) => {
      const contaminated = run.lots.some((lot) => lot.contaminated && lot.tlcId.includes(`:${facility.id}:`));
      const claim = builder.provenance({
        origin: 'simulated',
        temporalStatus: 'forecast',
        uncertainty: { kind: 'distribution', value: { seed: run.seed } },
        records: [records.get(facility.id), model],
      });
      return builder.layer({
        id: `facility:${facility.id}`,
        kind: 'point',
        label: `${facility.label}: ${contaminated ? 'simulated contamination' : 'no simulated contamination'}`,
        geometry: builder.geometry('point', 'wgs84', [[facility.location.longitude, facility.location.latitude, 0]]),
        quantity: builder.quantity('contamination-state', contaminated ? 1 : 0, 'boolean', [0, 1]),
        role: contaminated ? 'event' : 'context',
        importance: contaminated ? 1 : 0.35,
        aggregationKey: 'food-facilities',
        provenance: claim,
      });
    });
  }

  function corridorLayers(corridors, records, facilities, provenance) {
    const facilityById = new Map(facilities.map((row) => [row.id, row]));
    return corridors.flatMap((corridor, index) => {
      const from = facilityById.get(corridor.fromFacilityId);
      const to = facilityById.get(corridor.toFacilityId);
      if (!from || !to) return [];
      return [builder.layer({
        id: `corridor:${corridor.id || index}`,
        kind: 'path',
        label: `${from.label} to ${to.label}`,
        geometry: builder.geometry('polyline', 'wgs84', [
          [from.location.longitude, from.location.latitude, 0],
          [to.location.longitude, to.location.latitude, 0],
        ]),
        role: 'context',
        importance: 0.2,
        aggregationKey: 'food-corridors',
        provenance: builder.provenance({
          origin: 'scenario',
          temporalStatus: 'forecast',
          uncertainty: provenance.axes.uncertainty,
          records: [records[index]],
        }),
      })];
    });
  }

  function zoneLayers(zones, records, run, provenance) {
    const perZone = run.trueIllnesses / Math.max(1, zones.length);
    return zones.map((zone, index) => {
      const value = Number((perZone * (0.5 + zone.population / 5000000)).toFixed(2));
      return builder.layer({
        id: `zone:${zone.id}`,
        kind: 'field',
        label: `${zone.state}: ${value} estimated illnesses`,
        geometry: builder.geometry('polygon', 'wgs84', zoneRing(zone.location.longitude, zone.location.latitude)),
        quantity: builder.quantity('estimated-illnesses', value, 'people', [0, Math.max(1, perZone * 2)]),
        role: 'uncertainty',
        importance: 0.45,
        aggregationKey: 'consumer-risk-zones',
        provenance: builder.provenance({
          origin: 'simulated',
          temporalStatus: 'forecast',
          uncertainty: provenance.axes.uncertainty,
          records: [records[index], ...provenance.evidenceRefs.map((reference) => ({
            schema: 'simulatte.provenanceRecord.v4',
            id: reference.id,
            kind: 'model',
            datasetId: reference.datasetId,
            contentHash: reference.contentHash,
            parentIds: [],
            metadata: {},
          }))],
        }),
      });
    });
  }

  function zoneRing(longitude, latitude) {
    const delta = 1.6;
    return [
      [longitude - delta, latitude, 0],
      [longitude, latitude + delta, 0],
      [longitude + delta, latitude, 0],
      [longitude, latitude - delta, 0],
    ];
  }

  function field(id, label, value, unit, provenance) {
    return { id, label, value, unit, provenance };
  }

  function safeId(value) {
    return String(value).replace(/[^a-z0-9]+/gi, '-');
  }

  return Object.freeze({ createContribution });
});
