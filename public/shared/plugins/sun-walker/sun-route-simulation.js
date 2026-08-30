(function attachSunWalkerRouteSimulation(root, factory) {
  const exposure = typeof module === 'object' && module.exports
    ? require('./sun-exposure.js')
    : root.SimulatteSunExposure;
  const truth = typeof module === 'object' && module.exports
    ? require('./truth.js')
    : root.SimulatteSunWalkerTruth;
  const environment = typeof module === 'object' && module.exports
    ? require('./environment.js')
    : root.SimulatteSunWalkerEnvironment;
  const api = factory(exposure, truth, environment);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteSunWalkerRouteSimulation = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createSunWalkerRouteSimulation(exposure, truthApi, environmentApi) {
  const DIRECT_SUN_TRANSFORM = 'sun-walker.sample-arrival-occlusion.v1';
  const ROUTE_SELECTION_TRANSFORM = 'sun-walker.bounded-alternative-selection.v2';

  function simulate({
    world,
    worldModel,
    routes,
    departureAt,
    config,
    seed,
    buildingReceipt,
    governance,
    governanceReceipt,
    environment,
    environmentReceipt,
  }) {
    validateInputs({ routes, departureAt, config });
    const buildings = exposure.compiledBuildings(world);
    const environmentalScene = environmentApi.compile(environment, world);
    const dataReceipt = createDataReceipt(
      world,
      buildings,
      buildingReceipt,
      governance,
      governanceReceipt,
      environment,
      environmentReceipt
    );
    const modelReceipt = createModelReceipt(config, seed, dataReceipt, governance);
    const candidates = routes.map((route, routeIndex) => evaluateCandidate({
      route,
      routeIndex,
      world,
      worldModel,
      buildings,
      departureAt,
      config,
      dataReceipt,
      modelReceipt,
      environmentalScene,
    }));
    const fastest = candidates.slice().sort(compareFastest)[0];
    const allowedAddedSeconds = Math.min(
      config.maximumAddedTimeSeconds,
      fastest.metrics.travelSeconds * config.maximumAddedRatio
    );
    candidates.forEach((candidate) => {
      candidate.metrics.addedTimeSeconds = round(candidate.metrics.travelSeconds - fastest.metrics.travelSeconds);
      candidate.metrics.detourRatio = fastest.metrics.travelSeconds
        ? round(candidate.metrics.addedTimeSeconds / fastest.metrics.travelSeconds)
        : 0;
      candidate.metrics.withinDetourBound = candidate.metrics.addedTimeSeconds <= allowedAddedSeconds + 1e-9;
    });
    const eligible = candidates.filter((row) => row.metrics.withinDetourBound);
    const selected = (eligible.length ? eligible : candidates).slice().sort(compareObjective)[0];
    const comparison = createComparison(selected, fastest, allowedAddedSeconds, modelReceipt);
    const timeline = createTimeline(selected, dataReceipt, modelReceipt);
    const simulationId = `sun-walk-${truthApi.stableId([
      seed,
      departureAt,
      selected.id,
      selected.samples.map((row) => `${row.segmentId}:${row.state}:${row.directBeamFactor}`).join('|'),
    ].join(':'))}`;
    return truthApi.deepFreeze({
      schema: 'simulatte.plugin.sunWalkerSimulation.v2',
      id: simulationId,
      seed,
      status: 'ready',
      departureAt: new Date(departureAt).toISOString(),
      arrivalAt: selected.arrivalAt,
      selectedCandidateId: selected.id,
      fastestCandidateId: fastest.id,
      candidates,
      comparison,
      timeline: {
        schema: 'simulatte.simulationTimeline.v4',
        clock: 'simulation',
        eventCount: timeline.events.length,
        events: timeline.events,
        snapshots: timeline.snapshots,
      },
      dataReceipt,
      modelReceipt,
      controls: controlDefinitions(config),
      comparisons: comparisonDefinitions(selected, fastest),
      claimBoundary: modelReceipt.claimBoundary,
    });
  }

  function evaluateCandidate({
    route,
    routeIndex,
    world,
    worldModel,
    buildings,
    departureAt,
    config,
    dataReceipt,
    modelReceipt,
    environmentalScene,
  }) {
    const departureMs = Date.parse(departureAt);
    let elapsedSeconds = 0;
    const segments = [];
    const samples = [];
    route.segmentIds.forEach((segmentId, segmentIndex) => {
      const segment = worldModel.segment(segmentId);
      if (!segment) throw simulationError('sun_segment_missing', segmentId);
      const row = evaluateSegment({
        segment,
        segmentIndex,
        enteredAtMs: departureMs + elapsedSeconds * 1000,
        buildings,
        world,
        config,
        dataReceipt,
        modelReceipt,
        environmentalScene,
      });
      row.samples.forEach((sample) => samples.push(sample));
      segments.push(row.summary);
      elapsedSeconds += row.summary.travelSeconds;
    });
    const totals = sumExposure(samples);
    const generalizedCost = totals.travelSeconds
      + totals.directBeamEquivalentSeconds * config.directSunWeight
      + totals.unknownSeconds * config.unknownWeight;
    return {
      schema: 'simulatte.sunWalkerRouteCandidate.v2',
      id: `sun-route-${routeIndex + 1}-${truthApi.stableId(route.segmentIds.join('|'))}`,
      route: { segmentIds: [...route.segmentIds] },
      departureAt: new Date(departureMs).toISOString(),
      arrivalAt: new Date(departureMs + elapsedSeconds * 1000).toISOString(),
      metrics: {
        ...totals,
        modeledBuildingShadePercent: percentage(
          totals.buildingShadeSeconds,
          totals.directSunSeconds + totals.shadeSeconds
        ),
        modeledCanopyShadePercent: percentage(
          totals.canopyShadeSeconds,
          totals.directSunSeconds + totals.shadeSeconds
        ),
        modeledShadePercent: percentage(totals.shadeSeconds, totals.directSunSeconds + totals.shadeSeconds),
        objective: round(generalizedCost),
      },
      segments,
      samples,
      evidenceRefs: [dataReceipt.id, modelReceipt.id],
      truth: modeledTruth(),
    };
  }

  function evaluateSegment({
    segment,
    segmentIndex,
    enteredAtMs,
    buildings,
    world,
    config,
    dataReceipt,
    modelReceipt,
    environmentalScene,
  }) {
    const samplePoints = samplePolylineAtMidpoints(segment.geometry, config.sampleSpacingM);
    const segmentLengthM = Number.isFinite(segment.lengthM) ? segment.lengthM : polylineLength(segment.geometry);
    const travelSeconds = segmentLengthM / config.walkingSpeedMps;
    const sampleSeconds = travelSeconds / samplePoints.length;
    const samples = samplePoints.map((point, sampleIndex) => {
      const arrivalOffsetSeconds = (sampleIndex + 0.5) * sampleSeconds;
      const timestamp = new Date(enteredAtMs + arrivalOffsetSeconds * 1000).toISOString();
      const origin = exposure.worldOrigin(world);
      const sun = exposure.solarPosition(timestamp, origin.lat, origin.lon);
      const result = exposure.pointSunStateDetailed(point, buildings, sun, {
        minimumSolarElevationDegrees: config.minimumSolarElevationDegrees,
      });
      const environmental = environmentApi.sample({
        point,
        sun,
        timestamp,
        environment: environmentalScene,
        config,
      });
      const state = exposureState(result, environmental, config);
      const evidenceRefs = [
        dataReceipt.id,
        modelReceipt.id,
        ...(result.occluderId ? [`building:${result.occluderId}`] : []),
        ...environmental.evidenceRefs,
      ];
      return {
        schema: 'simulatte.sunWalkerExposureSample.v2',
        id: `sample-${segment.id}-${sampleIndex + 1}`,
        timestamp,
        segmentId: segment.id,
        segmentIndex,
        sampleIndex,
        point,
        representedSeconds: round(sampleSeconds),
        geometricState: result.state,
        geometricReason: result.reason,
        state: state.state,
        reason: state.reason,
        occluderId: result.occluderId || environmental.canopy.treeId,
        occluderKind: result.occluderId ? 'building' : environmental.canopy.occluded ? 'tree-canopy' : null,
        directBeamFactor: state.directBeamFactor,
        directBeamEquivalentSeconds: round(sampleSeconds * state.directBeamFactor),
        environment: environmental,
        solarPosition: {
          azimuthDegrees: sun.azimuthDegrees,
          elevationDegrees: sun.elevationDegrees,
        },
        evidenceRefs,
        truth: modeledTruth(),
      };
    });
    const totals = sumExposure(samples);
    return {
      summary: {
        schema: 'simulatte.sunWalkerSegmentExposure.v2',
        segmentId: segment.id,
        enteredAt: new Date(enteredAtMs).toISOString(),
        exitedAt: new Date(enteredAtMs + travelSeconds * 1000).toISOString(),
        ...totals,
        sampleCount: samples.length,
        evidenceRefs: [dataReceipt.id, modelReceipt.id],
        truth: modeledTruth(),
      },
      samples,
    };
  }

  function createTimeline(selected, dataReceipt, modelReceipt) {
    const events = [];
    const snapshots = [];
    let state = emptyState(selected);
    const initialized = createEvent({
      sequence: 0,
      kind: 'sun-walker.walk-initialized',
      timestamp: selected.departureAt,
      causalParents: [],
      affectedEntities: [selected.id],
      before: null,
      after: state,
      evidenceRefs: [dataReceipt.id, modelReceipt.id],
      severity: 0,
    });
    events.push(initialized);
    snapshots.push(createSnapshot(0, initialized.id, state));
    selected.samples.forEach((sample, index) => {
      const before = state;
      state = advanceState(state, sample, index + 1, selected.samples.length);
      const event = createEvent({
        sequence: index + 1,
        kind: `sun-walker.exposure-${sample.state}`,
        timestamp: sample.timestamp,
        causalParents: [events.at(-1).id],
        affectedEntities: [selected.id, sample.segmentId, ...(sample.occluderId ? [sample.occluderId] : [])],
        before,
        after: state,
        evidenceRefs: sample.evidenceRefs,
        severity: sample.state === 'direct' ? 1 : sample.state === 'unknown' ? 0.6 : 0.2,
      });
      events.push(event);
      snapshots.push(createSnapshot(index + 1, event.id, state));
    });
    const completedState = { ...state, status: 'settled', progress: 1 };
    const completed = createEvent({
      sequence: events.length,
      kind: 'sun-walker.walk-completed',
      timestamp: selected.arrivalAt,
      causalParents: [events.at(-1).id],
      affectedEntities: [selected.id],
      before: state,
      after: completedState,
      evidenceRefs: [dataReceipt.id, modelReceipt.id],
      severity: 0,
    });
    events.push(completed);
    snapshots.push(createSnapshot(events.length - 1, completed.id, completedState));
    return { events, snapshots };
  }

  function createEvent({
    sequence,
    kind,
    timestamp,
    causalParents,
    affectedEntities,
    before,
    after,
    evidenceRefs,
    severity,
  }) {
    return {
      schema: 'simulatte.simulationEvent.v4',
      id: `sun-event-${sequence}-${truthApi.stableId(`${kind}:${timestamp}:${affectedEntities.join('|')}`)}`,
      sequence,
      timestamp,
      kind,
      causalParents,
      affectedEntities,
      before,
      after,
      quantities: [{ id: 'exposure-severity', value: severity, units: 'normalized' }],
      evidenceRefs,
      truth: simulatedTruth(),
    };
  }

  function createSnapshot(step, eventId, state) {
    return {
      schema: 'simulatte.progressiveSimulationState.v4',
      step,
      eventId,
      state,
      truth: simulatedTruth(),
    };
  }

  function emptyState(selected) {
    return {
      status: 'ready',
      candidateId: selected.id,
      currentSegmentId: null,
      completedSamples: 0,
      totalSamples: selected.samples.length,
      progress: 0,
      directSunSeconds: 0,
      shadeSeconds: 0,
      geometricDirectSunSeconds: 0,
      geometricShadeSeconds: 0,
      geometricUnknownSeconds: 0,
      geometricNightSeconds: 0,
      buildingShadeSeconds: 0,
      canopyShadeSeconds: 0,
      unknownSeconds: 0,
      nightSeconds: 0,
      directBeamEquivalentSeconds: 0,
    };
  }

  function advanceState(state, sample, completedSamples, totalSamples) {
    const key = `${sample.state === 'direct' ? 'directSun' : sample.state}Seconds`;
    const geometricKey = `geometric${sample.geometricState === 'direct' ? 'DirectSun' : capitalize(sample.geometricState)}Seconds`;
    return {
      ...state,
      status: 'running',
      currentSegmentId: sample.segmentId,
      completedSamples,
      totalSamples,
      progress: round(completedSamples / totalSamples),
      [key]: round(state[key] + sample.representedSeconds),
      [geometricKey]: round(state[geometricKey] + sample.representedSeconds),
      buildingShadeSeconds: round(state.buildingShadeSeconds
        + (sample.state === 'shade' && sample.occluderKind === 'building' ? sample.representedSeconds : 0)),
      canopyShadeSeconds: round(state.canopyShadeSeconds
        + (sample.state === 'shade' && sample.occluderKind === 'tree-canopy' ? sample.representedSeconds : 0)),
      directBeamEquivalentSeconds: round(state.directBeamEquivalentSeconds + sample.directBeamEquivalentSeconds),
    };
  }

  function createDataReceipt(
    world,
    buildings,
    buildingReceipt,
    governance,
    governanceReceipt,
    environment,
    environmentReceipt
  ) {
    const buildingHash = buildingReceipt?.sha256 || world.provenance?.sources?.buildings?.sha256 || null;
    return truthApi.deepFreeze({
      schema: 'simulatte.dataReceipt.v4',
      id: `sun-data-${truthApi.stableId([
        world.id,
        buildingHash,
        governanceReceipt?.sha256 || 'governance',
        environmentReceipt?.sha256 || 'environment',
      ].join(':'))}`,
      datasets: [
        {
          id: 'world.buildings.v1',
          sourceId: buildingReceipt?.id || world.id,
          source: buildingReceipt?.source || 'verified_region_composition',
          retrievalTime: world.provenance?.retrievedAt || null,
          license: world.provenance?.license || 'See governed world source receipt',
          coverage: world.id,
          resolution: 'retained building footprints and available roof heights',
          hash: buildingHash,
          sourceRowIds: buildings.rows.map((row) => row.id),
          truth: observedTruth(buildingHash),
        },
        {
          id: governance.id,
          sourceId: governance.id,
          source: governance.sources.map((row) => row.url).join(' | '),
          retrievalTime: governance.retrievedAt,
          license: governance.license,
          coverage: 'solar position equations and model assumptions',
          resolution: 'equation and assumption registry',
          hash: governanceReceipt?.sha256 || null,
          sourceRowIds: governance.models.map((row) => row.id),
          truth: derivedTruth(),
        },
        {
          id: environment.id,
          sourceId: environment.id,
          source: environment.sources.map((row) => row.url).join(' | '),
          retrievalTime: environment.generatedAt,
          license: environment.sources.map((row) => row.license).join(' | '),
          coverage: environment.coverage,
          resolution: 'source-identified street trees and hourly station observations',
          hash: environmentReceipt?.sha256 || null,
          sourceRowIds: [
            ...environment.canopy.rows.map((row) => row.sourceRowId),
            ...environment.weather.rows.map((row) => row.sourceRowId),
          ],
          sourceReceipts: environment.sources,
          truth: observedHistoricalTruth(environmentReceipt?.sha256),
        },
      ],
      transformations: [
        DIRECT_SUN_TRANSFORM,
        ROUTE_SELECTION_TRANSFORM,
        'sun-walker.building-prism-ray-occlusion.v2',
        'sun-walker.dbh-canopy-envelope.v1',
        'sun-walker.metar-sky-direct-beam-attenuation.v1',
      ],
      truth: derivedTruth(),
    });
  }

  function createModelReceipt(config, seed, dataReceipt, governance) {
    return truthApi.deepFreeze({
      schema: 'simulatte.modelReceipt.v4',
      id: `sun-model-${truthApi.stableId(`${seed}:${JSON.stringify(config)}:${dataReceipt.id}`)}`,
      algorithms: [
        {
          id: 'noaa_fractional_year_reference_v1',
          equationIds: ['fractional-year', 'equation-of-time', 'solar-declination', 'solar-zenith', 'solar-azimuth'],
          citationIds: ['noaa-general-solar-position-calculations'],
        },
        {
          id: 'arrival_time_building_occlusion_v2',
          equationIds: ['sample-arrival-time', 'building-prism-ray-intersection', 'exposure-duration-quadrature'],
          citationIds: [],
        },
        {
          id: 'dbh-canopy-envelope-v1',
          equationIds: ['dbh-to-crown-radius', 'dbh-to-crown-height', 'sun-ray-crown-envelope-intersection'],
          citationIds: ['nyc-2015-street-tree-census'],
        },
        {
          id: 'metar-sky-direct-beam-attenuation-v1',
          equationIds: ['nearest-historical-analog', 'sky-code-direct-beam-factor'],
          citationIds: ['ncei-global-hourly-central-park'],
        },
        {
          id: 'bounded_alternative_route_selection_v2',
          equationIds: ['generalized-exposure-cost', 'maximum-detour-bound'],
          citationIds: [],
        },
      ],
      citations: governance.sources,
      parameters: {
        maximumAlternatives: config.maximumAlternatives,
        directSunWeight: config.directSunWeight,
        unknownWeight: config.unknownWeight,
        maximumAddedTimeSeconds: config.maximumAddedTimeSeconds,
        maximumAddedRatio: config.maximumAddedRatio,
        sampleSpacingM: config.sampleSpacingM,
        walkingSpeedMps: config.walkingSpeedMps,
        minimumSolarElevationDegrees: config.minimumSolarElevationDegrees,
        treeCanopyParticipation: config.treeCanopyParticipation,
        weatherParticipation: config.weatherParticipation,
        canopyShadeThreshold: config.canopyShadeThreshold,
      },
      calibration: {
        status: 'engineering_cases_passed_not_calibrated_against_observed_street_irradiance',
        dataReceiptId: dataReceipt.id,
        cases: dataReceipt.datasets[2].sourceReceipts.map((row) => ({
          sourceId: row.id,
          rawSha256: row.rawSha256,
          sourceRowCount: row.rowCount,
        })),
      },
      seed,
      uncertainty: {
        kind: 'missing',
        value: {
          buildingHeight: 'unknown heights propagate as unknown exposure',
          treeCanopy: 'historical tree identity observed; crown geometry and current presence modeled',
          cloudAndWeather: 'historical station analog; street-scale irradiance missing',
          facadeAndAwningGeometry: 'not available',
        },
      },
      validation: governance.validation,
      truth: modeledTruth(),
      claimBoundary: 'Deterministic direct-beam exposure using retained buildings, historical 2015 street-tree identities with modeled crown envelopes, and a pinned 2024 Central Park weather analog. It is not current observed street shade, measured irradiance, thermal comfort, or a forecast of present canopy or weather.',
    });
  }

  function createComparison(selected, fastest, allowedAddedSeconds, modelReceipt) {
    return truthApi.deepFreeze({
      schema: 'simulatte.plugin.sunWalkerComparison.v2',
      id: `sun-compare-${truthApi.stableId(`${selected.id}:${fastest.id}`)}`,
      baselineCandidateId: fastest.id,
      interventionCandidateId: selected.id,
      synchronizedBy: 'simulated_departure_time',
      metrics: {
        directSunSeconds: {
          baseline: fastest.metrics.directSunSeconds,
          intervention: selected.metrics.directSunSeconds,
          difference: round(selected.metrics.directSunSeconds - fastest.metrics.directSunSeconds),
        },
        directBeamEquivalentSeconds: {
          baseline: fastest.metrics.directBeamEquivalentSeconds,
          intervention: selected.metrics.directBeamEquivalentSeconds,
          difference: round(selected.metrics.directBeamEquivalentSeconds - fastest.metrics.directBeamEquivalentSeconds),
        },
        modeledBuildingShadePercent: {
          baseline: fastest.metrics.modeledBuildingShadePercent,
          intervention: selected.metrics.modeledBuildingShadePercent,
          difference: round(selected.metrics.modeledBuildingShadePercent - fastest.metrics.modeledBuildingShadePercent),
        },
        modeledCanopyShadePercent: {
          baseline: fastest.metrics.modeledCanopyShadePercent,
          intervention: selected.metrics.modeledCanopyShadePercent,
          difference: round(selected.metrics.modeledCanopyShadePercent - fastest.metrics.modeledCanopyShadePercent),
        },
        travelSeconds: {
          baseline: fastest.metrics.travelSeconds,
          intervention: selected.metrics.travelSeconds,
          difference: round(selected.metrics.travelSeconds - fastest.metrics.travelSeconds),
        },
      },
      constraint: { maximumAddedTimeSeconds: round(allowedAddedSeconds) },
      evidenceRefs: [modelReceipt.id],
      truth: modeledTruth(),
    });
  }

  function controlDefinitions(config) {
    return truthApi.deepFreeze([
      control('departureAt', 'datetime', null, 'scenario', 'Departure time (UTC)'),
      control('maximumAddedTimeSeconds', 'number', config.maximumAddedTimeSeconds, 'scenario', 'Maximum absolute detour'),
      control('maximumAddedRatio', 'number', config.maximumAddedRatio, 'scenario', 'Maximum relative detour'),
      control('directSunWeight', 'number', config.directSunWeight, 'scenario', 'Direct-sun preference weight'),
      control('walkingSpeedMps', 'number', config.walkingSpeedMps, 'scenario', 'Walking speed'),
      control('treeCanopyParticipation', 'toggle', config.treeCanopyParticipation, 'scenario', 'Use historical 2015 tree identities with modeled crown envelopes'),
      control('weatherParticipation', 'toggle', config.weatherParticipation, 'scenario', 'Use the pinned 2024 Central Park observation as a historical weather analog'),
    ]);
  }

  function control(id, kind, defaultValue, origin, description, isEnabled = true) {
    return {
      schema: 'simulatte.controlDefinition.v4',
      id,
      kind,
      defaultValue,
      isEnabled,
      description,
      provenance: { origin },
    };
  }

  function comparisonDefinitions(selected, fastest) {
    return [{
      schema: 'simulatte.comparisonDefinition.v4',
      id: 'fastest-versus-shade-selected',
      baseline: { candidateId: fastest.id, label: 'Fastest route' },
      intervention: { candidateId: selected.id, label: 'Shade-selected route' },
      synchronizedBy: 'elapsed_walk_progress',
      metricIds: [
        'directSunSeconds',
        'directBeamEquivalentSeconds',
        'modeledBuildingShadePercent',
        'modeledCanopyShadePercent',
        'travelSeconds',
      ],
    }];
  }

  function sumExposure(samples) {
    const totals = {
      travelSeconds: 0,
      directSunSeconds: 0,
      shadeSeconds: 0,
      buildingShadeSeconds: 0,
      canopyShadeSeconds: 0,
      unknownSeconds: 0,
      nightSeconds: 0,
      directBeamEquivalentSeconds: 0,
    };
    samples.forEach((sample) => {
      totals.travelSeconds += sample.representedSeconds;
      const key = `${sample.state === 'direct' ? 'directSun' : sample.state}Seconds`;
      totals[key] += sample.representedSeconds;
      if (sample.state === 'shade' && sample.occluderKind === 'building') {
        totals.buildingShadeSeconds += sample.representedSeconds;
      }
      if (sample.state === 'shade' && sample.occluderKind === 'tree-canopy') {
        totals.canopyShadeSeconds += sample.representedSeconds;
      }
      totals.directBeamEquivalentSeconds += sample.directBeamEquivalentSeconds;
    });
    return Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, round(value)]));
  }

  function samplePolylineAtMidpoints(points, spacingM) {
    const rows = [];
    for (let index = 1; index < points.length; index += 1) {
      const start = points[index - 1];
      const end = points[index];
      const lengthM = Math.hypot(end.x - start.x, end.y - start.y);
      const count = Math.max(1, Math.ceil(lengthM / spacingM));
      for (let sampleIndex = 0; sampleIndex < count; sampleIndex += 1) {
        const ratio = (sampleIndex + 0.5) / count;
        rows.push({
          x: round(start.x + (end.x - start.x) * ratio),
          y: round(start.y + (end.y - start.y) * ratio),
        });
      }
    }
    return rows.length ? rows : [{ ...points[0] }];
  }

  function polylineLength(points) {
    let total = 0;
    for (let index = 1; index < points.length; index += 1) {
      total += Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y);
    }
    return total;
  }

  function compareFastest(left, right) {
    return left.metrics.travelSeconds - right.metrics.travelSeconds
      || left.route.segmentIds.join('|').localeCompare(right.route.segmentIds.join('|'));
  }

  function compareObjective(left, right) {
    return left.metrics.objective - right.metrics.objective
      || compareFastest(left, right);
  }

  function percentage(numerator, denominator) {
    return denominator ? round(numerator / denominator * 100) : 0;
  }

  function observedTruth(hash) {
    return truthApi.truth({
      origin: 'observed',
      temporalStatus: 'snapshot',
      uncertainty: hash
        ? { kind: 'confidence', value: { identityVerified: true, completeness: 'source-dependent' } }
        : { kind: 'missing', value: { datasetHash: true } },
    });
  }

  function derivedTruth() {
    return truthApi.truth({
      origin: 'derived',
      temporalStatus: 'snapshot',
      uncertainty: { kind: 'confidence', value: { deterministic: true } },
    });
  }

  function modeledTruth() {
    return truthApi.truth({
      origin: 'modeled',
      temporalStatus: 'forecast',
      uncertainty: {
        kind: 'missing',
        value: {
          currentCanopyState: true,
          currentWeather: true,
          measuredCrownGeometry: true,
          awnings: true,
          diffuseRadiation: true,
          reflectedRadiation: true,
        },
      },
    });
  }

  function simulatedTruth() {
    return truthApi.truth({
      origin: 'simulated',
      temporalStatus: 'forecast',
      uncertainty: {
        kind: 'missing',
        value: { empiricalStreetCalibration: true, currentEnvironmentalObservations: true },
      },
    });
  }

  function validateInputs({ routes, departureAt, config }) {
    if (!Array.isArray(routes) || !routes.length) throw simulationError('sun_routes_missing', 'missing');
    if (!Number.isFinite(Date.parse(departureAt))) throw simulationError('sun_departure_invalid', departureAt);
    const positive = ['maximumAlternatives', 'sampleSpacingM', 'walkingSpeedMps', 'minimumSolarElevationDegrees'];
    positive.forEach((key) => {
      if (!Number.isFinite(config[key]) || config[key] <= 0) throw simulationError(`sun_config_${key}_invalid`, config[key]);
    });
    if (!Number.isFinite(config.canopyShadeThreshold)
      || config.canopyShadeThreshold < 0 || config.canopyShadeThreshold > 1) {
      throw simulationError('sun_config_canopyShadeThreshold_invalid', config.canopyShadeThreshold);
    }
  }

  function exposureState(building, environmental, config) {
    if (building.state === 'night' || building.state === 'unknown' || building.state === 'shade') {
      return {
        state: building.state,
        reason: building.reason,
        directBeamFactor: building.state === 'shade' || building.state === 'night' ? 0 : environmental.directBeamFactor,
      };
    }
    if (config.treeCanopyParticipation && environmental.canopy.occluded
      && environmental.canopy.directBeamTransmittance <= config.canopyShadeThreshold) {
      return {
        state: 'shade',
        reason: 'modeled_tree_canopy_occlusion',
        directBeamFactor: environmental.directBeamFactor,
      };
    }
    return {
      state: 'direct',
      reason: environmental.weather.participation
        ? 'unoccluded_historical_weather_analog'
        : building.reason,
      directBeamFactor: environmental.directBeamFactor,
    };
  }

  function capitalize(value) {
    return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
  }

  function observedHistoricalTruth(hash) {
    return truthApi.truth({
      origin: 'observed',
      temporalStatus: 'historical',
      uncertainty: hash
        ? { kind: 'confidence', value: { identityVerified: true, historicalNotCurrent: true } }
        : { kind: 'missing', value: { datasetHash: true } },
    });
  }

  function round(value) {
    return Number(value.toFixed(6));
  }

  function simulationError(code, received) {
    const error = new Error(`${code}: received ${received}`);
    error.name = 'SunWalkerSimulationError';
    error.code = code;
    return error;
  }

  return Object.freeze({ simulate });
});
