(function attachSafetyExplorerV4(root, factory) {
  const builder = typeof module === 'object' && module.exports
    ? require('../../core/simulation/plugin-v4-builder.js')
    : root.SimulattePluginV4Builder;
  const shrinkage = typeof module === 'object' && module.exports
    ? require('./fixed-sparse-count-shrinkage.js')
    : root.SimulatteFixedSparseCountShrinkage;
  const api = factory(builder, shrinkage);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteSafetyExplorerV4 = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createSafetyExplorerV4(builder, shrinkage) {
  const PLUGIN_ID = 'safety-explorer';
  const MODEL_HASH = '2cf0e2ac6500fb7af22d974f5ef7778cc5da4fab4cb19759619b6d26ab2d384a';

  function createContribution({ audit, index, datasetReceipt, parameters = null }) {
    const selectedParameters = shrinkage.parameters(parameters || audit?.method || {});
    const methodReceipt = shrinkage.methodReceipt(index.segmentRows, selectedParameters);
    const dataset = builder.datasetRecord(index.id, datasetReceipt, {
      title: 'NYC crash history by physical street segment',
      claimBoundary: index.claimBoundary,
      contentVersion: index.contentVersion,
    });
    const model = builder.transformationRecord({
      id: 'safety-explorer:model:fixed-sparse-count-shrinkage-v1',
      datasetId: dataset.datasetId,
      contentHash: MODEL_HASH,
      parentIds: [dataset.id],
      metadata: {
        methodName: 'fixed sparse-count shrinkage',
        formula: methodReceipt.formula,
        k: methodReceipt.k,
        corpusMean: methodReceipt.corpusMean,
        severityWeights: methodReceipt.severityWeights,
        calibrationStatus: methodReceipt.calibrationStatus,
        purpose: 'stabilize sparse segment observations',
        claimBoundary: methodReceipt.claimBoundary,
      },
    });
    const routeRows = audit
      ? [...new Set(audit.segmentIds)].flatMap((segmentId) => {
          const row = index.segmentRows.find((candidate) => candidate.segmentId === segmentId);
          return row ? [row] : [];
        })
      : [];
    const rowRecords = routeRows.map((row) => builder.rowRecord(dataset, row.segmentId, {
      physicalKey: row.physicalKey,
      crashCount: row.crashCount,
      injuryCount: row.injuryCount,
      fatalityCount: row.fatalityCount,
      collisionIds: row.collisionIds,
      maximumJoinDistanceM: row.maximumJoinDistanceM,
      matchStatus: 'joined_to_physical_segment',
    }));
    const rowRecordById = new Map(rowRecords.map((row) => [row.rowId, row]));
    const unknownSegmentIds = audit
      ? [...new Set(audit.segmentIds)].filter((segmentId) => !rowRecordById.has(segmentId))
      : [];
    const observation = builder.provenance({
      origin: 'observed',
      temporalStatus: 'historical',
      uncertainty: {
        kind: 'confidence',
        value: {
          coverage: routeRows.length
            ? routeRows.reduce((sum, row) => sum + shrinkage.evidenceCoverage(row, methodReceipt.k), 0) / routeRows.length
            : 0,
          limitation: 'reported crashes are exposure-unadjusted; zero observations do not establish safety',
        },
      },
      records: rowRecords.length ? rowRecords : [dataset],
    });
    const estimate = builder.provenance({
      origin: 'derived',
      temporalStatus: 'historical',
      uncertainty: {
        kind: 'confidence',
        value: {
          method: methodReceipt.name,
          shrinkageK: methodReceipt.k,
          corpusMean: methodReceipt.corpusMean,
          severityWeights: methodReceipt.severityWeights,
          exposureDenominator: 'missing',
        },
      },
      records: [model, ...rowRecords],
    });
    const unknown = builder.provenance({
      origin: 'derived',
      temporalStatus: 'historical',
      uncertainty: {
        kind: 'missing',
        value: {
          reason: 'no joined crash observation and no traffic, trip, distance, or population exposure denominator',
        },
      },
      records: [dataset, model],
    });
    const eventId = audit ? `${PLUGIN_ID}:route-audited` : null;
    const layers = audit ? [
      ...(routeRows.length ? [builder.layer({
        id: 'observed-route',
        kind: 'path',
        label: 'Reported crash history with fixed sparse-count shrinkage',
        geometry: builder.geometry('segments', 'city-segment-id', routeRows.map((row) => row.segmentId)),
        quantity: builder.quantity(
          'fixed-sparse-count-observation',
          fixedScore(routeRows, methodReceipt),
          'score',
          [0, Math.max(1, fixedScore(index.segmentRows, methodReceipt))],
        ),
        role: 'primary',
        importance: 1,
        provenance: estimate,
      })] : []),
      ...(unknownSegmentIds.length ? [builder.layer({
        id: 'unknown-observation-route',
        kind: 'path',
        label: 'Unknown exposure: no joined crash observation',
        geometry: builder.geometry('segments', 'city-segment-id', unknownSegmentIds),
        quantity: null,
        role: 'uncertainty',
        importance: 0.8,
        provenance: unknown,
      })] : []),
    ] : [];
    const events = audit ? [
      builder.event({
        id: eventId,
        pluginId: PLUGIN_ID,
        sequence: 0,
        simulationTimeMs: 1,
        kind: `${PLUGIN_ID}.route-audited`,
        correlationId: `${PLUGIN_ID}:${audit.indexId}`,
        payload: audit,
        provenance: estimate,
      }),
    ] : [];
    const visual = builder.presentation({
      pluginId: PLUGIN_ID,
      coordinateSystem: 'city-segment-id',
      layers,
      viewIntents: audit ? [
        builder.viewIntent({
          id: 'safety-route-overview',
          mode: 'compare',
          targetIds: layers.map((row) => row.id),
          reasonEventId: eventId,
          priority: 70,
        }),
      ] : [],
    });
    const progressiveState = audit ? builder.state({
      id: `${PLUGIN_ID}:state:route-audited`,
      pluginId: PLUGIN_ID,
      simulationTimeMs: 1,
      status: 'settled',
      eventIds: [eventId],
      measures: [
        builder.quantity('crash-count', audit.crashCount, 'reports'),
        builder.quantity('injury-count', audit.injuryCount, 'reports'),
        builder.quantity('fatality-count', audit.fatalityCount, 'reports'),
        builder.quantity('historical-observation-score', audit.historicalObservationScore, 'score'),
        builder.quantity('fixed-sparse-count-observation', audit.fixedSparseCountEstimate ?? fixedScore(routeRows, methodReceipt), 'score'),
        builder.quantity('unknown-observation-segments', audit.unknownSegmentCount ?? unknownSegmentIds.length, 'segments'),
      ],
      provenance: estimate,
    }) : null;
    const controls = builder.controls([
      numericControl('shrinkageK', 'Shrinkage K', methodReceipt.k, 0, 64, 1, estimate),
      numericControl('crashWeight', 'Crash weight', methodReceipt.severityWeights.crash, 0, 100, 1, estimate),
      numericControl('injuryWeight', 'Injury weight', methodReceipt.severityWeights.injury, 0, 100, 1, estimate),
      numericControl('fatalityWeight', 'Fatality weight', methodReceipt.severityWeights.fatality, 0, 100, 1, estimate),
    ], [{
      id: 'fixed-shrinkage-k-sensitivity',
      label: `K=${methodReceipt.k} baseline vs K=${comparisonK(methodReceipt.k)} sensitivity`,
      baselineScenarioId: `${PLUGIN_ID}:k-${methodReceipt.k}`,
      variantScenarioId: `${PLUGIN_ID}:k-${comparisonK(methodReceipt.k)}`,
      synchronizedClock: true,
    }]);
    const inspections = audit ? [{
      id: 'safety-route-evidence',
      label: 'Route observation and uncertainty evidence',
      targetIds: layers.map((row) => row.id),
      fields: [
        field('reported-crashes', 'Reported crashes', audit.crashCount, 'reports', observation),
        field('reported-injuries', 'Reported injuries', audit.injuryCount, 'reports', observation),
        field('reported-fatalities', 'Reported fatalities', audit.fatalityCount, 'reports', observation),
        field('period-start', 'Observation period start', index.source.periodStart, null, observation),
        field('period-end', 'Observation period end (exclusive)', index.source.periodEndExclusive, null, observation),
        field('source-row-ids', 'Joined source rows', rowRecords.map((row) => row.rowId), null, observation),
        field('collision-ids', 'Observed collision IDs', routeRows.flatMap((row) => row.collisionIds || []), null, observation),
        field('maximum-join-distance', 'Maximum route join distance', routeRows.length ? Math.max(...routeRows.map((row) => row.maximumJoinDistanceM || 0)) : null, 'm', observation),
        field('match-status', 'Match status', audit.segmentEvidence?.map((row) => ({ segmentId: row.segmentId, matchStatus: row.matchStatus })) || unknownSegmentIds.map((segmentId) => ({ segmentId, matchStatus: 'no_history_row' })), null, unknown),
        field('fixed-estimate', 'Fixed sparse-count estimate', audit.fixedSparseCountEstimate ?? fixedScore(routeRows, methodReceipt), 'score', estimate),
        field('formula', 'Fixed sparse-count formula', methodReceipt.formula, null, estimate),
        field('parameters', 'K, corpus mean, severity weights', {
          k: methodReceipt.k,
          corpusMean: methodReceipt.corpusMean,
          severityWeights: methodReceipt.severityWeights,
        }, null, estimate),
        field('unknown-exposure', 'Exposure warning', 'Exposure denominator is missing. Zero observations and unmatched segments are unknown, not safe.', null, unknown),
        field('unmatched-collisions', 'Unmatched source collision IDs', index.unjoinedCollisionIds, null, observation),
        field('claim-warning', 'Decision boundary', 'This method cannot identify or claim a safest route.', null, estimate),
      ],
    }] : [];
    return builder.contribution({
      pluginId: PLUGIN_ID,
      presentation: visual,
      events,
      controls,
      state: progressiveState,
      inspections,
      provenanceRecords: [dataset, model, ...rowRecords],
    });
  }

  function field(id, label, value, unit, provenance) {
    return { id, label, value, unit, provenance };
  }

  function fixedScore(rows, methodReceipt) {
    return Number(rows.reduce((sum, row) => {
      const value = shrinkage.estimate(row, {
        k: methodReceipt.k,
        weights: methodReceipt.severityWeights,
        corpusMean: methodReceipt.corpusMean,
      });
      return sum + (value || 0);
    }, 0).toFixed(4));
  }

  function numericControl(id, label, value, minimum, maximum, step, provenance) {
    return {
      id,
      label,
      kind: 'number',
      value,
      options: null,
      minimum,
      maximum,
      step,
      provenance,
    };
  }

  function comparisonK(k) {
    return Math.min(64, Math.max(1, k * 2));
  }

  return Object.freeze({ createContribution });
});
