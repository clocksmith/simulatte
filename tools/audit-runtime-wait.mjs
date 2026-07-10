export async function waitForCondition(label, check, timeoutMs, options = {}) {
  const startedAt = Date.now();
  const extendOnProgress = options.extendOnProgress === true;
  const stallTimeoutMs = Number(options.stallTimeoutMs || 0);
  const pollIntervalMs = Number(options.pollIntervalMs || 120);
  const progressSignature = options.progressSignature || conditionProgressSignature;
  if (extendOnProgress && (!Number.isFinite(stallTimeoutMs) || stallTimeoutMs <= 0)) {
    throw new Error(`Waiting for ${label} requires a positive stallTimeoutMs when progress extension is enabled`);
  }
  let lastProgressAt = startedAt;
  let lastSignature = '';
  let last = null;
  while (true) {
    last = await check().catch((error) => ({ error: error.message }));
    if (last && last.ok) return last;
    const signature = progressSignature(last);
    if (signature && signature !== lastSignature) {
      lastSignature = signature;
      lastProgressAt = Date.now();
    }
    const now = Date.now();
    const baseTimeoutReached = now - startedAt >= timeoutMs;
    const progressStalled = now - lastProgressAt >= stallTimeoutMs;
    if ((!extendOnProgress && baseTimeoutReached) ||
      (extendOnProgress && baseTimeoutReached && progressStalled)) {
      break;
    }
    await delay(pollIntervalMs);
  }
  throw new Error(`Timed out waiting for ${label}: ${JSON.stringify(last)}`);
}

export function conditionProgressSignature(value = {}) {
  const health = value && value.runtimeHealth || {};
  const timing = health.timing || {};
  const model = health.model || {};
  const resource = health.resource || {};
  return JSON.stringify({
    state: value && value.state || health.state || '',
    stage: value && value.stageId || health.stage || '',
    pipelineStep: value && value.pipelineStep || health.pipelineStep || '',
    progress: value && value.progress || health.progress || '',
    blocking: value && value.blocking || health.blocking || '',
    disabled: value && value.disabled || '',
    message: value && value.message || health.message || '',
    resourceKind: value && value.resourceKind || resource.kind || '',
    resourceFile: value && value.resourceFile || resource.file || '',
    completedBytes: value && value.completedBytes || resource.completedBytes || 0,
    totalBytes: value && value.totalBytes || resource.totalBytes || 0,
    traceId: value && value.traceId || timing.traceId || '',
    rankId: value && value.rankId || timing.rankId || 0,
    providerReady: value && value.providerReady || timing.providerReady || false,
    modelId: value && value.modelId || model.id || '',
  });
}

export function normalizeAuditPrompt(value = '') {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function auditPromptMatches(requested = '', compiled = '') {
  const expected = normalizeAuditPrompt(requested);
  return Boolean(expected) && expected === normalizeAuditPrompt(compiled);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
