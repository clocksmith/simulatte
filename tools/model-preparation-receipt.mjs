const EXPECTED_POLICY = 'prepare-all-sources-then-load-embedding-before-reranker';

function validTiming(value) {
  return Number.isFinite(Number(value)) && Number(value) >= 0;
}

function expectedRoles(execution) {
  const roles = [];
  if (execution.embeddingModelId) roles.push('embedding');
  if (execution.rerankerEnabled === true || execution.rerankerRequired === true) roles.push('reranker');
  return roles;
}

function validateRows(rows, kind, execution, roles, failures) {
  if (!Array.isArray(rows) || rows.length !== roles.length) {
    failures.push(`Doppler ${kind} order must contain ${roles.join(' then ')}`);
    return;
  }
  rows.forEach((row, index) => {
    const role = roles[index];
    const expectedModelId = role === 'embedding'
      ? execution.embeddingModelId
      : execution.rerankerModelId;
    if (row.role !== role || Number(row.order) !== index + 1 || row.modelId !== expectedModelId) {
      failures.push(`Doppler ${kind} row ${index + 1} does not match the pinned ${role} model`);
    }
    if (row.status !== 'ready') failures.push(`Doppler ${kind} ${role} status is not ready`);
    if (row.overlap !== false) failures.push(`Doppler ${kind} ${role} overlapped another model operation`);
    if (!validTiming(row.queueWaitMs) || !validTiming(row.durationMs)) {
      failures.push(`Doppler ${kind} ${role} timing is missing`);
    }
    if (kind === 'source preparation' &&
        (!validTiming(row.verificationMs) || !validTiming(row.importMs))) {
      failures.push(`Doppler ${kind} ${role} verification or import timing is missing`);
    }
  });
}

export function modelPreparationFailures(execution = {}) {
  execution = execution || {};
  const failures = [];
  const preparation = execution.modelPreparation || {};
  if (execution.cachePrefetch !== true || execution.cacheMode !== 'opfs' || execution.cacheVerified !== true) {
    failures.push('Doppler model caches were not verified through OPFS');
  }
  const roles = expectedRoles(execution);
  if (!roles.length) {
    failures.push('Doppler preparation has no required model role');
  }
  if (!execution.embeddingCacheState ||
      (roles.includes('reranker') && !execution.rerankerCacheState)) {
    failures.push(`Doppler ${roles.join(' or ')} cache state is missing`);
  }
  if (preparation.schema !== 'simulatte.dopplerModelPreparationReceipt.v1' ||
      preparation.policy !== EXPECTED_POLICY) {
    failures.push('Doppler model preparation receipt or policy is missing');
    return failures;
  }
  if (JSON.stringify(preparation.sourceOrder) !== JSON.stringify(roles)) {
    failures.push(`Doppler source order must be ${roles.join(' then ')}`);
  }
  validateRows(preparation.sourcePreparations, 'source preparation', execution, roles, failures);
  validateRows(preparation.loadOrder, 'model load', execution, roles, failures);
  const device = preparation.devicePreparation || {};
  if (device.status !== 'ready' || !validTiming(device.durationMs)) {
    failures.push('Doppler device preparation timing is missing');
  }
  return failures;
}
