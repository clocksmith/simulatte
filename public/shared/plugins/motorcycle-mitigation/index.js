(function attachMotorcycleMitigationPlugin(root, factory) {
  const sim = typeof module === 'object' && module.exports
    ? require('../../../simulatte/motorcycle-mitigation/simulation.js')
    : root.SimulatteMotorcycleSimulation;
  const v4 = typeof module === 'object' && module.exports
    ? require('./v4-contribution.js')
    : root.SimulatteMotorcycleMitigationV4;

  const api = factory(sim, v4);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulattePluginMotorcycleMitigation = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createMotorcycleMitigationPlugin(sim, v4) {
  'use strict';

  const PLUGIN_ID = 'motorcycle-mitigation';

  function createInstance(initialConfig = {}) {
    let simulation = sim.createSimulation({
      scenarioId: initialConfig.scenarioId || 'avenue-straight-pipe-run',
    });

    if (initialConfig) {
      if (initialConfig.reverseSoundEnabled !== undefined) {
        simulation.setControl('reverseSoundEnabled', initialConfig.reverseSoundEnabled);
      }
      if (initialConfig.reverseSoundPower !== undefined) {
        simulation.setControl('reverseSoundPower', initialConfig.reverseSoundPower);
      }
      if (initialConfig.hydroSuppressionEnabled !== undefined) {
        simulation.setControl('hydroSuppressionEnabled', initialConfig.hydroSuppressionEnabled);
      }
      if (initialConfig.hydroMistRate !== undefined) {
        simulation.setControl('hydroMistRate', initialConfig.hydroMistRate);
      }
      if (initialConfig.acousticTrackingEnabled !== undefined) {
        simulation.setControl('acousticTrackingEnabled', initialConfig.acousticTrackingEnabled);
      }
      if (initialConfig.trackingThresholdDba !== undefined) {
        simulation.setControl('trackingThresholdDba', initialConfig.trackingThresholdDba);
      }
    }

    function step(dtSeconds = 0.05) {
      return simulation.step(dtSeconds);
    }

    function getState() {
      return simulation.getState();
    }

    function getMetrics() {
      return simulation.getMetrics();
    }

    function setControl(key, value) {
      simulation.setControl(key, value);
    }

    function reset() {
      simulation.reset();
    }

    function getV4Contribution() {
      return v4.createContribution({
        state: simulation.getState(),
        config: initialConfig,
      });
    }

    return Object.freeze({
      step,
      getState,
      getMetrics,
      setControl,
      reset,
      getV4Contribution,
      scenario: simulation.scenario,
    });
  }

  async function activate({ sdk, config = {}, scenario = null }) {
    const instance = createInstance({
      ...config,
      scenarioId: scenario?.scenarioId || scenario?.id,
    });

    if (sdk && sdk.state && typeof sdk.state.register === 'function') {
      sdk.state.register(
        (prevState, action) => {
          if (action.type === 'STEP') {
            instance.step(action.dt || 0.05);
            return instance.getState();
          }
          if (action.type === 'SET_CONTROL') {
            instance.setControl(action.key, action.value);
            return instance.getState();
          }
          if (action.type === 'RESET') {
            instance.reset();
            return instance.getState();
          }
          return prevState || instance.getState();
        },
        instance.getState()
      );
    }

    return instance;
  }

  return Object.freeze({
    PLUGIN_ID,
    createInstance,
    activate,
    ENGINE_PROFILES: sim.ENGINE_PROFILES,
    INTAKE_PROFILES: sim.INTAKE_PROFILES,
    SCENARIOS: sim.SCENARIOS,
  });
});
