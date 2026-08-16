(function attachGridComparison(root, factory) {
  const model = typeof module === 'object' && module.exports
    ? require('./dispatch-model.js') : root.SimulatteGridDispatchModel;
  const comparisonApi = typeof module === 'object' && module.exports
    ? require('../../../simulatte/platform/core/simulation/comparison-execution.js') : root.SimulatteComparisonExecution;
  const contracts = typeof module === 'object' && module.exports
    ? require('../../../simulatte/platform/contracts/plugin-v4-contracts.js') : root.SimulattePluginV4Contracts;
  const builder = typeof module === 'object' && module.exports
    ? require('../../core/simulation/plugin-v4-builder.js') : root.SimulattePluginV4Builder;
  const v4Api = typeof module === 'object' && module.exports
    ? require('./v4-contribution.js') : root.SimulatteGridV4;
  const nodeCrypto = typeof module === 'object' && module.exports ? require('node:crypto') : null;
  const api = factory(model, comparisonApi, contracts, builder, v4Api, nodeCrypto);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteGridComparison = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createGridComparison(
  model,
  comparisonApi,
  contracts,
  builder,
  v4Api,
  nodeCrypto
) {
  const PLUGIN_ID = 'grid-resilience-us';
  const ROLES = ['baseline', 'intervention'];

  async function runComparison({ datasets, config, scenario }) {
    const configurations = {
      baseline: {
        dispatchPolicyId: 'economic-order',
        reservePolicyId: 'fixed-reserve',
        storagePolicyId: 'immediate-support',
        restorationPolicyId: 'nearest-first',
      },
      intervention: {
        dispatchPolicyId: 'resilience-weighted',
        reservePolicyId: 'adaptive-reserve',
        storagePolicyId: 'reserve-preserving',
        restorationPolicyId: 'dependency-aware',
      },
    };
    const runs = Object.fromEntries(ROLES.map((role) => [role, model.runScenario({
      datasets,
      config,
      scenario,
      policyOverrides: configurations[role],
    })]));
    assertSharedInputs(runs);
    const hiddenValue = {
      disturbance: scenario.disturbanceScenarioId,
      seed: scenario.seed,
      restorationTargets: runs.baseline.restoration.tasks.map((row) => row.targetId),
    };
    const hiddenHash = await sha256(hiddenValue);
    const inputHash = await sha256({
      scenario: sharedScenario(scenario),
      datasets: datasets.dataReceipts.map((row) => [row.datasetId, row.sha256]),
    });
    const startingIdentity = {
      schema: 'simulatte.comparisonStartingIdentity.v4',
      scenarioId: scenario.disturbanceScenarioId,
      seed: scenario.seed,
      inputHash,
      datasetHashes: datasets.dataReceipts.map((row) => ({ id: row.datasetId, sha256: row.sha256 })),
      modelHashes: [
        { id: `${PLUGIN_ID}:model:dispatch`, sha256: v4Api.MODEL_HASHES.dispatch },
        { id: `${PLUGIN_ID}:model:restoration`, sha256: v4Api.MODEL_HASHES.restoration },
      ],
      hiddenTruth: { id: `${PLUGIN_ID}:hidden:${hiddenHash.slice(0, 20)}`, sha256: hiddenHash },
    };
    const evidenceCatalog = createEvidenceCatalog(datasets.dataReceipts, runs.intervention);
    const requiredEvidenceIds = evidenceCatalog.map((row) => row.id);
    const comparisonId = `${PLUGIN_ID}:comparison:${inputHash.slice(0, 24)}`;
    const configurationHashes = Object.fromEntries(await Promise.all(ROLES.map(async (role) => [
      role, await sha256(configurations[role]),
    ])));
    const execution = comparisonApi.createComparisonExecution({
      id: comparisonId,
      synchronizationPolicy: 'lockstep',
      startingIdentity,
      observableInput: {
        scenarioId: scenario.disturbanceScenarioId,
        seed: scenario.seed,
        hours: runs.baseline.snapshots.length - 1,
        metricSchema: Object.keys(runs.baseline.metrics).sort(),
      },
      hiddenTruth: { id: startingIdentity.hiddenTruth.id, sha256: hiddenHash, value: hiddenValue },
      branches: Object.fromEntries(ROLES.map((role) => [role, {
        id: `${comparisonId}:${role}`,
        configuration: configurations[role],
        configurationHash: configurationHashes[role],
        createPolicy: (context) => Object.freeze({ decide: () => context.configuration }),
        createSimulation: () => branchDriver({
          role,
          run: runs[role],
          startingIdentity,
          evidenceCatalog,
          comparisonId,
        }),
      }])),
      evidenceCatalog,
      requiredEvidenceIds,
    });
    execution.step(runs.baseline.snapshots.length - 1);
    const settlement = execution.settle();
    return deepFreeze({
      schema: 'simulatte.gridComparisonRun.v1',
      comparisonId,
      configurations,
      branchMetrics: Object.fromEntries(ROLES.map((role) => [role, runs[role].metrics])),
      settlement,
      comparisonExecutionReceipt: execution.receipt(),
    });
  }

  function branchDriver({ role, run, startingIdentity, evidenceCatalog, comparisonId }) {
    let cursor = 0;
    const evidenceIds = evidenceCatalog.map((row) => row.id);
    const modelEvidence = evidenceCatalog.filter((row) => row.kind === 'model');
    const provenance = contracts.createProvenance({
      origin: 'simulated',
      temporalStatus: 'forecast',
      uncertainty: { kind: 'distribution', value: { interpretation: 'Shared declared scenario inputs.' } },
      evidenceRefs: modelEvidence.map((row) => builder.evidence(row)),
    });
    const observation = () => {
      const snapshot = run.snapshots[cursor];
      return {
        cursor,
        simulationTimeMs: snapshot.simulationTimeMs,
        status: snapshot.status,
        activeFailureCount: snapshot.activeFailureIds.length,
        modeledUnservedMw: snapshot.regions.reduce((sum, row) => sum + row.unservedMw, 0),
      };
    };
    return Object.freeze({
      startingIdentity: () => startingIdentity,
      observe: observation,
      advance(action) {
        const expected = run.configurationIdentity;
        Object.entries(action.action).forEach(([key, value]) => {
          if (expected[key] !== value) throw gridError('grid_comparison_policy_mismatch', `${role}:${key}`);
        });
        cursor += 1;
        const snapshot = run.snapshots[cursor];
        const source = run.events[cursor];
        return {
          schema: 'simulatte.comparisonBranchTransition.v4',
          simulationTimeMs: snapshot.simulationTimeMs,
          status: cursor === run.snapshots.length - 1 ? 'terminal' : 'running',
          events: [builder.event({
            id: `${PLUGIN_ID}:${role}:step:${cursor}`,
            pluginId: PLUGIN_ID,
            sequence: cursor - 1,
            simulationTimeMs: snapshot.simulationTimeMs,
            kind: source.kind,
            causationIds: cursor > 1 ? [`${PLUGIN_ID}:${role}:step:${cursor - 1}`] : [],
            correlationId: comparisonId,
            payload: { stateId: snapshot.id, activeFailureIds: snapshot.activeFailureIds },
            provenance,
          })],
          metrics: snapshotMetrics(snapshot, provenance),
          evidenceIds,
          observation: observation(),
        };
      },
      settle() {
        if (cursor !== run.snapshots.length - 1 || !run.settlement.valid) {
          throw gridError('grid_comparison_branch_unsettled', role);
        }
        return {
          schema: 'simulatte.comparisonBranchSettlement.v4',
          status: 'settled',
          metrics: resultMetrics(run.metrics, provenance),
          evidenceIds,
        };
      },
    });
  }

  function snapshotMetrics(snapshot, provenance) {
    return [
      metric('modeled-unserved-load', snapshot.regions.reduce((sum, row) => sum + row.unservedMw, 0), 'MW', provenance),
      metric('modeled-emissions', snapshot.regions.reduce((sum, row) => sum + row.emissionsTons, 0), 'ton', provenance),
      metric('modeled-storage-discharge', snapshot.regions.reduce((sum, row) => sum + row.storageDischargeMw, 0), 'MW', provenance),
    ];
  }

  function resultMetrics(values, provenance) {
    return Object.entries(values).map(([id, value]) => metric(id, value, unit(id), provenance));
  }

  function metric(id, value, unitValue, provenance) {
    return { id, value, unit: unitValue, provenance };
  }

  function unit(id) {
    if (/Energy|Discharge/.test(id)) return 'MWh';
    if (/Emissions/.test(id)) return 'ton';
    if (/Count/.test(id)) return 'count';
    return 'ratio';
  }

  function createEvidenceCatalog(receipts, result) {
    const datasets = receipts.map((receipt) => builder.datasetRecord(
      receipt.datasetId,
      receipt,
      /grid-(?:eia|noaa)-/.test(receipt.datasetId)
        ? {
          license: 'US-government-public-data',
          contentVersion: '2024-07-15',
          truth: {
            origin: 'observed',
            temporalStatus: 'historical',
            uncertainty: { kind: 'missing', value: { reason: 'Source flags retained.' } },
          },
        }
        : { scenarioKind: 'grid-resilience', contentVersion: '1.0.0' }
    ));
    const lineage = (version) => ({
      axes: {
        origin: 'derived',
        temporalStatus: 'forecast',
        uncertainty: { kind: 'missing', value: { reason: 'Mixed observed and scenario parents are derived and not operationally calibrated.' } },
      },
      contentVersion: version,
      scenarioEpoch: `scenario:${result.scenarioIdentity}`,
      license: { required: false, identifier: null },
    });
    return [
      ...datasets,
      builder.modelRecord({
        id: `${PLUGIN_ID}:model:dispatch`,
        datasetId: 'grid-model-governance-v1',
        contentHash: v4Api.MODEL_HASHES.dispatch,
        parentIds: datasets.map((row) => row.id),
        lineage: lineage('dispatch-v1'),
      }),
      builder.modelRecord({
        id: `${PLUGIN_ID}:model:restoration`,
        datasetId: 'grid-model-governance-v1',
        contentHash: v4Api.MODEL_HASHES.restoration,
        parentIds: datasets.map((row) => row.id),
        lineage: lineage('restoration-v1'),
      }),
    ];
  }

  function assertSharedInputs(runs) {
    const ignored = new Set(['dispatchPolicyId', 'reservePolicyId', 'storagePolicyId', 'restorationPolicyId']);
    const left = Object.fromEntries(Object.entries(runs.baseline.configurationIdentity).filter(([key]) => !ignored.has(key)));
    const right = Object.fromEntries(Object.entries(runs.intervention.configurationIdentity).filter(([key]) => !ignored.has(key)));
    if (canonical(left) !== canonical(right)) throw gridError('grid_comparison_starting_identity_mismatch', 'Exogenous inputs differ');
  }

  function sharedScenario(value) {
    const copy = { ...value };
    delete copy.dispatchPolicyId;
    delete copy.reservePolicyId;
    delete copy.storagePolicyId;
    delete copy.restorationPolicyId;
    return copy;
  }

  async function sha256(value) {
    const text = canonical(value);
    if (nodeCrypto) return nodeCrypto.createHash('sha256').update(text).digest('hex');
    const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(digest)].map((row) => row.toString(16).padStart(2, '0')).join('');
  }

  function canonical(value) {
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
    if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
    return JSON.stringify(value);
  }

  function gridError(code, message) {
    const error = new Error(`${code}: ${message}`);
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
