(function attachMaritimeTradePlugin(root, factory) {
  const containerLedger = typeof module === 'object' && module.exports ? require('./container-ledger.js') : root.MaritimeContainerLedger;
  const queueEngine = typeof module === 'object' && module.exports ? require('./queue-engine.js') : root.MaritimeQueueEngine;
  const api = factory(containerLedger, queueEngine);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulattePluginMaritimeTradeGlobal = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createMaritimeTradePluginApi(containerLedger, queueEngine) {
  async function activate({ sdk, config, profile, scenario }) {
    const portsData = sdk.datasets.require('world.ports.wpi.v1');
    const vesselClassesData = sdk.datasets.require('maritime.vessel.classes.v1');
    const shippingLanesData = sdk.datasets.require('shipping.lane.routes.v1');

    let activeScenarioId = scenario?.id || config?.defaultScenarioId || 'transpacific-baseline';
    let isDisrupted = activeScenarioId.includes('suez') || activeScenarioId.includes('panama') || activeScenarioId.includes('cyclone');

    let routePlan = globalThis.MaritimeTradeRouting.computeRoute(
      shippingLanesData,
      vesselClassesData,
      isDisrupted ? 'route-cape-good-hope' : 'route-asia-europe',
      config?.defaultVesselClass || 'ultra-large-container-v1'
    );

    let ledger = containerLedger ? containerLedger.createContainerLedger(activeScenarioId, 1200) : null;
    let portQueue = queueEngine ? queueEngine.simulatePortQueue('EGSUE', 25, isDisrupted) : null;

    function setScenario(nextScenario) {
      activeScenarioId = typeof nextScenario === 'string' ? nextScenario : nextScenario?.id || 'transpacific-baseline';
      isDisrupted = activeScenarioId.includes('suez') || activeScenarioId.includes('panama') || activeScenarioId.includes('cyclone');
      routePlan = globalThis.MaritimeTradeRouting.computeRoute(
        shippingLanesData,
        vesselClassesData,
        isDisrupted ? 'route-cape-good-hope' : 'route-asia-europe',
        config?.defaultVesselClass || 'ultra-large-container-v1'
      );
      ledger = containerLedger ? containerLedger.createContainerLedger(activeScenarioId, 1200) : null;
      portQueue = queueEngine ? queueEngine.simulatePortQueue(isDisrupted ? 'EGSUE' : 'SGSIN', 25, isDisrupted) : null;
      return { activeScenarioId, isDisrupted, routePlan };
    }

    function handleAction(actionId, context = {}) {
      if (actionId === 'simulate.corridor') {
        sdk.receipts.append({
          schema: 'simulatte.plugin.maritimeVoyageReceipt.v1',
          scenarioId: activeScenarioId,
          transitDays: routePlan.transitDays,
          fuelTons: routePlan.totalFuelTons,
          co2Tons: routePlan.totalCo2Tons,
          queueWaitHours: portQueue?.avgWaitHours || 0
        });
        return { status: 'settled', transitDays: routePlan.transitDays, co2Tons: routePlan.totalCo2Tons };
      }
      if (actionId === 'counterfactual.compare') {
        const baselinePlan = globalThis.MaritimeTradeRouting.computeRoute(shippingLanesData, vesselClassesData, 'route-asia-europe', 'ultra-large-container-v1');
        const delayDays = routePlan.transitDays - baselinePlan.transitDays;
        const extraCo2 = routePlan.totalCo2Tons - baselinePlan.totalCo2Tons;
        sdk.receipts.append({
          schema: 'simulatte.plugin.maritimeCounterfactualReceipt.v1',
          baselineScenarioId: 'transpacific-baseline',
          counterfactualScenarioId: activeScenarioId,
          delayDays,
          extraCo2Tons: extraCo2
        });
        return { status: 'settled', delayDays, extraCo2Tons: extraCo2 };
      }
      return { status: 'refused', reason: 'unknown_action' };
    }

    function settle() {
      const results = [
        { obligationId: 'maritime:route-efficiency', status: routePlan.transitDays < 45 ? 'settled' : 'unmet', evidence: { transitDays: routePlan.transitDays } },
        { obligationId: 'maritime:emissions-intensity', status: routePlan.totalCo2Tons < 15000 ? 'settled' : 'unmet', evidence: { totalCo2Tons: routePlan.totalCo2Tons } }
      ];
      return { obligationResults: results, stateIdentity: `${activeScenarioId}:${routePlan.name}`, losses: [] };
    }

    function view() {
      return {
        slot: 'inspector',
        title: 'Maritime Trade Global',
        rows: [
          { label: 'Scenario', value: activeScenarioId },
          { label: 'Corridor', value: routePlan.name },
          { label: 'Distance', value: `${routePlan.distanceNm.toLocaleString()} NM` },
          { label: 'Transit Time', value: `${routePlan.transitDays.toFixed(1)} days` },
          { label: 'Port Queue Wait', value: `${portQueue?.avgWaitHours.toFixed(1) || 0} hours` },
          { label: 'Container Cargo', value: `${ledger?.totalContainers || 0} TEUs` },
          { label: 'Fuel Consumed', value: `${routePlan.totalFuelTons.toFixed(0)} tons` },
          { label: 'CO2 Emissions', value: `${routePlan.totalCo2Tons.toFixed(0)} tons` }
        ],
        actions: [
          { id: 'simulate.corridor', label: 'Simulate Voyage' },
          { id: 'counterfactual.compare', label: 'Compare Counterfactual Delay' }
        ]
      };
    }

    function present() {
      return globalThis.MaritimeTradePresentation.createPresentation(portsData, routePlan);
    }

    return Object.freeze({
      id: 'maritime-trade-global',
      setScenario,
      view,
      handleAction,
      settle,
      present,
      capabilities: {
        'simulation.maritime-logistics.v1': () => ({ routePlan, ledger, portQueue }),
        'field.ocean-freight.v1': () => ({ co2Tons: routePlan.totalCo2Tons, transitDays: routePlan.transitDays })
      },
      dispose() {}
    });
  }

  return Object.freeze({ activate });
});
