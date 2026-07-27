(function attachMaritimeEngine(root, factory) {
  const api = factory(root);
  root.MaritimeTradeEngine = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createMaritimeEngine(root) {
  function dep(globalName, path) {
    return typeof module === 'object' && module.exports ? require(path) : root[globalName];
  }

  function runScenario({ datasets, scenario, config, random, scheduler, routeObjective = {} }) {
    const router = dep('MaritimeNetworkRouter', './network-router.js');
    const disruptionApi = dep('MaritimeWeatherDisruption', './weather-disruption.js');
    const emissionsApi = dep('MaritimeEmissionsModel', './emissions-model.js');
    const queueApi = dep('MaritimeQueueEngine', './queue-engine.js');
    const ledgerApi = dep('MaritimeContainerLedger', './container-ledger.js');
    const metricsApi = dep('MaritimeMetrics', './metrics.js');
    if (![router, disruptionApi, emissionsApi, queueApi, ledgerApi, metricsApi].every(Boolean)) {
      throw new Error('maritime_engine_dependency_missing');
    }

    const spec = normalizeSpec(scenario, config);
    const vessel = vesselFor(datasets.vessels, spec.vesselClassId);
    if (spec.cargoTeu > Number(vessel.teu)) {
      throw new Error(`maritime_cargo_exceeds_vessel_capacity: ${spec.cargoTeu} > ${vessel.teu}`);
    }
    const disruption = disruptionApi.resolveDisruption(spec.scenarioId, datasets);
    const route = router.planRoute({
      ports: datasets.ports,
      corridors: datasets.corridors,
      scenarioCatalog: datasets.scenarioCatalog,
      vessel,
      scenarioId: spec.scenarioId,
      speedPolicy: spec.speedPolicy,
      disruption,
      routeObjective: {
        ...routeObjective,
        vesselServiceSpeedKnots: Number(vessel.serviceSpeedKn),
        mainEnginePowerKw: Number(vessel.mainEnginePowerKw),
        sfocGPerKwh: Number(vessel.sfocGPerKwh),
        co2TonsPerFuelTon: Number(datasets.emissionsModel?.co2KgPerKgFuel || 3.114),
      },
    });
    const destination = (datasets.ports.ports || []).find((row) => row.id === route.destinationPort);
    if (!destination) throw new Error(`maritime_destination_missing: ${route.destinationPort}`);
    const servicePrior = servicePriorFor(datasets.portPerformance, destination);
    const randomStreams = [];
    const queueEnsemble = queueApi.simulateQueueEnsemble({
      portId: destination.id,
      replicates: spec.ensembleReplicates,
      arrivalCount: spec.queueArrivalCount,
      serverCount: Math.max(1, Math.min(8, Math.round(Number(destination.berthCount || 6) / 3))),
      arrivalRatePerHour: spec.arrivalRatePerHour,
      serviceMeanHours: Math.max(4, Math.min(24, Number(servicePrior.medianHoursInPort) / 2)),
      serviceSigma: spec.serviceSigma,
      disruptionMultiplier: disruption.queueMultiplier,
      calibration: datasets.calibration.queueCalibration,
      randomForReplicate(index) {
        const stream = random?.stream(`maritime:queue:${spec.seed}`, `${destination.id}:${index}`) || null;
        if (stream) randomStreams.push(stream);
        return stream;
      },
    });
    const initialLedger = ledgerApi.createContainerLedger({
      scenarioId: spec.scenarioId,
      containerCount: spec.containerCount,
      originPort: route.originPort,
      destinationPort: route.destinationPort,
    });
    const progression = buildProgression({
      route,
      queueEnsemble,
      ledger: initialLedger,
      ledgerApi,
      scheduler,
      scenarioId: spec.scenarioId,
      seed: spec.seed,
    });
    const emissions = emissionsApi.evaluate({
      vessel,
      distanceNm: route.distanceNm,
      speedKnots: route.speedKnots,
      sailingDays: route.sailingDays,
      queueHours: queueEnsemble.p50WaitHours,
      cargoTeu: spec.cargoTeu,
      model: datasets.emissionsModel,
      calibration: datasets.calibration,
    });
    const metrics = metricsApi.summarize({
      route,
      queueEnsemble,
      ledger: progression.ledger,
      emissions,
      eventTrace: progression.events,
    });
    const result = {
      schema: 'simulatte.maritimeScenarioResult.v2',
      scenarioId: spec.scenarioId,
      seed: spec.seed,
      parameters: spec,
      route,
      vessel,
      disruption,
      queueEnsemble,
      ledger: progression.ledger,
      emissions,
      metrics,
      eventTrace: progression.events,
      snapshots: progression.snapshots,
      schedulerReceipt: progression.schedulerReceipt,
      randomReceipts: Object.freeze(randomStreams.map((stream) => stream.receipt())),
      dataReceipts: datasets.dataReceipts,
      modelReceipts: modelReceipts(spec, route, queueEnsemble, emissions, datasets.calibration),
      comparisons: comparisonDefinitions(spec),
      controls: controlDefinitions(datasets.vessels, spec),
      claimBoundary: 'Deterministic, seeded maritime logistics forecast over observed port identities and modeled corridors, queues, vessel archetypes, cargo, weather scenarios, and emissions. It is not AIS, a booking system, hydrographic navigation, or an operational ETA.',
    };
    return deepFreeze(result);
  }

  function buildProgression({ route, queueEnsemble, ledger, ledgerApi, scheduler, scenarioId, seed }) {
    const timeline = scheduler.create({ maxEvents: 256 });
    const scheduled = [];
    const schedule = (time, priority, kind, payload, parentIds, evidenceRefs) => {
      const id = timeline.schedule({
        time,
        priority,
        kind,
        payload: {
          ...payload,
          causalParentIds: parentIds,
          evidenceRefs,
        },
      });
      scheduled.push(id);
      return id;
    };
    const configuredId = schedule(0, 0, 'maritime.scenario-configured', {
      scenarioId,
    }, [], ['model:maritime-causal-event-log-v2']);
    let previousId = schedule(0, 10, 'maritime.voyage-departed', {
      portId: route.originPort,
      progressFraction: 0,
      position: route.waypoints[0],
    }, [configuredId], [route.evidenceRefs[0], 'model:container-lineage-state-machine-v2']);
    let elapsedHours = 0;
    let completedDistanceNm = 0;
    route.legs.forEach((leg, index) => {
      for (const fraction of [0.25, 0.5, 0.75]) {
        previousId = schedule(elapsedHours + leg.sailingHours * fraction, 20, 'maritime.voyage-progressed', {
          legId: leg.id,
          portId: null,
          legIndex: index,
          legProgressFraction: fraction,
          progressFraction: (completedDistanceNm + leg.distanceNm * fraction) / route.distanceNm,
          position: pointAlongCoordinates(leg.coordinates, fraction),
        }, [previousId], [`row:global-maritime-corridors-v1:${leg.id}`, 'model:governed-corridor-dijkstra-v2']);
      }
      elapsedHours += leg.sailingHours;
      completedDistanceNm += leg.distanceNm;
      previousId = schedule(elapsedHours, 20, 'maritime.leg-completed', {
        legId: leg.id,
        portId: leg.toPortId,
        legIndex: index,
        legProgressFraction: 1,
        progressFraction: completedDistanceNm / route.distanceNm,
        position: route.waypoints[index + 1],
      }, [previousId], [`row:global-maritime-corridors-v1:${leg.id}`, 'model:governed-corridor-dijkstra-v2']);
    });
    const arrivedId = schedule(elapsedHours, 30, 'maritime.voyage-arrived', {
      portId: route.destinationPort,
      progressFraction: 1,
      position: route.waypoints.at(-1),
    }, [previousId], route.evidenceRefs);
    const queueId = schedule(elapsedHours, 40, 'maritime.queue-entered', {
      portId: route.destinationPort,
      expectedWaitHours: queueEnsemble.p50WaitHours,
      progressFraction: 1,
      position: route.waypoints.at(-1),
    }, [arrivedId], queueEnsemble.evidenceRefs);
    const berthId = schedule(elapsedHours + queueEnsemble.p50WaitHours, 50, 'maritime.berth-started', {
      portId: route.destinationPort,
      progressFraction: 1,
      position: route.waypoints.at(-1),
    }, [queueId], queueEnsemble.evidenceRefs);
    const dischargedId = schedule(elapsedHours + queueEnsemble.p50WaitHours + 8, 60, 'maritime.cargo-discharged', {
      portId: route.destinationPort,
      progressFraction: 1,
      position: route.waypoints.at(-1),
    }, [berthId], ['model:terminal-handling-v1', 'model:container-lineage-state-machine-v2']);
    schedule(elapsedHours + queueEnsemble.p50WaitHours + 18, 70, 'maritime.container-delivered', {
      portId: route.destinationPort,
      progressFraction: 1,
      position: route.waypoints.at(-1),
    }, [dischargedId], ['model:terminal-handling-v1', 'model:container-lineage-state-machine-v2']);

    let currentLedger = ledger;
    let state = snapshotState({
      status: 'configured',
      position: route.waypoints[0],
      progressFraction: 0,
      timeHours: 0,
      eventId: null,
      ledger: currentLedger,
      seed,
    });
    const events = [];
    const snapshots = [deepFreeze({ cursor: 0, ...state })];
    timeline.drain((event) => {
      const before = state;
      const nextStatus = statusForEvent(event.kind, before.status);
      if (event.kind === 'maritime.voyage-departed') {
        currentLedger = ledgerApi.applyEvent(currentLedger, lineageInput(event, 'loaded', route.originPort));
      }
      if (event.kind === 'maritime.cargo-discharged') {
        currentLedger = ledgerApi.applyEvent(currentLedger, lineageInput(event, 'discharged', route.destinationPort));
      }
      if (event.kind === 'maritime.container-delivered') {
        currentLedger = ledgerApi.applyEvent(currentLedger, lineageInput(event, 'delivered', route.destinationPort));
      }
      state = snapshotState({
        status: nextStatus,
        position: event.payload.position || before.position,
        progressFraction: event.payload.progressFraction ?? before.progressFraction,
        timeHours: event.time,
        eventId: event.id,
        ledger: currentLedger,
        seed,
      });
      const semanticEvent = deepFreeze({
        schema: 'simulatte.simulationEvent.v4',
        id: event.id,
        timestamp: event.time,
        timeUnits: 'hour_since_scenario_start',
        kind: event.kind,
        causalParentIds: Object.freeze([...(event.payload.causalParentIds || [])]),
        affectedEntityIds: Object.freeze([
          `voyage:${scenarioId}`,
          ...(event.payload.portId ? [event.payload.portId] : []),
          ...(event.payload.legId ? [event.payload.legId] : []),
        ]),
        before,
        after: state,
        evidenceRefs: Object.freeze([...(event.payload.evidenceRefs || [])]),
        truth: truth('simulated', 'forecast', {
          kind: 'distribution',
          value: event.kind.includes('queue')
            ? queueEnsemble.truth.uncertainty.value
            : { family: 'deterministic_given_parameters', seed },
        }),
      });
      events.push(semanticEvent);
      snapshots.push(deepFreeze({ cursor: snapshots.length, ...state }));
    });
    if (timeline.receipt().processedCount !== scheduled.length) {
      throw new Error('maritime_event_trace_incomplete');
    }
    return deepFreeze({
      events,
      snapshots,
      ledger: currentLedger,
      schedulerReceipt: timeline.receipt(),
    });
  }

  function normalizeSpec(scenario, config) {
    const scenarioId = scenario?.scenarioId || scenario?.id || config.defaultScenarioId;
    const value = {
      scenarioId,
      seed: scenario?.seed || scenarioId,
      vesselClassId: scenario?.vesselClassId || config.defaultVesselClass,
      speedPolicy: scenario?.speedPolicy || config.defaultSpeedPolicy,
      cargoTeu: numberWithin(scenario?.cargoTeu ?? config.cargoTeu, 100, 24000, 'cargoTeu'),
      containerCount: integerWithin(config.containerCount, 1, 100000, 'containerCount'),
      ensembleReplicates: integerWithin(scenario?.ensembleReplicates ?? config.ensembleReplicates, 2, 512, 'ensembleReplicates'),
      queueArrivalCount: integerWithin(config.queueArrivalCount, 2, 1000, 'queueArrivalCount'),
      arrivalRatePerHour: numberWithin(config.arrivalRatePerHour, 0.01, 20, 'arrivalRatePerHour'),
      serviceSigma: numberWithin(config.serviceSigma, 0, 2, 'serviceSigma'),
    };
    return deepFreeze(value);
  }

  function vesselFor(dataset, vesselClassId) {
    const vessel = (dataset?.archetypes || []).find((row) => row.id === vesselClassId);
    if (!vessel) throw new Error(`maritime_vessel_missing: ${vesselClassId}`);
    return vessel;
  }

  function servicePriorFor(dataset, port) {
    return (dataset?.rows || []).find((row) => row.portId === port.id || row.unlocode === port.unlocode)
      || { portId: port.id, medianHoursInPort: 30, relativeServiceIndex: 1 };
  }

  function snapshotState({ status, position, progressFraction, timeHours, eventId, ledger, seed }) {
    const deliveredCount = ledger.containers.filter((row) => row.status === 'delivered').length;
    const atTerminalCount = ledger.containers.filter((row) => row.status === 'at-terminal').length;
    return deepFreeze({
      status,
      position: Object.freeze([...(position || [0, 0, 0])]),
      progressFraction,
      timeHours,
      currentEventId: eventId,
      representativeContainers: Object.freeze({
        total: ledger.totalContainers,
        atTerminal: atTerminalCount,
        delivered: deliveredCount,
      }),
      truth: truth('simulated', 'forecast', {
        kind: 'distribution',
        value: {
          family: 'deterministic_given_parameters',
          seed,
        },
      }),
      evidenceRefs: Object.freeze([
        'model:maritime-causal-event-log-v2',
        'model:container-lineage-state-machine-v2',
        ...(eventId ? [`event:${eventId}`] : []),
      ]),
    });
  }

  function lineageInput(event, kind, location) {
    return {
      eventId: event.id,
      kind,
      location,
      time: event.time,
      causalParentIds: event.payload.causalParentIds,
      evidenceRefs: event.payload.evidenceRefs,
    };
  }

  function statusForEvent(kind, current) {
    return ({
      'maritime.scenario-configured': 'configured',
      'maritime.voyage-departed': 'sailing',
      'maritime.voyage-progressed': 'sailing',
      'maritime.leg-completed': 'sailing',
      'maritime.voyage-arrived': 'arrived',
      'maritime.queue-entered': 'queued',
      'maritime.berth-started': 'berthing',
      'maritime.cargo-discharged': 'discharged',
      'maritime.container-delivered': 'settled',
    })[kind] || current;
  }

  function modelReceipts(spec, route, queue, emissions, calibration) {
    return Object.freeze([
      modelReceipt('model:governed-corridor-dijkstra-v2', route.algorithm, route.objective, route.evidenceRefs, route.truth.uncertainty, spec.seed),
      modelReceipt(
        'model:fcfs-multi-server-queue-v2',
        'FCFS multi-server discrete-event queue with exponential arrivals and lognormal service',
        queue.selectedReplicate.parameters,
        queue.evidenceRefs,
        queue.truth.uncertainty,
        spec.seed,
        {
          calibrationStatus: calibration.queueCalibration.status,
          calibrationArtifactId: calibration.queueCalibration.id,
          uncertaintyClass: 'stochastic_simulation',
        }
      ),
      modelReceipt(
        'model:maritime-emissions-v2',
        emissions.method,
        emissions.parameters,
        emissions.evidenceRefs,
        emissions.truth.uncertainty,
        spec.seed,
        {
          calibrationStatus: calibration.emissionsSensitivity.status,
          calibrationArtifactId: calibration.emissionsSensitivity.id,
          uncertaintyClass: 'not_probabilistically_calibrated',
          parameterSensitivity: emissions.parameterSensitivity,
        }
      ),
      modelReceipt('model:container-lineage-state-machine-v2', 'Event-sourced booked, loaded, discharged, delivered state machine', { representativeContainerCount: spec.containerCount }, ['model:maritime-causal-event-log-v2'], {
        kind: 'missing',
        value: { reason: 'Synthetic representative container identities.' },
      }, spec.seed),
      modelReceipt('model:maritime-causal-event-log-v2', 'Stable scheduler ordering by timestamp, priority, and sequence', { maximumEvents: 256 }, [], {
        kind: 'missing',
        value: { reason: 'Ordering is exact for the modeled run.' },
      }, spec.seed),
      modelReceipt('model:terminal-handling-v1', 'Declared eight-hour discharge and ten-hour delivery handling stages', { dischargeHours: 8, deliveryAfterDischargeHours: 10 }, [], {
        kind: 'interval',
        value: { relativeMinimum: -0.5, relativeMaximum: 0.5, basis: 'Declared scenario sensitivity.' },
      }, spec.seed),
    ]);
  }

  function modelReceipt(id, algorithm, parameters, evidenceRefs, uncertainty, seed, metadata = {}) {
    return deepFreeze({
      schema: 'simulatte.modelReceipt.v4',
      id,
      algorithm,
      equations: id === 'model:maritime-emissions-v2'
        ? Object.freeze(['P/P_ref = (v/v_ref)^3', 'fuel = P × load × time × SFOC', 'CO2e = fuel × factor'])
        : Object.freeze([]),
      parameters,
      calibration: Object.freeze({
        status: metadata.calibrationStatus || 'structural',
        artifactId: metadata.calibrationArtifactId || null,
        evidenceRefs: Object.freeze([...(evidenceRefs || [])]),
      }),
      seed,
      uncertainty,
      uncertaintyClass: metadata.uncertaintyClass || 'model_declared',
      parameterSensitivity: metadata.parameterSensitivity || null,
      validation: Object.freeze({
        status: 'structural',
        results: Object.freeze(['finite outputs', 'causal ordering', 'container conservation', 'deterministic replay']),
      }),
    });
  }

  function controlDefinitions(vessels, spec) {
    return deepFreeze([
      { id: 'vesselClassId', type: 'select', value: spec.vesselClassId, options: vessels.archetypes.map((row) => ({ value: row.id, label: row.label })), provenance: 'dataset:maritime-vessel-archetypes-v1' },
      { id: 'speedPolicy', type: 'select', value: spec.speedPolicy, options: [{ value: 'slow', label: 'Slow steaming' }, { value: 'service', label: 'Service speed' }, { value: 'fast', label: 'Fast recovery' }], provenance: 'model:governed-corridor-dijkstra-v2' },
      {
        id: 'cargoTeu',
        type: 'number',
        value: spec.cargoTeu,
        minimum: 100,
        maximum: Number(vesselFor(vessels, spec.vesselClassId).teu),
        provenance: 'scenario:cargo-load',
      },
      { id: 'ensembleReplicates', type: 'number', value: spec.ensembleReplicates, minimum: 2, maximum: 512, provenance: 'model:fcfs-multi-server-queue-v2' },
    ]);
  }

  function comparisonDefinitions(spec) {
    return deepFreeze([
      {
        id: 'selected-vs-undisrupted',
        baseline: { scenarioId: baselineScenario(spec.scenarioId), seed: spec.seed },
        intervention: { scenarioId: spec.scenarioId, seed: spec.seed },
        synchronizedClock: true,
        metrics: ['totalTransitDays', 'queueWaitHours', 'fuelTons', 'co2Tons'],
      },
    ]);
  }

  function baselineScenario(scenarioId) {
    if (scenarioId === 'suez-closure-cape-reroute') return 'asia-europe-mainline';
    if (scenarioId === 'north-atlantic-cyclone') return 'north-atlantic-baseline';
    if (scenarioId === 'transpacific-panama-restriction') return 'panama-baseline';
    return scenarioId;
  }

  function pointAlongCoordinates(coordinates, progress) {
    if (!Array.isArray(coordinates) || coordinates.length < 2) {
      return Object.freeze([0, 0, 0]);
    }
    const lengths = [];
    let total = 0;
    for (let index = 1; index < coordinates.length; index += 1) {
      const left = coordinates[index - 1];
      const right = coordinates[index];
      const rawLongitudeDelta = Math.abs(right[0] - left[0]);
      const longitudeDelta = rawLongitudeDelta > 180 ? 360 - rawLongitudeDelta : rawLongitudeDelta;
      total += Math.hypot(longitudeDelta, right[1] - left[1]);
      lengths.push(total);
    }
    const target = total * Math.max(0, Math.min(1, progress));
    const index = Math.max(0, lengths.findIndex((value) => value >= target));
    const startDistance = index === 0 ? 0 : lengths[index - 1];
    const fraction = (target - startDistance) / Math.max(0.000001, lengths[index] - startDistance);
    const start = coordinates[index];
    const end = coordinates[index + 1];
    let endLongitude = end[0];
    if (Math.abs(endLongitude - start[0]) > 180) {
      endLongitude += endLongitude > start[0] ? -360 : 360;
    }
    const longitude = start[0] + (endLongitude - start[0]) * fraction;
    return Object.freeze([
      longitude > 180 ? longitude - 360 : longitude < -180 ? longitude + 360 : longitude,
      start[1] + (end[1] - start[1]) * fraction,
      start[2] + (end[2] - start[2]) * fraction,
    ]);
  }

  function numberWithin(value, minimum, maximum, label) {
    const number = Number(value);
    if (!Number.isFinite(number) || number < minimum || number > maximum) throw new Error(`maritime_parameter_invalid: ${label}`);
    return number;
  }

  function integerWithin(value, minimum, maximum, label) {
    const number = Number(value);
    if (!Number.isInteger(number) || number < minimum || number > maximum) throw new Error(`maritime_parameter_invalid: ${label}`);
    return number;
  }

  function truth(origin, temporalStatus, uncertainty) {
    return deepFreeze({ origin, temporalStatus, uncertainty });
  }

  function deepFreeze(value, seen = new Set()) {
    if (!value || typeof value !== 'object' || seen.has(value)) return value;
    seen.add(value);
    Object.values(value).forEach((row) => deepFreeze(row, seen));
    return Object.freeze(value);
  }

  return Object.freeze({ runScenario, baselineScenario });
});
