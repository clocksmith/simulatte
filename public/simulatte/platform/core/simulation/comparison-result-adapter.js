(function attachComparisonResultAdapter(root, factory) {
  const executionApi = typeof module === 'object' && module.exports
    ? require('./comparison-execution.js')
    : root.SimulatteComparisonExecution;
  const contracts = typeof module === 'object' && module.exports
    ? require('../../contracts/plugin-v4-contracts.js')
    : root.SimulattePluginV4Contracts;
  const api = factory(root, executionApi, contracts);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteComparisonResultAdapter = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createComparisonResultAdapter(
  root,
  executionApi,
  contracts
) {
  const ROLES = Object.freeze(['baseline', 'intervention']);

  async function createSettledComparison({
    pluginId,
    scenario,
    comparisonId,
    branches,
    contribution,
  }) {
    text(pluginId, 'comparison_adapter_plugin_invalid', 'Plugin ID');
    text(comparisonId, 'comparison_adapter_id_invalid', 'Comparison ID');
    if (!scenario || typeof scenario.id !== 'string' || typeof scenario.seed !== 'string') {
      throw adapterError('comparison_adapter_scenario_invalid', 'Comparison scenario requires governed id and seed');
    }
    if (!branches || !ROLES.every((role) => branches[role] && typeof branches[role] === 'object')) {
      throw adapterError('comparison_adapter_branches_invalid', 'Comparison requires baseline and intervention results');
    }
    if (!contribution || contribution.pluginId !== pluginId || !Array.isArray(contribution.provenanceRecords)) {
      throw adapterError('comparison_adapter_contribution_invalid', 'Comparison requires its native v4 contribution');
    }
    const evidenceCatalog = contribution.provenanceRecords;
    const evidenceRecord = evidenceCatalog.find((row) => row.kind === 'model')
      || evidenceCatalog.find((row) => row.kind === 'dataset');
    if (!evidenceRecord) {
      throw adapterError('comparison_adapter_evidence_missing', 'Comparison contribution has no model or dataset evidence');
    }
    const metrics = comparableMetrics(branches, provenanceFor(evidenceRecord));
    const input = {
      scenarioId: scenario.id,
      seed: scenario.seed,
      comparisonId,
      metricIds: metrics.baseline.map((row) => row.id),
    };
    const hiddenValue = {
      classification: 'not-applicable',
      reason: 'Plugin returned observable terminal branch outcomes',
    };
    const [inputHash, hiddenHash, baselineHash, interventionHash] = await Promise.all([
      sha256(input),
      sha256(hiddenValue),
      sha256({ role: 'baseline', comparisonId, result: branches.baseline }),
      sha256({ role: 'intervention', comparisonId, result: branches.intervention }),
    ]);
    const startingIdentity = Object.freeze({
      schema: 'simulatte.comparisonStartingIdentity.v4',
      scenarioId: scenario.id,
      seed: scenario.seed,
      inputHash,
      datasetHashes: identityHashes(evidenceCatalog, 'dataset'),
      modelHashes: identityHashes(evidenceCatalog, 'model'),
      hiddenTruth: {
        id: `${comparisonId}:hidden-truth-not-applicable`,
        sha256: hiddenHash,
      },
    });
    const execution = executionApi.createComparisonExecution({
      id: comparisonId,
      synchronizationPolicy: 'lockstep',
      startingIdentity,
      observableInput: input,
      hiddenTruth: {
        ...startingIdentity.hiddenTruth,
        value: hiddenValue,
      },
      branches: {
        baseline: branchDefinition('baseline', baselineHash, metrics.baseline, startingIdentity, pluginId, comparisonId),
        intervention: branchDefinition('intervention', interventionHash, metrics.intervention, startingIdentity, pluginId, comparisonId),
      },
      evidenceCatalog,
      requiredEvidenceIds: [evidenceRecord.id],
    });
    execution.step(1);
    execution.settle();
    return execution.receipt();
  }

  function branchDefinition(role, configurationHash, metrics, startingIdentity, pluginId, comparisonId) {
    return {
      id: `${comparisonId}:${role}`,
      configuration: { role },
      configurationHash,
      createPolicy: () => Object.freeze({
        decide: () => Object.freeze({ executeTerminalResult: true, role }),
      }),
      createSimulation: () => terminalDriver({
        role,
        metrics,
        startingIdentity,
        pluginId,
        comparisonId,
      }),
    };
  }

  function terminalDriver({ role, metrics, startingIdentity, pluginId, comparisonId }) {
    let isTerminal = false;
    const evidenceIds = unique(metrics.flatMap((row) => row.provenance.evidenceRefs.map((ref) => ref.id)));
    return Object.freeze({
      startingIdentity: () => startingIdentity,
      observe: () => ({ role, status: isTerminal ? 'terminal' : 'ready' }),
      advance() {
        if (isTerminal) throw adapterError('comparison_adapter_branch_terminal', `${role} branch already executed`);
        isTerminal = true;
        return Object.freeze({
          schema: 'simulatte.comparisonBranchTransition.v4',
          simulationTimeMs: 1,
          status: 'terminal',
          events: [Object.freeze({
            schema: 'simulatte.pluginEvent.v4',
            id: `${comparisonId}:${role}:terminal`,
            pluginId,
            sequence: 0,
            simulationTimeMs: 1,
            kind: `${pluginId}.comparison-branch-settled`,
            causationIds: [],
            correlationId: comparisonId,
            payload: {
              role,
              metricIds: metrics.map((row) => row.id),
            },
            provenance: metrics[0].provenance,
          })],
          metrics,
          evidenceIds,
          observation: { role, status: 'terminal' },
        });
      },
      settle() {
        if (!isTerminal) throw adapterError('comparison_adapter_branch_not_terminal', `${role} branch has not executed`);
        return Object.freeze({
          schema: 'simulatte.comparisonBranchSettlement.v4',
          status: 'settled',
          metrics,
          evidenceIds,
        });
      },
    });
  }

  function comparableMetrics(branches, provenance) {
    const baseline = numericLeaves(branches.baseline);
    const intervention = numericLeaves(branches.intervention);
    const ids = [...baseline.keys()].filter((id) => intervention.has(id)).sort();
    if (!ids.length) {
      throw adapterError('comparison_adapter_metrics_missing', 'Comparison branch results share no finite numeric metrics');
    }
    return Object.freeze(Object.fromEntries(ROLES.map((role) => {
      const values = role === 'baseline' ? baseline : intervention;
      return [role, Object.freeze(ids.map((id) => Object.freeze({
        id,
        value: values.get(id),
        unit: 'domain-unit',
        provenance,
      })))];
    })));
  }

  function numericLeaves(value, prefix = '', output = new Map(), depth = 0) {
    if (depth > 6 || value === null || value === undefined) return output;
    if (Number.isFinite(value)) {
      output.set(prefix || 'value', Number(value));
      return output;
    }
    if (Array.isArray(value) || typeof value !== 'object') return output;
    Object.keys(value).sort().forEach((key) => {
      if (['seed', 'year', 'epoch'].includes(key)) return;
      numericLeaves(value[key], prefix ? `${prefix}.${key}` : key, output, depth + 1);
    });
    return output;
  }

  function provenanceFor(record) {
    return contracts.createProvenance({
      origin: 'derived',
      temporalStatus: 'forecast',
      uncertainty: {
        kind: 'missing',
        value: { reason: 'Terminal comparison adapter preserves plugin-reported branch uncertainty separately' },
      },
      evidenceRefs: [evidenceReference(record)],
    });
  }

  function evidenceReference(record) {
    return Object.freeze({
      id: record.id,
      datasetId: record.datasetId,
      ...(record.rowId === undefined ? {} : { rowId: record.rowId }),
      contentHash: record.contentHash,
      ...(record.kind === 'transformation' ? { transformationId: record.id } : {}),
      ...(record.kind === 'model' ? { modelReceiptId: record.id } : {}),
    });
  }

  function identityHashes(records, kind) {
    const byId = new Map();
    records.filter((row) => row.kind === kind).forEach((row) => {
      if (!byId.has(row.id)) byId.set(row.id, row.contentHash);
    });
    return Object.freeze([...byId.entries()].sort(([left], [right]) => left.localeCompare(right))
      .map(([id, sha256]) => Object.freeze({ id, sha256 })));
  }

  async function sha256(value) {
    const bytes = new TextEncoder().encode(canonical(value));
    if (root.crypto?.subtle) {
      const digest = await root.crypto.subtle.digest('SHA-256', bytes);
      return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    }
    if (typeof require === 'function') {
      return require('node:crypto').createHash('sha256').update(bytes).digest('hex');
    }
    throw adapterError('comparison_adapter_sha256_unavailable', 'SHA-256 is unavailable');
  }

  function canonical(value) {
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
    if (value && typeof value === 'object') {
      return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
  }

  function unique(values) {
    return [...new Set(values)].sort();
  }

  function text(value, code, label) {
    if (typeof value !== 'string' || !value) throw adapterError(code, `${label} expected non-empty text`);
  }

  function adapterError(code, message, evidence = null) {
    const error = new Error(`${code}: ${message}`);
    error.name = 'SimulatteComparisonResultAdapterError';
    error.code = code;
    error.evidence = evidence;
    return error;
  }

  return Object.freeze({ createSettledComparison, numericLeaves });
});
