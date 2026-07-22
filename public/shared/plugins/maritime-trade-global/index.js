(function attachMaritimeTradePlugin(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulattePluginMaritimeTradeGlobal = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createMaritimeTradePluginApi(root) {
  const PLUGIN_ID = 'maritime-trade-global';
  function dep(globalName, path) { return typeof module === 'object' && module.exports ? require(path) : root[globalName]; }

  async function activate({ sdk, config, profile, scenario }) {
    const engine = dep('MaritimeTradeEngine', './maritime-engine.js');
    const presentationApi = dep('MaritimeTradePresentation', './presentation.js');
    const datasets = Object.freeze({
      ports: sdk.datasets.require('world.ports.wpi.v1'),
      vesselClasses: sdk.datasets.require('maritime.vessel.classes.v1'),
      lanes: sdk.datasets.require('shipping.lane.routes.v1'),
      chokepoints: sdk.datasets.optional('ocean.chokepoints.v1'),
      weather: sdk.datasets.optional('maritime.weather.snapshot.v1'),
      emissions: null,
    });
    let activeScenario = normalizeScenario(scenario, config);
    let current = engine.runScenario({ datasets, scenario: activeScenario, config, random: sdk.random, scheduler: sdk.scheduler });
    sdk.state.register(reduce, { scenarioId: current.scenarioId, result: current, lastAction: 'activated' });
    appendScenarioReceipt(current);

    function appendScenarioReceipt(result) {
      sdk.receipts.append({
        schema: 'simulatte.plugin.maritimeScenarioReceipt.v1', scenarioId: result.scenarioId, seed: result.seed,
        routeId: result.route.id, disruptionId: result.disruption.id,
        eventCount: result.eventTrace.length, containerCount: result.ledger.totalContainers,
        datasetIdentities: Object.fromEntries(['world.ports.wpi.v1','maritime.vessel.classes.v1','shipping.lane.routes.v1'].map((id) => [id, sdk.datasets.receipt(id)?.sha256 || null])),
        claimBoundary: result.claimBoundary,
      });
    }

    function setScenario(nextScenario) {
      activeScenario = normalizeScenario(nextScenario, config);
      current = engine.runScenario({ datasets, scenario: activeScenario, config, random: sdk.random, scheduler: sdk.scheduler });
      appendScenarioReceipt(current);
      sdk.events.propose({ pluginId: PLUGIN_ID, kind: `${PLUGIN_ID}.scenario-computed`, scenarioId: current.scenarioId, result: current });
      return current;
    }

    function contributeRequest({ sourceText, mission = null }) {
      if (!/\b(?:maritime|shipping|container|port|suez|panama|vessel|ocean\s+freight|trade\s+corridor)\b/i.test(sourceText || '')) return null;
      if (!mission) return { recognized: true, obligations: [], unresolved: [] };
      return { recognized: true, obligations: [
        { id: `${PLUGIN_ID}:delivery:${activeScenario.id}`, kind: 'container_delivery', required: true },
        { id: `${PLUGIN_ID}:lineage:${activeScenario.id}`, kind: 'container_lineage', required: true },
      ], unresolved: [] };
    }

    function appendVoyageReceipts(result) {
      sdk.receipts.append({
        schema: 'simulatte.plugin.maritimeVoyageReceipt.v1', scenarioId: result.scenarioId,
        routeId: result.route.id, distanceNm: result.metrics.distanceNm, transitDays: result.metrics.totalTransitDays,
        queueWaitHours: result.metrics.queueWaitHours, fuelTons: result.metrics.fuelTons, co2Tons: result.metrics.co2Tons,
        claimBoundary: result.claimBoundary,
      });
      sdk.receipts.append({
        schema: 'simulatte.plugin.maritimeQueueReceipt.v1', scenarioId: result.scenarioId,
        portId: result.queue.portId, serverCount: result.queue.serverCount, vesselCount: result.queue.vesselCount,
        averageWaitHours: result.queue.averageWaitHours, p95WaitHours: result.queue.p95WaitHours,
      });
      sdk.receipts.append({
        schema: 'simulatte.plugin.containerLineageReceipt.v1', scenarioId: result.scenarioId,
        containerCount: result.ledger.totalContainers, deliveredCount: result.metrics.containersDelivered,
        lineageEventCount: result.ledger.containers.reduce((sum, row) => sum + row.lineage.length, 0),
      });
      sdk.receipts.append({
        schema: 'simulatte.plugin.maritimeEmissionsReceipt.v1', scenarioId: result.scenarioId,
        fuelTons: result.emissions.fuelTons, co2Tons: result.emissions.co2Tons,
        intensityGCo2PerTeuNm: result.emissions.intensityGCo2PerTeuNm, method: result.emissions.method,
      });
    }

    function handleAction(actionId) {
      const result = sdk.state.read().result;
      if (actionId === 'scenario.run' || actionId === 'simulate.corridor') {
        appendVoyageReceipts(result);
        sdk.events.propose({ pluginId: PLUGIN_ID, kind: `${PLUGIN_ID}.voyage-recorded`, actionId, result });
        return { status: 'settled', metrics: result.metrics };
      }
      if (actionId === 'counterfactual.compare') {
        const baselineScenario = { id: 'asia-europe-mainline', scenarioId: 'asia-europe-mainline', seed: result.seed };
        const baseline = engine.runScenario({ datasets, scenario: baselineScenario, config, random: sdk.random, scheduler: sdk.scheduler });
        const delayDays = result.metrics.totalTransitDays - baseline.metrics.totalTransitDays;
        const extraCo2Tons = result.metrics.co2Tons - baseline.metrics.co2Tons;
        sdk.receipts.append({
          schema: 'simulatte.plugin.maritimeCounterfactualReceipt.v1', baselineScenarioId: baseline.scenarioId,
          counterfactualScenarioId: result.scenarioId, delayDays, extraCo2Tons,
          commonSeed: result.seed, claimBoundary: 'Counterfactual reuses the same scenario seed and governed vessel/corridor artifacts.',
        });
        return { status: 'settled', delayDays, extraCo2Tons };
      }
      return { status: 'refused', reason: 'unknown_action', actionId };
    }

    function settle() {
      const state = sdk.state.read();
      const result = state.result;
      return { obligationResults: [
        { obligationId: `${PLUGIN_ID}:delivery:${state.scenarioId}`, status: result.metrics.containersDelivered === result.metrics.containersTotal ? 'settled' : 'unmet', evidence: { delivered: result.metrics.containersDelivered, total: result.metrics.containersTotal } },
        { obligationId: `${PLUGIN_ID}:lineage:${state.scenarioId}`, status: result.ledger.containers.every((row) => row.lineage.length >= 4) ? 'settled' : 'unmet', evidence: { minimumEvents: Math.min(...result.ledger.containers.map((row) => row.lineage.length)) } },
        { obligationId: `${PLUGIN_ID}:queue-audit`, status: result.schedulerReceipt.processedCount === result.eventTrace.length ? 'settled' : 'unmet', evidence: result.schedulerReceipt },
      ], stateIdentity: `${state.scenarioId}:${result.route.id}:${result.schedulerReceipt.processedCount}`, losses: [] };
    }

    function view() {
      const result = sdk.state.read().result;
      return [
        { slot: 'inspector', title: 'Maritime Trade Global', rows: [
          { label: 'Scenario', value: result.scenarioId }, { label: 'Corridor', value: result.route.name },
          { label: 'Disruption', value: result.disruption.id }, { label: 'Distance', value: `${result.metrics.distanceNm.toLocaleString()} NM` },
          { label: 'Transit', value: `${result.metrics.totalTransitDays.toFixed(2)} days` },
          { label: 'Queue average / p95', value: `${result.queue.averageWaitHours.toFixed(1)} / ${result.queue.p95WaitHours.toFixed(1)} h` },
          { label: 'Containers delivered', value: `${result.metrics.containersDelivered}/${result.metrics.containersTotal}` },
          { label: 'Fuel / CO₂', value: `${result.metrics.fuelTons.toFixed(0)} / ${result.metrics.co2Tons.toFixed(0)} t` },
          { label: 'CO₂ intensity', value: result.metrics.intensityGCo2PerTeuNm == null ? 'n/a' : `${result.metrics.intensityGCo2PerTeuNm.toFixed(2)} g/TEU-NM` },
        ], actions: [
          { id: 'simulate.corridor', label: 'Simulate voyage' },
          { id: 'counterfactual.compare', label: 'Compare baseline' },
        ] },
        { slot: 'hud', title: 'Maritime claim boundary', rows: [
          { label: 'Model', value: 'Synthetic route, queue, lineage, and emissions scenario' },
          { label: 'Boundary', value: result.claimBoundary },
        ], actions: [] },
      ];
    }
    function present() { const result = sdk.state.read().result; return presentationApi.createPresentation(datasets.ports, result); }

    const capabilities = Object.freeze({
      'simulation.maritime-logistics.v1': () => sdk.state.read().result,
      'field.ocean-freight.v1': () => ({ schema: 'field.ocean-freight.v1', value: sdk.state.read().result.metrics.totalTransitDays, units: 'days', providerId: PLUGIN_ID }),
      'simulation.maritime-trade.v1': () => sdk.state.read().result,
      'field.maritime-emissions.v1': () => sdk.state.read().result.emissions,
    });
    return Object.freeze({ id: PLUGIN_ID, contributeRequest, setScenario, handleAction, settle, view, present, reduce, capabilities, dispose() {} });
  }

  function normalizeScenario(value, config) {
    if (typeof value === 'string') return Object.freeze({ id: value, scenarioId: value, seed: value });
    const id = value?.scenarioId || value?.id || config?.defaultScenarioId || 'asia-europe-mainline';
    return Object.freeze({ ...value, id, scenarioId: id, seed: value?.seed || id });
  }
  function reduce(state, event) {
    if (event.kind === `${PLUGIN_ID}.scenario-computed`) return { ...state, scenarioId: event.scenarioId, result: event.result, lastAction: 'scenario' };
    if (event.kind === `${PLUGIN_ID}.voyage-recorded`) return { ...state, result: event.result, lastAction: event.actionId };
    return state;
  }
  const datasetValidators = Object.freeze({
    'simulatte.worldPortsWpi.v1': (value) => { if (!Array.isArray(value?.ports) || value.ports.length < 2) throw new Error('port catalog incomplete'); return value; },
    'simulatte.maritimeVesselClasses.v1': (value) => { if (!value?.classes || !Object.keys(value.classes).length) throw new Error('vessel classes missing'); return value; },
    'simulatte.shippingLaneRoutes.v1': (value) => { if (!Array.isArray(value?.corridors) || !value.corridors.length) throw new Error('shipping corridors missing'); return value; },
    'simulatte.oceanChokepoints.v1': (value) => { if (!Array.isArray(value?.chokepoints)) throw new Error('ocean chokepoints missing'); return value; },
    'simulatte.maritimeWeatherSnapshot.v1': (value) => value,
  });
  return Object.freeze({ activate, datasetValidators });
});
