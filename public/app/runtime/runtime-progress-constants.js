(function attachSimulatteRuntimeProgressconstants(root) {
  const scope = root.__SimulatteRuntimeProgressRefactorScope;
  if (!scope || scope.missingDependency) return;
  with (scope) {
    const EVENT_SCHEMA = 'simulatte.runtimeProgressEvent.v1';

    const STATE_SCHEMA = 'simulatte.runtimeProgressState.v1';

    const HEALTH_SCHEMA = 'simulatte.intentRuntimeHealth.v1';

    const LOADER_RECEIPT_SCHEMA = 'simulatte.loaderPhaseReceipt.v1';

    const PROGRESS_LOG_SCHEMA = 'simulatte.runtimeProgressLog.v1';

    const MAX_EVENT_HISTORY = 120;

    const MAX_LOADER_RECEIPTS = 64;

    const MAX_PROGRESS_LOGS = 2048;

    const DEFAULT_STAGE = 'runtime.start';

    const HEARTBEAT_MS = 900;

    const STALE_EVENT_MS = 1400;

    Object.assign(scope, {
      EVENT_SCHEMA,
      STATE_SCHEMA,
      HEALTH_SCHEMA,
      LOADER_RECEIPT_SCHEMA,
      PROGRESS_LOG_SCHEMA,
      MAX_EVENT_HISTORY,
      MAX_LOADER_RECEIPTS,
      MAX_PROGRESS_LOGS,
      DEFAULT_STAGE,
      HEARTBEAT_MS,
      STALE_EVENT_MS,
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
