(function attachOrbitalTransferPlugin(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulattePluginOrbitalTransferPlanner = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createOrbitalTransferPluginApi() {
  async function activate({ sdk, config, profile, scenario }) {
    const ephemerisData = sdk.datasets.require('jpl.horizons.heliocentric-vectors.v1');
    const gmData = sdk.datasets.require('solar.system.gm-constants-de440.v1');
    const radData = sdk.datasets.optional('solar.radiation.snapshot.v1');

    const sunGm = gmData.bodies.sun.gmAuD2;

    let activeScenarioId = scenario?.id || config?.defaultScenarioId || 'earth-mars-hohmann';
    let targetBody = activeScenarioId.includes('venus') ? 'venus' : activeScenarioId.includes('jupiter') ? 'jupiter' : 'mars';

    let earthState = globalThis.OrbitalTransferEphemeris.getBodyState(ephemerisData, 'earth', 0);
    let targetState = globalThis.OrbitalTransferEphemeris.getBodyState(ephemerisData, targetBody, 0);

    let r1 = Math.hypot(...earthState.positionAu);
    let r2 = Math.hypot(...targetState.positionAu);

    let hohmannResult = globalThis.OrbitalTransferHohmann.computeHohmann(r1, r2, sunGm);
    let radExposure = globalThis.OrbitalTransferRadiation.computeExposure(hohmannResult.timeOfFlightDays, radData, 15);

    function setScenario(nextScenario) {
      activeScenarioId = typeof nextScenario === 'string' ? nextScenario : nextScenario?.id || 'earth-mars-hohmann';
      targetBody = activeScenarioId.includes('venus') ? 'venus' : activeScenarioId.includes('jupiter') ? 'jupiter' : 'mars';
      earthState = globalThis.OrbitalTransferEphemeris.getBodyState(ephemerisData, 'earth', 0);
      targetState = globalThis.OrbitalTransferEphemeris.getBodyState(ephemerisData, targetBody, 0);
      r1 = Math.hypot(...earthState.positionAu);
      r2 = Math.hypot(...targetState.positionAu);
      hohmannResult = globalThis.OrbitalTransferHohmann.computeHohmann(r1, r2, sunGm);
      radExposure = globalThis.OrbitalTransferRadiation.computeExposure(hohmannResult.timeOfFlightDays, radData, 15);
      return { activeScenarioId, targetBody, hohmannResult, radExposure };
    }

    function handleAction(actionId, context = {}) {
      if (actionId === 'plan.transfer') {
        sdk.receipts.append({
          schema: 'simulatte.plugin.orbitalTransferReceipt.v1',
          scenarioId: activeScenarioId,
          targetBody,
          timeOfFlightDays: hohmannResult.timeOfFlightDays,
          totalDvKmS: hohmannResult.totalDvKmS,
          radiationExposureUnits: radExposure.shieldedProtonUnits
        });
        return { status: 'settled', timeOfFlightDays: hohmannResult.timeOfFlightDays, totalDvKmS: hohmannResult.totalDvKmS };
      }
      if (actionId === 'counterfactual.compare') {
        const baselineHohmann = globalThis.OrbitalTransferHohmann.computeHohmann(1.0, 1.523, sunGm);
        const deltaDv = hohmannResult.totalDvKmS - baselineHohmann.totalDvKmS;
        const deltaDays = hohmannResult.timeOfFlightDays - baselineHohmann.timeOfFlightDays;
        sdk.receipts.append({
          schema: 'simulatte.plugin.orbitalCounterfactualReceipt.v1',
          baselineScenarioId: 'earth-mars-hohmann',
          counterfactualScenarioId: activeScenarioId,
          deltaDvKmS: deltaDv,
          deltaDays
        });
        return { status: 'settled', deltaDvKmS: deltaDv, deltaDays };
      }
      return { status: 'refused', reason: 'unknown_action' };
    }

    function settle() {
      const results = [
        { obligationId: 'orbital:dv-envelope', status: hohmannResult.totalDvKmS <= 6.5 ? 'settled' : 'unmet', evidence: { totalDvKmS: hohmannResult.totalDvKmS, limitDv: 6.5 } },
        { obligationId: 'orbital:tof-window', status: hohmannResult.timeOfFlightDays <= 300 ? 'settled' : 'unmet', evidence: { timeOfFlightDays: hohmannResult.timeOfFlightDays, limitDays: 300 } }
      ];
      return { obligationResults: results, stateIdentity: `${activeScenarioId}:${targetBody}`, losses: [] };
    }

    function view() {
      return {
        slot: 'inspector',
        title: 'Orbital Transfer Planner',
        rows: [
          { label: 'Scenario', value: activeScenarioId },
          { label: 'Departure', value: `Earth (${r1.toFixed(2)} AU)` },
          { label: 'Target', value: `${targetBody.toUpperCase()} (${r2.toFixed(2)} AU)` },
          { label: 'Time of Flight', value: `${hohmannResult.timeOfFlightDays.toFixed(1)} days` },
          { label: 'Total Δv', value: `${hohmannResult.totalDvKmS.toFixed(2)} km/s` },
          { label: 'Radiation Dose', value: `${radExposure.shieldedProtonUnits.toFixed(2)} units` }
        ],
        actions: [
          { id: 'plan.transfer', label: 'Compute Transfer' },
          { id: 'counterfactual.compare', label: 'Compare Hohmann Counterfactual' }
        ]
      };
    }

    function present() {
      return globalThis.OrbitalTransferPresentation.createPresentation(ephemerisData, {
        trajectory: [earthState.positionAu, targetState.positionAu]
      });
    }

    return Object.freeze({
      id: 'orbital-transfer-planner',
      setScenario,
      view,
      handleAction,
      settle,
      present,
      capabilities: {
        'simulation.orbital-transfer.v1': () => hohmannResult,
        'simulation.orbital-kinetics.v1': () => hohmannResult,
        'field.solar-radiation.v1': () => radExposure
      },
      dispose() {}
    });
  }

  return Object.freeze({ activate });
});
