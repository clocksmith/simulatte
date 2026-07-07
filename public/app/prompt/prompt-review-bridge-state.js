(function attachSimulatteReviewBridgestate(root) {
  const scope = root.__SimulatteReviewBridgeRefactorScope;
  if (!scope || scope.missingDependency) return;
  with (scope) {
    const STORAGE_ENABLED = 'simulatte.trainingMode.enabled.v1';

    const LEGACY_STORAGE_ENABLED = 'simulatte.reviewBridge.enabled.v1';

    const STORAGE_SERVER = 'simulatte.reviewBridge.server.v1';

    const STORAGE_PHASE = 'simulatte.trainingMode.phase.v1';

    const STORAGE_FALLBACK = 'simulatte.trainingMode.records.v1';

    const DB_NAME = 'simulatte-training-reviews-v1';

    const DB_STORE = 'reviews';

    const DEFAULT_SERVER = 'http://127.0.0.1:4766';

    const PANEL_REFRESH_INTERVAL = 750;

    const SERVER_REFRESH_INTERVAL = 4000;

    let panel = null;

    let noteInput = null;

    let statusNode = null;

    let summaryNode = null;

    let targetNode = null;

    let questionNode = null;

    let queueNode = null;

    let promptNode = null;

    let artifactJsonNode = null;

    let diagnosticsNode = null;

    let serverSummaryNode = null;

    let phaseButtons = [];

    let draftTimer = 0;

    let refreshTimer = 0;

    let serverRefreshTimer = 0;

    let eventsSource = null;

    let serverUrl = DEFAULT_SERVER;

    let enabled = false;

    let keyboardInstalled = false;

    let syncing = false;

    Object.assign(scope, {
      STORAGE_ENABLED,
      LEGACY_STORAGE_ENABLED,
      STORAGE_SERVER,
      STORAGE_PHASE,
      STORAGE_FALLBACK,
      DB_NAME,
      DB_STORE,
      DEFAULT_SERVER,
      PANEL_REFRESH_INTERVAL,
      SERVER_REFRESH_INTERVAL,
      panel,
      noteInput,
      statusNode,
      summaryNode,
      targetNode,
      questionNode,
      queueNode,
      promptNode,
      artifactJsonNode,
      diagnosticsNode,
      serverSummaryNode,
      phaseButtons,
      draftTimer,
      refreshTimer,
      serverRefreshTimer,
      eventsSource,
      serverUrl,
      enabled,
      keyboardInstalled,
      syncing,
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
