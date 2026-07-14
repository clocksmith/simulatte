const EXPECTED_ROLES = Object.freeze(['embedding', 'reranker']);
const EXPECTED_POLICY = 'prepare-all-sources-then-load-embedding-before-reranker';

function validTiming(value) {
  return Number.isFinite(Number(value)) && Number(value) >= 0;
}

function validateRows(rows, kind, execution, failures) {
  if (!Array.isArray(rows) || rows.length !== EXPECTED_ROLES.length) {
    failures.push(`Doppler ${kind} order must contain embedding then reranker`);
    return;
  }
  rows.forEach((row, index) => {
    const role = EXPECTED_ROLES[index];
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
  });
}

export function modelPreparationFailures(execution = {}) {
  const failures = [];
  const preparation = execution.modelPreparation || {};
  if (execution.cachePrefetch !== true || execution.cacheMode !== 'opfs' || execution.cacheVerified !== true) {
    failures.push('Doppler model caches were not verified through OPFS');
  }
  if (!execution.embeddingCacheState || !execution.rerankerCacheState) {
    failures.push('Doppler embedding or reranker cache state is missing');
  }
  if (preparation.schema !== 'simulatte.dopplerModelPreparationReceipt.v1' ||
      preparation.policy !== EXPECTED_POLICY) {
    failures.push('Doppler model preparation receipt or policy is missing');
    return failures;
  }
  if (JSON.stringify(preparation.sourceOrder) !== JSON.stringify(EXPECTED_ROLES)) {
    failures.push('Doppler source order must be embedding then reranker');
  }
  validateRows(preparation.sourcePreparations, 'source preparation', execution, failures);
  validateRows(preparation.loadOrder, 'model load', execution, failures);
  return failures;
}
