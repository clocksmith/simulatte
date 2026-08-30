(function attachSubseaComparison(root, factory) {
  const model = typeof module === 'object' && module.exports
    ? require('./network-model.js')
    : root.SimulatteSubseaNetworkModel;
  const comparisonApi = typeof module === 'object' && module.exports
    ? require('../../../simulatte/platform/core/simulation/comparison-execution.js')
    : root.SimulatteComparisonExecution;
  const contracts = typeof module === 'object' && module.exports
    ? require('../../../simulatte/platform/contracts/plugin-v4-contracts.js')
    : root.SimulattePluginV4Contracts;
  const builder = typeof module === 'object' && module.exports
    ? require('../../core/simulation/plugin-v4-builder.js')
    : root.SimulattePluginV4Builder;
  const v4Api = typeof module === 'object' && module.exports
    ? require('./v4-contribution.js')
    : root.SimulatteSubseaV4;
  const nodeCrypto = typeof module === 'object' && module.exports ? require('node:crypto') : null;
  const api = factory(model, comparisonApi, contracts, builder, v4Api, nodeCrypto);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteSubseaComparison = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createSubseaComparison(
  model,
  comparisonApi,
  contracts,
  builder,
  v4Api,
  nodeCrypto
) {
  const PLUGIN_ID = 'subsea-network-global';
  const BRANCH_ROLES = Object.freeze(['baseline', 'intervention']);

  async function runComparison({ datasets, dataReceipts, config, scenario, selectedResult = null }) {
    requireDependencies();
    const branchPolicies = Object.freeze({
      baseline: scenario.comparisonPolicyId,
      intervention: scenario.allocationPolicyId,
    });
    if (!branchPolicies.baseline || !branchPolicies.intervention) {
      throw comparisonError('subsea_comparison_policy_missing', 'Selected and comparison policies are required');
    }
    if (branchPolicies.baseline === branchPolicies.intervention) {
      throw comparisonError(
        'subsea_comparison_policy_duplicate',
        `Selected policy ${branchPolicies.intervention} requires a distinct comparison policy`
      );
    }
    const simulations = Object.fromEntries(BRANCH_ROLES.map((role) => [role,
      canReuseSelectedResult(selectedResult, scenario, branchPolicies[role])
        ? selectedResult
        : model.runScenario({
            datasets,
            config,
            scenario,
            policyOverrides: { allocationPolicyId: branchPolicies[role] },
          }),
    ]));
    assertSharedScenario(simulations);
    const hiddenTruth = {
      seed: scenario.seed,
      failedResourceIds: simulations.intervention.failedResourceIds,
      repairOutcomes: simulations.intervention.repairReceipt.events
        .filter((row) => row.kind === 'repair.attempt-failed' || row.kind === 'repair.capacity-restored')
        .map((row) => ({ kind: row.kind, targetId: row.targetId, simulationTimeMs: row.simulationTimeMs })),
    };
    const hiddenTruthHash = await sha256Json(hiddenTruth);
    const inputHash = await sha256Json({
      appliedParameters: scenario,
      branchPolicies,
      datasetHashes: dataReceipts.map((row) => [row.datasetId, row.sha256]),
      config,
    });
    const startingIdentity = deepFreeze({
      schema: 'simulatte.comparisonStartingIdentity.v4',
      scenarioId: scenario.scenarioId,
      seed: scenario.seed,
      inputHash,
      datasetHashes: dataReceipts.map((row) => ({ id: row.datasetId, sha256: row.sha256 })),
      modelHashes: [
        { id: `${PLUGIN_ID}:model:allocation`, sha256: v4Api.MODEL_HASHES.allocation },
        { id: `${PLUGIN_ID}:model:repair`, sha256: v4Api.MODEL_HASHES.repair },
      ],
      hiddenTruth: {
        id: `${PLUGIN_ID}:hidden:${hiddenTruthHash.slice(0, 20)}`,
        sha256: hiddenTruthHash,
      },
    });
    const evidenceCatalog = createEvidenceCatalog(dataReceipts, simulations.intervention);
    const requiredEvidenceIds = evidenceCatalog.map((row) => row.id);
    const comparisonId = `${PLUGIN_ID}:comparison:${inputHash.slice(0, 24)}`;
    const branchConfigurations = Object.fromEntries(BRANCH_ROLES.map((role) => [role, {
      allocationPolicyId: branchPolicies[role],
    }]));
    const configurationHashes = Object.fromEntries(await Promise.all(BRANCH_ROLES.map(async (role) => [
      role,
      await sha256Json(branchConfigurations[role]),
    ])));
    const execution = comparisonApi.createComparisonExecution({
      id: comparisonId,
      synchronizationPolicy: 'lockstep',
      startingIdentity,
      observableInput: {
        scenarioId: scenario.scenarioId,
        seed: scenario.seed,
        datasetIds: dataReceipts.map((row) => row.datasetId),
        metricSchema: Object.keys(simulations.intervention.metrics),
      },
      hiddenTruth: {
        id: startingIdentity.hiddenTruth.id,
        sha256: hiddenTruthHash,
        value: hiddenTruth,
      },
      branches: Object.fromEntries(BRANCH_ROLES.map((role) => [role, {
        id: `${comparisonId}:${role}`,
        configuration: branchConfigurations[role],
        configurationHash: configurationHashes[role],
        createPolicy: (context) => createPolicy(context),
        createSimulation: (context) => createBranchDriver({
          context,
          role,
          comparisonId,
          simulation: simulations[role],
          startingIdentity,
          dataReceipts,
        }),
      }])),
      evidenceCatalog,
      requiredEvidenceIds,
    });
    const stepCount = Math.max(...Object.values(simulations).map((row) => row.snapshots.length - 1));
    execution.step(stepCount);
    const settlement = execution.settle();
    return deepFreeze({
      schema: 'simulatte.plugin.subseaComparisonRun.v1',
      comparisonId,
      policies: branchPolicies,
      selectedPolicyId: branchPolicies.intervention,
      selectedBranchId: 'intervention',
      comparisonPolicyId: branchPolicies.baseline,
      comparisonBranchId: 'baseline',
      branchIdentities: Object.fromEntries(BRANCH_ROLES.map((role) => [
        role,
        simulations[role].scenarioIdentity,
      ])),
      branchMetrics: Object.fromEntries(BRANCH_ROLES.map((role) => [role, simulations[role].metrics])),
      settlement,
      comparisonExecutionReceipt: execution.receipt(),
    });
  }

  function createPolicy(context) {
    return Object.freeze({
      decide() {
        return Object.freeze({ allocationPolicyId: context.configuration.allocationPolicyId });
      },
    });
  }

  function createBranchDriver({
    context,
    role,
    comparisonId,
    simulation,
    startingIdentity,
    dataReceipts,
  }) {
    if (context.configuration.allocationPolicyId !== simulation.allocationPolicyId) {
      throw comparisonError('subsea_comparison_policy_mismatch', `${role} policy does not match its simulation`);
    }
    let cursor = 0;
    const evidenceIds = [
      ...dataReceipts.map((row) => row.datasetId),
      `${PLUGIN_ID}:model:allocation`,
      `${PLUGIN_ID}:model:repair`,
    ];
    const provenance = comparisonProvenance(dataReceipts);

    function observation() {
      const snapshot = simulation.snapshots[cursor];
      return deepFreeze({
        cursor,
        simulationTimeMs: snapshot.simulationTimeMs,
        status: snapshot.status,
        deliveredGbps: snapshot.metrics.deliveredGbps,
        droppedGbps: snapshot.metrics.droppedGbps,
        availableEdgeCount: snapshot.edges.filter((row) => row.availableGbps > 0).length,
      });
    }

    return Object.freeze({
      startingIdentity() {
        return startingIdentity;
      },
      observe: observation,
      advance(request) {
        if (request.action.allocationPolicyId !== simulation.allocationPolicyId) {
          throw comparisonError('subsea_comparison_action_mismatch', `${role} action changed policy`);
        }
        if (cursor >= simulation.snapshots.length - 1) {
          throw comparisonError('subsea_comparison_branch_complete', `${role} is already terminal`);
        }
        cursor += 1;
        const snapshot = simulation.snapshots[cursor];
        const sourceEvent = simulation.events.filter((row) => row.simulationTimeMs <= snapshot.simulationTimeMs).at(-1);
        const event = {
          schema: 'simulatte.pluginEvent.v4',
          id: `${PLUGIN_ID}:${role}:comparison-step:${cursor}`,
          pluginId: PLUGIN_ID,
          sequence: cursor - 1,
          simulationTimeMs: snapshot.simulationTimeMs,
          kind: sourceEvent?.kind || 'allocation.recomputed',
          causationIds: cursor > 1 ? [`${PLUGIN_ID}:${role}:comparison-step:${cursor - 1}`] : [],
          correlationId: comparisonId,
          payload: {
            scenarioId: simulation.scenarioId,
            allocationPolicyId: simulation.allocationPolicyId,
            snapshotId: snapshot.id,
          },
          provenance,
        };
        return deepFreeze({
          schema: 'simulatte.comparisonBranchTransition.v4',
          simulationTimeMs: snapshot.simulationTimeMs,
          status: cursor === simulation.snapshots.length - 1 ? 'terminal' : 'running',
          events: [event],
          metrics: comparisonMetrics(snapshot.metrics, provenance),
          evidenceIds,
          observation: observation(),
        });
      },
      settle() {
        if (cursor !== simulation.snapshots.length - 1) {
          throw comparisonError('subsea_comparison_branch_not_terminal', `${role} cannot settle at cursor ${cursor}`);
        }
        const final = simulation.snapshots[cursor];
        if (!final.allocationReceipt.feasibility.isValid || !simulation.repairReceipt.inventoryConserved) {
          throw comparisonError('subsea_comparison_evidence_open', `${role} conservation evidence is not closed`);
        }
        return deepFreeze({
          schema: 'simulatte.comparisonBranchSettlement.v4',
          status: 'settled',
          metrics: comparisonMetrics(final.metrics, provenance),
          evidenceIds,
        });
      },
    });
  }

  function comparisonMetrics(values, provenance) {
    return Object.freeze(Object.entries(values).map(([id, value]) => ({
      id,
      value,
      unit: metricUnit(id),
      provenance,
    })));
  }

  function metricUnit(id) {
    if (id.endsWith('Gbps')) return 'Gbps';
    if (id.endsWith('Ms')) return 'millisecond';
    if (id.endsWith('Hours')) return 'hour';
    return 'ratio';
  }

  function comparisonProvenance(dataReceipts) {
    return contracts.createProvenance({
      origin: 'simulated',
      temporalStatus: 'forecast',
      uncertainty: {
        kind: 'distribution',
        value: { source: 'shared deterministic scenario seed', calibrationStatus: 'scenario_variance' },
      },
      evidenceRefs: [
        {
          id: `${PLUGIN_ID}:model:allocation`,
          datasetId: 'subsea-model-governance-v1',
          contentHash: v4Api.MODEL_HASHES.allocation,
          modelReceiptId: `${PLUGIN_ID}:model:allocation`,
        },
        {
          id: `${PLUGIN_ID}:model:repair`,
          datasetId: 'subsea-model-governance-v1',
          contentHash: v4Api.MODEL_HASHES.repair,
          modelReceiptId: `${PLUGIN_ID}:model:repair`,
        },
      ],
    });
  }

  function canReuseSelectedResult(result, scenario, allocationPolicyId) {
    const identity = result?.configurationIdentity;
    if (!identity || result.allocationPolicyId !== allocationPolicyId) return false;
    const expected = {
      scenarioId: scenario.scenarioId,
      seed: scenario.seed,
      allocationPolicyId,
      repairPolicyId: scenario.repairPolicyId,
      failedResourceIds: [...scenario.failedResourceIds].sort(),
      excludedLandingIds: [...(scenario.excludedLandingIds || [])].sort(),
      essentialServiceWeight: scenario.essentialServiceWeight,
      repairResourceCount: scenario.repairResourceCount,
      ensembleSize: scenario.ensembleSize,
    };
    return canonical(Object.fromEntries(Object.keys(expected).map((key) => [key, identity[key]])))
      === canonical(expected);
  }

  function createEvidenceCatalog(dataReceipts, result) {
    const datasets = dataReceipts.map((receipt) => builder.datasetRecord(
      receipt.datasetId,
      receipt,
      receipt.datasetId === 'subsea-fcc-cable-license-register-2025-v1'
        ? {
          license: 'FCC-public-record',
          contentVersion: 'fcc-year-end-2025-and-capacity-2024',
          truth: {
            origin: 'observed',
            temporalStatus: 'historical',
            uncertainty: { kind: 'missing', value: { reason: 'Regulatory identity has no quantified uncertainty.' } },
          },
        }
        : { scenarioKind: 'subsea-network', contentVersion: '1.0.0' }
    ));
    return Object.freeze([
      ...datasets,
      builder.modelRecord({
        id: `${PLUGIN_ID}:model:allocation`,
        datasetId: 'subsea-model-governance-v1',
        contentHash: v4Api.MODEL_HASHES.allocation,
        parentIds: datasets.map((row) => row.id),
        metadata: { algorithm: result.allocationReceipts.at(-1).algorithm },
        lineage: modelLineage('path-flow-simplex-v1', result),
      }),
      builder.modelRecord({
        id: `${PLUGIN_ID}:model:repair`,
        datasetId: 'subsea-model-governance-v1',
        contentHash: v4Api.MODEL_HASHES.repair,
        parentIds: datasets.map((row) => row.id),
        metadata: { algorithm: result.repairReceipt.algorithm },
        lineage: modelLineage('repair-discrete-event-v1', result),
      }),
    ]);
  }

  function modelLineage(contentVersion, result) {
    return {
      axes: {
        origin: 'modeled',
        temporalStatus: 'forecast',
        uncertainty: {
          kind: 'missing',
          value: { reason: 'Algorithm is reproducible but not calibrated to current operations.' },
        },
      },
      contentVersion,
      scenarioEpoch: `scenario:${result.scenarioIdentity}`,
      license: { required: false, identifier: null },
    };
  }

  function assertSharedScenario(simulations) {
    const baseline = simulations.baseline.configurationIdentity;
    const intervention = simulations.intervention.configurationIdentity;
    const sharedKeys = Object.keys(baseline).filter((key) => key !== 'allocationPolicyId');
    const left = Object.fromEntries(sharedKeys.map((key) => [key, baseline[key]]));
    const right = Object.fromEntries(sharedKeys.map((key) => [key, intervention[key]]));
    if (canonical(left) !== canonical(right)) {
      throw comparisonError('subsea_comparison_starting_identity_mismatch', 'Branches do not share identical exogenous inputs');
    }
  }

  async function sha256Json(value) {
    const bytes = new TextEncoder().encode(canonical(value));
    if (nodeCrypto) return nodeCrypto.createHash('sha256').update(bytes).digest('hex');
    if (!globalThis.crypto?.subtle) throw comparisonError('subsea_comparison_hash_unavailable', 'SHA-256 provider is required');
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  function canonical(value) {
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
    if (value && typeof value === 'object') {
      return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
  }

  function requireDependencies() {
    if (!model?.runScenario || !comparisonApi?.createComparisonExecution || !contracts?.createProvenance
      || !builder?.datasetRecord || !v4Api?.MODEL_HASHES) {
      throw comparisonError('subsea_comparison_dependency_missing', 'Shared comparison dependencies are missing');
    }
  }

  function comparisonError(code, message) {
    const error = new Error(`${code}: ${message}`);
    error.name = 'SimulatteSubseaComparisonError';
    error.code = code;
    return error;
  }

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
  }

  return Object.freeze({ runComparison });
});
