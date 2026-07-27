(function attachAsteroidComparison(root, factory) {
  const model = typeof module === 'object' && module.exports
    ? require('./asteroid-model.js') : root.SimulatteAsteroidModel;
  const comparisonApi = typeof module === 'object' && module.exports
    ? require('../../../simulatte/platform/core/simulation/comparison-execution.js') : root.SimulatteComparisonExecution;
  const contracts = typeof module === 'object' && module.exports
    ? require('../../../simulatte/platform/contracts/plugin-v4-contracts.js') : root.SimulattePluginV4Contracts;
  const builder = typeof module === 'object' && module.exports
    ? require('../../core/simulation/plugin-v4-builder.js') : root.SimulattePluginV4Builder;
  const v4Api = typeof module === 'object' && module.exports
    ? require('./v4-contribution.js') : root.SimulatteAsteroidV4;
  const nodeCrypto = typeof module === 'object' && module.exports ? require('node:crypto') : null;
  const api = factory(model, comparisonApi, contracts, builder, v4Api, nodeCrypto);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteAsteroidComparison = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createAsteroidComparison(
  model,
  comparisonApi,
  contracts,
  builder,
  v4Api,
  nodeCrypto
) {
  const PLUGIN_ID = 'asteroid-defense';
  const ROLES = ['baseline', 'intervention'];

  async function runComparison({ datasets, config, scenario }) {
    const campaign = datasets.campaigns.campaigns.find((row) => row.id === scenario.observationCampaignId);
    const configurations = {
      baseline: { interventionArchetypeId: 'none' },
      intervention: { interventionArchetypeId: scenario.interventionArchetypeId },
    };
    const runs = Object.fromEntries(ROLES.map((role) => [role, model.runScenario({
      datasets,
      config,
      scenario,
      policyOverrides: configurations[role],
    })]));
    assertSharedInputs(runs);
    const hiddenValue = {
      hiddenTruthId: campaign.hiddenTruth.id,
      initialState: campaign.hiddenTruth.initialState,
      truthHash: campaign.hiddenTruth.truthHash,
      executionStreamSeed: scenario.seed,
    };
    const hiddenHash = await sha256(hiddenValue);
    const inputHash = await sha256({
      scenario: { ...scenario, interventionArchetypeId: null },
      datasets: datasets.dataReceipts.map((row) => [row.datasetId, row.sha256]),
    });
    const startingIdentity = {
      schema: 'simulatte.comparisonStartingIdentity.v4',
      scenarioId: scenario.observationCampaignId,
      seed: scenario.seed,
      inputHash,
      datasetHashes: datasets.dataReceipts.map((row) => ({ id: row.datasetId, sha256: row.sha256 })),
      modelHashes: Object.entries(v4Api.MODEL_HASHES).map(([id, hash]) => ({ id: `${PLUGIN_ID}:model:${id}`, sha256: hash })),
      hiddenTruth: { id: campaign.hiddenTruth.id, sha256: hiddenHash },
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
        campaignId: scenario.observationCampaignId,
        seed: scenario.seed,
        observationBudget: scenario.observationBudget,
        followUpPolicyId: scenario.followUpPolicyId,
        decisionThreshold: scenario.decisionThreshold,
        metricSchema: Object.keys(runs.baseline.metrics).filter((id) => id !== 'fitStateErrorAu').sort(),
      },
      hiddenTruth: { id: campaign.hiddenTruth.id, sha256: hiddenHash, value: hiddenValue },
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
      schema: 'simulatte.asteroidComparisonRun.v1',
      comparisonId,
      branchMetrics: Object.fromEntries(ROLES.map((role) => [role, publicMetrics(runs[role].metrics)])),
      settlement,
      comparisonExecutionReceipt: execution.receipt(),
    });
  }

  function branchDriver({ role, run, startingIdentity, evidenceCatalog, comparisonId }) {
    let cursor = 0;
    const evidenceIds = evidenceCatalog.map((row) => row.id);
    const provenance = contracts.createProvenance({
      origin: 'simulated',
      temporalStatus: 'forecast',
      uncertainty: { kind: 'distribution', value: { interpretation: 'Common synthetic observations and orbit-clone stream.' } },
      evidenceRefs: evidenceCatalog.map((row) => builder.evidence(row)),
    });
    const observation = () => {
      const snapshot = run.snapshots[cursor];
      return {
        cursor,
        simulationTimeMs: snapshot.simulationTimeMs,
        status: snapshot.status,
        acquiredObservationCount: snapshot.observationCount,
        fitAvailable: Boolean(snapshot.fitReceipt),
        covarianceAvailable: Boolean(snapshot.ensembleReceipt),
        modeledScreeningFraction: snapshot.baselineEncounter?.modeledScreeningFraction ?? null,
      };
    };
    return Object.freeze({
      startingIdentity: () => startingIdentity,
      observe: observation,
      advance(request) {
        if (request.action.interventionArchetypeId !== run.configurationIdentity.interventionArchetypeId) {
          throw comparisonError('asteroid_comparison_policy_mismatch', role);
        }
        cursor += 1;
        const snapshot = run.snapshots[cursor];
        const source = run.events[cursor - 1];
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
            payload: { stateId: snapshot.id, phase: snapshot.status },
            provenance,
          })],
          metrics: snapshotMetrics(run, snapshot, provenance),
          evidenceIds,
          observation: observation(),
        };
      },
      settle() {
        if (cursor !== run.snapshots.length - 1 || run.settlement.status !== 'settled') {
          throw comparisonError('asteroid_comparison_branch_unsettled', role);
        }
        return {
          schema: 'simulatte.comparisonBranchSettlement.v4',
          status: 'settled',
          metrics: metricRows(publicMetrics(run.metrics), provenance),
          evidenceIds,
        };
      },
    });
  }

  function snapshotMetrics(run, snapshot, provenance) {
    return metricRows({
      observationCount: snapshot.observationCount,
      fitResidualRmsArcsec: run.metrics.fitResidualRmsArcsec,
      modeledScreeningFraction: snapshot.interventionEncounter?.modeledScreeningFraction
        ?? snapshot.baselineEncounter?.modeledScreeningFraction ?? 0,
    }, provenance);
  }

  function publicMetrics(values) {
    return Object.fromEntries(Object.entries(values).filter(([id, value]) => (
      id !== 'fitStateErrorAu' && Number.isFinite(value)
    )));
  }

  function metricRows(values, provenance) {
    return Object.entries(values).map(([id, value]) => ({
      id,
      value,
      unit: /Distance/.test(id) ? 'km' : /Residual/.test(id) ? 'arcsec' : /Count/.test(id) ? 'count' : 'ratio',
      provenance,
    }));
  }

  function createEvidenceCatalog(receipts, result) {
    const computational = receipts.filter((row) => !/historical-benchmark|jpl-reference/.test(row.datasetId));
    const datasets = computational.map((receipt) => builder.datasetRecord(
      receipt.datasetId,
      receipt,
      { scenarioKind: 'asteroid-defense', contentVersion: '1.0.0' }
    ));
    const lineage = (id) => ({
      axes: {
        origin: 'derived',
        temporalStatus: 'forecast',
        uncertainty: { kind: 'distribution', value: { interpretation: 'Synthetic observations with declared model assumptions.' } },
      },
      contentVersion: `${id}-v1`,
      scenarioEpoch: `scenario:${result.scenarioIdentity}`,
      license: { required: false, identifier: null },
    });
    return [
      ...datasets,
      ...Object.entries(v4Api.MODEL_HASHES).map(([id, contentHash]) => builder.modelRecord({
        id: `${PLUGIN_ID}:model:${id}`,
        datasetId: 'asteroid-model-governance-v1',
        contentHash,
        parentIds: datasets.map((row) => row.id),
        lineage: lineage(id),
      })),
    ];
  }

  function assertSharedInputs(runs) {
    const left = { ...runs.baseline.configurationIdentity };
    const right = { ...runs.intervention.configurationIdentity };
    delete left.interventionArchetypeId;
    delete right.interventionArchetypeId;
    if (canonical(left) !== canonical(right)) throw comparisonError('asteroid_comparison_starting_identity_mismatch', 'Exogenous inputs differ');
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
  function comparisonError(code, message) {
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
