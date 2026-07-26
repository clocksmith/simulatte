(function attachComparisonContracts(root, factory) {
  const contracts = typeof module === 'object' && module.exports
    ? require('../../contracts/plugin-v4-contracts.js')
    : root.SimulattePluginV4Contracts;
  const api = factory(contracts);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteComparisonContracts = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createComparisonContracts(
  contracts
) {
  const BRANCH_ROLES = Object.freeze(['baseline', 'intervention']);
  const SYNCHRONIZATION_POLICIES = Object.freeze(['lockstep', 'event-time']);
  const BRANCH_STATUSES = Object.freeze(['ready', 'running', 'terminal', 'failed', 'cancelled']);
  const EXECUTION_STATES = Object.freeze([
    'paused',
    'playing',
    'completed',
    'settled',
    'failed',
    'cancelled',
  ]);
  const HASH_PATTERN = /^[a-f0-9]{64}$/;
  const FORBIDDEN_POLICY_KEYS = Object.freeze(new Set([
    'groundTruth',
    'hiddenLabel',
    'hiddenTruth',
    'oracleValue',
    'truthLabel',
  ]));

  function validateStartingIdentity(value) {
    object(value, 'comparison_starting_identity_invalid', 'Comparison starting identity');
    exactKeys(
      value,
      ['schema', 'scenarioId', 'seed', 'inputHash', 'datasetHashes', 'modelHashes', 'hiddenTruth'],
      'Comparison starting identity'
    );
    equal(
      value.schema,
      'simulatte.comparisonStartingIdentity.v4',
      'comparison_starting_identity_schema_invalid',
      'Comparison starting identity schema'
    );
    text(value.scenarioId, 'comparison_scenario_id_invalid', 'Comparison scenario ID');
    text(value.seed, 'comparison_seed_invalid', 'Comparison seed');
    hash(value.inputHash, 'comparison_input_hash_invalid', 'Comparison input hash');
    validateIdentityHashes(value.datasetHashes, 'dataset');
    validateIdentityHashes(value.modelHashes, 'model');
    object(value.hiddenTruth, 'comparison_hidden_truth_identity_invalid', 'Hidden truth identity');
    exactKeys(value.hiddenTruth, ['id', 'sha256'], 'Hidden truth identity');
    text(value.hiddenTruth.id, 'comparison_hidden_truth_id_invalid', 'Hidden truth ID');
    hash(value.hiddenTruth.sha256, 'comparison_hidden_truth_hash_invalid', 'Hidden truth hash');
    return value;
  }

  function validateIdentityHashes(rows, kind) {
    if (!Array.isArray(rows)) {
      fail('comparison_identity_hashes_invalid', `Comparison ${kind} hashes expected an array`);
    }
    const ids = rows.map((row, index) => {
      object(row, 'comparison_identity_hash_invalid', `Comparison ${kind} hash ${index}`);
      exactKeys(row, ['id', 'sha256'], `Comparison ${kind} hash ${index}`);
      text(row.id, 'comparison_identity_hash_id_invalid', `Comparison ${kind} hash ID`);
      hash(row.sha256, 'comparison_identity_hash_value_invalid', `Comparison ${kind} hash`);
      return row.id;
    });
    unique(ids, 'comparison_identity_hash_duplicate', `Comparison ${kind} hash IDs`);
  }

  function validateHiddenTruth(value, expectedIdentity) {
    object(value, 'comparison_hidden_truth_invalid', 'Comparison hidden truth');
    exactKeys(value, ['id', 'sha256', 'value'], 'Comparison hidden truth');
    text(value.id, 'comparison_hidden_truth_id_invalid', 'Hidden truth ID');
    hash(value.sha256, 'comparison_hidden_truth_hash_invalid', 'Hidden truth hash');
    if (value.value === undefined) fail('comparison_hidden_truth_value_missing', 'Hidden truth value is missing');
    if (value.id !== expectedIdentity.id || value.sha256 !== expectedIdentity.sha256) {
      fail('comparison_hidden_truth_identity_mismatch', 'Hidden truth does not match starting identity');
    }
  }

  function validateBranchDefinition(value, role) {
    object(value, 'comparison_branch_definition_invalid', `${role} branch definition`);
    exactKeys(
      value,
      ['id', 'configuration', 'configurationHash', 'createPolicy', 'createSimulation'],
      `${role} branch definition`
    );
    text(value.id, 'comparison_branch_id_invalid', `${role} branch ID`);
    hash(value.configurationHash, 'comparison_branch_configuration_hash_invalid', `${role} configuration hash`);
    if (value.configuration === undefined) {
      fail('comparison_branch_configuration_missing', `${role} branch configuration is missing`);
    }
    ['createPolicy', 'createSimulation'].forEach((key) => {
      if (typeof value[key] !== 'function') {
        fail('comparison_branch_factory_invalid', `${role} ${key} expected a function`);
      }
    });
  }

  function validatePolicy(value, role) {
    object(value, 'comparison_policy_invalid', `${role} policy`);
    if (typeof value.decide !== 'function') {
      fail('comparison_policy_decide_invalid', `${role} policy decide expected a function`);
    }
  }

  function validateDriver(value, role, synchronizationPolicy) {
    object(value, 'comparison_driver_invalid', `${role} simulation driver`);
    ['advance', 'observe', 'settle', 'startingIdentity'].forEach((key) => {
      if (typeof value[key] !== 'function') {
        fail('comparison_driver_method_invalid', `${role} driver ${key} expected a function`);
      }
    });
    if (synchronizationPolicy === 'event-time' && typeof value.nextEventTimeMs !== 'function') {
      fail('comparison_driver_next_event_invalid', `${role} event-time driver requires nextEventTimeMs`);
    }
  }

  function validateTransition(value, role) {
    object(value, 'comparison_transition_invalid', `${role} transition`);
    exactKeys(
      value,
      ['schema', 'simulationTimeMs', 'status', 'events', 'metrics', 'evidenceIds', 'observation'],
      `${role} transition`
    );
    equal(
      value.schema,
      'simulatte.comparisonBranchTransition.v4',
      'comparison_transition_schema_invalid',
      `${role} transition schema`
    );
    nonNegative(value.simulationTimeMs, 'comparison_transition_time_invalid', `${role} transition time`);
    oneOf(value.status, ['running', 'terminal'], 'comparison_transition_status_invalid', `${role} status`);
    if (!Array.isArray(value.events)) fail('comparison_transition_events_invalid', `${role} events expected an array`);
    if (!Array.isArray(value.metrics)) fail('comparison_transition_metrics_invalid', `${role} metrics expected an array`);
    validateTextArray(value.evidenceIds, 'comparison_transition_evidence_invalid', `${role} evidence IDs`);
    if (value.observation === undefined) {
      fail('comparison_transition_observation_missing', `${role} observation is missing`);
    }
    assertPolicySafe(value.observation, `${role} observation`);
  }

  function validateMetric(value, label) {
    object(value, 'comparison_metric_invalid', label);
    exactKeys(value, ['id', 'value', 'unit', 'provenance'], label);
    text(value.id, 'comparison_metric_id_invalid', `${label} ID`);
    if (!Number.isFinite(value.value)) fail('comparison_metric_value_invalid', `${label} value expected finite number`);
    text(value.unit, 'comparison_metric_unit_invalid', `${label} unit`);
    contracts.validateProvenance(value.provenance, `${label} provenance`);
  }

  function validateBranchSettlement(value, role) {
    object(value, 'comparison_branch_settlement_invalid', `${role} settlement`);
    exactKeys(value, ['schema', 'status', 'metrics', 'evidenceIds'], `${role} settlement`);
    equal(
      value.schema,
      'simulatte.comparisonBranchSettlement.v4',
      'comparison_branch_settlement_schema_invalid',
      `${role} settlement schema`
    );
    equal(value.status, 'settled', 'comparison_branch_settlement_status_invalid', `${role} settlement status`);
    if (!Array.isArray(value.metrics)) fail('comparison_settlement_metrics_invalid', `${role} settlement metrics expected an array`);
    validateTextArray(value.evidenceIds, 'comparison_settlement_evidence_invalid', `${role} settlement evidence IDs`);
  }

  function validateExecutionReceipt(value) {
    object(value, 'comparison_receipt_invalid', 'Comparison receipt');
    exactKeys(value, [
      'schema',
      'id',
      'synchronizationPolicy',
      'startingIdentity',
      'branchDefinitions',
      'evidenceIds',
      'requiredEvidenceIds',
      'state',
      'positionMs',
      'cursor',
      'history',
      'branches',
      'fault',
      'cancellation',
      'settlement',
    ], 'Comparison receipt');
    equal(
      value.schema,
      'simulatte.comparisonExecutionReceipt.v4',
      'comparison_receipt_schema_invalid',
      'Comparison receipt schema'
    );
    if (!Array.isArray(value.history)) fail('comparison_receipt_history_invalid', 'Comparison receipt history expected an array');
    if (!Number.isInteger(value.cursor) || value.cursor < 0 || value.cursor > value.history.length) {
      fail('comparison_receipt_cursor_invalid', 'Comparison receipt cursor is invalid');
    }
    nonNegative(value.positionMs, 'comparison_receipt_position_invalid', 'Comparison receipt position');
    oneOf(value.synchronizationPolicy, SYNCHRONIZATION_POLICIES, 'comparison_receipt_policy_invalid', 'Comparison receipt policy');
    oneOf(value.state, EXECUTION_STATES, 'comparison_receipt_state_invalid', 'Comparison receipt state');
    validateStartingIdentity(value.startingIdentity);
    validateTextArray(value.evidenceIds, 'comparison_receipt_evidence_invalid', 'Comparison receipt evidence IDs');
    validateTextArray(
      value.requiredEvidenceIds,
      'comparison_receipt_required_evidence_invalid',
      'Comparison receipt required evidence IDs'
    );
    validateReceiptBranchDefinitions(value.branchDefinitions);
    validateReceiptBranches(value.branches);
    value.history.forEach((operation, index) => validateOperation(operation, index, value.synchronizationPolicy));
    if (value.state === 'settled' && value.settlement === null) {
      fail('comparison_receipt_settlement_missing', 'Settled comparison receipt is missing settlement');
    }
    if (value.state === 'cancelled' && value.cancellation === null) {
      fail('comparison_receipt_cancellation_missing', 'Cancelled comparison receipt is missing cancellation');
    }
    if (value.state === 'failed' && value.fault === null) {
      fail('comparison_receipt_fault_missing', 'Failed comparison receipt is missing fault');
    }
  }

  function validateReceiptBranchDefinitions(value) {
    object(value, 'comparison_receipt_branch_definitions_invalid', 'Receipt branch definitions');
    exactKeys(value, BRANCH_ROLES, 'Receipt branch definitions');
    BRANCH_ROLES.forEach((role) => {
      const definition = value[role];
      object(definition, 'comparison_receipt_branch_definition_invalid', `${role} receipt branch definition`);
      exactKeys(definition, ['id', 'role', 'configurationHash'], `${role} receipt branch definition`);
      text(definition.id, 'comparison_receipt_branch_id_invalid', `${role} receipt branch ID`);
      equal(definition.role, role, 'comparison_receipt_branch_role_invalid', `${role} receipt branch role`);
      hash(
        definition.configurationHash,
        'comparison_receipt_configuration_hash_invalid',
        `${role} receipt configuration hash`
      );
    });
  }

  function validateReceiptBranches(value) {
    object(value, 'comparison_receipt_branches_invalid', 'Receipt branches');
    exactKeys(value, BRANCH_ROLES, 'Receipt branches');
    BRANCH_ROLES.forEach((role) => {
      const branch = value[role];
      object(branch, 'comparison_receipt_branch_invalid', `${role} receipt branch`);
      exactKeys(
        branch,
        ['id', 'role', 'status', 'simulationTimeMs', 'stepCount', 'metricIds', 'evidenceIds', 'timeline'],
        `${role} receipt branch`
      );
      text(branch.id, 'comparison_receipt_branch_id_invalid', `${role} receipt branch ID`);
      equal(branch.role, role, 'comparison_receipt_branch_role_invalid', `${role} receipt branch role`);
      oneOf(branch.status, BRANCH_STATUSES, 'comparison_receipt_branch_status_invalid', `${role} receipt branch status`);
      nonNegative(
        branch.simulationTimeMs,
        'comparison_receipt_branch_time_invalid',
        `${role} receipt branch time`
      );
      if (!Number.isInteger(branch.stepCount) || branch.stepCount < 0) {
        fail('comparison_receipt_branch_step_count_invalid', `${role} receipt branch step count is invalid`);
      }
      validateTextArray(branch.metricIds, 'comparison_receipt_metric_ids_invalid', `${role} metric IDs`);
      validateTextArray(branch.evidenceIds, 'comparison_receipt_evidence_ids_invalid', `${role} evidence IDs`);
      object(branch.timeline, 'comparison_receipt_timeline_invalid', `${role} timeline receipt`);
    });
  }

  function validateOperation(value, expectedIndex, synchronizationPolicy) {
    object(value, 'comparison_receipt_operation_invalid', `Receipt operation ${expectedIndex}`);
    exactKeys(
      value,
      ['schema', 'index', 'synchronizationPolicy', 'advancedRoles', 'branches', 'masterTimeMs'],
      `Receipt operation ${expectedIndex}`
    );
    equal(
      value.schema,
      'simulatte.comparisonOperation.v4',
      'comparison_receipt_operation_schema_invalid',
      `Receipt operation ${expectedIndex} schema`
    );
    equal(value.index, expectedIndex, 'comparison_receipt_operation_index_invalid', 'Receipt operation index');
    equal(
      value.synchronizationPolicy,
      synchronizationPolicy,
      'comparison_receipt_operation_policy_invalid',
      'Receipt operation policy'
    );
    validateTextArray(
      value.advancedRoles,
      'comparison_receipt_operation_roles_invalid',
      'Receipt operation roles'
    );
    value.advancedRoles.forEach((role) => oneOf(
      role,
      BRANCH_ROLES,
      'comparison_receipt_operation_role_invalid',
      'Receipt operation role'
    ));
    object(value.branches, 'comparison_receipt_operation_branches_invalid', 'Receipt operation branches');
    exactKeys(value.branches, value.advancedRoles, `Receipt operation ${expectedIndex} branches`);
    value.advancedRoles.forEach((role) => {
      const branch = value.branches[role];
      object(branch, 'comparison_receipt_operation_branch_invalid', `${role} receipt operation`);
      exactKeys(branch, ['action', 'transition'], `${role} receipt operation`);
      assertPolicySafe(branch.action, `${role} receipt action`);
      validateTransition(branch.transition, role);
    });
    nonNegative(
      value.masterTimeMs,
      'comparison_receipt_operation_time_invalid',
      'Receipt operation time'
    );
  }

  function compareMetrics(baselineMetrics, interventionMetrics) {
    const baselineById = metricMap(baselineMetrics, 'baseline');
    const interventionById = metricMap(interventionMetrics, 'intervention');
    if (canonical([...baselineById.keys()].sort()) !== canonical([...interventionById.keys()].sort())) {
      fail('comparison_metric_schema_incompatible', 'Branch settlement metric IDs are incompatible');
    }
    return Object.freeze([...baselineById.keys()].sort().map((id) => {
      const baseline = baselineById.get(id);
      const intervention = interventionById.get(id);
      if (baseline.unit !== intervention.unit) {
        fail('comparison_metric_unit_incompatible', `Metric ${id} units are incompatible`, {
          baselineUnit: baseline.unit,
          interventionUnit: intervention.unit,
        });
      }
      return deepFreeze({
        id,
        unit: baseline.unit,
        baselineValue: baseline.value,
        interventionValue: intervention.value,
        delta: intervention.value - baseline.value,
      });
    }));
  }

  function metricMap(metrics, role) {
    const map = new Map();
    metrics.forEach((metric, index) => {
      validateMetric(metric, `${role} settlement metric ${index}`);
      if (map.has(metric.id)) fail('comparison_metric_duplicate', `${role} settlement repeats metric ${metric.id}`);
      map.set(metric.id, metric);
    });
    return map;
  }

  function validateEvidenceCatalog(value) {
    if (!Array.isArray(value)) fail('comparison_evidence_catalog_invalid', 'Evidence catalog expected an array');
    const ids = value.map((row, index) => {
      contracts.validateProvenanceRecord(row, `Evidence catalog record ${index}`);
      return row.id;
    });
    unique(ids, 'comparison_evidence_catalog_duplicate', 'Evidence catalog IDs');
    return new Set(ids);
  }

  function collectEventEvidence(events) {
    return new Set(events.flatMap((event) => event.provenance.evidenceRefs.map((row) => row.id)));
  }

  function collectMetricEvidence(metrics) {
    return new Set(metrics.flatMap((metric) => metric.provenance.evidenceRefs.map((row) => row.id)));
  }

  function operationTime(operation) {
    const times = operation.advancedRoles.map(
      (role) => operation.branches[role].transition.simulationTimeMs
    );
    return times.length ? Math.max(...times) : 0;
  }

  function isBranchTerminal(branch) {
    return branch.status === 'terminal' || branch.status === 'cancelled' || branch.status === 'failed';
  }

  function readObservation(driver, role) {
    const observation = driver.observe();
    rejectPromise(observation, 'comparison_driver_async_invalid', `${role} driver observation`);
    assertPolicySafe(observation, `${role} observation`);
    return cloneFreeze(observation, 'comparison_observation_clone_failed');
  }

  function assertPolicySafe(value, label) {
    inspectPolicyValue(value, label, new Set());
  }

  function inspectPolicyValue(value, label, visited) {
    if (!value || typeof value !== 'object') return;
    if (visited.has(value)) fail('comparison_policy_value_circular', `${label} contains a circular reference`);
    visited.add(value);
    if (Array.isArray(value)) {
      value.forEach((row, index) => inspectPolicyValue(row, `${label}[${index}]`, visited));
    } else {
      Object.entries(value).forEach(([key, row]) => {
        if (FORBIDDEN_POLICY_KEYS.has(key)) {
          fail('comparison_hidden_truth_leak', `${label} exposes forbidden field ${key}`, { key });
        }
        inspectPolicyValue(row, `${label}.${key}`, visited);
      });
    }
    visited.delete(value);
  }

  function rejectPromise(value, code, label) {
    if (value && typeof value.then === 'function') fail(code, `${label} must be synchronous`);
  }

  function validateTextArray(value, code, label) {
    if (!Array.isArray(value)) fail(code, `${label} expected an array`);
    value.forEach((row) => text(row, code, label));
    unique(value, code, label);
  }

  function canonical(value) {
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
    if (value && typeof value === 'object') {
      return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
  }

  function cloneFreeze(value, code) {
    try {
      return deepFreeze(structuredClone(value));
    } catch (error) {
      fail(code, 'Comparison value must be structured-cloneable', {
        cause: error && error.message ? error.message : String(error),
      });
    }
  }

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
  }

  function exactKeys(value, keys, label) {
    const unexpected = Object.keys(value).filter((key) => !keys.includes(key));
    const missing = keys.filter((key) => !Object.hasOwn(value, key));
    if (unexpected.length || missing.length) {
      fail('comparison_keys_invalid', `${label} has missing or unexpected keys`, { unexpected, missing });
    }
  }

  function object(value, code, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      fail(code, `${label} expected an object`);
    }
  }

  function text(value, code, label) {
    if (typeof value !== 'string' || !value) fail(code, `${label} expected non-empty text`);
  }

  function hash(value, code, label) {
    if (typeof value !== 'string' || !HASH_PATTERN.test(value)) {
      fail(code, `${label} expected a lowercase SHA-256 hex digest`);
    }
  }

  function positive(value, code, label) {
    if (!Number.isFinite(value) || value <= 0) fail(code, `${label} expected a positive finite number`);
  }

  function nonNegative(value, code, label) {
    if (!Number.isFinite(value) || value < 0) fail(code, `${label} expected a non-negative finite number`);
  }

  function oneOf(value, choices, code, label) {
    if (!choices.includes(value)) fail(code, `${label} expected ${choices.join(', ')}`);
  }

  function unique(values, code, label) {
    if (new Set(values).size !== values.length) fail(code, `${label} must be unique`);
  }

  function equal(actual, expected, code, label) {
    if (actual !== expected) fail(code, `${label} expected ${expected}`);
  }

  function faultError(fault) {
    const error = new Error(`${fault.code}: ${fault.message}`);
    error.name = 'SimulatteComparisonExecutionError';
    error.code = fault.code;
    error.evidence = fault.evidence;
    return error;
  }

  function fail(code, message, evidence = null) {
    const error = new Error(`${code}: ${message}`);
    error.name = 'SimulatteComparisonExecutionError';
    error.code = code;
    error.evidence = evidence;
    throw error;
  }

  return Object.freeze({
    BRANCH_ROLES,
    BRANCH_STATUSES,
    SYNCHRONIZATION_POLICIES,
    assertPolicySafe,
    canonical,
    cloneFreeze,
    collectEventEvidence,
    collectMetricEvidence,
    compareMetrics,
    deepFreeze,
    exactKeys,
    fail,
    faultError,
    isBranchTerminal,
    nonNegative,
    object,
    oneOf,
    operationTime,
    positive,
    readObservation,
    rejectPromise,
    text,
    validateBranchDefinition,
    validateBranchSettlement,
    validateDriver,
    validateEvidenceCatalog,
    validateExecutionReceipt,
    validateHiddenTruth,
    validateMetric,
    validatePolicy,
    validateStartingIdentity,
    validateTextArray,
    validateTransition,
  });
});
