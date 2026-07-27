(function attachPluginViewRuntime(root, factory) {
  const viewDirectorApi = typeof module === 'object' && module.exports
    ? require('../platform/view/view-director.js')
    : root.SimulatteViewDirector;
  const api = factory(viewDirectorApi);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulattePluginViewRuntime = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createPluginViewRuntime(viewDirectorApi) {
  function createCoordinator({ renderer, focusSelect, onModeSelected }) {
    if (!renderer || typeof renderer.cameraTargets !== 'function') {
      throw viewRuntimeError('plugin_view_renderer_invalid', 'Plugin view runtime expected a camera-capable renderer');
    }
    let director = viewDirectorApi.createViewDirector();
    let intentIds = new Set();
    let appliedDecision = null;

    function sync(contributions, provenanceReceipts = []) {
      const previous = director.snapshot();
      const manualDecision = previous.manualOverride ? previous.decision : null;
      director = viewDirectorApi.createViewDirector({ provenanceReceipts });
      intentIds = new Set();
      contributions.forEach((contribution) => {
        contribution.presentation.viewIntents.forEach((intent) => {
          const hostedIntent = Object.freeze({
            ...intent,
            id: `${contribution.pluginId}:${intent.id}`,
          });
          director.submit(hostedIntent, { source: contribution.pluginId });
          intentIds.add(hostedIntent.id);
        });
      });
      if (manualDecision) {
        director.setManualOverride({
          mode: manualDecision.mode,
          targetIds: manualDecision.targetIds,
        });
      }
      applyDecision();
      return director.receipt();
    }

    function setManualOverride({ mode = 'free', targetIds = [] } = {}) {
      appliedDecision = null;
      director.setManualOverride({ mode: semanticManualMode(mode), targetIds });
      return director.snapshot();
    }

    function releaseManualOverride() {
      director.releaseManualOverride();
      applyDecision();
      return director.snapshot();
    }

    function applyDecision() {
      const state = director.snapshot();
      if (state.manualOverride || state.decision.source === 'core-fallback') return state;
      const decision = state.decision;
      const key = JSON.stringify([decision.source, decision.intentId, decision.mode, decision.targetIds]);
      const sourceIntentId = decision.intentId?.slice(`${decision.source}:`.length) || null;
      const intentTargetId = sourceIntentId ? `plugin:${decision.source}:${sourceIntentId}` : null;
      const subjectTargetIds = decision.targetIds.map((id) => `plugin:${decision.source}:${id}`);
      const candidates = ['overview', 'compare'].includes(decision.mode)
        ? [intentTargetId, ...subjectTargetIds].filter(Boolean)
        : [...subjectTargetIds, intentTargetId].filter(Boolean);
      const targetId = candidates.find((id) => renderer.cameraTargets().some((row) => row.id === id));
      const cameraMode = decision.mode === 'pov'
        ? 'pov'
        : decision.mode === 'follow'
          ? 'follow'
        : decision.mode === 'overview'
          ? 'overview'
        : decision.mode === 'compare'
          ? 'compare'
          : null;
      const cameraState = renderer.cameraState?.() || null;
      if (
        key === appliedDecision
        && (!targetId || cameraState?.focusId === targetId)
        && (!cameraMode || cameraState?.mode === cameraMode)
      ) return state;
      if (targetId && cameraState?.focusId !== targetId) {
        if (focusSelect) focusSelect.value = targetId;
        renderer.focusCameraTarget(targetId);
      }
      if (cameraMode && cameraState?.mode !== cameraMode) {
        renderer.setCameraMode(cameraMode);
        onModeSelected?.(cameraMode);
      }
      appliedDecision = key;
      return state;
    }

    return Object.freeze({
      applyDecision,
      hasManualOverride: () => director.snapshot().manualOverride,
      receipt: () => director.receipt(),
      releaseManualOverride,
      setManualOverride,
      snapshot: () => director.snapshot(),
      sync,
    });
  }

  function viewRuntimeError(code, message) {
    const error = new Error(`${code}: ${message}`);
    error.name = 'SimulattePluginViewRuntimeError';
    error.code = code;
    return error;
  }

  function semanticManualMode(mode) {
    if (mode === 'bird' || mode === 'overview') return 'overview';
    if (mode === 'top') return 'free';
    return mode;
  }

  return Object.freeze({ createCoordinator });
});
