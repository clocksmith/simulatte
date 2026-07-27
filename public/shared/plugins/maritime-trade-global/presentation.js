(function attachMaritimePresentation(root, factory) {
  const api = factory();
  root.MaritimeTradePresentation = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createMaritimePresentationModule() {
  function createSemanticPresentation(portsData, result, snapshot) {
    const active = new Set(result.route.portIds);
    const portObjects = (portsData?.ports || []).map((port) => semanticObject({
      id: port.id,
      kind: 'port',
      geometry: { type: 'point', coordinates: [port.location.longitude, port.location.latitude, 0] },
      quantities: {
        routeRole: active.has(port.id) ? 'active_corridor_port' : 'network_context',
        modeledBerthCount: port.berthCount,
      },
      evidenceRefs: [
        `row:global-port-registry-wpi-v1:${port.id}`,
        'dataset:global-port-registry-wpi-v1',
      ],
      truth: active.has(port.id)
        ? truth('derived', 'forecast', missing('Route role is exact for the selected modeled route.'))
        : truth('observed', 'snapshot', missing('Source coordinate uncertainty is not carried in the pinned artifact.')),
    }));
    const routeObject = semanticObject({
      id: `route:${result.route.id}`,
      kind: 'cargo_flow',
      geometry: { type: 'line_string', coordinates: result.route.renderCoordinates },
      quantities: {
        cargoTeu: result.parameters.cargoTeu,
        distanceNm: result.route.distanceNm,
        speedKnots: result.route.speedKnots,
        progressFraction: snapshot.progressFraction,
        disruptionSeverity: result.disruption.id === 'baseline' ? 0 : 1,
      },
      evidenceRefs: result.route.evidenceRefs,
      truth: result.route.truth,
    });
    const vesselObject = semanticObject({
      id: `voyage:${result.scenarioId}`,
      kind: 'modeled_vessel',
      geometry: { type: 'point', coordinates: snapshot.position },
      quantities: {
        progressFraction: snapshot.progressFraction,
        actorKind: 'vessel',
        cargoTeu: result.parameters.cargoTeu,
        speedKnots: result.route.speedKnots,
        state: snapshot.status,
      },
      evidenceRefs: [
        `event:${snapshot.currentEventId || result.eventTrace[0]?.id}`,
        `row:maritime-vessel-archetypes-v1:${result.vessel.id}`,
      ],
      truth: truth('simulated', 'forecast', missing('Representative vessel is not an observed AIS identity or position.')),
    });
    const queueObject = semanticObject({
      id: `queue:${result.route.destinationPort}`,
      kind: 'queue_pressure',
      geometry: { type: 'point', coordinates: result.route.waypoints.at(-1) },
      quantities: {
        p05WaitHours: result.queueEnsemble.p05WaitHours,
        p50WaitHours: result.queueEnsemble.p50WaitHours,
        p95WaitHours: result.queueEnsemble.p95WaitHours,
        replicateCount: result.queueEnsemble.replicateCount,
        uncertaintyClass: result.queueEnsemble.uncertaintyClass,
        calibrationStatus: result.queueEnsemble.calibration.status,
      },
      evidenceRefs: result.queueEnsemble.evidenceRefs,
      truth: result.queueEnsemble.truth,
    });
    const emissionsSensitivityObject = semanticObject({
      id: `emissions-sensitivity:${result.scenarioId}`,
      kind: 'emissions_parameter_sensitivity',
      geometry: { type: 'point', coordinates: result.route.waypoints.at(-1) },
      quantities: {
        baselineCo2Tons: result.emissions.parameterSensitivity.baselineCo2Tons,
        minimumCo2Tons: result.emissions.parameterSensitivity.minimumCo2Tons,
        maximumCo2Tons: result.emissions.parameterSensitivity.maximumCo2Tons,
        sensitivityKind: result.emissions.parameterSensitivity.kind,
        probability: null,
      },
      evidenceRefs: result.emissions.parameterSensitivity.evidenceRefs,
      truth: truth('scenario', 'forecast', missing(
        'This deterministic parameter-sensitivity envelope is not a probability or confidence interval.'
      )),
    });
    const disruptionObject = result.disruption.trackCoordinates.length >= 2
      ? semanticObject({
        id: `disruption:${result.disruption.id}`,
        kind: 'weather_disruption',
        geometry: { type: 'line_string', coordinates: result.disruption.trackCoordinates },
        quantities: {
          maximumWindKt: result.disruption.maximumWindKt,
          vesselSpeedMultiplier: result.disruption.speedMultiplier,
          queueMultiplier: result.disruption.queueMultiplier,
        },
        evidenceRefs: result.disruption.evidenceRefs,
        truth: result.disruption.truth,
      })
      : null;
    return deepFreeze({
      schema: 'simulatte.semanticPresentation.v4',
      coordinateSystem: 'wgs84',
      epoch: '2030-01-01T00:00:00Z',
      currentEventId: snapshot.currentEventId,
      layers: [
        {
          id: 'maritime-network',
          semanticType: 'network_nodes',
          objects: portObjects,
          aggregationHint: { method: 'cluster', quantity: 'routeRole' },
          temporalVisibility: { kind: 'always' },
          pickBehavior: { kind: 'inspect_evidence' },
        },
        {
          id: 'selected-voyage',
          semanticType: 'directional_flow',
          objects: [routeObject],
          aggregationHint: { method: 'corridor_bundle', quantity: 'cargoTeu' },
          temporalVisibility: { kind: 'through_event', eventId: result.eventTrace.at(-1).id },
          pickBehavior: { kind: 'inspect_event_timeline' },
        },
        {
          id: 'voyage-actor',
          semanticType: 'progress_actor',
          objects: [vesselObject],
          aggregationHint: { method: 'none', quantity: 'progressFraction' },
          temporalVisibility: { kind: 'event_state', state: snapshot.status },
          pickBehavior: { kind: 'inspect_entity' },
        },
        {
          id: 'destination-queue',
          semanticType: 'queue_distribution',
          objects: [queueObject],
          aggregationHint: { method: 'quantile_summary', quantity: 'p50WaitHours' },
          temporalVisibility: { kind: 'after_event_kind', eventKind: 'maritime.voyage-arrived' },
          pickBehavior: { kind: 'inspect_uncertainty' },
        },
        {
          id: 'voyage-emissions-sensitivity',
          semanticType: 'parameter_sensitivity',
          objects: [emissionsSensitivityObject],
          aggregationHint: { method: 'range_summary', quantity: 'baselineCo2Tons' },
          temporalVisibility: { kind: 'after_event_kind', eventKind: 'maritime.voyage-arrived' },
          pickBehavior: { kind: 'inspect_parameter_sensitivity' },
        },
        ...(disruptionObject ? [{
          id: 'weather-disruption',
          semanticType: 'scenario_weather_track',
          objects: [disruptionObject],
          aggregationHint: { method: 'none', quantity: 'maximumWindKt' },
          temporalVisibility: { kind: 'during_voyage' },
          pickBehavior: { kind: 'inspect_scenario_boundary' },
        }] : []),
      ],
      viewIntents: viewIntents(result, snapshot),
    });
  }

  function adaptSemanticToV3(semantic) {
    const objects = semantic.layers.flatMap((layer) => layer.objects);
    const ports = objects.filter((row) => row.kind === 'port');
    const flow = objects.find((row) => row.kind === 'cargo_flow');
    const vessel = objects.find((row) => row.kind === 'modeled_vessel');
    const queue = objects.find((row) => row.kind === 'queue_pressure');
    const disruption = objects.find((row) => row.kind === 'weather_disruption');
    const activePorts = ports.filter((row) => row.quantities.routeRole === 'active_corridor_port');
    return Object.freeze({
      schema: 'simulatte.pluginPresentation.v3',
      coordinateSystem: 'wgs84',
      epoch: semantic.epoch,
      markers: Object.freeze([
        ...ports.map((row) => Object.freeze({
          id: row.id,
          position: row.geometry.coordinates,
          label: row.id.replace('port:', '').toUpperCase(),
          tone: row.quantities.routeRole === 'active_corridor_port' ? 'cyan' : 'muted',
          radius: row.quantities.routeRole === 'active_corridor_port' ? 1.2 : 0.55,
        })),
        ...(queue ? [Object.freeze({
          id: queue.id,
          position: queue.geometry.coordinates,
          label: `Queue p50 ${queue.quantities.p50WaitHours.toFixed(1)} h`,
          tone: queue.quantities.p95WaitHours > 12 ? 'amber' : 'blue',
          radius: 1.5,
        })] : []),
      ]),
      paths: Object.freeze([
        ...(flow ? [{
          id: flow.id,
          coordinates: flow.geometry.coordinates,
          label: `${flow.quantities.cargoTeu.toLocaleString()} TEU modeled flow`,
          tone: flow.quantities.disruptionSeverity ? 'amber' : 'cyan',
          width: flow.quantities.disruptionSeverity ? 2.2 : 1.4,
        }] : []),
        ...(disruption ? [{
          id: disruption.id,
          coordinates: disruption.geometry.coordinates,
          label: `Synthetic cyclone track, peak ${disruption.quantities.maximumWindKt} kt`,
          tone: 'violet',
          width: 1.2,
        }] : []),
      ]),
      actors: Object.freeze(vessel ? [{
        id: vessel.id,
        position: vessel.geometry.coordinates,
        label: `Modeled voyage, ${Math.round(vessel.quantities.progressFraction * 100)}%`,
        tone: 'green',
        radius: 0.9,
      }] : []),
      areas: Object.freeze([]),
      cameraTargets: Object.freeze([
        {
          id: 'network',
          center: [0, 10, 0],
          label: 'Maritime network',
          distance: 230,
        },
        {
          id: 'voyage',
          center: center(flow?.geometry.coordinates || []),
          label: 'Selected voyage',
          distance: 120,
        },
        ...activePorts.slice(-1).map((row) => Object.freeze({
          id: 'destination',
          center: row.geometry.coordinates,
          label: 'Destination port',
          distance: 35,
        })),
      ]),
    });
  }

  function createPresentation(portsData, result, snapshot) {
    return adaptSemanticToV3(createSemanticPresentation(portsData, result, snapshot));
  }

  function viewIntents(result, snapshot) {
    const mode = snapshot.status === 'configured'
      ? 'overview'
      : ['queued', 'berthing', 'discharged', 'settled'].includes(snapshot.status)
        ? 'pov'
        : 'follow';
    const targetId = mode === 'overview'
      ? 'maritime-network'
      : mode === 'pov'
        ? result.route.destinationPort
        : `voyage:${result.scenarioId}`;
    return Object.freeze([
      Object.freeze({
        schema: 'simulatte.viewIntent.v4',
        id: `maritime:${snapshot.cursor || 0}:${mode}`,
        mode,
        targetIds: Object.freeze([targetId]),
        transitionReason: snapshot.currentEventId
          ? `simulation_event:${snapshot.currentEventId}`
          : 'scenario_ready',
        priority: 40,
        expiresAtEventId: result.eventTrace[snapshot.cursor + 1]?.id || null,
        mayInterruptManualOverride: false,
      }),
      Object.freeze({
        schema: 'simulatte.viewIntent.v4',
        id: `maritime:free:${snapshot.cursor || 0}`,
        mode: 'free',
        targetIds: Object.freeze([]),
        transitionReason: 'user_available',
        priority: 0,
        expiresAtEventId: null,
        mayInterruptManualOverride: false,
      }),
    ]);
  }

  function semanticObject(value) {
    return deepFreeze({
      schema: 'simulatte.renderedEvidenceObject.v4',
      ...value,
      evidenceRefs: Object.freeze([...(value.evidenceRefs || [])]),
    });
  }

  function center(rows) {
    if (!rows.length) return [0, 0, 0];
    return [
      rows.reduce((sum, row) => sum + row[0], 0) / rows.length,
      rows.reduce((sum, row) => sum + row[1], 0) / rows.length,
      0,
    ];
  }

  function missing(reason) {
    return { kind: 'missing', value: { reason } };
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

  return Object.freeze({ createSemanticPresentation, adaptSemanticToV3, createPresentation });
});
