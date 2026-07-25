(function attachOrbitalTransferV4(root, factory) {
  const builder = typeof module === 'object' && module.exports
    ? require('../../core/simulation/plugin-v4-builder.js')
    : root.SimulattePluginV4Builder;
  const api = factory(builder);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.OrbitalTransferV4 = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createOrbitalTransferV4(builder) {
  const PLUGIN_ID = 'orbital-transfer-planner';
  const MODEL_HASH = 'c21e2c257506a1d550f9ce62ce0ea746afa7ed83285e4e72ab5e7c2473da29e6';

  function createContribution({ result, ephemerisData, datasetReceipts, profileWeights = {} }) {
    const datasets = datasetReceipts.filter((row) => row.receipt).map((row) => builder.datasetRecord(row.id, row.receipt, {
      claimBoundary: row.value?.provenance?.claimBoundary || null,
    }));
    const datasetById = new Map(datasets.map((row) => [row.id, row]));
    const ephemeris = datasetById.get('jpl.horizons.heliocentric-vectors.v1');
    const bodyRecords = Object.entries(ephemerisData.bodies || {}).map(([id, body]) => builder.rowRecord(ephemeris, id, {
      label: body.name || id,
      vectorCount: body.vectors?.length || 0,
    }));
    const bodyRecordById = new Map(bodyRecords.map((row) => [row.rowId, row]));
    const model = builder.modelRecord({
      id: `${PLUGIN_ID}:model:launch-window-v1`,
      datasetId: ephemeris.datasetId,
      contentHash: MODEL_HASH,
      parentIds: datasets.slice(0, 2).map((row) => row.id),
      metadata: {
        algorithms: ['universal-variable Lambert', 'launch-window scan', 'circular Hohmann fallback'],
        claimBoundary: result.claimBoundary,
      },
    });
    const stateVectorClaim = (bodyId) => builder.provenance({
      origin: 'modeled',
      temporalStatus: 'snapshot',
      uncertainty: {
        kind: 'missing',
        value: { covariance: 'not included in pinned vectors' },
      },
      records: [bodyRecordById.get(bodyId)],
    });
    const transferClaim = builder.provenance({
      origin: 'modeled',
      temporalStatus: 'forecast',
      uncertainty: {
        kind: 'missing',
        value: {
          navigationCovariance: true,
          maneuverExecutionError: true,
          nBodyPerturbations: true,
        },
      },
      records: [model],
    });
    const layers = [];
    Object.entries(ephemerisData.bodies || {}).forEach(([id, body]) => {
      const vectors = body.vectors || [];
      const current = vectors[0]?.positionAu;
      if (current) {
        layers.push(builder.layer({
          id: `body:${id}`,
          kind: 'point',
          label: body.name || id,
          geometry: builder.geometry('point', 'heliocentric-ecliptic-au', [current]),
          quantity: builder.quantity('heliocentric-distance', magnitude(current), 'au'),
          role: id === result.targetBodyId || id === 'earth' ? 'primary' : 'context',
          importance: id === result.targetBodyId || id === 'earth' ? 0.9 : 0.35,
          aggregationKey: 'solar-system-bodies',
          provenance: stateVectorClaim(id),
        }));
      }
      const orbit = vectors.filter((_, index) => index % 5 === 0).map((row) => row.positionAu);
      if (orbit.length >= 2) {
        layers.push(builder.layer({
          id: `orbit:${id}`,
          kind: 'path',
          label: `${body.name || id} pinned reference path`,
          geometry: builder.geometry('polyline', 'heliocentric-ecliptic-au', orbit),
          role: 'context',
          importance: id === result.targetBodyId || id === 'earth' ? 0.55 : 0.15,
          aggregationKey: 'reference-orbits',
          provenance: stateVectorClaim(id),
        }));
      }
    });
    const trajectory = result.selected?.trajectory || result.fallback?.trajectory || [];
    if (trajectory.length >= 2) {
      layers.push(builder.layer({
        id: 'transfer-trajectory',
        kind: 'path',
        label: result.selected ? 'Selected Lambert transfer' : 'Circular Hohmann fallback chord',
        geometry: builder.geometry('polyline', 'heliocentric-ecliptic-au', trajectory),
        quantity: builder.quantity('total-delta-v', result.metrics.totalDeltaVKmS, 'km/s', [0, 20]),
        role: 'primary',
        importance: 1,
        provenance: transferClaim,
      }));
    }
    const eventId = `${PLUGIN_ID}:event:${result.scenarioId}`;
    const events = [builder.event({
      id: eventId,
      pluginId: PLUGIN_ID,
      sequence: 0,
      simulationTimeMs: 0,
      kind: `${PLUGIN_ID}.transfer-computed`,
      correlationId: `${PLUGIN_ID}:${result.scenarioId}`,
      payload: {
        scenarioId: result.scenarioId,
        targetBodyId: result.targetBodyId,
        selectedCandidateId: result.selected?.id || null,
        algorithm: result.metrics.algorithm,
      },
      provenance: transferClaim,
    })];
    const targetIds = ['transfer-trajectory', `body:earth`, `body:${result.targetBodyId}`]
      .filter((id) => layers.some((row) => row.id === id));
    const visual = builder.presentation({
      pluginId: PLUGIN_ID,
      coordinateSystem: 'heliocentric-ecliptic-au',
      epoch: ephemerisData.epochStart || ephemerisData.epoch?.start || null,
      layers,
      viewIntents: [
        builder.viewIntent({
          id: 'transfer-overview',
          mode: 'compare',
          targetIds,
          reasonEventId: eventId,
          priority: 70,
        }),
      ],
    });
    const controls = builder.controls([
      numericControl('deltaVWeight', 'Δv weight', profileWeights.deltaV ?? 1, 0, 10, 0.1, transferClaim),
      numericControl('timeWeight', 'Flight-time weight', profileWeights.timeOfFlight ?? profileWeights.timeOfFlightDays ?? 0.01, 0, 1, 0.01, transferClaim),
    ], [{
      id: 'lambert-vs-hohmann',
      label: 'Selected transfer vs circular Hohmann baseline',
      baselineScenarioId: 'earth-mars-circular-hohmann',
      variantScenarioId: result.scenarioId,
      synchronizedClock: true,
    }]);
    const progressiveState = builder.state({
      id: `${PLUGIN_ID}:state:${result.scenarioId}`,
      pluginId: PLUGIN_ID,
      simulationTimeMs: 0,
      status: 'settled',
      eventIds: [eventId],
      measures: [
        builder.quantity('solution-count', result.metrics.solutionCount, 'solutions'),
        builder.quantity('attempted-count', result.metrics.attemptedCount, 'candidates'),
        builder.quantity('time-of-flight', result.metrics.timeOfFlightDays, 'day'),
        builder.quantity('total-delta-v', result.metrics.totalDeltaVKmS, 'km/s'),
        builder.quantity('radiation-exposure-proxy', result.metrics.radiationExposureUnits, 'shielded proton units'),
      ],
      provenance: transferClaim,
    });
    const inspections = [{
      id: 'transfer-plan',
      label: 'Transfer plan and validity boundary',
      targetIds,
      fields: [
        field('target', 'Target', result.targetBodyId, null, transferClaim),
        field('departure', 'Departure epoch', result.metrics.departureEpoch || 'circular fallback', null, transferClaim),
        field('arrival', 'Arrival epoch', result.metrics.arrivalEpoch || 'circular fallback', null, transferClaim),
        field('flight-time', 'Time of flight', result.metrics.timeOfFlightDays, 'day', transferClaim),
        field('delta-v', 'Total Δv', result.metrics.totalDeltaVKmS, 'km/s', transferClaim),
        field('boundary', 'Claim boundary', result.claimBoundary, null, transferClaim),
      ],
    }];
    return builder.contribution({
      pluginId: PLUGIN_ID,
      presentation: visual,
      events,
      controls,
      state: progressiveState,
      inspections,
      provenanceRecords: [...datasets, ...bodyRecords, model],
    });
  }

  function numericControl(id, label, value, minimum, maximum, step, provenance) {
    return { id, label, kind: 'number', value, options: null, minimum, maximum, step, provenance };
  }

  function field(id, label, value, unit, provenance) {
    return { id, label, value, unit, provenance };
  }

  function magnitude(vector) {
    return Math.hypot(...vector);
  }

  return Object.freeze({ createContribution });
});
