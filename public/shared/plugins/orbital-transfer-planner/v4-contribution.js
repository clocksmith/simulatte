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
  const VERIFIER_HASH = 'df8ac302c5450b95c88d68d182ffe8fe81c5633ea1c46a43c1993f6f9fc0ef03';

  function createContribution({ result, ephemerisData, datasetReceipts, profileWeights = {}, playback = null }) {
    const currentStep = playback?.cursor ?? playback?.currentStep ?? Number.MAX_SAFE_INTEGER;
    const searchVisible = currentStep >= 1;
    const selectionVisible = currentStep >= 3;
    const verificationVisible = currentStep >= 4;
    const flightFraction = flightProgress(currentStep);
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
        algorithms: [
          'universal-variable single-revolution Lambert',
          'bounded launch-window grid scan',
          'circular coplanar Hohmann screening baseline',
        ],
        solverReceipt: result.solverReceipt || null,
        claimBoundary: result.claimBoundary,
      },
    });
    const verifier = builder.modelRecord({
      id: `${PLUGIN_ID}:model:n-body-verifier-v1`,
      datasetId: ephemeris.datasetId,
      contentHash: VERIFIER_HASH,
      parentIds: datasets.slice(0, 2).map((row) => row.id),
      metadata: {
        method: result.verification?.methodId || 'heliocentric-rk4-third-body-verifier-v1',
        forceModel: result.verification?.forceModel || null,
        stepDays: result.verification?.stepDays || null,
        tolerance: result.verification?.tolerance || null,
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
          endpointBodySphereOfInfluenceTransitions: true,
          verificationStatus: result.claimGate?.status || 'not_supplied',
        },
      },
      records: result.verification ? [model, verifier] : [model],
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
    const trajectory = result.verification?.trajectory?.map((row) => row.positionAu)
      || result.selected?.trajectory
      || result.fallback?.trajectory
      || [];
    const deltaVScaleMaximumKmS = Math.max(
      20,
      Math.ceil(Number(result.metrics.totalDeltaVKmS || 0) / 5) * 5,
    );
    if (selectionVisible && trajectory.length >= 2) {
      layers.push(builder.layer({
        id: 'transfer-trajectory',
        kind: 'path',
        label: result.selected
          ? result.verification?.accepted
            ? 'Lambert transfer with accepted screening verification'
            : 'Approximate Lambert transfer'
          : 'Circular coplanar Hohmann screening chord',
        geometry: builder.geometry('polyline', 'heliocentric-ecliptic-au', trajectory),
        quantity: builder.quantity('total-delta-v', result.metrics.totalDeltaVKmS, 'km/s', [0, deltaVScaleMaximumKmS]),
        role: 'primary',
        importance: 1,
        provenance: transferClaim,
      }));
    }
    const actorPosition = pointAlong(trajectory, flightFraction);
    if (actorPosition) {
      layers.push(builder.layer({
        id: 'screening-spacecraft',
        kind: 'actor',
        label: `Modeled coast · ${Math.round(flightFraction * 100)}%`,
        geometry: builder.geometry('point', 'heliocentric-ecliptic-au', [actorPosition]),
        quantity: builder.quantity('flight-progress', flightFraction, 'ratio', [0, 1]),
        role: 'event',
        importance: 1,
        provenance: transferClaim,
      }));
    }
    const eventId = `${PLUGIN_ID}:event:${result.scenarioId}`;
    const events = currentStep > 0 ? [builder.event({
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
        solverReceipt: result.solverReceipt || null,
        verification: result.verification
          ? {
            accepted: result.verification.accepted,
            positionErrorKm: result.verification.endpoint.positionErrorKm,
            velocityErrorKmS: result.verification.endpoint.velocityErrorKmS,
          }
          : null,
        claimGate: result.claimGate || null,
      },
      provenance: transferClaim,
    })] : [];
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
          reasonEventId: events[0]?.id || null,
          priority: 70,
        }),
      ],
    });
    const controls = builder.controls([
      numericControl('deltaVWeight', 'Δv weight', profileWeights.deltaV ?? 1, 0, 10, 0.1, transferClaim),
      numericControl('timeWeight', 'Flight-time weight', profileWeights.timeOfFlight ?? profileWeights.timeOfFlightDays ?? 0.01, 0, 1, 0.01, transferClaim),
    ], [{
      id: 'lambert-vs-hohmann',
      label: 'Selected transfer vs circular coplanar Hohmann screening baseline',
      baselineScenarioId: result.targetBodyId === 'mars'
        ? 'earth-mars-circular-hohmann'
        : `earth-${result.targetBodyId}-circular-coplanar-hohmann-screening`,
      variantScenarioId: result.scenarioId,
      synchronizedClock: true,
    }]);
    const progressiveState = builder.state({
      id: `${PLUGIN_ID}:state:${result.scenarioId}:${Number.isFinite(currentStep) ? currentStep : 'settled'}`,
      pluginId: PLUGIN_ID,
      simulationTimeMs: Number.isFinite(flightFraction)
        ? Math.round(result.metrics.timeOfFlightDays * flightFraction * 86400000)
        : 0,
      status: playback?.status || 'settled',
      eventIds: events.map((row) => row.id),
      measures: [
        ...(searchVisible ? [
          builder.quantity('solution-count', result.metrics.solutionCount, 'solutions'),
          builder.quantity('attempted-count', result.metrics.attemptedCount, 'candidates'),
        ] : []),
        ...(selectionVisible ? [
          builder.quantity('time-of-flight', result.metrics.timeOfFlightDays, 'day'),
          builder.quantity('total-delta-v', result.metrics.totalDeltaVKmS, 'km/s'),
        ] : []),
        ...(playback?.status === 'settled'
          ? [builder.quantity('radiation-exposure-proxy', result.metrics.radiationExposureUnits, 'shielded proton units')]
          : []),
        ...(verificationVisible && Number.isFinite(result.metrics.endpointPositionErrorKm)
          ? [builder.quantity('endpoint-position-error', result.metrics.endpointPositionErrorKm, 'km')]
          : []),
        ...(verificationVisible && Number.isFinite(result.metrics.endpointVelocityErrorKmS)
          ? [builder.quantity('endpoint-velocity-error', result.metrics.endpointVelocityErrorKmS, 'km/s')]
          : []),
      ],
      provenance: transferClaim,
    });
    const inspections = [{
      id: 'transfer-plan',
      label: 'Transfer plan and validity boundary',
      targetIds,
      fields: [
        field('solver-stage', 'Solver stage', playback?.stage?.label || 'Settled result', null, transferClaim),
        field('solver-narrative', 'What changed', playback?.stage?.narrative || result.claimBoundary, null, transferClaim),
        field('target', 'Target', result.targetBodyId, null, transferClaim),
        field('departure', 'Departure epoch', result.metrics.departureEpoch || 'circular fallback', null, transferClaim),
        field('arrival', 'Arrival epoch', result.metrics.arrivalEpoch || 'circular fallback', null, transferClaim),
        field('flight-time', 'Time of flight', result.metrics.timeOfFlightDays, 'day', transferClaim),
        field('delta-v', 'Total Δv', result.metrics.totalDeltaVKmS, 'km/s', transferClaim),
        field('input-hashes', 'Input artifact SHA-256 identities', result.solverReceipt?.inputHashes || null, null, transferClaim),
        field('frame', 'Reference frame', result.solverReceipt?.ephemeris?.frame || null, null, stateVectorClaim('earth')),
        field('center', 'Ephemeris center', result.solverReceipt?.ephemeris?.center || null, null, stateVectorClaim('earth')),
        field('time-scale', 'Epoch time scale', result.solverReceipt?.ephemeris?.timeScale || null, null, stateVectorClaim('earth')),
        field('branch', 'Lambert branch', result.solverReceipt?.branch || null, null, transferClaim),
        field('revolutions', 'Revolution count', result.solverReceipt?.revolutionCount ?? 0, 'revolutions', transferClaim),
        field('grid-bounds', 'Search grid bounds', result.solverReceipt?.gridBounds || null, null, transferClaim),
        field('iterations', 'Solver iterations', result.solverReceipt?.iterations || null, 'iterations', transferClaim),
        field('tolerance', 'Solver tolerance', result.solverReceipt?.toleranceDays || null, 'day', transferClaim),
        field('residual', 'Solver residual', result.solverReceipt?.residualDays ?? null, 'day', transferClaim),
        field('rejected-candidates', 'Rejected candidates', {
          count: result.solverReceipt?.rejectedCandidateCount ?? null,
          reasons: result.solverReceipt?.rejectionCounts || null,
        }, null, transferClaim),
        field('fallback', 'Fallback reason and assumptions', result.fallback || null, null, transferClaim),
        field('position-error', 'Independent endpoint position error', result.verification?.endpoint.positionErrorKm ?? null, 'km', transferClaim),
        field('velocity-error', 'Independent endpoint velocity error', result.verification?.endpoint.velocityErrorKmS ?? null, 'km/s', transferClaim),
        field('claim-gate', 'Claim gate', result.claimGate || {
          status: 'legacy_result_without_verification',
          blocked: ['validated flight path', 'navigation product', 'certification evidence'],
        }, null, transferClaim),
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
      provenanceRecords: [...datasets, ...bodyRecords, model, verifier],
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

  function flightProgress(cursor) {
    if (cursor < 5) return null;
    return [0.25, 0.5, 0.75, 1][Math.min(3, cursor - 5)];
  }

  function pointAlong(points, fraction) {
    if (!Number.isFinite(fraction) || !Array.isArray(points) || points.length < 2) return null;
    const index = Math.min(points.length - 1, Math.max(0, Math.round((points.length - 1) * fraction)));
    return points[index];
  }

  return Object.freeze({ createContribution });
});
