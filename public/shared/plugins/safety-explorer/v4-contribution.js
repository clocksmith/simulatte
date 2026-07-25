(function attachSafetyExplorerV4(root, factory) {
  const builder = typeof module === 'object' && module.exports
    ? require('../../core/simulation/plugin-v4-builder.js')
    : root.SimulattePluginV4Builder;
  const api = factory(builder);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteSafetyExplorerV4 = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createSafetyExplorerV4(builder) {
  const PLUGIN_ID = 'safety-explorer';
  const MODEL_HASH = 'e3812693abbf07087447ce5117eb8e89c43b5b1ac358e2e2eb90fbdf7d4cbdbb';

  function createContribution({ audit, index, datasetReceipt }) {
    const dataset = builder.datasetRecord(index.id, datasetReceipt, {
      title: 'NYC crash history by physical street segment',
      claimBoundary: index.claimBoundary,
    });
    const model = builder.transformationRecord({
      id: 'safety-explorer:model:severity-shrinkage-v1',
      datasetId: dataset.datasetId,
      contentHash: MODEL_HASH,
      parentIds: [dataset.id],
      metadata: {
        formula: '(n * (crashes + 3 * injuries + 10 * fatalities) + 4 * corpusMean) / (n + 4)',
        purpose: 'stabilize sparse segment observations',
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
    }));
    const observation = builder.provenance({
      origin: 'observed',
      temporalStatus: 'historical',
      uncertainty: {
        kind: 'confidence',
        value: {
          coverage: routeRows.length
            ? routeRows.reduce((sum, row) => sum + row.crashCount / (row.crashCount + 4), 0) / routeRows.length
            : 0,
          limitation: 'crash reports are exposure-unadjusted and sparse',
        },
      },
      records: rowRecords.length ? rowRecords : [dataset],
    });
    const estimate = builder.provenance({
      origin: 'derived',
      temporalStatus: 'historical',
      uncertainty: {
        kind: 'confidence',
        value: { shrinkageK: 4, exposureDenominator: 'missing' },
      },
      records: [model, ...rowRecords],
    });
    const eventId = audit ? `${PLUGIN_ID}:route-audited` : null;
    const layers = audit ? [
      builder.layer({
        id: 'observed-route',
        kind: 'path',
        label: 'Observed crashes and severity estimate',
        geometry: builder.geometry('segments', 'city-segment-id', audit.segmentIds),
        quantity: builder.quantity('severity-weighted-observation', derivedScore(routeRows), 'score', [0, Math.max(1, derivedScore(index.segmentRows))]),
        role: 'primary',
        importance: 1,
        provenance: estimate,
      }),
    ] : [];
    const events = audit ? [
      builder.event({
        id: eventId,
        pluginId: PLUGIN_ID,
        sequence: 0,
        simulationTimeMs: 0,
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
          targetIds: ['observed-route'],
          reasonEventId: eventId,
          priority: 70,
        }),
      ] : [],
    });
    const progressiveState = audit ? builder.state({
      id: `${PLUGIN_ID}:state:route-audited`,
      pluginId: PLUGIN_ID,
      simulationTimeMs: 0,
      status: 'settled',
      eventIds: [eventId],
      measures: [
        builder.quantity('crash-count', audit.crashCount, 'reports'),
        builder.quantity('injury-count', audit.injuryCount, 'reports'),
        builder.quantity('fatality-count', audit.fatalityCount, 'reports'),
        builder.quantity('historical-observation-score', audit.historicalObservationScore, 'score'),
      ],
      provenance: estimate,
    }) : null;
    const inspections = audit ? [{
      id: 'safety-route-evidence',
      label: 'Route evidence',
      targetIds: ['observed-route'],
      fields: [
        field('reported-crashes', 'Reported crashes', audit.crashCount, 'reports', observation),
        field('reported-injuries', 'Reported injuries', audit.injuryCount, 'reports', observation),
        field('reported-fatalities', 'Reported fatalities', audit.fatalityCount, 'reports', observation),
        field('derived-risk', 'Severity-weighted estimate', derivedScore(routeRows), 'score', estimate),
      ],
    }] : [];
    return builder.contribution({
      pluginId: PLUGIN_ID,
      presentation: visual,
      events,
      state: progressiveState,
      inspections,
      provenanceRecords: [dataset, model, ...rowRecords],
    });
  }

  function field(id, label, value, unit, provenance) {
    return { id, label, value, unit, provenance };
  }

  function derivedScore(rows) {
    return Number(rows.reduce((sum, row) => sum + (row.crashCount || 0) + 3 * (row.injuryCount || 0) + 10 * (row.fatalityCount || 0), 0).toFixed(4));
  }

  return Object.freeze({ createContribution });
});
