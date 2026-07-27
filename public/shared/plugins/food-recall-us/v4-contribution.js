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
    inputContext,
    playback = null,
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
    const inputRecords = buildInputRecords(inputContext, datasetById, model);
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
    const appliedInputProvenance = builder.provenance({
      origin: 'derived',
      temporalStatus: 'forecast',
      uncertainty: {
        kind: 'distribution',
        value: {
          seed: run.seed,
          inputUncertainty: 'retained independently in weather, refrigeration, and logistics field receipts',
        },
      },
      records: [model, ...inputRecords],
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
    const activeCorridorIds = activeCorridors(run);
    const layers = [
      ...facilityLayers(facilities, facilityRecordById, run, model),
      ...corridorLayers(corridors, corridorRecords, facilities, activeCorridorIds, run, model),
      ...zoneLayers(consumerZones, zoneRecords, run, simulated),
    ];
    const highlighted = layers.filter((row) => row.role === 'event').map((row) => row.id);
    const activeNetwork = layers
      .filter((row) => row.role === 'event' || row.role === 'primary')
      .map((row) => row.id);
    const visual = builder.presentation({
      pluginId: PLUGIN_ID,
      coordinateSystem: 'wgs84',
      layers,
      viewIntents: [
        builder.viewIntent({
          id: 'food-network-overview',
          mode: 'overview',
          targetIds: activeNetwork.length ? activeNetwork : highlighted,
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
      id: `${PLUGIN_ID}:state:${run.seed}:${playback?.currentStep || 0}`,
      pluginId: PLUGIN_ID,
      simulationTimeMs: Math.round(
        scenario.durationDays * DAY_MS
        * ((playback?.currentStep || 0) / Math.max(1, playback?.totalSteps || 1))
      ),
      status: playback?.status || 'settled',
      eventIds: events.map((row) => row.id),
      measures: [
        builder.quantity('true-illnesses', run.trueIllnesses, 'estimated people'),
        builder.quantity('observed-cases', run.observedCases, 'simulated reports'),
        builder.quantity('detection-day', run.detectionDay, 'day'),
        builder.quantity('source-rank', run.trueSourceRank || 0, 'rank'),
        builder.quantity('cases-averted', run.recall?.casesAverted || 0, 'estimated people'),
        builder.quantity('shipment-duration', run.shipmentDurationHours || 0, 'hours'),
        builder.quantity('refrigeration-failures', run.refrigerationFailures || 0, 'events'),
        builder.quantity('logistics-availability', run.inputContext?.logisticsAvailability ?? 1, 'fraction', [0, 1]),
        builder.quantity('displayed-active-routes', activeCorridorIds.size, 'routes'),
      ],
      provenance: appliedInputProvenance,
    });
    const inspections = [{
      id: 'food-recall-outcome',
      label: 'Scenario outcome and limits',
      targetIds: highlighted,
      fields: [
        field('incident-stage', 'Incident stage', playback?.stage?.label || 'Ready', null, scenarioClaim),
        field('incident-narrative', 'What changed', playback?.stage?.narrative || 'No modeled outcome revealed yet', null, scenarioClaim),
        field('scenario', 'Scenario', scenario.label, null, scenarioClaim),
        field('true-illnesses', 'Estimated illnesses', run.trueIllnesses, 'people', simulated),
        field('observed-cases', 'Simulated observed cases', run.observedCases, 'reports', simulated),
        field('detection', 'Detection day', run.detectionDay, 'day', simulated),
        field('ambient-temperature', 'Applied ambient temperature', run.inputContext?.ambientTemperatureC ?? null, 'degC', inputClaim(inputContext?.weather, inputRecords)),
        field('logistics-delay', 'Applied logistics delay per shipment', run.inputContext?.logisticsDelayHours ?? null, 'hours', inputClaim(inputContext?.logistics, inputRecords)),
        field('logistics-availability', 'Applied delivery availability', run.inputContext?.logisticsAvailability ?? null, 'fraction', inputClaim(inputContext?.logistics, inputRecords)),
        field('refrigeration-failures', 'Simulated refrigeration failures', run.refrigerationFailures ?? null, 'events', inputClaim(inputContext?.refrigeration, inputRecords)),
        field('presentation-scope', 'Displayed network', `${activeCorridorIds.size} run-used routes; unused scenario routes hidden`, null, appliedInputProvenance),
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
        ...inputRecords,
      ],
    });
  }

  function buildInputRecords(inputContext, datasetById, model) {
    if (!inputContext) return [];
    const environmentDataset = datasetById.get('us.environment.snapshot.v1');
    const corridorsDataset = datasetById.get('us.food.freight-corridors.v1');
    return [inputContext.weather, inputContext.logistics, inputContext.refrigeration].filter(Boolean).map((fieldInput) => {
      const parent = fieldInput === inputContext.weather
        ? environmentDataset
        : fieldInput === inputContext.logistics ? corridorsDataset : model;
      return builder.transformationRecord({
        id: `${PLUGIN_ID}:input:${safeId(fieldInput.fieldIdentity)}`,
        datasetId: parent?.datasetId || PLUGIN_ID,
        contentHash: parent?.contentHash || MODEL_HASH,
        parentIds: parent ? [parent.id] : [model.id],
        metadata: {
          fieldIdentity: fieldInput.fieldIdentity,
          timestamp: fieldInput.timestamp,
          unit: fieldInput.unit,
          interpolation: fieldInput.interpolation,
          providerId: fieldInput.providerId,
          sourceRowIds: fieldInput.sourceRowIds,
          fallback: fieldInput.fallback,
        },
        lineage: {
          axes: fieldInput.truth,
          contentVersion: fieldInput.fieldIdentity,
          transformationChain: [fieldInput.interpolation],
        },
      });
    });
  }

  function inputClaim(fieldInput, records) {
    const record = records.find((row) => row.metadata.fieldIdentity === fieldInput?.fieldIdentity);
    if (!fieldInput || !record) {
      return builder.provenance({
        origin: 'scenario',
        temporalStatus: 'forecast',
        uncertainty: { kind: 'missing', value: { reason: 'input field unavailable' } },
        records: [],
      });
    }
    return builder.provenance({
      origin: fieldInput.truth.origin,
      temporalStatus: fieldInput.truth.temporalStatus,
      uncertainty: fieldInput.truth.uncertainty,
      records: [record],
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
        simulationTimeMs: Number.isFinite(row.timeHours)
          ? Math.round(row.timeHours * 3600000)
          : run.lineage.length < 2
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
        label: facilityLabel(facility, contaminated),
        geometry: builder.geometry('point', 'wgs84', [[facility.location.longitude, facility.location.latitude, 0]]),
        quantity: builder.quantity('contamination-state', contaminated ? 1 : 0, 'boolean', [0, 1]),
        role: contaminated ? 'event' : 'context',
        importance: contaminated ? 1 : 0.35,
        aggregationKey: null,
        provenance: claim,
      });
    });
  }

  function corridorLayers(corridors, records, facilities, activeCorridorIds, run, model) {
    const facilityById = new Map(facilities.map((row) => [row.id, row]));
    return corridors.flatMap((corridor, index) => {
      if (!activeCorridorIds.has(corridor.id)) return [];
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
        quantity: builder.quantity('run-used-route', 1, 'boolean', [0, 1]),
        role: 'primary',
        importance: 0.7,
        aggregationKey: 'food-corridors',
        provenance: builder.provenance({
          origin: 'derived',
          temporalStatus: 'forecast',
          uncertainty: {
            kind: 'distribution',
            value: {
              seed: run.seed,
              meaning: 'route was selected by this simulation realization',
            },
          },
          records: [records[index], model],
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
    const delta = 0.65;
    return [
      [longitude - delta, latitude, 0],
      [longitude, latitude + delta, 0],
      [longitude + delta, latitude, 0],
      [longitude, latitude - delta, 0],
    ];
  }

  function activeCorridors(run) {
    return new Set((run.lineage || []).map((row) => row.corridorId).filter(Boolean));
  }

  function facilityLabel(facility, contaminated) {
    const state = facility.location?.state || 'US';
    const kind = String(facility.facilityKind || 'facility').replaceAll('_', ' ');
    return contaminated
      ? `${state} ${kind}: simulated contamination`
      : `${state} ${kind}`;
  }

  function field(id, label, value, unit, provenance) {
    return { id, label, value, unit, provenance };
  }

  function safeId(value) {
    return String(value).replace(/[^a-z0-9]+/gi, '-');
  }

  return Object.freeze({ createContribution });
});
