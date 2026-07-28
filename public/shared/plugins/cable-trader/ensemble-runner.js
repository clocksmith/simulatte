(function attachCableTraderEnsemble(root, factory) {
  const network = typeof module === 'object' && module.exports
    ? require('./network-simulation.js')
    : root.SimulatteCableTraderNetwork;
  const api = factory(root, network);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteCableTraderEnsemble = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createCableTraderEnsemble(root, network) {
  const BRANCH_ROLES = Object.freeze(['baseline', 'intervention']);
  const METRICS = Object.freeze([
    'fulfillmentPercent',
    'unservedDemandEvents',
    'transferBurden',
    'inventoryDepletion',
    'hubInventoryImbalance',
  ]);

  async function runEnsemble({ config, transferRoutes }) {
    network = network || root.SimulatteCableTraderNetwork;
    if (!network?.simulateNetwork || !network?.sha256Hex || !network?.canonical) {
      throw ensembleError('cable_ensemble_runtime_unavailable', 'Cable ensemble requires the network simulation runtime');
    }
    validateInputs(config, transferRoutes);
    const members = [];
    for (let index = 0; index < config.simulation.ensembleSeeds.length; index += 1) {
      const baseSeed = config.simulation.ensembleSeeds[index];
      const memberConfig = {
        ...config,
        simulation: { ...config.simulation, seed: baseSeed },
      };
      const intervention = network.simulateNetwork(memberConfig, transferRoutes, {
        allocationPolicy: config.simulation.allocationObjective,
      });
      const baseline = network.simulateNetwork(memberConfig, transferRoutes, {
        allocationPolicy: 'cheapest',
        exogenous: intervention.exogenous,
      });
      assertMatchedMember(baseline, intervention);
      members.push(createMember(index, baseSeed, baseline, intervention));
      // Each member runs both allocation branches. Yield between every member so
      // browser scenario changes never combine two complete paired simulations
      // into one main-thread long task.
      if (index + 1 < config.simulation.ensembleSeeds.length) {
        await yieldBrowserTask();
      }
    }
    const selectedCableFamilyIds = members[0].selectedCableFamilyIds;
    const ensembleId = `cable-trader:ensemble:${network.sha256Hex(network.canonical({
      scenarioProfileId: members[0].scenarioProfileId,
      selectedCableFamilyIds,
      memberConfigurationHashes: members.map((row) => row.configurationHash),
    })).slice(0, 24)}`;
    const distributions = createDistributions(members);
    const receipt = deepFreeze({
      schema: 'simulatte.plugin.cableTraderEnsembleReceipt.v1',
      ensembleId,
      scenarioProfileId: members[0].scenarioProfileId,
      selectedCableFamilyIds,
      declaredBaseSeeds: [...config.simulation.ensembleSeeds],
      derivedSeeds: members.map((row) => row.seed),
      scenarioIds: members.map((row) => row.scenarioId),
      configurationHashes: members.map((row) => row.configurationHash),
      memberIds: members.map((row) => row.id),
      branchRoles: BRANCH_ROLES,
      distributions,
      uncertainty: {
        kind: 'distribution',
        value: {
          label: 'scenario_variance',
          ensembleSize: members.length,
          calibrationStatus: 'uncalibrated_arrival_and_return_processes',
        },
      },
      origin: 'simulated',
      temporalStatus: 'forecast',
      claimBoundary: 'Distributions report scenario variance across declared seeds. Arrival and return processes are not calibrated from observed operations.',
    });
    return Object.freeze({
      schema: 'simulatte.plugin.cableTraderEnsembleRun.v1',
      ensembleId,
      members: Object.freeze(members),
      distributions,
      receipt,
    });
  }

  function createMember(index, baseSeed, baseline, intervention) {
    return deepFreeze({
      schema: 'simulatte.plugin.cableTraderEnsembleMember.v1',
      id: `cable-trader:ensemble-member:${intervention.configurationHash.slice(0, 24)}`,
      index,
      baseSeed,
      seed: intervention.seed,
      scenarioId: intervention.scenarioId,
      scenarioProfileId: intervention.scenarioProfileId,
      configurationHash: intervention.configurationHash,
      selectedCableFamilyIds: intervention.selectedCableFamilyIds,
      branches: {
        baseline: timeline(baseline),
        intervention: timeline(intervention),
      },
    });
  }

  function timeline(simulation) {
    return {
      schema: 'simulatte.plugin.cableTraderEnsembleTimeline.v1',
      simulationId: simulation.id,
      allocationPolicy: simulation.allocationPolicy,
      eventIds: simulation.events.map((row) => row.id),
      daily: simulation.daily.map((row) => ({ ...row })),
      terminalMetrics: terminalMetrics(simulation),
    };
  }

  function terminalMetrics(simulation) {
    const inventories = simulation.hubStats.map((row) => row.endingInventory);
    return {
      fulfillmentPercent: simulation.summary.fulfillmentPercent,
      unservedDemandEvents: simulation.summary.shortageMeters,
      transferBurden: simulation.summary.totalBurden,
      inventoryDepletion: simulation.summary.startingInventory - simulation.summary.endingInventory,
      hubInventoryImbalance: Math.max(...inventories) - Math.min(...inventories),
    };
  }

  function createDistributions(members) {
    const byBranch = Object.fromEntries(BRANCH_ROLES.map((role) => [role, Object.fromEntries(
      METRICS.map((metricId) => [
        metricId,
        distribution(members.map((member) => member.branches[role].terminalMetrics[metricId])),
      ])
    )]));
    const deltas = Object.fromEntries(METRICS.map((metricId) => [
      metricId,
      distribution(members.map((member) => (
        member.branches.intervention.terminalMetrics[metricId]
        - member.branches.baseline.terminalMetrics[metricId]
      ))),
    ]));
    return deepFreeze({
      schema: 'simulatte.plugin.cableTraderScenarioVariance.v1',
      label: 'scenario_variance',
      calibrationStatus: 'uncalibrated_arrival_and_return_processes',
      branches: byBranch,
      interventionMinusBaseline: deltas,
    });
  }

  function distribution(inputValues) {
    const values = [...inputValues];
    const sorted = [...values].sort((left, right) => left - right);
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    return {
      values,
      minimum: sorted[0],
      maximum: sorted.at(-1),
      mean: round(mean),
      median: round(quantile(sorted, 0.5)),
      p10: round(quantile(sorted, 0.1)),
      p90: round(quantile(sorted, 0.9)),
    };
  }

  function quantile(sorted, probability) {
    const position = (sorted.length - 1) * probability;
    const lower = Math.floor(position);
    const upper = Math.ceil(position);
    if (lower === upper) return sorted[lower];
    return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
  }

  function assertMatchedMember(baseline, intervention) {
    if (network.canonical(baseline.exogenous) !== network.canonical(intervention.exogenous)
      || baseline.scenarioId !== intervention.scenarioId
      || baseline.configurationHash !== intervention.configurationHash
      || network.canonical(baseline.selectedCableFamilyIds) !== network.canonical(intervention.selectedCableFamilyIds)) {
      throw ensembleError('cable_ensemble_branch_identity_mismatch', 'Cable ensemble branches must share one governed scenario realization');
    }
  }

  function validateInputs(config, transferRoutes) {
    if (!config?.simulation
      || !Array.isArray(config.simulation.ensembleSeeds)
      || config.simulation.ensembleSeeds.length < 2
      || !Array.isArray(transferRoutes)) {
      throw ensembleError('cable_ensemble_inputs_invalid', 'Cable ensemble requires config, declared seeds, and transfer routes');
    }
  }

  function round(value) {
    return Math.round(value * 10000) / 10000;
  }

  function yieldBrowserTask() {
    if (typeof window === 'undefined') return Promise.resolve();
    return new Promise((resolve) => setTimeout(resolve, 0));
  }

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
  }

  function ensembleError(code, message) {
    const error = new Error(`${code}: ${message}`);
    error.name = 'CableTraderEnsembleError';
    error.code = code;
    return error;
  }

  return Object.freeze({ runEnsemble });
});
