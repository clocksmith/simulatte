(function attachMaritimeEngine(root, factory) {
  const api = factory(root);
  root.MaritimeTradeEngine = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createMaritimeEngine(root) {
  function dep(globalName, path) { return typeof module === 'object' && module.exports ? require(path) : root[globalName]; }

  function runScenario({ datasets, scenario, config, random, scheduler }) {
    const router = dep('MaritimeNetworkRouter', './network-router.js');
    const disruptionApi = dep('MaritimeWeatherDisruption', './weather-disruption.js');
    const emissionsApi = dep('MaritimeEmissionsModel', './emissions-model.js');
    const queueApi = dep('MaritimeQueueEngine', './queue-engine.js');
    const ledgerApi = dep('MaritimeContainerLedger', './container-ledger.js');
    const metricsApi = dep('MaritimeMetrics', './metrics.js');
    if (![router, disruptionApi, emissionsApi, queueApi, ledgerApi, metricsApi].every(Boolean)) throw new Error('maritime_engine_dependency_missing');

    const scenarioId = scenario?.scenarioId || scenario?.id || config?.defaultScenarioId || 'asia-europe-mainline';
    const seed = scenario?.seed || scenarioId;
    const disruption = disruptionApi.resolveDisruption(scenarioId, datasets.weather);
    const corridorId = router.routeIdForScenario(scenarioId);
    const vesselClassId = config?.defaultVesselClass || 'ultra-large-container-v1';
    const vessel = datasets.vesselClasses.classes[vesselClassId] || Object.values(datasets.vesselClasses.classes)[0];
    const route = router.planRoute({ lanes: datasets.lanes, vesselClasses: datasets.vesselClasses, corridorId, vesselClassId, disruption });
    const portById = new Map((datasets.ports.ports || []).map((row) => [row.id, row]));
    const destination = portById.get(route.destinationPort) || datasets.ports.ports?.[0];
    const queueRandom = random?.stream('maritime:queue', destination?.id || 'destination');
    const arrivalRandom = random?.stream('maritime:arrivals', route.id);
    const arrivalCount = 18 + (arrivalRandom?.integer(16) || 0);
    const queue = queueApi.simulatePortQueue({
      portId: destination?.id || route.destinationPort,
      arrivalCount,
      serverCount: Math.max(1, Math.min(8, Math.round((destination?.berths || 18) / 12))),
      arrivalRatePerHour: disruption.id === 'baseline' ? 0.45 : 0.7,
      serviceMeanHours: 7.5,
      disruptionMultiplier: disruption.queueMultiplier,
      random: queueRandom,
    });
    let ledger = ledgerApi.createContainerLedger({
      scenarioId, containerCount: Number(config?.containerCount || 1200),
      originPort: route.originPort, destinationPort: route.destinationPort,
    });
    const timeline = scheduler.create({ maxEvents: 20000 });
    timeline.schedule({ time: 0, priority: 0, kind: 'maritime.voyage-departed', payload: { routeId: route.id } });
    timeline.schedule({ time: route.sailingDays * 24, priority: 10, kind: 'maritime.voyage-arrived', payload: { portId: route.destinationPort } });
    timeline.schedule({ time: route.sailingDays * 24 + queue.averageWaitHours, priority: 20, kind: 'maritime.berth-started', payload: { portId: route.destinationPort } });
    timeline.schedule({ time: route.sailingDays * 24 + queue.averageWaitHours + 8, priority: 30, kind: 'maritime.container-delivered', payload: { portId: route.destinationPort } });
    const eventTrace = [];
    timeline.drain((event) => {
      eventTrace.push(Object.freeze({ id: event.id, timeHours: event.time, kind: event.kind, payload: event.payload }));
      if (event.kind === 'maritime.voyage-departed') ledger = ledgerApi.applyEvent(ledger, { kind: 'loaded', location: route.originPort, time: event.time });
      if (event.kind === 'maritime.voyage-arrived') ledger = ledgerApi.applyEvent(ledger, { kind: 'discharged', location: route.destinationPort, time: event.time });
      if (event.kind === 'maritime.container-delivered') ledger = ledgerApi.applyEvent(ledger, { kind: 'delivered', location: route.destinationPort, time: event.time });
    });
    const emissions = emissionsApi.evaluate({
      vessel, distanceNm: route.distanceNm, speedKnots: route.speedKnots, sailingDays: route.sailingDays,
      queueHours: queue.averageWaitHours, cargoTeu: ledger.totalContainers,
      emissionsFactors: datasets.emissions,
    });
    const metrics = metricsApi.summarize({ route, queue, ledger, emissions, eventTrace });
    return Object.freeze({
      schema: 'simulatte.maritimeScenarioResult.v1', scenarioId, seed, route, disruption, queue, ledger, emissions, metrics,
      eventTrace: Object.freeze(eventTrace), schedulerReceipt: timeline.receipt(),
      randomReceipts: Object.freeze([queueRandom?.receipt(), arrivalRandom?.receipt()].filter(Boolean)),
      claimBoundary: 'Synthetic deterministic maritime logistics scenario over governed port and corridor artifacts; not live AIS, booking, navigation, or ETA data.',
    });
  }
  return Object.freeze({ runScenario });
});
