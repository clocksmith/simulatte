(function attachSimulatteWorldProofSafety(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteWorldProofSafety = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createSafetyProofApi() {
  const SAFETY_PROOF_RECEIPT_SCHEMA = 'simulatte.safetyProofReceipt.v1';
  const SAFETY_CHECKPOINT_SCHEMA = 'simulatte.safetyCheckpoint.v1';
  const SAFETY_RULE_RESULT_SCHEMA = 'simulatte.safetyRuleResult.v1';
  const HASH_PREFIX = 'fnv1a32:';
  const MAX_RULES = 64;
  const MAX_CHECKPOINTS = 1025;

  class SafetyProofError extends Error {
    constructor(message, path = '$.safetyProofReceipt') {
      super(`${message} at ${path}`);
      this.name = 'SafetyProofError';
      this.path = path;
    }
  }

  function canonicalValue(value) {
    if (Array.isArray(value)) return value.map(canonicalValue);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.keys(value).sort().map((key) => (
        [key, canonicalValue(value[key])]
      )));
    }
    return value;
  }

  function canonicalJson(value) {
    return JSON.stringify(canonicalValue(value));
  }

  function fnv1a32(value) {
    let hash = 0x811c9dc5;
    const bytes = new TextEncoder().encode(String(value || ''));
    for (const byte of bytes) {
      hash ^= byte;
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash >>> 0;
  }

  function contentHash(value) {
    return `${HASH_PREFIX}${fnv1a32(canonicalJson(value)).toString(16).padStart(8, '0')}`;
  }

  function captureSafetyCheckpoint(rules, state, step) {
    if (!Array.isArray(rules) || rules.length < 1 || rules.length > MAX_RULES) {
      throw new SafetyProofError(`Safety checkpoint requires between 1 and ${MAX_RULES} rules`);
    }
    if (!Number.isInteger(step) || step < 0 || step >= MAX_CHECKPOINTS) {
      throw new SafetyProofError(`Safety checkpoint step must be between 0 and ${MAX_CHECKPOINTS - 1}`);
    }
    return canonicalValue({
      schema: SAFETY_CHECKPOINT_SCHEMA,
      step,
      samples: rules.map((rule) => sampleRule(rule, state)),
    });
  }

  function sampleRule(rule, state) {
    const located = readStatePath(state, rule && rule.statePath);
    const numeric = located.present && typeof located.value === 'number';
    const finite = numeric && Number.isFinite(located.value);
    return {
      ruleId: String(rule && rule.id || ''),
      sampleStatus: !located.present
        ? 'missing'
        : !numeric
          ? 'non-numeric'
          : !finite
            ? 'non-finite'
            : 'finite',
      value: finite ? Number(located.value) : null,
    };
  }

  function readStatePath(state, pointer) {
    if (!state || typeof state !== 'object' || typeof pointer !== 'string' || !pointer.startsWith('/')) {
      return { present: false, value: undefined };
    }
    const segments = pointer.slice(1).split('/').map((row) => (
      row.replace(/~1/g, '/').replace(/~0/g, '~')
    ));
    let value = state;
    for (const segment of segments) {
      if (['__proto__', 'prototype', 'constructor'].includes(segment) ||
          !value || typeof value !== 'object' || !Object.hasOwn(value, segment)) {
        return { present: false, value: undefined };
      }
      value = value[segment];
    }
    return { present: true, value };
  }

  function summarizeTrace(rules, checkpoints) {
    validateTraceInputs(rules, checkpoints);
    const ruleResults = rules.map((rule) => summarizeRule(rule, checkpoints));
    const violationRuleIds = ruleResults
      .filter((row) => row.status === 'block')
      .map((row) => row.ruleId);
    const warningRuleIds = ruleResults
      .filter((row) => row.status === 'warn')
      .map((row) => row.ruleId);
    const decision = violationRuleIds.length ? 'block' : 'allow';
    const trace = canonicalValue({
      decision,
      checkpointCount: checkpoints.length,
      ruleResults,
    });
    return {
      ...trace,
      violationRuleIds,
      warningRuleIds,
      traceHash: contentHash(trace),
    };
  }

  function validateTraceInputs(rules, checkpoints) {
    if (!Array.isArray(rules) || rules.length < 1 || rules.length > MAX_RULES) {
      throw new SafetyProofError(`Safety trace requires between 1 and ${MAX_RULES} rules`);
    }
    if (!Array.isArray(checkpoints) || checkpoints.length < 1 || checkpoints.length > MAX_CHECKPOINTS) {
      throw new SafetyProofError(`Safety trace requires between 1 and ${MAX_CHECKPOINTS} checkpoints`);
    }
    checkpoints.forEach((checkpoint, index) => {
      if (!checkpoint || checkpoint.schema !== SAFETY_CHECKPOINT_SCHEMA || checkpoint.step !== index ||
          !Array.isArray(checkpoint.samples) || checkpoint.samples.length !== rules.length) {
        throw new SafetyProofError('Safety checkpoints must be contiguous and complete');
      }
      checkpoint.samples.forEach((sample, ruleIndex) => {
        if (!sample || sample.ruleId !== rules[ruleIndex].id ||
            !['finite', 'missing', 'non-numeric', 'non-finite'].includes(sample.sampleStatus) ||
            (sample.value !== null && !Number.isFinite(sample.value))) {
          throw new SafetyProofError('Safety checkpoint sample does not match its declared rule');
        }
      });
    });
  }

  function summarizeRule(rule, checkpoints) {
    const evaluations = checkpoints.map((checkpoint) => {
      const sample = checkpoint.samples.find((row) => row.ruleId === rule.id);
      return {
        step: checkpoint.step,
        sampleStatus: sample.sampleStatus,
        value: sample.value,
        passes: safetyPredicatePasses(rule, sample),
      };
    });
    const violations = evaluations.filter((row) => !row.passes);
    const values = evaluations.map((row) => row.value).filter(Number.isFinite);
    return canonicalValue({
      schema: SAFETY_RULE_RESULT_SCHEMA,
      ruleId: rule.id,
      severity: rule.severity,
      status: violations.length ? rule.severity : 'pass',
      evaluationCount: evaluations.length,
      violationCount: violations.length,
      firstViolationStep: violations.length ? violations[0].step : null,
      lastValue: evaluations.at(-1).value,
      minimumObserved: values.length ? Math.min(...values) : null,
      maximumObserved: values.length ? Math.max(...values) : null,
      traceHash: contentHash(evaluations),
    });
  }

  function safetyPredicatePasses(rule, sample) {
    if (!sample || sample.sampleStatus !== 'finite') return false;
    const value = sample.value;
    const tolerance = Number(rule.tolerance || 0);
    if (rule.operator === 'finite') return true;
    if (rule.operator === 'gte') return value + tolerance >= rule.minimum;
    if (rule.operator === 'lte') return value - tolerance <= rule.maximum;
    if (rule.operator === 'between') {
      return value + tolerance >= rule.minimum && value - tolerance <= rule.maximum;
    }
    if (rule.operator === 'equals') return Math.abs(value - rule.expected) <= tolerance;
    return false;
  }

  function createSafetyProofReceipt(options = {}) {
    const binding = options.binding || null;
    const safety = binding && binding.safety || {};
    const policy = binding && binding.simulationReproducibility || {};
    const rules = Array.isArray(safety.rules) ? safety.rules : [];
    let baseline = null;
    let replay = null;
    let error = options.error || null;
    if (!error) {
      try {
        baseline = summarizeTrace(rules, options.baselineCheckpoints);
        replay = summarizeTrace(rules, options.replayCheckpoints);
      } catch (traceError) {
        error = traceError;
      }
    }
    const independentExecution = options.independentExecution === true;
    const decisionsMatch = Boolean(
      baseline && replay && baseline.traceHash === replay.traceHash &&
      baseline.decision === replay.decision
    );
    const mismatchRuleIds = baseline && replay
      ? baseline.ruleResults.filter((row, index) => (
        row.traceHash !== replay.ruleResults[index].traceHash
      )).map((row) => row.ruleId)
      : [];
    const facts = { binding, safety, policy, rules, baseline, replay, error, independentExecution, decisionsMatch };
    const failureCode = safetyFailureCode(facts);
    const receipt = canonicalValue({
      schema: SAFETY_PROOF_RECEIPT_SCHEMA,
      status: failureCode ? 'fail' : 'pass',
      failureCode,
      reason: failureCode
        ? String(error && error.message || safetyFailureReason(failureCode))
        : baseline.warningRuleIds.length
          ? 'Safety gates reproduced with non-blocking warnings'
          : 'Safety gates reproduced and allowed the declared fixed-step execution',
      independentExecution,
      worldSpecContentHash: String(binding && binding.worldSpec && binding.worldSpec.contentHash || ''),
      worldSpecRevision: Number(binding && binding.worldSpec && binding.worldSpec.revision || 0),
      buildId: String(binding && binding.replayIdentity && binding.replayIdentity.buildId || ''),
      rulesHash: String(safety.rulesHash || ''),
      policyHash: String(policy.policyHash || ''),
      seed: Object.hasOwn(policy, 'seed') ? policy.seed : null,
      stepCount: Number(policy.policy && policy.policy.stepCount || 0),
      stepSeconds: Number(policy.policy && policy.policy.stepSeconds || 0),
      checkpointCount: Number(baseline && baseline.checkpointCount || 0),
      ruleCount: rules.length,
      baselineDecision: String(baseline && baseline.decision || ''),
      replayDecision: String(replay && replay.decision || ''),
      decisionsMatch,
      baselineTraceHash: String(baseline && baseline.traceHash || ''),
      replayTraceHash: String(replay && replay.traceHash || ''),
      ruleResults: baseline && baseline.ruleResults || [],
      violationRuleIds: baseline && baseline.violationRuleIds || [],
      warningRuleIds: baseline && baseline.warningRuleIds || [],
      mismatchRuleIds,
    });
    return validateSafetyProofReceipt(receipt);
  }

  function safetyFailureCode(facts) {
    if (facts.error) return facts.error instanceof SafetyProofError
      ? 'safety-trace-invalid' : String(facts.error.code || 'safety-execution-failed');
    if (!facts.binding || !facts.binding.worldSpec) return 'safety-binding-missing';
    if (!facts.binding.replayIdentity || !facts.binding.replayIdentity.buildId) return 'safety-build-identity-missing';
    if (facts.safety.status !== 'declared' || !facts.safety.rulesHash || !facts.rules.length) {
      return 'safety-rules-missing';
    }
    if (!facts.policy.policyHash || !facts.policy.policy || !Number.isInteger(facts.policy.policy.stepCount) ||
        facts.policy.policy.stepCount < 1 || !Number.isFinite(facts.policy.policy.stepSeconds) ||
        facts.policy.policy.stepSeconds <= 0) return 'safety-policy-missing';
    if (!facts.independentExecution) return 'independent-safety-execution-missing';
    if (!facts.baseline || !facts.replay) return 'safety-trace-missing';
    if (!facts.decisionsMatch) return 'safety-decision-divergence';
    if (facts.baseline.decision === 'block') return 'safety-rule-violation';
    return '';
  }

  function safetyFailureReason(code) {
    return ({
      'safety-binding-missing': 'Safety proof is not bound to a WorldSpec',
      'safety-build-identity-missing': 'Safety proof build identity is missing',
      'safety-rules-missing': 'No executable safety rules were declared',
      'safety-policy-missing': 'No bounded fixed-step safety execution policy was declared',
      'independent-safety-execution-missing': 'A second safety-gate execution was not recorded',
      'safety-trace-missing': 'One or both safety decision traces are missing',
      'safety-decision-divergence': 'Independent safety-gate decisions diverged',
      'safety-rule-violation': 'A blocking safety rule was violated',
    })[code] || 'Safety proof execution failed';
  }

  function validateSafetyProofReceipt(receipt) {
    requireObject(receipt);
    requireExactKeys(receipt, [
      'schema', 'status', 'failureCode', 'reason', 'independentExecution',
      'worldSpecContentHash', 'worldSpecRevision', 'buildId', 'rulesHash', 'policyHash',
      'seed', 'stepCount', 'stepSeconds', 'checkpointCount', 'ruleCount',
      'baselineDecision', 'replayDecision', 'decisionsMatch', 'baselineTraceHash',
      'replayTraceHash', 'ruleResults', 'violationRuleIds', 'warningRuleIds', 'mismatchRuleIds',
    ]);
    if (receipt.schema !== SAFETY_PROOF_RECEIPT_SCHEMA) {
      throw new SafetyProofError('Unexpected safety-proof receipt schema');
    }
    if (!['pass', 'fail'].includes(receipt.status)) throw new SafetyProofError('Unexpected safety-proof status');
    for (const key of [
      'failureCode', 'reason', 'worldSpecContentHash', 'buildId', 'rulesHash', 'policyHash',
      'baselineDecision', 'replayDecision', 'baselineTraceHash', 'replayTraceHash',
    ]) {
      if (typeof receipt[key] !== 'string') throw new SafetyProofError(`Expected string field ${key}`);
    }
    for (const key of ['worldSpecRevision', 'stepCount', 'checkpointCount', 'ruleCount']) {
      if (!Number.isInteger(receipt[key]) || receipt[key] < 0) {
        throw new SafetyProofError(`Expected nonnegative integer field ${key}`);
      }
    }
    if (!Number.isFinite(receipt.stepSeconds) || receipt.stepSeconds < 0 ||
        (receipt.seed !== null && !Number.isFinite(receipt.seed))) {
      throw new SafetyProofError('Safety proof numeric fields are invalid');
    }
    if (typeof receipt.independentExecution !== 'boolean' || typeof receipt.decisionsMatch !== 'boolean') {
      throw new SafetyProofError('Safety proof execution fields are invalid');
    }
    for (const key of ['ruleResults', 'violationRuleIds', 'warningRuleIds', 'mismatchRuleIds']) {
      if (!Array.isArray(receipt[key])) throw new SafetyProofError(`Expected array field ${key}`);
    }
    receipt.ruleResults.forEach(validateRuleResult);
    if (receipt.ruleCount > MAX_RULES || receipt.ruleResults.length !== receipt.ruleCount) {
      throw new SafetyProofError('Safety proof rule count is invalid');
    }
    const resultIds = receipt.ruleResults.map((row) => row.ruleId);
    if (new Set(resultIds).size !== resultIds.length) {
      throw new SafetyProofError('Safety proof rule results must have unique ids');
    }
    for (const key of ['violationRuleIds', 'warningRuleIds', 'mismatchRuleIds']) {
      if (receipt[key].some((row) => typeof row !== 'string')) {
        throw new SafetyProofError(`Expected string rows in ${key}`);
      }
      if (new Set(receipt[key]).size !== receipt[key].length) {
        throw new SafetyProofError(`Expected unique rows in ${key}`);
      }
    }
    const expectedViolations = receipt.ruleResults
      .filter((row) => row.status === 'block').map((row) => row.ruleId);
    const expectedWarnings = receipt.ruleResults
      .filter((row) => row.status === 'warn').map((row) => row.ruleId);
    if (canonicalJson(expectedViolations) !== canonicalJson(receipt.violationRuleIds) ||
        canonicalJson(expectedWarnings) !== canonicalJson(receipt.warningRuleIds)) {
      throw new SafetyProofError('Safety proof violation summaries do not match rule results');
    }
    const expectedDecision = expectedViolations.length ? 'block' : 'allow';
    if (receipt.baselineDecision && receipt.baselineDecision !== expectedDecision) {
      throw new SafetyProofError('Safety proof decision does not match rule results');
    }
    if (receipt.ruleResults.some((row) => row.evaluationCount !== receipt.checkpointCount)) {
      throw new SafetyProofError('Safety proof checkpoint count does not match rule evaluation counts');
    }
    if (receipt.baselineTraceHash) {
      const expectedTraceHash = contentHash(canonicalValue({
        decision: receipt.baselineDecision,
        checkpointCount: receipt.checkpointCount,
        ruleResults: receipt.ruleResults,
      }));
      if (receipt.baselineTraceHash !== expectedTraceHash) {
        throw new SafetyProofError('Safety proof baseline trace hash does not match its rule results');
      }
    }
    if (receipt.decisionsMatch && (
      receipt.baselineDecision !== receipt.replayDecision ||
      receipt.baselineTraceHash !== receipt.replayTraceHash ||
      receipt.mismatchRuleIds.length
    )) {
      throw new SafetyProofError('Matching safety decisions contain divergent trace evidence');
    }
    if (receipt.status === 'pass' && (
      receipt.failureCode || !receipt.reason || !receipt.independentExecution ||
      !receipt.worldSpecContentHash || !receipt.buildId || !receipt.rulesHash || !receipt.policyHash ||
      receipt.stepCount < 1 || receipt.stepSeconds <= 0 ||
      receipt.checkpointCount !== receipt.stepCount + 1 || receipt.ruleCount < 1 ||
      receipt.baselineDecision !== 'allow' ||
      receipt.replayDecision !== 'allow' || !receipt.decisionsMatch ||
      !receipt.baselineTraceHash || receipt.baselineTraceHash !== receipt.replayTraceHash ||
      receipt.violationRuleIds.length || receipt.mismatchRuleIds.length
    )) {
      throw new SafetyProofError('Passing safety-proof receipt is incomplete');
    }
    return receipt;
  }

  function validateRuleResult(row, index) {
    const path = `$.safetyProofReceipt.ruleResults[${index}]`;
    requireObject(row, path);
    requireExactKeys(row, [
      'schema', 'ruleId', 'severity', 'status', 'evaluationCount', 'violationCount',
      'firstViolationStep', 'lastValue', 'minimumObserved', 'maximumObserved', 'traceHash',
    ], path);
    if (row.schema !== SAFETY_RULE_RESULT_SCHEMA || !row.ruleId ||
        !['block', 'warn'].includes(row.severity) || !['pass', 'block', 'warn'].includes(row.status)) {
      throw new SafetyProofError('Safety rule result identity is invalid', path);
    }
    if (!Number.isInteger(row.evaluationCount) || row.evaluationCount < 1 ||
        !Number.isInteger(row.violationCount) || row.violationCount < 0 ||
        row.violationCount > row.evaluationCount) {
      throw new SafetyProofError('Safety rule result counts are invalid', path);
    }
    if (row.firstViolationStep !== null && (!Number.isInteger(row.firstViolationStep) || row.firstViolationStep < 0)) {
      throw new SafetyProofError('Safety rule first violation step is invalid', path);
    }
    if ((row.violationCount === 0 && (row.status !== 'pass' || row.firstViolationStep !== null)) ||
        (row.violationCount > 0 && (row.status !== row.severity || row.firstViolationStep === null ||
          row.firstViolationStep >= row.evaluationCount))) {
      throw new SafetyProofError('Safety rule result status does not match its violations', path);
    }
    for (const key of ['lastValue', 'minimumObserved', 'maximumObserved']) {
      if (row[key] !== null && !Number.isFinite(row[key])) {
        throw new SafetyProofError(`Safety rule ${key} is invalid`, path);
      }
    }
    if (row.minimumObserved !== null && row.maximumObserved !== null &&
        row.minimumObserved > row.maximumObserved) {
      throw new SafetyProofError('Safety rule observed range is invalid', path);
    }
    if (typeof row.traceHash !== 'string' || !row.traceHash.startsWith(HASH_PREFIX)) {
      throw new SafetyProofError('Safety rule trace hash is invalid', path);
    }
  }

  function safetyProofStatus(receipt, binding) {
    if (!receipt) return 'not-proven';
    try {
      validateSafetyProofReceipt(receipt);
    } catch (_error) {
      return 'fail';
    }
    const worldSpec = binding && binding.worldSpec || {};
    const replay = binding && binding.replayIdentity || {};
    const safety = binding && binding.safety || {};
    const policy = binding && binding.simulationReproducibility || {};
    const bindingMatches = receipt.worldSpecContentHash === String(worldSpec.contentHash || '') &&
      receipt.worldSpecRevision === Number(worldSpec.revision || 0) &&
      receipt.buildId === String(replay.buildId || '') &&
      receipt.rulesHash === String(safety.rulesHash || '') &&
      receipt.policyHash === String(policy.policyHash || '') &&
      receipt.stepCount === Number(policy.policy && policy.policy.stepCount || 0) &&
      receipt.stepSeconds === Number(policy.policy && policy.policy.stepSeconds || 0) &&
      receipt.ruleCount === Number(safety.ruleCount || 0) &&
      canonicalJson(receipt.ruleResults.map((row) => row.ruleId)) ===
        canonicalJson((safety.rules || []).map((row) => row.id));
    return receipt.status === 'pass' && bindingMatches ? 'pass' : 'fail';
  }

  function requireObject(value, path = '$.safetyProofReceipt') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new SafetyProofError('Expected an object', path);
    }
  }

  function requireExactKeys(value, allowed, path = '$.safetyProofReceipt') {
    const expected = new Set(allowed);
    for (const key of Object.keys(value || {})) {
      if (!expected.has(key)) throw new SafetyProofError(`Unknown field ${key}`, `${path}.${key}`);
    }
    for (const key of allowed) {
      if (!Object.hasOwn(value, key)) throw new SafetyProofError(`Missing field ${key}`, `${path}.${key}`);
    }
  }

  return Object.freeze({
    SAFETY_PROOF_RECEIPT_SCHEMA,
    SAFETY_CHECKPOINT_SCHEMA,
    SAFETY_RULE_RESULT_SCHEMA,
    SafetyProofError,
    captureSafetyCheckpoint,
    createSafetyProofReceipt,
    validateSafetyProofReceipt,
    safetyProofStatus,
  });
});
