(function attachRecursiveWorldProof(root, factory) {
  const sceneApi = typeof module === 'object' && module.exports
    ? require('./recursive-world-scene.js')
    : root.SimulatteRecursiveWorldScene;
  const api = factory(sceneApi);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteRecursiveWorldProof = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createRecursiveWorldProofApi(sceneApi) {
  const PROOF_SCHEMA = 'simulatte.recursive-world-proof/v1';
  const CLASSES = Object.freeze(['composition', 'simulation', 'residency', 'worker-parity', 'visual', 'performance', 'replay']);
  const PROOF_STATUSES = Object.freeze(['pass', 'fail', 'not-proven']);
  const PROOF_KEYS = Object.freeze([
    'schema', 'worldSpecContentHash', 'sceneContentHash', 'executionPlanHash', 'coordinatorId',
    'buildId', 'runtimeId', 'deviceClass', 'qualificationLaneId', 'browserMode',
    'baselineObservationContentHash', 'terminalObservationContentHash', 'terminalLogicalTime',
    'ledgerEntryHashes', 'frameReceiptHashes', 'causalSettlements', 'proofClasses', 'verdict', 'contentHash',
  ]);
  const PROOF_CLASS_KEYS = Object.freeze(['status', 'evidence', 'failures']);
  const PERFORMANCE_RECEIPT_KEYS = Object.freeze([
    'schema', 'status', 'worldSpecContentHash', 'sceneContentHash', 'buildId', 'runtimeId', 'deviceClass',
    'qualificationLaneId', 'browserMode', 'targetFramesPerSecond', 'frameBudgetMilliseconds', 'sampleCount',
    'compositorSampleCount', 'cpuSampleCount', 'gpuCompletionSampleCount', 'medianFrameMilliseconds',
    'p95FrameMilliseconds', 'compositorMedianFrameMilliseconds', 'compositorP95FrameMilliseconds',
    'cpuMedianFrameMilliseconds', 'cpuP95FrameMilliseconds', 'gpuCompletionMedianMilliseconds',
    'gpuCompletionP95Milliseconds', 'gpuCompletionMethod', 'refreshEstimateHz', 'population', 'claimBoundary',
    'contentHash',
  ]);

  class RecursiveWorldProofError extends Error {
    constructor(code, message) {
      super(`${code}: ${message}`);
      this.name = 'SimulatteRecursiveWorldProofError';
      this.code = code;
    }
  }

  function createProof(options = {}) {
    const {
      worldSpec,
      scene,
      coordinatorSnapshot,
      ledger,
      baselineObservation,
      terminalObservation,
      replayResult,
      frameReceipts = [],
      residencyReceipts = [],
      workerParityReceipt = null,
      performanceReceipt = null,
      buildId,
      runtimeId,
      deviceClass,
      qualificationLaneId,
      browserMode,
    } = options;
    requireRecord(worldSpec, 'worldSpec');
    requireRecord(scene, 'scene');
    requireRecord(coordinatorSnapshot, 'coordinatorSnapshot');
    requireArray(ledger, 'ledger', 1);
    requireRecord(baselineObservation, 'baselineObservation');
    requireRecord(terminalObservation, 'terminalObservation');
    requireRecord(replayResult, 'replayResult');
    requireString(buildId, 'buildId');
    requireString(runtimeId, 'runtimeId');
    requireString(deviceClass, 'deviceClass');
    requireString(qualificationLaneId, 'qualificationLaneId');
    requireString(browserMode, 'browserMode');
    if (worldSpec.contentHash !== scene.worldSpecContentHash || worldSpec.contentHash !== coordinatorSnapshot.worldSpecContentHash) {
      fail('recursive_proof_world_identity_mismatch', 'WorldSpec, scene, and coordinator identities must match');
    }
    if (scene.contentHash !== sceneApi.contentHash({ worldSpecContentHash: worldSpec.contentHash, renderProgram: worldSpec.renderProgram })) {
      fail('recursive_proof_scene_hash_invalid', 'Compiled scene hash does not match the authored render program');
    }
    validateObservation(baselineObservation, coordinatorSnapshot.id);
    validateObservation(terminalObservation, coordinatorSnapshot.id);
    if (terminalObservation.logicalTime !== coordinatorSnapshot.logicalTime) {
      fail('recursive_proof_terminal_time_mismatch', 'Terminal observation and coordinator must share logical time');
    }
    ledger.forEach((entry) => validateHash(entry, 'exchange ledger entry'));
    frameReceipts.forEach((receipt) => validateFrameReceipt(receipt, {
      worldSpecContentHash: worldSpec.contentHash,
      sceneContentHash: scene.contentHash,
      observationContentHash: terminalObservation.contentHash,
      buildId,
      runtimeId,
      deviceClass,
    }));
    const causalSettlements = settleCausalObligations(
      worldSpec.physicalSpec?.causalObligations || [],
      baselineObservation,
      terminalObservation
    );
    const classes = {
      composition: proofClass('pass', [worldSpec.contentHash, scene.contentHash], []),
      simulation: causalSettlements.every((row) => row.status === 'pass') && ledger.every((row) => row.status === 'accepted')
        ? proofClass('pass', ledger.map((row) => row.contentHash), [])
        : proofClass('fail', ledger.map((row) => row.contentHash), causalSettlements.filter((row) => row.status !== 'pass').map((row) => row.id)),
      residency: residencyStatus(residencyReceipts, { worldSpec, buildId, runtimeId, deviceClass }),
      'worker-parity': workerParityStatus(workerParityReceipt, { worldSpec, buildId, runtimeId, deviceClass }),
      visual: visualStatus(frameReceipts),
      performance: performanceStatus(performanceReceipt, {
        worldSpec, scene, buildId, runtimeId, deviceClass, qualificationLaneId, browserMode,
      }),
      replay: replayResult.status === 'match'
        ? proofClass('pass', ledger.map((row) => row.contentHash), [])
        : proofClass('fail', [], ['Deterministic replay diverged']),
    };
    const required = CLASSES;
    const verdict = required.some((name) => classes[name].status === 'fail')
      ? 'fail'
      : required.every((name) => classes[name].status === 'pass')
        ? 'pass'
        : 'not-proven';
    const proof = {
      schema: PROOF_SCHEMA,
      worldSpecContentHash: worldSpec.contentHash,
      sceneContentHash: scene.contentHash,
      executionPlanHash: coordinatorSnapshot.executionPlanHash,
      coordinatorId: coordinatorSnapshot.id,
      buildId,
      runtimeId,
      deviceClass,
      qualificationLaneId,
      browserMode,
      baselineObservationContentHash: baselineObservation.contentHash,
      terminalObservationContentHash: terminalObservation.contentHash,
      terminalLogicalTime: terminalObservation.logicalTime,
      ledgerEntryHashes: ledger.map((row) => row.contentHash),
      frameReceiptHashes: frameReceipts.map((row) => row.contentHash),
      causalSettlements,
      proofClasses: classes,
      verdict,
    };
    proof.contentHash = sceneApi.contentHash(proof);
    return deepFreeze(proof);
  }

  function validateProof(proof) {
    requireRecord(proof, 'proof');
    requireExactKeys(proof, PROOF_KEYS, 'proof');
    if (proof.schema !== PROOF_SCHEMA) fail('recursive_proof_schema_invalid', `Expected ${PROOF_SCHEMA}`);
    [
      'worldSpecContentHash', 'sceneContentHash', 'executionPlanHash', 'coordinatorId', 'buildId', 'runtimeId',
      'deviceClass', 'qualificationLaneId', 'browserMode', 'baselineObservationContentHash',
      'terminalObservationContentHash', 'contentHash',
    ].forEach((key) => requireString(proof[key], `proof.${key}`));
    requireFiniteNumber(proof.terminalLogicalTime, 'proof.terminalLogicalTime');
    requireArray(proof.ledgerEntryHashes, 'proof.ledgerEntryHashes', 1);
    requireStringArray(proof.ledgerEntryHashes, 'proof.ledgerEntryHashes');
    requireArray(proof.frameReceiptHashes, 'proof.frameReceiptHashes');
    requireStringArray(proof.frameReceiptHashes, 'proof.frameReceiptHashes');
    requireArray(proof.causalSettlements, 'proof.causalSettlements', 1);
    proof.causalSettlements.forEach((settlement, index) => validateCausalSettlement(settlement, index));
    requireRecord(proof.proofClasses, 'proof.proofClasses');
    requireExactKeys(proof.proofClasses, CLASSES, 'proof.proofClasses');
    CLASSES.forEach((name) => {
      validateProofClass(proof.proofClasses[name], name);
    });
    if (proof.proofClasses.simulation.status === 'pass' && proof.causalSettlements.some((row) => row.status !== 'pass')) {
      fail('recursive_proof_simulation_verdict_inconsistent', 'Simulation cannot pass when a causal settlement failed');
    }
    if (!PROOF_STATUSES.includes(proof.verdict)) fail('recursive_proof_verdict_invalid', `Unsupported verdict ${proof.verdict}`);
    const expectedVerdict = deriveVerdict(proof.proofClasses);
    if (proof.verdict !== expectedVerdict) {
      fail('recursive_proof_verdict_inconsistent', `Verdict ${proof.verdict} does not match class verdict ${expectedVerdict}`);
    }
    validateHash(proof, 'recursive world proof');
    return proof;
  }

  function validateProofClass(value, name) {
    requireRecord(value, `proof.proofClasses.${name}`);
    requireExactKeys(value, PROOF_CLASS_KEYS, `proof.proofClasses.${name}`);
    if (!PROOF_STATUSES.includes(value.status)) {
      fail('recursive_proof_class_status_invalid', `Proof class ${name} has unsupported status ${value.status}`);
    }
    requireArray(value.evidence, `proof.proofClasses.${name}.evidence`);
    requireStringArray(value.evidence, `proof.proofClasses.${name}.evidence`);
    requireArray(value.failures, `proof.proofClasses.${name}.failures`);
    requireStringArray(value.failures, `proof.proofClasses.${name}.failures`);
    if (value.status === 'pass' && value.failures.length) {
      fail('recursive_proof_class_failures_inconsistent', `Passing proof class ${name} cannot retain failures`);
    }
    if (value.status === 'pass' && !value.evidence.length) {
      fail('recursive_proof_class_evidence_missing', `Passing proof class ${name} must bind evidence`);
    }
    if (value.status !== 'pass' && !value.failures.length) {
      fail('recursive_proof_class_failures_missing', `Non-passing proof class ${name} must explain its failure`);
    }
  }

  function validateCausalSettlement(value, index) {
    requireRecord(value, `proof.causalSettlements[${index}]`);
    const measuredKeys = ['id', 'sourcePortId', 'comparison', 'baselineValue', 'terminalValue', 'unit', 'status'];
    const missingKeys = ['id', 'sourcePortId', 'status', 'reason'];
    const keys = Object.keys(value).sort();
    const isMeasured = sameKeys(keys, measuredKeys);
    const isMissing = sameKeys(keys, missingKeys);
    if (!isMeasured && !isMissing) fail('recursive_proof_causal_keys_invalid', `Causal settlement ${index} has unexpected keys`);
    requireString(value.id, `proof.causalSettlements[${index}].id`);
    requireString(value.sourcePortId, `proof.causalSettlements[${index}].sourcePortId`);
    if (!['pass', 'fail'].includes(value.status)) fail('recursive_proof_causal_status_invalid', `Causal settlement ${index} status is invalid`);
    if (isMissing) {
      requireString(value.reason, `proof.causalSettlements[${index}].reason`);
      if (value.status !== 'fail') fail('recursive_proof_causal_reason_inconsistent', `Missing-output settlement ${index} must fail`);
      return;
    }
    if (!['decreases', 'increases', 'equals'].includes(value.comparison)) {
      fail('recursive_proof_causal_comparison_invalid', `Causal settlement ${index} comparison is invalid`);
    }
    requireFiniteNumber(value.baselineValue, `proof.causalSettlements[${index}].baselineValue`);
    requireFiniteNumber(value.terminalValue, `proof.causalSettlements[${index}].terminalValue`);
    if (value.unit !== null && typeof value.unit !== 'string') {
      fail('recursive_proof_causal_unit_invalid', `Causal settlement ${index} unit must be a string or null`);
    }
    const expectedStatus = value.comparison === 'decreases'
      ? value.terminalValue < value.baselineValue
      : value.comparison === 'increases'
        ? value.terminalValue > value.baselineValue
        : value.terminalValue === value.baselineValue;
    if (value.status !== (expectedStatus ? 'pass' : 'fail')) {
      fail('recursive_proof_causal_verdict_inconsistent', `Causal settlement ${index} status contradicts its measured values`);
    }
  }

  function settleCausalObligations(obligations, baseline, terminal) {
    requireArray(obligations, 'causalObligations', 1);
    return obligations.map((obligation) => {
      const before = baseline.records[obligation.sourcePortId];
      const after = terminal.records[obligation.sourcePortId];
      if (!before || !after) return deepFreeze({ id: obligation.id, sourcePortId: obligation.sourcePortId, status: 'fail', reason: 'published output missing' });
      const passes = obligation.comparison === 'decreases'
        ? after.value < before.value
        : obligation.comparison === 'increases'
          ? after.value > before.value
          : obligation.comparison === 'equals'
            ? after.value === before.value
            : false;
      return deepFreeze({
        id: obligation.id,
        sourcePortId: obligation.sourcePortId,
        comparison: obligation.comparison,
        baselineValue: before.value,
        terminalValue: after.value,
        unit: worldUnit(before, after),
        status: passes ? 'pass' : 'fail',
      });
    });
  }

  function validateObservation(value, coordinatorId) {
    if (value.schema !== 'simulatte.multirate-port-observation/v1') fail('recursive_proof_observation_schema_invalid', 'Observation schema is invalid');
    if (value.coordinatorId !== coordinatorId) fail('recursive_proof_observation_coordinator_mismatch', 'Observation belongs to another coordinator');
    validateHash(value, 'port observation');
  }

  function validateFrameReceipt(receipt, identity) {
    requireRecord(receipt, 'frameReceipt');
    validateHash(receipt, 'frame receipt');
    Object.entries(identity).forEach(([key, expected]) => {
      if (receipt[key] !== expected) fail('recursive_proof_frame_identity_mismatch', `Frame receipt ${key} does not match proof identity`);
    });
  }

  function workerParityStatus(receipt, identity) {
    if (!receipt) return proofClass('not-proven', [], ['No bound serial-to-worker parity receipt']);
    validateHash(receipt, 'worker parity receipt');
    if (receipt.worldSpecContentHash !== identity.worldSpec.contentHash ||
        receipt.buildId !== identity.buildId || receipt.runtimeId !== identity.runtimeId ||
        receipt.deviceClass !== identity.deviceClass) {
      fail('recursive_proof_worker_identity_mismatch', 'Worker parity receipt identity does not match the proof');
    }
    return receipt.status === 'pass'
      ? proofClass('pass', [receipt.contentHash], [])
      : proofClass('fail', [receipt.contentHash], ['Worker execution diverged']);
  }

  function residencyStatus(receipts, identity) {
    if (!receipts.length) return proofClass('not-proven', [], ['No bound simulation and spatial residency evidence']);
    receipts.forEach((receipt) => {
      validateHash(receipt, 'residency receipt');
      if (receipt.worldSpecContentHash !== identity.worldSpec.contentHash ||
          receipt.buildId !== identity.buildId || receipt.runtimeId !== identity.runtimeId ||
          receipt.deviceClass !== identity.deviceClass) {
        fail('recursive_proof_residency_identity_mismatch', 'Residency receipt identity does not match the proof');
      }
    });
    return receipts.every((receipt) => receipt.status === 'pass')
      ? proofClass('pass', receipts.map((row) => row.contentHash), [])
      : proofClass('fail', receipts.map((row) => row.contentHash), ['Residency execution changed causal results or failed restoration']);
  }

  function visualStatus(receipts) {
    const qualified = receipts.filter((receipt) => receipt.source === 'browser-webgpu' && receipt.pixelEvidenceHash);
    return qualified.length === receipts.length && receipts.length
      ? proofClass('pass', qualified.map((row) => row.contentHash), [])
      : proofClass('not-proven', receipts.map((row) => row.contentHash), ['No matching browser pixel evidence']);
  }

  function performanceStatus(receipt, identity) {
    if (!receipt) return proofClass('not-proven', [], ['No named-hardware frame-time receipt']);
    requireRecord(receipt, 'performance receipt');
    requireExactKeys(receipt, PERFORMANCE_RECEIPT_KEYS, 'performance receipt');
    validateHash(receipt, 'performance receipt');
    if (receipt.schema !== 'simulatte.recursive-render-performance-receipt/v2') {
      fail('recursive_proof_performance_schema_invalid', 'Completed-frame performance evidence must use v2');
    }
    if (!['pass', 'fail', 'not-proven', 'unsupported'].includes(receipt.status)) {
      fail('recursive_proof_performance_status_invalid', `Unsupported performance status ${receipt.status}`);
    }
    const matches = receipt.worldSpecContentHash === identity.worldSpec.contentHash &&
      receipt.sceneContentHash === identity.scene.contentHash &&
      receipt.buildId === identity.buildId && receipt.runtimeId === identity.runtimeId &&
      receipt.deviceClass === identity.deviceClass &&
      receipt.qualificationLaneId === identity.qualificationLaneId &&
      receipt.browserMode === identity.browserMode;
    const measuredMedians = [receipt.compositorMedianFrameMilliseconds, receipt.cpuMedianFrameMilliseconds, receipt.gpuCompletionMedianMilliseconds];
    const measuredP95s = [receipt.compositorP95FrameMilliseconds, receipt.cpuP95FrameMilliseconds, receipt.gpuCompletionP95Milliseconds];
    const counts = [receipt.compositorSampleCount, receipt.cpuSampleCount, receipt.gpuCompletionSampleCount];
    const aggregatesAreFinite = [
      receipt.targetFramesPerSecond, receipt.frameBudgetMilliseconds, receipt.sampleCount, ...counts,
      receipt.medianFrameMilliseconds, receipt.p95FrameMilliseconds, ...measuredMedians, ...measuredP95s,
      receipt.refreshEstimateHz,
    ].every(Number.isFinite);
    const distributionsAreCoherent = aggregatesAreFinite &&
      measuredMedians.every((value, index) => value >= 0 && value <= measuredP95s[index]) &&
      measuredP95s.every((value) => value >= 0) &&
      receipt.medianFrameMilliseconds === Math.max(...measuredMedians) &&
      receipt.p95FrameMilliseconds === Math.max(...measuredP95s) &&
      counts.every((value) => Number.isInteger(value) && value >= receipt.sampleCount) &&
      receipt.sampleCount === Math.min(...counts);
    if (!distributionsAreCoherent) {
      return proofClass('fail', [receipt.contentHash], ['Performance evidence contains non-finite or incoherent aggregates']);
    }
    if (matches && ['unsupported', 'not-proven'].includes(receipt.status)) {
      return proofClass('not-proven', [receipt.contentHash], ['Named lane cannot establish the declared frame budget']);
    }
    const passes = matches && receipt.status === 'pass' && receipt.sampleCount >= 120 &&
      typeof receipt.qualificationLaneId === 'string' && receipt.qualificationLaneId.length > 0 &&
      typeof receipt.browserMode === 'string' && receipt.browserMode.length > 0 &&
      receipt.gpuCompletionMethod === 'GPUQueue.onSubmittedWorkDone' &&
      distributionsAreCoherent && receipt.frameBudgetMilliseconds > 0 && receipt.targetFramesPerSecond > 0 &&
      measuredP95s.every((value) => Number.isFinite(value) && value <= receipt.frameBudgetMilliseconds) &&
      receipt.medianFrameMilliseconds <= receipt.p95FrameMilliseconds;
    return passes
      ? proofClass('pass', [receipt.contentHash], [])
      : proofClass('fail', [receipt.contentHash], ['Performance evidence did not meet its bound identity and budget']);
  }

  function proofClass(status, evidence, failures) {
    return deepFreeze({ status, evidence: [...evidence].filter(Boolean), failures: [...failures] });
  }

  function deriveVerdict(classes) {
    return CLASSES.some((name) => classes[name].status === 'fail')
      ? 'fail'
      : CLASSES.every((name) => classes[name].status === 'pass')
        ? 'pass'
        : 'not-proven';
  }

  function validateHash(value, label) {
    if (!value.contentHash || sceneApi.contentHash(value) !== value.contentHash) fail('recursive_proof_hash_invalid', `${label} content hash is invalid`);
  }

  function worldUnit() { return null; }
  function requireRecord(value, label) { if (!value || typeof value !== 'object' || Array.isArray(value)) fail('recursive_proof_record_invalid', `${label} must be an object`); }
  function requireArray(value, label, minimum = 0) { if (!Array.isArray(value) || value.length < minimum) fail('recursive_proof_array_invalid', `${label} must contain at least ${minimum} row(s)`); }
  function requireString(value, label) { if (typeof value !== 'string' || !value) fail('recursive_proof_string_invalid', `${label} must be a non-empty string`); }
  function requireFiniteNumber(value, label) { if (!Number.isFinite(value)) fail('recursive_proof_number_invalid', `${label} must be finite`); }
  function requireStringArray(value, label) { if (value.some((row) => typeof row !== 'string' || !row)) fail('recursive_proof_string_array_invalid', `${label} must contain only non-empty strings`); }
  function sameKeys(actual, expected) { return actual.length === expected.length && [...expected].sort().every((key, index) => key === actual[index]); }
  function requireExactKeys(value, expected, label) { if (!sameKeys(Object.keys(value).sort(), expected)) fail('recursive_proof_keys_invalid', `${label} has missing or unexpected keys`); }
  function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.values(value).forEach(deepFreeze); return Object.freeze(value); }
  function fail(code, message) { throw new RecursiveWorldProofError(code, message); }

  return Object.freeze({ CLASSES, PROOF_SCHEMA, RecursiveWorldProofError, createProof, settleCausalObligations, validateProof });
});
