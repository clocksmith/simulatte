(function attachSimulatteRuntimeProgressconstants(root) {
  const scope = root.__SimulatteRuntimeProgressRefactorScope;
  if (!scope || scope.missingDependency) return;
  with (scope) {
    const EVENT_SCHEMA = 'simulatte.runtimeProgressEvent.v2';

    const STATE_SCHEMA = 'simulatte.runtimeProgressState.v2';

    const HEALTH_SCHEMA = 'simulatte.intentRuntimeHealth.v2';

    const LOADER_RECEIPT_SCHEMA = 'simulatte.loaderPhaseReceipt.v2';

    const PROGRESS_LOG_SCHEMA = 'simulatte.runtimeProgressLog.v2';

    const TIMING_PROFILE_SCHEMA = 'simulatte.runtimeTaskTimingProfile.v1';

    const TIMING_PROFILE_STORAGE_KEY = 'simulatte.runtime-task-timing-profile.v1';

    const TIME_ESTIMATE_PROGRESS_CAP = 95;

    const RUN_DURATION_FALLBACK_MS = 24000;

    const TASK_DURATION_FALLBACK_MS = 1200;

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
      TIMING_PROFILE_SCHEMA,
      TIMING_PROFILE_STORAGE_KEY,
      TIME_ESTIMATE_PROGRESS_CAP,
      RUN_DURATION_FALLBACK_MS,
      TASK_DURATION_FALLBACK_MS,
      MAX_EVENT_HISTORY,
      MAX_LOADER_RECEIPTS,
      MAX_PROGRESS_LOGS,
      DEFAULT_STAGE,
      HEARTBEAT_MS,
      STALE_EVENT_MS,
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
