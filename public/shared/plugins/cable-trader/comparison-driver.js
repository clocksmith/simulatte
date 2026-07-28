(function attachCableTraderComparison(root, factory) {
  const network = typeof module === 'object' && module.exports
    ? require('./network-simulation.js')
    : root.SimulatteCableTraderNetwork;
  const v4Contribution = typeof module === 'object' && module.exports
    ? require('./v4-contribution.js')
    : root.SimulatteCableTraderV4Contribution;
  const comparisonModule = typeof module === 'object' && module.exports
    ? require('../../../simulatte/platform/core/simulation/comparison-execution.js')
    : root.SimulatteComparisonExecution;
  const pluginContracts = typeof module === 'object' && module.exports
    ? require('../../../simulatte/platform/contracts/plugin-v4-contracts.js')
    : root.SimulattePluginV4Contracts;
  const builder = typeof module === 'object' && module.exports
    ? require('../../core/simulation/plugin-v4-builder.js')
    : root.SimulattePluginV4Builder;
  const nodeCrypto = typeof module === 'object' && module.exports
    ? require('node:crypto')
    : null;
  const api = factory(
    root,
    network,
    v4Contribution,
    comparisonModule,
    pluginContracts,
    builder,
    nodeCrypto
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteCableTraderComparison = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createCableTraderComparison(
  root,
  network,
  v4Contribution,
  comparisonModule,
  pluginContracts,
  builder,
  nodeCrypto
) {
  const DAY_MS = 86400000;
  const PLUGIN_ID = 'cable-trader';
  const ROLES = Object.freeze(['baseline', 'intervention']);
  const COMPARISONS = Object.freeze({
    'cheapest-vs-fastest': Object.freeze({ baseline: 'cheapest', intervention: 'fastest' }),
    'cheapest-vs-fairness': Object.freeze({ baseline: 'cheapest', intervention: 'fairness-first' }),
  });

  async function runComparison({
    config,
    transferRoutes,
    interventionSimulation,
    comparisonId = 'cheapest-vs-fastest',
  }) {
    network = network || root.SimulatteCableTraderNetwork;
    v4Contribution = v4Contribution || root.SimulatteCableTraderV4Contribution;
    comparisonModule = comparisonModule || root.SimulatteComparisonExecution;
    pluginContracts = pluginContracts || root.SimulattePluginV4Contracts;
    builder = builder || root.SimulattePluginV4Builder;
    if (!network?.simulateNetwork
      || !v4Contribution?.MODEL_IDENTITIES
      || !comparisonModule?.createComparisonExecution
      || !pluginContracts?.createProvenance
      || !builder?.modelRecord) {
      throw comparisonError(
        'cable_comparison_runtime_unavailable',
        'Cable comparison requires the shared comparison execution runtime'
      );
    }
    validateInputs(config, transferRoutes, interventionSimulation);
    const policies = COMPARISONS[comparisonId];
    if (!policies) {
      throw comparisonError('cable_comparison_id_invalid', `Unknown Cable Trader comparison ${comparisonId}`);
    }
    const effectiveConfig = {
      ...config,
      simulation: {
        ...config.simulation,
        seed: interventionSimulation.baseSeed,
        scenarioId: interventionSimulation.scenarioProfileId,
        selectedCableFamilyIds: interventionSimulation.selectedCableFamilyIds,
      },
    };
    const baselineSimulation = network.simulateNetwork(effectiveConfig, transferRoutes, {
      allocationPolicy: policies.baseline,
      exogenous: interventionSimulation.exogenous,
    });
    const variantSimulation = network.simulateNetwork(effectiveConfig, transferRoutes, {
      allocationPolicy: policies.intervention,
      exogenous: interventionSimulation.exogenous,
    });
    assertSharedExogenous(variantSimulation, baselineSimulation);
    await yieldBrowserTask();
    const inputHash = await sha256Json({ config: effectiveConfig, transferRoutes });
    const hiddenTruthHash = await sha256Json(interventionSimulation.exogenous);
    const branchConfigurations = Object.freeze({
      baseline: Object.freeze({
        allocationPolicy: policies.baseline,
        configurationHash: interventionSimulation.configurationHash,
        selectedCableFamilyIds: interventionSimulation.selectedCableFamilyIds,
      }),
      intervention: Object.freeze({
        allocationPolicy: policies.intervention,
        configurationHash: interventionSimulation.configurationHash,
        selectedCableFamilyIds: interventionSimulation.selectedCableFamilyIds,
      }),
    });
    const configurationHashes = Object.freeze({
      baseline: await sha256Json(branchConfigurations.baseline),
      intervention: await sha256Json(branchConfigurations.intervention),
    });
    const startingIdentity = deepFreeze({
      schema: 'simulatte.comparisonStartingIdentity.v4',
      scenarioId: interventionSimulation.scenarioId,
      seed: interventionSimulation.seed,
      inputHash,
      datasetHashes: [
        {
          id: v4Contribution.DATASET_REFERENCE.id,
          sha256: v4Contribution.DATASET_REFERENCE.sha256,
        },
        {
          id: config.id,
          sha256: interventionSimulation.configurationHash,
        },
      ],
      modelHashes: [{
        id: `${PLUGIN_ID}:model:event-generator`,
        sha256: v4Contribution.MODEL_IDENTITIES.eventModelHash,
      }],
      hiddenTruth: {
        id: `${PLUGIN_ID}:exogenous:${interventionSimulation.configurationHash}`,
        sha256: hiddenTruthHash,
      },
    });
    const evidenceCatalog = createEvidenceCatalog(effectiveConfig);
    const simulations = Object.freeze({
      baseline: baselineSimulation,
      intervention: variantSimulation,
    });
    const execution = comparisonModule.createComparisonExecution({
      id: comparisonId,
      synchronizationPolicy: 'lockstep',
      startingIdentity,
      observableInput: {
        scenarioId: interventionSimulation.scenarioId,
        configurationHash: interventionSimulation.configurationHash,
        durationDays: interventionSimulation.durationDays,
        hubIds: config.hubs.map((hub) => hub.id),
        selectedCableFamilyIds: interventionSimulation.selectedCableFamilyIds,
      },
      hiddenTruth: {
        id: startingIdentity.hiddenTruth.id,
        sha256: startingIdentity.hiddenTruth.sha256,
        value: interventionSimulation.exogenous,
      },
      branches: Object.fromEntries(ROLES.map((role) => [role, {
        id: `${comparisonId}:${role}`,
        configuration: branchConfigurations[role],
        configurationHash: configurationHashes[role],
        createPolicy: createPolicy,
        createSimulation: (context) => createBranchDriver({
          context,
          comparisonId,
          role,
          simulation: simulations[role],
          startingIdentity,
          config: effectiveConfig,
        }),
      }])),
      evidenceCatalog,
      requiredEvidenceIds: [
        `${PLUGIN_ID}:data:authored-scenario`,
        `${PLUGIN_ID}:model:event-generator`,
      ],
    });
    for (let day = 0; day < interventionSimulation.durationDays; day += 1) {
      execution.step(1);
      if ((day + 1) % 5 === 0 && day + 1 < interventionSimulation.durationDays) {
        await yieldBrowserTask();
      }
    }
    const settlement = execution.settle();
    return Object.freeze({
      schema: 'simulatte.plugin.cableTraderComparisonRun.v1',
      comparisonId,
      branchSummaries: deepFreeze({
        baseline: baselineSimulation.summary,
        intervention: variantSimulation.summary,
      }),
      branchEvidence: deepFreeze({
        baseline: comparisonEvidence(baselineSimulation),
        intervention: comparisonEvidence(variantSimulation),
      }),
      settlement,
      comparisonExecutionReceipt: execution.receipt(),
    });
  }

  function comparisonEvidence(simulation) {
    const final = simulation.snapshots.at(-1);
    return {
      policyId: simulation.allocationPolicy,
      transfers: final.transfers.map((row) => ({
        id: row.id,
        routeId: row.routeId,
        cableFamilyId: row.cableFamilyId,
        quantityMeters: row.quantityMeters,
        projectId: row.projectId,
      })),
      projectStats: final.projectStats.map((row) => ({
        id: row.id,
        siteId: row.siteId,
        requestedMeters: row.requestedMeters,
        deliveredMeters: row.deliveredMeters,
        inFlightMeters: row.inFlightMeters,
        completionPercent: row.completionPercent,
      })),
    };
  }

  function createPolicy(context) {
    return Object.freeze({
      decide() {
        return Object.freeze({
          allocationPolicy: context.configuration.allocationPolicy,
        });
      },
    });
  }

  function createBranchDriver({
    context,
    comparisonId,
    role,
    simulation,
    startingIdentity,
    config,
  }) {
    if (canonical(context.hiddenTruth) !== canonical(simulation.exogenous)) {
      throw comparisonError(
        'cable_comparison_exogenous_mismatch',
        `${role} simulation does not use the governed comparison inputs`
      );
    }
    if (simulation.allocationPolicy !== context.configuration.allocationPolicy) {
      throw comparisonError(
        'cable_comparison_policy_mismatch',
        `${role} simulation allocation policy does not match its branch`
      );
    }
    let day = 0;

    function observation() {
      const snapshot = simulation.snapshots[day];
      return deepFreeze({
        day,
        durationDays: simulation.durationDays,
        allocationPolicy: simulation.allocationPolicy,
        fulfilledDemandEvents: snapshot.summary.fulfilledNeeds,
        observedDemandEvents: snapshot.summary.needs,
        endingInventory: snapshot.summary.endingInventory,
      });
    }

    return Object.freeze({
      startingIdentity() {
        return startingIdentity;
      },
      observe: observation,
      nextEventTimeMs() {
        return (day + 1) * DAY_MS;
      },
      advance(request) {
        if (request.action.allocationPolicy !== simulation.allocationPolicy) {
          throw comparisonError(
            'cable_comparison_action_policy_mismatch',
            `${role} policy selected a different allocation mode`
          );
        }
        if (day >= simulation.durationDays) {
          throw comparisonError(
            'cable_comparison_branch_complete',
            `${role} branch is already terminal`
          );
        }
        day += 1;
        const event = createEvent({
          comparisonId,
          role,
          row: simulation.events[day - 1],
          sequence: day - 1,
          simulation,
          config,
        });
        return deepFreeze({
          schema: 'simulatte.comparisonBranchTransition.v4',
          simulationTimeMs: day * DAY_MS,
          status: day === simulation.durationDays ? 'terminal' : 'running',
          events: [event],
          metrics: createMetrics(simulation.snapshots[day], simulation, config),
          evidenceIds: branchEvidenceIds(simulation.allocationPolicy),
          observation: observation(),
        });
      },
      settle() {
        if (day !== simulation.durationDays) {
          throw comparisonError(
            'cable_comparison_branch_not_terminal',
            `${role} branch cannot settle before day ${simulation.durationDays}`
          );
        }
        return deepFreeze({
          schema: 'simulatte.comparisonBranchSettlement.v4',
          status: 'settled',
          metrics: createMetrics(simulation.snapshots[day], simulation, config),
          evidenceIds: branchEvidenceIds(simulation.allocationPolicy),
        });
      },
    });
  }

  function createEvent({ comparisonId, role, row, sequence, simulation, config }) {
    const modelRecord = allocationModel(simulation.allocationPolicy, config);
    return deepFreeze({
      schema: 'simulatte.pluginEvent.v4',
      id: `${PLUGIN_ID}:${role}:day-${sequence + 1}`,
      pluginId: PLUGIN_ID,
      sequence,
      simulationTimeMs: (sequence + 1) * DAY_MS,
      kind: row.kind,
      causationIds: sequence ? [`${PLUGIN_ID}:${role}:day-${sequence}`] : [],
      correlationId: comparisonId,
      payload: {
        allocationPolicy: simulation.allocationPolicy,
        scenarioId: simulation.scenarioId,
        configurationHash: simulation.configurationHash,
        selectedCableFamilyIds: simulation.selectedCableFamilyIds,
        measures: row.measures,
        affectedEntityIds: row.affectedEntityIds,
      },
      provenance: simulatedProvenance(config, [modelRecord]),
    });
  }

  function createMetrics(snapshot, simulation, config) {
    const modelRecord = allocationModel(simulation.allocationPolicy, config);
    const provenance = simulatedProvenance(config, [modelRecord]);
    const inventories = snapshot.hubStats.map((hub) => hub.endingInventory);
    const crossHubTransfers = snapshot.flows
      .filter((flow) => flow.sourceHubId !== flow.destinationHubId)
      .reduce((total, flow) => total + flow.quantity, 0);
    return Object.freeze([
      metric('delivered-cable', snapshot.summary.deliveredMeters, 'm', provenance),
      metric(
        'unserved-cable',
        snapshot.summary.shortageMeters,
        'm',
        provenance
      ),
      metric(
        'fulfillment-basis-points',
        Math.round(snapshot.summary.fulfillmentPercent * 100),
        'basis points',
        provenance
      ),
      metric('transfer-burden', snapshot.summary.totalBurden, 'cost units', provenance),
      metric('transferred-cable', crossHubTransfers, 'm', provenance),
      metric('ending-inventory', snapshot.summary.endingInventory, 'm', provenance),
      metric('completed-projects', snapshot.summary.completedProjects, 'projects', provenance),
      metric(
        'hub-inventory-imbalance',
        Math.max(...inventories) - Math.min(...inventories),
        'm',
        provenance
      ),
    ]);
  }

  function metric(id, value, unit, provenance) {
    return deepFreeze({ id, value, unit, provenance });
  }

  function simulatedProvenance(config, allocationRecords) {
    return pluginContracts.createProvenance({
      origin: 'simulated',
      temporalStatus: 'forecast',
      uncertainty: {
        kind: 'distribution',
        value: {
          ensembleSize: 1,
          intervalStatus: 'not_computed',
        },
      },
      evidenceRefs: [
        evidenceRef(
          `${PLUGIN_ID}:data:authored-scenario`,
          `${PLUGIN_ID}:data:authored-scenario`,
          network.createScenarioIdentity(config).configurationHash
        ),
        evidenceRef(
          `${PLUGIN_ID}:model:event-generator`,
          `${PLUGIN_ID}:data:authored-scenario`,
          v4Contribution.MODEL_IDENTITIES.eventModelHash,
          'cable-trader:event-generator:v1'
        ),
        ...allocationRecords.map((record) => evidenceRef(
          record.id,
          record.datasetId,
          record.contentHash,
          record.id
        )),
      ],
    });
  }

  function evidenceRef(id, datasetId, contentHash, modelReceiptId) {
    return {
      id,
      datasetId,
      contentHash,
      ...(modelReceiptId ? { modelReceiptId } : {}),
    };
  }

  function createEvidenceCatalog(config) {
    const scenario = scenarioRecord(config);
    return Object.freeze([
      scenario,
      builder.modelRecord({
        id: `${PLUGIN_ID}:model:event-generator`,
        datasetId: scenario.id,
        contentHash: v4Contribution.MODEL_IDENTITIES.eventModelHash,
        parentIds: [scenario.id],
        metadata: { algorithm: 'seeded weighted categorical demand and return events' },
        lineage: modelLineage('seeded-event-generator-v1', config),
      }),
      allocationModel('cheapest', config),
      allocationModel('fastest', config),
      allocationModel('fairness-first', config),
    ]);
  }

  function scenarioRecord(config) {
    const identity = network.createScenarioIdentity(config);
    return builder.datasetRecord(
      `${PLUGIN_ID}:data:authored-scenario`,
      {
        sha256: identity.configurationHash,
        contentVersion: config.schema,
      },
      {
        seed: identity.seed,
        scenarioId: identity.id,
        selectedCableFamilyIds: identity.selectedCableFamilyIds,
        kind: 'authored synthetic demand scenario',
        contentVersion: config.schema,
        claimBoundary: 'Authored synthetic demand scenario, not observed exchange operations.',
      }
    );
  }

  function modelLineage(contentVersion, config) {
    return {
      axes: {
        origin: 'modeled',
        temporalStatus: 'forecast',
        uncertainty: {
          kind: 'distribution',
          value: {
            ensembleSize: 1,
            intervalStatus: 'not_computed',
          },
        },
      },
      contentVersion,
      scenarioEpoch: `scenario:${network.createScenarioIdentity(config).id}`,
      license: { required: false, identifier: null },
    };
  }

  function allocationModel(allocationPolicy, config) {
    return builder.modelRecord({
      id: `${PLUGIN_ID}:model:policy-scored-flow:${allocationPolicy}`,
      datasetId: `${PLUGIN_ID}:data:authored-scenario`,
      contentHash: v4Contribution.MODEL_IDENTITIES.flowModelHash,
      parentIds: [`${PLUGIN_ID}:data:authored-scenario`],
      metadata: {
        algorithm: 'exact policy-scored minimum-cost maximum-flow',
        allocationPolicy,
      },
      lineage: modelLineage(
        `exact-policy-scored-flow-v2:${allocationPolicy}`,
        config
      ),
    });
  }

  function branchEvidenceIds(allocationPolicy) {
    return Object.freeze([
      `${PLUGIN_ID}:data:authored-scenario`,
      `${PLUGIN_ID}:model:event-generator`,
      `${PLUGIN_ID}:model:policy-scored-flow:${allocationPolicy}`,
    ]);
  }

  function assertSharedExogenous(intervention, baseline) {
    if (canonical(intervention.exogenous) !== canonical(baseline.exogenous)
      || intervention.seed !== baseline.seed
      || intervention.scenarioId !== baseline.scenarioId
      || intervention.configurationHash !== baseline.configurationHash
      || canonical(intervention.selectedCableFamilyIds) !== canonical(baseline.selectedCableFamilyIds)
      || intervention.durationDays !== baseline.durationDays) {
      throw comparisonError(
        'cable_comparison_starting_identity_mismatch',
        'Cable comparison branches do not share the same scenario realization'
      );
    }
  }

  function validateInputs(config, transferRoutes, interventionSimulation) {
    if (!config?.id || !Array.isArray(transferRoutes) || !interventionSimulation) {
      throw comparisonError(
        'cable_comparison_inputs_invalid',
        'Cable comparison requires config, routes, and an intervention simulation'
      );
    }
    if (!interventionSimulation.exogenous
      || interventionSimulation.scenarioId === undefined
      || interventionSimulation.seed === undefined
      || interventionSimulation.configurationHash === undefined
      || !Array.isArray(interventionSimulation.selectedCableFamilyIds)) {
      throw comparisonError(
        'cable_comparison_intervention_invalid',
        'Cable comparison requires a simulation with governed exogenous inputs'
      );
    }
  }

  async function sha256Json(value) {
    const bytes = new TextEncoder().encode(canonical(value));
    if (nodeCrypto) return nodeCrypto.createHash('sha256').update(bytes).digest('hex');
    if (!globalThis.crypto?.subtle) {
      throw comparisonError(
        'cable_comparison_hash_provider_unavailable',
        'Cable comparison requires SHA-256 support'
      );
    }
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  function yieldBrowserTask() {
    if (typeof window === 'undefined') return Promise.resolve();
    return new Promise((resolve) => setTimeout(resolve, 0));
  }

  function canonical(value) {
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
    if (value && typeof value === 'object') {
      return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
  }

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
  }

  function comparisonError(code, message) {
    const error = new Error(`${code}: ${message}`);
    error.name = 'SimulatteCableTraderComparisonError';
    error.code = code;
    return error;
  }

  return Object.freeze({ runComparison });
});
